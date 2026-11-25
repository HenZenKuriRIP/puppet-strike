import { Suspense } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { vinyl, glossy, metal, glass, glow, flat } from './materials';
import { BlenderWeaponModels, GlbBoundary } from '../assets/BlenderKit';

const RB = ({ args, position, mat, r = 0.03, rot }: { args: [number, number, number]; position: [number, number, number]; mat: THREE.Material; r?: number; rot?: [number, number, number] }) => (
  <RoundedBox args={args} radius={r} smoothness={3} position={position} rotation={rot} material={mat} castShadow />
);
const RAINBOW = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];

/** Procedural fallback — kept as-is for load failures / offline. */
export function ProceduralWeaponModels({ refs }: { refs?: React.MutableRefObject<(THREE.Group | null)[]> }) {
  const set = (i: number) => (g: THREE.Group | null) => { if (refs) refs.current[i] = g; };
  return (
    <>
      {/* 0 Candy SMG: pink wrapped-candy body, mint barrel, lemon mag, swirl drum */}
      <group ref={set(0)}>
        <RB args={[0.13, 0.15, 0.4]} position={[0, 0.04, -0.12]} mat={vinyl('#ff7eb6')} r={0.05} />
        <mesh position={[0, 0.06, -0.4]} rotation-x={Math.PI / 2} material={glossy('#7fe8c9')}><cylinderGeometry args={[0.035, 0.04, 0.22, 12]} /></mesh>
        <mesh position={[0, 0.06, -0.52]} rotation-x={Math.PI / 2} material={vinyl('#ffffff')}><torusGeometry args={[0.04, 0.012, 6, 14]} /></mesh>
        <RB args={[0.07, 0.2, 0.08]} position={[0, -0.1, -0.06]} rot={[0.2, 0, 0]} mat={vinyl('#ffe066')} r={0.025} />
        <mesh position={[0, 0.15, -0.1]} material={glossy('#fff3a0')}><sphereGeometry args={[0.045, 12, 10]} /></mesh>
        <mesh position={[0.075, 0.04, -0.1]} rotation-z={Math.PI / 2} material={vinyl('#ffffff')}><cylinderGeometry args={[0.05, 0.05, 0.02, 16]} /></mesh>
        <mesh position={[0.086, 0.04, -0.1]} rotation-z={Math.PI / 2} material={vinyl('#ff4f9a')}><torusGeometry args={[0.03, 0.01, 6, 12]} /></mesh>
      </group>
      {/* 1 Bubble Launcher: soap tank, glass globe w/ bubble, wand nozzle */}
      <group ref={set(1)}>
        <mesh position={[0, 0.03, -0.15]} rotation-x={Math.PI / 2} material={vinyl('#7fe8c9')} castShadow><capsuleGeometry args={[0.09, 0.32, 6, 14]} /></mesh>
        <mesh position={[0, 0.21, -0.1]} material={glass('#bff6ff', 0.5)}><sphereGeometry args={[0.13, 20, 14]} /></mesh>
        <mesh position={[0.03, 0.22, -0.08]} material={glass('#ffffff', 0.7)}><sphereGeometry args={[0.05, 12, 10]} /></mesh>
        <mesh position={[0, 0.1, -0.1]} material={vinyl('#ffffff')}><cylinderGeometry args={[0.07, 0.08, 0.04, 14]} /></mesh>
        <mesh position={[0, 0.03, -0.44]} material={vinyl('#ff9ec7')}><torusGeometry args={[0.1, 0.028, 10, 22]} /></mesh>
        <mesh position={[0, 0.03, -0.44]} material={glass('#e8fbff', 0.35)}><circleGeometry args={[0.09, 20]} /></mesh>
        <RB args={[0.07, 0.17, 0.08]} position={[0, -0.1, -0.04]} mat={vinyl('#ffe066')} r={0.025} />
      </group>
      {/* 2 Rainbow Shotgun: double white barrel, rainbow bands, cloud stock */}
      <group ref={set(2)}>
        {[-0.04, 0.04].map((x) => <mesh key={x} position={[x, 0.06, -0.3]} rotation-x={Math.PI / 2} material={glossy('#ffffff')} castShadow><cylinderGeometry args={[0.038, 0.038, 0.62, 14]} /></mesh>)}
        {RAINBOW.map((c, i) => <RB key={i} args={[0.17, 0.11, 0.05]} position={[0, 0.06, -0.06 - i * 0.085]} mat={vinyl(c)} r={0.02} />)}
        {[0, 1, 2].map((i) => <mesh key={'c' + i} position={[(i - 1) * 0.06, -0.02 + (i % 2) * 0.04, 0.14]} material={vinyl('#ffffff')}><sphereGeometry args={[0.075, 12, 10]} /></mesh>)}
        <RB args={[0.07, 0.15, 0.08]} position={[0, -0.08, 0.0]} mat={vinyl('#ffe066')} r={0.025} />
      </group>
      {/* 3 Spring Rocket: lavender tube, lemon spring coil, red nose rocket, star sight */}
      <group ref={set(3)}>
        <mesh position={[0, 0.1, -0.15]} rotation-x={Math.PI / 2} material={vinyl('#b79cff')} castShadow><cylinderGeometry args={[0.125, 0.125, 0.7, 20]} /></mesh>
        <mesh position={[0, 0.1, -0.5]} rotation-x={Math.PI / 2} material={vinyl('#ffffff')}><torusGeometry args={[0.125, 0.025, 8, 20]} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[0, 0.1, 0.13 - i * 0.045]} material={metal('#ffe066')}><torusGeometry args={[0.135, 0.016, 6, 18]} /></mesh>)}
        <mesh position={[0, 0.1, -0.57]} rotation-x={-Math.PI / 2} material={glossy('#ff5c6c')}><coneGeometry args={[0.09, 0.2, 16]} /></mesh>
        <mesh position={[0, 0.27, -0.12]} material={glow('#fff3a0', 0.6)}><octahedronGeometry args={[0.04, 0]} /></mesh>
        <RB args={[0.07, 0.17, 0.08]} position={[0, -0.08, -0.02]} mat={vinyl('#7fe8c9')} r={0.025} />
        <mesh position={[0, 0.1, 0.2]} material={flat('#3b2f55')}><circleGeometry args={[0.1, 16]} /></mesh>
      </group>
    </>
  );
}

/** Prefer Blender kit GLB weapons; fall back to procedural on load error. */
export function WeaponModels({ refs }: { refs?: React.MutableRefObject<(THREE.Group | null)[]> }) {
  return (
    <GlbBoundary fallback={<ProceduralWeaponModels refs={refs} />}>
      <Suspense fallback={<ProceduralWeaponModels refs={refs} />}>
        <BlenderWeaponModels refs={refs} />
      </Suspense>
    </GlbBoundary>
  );
}

export function Pistol() {
  return (
    <group>
      <RB args={[0.08, 0.1, 0.24]} position={[0, 0.04, -0.08]} mat={vinyl('#7b5cff')} r={0.03} />
      <mesh position={[0, 0.05, -0.23]} rotation-x={Math.PI / 2} material={glossy('#ffe066')}><cylinderGeometry args={[0.025, 0.025, 0.08, 10]} /></mesh>
      <RB args={[0.06, 0.13, 0.07]} position={[0, -0.06, 0]} mat={vinyl('#ff7eb6')} r={0.02} />
    </group>
  );
}
