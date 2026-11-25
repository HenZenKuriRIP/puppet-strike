import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { BlenderPropAccents, GlbBoundary } from '../assets/BlenderKit';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vinyl, glossy, plush, flat } from '../entities/materials';
import { ARENA_BOXES, HOUSES, LOLLIPOPS, SPAWN_POINTS, BLOCKS } from './arenaLayout';
import { DOMES, RAMPS, RIVER, BRIDGES, groundHeight, inRiver, onBridge, PLAZA, H } from './terrain';

const rand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const PASTEL = ['#ff8fb8', '#8fe3c8', '#ffe27a', '#b89cff', '#8fd0ff', '#ffb38a'];
const insideBox = (x: number, z: number, pad = 0.3) => ARENA_BOXES.some((b) => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad);
type V3t = [number, number, number];
export interface Item { p: V3t; s: V3t; r?: V3t; c?: string }

export function useInstances(ref: React.RefObject<THREE.InstancedMesh>, items: Item[]) {
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const o = new THREE.Object3D(), col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p); o.scale.set(...it.s); o.rotation.set(...(it.r ?? [0, 0, 0])); o.updateMatrix();
      m.setMatrixAt(i, o.matrix); if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items, ref]);
}

/** Gradient sky dome (no texture). */
export function Sky({ top = '#7ec0ff', mid = '#ffd0ea', bottom = '#fff6e8' }: { top?: string; mid?: string; bottom?: string } = {}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // richer horizon band + soft warm glow near the bottom rim (no texture)
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
void main(){
  float h = vP.y;
  vec3 horizon = mix(mid, vec3(1.0, 0.92, 0.88), 0.35);
  vec3 c;
  if (h > 0.08) c = mix(horizon, top, smoothstep(0.08, 0.72, h));
  else if (h > -0.05) c = mix(mid, horizon, smoothstep(-0.05, 0.08, h));
  else c = mix(bottom, mid, smoothstep(-0.35, -0.05, h));
  // soft warm rim near ground for candy trailer punch
  float rim = smoothstep(0.15, -0.02, h) * smoothstep(-0.55, -0.1, h);
  c = mix(c, vec3(1.0, 0.86, 0.78), rim * 0.22);
  gl_FragColor = vec4(c, 1.0);
}`,
  }), [top, mid, bottom]);
  return <mesh material={mat} scale={250}><sphereGeometry args={[1, 32, 16]} /></mesh>;
}

function stripeTex(a: string, b: string, n = 8, diag = true) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = a; g.fillRect(0, 0, 128, 128); g.fillStyle = b;
  for (let i = -n; i < n * 2; i++) { g.beginPath(); const x = i * (128 / n); g.moveTo(x, 0); g.lineTo(x + 64 / n, 0); g.lineTo(x + 64 / n + (diag ? 128 : 0), 128); g.lineTo(x + (diag ? 128 : 0), 128); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** white swirl on light grey: instance colour tints it into a lollipop */
function lollySwirl() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#d9d9d9'; g.lineWidth = 11;
  g.beginPath(); for (let a = 0; a < 30; a += 0.1) { const r = a * 2.1; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ChocolateRiver() {
  const mat = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    g.fillStyle = '#6e4228'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 48; i++) { g.strokeStyle = i % 2 ? '#9a6240' : '#5a3420'; g.lineWidth = 2.5 + (i % 3); g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(70, y + 14, 180, y - 12, 256, y + (Math.random() - 0.5) * 8); g.stroke(); }
    // glossy highlight streaks
    for (let i = 0; i < 8; i++) { g.strokeStyle = 'rgba(255,220,180,0.18)'; g.lineWidth = 4; g.beginPath(); const y = 20 + i * 28; g.moveTo(0, y); g.bezierCurveTo(90, y - 6, 160, y + 8, 256, y); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.12, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, reflectivity: 0.7, envMapIntensity: 0.8 });
  }, []);
  useFrame((_, dt) => { if (mat.map) mat.map.offset.x += dt * 0.045; });
  const w = RIVER.half * 2;
  return (
    <group position={[0, 0.03, RIVER.z]}>
      <mesh rotation-x={-Math.PI / 2} material={mat} receiveShadow><planeGeometry args={[H * 2, w]} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[0, 0.07, s * (RIVER.half + 0.15)]} rotation-z={Math.PI / 2} material={vinyl('#fff3e6')}><capsuleGeometry args={[0.28, H * 2 - 1, 4, 8]} /></mesh>)}
    </group>
  );
}

function CakeHouse({ p, s = 1, c }: { p: V3t; s?: number; c: string }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 1.5, 0]} material={vinyl('#fff3e6')} castShadow receiveShadow><cylinderGeometry args={[3, 3, 3, 28]} /></mesh>
      <mesh position={[0, 3.05, 0]} material={vinyl(c)}><torusGeometry args={[2.95, 0.35, 10, 30]} /></mesh>
      <mesh position={[0, 3.9, 0]} material={vinyl(c)} castShadow><cylinderGeometry args={[2, 2.2, 1.8, 24]} /></mesh>
      <mesh position={[0, 4.85, 0]} material={vinyl('#ffffff')}><torusGeometry args={[1.95, 0.25, 10, 26]} /></mesh>
      <mesh position={[0, 5.4, 0]} material={glossy('#ff3d6e')} castShadow><sphereGeometry args={[0.55, 18, 14]} /></mesh>
      {[0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + 0.4; return (
        <group key={i} position={[Math.cos(a) * 3.01, 1.6, Math.sin(a) * 3.01]} rotation-y={-a + Math.PI / 2}>
          <mesh material={flat('#9fd8ff')}><circleGeometry args={[0.45, 18]} /></mesh>
          <mesh position={[0, 0, 0.01]} material={vinyl('#ffffff')}><torusGeometry args={[0.47, 0.07, 6, 18]} /></mesh>
        </group>); })}
    </group>
  );
}

/** Spawn-gate arches (visual): two posts + lintel, facing the arena centre. Returns box items + portal planes. */
export function gateItems() {
  const boxes: Item[] = [], portals: Item[] = [];
  for (const [x, z] of SPAWN_POINTS) {
    const ry = Math.atan2(-x, -z); // plane normal (+z local) points to centre
    const ang = Math.atan2(-x, -z); const nx = Math.cos(ang), nz = -Math.sin(ang); // perpendicular in the ground plane
    for (const s of [-1, 1]) boxes.push({ p: [x + nx * 2.3 * s, 1.9, z + nz * 2.3 * s], s: [0.7, 3.8, 0.7], r: [0, ry, 0], c: s > 0 ? '#ff7eb6' : '#7fe8ff' });
    boxes.push({ p: [x, 3.95, z], s: [5.6, 0.7, 0.8], r: [0, ry, 0], c: '#ffd36b' });
    portals.push({ p: [x, 1.95, z], s: [4.1, 3.7, 1], r: [0, ry, 0], c: '#ff9ec7' });
  }
  return { boxes, portals };
}

export function Decor({ density = 1 }: { density?: number }) {
  const dMul = Math.max(0.35, density);
  // --- sprinkles (instanced) over the whole map ---
  const sprinkles = useMemo<Item[]>(() => { const r = rand(7); const out: Item[] = [];
    const n = Math.floor(2600 * density);
    while (out.length < n) { const x = (r() - 0.5) * (H * 2 - 3), z = (r() - 0.5) * (H * 2 - 3); if (insideBox(x, z) || inRiver(x, z) || onBridge(x, z)) continue;
      out.push({ p: [x, groundHeight(x, z) + 0.03, z], s: [1, 1, 1], r: [Math.PI / 2, 0, r() * Math.PI], c: PASTEL[out.length % PASTEL.length] }); }
    return out; }, [density]);
  const sprRef = useRef<THREE.InstancedMesh>(null); useInstances(sprRef, sprinkles);
  // --- gumdrop trees outside the fence ---
  const trees = useMemo(() => { const r = rand(11); const out: { x: number; z: number; h: number; c: string }[] = [];
    const n = Math.floor(120 * dMul);
    while (out.length < n) { const x = (r() - 0.5) * 150, z = (r() - 0.5) * 150; if (Math.abs(x) < H + 3 && Math.abs(z) < H + 3) continue; if (Math.hypot(x, z) > 80) continue; out.push({ x, z, h: 2.5 + r() * 3, c: PASTEL[out.length % PASTEL.length] }); }
    return out; }, [dMul]);
  const trunks = useMemo<Item[]>(() => trees.map((t) => ({ p: [t.x, t.h / 2, t.z], s: [1, t.h, 1] })), [trees]);
  const crowns = useMemo<Item[]>(() => trees.flatMap((t) => [0, 1, 2].map((j) => ({ p: [t.x + (j - 1) * 0.5, t.h + 0.4 + (j % 2) * 0.6, t.z + (j === 1 ? 0.3 : -0.2)] as V3t, s: [1.2 - j * 0.15, 1.05 - j * 0.1, 1.2 - j * 0.15].map((v) => v * (t.h / 3.5)) as V3t, c: t.c }))), [trees]);
  // --- little gumdrops scattered inside ---
  const gumdrops = useMemo<Item[]>(() => { const r = rand(23); const out: Item[] = []; const n = Math.floor(90 * dMul);
    while (out.length < n) { const x = (r() - 0.5) * (H * 2 - 4), z = (r() - 0.5) * (H * 2 - 4); if (insideBox(x, z, 0.8) || inRiver(x, z) || onBridge(x, z) || Math.hypot(x, z) < 6) continue; const s = 0.25 + r() * 0.3; out.push({ p: [x, groundHeight(x, z), z], s: [s, s, s], c: PASTEL[out.length % PASTEL.length] }); } return out; }, [dMul]);
  // --- cotton-candy puffs on the hills ---
  const puffs = useMemo<Item[]>(() => { const r = rand(31); const out: Item[] = []; const cols = ['#ffd0e6', '#d0e6ff', '#ffe9f5', '#e6d6ff'];
    for (const d of DOMES) for (let i = 0; i < Math.floor(26 * dMul); i++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * d.r * 0.85, x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      if (insideBox(x, z, 1.2)) continue; const s = 0.35 + r() * 0.6; out.push({ p: [x, groundHeight(x, z) + s * 0.4, z], s: [s * 1.4, s, s * 1.4], c: cols[i % cols.length] }); }
    for (const rp of RAMPS) for (let i = 0; i < 8; i++) { const x = rp.x1 + r() * rp.plat, z = rp.z + (r() > 0.5 ? 1 : -1) * (rp.w / 2 - 0.2), s = 0.3 + r() * 0.3; out.push({ p: [x, groundHeight(x, z) + s * 0.3, z], s: [s, s, s], c: cols[i % cols.length] }); }
    return out; }, [dMul]);
  // --- rock candy crystals near the river banks and hills ---
  const crystals = useMemo<Item[]>(() => { const r = rand(41); const out: Item[] = []; const n = Math.floor(46 * dMul);
    while (out.length < n) { const x = (r() - 0.5) * (H * 2 - 6), z = (r() - 0.5) * (H * 2 - 6); if (insideBox(x, z, 1) || inRiver(x, z) || onBridge(x, z) || Math.hypot(x, z) < PLAZA.r) continue; const s = 0.3 + r() * 0.5;
      out.push({ p: [x, groundHeight(x, z) + s * 0.8, z], s: [s * 0.6, s * 1.6, s * 0.6], r: [(r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4], c: ['#bfe9ff', '#ffc9ec', '#d5c8ff'][out.length % 3] }); } return out; }, [dMul]);
  // --- candy-cane fence posts along the inside of the wall ---
  const posts = useMemo<Item[]>(() => { const out: Item[] = []; const e = H - 1.1; for (let t = -H + 3; t <= H - 3; t += 6) for (const [x, z] of [[t, -e], [t, e], [-e, t], [e, t]]) out.push({ p: [x, 0.7, z], s: [1, 1.4, 1], c: '#ffffff' }); return out; }, []);
  // --- plaza candy canes (decor on top of the pole colliders) + a few large canes outside ---
  const caneGeo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 4.2, 0), new THREE.Vector3(0.5, 4.9, 0), new THREE.Vector3(1.2, 4.7, 0), new THREE.Vector3(1.4, 4.1, 0)]), 28, 0.2, 8), []);
  const caneMat = useMemo(() => { const t = stripeTex('#ffffff', '#ff4f7b', 6); t.repeat.set(12, 1); return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }); }, []);
  const canes = useMemo<Item[]>(() => {
    const out: Item[] = BLOCKS.filter((b) => b.kind === 'cane').map((b, i) => ({ p: [b.pos[0], 0, b.pos[2]] as V3t, s: [1, 0.82, 1] as V3t, r: [0, i * 1.6, 0] as V3t }));
    [[-40, -30], [42, -36], [-44, 18], [46, 24], [-16, 44], [20, 44], [-30, -44], [8, -44]].forEach(([x, z], i) => out.push({ p: [x, 0, z], s: [1.6, 1.6, 1.6], r: [0, i * 1.3, 0] }));
    return out; }, []);
  const swirlTex = useMemo(lollySwirl, []);
  const lollyMat = useMemo(() => new THREE.MeshPhysicalMaterial({ map: swirlTex, roughness: 0.2, clearcoat: 1 }), [swirlTex]);
  // forest lollipops (colliders in arenaLayout): discs + sticks
  const lSticks = useMemo<Item[]>(() => LOLLIPOPS.map((l) => ({ p: [l.x, groundHeight(l.x, l.z) + l.h / 2, l.z], s: [1, l.h, 1] })), []);
  const lDiscs = useMemo<Item[]>(() => LOLLIPOPS.map((l, i) => ({ p: [l.x, groundHeight(l.x, l.z) + l.h + l.r * 0.8, l.z], s: [l.r, 1, l.r], r: [Math.PI / 2, 0, i], c: l.color })), []);
  const giants = useMemo(() => [[-36, -48], [30, -50], [58, -10], [-58, -22], [52, 34], [-52, 38], [12, 54], [-16, 56]].map(([x, z], i) => ({ x, z, i })), []);
  const gSticks = useMemo<Item[]>(() => giants.map((g) => ({ p: [g.x, 5.5, g.z], s: [1, 11, 1] })), [giants]);
  const gDiscs = useMemo<Item[]>(() => giants.map((g) => ({ p: [g.x, 12, g.z], s: [3.2, 1, 3.2], r: [Math.PI / 2, 0, g.i], c: PASTEL[g.i % 6] })), [giants]);
  const { boxes: gateBoxes, portals } = useMemo(gateItems, []);
  const gateRef = useRef<THREE.InstancedMesh>(null); useInstances(gateRef, gateBoxes);
  const portalRef = useRef<THREE.InstancedMesh>(null); useInstances(portalRef, portals);
  // gingerbread houses: roofs, doors and window glow on top of the collider boxes
  const roofs = useMemo<Item[]>(() => HOUSES.map((h, i) => ({ p: [h.x, h.h + 0.55, h.z], s: [h.w + 0.7, 1.1, h.d + 0.7], r: [0, Math.PI / 4, 0], c: ['#ff8fb8', '#8fe3c8', '#fff1a8'][i % 3] })), []);
  const doors = useMemo<Item[]>(() => HOUSES.flatMap((h) => [
    { p: [h.x, 0.6, h.z + h.d / 2 + 0.02] as V3t, s: [0.8, 1.2, 0.08] as V3t, c: '#7b4a2a' },
    { p: [h.x - h.w * 0.3, 1.7, h.z + h.d / 2 + 0.02] as V3t, s: [0.55, 0.55, 0.08] as V3t, c: '#fff0a0' },
    { p: [h.x + h.w * 0.3, 1.7, h.z + h.d / 2 + 0.02] as V3t, s: [0.55, 0.55, 0.08] as V3t, c: '#fff0a0' },
    { p: [h.x, h.h + 0.02, h.z] as V3t, s: [h.w + 0.1, 0.18, h.d + 0.1] as V3t, c: '#ffffff' },
  ]), []);
  const refs = { trunk: useRef<THREE.InstancedMesh>(null), crown: useRef<THREE.InstancedMesh>(null), gum: useRef<THREE.InstancedMesh>(null), cane: useRef<THREE.InstancedMesh>(null),
    puff: useRef<THREE.InstancedMesh>(null), cry: useRef<THREE.InstancedMesh>(null), post: useRef<THREE.InstancedMesh>(null),
    ls: useRef<THREE.InstancedMesh>(null), ld: useRef<THREE.InstancedMesh>(null), gs: useRef<THREE.InstancedMesh>(null), gd: useRef<THREE.InstancedMesh>(null),
    roof: useRef<THREE.InstancedMesh>(null), door: useRef<THREE.InstancedMesh>(null) };
  useInstances(refs.trunk, trunks); useInstances(refs.crown, crowns); useInstances(refs.gum, gumdrops); useInstances(refs.cane, canes); useInstances(refs.puff, puffs);
  useInstances(refs.cry, crystals); useInstances(refs.post, posts); useInstances(refs.ls, lSticks); useInstances(refs.ld, lDiscs); useInstances(refs.gs, gSticks); useInstances(refs.gd, gDiscs);
  useInstances(refs.roof, roofs); useInstances(refs.door, doors);
  const postMat = useMemo(() => { const t = stripeTex('#ffffff', '#ff4f7b', 4); t.repeat.set(1, 2); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }); }, []);
  const portalMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), []);
  useFrame((s) => { portalMat.opacity = 0.2 + Math.sin(s.clock.elapsedTime * 2.4) * 0.07; });
  return (
    <group>
      <instancedMesh ref={sprRef} args={[undefined, undefined, sprinkles.length]} receiveShadow frustumCulled={false}>
        <boxGeometry args={[0.045, 0.16, 0.045]} /><meshStandardMaterial roughness={0.28} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={refs.trunk} args={[undefined, undefined, trunks.length]} castShadow material={vinyl('#fff3e6')} frustumCulled={false}><cylinderGeometry args={[0.18, 0.25, 1, 6]} /></instancedMesh>
      <instancedMesh ref={refs.crown} args={[undefined, undefined, crowns.length]} castShadow={density >= 1} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6]} /><meshPhysicalMaterial roughness={0.25} clearcoat={0.8} />
      </instancedMesh>
      <instancedMesh ref={refs.gum} args={[undefined, undefined, gumdrops.length]} castShadow={density >= 1} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.7]} /><meshPhysicalMaterial roughness={0.3} clearcoat={0.6} />
      </instancedMesh>
      <instancedMesh ref={refs.puff} args={[undefined, undefined, puffs.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={refs.cry} args={[undefined, undefined, crystals.length]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} /><meshPhysicalMaterial roughness={0.1} transmission={0} transparent opacity={0.85} clearcoat={1} />
      </instancedMesh>
      <instancedMesh ref={refs.post} args={[undefined, undefined, posts.length]} material={postMat} frustumCulled={false}><cylinderGeometry args={[0.16, 0.16, 1, 8]} /></instancedMesh>
      <instancedMesh ref={refs.cane} args={[caneGeo, caneMat, canes.length]} castShadow={density >= 1} frustumCulled={false} />
      <instancedMesh ref={refs.ls} args={[undefined, undefined, lSticks.length]} castShadow={density >= 1} material={vinyl('#ffffff')} frustumCulled={false}><cylinderGeometry args={[0.1, 0.1, 1, 10]} /></instancedMesh>
      <instancedMesh ref={refs.ld} args={[undefined, undefined, lDiscs.length]} castShadow={density >= 1} material={lollyMat} frustumCulled={false}><cylinderGeometry args={[1, 1, 0.3, 18]} /></instancedMesh>
      <instancedMesh ref={refs.gs} args={[undefined, undefined, gSticks.length]} castShadow={density >= 1} material={vinyl('#ffffff')} frustumCulled={false}><cylinderGeometry args={[0.25, 0.25, 1, 12]} /></instancedMesh>
      <instancedMesh ref={refs.gd} args={[undefined, undefined, gDiscs.length]} castShadow={density >= 1} material={lollyMat} frustumCulled={false}><cylinderGeometry args={[1, 1, 0.22, 24]} /></instancedMesh>
      <instancedMesh ref={gateRef} args={[undefined, undefined, gateBoxes.length]} castShadow frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshPhysicalMaterial roughness={0.3} clearcoat={0.8} /></instancedMesh>
      <instancedMesh ref={portalRef} args={[undefined, undefined, portals.length]} material={portalMat} frustumCulled={false}><planeGeometry args={[1, 1]} /></instancedMesh>
      <instancedMesh ref={refs.roof} args={[undefined, undefined, roofs.length]} castShadow frustumCulled={false}><coneGeometry args={[0.7071, 1, 4]} /><meshPhysicalMaterial roughness={0.35} clearcoat={0.6} /></instancedMesh>
      <instancedMesh ref={refs.door} args={[undefined, undefined, doors.length]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.5} /></instancedMesh>
      <ChocolateRiver />
      {[[-46, -8, 1, '#ffb3d1'], [46, 6, 1.2, '#b8f2e6'], [-44, 26, 0.9, '#c3b5ff'], [44, -26, 0.8, '#fff1a8'], [0, 48, 1.3, '#ffc9a8'], [-22, 49, 1, '#b8f2e6'], [24, 49, 1, '#ffb3d1'], [14, -49, 1.1, '#c3b5ff'], [-52, -40, 1.2, '#fff1a8']].map(([x, z, s, c], i) => (
        <CakeHouse key={i} p={[x as number, 0, z as number]} s={s as number} c={c as string} />))}
      {/* central plaza: candy-cane striped floor disc + a walkable fountain decal with a hovering star */}
      <PlazaFloor />
      {/* frosting rim around the arena floor */}
      <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2} material={plush('#fff6fb')}><ringGeometry args={[H - 0.6, H + 0.4, 4, 1, Math.PI / 4]} /></mesh>
      {/* Blender kit high-quality accents (GLB); silent fallback if load fails */}
      <GlbBoundary fallback={null}>
        <Suspense fallback={null}>
          <BlenderPropAccents />
        </Suspense>
      </GlbBoundary>
    </group>
  );
}

function PlazaFloor() {
  const tex = useMemo(() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    g.fillStyle = '#fff6d8'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffd6e8' : '#fff6d8'; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); g.fill(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; for (const r of [40, 85, 124]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }, []);
  const star = useRef<THREE.Group>(null);
  useFrame((s) => { if (star.current) { star.current.rotation.y = s.clock.elapsedTime * 1.2; star.current.position.y = 2.1 + Math.sin(s.clock.elapsedTime * 2) * 0.15; } });
  return (
    <group>
      <mesh position-y={0.04} rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[PLAZA.r, 64]} /><meshPhysicalMaterial map={tex} roughness={0.42} clearcoat={0.55} clearcoatRoughness={0.25} /></mesh>
      <mesh position-y={0.07} material={vinyl('#7fe8ff')}><cylinderGeometry args={[2.4, 2.4, 0.1, 40]} /></mesh>
      <mesh position-y={0.12} rotation-x={Math.PI / 2} material={vinyl('#ffffff')}><torusGeometry args={[2.45, 0.1, 8, 40]} /></mesh>
      <group ref={star} position-y={2.1}>
        <mesh material={glossy('#ffe066')}><octahedronGeometry args={[0.55, 0]} /></mesh>
        <mesh rotation-x={Math.PI / 2} material={glossy('#ff7eb6')}><torusGeometry args={[0.9, 0.07, 8, 28]} /></mesh>
        <pointLight intensity={0.55} distance={4} color="#ffe066" />
      </group>
    </group>
  );
}
