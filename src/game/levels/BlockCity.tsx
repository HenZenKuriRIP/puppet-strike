// W2: Block City scenery. Everything is built from a handful of shared geometries / materials and drawn with instancing:
//   one rounded-box mesh for every brick layer, one cylinder mesh for every stud (draw calls stay flat, quality scales the decor count).
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { world } from '../core/world';
import { BLOCKS, STATIC_BOXES, SPAWN_POINTS } from './arenaLayout';
import { BRIDGES, RIVER, H, PLAZA, groundHeight, inRiver, onBridge } from './terrain';
import { MECH, MECH_CFG, carPose, liftTop, dominoAngle, dominoPos } from './mech';
import { BRICK_COLORS } from './blockLayout';
import { useInstances, Item } from './Decor';
import { vinyl } from '../entities/materials';

type V3t = [number, number, number];
const rand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const PRIM = [BRICK_COLORS.red, BRICK_COLORS.blue, BRICK_COLORS.yellow, BRICK_COLORS.green, BRICK_COLORS.orange, BRICK_COLORS.purple];
const STUD = { r: 0.22, h: 0.16, step: 0.8 };
const _c = new THREE.Color();
const shade = (c: string, d: number) => `#${_c.set(c).offsetHSL(0, 0, d).getHexString()}`;

/** stacked brick layers (alternating tint so the courses read as separate bricks) + studs on the top face */
export function brickStack(pos: V3t, size: V3t, color: string, layerH = 0.8, studs = true, out: { bricks: Item[]; studs: Item[] }, maxStuds = 120) {
  const [cx, cy, cz] = pos, [sx, sy, sz] = size, y0 = cy - sy / 2;
  const n = Math.max(1, Math.round(sy / layerH)), lh = sy / n;
  for (let i = 0; i < n; i++) out.bricks.push({ p: [cx, y0 + lh * (i + 0.5), cz], s: [sx - 0.02 * (i % 2), lh - 0.035, sz - 0.02 * (i % 2)], c: shade(color, i % 2 ? 0.035 : -0.015) });
  if (!studs) return;
  const nx = Math.max(1, Math.floor(sx / STUD.step)), nz = Math.max(1, Math.floor(sz / STUD.step));
  const stepx = sx / nx, stepz = sz / nz, skip = Math.max(1, Math.ceil((nx * nz) / maxStuds));
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (k++ % skip) continue; out.studs.push({ p: [cx - sx / 2 + stepx * (i + 0.5), y0 + sy + STUD.h / 2 - 0.02, cz - sz / 2 + stepz * (j + 0.5)], s: [1, 1, 1], c: shade(color, 0.02) }); }
}

function sceneryItems(density: number) {
  const out = { bricks: [] as Item[], studs: [] as Item[] };
  for (const b of BLOCKS) {
    if (b.kind === 'rail') { brickStack(b.pos, b.size, b.color, 0.45, true, out, 30); continue; }
    if (b.kind === 'wall') { brickStack(b.pos, b.size, b.color, 0.75, density >= 0.7, out, 60); continue; }
    const lh = b.kind === 'tower' ? 1.0 : b.kind === 'house' ? 0.8 : 0.7;
    brickStack(b.pos, b.size, b.color, lh, true, out);
  }
  // house trimmings: a lighter roof slab, door and windows (flat boxes, instanced with the same mesh)
  const hs = BLOCKS.filter((b) => b.kind === 'house');
  for (const h of hs) {
    const [x, y, z] = h.pos, [w, hh, d] = h.size;
    out.bricks.push({ p: [x, hh + 0.14, z], s: [w + 0.5, 0.28, d + 0.5], c: '#fdfdfd' });
    out.bricks.push({ p: [x, 0.55, z + d / 2 + 0.03], s: [0.8, 1.1, 0.08], c: '#6b3f1f' });
    for (const sx of [-1, 1]) out.bricks.push({ p: [x + sx * w * 0.3, hh * 0.62, z + d / 2 + 0.03], s: [0.6, 0.6, 0.08], c: '#a8dcff' });
    for (let i = 0; i < 6; i++) out.studs.push({ p: [x - w / 2 + (i % 3) * (w / 2) + 0.2 * 0, hh + 0.28 + STUD.h / 2 - 0.02, z - d / 2 + 0.6 + Math.floor(i / 3) * (d - 1.2)], s: [1, 1, 1], c: '#ffffff' });
    void y;
  }
  // bridge planks (brick plates)
  for (const br of BRIDGES) for (let i = 0; i < 9; i++) out.bricks.push({ p: [br.x, 0.07, RIVER.z - RIVER.half - 0.6 + i * ((RIVER.half * 2 + 1.2) / 8)], s: [br.half * 2, 0.16, 0.66], c: i % 2 ? '#ffd21f' : '#ff8a1f' });
  // plaza mosaic: 4 primary plates + a stud ring
  const q: [number, number, string][] = [[-1, -1, BRICK_COLORS.red], [1, -1, BRICK_COLORS.blue], [-1, 1, BRICK_COLORS.yellow], [1, 1, BRICK_COLORS.green]];
  for (const [sx, sz, c] of q) {
    out.bricks.push({ p: [sx * 4.4, 0.04, sz * 4.4], s: [7.6, 0.08, 7.6], c });
    if (density >= 0.35) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.studs.push({ p: [sx * 4.4 - 2.85 + i * 1.9, 0.08 + STUD.h / 2 - 0.02, sz * 4.4 - 2.85 + j * 1.9], s: [1, 1, 1], c });
  }
  // enemy spawn pads
  for (const [x, z] of SPAWN_POINTS) { out.bricks.push({ p: [x, 0.05, z], s: [3.6, 0.1, 3.6], c: '#444b55' }); out.bricks.push({ p: [x, 0.11, z], s: [2.2, 0.06, 2.2], c: '#ff8a1f' }); }
  return out;
}

/** far skyline: tall layered towers outside the wall, trees, clouds */
function skylineItems(density: number) {
  const out = { bricks: [] as Item[], studs: [] as Item[] };
  const r = rand(77), n = Math.round(46 * Math.max(0.35, density));
  let k = 0;
  while (k < n) {
    const a = r() * Math.PI * 2, d = 56 + r() * 52, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < H + 6 && Math.abs(z) < H + 6) continue;
    const h = 9 + r() * 34, w = 5 + r() * 5, dd = 5 + r() * 5, c = PRIM[k % PRIM.length]; k++;
    brickStack([x, h / 2, z], [w, h, dd], c, 2.2, true, out, 20);
    if (r() > 0.55) { const h2 = h * (0.4 + r() * 0.3); brickStack([x + w * 0.9, h2 / 2, z + dd * 0.3], [w * 0.7, h2, dd * 0.7], PRIM[(k + 2) % PRIM.length], 2.2, true, out, 12); }
  }
  // brick trees just outside the wall
  const tn = Math.round(40 * Math.max(0.35, density));
  for (let i = 0; i < tn; i++) {
    const side = i % 4, t = (r() - 0.5) * (H * 2 + 8), o = H + 3 + r() * 9;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? -o : o, z = side === 0 ? -o : side === 1 ? o : t;
    const s = 0.8 + r() * 0.7;
    out.bricks.push({ p: [x, 0.9 * s, z], s: [0.7 * s, 1.8 * s, 0.7 * s], c: '#8a5a2b' });
    out.bricks.push({ p: [x, 2.3 * s, z], s: [2.2 * s, 1.5 * s, 2.2 * s], c: '#2fb344' });
    out.bricks.push({ p: [x, 3.5 * s, z], s: [1.5 * s, 1.1 * s, 1.5 * s], c: '#3cc455' });
    for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) out.studs.push({ p: [x + ox * s, 4.05 * s + 0.06, z + oz * s], s: [1, 1, 1], c: '#3cc455' });
  }
  return out;
}

function baseplateGeo() {
  const seg = 120, g = new THREE.PlaneGeometry(H * 2, H * 2, seg, seg); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundHeight(x, z); pos.setY(i, h);
    if (h > 0.03) c.set('#ff8a1f'); else if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) c.set('#d8d2c2'); else c.set('#37a752');
    if (h <= 0.03) c.offsetHSL(0, 0, Math.sin(Math.floor(x / 2) * 12.9 + Math.floor(z / 2) * 78.2) * 0.012);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}

/** baseplate studs everywhere that is flat green ground and not covered by a block / street / canal */
const ROADS_NS = [-12, 12], ROAD_W = 6, ROADS_EW = [-24, 24];
const onRoad = (x: number, z: number, m = 0.2) => ROADS_NS.some((rx) => Math.abs(x - rx) < ROAD_W / 2 + m) || (ROADS_EW.some((rz) => Math.abs(z - rz) < ROAD_W / 2 + m) && Math.abs(x) < 12);
function baseStuds(density: number): Item[] {
  const out: Item[] = [], step = density >= 0.9 ? 1.6 : density >= 0.5 ? 2.2 : 3.2;
  for (let x = -H + 1.2; x < H - 0.5; x += step) for (let z = -H + 1.2; z < H - 0.5; z += step) {
    if (groundHeight(x, z) > 0.03 || inRiver(x, z) || onBridge(x, z) || Math.abs(z - RIVER.z) < RIVER.half + 1 || Math.hypot(x, z) < PLAZA.r + 0.4 || onRoad(x, z)) continue;
    if (STATIC_BOXES.some((b) => x > b.min.x - 0.5 && x < b.max.x + 0.5 && z > b.min.z - 0.5 && z < b.max.z + 0.5 && b.min.y < 1)) continue;
    out.push({ p: [x, STUD.h / 2 - 0.02, z], s: [1, 1, 1], c: '#43b85f' });
  }
  return out;
}

function roadItems(): { road: Item[]; dash: Item[]; track: Item[] } {
  const road: Item[] = [], dash: Item[] = [], track: Item[] = [];
  for (const x of ROADS_NS) { road.push({ p: [x, 0.02, 0], s: [ROAD_W, 0.04, H * 2 - 1], c: '#5b6270' }); for (let z = -H + 3; z < H - 2; z += 3) if (Math.abs(z - RIVER.z) > 4) dash.push({ p: [x, 0.05, z], s: [0.18, 0.02, 1.4], c: '#ffffff' }); }
  for (const z of ROADS_EW) { road.push({ p: [0, 0.021, z], s: [24, 0.04, ROAD_W], c: '#5b6270' }); for (let x = -10; x <= 10; x += 3) dash.push({ p: [x, 0.05, z], s: [1.4, 0.02, 0.18], c: '#ffffff' }); }
  // sidewalk kerbs for the canal
  for (const s of [-1, 1]) road.push({ p: [0, 0.05, RIVER.z + s * (RIVER.half + 0.45)], s: [H * 2 - 1, 0.1, 0.9], c: '#d8d2c2' });
  // toy train track: ties + two rails along the closed path
  const tr = MECH.def.train; if (tr) {
    const P = tr.path;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, ry = Math.atan2(dx, dz);
      for (let s = 0; s < len; s += 0.9) track.push({ p: [a[0] + dx * (s + 0.45), 0.06, a[1] + dz * (s + 0.45)], s: [2.3, 0.1, 0.32], r: [0, ry, 0], c: '#7a4b22' });
      for (const o of [-0.8, 0.8]) track.push({ p: [(a[0] + b[0]) / 2 - dz * o, 0.14, (a[1] + b[1]) / 2 + dx * o], s: [Math.abs(dx) > 0.5 ? len + 0.3 : 0.14, 0.1, Math.abs(dz) > 0.5 ? len + 0.3 : 0.14], c: '#b9c0cc' });
    }
  }
  return { road, dash, track };
}

function blockCloudGeo() {
  const out: THREE.BufferGeometry[] = [], r = rand(5);
  for (let i = 0; i < 9; i++) {
    const cx = (r() - 0.5) * 220, cz = (r() - 0.5) * 220, cy = 34 + r() * 14;
    for (let j = 0; j < 4; j++) out.push(new THREE.BoxGeometry(6 + r() * 4, 2.2, 4 + r() * 3).translate(cx + (j - 1.5) * 4, cy + (j % 2) * 1.1, cz + (r() - 0.5) * 3));
  }
  return out;
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();

export function BlockCity({ density = 1 }: { density?: number }) {
  const rbox = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.07), []);
  const stud = useMemo(() => new THREE.CylinderGeometry(STUD.r, STUD.r, STUD.h, 10), []);
  const brickMat = useMemo(() => new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 0.75, clearcoatRoughness: 0.2 }), []);
  const studMat = useMemo(() => new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }), []);
  const scene = useMemo(() => sceneryItems(density), [density]);
  const sky = useMemo(() => skylineItems(density), [density]);
  const base = useMemo(() => baseStuds(density), [density]);
  const rd = useMemo(roadItems, []);
  const tGeo = useMemo(baseplateGeo, []);
  const cloudParts = useMemo(blockCloudGeo, []);
  const bricks = useMemo(() => [...scene.bricks, ...rd.road, ...rd.track], [scene, rd]);
  const studs = useMemo(() => [...scene.studs, ...base], [scene, base]);
  const refs = { b: useRef<THREE.InstancedMesh>(null), s: useRef<THREE.InstancedMesh>(null), sb: useRef<THREE.InstancedMesh>(null), ss: useRef<THREE.InstancedMesh>(null), dash: useRef<THREE.InstancedMesh>(null) };
  useInstances(refs.b, bricks); useInstances(refs.s, studs); useInstances(refs.sb, sky.bricks); useInstances(refs.ss, sky.studs); useInstances(refs.dash, rd.dash);
  const cloudMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25, fog: false }), []);
  const waterMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#2f9bff', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.88 }), []);
  useFrame((s) => { waterMat.emissive.setHSL(0.58, 0.8, 0.12 + Math.sin(s.clock.elapsedTime * 1.6) * 0.03); });
  useLayoutEffect(() => () => { rbox.dispose(); stud.dispose(); tGeo.dispose(); brickMat.dispose(); studMat.dispose(); cloudMat.dispose(); waterMat.dispose(); }, [rbox, stud, tGeo, brickMat, studMat, cloudMat, waterMat]);
  const w = RIVER.half * 2;
  return (
    <group>
      <mesh geometry={tGeo} receiveShadow><meshStandardMaterial vertexColors roughness={0.85} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05}><planeGeometry args={[500, 500]} /><meshStandardMaterial color="#3fae5a" roughness={1} /></mesh>
      <instancedMesh ref={refs.b} args={[rbox, brickMat, bricks.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.s} args={[stud, studMat, studs.length]} castShadow={density >= 1} receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.dash} args={[rbox, vinyl('#ffffff'), rd.dash.length]} frustumCulled={false} />
      <instancedMesh ref={refs.sb} args={[rbox, brickMat, sky.bricks.length]} castShadow={false} frustumCulled={false} />
      <instancedMesh ref={refs.ss} args={[stud, studMat, sky.studs.length]} frustumCulled={false} />
      <mesh position={[0, 0.03, RIVER.z]} rotation-x={-Math.PI / 2} material={waterMat}><planeGeometry args={[H * 2, w]} /></mesh>
      <group>{cloudParts.map((g, i) => <mesh key={i} geometry={g} material={cloudMat} />)}</group>
      <BlockMech density={density} rbox={rbox} stud={stud} />
    </group>
  );
}

// ------------------------------------------------------------------ dynamic mechanics
function BlockMech({ rbox, stud }: { density: number; rbox: THREE.BufferGeometry; stud: THREE.BufferGeometry }) {
  const mech = MECH;
  const mats = useMemo(() => ({
    brick: new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    stud: new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.7 }),
    belt: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    white: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: '#c8ced8', roughness: 0.35, metalness: 0.6 }),
  }), []);
  const nB = MECH_CFG.maxBricks, bRef = useRef<THREE.InstancedMesh>(null!), bsRef = useRef<THREE.InstancedMesh>(null!);
  const carRefs = useRef<(THREE.Group | null)[]>([]);
  const liftRefs = useRef<(THREE.Group | null)[]>([]);
  const domRefs = useRef<(THREE.InstancedMesh | null)[]>([]), domStripe = useRef<(THREE.InstancedMesh | null)[]>([]);
  const portalRefs = useRef<(THREE.Group | null)[]>([]);
  const fanRefs = useRef<(THREE.Group | null)[]>([]), wind = useRef<(THREE.Group | null)[]>([]);
  const beltTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d')!;
    g.fillStyle = '#3b4250'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#ffd21f'; g.lineWidth = 9; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(34, 8); g.lineTo(78, 32); g.lineTo(34, 56); g.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  const swirl = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64); grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let a = 0; a < 9; a += 0.1) { const rr = 6 + a * 6.2, th = a + k * 2.1; g.lineTo(64 + Math.cos(th) * rr, 64 + Math.sin(th) * rr); } g.stroke(); }
    return new THREE.CanvasTexture(c);
  }, []);
  const maxStuds = nB * 8;
  useLayoutEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); beltTex.dispose(); swirl.dispose(); }, [mats, beltTex, swirl]);

  useFrame((st, dt) => {
    const t = world.time + (world.coop.client ? 0 : Math.min(1, world.alpha) / 60), el = st.clock.elapsedTime;
    // bricks
    let k = 0, ks = 0;
    for (const b of mech.bricks) {
      if (!b.alive) continue;
      const sh = b.shake > 0 ? Math.sin(el * 70) * b.shake * 0.12 : 0;
      b.shake = Math.max(0, b.shake - dt);
      const dmg = 1 - b.hp / b.maxHp, s = 1 - dmg * 0.04;
      bRef.current.setMatrixAt(k, M.compose(V.set(b.x + sh, b.sy / 2, b.z), Q.identity(), S.set(b.sx * s, b.sy, b.sz * s)));
      bRef.current.setColorAt(k, C.set(b.color).offsetHSL(0, 0, -dmg * 0.12)); k++;
      const nx = Math.max(1, Math.floor(b.sx / 0.8)), nz = Math.max(1, Math.floor(b.sz / 0.8));
      for (let i = 0; i < nx && ks < maxStuds; i++) for (let j = 0; j < nz && ks < maxStuds; j++) {
        bsRef.current.setMatrixAt(ks, M.compose(V.set(b.x + sh - b.sx / 2 + (b.sx / nx) * (i + 0.5), b.sy + 0.07, b.z - b.sz / 2 + (b.sz / nz) * (j + 0.5)), Q.identity(), S.set(1, 1, 1)));
        bsRef.current.setColorAt(ks, C.set(b.color)); ks++;
      }
    }
    bRef.current.count = k; bsRef.current.count = ks;
    bRef.current.instanceMatrix.needsUpdate = true; bsRef.current.instanceMatrix.needsUpdate = true;
    if (bRef.current.instanceColor) bRef.current.instanceColor.needsUpdate = true; if (bsRef.current.instanceColor) bsRef.current.instanceColor.needsUpdate = true;
    // train
    const tr = mech.train;
    if (tr) for (let i = 0; i < tr.def.cars; i++) { const g = carRefs.current[i]; if (!g) continue; const p = carPose(tr.def, tr, i, t); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(p.dx, p.dz); }
    // lifts
    mech.lifts.forEach((l, i) => { const g = liftRefs.current[i]; if (!g) return; const top = liftTop(l.def, t); g.scale.y = Math.max(0.05, top); g.position.y = 0; const studs = g.userData.studs as THREE.Object3D | undefined; if (studs) { studs.position.y = 1; } });
    // dominoes
    mech.chains.forEach((ch, ci) => {
      const m = domRefs.current[ci], sm = domStripe.current[ci]; if (!m || !sm) return; const d = ch.def;
      for (let i = 0; i < d.count; i++) {
        const th = dominoAngle(ch.trig[i], t), [x, z] = dominoPos(d, i), hs = d.h / 2;
        const rot = d.axis === 'x' ? E.set(0, 0, -d.sign * th) : E.set(d.sign * th, 0, 0); Q.setFromEuler(rot);
        const cx = x + (d.axis === 'x' ? d.sign * Math.sin(th) * hs : 0), cz = z + (d.axis === 'z' ? d.sign * Math.sin(th) * hs : 0), cy = Math.cos(th) * hs + Math.sin(th) * d.thick / 2;
        const sx = d.axis === 'x' ? d.thick : d.w, sz = d.axis === 'x' ? d.w : d.thick;
        m.setMatrixAt(i, M.compose(V.set(cx, cy, cz), Q, S.set(sx, d.h, sz)));
        sm.setMatrixAt(i, M.compose(V.set(cx, cy, cz), Q, S.set(d.axis === 'x' ? d.thick * 1.08 : d.w * 1.02, d.h * 0.14, d.axis === 'x' ? d.w * 1.02 : d.thick * 1.08)));
      }
      m.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true;
    });
    // portals
    portalRefs.current.forEach((g, i) => { if (!g) return; g.rotation.y = el * (i % 2 ? -1.6 : 1.6); const inner = g.children[0]; if (inner) inner.scale.setScalar(1 + Math.sin(el * 3 + i) * 0.05); });
    // belts
    beltTex.offset.x -= dt * (mech.def.conveyors[0]?.speed ?? 3) / 3.2 * 0.6;
    // fans
    fanRefs.current.forEach((g, i) => { if (g) g.children[0].rotation.z += dt * 14; const w = wind.current[i]; if (w) w.children.forEach((c, j) => { const f = mech.def.fans[i]; const u = (el * 0.9 + j / w.children.length) % 1; c.position.z = 0.5 + u * f.len * 0.9; (c as THREE.Mesh).scale.z = 1; }); });
  });

  return (
    <group>
      <instancedMesh ref={bRef} args={[rbox, mats.brick, nB]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={bsRef} args={[stud, mats.stud, maxStuds]} frustumCulled={false} />
      {/* train cars: body, cab, studs, wheels */}
      {mech.train && Array.from({ length: mech.train.def.cars }, (_, i) => { const d = mech.train!.def, col = d.colors[i % d.colors.length]; return (
        <group key={i} ref={(g) => { carRefs.current[i] = g; }}>
          <mesh geometry={rbox} position={[0, d.h * 0.42 + 0.12, 0]} scale={[d.w, d.h * 0.7, d.carLen]} castShadow material={vinyl(col)} />
          <mesh geometry={rbox} position={[0, 0.2, 0]} scale={[d.w * 0.95, 0.26, d.carLen * 1.02]} material={mats.dark} />
          {[-1, 1].map((sx) => [-1, 0, 1].map((sz) => <mesh key={`${sx}${sz}`} position={[sx * d.w * 0.5, 0.2, sz * d.carLen * 0.34]} rotation-z={Math.PI / 2} material={mats.dark}><cylinderGeometry args={[0.22, 0.22, 0.14, 12]} /></mesh>))}
          {[-0.6, 0.6].map((sx) => [-1.1, 0, 1.1].filter((_, j) => i === 0 ? j !== 2 : true).map((sz) => <mesh key={`s${sx}${sz}`} geometry={stud} position={[sx * d.w * 0.3, d.h * 0.77 + 0.2, sz * 0.9]} material={vinyl(col)} />))}
          {i === 0 && <>
            <mesh geometry={rbox} position={[0, d.h * 0.95 + 0.25, -d.carLen * 0.18]} scale={[d.w * 0.85, d.h * 0.45, d.carLen * 0.4]} material={vinyl('#f4f4f4')} castShadow />
            <mesh position={[0, d.h * 0.72 + 0.4, d.carLen * 0.3]} material={mats.dark}><cylinderGeometry args={[0.28, 0.34, 0.6, 10]} /></mesh>
          </>}
        </group>); })}
      {/* lifts: a coloured brick column whose height follows the shared clock */}
      {mech.lifts.map((l, i) => (
        <group key={i} ref={(g) => { liftRefs.current[i] = g; }} position={[l.def.x, 0, l.def.z]}>
          <mesh geometry={rbox} position={[0, 0.5, 0]} scale={[l.def.sx, 1, l.def.sz]} material={vinyl(l.def.color)} castShadow />
        </group>
      ))}
      {mech.lifts.map((l, i) => <LiftCap key={`c${i}`} l={l} rbox={rbox} stud={stud} />)}
      {/* dominoes */}
      {mech.chains.map((ch, ci) => (<group key={ci}>
        <instancedMesh ref={(m) => { domRefs.current[ci] = m; }} args={[rbox, vinyl(ch.def.color), ch.def.count]} castShadow frustumCulled={false} />
        <instancedMesh ref={(m) => { domStripe.current[ci] = m; }} args={[rbox, mats.white, ch.def.count]} frustumCulled={false} />
      </group>))}
      {/* portals: glowing ground discs + light beams */}
      {mech.def.portals.flatMap((p, pi) => [p.a, p.b].map((pt, e) => { const idx = pi * 2 + e; return (
        <group key={idx} position={[pt[0], 0.07, pt[1]]}>
          <group ref={(g) => { portalRefs.current[idx] = g; }}>
            <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[MECH_CFG.portal.r * 1.15, 32]} /><meshBasicMaterial map={swirl} color={p.color} transparent opacity={0.95} depthWrite={false} toneMapped={false} /></mesh>
          </group>
          <mesh rotation-x={Math.PI / 2} position-y={0.04}><torusGeometry args={[MECH_CFG.portal.r * 1.2, 0.12, 8, 32]} /><meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={1.4} toneMapped={false} /></mesh>
          <mesh position-y={2.1}><cylinderGeometry args={[MECH_CFG.portal.r * 1.05, MECH_CFG.portal.r * 1.15, 4.2, 20, 1, true]} /><meshBasicMaterial color={p.color} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
        </group>); }))}
      {/* conveyor belts */}
      {mech.def.conveyors.map((c, i) => (
        <group key={i} position={[c.x, 0.09, c.z]} rotation-y={Math.atan2(-c.dz, c.dx)}>
          <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[c.sx, c.sz]} /><meshStandardMaterial map={beltTex} roughness={0.8} /></mesh>
          {[-1, 1].map((s) => <mesh key={s} geometry={rbox} position={[0, 0.1, s * (c.sz / 2 + 0.12)]} scale={[c.sx + 0.4, 0.28, 0.25]} material={vinyl('#ff8a1f')} />)}
          {[-1, 1].map((s) => <mesh key={`r${s}`} position={[s * c.sx / 2, 0.08, 0]} rotation-x={Math.PI / 2} material={mats.metal}><cylinderGeometry args={[0.2, 0.2, c.sz, 12]} /></mesh>)}
        </group>
      ))}
      {/* fans */}
      {mech.def.fans.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} rotation-y={Math.atan2(Math.cos(f.ang), Math.sin(f.ang))}>
          <mesh position={[0, 0.6, 0]} material={mats.dark}><cylinderGeometry args={[0.2, 0.3, 1.2, 10]} /></mesh>
          <mesh geometry={rbox} position={[0, 0.2, 0]} scale={[1.6, 0.4, 1.6]} material={vinyl('#1e6fe8')} />
          <group ref={(g) => { fanRefs.current[i] = g; }} position={[0, 1.7, 0.1]}>
            <group>
              {[0, 1, 2].map((b) => <mesh key={b} rotation-z={(b * Math.PI * 2) / 3} position={[0, 0, 0]}><boxGeometry args={[0.28, 1.5, 0.06]} /><meshStandardMaterial color={['#e53935', '#ffd21f', '#2fb344'][b]} /></mesh>)}
              <mesh rotation-x={Math.PI / 2} material={mats.metal}><cylinderGeometry args={[0.18, 0.18, 0.3, 10]} /></mesh>
            </group>
            <mesh material={mats.metal}><torusGeometry args={[1.6, 0.07, 6, 28]} /></mesh>
          </group>
          <group ref={(g) => { wind.current[i] = g; }} position={[0, 1.7, 0.1]}>
            {Array.from({ length: 7 }, (_, j) => <mesh key={j} position={[((j % 3) - 1) * 0.7, ((j * 7) % 3 - 1) * 0.5, 1]}><boxGeometry args={[0.05, 0.05, 1.3]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} /></mesh>)}
          </group>
        </group>
      ))}
    </group>
  );
}

function LiftCap({ l, rbox, stud }: { l: { def: import('./mech').LiftDef }; rbox: THREE.BufferGeometry; stud: THREE.BufferGeometry }) {
  const g = useRef<THREE.Group>(null!);
  const d = l.def, nx = Math.floor(d.sx / 0.9), nz = Math.floor(d.sz / 0.9);
  useFrame(() => { const t = world.time + (world.coop.client ? 0 : Math.min(1, world.alpha) / 60); g.current.position.y = liftTop(d, t); });
  return (
    <group ref={g} position={[d.x, 0, d.z]}>
      <mesh geometry={rbox} position={[0, -0.09, 0]} scale={[d.sx + 0.1, 0.18, d.sz + 0.1]} material={vinyl('#ffffff')} castShadow />
      {Array.from({ length: nx * nz }, (_, k) => <mesh key={k} geometry={stud} position={[-d.sx / 2 + (d.sx / nx) * ((k % nx) + 0.5), 0.06, -d.sz / 2 + (d.sz / nz) * (Math.floor(k / nx) + 0.5)]} material={vinyl(d.color)} />)}
    </group>
  );
}
