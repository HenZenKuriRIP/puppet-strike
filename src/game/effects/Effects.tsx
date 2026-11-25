import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../core/world';
import { POOLS, BULLET_VISUALS } from '../../config/game';
import { candyGeometry } from './candyGeo';
import { CONFETTI, FUNNY_WORDS } from '../systems/fx';
import { muzzlePos } from '../systems/simulation';
import { currentConfig } from '../weapons/arsenal';
import { useUI } from '../../app/store';
const tmpE = new THREE.Euler();

const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;
const NV = BULLET_VISUALS.length;
const CAP = POOLS.projectiles + POOLS.shots + POOLS.tracers + POOLS.lobs + POOLS.sparks;
/** per-shape cosmetics: spin rate (rad/s about the travel axis), sprinkle rate (/s) and whether it tumbles end over end */
const STYLE = [
  { spin: 7, sp: 16 },  // gumdrop
  { spin: 14, sp: 28 }, // wrapped
  { spin: 18, sp: 36 }, // star
  { spin: 11, sp: 30 }, // heart
  { spin: 4, sp: 6 },   // bean
  { spin: 15, sp: 22 }, // swirl
  { spin: 5, sp: 34 },  // cane
  { spin: 12, sp: 14 }, // cookie
  { spin: 20, sp: 12 }, // ribbon
  { spin: 8, sp: 14 },  // choc
];
const SPR = 220;
const qSpin = new THREE.Quaternion(), qB = new THREE.Quaternion();

function Blasts() {
  const refs = useRef<(THREE.Mesh | null)[]>([]), rings = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: POOLS.blasts }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })), []);
  const rmats = useMemo(() => Array.from({ length: POOLS.blasts }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })), []);
  useFrame(() => {
    world.blastFx.items.forEach((b, i) => {
      const m = refs.current[i]; if (!m) return;
      const r = rings.current[i];
      m.visible = b.active; if (r) r.visible = b.active && b.ring; if (!b.active) return;
      const k = 1 - b.life / b.maxLife;
      if (r && b.ring) { r.position.set(b.pos.x, Math.max(0.08, b.pos.y - b.radius * 0.3), b.pos.z); r.scale.setScalar(b.radius * (0.4 + 1.1 * k)); rmats[i].color.set(b.color); rmats[i].opacity = 0.8 * (1 - k); }
      m.position.set(b.pos.x, b.pos.y, b.pos.z); m.scale.setScalar(b.radius * (0.3 + 0.7 * Math.sqrt(k)));
      mats[i].color.set(b.color); mats[i].opacity = 0.68 * (1 - k);
    });
  });
  return <>
    {mats.map((mt, i) => <mesh key={i} ref={(r) => (refs.current[i] = r)} material={mt} visible={false}><sphereGeometry args={[1, 20, 14]} /></mesh>)}
    {rmats.map((mt, i) => <mesh key={'r' + i} ref={(r) => (rings.current[i] = r)} material={mt} visible={false} rotation-x={-Math.PI / 2}><ringGeometry args={[0.82, 1, 40]} /></mesh>)}
  </>;
}

export function Effects() {
  const confetti = useRef<THREE.InstancedMesh>(null!);
  const sparks = useRef<THREE.InstancedMesh>(null!);
  const tracers = useRef<THREE.InstancedMesh>(null!), bubbles = useRef<THREE.InstancedMesh>(null!);
  const candy = useRef<(THREE.InstancedMesh | null)[]>([]), sprMesh = useRef<THREE.InstancedMesh>(null!);
  const spr = useMemo(() => ({ x: new Float32Array(SPR), y: new Float32Array(SPR), z: new Float32Array(SPR), vx: new Float32Array(SPR), vy: new Float32Array(SPR), vz: new Float32Array(SPR), life: new Float32Array(SPR), cols: Array.from({ length: SPR }, () => new THREE.Color()), head: 0 }), []);
  const candyGeos = useMemo(() => BULLET_VISUALS.map((id) => candyGeometry(id)), []);
  const candyMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, emissive: '#666666', emissiveIntensity: 0.85 }), []);
  const cnt = useMemo(() => new Int32Array(NV), []);
  const flashes = useRef<(THREE.Object3D | null)[]>([]), light = useRef<THREE.PointLight>(null!);
  const { camera, size } = useThree();
  const dmgEls = useRef<(HTMLElement | null)[]>([]);
  const tagEl = useRef<HTMLElement | null>(null);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.06, 0), []);

  useFrame((state, dt) => {
    cnt.fill(0);
    const T0 = state.clock.elapsedTime; dt = Math.min(dt, 0.05);
    let spawnBudget = 10;
    // push one candy instance (vis = bullet visual index). q = orientation of the travel axis (null = tumble), sprinkle = trail sprinkles
    const pushCandy = (vis: number, x: number, y: number, z: number, q: THREE.Quaternion | null, scale: number, color: string | THREE.Color, i: number, sprinkle: boolean) => {
      if (vis < 0 || vis >= NV) vis = 0;
      const n = cnt[vis]; if (n >= CAP) return; const m = candy.current[vis]; if (!m) return;
      const st = STYLE[vis];
      if (q) qSpin.copy(q).multiply(qB.setFromAxisAngle(UP, T0 * st.spin + i * 1.7)); else qSpin.setFromEuler(tmpE.set(T0 * st.spin * 0.5 + i, i * 1.3, T0 * 0.8 * st.spin + i * 0.5));
      tmpM.compose(tmpP.set(x, y, z), qSpin, tmpS.set(scale, scale, scale)); m.setMatrixAt(n, tmpM); m.setColorAt(n, typeof color === 'string' ? tmpC.set(color) : color); cnt[vis] = n + 1;
      if (sprinkle && st.sp > 0 && spawnBudget > 0 && Math.random() < st.sp * dt) {
        spawnBudget--; const h = spr.head; spr.head = (h + 1) % SPR;
        spr.x[h] = x + (Math.random() - 0.5) * 0.1; spr.y[h] = y + (Math.random() - 0.5) * 0.1; spr.z[h] = z + (Math.random() - 0.5) * 0.1;
        spr.vx[h] = (Math.random() - 0.5) * 1.6; spr.vy[h] = Math.random() * 1.1; spr.vz[h] = (Math.random() - 0.5) * 1.6; spr.life[h] = 0.55 + Math.random() * 0.35;
        spr.cols[h].set(Math.random() < 0.5 ? CONFETTI[(Math.random() * CONFETTI.length) | 0] : typeof color === 'string' ? color : '#ffffff');
      }
    };
    // M5: compact active instances to the front and draw only `count` of them (inactive pool slots cost 0 triangles)
    const sp = world.sparks.items; let nS = 0, nC = 0;
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i]; if (!s.active) continue;
      const kind = s.kind;
      // candy/brick toy fragments + smoke: tumble on the confetti mesh (bigger / softer)
      if (kind === 2 || kind === 3 || kind === 5) {
        tmpC.set(s.color);
        const u = s.life / s.maxLife, f = Math.min(1, s.life / 0.28);
        const base = kind === 5 ? 0.55 * s.size * (0.6 + 0.8 * (1 - u)) : (kind === 3 ? 0.28 : 0.2) * s.size * f;
        tmpQ.setFromEuler(tmpE.set(T0 * (kind === 5 ? 1.2 : 6 + (i % 5)) + i, i * 1.1, T0 * (kind === 5 ? 0.8 : 4) + i));
        const sy = kind === 5 ? base * 1.15 : kind === 3 ? base * 0.7 : base * 1.25;
        tmpM.compose(tmpP.set(s.pos.x, s.pos.y, s.pos.z), tmpQ, tmpS.set(base, sy, base));
        confetti.current.setMatrixAt(nC, tmpM); confetti.current.setColorAt(nC, tmpC); nC++;
        continue;
      }
      const isC = kind === 1;
      if (!isC && s.vis >= 0) { const k = Math.max(0.05, s.life / s.maxLife) * 0.1 * s.size; pushCandy(s.vis, s.pos.x, s.pos.y, s.pos.z, null, k, s.color, i, false); continue; }
      tmpC.set(s.color);
      if (!isC) { const k = (s.life / s.maxLife) * s.size; tmpM.makeScale(k, k, k).setPosition(s.pos.x, s.pos.y, s.pos.z);
        sparks.current.setMatrixAt(nS, tmpM); sparks.current.setColorAt(nS, tmpC); nS++; }
      else {
        const f = Math.min(1, s.life / 0.3);
        tmpQ.setFromEuler(tmpE.set(state.clock.elapsedTime * (5 + (i % 7)) + i, i * 1.3, state.clock.elapsedTime * 3 + i));
        tmpM.compose(tmpP.set(s.pos.x, s.pos.y, s.pos.z), tmpQ, tmpS.set(f, f, f));
        confetti.current.setMatrixAt(nC, tmpM); confetti.current.setColorAt(nC, tmpC); nC++;
      }
    }
    sparks.current.count = nS; confetti.current.count = nC;
    confetti.current.instanceMatrix.needsUpdate = true; if (confetti.current.instanceColor) confetti.current.instanceColor.needsUpdate = true;
    sparks.current.instanceMatrix.needsUpdate = true; if (sparks.current.instanceColor) sparks.current.instanceColor.needsUpdate = true;
    const pr = world.projectiles.items;
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i]; if (!p.active) continue;
      tmpV.set(p.vel.x, p.vel.y, p.vel.z); if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 1, 0);
      tmpQ.setFromUnitVectors(UP, tmpV.normalize());
      pushCandy(p.vis, p.pos.x, p.pos.y, p.pos.z, tmpQ, 0.26 * p.size, p.color, i, true);
    }
    // lobbed shells (arc from -> to)
    const lb = world.lobs.items;
    for (let i = 0; i < lb.length; i++) {
      const l = lb[i]; if (!l.active) continue;
      const u = Math.min(1, l.t / l.T), dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, H = 5 + Math.hypot(dx, dz) * 0.22;
      pushCandy(l.vis, l.from.x + dx * u, lerp(l.from.y, l.to.y, u) + 4 * H * u * (1 - u), l.from.z + dz * u, null, 0.52, l.color, i, true);
    }
    // player shots (interpolated)
    const a = world.alpha, sh = world.shots.items, t = state.clock.elapsedTime;
    let nB = 0;
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i]; if (!s.active) continue;
      tmpP.set(lerp(s.prev.x, s.pos.x, a), lerp(s.prev.y, s.pos.y, a), lerp(s.prev.z, s.pos.z, a));
      if (s.kind === 'bubble') {
        const w = 1 + Math.sin(t * 12 + i) * 0.08; tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(w, 2 - w, w)); bubbles.current.setMatrixAt(nB++, tmpM);
        pushCandy(s.vis, tmpP.x, tmpP.y, tmpP.z, null, s.size * 0.62, s.color, i, true);
      }
      if (s.kind === 'rocket') {
        tmpV.set(s.vel.x, s.vel.y, s.vel.z).normalize(); tmpQ.setFromUnitVectors(UP, tmpV);
        pushCandy(s.vis, tmpP.x, tmpP.y, tmpP.z, tmpQ, s.size * 1.45, '#ffffff', i, true);
      }
    }
    bubbles.current.count = nB; bubbles.current.instanceMatrix.needsUpdate = true;
    const tr = world.tracers.items;
    let nT = 0;
    for (let i = 0; i < tr.length; i++) {
      const tt = tr[i];
      if (!tt.active) continue;
      tmpV.set(tt.to.x - tt.from.x, tt.to.y - tt.from.y, tt.to.z - tt.from.z);
      const L = tmpV.length(); tmpQ.setFromUnitVectors(UP, tmpV.normalize());
      let k0 = 0, k1 = 1;
      if (tt.vis >= 0 && L > 0.01) {
        // candy head flies from -> to over the tracer's life; the streak trails behind it
        k1 = Math.min(1, 0.12 + (1 - tt.life / tt.maxLife) * 0.9); k0 = Math.max(0, k1 - Math.min(0.5, 6 / L));
        pushCandy(tt.vis, tt.from.x + (tt.to.x - tt.from.x) * k1, tt.from.y + (tt.to.y - tt.from.y) * k1, tt.from.z + (tt.to.z - tt.from.z) * k1, tmpQ, Math.max(0.08, tt.size), tt.color, i, true);
      }
      const Ls = L * (k1 - k0);
      tmpM.compose(tmpP.set(tt.from.x + (tt.to.x - tt.from.x) * (k0 + k1) / 2, tt.from.y + (tt.to.y - tt.from.y) * (k0 + k1) / 2, tt.from.z + (tt.to.z - tt.from.z) * (k0 + k1) / 2), tmpQ, tmpS.set(tt.width * 1.35, Ls, tt.width * 1.35));
      tracers.current.setMatrixAt(nT, tmpM); tracers.current.setColorAt(nT, tmpC.set(tt.color)); nT++;
    }
    tracers.current.count = nT;
    tracers.current.instanceMatrix.needsUpdate = true; if (tracers.current.instanceColor) tracers.current.instanceColor.needsUpdate = true;
    for (let v = 0; v < NV; v++) {
      const m = candy.current[v]; if (!m) continue;
      m.count = cnt[v]; m.visible = cnt[v] > 0;
      if (cnt[v] > 0) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    // sprinkle trail particles
    {
      const sm = sprMesh.current; let n = 0;
      for (let h = 0; h < SPR; h++) {
        if (spr.life[h] <= 0) continue; spr.life[h] -= dt; if (spr.life[h] <= 0) continue;
        spr.vy[h] -= 5 * dt; spr.x[h] += spr.vx[h] * dt; spr.y[h] += spr.vy[h] * dt; spr.z[h] += spr.vz[h] * dt;
        const f = Math.min(1, spr.life[h] / 0.25);
        tmpQ.setFromEuler(tmpE.set(h * 1.7 + T0 * 6, h * 0.9, h));
        tmpM.compose(tmpP.set(spr.x[h], spr.y[h], spr.z[h]), tmpQ, tmpS.set(f, f, f)); sm.setMatrixAt(n, tmpM); sm.setColorAt(n, spr.cols[h]); n++;
      }
      sm.count = n; sm.visible = n > 0; if (n > 0) { sm.instanceMatrix.needsUpdate = true; if (sm.instanceColor) sm.instanceColor.needsUpdate = true; }
    }
    const on = world.muzzleFlash > 0, cfg = currentConfig(world.player.arsenal);
    const m = muzzlePos(cfg);
    const flashOn = useUI.getState().settings.flash;
    const idx = ['candySmg', 'bubbleLauncher', 'rainbowShotgun', 'springRocket'].indexOf(cfg.id);
    const f = world.cam.fwd; tmpV.set(f.x, f.y, f.z).normalize();
    tmpQ.setFromUnitVectors(UP, tmpV);
    flashes.current.forEach((fm, j) => {
      if (!fm) return; fm.visible = on && j === idx; if (!fm.visible) return;
      fm.position.set(m.x, m.y, m.z); fm.quaternion.copy(tmpQ); fm.rotateY(Math.random() * 6);
      const pulse = 0.9 + Math.random() * 0.55;
      const base = [1.45, 1.25, 2.15, 1.9][j] * (flashOn ? 1 : 0.65); fm.scale.setScalar(base * pulse);
    });
    light.current.position.set(m.x, m.y, m.z); light.current.intensity = on && flashOn ? 11 : 0; light.current.color.set(cfg.color);
    const nums = world.dmgNums.items;
    for (let i = 0; i < nums.length; i++) {
      let el = dmgEls.current[i];
      if (!el) { el = dmgEls.current[i] = document.getElementById('dmg-' + i); if (!el) continue; }
      const n = nums[i];
      if (!n.active) { el.style.display = 'none'; continue; }
      tmpV.set(n.pos.x, n.pos.y, n.pos.z).project(camera);
      if (tmpV.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      const funny = (FUNNY_WORDS as readonly string[]).includes(n.text);
      const maxL = funny ? 1.2 : (n.crit ? 1.05 : 0.95);
      const age = Math.max(0, maxL - n.life);
      let bounce = 1;
      if (funny) {
        // springy overshoot: pop up → squash → settle (Q弹)
        if (age < 0.1) bounce = 0.35 + (age / 0.1) * 2.0;
        else if (age < 0.22) bounce = 2.35 - ((age - 0.1) / 0.12) * 0.55;
        else bounce = Math.max(1.05, 1.8 - (age - 0.22) * 0.55);
      } else if (n.crit) {
        bounce = age < 0.08 ? 0.7 + (age / 0.08) * 1.15 : Math.max(1.25, 1.85 - (age - 0.08) * 0.7);
      } else {
        bounce = age < 0.06 ? 0.85 + (age / 0.06) * 0.35 : Math.max(1, 1.2 - (age - 0.06) * 0.25);
      }
      el.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * size.width}px, ${(-tmpV.y * 0.5 + 0.5) * size.height}px) translate(-50%,-50%) scale(${bounce}) rotate(${funny ? Math.sin(age * 18) * 6 : n.crit ? Math.sin(age * 14) * 3 : 0}deg)`;
      el.style.opacity = String(Math.min(1, n.life / (funny ? 0.4 : 0.28)));
      el.textContent = n.value > 0 ? n.text + n.value : n.text;
      el.classList.toggle('dmg-funny', funny);
      el.classList.toggle('dmg-crit', !funny && n.crit);
      el.style.color = funny ? '#ffe566' : n.text.startsWith('BUBBLE') ? '#7fe8ff' : n.text.startsWith('ARMOR') ? '#cfd8dc' : n.crit ? '#ff4d7a' : '#ffffff';
    }
    // co-op partner name tag (DOM, projected)
    if (world.slots.length > 1) {
      let tag = tagEl.current; if (!tag) tag = tagEl.current = document.getElementById('partner-tag');
      if (tag) {
        const pp = world.slots[1 - world.local]?.player;
        if (pp && !pp.dead) {
          tmpV.set(pp.pos.x, pp.pos.y + 2.5, pp.pos.z).project(camera);
          if (tmpV.z < 1) { tag.style.display = 'block'; tag.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * size.width}px, ${(-tmpV.y * 0.5 + 0.5) * size.height}px) translate(-50%,-100%)`; }
          else tag.style.display = 'none';
        } else tag.style.display = 'none';
      }
    }
  });

  return (
    <>
      <instancedMesh ref={sparks} args={[geo, undefined, POOLS.sparks]} frustumCulled={false}><meshBasicMaterial toneMapped={false} /></instancedMesh>
      {BULLET_VISUALS.map((id, v) => <instancedMesh key={id} ref={(r) => { candy.current[v] = r; if (r) r.count = 0; }} args={[candyGeos[v], candyMat, CAP]} frustumCulled={false} visible={false} />)}
      <instancedMesh ref={sprMesh} args={[undefined, undefined, SPR]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.065, 0.065, 0.2]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={bubbles} args={[undefined, undefined, POOLS.shots]} frustumCulled={false}>
        <sphereGeometry args={[0.32, 16, 12]} /><meshStandardMaterial color="#bff6ff" transparent opacity={0.5} roughness={0.05} emissive="#7fe8ff" emissiveIntensity={0.65} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={tracers} args={[undefined, undefined, POOLS.tracers]} frustumCulled={false}>
        <cylinderGeometry args={[0.024, 0.024, 1, 6]} /><meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
      <Blasts />
      <instancedMesh ref={confetti} args={[undefined, undefined, POOLS.sparks]} frustumCulled={false}>
        <planeGeometry args={[0.12, 0.07]} /><meshBasicMaterial side={THREE.DoubleSide} />
      </instancedMesh>
      {/* per-weapon muzzle flashes (oriented along aim, +Y = forward) */}
      <group ref={(r) => (flashes.current[0] = r)} visible={false}>{/* SMG: candy star + heart sprinkle burst */}
        <mesh position-y={0.14}><coneGeometry args={[0.1, 0.42, 5]} /><meshBasicMaterial color="#fff3a0" toneMapped={false} transparent opacity={0.95} /></mesh>
        <mesh scale={[1.25, 0.32, 1.25]}><octahedronGeometry args={[0.18, 0]} /><meshBasicMaterial color="#ffd27a" toneMapped={false} /></mesh>
        {[0, 1, 2, 3].map((j) => <mesh key={'st' + j} position={[Math.cos(j * 1.57) * 0.16, 0.06, Math.sin(j * 1.57) * 0.16]} scale={0.55}><octahedronGeometry args={[0.07, 0]} /><meshBasicMaterial color={j % 2 ? '#ff9ec7' : '#fff3a0'} toneMapped={false} /></mesh>)}
        {[0, 1].map((j) => <mesh key={'ht' + j} position={[Math.cos(j * 3.1 + 0.4) * 0.22, 0.02, Math.sin(j * 3.1 + 0.4) * 0.22]} scale={[0.7, 0.55, 0.7]}><sphereGeometry args={[0.045, 8, 6]} /><meshBasicMaterial color="#ff6b9a" toneMapped={false} /></mesh>)}
      </group>
      <group ref={(r) => (flashes.current[1] = r)} visible={false}>{/* bubble: soapy ring */}
        <mesh rotation-x={Math.PI / 2}><torusGeometry args={[0.2, 0.045, 8, 22]} /><meshBasicMaterial color="#bff6ff" toneMapped={false} transparent opacity={0.9} /></mesh>
        <mesh position-y={0.1}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.75} /></mesh>
        {[0, 1, 2].map((j) => <mesh key={j} position={[Math.cos(j * 2.1) * 0.18, 0.04, Math.sin(j * 2.1) * 0.18]}><sphereGeometry args={[0.04, 8, 6]} /><meshBasicMaterial color="#e8fbff" transparent opacity={0.8} /></mesh>)}
      </group>
      <group ref={(r) => (flashes.current[2] = r)} visible={false}>{/* shotgun: rainbow cone */}
        {['#ff6b8b', '#ffd166', '#7ee8a2', '#7fc8ff', '#c9a8ff'].map((c, j) => <mesh key={c} position-y={0.14} rotation-y={j * 1.26} scale={[1.15 - j * 0.12, 1.2, 1.15 - j * 0.12]}><coneGeometry args={[0.16, 0.4, 6, 1, true]} /><meshBasicMaterial color={c} toneMapped={false} transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} /></mesh>)}
        <mesh scale={[1.1, 0.28, 1.1]}><octahedronGeometry args={[0.16, 0]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      </group>
      <group ref={(r) => (flashes.current[3] = r)} visible={false}>{/* rocket: smoke puff + spark + stars */}
        {[0, 1, 2, 3].map((j) => <mesh key={j} position={[Math.cos(j * 1.57) * 0.11, 0.06, Math.sin(j * 1.57) * 0.11]}><sphereGeometry args={[0.12, 10, 8]} /><meshBasicMaterial color="#fff1e6" transparent opacity={0.8} /></mesh>)}
        <mesh position-y={0.16}><coneGeometry args={[0.11, 0.32, 6]} /><meshBasicMaterial color="#ff8c42" toneMapped={false} /></mesh>
        {[0, 1, 2].map((j) => <mesh key={'rs' + j} position={[Math.cos(j * 2.1 + 0.5) * 0.2, 0.08, Math.sin(j * 2.1 + 0.5) * 0.2]}><octahedronGeometry args={[0.055, 0]} /><meshBasicMaterial color="#fff3a0" toneMapped={false} /></mesh>)}
      </group>
      <pointLight ref={light} color="#ffd27a" distance={8} intensity={0} />
    </>
  );
}
