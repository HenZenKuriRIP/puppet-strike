/** M6 interactive toys: spring pads, shootable balloons, health/ammo candy pickups, moving block covers (all driven by sim state). */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { world } from '../core/world';
import { MOVERS, SPRING_PADS, moverPos } from './arenaLayout';
import { candyGeometry } from '../effects/candyGeo';
import { vinyl, glossy } from '../entities/materials';
import { POOLS } from '../../config/game';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
const HP_COL = '#ff6b8b', AMMO_COL = '#ffd36b';

function Balloons() {
  const body = useRef<THREE.InstancedMesh>(null!), knot = useRef<THREE.InstancedMesh>(null!), str = useRef<THREE.InstancedMesh>(null!);
  const n = world.balloons.length;
  useFrame((st) => {
    const t = st.clock.elapsedTime; let k = 0;
    for (let i = 0; i < n; i++) {
      const b = world.balloons[i]; if (!b.alive) continue;
      const y = b.y + Math.sin(t * 1.4 + i * 1.9) * 0.18, x = b.x + Math.sin(t * 0.7 + i) * 0.12;
      body.current.setMatrixAt(k, M.compose(P.set(x, y, b.z), Q.identity(), S.set(0.85, 1.0, 0.85))); body.current.setColorAt(k, C.set(b.kind === 'hp' ? HP_COL : AMMO_COL));
      knot.current.setMatrixAt(k, M.compose(P.set(x, y - 0.98, b.z), Q.set(1, 0, 0, 0), S.set(1, 1, 1))); knot.current.setColorAt(k, C.set(b.kind === 'hp' ? HP_COL : AMMO_COL));
      str.current.setMatrixAt(k, M.compose(P.set(x, y - 2.3, b.z), Q.identity(), S.set(1, 2.6, 1)));
      k++;
    }
    for (const m of [body.current, knot.current, str.current]) { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  return <>
    <instancedMesh ref={body} args={[undefined, undefined, n]} castShadow frustumCulled={false}><sphereGeometry args={[0.95, 18, 14]} /><meshPhysicalMaterial roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} emissive="#ffffff" emissiveIntensity={0.12} /></instancedMesh>
    <instancedMesh ref={knot} args={[undefined, undefined, n]} frustumCulled={false}><coneGeometry args={[0.16, 0.26, 8]} /><meshStandardMaterial roughness={0.4} /></instancedMesh>
    <instancedMesh ref={str} args={[undefined, undefined, n]} frustumCulled={false}><cylinderGeometry args={[0.012, 0.012, 1, 4]} /><meshBasicMaterial color="#ffffff" /></instancedMesh>
  </>;
}

function Pickups() {
  const heart = useRef<THREE.InstancedMesh>(null!), cand = useRef<THREE.InstancedMesh>(null!), ring = useRef<THREE.InstancedMesh>(null!), beam = useRef<THREE.InstancedMesh>(null!);
  const gH = useMemo(() => candyGeometry('heart', true), []), gW = useMemo(() => candyGeometry('wrapped', true), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: '#555555', emissiveIntensity: 0.7 }), []);
  useFrame((st) => {
    const t = st.clock.elapsedTime; let h = 0, a = 0, r = 0;
    for (const p of world.pickups.items) {
      if (!p.active) continue;
      if (p.spot < 0 && p.life < 3 && Math.sin(t * 20) > 0.4) continue; // blink out near expiry
      const bob = Math.sin(t * 3 + p.age * 2) * 0.12, pop = Math.min(1, p.age * 5), s = 0.4 * (0.4 + 0.6 * pop);
      if (p.kind === 'hp') { heart.current.setMatrixAt(h, M.compose(P.set(p.pos.x, p.pos.y + bob, p.pos.z), Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 2.4), S.set(s, s, s))); heart.current.setColorAt(h, C.set(HP_COL)); h++; }
      else { cand.current.setMatrixAt(a, M.compose(P.set(p.pos.x, p.pos.y + bob, p.pos.z), Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 2.4).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)), S.set(s, s, s))); cand.current.setColorAt(a, C.set(AMMO_COL)); a++; }
      ring.current.setMatrixAt(r, M.compose(P.set(p.pos.x, p.pos.y - 0.45, p.pos.z), Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), S.setScalar(0.85 + Math.sin(t * 4 + p.age) * 0.08))); ring.current.setColorAt(r, C.set(p.kind === 'hp' ? '#ff9ec7' : '#ffe27a')); r++;
      beam.current.setMatrixAt(r - 1, M.compose(P.set(p.pos.x, p.pos.y + 1.0, p.pos.z), Q.identity(), S.set(1 + Math.sin(t * 5 + p.age) * 0.15, 1, 1))); beam.current.setColorAt(r - 1, C.set(p.kind === 'hp' ? '#ff9ec7' : '#ffe38a'));
    }
    for (const [m, k] of [[heart.current, h], [cand.current, a], [ring.current, r], [beam.current, r]] as const) { m.count = k; m.visible = k > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  return <>
    <instancedMesh ref={heart} args={[gH, mat, POOLS.pickups]} frustumCulled={false} visible={false} />
    <instancedMesh ref={cand} args={[gW, mat, POOLS.pickups]} frustumCulled={false} visible={false} />
    <instancedMesh ref={ring} args={[undefined, undefined, POOLS.pickups]} frustumCulled={false} visible={false}><torusGeometry args={[1, 0.06, 6, 24]} /><meshBasicMaterial toneMapped={false} transparent opacity={0.8} /></instancedMesh>
    <instancedMesh ref={beam} args={[undefined, undefined, POOLS.pickups]} frustumCulled={false} visible={false}><cylinderGeometry args={[0.16, 0.3, 2.4, 10, 1, true]} /><meshBasicMaterial toneMapped={false} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} /></instancedMesh>
  </>;
}

function Movers() {
  const geo = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, 0.12), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => { MOVERS.forEach((m, i) => { const r = refs.current[i]; if (!r) return; const [x, z] = moverPos(m, world.time); r.position.set(x, m.size[1] / 2, z); }); });
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return <>{MOVERS.map((m, i) => (
    <group key={i}>
      <mesh ref={(r) => (refs.current[i] = r)} geometry={geo} scale={m.size} castShadow receiveShadow><meshPhysicalMaterial color={m.color} roughness={0.35} clearcoat={0.7} /></mesh>
    </group>))}</>;
}

function Pads() {
  const rings = useRef<(THREE.Group | null)[]>([]);
  useFrame((st) => { rings.current.forEach((g, i) => { if (g) g.children[2].scale.y = 1 + Math.sin(st.clock.elapsedTime * 3 + i) * 0.12; }); });
  return <>{SPRING_PADS.map(([x, z], i) => (
    <group key={i} position={[x, 0, z]} ref={(g) => (rings.current[i] = g)}>
      <mesh position-y={0.1} material={vinyl('#ff7eb6')} receiveShadow><cylinderGeometry args={[1.45, 1.55, 0.2, 28]} /></mesh>
      <mesh position-y={0.22} rotation-x={Math.PI / 2} material={vinyl('#ffffff')}><torusGeometry args={[1.2, 0.07, 8, 28]} /></mesh>
      <mesh position-y={0.3} material={glossy('#ffe066')}><cylinderGeometry args={[1.0, 1.0, 0.18, 28]} /></mesh>
      <mesh position-y={0.42} rotation-x={Math.PI / 2} material={glossy('#7fe8ff')}><torusGeometry args={[0.5, 0.07, 8, 20]} /></mesh>
    </group>))}</>;
}

export function Toys() { return <><Balloons /><Pickups /><Movers /><Pads /></>; }
