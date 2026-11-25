// M5: scripted AI player. Drives the SAME input object a human does (keys / mouse / yaw / pitch).
// No god mode, no direct damage. Aim has turn-rate limit + jitter + reaction delay to stay human-like.
import { ENEMIES, CAMERA, WEAPON_ORDER, ARENA } from '../../config/game';
import { input } from '../core/input';
import { world, Enemy } from '../core/world';
import { computeCamera } from '../camera/cameraRig';
import { dist2D, forwardFrom, rightFrom, V3, v3 } from '../core/math';
import { CHAR_SKILLS } from '../characters/registry';
import { currentState, currentConfig } from '../weapons/arsenal';

export interface BotOpts { turnRate?: number; jitter?: number; reaction?: number; dodge?: boolean; dodgeSkill?: number; aimWander?: number; rand?: () => number }
/** skill presets: 'average' is what BALANCE_REPORT targets */
export const BOT_SKILL: Record<'novice' | 'average' | 'good', BotOpts> = {
  novice: { turnRate: 3.5, jitter: 0.05, reaction: 0.55, dodgeSkill: 0.2, aimWander: 0.09 },
  average: { turnRate: 5, jitter: 0.035, reaction: 0.4, dodgeSkill: 0.45, aimWander: 0.06 },
  good: { turnRate: 7, jitter: 0.02, reaction: 0.25, dodgeSkill: 0.75, aimWander: 0.03 },
};
const dodgeMemo = new WeakMap<object, { life: number; dodge: boolean }>();
export interface BotState { aimOx: number; aimOy: number; target: number; seenT: number; strafe: number; strafeT: number; skillUses: number; rolls: number; jumps: number; lastHp: number }
export const createBot = (): BotState => ({ aimOx: 0, aimOy: 0, target: -1, seenT: 0, strafe: 1, strafeT: 0, skillUses: 0, rolls: 0, jumps: 0, lastHp: 0 });

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const visible = (from: V3, to: V3) => { const d = v3(to.x - from.x, to.y - from.y, to.z - from.z); const l = Math.hypot(d.x, d.y, d.z); return world.raycast(from, v3(d.x / l, d.y / l, d.z / l), l) === null; };

function press(code: string, on: boolean) { if (on) { if (!input.keys.has(code)) input.pressed.add(code); input.keys.add(code); } else input.keys.delete(code); }
function tap(code: string) { input.pressed.add(code); }

export function botStep(b: BotState, dt: number, o: BotOpts = {}) {
  const R = o.rand ?? Math.random, turn = o.turnRate ?? 5, jit = o.jitter ?? 0.035, react = o.reaction ?? 0.4, ds = o.dodgeSkill ?? 0.45, wander = o.aimWander ?? 0.06;
  // aim error wanders like a hand on a mouse (OU process)
  b.aimOx += (-b.aimOx * 2 * dt) + (R() - 0.5) * wander * 6 * Math.sqrt(dt); b.aimOy += (-b.aimOy * 2 * dt) + (R() - 0.5) * wander * 3 * Math.sqrt(dt);
  const p = world.player; if (p.dead || p.won) { input.reset(); return; }
  const eye = v3(p.pos.x, p.pos.y + CAMERA.pivotHeight, p.pos.z);
  // ---- pick target: nearest visible, else nearest
  let best: Enemy | null = null, bs = 1e9;
  for (const e of world.enemies.items) {
    if (!e.active || e.dead) continue;
    const c = ENEMIES[e.type], chest = v3(e.pos.x, e.pos.y + c.height * 0.55, e.pos.z);
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z), vis = visible(eye, chest);
    const s = d + (vis ? 0 : 25) + (e.id === b.target ? -3 : 0) + (e.type === 'clown' ? -6 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  if (!best || best.id !== b.target) { b.target = best?.id ?? -1; b.seenT = 0; } else b.seenT += dt;
  // ---- movement intent (world space)
  let mx = 0, mz = 0;
  const away = (x: number, z: number, w: number) => { const dx = p.pos.x - x, dz = p.pos.z - z, l = Math.hypot(dx, dz) || 1; mx += dx / l * w; mz += dz / l * w; };
  let jump = false, roll = false;
  for (const h of world.hazards) {
    const d = dist2D(h.pos, p.pos);
    if (d < h.r + 1.2) {
      if (h.kind === 'slam' && h.t < 0.16 && p.grounded && R() < ds + 0.3) jump = true; // jump over the shockwave
      else if (h.kind === 'hazard' || h.t > 0.5) away(h.pos.x, h.pos.z, 3);
    }
  }
  if (o.dodge !== false) for (const pr of world.projectiles.items) {
    if (!pr.active) continue;
    let m = dodgeMemo.get(pr); if (!m || pr.life > m.life + 0.01) { m = { life: pr.life, dodge: R() < ds }; dodgeMemo.set(pr, m); } m.life = pr.life;
    if (!m.dodge) continue;
    const rx = pr.pos.x - p.pos.x, rz = pr.pos.z - p.pos.z, vv = pr.vel.x ** 2 + pr.vel.z ** 2;
    const t = -(rx * pr.vel.x + rz * pr.vel.z) / (vv || 1);
    if (t <= 0 || t > 0.45) continue;
    const cx = rx + pr.vel.x * t, cz = rz + pr.vel.z * t;
    if (Math.hypot(cx, cz) < 0.9 + 0.2 * pr.size) { const l = Math.sqrt(vv) || 1; const sx = -pr.vel.z / l, sz = pr.vel.x / l; const sg = sx * cx + sz * cz > 0 ? -1 : 1; mx += sx * sg * 2; mz += sz * sg * 2; if (t < 0.25 && R() < 0.5) roll = true; }
  }
  let aimAt: V3 | null = null, dT = 99, vis = false;
  if (best) {
    const c = ENEMIES[best.type];
    aimAt = v3(best.pos.x + best.vel.x * 0.05, best.pos.y + c.height * 0.55, best.pos.z + best.vel.z * 0.05);
    dT = Math.hypot(best.pos.x - p.pos.x, best.pos.z - p.pos.z); vis = visible(eye, aimAt);
    const dx = (best.pos.x - p.pos.x) / (dT || 1), dz = (best.pos.z - p.pos.z) / (dT || 1);
    const want = best.type === 'king' || best.type === 'colossus' ? 11 : best.type === 'clown' || best.type === 'windup' ? 9 : 10;
    const k = !vis ? 1 : dT > want + 2 ? 0.8 : dT < want - 3 ? -1 : 0;
    mx += dx * k; mz += dz * k;
    b.strafeT -= dt; if (b.strafeT <= 0) { b.strafe = R() < 0.5 ? -1 : 1; b.strafeT = 1 + R() * 1.6; }
    mx += -dz * b.strafe * 0.7; mz += dx * b.strafe * 0.7;
  }
  // keep inside arena / away from walls
  const H = ARENA.half; if (Math.abs(p.pos.x) > H - 2) mx -= Math.sign(p.pos.x) * 1.5; if (Math.abs(p.pos.z) > H - 2) mz -= Math.sign(p.pos.z) * 1.5;
  // ---- aim (turn-rate limited, from the camera like a human looking through the screen)
  if (aimAt) {
    let yaw = p.yaw, pitch = p.pitch;
    for (let i = 0; i < 2; i++) {
      const cam = computeCamera(p.pos, yaw, pitch, world.raycast).pos;
      const dx = aimAt.x - cam.x, dy = aimAt.y - cam.y, dz = aimAt.z - cam.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    yaw += b.aimOx; pitch += b.aimOy;
    const dy = wrap(yaw - p.yaw), mt = turn * dt;
    p.yaw += Math.max(-mt, Math.min(mt, dy)) + (R() - 0.5) * jit;
    p.pitch += Math.max(-mt, Math.min(mt, pitch - p.pitch)) + (R() - 0.5) * jit * 0.5;
  }
  // ---- translate world intent to WASD relative to yaw
  const f = forwardFrom(p.yaw, 0), r = rightFrom(p.yaw), ml = Math.hypot(mx, mz);
  const fz = ml > 0.2 ? (mx * f.x + mz * f.z) / ml : 0, rx = ml > 0.2 ? (mx * r.x + mz * r.z) / ml : 0;
  press('KeyW', fz > 0.35); press('KeyS', fz < -0.35); press('KeyD', rx > 0.35); press('KeyA', rx < -0.35);
  if (jump) { tap('Space'); b.jumps++; }
  if (roll && p.rollCharges > 0 && p.roll.active <= 0) { tap('KeyC'); b.rolls++; }
  // ---- weapons: shotgun close, rocket vs boss/tank, SMG otherwise
  const want = !best ? 0 : best.type === 'king' || best.type === 'colossus' || best.type === 'tank' ? 3 : dT < 6 ? 2 : 0;
  const ws = currentState(p.arsenal);
  const wi = want;
  if (p.arsenal.index !== wi && R() < 0.1) tap('Digit' + (wi + 1));
  const aligned = aimAt ? Math.abs(wrap(Math.atan2(-(aimAt.x - p.pos.x), -(aimAt.z - p.pos.z)) - p.yaw)) < 0.25 : false;
  input.mouseDown = !!best && vis && aligned && b.seenT > react && dT < currentConfig(p.arsenal).range;
  if (ws.ammo === 0 && ws.status !== 'reloading') tap('KeyR');
  // ---- F skill: use when it would matter
  const sk = CHAR_SKILLS[world.run.character].id;
  if (best && p.dash.cd <= 0 && p.dash.active <= 0) {
    const near = world.enemies.countActive((e) => !e.dead && dist2D(e.pos, p.pos) < 7);
    const use = sk === 'bubbleStorm' ? near >= 2 : sk === 'honeyShield' ? p.hp < p.maxHp * 0.7 || world.projectiles.countActive() > 4
      : sk === 'candyDash' ? dT < 6 : sk === 'phantomRoll' ? near >= 1 || p.hp < p.maxHp * 0.6 : sk === 'starlightSnipe' ? vis && dT > 6 : true;
    if (use) { tap('KeyF'); b.skillUses++; }
  }
  void WEAPON_ORDER;
}
