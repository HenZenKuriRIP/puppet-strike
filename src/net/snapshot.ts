/** Host: world -> snapshot. Client: snapshot buffer -> replica world (same pools, so the existing renderers are reused unchanged). */
import { world } from '../game/core/world';
import { drain } from '../game/core/events';
import { ENEMIES, FX } from '../config/game';
import { v3 } from '../game/core/math';
import { groundHeight } from '../game/levels/terrain';
import { ANIMS, FSM_STATES, E, q2, q3, SnapWire, PlayerSnap, EnemyTuple, ProjTuple, ShotTuple, PickTuple, HazTuple, BossSnap, NetEvent } from './protocol';
import { lerp, lerpAngle, Sample } from './interp';
import { mechSnap, applyMechSnap, MechSnap } from '../game/levels/mech';
import { updateMovers } from '../game/levels/arenaLayout';
import type { BossAttack } from '../game/boss/kingGummy';

export const ENEMY_IDS = Object.keys(ENEMIES);
const b01 = (b: boolean): 0 | 1 => (b ? 1 : 0);

// ------------------------------------------------------------------ host
export function slotSnap(i: number): PlayerSnap {
  const sl = world.slots[i], p = sl.player;
  const o: PlayerSnap = {
    x: q2(p.pos.x), y: q2(p.pos.y), z: q2(p.pos.z), vx: q2(p.vel.x), vz: q2(p.vel.z), yw: q3(p.yaw), pt: q3(p.pitch), fa: q3(p.facing),
    hp: Math.round(p.hp), mh: Math.round(p.maxHp), dd: b01(p.dead), an: Math.max(0, ANIMS.indexOf(p.anim)), rp: q2(p.runPhase), sp: q2(p.speed),
    ah: q2(p.aimHold), sa: q2(p.shootAnim), wi: p.arsenal.index, sw: q2(p.arsenal.switchTimer), ra: q2(p.roll.active), fl: b01(p.flash > 0), iv: b01(p.invuln > 0),
    sr: b01(p.sprinting), rv: q2(p.revive), mf: b01(sl.muzzleFlash > 0), ai: q2(sl.aiming), gr: b01(p.grounded),
  };
  if (sl.shield.hp > 0) o.sh = [Math.round(sl.shield.hp), q2(sl.shield.t)];
  if (sl.decoy.t > 0) o.dc = [q2(sl.decoy.pos.x), q2(sl.decoy.pos.y), q2(sl.decoy.pos.z), q2(sl.decoy.t)];
  if (sl.turret.t > 0) o.tu = [q2(sl.turret.pos.x), q2(sl.turret.pos.y), q2(sl.turret.pos.z), q2(sl.turret.t), q2(sl.turret.aim)];
  return o;
}

export function buildSnapshot(sq: number): SnapWire {
  const pl = world.slots.map((_, i) => slotSnap(i));
  const en: EnemyTuple[] = [];
  for (const e of world.enemies.items) if (e.active) {
    en.push([e.id, Math.max(0, ENEMY_IDS.indexOf(e.type)), q2(e.pos.x), q2(e.pos.y), q2(e.pos.z), q2(e.facing), b01(e.flash > 0), b01(e.dead), q2(e.deathTimer), q2(e.hitReact),
      Math.max(0, FSM_STATES.indexOf(e.fsm.state)), q2(e.fsm.timer), q2(e.fsm.cooldown), q2(e.tele), q2(e.tp.x), q2(e.tp.z), e.burstLeft, q2(e.leapT), q2(e.bound), q2(e.spawnAnim), q2(e.animPhase),
      q2(e.vel.x), q2(e.vel.z), q2(e.target.x), q2(e.target.z), e.ts | 0, Math.round(Math.max(0, e.hp / Math.max(1, e.maxHp)) * 1000) / 1000]);
  }
  const pr: ProjTuple[] = [];
  world.projectiles.items.forEach((p, i) => { if (p.active) pr.push([i, q2(p.pos.x), q2(p.pos.y), q2(p.pos.z), q2(p.vel.x), q2(p.vel.y), q2(p.vel.z), p.vis, q2(p.size), p.color]); });
  const sh: ShotTuple[] = [];
  world.shots.items.forEach((s, i) => { if (s.active) sh.push([i, s.kind === 'rocket' ? 1 : 0, q2(s.pos.x), q2(s.pos.y), q2(s.pos.z), q2(s.vel.x), q2(s.vel.y), q2(s.vel.z), s.vis, q2(s.size), s.color]); });
  const pk: PickTuple[] = [];
  world.pickups.items.forEach((p, i) => { if (p.active) pk.push([i, p.kind === 'ammo' ? 1 : 0, q2(p.pos.x), q2(p.pos.y), q2(p.pos.z), q2(p.life), p.spot, q2(p.age)]); });
  const hz: HazTuple[] = world.hazards.map((h) => [q2(h.pos.x), q2(h.pos.y), q2(h.pos.z), q2(h.r), q2(h.t), q2(h.max), h.kind === 'slam' ? 1 : h.kind === 'shell' ? 2 : 0]);
  const B = world.boss;
  const bs: BossSnap | null = B.id >= 0 || world.cinematic > 0 ? { id: B.id, ph: B.s.phase, tr: q2(B.s.transition), tele: B.s.tele, sl: q2(B.slamT), ci: q2(world.cinematic) } : null;
  return { t: Math.round(world.time * 1000) / 1000, sq, pl, en, pr, sh, pk, bl: world.balloons.map((b) => (b.alive ? '1' : '0')).join(''), hz, bs, ev: drain() as NetEvent[], dy: mechSnap() };
}

// ------------------------------------------------------------------ client: decoded snapshot
export interface Snap {
  t: number; sq: number; recv: number; pl: PlayerSnap[]; en: (EnemyTuple | undefined)[]; pr: (ProjTuple | undefined)[]; sh: (ShotTuple | undefined)[];
  pk: PickTuple[]; bl: string; hz: HazTuple[]; bs: BossSnap | null; ev: NetEvent[]; dy: MechSnap | null;
}
export function decodeSnap(w: SnapWire, recv: number): Snap {
  const en: (EnemyTuple | undefined)[] = []; for (const e of w.en ?? []) en[e[0]] = e;
  const pr: (ProjTuple | undefined)[] = []; for (const p of w.pr ?? []) pr[p[0]] = p;
  const sh: (ShotTuple | undefined)[] = []; for (const s of w.sh ?? []) sh[s[0]] = s;
  return { t: w.t, sq: w.sq, recv, pl: w.pl, en, pr, sh, pk: w.pk ?? [], bl: w.bl ?? '', hz: w.hz ?? [], bs: w.bs ?? null, ev: w.ev ?? [], dy: w.dy ?? null };
}

const near = <T,>(s: Sample<Snap>) => (s.k < 0.5 ? s.a : s.b);
const JUMP2 = 9; // squared distance above which an id is treated as a different entity (pool slot recycled)

function applyDiscretePlayer(i: number, n: PlayerSnap) {
  const sl = world.slots[i], p = sl.player;
  p.hp = n.hp; p.maxHp = n.mh; p.dead = !!n.dd; p.anim = (ANIMS[n.an] ?? 'idle') as typeof p.anim; p.speed = n.sp; p.aimHold = n.ah; p.shootAnim = n.sa;
  p.arsenal.index = n.wi; p.arsenal.switchTimer = n.sw; p.roll.active = n.ra; p.flash = n.fl ? 0.1 : 0; p.invuln = n.iv ? 1 : 0; p.sprinting = !!n.sr; p.revive = n.rv; p.grounded = !!n.gr;
  p.vel.x = n.vx; p.vel.z = n.vz; sl.muzzleFlash = n.mf ? 0.05 : 0; sl.aiming = n.ai;
  sl.shield.hp = n.sh ? n.sh[0] : 0; sl.shield.t = n.sh ? n.sh[1] : 0;
  sl.decoy.t = n.dc ? n.dc[3] : 0; if (n.dc) { sl.decoy.pos.x = n.dc[0]; sl.decoy.pos.y = n.dc[1]; sl.decoy.pos.z = n.dc[2]; }
  sl.turret.t = n.tu ? n.tu[3] : 0; if (n.tu) { sl.turret.pos.x = n.tu[0]; sl.turret.pos.y = n.tu[1]; sl.turret.pos.z = n.tu[2]; sl.turret.aim = n.tu[4]; }
}

/** write the interpolated world for `renderT`. Returns nothing; the local player's position/yaw are handled by `smoothOwn`. */
export function applySample(s: Sample<Snap>, renderT: number) {
  const { a, b, k } = s, nr = near(s);
  world.alpha = 1; world.time = renderT;
  applyMechSnap(nr.dy); updateMovers(renderT); // W2: bricks / domino state from the host; train + lifts are pure functions of the shared clock
  // --- players (partner interpolated; own handled separately)
  for (let i = 0; i < world.slots.length; i++) {
    const pa = a.pl[i], pb = b.pl[i]; if (!pa || !pb) continue;
    const sl = world.slots[i], p = sl.player, nn = k < 0.5 ? pa : pb;
    applyDiscretePlayer(i, nn);
    if (i === world.local) continue;
    p.pos.x = lerp(pa.x, pb.x, k); p.pos.y = lerp(pa.y, pb.y, k); p.pos.z = lerp(pa.z, pb.z, k);
    if ((pb.x - pa.x) ** 2 + (pb.z - pa.z) ** 2 > 100) { p.pos.x = pb.x; p.pos.y = pb.y; p.pos.z = pb.z; }
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    p.yaw = lerpAngle(pa.yw, pb.yw, k); p.pitch = lerp(pa.pt, pb.pt, k); p.facing = lerpAngle(pa.fa, pb.fa, k); p.runPhase = lerp(pa.rp, pb.rp, k);
  }
  // --- enemies
  const items = world.enemies.items;
  for (let id = 0; id < items.length; id++) {
    const ea = a.en[id], eb = b.en[id], e = items[id];
    const src = eb && ea ? (k < 0.5 ? ea : eb) : (eb ?? ea);
    if (!src) { e.active = false; continue; }
    e.active = true; e.id = id; e.type = (ENEMY_IDS[src[E.ty]] ?? 'windup') as typeof e.type;
    let x = src[E.x], y = src[E.y], z = src[E.z], fa = src[E.fa];
    if (ea && eb && ea[E.ty] === eb[E.ty] && (eb[E.x] - ea[E.x]) ** 2 + (eb[E.z] - ea[E.z]) ** 2 < JUMP2) {
      x = lerp(ea[E.x], eb[E.x], k); y = lerp(ea[E.y], eb[E.y], k); z = lerp(ea[E.z], eb[E.z], k); fa = lerpAngle(ea[E.fa], eb[E.fa], k);
      e.animPhase = lerp(ea[E.ap], eb[E.ap], k);
    } else e.animPhase = src[E.ap];
    e.pos.x = x; e.pos.y = y; e.pos.z = z; e.prev.x = x; e.prev.y = y; e.prev.z = z; e.facing = fa;
    e.flash = src[E.fl] ? 0.1 : 0; e.dead = !!src[E.dd]; e.deathTimer = src[E.dt]; e.hitReact = src[E.hr];
    e.fsm.state = FSM_STATES[src[E.fs]] ?? 'idle'; e.fsm.timer = src[E.ft]; e.fsm.cooldown = src[E.fc];
    e.tele = src[E.te]; e.tp.x = src[E.tx]; e.tp.z = src[E.tz]; e.burstLeft = src[E.bu]; e.leapT = src[E.lp]; e.bound = src[E.bo]; e.spawnAnim = src[E.sa];
    e.vel.x = src[E.vx]; e.vel.z = src[E.vz]; e.target.x = src[E.gx]; e.target.z = src[E.gz]; e.ts = src[E.ts]; e.maxHp = 100; e.hp = (src[E.hf] ?? 1) * 100;
  }
  // --- projectiles (bracket-lerp; ids can be recycled between snapshots, so large jumps are not interpolated)
  const dtb = Math.max(1e-3, b.t - a.t);
  const pitems = world.projectiles.items;
  for (let i = 0; i < pitems.length; i++) {
    const pa = a.pr[i], pb = b.pr[i], p = pitems[i];
    let x: number, y: number, z: number, src: ProjTuple;
    if (pa && pb && (pb[1] - pa[1]) ** 2 + (pb[3] - pa[3]) ** 2 < JUMP2) { src = pb; x = lerp(pa[1], pb[1], k); y = lerp(pa[2], pb[2], k); z = lerp(pa[3], pb[3], k); }
    else if (pb) { src = pb; const back = Math.max(0, b.t - renderT); if (!pa && back > 0.06) { p.active = false; continue; } x = pb[1] - pb[4] * back; y = pb[2] - pb[5] * back; z = pb[3] - pb[6] * back; }
    else if (pa) { src = pa; const fwd = Math.min(0.04, Math.max(0, renderT - a.t)); x = pa[1] + pa[4] * fwd; y = pa[2] + pa[5] * fwd; z = pa[3] + pa[6] * fwd; }
    else { p.active = false; continue; }
    p.active = true; p.pos.x = x; p.pos.y = y; p.pos.z = z; p.vel.x = src[4]; p.vel.y = src[5]; p.vel.z = src[6]; p.vis = src[7]; p.size = src[8]; p.color = src[9]; p.life = 1;
  }
  const sitems = world.shots.items;
  for (let i = 0; i < sitems.length; i++) {
    const sa = a.sh[i], sb = b.sh[i], p = sitems[i];
    const src = sa && sb ? (k < 0.5 ? sa : sb) : (sb ?? sa);
    if (!src) { p.active = false; continue; }
    let x = src[2], y = src[3], z = src[4];
    if (sa && sb && (sb[2] - sa[2]) ** 2 + (sb[4] - sa[4]) ** 2 < JUMP2) { x = lerp(sa[2], sb[2], k); y = lerp(sa[3], sb[3], k); z = lerp(sa[4], sb[4], k); }
    p.active = true; p.kind = src[1] ? 'rocket' : 'bubble'; p.pos.x = x; p.pos.y = y; p.pos.z = z; p.prev.x = x; p.prev.y = y; p.prev.z = z;
    p.vel.x = src[5]; p.vel.y = src[6]; p.vel.z = src[7]; p.vis = src[8]; p.size = src[9]; p.color = src[10]; p.life = 1;
  }
  // --- pickups / balloons / hazards / boss (discrete: nearest snapshot)
  const pkItems = world.pickups.items; for (const p of pkItems) p.active = false;
  for (const t of nr.pk) { const p = pkItems[t[0]]; if (!p) continue; p.active = true; p.kind = t[1] ? 'ammo' : 'hp'; p.pos.x = t[2]; p.pos.y = t[3]; p.pos.z = t[4]; p.life = t[5]; p.spot = t[6]; p.age = t[7]; }
  for (let i = 0; i < world.balloons.length; i++) world.balloons[i].alive = nr.bl[i] !== '0';
  const hz = a.hz; const hs = world.hazards; hs.length = 0;
  for (const h of hz) hs.push({ pos: v3(h[0], h[1], h[2]), r: h[3], t: Math.max(0, h[4] - (renderT - a.t)), max: h[5], dmg: 0, kind: h[6] === 1 ? 'slam' : h[6] === 2 ? 'shell' : 'hazard' });
  const bs = nr.bs, B = world.boss;
  if (bs) { B.id = bs.id; B.s.phase = bs.ph as 1 | 2 | 3; B.s.transition = bs.tr; B.s.tele = (bs.tele as BossAttack | null); B.tele = B.s.tele; B.slamT = bs.sl; world.cinematic = bs.ci; B.s.intro = bs.ci; }
  else { B.id = -1; world.cinematic = 0; }
}

/** own player on the client: latest host position extrapolated by velocity, low-pass smoothed (no true prediction - documented limitation) */
export function smoothOwn(dt: number, newest: Snap | undefined, now: number, rtt: number) {
  if (!newest) return;
  const n = newest.pl[world.local]; if (!n) return;
  const p = world.slots[world.local].player;
  const ex = Math.min(0.12, Math.max(0, now - newest.recv) + Math.min(0.2, rtt / 2000));
  const tx = n.x + n.vx * ex, tz = n.z + n.vz * ex, ty = n.y;
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  if (dx * dx + dz * dz > 9) { p.pos.x = tx; p.pos.z = tz; p.pos.y = ty; }
  else { const k = 1 - Math.exp(-dt * 16); p.pos.x += dx * k; p.pos.z += dz * k; p.pos.y += (ty - p.pos.y) * Math.min(1, k * 1.5); }
  p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z; p.facing = n.fa; p.runPhase = n.rp;
  void groundHeight;
}

/** cosmetic fx stepping on the client (the host's stepFx without any gameplay) */
export function stepFxClient(dt: number) {
  for (const s of world.sparks.items) if (s.active) {
    s.life -= dt; if (s.life <= 0) { s.active = false; continue; }
    s.vel.y -= (s.kind === 5 ? 1.5 : 12) * dt; s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
    const gy = groundHeight(s.pos.x, s.pos.z) + 0.03;
    if (s.pos.y < gy) { s.pos.y = gy; s.vel.y *= -0.4; s.vel.x *= 0.7; s.vel.z *= 0.7; }
  }
  for (const t of world.tracers.items) if (t.active && (t.life -= dt) <= 0) t.active = false;
  for (const b of world.blastFx.items) if (b.active && (b.life -= dt) <= 0) b.active = false;
  for (const n of world.dmgNums.items) if (n.active) { n.life -= dt; n.pos.y += dt * 1.2; if (n.life <= 0) n.active = false; }
  for (const l of world.lobs.items) if (l.active && (l.t += dt) >= l.T) l.active = false;
  world.shake = Math.max(0, world.shake - FX.shakeDecay * dt * world.shake - dt * 0.05);
}
