// W2 boss BRICK COLOSSUS: config + pure helpers (the scheduler is the shared `stepBoss` machine in kingGummy.ts, the sim turns events into hazards / bricks / minions).
//   Phase 1  BRICK SHOWER  : falling-brick barrage (telegraphed circles), brick fans / rings. Head + both arms intact.
//   Phase 2  SHIELD WALLS  : the left arm breaks off → giant shield bricks assemble between it and you (shoot/push them aside), brick soldiers join.
//   Phase 3  FREIGHT & WRECK: chest plate + helmet break off, red core exposed; freight line sweeps across the plaza, wrecking balls, stomp AoE.
import type { BossCfg, BossPhase } from './kingGummy';
import { BRICK_COLORS } from '../levels/blockLayout';

export const COLOSSUS: BossCfg & Record<string, any> = {
  hp: 3000, phases: [1, 0.7, 0.35], transitionTime: 2.4, introTime: 3.4,
  telegraph: { shower: 1.1, fan: 0.6, ring: 0.9, wall: 1.2, summon: 1.0, stomp: 1.25, train: 1.3, wreck: 1.0 },
  cycles: { 1: ['shower', 'fan', 'shower', 'ring', 'fan'], 2: ['wall', 'fan', 'summon', 'shower', 'fan', 'summon'], 3: ['stomp', 'train', 'shower', 'wreck', 'stomp', 'fan'] },
  gap: { 1: 1.9, 2: 1.7, 3: 1.35 },
  shower: { count: 6, radius: 2.0, damage: 13, spread: 6.5, stagger: 0.09 },
  fan: { count: 5, arc: 0.8, speed: 12, damage: 7 }, ring: { count: 16, speed: 8.5, damage: 7 },
  wall: { count: 3, hp: 110, dist: 4.4, size: [3.2, 2.2, 1.2] as [number, number, number], lateral: 3.5 },
  summon: { count: 2, maxMinions: 3, type: 'bsoldier' },
  stomp: { radius: 8, damage: 19 },
  train: { count: 6, radius: 1.9, damage: 16, base: 1.3, sweep: 0.18 }, wreck: { count: 3, radius: 3.0, damage: 17, t0: 1.0, dt: 0.5 },
  moveSpeed: 1.7, keepDist: 11,
  colors: [BRICK_COLORS.red, BRICK_COLORS.blue, BRICK_COLORS.yellow, BRICK_COLORS.green, BRICK_COLORS.orange, BRICK_COLORS.white],
};
/** which model parts are still attached in a phase (the renderer + tests share this) */
export const PART_NAMES = ['legL', 'legR', 'torso', 'armL', 'armR', 'head', 'plate', 'helmet'] as const;
export type PartName = (typeof PART_NAMES)[number];
export const partsAttached = (phase: BossPhase): Record<PartName, boolean> => ({
  legL: true, legR: true, torso: true, head: true, armR: true,
  armL: phase < 2, plate: phase < 3, helmet: phase < 3,
});
/** freight-line hazard positions: a row across the plaza at the player's z (or column at x), alternating direction. Gaps between the circles are the safe lanes. */
export function freightLine(px: number, pz: number, bound: number, flip: boolean): { x: number; z: number; t: number }[] {
  const c = COLOSSUS.train, n = c.count as number, span = (bound + 3) * 2, step = span / (n - 1), out: { x: number; z: number; t: number }[] = [];
  const alongX = Math.abs(px) <= bound + 3 && !flip;
  for (let i = 0; i < n; i++) {
    const u = -(bound + 3) + i * step, t = c.base + (flip ? n - 1 - i : i) * c.sweep;
    out.push(alongX ? { x: u, z: Math.max(-bound - 3, Math.min(bound + 3, pz)), t } : { x: Math.max(-bound - 3, Math.min(bound + 3, px)), z: u, t });
  }
  return out;
}
/** wall bricks assembled between boss and target, perpendicular to the line of fire */
export function wallSlots(bx: number, bz: number, tx: number, tz: number, bound: number): { x: number; z: number; rot: boolean }[] {
  const c = COLOSSUS.wall, dx = tx - bx, dz = tz - bz, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
  const cx = bx + ux * c.dist, cz = bz + uz * c.dist, rot = Math.abs(uz) < Math.abs(ux); // wall faces the shooter: long side across the line of fire
  const out: { x: number; z: number; rot: boolean }[] = [];
  for (let i = 0; i < c.count; i++) { const o = (i - (c.count - 1) / 2) * c.lateral; out.push({ x: Math.max(-bound, Math.min(bound, cx - uz * o)), z: Math.max(-bound, Math.min(bound, cz + ux * o)), rot }); }
  return out;
}
