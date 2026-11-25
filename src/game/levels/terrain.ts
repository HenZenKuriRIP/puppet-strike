// M6: analytic terrain (heightfield) + zones. Pure functions shared by collision, raycasts, renderers, minimap.
import { ARENA } from '../../config/game';

export const H = ARENA.half;
const sstep = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export interface Dome { x: number; z: number; r: number; flat: number; h: number; name: string }
export interface RampPlat { name: string; x0: number; x1: number; z: number; w: number; h: number; plat: number; edge: number }
/** cotton-candy hills: smooth domes with a flat top */
export const DOMES: Dome[] = [];
/** marshmallow ramp + plateau: ground at x0 rising linearly to h at x1, then a flat plateau of length `plat` */
export const RAMPS: RampPlat[] = [];
export const MAX_TERRAIN_H = 3.5;
/** a rise taller than this per move is a cliff (blocks walking) */
export const STEP_UP = 0.75;

export function groundHeight(x: number, z: number): number {
  let h = 0;
  for (let i = 0; i < DOMES.length; i++) {
    const d = DOMES[i], dx = x - d.x, dz = z - d.z;
    const dd = dx * dx + dz * dz; if (dd >= d.r * d.r) continue;
    const dist = Math.sqrt(dd);
    const v = dist <= d.flat ? 1 : sstep((d.r - dist) / (d.r - d.flat));
    if (d.h * v > h) h = d.h * v;
  }
  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i], dz = Math.abs(z - r.z);
    if (x < r.x0 || x > r.x1 + r.plat + r.edge || dz > r.w / 2 + 0.01) continue;
    const lat = sstep((r.w / 2 - dz) / r.edge);
    let hx = x <= r.x1 ? r.h * (x - r.x0) / (r.x1 - r.x0) : r.h;
    if (x > r.x1 + r.plat) hx = r.h * (1 - sstep((x - r.x1 - r.plat) / r.edge));
    const v = hx * lat; if (v > h) h = v;
  }
  return h;
}

/** First hit of the heightfield along a ray (marching + bisection). null when none within max. */
export function terrainRaycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null {
  // quick reject: ray stays above the tallest terrain, or only goes up from above ground
  const endY = oy + dy * max;
  if (oy > MAX_TERRAIN_H + 0.05 && endY > MAX_TERRAIN_H + 0.05) return null;
  const step = 0.45;
  let t0 = 0, below0 = oy < groundHeight(ox, oz);
  if (below0) return 0;
  for (let t = step; ; t += step) {
    const tt = Math.min(t, max);
    const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
    if (y < groundHeight(x, z)) {
      let lo = t0, hi = tt;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (oy + dy * m < groundHeight(ox + dx * m, oz + dz * m)) hi = m; else lo = m; }
      return hi;
    }
    if (tt >= max) return null;
    t0 = tt;
    if (y > MAX_TERRAIN_H && dy >= 0) return null;
  }
}

// ---------- zones ----------
export const PLAZA = { x: 0, z: 0, r: 13 };
export const RIVER = { z: -20, half: 2.7, slow: 0.55 };
export const BRIDGES: { x: number; half: number }[] = [];
export const FOREST = { x0: -34, x1: -15, z0: -16, z1: 7 };
export const VILLAGE = { x0: 16, x1: 34, z0: -14, z1: 14 };

/** W2: terrain/zone parameters per world. `applyTerrain` rewrites the live (shared, mutable) objects above in place. */
export interface TerrainCfg { domes: Dome[]; ramps: RampPlat[]; plaza: { x: number; z: number; r: number }; river: { z: number; half: number; slow: number }; bridges: { x: number; half: number }[]; forest: typeof FOREST; village: typeof VILLAGE }
const NOWHERE = { x0: 9999, x1: 9999, z0: 9999, z1: 9999 };
export const CANDY_TERRAIN: TerrainCfg = {
  domes: [
    { name: 'cotton-hill-sw', x: -24, z: 22, r: 14, flat: 4.5, h: 3.4 },
    { name: 'cotton-hill-ne', x: 26, z: -29, r: 9, flat: 2.5, h: 2 },
  ],
  ramps: [{ name: 'ramp-se', x0: 13, x1: 19.5, z: 24, w: 6, h: 2.4, plat: 7, edge: 0.9 }],
  plaza: { x: 0, z: 0, r: 13 }, river: { z: -20, half: 2.7, slow: 0.55 }, bridges: [-20, 0, 20].map((x) => ({ x, half: 3.2 })),
  forest: { x0: -34, x1: -15, z0: -16, z1: 7 }, village: { x0: 16, x1: 34, z0: -14, z1: 14 },
};
export const BLOCK_TERRAIN: TerrainCfg = {
  domes: [],
  ramps: [
    { name: 'ramp-west', x0: -35, x1: -30, z: 9, w: 7, h: 2.2, plat: 6, edge: 0.9 },
    { name: 'ramp-east', x0: 21, x1: 25.5, z: -8, w: 6, h: 2.0, plat: 6, edge: 0.9 },
  ],
  plaza: { x: 0, z: 0, r: 13 }, river: { z: -30, half: 2.2, slow: 0.6 }, bridges: [-12, 12].map((x) => ({ x, half: 3 })),
  forest: NOWHERE, village: NOWHERE,
};
export function applyTerrain(c: TerrainCfg) {
  DOMES.length = 0; DOMES.push(...c.domes); RAMPS.length = 0; RAMPS.push(...c.ramps);
  Object.assign(PLAZA, c.plaza); Object.assign(RIVER, c.river); BRIDGES.length = 0; BRIDGES.push(...c.bridges);
  Object.assign(FOREST, c.forest); Object.assign(VILLAGE, c.village);
}
applyTerrain(CANDY_TERRAIN);
export type Zone = 'plaza' | 'river' | 'bridge' | 'forest' | 'village' | 'hills' | 'grass';

export function onBridge(x: number, z: number) { if (Math.abs(z - RIVER.z) > RIVER.half + 0.8) return false; for (const b of BRIDGES) if (Math.abs(x - b.x) < b.half) return true; return false; }
export function inRiver(x: number, z: number) { return Math.abs(z - RIVER.z) < RIVER.half && !onBridge(x, z); }
/** movement multiplier (chocolate river is a slow zone, not a wall) */
export function terrainSpeedMult(x: number, z: number) { return inRiver(x, z) ? RIVER.slow : 1; }
export function zoneAt(x: number, z: number): Zone {
  if (onBridge(x, z)) return 'bridge';
  if (inRiver(x, z)) return 'river';
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) return 'plaza';
  if (x > FOREST.x0 - 2 && x < FOREST.x1 && z > FOREST.z0 && z < FOREST.z1) return 'forest';
  if (x > VILLAGE.x0 && x < VILLAGE.x1 && z > VILLAGE.z0 && z < VILLAGE.z1) return 'village';
  if (groundHeight(x, z) > 0.2) return 'hills';
  return 'grass';
}
