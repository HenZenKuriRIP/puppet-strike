// W2: Block City layout (toy-brick city). Needs BLOCK_TERRAIN applied (ramps / canal / bridges come from terrain.ts).
import { H, type Block, type LayoutDef } from './arenaLayout';
import { BRIDGES, RIVER } from './terrain';
import type { MechDef } from './mech';

export const BRICK_COLORS = { red: '#e53935', blue: '#1e6fe8', yellow: '#ffd21f', green: '#2fb344', orange: '#ff8a1f', white: '#f4f4f4', purple: '#8a4fff', pink: '#ff7eb6' };
const P = [BRICK_COLORS.red, BRICK_COLORS.blue, BRICK_COLORS.yellow, BRICK_COLORS.green, BRICK_COLORS.orange, BRICK_COLORS.purple];

export function buildBlockLayout(): LayoutDef {
  const blocks: Block[] = [
    { pos: [0, 1.5, -H], size: [H * 2 + 2, 3, 1], color: BRICK_COLORS.blue, kind: 'wall' },
    { pos: [0, 1.5, H], size: [H * 2 + 2, 3, 1], color: BRICK_COLORS.red, kind: 'wall' },
    { pos: [-H, 1.5, 0], size: [1, 3, H * 2], color: BRICK_COLORS.yellow, kind: 'wall' },
    { pos: [H, 1.5, 0], size: [1, 3, H * 2], color: BRICK_COLORS.green, kind: 'wall' },
  ];
  const cover = (x: number, z: number, sx: number, sy: number, sz: number, i: number) => blocks.push({ pos: [x, sy / 2, z], size: [sx, sy, sz], color: P[i % P.length], kind: 'block' });
  // plaza: 4 low walls + 4 brick pillars
  ([[10, 0, 1.2, 1.4, 4], [-10, 0, 1.2, 1.4, 4], [0, 10, 4, 1.4, 1.2], [0, -10, 4, 1.4, 1.2]] as const).forEach(([x, z, sx, sy, sz], i) => cover(x, z, sx, sy, sz, i));
  for (const [x, z] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) blocks.push({ pos: [x, 2, z], size: [1.4, 4, 1.4], color: BRICK_COLORS.white, kind: 'tower' });
  // low covers around the city
  ([[-16, 26, 3, 1.4, 1.4], [16, 26, 3, 1.4, 1.4], [0, 31, 4, 1.2, 1.4], [-30, 18, 1.6, 1.6, 4], [24, 31, 2.2, 1.6, 2.2], [-12, -26, 3, 1.4, 1.4],
    [-4, -19.5, 1.6, 1.6, 3], [8, -22, 3, 1.4, 1.4], [30, -28, 2, 1.6, 3], [-33, -24, 2, 1.4, 2], [32, 10, 2.4, 1.2, 2.4], [-28, -4, 3, 1.4, 1.4], [3, 20, 2.2, 2, 2.2]] as const)
    .forEach(([x, z, sx, sy, sz], i) => cover(x, z, sx, sy, sz, i + 2));
  // tall brick towers (solid; cover + skyline)
  for (const [x, z, h] of [[-30, -12, 9], [30, 18, 12], [-24, 30, 7], [22, -23, 10]]) blocks.push({ pos: [x, h / 2, z], size: [4, h, 4], color: P[(Math.abs(x) + h) % P.length | 0], kind: 'tower' });
  // brick buildings
  const houses = [[-20, -25, 3.6, 3.2, 2.8, BRICK_COLORS.red], [18, -25.5, 3.6, 3.2, 2.6, BRICK_COLORS.yellow], [27, -17, 3.6, 3.2, 3, BRICK_COLORS.blue], [18, 29, 3.4, 3.2, 2.6, BRICK_COLORS.green]]
    .map(([x, z, w, d, h, color]) => ({ x: x as number, z: z as number, w: w as number, d: d as number, h: h as number, color: color as string }));
  for (const h of houses) blocks.push({ pos: [h.x, h.h / 2, h.z], size: [h.w, h.h, h.d], color: h.color, kind: 'house' });
  // lift platforms (reachable only with the lifts)
  blocks.push({ pos: [-31.5, 1.6, -22], size: [6, 3.2, 6], color: BRICK_COLORS.orange, kind: 'block' });
  blocks.push({ pos: [33, 1.3, 24], size: [4, 2.6, 6], color: BRICK_COLORS.purple, kind: 'block' });
  // canal bridge rails
  for (const b of BRIDGES) for (const s of [-1, 1]) blocks.push({ pos: [b.x + s * (b.half - 0.15), 0.45, RIVER.z], size: [0.3, 0.9, RIVER.half * 2 + 1], color: BRICK_COLORS.red, kind: 'rail' });

  const mech: MechDef = {
    bricks: [[-9, 19, 3.2, 1.6], [9, 19, 1.6, 3.2], [-4, 10, 3.2, 1.6], [5, -10, 1.6, 3.2], [-22, -4, 3.2, 1.6], [22, 12, 1.6, 3.2]]
      .map(([x, z, sx, sz], i) => ({ x, z, size: [sx, 1.6, sz] as [number, number, number], color: [BRICK_COLORS.red, BRICK_COLORS.blue, BRICK_COLORS.yellow, BRICK_COLORS.green, BRICK_COLORS.orange, BRICK_COLORS.purple][i] })),
    chains: [
      { x: -14, z: 14, axis: 'x', sign: 1, count: 9, spacing: 1.8, w: 3, h: 3.4, thick: 0.6, color: BRICK_COLORS.red, delay: 0.17, damage: 85 },
      { x: 27, z: -3, axis: 'z', sign: 1, count: 8, spacing: 1.8, w: 3, h: 3.4, thick: 0.6, color: BRICK_COLORS.blue, delay: 0.17, damage: 85 },
    ],
    train: { path: [[-17, -17], [17, -17], [17, 17], [-17, 17]], speed: 6.5, cars: 4, carLen: 3.4, gap: 0.4, w: 1.8, h: 1.7, phase: 0, colors: [BRICK_COLORS.red, BRICK_COLORS.yellow, BRICK_COLORS.blue, BRICK_COLORS.green] },
    lifts: [
      { x: -26.5, z: -22, sx: 3, sz: 3, lo: 0, hi: 3.2, period: 9, phase: 0, color: BRICK_COLORS.yellow },
      { x: 28.2, z: 24.5, sx: 3, sz: 3, lo: 0, hi: 2.6, period: 8, phase: 0.4, color: BRICK_COLORS.green },
    ],
    portals: [
      { a: [-31, 24], b: [31.5, -14], color: '#8a4fff' },
      { a: [-33, -5], b: [33, 6], color: '#18c8d8' },
    ],
    conveyors: [
      { x: -6, z: -24, sx: 8, sz: 2.4, dx: 1, dz: 0, speed: 3.4 },
      { x: 6, z: -24, sx: 8, sz: 2.4, dx: -1, dz: 0, speed: 3.4 },
    ],
    fans: [{ x: 33, z: -1, ang: Math.PI, len: 10, width: 5, force: 20 }],
  };
  return {
    blocks, houses, lollipops: [], movers: [
      { base: [-14, -9], axis: 'x', amp: 4, w: 0.33, phase: 0, size: [3, 1.6, 1.6], color: BRICK_COLORS.pink },
      { base: [13, 3], axis: 'z', amp: 5, w: 0.3, phase: 1.7, size: [1.6, 1.6, 3], color: BRICK_COLORS.blue },
    ],
    spawns: [[-24, -34], [0, -34], [24, -34], [34, -26], [34, 30], [-34, -26], [-34, -4], [-34, 22], [-14, 34], [14, 34], [34, 2], [-34, 34]],
    playerSpawn: [0, 0, 27], slotSpawns: [[-1.4, 0, 27], [1.4, 0, 27]], bossBound: 13,
    mounts: { turret: [[-22, 8], [22, 2], [-6, 30], [28, -24.5]], crane: [[-22, -9], [23, 18]] },
    springPads: [[0, -13.5], [-14, 24], [14, 24], [30, -4]],
    balloons: [
      { x: -20, y: 5.2, z: 2, kind: 'hp' }, { x: 15, y: 5.6, z: -6, kind: 'ammo' }, { x: 0, y: 6, z: -30, kind: 'hp' },
      { x: 26, y: 6.8, z: 28, kind: 'ammo' }, { x: -26, y: 8, z: -14, kind: 'ammo' }, { x: 8, y: 5, z: 14, kind: 'hp' },
    ],
    pickups: [
      { x: 5, z: 5, kind: 'hp' }, { x: -5, z: -5, kind: 'ammo' }, { x: -25, z: -17, kind: 'hp' }, { x: 24, z: 22, kind: 'ammo' },
      { x: 0, z: -19.5, kind: 'ammo' }, { x: -24, z: 18, kind: 'hp' }, { x: 12, z: -15.5, kind: 'hp' }, { x: 0, z: 24, kind: 'ammo' },
    ],
    mech,
  };
}
