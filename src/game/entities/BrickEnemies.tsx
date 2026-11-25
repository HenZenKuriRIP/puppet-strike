import * as THREE from 'three';
import { brickGeo, cylBrickGeo, roundCyl } from './geo';

/**
 * W2 "Block City" enemy models. Every brick is ONE moulded mesh (bevelled body + merged studs, see geo.ts brickGeo) sitting in
 * its own wrapper group registered as r['b' + i], so Enemies.tsx can animate the "snap together" spawn and the "fall apart"
 * death by displacing the wrappers (see brickPose). Polish pass: bevelled edges, round bricks (cylinders / balls), minifig
 * faces with eye glints, hands, wheels and rivets — still obviously plastic bricks.
 */
export type BR = Record<string, THREE.Object3D | null>;

const plastic = (color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0.02, clearcoat: 0.75, clearcoatRoughness: 0.12, ...o });
export function makeBrickMats() {
  return {
    kRed: plastic('#e53935'), kBlue: plastic('#1e6fe8'), kYellow: plastic('#ffd21f'), kGreen: plastic('#2fb344'),
    kOrange: plastic('#ff8a1f'), kWhite: plastic('#f4f4f4'), kGrey: plastic('#9aa3ad', { roughness: 0.34 }), kBlack: plastic('#2b2d33', { roughness: 0.4 }),
    kEye: new THREE.MeshStandardMaterial({ color: '#fff27a', emissive: '#ffe04a', emissiveIntensity: 1.1 }),
    kGlint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    kGlass: new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.72 }),
  };
}
export type BrickMats = ReturnType<typeof makeBrickMats>;
export const BRICK_FLASHABLE: (keyof BrickMats)[] = ['kRed', 'kBlue', 'kYellow', 'kGreen', 'kOrange', 'kWhite', 'kGrey', 'kBlack'];

/** legacy unit geometries (kept: other modules import BOX) */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
const BALL = new THREE.SphereGeometry(0.5, 18, 12);
const DOME = new THREE.SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const RING = new THREE.TorusGeometry(0.5, 0.09, 8, 20);
const SMILE = new THREE.TorusGeometry(0.5, 0.09, 6, 14, Math.PI);
type V = [number, number, number];

/** brick factory: each call registers the next part index. Call once per render, in a stable order. */
export function brickFactory(r: BR, m: BrickMats) {
  let n = 0;
  const wrap = (child: JSX.Element) => { const i = n++; return <group key={i} ref={(g) => { r['b' + i] = g; }}>{child}</group>; };
  return {
    /** a bevelled brick; studs on top unless studs === false */
    b(mat: keyof BrickMats, pos: V, size: V, studs: boolean = true, rot?: V) {
      return wrap(<mesh geometry={brickGeo(size, studs)} material={m[mat]} position={pos} rotation={rot} castShadow />);
    },
    /** round brick (cylinder, Y axis; use rot to lay it down) */
    cyl(mat: keyof BrickMats, pos: V, rad: number, h: number, studs: boolean = true, rot?: V) {
      return wrap(<mesh geometry={cylBrickGeo(rad, h, studs)} material={m[mat]} position={pos} rotation={rot} castShadow />);
    },
    ball(mat: keyof BrickMats, pos: V, d: number, sc?: V) {
      return wrap(<mesh geometry={BALL} material={m[mat]} position={pos} scale={sc ?? d} castShadow />);
    },
    dome(mat: keyof BrickMats, pos: V, d: number, sc?: V) {
      return wrap(<mesh geometry={DOME} material={m[mat]} position={pos} scale={sc ?? d} castShadow />);
    },
    /** torus ring (radius d/2) */
    ring(mat: keyof BrickMats, pos: V, d: number, rot?: V, thick = 1) {
      return wrap(<mesh geometry={RING} material={m[mat]} position={pos} scale={[d, d, d * thick]} rotation={rot} />);
    },
    /** minifig-style eye: dark bead + white glint */
    eye(pos: V, d: number, mat: keyof BrickMats = 'kBlack') {
      return wrap(<group position={pos}><mesh geometry={BALL} material={m[mat]} scale={d} /><mesh geometry={BALL} material={m.kGlint} position={[d * 0.18, d * 0.22, -d * 0.34]} scale={d * 0.32} /></group>);
    },
    smile(pos: V, d: number) {
      return wrap(<mesh geometry={SMILE} material={m.kBlack} position={pos} scale={[d, d, d]} rotation={[0, 0, Math.PI]} />);
    },
    count: () => n,
  };
}

/** displacement of brick i for build progress (0..1 assemble) and fall-apart progress (0..1); writes into the wrapper group */
export function brickPose(g: THREE.Object3D, i: number, build: number, apart: number) {
  const sx = Math.sin(i * 12.989 + 1.3), sz = Math.cos(i * 7.233 + 0.4), sy = 0.6 + (Math.sin(i * 3.91) + 1) * 0.5;
  const d = Math.min(0.6, i * 0.04), q = Math.min(1, Math.max(0, (build - d) / 0.4)), k = (1 - q) * (1 - q); // staggered snap-in; every brick is home at build = 1
  let x = sx * 2.2 * k, y = sy * 1.6 * k, z = sz * 2.2 * k, rz = k * 3 * sx, rx = k * 2.4 * sz;
  if (apart > 0) {
    const f = apart * (0.6 + 0.4 * Math.abs(sx));
    x += sx * 2.6 * f; z += sz * 2.6 * f; y += Math.max(-0.25, sy * 1.8 * f - f * f * 3.6); rz += sx * f * 3.2; rx += sz * f * 2.4;
  }
  g.position.set(x, y, z); g.rotation.set(rx, 0, rz); g.visible = build > d * 0.5;
}

type P = { m: BrickMats; r: BR };

export function BSoldier({ m, r }: P) {
  const f = brickFactory(r, m);
  return (
    <group>
      {/* legs + chunky boots */}
      <group ref={(g) => { r['leg-1'] = g; }} position={[-0.17, 0.5, 0]}><group position={[0, -0.5, 0]}>{f.b('kBlue', [0, 0.27, 0], [0.26, 0.46, 0.3], false)}{f.b('kBlack', [0, 0.06, -0.03], [0.3, 0.12, 0.38], false)}</group></group>
      <group ref={(g) => { r.leg1 = g; }} position={[0.17, 0.5, 0]}><group position={[0, -0.5, 0]}>{f.b('kBlue', [0, 0.27, 0], [0.26, 0.46, 0.3], false)}{f.b('kBlack', [0, 0.06, -0.03], [0.3, 0.12, 0.38], false)}</group></group>
      {f.b('kBlack', [0, 0.57, 0], [0.62, 0.14, 0.4], false)}
      {f.b('kYellow', [0, 0.57, -0.205], [0.12, 0.1, 0.03], false)}
      {/* torso: red tunic with studded shoulders and a gold star badge */}
      {f.b('kRed', [0, 0.84, 0], [0.62, 0.46, 0.42])}
      {f.cyl('kYellow', [0, 0.88, -0.225], 0.1, 0.04, false, [Math.PI / 2, 0, 0])}
      {f.b('kWhite', [0, 0.7, -0.215], [0.38, 0.05, 0.02], false)}
      {/* round minifig head + helmet */}
      {f.cyl('kYellow', [0, 1.19, 0], 0.2, 0.3, true)}
      {f.eye([-0.085, 1.21, -0.185], 0.075)}{f.eye([0.085, 1.21, -0.185], 0.075)}
      {f.smile([0, 1.13, -0.19], 0.1)}
      {f.dome('kBlue', [0, 1.3, 0], 0.5, [0.5, 0.3, 0.5])}
      {f.b('kBlue', [0, 1.33, -0.2], [0.34, 0.05, 0.18], false)}
      {f.ball('kRed', [0, 1.46, 0], 0.1)}
      {/* arms with round hands; the right hand carries a toy blaster */}
      <group ref={(g) => { r.arm = g; }} position={[0.4, 1.02, 0]}>
        {f.b('kRed', [0, -0.12, 0], [0.16, 0.3, 0.17], false)}{f.b('kYellow', [0, -0.32, 0], [0.14, 0.16, 0.15], false)}{f.ball('kYellow', [0, -0.46, 0], 0.18)}
        {f.b('kGrey', [0, -0.46, -0.2], [0.09, 0.12, 0.34], false)}{f.cyl('kBlack', [0, -0.46, -0.4], 0.055, 0.07, false, [Math.PI / 2, 0, 0])}
      </group>
      <group position={[-0.4, 1.02, 0]}>{f.b('kRed', [0, -0.12, 0], [0.16, 0.3, 0.17], false)}{f.b('kYellow', [0, -0.32, 0], [0.14, 0.16, 0.15], false)}{f.ball('kYellow', [0, -0.46, 0], 0.18)}</group>
      {/* round shield with rim */}
      {f.cyl('kGrey', [-0.46, 0.84, -0.12], 0.22, 0.06, false, [0, 0, Math.PI / 2])}
      {f.cyl('kYellow', [-0.5, 0.84, -0.12], 0.1, 0.03, false, [0, 0, Math.PI / 2])}
    </group>
  );
}

export function BTurret({ m, r }: P) {
  const f = brickFactory(r, m);
  return (
    <group>
      {/* round studded base plate + red pillar + blue dome head */}
      {f.cyl('kGrey', [0, 0.2, 0], 0.98, 0.4, true)}
      {f.cyl('kBlack', [0, 0.44, 0], 0.62, 0.1, false)}
      {f.cyl('kRed', [0, 0.82, 0], 0.55, 0.7, false)}
      {f.ring('kYellow', [0, 0.82, 0], 1.14, [Math.PI / 2, 0, 0], 0.7)}
      {f.cyl('kBlue', [0, 1.38, 0], 0.68, 0.46, false)}
      {f.dome('kBlue', [0, 1.6, 0], 1.36, [1.36, 0.62, 1.36])}
      {f.cyl('kYellow', [0, 1.98, 0], 0.12, 0.1, true)}
      {/* face plate: big camera eye with glint */}
      {f.b('kYellow', [0, 1.38, -0.66], [0.54, 0.34, 0.07], false)}
      {f.ball('kEye', [0, 1.38, -0.72], 0.34)}{f.ball('kGlint', [0.06, 1.45, -0.86], 0.09)}
      {f.b('kBlack', [-0.35, 1.6, -0.5], [0.22, 0.05, 0.12], false, [0, 0.4, 0.3])}{f.b('kBlack', [0.35, 1.6, -0.5], [0.22, 0.05, 0.12], false, [0, -0.4, -0.3])}
      <group ref={(g) => { r.barrel = g; }} position={[0, 1.38, 0]}>
        <mesh position={[0, 0, -0.95]} rotation-x={Math.PI / 2} geometry={roundCyl(0.16, 0.9, 0.04, 14)} material={m.kYellow} castShadow />
        <mesh position={[0, 0, -1.42]} rotation-x={Math.PI / 2} geometry={roundCyl(0.2, 0.14, 0.05, 14)} material={m.kBlack} />
        <mesh position={[0, 0, -1.5]} rotation-x={Math.PI / 2} geometry={roundCyl(0.1, 0.06, 0.02, 12)} material={m.kEye} />
        <mesh position={[0, 0, -0.55]} rotation-x={Math.PI / 2} geometry={roundCyl(0.2, 0.1, 0.04, 14)} material={m.kGrey} />
      </group>
      {[[-0.78, -0.2], [0.78, -0.2], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => <group key={i}>{f.b('kWhite', [x, 0.6, z], [0.28, 0.26, 0.28])}</group>)}
    </group>
  );
}

export function BGolem({ m, r }: P) {
  const f = brickFactory(r, m);
  return (
    <group>
      <group ref={(g) => { r['leg-1'] = g; }} position={[-0.62, 0.9, 0]}><group position={[0, -0.9, 0]}>{f.b('kGrey', [0, 0.5, 0], [0.8, 0.8, 0.86])}{f.b('kBlack', [0, 0.1, -0.1], [0.92, 0.2, 1.1], false)}</group></group>
      <group ref={(g) => { r.leg1 = g; }} position={[0.62, 0.9, 0]}><group position={[0, -0.9, 0]}>{f.b('kGrey', [0, 0.5, 0], [0.8, 0.8, 0.86])}{f.b('kBlack', [0, 0.1, -0.1], [0.92, 0.2, 1.1], false)}</group></group>
      {f.b('kBlack', [0, 1.0, 0], [1.9, 0.22, 1.2], false)}
      {f.b('kRed', [0, 1.4, 0], [2.0, 0.7, 1.3])}
      {f.b('kOrange', [0, 1.92, 0], [2.0, 0.5, 1.3])}
      {f.b('kYellow', [0, 1.6, -0.67], [0.9, 0.6, 0.07], false)}
      {f.cyl('kBlack', [0, 1.6, -0.72], 0.2, 0.05, false, [Math.PI / 2, 0, 0])}
      {f.cyl('kRed', [0, 1.6, -0.75], 0.12, 0.05, false, [Math.PI / 2, 0, 0])}
      {/* shoulders */}
      {f.ball('kGrey', [-1.18, 2.15, 0], 0.72)}{f.ball('kGrey', [1.18, 2.15, 0], 0.72)}
      {/* neck + head */}
      {f.cyl('kGrey', [0, 2.3, 0], 0.3, 0.22, false)}
      {f.b('kBlue', [0, 2.7, 0], [1.0, 0.7, 0.9])}
      {f.dome('kBlue', [0, 3.0, 0], 1, [1.0, 0.3, 0.9])}
      {f.eye([-0.22, 2.75, -0.45], 0.2, 'kEye')}{f.eye([0.22, 2.75, -0.45], 0.2, 'kEye')}
      {f.b('kBlack', [-0.22, 2.93, -0.46], [0.3, 0.06, 0.06], false, [0, 0, -0.25])}{f.b('kBlack', [0.22, 2.93, -0.46], [0.3, 0.06, 0.06], false, [0, 0, 0.25])}
      {f.b('kBlack', [0, 2.52, -0.46], [0.5, 0.09, 0.05], false)}
      {f.cyl('kRed', [0, 3.2, 0], 0.07, 0.3, false)}{f.ball('kRed', [0, 3.4, 0], 0.2)}
      <group ref={(g) => { r.armL = g; }} position={[-1.3, 2.1, 0]}>
        {f.cyl('kBlue', [0, -0.6, 0], 0.27, 1.1, false)}{f.b('kWhite', [0, -0.28, 0], [0.62, 0.14, 0.62], false)}{f.ball('kWhite', [0, -1.28, 0], 0.82)}{f.b('kBlack', [0, -1.42, -0.3], [0.5, 0.05, 0.05], false)}
      </group>
      <group ref={(g) => { r.armR = g; }} position={[1.3, 2.1, 0]}>
        {f.cyl('kBlue', [0, -0.6, 0], 0.27, 1.1, false)}{f.b('kWhite', [0, -0.28, 0], [0.62, 0.14, 0.62], false)}{f.ball('kWhite', [0, -1.28, 0], 0.82)}{f.b('kBlack', [0, -1.42, -0.3], [0.5, 0.05, 0.05], false)}
      </group>
    </group>
  );
}

export function BCrane({ m, r }: P) {
  const f = brickFactory(r, m);
  const wheelZ = [-1.0, -0.35, 0.3, 0.95];
  return (
    <group>
      {/* tracks: rounded black links with grey road wheels */}
      {[-1, 1].map((s) => <group key={s}>
        {f.b('kBlack', [s * 1.0, 0.3, 0], [0.7, 0.55, 3.0], false)}
        {wheelZ.map((z, i) => <group key={i}>{f.cyl('kGrey', [s * 1.37, 0.3, z], 0.26, 0.1, false, [0, 0, Math.PI / 2])}</group>)}
        {f.cyl('kYellow', [s * 1.45, 0.3, -1.48], 0.1, 0.06, false, [0, 0, Math.PI / 2])}
      </group>)}
      {f.b('kGrey', [0, 0.66, 0], [1.9, 0.3, 2.4])}
      {/* cab */}
      {f.b('kYellow', [0, 1.4, 0.2], [1.7, 1.3, 1.7])}
      {f.b('kBlack', [0, 0.95, 0.2], [1.76, 0.12, 1.76], false)}
      {f.b('kBlue', [0, 1.62, -0.66], [1.1, 0.55, 0.08], false)}
      {f.ball('kGlass', [0, 1.62, -0.72], 1, [0.95, 0.4, 0.04])}
      {f.eye([-0.2, 1.62, -0.78], 0.16, 'kEye')}{f.eye([0.2, 1.62, -0.78], 0.16, 'kEye')}
      {f.b('kRed', [0, 1.15, -0.67], [0.7, 0.12, 0.06], false)}
      {/* mast + turntable */}
      {f.cyl('kOrange', [0, 3.0, 0.5], 0.3, 2.0, false)}
      {f.cyl('kOrange', [0, 4.1, 0.2], 0.48, 0.4, true)}
      {f.cyl('kGrey', [0, 2.05, 0.5], 0.5, 0.18, false)}
      {/* boom: five alternating bricks reaching 9.4 m forward */}
      {[0, 1, 2, 3, 4].map((k) => f.b(k % 2 ? 'kWhite' : 'kRed', [0, 4.2, -0.8 - k * 1.8 - 0.9], [0.5, 0.45, 1.8], false))}
      {f.cyl('kBlack', [0, 4.2, -9.0], 0.2, 0.55, false, [0, 0, 0])}
      <group ref={(g) => { r.ball = g; }} position={[0, 0, -9.0]}>
        {f.b('kGrey', [0, 3.5, 0], [0.12, 1.2, 0.12], false)}
        {f.b('kGrey', [0, 2.4, 0], [0.12, 1.0, 0.12], false)}
        {f.ring('kGrey', [0, 1.84, 0], 0.4, [0, 0, 0], 1)}
        {f.ball('kBlack', [0, 1.1, 0], 1.3)}
        {f.ring('kYellow', [0, 1.1, 0], 1.32, [Math.PI / 2, 0, 0], 0.6)}
        {f.ball('kGlint', [-0.25, 1.4, -0.42], 0.22)}
      </group>
    </group>
  );
}
