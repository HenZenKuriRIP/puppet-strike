// W2: host-side glue between the pure map mechanics (`levels/mech.ts`) and the sim: riders, pushing bricks, domino damage,
// train hits, portals, conveyors, fans. Runs inside `stepSim` (host / single-player). The co-op client only replays
// `updateMovers(world.time)` + `applyMechSnap` (see net/snapshot.ts), so nothing here may be needed to render.
import { ENEMIES, PLAYER, ARENA } from '../../config/game';
import { world } from '../core/world';
import { v3, V3 } from '../core/math';
import { burst, blastFx, shake, snd, puff } from './fx';
import { moveAndCollide } from '../physics/collision';
import { ARENA_BOXES, STATIC_BOXES, updateMovers } from '../levels/arenaLayout';
import { groundHeight } from '../levels/terrain';
import { MECH, MECH_CFG, Body, Pusher, dominoZones, markDominoHit, portalExit, nearestPortal, fanAt, conveyorAt, mechEvents, stepBricks, DominoZone } from '../levels/mech';
import { hurtPlayer, damageEnemy } from './simulation';

const bodies: Body[] = [];
const bodyPool: Body[] = [];
const pushers: Pusher[] = [];
const zones: DominoZone[] = [];
const ZERO = v3(0, 0, 0);
const BRICK_FX = ['#e53935', '#1e6fe8', '#ffd21f', '#2fb344', '#ff8a1f', '#ffffff'];

/** per-slot / per-enemy portal cooldowns (host only) */
/** pre-collision horizontal velocity of each player slot (set by stepPlayer), so walking into a brick still pushes it */
export const intent: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
const portalCd = new Map<number, number>();
export function resetMechSim() { portalCd.clear(); MECH.train?.hitCd.clear(); }

const isBossType = (t: string) => t === 'king' || t === 'colossus';
const isStatic = (t: string) => ENEMIES[t as keyof typeof ENEMIES].speed <= 0;

function body(i: number, pos: V3, r: number, h: number): Body {
  const b = bodyPool[i] ?? (bodyPool[i] = { pos, r, h });
  b.pos = pos; b.r = r; b.h = h; return b;
}

/** the blocks a ground body may be pushed along by a belt / fan: reuse the full collision resolver */
const tmpV = v3(0, 0, 0), tmpD = v3(0, 0, 0);
function drift(pos: V3, dx: number, dz: number, r: number, h: number) {
  tmpV.x = tmpV.y = tmpV.z = 0; tmpD.x = dx; tmpD.y = 0; tmpD.z = dz;
  moveAndCollide(pos, tmpV, tmpD, r, h, ARENA_BOXES);
}

export function stepMechSim(dt: number) {
  const t = world.time;
  const hasMech = MECH.bricks.length > 0 || MECH.train || MECH.lifts.length || MECH.chains.length || MECH.def.portals.length || MECH.def.conveyors.length || MECH.def.fans.length;
  if (!hasMech) { updateMovers(t); return; }
  // ---- bodies carried / shoved by moving boxes
  let n = 0; bodies.length = 0; pushers.length = 0;
  for (let si = 0; si < world.slots.length; si++) { const p = world.slots[si].player; if (p.dead) continue; bodies.push(body(n++, p.pos, PLAYER.radius, PLAYER.height)); pushers.push({ x: p.pos.x, z: p.pos.z, vx: intent[si][0], vz: intent[si][1], r: PLAYER.radius }); }
  for (const e of world.enemies.items) { if (!e.active || e.dead) continue; const c = ENEMIES[e.type]; if (c.flying || c.speed <= 0 || isBossType(e.type)) continue; bodies.push(body(n++, e.pos, c.radius * 0.8, c.height)); }
  updateMovers(t, bodies);
  stepBricks(dt, pushers, STATIC_BOXES, ARENA.half, groundHeight);

  // ---- dominoes crush enemies in their path (each enemy once per domino)
  if (MECH.chains.length) {
    dominoZones(t, zones);
    for (const z of zones) for (const e of world.enemies.items) {
      if (!e.active || e.dead || ENEMIES[e.type].flying) continue;
      const c = ENEMIES[e.type];
      if (e.pos.x + c.radius < z.x0 || e.pos.x - c.radius > z.x1 || e.pos.z + c.radius < z.z0 || e.pos.z - c.radius > z.z1 || e.pos.y > 3) continue;
      if (!markDominoHit(z.chain, z.idx, e.id)) continue;
      const boss = isBossType(e.type), dd = MECH_CFG.domino;
      damageEnemy(e, boss ? dd.bossDamage : z.damage * (dd.enemyDamage / 85), { at: v3(e.pos.x, e.pos.y + c.height * 0.6, e.pos.z) });
      if (!boss && !e.dead) { e.vel.x += z.dirx * dd.knock; e.vel.z += z.dirz * dd.knock; e.knockT = 0.35; e.leapT = 0; }
      burst(v3(e.pos.x, e.pos.y + 0.8, e.pos.z), 10, BRICK_FX, 5, 0.4, 1.1); shake(0.12);
    }
  }

  // ---- train: contact hurts (side-on; standing on the roof is safe)
  const tr = MECH.train;
  if (tr) {
    for (const [k, v] of tr.hitCd) { if (v - dt <= 0) tr.hitCd.delete(k); else tr.hitCd.set(k, v - dt); }
    const M = 0.32, cfg = MECH_CFG.train;
    for (let i = 0; i < tr.boxes.length; i++) {
      const b = tr.boxes[i], cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const pushX = Math.abs(b.max.x - b.min.x) > Math.abs(b.max.z - b.min.z);
      const hit = (p: V3, r: number, h: number) => p.x + r + M > b.min.x && p.x - r - M < b.max.x && p.z + r + M > b.min.z && p.z - r - M < b.max.z && p.y < b.max.y - 0.35 && p.y + h > 0;
      for (let si = 0; si < world.slots.length; si++) {
        const p = world.slots[si].player; if (p.dead || p.invuln > 0 || !hit(p.pos, PLAYER.radius, PLAYER.height) || tr.hitCd.has(1000 + si)) continue;
        tr.hitCd.set(1000 + si, cfg.hitCd);
        const sx = pushX ? Math.sign(p.pos.z - cz) : Math.sign(p.pos.x - cx) || 1;
        hurtPlayer(cfg.hurtPlayer, si);
        if (pushX) p.vel.z += (sx || 1) * 9; else p.vel.x += sx * 9;
        p.vel.y = Math.max(p.vel.y, 4); p.grounded = false;
      }
      for (const e of world.enemies.items) {
        if (!e.active || e.dead) continue; const c = ENEMIES[e.type];
        if (c.flying || c.speed <= 0 || isBossType(e.type) || !hit(e.pos, c.radius, c.height) || tr.hitCd.has(e.id)) continue;
        tr.hitCd.set(e.id, cfg.hitCd);
        damageEnemy(e, cfg.hurtEnemy, { at: v3(e.pos.x, e.pos.y + c.height * 0.6, e.pos.z) });
        if (!e.dead) { const s = pushX ? Math.sign(e.pos.z - cz) || 1 : Math.sign(e.pos.x - cx) || 1; if (pushX) e.vel.z += s * 8; else e.vel.x += s * 8; e.knockT = 0.3; e.leapT = 0; }
        burst(v3(e.pos.x, e.pos.y + 0.8, e.pos.z), 8, BRICK_FX, 5, 0.35, 1);
      }
    }
  }

  // ---- portals (players always; enemies only when it shortens their chase a lot)
  if (MECH.def.portals.length) {
    for (const [k, v] of portalCd) { if (v - dt <= 0) portalCd.delete(k); else portalCd.set(k, v - dt); }
    for (let si = 0; si < world.slots.length; si++) {
      const p = world.slots[si].player; if (p.dead || portalCd.has(1000 + si) || p.pos.y > 1.2) continue;
      const ex = portalExit(MECH.def.portals, p.pos.x, p.pos.z); if (!ex) continue;
      teleport(p.pos, ex.x, ex.z, ex.from, ex.to);
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z; p.vel.x *= 0.3; p.vel.z *= 0.3;
      portalCd.set(1000 + si, MECH_CFG.portal.cooldown);
    }
    const tgt = world.slots.find((s) => !s.player.dead)?.player;
    if (tgt) for (const e of world.enemies.items) {
      if (!e.active || e.dead || portalCd.has(e.id) || isStatic(e.type) || isBossType(e.type) || ENEMIES[e.type].flying || e.spawnAnim > 0) continue;
      const ex = portalExit(MECH.def.portals, e.pos.x, e.pos.z, MECH_CFG.portal.r * 0.8); if (!ex) continue;
      const dNow = Math.hypot(e.pos.x - tgt.pos.x, e.pos.z - tgt.pos.z), dOut = Math.hypot(ex.x - tgt.pos.x, ex.z - tgt.pos.z);
      if (dOut > dNow - 9) continue; // enemies "avoid" portals unless it clearly brings them closer
      teleport(e.pos, ex.x, ex.z, ex.from, ex.to); e.prev.x = e.pos.x; e.prev.z = e.pos.z; e.vel.x = e.vel.z = 0;
      portalCd.set(e.id, MECH_CFG.portal.cooldown * 2.5);
    }
  }

  // ---- conveyor belts + fans push grounded ground-walkers
  if (MECH.def.conveyors.length || MECH.def.fans.length) {
    for (const sl of world.slots) {
      const p = sl.player; if (p.dead) continue;
      if (p.grounded) { const c = conveyorAt(MECH.def.conveyors, p.pos.x, p.pos.z); if (c) drift(p.pos, c.dx * c.speed * dt, c.dz * c.speed * dt, PLAYER.radius, PLAYER.height); }
      const f = fanAt(MECH.def.fans, p.pos.x, p.pos.z); if (f) drift(p.pos, Math.cos(f.ang) * f.force * 0.3 * dt, Math.sin(f.ang) * f.force * 0.3 * dt, PLAYER.radius, PLAYER.height);
    }
    for (const e of world.enemies.items) {
      if (!e.active || e.dead) continue; const c = ENEMIES[e.type]; if (c.flying || c.speed <= 0 || isBossType(e.type)) continue;
      const cv = conveyorAt(MECH.def.conveyors, e.pos.x, e.pos.z);
      if (cv) drift(e.pos, cv.dx * cv.speed * dt, cv.dz * cv.speed * dt, c.radius, c.height);
    }
  }

  // ---- brick break / domino events → fx (burst/blast are replicated to the guest by the event queue)
  for (const ev of mechEvents) {
    if (ev.k === 'break') {
      const p = v3(ev.x, 0.8, ev.z);
      burst(p, ev.tier === 0 ? 22 : 10, [ev.color, '#ffffff', ev.color], 6, 0.6, 1.3); puff(p, ev.tier === 0 ? 1.4 : 0.8, '#f4f1ea'); shake(ev.tier === 0 ? 0.18 : 0.08); snd.explosion();
    } else if (ev.k === 'domino') { shake(0.05); snd.hit(); }
  }
  mechEvents.length = 0;
  void blastFx;
}

function teleport(pos: V3, x: number, z: number, from: [number, number], to: [number, number]) {
  burst(v3(from[0], 1, from[1]), 18, ['#c9a8ff', '#7fe8ff', '#ffffff'], 5, 0.5, 1.2);
  pos.x = x; pos.z = z; pos.y = groundHeight(x, z);
  burst(v3(to[0], 1, to[1]), 18, ['#c9a8ff', '#7fe8ff', '#ffffff'], 5, 0.5, 1.2);
  snd.boing();
}

/** bend a projectile's heading while it flies through a fan's wind (keeps its speed). Returns true when deflected. */
export function fanDeflect(pos: V3, vel: V3, dt: number): boolean {
  const fans = MECH.def.fans; if (!fans.length) return false;
  const f = fanAt(fans, pos.x, pos.z); if (!f) return false;
  const sp = Math.hypot(vel.x, vel.y, vel.z) || 1;
  vel.x += Math.cos(f.ang) * f.force * 1.6 * dt * sp * 0.25; vel.z += Math.sin(f.ang) * f.force * 1.6 * dt * sp * 0.25;
  const s2 = Math.hypot(vel.x, vel.y, vel.z) || 1; vel.x *= sp / s2; vel.y *= sp / s2; vel.z *= sp / s2;
  return true;
}
export { nearestPortal, ZERO };
