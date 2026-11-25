import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../core/world';
const lerp = THREE.MathUtils.lerp;
import { glow, metal, plush, vinyl } from './materials';

/** KING GUMMY – fully procedural translucent gummy king with crown + cape */
export function KingGummy() {
  const root = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), arms = useRef<(THREE.Group | null)[]>([]);
  const tele = useRef<THREE.Mesh>(null!);
  const mats = useMemo(() => ({
    gum: new THREE.MeshPhysicalMaterial({ color: '#ff5c9a', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.88, sheen: 0.4, emissive: new THREE.Color('#000000') }),
    belly: new THREE.MeshPhysicalMaterial({ color: '#ffd1e3', roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.9 }),
    gold: metal('#ffcc33'), gem: glow('#7fe8ff', 1.4), gemR: glow('#ff3366', 1.4), cape: plush('#7b3fd6'), trim: plush('#ffffff', 'trim'),
    eye: vinyl('#2a1a2e'), shine: glow('#ffffff', 1.5), blush: vinyl('#ff8fb8'),
    tele: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }),
  }), []);
  useFrame(() => {
    const id = world.boss.id, e = id >= 0 ? world.enemies.items[id] : null;
    const on = !!e && e.active && e.type === 'king';
    root.current.visible = on; if (!on || !e) return;
    const a = world.alpha, t = world.time, B = world.boss, s = B.s;
    root.current.position.set(lerp(e.prev.x, e.pos.x, a), 0, lerp(e.prev.z, e.pos.z, a));
    body.current.rotation.y = e.facing;
    let sy = 1 + Math.sin(e.animPhase * 3) * 0.05, sx = 1 - Math.sin(e.animPhase * 3) * 0.03;
    if (B.tele === 'slam') { sy = 1.25; sx = 0.85; } if (B.slamT > 0) { sy = 0.7; sx = 1.3; }
    if (s.transition > 0) { sy = 1 + Math.sin(t * 25) * 0.12; }
    if (e.dead) { const k = Math.max(0, e.deathTimer / 1.6); sy = sx = k * (1 + (1 - k) * 0.5); body.current.rotation.z = (1 - k) * 2; }
    body.current.scale.set(sx, sy, sx);
    const lift = B.tele === 'summon' || B.tele === 'ring' ? 1.2 : B.tele === 'slam' ? 2.6 : 0.2 + Math.sin(t * 3) * 0.1;
    arms.current.forEach((g, i) => { if (g) g.rotation.z = (i ? -1 : 1) * (0.5 + lift); });
    const p3 = s.phase === 3, flash = e.flash > 0 ? 0.8 : B.tele ? (Math.sin(t * 30) > 0 ? 0.5 : 0.15) : 0;
    mats.gum.color.set(p3 ? '#ff2d55' : s.phase === 2 ? '#ff6fb0' : '#ff5c9a');
    mats.gum.emissive.setRGB(flash + (s.transition > 0 ? 0.4 : 0), flash * 0.6, flash * 0.8);
    tele.current.visible = !!B.tele && !e.dead;
    if (B.tele) { tele.current.scale.setScalar(B.tele === 'slam' ? 1.15 + Math.sin(t * 20) * 0.05 : 1.05); mats.tele.color.set(B.tele === 'slam' ? '#ff3366' : B.tele === 'summon' ? '#ffd84d' : '#7fe8ff'); }
  });
  const m = mats;
  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        <mesh castShadow position={[0, 1.7, 0]} scale={[1.7, 1.75, 1.5]} material={m.gum}><sphereGeometry args={[1, 32, 24]} /></mesh>
        <mesh position={[0, 1.5, -1.05]} scale={[1.1, 1.1, 0.6]} material={m.belly}><sphereGeometry args={[1, 24, 16]} /></mesh>
        <mesh castShadow position={[0, 3.55, 0]} scale={[1.15, 1, 1.05]} material={m.gum}><sphereGeometry args={[1, 28, 20]} /></mesh>
        {/* face */}
        {[-1, 1].map((sg) => (
          <group key={sg} position={[0.42 * sg, 3.7, -0.92]}>
            <mesh material={m.eye}><sphereGeometry args={[0.2, 16, 12]} /></mesh>
            <mesh position={[0.06, 0.07, -0.15]} material={m.shine}><sphereGeometry args={[0.06, 8, 6]} /></mesh>
            <mesh position={[0.18 * sg, -0.3, 0.05]} scale={[1, 0.6, 0.4]} material={m.blush}><sphereGeometry args={[0.16, 10, 8]} /></mesh>
          </group>
        ))}
        <mesh position={[0, 3.32, -0.98]} rotation={[0, 0, Math.PI]} material={m.eye}><torusGeometry args={[0.22, 0.05, 8, 16, Math.PI]} /></mesh>
        {/* crown */}
        <group position={[0, 4.45, 0]}>
          <mesh castShadow material={m.gold}><cylinderGeometry args={[0.75, 0.82, 0.42, 20, 1, true]} /></mesh>
          {Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2; return (
            <group key={i} position={[Math.sin(a) * 0.72, 0.4, Math.cos(a) * 0.72]}>
              <mesh material={m.gold}><coneGeometry args={[0.16, 0.45, 6]} /></mesh>
              <mesh position={[0, 0.28, 0]} material={i % 2 ? m.gem : m.gemR}><sphereGeometry args={[0.08, 8, 6]} /></mesh>
            </group>); })}
          <mesh position={[0, 0, -0.8]} material={m.gemR}><octahedronGeometry args={[0.16]} /></mesh>
        </group>
        {/* cape */}
        <mesh castShadow position={[0, 2.2, 1.15]} rotation={[0.12, 0, 0]} material={m.cape}><cylinderGeometry args={[1.2, 1.9, 3.4, 20, 1, true, -1.2, 2.4]} /></mesh>
        <mesh position={[0, 3.05, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={m.trim}><torusGeometry args={[1.05, 0.16, 10, 24]} /></mesh>
        {/* arms with scepter */}
        {[-1, 1].map((sg, i) => (
          <group key={sg} ref={(g) => (arms.current[i] = g)} position={[1.5 * sg, 2.4, 0]}>
            <mesh position={[0.5 * sg, -0.3, 0]} scale={[0.9, 0.42, 0.42]} material={m.gum}><sphereGeometry args={[0.75, 16, 12]} /></mesh>
            {sg > 0 && <group position={[1.1, -0.2, 0]}><mesh material={m.gold}><cylinderGeometry args={[0.07, 0.07, 2, 8]} /></mesh>
              <mesh position={[0, 1.1, 0]} material={m.gem}><sphereGeometry args={[0.25, 14, 10]} /></mesh></group>}
          </group>
        ))}
        {[-1, 1].map((sg) => <mesh key={sg} castShadow position={[0.7 * sg, 0.25, -0.1]} scale={[1, 0.5, 1.3]} material={m.gum}><sphereGeometry args={[0.55, 16, 10]} /></mesh>)}
      </group>
      <mesh ref={tele} position={[0, 2.3, 0]} scale={1} material={m.tele} visible={false}><sphereGeometry args={[2.6, 20, 14]} /></mesh>
    </group>
  );
}

/** telegraphed danger circles: fill grows toward detonation */
export function Hazards() {
  const N = 24, rings = useRef<(THREE.Group | null)[]>([]), drops = useRef<(THREE.Group | null)[]>([]);
  const dropMats = useMemo(() => ['#e53935', '#1e6fe8', '#ffd21f', '#2fb344', '#ff8a1f', '#f4f4f4'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 })), []);
  const ballMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.35, metalness: 0.5 }), []);
  const mats = useMemo(() => Array.from({ length: N }, () => ({
    edge: new THREE.MeshBasicMaterial({ color: '#ff3366', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    fill: new THREE.MeshBasicMaterial({ color: '#ff5c9a', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  })), []);
  useFrame(() => {
    for (let i = 0; i < N; i++) {
      const g = rings.current[i]; if (!g) continue; const h = world.hazards[i];
      const dg = drops.current[i], blk = world.mapId === 'block';
      if (dg) { // block world: bricks (shower) / wrecking balls (wreck) fall onto the telegraphed circle and land exactly at detonation
        const fall = !!h && blk && (h.kind === 'shell' || h.kind === 'hazard') && h.t < 1.5 && h.t > 0;
        dg.visible = fall;
        if (fall) { const k = h!.t / 1.5; dg.position.set(h!.pos.x, h!.pos.y + 0.2 + k * k * 16, h!.pos.z); dg.rotation.set(k * 5 + i, k * 3, 0); (dg.children[0] as THREE.Mesh).visible = h!.kind === 'shell'; (dg.children[1] as THREE.Mesh).visible = h!.kind === 'hazard'; }
      }
      g.visible = !!h; if (!h) continue;
      g.position.set(h.pos.x, h.pos.y + 0.08 + i * 0.002, h.pos.z); g.scale.setScalar(h.r);
      const k = 1 - h.t / h.max; const fill = g.children[1] as THREE.Mesh; fill.scale.setScalar(Math.max(0.01, k));
      const blk2 = world.mapId === 'block';
      const col = blk2 ? (h.kind === 'slam' ? '#e53935' : h.kind === 'shell' ? '#ffd21f' : '#ff8a1f') : h.kind === 'slam' ? '#ff3366' : h.kind === 'shell' ? '#ff6fb0' : '#ffb347';
      mats[i].edge.color.set(col); mats[i].fill.color.set(col); mats[i].fill.opacity = 0.25 + k * 0.35;
      mats[i].edge.opacity = Math.sin(world.time * (10 + k * 30)) > 0 ? 0.95 : 0.5;
    }
  });
  return <>{mats.map((m, i) => (<group key={i}>
    <group ref={(g) => (drops.current[i] = g)} visible={false}>
      <mesh material={dropMats[i % dropMats.length]} scale={[1.6, 1, 2.4]} castShadow><boxGeometry args={[1, 1, 1]} /></mesh>
      <mesh material={ballMat} visible={false}><sphereGeometry args={[1.2, 16, 12]} /></mesh>
    </group>
    <group ref={(g) => (rings.current[i] = g)} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.edge}><ringGeometry args={[0.92, 1, 40]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.fill}><circleGeometry args={[1, 40]} /></mesh>
    </group></group>))}</>;
}

/** BOLT turret, KIKI decoy, BUBU honey shield */
export function SkillProps({ slot }: { slot?: number } = {}) {
  const tur = useRef<THREE.Group>(null!), head = useRef<THREE.Group>(null!), dec = useRef<THREE.Group>(null!), sh = useRef<THREE.Mesh>(null!);
  const m = useMemo(() => ({
    body: metal('#7fb8ff'), yellow: vinyl('#ffd84d'), led: glow('#7fffe0', 1.6),
    ghost: new THREE.MeshPhysicalMaterial({ color: '#c9a8ff', transparent: true, opacity: 0.45, roughness: 0.2, emissive: new THREE.Color('#6a3fd6'), emissiveIntensity: 0.4, depthWrite: false }),
    honey: new THREE.MeshPhysicalMaterial({ color: '#ffcc33', transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1, emissive: new THREE.Color('#ff9f1a'), emissiveIntensity: 0.25, depthWrite: false }),
  }), []);
  useFrame(() => {
    const S = world.slots[slot ?? world.local] ?? world.slots[0], T = S.turret, D = S.decoy, p = S.player, a = world.alpha;
    tur.current.visible = T.t > 0; if (T.t > 0) { tur.current.position.set(T.pos.x, T.pos.y, T.pos.z); head.current.rotation.y = T.aim; tur.current.scale.setScalar(Math.min(1, (10 - T.t) * 4 + 0.2) * (T.t < 1 ? T.t : 1)); }
    dec.current.visible = D.t > 0; if (D.t > 0) { dec.current.position.set(D.pos.x, D.pos.y + Math.sin(world.time * 4) * 0.08, D.pos.z); dec.current.rotation.y += 0.03; m.ghost.opacity = D.t < 1 ? D.t * 0.45 : 0.45; }
    sh.current.visible = S.shield.hp > 0;
    if (sh.current.visible) { sh.current.position.set(lerp(p.prev.x, p.pos.x, a), lerp(p.prev.y, p.pos.y, a) + 0.85, lerp(p.prev.z, p.pos.z, a)); sh.current.scale.setScalar(1 + Math.sin(world.time * 5) * 0.04); }
  });
  return (<>
    <group ref={tur} visible={false}>
      <mesh castShadow position={[0, 0.25, 0]} material={m.yellow}><cylinderGeometry args={[0.35, 0.45, 0.5, 12]} /></mesh>
      <group ref={head} position={[0, 0.75, 0]}>
        <mesh castShadow material={m.body}><boxGeometry args={[0.55, 0.4, 0.55]} /></mesh>
        <mesh position={[0, 0, -0.45]} rotation={[Math.PI / 2, 0, 0]} material={m.body}><cylinderGeometry args={[0.07, 0.07, 0.5, 8]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[0.14 * s, 0.08, -0.28]} material={m.led}><sphereGeometry args={[0.06, 8, 6]} /></mesh>)}
        <mesh position={[0, 0.35, 0]} material={m.led}><sphereGeometry args={[0.05, 8, 6]} /></mesh>
      </group>
    </group>
    <group ref={dec} visible={false}>
      <mesh position={[0, 0.9, 0]} scale={[0.5, 0.65, 0.45]} material={m.ghost}><sphereGeometry args={[1, 18, 14]} /></mesh>
      <mesh position={[0, 1.65, 0]} scale={0.42} material={m.ghost}><sphereGeometry args={[1, 18, 14]} /></mesh>
    </group>
    <mesh ref={sh} visible={false} material={m.honey}><icosahedronGeometry args={[1.25, 2]} /></mesh>
  </>);
}
