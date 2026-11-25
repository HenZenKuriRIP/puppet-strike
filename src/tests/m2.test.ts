import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { WEAPONS, WEAPON_ORDER, ENEMIES, ENEMY_ORDER, COMBO, BUBBLE_BURST, SKILLS, WAVES } from '../config/game';
import { createArsenal, switchWeapon, cycleWeapon, canFire, stepArsenal, currentConfig } from '../game/weapons/arsenal';
import { stepWeapon } from '../game/weapons/weaponMachine';
import { resolveExplosion, blastFalloff, AoeTarget } from '../game/combat/aoe';
import { comboKill, createCombo, stepCombo, currentMultiplier, tierFor } from '../game/combat/combo';
import { createSkill, tryActivate, stepSkill, reduceCooldown } from '../game/systems/skills';
import { stepFsm, FsmData } from '../game/ai/enemyFsm';
import { armorMultiplier, leapVelocity, orbitPoint } from '../game/ai/behaviors';
import { buildQueue } from '../game/progression/waveManager';
import { world, resetWorld, spawnEnemy } from '../game/core/world';
import { explode, stepSim } from '../game/systems/simulation';

const dt = 1 / 60;
const tgt = (x: number, z: number, hp = 100, bound = 0): AoeTarget => ({ pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, hp, maxHp: hp, dead: false, flash: 0, active: true, bound, knockT: 0 });

describe('weapon configs', () => {
  it('has 4 distinct, sane weapons', () => {
    expect(WEAPON_ORDER).toHaveLength(4);
    const kinds = WEAPON_ORDER.map((id) => WEAPONS[id].kind);
    expect(kinds.filter((k) => k === 'hitscan')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'projectile')).toHaveLength(2);
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      expect(w.fireRate).toBeGreaterThan(0); expect(w.magSize).toBeGreaterThan(0); expect(w.reloadTime).toBeGreaterThan(0);
      if (w.kind === 'projectile') { expect(w.projectileSpeed).toBeGreaterThan(0); expect(w.projectileLife).toBeGreaterThan(0); }
    }
    expect(WEAPONS.rainbowShotgun.pellets).toBeGreaterThan(5);
    expect(WEAPONS.springRocket.aoeRadius).toBeGreaterThan(2);
    expect(WEAPONS.bubbleLauncher.bindTime).toBeGreaterThan(1);
  });
  it('each weapon has its own fire rhythm through the state machine', () => {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id]; const s = createArsenal().states[WEAPON_ORDER.indexOf(id)];
      let shots = 0; for (let i = 0; i < 60; i++) if (stepWeapon(s, w, { trigger: true, reload: false }, dt).fired) shots++;
      expect(shots).toBeLessThanOrEqual(Math.min(w.magSize, Math.ceil(w.fireRate) + 1));
    }
  });
  it('switching cancels reload, applies draw delay, cycles & wraps', () => {
    const a = createArsenal();
    a.states[0].ammo = 3; a.states[0].status = 'reloading'; a.states[0].reloadTimer = 1;
    expect(switchWeapon(a, 2)).toBe(true);
    expect(a.states[0].status).toBe('ready'); expect(canFire(a)).toBe(false);
    for (let i = 0; i < 30; i++) stepArsenal(a, dt);
    expect(canFire(a)).toBe(true);
    expect(switchWeapon(a, 2)).toBe(false);
    cycleWeapon(a, 1); expect(currentConfig(a).id).toBe('springRocket');
    cycleWeapon(a, 1); expect(a.index).toBe(0);
    cycleWeapon(a, -1); expect(a.index).toBe(3);
  });
});

describe('AoE + Toy Combo (bubble burst)', () => {
  it('falloff and knockback', () => {
    expect(blastFalloff(0, 4)).toBe(1); expect(blastFalloff(4, 4)).toBe(0); expect(blastFalloff(2, 4)).toBe(0.75);
    const a = tgt(1, 0), far = tgt(10, 0);
    const r = resolveExplosion({ center: { x: 0, y: 0.6, z: 0 }, radius: 4, damage: 40, knockback: 8 }, [a, far], BUBBLE_BURST);
    expect(r.hits).toHaveLength(1); expect(a.hp).toBeLessThan(100); expect(far.hp).toBe(100);
    expect(a.vel.x).toBeGreaterThan(0); expect(a.vel.y).toBeGreaterThan(0); expect(a.knockT).toBeGreaterThan(0);
  });
  it('bound enemy in a rocket blast bursts and chains to another bound enemy, hitting an enemy out of the rocket radius', () => {
    const b1 = tgt(2, 0, 200, 2), b2 = tgt(4.5, 0, 200, 2), victim = tgt(7, 0, 200, 0);
    const r = resolveExplosion({ center: { x: 0, y: 0.6, z: 0 }, radius: 3, damage: 50, knockback: 0 }, [b1, b2, victim], { ...BUBBLE_BURST, radius: 3 });
    expect(r.bursts).toHaveLength(2);
    expect(b1.bound).toBe(0); expect(b2.bound).toBe(0);
    expect(victim.hp).toBeLessThan(200); // only reachable via the chain
    expect(r.hits.some((h) => h.target === victim && h.fromBurst)).toBe(true);
  });
  it('unbound enemies never burst; chain is capped', () => {
    const r1 = resolveExplosion({ center: { x: 0, y: 0.6, z: 0 }, radius: 3, damage: 10, knockback: 0 }, [tgt(1, 0)], BUBBLE_BURST);
    expect(r1.bursts).toHaveLength(0);
    const many = Array.from({ length: 30 }, (_, i) => tgt(i * 0.1, 0, 1000, 3));
    const r2 = resolveExplosion({ center: { x: 0, y: 0.6, z: 0 }, radius: 3, damage: 1, knockback: 0 }, many, { ...BUBBLE_BURST, maxChain: 5 });
    expect(r2.bursts).toHaveLength(5);
  });
  it('integration: bubble-bound enemy hit by explode() in the live sim triggers BUBBLE BURST', () => {
    resetWorld();
    const a = spawnEnemy('windup', 0, 0)!, b = spawnEnemy('windup', 2.9, 0)!;
    a.bound = 2;
    const res = explode({ x: 0, y: 0.6, z: 0 }, 2, 10, 0, 0);
    expect(res.bursts).toHaveLength(1);
    expect(b.hp).toBeLessThan(b.maxHp); // b was outside the rocket radius, hit by the burst
  });
});

describe('combo system', () => {
  it('tiers escalate x2 / x5 / SUPER / TOY MAYHEM', () => {
    expect([1, 2, 5, 10, 15, 40].map((n) => tierFor(n, COMBO.thresholds))).toEqual([0, 1, 2, 3, 4, 4]);
    expect(COMBO.names[4]).toBe('TOY MAYHEM!');
  });
  it('chain: kills within window build up; multiplier capped; expires', () => {
    const s = createCombo(); const ups: number[] = [];
    for (let i = 0; i < 30; i++) { const k = comboKill(s, COMBO); if (k.tierUp) ups.push(k.tier); expect(k.multiplier).toBeLessThanOrEqual(COMBO.maxMultiplier); stepCombo(s, 0.5); }
    expect(ups).toEqual([1, 2, 3, 4]);
    expect(currentMultiplier(s)).toBe(COMBO.maxMultiplier);
    for (let i = 0; i < 400; i++) stepCombo(s, dt);
    expect(s.count).toBe(0); expect(currentMultiplier(s)).toBe(1);
  });
  it('kills outside the window restart the chain', () => {
    const s = createCombo(); comboKill(s); stepCombo(s, COMBO.window + 0.1); const k = comboKill(s);
    expect(s.count).toBe(1); expect(k.tier).toBe(0);
  });
  it('cooldown regen is capped per chain (no permanent inflation)', () => {
    const s = createCombo(); let total = 0;
    for (let i = 0; i < 100; i++) total += comboKill(s).regen;
    expect(total).toBeCloseTo(COMBO.regenCapPerChain);
  });
});

describe('skills', () => {
  it('dash cooldown gates reuse and regen reduces it', () => {
    const s = createSkill();
    expect(tryActivate(s, SKILLS.dash)).toBe(true);
    expect(tryActivate(s, SKILLS.dash)).toBe(false);
    for (let t = 0; t < 1; t += dt) stepSkill(s, dt);
    expect(s.active).toBe(0); expect(tryActivate(s, SKILLS.dash)).toBe(false);
    reduceCooldown(s, 10); expect(s.cd).toBe(0); expect(tryActivate(s, SKILLS.dash)).toBe(true);
  });
  it('roll is blocked while dashing', () => {
    const s = createSkill(); expect(tryActivate(s, SKILLS.roll, true)).toBe(false);
  });
  it('dash in live sim grants invulnerability and damages enemies passed', async () => {
    resetWorld();
    const { input } = await import('../game/core/input');
    const p = world.player; p.pos = { x: 0, y: 0, z: 0 }; p.yaw = 0;
    const e = spawnEnemy('windup', 0, -2.5)!;
    world.waves.timer = 999; // hold waves
    input.pressed.add('KeyF'); stepSim(dt);
    expect(p.invuln).toBeGreaterThan(0); expect(p.anim).toBe('dash');
    for (let i = 0; i < 15; i++) stepSim(dt);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe('6 enemy types', () => {
  it('all configured and appear in waves progressively', () => {
    const BASE = ENEMY_ORDER.slice(0, 6); // M6 added tank family types (covered in m6 tests)
    expect(BASE).toEqual(['windup', 'gunner', 'bunny', 'tank', 'drone', 'clown']);
    for (const t of ENEMY_ORDER) expect(ENEMIES[t].hp).toBeGreaterThan(0);
    const firstWave = BASE.map((t) => WAVES.findIndex((w) => (w[t] ?? 0) > 0));
    expect(firstWave.every((i) => i >= 0)).toBe(true);
    expect(WAVES.length).toBe(5);
    const counts = WAVES.map((w) => buildQueue(w).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });
  it('FSM: each type detects, chases and winds up an attack in its range', () => {
    for (const t of ENEMY_ORDER) {
      const c = ENEMIES[t]; const f: FsmData = { state: 'idle', timer: 0.5, cooldown: 0 };
      const p = { dist: Math.min(c.attackRange * 0.8, c.detectRange - 1), canSee: true, playerAlive: true, dead: false };
      let wound = false, released = false;
      for (let i = 0; i < 300; i++) { const ev = stepFsm(f, c, p, dt); wound ||= ev.windupStarted; released ||= ev.attackRelease; }
      expect(wound, t).toBe(true); expect(released, t).toBe(true);
    }
  });
  it('tank frontal armor reduces frontal shots only', () => {
    // tank facing 0 looks toward -z; a shot travelling +z hits its face
    expect(armorMultiplier(0, { x: 0, y: 0, z: 1 }, 0.3)).toBe(0.3);
    expect(armorMultiplier(0, { x: 0, y: 0, z: -1 }, 0.3)).toBe(1);
    expect(armorMultiplier(0, { x: 0, y: 0, z: 1 }, undefined)).toBe(1);
  });
  it('bunny leap lands on target', () => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 4, y: 0, z: -3 }, T = ENEMIES.bunny.leapTime!;
    const v = leapVelocity(a, b, T, 24);
    const x = a.x + v.x * T, y = a.y + v.y * T - 0.5 * 24 * T * T;
    expect(x).toBeCloseTo(4); expect(y).toBeCloseTo(0); expect(v.y).toBeGreaterThan(0);
  });
  it('drone orbit keeps radius', () => {
    const o = orbitPoint({ x: 1, y: 0, z: 1 }, { x: 10, y: 4, z: 1 }, 9, 0.5);
    expect(Math.hypot(o.x - 1, o.z - 1)).toBeCloseTo(9);
  });
  it('bomb clown self-destructs in sim and damages the player', () => {
    resetWorld(); world.waves.timer = 999;
    const p = world.player; p.pos = { x: 0, y: 0, z: 0 };
    const c = spawnEnemy('clown', 0, -1.8)!; c.fsm.state = 'chase'; c.fsm.cooldown = 0;
    for (let i = 0; i < 120; i++) stepSim(dt);
    expect(c.dead).toBe(true); expect(p.hp).toBeLessThan(p.maxHp);
  });
});
