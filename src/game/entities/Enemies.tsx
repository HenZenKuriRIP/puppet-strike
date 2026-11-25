import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../core/world';
import { ENEMIES, ENEMY_ORDER, EnemyType, FX, POOLS } from '../../config/game';
import { bevelBox, roundCyl, lathe, gumdropGeo, mergedGeo } from './geo';
import { makeBrickMats, BRICK_FLASHABLE, BSoldier, BTurret, BGolem, BCrane, brickPose } from './BrickEnemies';

const lerp = THREE.MathUtils.lerp;
type Mats = ReturnType<typeof makeMats>;
function makeMats() {
  const s = (color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), ...o });
  return {
    ...makeBrickMats(),
    red: s('#ff8a9a'), blue: s('#7eb6ff'), skin: s('#ffe3cc', { roughness: 0.6 }), gold: s('#ffd36b', { metalness: 0.5 }),
    purple: s('#b79cff'), mint: s('#8ff0d2'), tan: s('#e8b98a', { roughness: 0.7 }), steel: s('#9fb3c8', { metalness: 0.5 }),
    white: s('#ffffff', { roughness: 0.6 }), orange: s('#ffa94d'), green: s('#69db7c'),
    dark: s('#2b2140', { roughness: 0.3 }),
    pink: s('#ff7eb6'), lime: s('#b8f06a'), choc: s('#7a4a2b', { roughness: 0.45 }), cocoa: s('#4a2a18', { roughness: 0.5 }), cream: s('#fff1dc', { roughness: 0.5 }),
    cyan: s('#74e6d6'), jelly: s('#ff5d8f', { transparent: true, opacity: 0.74, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.8, sheenColor: new THREE.Color('#ffb0cc'), ior: 1.4 }), jellyCore: s('#d81b60', { roughness: 0.3 }), glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }), lemon: s('#ffe066'), grape: s('#a078ff'),
    eye: new THREE.MeshStandardMaterial({ color: '#ff4d7a', emissive: '#ff4d7a', emissiveIntensity: 0.8 }),
    barrel: new THREE.MeshStandardMaterial({ color: '#555a66', emissive: '#ff6a00', emissiveIntensity: 0 }),
    ring: new THREE.MeshBasicMaterial({ color: '#ff4d6d', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    laser: new THREE.MeshBasicMaterial({ color: '#ff3366', transparent: true, opacity: 0.6, depthWrite: false }),
    bubble: new THREE.MeshStandardMaterial({ color: '#bff6ff', transparent: true, opacity: 0.35, roughness: 0.05, emissive: '#7fe8ff', emissiveIntensity: 0.25, depthWrite: false }),
  };
}
const FLASHABLE: (keyof Mats)[] = ['red', 'blue', 'skin', 'gold', 'purple', 'mint', 'tan', 'steel', 'white', 'orange', 'green', 'pink', 'lime', 'choc', 'cocoa', 'cream', 'cyan', 'jelly', 'jellyCore', 'lemon', 'grape', ...BRICK_FLASHABLE];

type R = Record<string, THREE.Object3D | null>;
const SPH = new THREE.SphereGeometry(0.5, 20, 14);
/** bevelled (rounded-edge) box mesh */
function Bv({ w, h, d, r = 0.1, mat, p = [0, 0, 0], rot, cast = true, sc }: { w: number; h: number; d: number; r?: number; mat: THREE.Material; p?: [number, number, number]; rot?: [number, number, number]; cast?: boolean; sc?: [number, number, number] }) {
  return <mesh geometry={bevelBox(w, h, d, r)} material={mat} position={p} rotation={rot} scale={sc} castShadow={cast} />;
}
/** rounded-edge cylinder mesh (Y axis) */
function Rc({ r, h, e = 0.04, mat, p = [0, 0, 0], rot, cast = false, seg = 18 }: { r: number; h: number; e?: number; mat: THREE.Material; p?: [number, number, number]; rot?: [number, number, number]; cast?: boolean; seg?: number }) {
  return <mesh geometry={roundCyl(r, h, e, seg)} material={mat} position={p} rotation={rot} castShadow={cast} />;
}
/** sphere with diameter d (optionally squashed) */
function Ball({ d, mat, p = [0, 0, 0], sc, cast = false }: { d: number; mat: THREE.Material; p?: [number, number, number]; sc?: [number, number, number]; cast?: boolean }) {
  return <mesh geometry={SPH} material={mat} position={p} scale={sc ? [d * sc[0], d * sc[1], d * sc[2]] : d} castShadow={cast} />;
}
/** glossy toy eye: glowing/dark bead + white specular glint */
function Bead({ m, p, d, mat }: { m: Mats; p: [number, number, number]; d: number; mat?: THREE.Material }) {
  return <group position={p}><Ball d={d} mat={mat ?? m.dark} /><Ball d={d * 0.34} mat={m.glint} p={[d * 0.14, d * 0.2, -d * 0.36]} /></group>;
}
const SUGAR = mergedGeo('sugar', () => { const a: THREE.BufferGeometry[] = []; for (let i = 0; i < 26; i++) { const t = i * 2.399, y = 0.12 + (i % 7) * 0.075, rr = Math.sqrt(1 - ((y - 0.1) / 0.72) ** 2) * 0.58; const s = new THREE.IcosahedronGeometry(0.028 + (i % 3) * 0.008, 0); s.translate(Math.cos(t) * rr * 0.86, y, Math.sin(t) * rr * 0.86); a.push(s); } return a; });
const SPRINKLES = mergedGeo('sprinkle', () => { const a: THREE.BufferGeometry[] = []; for (let i = 0; i < 16; i++) { const s = new THREE.CapsuleGeometry(0.012, 0.05, 2, 4); s.rotateZ(Math.PI / 2); s.rotateY(i * 1.9); s.translate(((i * 37) % 17) / 17 * 0.9 - 0.45, 0, ((i * 53) % 13) / 13 * 0.9 - 0.45); a.push(s); } return a; });
const BELL = lathe('clownbell', [[0, 0], [0.36, 0.0], [0.4, 0.06], [0.37, 0.2], [0.3, 0.4], [0.2, 0.6], [0.15, 0.72], [0.0, 0.74]], 22);

function Windup({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      {/* tin-toy soldier: lathe-rounded torso, gold belt, round head, bearskin hat with plume */}
      <Rc r={0.34} h={0.62} e={0.12} mat={m.red} p={[0, 0.65, 0]} cast />
      <Rc r={0.37} h={0.07} e={0.03} mat={m.gold} p={[0, 0.4, 0]} />
      <Ball d={0.1} mat={m.gold} p={[0, 0.4, -0.37]} />
      {[0.55, 0.72].map((y) => <Ball key={y} d={0.07} mat={m.gold} p={[-0.0, y, -0.335]} />)}
      <Ball d={0.54} mat={m.skin} p={[0, 1.13, 0]} cast />
      <Ball d={0.12} mat={m.pink} p={[0, 1.09, -0.26]} sc={[1, 0.8, 0.6]} />
      {[-1, 1].map((s) => <Bead key={s} m={m} p={[0.09 * s, 1.17, -0.235]} d={0.085} />)}
      {[-1, 1].map((s) => <Ball key={'b' + s} d={0.1} mat={m.pink} p={[0.17 * s, 1.07, -0.2]} sc={[1, 0.6, 0.3]} />)}
      <Rc r={0.21} h={0.34} e={0.07} mat={m.blue} p={[0, 1.47, 0]} cast />
      <Rc r={0.27} h={0.05} e={0.02} mat={m.gold} p={[0, 1.33, 0]} />
      <Ball d={0.1} mat={m.red} p={[0, 1.7, 0]} />
      <group ref={(g) => (r.key = g)} position={[0, 0.7, 0.38]}>
        <mesh rotation-x={Math.PI / 2} material={m.gold}><cylinderGeometry args={[0.03, 0.03, 0.16, 6]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[0.11 * s, 0, 0.08]} material={m.gold}><torusGeometry args={[0.08, 0.025, 6, 12]} /></mesh>)}
      </group>
      <group position={[-0.38, 0.85, 0]} rotation-x={0.3}><mesh position={[0, -0.15, 0]} material={m.blue}><capsuleGeometry args={[0.08, 0.2, 4, 8]} /></mesh><Ball d={0.2} mat={m.skin} p={[0, -0.33, 0]} /></group>
      <group ref={(g) => (r.punch = g)} position={[0.38, 0.85, 0]}>
        <mesh position={[0, -0.15, 0]} material={m.blue}><capsuleGeometry args={[0.08, 0.2, 4, 8]} /></mesh>
        <Ball d={0.24} mat={m.skin} p={[0, -0.33, 0]} />
      </group>
      {[-1, 1].map((s) => <group key={s} ref={(g) => (r['leg' + s] = g)} position={[0.14 * s, 0.36, 0]}>
        <mesh position={[0, -0.14, 0]} material={m.blue} castShadow><capsuleGeometry args={[0.095, 0.16, 4, 8]} /></mesh>
        <Ball d={0.22} mat={m.cocoa} p={[0, -0.32, -0.04]} sc={[1, 0.6, 1.5]} />
      </group>)}
    </group>
  );
}
function Gunner({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      {/* toy robot: rounded torso with a glowing chest light, dome head with visor, capsule limbs */}
      <Bv w={0.6} h={0.55} d={0.45} r={0.17} mat={m.purple} p={[0, 0.72, 0]} />
      <Bv w={0.3} h={0.2} d={0.04} r={0.05} mat={m.mint} p={[0, 0.72, -0.23]} cast={false} />
      <Ball d={0.09} mat={m.eye} p={[0, 0.72, -0.26]} />
      <Rc r={0.2} h={0.1} e={0.04} mat={m.gold} p={[0, 0.5, 0]} />
      <Ball d={0.52} mat={m.mint} p={[0, 1.2, 0]} sc={[1.05, 0.88, 0.92]} cast />
      <Bv w={0.4} h={0.17} d={0.06} r={0.06} mat={m.dark} p={[0, 1.2, -0.2]} cast={false} />
      {[-1, 1].map((s) => <Bead key={s} m={m} p={[0.085 * s, 1.2, -0.235]} d={0.08} mat={m.eye} />)}
      {[-1, 1].map((s) => <Rc key={'e' + s} r={0.07} h={0.07} e={0.025} mat={m.gold} p={[0.27 * s, 1.2, 0]} rot={[0, 0, Math.PI / 2]} />)}
      <mesh position={[0, 1.52, 0]} material={m.gold}><cylinderGeometry args={[0.015, 0.015, 0.22, 6]} /></mesh>
      <Ball d={0.12} mat={m.eye} p={[0, 1.65, 0]} />
      <group ref={(g) => (r.arm = g)} position={[0.36, 0.9, 0]}>
        <mesh position={[0, -0.18, 0]} material={m.purple} castShadow><capsuleGeometry args={[0.07, 0.22, 4, 8]} /></mesh>
        <Ball d={0.17} mat={m.mint} p={[0, -0.36, 0]} />
        <Rc r={0.06} h={0.22} e={0.02} mat={m.dark} p={[0, -0.47, 0]} />
      </group>
      <group position={[-0.36, 0.9, 0]} rotation-x={0.2}><mesh position={[0, -0.18, 0]} material={m.purple}><capsuleGeometry args={[0.07, 0.22, 4, 8]} /></mesh><Ball d={0.17} mat={m.mint} p={[0, -0.36, 0]} /></group>
      {[-1, 1].map((s) => <group key={s} ref={(g) => (r['leg' + s] = g)} position={[0.16 * s, 0.45, 0]}>
        <mesh position={[0, -0.15, 0]} material={m.dark} castShadow><capsuleGeometry args={[0.075, 0.18, 4, 8]} /></mesh>
        <Bv w={0.18} h={0.1} d={0.28} r={0.045} mat={m.mint} p={[0, -0.36, -0.04]} />
      </group>)}
    </group>
  );
}
function Bunny({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <group ref={(g) => (r.spring = g)}>
        {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[0, 0.06 + i * 0.07, 0]} rotation-x={Math.PI / 2} material={m.steel}><torusGeometry args={[0.16, 0.03, 6, 14]} /></mesh>)}
      </group>
      <group ref={(g) => (r.top = g)} position={[0, 0.4, 0]}>
        <mesh position={[0, 0.25, 0]} scale={[1, 0.9, 1]} material={m.tan} castShadow><sphereGeometry args={[0.32, 18, 14]} /></mesh>
        <mesh position={[0, 0.2, -0.2]} scale={[0.7, 0.6, 0.4]} material={m.white}><sphereGeometry args={[0.28, 12, 10]} /></mesh>
        <Ball d={0.2} mat={m.white} p={[0, 0.22, 0.3]} />
        <mesh position={[0, 0.68, 0]} material={m.tan} castShadow><sphereGeometry args={[0.24, 18, 14]} /></mesh>
        {[-1, 1].map((s) => <Bead key={s} m={m} p={[0.09 * s, 0.72, -0.215]} d={0.1} mat={m.eye} />)}
        <Ball d={0.07} mat={m.pink} p={[0, 0.66, -0.235]} />
        {[-1, 1].map((s) => <Ball key={'b' + s} d={0.09} mat={m.pink} p={[0.15 * s, 0.63, -0.2]} sc={[1, 0.6, 0.3]} />)}
        {[-1, 1].map((s) => (
          <group key={'e' + s} ref={(g) => (r['ear' + s] = g)} position={[0.1 * s, 0.86, 0]} rotation-z={-0.4 * s}>
            <mesh position={[0, 0.18, 0]} scale={[0.5, 1, 0.3]} material={m.tan}><capsuleGeometry args={[0.09, 0.25, 4, 8]} /></mesh>
            <mesh position={[0, 0.18, -0.025]} scale={[0.28, 0.75, 0.2]} material={m.pink}><capsuleGeometry args={[0.09, 0.25, 4, 8]} /></mesh>
          </group>
        ))}
        <Ball d={0.11} mat={m.white} p={[0, 0.54, -0.22]} sc={[1, 0.55, 0.3]} />
      </group>
    </group>
  );
}
function Tank({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      {/* toy army tank: soft rounded hull, chunky tracks with road wheels, domed turret with hatch + cannon */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0.62 * s, 0.25, 0]}>
          <Bv w={0.32} h={0.45} d={1.8} r={0.17} mat={m.dark} />
          {[-0.6, 0, 0.6].map((z, i) => <group key={z} ref={(g) => (r['wh' + (s > 0 ? 1 : 0) + i] = g)} position={[0.17 * s, 0, z]}><Rc r={0.17} h={0.05} e={0.02} mat={m.steel} rot={[0, 0, Math.PI / 2]} /><Ball d={0.07} mat={m.gold} p={[0.03 * s, 0.09, 0]} /></group>)}
        </group>
      ))}
      <Bv w={1.0} h={0.5} d={1.6} r={0.2} mat={m.green} p={[0, 0.55, 0]} />
      <Bv w={1.1} h={0.55} d={0.14} r={0.05} mat={m.gold} p={[0, 0.58, -0.82]} rot={[0.25, 0, 0]} />
      {[-1, 1].map((s) => <Bead key={s} m={m} p={[0.3 * s, 0.6, -0.9]} d={0.14} mat={m.eye} />)}
      {[-1, 1].map((s) => <Ball key={'r' + s} d={0.06} mat={m.steel} p={[0.4 * s, 0.38, -0.8]} />)}
      <Ball d={0.82} mat={m.green} p={[0, 0.88, 0.05]} sc={[1, 0.62, 1.05]} cast />
      <mesh position={[0, 0.9, 0.05]} rotation-x={Math.PI / 2} material={m.gold}><torusGeometry args={[0.38, 0.03, 6, 22]} /></mesh>
      <Rc r={0.14} h={0.07} e={0.025} mat={m.steel} p={[0.15, 1.18, 0.2]} />
      <Ball d={0.16} mat={m.red} p={[-0.1, 1.2, 0.2]} />
      <group position={[0, 1.05, -0.4]} rotation-x={Math.PI / 2}>
        <Rc r={0.11} h={0.8} e={0.04} mat={m.barrel} p={[0, -0.0, 0]} />
        <Rc r={0.15} h={0.12} e={0.04} mat={m.gold} p={[0, -0.42, 0]} />
        <Rc r={0.17} h={0.14} e={0.04} mat={m.steel} p={[0, 0.34, 0]} />
      </group>
      <group ref={(g) => (r.key = g)} position={[0, 0.7, 0.85]}>
        <mesh rotation-x={Math.PI / 2} material={m.gold}><cylinderGeometry args={[0.04, 0.04, 0.2, 6]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[0.14 * s, 0, 0.1]} material={m.gold}><torusGeometry args={[0.1, 0.03, 6, 12]} /></mesh>)}
      </group>
    </group>
  );
}
function Drone({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} scale={[1, 0.62, 1]} material={m.white} castShadow><sphereGeometry args={[0.38, 22, 14]} /></mesh>
      <mesh position={[0, 0.43, 0]} scale={[1, 0.5, 1]} material={m.mint}><sphereGeometry args={[0.3, 18, 12]} /></mesh>
      <Ball d={0.24} mat={m.dark} p={[0, 0.27, -0.28]} sc={[1, 1, 0.7]} />
      <Bead m={m} p={[0, 0.27, -0.34]} d={0.15} mat={m.eye} />
      <mesh position={[0, 0.14, 0]} scale={[1, 0.4, 1]} material={m.cyan}><sphereGeometry args={[0.2, 12, 8]} /></mesh>
      <mesh position={[0, 0.58, 0.05]} material={m.gold}><cylinderGeometry args={[0.012, 0.012, 0.2, 6]} /></mesh>
      <Ball d={0.08} mat={m.red} p={[0, 0.7, 0.05]} />
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        return (
          <group key={i} position={[Math.cos(a) * 0.55, 0.35, Math.sin(a) * 0.55]}>
            <mesh rotation-z={Math.PI / 2} rotation-y={-a} position={[-Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]} material={m.steel}><capsuleGeometry args={[0.03, 0.34, 3, 6]} /></mesh>
            <Rc r={0.07} h={0.1} e={0.03} mat={m.dark} />
            <group ref={(g) => (r['rotor' + i] = g)} position={[0, 0.08, 0]}>
              <Bv w={0.46} h={0.02} d={0.07} r={0.01} mat={m.purple} cast={false} />
              <Bv w={0.07} h={0.02} d={0.46} r={0.01} mat={m.purple} cast={false} />
              <Ball d={0.07} mat={m.gold} p={[0, 0.02, 0]} />
            </group>
            <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2} material={m.bubble}><circleGeometry args={[0.24, 18]} /></mesh>
          </group>
        );
      })}
    </group>
  );
}
function Clown({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      {/* roly-poly bell-bodied clown: spotted suit, ruff, painted face with red nose, floppy hat with pom-pom */}
      <mesh geometry={BELL} position={[0, 0.08, 0]} material={m.red} castShadow />
      {[0.22, 0.4].map((y, i) => <Ball key={y} d={0.09} mat={m.gold} p={[0, y + 0.08, -0.37 + i * 0.1]} />)}
      {[[0.22, -0.18], [-0.26, -0.1], [0.12, 0.3], [-0.14, 0.32]].map(([x, z], i) => <Ball key={i} d={0.1} mat={m.white} p={[x, 0.3 + i * 0.05, z - 0.18]} sc={[1, 1, 0.5]} />)}
      <mesh position={[0, 0.84, 0]} rotation-x={Math.PI / 2} material={m.white}><torusGeometry args={[0.19, 0.08, 10, 18]} /></mesh>
      <Ball d={0.5} mat={m.white} p={[0, 1.06, 0]} cast />
      <Ball d={0.15} mat={m.eye} p={[0, 1.02, -0.245]} />
      <Ball d={0.045} mat={m.glint} p={[0.02, 1.05, -0.3]} />
      {[-1, 1].map((s) => <Bead key={s} m={m} p={[0.095 * s, 1.14, -0.215]} d={0.085} />)}
      <mesh position={[0, 0.95, -0.225]} rotation-z={Math.PI} material={m.eye}><torusGeometry args={[0.1, 0.018, 5, 12, Math.PI]} /></mesh>
      {[-1, 1].map((s) => <Ball key={'c' + s} d={0.1} mat={m.pink} p={[0.17 * s, 1.0, -0.19]} sc={[1, 0.6, 0.3]} />)}
      {[-1, 1].map((s) => [0, 1].map((j) => <Ball key={s + '' + j} d={0.2} mat={j ? m.blue : m.green} p={[0.22 * s, 1.15 + j * 0.1, 0.02]} />))}
      <mesh position={[0, 1.38, 0]} rotation-z={0.15} material={m.purple} castShadow><coneGeometry args={[0.15, 0.32, 12]} /></mesh>
      <Ball d={0.12} mat={m.gold} p={[0.04, 1.56, 0]} />
      <group ref={(g) => (r.bomb = g)} position={[0, 0.62, -0.38]}>
        <Ball d={0.4} mat={m.dark} cast />
        <Ball d={0.12} mat={m.glint} p={[-0.06, 0.08, -0.14]} />
        <Rc r={0.035} h={0.1} e={0.01} mat={m.steel} p={[0, 0.2, 0]} />
        <mesh position={[0, 0.27, 0]} material={m.tan}><cylinderGeometry args={[0.02, 0.02, 0.1, 5]} /></mesh>
        <mesh ref={(g) => (r.spark = g)} position={[0, 0.33, 0]} material={m.eye}><sphereGeometry args={[0.05, 8, 6]} /></mesh>
      </group>
      {[-1, 1].map((s) => <group key={'l' + s} ref={(g) => (r['leg' + s] = g)} position={[0.14 * s, 0.15, 0]}><mesh position={[0, -0.06, -0.05]} scale={[1, 0.6, 1.6]} material={m.blue}><sphereGeometry args={[0.1, 12, 8]} /></mesh></group>)}
    </group>
  );
}
/** shared candy-tank bits: two chunky treads with road wheels (which spin), and a cute face (eyes + smile + blush) on the hull front (-z) */
function Treads({ m, r, x, len, h = 0.4, w = 0.3, wheels = 3, mat }: { m: Mats; r: R; x: number; len: number; h?: number; w?: number; wheels?: number; mat?: THREE.Material }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[x * s, h / 2, 0]}>
          <mesh material={mat ?? m.dark} castShadow scale={[w / h, 1, 1]} rotation-x={Math.PI / 2}><capsuleGeometry args={[h / 2, len - h, 6, 14]} /></mesh>
          <mesh material={m.cocoa} scale={[w / h * 1.1, 1, 0.9]} rotation-x={Math.PI / 2}><capsuleGeometry args={[h / 2, len - h, 6, 14]} /></mesh>
          {Array.from({ length: wheels }, (_, i) => { const z = (i / (wheels - 1) - 0.5) * (len - h * 0.9); return (
            <group key={i} ref={(g) => (r['wh' + (s > 0 ? 1 : 0) + i] = g)} position={[(w * 0.62) * s, 0, z]}>
              <Rc r={h * 0.3} h={0.05} e={0.02} mat={m.cream} rot={[0, 0, Math.PI / 2]} />
              <Ball d={h * 0.16} mat={m.gold} p={[0.03 * s, h * 0.17, 0]} />
            </group>); })}
        </group>
      ))}
    </>
  );
}
function Face({ m, y, z, s = 1 }: { m: Mats; y: number; z: number; s?: number; eye?: string }) {
  return (
    <group position={[0, y, z]} scale={s}>
      {[-1, 1].map((q) => <Ball key={q} d={0.2} mat={m.white} p={[0.16 * q, 0.04, 0]} />)}
      {[-1, 1].map((q) => <Bead key={'p' + q} m={m} p={[0.16 * q, 0.04, -0.07]} d={0.11} />)}
      <mesh position={[0, -0.1, -0.02]} rotation-z={Math.PI} material={m.dark}><torusGeometry args={[0.07, 0.016, 6, 12, Math.PI]} /></mesh>
      {[-1, 1].map((q) => <Ball key={'c' + q} d={0.13} mat={m.pink} p={[0.27 * q, -0.07, -0.01]} sc={[1, 0.6, 0.3]} />)}
    </group>
  );
}
/** Gumdrop Tank: squat, fast, light — sugar-crusted gumdrop dome on a mini hull */
function Gumdrop({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={0.5} len={1.3} h={0.34} wheels={3} />
      <mesh position={[0, 0.2, 0.02]} scale={[1, 1.0, 1.1]} geometry={gumdropGeo(0.56, 0.72)} material={m.pink} castShadow />
      <mesh position={[0, 0.2, 0.02]} scale={[1.005, 1.005, 1.105]} geometry={SUGAR} material={m.white} />
      <Ball d={0.32} mat={m.lemon} p={[0, 0.97, 0.05]} sc={[1, 0.55, 1]} />
      <Face m={m} y={0.5} z={-0.52} />
      <group ref={(g) => (r.barrel = g)} position={[0, 0.62, -0.5]}>
        <Rc r={0.08} h={0.4} e={0.03} mat={m.barrel} p={[0, 0, -0.18]} rot={[Math.PI / 2, 0, 0]} />
        <mesh position={[0, 0, -0.4]} material={m.lemon}><torusGeometry args={[0.08, 0.025, 6, 12]} /></mesh>
      </group>
      <mesh position={[0, 1.08, 0.05]} material={m.lime}><coneGeometry args={[0.06, 0.16, 8]} /></mesh>
    </group>
  );
}
/** Chocolate Heavy Tank: wide chocolate-bar armour, caramel plating, twin short barrels */
function Choco({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={0.95} len={2.5} h={0.65} w={0.45} wheels={5} mat={m.cocoa} />
      <Bv w={1.5} h={0.6} d={2.2} r={0.24} mat={m.choc} p={[0, 0.75, 0]} />
      {[-1, 0, 1].map((i) => [-1, 0, 1].map((j) => <Bv key={i + '' + j} w={0.38} h={0.07} d={0.58} r={0.03} mat={m.cocoa} p={[i * 0.45, 1.05, j * 0.7]} cast={false} />))}
      <Bv w={1.5} h={0.7} d={0.16} r={0.06} mat={m.gold} p={[0, 0.8, -1.12]} rot={[0.35, 0, 0]} />
      {[-1, 1].map((s) => <Ball key={s} d={0.1} mat={m.cream} p={[0.6 * s, 0.9, -1.2]} />)}
      <Bv w={1.05} h={0.5} d={1.15} r={0.22} mat={m.choc} p={[0, 1.38, 0.1]} />
      {[0, 1, 2].map((i) => <mesh key={i} position={[0, 1.68 + i * 0.14, 0.1]} rotation-x={Math.PI / 2} scale={1 - i * 0.28} material={m.cream}><torusGeometry args={[0.36, 0.11, 8, 20]} /></mesh>)}
      <Ball d={0.2} mat={m.red} p={[0, 2.0, 0.1]} /><Ball d={0.06} mat={m.glint} p={[-0.03, 2.05, 0.07]} />
      <Face m={m} y={1.4} z={-0.5} s={1.25} />
      <group ref={(g) => (r.barrel = g)}>
        {[-1, 1].map((q) => <group key={q}>
          <Rc r={0.14} h={1.0} e={0.05} mat={m.barrel} p={[0.68 * q, 1.45, -0.95]} rot={[Math.PI / 2, 0, 0]} />
          <Rc r={0.19} h={0.12} e={0.04} mat={m.gold} p={[0.68 * q, 1.45, -1.45]} rot={[Math.PI / 2, 0, 0]} />
        </group>)}
      </group>
    </group>
  );
}
/** Lollipop Artillery Tank: tall swirl-disc "umbrella" and a stubby mortar tube angled up */
function Lolli({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={0.62} len={1.7} h={0.42} wheels={4} />
      <Bv w={0.95} h={0.42} d={1.45} r={0.19} mat={m.grape} p={[0, 0.62, 0.05]} />
      <mesh position={[0, 0.82, 0.05]} rotation-x={Math.PI / 2} material={m.white}><torusGeometry args={[0.4, 0.04, 6, 24]} /></mesh>
      <mesh position={[0, 0.9, 0.2]} material={m.lemon}><cylinderGeometry args={[0.05, 0.05, 0.45, 8]} /></mesh>
      <group ref={(g) => (r.swirl = g)} position={[0, 1.38, 0.2]} rotation-x={-0.25}>
        <Rc r={0.62} h={0.1} e={0.045} mat={m.pink} rot={[Math.PI / 2, 0, 0]} cast seg={28} />
        {[0, 1, 2].map((i) => <mesh key={i} material={m.white} rotation-x={Math.PI / 2} position={[0, 0.056, 0]}><torusGeometry args={[0.15 + i * 0.16, 0.03, 6, 26]} /></mesh>)}
        <Ball d={0.12} mat={m.lemon} p={[0, 0.07, 0]} />
      </group>
      <Face m={m} y={0.62} z={-0.74} s={0.9} />
      <group ref={(g) => (r.barrel = g)} position={[0, 0.78, -0.45]} rotation-x={0.9}>
        <Rc r={0.15} h={0.7} e={0.05} mat={m.barrel} p={[0, 0, -0.3]} rot={[Math.PI / 2, 0, 0]} />
        <mesh position={[0, 0, -0.66]} material={m.lemon}><torusGeometry args={[0.15, 0.04, 8, 16]} /></mesh>
      </group>
    </group>
  );
}
/** Peppermint Spinner Tank: round striped peppermint disc turret that spins, nozzles around the rim */
function Mint({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={0.7} len={1.6} h={0.42} wheels={3} />
      <Bv w={1.05} h={0.4} d={1.4} r={0.19} mat={m.white} p={[0, 0.55, 0]} />
      {[-0.4, 0, 0.4].map((z) => <Bv key={z} w={1.07} h={0.07} d={0.1} r={0.03} mat={m.red} p={[0, 0.58, z]} cast={false} />)}
      <group ref={(g) => (r.spin = g)} position={[0, 0.95, 0]}>
        <Rc r={0.72} h={0.28} e={0.11} mat={m.red} cast seg={28} />
        {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[Math.cos(i * 1.047) * 0.34, 0.145, Math.sin(i * 1.047) * 0.34]} rotation-y={-i * 1.047} material={m.white} scale={[0.9, 1, 0.22]}><boxGeometry args={[0.7, 0.02, 1]} /></mesh>)}
        {[0, 1, 2].map((i) => <group key={'n' + i} position={[Math.cos(i * 2.094) * 0.72, 0, Math.sin(i * 2.094) * 0.72]} rotation-y={-i * 2.094}><Rc r={0.09} h={0.24} e={0.03} mat={m.barrel} rot={[0, 0, Math.PI / 2]} /><Ball d={0.2} mat={m.gold} p={[0.09, 0, 0]} /></group>)}
        <Ball d={0.34} mat={m.cyan} p={[0, 0.22, 0]} sc={[1, 0.8, 1]} /><Ball d={0.08} mat={m.glint} p={[-0.05, 0.3, -0.07]} />
      </group>
      <Face m={m} y={0.58} z={-0.72} s={0.9} />
    </group>
  );
}
/** Mini Jelly Tank: translucent jelly blob with a denser core and glossy highlights, on tiny treads, wobbles */
function Jelly({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={0.28} len={0.8} h={0.22} w={0.16} wheels={2} />
      <group ref={(g) => (r.blob = g)} position={[0, 0.3, 0]}>
        <mesh position={[0, 0.14, 0]} material={m.jelly} castShadow scale={[1, 0.85, 1.1]}><sphereGeometry args={[0.38, 20, 14]} /></mesh>
        <Ball d={0.4} mat={m.jellyCore} p={[0, 0.1, 0.04]} />
        <Ball d={0.12} mat={m.glint} p={[-0.14, 0.34, -0.16]} sc={[1, 0.6, 0.5]} />
        <Ball d={0.18} mat={m.cream} p={[0, 0.48, 0.02]} sc={[1, 0.7, 1]} />
        <Ball d={0.07} mat={m.red} p={[0, 0.55, 0.02]} />
        <Face m={m} y={0.14} z={-0.37} s={0.6} />
      </group>
    </group>
  );
}
/** Mega Candy Tank (mini-boss): stacked cake hull, star cannon, crown, side lolli-mortars */
function Mega({ m, r }: { m: Mats; r: R }) {
  return (
    <group>
      <Treads m={m} r={r} x={1.35} len={3.5} h={0.95} w={0.7} wheels={6} mat={m.cocoa} />
      <Bv w={2.1} h={0.75} d={3.1} r={0.32} mat={m.pink} p={[0, 1.0, 0]} />
      <Bv w={1.8} h={0.4} d={2.7} r={0.18} mat={m.cream} p={[0, 1.55, 0.05]} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <Ball key={i} d={0.28} mat={m.white} p={[-0.86 + i * 0.285, 1.4, -1.38]} sc={[1, 1.3, 1]} />)}
      {[-1, 1].map((s) => <mesh key={s} position={[0.97 * s, 1.55, 0.05]} rotation-x={Math.PI / 2} rotation-z={Math.PI / 2} material={m.white}><torusGeometry args={[0.15, 0.05, 6, 10]} /></mesh>)}
      <Rc r={0.9} h={0.55} e={0.17} mat={m.lemon} p={[0, 2.0, 0.1]} cast seg={26} />
      <mesh geometry={SPRINKLES} position={[0, 1.76, 0.05]} scale={1.8} material={m.red} />
      <Face m={m} y={1.15} z={-1.58} s={2} />
      <group ref={(g) => (r.crown = g)} position={[0, 2.5, 0.1]}>
        {[0, 1, 2, 3, 4].map((i) => <group key={i} position={[Math.cos(i * 1.257) * 0.5, 0.1, Math.sin(i * 1.257) * 0.5]}><mesh material={m.gold}><coneGeometry args={[0.13, 0.4, 8]} /></mesh><Ball d={0.12} mat={m.red} p={[0, 0.24, 0]} /></group>)}
        <mesh position={[0, -0.02, 0]} rotation-x={Math.PI / 2} material={m.gold}><torusGeometry args={[0.5, 0.07, 8, 24]} /></mesh>
      </group>
      <group ref={(g) => (r.barrel = g)}>
        <Rc r={0.24} h={1.5} e={0.06} mat={m.barrel} p={[0, 2.0, -1.0]} rot={[Math.PI / 2, 0, 0]} />
        <Rc r={0.33} h={0.16} e={0.05} mat={m.gold} p={[0, 2.0, -1.72]} rot={[Math.PI / 2, 0, 0]} />
        {[-1, 1].map((q) => <group key={q} position={[1.1 * q, 1.55, 0.6]} rotation-x={-0.5}><Rc r={0.15} h={0.7} e={0.05} mat={m.barrel} p={[0, 0.35, 0]} /><Ball d={0.32} mat={m.lemon} p={[0, 0.78, 0]} /></group>)}
      </group>
    </group>
  );
}
const MODELS: Record<EnemyType, (p: { m: Mats; r: Record<string, THREE.Object3D | null> }) => JSX.Element> = { windup: Windup, gunner: Gunner, bunny: Bunny, tank: Tank, drone: Drone, clown: Clown, gumdrop: Gumdrop, choco: Choco, lolli: Lolli, mint: Mint, jelly: Jelly, mega: Mega, king: () => <group /> , bsoldier: BSoldier, bturret: BTurret, bgolem: BGolem, bcrane: BCrane, colossus: () => <group /> };

function EnemySlot({ index }: { index: number }) {
  const root = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), ring = useRef<THREE.Mesh>(null!);
  const laserG = useRef<THREE.Group>(null!), laser = useRef<THREE.Mesh>(null!), bubble = useRef<THREE.Mesh>(null!);
  const typeRefs = useRef<Record<string, THREE.Group | null>>({});
  const parts = useRef<Record<EnemyType, Record<string, THREE.Object3D | null>>>(Object.fromEntries([...ENEMY_ORDER, 'king'].map((k) => [k, {}])) as Record<EnemyType, Record<string, THREE.Object3D | null>>);
  const m = useMemo(makeMats, []);

  useFrame(() => {
    const e = world.enemies.items[index];
    root.current.visible = e.active && e.type !== 'king' && e.type !== 'colossus';
    if (!root.current.visible) return;
    const c = ENEMIES[e.type], t = world.time, a = world.alpha, r = parts.current[e.type];
    root.current.position.set(lerp(e.prev.x, e.pos.x, a), lerp(e.prev.y, e.pos.y, a), lerp(e.prev.z, e.pos.z, a));
    body.current.rotation.y = e.facing;
    for (const k of ENEMY_ORDER) { const g = typeRefs.current[k]; if (g) g.visible = k === e.type; }
    const attacking = e.fsm.state === 'attack';
    const wf = c.candyTank || c.brick ? e.tele : attacking ? 1 - Math.max(0, e.fsm.timer) / c.windup : 0;
    let s = 1;
    const isBrick = !!c.brick;
    if (isBrick) {
      const build = e.spawnAnim > 0 ? 1 - e.spawnAnim / 0.9 : 1, apart = e.dead ? Math.min(1, Math.max(0, 1 - e.deathTimer / 0.7)) : 0;
      for (let i = 0; r['b' + i]; i++) brickPose(r['b' + i]!, i, build, apart);
    }
    if (e.spawnAnim > 0 && !isBrick) s = 1 - (e.spawnAnim / 0.4) * 0.8;
    if (e.dead && !isBrick) {
      const k = 1 - e.deathTimer / FX.deathPopTime;
      // jelly deathPop: overshoot expand + wobble (Q弹)
      s = 1 + Math.sin(k * Math.PI) * 0.45 + k * 0.7;
      body.current.rotation.z = k * 0.9 + Math.sin(k * Math.PI * 4) * 0.18 * (1 - k);
    }
    else if (e.dead) body.current.rotation.z = 0;
    else body.current.rotation.z = Math.sin(t * 72) * e.hitReact * 1.35; // punchier hit wobble
    body.current.rotation.x = -e.hitReact * 2.1 + (e.bound > 0 ? Math.sin(t * 2 + index) * 0.2 : 0);
    let sx = 1 + wf * 0.12, sy = 1 - wf * 0.1;
    if (e.type === 'clown') { sx = sy = 1 + wf * 0.35; }
    if (e.type === 'bunny') { sy = 1 - wf * 0.35; sx = 1 + wf * 0.15; if (e.leapT > 0) { sy = 1.25; sx = 0.85; } }
    // soft-vinyl feel: breathing when idle, Q弹 squash on hit, little hop while moving, spinning road wheels
    const mv0 = Math.hypot(e.vel.x, e.vel.z) > 0.3;
    if (!isBrick && !e.dead) {
      const br = Math.sin(t * 2.4 + index * 1.7) * (mv0 ? 0.008 : 0.018), hs = Math.min(0.55, e.hitReact);
      sy *= 1 + br - hs * 0.58; sx *= 1 - br * 0.6 + hs * 0.42;
      body.current.position.y = e.type === 'drone' ? Math.sin(t * 3 + index) * 0.05 : mv0 && !c.candyTank ? Math.abs(Math.sin(e.animPhase * 4)) * 0.025 : 0;
      if (c.candyTank || e.type === 'tank') for (let si = 0; si < 2; si++) for (let wi = 0; wi < 8; wi++) { const w = r['wh' + si + wi]; if (w) w.rotation.x = -e.animPhase * 3; }
    } else if (!isBrick && e.dead) {
      const k = 1 - e.deathTimer / FX.deathPopTime;
      const wob = Math.sin(k * Math.PI * 5) * 0.16 * (1 - k * 0.5);
      sx *= 1 + wob; sy *= 1 - wob * 1.15;
      body.current.position.y = 0;
    } else body.current.position.y = 0;
    body.current.scale.set(s * sx, s * sy, s * sx);
    const pulse = attacking ? (Math.sin(t * (e.type === 'clown' ? 30 + wf * 50 : 40)) > 0 ? 0.6 : 0.2) : 0;
    for (const k of FLASHABLE) {
      const mat = m[k] as THREE.MeshStandardMaterial;
      if (e.flash > 0 || e.dead) { mat.emissive.setRGB(1, 1, 1); mat.emissiveIntensity = e.flash > 0 ? 1.55 : 1.05; }
      else if (e.bound > 0) { mat.emissive.setRGB(0.3, 0.7, 0.9); mat.emissiveIntensity = 0.4; }
      else { mat.emissive.setRGB(pulse, 0, pulse * 0.2); mat.emissiveIntensity = 1; }
    }
    m.barrel.emissiveIntensity = (e.type === 'tank' && attacking) || c.candyTank ? wf * 2.5 : 0;
    bubble.current.visible = e.bound > 0;
    if (e.bound > 0) { const bs = (Math.max(c.radius, c.height * 0.5) + 0.35) / 0.5 + Math.sin(t * 6) * 0.05; bubble.current.scale.setScalar(bs); bubble.current.position.y = c.height * 0.5; }
    const moving = Math.hypot(e.vel.x, e.vel.z) > 0.3;
    const lobTele = () => { if (attacking && c.lob) showRing(e.tp.x, e.tp.z, c.lob.radius); };
    const sw = Math.sin(e.animPhase * 4);
    for (const sgn of [-1, 1]) { const l = r['leg' + sgn]; if (l) l.rotation.x = moving ? sw * 0.6 * sgn : 0; }
    // per-type parts + telegraphs
    ring.current.visible = false; laserG.current.visible = false;
    const p = world.slots[e.ts]?.player ?? world.player;
    const showLaser = (color: string, width: number, from: [number, number, number]) => {
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz);
      laserG.current.visible = true; laserG.current.position.set(...from);
      laserG.current.rotation.x = Math.atan2(p.pos.y + 1 - (e.pos.y + from[1]), d);
      laser.current.scale.set(width * (1 + wf * 2), d, width * (1 + wf * 2)); laser.current.position.z = -d / 2;
      m.laser.color.set(color); m.laser.opacity = 0.2 + wf * 0.7;
    };
    const showRing = (x: number, z: number, radius: number) => {
      ring.current.visible = true; ring.current.position.set(x - root.current.position.x, 0.04 - root.current.position.y, z - root.current.position.z);
      ring.current.scale.setScalar(radius * (0.4 + wf * 0.6)); m.ring.opacity = 0.25 + wf * 0.5;
    };
    switch (e.type) {
      case 'windup':
        if (r.key) r.key.rotation.z = t * (attacking ? 20 : 6);
        if (r.punch) r.punch.rotation.x = attacking ? -0.5 - wf * 1.2 : e.fsm.cooldown > 0.6 ? 1.7 : 0.3 + sw * 0.3;
        if (attacking) showRing(e.pos.x - Math.sin(e.facing) * 0.9, e.pos.z - Math.cos(e.facing) * 0.9, 1.2);
        break;
      case 'gunner':
        if (r.arm) r.arm.rotation.x = e.fsm.state === 'chase' || attacking || e.fsm.state === 'detect' ? Math.PI / 2 : 0.2;
        if (attacking) showLaser('#ff3366', 1, [0.32, 0.9, 0]);
        break;
      case 'bunny':
        if (r.spring) r.spring.scale.y = e.leapT > 0 ? 1.6 : 1 - wf * 0.5 + (moving ? Math.abs(sw) * 0.3 : 0);
        if (r.top) r.top.position.y = 0.4 * (r.spring?.scale.y ?? 1);
        for (const sgn of [-1, 1]) { const ear = r['ear' + sgn]; if (ear) ear.rotation.x = e.leapT > 0 ? -0.8 : Math.sin(t * 5 + sgn) * 0.2; }
        if (attacking) showRing(e.target.x, e.target.z, c.blastRadius!);
        break;
      case 'tank':
        if (r.key) r.key.rotation.z = t * 3;
        if (attacking) showLaser('#ff8c42', 2.5, [0, 1.05, -1.2]);
        break;
      case 'drone':
        for (let i = 0; i < 4; i++) { const ro = r['rotor' + i]; if (ro) ro.rotation.y = t * 40 + i; }
        body.current.rotation.x += Math.hypot(e.vel.x, e.vel.z) * -0.05;
        if (attacking) showLaser('#7fd8ff', 1, [0, 0.24, -0.35]);
        break;
      case 'gumdrop':
        if (r.barrel) r.barrel.position.z = -0.5 + (e.burstLeft > 0 ? Math.sin(t * 50) * 0.04 : 0);
        body.current.rotation.z += moving ? Math.sin(e.animPhase * 4) * 0.04 : 0;
        if (attacking) showLaser('#ff7eb6', 0.8, [0, 0.62, -0.9]);
        break;
      case 'choco':
        if (r.barrel) r.barrel.position.z = attacking ? wf * 0.12 : 0;
        if (attacking) showLaser('#ff8c42', 2.8, [0, 1.4, -1.5]);
        break;
      case 'lolli':
        if (r.swirl) r.swirl.rotation.y = t * (attacking ? 7 : 1.5);
        if (r.barrel) r.barrel.rotation.x = 0.9 + (attacking ? -wf * 0.25 : 0);
        lobTele();
        break;
      case 'mint':
        if (r.spin) r.spin.rotation.y = t * (1.5 + (e.burstLeft > 0 ? 7 : wf * 6));
        break;
      case 'jelly':
        if (r.blob) { const w = Math.sin(t * 9 + index) * (moving ? 0.1 : 0.04); r.blob.scale.set(1 + w + wf * 0.25, 1 - w - wf * 0.15, 1 + w + wf * 0.25); }
        break;
      case 'mega':
        if (r.crown) r.crown.rotation.y = t * 1.2;
        if (r.barrel) r.barrel.position.z = attacking ? wf * 0.2 : 0;
        lobTele();
        if (attacking && !c.lob) showRing(e.pos.x, e.pos.z, 6);
        break;
      case 'bsoldier':
        if (r.arm) r.arm.rotation.x = attacking ? -0.4 - wf * 2.0 : e.knockT > 0 ? -1.6 : sw * 0.4;
        if (attacking) showRing(e.pos.x - Math.sin(e.facing) * 1.1, e.pos.z - Math.cos(e.facing) * 1.1, 1.7);
        break;
      case 'bturret':
        if (r.barrel) r.barrel.position.z = e.burstLeft > 0 ? Math.sin(t * 60) * 0.05 : attacking ? wf * 0.1 : 0;
        if (attacking) showLaser('#3a86ff', 1, [0, 1.38, -1.4]);
        break;
      case 'bgolem': {
        const slam = e.burstAng === 1;
        if (r.armL && r.armR) {
          if (slam) { r.armL.rotation.x = r.armR.rotation.x = attacking ? -wf * 2.7 : 0; }
          else { r.armL.rotation.x = attacking ? -wf * 0.9 : sw * 0.2; r.armR.rotation.x = attacking ? -wf * 2.4 : -sw * 0.2; }
        }
        if (attacking) { if (slam) showRing(e.pos.x, e.pos.z, c.blastRadius!); else lobTele(); }
        break;
      }
      case 'bcrane': {
        const sweeping = e.burstLeft > 0;
        if (r.ball) r.ball.position.y = sweeping ? 0 : wf * 1.9;
        if (attacking || sweeping) showRing(e.pos.x, e.pos.z, 9.4);
        break;
      }
      case 'clown':
        if (r.spark) r.spark.scale.setScalar(attacking ? 1.5 + Math.sin(t * 50) : 0.7 + Math.sin(t * 20) * 0.3);
        if (r.bomb) r.bomb.position.y = 0.62 + (moving ? Math.abs(sw) * 0.08 : 0);
        if (attacking) showRing(e.pos.x, e.pos.z, c.blastRadius!);
        break;
    }
  });

  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        {ENEMY_ORDER.map((k) => { const M = MODELS[k]; return <group key={k} ref={(g) => (typeRefs.current[k] = g)} visible={false}><M m={m} r={parts.current[k]} /></group>; })}
        <group ref={laserG} visible={false}>
          <mesh ref={laser} rotation-x={Math.PI / 2} material={m.laser}><cylinderGeometry args={[0.012, 0.012, 1, 6]} /></mesh>
        </group>
      </group>
      <mesh ref={bubble} visible={false} material={m.bubble}><sphereGeometry args={[0.5, 20, 14]} /></mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} material={m.ring}><ringGeometry args={[0.85, 1, 40]} /></mesh>
    </group>
  );
}

export function Enemies() {
  return <>{Array.from({ length: POOLS.enemies }, (_, i) => <EnemySlot key={i} index={i} />)}</>;
}
