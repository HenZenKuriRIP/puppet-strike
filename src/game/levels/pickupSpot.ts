/** POLISH: pure pickup helpers — placement validation (never inside / under solids, always reachable) and the collection test. */
import { ARENA_BOXES, STATIC_BOXES, MOVERS } from './arenaLayout';
import { groundHeight } from './terrain';
import { MECH } from './mech';

export const PICKUP_REST = 0.55;      // resting height of the candy centre above its surface
export const PICKUP_R = 0.45;         // visual / physical radius
export const COLLECT_R = 1.65;        // horizontal pick-up radius
export const COLLECT_DY = 1.9;        // vertical window, measured against the player's body centre (not the feet)
export const MAGNET_R = 3.2;          // gentle magnet range (horizontal)
export const MAGNET_DY = 2.6;
export const REACH_UP = 1.3;          // highest box top a player can hop on (jump apex 1.4)
export const MAP_LIM = 34.5;

export interface PV { x: number; y: number; z: number }

/** can this candy centre be collected by a player whose feet are at `feet` with body height `h` */
export function inCollectRange(pk: PV, feet: PV, h: number, r = COLLECT_R, dy = COLLECT_DY): boolean {
  const dx = pk.x - feet.x, dz = pk.z - feet.z;
  if (dx * dx + dz * dz > r * r) return false;
  return Math.abs(pk.y - (feet.y + h * 0.5)) <= dy;
}
export function inMagnetRange(pk: PV, feet: PV, h: number): boolean {
  const dx = pk.x - feet.x, dz = pk.z - feet.z;
  return dx * dx + dz * dz <= MAGNET_R * MAGNET_R && Math.abs(pk.y - (feet.y + h * 0.5)) <= MAGNET_DY;
}

/** highest walkable surface under (x,z) that a player standing at `refY` could stand on: terrain or a low box top */
export function standHeight(x: number, z: number, refY: number): number {
  const g = groundHeight(x, z); let y = g;
  for (const b of STATIC_BOXES) {
    if (x < b.min.x - 0.2 || x > b.max.x + 0.2 || z < b.min.z - 0.2 || z > b.max.z + 0.2) continue;
    const top = b.max.y;
    if (top > y && top - g <= REACH_UP && top <= refY + 0.6) y = top;
  }
  return y;
}
/** does a candy sphere at (x,y,z) overlap a solid box? */
export function pickupInsideSolid(x: number, y: number, z: number, r = PICKUP_R): boolean {
  for (const b of ARENA_BOXES) {
    if (b.max.x <= b.min.x) continue;
    if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r && y + r > b.min.y + 0.02 && y - r < b.max.y - 0.02) return true;
  }
  return false;
}
/** is (x,z) in the swept area of a moving cover block or on a lift (candy would ride away / get crushed / float) */
export function onMovingThing(x: number, z: number): boolean {
  for (const m of MOVERS) {
    const hx = m.size[0] / 2 + 0.7, hz = m.size[2] / 2 + 0.7;
    const lo = m.axis === 'x' ? m.base[0] - m.amp : m.base[0], hi = m.axis === 'x' ? m.base[0] + m.amp : m.base[0];
    const lo2 = m.axis === 'z' ? m.base[1] - m.amp : m.base[1], hi2 = m.axis === 'z' ? m.base[1] + m.amp : m.base[1];
    if (x > lo - hx && x < hi + hx && z > lo2 - hz && z < hi2 + hz) return true;
  }
  for (const l of MECH.lifts) if (Math.abs(x - l.def.x) < l.def.sx / 2 + 0.8 && Math.abs(z - l.def.z) < l.def.sz / 2 + 0.8) return true;
  return false;
}
export function validPickupAt(x: number, z: number, refY = 0): { ok: boolean; y: number } {
  if (Math.abs(x) > MAP_LIM || Math.abs(z) > MAP_LIM) return { ok: false, y: 0 };
  const s = standHeight(x, z, refY), y = s + PICKUP_REST;
  if (onMovingThing(x, z)) return { ok: false, y };
  if (pickupInsideSolid(x, y, z)) return { ok: false, y };
  return { ok: true, y };
}
/** nearest valid, reachable spot to (x,z); spirals outwards. `clamp` (boss plaza) keeps the result inside radius `maxR`. */
export function resolvePickupSpot(x: number, z: number, refY = 0, maxR = 0): PV {
  const lim = (px: number, pz: number) => { if (maxR <= 0) return [px, pz] as const; const r = Math.hypot(px, pz); return r > maxR ? ([px * maxR / r, pz * maxR / r] as const) : ([px, pz] as const); };
  const [sx, sz] = lim(x, z);
  const first = validPickupAt(sx, sz, refY); if (first.ok) return { x: sx, y: first.y, z: sz };
  for (let ring = 1; ring <= 10; ring++) {
    const rad = ring * 0.8, n = 8 + ring * 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.5;
      const [cx, cz] = lim(sx + Math.cos(a) * rad, sz + Math.sin(a) * rad);
      const v = validPickupAt(cx, cz, refY); if (v.ok) return { x: cx, y: v.y, z: cz };
    }
  }
  // last resort: open ground at the map centre side
  return { x: sx, y: groundHeight(sx, sz) + PICKUP_REST, z: sz };
}
