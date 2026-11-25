import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../core/world';
import { useWorldId } from '../levels/worlds';
import { partsAttached, PartName, COLOSSUS } from '../boss/colossus';
import { makeBrickMats, BrickMats, BRICK_FLASHABLE } from './BrickEnemies';
import { brickGeo, cylBrickGeo } from './geo';

/**
 * W2 boss BRICK COLOSSUS: a ~7.5 m robot built from ~45 visible bricks (chunky studs, one shared set of plastic materials).
 *  - phase 1: head, helmet, chest plate, both arms
 *  - phase 2: the LEFT ARM breaks off and tumbles to the floor (shield-wall phase)
 *  - phase 3: chest plate + helmet break off → the glowing red core is exposed
 *  - defeat: every brick scatters and falls (disassembly), see `scatter`.
 * Detachable parts live in a world-space layer (not under the walking body) so they stay where they fall.
 */
const BALL_G = new THREE.SphereGeometry(0.5, 20, 14);
const GLINT = new THREE.MeshBasicMaterial({ color: '#ffffff' });
type V3t = [number, number, number];
interface BDef { m: keyof BrickMats | 'kCore'; pos: V3t; size: V3t; studs?: boolean; shape?: 'ball' | 'cyl' }
type Part = 'legL' | 'legR' | 'body' | 'armR' | 'armL' | 'plate' | 'helmet';
const PART_OF: Record<Part, PartName | null> = { legL: 'legL', legR: 'legR', body: 'torso', armR: 'armR', armL: 'armL', plate: 'plate', helmet: 'helmet' };
const leg = (s: number): BDef[] => [
  { m: 'kRed', pos: [s * 1.1, 0.25, -0.35], size: [1.5, 0.5, 2.1], studs: false },
  { m: 'kBlue', pos: [s * 1.1, 1.2, 0], size: [1.3, 1.4, 1.5] }, { m: 'kYellow', pos: [s * 1.1, 0.72, -0.78], size: [0.9, 0.3, 0.1], studs: false }, { m: 'kBlue', pos: [s * 1.1, 2.35, 0], size: [1.3, 0.9, 1.5] },
];
const arm = (s: number): BDef[] => [
  { m: 'kYellow', pos: [s * 2.35, 5.35, 0], size: [1.2, 0.5, 1.4] },
  { m: 'kGrey', pos: [s * 2.65, 5.1, 0], size: [1.3, 1.3, 1.3], shape: 'ball' },
  { m: 'kGreen', pos: [s * 2.65, 4.0, 0], size: [0.9, 1.8, 0.9], studs: false, shape: 'cyl' }, { m: 'kOrange', pos: [s * 2.65, 2.55, 0], size: [1.5, 1.4, 1.5], shape: 'ball' },
  { m: 'kBlack', pos: [s * 2.65, 2.4, -0.72], size: [1.0, 0.1, 0.1], studs: false },
];
const BODY: BDef[] = [
  { m: 'kYellow', pos: [0, 3.15, 0], size: [3.4, 0.7, 2.0] }, { m: 'kRed', pos: [0, 4.4, 0], size: [3.8, 1.8, 2.4] },
  { m: 'kYellow', pos: [0, 3.75, -1.22], size: [3.8, 0.3, 0.06], studs: false }, { m: 'kBlue', pos: [0, 4.6, 1.5], size: [2.2, 2.0, 0.8] },
  { m: 'kCore', pos: [0, 4.6, -1.1], size: [1.3, 1.1, 0.16], studs: false }, { m: 'kGrey', pos: [0, 5.55, 0], size: [1.0, 0.3, 1.0], studs: false, shape: 'cyl' },
  { m: 'kBlue', pos: [0, 6.25, 0], size: [2.0, 1.1, 1.8], studs: false }, { m: 'kBlack', pos: [0, 5.95, -0.93], size: [1.0, 0.12, 0.05], studs: false }, { m: 'kBlack', pos: [0, 4.0, 0], size: [3.9, 0.12, 2.5], studs: false },
  { m: 'kRed', pos: [0.6, 7.05, 0.2], size: [0.25, 0.55, 0.25], studs: false, shape: 'cyl' }, { m: 'kRed', pos: [0.6, 7.4, 0.2], size: [0.45, 0.45, 0.45], studs: false, shape: 'ball' }, { m: 'kYellow', pos: [-0.9, 5.4, 0], size: [0.7, 0.3, 1.5] }, { m: 'kYellow', pos: [0.9, 5.4, 0], size: [0.7, 0.3, 1.5] },
];
const DEFS: Record<Part, BDef[]> = {
  legL: leg(-1), legR: leg(1), body: BODY, armR: arm(1), armL: arm(-1),
  plate: [{ m: 'kWhite', pos: [0, 4.6, -1.3], size: [2.9, 1.5, 0.3] }, { m: 'kYellow', pos: [0, 4.6, -1.5], size: [0.5, 1.1, 0.1], studs: false }],
  helmet: [{ m: 'kYellow', pos: [0, 6.95, 0], size: [2.2, 0.5, 2.0] }, { m: 'kRed', pos: [0, 7.4, 0.1], size: [1.0, 0.4, 1.0], shape: 'cyl' }],
};
const PIVOT: Partial<Record<Part, V3t>> = { legL: [-1.1, 2.6, 0], legR: [1.1, 2.6, 0], armL: [-2.65, 5.1, 0], armR: [2.65, 5.1, 0] };
interface W { g: THREE.Group | null; y: number; i: number }
const TELE_COL: Record<string, string> = { shower: '#6fb4ff', fan: '#ffffff', ring: '#ffffff', wall: '#ffd21f', summon: '#2fb344', stomp: '#ff3030', train: '#ff3030', wreck: '#ff8a1f' };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** per-brick displacement: u 0..1 progress (explode outward, fall to the floor with a small bounce) */
function scatter(w: W, u: number, spread: number) {
  const g = w.g; if (!g) return;
  if (u <= 0) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); return; }
  const sx = Math.sin(w.i * 12.989 + 1.3), sz = Math.cos(w.i * 7.233 + 0.4), f = clamp01(u), fall = f * f;
  const floorY = -w.y + 0.3 + (w.i % 3) * 0.28 * 0.5;
  g.position.set(sx * spread * Math.sqrt(f), Math.max(floorY, 0.5 * Math.sin(f * Math.PI) * (1.5 + Math.abs(sz) * 2) - (w.y - 0.3) * fall), sz * spread * Math.sqrt(f));
  g.rotation.set(sz * f * 3.1, 0, sx * f * 3.4);
}

function ColossusModel() {
  const m = useMemo(() => ({ ...makeBrickMats(), kCore: new THREE.MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff2a10', emissiveIntensity: 0.9, roughness: 0.3 }) }), []);
  const root = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!);
  const piv = useRef<Partial<Record<Part, THREE.Group | null>>>({});
  const outer = useRef<Partial<Record<Part, THREE.Group | null>>>({});
  const wr = useRef<Record<Part, W[]>>({ legL: [], legR: [], body: [], armR: [], armL: [], plate: [], helmet: [] });
  const det = useRef<Record<string, { t0: number; x: number; z: number; ry: number } | null>>({ armL: null, plate: null, helmet: null });
  const flashMats = useMemo(() => BRICK_FLASHABLE.map((k) => m[k] as THREE.MeshStandardMaterial), [m]);
  const col = useMemo(() => new THREE.Color(), []);
  const parts = Object.keys(DEFS) as Part[];
  const loose: Part[] = ['armL', 'plate', 'helmet'];

  useFrame(() => {
    const id = world.boss.id, e = id >= 0 ? world.enemies.items[id] : null;
    const on = !!e && e.active && e.type === 'colossus';
    root.current.visible = on; for (const p of loose) { const o = outer.current[p]; if (o) o.visible = on; }
    if (!on || !e) { det.current.armL = det.current.plate = det.current.helmet = null; return; }
    const a = world.alpha, t = world.time, B = world.boss, s = B.s;
    const px = THREE.MathUtils.lerp(e.prev.x, e.pos.x, a), pz = THREE.MathUtils.lerp(e.prev.z, e.pos.z, a), py = e.pos.y;
    const at = partsAttached(s.phase);
    const dying = e.dead, u = dying ? 1 - Math.max(0, e.deathTimer) / 3.2 : 0;
    // ---- body
    root.current.position.set(px, py, pz); body.current.rotation.y = e.facing;
    let lift = 0, sy = 1 + Math.sin(e.animPhase * 2.6) * 0.012;
    if (B.tele === 'stomp') lift = 0.7 * (0.5 + 0.5 * Math.sin(t * 6)); if (B.slamT > 0) { lift = -0.25; sy = 0.93; }
    if (s.transition > 0) lift = Math.sin(t * 40) * 0.06;
    body.current.position.y = lift; body.current.scale.set(1, sy, 1);
    const arms = B.tele === 'stomp' || B.tele === 'shower' ? 2.7 : B.tele === 'wall' || B.tele === 'summon' ? 1.6 : B.tele ? 1.1 : 0.25 + Math.sin(t * 2.2) * 0.06;
    const swing = Math.sin(e.animPhase * 2.2) * Math.min(0.5, Math.hypot(e.vel.x, e.vel.z) * 0.35);
    const set = (p: Part, rx: number, rz: number) => { const g = piv.current[p]; if (g) g.rotation.set(rx, 0, rz); };
    set('legL', swing, 0); set('legR', -swing, 0); set('armR', -swing * 0.7, -arms); set('armL', swing * 0.7, arms);
    // ---- detachable parts
    for (const p of loose) {
      const o = outer.current[p]!, key = PART_OF[p]!, d = det.current;
      if (at[key]) { d[p] = null; o.position.set(px, py + lift, pz); o.rotation.y = e.facing; if (p === 'armL') o.scale.set(1, sy, 1); }
      else {
        if (!d[p]) d[p] = { t0: t, x: px, z: pz, ry: e.facing };
        const q = d[p]!; o.position.set(q.x + (p === 'armL' ? Math.cos(q.ry) * -3.2 : 0), py, q.z + (p === 'armL' ? -Math.sin(q.ry) * -3.2 : 0)); o.rotation.y = q.ry;
        const k = clamp01((t - q.t0) / 1.0); for (const w of wr.current[p]) scatter(w, k, p === 'armL' ? 1.4 : 2.2);
        if (p === 'armL') { const g = piv.current.armL; if (g) g.rotation.set(0, 0, 0); }
      }
    }
    if (!at.armL) { const g = piv.current.armL; if (g) g.rotation.z = 0; }
    // ---- defeat: disassemble everything
    for (const p of parts) { if (loose.includes(p) && !at[PART_OF[p]!]) { if (dying) for (const w of wr.current[p]) scatter(w, 1, 3 + u * 5); continue; } for (const w of wr.current[p]) scatter(w, dying ? u : 0, 3.4 + u * 4); }
    // ---- flash / telegraph tint
    const flash = e.flash > 0 ? 0.55 : 0, tc = B.tele ? col.set(TELE_COL[B.tele] ?? '#ffffff') : null, pulse = B.tele ? (Math.sin(t * 28) > 0 ? 0.35 : 0.1) : 0;
    for (const f of flashMats) { if (tc) f.emissive.copy(tc).multiplyScalar(pulse); else f.emissive.setRGB(flash, flash * 0.6, flash * 0.5); }
    m.kCore.emissiveIntensity = (s.phase === 3 ? 1.6 + Math.sin(t * 8) * 0.5 : 0.5) + (e.flash > 0 ? 1 : 0);
  });

  const bricks = (p: Part, base: V3t = [0, 0, 0]) => DEFS[p].map((b, i) => {
    const idx = i + parts.indexOf(p) * 17;
    const geo = b.shape === 'ball' ? BALL_G : b.shape === 'cyl' ? cylBrickGeo(b.size[0] / 2, b.size[1], b.studs !== false, 0.2) : brickGeo(b.size, b.studs !== false, 0.9, 0.2);
    return (
      <group key={i} ref={(g) => { wr.current[p][i] = { g, y: b.pos[1] - base[1], i: idx }; }}>
        <mesh geometry={geo} material={m[b.m]} position={b.pos} scale={b.shape === 'ball' ? b.size : undefined} castShadow />
      </group>
    );
  });
  const eyes = [-1, 1].map((sg) => (
    <group key={sg} position={[0.45 * sg, 6.35, -0.95]}>
      <mesh scale={0.34} material={m.kEye} geometry={BALL_G} />
      <mesh position={[0.05, 0.07, -0.1]} scale={0.1} material={GLINT} geometry={BALL_G} />
    </group>));
  const eyeL = eyes[0], eyeR = eyes[1];
  const pivoted = (p: Part, ref: 'inner' | 'outer') => {
    const pv = PIVOT[p]!;
    return (
      <group ref={(g) => { piv.current[p] = g; }} position={pv}><group position={[-pv[0], -pv[1], -pv[2]]}>{bricks(p, [0, 0, 0])}</group></group>
    );
  };
  return (<>
    <group ref={root} visible={false}>
      <group ref={body}>
        {pivoted('legL', 'inner')}{pivoted('legR', 'inner')}{pivoted('armR', 'inner')}
        {bricks('body')}{eyeL}{eyeR}
      </group>
    </group>
    <group ref={(g) => { outer.current.armL = g; }} visible={false}>{pivoted('armL', 'outer')}</group>
    <group ref={(g) => { outer.current.plate = g; }} visible={false}>{bricks('plate')}</group>
    <group ref={(g) => { outer.current.helmet = g; }} visible={false}>{bricks('helmet')}</group>
  </>);
}

/** mount the colossus model only in Block City (hidden unless the boss is alive) */
export function Colossus() { return useWorldId() === 'block' ? <ColossusModel /> : null; }
export const COLOSSUS_MODEL_BRICKS = Object.values(DEFS).reduce((n, d) => n + d.length, 0);
void COLOSSUS;
