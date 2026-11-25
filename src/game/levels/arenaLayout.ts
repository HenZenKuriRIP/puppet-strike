import { ARENA } from '../../config/game';
import type { AABB } from '../combat/raycast';
import { BRIDGES, FOREST, RIVER, groundHeight, inRiver, PLAZA, VILLAGE } from './terrain';
import { DYN_BOXES, applyMech, emptyMech, updateMech, type MechDef } from './mech';

export interface Block { pos: [number, number, number]; size: [number, number, number]; color: string; kind: 'block' | 'wall' | 'stick' | 'house' | 'rail' | 'cane' | 'fountain' | 'tower' | 'plate' }
export interface Lollipop { x: number; z: number; h: number; r: number; color: string }

const pastel = ['#ffb3d1', '#b8f2e6', '#fff1a8', '#c3b5ff', '#ffc9a8', '#a8dcff'];
export const H = ARENA.half;
/** tiny deterministic rng for layout (identical on host and client) */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export interface House { x: number; z: number; w: number; d: number; h: number; color: string }
export interface Mover { base: [number, number]; axis: 'x' | 'z'; amp: number; w: number; phase: number; size: [number, number, number]; color: string }
export interface BalloonDef { x: number; y: number; z: number; kind: 'hp' | 'ammo' }
export interface LayoutDef {
  blocks: Block[]; houses: House[]; lollipops: Lollipop[]; movers: Mover[]; spawns: [number, number][]; playerSpawn: [number, number, number]; slotSpawns: [number, number, number][];
  bossBound: number; springPads: [number, number][]; balloons: BalloonDef[]; pickups: { x: number; z: number; kind: 'hp' | 'ammo' }[]; mech: MechDef;
  /** W2: fixed mount points for static brick enemies (turrets / wrecker cranes); empty in Candy Land */
  mounts?: { turret: [number, number][]; crane: [number, number][] };
}
/** live mount points of the active world */
export const MOUNTS: { turret: [number, number][]; crane: [number, number][] } = { turret: [], crane: [] };
/** Candy Land (world 1). Needs the CANDY terrain to be applied (terrain.ts default). */
export function buildCandyLayout(): LayoutDef {
const SPAWN_POINTS: [number, number][] = [
  [-24, -33], [0, -33], [24, -33], [33, -27], [33, 31], [-33, -27], [-33, -2], [-33, 12], [-14, 33], [14, 33], [33, 8], [-33, 30],
];
const PLAYER_SPAWN: [number, number, number] = [0, 0, 27];
const SLOT_SPAWNS: [number, number, number][] = [[-1.4, 0, 27], [1.4, 0, 27]];
const BOSS_BOUND = 13; // boss arena = the central plaza (square clamp)

const BLOCKS: Block[] = [
  // boundary candy fence
  { pos: [0, 1.5, -H], size: [H * 2 + 2, 3, 1], color: '#ffd6e8', kind: 'wall' },
  { pos: [0, 1.5, H], size: [H * 2 + 2, 3, 1], color: '#ffd6e8', kind: 'wall' },
  { pos: [-H, 1.5, 0], size: [1, 3, H * 2], color: '#d6f5ff', kind: 'wall' },
  { pos: [H, 1.5, 0], size: [1, 3, H * 2], color: '#d6f5ff', kind: 'wall' },
];
const cover = (x: number, z: number, sx: number, sy: number, sz: number, i: number) =>
  BLOCKS.push({ pos: [x, sy / 2, z], size: [sx, sy, sz], color: pastel[i % pastel.length], kind: 'block' });

// ----- central candy-cane plaza -----
BLOCKS.push({ pos: [0, 0.06, 0], size: [5, 0.12, 5], color: '#fff1a8', kind: 'fountain' }); // walkable decal (no collider)
([[10, 0, 1.2, 1.4, 4], [-10, 0, 1.2, 1.4, 4], [0, 10, 4, 1.4, 1.2], [0, -10, 4, 1.4, 1.2]] as const).forEach(([x, z, sx, sy, sz], i) => cover(x, z, sx, sy, sz, i));
for (const [x, z] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) BLOCKS.push({ pos: [x, 2, z], size: [0.55, 4, 0.55], color: '#ffffff', kind: 'cane' });
// ----- open-field covers (south field, north field) -----
([[-8, 17, 3, 1.4, 1.4], [8, 17, 3, 1.4, 1.4], [0, 22, 4, 1, 1.4], [-14, 13, 1.6, 1.6, 4], [14, 12, 1.6, 1.6, 4], [-5, 30, 2.2, 1.2, 2.2], [5, 30, 2.2, 2.4, 2.2],
  [0, -27, 5, 2.2, 1.6], [-10, -29, 3, 1.4, 1.4], [10, -29, 3, 1.4, 1.4], [14, -27, 1.6, 2, 4], [-14, -26, 1.6, 1.6, 4], [-28, 33, 2, 1.4, 2], [10, 33, 2.4, 1.6, 2]] as const)
  .forEach(([x, z, sx, sy, sz], i) => cover(x, z, sx, sy, sz, i + 2));
// ----- chocolate bridges: low rails -----
for (const b of BRIDGES) for (const s of [-1, 1]) BLOCKS.push({ pos: [b.x + s * (b.half - 0.15), 0.45, RIVER.z], size: [0.3, 0.9, RIVER.half * 2 + 1], color: '#7b4a2a', kind: 'rail' });
// ----- gingerbread village (east): houses with alleys -----
const HOUSES: House[] = [
  [20, -10], [27, -10], [20, -3], [28, -2.5], [20.5, 4.5], [27, 5.5], [21, 11.5], [28.5, 12],
].map(([x, z], i) => ({ x, z, w: 3.4 + (i % 3) * 0.3, d: 3.2 + ((i + 1) % 2) * 0.5, h: 2.6 + (i % 2) * 0.5, color: ['#d99a5b', '#e7b27a', '#c98746'][i % 3] }));
for (const h of HOUSES) BLOCKS.push({ pos: [h.x, h.h / 2, h.z], size: [h.w, h.h, h.d], color: h.color, kind: 'house' });
([[24, -6.5, 0.4, 1, 2.2], [24, 1, 0.4, 1, 2.6], [31.5, 2, 2.6, 1, 0.4]] as const).forEach(([x, z, sx, sy, sz], i) => cover(x, z, sx, sy, sz, i + 1));
// ----- lollipop forest (west) + scattered lollipops -----
const LOLLIPOPS: Lollipop[] = [];
{
  const r = rng(1234);
  const gates = [[-33, -2], [-33, 12], [-33, -22]];
  for (let i = 0; i < 26; i++) {
    const x = FOREST.x0 + 1.5 + r() * (FOREST.x1 - FOREST.x0 - 2.5), z = FOREST.z0 + r() * (FOREST.z1 - FOREST.z0);
    if (gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 4)) continue;
    if (LOLLIPOPS.some((l) => Math.hypot(l.x - x, l.z - z) < 3.2)) continue;
    LOLLIPOPS.push({ x, z, h: 3.2 + r() * 2.8, r: 0.9 + r() * 0.7, color: pastel[Math.floor(r() * 6)] });
  }
  for (const [x, z] of [[-18, -33], [18, -24], [-3, -33], [3, 33], [-10, 24], [10, -16], [-33, 33], [33, 33], [-33, -33], [33, -33], [12, 28], [-30, -26]]) {
    if (LOLLIPOPS.some((l) => Math.hypot(l.x - x, l.z - z) < 3)) continue;
    LOLLIPOPS.push({ x, z, h: 3 + ((x + z) & 3), r: 0.9 + (Math.abs(x) % 2) * 0.4, color: pastel[Math.abs(Math.floor(x + z)) % 6] });
  }
}
for (const l of LOLLIPOPS) BLOCKS.push({ pos: [l.x, groundHeight(l.x, l.z) + l.h / 2, l.z], size: [0.25, l.h, 0.25], color: '#ffffff', kind: 'stick' });

const MOVERS: Mover[] = [
  { base: [-11, 11], axis: 'x', amp: 5, w: 0.35, phase: 0, size: [3, 1.6, 1.6], color: '#ffb3d1' },
  { base: [11, -8], axis: 'z', amp: 5, w: 0.3, phase: 1.7, size: [1.6, 1.6, 3], color: '#b8f2e6' },
  { base: [0, 15], axis: 'x', amp: 8, w: 0.25, phase: 3.1, size: [3.4, 1.4, 1.6], color: '#c3b5ff' },
];
const SPRING_PADS: [number, number][] = [[0, -13.5], [-17, 8], [11, 21], [-30, -12]];
const BALLOON_DEFS: BalloonDef[] = [
  { x: -20, y: 5.2, z: 8, kind: 'hp' }, { x: 15, y: 5.6, z: -6, kind: 'ammo' }, { x: 0, y: 6, z: -30, kind: 'hp' },
  { x: 26, y: 6.8, z: 24, kind: 'ammo' }, { x: -26, y: 8, z: -8, kind: 'ammo' }, { x: 8, y: 5, z: 14, kind: 'hp' },
];
const PICKUP_SPOTS: { x: number; z: number; kind: 'hp' | 'ammo' }[] = [
  { x: 5, z: 5, kind: 'hp' }, { x: -5, z: -5, kind: 'ammo' }, { x: 23.5, z: 24, kind: 'ammo' }, { x: -24, z: 22, kind: 'hp' },
  { x: 25.6, z: 1.5, kind: 'hp' }, { x: -24, z: -6, kind: 'ammo' }, { x: 0, z: -24, kind: 'hp' }, { x: 14, z: 28, kind: 'ammo' },
];
return { blocks: BLOCKS, houses: HOUSES, lollipops: LOLLIPOPS, movers: MOVERS, spawns: SPAWN_POINTS, playerSpawn: PLAYER_SPAWN, slotSpawns: SLOT_SPAWNS, bossBound: BOSS_BOUND, springPads: SPRING_PADS, balloons: BALLOON_DEFS, pickups: PICKUP_SPOTS, mech: emptyMech() };
}

// ---------------- live layout (mutated in place by applyLayout; every importer sees the active world) ----------------
export const BLOCKS: Block[] = [];
export const HOUSES: House[] = [];
export const LOLLIPOPS: Lollipop[] = [];
export const MOVERS: Mover[] = [];
export const SPAWN_POINTS: [number, number][] = [];
export const PLAYER_SPAWN: [number, number, number] = [0, 0, 27];
export const SLOT_SPAWNS: [number, number, number][] = [];
export const SPRING_PADS: [number, number][] = [];
export const SPRING_VEL = 16;
export const BALLOON_DEFS: BalloonDef[] = [];
export const PICKUP_SPOTS: { x: number; z: number; kind: 'hp' | 'ammo' }[] = [];
export let BOSS_BOUND = 13; // boss arena = the central plaza (square clamp)
/** static boxes (Rapier colliders + collision). Movers + dynamic mechanics are appended after STATIC_COUNT and are NOT Rapier colliders. */
export const STATIC_BOXES: AABB[] = [];
export const ARENA_BOXES: AABB[] = [];
export const MOVER_BOXES: AABB[] = [];
const toBox = (b: Block): AABB => ({
  min: { x: b.pos[0] - b.size[0] / 2, y: b.pos[1] - b.size[1] / 2, z: b.pos[2] - b.size[2] / 2 },
  max: { x: b.pos[0] + b.size[0] / 2, y: b.pos[1] + b.size[1] / 2, z: b.pos[2] + b.size[2] / 2 },
});
const fill = <T,>(dst: T[], src: T[]) => { dst.length = 0; dst.push(...src); };
export function applyLayout(l: LayoutDef) {
  fill(BLOCKS, l.blocks); fill(HOUSES, l.houses); fill(LOLLIPOPS, l.lollipops); fill(MOVERS, l.movers); fill(SPAWN_POINTS, l.spawns); fill(SLOT_SPAWNS, l.slotSpawns);
  fill(SPRING_PADS, l.springPads); fill(BALLOON_DEFS, l.balloons); fill(PICKUP_SPOTS, l.pickups);
  MOUNTS.turret.length = 0; MOUNTS.crane.length = 0; for (const m of l.mounts?.turret ?? []) MOUNTS.turret.push(m); for (const m of l.mounts?.crane ?? []) MOUNTS.crane.push(m);
  PLAYER_SPAWN[0] = l.playerSpawn[0]; PLAYER_SPAWN[1] = l.playerSpawn[1]; PLAYER_SPAWN[2] = l.playerSpawn[2]; BOSS_BOUND = l.bossBound;
  fill(STATIC_BOXES, BLOCKS.filter((b) => b.kind !== 'fountain' && b.kind !== 'plate').map(toBox));
  MOVER_BOXES.length = 0; for (let i = 0; i < MOVERS.length; i++) MOVER_BOXES.push({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
  applyMech(l.mech);
  fill(ARENA_BOXES, [...STATIC_BOXES, ...MOVER_BOXES, ...DYN_BOXES]);
  updateMovers(0);
}
export function moverPos(m: Mover, t: number): [number, number] {
  const o = Math.sin(t * m.w + m.phase) * m.amp;
  return m.axis === 'x' ? [m.base[0] + o, m.base[1]] : [m.base[0], m.base[1] + o];
}
/** write mover + mechanic boxes for sim time t (called every sim tick / client frame) */
export function updateMovers(t: number, bodies?: import('./mech').Body[]) {
  MOVERS.forEach((m, i) => {
    const [x, z] = moverPos(m, t), b = MOVER_BOXES[i];
    b.min.x = x - m.size[0] / 2; b.max.x = x + m.size[0] / 2; b.min.z = z - m.size[2] / 2; b.max.z = z + m.size[2] / 2; b.min.y = 0; b.max.y = m.size[1];
  });
  updateMech(t, bodies);
}
export const isWater = inRiver;
export { PLAZA, VILLAGE, FOREST };
applyLayout(buildCandyLayout());
