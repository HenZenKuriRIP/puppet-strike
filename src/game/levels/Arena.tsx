import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BLOCKS, HOUSES, STATIC_BOXES } from './arenaLayout';
import { Decor, Item, useInstances, gateItems } from './Decor';
import { Toys } from './Toys';
import { BRIDGES, RIVER, H, groundHeight, zoneAt } from './terrain';

const CLOUDS = [[-50, 22, -70], [45, 26, -75], [0, 30, 80], [-80, 24, 10], [80, 22, 5], [-60, 28, 60], [65, 25, 55], [20, 30, -90]];
function cloudGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of CLOUDS) [0, 1.8, -1.6, 0.6].forEach((o, j) => parts.push(new THREE.SphereGeometry(3.2 - j * 0.4, 16, 12).translate(x + o * 2, y + (j % 2) * 1, z)));
  const g = mergeGeometries(parts)!; parts.forEach((p) => p.dispose()); return g;
}

function checkerTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#ffe4ef' : '#fff6fa'; g.fillRect(x * 32, y * 32, 32, 32); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(H * 2 / 3.5, H * 2 / 3.5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const ZONE_COL: Record<string, string> = { grass: '#ffffff', plaza: '#fffbe8', hills: '#ffc4e0', forest: '#d4ffe0', village: '#f6dcc0', river: '#c99a73', bridge: '#f0c89a' };
/** heightfield mesh with per-vertex zone tint (cotton-candy hills, ramps and plateaus come from groundHeight) */
function terrainGeo() {
  const seg = 144, g = new THREE.PlaneGeometry(H * 2, H * 2, seg, seg); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z));
    const z0 = zoneAt(x, z); const rnd = Math.sin(x * 0.7) * Math.cos(z * 0.9) * 0.04;
    c.set(ZONE_COL[z0] ?? '#ffffff'); c.offsetHSL(0, 0, rnd); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}

/** every solid block, bridge plank and gate post as ONE instanced rounded box (draw calls stay flat as the map grows) */
function boxItems(): { solid: Item[]; icing: Item[] } {
  const solid: Item[] = [], icing: Item[] = [];
  for (const b of BLOCKS) {
    if (b.kind === 'stick' || b.kind === 'cane' || b.kind === 'fountain') continue;
    solid.push({ p: b.pos, s: b.size, c: b.color });
    if (b.kind === 'block') {
      // frosting cap (slightly wider rounded slab) + a few sprinkles on every candy cover
      const top = b.pos[1] + b.size[1] / 2, k = Math.abs(Math.round(b.pos[0] * 7 + b.pos[2] * 13));
      icing.push({ p: [b.pos[0], top - 0.03, b.pos[2]], s: [b.size[0] * 1.03, 0.2, b.size[2] * 1.03], c: ['#fff4f8', '#ffe0ee', '#f4ffe9', '#fff6d8'][k % 4] });
      for (let i = 0; i < 5; i++) {
        const u = ((k * 31 + i * 57) % 97) / 97 - 0.5, v = ((k * 17 + i * 89) % 89) / 89 - 0.5;
        icing.push({ p: [b.pos[0] + u * b.size[0] * 0.8, top + 0.085, b.pos[2] + v * b.size[2] * 0.8], s: [0.22, 0.05, 0.07], r: [0, (i + k) * 1.3, 0], c: ['#ff4d6d', '#2ec4b6', '#ffd166', '#6a5acd', '#ff8c42'][(i + k) % 5] });
      }
    }
  }
  for (const br of BRIDGES) for (let i = 0; i < 9; i++) solid.push({ p: [br.x, 0.07, RIVER.z - RIVER.half - 0.6 + i * ((RIVER.half * 2 + 1.2) / 8)], s: [br.half * 2, 0.14, 0.62], c: i % 2 ? '#f3d2a6' : '#d9a066' });
  for (const h of HOUSES) solid.push({ p: [h.x, 0.1, h.z], s: [h.w + 0.5, 0.2, h.d + 0.5], c: '#fff3e6' });
  return { solid, icing };
}

export function Arena({ density = 1 }: { density?: number }) {
  const ground = useMemo(checkerTex, []);
  const tGeo = useMemo(terrainGeo, []);
  const clouds = useMemo(cloudGeo, []);
  const rbox = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, 0.12), []);
  const { solid, icing } = useMemo(boxItems, []);
  const gates = useMemo(gateItems, []);
  const solidRef = useRef<THREE.InstancedMesh>(null), icingRef = useRef<THREE.InstancedMesh>(null);
  useInstances(solidRef, solid); useInstances(icingRef, icing);
  useLayoutEffect(() => () => { rbox.dispose(); tGeo.dispose(); clouds.dispose(); }, [rbox, tGeo, clouds]);
  void gates;
  return (
    <group>
      {/* static colliders only: boxes (walls, covers, houses, rails, sticks). Terrain + movers are analytic (see world.raycast) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[90, 0.5, 90]} position={[0, -0.5, 0]} />
        {STATIC_BOXES.map((b, i) => <CuboidCollider key={i} args={[(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2]} position={[(b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2]} />)}
      </RigidBody>
      <mesh geometry={tGeo} receiveShadow><meshPhysicalMaterial map={ground} vertexColors roughness={0.72} clearcoat={0.25} clearcoatRoughness={0.4} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.04}><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#b8f0d8" roughness={0.95} /></mesh>
      <instancedMesh ref={solidRef} args={[rbox, undefined, solid.length]} castShadow receiveShadow frustumCulled={false}>
        <meshPhysicalMaterial roughness={0.28} clearcoat={0.75} clearcoatRoughness={0.18} />
      </instancedMesh>
      <instancedMesh ref={icingRef} args={[rbox, undefined, icing.length]} castShadow frustumCulled={false}>
        <meshPhysicalMaterial roughness={0.22} clearcoat={1} clearcoatRoughness={0.1} sheen={0.7} sheenColor="#ffffff" sheenRoughness={0.4} />
      </instancedMesh>
      <Decor density={density} />
      <Toys />
      <mesh geometry={clouds}><meshStandardMaterial color="#ffffff" emissive="#fff8ff" emissiveIntensity={0.22} fog={false} roughness={1} /></mesh>
    </group>
  );
}
