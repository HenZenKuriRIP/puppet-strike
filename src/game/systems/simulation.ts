import { BUBBLE_BURST, CAMERA, HITSTOP, ADS, COMBO, ENEMIES, FX, PLAYER, SKILLS, WAVE, WAVES, WEAPONS, WEAPON_ORDER, WeaponConfig, COOP, BulletVisualId, EnemyConfig, EnemyType, WaveDef, bvIndex, ARENA } from '../../config/game';
import { input as realInput, InputLike } from '../core/input';
import { add, approach, clamp, dist2D, forwardFrom, lerpAngle, norm, rightFrom, scale, sub, V3, v3, len, dist } from '../core/math';
import { world, spawnEnemy, Enemy } from '../core/world';
import { emit, r2, evq } from '../core/events';
import { burst, confetti, puff, dmgNumber, blastFx, tracer, shake, recoil, uiSet, callout, snd, CONFETTI, funnyKill } from './fx';
import { moveAndCollide } from '../physics/collision';
import { MOUNTS, ARENA_BOXES, SPAWN_POINTS, SPRING_PADS, SPRING_VEL, BOSS_BOUND, PICKUP_SPOTS, MOVERS, MOVER_BOXES } from '../levels/arenaLayout';
import { groundHeight, terrainSpeedMult } from '../levels/terrain';
import { resolvePickupSpot, inCollectRange, inMagnetRange, standHeight, pickupInsideSolid, PICKUP_REST, MAGNET_R } from '../levels/pickupSpot';
import { computeCamera } from '../camera/cameraRig';
import { pickTarget } from './targeting';
import { stepWeapon } from '../weapons/weaponMachine';
import { canFire, currentConfig, currentState, cycleWeapon, stepArsenal, switchWeapon } from '../weapons/arsenal';
import { stepFsm, setState } from '../ai/enemyFsm';
import { armorMultiplier, leapVelocity, orbitPoint } from '../ai/behaviors';
import { stepWaves, remainingInWave, scaleWave, coopCountMult, coopHpMult } from '../progression/waveManager';
import { applyDamage, falloff } from '../combat/damage';
import { raySphere } from '../combat/raycast';
import { resolveExplosion } from '../combat/aoe';
import { comboKill, currentMultiplier, stepCombo } from '../combat/combo';
import { reduceCooldown, stepSkill, tryActivate } from './skills';
import { useUI } from '../../app/store';
import { CHAR_SKILLS, CHAR_STATS, SkillId } from '../characters/registry';
import { KING, stepBoss, bossInvulnerable, isBossType } from '../boss/kingGummy';
import { COLOSSUS, freightLine, wallSlots } from '../boss/colossus';
import { survivalWave, survivalHpMult, survivalDmgMult, isUpgradeWave } from '../progression/survival';
import { stepMechSim, fanDeflect, intent as mechIntent } from './mechSim';
import { mechHit, mechExplosion, spawnBrick } from '../levels/mech';
import { requestUpgrade, stageCleared, finishRun, stepOffers } from './runFlow';

/** M4: weapon config with character stats + roguelite mods applied */
export function effConfig(i: number): WeaponConfig {
  const base = WEAPONS[WEAPON_ORDER[i]], st = CHAR_STATS[world.run.character], m = world.run.mods;
  const tw = st.weaponTweak && st.weaponTweak.weapon === i ? st.weaponTweak : undefined;
  return { ...base,
    fireRate: base.fireRate * st.fireRateMult * m.fireRate * (tw?.fireRateMult ?? 1),
    damage: base.damage * st.damageMult * m.damage * (tw?.damageMult ?? 1),
    magSize: Math.round(base.magSize * m.magMult), reloadTime: base.reloadTime * m.reloadMult,
    pellets: base.pellets + (base.kind === 'hitscan' ? m.extraProjectiles : 0) };
}
const isBoss = (e: Enemy) => isBossType(e.type);

const copy = (dst: V3, src: V3) => { dst.x = src.x; dst.y = src.y; dst.z = src.z; };
export { confetti };

// ---------------- M6: slot context ----------------
let input: InputLike = realInput;
/** switch the sim context (player, run, shield, turret, combo, input ...) to another slot */
export function setActive(i: number) { world.active = i; input = world.slots[i].input ?? realInput; }
export function withSlot<T>(i: number, fn: () => T): T { const prev = world.active; setActive(i); try { return fn(); } finally { setActive(prev); } }
const alivePlayers = () => world.slots.filter((s) => !s.player.dead).length;
/** candy bullet visual for the active player's weapon, with upgrade/element variants */
export function bulletVis(cfg: WeaponConfig): number {
  const m = world.run.mods;
  if (m.burnDps > 0) return bvIndex('heart');
  if (m.chainChance > 0) return bvIndex('star');
  if (m.bounces > 0) return bvIndex('bean');
  if (m.splitShards > 0) return bvIndex('cookie');
  return bvIndex(cfg.bulletVisual);
}

/** first hit of ray among living enemies; returns enemy, distance, crit(head) */
function rayEnemies(o: V3, d: V3, max: number): { e: Enemy; t: number; crit: boolean } | null {
  let best: { e: Enemy; t: number; crit: boolean } | null = null;
  for (const e of world.enemies.items) {
    if (!e.active || e.dead) continue;
    const c = ENEMIES[e.type];
    const body = raySphere(o, d, v3(e.pos.x, e.pos.y + c.height * 0.42, e.pos.z), c.radius * 1.05, max);
    const head = raySphere(o, d, v3(e.pos.x, e.pos.y + c.height * 0.95, e.pos.z), c.radius * 0.8, max);
    const t = head !== null && (body === null || head <= body) ? head : body;
    if (t !== null && (!best || t < best.t)) best = { e, t, crit: t === head && !c.armorFront };
  }
  return best;
}

export function muzzlePos(cfg: WeaponConfig = currentConfig(world.player.arsenal)): V3 {
  const p = world.player, [ox, oy, oz] = cfg.muzzleOffset;
  const f = p.facing, c = Math.cos(f), s = Math.sin(f);
  return v3(p.pos.x + ox * c + oz * s, p.pos.y + oy, p.pos.z - ox * s + oz * c);
}

// ---------------- damage, kills, explosions ----------------
function onEnemyKilled(e: Enemy, byPlayer = true, crit = false) {
  const c = ENEMIES[e.type];
  if (isBoss(e)) { bossDefeated(e); }
  maybeDrop(e);
  world.hitStop = Math.min(HITSTOP.max, Math.max(world.hitStop, crit ? HITSTOP.critKill : HITSTOP.kill));
  if (c.brick) burst(v3(e.pos.x, e.pos.y + c.height * 0.6, e.pos.z), 24, BRICK_COLS, 6.5, 0.9, 1.45); else confetti(v3(e.pos.x, e.pos.y + c.height * 0.6, e.pos.z), 24);
  funnyKill(v3(e.pos.x, e.pos.y + c.height * 0.55, e.pos.z), !!c.brick, isBoss(e) ? 2.0 : c.score >= 80 ? 1.45 : 1);
  e.deathTimer = c.brick ? 0.7 : FX.deathPopTime; setState(e.fsm, 'dead'); e.bound = 0;
  snd.kill();
  if (e.type === 'clown') queueBlast(v3(e.pos.x, e.pos.y + 0.6, e.pos.z), c.blastRadius!, 45, 8, byPlayer ? c.damage * 0.5 : c.damage, 0.12, '#ff8c42');
  if (!byPlayer) return;
  world.kills++;
  const ck = comboKill(world.combo, COMBO);
  const m = world.run.mods;
  world.score += Math.round(c.score * (ck.multiplier + (ck.tier >= 4 ? m.comboCapBonus : 0)));
  if (m.lifesteal) { world.player.hp = Math.min(world.player.maxHp, world.player.hp + m.lifesteal); }
  if (m.killCdr) reduceCooldown(world.player.dash, m.killCdr);
  const kp = v3(e.pos.x, e.pos.y + c.height * 0.5, e.pos.z);
  if (m.freezeOnKill) {
    blastFx(kp, 3, '#bff6ff', 0.4); burst(kp, 10, ['#bff6ff', '#ffffff'], 4, 0.4);
    for (const o of world.enemies.items) if (o.active && !o.dead && dist(kp, o.pos) < 3.2) o.bound = Math.max(o.bound, 2 * (ENEMIES[o.type].bindResist ?? 1));
  }
  if (m.splitShards) chainFrom(kp, e, 18 * m.damage, m.splitShards, '#ff9ec7', 7, false);
  reduceCooldown(world.player.dash, ck.regen); world.player.rollRecharge = Math.max(0, world.player.rollRecharge - ck.regen);
  if (ck.heal) world.player.hp = Math.min(world.player.maxHp, world.player.hp + ck.heal);
  if (ck.tierUp) { callout(COMBO.names[ck.tier], ck.tier); snd.combo(ck.tier); world.shake = Math.max(world.shake, 0.1 * ck.tier); burst(v3(world.player.pos.x, world.player.pos.y + 2, world.player.pos.z), 8 * ck.tier, CONFETTI, 5, 0.8); }
}

export function damageEnemy(e: Enemy, amount: number, opts: { dir?: V3; crit?: boolean; at?: V3 } = {}) {
  if (e.dead) return { dealt: 0, killed: false };
  const c = ENEMIES[e.type];
  e.lastHit = world.active;
  if (isBoss(e) && bossInvulnerable(world.boss.s)) { if (Math.random() < 0.3) dmgNumber(v3(e.pos.x, e.pos.y + c.height + 0.4, e.pos.z), 0, false, 'IMMUNE'); return { dealt: 0, killed: false }; }
  let mult = 1;
  if (opts.dir) mult = armorMultiplier(e.facing, opts.dir, c.armorFront);
  const r = applyDamage(e, amount * mult, FX.hitFlashTime);
  e.hitReact = opts.crit ? 0.36 : 0.28;
  const at = opts.at ?? v3(e.pos.x, e.pos.y + c.height + 0.2, e.pos.z);
  dmgNumber(add(at, v3(0, 0.35, 0)), r.dealt, !!opts.crit, mult < 1 ? 'ARMOR ' : '');
  if (mult < 1) burst(at, 5, ['#cfd8dc', '#ffffff'], 3.2, 0.3, 0.85);
  else burst(at, opts.crit ? 10 : 7, opts.crit ? ['#fff3a0', '#ff9ec7', '#ffffff', '#ffe566'] : ['#fff6a8', '#ff9ec7', '#ffffff'], opts.crit ? 5 : 3.8, opts.crit ? 0.42 : 0.32, opts.crit ? 1.15 : 0.9);
  if (opts.crit) {
    burst(at, 6, ['#fff3a0', '#ffe566', '#ffffff'], 5.5, 0.45, 1.3, bvIndex('star'));
    if (useUI.getState().settings.shake) shake(0.22, world.active);
  }
  if (r.killed) onEnemyKilled(e, true, !!opts.crit);
  else if (opts.crit) world.hitStop = Math.max(world.hitStop, HITSTOP.crit);
  if (!r.killed && (e.fsm.state === 'idle' || e.fsm.state === 'patrol')) setState(e.fsm, 'detect', 0.1);
  return r;
}

/** chain/bounce/split: hop to nearest un-hit enemies (capped by PERF_CAPS via mods) */
function chainFrom(from: V3, first: Enemy, dmg: number, n: number, color: string, range: number, burn: boolean) {
  const hit = new Set<Enemy>([first]); let cur = from;
  for (let k = 0; k < n; k++) {
    let best: Enemy | null = null, bd = range;
    for (const o of world.enemies.items) { if (!o.active || o.dead || hit.has(o)) continue; const d = dist(cur, o.pos); if (d < bd) { bd = d; best = o; } }
    if (!best) break;
    const to = v3(best.pos.x, best.pos.y + ENEMIES[best.type].height * 0.5, best.pos.z);
    tracer(cur, to, 0.12, color, 1.6, bvIndex('star'), 0.18);
    hit.add(best); damageEnemy(best, dmg, { at: to });
    if (burn && world.run.mods.burnDps) best.burn = 2;
    burst(to, 4, [color, '#ffffff'], 3, 0.25, 0.7);
    cur = to;
  }
}
function procs(e: Enemy, amount: number, at: V3) {
  const m = world.run.mods;
  if (m.burnDps > 0 && !e.dead) e.burn = 2;
  if (m.chainChance > 0 && Math.random() < m.chainChance) chainFrom(at, e, amount * 0.4 + 6, m.chainTargets, '#7fe8ff', 9, true);
  if (m.bounces > 0) chainFrom(at, e, amount * 0.5, m.bounces, '#fff3a0', 8, false);
}

function queueBlast(pos: V3, radius: number, damage: number, knockback: number, playerDamage: number, delay: number, color: string) {
  const b = world.pending.spawn(); if (!b) return;
  copy(b.pos, pos); b.radius = radius; b.damage = damage; b.knockback = knockback; b.playerDamage = playerDamage; b.delay = delay; b.color = color; b.owner = world.active;
}

/** Explosion: AoE + knockback; bubble-bound enemies burst (Toy Combo). */
export function explode(pos: V3, radius: number, damage: number, knockback: number, playerDamage: number, color = '#ffb36b') {
  blastFx(pos, radius, color, 0.55);
  mechExplosion(pos.x, pos.y, pos.z, radius, damage, world.time);
  burst(pos, 32, [color, '#fff3a0', '#ffffff', '#ff9ec7'], 8.5, 0.7, 1.55);
  shake(FX.shakeOnBlast);
  snd.explosion();
  const king = world.boss.id >= 0 ? world.enemies.items[world.boss.id] : null;
  const kingHp = king && king.active && isBoss(king) && bossInvulnerable(world.boss.s) ? king.hp : -1;
  const res = resolveExplosion({ center: pos, radius, damage, knockback }, world.enemies.items, BUBBLE_BURST);
  if (king && kingHp >= 0) { king.hp = kingHp; king.dead = false; }
  if (king && king.active && isBoss(king)) { king.vel.x = king.vel.z = 0; king.knockT = 0; }
  for (const h of res.hits) {
    h.target.hitReact = 0.32;
    dmgNumber(v3(h.target.pos.x, h.target.pos.y + ENEMIES[h.target.type].height + 0.3, h.target.pos.z), h.dealt, h.fromBurst);
    if (h.killed && !h.target.dead) continue;
    if (h.killed) onEnemyKilled(h.target);
  }
  res.bursts.forEach((b, bi) => {
    blastFx(b, BUBBLE_BURST.radius, '#7fe8ff', 0.5);
    burst(b, 20, ['#bff6ff', '#7fe8ff', '#ffffff', '#c9a8ff'], 6, 0.6, 1.2);
    if (bi === 0) dmgNumber(add(b, v3(0, 1.4, 0)), 0, true, 'BUBBLE BURST!');
    snd.bubblePop();
  });
  if (res.bursts.length) { callout(res.bursts.length > 1 ? `BUBBLE CHAIN x${res.bursts.length}!` : 'BUBBLE BURST!', 2); }
  if (playerDamage > 0) {
    world.slots.forEach((sl, i) => {
      const p = sl.player; if (p.dead) return;
      const d = dist(pos, v3(p.pos.x, p.pos.y + 0.7, p.pos.z));
      if (d < radius) hurtPlayer(playerDamage * (1 - 0.5 * d / radius), i);
    });
  }
  return res;
}

// ---------------- player weapons ----------------
function aimPoint(dir: V3, range: number): V3 {
  const p = world.player, cam = world.cam.pos;
  const pivot = v3(p.pos.x, p.pos.y + CAMERA.pivotHeight, p.pos.z);
  const skip = Math.max(0, (pivot.x - cam.x) * dir.x + (pivot.y - cam.y) * dir.y + (pivot.z - cam.z) * dir.z);
  const o = add(cam, scale(dir, skip));
  const geo = world.raycast(o, dir, range);
  const en = rayEnemies(o, dir, range);
  let t = range; if (geo !== null) t = geo; if (en && en.t < t) t = en.t;
  return add(o, scale(dir, t));
}
function spreadDir(spread: number) {
  const p = world.player;
  // uniform-ish disc
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  return forwardFrom(p.yaw + Math.cos(a) * r, p.pitch + Math.sin(a) * r);
}

function fireHitscan(cfg: WeaponConfig, spread: number) {
  const m = muzzlePos(cfg), vis = bulletVis(cfg);
  const acc = new Map<Enemy, { sum: number; crit: boolean; at: V3; dir: V3 }>();
  for (let i = 0; i < cfg.pellets; i++) {
    const target = aimPoint(spreadDir(spread), cfg.range);
    const toT = sub(target, m); const dTT = len(toT); const d2 = norm(toT);
    const max2 = Math.min(cfg.range, dTT + 0.6);
    const geo2 = world.raycast(m, d2, max2);
    const en2 = rayEnemies(m, d2, max2);
    let end = add(m, scale(d2, Math.min(dTT, max2)));
    if (en2 && (geo2 === null || en2.t <= geo2)) {
      end = add(m, scale(d2, en2.t));
      const crit = en2.crit || Math.random() < world.run.mods.critChance;
      const amt = cfg.damage * falloff(en2.t, cfg.falloffStart, cfg.range, cfg.falloffMin) * (crit ? 1.6 : 1);
      const a = acc.get(en2.e) ?? { sum: 0, crit: false, at: end, dir: d2 };
      a.sum += amt; a.crit ||= crit; acc.set(en2.e, a);
      if (i % 3 === 0) puff(end, 0.3, '#fff3f8');
      burst(end, cfg.pellets > 1 ? 5 : 9, cfg.pellets > 1 ? cfg.tracerColors : ['#fff6a8', '#ffffff', '#ff9ec7'], 4.2, 0.38, 1.05);
    } else if (geo2 !== null) {
      end = add(m, scale(d2, geo2));
      mechHit(end.x, end.y, end.z, cfg.damage * falloff(geo2, cfg.falloffStart, cfg.range, cfg.falloffMin), d2.x, d2.z, world.time);
      burst(end, cfg.pellets > 1 ? 3 : 6, ['#ffffff', ...cfg.tracerColors], 3.0, 0.32, 0.8);
      if (i % 3 === 0) puff(end, 0.35);
    }
    balloonRay(m, d2, dist(m, end));
    const seg = dist(m, end);
    tracer(m, end, clamp(seg / cfg.bulletSpeed, 0.06, 0.42) + 0.05, cfg.tracerColors[i % cfg.tracerColors.length], cfg.pellets > 1 ? 1.75 : 1.35, vis, cfg.bulletSize);
  }
  let any = false;
  for (const [e, a] of acc) { any = true; damageEnemy(e, a.sum, { dir: a.dir, crit: a.crit, at: a.at }); procs(e, a.sum, a.at); }
  if (any) { uiSet({ hitMarker: performance.now() }, world.active); snd.hit(); }
}

function fireProjectile(cfg: WeaponConfig, spread: number) {
  const m = muzzlePos(cfg);
  const target = aimPoint(spreadDir(spread), cfg.range);
  const d = norm(sub(target, m));
  const n = 1 + world.run.mods.extraProjectiles;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.09, c = Math.cos(off), sn = Math.sin(off);
    const dd = v3(d.x * c - d.z * sn, d.y, d.x * sn + d.z * c);
    const s = world.shots.spawnOrRecycle();
    s.kind = cfg.id === 'bubbleLauncher' ? 'bubble' : 'rocket';
    copy(s.pos, m); copy(s.prev, m); s.vel = scale(dd, cfg.projectileSpeed!); s.life = cfg.projectileLife!;
    s.vis = bulletVis(cfg); s.owner = world.active; s.size = cfg.bulletSize; s.color = cfg.tracerColors[0];
  }
}

function fire(cfg: WeaponConfig) {
  world.stats.shotsFired++;
  const p = world.player;
  const moving = p.speed > 1;
  const spread = (cfg.spreadHip + (moving ? cfg.spreadMoving : 0) + (p.grounded ? 0 : cfg.spreadMoving)) * (1 - world.aiming * (1 - ADS.spreadMult));
  if (cfg.kind === 'hitscan') fireHitscan(cfg, spread); else fireProjectile(cfg, spread);
  world.muzzleFlash = cfg.id === 'rainbowShotgun' ? 0.12 : cfg.id === 'springRocket' ? 0.11 : 0.08;
  p.shootAnim = 1; p.aimHold = 0.6;
  const mz = muzzlePos(cfg);
  burst(mz, 6 + cfg.sprinkles * 2, ['#fff3a0', '#ff9ec7', '#ffffff', cfg.color], 3.8, 0.32, 1.05, bvIndex('star'));
  if (cfg.sprinkles > 0) burst(mz, 3 + cfg.sprinkles, ['#ff9ec7', '#fff3a0', '#c9a8ff'], 2.8, 0.28, 0.9, bvIndex('heart'));
  recoil((Math.random() - 0.5) * 2 * cfg.recoilYaw, cfg.recoilPitch);
  p.pitch = clamp(p.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  shake(cfg.shake, world.active);
  snd.shoot(cfg.id);
}

function stepShots(dt: number) {
  const prevActive = world.active;
  for (const s of world.shots.items) {
    if (!s.active) continue;
    if (s.owner !== world.active) setActive(s.owner);
    copy(s.prev, s.pos);
    const cfg = s.kind === 'bubble' ? WEAPONS.bubbleLauncher : WEAPONS.springRocket;
    s.life -= dt;
    s.vel.y -= cfg.projectileGravity! * dt;
    fanDeflect(s.pos, s.vel, dt);
    const step = len(s.vel) * dt; const dir = norm(s.vel);
    const geo = world.raycast(s.pos, dir, step + cfg.projectileRadius!);
    let en: { e: Enemy; t: number } | null = null;
    for (const e of world.enemies.items) {
      if (!e.active || e.dead) continue;
      const c = ENEMIES[e.type];
      const t = raySphere(s.pos, dir, v3(e.pos.x, e.pos.y + c.height * 0.5, e.pos.z), c.radius + cfg.projectileRadius! + 0.1, step);
      if (t !== null && (!en || t < en.t)) en = { e, t };
    }
    balloonRay(s.pos, dir, step);
    const hitEnemy = en && (geo === null || en.t <= geo);
    if (hitEnemy || geo !== null || s.life <= 0) {
      const t = hitEnemy ? en!.t : geo ?? 0;
      const at = add(s.pos, scale(dir, Math.max(0, t - 0.05)));
      if (s.kind === 'rocket') {
        explode(at, cfg.aoeRadius!, effConfig(3).damage, cfg.knockback!, 0, '#ffb36b');
      } else {
        burst(at, 12, ['#bff6ff', '#ffffff', '#7fe8ff'], 3, 0.4, 0.9);
        if (!hitEnemy) mechHit(at.x, at.y, at.z, effConfig(1).damage * 0.8, dir.x, dir.z, world.time);
        snd.bubbleHit();
        if (hitEnemy) {
          const e = en!.e;
          const bat = v3(e.pos.x, e.pos.y + ENEMIES[e.type].height + 0.2, e.pos.z), bd = effConfig(1).damage;
          damageEnemy(e, bd, { at: bat }); procs(e, bd, bat);
          uiSet({ hitMarker: performance.now() }, world.active);
        }
        // bind the hit enemy and splash-bind neighbours
        for (const e of world.enemies.items) {
          if (!e.active || e.dead) continue;
          const c = ENEMIES[e.type];
          const close = (hitEnemy && e === en!.e) || dist(at, v3(e.pos.x, e.pos.y + c.height * 0.5, e.pos.z)) < cfg.bindSplash!;
          if (close) { e.bound = Math.max(e.bound, cfg.bindTime! * (c.bindResist ?? 1)); if (e.fsm.state === 'attack') setState(e.fsm, 'chase'); e.leapT = 0; }
        }
      }
      s.active = false; continue;
    }
    s.pos = add(s.pos, scale(s.vel, dt));
    if (s.kind === 'rocket' && Math.random() < 0.7) burst(s.pos, 1, ['#ffffff', '#ffd6e8'], 0.6, 0.35, 0.8, bvIndex('swirl'));
  }
  if (world.active !== prevActive) setActive(prevActive);
}

// ---------------- player ----------------
export function hurtPlayer(amount: number, slot = world.active) {
  if (slot !== world.active) { withSlot(slot, () => hurtPlayer(amount, slot)); return; }
  const p = world.player;
  if (p.dead || p.invuln > 0 || world.ended || p.won) return;
  if (world.run.mode === 'survival') amount *= survivalDmgMult(world.waves.index + 1);
  if (world.shield.hp > 0) {
    const a = Math.min(world.shield.hp, amount); world.shield.hp -= a; amount -= a;
    burst(v3(p.pos.x, p.pos.y + 1, p.pos.z), 6, ['#ffd36b', '#fff3a0'], 3, 0.3); snd.bubbleHit();
    if (amount <= 0) { p.invuln = PLAYER.hurtInvuln * 0.5; return; }
  }
  world.stats.damageTaken += Math.min(amount, p.hp); world.stats.hitsTaken++;
  applyDamage(p, amount, 0.28);
  p.invuln = PLAYER.hurtInvuln;
  burst(v3(p.pos.x, p.pos.y + 1.1, p.pos.z), 10, ['#ff6b8b', '#fff3a0', '#ffffff'], 4.2, 0.4, 1.1);
  puff(v3(p.pos.x, p.pos.y + 1.0, p.pos.z), 0.55, '#ffe0ec');
  shake(FX.shakeOnHurt, world.active);
  snd.hurt();
  if (p.dead) onPlayerDown();
}
/** a player reached 0 HP: in co-op they are downed (partner can revive); the run is lost only when everyone is down */
function onPlayerDown() {
  const p = world.player; p.revive = 0; p.downed = 0;
  if (alivePlayers() === 0) {
    world.outcome = 'lost';
    world.slots.forEach((_, i) => withSlot(i, () => snd.lose()));
  } else {
    callout('DOWN! partner can revive (hold E)', 3, world.active);
    uiSet({ banner: 'DOWNED - wait for a revive or the next wave' }, world.active);
    const partner = world.slots.findIndex((sl) => !sl.player.dead);
    if (partner >= 0) callout('PARTNER DOWN - hold E near them!', 2, partner);
  }
}

function stepPlayer(dt: number) {
  const p = world.player, slot = world.slots[world.active];
  stepSkill(p.dash, dt); stepSkill(p.roll, dt); stepArsenal(p.arsenal, dt);
  p.animT += dt;
  if (p.dead) { p.anim = 'defeat'; p.vel.x = p.vel.z = 0; p.vel.y -= PLAYER.gravity * dt; moveAndCollide(p.pos, p.vel, scale(p.vel, dt), PLAYER.radius, PLAYER.height, ARENA_BOXES); return; }
  if (p.won) { p.anim = 'victory'; return; }
  const k = input.keys, pr = input.pressed;
  const f = forwardFrom(p.yaw, 0), r = rightFrom(p.yaw);
  let ix = 0, iz = 0;
  if (k.has('KeyW')) iz += 1; if (k.has('KeyS')) iz -= 1; if (k.has('KeyD')) ix += 1; if (k.has('KeyA')) ix -= 1;
  let wish = v3(f.x * iz + r.x * ix, 0, f.z * iz + r.z * ix);
  const wl = Math.hypot(wish.x, wish.z); if (wl > 0) wish = scale(wish, 1 / wl);
  const busy = p.dash.active > 0 || p.roll.active > 0;

  // weapon switching
  const wheel = input.consumeWheel();
  let switched = false;
  if (pr.has('KeyQ')) switched = cycleWeapon(p.arsenal, 1);
  if (wheel) switched = cycleWeapon(p.arsenal, wheel > 0 ? 1 : -1) || switched;
  WEAPON_ORDER.forEach((_, i) => { if (!slot.offer && pr.has('Digit' + (i + 1))) switched = switchWeapon(p.arsenal, i) || switched; });
  if (switched) snd.swap();

  // skills
  const dir0 = wl > 0 ? wish : forwardFrom(p.yaw, 0);
  const sk = CHAR_SKILLS[world.run.character], mods = world.run.mods, stats = CHAR_STATS[world.run.character];
  if (pr.has('KeyF') && p.snipeCharge <= 0 && tryActivate(p.dash, { cooldown: sk.cooldown * mods.skillCdMult, duration: sk.duration }, p.roll.active > 0)) {
    activateSkill(sk.id, dir0); world.stats.skillCasts++;
  }
  const rollCd = SKILLS.roll.cooldown * mods.rollCdMult;
  if ((pr.has('ControlLeft') || pr.has('ControlRight') || pr.has('KeyC')) && p.dash.active <= 0 && p.roll.active <= 0 && p.rollCharges > 0) {
    p.rollCharges--; p.roll.active = SKILLS.roll.duration;
    p.moveDir = v3(dir0.x, 0, dir0.z); p.invuln = Math.max(p.invuln, SKILLS.roll.iframes + mods.rollIframes); snd.roll();
    p.facing = Math.atan2(-dir0.x, -dir0.z);
  }
  if (p.rollCharges < stats.rollCharges) { p.rollRecharge -= dt; if (p.rollRecharge <= 0) { p.rollCharges++; p.rollRecharge = rollCd; } }
  else p.rollRecharge = rollCd;
  if (p.snipeCharge > 0) {
    p.snipeCharge -= dt; p.facing = lerpAngle(p.facing, p.yaw, 0.5);
    if (Math.random() < 0.6) burst(muzzlePos(), 1, ['#fff3a0', '#c9a8ff'], 1, 0.3, 0.8);
    if (p.snipeCharge <= 0) fireSnipe();
  }

  world.aiming = approach(world.aiming, input.aimDown && !busy ? 1 : 0, dt / ADS.blendTime);
  p.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && iz > 0 && !input.mouseDown && !input.aimDown;
  if (p.dash.active > 0) {
    p.vel.x = p.moveDir.x * SKILLS.dash.speed; p.vel.z = p.moveDir.z * SKILLS.dash.speed; p.vel.y = Math.max(p.vel.y, 0);
    if (Math.random() < 0.8) burst(v3(p.pos.x, p.pos.y + 0.7, p.pos.z), 2, ['#ff9ec7', '#fff3a0', '#ffffff'], 1.5, 0.35, 1);
    for (const e of world.enemies.items) {
      if (!e.active || e.dead || p.dashHits.has(e.id)) continue;
      const c = ENEMIES[e.type];
      if (dist2D(e.pos, p.pos) < SKILLS.dash.hitRadius + c.radius * 0.5 && Math.abs(e.pos.y + c.height * 0.5 - (p.pos.y + 0.7)) < 1.6) {
        p.dashHits.add(e.id);
        damageEnemy(e, SKILLS.dash.damage, {});
        const kd = norm(v3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z));
        e.vel.x += kd.x * SKILLS.dash.knockback; e.vel.z += kd.z * SKILLS.dash.knockback; e.vel.y += 3; e.knockT = 0.35;
        burst(v3(e.pos.x, e.pos.y + 0.7, e.pos.z), 8, ['#ff9ec7', '#ffffff'], 4, 0.4);
        snd.hit();
      }
    }
  } else if (p.roll.active > 0) {
    p.vel.x = p.moveDir.x * SKILLS.roll.speed; p.vel.z = p.moveDir.z * SKILLS.roll.speed;
  } else {
    const top = (p.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * (1 - world.aiming * (1 - ADS.moveMult)) * stats.moveMult * mods.move * (p.snipeCharge > 0 ? 0.35 : 1) * terrainSpeedMult(p.pos.x, p.pos.z);
    const control = p.grounded ? 1 : PLAYER.airControl;
    const rate = (wl > 0 ? PLAYER.accel : PLAYER.decel) * control * dt;
    p.vel.x = approach(p.vel.x, wish.x * top, rate);
    p.vel.z = approach(p.vel.z, wish.z * top, rate);
  }

  // jump: coyote time + buffer
  if (pr.has('Space')) p.jumpBuf = PLAYER.jumpBuffer;
  p.coyote = p.grounded ? PLAYER.coyoteTime : p.coyote - dt;
  p.jumpBuf -= dt;
  if (!busy && p.jumpBuf > 0 && p.coyote > 0) { p.vel.y = PLAYER.jumpVelocity; p.jumpBuf = 0; p.coyote = 0; p.grounded = false; snd.jump(); }
  if (p.dash.active <= 0) p.vel.y -= PLAYER.gravity * dt;

  mechIntent[world.active][0] = p.vel.x; mechIntent[world.active][1] = p.vel.z;
  const res = moveAndCollide(p.pos, p.vel, scale(p.vel, dt), PLAYER.radius, PLAYER.height, ARENA_BOXES);
  p.grounded = res.grounded && p.vel.y <= 0;
  p.padCd -= dt;
  if (p.padCd <= 0 && p.grounded && p.dash.active <= 0) for (const [sx, sz] of SPRING_PADS) {
    if (Math.hypot(p.pos.x - sx, p.pos.z - sz) < 1.5) {
      p.vel.y = SPRING_VEL; p.grounded = false; p.padCd = 0.6; p.coyote = 0;
      burst(v3(p.pos.x, p.pos.y + 0.2, p.pos.z), 10, ['#ffe066', '#ff9ec7', '#ffffff'], 4, 0.4, 1); snd.boing(); break;
    }
  }
  if (world.boss.id >= 0) { // boss arena: players stay inside the plaza ring while the king lives
    const kg = world.enemies.items[world.boss.id];
    if (kg && kg.active && !kg.dead) { const rr = Math.hypot(p.pos.x, p.pos.z), mx = BOSS_BOUND + 3; if (rr > mx) { const k = mx / rr; p.pos.x *= k; p.pos.z *= k; } }
  }
  collectPickups(p);
  p.airTime = p.grounded ? 0 : p.airTime + dt;
  p.speed = Math.hypot(p.vel.x, p.vel.z);
  p.runPhase += p.speed * dt * 1.6;

  p.aimHold -= dt;
  if (!busy) {
    let targetYaw = p.facing;
    if (p.aimHold > 0 || input.mouseDown || input.aimDown) targetYaw = p.yaw;
    else if (p.speed > 0.5) targetYaw = Math.atan2(-p.vel.x, -p.vel.z);
    p.facing = lerpAngle(p.facing, targetYaw, 1 - Math.exp(-PLAYER.turnSpeed * dt));
  }

  const cfg = effConfig(p.arsenal.index), ws = currentState(p.arsenal);
  const ev = stepWeapon(ws, cfg, { trigger: input.mouseDown && !busy && p.snipeCharge <= 0 && canFire(p.arsenal), reload: pr.has('KeyR') && !busy }, dt);
  if (ev.fired) { p.facing = lerpAngle(p.facing, p.yaw, 0.6); fire(cfg); }
  if (ev.reloadStarted) snd.reload();
  if (ev.dryFire) snd.dry();
  p.shootAnim = Math.max(0, p.shootAnim - dt * 7);
  p.flash = Math.max(0, p.flash - dt); p.invuln -= dt;

  // animation state (priority order)
  p.anim = p.dash.active > 0 ? 'dash' : p.roll.active > 0 ? 'dodge' : p.flash > 0.1 ? 'hit' : !p.grounded ? 'jump'
    : ws.status === 'reloading' ? 'reload' : p.shootAnim > 0 || p.aimHold > 0.3 ? 'shoot' : p.speed > 0.6 ? 'run' : 'idle';
}

function activateSkill(id: SkillId, dir0: V3) {
  const p = world.player, sk = CHAR_SKILLS[world.run.character], pp = v3(p.pos.x, p.pos.y + 0.9, p.pos.z);
  if (id !== 'candyDash') p.dash.active = 0;
  switch (id) {
    case 'candyDash':
      p.moveDir = v3(dir0.x, 0, dir0.z); p.dashHits.clear(); p.invuln = Math.max(p.invuln, SKILLS.dash.invuln); snd.dash();
      p.facing = Math.atan2(-dir0.x, -dir0.z); break;
    case 'honeyShield':
      world.shield.hp = sk.params.absorb; world.shield.t = sk.duration; burst(pp, 18, ['#ffd36b', '#fff3a0', '#ffffff'], 4, 0.5); snd.combo(2); break;
    case 'phantomRoll':
      copy(world.decoy.pos, p.pos); world.decoy.t = sk.params.decoyTime;
      p.roll.active = SKILLS.roll.duration; p.moveDir = v3(dir0.x, 0, dir0.z); p.invuln = Math.max(p.invuln, 0.5);
      p.facing = Math.atan2(-dir0.x, -dir0.z); burst(pp, 14, ['#c9a8ff', '#ffffff', '#ff9ec7'], 3, 0.5); snd.roll(); break;
    case 'mechBuddy': {
      const f = forwardFrom(p.facing, 0);
      world.turret.pos = v3(p.pos.x + f.x * 1.3, p.pos.y, p.pos.z + f.z * 1.3); world.turret.t = sk.duration; world.turret.cd = 0.5;
      burst(world.turret.pos, 14, ['#ffd84d', '#7fd8ff', '#ffffff'], 4, 0.5); snd.land(); break;
    }
    case 'starlightSnipe': p.snipeCharge = sk.duration; snd.windup(); break;
    case 'bubbleStorm': {
      const r = sk.params.radius;
      blastFx(v3(p.pos.x, 0.2, p.pos.z), r, '#7fe8ff', 0.6); burst(pp, 30, ['#bff6ff', '#7fe8ff', '#ffffff', '#c9a8ff'], 7, 0.7, 1.3); snd.bubblePop();
      for (const e of world.enemies.items) {
        if (!e.active || e.dead || dist2D(e.pos, p.pos) > r) continue;
        damageEnemy(e, sk.params.damage * world.run.mods.damage, {});
        if (!e.dead) { e.bound = Math.max(e.bound, sk.params.bind * (ENEMIES[e.type].bindResist ?? 1)); e.leapT = 0; if (e.fsm.state === 'attack') setState(e.fsm, 'chase'); }
      }
      callout('BUBBLE STORM!', 2); break;
    }
  }
}
function fireSnipe() {
  const p = world.player, sk = CHAR_SKILLS.luna, m = muzzlePos();
  const target = aimPoint(spreadDir(0), sk.params.range); const d = norm(sub(target, m));
  const geo = world.raycast(m, d, sk.params.range) ?? sk.params.range;
  const dmg = sk.params.damage * CHAR_STATS[world.run.character].damageMult * world.run.mods.damage;
  let n = 0;
  for (const e of world.enemies.items) {
    if (!e.active || e.dead) continue; const c = ENEMIES[e.type];
    const t = raySphere(m, d, v3(e.pos.x, e.pos.y + c.height * 0.5, e.pos.z), c.radius * 1.2 + 0.25, geo);
    if (t !== null) { const at = add(m, scale(d, t)); damageEnemy(e, dmg, { crit: true, at }); procs(e, dmg, at); n++; }
  }
  for (const col of ['#fff3a0', '#c9a8ff']) tracer(m, add(m, scale(d, geo)), 0.35, col, col === '#fff3a0' ? 4 : 2.5, bvIndex('star'), 0.5);
  balloonRay(m, d, geo);
  burst(m, 14, ['#fff3a0', '#c9a8ff', '#ffffff'], 5, 0.5); shake(0.35, world.active); world.muzzleFlash = 0.1;
  p.pitch = clamp(p.pitch + 0.05, CAMERA.minPitch, CAMERA.maxPitch); snd.cannon();
  if (n) { uiSet({ hitMarker: performance.now() }, world.active); if (n > 1) callout(`PIERCE x${n}!`, 2); }
}

function stepTurret(dt: number) {
  const T = world.turret; if (T.t <= 0) return;
  T.t -= dt; T.cd -= dt; const sk = CHAR_SKILLS.bolt.params;
  const o = v3(T.pos.x, T.pos.y + 0.9, T.pos.z);
  let best: Enemy | null = null, bd = sk.range;
  for (const e of world.enemies.items) {
    if (!e.active || e.dead) continue; const d = dist2D(e.pos, T.pos); if (d >= bd) continue;
    const to = v3(e.pos.x, e.pos.y + ENEMIES[e.type].height * 0.5, e.pos.z);
    if (!canSee(o, to)) continue; bd = d; best = e;
  }
  if (!best) return;
  T.aim = lerpAngle(T.aim, Math.atan2(-(best.pos.x - T.pos.x), -(best.pos.z - T.pos.z)), 0.4);
  if (T.cd <= 0) {
    T.cd = 1 / sk.rate;
    const to = v3(best.pos.x, best.pos.y + ENEMIES[best.type].height * 0.5, best.pos.z);
    tracer(o, to, 0.06, '#7fffe0', 1.2, bvIndex('bean'), 0.12);
    damageEnemy(best, sk.damage * world.run.mods.damage, { at: to }); burst(to, 3, ['#7fffe0', '#ffffff'], 2.5, 0.2, 0.6);
  }
}

// ---------------- boss: KING GUMMY ----------------
const GUMMY = ['#ff5c9a', '#ffb347', '#7fe8ff', '#9ef0d0', '#c9a8ff', '#fff3a0'];
const BOSS_VIS: BulletVisualId[] = ['heart', 'star', 'swirl', 'bean', 'gumdrop', 'wrapped'];
function bossShot(from: V3, dir: V3, speed: number, dmg: number, color: string) {
  const pr = world.projectiles.spawn(); if (!pr) return;
  pr.pos = v3(from.x, from.y, from.z); pr.vel = scale(norm(dir), speed); pr.life = 4; pr.damage = dmg; pr.size = 1.4; pr.color = color;
  pr.vis = bvIndex(world.mapId === 'block' ? 'choc' : BOSS_VIS[Math.max(0, GUMMY.indexOf(color))] ?? 'heart');
}
function bossDefeated(e: Enemy) {
  e.deathTimer = 1.6; world.boss.celebrate = 3;
  for (const o of world.enemies.items) if (o.active && o !== e && !o.dead) { o.hp = 0; o.dead = true; o.deathTimer = 0.3; setState(o.fsm, 'dead'); }
  world.projectiles.clear(); world.hazards = [];
  for (const sl of world.slots) { if (!sl.player.dead) sl.player.won = true; }
  shake(0.8);
  if (e.type === 'colossus') { e.deathTimer = 3.2; burst(v3(e.pos.x, e.pos.y + 3, e.pos.z), 60, BRICK_COLS, 9, 1.2, 2); callout('🧱 BRICK COLOSSUS 解体了！VICTORY!', 4); }
  else callout('👑 KING GUMMY 被打败了！VICTORY!', 4);
  snd.win();
}
/** M5: patrol target ≥3 m away (near walls a clamped random point could land on top of the enemy → it looked stuck). */
const PB = ARENA.half - 4;
function pickPatrol(e: Enemy, stuck = false) {
  e.bestD = 1e9; e.progT = 0;
  // when pinned (corner/cover), head back toward open floor near the centre instead of another random local point
  if (stuck) { e.patrol.x = e.pos.x * 0.3 + (Math.random() - 0.5) * 6; e.patrol.z = e.pos.z * 0.3 + (Math.random() - 0.5) * 6; return; }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, x = clamp(e.pos.x + Math.cos(a) * 6, -PB, PB), z = clamp(e.pos.z + Math.sin(a) * 6, -PB, PB);
    if (Math.hypot(x - e.pos.x, z - e.pos.z) > 3 || i === 7) { e.patrol.x = i === 7 ? e.pos.x * 0.5 : x; e.patrol.z = i === 7 ? e.pos.z * 0.5 : z; return; }
  }
}
const BRICK_COLS = ['#e53935', '#1e6fe8', '#ffd21f', '#2fb344', '#ff8a1f', '#ffffff'];
const MAX_HAZARDS = 23; // M5: hard cap (hazards also self-expire)
function stepKing(e: Enemy, dt: number) {
  const B = world.boss, s = B.s, c = ENEMIES.king;
  const bts = nearestAlive(e.pos), p = world.slots[bts].player;
  const ev = stepBoss(s, e.hp / e.maxHp, dt);
  B.tele = s.tele; B.slamT = Math.max(0, B.slamT - dt);
  const chest = v3(e.pos.x, e.pos.y + 2.2, e.pos.z);
  const toP = norm(v3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z)), d = dist2D(e.pos, p.pos);
  e.facing = lerpAngle(e.facing, Math.atan2(-toP.x, -toP.z), 1 - Math.exp(-3 * dt));
  if (ev.phaseChanged) {
    callout(ev.phaseChanged === 2 ? 'PHASE 2 · 糖果士兵，集合！' : 'PHASE 3 · 国王发怒了！', 4);
    snd.combo(4); shake(0.6); blastFx(v3(e.pos.x, 0.2, e.pos.z), 9, '#ff5c9a', 0.7);
    burst(chest, 30, GUMMY, 7, 0.8, 1.4); world.projectiles.clear();
  }
  if (ev.telegraph) {
    snd.windup();
    if (world.hazards.length > MAX_HAZARDS) world.hazards.shift();
    if (ev.telegraph === 'slam') world.hazards.push({ pos: v3(e.pos.x, 0, e.pos.z), r: KING.slam.radius, t: KING.telegraph.slam, max: KING.telegraph.slam, dmg: KING.slam.damage, kind: 'slam' });
    if (ev.telegraph === 'hazard') for (let i = 0; i < KING.hazard.count; i++) {
      const a = i === 0 ? 0 : (i / KING.hazard.count) * Math.PI * 2 + world.time, rr = i === 0 ? 0 : 4.5;
      if (world.hazards.length > MAX_HAZARDS) world.hazards.shift(); world.hazards.push({ pos: v3(clamp(p.pos.x + Math.cos(a) * rr, -BOSS_BOUND - 3, BOSS_BOUND + 3), 0, clamp(p.pos.z + Math.sin(a) * rr, -BOSS_BOUND - 3, BOSS_BOUND + 3)), r: KING.hazard.radius, t: KING.telegraph.hazard, max: KING.telegraph.hazard, dmg: KING.hazard.damage, kind: 'hazard' });
    }
  }
  if (ev.attack) {
    const base = Math.atan2(toP.z, toP.x);
    switch (ev.attack) {
      case 'ring': { const n = KING.ring.count, off = (s.cycleIdx % 2) * Math.PI / n;
        for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; bossShot(chest, v3(Math.cos(a), -0.08, Math.sin(a)), KING.ring.speed, KING.ring.damage, GUMMY[i % GUMMY.length]); }
        snd.cannon(); break; }
      case 'fan': for (let i = 0; i < KING.fan.count; i++) { const a = base + (i - (KING.fan.count - 1) / 2) * (KING.fan.arc / (KING.fan.count - 1)); bossShot(chest, v3(Math.cos(a), (p.pos.y + 0.9 - chest.y) / Math.max(4, d), Math.sin(a)), KING.fan.speed, KING.fan.damage, '#ff5c9a'); } snd.enemyShoot(); break;
      case 'spiral': B.spiralLeft = KING.spiral.shots; B.spiralT = 0; B.spiralAng = base; break;
      case 'summon': {
        const alive = world.enemies.countActive((o) => !o.dead && !isBoss(o));
        const n = Math.min(KING.summon.count, KING.summon.maxMinions - alive);
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2 + world.time;
          const m = spawnEnemy(i % 2 ? 'gunner' : 'windup', clamp(e.pos.x + Math.cos(a) * 3.5, -BOSS_BOUND, BOSS_BOUND), clamp(e.pos.z + Math.sin(a) * 3.5, -BOSS_BOUND, BOSS_BOUND));
          if (m) { setState(m.fsm, 'detect', 0.5); burst(v3(m.pos.x, 0.6, m.pos.z), 12, GUMMY, 4, 0.5); }
        }
        callout('🍬 糖果士兵！CANDY SOLDIERS!', 2); snd.wave(); break;
      }
      case 'slam': B.slamT = 0.5; break;
      case 'hazard': break;
    }
  }
  if (B.spiralLeft > 0) {
    B.spiralT -= dt;
    while (B.spiralT <= 0 && B.spiralLeft > 0) {
      for (let k = 0; k < KING.spiral.arms; k++) { const a = B.spiralAng + k * Math.PI * 2 / KING.spiral.arms; bossShot(chest, v3(Math.cos(a), -0.06, Math.sin(a)), KING.spiral.speed, KING.spiral.damage, GUMMY[(B.spiralLeft + k) % GUMMY.length]); }
      B.spiralAng += 0.23; B.spiralLeft--; B.spiralT += KING.spiral.interval;
    }
  }
  // movement: keep mid distance, slow strafe; stand still while telegraphing
  if (s.intro <= 0 && !s.tele && s.transition <= 0 && B.spiralLeft <= 0) {
    const want = d > KING.keepDist ? 1 : d < KING.keepDist - 3 ? -1 : 0, side = Math.sin(world.time * 0.4) > 0 ? 1 : -1;
    e.vel.x = approach(e.vel.x, (toP.x * want - toP.z * side * 0.5) * KING.moveSpeed, 6 * dt);
    e.vel.z = approach(e.vel.z, (toP.z * want + toP.x * side * 0.5) * KING.moveSpeed, 6 * dt);
  } else { e.vel.x = approach(e.vel.x, 0, 8 * dt); e.vel.z = approach(e.vel.z, 0, 8 * dt); }
  e.pos.x = clamp(e.pos.x + e.vel.x * dt, -BOSS_BOUND + 1, BOSS_BOUND - 1); e.pos.z = clamp(e.pos.z + e.vel.z * dt, -BOSS_BOUND + 1, BOSS_BOUND - 1); e.pos.y = groundHeight(e.pos.x, e.pos.z);
  e.animPhase += dt * (1 + Math.hypot(e.vel.x, e.vel.z));
  // contact damage
  world.slots.forEach((sl, i) => { const q = sl.player; if (!q.dead && dist2D(e.pos, q.pos) < c.radius + PLAYER.radius && q.pos.y < 2) hurtPlayer(10, i); });
}
/** W2: BRICK COLOSSUS (same telegraph/phase machine as the king, different attacks; see boss/colossus.ts) */
function bossHaz(x: number, z: number, r: number, t: number, dmg: number, kind: 'hazard' | 'slam' | 'shell') {
  if (world.hazards.length > MAX_HAZARDS) world.hazards.shift();
  world.hazards.push({ pos: v3(clamp(x, -BOSS_BOUND - 3, BOSS_BOUND + 3), groundHeight(x, z), clamp(z, -BOSS_BOUND - 3, BOSS_BOUND + 3)), r, t, max: t, dmg, kind });
}
export function stepColossus(e: Enemy, dt: number) {
  const B = world.boss, s = B.s, C = COLOSSUS, c = ENEMIES.colossus;
  const bts = nearestAlive(e.pos), p = world.slots[bts].player;
  const ev = stepBoss(s, e.hp / e.maxHp, dt, C);
  B.tele = s.tele; B.slamT = Math.max(0, B.slamT - dt);
  const chest = v3(e.pos.x, e.pos.y + 4.3, e.pos.z);
  const toP = norm(v3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z)), d = dist2D(e.pos, p.pos);
  e.facing = lerpAngle(e.facing, Math.atan2(-toP.x, -toP.z), 1 - Math.exp(-2.2 * dt));
  if (ev.phaseChanged) {
    callout(ev.phaseChanged === 2 ? 'PHASE 2 · 左臂脱落！护盾砖墙！' : 'PHASE 3 · 胸甲崩裂！货运列车来袭！', 4);
    snd.combo(4); shake(0.7); blastFx(v3(e.pos.x, 0.2, e.pos.z), 10, ev.phaseChanged === 2 ? '#ffd21f' : '#e53935', 0.7);
    burst(chest, 40, BRICK_COLS, 8, 0.9, 1.6); world.projectiles.clear();
  }
  if (ev.telegraph) {
    snd.windup();
    switch (ev.telegraph) {
      case 'stomp': bossHaz(e.pos.x, e.pos.z, C.stomp.radius, C.telegraph.stomp, C.stomp.damage, 'slam'); break;
      case 'shower': for (let i = 0; i < C.shower.count; i++) {
        const a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 1.5 + Math.random() * C.shower.spread;
        bossHaz(p.pos.x + Math.cos(a) * rr, p.pos.z + Math.sin(a) * rr, C.shower.radius, C.telegraph.shower + i * C.shower.stagger, C.shower.damage, 'shell');
      } break;
      case 'train': for (const h of freightLine(p.pos.x, p.pos.z, BOSS_BOUND, s.cycleIdx % 2 === 1)) bossHaz(h.x, h.z, C.train.radius, h.t, C.train.damage, 'hazard'); callout('🚂 货运列车！', 2); break;
      case 'wreck': for (let i = 0; i < C.wreck.count; i++) { const t = C.wreck.t0 + i * C.wreck.dt; bossHaz(p.pos.x + p.vel.x * t, p.pos.z + p.vel.z * t, C.wreck.radius, t, C.wreck.damage, 'hazard'); } break;
    }
  }
  if (ev.attack) {
    const base = Math.atan2(toP.z, toP.x);
    switch (ev.attack) {
      case 'ring': { const n = C.ring.count, off = (s.cycleIdx % 2) * Math.PI / n;
        for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; bossShot(chest, v3(Math.cos(a), -0.1, Math.sin(a)), C.ring.speed, C.ring.damage, C.colors[i % C.colors.length]); }
        snd.cannon(); break; }
      case 'fan': for (let i = 0; i < C.fan.count; i++) { const a = base + (i - (C.fan.count - 1) / 2) * (C.fan.arc / (C.fan.count - 1)); bossShot(chest, v3(Math.cos(a), (p.pos.y + 0.9 - chest.y) / Math.max(4, d), Math.sin(a)), C.fan.speed, C.fan.damage, C.colors[i % C.colors.length]); } snd.enemyShoot(); break;
      case 'wall': {
        let made = 0;
        for (const w of wallSlots(e.pos.x, e.pos.z, p.pos.x, p.pos.z, BOSS_BOUND)) {
          if (dist2D(v3(w.x, 0, w.z), p.pos) < 2.2) continue; // never entomb the player
          const sz = w.rot ? [C.wall.size[2], C.wall.size[1], C.wall.size[0]] : C.wall.size;
          const b = spawnBrick(w.x, w.z, [sz[0], sz[1], sz[2]], C.colors[(made + s.cycleIdx) % C.colors.length], C.wall.hp);
          if (b) { made++; burst(v3(w.x, 1, w.z), 14, BRICK_COLS, 4, 0.5); }
        }
        if (made) callout('🧱 护盾砖墙！', 2); snd.wave(); break;
      }
      case 'summon': {
        const alive = world.enemies.countActive((o) => !o.dead && !isBoss(o));
        const n = Math.min(C.summon.count, C.summon.maxMinions - alive);
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2 + world.time;
          const m = spawnEnemy(C.summon.type, clamp(e.pos.x + Math.cos(a) * 4.2, -BOSS_BOUND, BOSS_BOUND), clamp(e.pos.z + Math.sin(a) * 4.2, -BOSS_BOUND, BOSS_BOUND));
          if (m) { setState(m.fsm, 'detect', 0.5); burst(v3(m.pos.x, 0.6, m.pos.z), 12, BRICK_COLS, 4, 0.5); }
        }
        if (n > 0) callout('🧱 积木士兵！BRICK SOLDIERS!', 2); snd.wave(); break;
      }
      case 'stomp': B.slamT = 0.5; break;
    }
  }
  if (s.intro <= 0 && !s.tele && s.transition <= 0) {
    const want = d > C.keepDist ? 1 : d < C.keepDist - 3 ? -1 : 0, side = Math.sin(world.time * 0.35) > 0 ? 1 : -1;
    e.vel.x = approach(e.vel.x, (toP.x * want - toP.z * side * 0.4) * C.moveSpeed, 5 * dt);
    e.vel.z = approach(e.vel.z, (toP.z * want + toP.x * side * 0.4) * C.moveSpeed, 5 * dt);
  } else { e.vel.x = approach(e.vel.x, 0, 8 * dt); e.vel.z = approach(e.vel.z, 0, 8 * dt); }
  e.pos.x = clamp(e.pos.x + e.vel.x * dt, -BOSS_BOUND + 1.5, BOSS_BOUND - 1.5); e.pos.z = clamp(e.pos.z + e.vel.z * dt, -BOSS_BOUND + 1.5, BOSS_BOUND - 1.5); e.pos.y = groundHeight(e.pos.x, e.pos.z);
  e.animPhase += dt * (1 + Math.hypot(e.vel.x, e.vel.z));
  world.slots.forEach((sl, i) => { const q = sl.player; if (!q.dead && dist2D(e.pos, q.pos) < c.radius + PLAYER.radius && q.pos.y < 2.5) hurtPlayer(12, i); });
}
function stepHazards(dt: number) {
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i]; h.t -= dt;
    if (h.t > 0) continue;
    world.hazards.splice(i, 1);
    const blk = world.mapId === 'block', col = blk ? (h.kind === 'slam' ? '#e53935' : h.kind === 'shell' ? '#ffd21f' : '#ff8a1f') : h.kind === 'slam' ? '#ff5c9a' : h.kind === 'shell' ? '#ff9ec7' : '#ffb347';
    blastFx(v3(h.pos.x, h.pos.y + 0.15, h.pos.z), h.r, col, 0.45);
    burst(v3(h.pos.x, h.pos.y + 0.3, h.pos.z), h.kind === 'slam' ? 30 : 16, blk ? BRICK_COLS : GUMMY, h.kind === 'slam' ? 8 : 5, 0.6, 1.2);
    shake(h.kind === 'slam' ? 0.7 : 0.3); snd.explosion();
    // slam: jump over it (airborne) or be outside; hazard puddle / shell: be outside
    world.slots.forEach((sl, k) => {
      const p = sl.player; if (p.dead) return;
      if (dist2D(h.pos, p.pos) < h.r && (h.kind !== 'slam' || p.pos.y - h.pos.y < 0.9)) hurtPlayer(h.dmg, k);
    });
  }
}
function stepLobs(dt: number) { for (const l of world.lobs.items) if (l.active && (l.t += dt) >= l.T) l.active = false; }

// ---------------- M6: toys (balloons, pickups, spring pads), revive ----------------
/** POLISH: candies are always placed on a validated, reachable spot (never inside / under solids, never inside the boss plaza wall) */
export const PICKUP_BONUS = { hp: 150, ammo: 100 };
function spawnPickup(kind: 'hp' | 'ammo', x: number, z: number, spot = -1, life = 30, refY = 0) {
  const pk = world.pickups.spawn(); if (!pk) return null;
  const maxR = world.boss.id >= 0 && world.enemies.items[world.boss.id]?.active ? BOSS_BOUND + 2 : 0;
  const r = resolvePickupSpot(x, z, refY, maxR);
  pk.kind = kind; pk.pos.x = r.x; pk.pos.z = r.z; pk.pos.y = r.y; pk.life = life; pk.spot = spot; pk.age = 0;
  return pk;
}
function maybeDrop(e: Enemy) {
  const c = ENEMIES[e.type];
  if (isBoss(e) || e.selfDestruct) return;
  const chance = c.candyTank && c.hp >= 100 ? 0.3 : 0.07;
  if (Math.random() >= chance) return;
  if (world.pickups.countActive((p) => p.spot < 0) >= 6) return;
  const needHp = world.slots.some((sl) => !sl.player.dead && sl.player.hp < sl.player.maxHp * 0.7);
  spawnPickup(Math.random() < (needHp ? 0.65 : 0.4) ? 'hp' : 'ammo', e.pos.x, e.pos.z, -1, 30, ENEMIES[e.type].flying ? 0 : e.pos.y);
}
const needsPickup = (p: typeof world.player, kind: 'hp' | 'ammo') => {
  if (kind === 'hp') return p.hp < p.maxHp - 0.5;
  return p.arsenal.states.some((st, i) => st.ammo < effConfig(i).magSize);
};
/** every candy is collectible: when the player is already full it is turned into a score bonus instead of being silently ignored */
function collectPickups(p: typeof world.player) {
  const h = PLAYER.height;
  for (const pk of world.pickups.items) {
    if (!pk.active) continue;
    if (!inCollectRange(pk.pos, p.pos, h)) continue;
    const need = needsPickup(p, pk.kind);
    const at = v3(pk.pos.x, pk.pos.y + 0.4, pk.pos.z);
    if (pk.kind === 'hp') {
      if (need) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); callout('+HP 糖果补给', 1); dmgNumber(at, Math.round(p.maxHp * 0.3), false, '+HP'); }
      else { world.score += PICKUP_BONUS.hp; callout('满血啦！糖果转为 +' + PICKUP_BONUS.hp + ' 分', 1); dmgNumber(at, PICKUP_BONUS.hp, true, '+分'); }
    } else {
      p.arsenal.states.forEach((st, i) => { st.ammo = effConfig(i).magSize; });
      if (need) { callout('弹药补满 AMMO!', 1); dmgNumber(at, 0, false, 'AMMO'); }
      else { world.score += PICKUP_BONUS.ammo; callout('弹药已满：糖果转为 +' + PICKUP_BONUS.ammo + ' 分', 1); dmgNumber(at, PICKUP_BONUS.ammo, true, '+分'); }
    }
    const cols = pk.kind === 'hp' ? ['#ff6b8b', '#ffffff', '#ffd6e8'] : ['#ffd36b', '#fff3a0', '#ffffff'];
    burst(at, 18, cols, 5, 0.6, 1.1); blastFx(v3(pk.pos.x, pk.pos.y - 0.3, pk.pos.z), 1.5, pk.kind === 'hp' ? '#ff9ec7' : '#ffe38a', 0.35);
    snd.pickup(pk.kind === 'hp' ? 0 : 1);
    pk.active = false; if (pk.spot >= 0) world.spotTimers[pk.spot] = 30;
  }
}
/** gentle magnet: candies a player actually needs drift towards that player (never through walls) */
function magnetPickups(dt: number) {
  for (const pk of world.pickups.items) {
    if (!pk.active || pk.age < 0.5) continue;
    let best: typeof world.player | null = null, bd = 1e9;
    for (const sl of world.slots) {
      const p = sl.player; if (p.dead || sl.connected === false) continue;
      if (!inMagnetRange(pk.pos, p.pos, PLAYER.height) || !needsPickup(p, pk.kind)) continue;
      const d = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z); if (d < bd) { bd = d; best = p; }
    }
    if (!best || bd < 0.3) continue;
    const sp = (1.4 + (MAGNET_R - bd) * 1.2) * dt, k = Math.min(1, sp / bd);
    const nx = pk.pos.x + (best.pos.x - pk.pos.x) * k, nz = pk.pos.z + (best.pos.z - pk.pos.z) * k;
    const ny = Math.max(standHeight(nx, nz, best.pos.y + 0.6) + PICKUP_REST, pk.pos.y + (best.pos.y + PLAYER.height * 0.5 - pk.pos.y) * Math.min(1, 4 * dt));
    if (pickupInsideSolid(nx, ny, nz, 0.3)) continue;
    pk.pos.x = nx; pk.pos.z = nz; pk.pos.y = ny;
  }
}
function popBalloon(b: typeof world.balloons[number]) {
  if (!b.alive) return;
  b.alive = false; b.respawn = 25;
  const p = v3(b.x, b.y, b.z);
  burst(p, 22, b.kind === 'hp' ? ['#ff6b8b', '#ffd6e8', '#ffffff'] : ['#ffd36b', '#fff3a0', '#ffffff'], 6, 0.7, 1.2); puff(p, 1.1);
  snd.bubblePop();
  spawnPickup(b.kind, b.x, b.z, -1, 40, groundHeight(b.x, b.z));
}
/** segment test against live balloons (hitscan, player shots) */
function balloonRay(o: V3, d: V3, max: number) {
  for (const b of world.balloons) {
    if (!b.alive) continue;
    if (Math.abs(b.y - o.y) > max + 2 && Math.abs(b.y - o.y) > 14) continue;
    if (raySphere(o, d, v3(b.x, b.y, b.z), 0.95, max) !== null) popBalloon(b);
  }
}
function stepToys(dt: number) {
  for (const b of world.balloons) { b.wob += dt; if (!b.alive && (b.respawn -= dt) <= 0) { b.alive = true; puff(v3(b.x, b.y, b.z), 0.8); } }
  for (const pk of world.pickups.items) { if (!pk.active) continue; pk.age += dt; if (pk.spot < 0 && (pk.life -= dt) <= 0) pk.active = false; }
  magnetPickups(dt);
  for (let i = 0; i < PICKUP_SPOTS.length; i++) {
    const t = world.spotTimers[i]; if (t === -1) continue;
    if (t - dt <= 0) { if (spawnPickup(PICKUP_SPOTS[i].kind, PICKUP_SPOTS[i].x, PICKUP_SPOTS[i].z, i)) world.spotTimers[i] = -1; else world.spotTimers[i] = 1; }
    else world.spotTimers[i] = t - dt;
  }
  // moving block cover: gently push players/enemies that end up inside a box
  for (let m = 0; m < MOVERS.length; m++) {
    const bx = MOVER_BOXES[m];
    const push = (pos: V3, r: number, h: number) => {
      if (pos.y > bx.max.y - 0.05 || pos.y + h < bx.min.y) return;
      if (pos.x < bx.min.x - r || pos.x > bx.max.x + r || pos.z < bx.min.z - r || pos.z > bx.max.z + r) return;
      const l = pos.x - (bx.min.x - r), rr = (bx.max.x + r) - pos.x, n = pos.z - (bx.min.z - r), f = (bx.max.z + r) - pos.z, mn = Math.min(l, rr, n, f);
      if (mn === l) pos.x = bx.min.x - r; else if (mn === rr) pos.x = bx.max.x + r; else if (mn === n) pos.z = bx.min.z - r; else pos.z = bx.max.z + r;
    };
    for (const sl of world.slots) push(sl.player.pos, PLAYER.radius, PLAYER.height);
    for (const e of world.enemies.items) if (e.active && !e.dead && !ENEMIES[e.type].flying && !isBoss(e)) push(e.pos, ENEMIES[e.type].radius * 0.8, ENEMIES[e.type].height);
  }
}
export function revivePlayer(i: number, frac: number, invuln: number) {
  withSlot(i, () => {
    const p = world.player;
    p.dead = false; p.hp = Math.max(1, Math.round(p.maxHp * frac)); p.invuln = invuln; p.revive = 0; p.downed = 0; p.vel.x = p.vel.z = 0; p.anim = 'idle'; p.flash = 0;
    const c = v3(p.pos.x, p.pos.y + 1, p.pos.z);
    blastFx(v3(p.pos.x, p.pos.y + 0.2, p.pos.z), 2.6, '#9ef0d0', 0.5); burst(c, 24, ['#9ef0d0', '#ffffff', '#fff3a0', '#ff9ec7'], 5, 0.7, 1.2);
    callout('REVIVED! 复活!', 3); uiSet({ banner: '' }, i); snd.combo(3);
  });
}
function stepRevive(dt: number) {
  if (world.slots.length < 2) return;
  for (let i = 0; i < world.slots.length; i++) {
    const d = world.slots[i], p = d.player;
    if (!p.dead) { p.revive = 0; continue; }
    let helper = false;
    for (let j = 0; j < world.slots.length; j++) {
      if (j === i) continue; const h = world.slots[j]; if (h.player.dead || !h.connected) continue;
      if ((h.input ?? realInput).keys.has('KeyE') && dist2D(h.player.pos, p.pos) < COOP.reviveRange) helper = true;
    }
    p.revive = helper ? Math.min(1, p.revive + dt / COOP.reviveTime) : Math.max(0, p.revive - dt * 1.5);
    if (p.revive >= 1) { world.stats.revives = world.stats.revives + 1; revivePlayer(i, COOP.reviveHp, 2.5); }
  }
}
/** wave clear / stage clear: downed players get back up */
export function respawnDowned(frac = 0.6) {
  world.slots.forEach((sl, i) => { if (sl.connected && sl.player.dead && world.slots.some((o) => !o.player.dead)) revivePlayer(i, frac, 2.5); });
}
const nearestAlive = (pos: V3): number => {
  let best = 0, bd = Infinity;
  world.slots.forEach((sl, i) => { if (sl.player.dead) return; const d = dist2D(sl.player.pos, pos); if (d < bd) { bd = d; best = i; } });
  return best;
};

// ---------------- enemies ----------------
const BND = ARENA.half - 1.5;
const ENEMY_BULLET: Record<string, BulletVisualId> = { gunner: 'gumdrop', drone: 'bean', tank: 'cookie' };
const TURN: Record<string, number> = { bturret: 6, bcrane: 1.2, bgolem: 1.6, bsoldier: 9, tank: 1.4, choco: 1.1, mega: 1.0, lolli: 2.4, mint: 2.8, gumdrop: 6 };
const SLIDE: Record<string, number> = { bgolem: 2.4, bsoldier: 1.2, tank: 2.8, choco: 2.8, mega: 2.8, lolli: 2.2, mint: 2.2 };
const cands: { x: number; z: number; alive: boolean }[] = [];
function refreshTargets() {
  cands.length = world.slots.length;
  world.slots.forEach((sl, i) => { const c = cands[i] ?? (cands[i] = { x: 0, z: 0, alive: false }); c.x = sl.player.pos.x; c.z = sl.player.pos.z; c.alive = !sl.player.dead; });
}
function canSee(from: V3, to: V3): boolean {
  const d = sub(to, from); const l = len(d);
  return world.raycast(from, scale(d, 1 / l), l) === null;
}
function rotY(d: V3, a: number): V3 { const c = Math.cos(a), sn = Math.sin(a); return v3(d.x * c - d.z * sn, d.y, d.x * sn + d.z * c); }
function enemyBullet(e: Enemy, from: V3, dir: V3, speed?: number) {
  const c = ENEMIES[e.type];
  const pr = world.projectiles.spawn(); if (!pr) return null;
  pr.pos = v3(from.x, from.y, from.z); pr.vel = scale(dir, speed ?? c.projectileSpeed ?? 10); pr.life = 3.2; pr.damage = c.damage;
  pr.size = c.projectileSize ?? 1; pr.color = c.projectileColor ?? '#ff5c9a'; pr.vis = bvIndex(c.bullet ?? ENEMY_BULLET[e.type] ?? 'gumdrop');
  return pr;
}
function enemyShoot(e: Enemy, from: V3, to: V3) {
  if (!enemyBullet(e, from, norm(sub(to, from)))) return;
  if (e.type === 'tank') snd.cannon(); else if (e.type === 'drone') snd.zap(); else snd.enemyShoot();
}
/** arcing shell: visual Lob + ground telegraph that hurts when it lands */
function lobShell(from: V3, tx: number, tz: number, c: EnemyConfig, dmg: number) {
  const lob = c.lob!, gy = groundHeight(tx, tz);
  if (world.hazards.length > MAX_HAZARDS) world.hazards.shift();
  world.hazards.push({ pos: v3(tx, gy, tz), r: lob.radius, t: lob.time, max: lob.time, dmg, kind: 'shell' });
  const l = world.lobs.spawnOrRecycle();
  copy(l.from, from); l.to.x = tx; l.to.y = gy; l.to.z = tz; l.t = 0; l.T = lob.time; l.color = c.projectileColor ?? '#ff9ec7'; l.vis = bvIndex(c.bullet ?? 'swirl'); l.size = 1.2;
  emit('lob', r2(from.x), r2(from.y), r2(from.z), r2(tx), r2(gy), r2(tz), lob.time, l.color, l.vis);
}
function lobAt(e: Enemy, c: EnemyConfig, T: V3, pv: V3, spreadMul = 1) {
  const lob = c.lob!, a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * lob.spread * spreadMul;
  const tx = clamp(T.x + pv.x * lob.time * 0.6 + Math.cos(a) * rr, -BND, BND), tz = clamp(T.z + pv.z * lob.time * 0.6 + Math.sin(a) * rr, -BND, BND);
  lobShell(v3(e.pos.x, e.pos.y + c.height * 1.05, e.pos.z), tx, tz, c, c.damage);
  snd.cannon();
}

/** W2: static brick enemies (turret / crane) spawn at free mount points, farthest-ish from the players; null when the map has none free */
export function pickMount(type: EnemyType): [number, number] | null {
  const kind = ENEMIES[type].mount; if (!kind) return null;
  const spots = MOUNTS[kind]; if (!spots.length) return null;
  const alive = world.slots.filter((s) => !s.player.dead).map((s) => s.player.pos); if (!alive.length) alive.push(world.player.pos);
  const free = spots.filter((m) => !world.enemies.items.some((o) => o.active && !o.dead && o.type === type && Math.hypot(o.pos.x - m[0], o.pos.z - m[1]) < 2));
  if (!free.length) return null;
  const sc = free.map((m) => [Math.min(...alive.map((a) => Math.hypot(m[0] - a.x, m[1] - a.z))), m] as [number, [number, number]]).sort((a, b) => b[0] - a[0]);
  const ok = sc.filter((s) => s[0] > 10); const pool = ok.length ? ok : sc;
  return pool[Math.floor(Math.random() * Math.min(pool.length, 3))][1];
}
function pickGate(type: EnemyType): [number, number] {
  const minD = ENEMIES[type].speed < 2 ? 18 : 12;
  const alive = world.slots.filter((s) => !s.player.dead).map((s) => s.player.pos);
  if (!alive.length) alive.push(world.player.pos);
  const sc: [number, [number, number]][] = [];
  for (const g of SPAWN_POINTS) { let md = 1e9; for (const a of alive) md = Math.min(md, Math.hypot(g[0] - a.x, g[1] - a.z)); if (md > minD) sc.push([md, g]); }
  if (!sc.length) return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  sc.sort((x, y) => x[0] - y[0]);
  return sc[Math.floor(Math.random() * Math.min(sc.length, ENEMIES[type].speed < 2 ? 3 : 6))][1];
}

function stepEnemies(dt: number) {
  refreshTargets();
  const multi = world.slots.length > 1;
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    copy(e.prev, e.pos);
    const c = ENEMIES[e.type];
    e.flash = Math.max(0, e.flash - dt); e.spawnAnim = Math.max(0, e.spawnAnim - dt); e.hitReact = Math.max(0, e.hitReact - dt);
    if (e.dead) {
      e.deathTimer -= dt;
      if (e.deathTimer <= 0) { burst(v3(e.pos.x, e.pos.y + 0.7, e.pos.z), 22, CONFETTI, 6, 0.7, 1.2); e.active = false; }
      continue;
    }
    if (isBoss(e)) { if (e.type === 'colossus') stepColossus(e, dt); else stepKing(e, dt); continue; }
    if (c.brick && e.spawnAnim > 0) { e.vel.x = e.vel.z = 0; e.animPhase += dt; e.fsm.timer = Math.max(e.fsm.timer, 0.2); continue; } // W2: bricks are still snapping together
    if (e.burn > 0) {
      const lh = world.slots[e.lastHit] ?? world.slots[0];
      e.burn -= dt; e.burnAcc += lh.run.mods.burnDps * dt;
      if (Math.random() < 0.25) burst(v3(e.pos.x, e.pos.y + c.height * 0.7, e.pos.z), 1, ['#ff8c42', '#ffd36b'], 1.5, 0.3, 0.7);
      if (e.burnAcc >= 4) { const a = e.burnAcc; e.burnAcc = 0; withSlot(Math.min(e.lastHit, world.slots.length - 1), () => damageEnemy(e, a, {})); if (e.dead) continue; }
    }
    const gh = groundHeight(e.pos.x, e.pos.z);
    const groundY = c.flying ? gh + c.hoverHeight! : gh;
    // bubble-bound: frozen, floating
    if (e.bound > 0) {
      e.bound -= dt;
      e.vel.x *= 1 - Math.min(1, 6 * dt); e.vel.z *= 1 - Math.min(1, 6 * dt); e.vel.y = 0;
      e.pos.y = approach(e.pos.y, groundY + 0.5, dt * 2);
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      e.animPhase += dt * 0.5; e.burstLeft = 0; e.tele = 0;
      continue;
    }
    // target selection (co-op: nearest alive player with hysteresis, or random)
    if (multi) {
      e.tsT -= dt;
      if (e.tsT <= 0 || world.slots[e.ts]?.player.dead) {
        e.ts = pickTarget(COOP.targeting, e.pos.x, e.pos.z, cands, COOP.targeting === 'random' ? -1 : e.ts, Math.random());
        e.tsT = COOP.targeting === 'random' ? 6 : 1.2;
      }
    } else e.ts = 0;
    const sl = world.slots[e.ts], p = sl.player;
    const chest = v3(p.pos.x, p.pos.y + 1.0, p.pos.z);
    const decoy = sl.decoy.t > 0 && dist2D(e.pos, sl.decoy.pos) < dist2D(e.pos, p.pos) + 8;
    const T = decoy ? sl.decoy.pos : p.pos, aimT = decoy ? v3(T.x, 1, T.z) : chest;
    const d = dist2D(e.pos, T);
    const eye = v3(e.pos.x, e.pos.y + c.height * 0.9, e.pos.z);
    const toP = norm(v3(T.x - e.pos.x, 0, T.z - e.pos.z));
    const busy = e.knockT > 0 || e.leapT > 0;
    copy(e.tp, T);

    // knockback / leap: ballistic, no steering
    if (busy) {
      if (e.knockT > 0) { e.knockT -= dt; e.vel.x *= 1 - Math.min(1, 2.5 * dt); e.vel.z *= 1 - Math.min(1, 2.5 * dt); }
      if (c.flying) { e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y = approach(e.pos.y + e.vel.y * dt, groundY, dt * 3); e.vel.y *= 0.9; }
      else {
        e.vel.y -= 24 * dt;
        const r = moveAndCollide(e.pos, e.vel, scale(e.vel, dt), c.radius * 0.8, c.height, ARENA_BOXES);
        if (e.leapT > 0) {
          e.leapT -= dt;
          if ((r.grounded && e.leapT < c.leapTime! - 0.12) || e.leapT <= -0.5) { // landed
            e.leapT = 0; e.vel.x = e.vel.z = 0;
            blastFx(v3(e.pos.x, e.pos.y + 0.1, e.pos.z), c.blastRadius!, '#ffd6e8', 0.35);
            burst(v3(e.pos.x, e.pos.y + 0.2, e.pos.z), 12, ['#ffffff', '#ffd6e8'], 4, 0.4);
            snd.land();
            world.slots.forEach((o, k) => { if (!o.player.dead && dist2D(e.pos, o.player.pos) < c.blastRadius! && Math.abs(o.player.pos.y - e.pos.y) < 1.5) hurtPlayer(c.damage, k); });
          }
        }
      }
      e.pos.x = clamp(e.pos.x, -BND, BND); e.pos.z = clamp(e.pos.z, -BND, BND);
      continue;
    }

    const see = d < c.loseRange && (e.type === 'lolli' || canSee(eye, aimT));
    const ev = stepFsm(e.fsm, c, { dist: d, canSee: see, playerAlive: !p.dead, dead: e.dead }, dt);
    if (ev.windupStarted) { if (e.type === 'clown') snd.fuse(); else snd.windup(); }
    if (ev.windupStarted && e.type === 'bgolem') e.burstAng = (d < 6.5 || e.aux++ % 3 === 2) ? 1 : 0; // 1 = ground slam (telegraph ring around the golem), 0 = rock lob
    if (e.fsm.state === 'attack' && e.type === 'bunny') copy(e.target, T);
    if (e.fsm.state === 'attack' && e.type === 'clown' && Math.floor(e.fsm.timer * 8) !== Math.floor((e.fsm.timer + dt) * 8)) snd.beep();
    if (ev.changed && e.fsm.state === 'patrol') {
      pickPatrol(e);
    }
    let want = v3(); let speed = 0; let hold = false;
    switch (e.fsm.state) {
      case 'patrol': { const tp = sub(e.patrol, e.pos); tp.y = 0; const dl = len(tp);
        if (dl > 0.5) { want = norm(tp); speed = c.speed * 0.45;
          // M5: progress watchdog — no 0.4 m of progress toward the patrol point in 1.2 s (pressed into cover/jitter) → repath toward open floor
          if (dl < e.bestD - 0.4) { e.bestD = dl; e.progT = 0; } else if ((e.progT += dt) > 1.2) { pickPatrol(e, true); e.bestD = 1e9; e.progT = 0; } }
        break; }
      case 'chase':
        if (e.type === 'gunner' || e.type === 'gumdrop') {
          const side = v3(-toP.z, 0, toP.x); const s2 = Math.sin(world.time * 0.8 + e.id) > 0 ? 1 : -1;
          if (d < (e.type === 'gumdrop' ? 5 : 7)) want = scale(toP, -1); else if (d > c.attackRange * 0.75 || !see) want = toP; else want = scale(side, s2);
          speed = c.speed; hold = see && d < c.attackRange;
        } else if (e.type === 'drone') {
          const o = orbitPoint(T, e.pos, c.orbitRadius!, e.id % 2 ? 0.7 : -0.7);
          want = norm(v3(o.x - e.pos.x, 0, o.z - e.pos.z)); speed = c.speed; hold = true;
        } else if (e.type === 'tank' || e.type === 'choco') {
          const stop = e.type === 'tank' ? 11 : 12.5;
          if (d > stop || !see) { want = v3(-Math.sin(e.facing), 0, -Math.cos(e.facing)); speed = c.speed; } else hold = true;
        } else if (e.type === 'mega') {
          if (d < c.minRange!) { want = scale(toP, -1); speed = c.speed; hold = true; }
          else if (d > 12 || !see) { want = v3(-Math.sin(e.facing), 0, -Math.cos(e.facing)); speed = c.speed; } else hold = true;
        } else if (e.type === 'bsoldier') {
          const side = v3(-toP.z, 0, toP.x), s2 = (e.id % 2 ? 1 : -1) * (Math.sin(world.time * 0.9 + e.id) > -0.3 ? 1 : -1);
          want = d > 4.5 ? norm(v3(toP.x + side.x * 0.35 * s2, 0, toP.z + side.z * 0.35 * s2)) : toP; speed = c.speed; // loose flanking arc, then charge
        } else if (e.type === 'bgolem') {
          if (d < 4) { want = scale(toP, -1); speed = c.speed * 0.8; hold = true; }
          else if (d > 11 || !see) { want = toP; speed = c.speed; } else hold = true;
        } else if (e.type === 'lolli') {
          if (d < c.minRange!) { want = scale(toP, -1); speed = c.speed * 1.3; hold = true; }
          else if (d > c.attackRange * 0.85) { want = toP; speed = c.speed; } else hold = true;
        } else if (e.type === 'mint') {
          if (e.burstLeft > 0) hold = true;
          else if (d < 5) { want = scale(toP, -1); speed = c.speed * 0.8; hold = true; }
          else if (d > 9 || !see) { want = toP; speed = c.speed; } else hold = true;
        } else { want = toP; speed = c.speed; }
        // M5: chase progress watchdog (corner snags where per-frame jitter defeats the stuck check) → commit to a side-slide
        if (speed > 0 && !hold && e.slideTime <= 0) { if (d < e.bestD - 0.4) { e.bestD = d; e.progT = 0; }
          else if ((e.progT += dt) > 1.2) { e.progT = 0; e.bestD = 1e9; e.slideTime = SLIDE[e.type] ?? 1.4; if (++e.stuckN % 2 === 0) e.slideSign = -e.slideSign; } }
        if (e.slideTime > 0) { e.slideTime -= dt; want = v3(-toP.z * e.slideSign, 0, toP.x * e.slideSign); }
        break;
      default: speed = 0;
    }
    if (!c.flying) speed *= terrainSpeedMult(e.pos.x, e.pos.z);
    const turn = TURN[e.type] ?? 10;
    if (e.fsm.state === 'detect' || e.fsm.state === 'attack' || e.fsm.state === 'chase') e.facing = lerpAngle(e.facing, Math.atan2(-toP.x, -toP.z), 1 - Math.exp(-turn * dt));
    else if (speed > 0) e.facing = lerpAngle(e.facing, Math.atan2(-want.x, -want.z), 1 - Math.exp(-6 * dt));
    if (e.type === 'mint' && e.burstLeft > 0) e.facing = e.burstAng;
    for (const o of world.enemies.items) {
      if (o === e || !o.active || o.dead) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, dd = Math.hypot(dx, dz), minD = (c.radius + ENEMIES[o.type].radius) * 0.9;
      if (c.speed > 0 && dd < minD && dd > 1e-3 && !!c.flying === !!ENEMIES[o.type].flying) { want.x += (dx / dd) * 0.8; want.z += (dz / dd) * 0.8; speed = Math.max(speed, 1); }
    }
    e.vel.x = approach(e.vel.x, want.x * speed, 20 * dt); e.vel.z = approach(e.vel.z, want.z * speed, 20 * dt);
    if (c.flying) {
      e.pos.x = clamp(e.pos.x + e.vel.x * dt, -BND, BND); e.pos.z = clamp(e.pos.z + e.vel.z * dt, -BND, BND);
      e.pos.y = groundHeight(e.pos.x, e.pos.z) + c.hoverHeight! + Math.sin(world.time * 2 + e.id) * 0.35;
    } else {
      e.vel.y -= 24 * dt;
      moveAndCollide(e.pos, e.vel, scale(e.vel, dt), c.radius * 0.8, c.height, ARENA_BOXES);
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dd = Math.hypot(dx, dz), minD = c.radius * 0.8 + PLAYER.radius;
      if (dd < minD && dd > 1e-4 && Math.abs(e.pos.y - p.pos.y) < 1.4) { e.pos.x = p.pos.x + dx / dd * minD; e.pos.z = p.pos.z + dz / dd * minD; }
      if (speed > 0.2 && e.slideTime <= 0) { // M5: was 0.5 → slow patrollers (windup @0.45×) never ran the stuck check
        const moved = Math.hypot(e.pos.x - e.lastX, e.pos.z - e.lastZ);
        e.stuckT = moved < speed * dt * (e.fsm.state === 'patrol' ? 0.5 : 0.25) ? e.stuckT + dt : 0;
        if (e.stuckT > 0.35) {
          e.stuckT = 0;
          if (e.fsm.state === 'patrol') { pickPatrol(e, true); } // M5: repath when pinned on a stick/cover
          else { e.slideTime = SLIDE[e.type] ?? 1.4; if (++e.stuckN % 2 === 0) e.slideSign = -e.slideSign; } // M5: commit to one side twice before flipping (no oscillation behind wide cover)
        }
      }
      e.pos.x = clamp(e.pos.x, -BND, BND); e.pos.z = clamp(e.pos.z, -BND, BND);
    }
    e.lastX = e.pos.x; e.lastZ = e.pos.z;
    e.animPhase += dt * (1 + Math.hypot(e.vel.x, e.vel.z) * 2);

    // ---- burst / ring volleys (gumdrop triple-tap, mint spiral)
    if (e.type === 'bcrane' && e.burstLeft > 0) { // W2 wrecker-crane arm sweep: burstAng = absolute arm angle, burstT = radians swept, aux = bitmask of players already hit
      const ds = 3.5 * dt; e.burstAng += ds; e.burstT += ds; e.facing = e.burstAng;
      world.slots.forEach((sl, k) => {
        const q = sl.player; if (q.dead || (e.aux & (1 << k)) || q.pos.y - e.pos.y > 1.7) return;
        const dx = q.pos.x - e.pos.x, dz = q.pos.z - e.pos.z, r = Math.hypot(dx, dz);
        if (r < 1.8 || r > 9.4) return;
        let da = Math.atan2(-dx, -dz) - e.burstAng; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.16 + 0.6 / Math.max(2, r)) { e.aux |= 1 << k; hurtPlayer(c.damage, k); shake(0.4); snd.explosion(); burst(v3(q.pos.x, q.pos.y + 0.8, q.pos.z), 14, BRICK_COLS, 6, 0.5, 1); }
      });
      if (e.burstT >= Math.PI * 2) { e.burstLeft = 0; e.aux = 0; }
    }
    if (e.burstLeft > 0 && e.type !== 'bcrane') {
      e.burstT -= dt;
      while (e.burstT <= 0 && e.burstLeft > 0) {
        if (e.type === 'bturret') {
          const fw = v3(-Math.sin(e.facing), 0, -Math.cos(e.facing)), from = v3(e.pos.x + fw.x * 1.0, e.pos.y + 1.35, e.pos.z + fw.z * 1.0);
          enemyBullet(e, from, rotY(norm(sub(aimT, from)), (Math.random() - 0.5) * 0.07)); snd.enemyShoot(); e.burstT += 0.17;
        } else if (e.type === 'gumdrop') {
          const from = v3(e.pos.x + toP.x * 0.7, e.pos.y + 0.9, e.pos.z + toP.z * 0.7);
          enemyBullet(e, from, rotY(norm(sub(aimT, from)), (Math.random() - 0.5) * 0.16)); snd.enemyShoot();
          e.burstT += 0.12;
        } else if (e.type === 'mint') {
          const rg = c.ring!, from = v3(e.pos.x, e.pos.y + 1.0, e.pos.z);
          for (let k = 0; k < rg.arms; k++) { const a = e.burstAng + k * Math.PI * 2 / rg.arms; enemyBullet(e, from, v3(Math.cos(a), -0.03, Math.sin(a)), rg.speed); }
          e.burstAng += rg.spin; e.burstT += rg.interval;
          if (e.burstLeft % 4 === 0) snd.zap();
        } else { e.burstLeft = 0; break; }
        e.burstLeft--;
      }
    }
    e.tele = c.candyTank || c.brick ? (e.fsm.state === 'attack' ? clamp(1 - e.fsm.timer / c.windup, 0, 1) : e.burstLeft > 0 ? 1 : 0) : 0;

    if (ev.attackRelease) {
      const fwd = v3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
      switch (e.type) {
        case 'windup': case 'jelly':
          if (dist2D(e.pos, p.pos) <= c.attackRange + 0.6 && Math.abs(p.pos.y - e.pos.y) < 1.5) hurtPlayer(c.damage, e.ts);
          burst(add(e.pos, add(scale(toP, 0.9), v3(0, 0.6, 0))), 6, e.type === 'jelly' ? ['#ffffff', '#9ef0d0'] : ['#ffffff', '#ffd27a'], 3, 0.3, 0.7);
          break;
        case 'bsoldier': { // brick punch with a short lunge (dodge back or sideways during the 0.5 s wind-up)
          if (dist2D(e.pos, p.pos) <= c.attackRange + 0.9 && Math.abs(p.pos.y - e.pos.y) < 1.5) hurtPlayer(c.damage, e.ts);
          burst(add(e.pos, add(scale(toP, 0.9), v3(0, 0.6, 0))), 7, BRICK_COLS, 3.5, 0.3, 0.7); e.vel.x = fwd.x * 6; e.vel.z = fwd.z * 6; e.knockT = 0.18;
          break;
        }
        case 'bturret': e.burstLeft = c.burst!; e.burstT = 0; break;
        case 'bcrane': e.burstLeft = 1; e.burstT = 0; e.aux = 0; e.burstAng = e.facing - 1.2; snd.cannon(); break;
        case 'bgolem':
          if (e.burstAng === 1) { // ground slam: hazard resolves instantly (the wind-up ring was the telegraph); jump over it
            world.hazards.push({ pos: v3(e.pos.x, e.pos.y, e.pos.z), r: c.blastRadius!, t: 0.02, max: 0.02, dmg: Math.round(c.damage * 1.5), kind: 'slam' });
          } else { lobAt(e, c, T, decoy ? v3() : p.vel); lobAt(e, c, T, decoy ? v3() : p.vel, 1.6); }
          break;
        case 'gunner': enemyShoot(e, v3(e.pos.x + toP.x * 0.6, e.pos.y + 0.9, e.pos.z + toP.z * 0.6), aimT); break;
        case 'tank': {
          const from = v3(e.pos.x + fwd.x * 1.4, e.pos.y + 1.15, e.pos.z + fwd.z * 1.4);
          // heavy shot fires along the turret facing (dodge sideways!)
          enemyShoot(e, from, add(from, v3(fwd.x * 10, (aimT.y - from.y) / Math.max(1, d) * 10, fwd.z * 10)));
          e.vel.x -= fwd.x * 3; e.vel.z -= fwd.z * 3; e.knockT = 0.2;
          break;
        }
        case 'drone': enemyShoot(e, v3(e.pos.x, e.pos.y - 0.1, e.pos.z), aimT); break;
        case 'bunny': {
          const tgt = v3(e.target.x, groundHeight(e.target.x, e.target.z), e.target.z);
          e.vel = leapVelocity(e.pos, tgt, c.leapTime!, 24); e.leapT = c.leapTime!; snd.boing();
          break;
        }
        case 'clown':
          e.selfDestruct = true; e.hp = 0; e.dead = true; e.deathTimer = 0.05; setState(e.fsm, 'dead');
          explode(v3(e.pos.x, e.pos.y + 0.6, e.pos.z), c.blastRadius!, 45, 8, c.damage, '#ff8c42');
          break;
        case 'gumdrop': e.burstLeft = c.burst!; e.burstT = 0; break;
        case 'choco': { // twin heavy shells fired along the barrels (armoured front, slow: flank it)
          const side = v3(-fwd.z, 0, fwd.x);
          for (const sgn of [-1, 1]) {
            const from = v3(e.pos.x + fwd.x * 1.7 + side.x * 0.55 * sgn, e.pos.y + 1.15, e.pos.z + fwd.z * 1.7 + side.z * 0.55 * sgn);
            enemyBullet(e, from, norm(v3(fwd.x, (aimT.y - from.y) / Math.max(2, d), fwd.z)));
          }
          snd.cannon(); e.vel.x -= fwd.x * 2; e.vel.z -= fwd.z * 2; e.knockT = 0.15;
          break;
        }
        case 'lolli': lobAt(e, c, T, decoy ? v3() : p.vel); break;
        case 'mint': e.burstLeft = c.ring!.shots; e.burstT = 0; e.burstAng = e.facing; break;
        case 'mega': {
          const k = e.aux++ % 3, from = v3(e.pos.x + fwd.x * 1.8, e.pos.y + 1.9, e.pos.z + fwd.z * 1.8);
          if (k === 0) { // five-star fan
            for (let i = -2; i <= 2; i++) enemyBullet(e, from, rotY(norm(v3(toP.x, (aimT.y - from.y) / Math.max(3, d), toP.z)), i * 0.22));
            snd.cannon();
          } else if (k === 1) { // candy ring
            const rg = c.ring!, off = Math.random() * Math.PI;
            for (let i = 0; i < rg.arms; i++) { const a = off + i * Math.PI * 2 / rg.arms; enemyBullet(e, v3(e.pos.x, e.pos.y + 1.4, e.pos.z), v3(Math.cos(a), -0.02, Math.sin(a)), rg.speed); }
            snd.cannon();
          } else { for (let i = 0; i < 3; i++) lobAt(e, c, T, p.vel, 1.8); } // three lobbed shells
          break;
        }
      }
    }
  }
}

function stepProjectiles(dt: number) {
  for (const pr of world.projectiles.items) {
    if (!pr.active) continue;
    pr.life -= dt;
    fanDeflect(pr.pos, pr.vel, dt);
    const step = len(pr.vel) * dt; const dir = norm(pr.vel);
    const hitGeo = world.raycast(pr.pos, dir, step);
    let hitP: number | null = null, who = -1;
    for (let i = 0; i < world.slots.length; i++) {
      const p = world.slots[i].player; if (p.dead) continue;
      const t = raySphere(pr.pos, dir, v3(p.pos.x, p.pos.y + 0.8, p.pos.z), 0.5 + pr.size * 0.08, step);
      if (t !== null && (hitP === null || t < hitP)) { hitP = t; who = i; }
    }
    if (hitP !== null && (hitGeo === null || hitP <= hitGeo)) { hurtPlayer(pr.damage, who); burst(pr.pos, 8, [pr.color, '#ffffff'], 3, 0.3, 1, pr.vis); pr.active = false; continue; }
    if (hitGeo !== null || pr.life <= 0) { burst(add(pr.pos, scale(dir, hitGeo ?? 0)), 5 + pr.size * 3, [pr.color, '#ffffff'], 2 + pr.size, 0.3, 1, pr.vis); pr.active = false; continue; }
    pr.pos = add(pr.pos, scale(pr.vel, dt));
  }
}

function stepFx(dt: number) {
  for (const s of world.sparks.items) if (s.active) {
    s.life -= dt; if (s.life <= 0) { s.active = false; continue; }
    // kind 5 = cartoon smoke: buoyant, drifts up instead of falling like confetti
    s.vel.y -= (s.kind === 5 ? 1.5 : 12) * dt; s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
    const gy = groundHeight(s.pos.x, s.pos.z) + 0.03;
    if (s.pos.y < gy) { s.pos.y = gy; s.vel.y *= -0.4; s.vel.x *= 0.7; s.vel.z *= 0.7; }
  }
  for (const t of world.tracers.items) if (t.active && (t.life -= dt) <= 0) t.active = false;
  for (const b of world.blastFx.items) if (b.active && (b.life -= dt) <= 0) b.active = false;
  for (const n of world.dmgNums.items) if (n.active) { n.life -= dt; n.pos.y += dt * 1.2; if (n.life <= 0) n.active = false; }
  stepLobs(dt);
  for (const b of world.pending.items) if (b.active && (b.delay -= dt) <= 0) { b.active = false; explode(v3(b.pos.x, b.pos.y, b.pos.z), b.radius, b.damage, b.knockback, b.playerDamage, b.color); }
  for (const sl of world.slots) sl.muzzleFlash = Math.max(0, sl.muzzleFlash - dt);
  world.shake = Math.max(0, world.shake - FX.shakeDecay * dt * world.shake - dt * 0.05);
}

const scaleFn = (w: WaveDef) => scaleWave(w, coopCountMult(world.slots.length));
function stepWaveLogic(dt: number) {
  const alive = world.enemies.countActive();
  const r = world.run, n = world.slots.length;
  if (r.mode === 'survival') while (r.waveDefs.length < world.waves.index + 3) r.waveDefs.push(survivalWave(r.waveDefs.length + 1, world.mapId));
  if (!r.waveDefs.length) return;
  const ev = stepWaves(world.waves, r.waveDefs, alive, dt, WAVE, n > 1 ? scaleFn : undefined);
  const hpMul = coopHpMult(n);
  for (const type of ev.spawn) {
    const mnt = pickMount(type), [gx, gz] = mnt ?? pickGate(type), jit = mnt ? 0 : 2;
    const cnt = ENEMIES[type].swarm ? 1 : 1;
    const e = spawnEnemy(type, gx + (Math.random() - 0.5) * jit, gz + (Math.random() - 0.5) * jit);
    if (e) {
      let m = hpMul * (r.mode === 'survival' ? survivalHpMult(world.waves.index + 1) : 1);
      if (m !== 1) e.hp = e.maxHp = Math.round(e.maxHp * m);
      setState(e.fsm, 'detect', 0.8); burst(v3(e.pos.x, e.pos.y + 0.5, e.pos.z), 10, ['#ffffff', '#fff3a0'], 3, 0.5);
      void cnt;
    }
  }
  if (ev.waveStarted !== null) { snd.wave(); uiSet({ banner: `第 ${ev.waveStarted + 1} 波 · WAVE ${ev.waveStarted + 1}` }); setTimeout(() => uiSet({ banner: '' }), 1800); }
  if (ev.waveCleared !== null && !ev.allCleared) {
    r.wavesCleared++;
    uiSet({ banner: '波次清除！WAVE CLEAR!' }); setTimeout(() => uiSet({ banner: '' }), 1800);
    if (n > 1) respawnDowned(0.6);
    if (r.mode === 'survival' && isUpgradeWave(ev.waveCleared + 1)) setTimeout(() => { const ph = useUI.getState().phase; if ((ph === 'playing' || ph === 'paused') && alivePlayers() > 0 && !world.ended) requestUpgrade('wave'); }, 900);
  }
  if (ev.allCleared && !world.outcome) { r.wavesCleared++; stageCleared(); }
}

const lastSigs: string[] = [];
export function computeHud(i: number) {
  return withSlot(i, () => {
    const p = world.player, w = world.waves, a = p.arsenal, ws = currentState(a), cfg = effConfig(a.index);
    const sk = CHAR_SKILLS[world.run.character], king = world.boss.id >= 0 ? world.enemies.items[world.boss.id] : null;
    const alive = world.enemies.countActive((e) => !e.dead);
    const q = (x: number) => Math.round(x * 20) / 20;
    const multi = world.slots.length > 1, o = multi ? world.slots[1 - i] : null;
    let hint = '';
    if (o && !p.dead && o.player.dead && dist2D(o.player.pos, p.pos) < COOP.reviveRange + 1.5) hint = o.player.revive > 0 ? `救援中 REVIVING ${Math.round(o.player.revive * 100)}%` : '按住 E 救援队友 HOLD E TO REVIVE';
    return {
      hp: Math.round(p.hp), ammo: ws.ammo, mag: cfg.magSize, reloading: ws.status === 'reloading',
      reloadFrac: ws.status === 'reloading' ? q(1 - ws.reloadTimer / cfg.reloadTime) : 0,
      wave: Math.max(0, w.index) + 1, enemiesLeft: remainingInWave(w, alive), score: world.score,
      weaponIndex: a.index, ammoList: a.states.map((s) => s.ammo),
      dashCd: q(p.dash.cd / (sk.cooldown * world.run.mods.skillCdMult)), rollCd: p.rollCharges > 0 ? 0 : q(p.rollRecharge / (SKILLS.roll.cooldown * world.run.mods.rollCdMult)),
      maxHp: p.maxHp, rollCharges: p.rollCharges, rollMax: CHAR_STATS[world.run.character].rollCharges, shield: Math.round(world.shield.hp),
      skillActive: p.dash.active > 0 || p.snipeCharge > 0 || world.turret.t > 0 || world.shield.t > 0 || world.decoy.t > 0,
      boss: king && king.active && isBossType(king.type) ? { kind: king.type as 'king' | 'colossus', hpFrac: q(Math.max(0, king.hp / king.maxHp)), phase: world.boss.s.phase, invuln: bossInvulnerable(world.boss.s) } : null,
      combo: world.combo.timer > 0 ? world.combo.count : 0, comboTier: world.combo.tier,
      comboFrac: q(world.combo.timer / COMBO.window), multiplier: currentMultiplier(world.combo),
      partner: o ? { name: o.name, hp: Math.round(o.player.hp), maxHp: o.player.maxHp, dead: o.player.dead, revive: q(o.player.revive), character: o.run.character, connected: o.connected, ping: o.ping } : null,
      hint, reviveFrac: q(p.revive), downed: p.dead,
    };
  });
}
function syncHud() {
  for (let i = 0; i < world.slots.length; i++) {
    const sl = world.slots[i], st = computeHud(i), sig = JSON.stringify(st);
    if (sig === lastSigs[i]) continue;
    lastSigs[i] = sig;
    if (i === world.local) useUI.getState().set(st as any);
    else if (sl.remote && evq.recording) emit('ui', i, st);
  }
}
export function resetHudSigs() { lastSigs.length = 0; }

function remoteCams() {
  for (let i = 0; i < world.slots.length; i++) {
    const sl = world.slots[i]; if (!sl.remote) continue;
    const c = computeCamera(sl.player.pos, sl.player.yaw, sl.player.pitch, world.raycast);
    sl.cam.pos = c.pos; sl.cam.fwd = c.fwd;
  }
}

/** One fixed simulation tick (all slots). */
export function stepSim(dt: number) {
  world.time += dt;
  evq.now = world.time;
  stepMechSim(dt);
  const multi = world.slots.length > 1;
  const r0 = world.slots[0].run;
  if (!world.ended) r0.time += dt;
  const prevActive = world.active; // single-player: the active slot is the local one
  if (multi) remoteCams();
  const eachSlot = (fn: (i: number) => void) => { for (let i = 0; i < world.slots.length; i++) { setActive(i); fn(i); } setActive(prevActive); };
  if (world.cinematic > 0) { // boss intro: freeze player input, boss poses
    world.cinematic -= dt; stepEnemies(dt); stepFx(dt); eachSlot(() => input.endStep()); syncHud(); return;
  }
  eachSlot(() => { copy(world.player.prev, world.player.pos); stepPlayer(dt); stepTurret(dt); });
  if (multi) stepRevive(dt);
  stepEnemies(dt);
  stepHazards(dt); stepToys(dt);
  eachSlot(() => {
    if (world.shield.t > 0) { world.shield.t -= dt; if (world.shield.t <= 0) world.shield.hp = 0; }
    if (world.decoy.t > 0) world.decoy.t -= dt;
    world.run.maxCombo = Math.max(world.run.maxCombo, world.combo.count);
  });
  if (world.boss.celebrate > 0) {
    world.boss.celebrate -= dt;
    if (Math.random() < 0.3) confetti(v3((Math.random() - 0.5) * 20, 3 + Math.random() * 3, (Math.random() - 0.5) * 20), 10);
    if (world.boss.celebrate <= 0) stageCleared();
  }
  stepShots(dt);
  stepProjectiles(dt);
  stepFx(dt);
  eachSlot(() => stepCombo(world.combo, dt));
  if (multi) stepOffers(dt);
  if (!world.ended && alivePlayers() > 0) stepWaveLogic(dt);
  eachSlot(() => input.endStep());
  syncHud();
  if (world.outcome) {
    const outcome = world.outcome;
    setTimeout(() => { const ph = useUI.getState().phase; if (ph === 'playing' || ph === 'upgrade' || (ph === 'paused' && world.slots.length > 1)) finishRun(outcome === 'won'); }, 1800);
    world.outcome = null; world.ended = true;
  }
}

/** test hooks (headless suites drive pickups / balloons directly) */
export const _pickupHooks = { spawnPickup, popBalloon, maybeDrop, collectPickups, needsPickup };
