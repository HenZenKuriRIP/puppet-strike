// W2: interactive map mechanics (pure logic, no world / render imports → unit-testable, identical on host and client replica).
//   - pushable / shootable / destructible giant bricks  - toy train on a closed track (moving platform + hazard)
//   - brick lifts (vertical platforms)                    - conveyor belts
//   - giant domino chains (shoot one → the chain falls, crushing enemies in its path)
//   - toy portal pairs                                    - fans that bend projectiles
// Everything that moves is either a pure function of sim time (train, lifts, domino fall animation) or small explicit state
// (brick positions / hp, domino trigger times) that the host sends in each co-op snapshot (see `mechSnap` / `applyMechSnap`).
import type { AABB } from '../combat/raycast';
import type { V3 } from '../core/math';

export interface BrickDef { x: number; z: number; size: [number, number, number]; color: string; hp?: number }
export interface ChainDef { x: number; z: number; axis: 'x' | 'z'; sign: 1 | -1; count: number; spacing: number; w: number; h: number; thick: number; color: string; delay: number; damage: number }
export interface TrainDef { path: [number, number][]; speed: number; cars: number; carLen: number; gap: number; w: number; h: number; phase: number; colors: string[] }
export interface LiftDef { x: number; z: number; sx: number; sz: number; lo: number; hi: number; period: number; phase: number; color: string }
export interface PortalPair { a: [number, number]; b: [number, number]; color: string }
export interface ConveyorDef { x: number; z: number; sx: number; sz: number; dx: number; dz: number; speed: number }
export interface FanDef { x: number; z: number; ang: number; len: number; width: number; force: number }
export interface MechDef { bricks: BrickDef[]; chains: ChainDef[]; train: TrainDef | null; lifts: LiftDef[]; portals: PortalPair[]; conveyors: ConveyorDef[]; fans: FanDef[] }
export const emptyMech = (): MechDef => ({ bricks: [], chains: [], train: null, lifts: [], portals: [], conveyors: [], fans: [] });

export const MECH_CFG = {
  maxBricks: 32, giantHp: 120, smallHp: 45, smallSize: [1.3, 0.9, 1.3] as [number, number, number],
  pushMax: 2.6, pushRatio: 0.6, friction: 3.2, impulsePerDmg: 0.1, impulseMax: 3.5,
  fallTime: 0.55, resetAfter: 16, domino: { enemyDamage: 85, bossDamage: 45, knock: 7 },
  portal: { r: 1.1, cooldown: 1.3, exitDist: 2.1 },
  train: { hurtPlayer: 24, hurtEnemy: 70, hitCd: 0.9 },
};

// ------------------------------------------------------------------ boxes
const FAR = -9999;
const mkBox = (): AABB => ({ min: { x: FAR, y: FAR, z: FAR }, max: { x: FAR, y: FAR, z: FAR } });
const setBox = (b: AABB, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => { b.min.x = x0; b.min.y = y0; b.min.z = z0; b.max.x = x1; b.max.y = y1; b.max.z = z1; };
const hideBox = (b: AABB) => setBox(b, FAR, FAR, FAR, FAR, FAR, FAR);
/** collision boxes of every dynamic object (appended to ARENA_BOXES by the layout; NOT rapier colliders). Fixed length per applied world. */
export const DYN_BOXES: AABB[] = [];

// ------------------------------------------------------------------ live state
export interface Brick { slot: number; alive: boolean; tier: 0 | 1; x: number; z: number; sx: number; sy: number; sz: number; color: string; hp: number; maxHp: number; vx: number; vz: number; shake: number; box: AABB }
export interface Chain { def: ChainDef; trig: number[]; hit: Set<number>[]; boxes: AABB[] }
export interface MechState {
  def: MechDef; bricks: Brick[]; chains: Chain[]; train: { def: TrainDef; len: number; segs: { x: number; z: number; dx: number; dz: number; l: number; s0: number }[]; boxes: AABB[]; hitCd: Map<number, number> } | null;
  lifts: { def: LiftDef; box: AABB; top: number }[]; boxStart: number;
}
export const MECH: MechState = { def: emptyMech(), bricks: [], chains: [], train: null, lifts: [], boxStart: 0 };

export function applyMech(def: MechDef) {
  DYN_BOXES.length = 0;
  MECH.def = def; MECH.bricks = []; MECH.chains = []; MECH.train = null; MECH.lifts = [];
  for (let i = 0; i < MECH_CFG.maxBricks; i++) {
    const d = def.bricks[i], box = mkBox(); DYN_BOXES.push(box);
    MECH.bricks.push(d
      ? { slot: i, alive: true, tier: 0, x: d.x, z: d.z, sx: d.size[0], sy: d.size[1], sz: d.size[2], color: d.color, hp: d.hp ?? MECH_CFG.giantHp, maxHp: d.hp ?? MECH_CFG.giantHp, vx: 0, vz: 0, shake: 0, box }
      : { slot: i, alive: false, tier: 1, x: 0, z: 0, sx: 1, sy: 1, sz: 1, color: '#fff', hp: 0, maxHp: 1, vx: 0, vz: 0, shake: 0, box });
  }
  if (def.train) {
    const t = def.train, segs: NonNullable<MechState['train']>['segs'] = []; let s = 0;
    for (let i = 0; i < t.path.length; i++) {
      const a = t.path[i], b = t.path[(i + 1) % t.path.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ x: a[0], z: a[1], dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, l, s0: s }); s += l;
    }
    const boxes = Array.from({ length: t.cars }, () => { const b = mkBox(); DYN_BOXES.push(b); return b; });
    MECH.train = { def: t, len: s, segs, boxes, hitCd: new Map() };
  }
  for (const l of def.lifts) { const box = mkBox(); DYN_BOXES.push(box); MECH.lifts.push({ def: l, box, top: l.lo }); }
  for (const d of def.chains) {
    const boxes = Array.from({ length: d.count }, () => { const b = mkBox(); DYN_BOXES.push(b); return b; });
    MECH.chains.push({ def: d, trig: Array(d.count).fill(-1), hit: Array.from({ length: d.count }, () => new Set<number>()), boxes });
  }
  updateMech(0);
}

// ------------------------------------------------------------------ train
export function trainPoint(tr: NonNullable<MechState['train']>, s: number) {
  s = ((s % tr.len) + tr.len) % tr.len;
  for (const g of tr.segs) if (s < g.s0 + g.l) return { x: g.x + g.dx * (s - g.s0), z: g.z + g.dz * (s - g.s0), dx: g.dx, dz: g.dz };
  const g = tr.segs[tr.segs.length - 1]; return { x: g.x, z: g.z, dx: g.dx, dz: g.dz };
}
/** centre + heading of car i at sim time t (pure) */
export function carPose(def: TrainDef, tr: NonNullable<MechState['train']>, i: number, t: number) {
  const s = t * def.speed + def.phase - i * (def.carLen + def.gap);
  return trainPoint(tr, s);
}
export const trainPeriod = (def: TrainDef, len: number) => len / def.speed;

// ------------------------------------------------------------------ lifts
const sst = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
export function liftTop(l: LiftDef, t: number): number {
  const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t / l.period + l.phase));
  return l.lo + (l.hi - l.lo) * sst((u - 0.12) / 0.76);
}

// ------------------------------------------------------------------ dominoes
export const dominoPos = (c: ChainDef, i: number): [number, number] => c.axis === 'x' ? [c.x + c.sign * i * c.spacing, c.z] : [c.x, c.z + c.sign * i * c.spacing];
export type DominoPhase = 'up' | 'falling' | 'down';
export function dominoPhase(trig: number, t: number): DominoPhase { return trig < 0 || t < trig ? 'up' : t < trig + MECH_CFG.fallTime ? 'falling' : 'down'; }
/** tip angle 0..π/2 (ease-in: slow start, hard landing) */
export function dominoAngle(trig: number, t: number): number { if (trig < 0 || t < trig) return 0; const u = Math.min(1, (t - trig) / MECH_CFG.fallTime); return (Math.PI / 2) * u * u; }
/** trigger domino i (if standing). Returns true when it toppled. The cascade itself runs in `stepMech`. */
export function triggerDomino(ch: Chain, i: number, t: number): boolean {
  if (i < 0 || i >= ch.trig.length || ch.trig[i] >= 0) return false;
  ch.trig[i] = t; return true;
}
/** advance the cascade: a domino that has been falling for `delay` topples the next one (exact times, so the client can replay from trig[]) */
function cascade(ch: Chain, t: number) {
  const d = ch.def;
  for (let i = 0; i < ch.trig.length - 1; i++) if (ch.trig[i] >= 0 && ch.trig[i + 1] < 0 && t >= ch.trig[i] + d.delay) ch.trig[i + 1] = ch.trig[i] + d.delay;
}
export interface DominoZone { chain: number; idx: number; x0: number; z0: number; x1: number; z1: number; dirx: number; dirz: number; damage: number }
/** damage rectangles of dominoes that are currently crashing down (host sim damages enemies inside; each enemy once per domino) */
export function dominoZones(t: number, out: DominoZone[] = []): DominoZone[] {
  out.length = 0;
  MECH.chains.forEach((ch, ci) => {
    const d = ch.def;
    for (let i = 0; i < ch.trig.length; i++) {
      const tr = ch.trig[i]; if (tr < 0) continue;
      const u = (t - tr) / MECH_CFG.fallTime; if (u < 0.3 || u > 1.15) continue;
      const [x, z] = dominoPos(d, i), L = d.h + 0.3;
      const dx = d.axis === 'x' ? d.sign : 0, dz = d.axis === 'z' ? d.sign : 0;
      const ax = x + dx * L, az = z + dz * L, hw = d.w / 2 + 0.25;
      out.push({ chain: ci, idx: i, x0: Math.min(x, ax) - (dx ? 0 : hw), x1: Math.max(x, ax) + (dx ? 0 : hw), z0: Math.min(z, az) - (dz ? 0 : hw), z1: Math.max(z, az) + (dz ? 0 : hw), dirx: dx, dirz: dz, damage: d.damage });
    }
  });
  return out;
}
export function markDominoHit(ci: number, idx: number, enemyId: number): boolean {
  const s = MECH.chains[ci]?.hit[idx]; if (!s || s.has(enemyId)) return false; s.add(enemyId); return true;
}

// ------------------------------------------------------------------ portals
export interface PortalExit { x: number; z: number; from: [number, number]; to: [number, number]; pair: number }
/** entity at (x,z) standing in a portal mouth → where it comes out (just in front of the partner, facing the arena centre). null = not in a portal */
export function portalExit(pairs: PortalPair[], x: number, z: number, r = MECH_CFG.portal.r): PortalExit | null {
  for (let k = 0; k < pairs.length; k++) {
    const p = pairs[k];
    for (const [from, to] of [[p.a, p.b], [p.b, p.a]] as const) {
      if (Math.hypot(x - from[0], z - from[1]) < r) {
        const d = Math.hypot(to[0], to[1]) || 1, ex = to[0] - (to[0] / d) * MECH_CFG.portal.exitDist, ez = to[1] - (to[1] / d) * MECH_CFG.portal.exitDist;
        return { x: ex, z: ez, from: [from[0], from[1]], to: [to[0], to[1]], pair: k };
      }
    }
  }
  return null;
}
/** nearest portal mouth to (x,z) with its distance (enemy AI: follow the player through) */
export function nearestPortal(pairs: PortalPair[], x: number, z: number): { x: number; z: number; d: number } | null {
  let best: { x: number; z: number; d: number } | null = null;
  for (const p of pairs) for (const m of [p.a, p.b]) { const d = Math.hypot(x - m[0], z - m[1]); if (!best || d < best.d) best = { x: m[0], z: m[1], d }; }
  return best;
}

// ------------------------------------------------------------------ fans / conveyors
export function fanAt(fans: FanDef[], x: number, z: number): FanDef | null {
  for (const f of fans) {
    const c = Math.cos(f.ang), s = Math.sin(f.ang), dx = x - f.x, dz = z - f.z;
    const along = dx * c + dz * s, side = -dx * s + dz * c;
    if (along > 0.5 && along < f.len && Math.abs(side) < f.width / 2) return f;
  }
  return null;
}
export function conveyorAt(cs: ConveyorDef[], x: number, z: number): ConveyorDef | null {
  for (const c of cs) if (Math.abs(x - c.x) < c.sx / 2 && Math.abs(z - c.z) < c.sz / 2) return c;
  return null;
}

// ------------------------------------------------------------------ bricks
export type MechEvent = { k: 'break'; x: number; z: number; color: string; tier: 0 | 1 } | { k: 'domino'; chain: number; idx: number } | { k: 'dhit'; x: number; z: number };
export const mechEvents: MechEvent[] = [];
export const pushEv = (e: MechEvent) => { if (mechEvents.length < 64) mechEvents.push(e); };

function overlapsXZ(x: number, z: number, sx: number, sz: number, b: AABB, pad = 0) {
  return x + sx / 2 > b.min.x - pad && x - sx / 2 < b.max.x + pad && z + sz / 2 > b.min.z - pad && z - sz / 2 < b.max.z + pad;
}
function brickBlocked(b: Brick, nx: number, nz: number, statics: AABB[], half: number, groundH: (x: number, z: number) => number): boolean {
  if (Math.abs(nx) + b.sx / 2 > half || Math.abs(nz) + b.sz / 2 > half) return true;
  if (Math.abs(groundH(nx, nz) - groundH(b.x, b.z)) > 0.25) return true;
  for (const s of statics) { if (s.max.y < 0.05 || s.min.y > b.sy - 0.05) continue; if (overlapsXZ(nx, nz, b.sx, b.sz, s)) return true; }
  for (const o of MECH.bricks) { if (o === b || !o.alive) continue; if (overlapsXZ(nx, nz, b.sx, b.sz, o.box)) return true; }
  for (const bx of DYN_BOXES) { if (bx === b.box || bx.min.x < -5000) continue; if (MECH.bricks.some((o) => o.box === bx)) continue; if (bx.max.y > 0.1 && overlapsXZ(nx, nz, b.sx, b.sz, bx)) return true; }
  return false;
}
export interface Pusher { x: number; z: number; vx: number; vz: number; r: number }

export function stepBricks(dt: number, pushers: Pusher[], statics: AABB[], half: number, groundH: (x: number, z: number) => number) {
  for (const b of MECH.bricks) {
    if (!b.alive) continue;
    b.shake = Math.max(0, b.shake - dt);
    for (const p of pushers) {
      const hx = b.sx / 2 + p.r + 0.14, hz = b.sz / 2 + p.r + 0.14, dx = p.x - b.x, dz = p.z - b.z;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px < pz) { const dir = dx > 0 ? -1 : 1; if (p.vx * dir > 0.4) b.vx = dir * Math.min(MECH_CFG.pushMax, Math.abs(p.vx) * MECH_CFG.pushRatio); }
      else { const dir = dz > 0 ? -1 : 1; if (p.vz * dir > 0.4) b.vz = dir * Math.min(MECH_CFG.pushMax, Math.abs(p.vz) * MECH_CFG.pushRatio); }
    }
    if (b.vx !== 0 || b.vz !== 0) {
      const f = Math.exp(-MECH_CFG.friction * dt); b.vx *= f; b.vz *= f;
      if (Math.abs(b.vx) < 0.05) b.vx = 0; if (Math.abs(b.vz) < 0.05) b.vz = 0;
      const nx = b.x + b.vx * dt; if (b.vx !== 0) { if (brickBlocked(b, nx, b.z, statics, half, groundH)) b.vx = 0; else b.x = nx; }
      const nz = b.z + b.vz * dt; if (b.vz !== 0) { if (brickBlocked(b, b.x, nz, statics, half, groundH)) b.vz = 0; else b.z = nz; }
    }
  }
}
/** damage (+ horizontal shove along dir) to the brick at index; destroying a giant brick splits it into two small ones. */
export function damageBrick(b: Brick, dmg: number, dirx: number, dirz: number): boolean {
  if (!b.alive) return false;
  b.hp -= dmg; b.shake = 0.18;
  const imp = Math.min(MECH_CFG.impulseMax, dmg * MECH_CFG.impulsePerDmg), l = Math.hypot(dirx, dirz) || 1;
  b.vx += (dirx / l) * imp; b.vz += (dirz / l) * imp;
  if (b.hp > 0) return false;
  b.alive = false; hideBox(b.box); pushEv({ k: 'break', x: b.x, z: b.z, color: b.color, tier: b.tier });
  if (b.tier === 0) {
    const along = b.sx >= b.sz ? 'x' : 'z';
    for (const sg of [-1, 1]) {
      const s = MECH.bricks.find((o) => !o.alive && o !== b); if (!s) break;
      const [ss, sy, sz] = MECH_CFG.smallSize;
      s.alive = true; s.tier = 1; s.sx = ss; s.sy = sy; s.sz = sz; s.color = b.color; s.hp = s.maxHp = MECH_CFG.smallHp; s.shake = 0.3;
      s.x = b.x + (along === 'x' ? sg * b.sx / 4 : 0); s.z = b.z + (along === 'z' ? sg * b.sz / 4 : 0);
      s.vx = (along === 'x' ? sg * 2.6 : 0) + b.vx * 0.4; s.vz = (along === 'z' ? sg * 2.6 : 0) + b.vz * 0.4;
    }
  }
  return true;
}
/** runtime brick (boss shield walls): takes a free slot, returns it (null when the pool is full). Synced to clients with its size in the `dy` row. */
export function spawnBrick(x: number, z: number, size: [number, number, number], color: string, hp = MECH_CFG.giantHp): Brick | null {
  const b = MECH.bricks.find((o) => !o.alive); if (!b) return null;
  b.alive = true; b.tier = 0; b.x = x; b.z = z; b.sx = size[0]; b.sy = size[1]; b.sz = size[2]; b.color = color; b.hp = b.maxHp = hp; b.vx = b.vz = 0; b.shake = 0.5;
  return b;
}
export function brickAt(x: number, y: number, z: number, pad = 0.2): Brick | null {
  for (const b of MECH.bricks) if (b.alive && x > b.x - b.sx / 2 - pad && x < b.x + b.sx / 2 + pad && z > b.z - b.sz / 2 - pad && z < b.z + b.sz / 2 + pad && y > -0.2 && y < b.sy + pad) return b;
  return null;
}
/** one projectile / bullet impact at a world point: damages the brick there and topples the domino there. true if it hit something dynamic. */
export function mechHit(x: number, y: number, z: number, dmg: number, dirx: number, dirz: number, t: number): boolean {
  const b = brickAt(x, y, z); if (b) { damageBrick(b, dmg, dirx, dirz); return true; }
  for (let ci = 0; ci < MECH.chains.length; ci++) {
    const ch = MECH.chains[ci], d = ch.def;
    for (let i = 0; i < ch.trig.length; i++) {
      if (ch.trig[i] >= 0) continue;
      const [px, pz] = dominoPos(d, i), hx = (d.axis === 'x' ? d.thick : d.w) / 2 + 0.3, hz = (d.axis === 'x' ? d.w : d.thick) / 2 + 0.3;
      if (Math.abs(x - px) < hx && Math.abs(z - pz) < hz && y > -0.2 && y < d.h + 0.4) { triggerDomino(ch, i, t); pushEv({ k: 'domino', chain: ci, idx: i }); return true; }
    }
  }
  return false;
}
export function mechExplosion(x: number, y: number, z: number, radius: number, dmg: number, t: number) {
  for (const b of MECH.bricks) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.sx, b.sz) / 2;
    if (d < radius) damageBrick(b, dmg * (1 - Math.max(0, d) / radius) * 0.9 + 4, b.x - x, b.z - z);
  }
  for (let ci = 0; ci < MECH.chains.length; ci++) {
    const ch = MECH.chains[ci];
    for (let i = 0; i < ch.trig.length; i++) { const [px, pz] = dominoPos(ch.def, i); if (ch.trig[i] < 0 && Math.hypot(px - x, pz - z) < radius + 0.8 && triggerDomino(ch, i, t)) pushEv({ k: 'domino', chain: ci, idx: i }); }
  }
  void y;
}

// ------------------------------------------------------------------ per-tick update (pure function of t + explicit state)
export interface Body { pos: V3; r: number; h: number }
function carryOn(box: AABB, nx0: number, nz0: number, nx1: number, nz1: number, ny1: number, bodies: Body[], dx: number, dz: number) {
  const oy = box.max.y;
  for (const b of bodies) {
    const p = b.pos;
    if (Math.abs(p.y - oy) < 0.14 && p.x > box.min.x - 0.05 && p.x < box.max.x + 0.05 && p.z > box.min.z - 0.05 && p.z < box.max.z + 0.05) { p.x += dx; p.z += dz; p.y = ny1; }
  }
  void nx0; void nz0; void nx1; void nz1;
}
function pushOut(box: AABB, bodies: Body[]) {
  for (const b of bodies) {
    const p = b.pos;
    if (p.y >= box.max.y - 0.05 || p.y + b.h <= box.min.y) continue;
    if (p.x + b.r <= box.min.x || p.x - b.r >= box.max.x || p.z + b.r <= box.min.z || p.z - b.r >= box.max.z) continue;
    const l = p.x + b.r - box.min.x, r = box.max.x - (p.x - b.r), f = p.z + b.r - box.min.z, k = box.max.z - (p.z - b.r), m = Math.min(l, r, f, k);
    if (m === l) p.x -= l + 1e-3; else if (m === r) p.x += r + 1e-3; else if (m === f) p.z -= f + 1e-3; else p.z += k + 1e-3;
  }
}
/** write all dynamic boxes for sim time t; riders standing on the train / lifts are carried, bodies inside a moving box are shoved out */
export function updateMech(t: number, bodies: Body[] = []) {
  for (const b of MECH.bricks) if (b.alive) setBox(b.box, b.x - b.sx / 2, 0, b.z - b.sz / 2, b.x + b.sx / 2, b.sy, b.z + b.sz / 2);
  const tr = MECH.train;
  if (tr) for (let i = 0; i < tr.boxes.length; i++) {
    const p = carPose(tr.def, tr, i, t), bx = tr.boxes[i];
    const sx = Math.abs(p.dx) > 0.5 ? tr.def.carLen : tr.def.w, sz = Math.abs(p.dx) > 0.5 ? tr.def.w : tr.def.carLen;
    const ox = (bx.min.x + bx.max.x) / 2, oz = (bx.min.z + bx.max.z) / 2, had = bx.min.x > -5000;
    if (had && bodies.length) carryOn(bx, 0, 0, 0, 0, tr.def.h, bodies, p.x - ox, p.z - oz);
    setBox(bx, p.x - sx / 2, 0, p.z - sz / 2, p.x + sx / 2, tr.def.h, p.z + sz / 2);
    if (bodies.length) pushOut(bx, bodies.filter((b) => b.pos.y < 0.4));
  }
  for (const l of MECH.lifts) {
    const top = liftTop(l.def, t), had = l.box.min.x > -5000;
    if (had && bodies.length) carryOn(l.box, 0, 0, 0, 0, top, bodies, 0, 0);
    l.top = top; setBox(l.box, l.def.x - l.def.sx / 2, 0, l.def.z - l.def.sz / 2, l.def.x + l.def.sx / 2, top, l.def.z + l.def.sz / 2);
  }
  for (const ch of MECH.chains) {
    cascade(ch, t); const d = ch.def;
    // reset: everything has been down for a while and nobody stands in the footprint
    const last = Math.max(...ch.trig);
    if (last >= 0 && ch.trig.every((x) => x >= 0) && t > last + MECH_CFG.fallTime + MECH_CFG.resetAfter) { ch.trig.fill(-1); ch.hit.forEach((h) => h.clear()); }
    for (let i = 0; i < ch.trig.length; i++) {
      const [x, z] = dominoPos(d, i), ph = dominoPhase(ch.trig[i], t), bx = ch.boxes[i];
      const tx = d.axis === 'x' ? d.thick : d.w, tz = d.axis === 'x' ? d.w : d.thick;
      if (ph === 'up') setBox(bx, x - tx / 2, 0, z - tz / 2, x + tx / 2, d.h, z + tz / 2);
      else if (ph === 'falling') hideBox(bx);
      else { // lying flat, pointing along the fall direction (a low climbable slab)
        const lx = d.axis === 'x' ? d.h : d.w, lz = d.axis === 'x' ? d.w : d.h, cx = x + (d.axis === 'x' ? d.sign * d.h / 2 : 0), cz = z + (d.axis === 'z' ? d.sign * d.h / 2 : 0);
        setBox(bx, cx - lx / 2, 0, cz - lz / 2, cx + lx / 2, d.thick, cz + lz / 2);
      }
    }
  }
}

// ------------------------------------------------------------------ co-op snapshot
/** compact dynamic state: bricks [slot,x,z,tier,hpPct,colorIdx] + per-chain trigger times. Train / lifts need nothing (pure functions of the shared clock). */
export interface MechSnap { b: number[][]; d: number[][] }
const COLS = ['#e53935', '#1e6fe8', '#ffd21f', '#2fb344', '#ff8a1f', '#8a4fff', '#ffffff', '#ff7eb6'];
export const colorIdx = (c: string) => { const i = COLS.indexOf(c); return i < 0 ? 0 : i; };
export function mechSnap(): MechSnap | null {
  if (!MECH.def.bricks.length && !MECH.chains.length) return null;
  const b: number[][] = [];
  for (const k of MECH.bricks) if (k.alive) { const row = [k.slot, Math.round(k.x * 100) / 100, Math.round(k.z * 100) / 100, k.tier, Math.round((k.hp / k.maxHp) * 100), colorIdx(k.color)]; const dd = MECH.def.bricks[k.slot]; if (k.tier === 0 && (!dd || dd.size[0] !== k.sx || dd.size[1] !== k.sy || dd.size[2] !== k.sz)) row.push(k.sx, k.sy, k.sz); b.push(row); }
  return { b, d: MECH.chains.map((c) => c.trig.map((x) => Math.round(x * 1000) / 1000)) };
}
export function applyMechSnap(s: MechSnap | null | undefined) {
  if (!s) return;
  const seen = new Set<number>();
  for (const r of s.b) {
    const k = MECH.bricks[r[0]]; if (!k) continue; seen.add(r[0]);
    const def = MECH.def.bricks[r[0]];
    k.alive = true; k.x = r[1]; k.z = r[2]; k.tier = r[3] as 0 | 1; k.maxHp = 100; k.hp = r[4]; k.color = COLS[r[5]] ?? k.color;
    if (r[3] === 0 && r.length >= 9) { k.sx = r[6]; k.sy = r[7]; k.sz = r[8]; } else if (r[3] === 0 && def) { k.sx = def.size[0]; k.sy = def.size[1]; k.sz = def.size[2]; } else { k.sx = MECH_CFG.smallSize[0]; k.sy = MECH_CFG.smallSize[1]; k.sz = MECH_CFG.smallSize[2]; }
  }
  for (const k of MECH.bricks) if (!seen.has(k.slot) && k.alive) { k.alive = false; hideBox(k.box); }
  s.d.forEach((arr, ci) => { const ch = MECH.chains[ci]; if (ch) arr.forEach((v, i) => { ch.trig[i] = v; }); });
}
