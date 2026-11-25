import { describe, it, expect } from 'vitest';
import { applyDamage, falloff } from '../game/combat/damage';
import { raySphere, rayAABB } from '../game/combat/raycast';
import { createWeaponState, stepWeapon } from '../game/weapons/weaponMachine';
import { WEAPONS, ENEMIES, WAVES, WAVE } from '../config/game';
import { stepFsm, FsmData } from '../game/ai/enemyFsm';
import { createWaveState, stepWaves, buildQueue } from '../game/progression/waveManager';
import { FixedStepper } from '../game/core/fixedStep';
import { moveAndCollide } from '../game/physics/collision';

const W = WEAPONS.candySmg;
const dt = 1 / 60;

describe('damage', () => {
  it('reduces hp and flashes', () => {
    const t = { hp: 50, maxHp: 50, dead: false, flash: 0 };
    expect(applyDamage(t, 12)).toEqual({ dealt: 12, killed: false });
    expect(t.hp).toBe(38); expect(t.flash).toBeGreaterThan(0);
  });
  it('kills and clamps at 0, ignores dead targets', () => {
    const t = { hp: 5, maxHp: 50, dead: false, flash: 0 };
    expect(applyDamage(t, 20)).toEqual({ dealt: 5, killed: true });
    expect(t.hp).toBe(0); expect(t.dead).toBe(true);
    expect(applyDamage(t, 20).dealt).toBe(0);
  });
  it('falloff is 1 near, min far, linear between', () => {
    expect(falloff(5, 25, 90, 0.6)).toBe(1);
    expect(falloff(200, 25, 90, 0.6)).toBe(0.6);
    expect(falloff(57.5, 25, 90, 0.6)).toBeCloseTo(0.8);
  });
});

describe('raycasts', () => {
  it('ray hits sphere in front, misses behind', () => {
    expect(raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -5 }, 1)).toBeCloseTo(4);
    expect(raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -5 }, 1)).toBeNull();
  });
  it('ray hits AABB entry distance', () => {
    const box = { min: { x: -1, y: -1, z: -6 }, max: { x: 1, y: 1, z: -4 } };
    expect(rayAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, box)).toBeCloseTo(4);
    expect(rayAABB({ x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, box)).toBeNull();
  });
});

describe('weapon state machine', () => {
  it('respects fire rate', () => {
    const s = createWeaponState(W); let shots = 0;
    for (let i = 0; i < 60; i++) if (stepWeapon(s, W, { trigger: true, reload: false }, dt).fired) shots++;
    expect(shots).toBeGreaterThanOrEqual(W.fireRate - 1);
    expect(shots).toBeLessThanOrEqual(W.fireRate + 1);
    expect(s.ammo).toBe(W.magSize - shots);
  });
  it('empties mag, auto-reloads on trigger, refills after reloadTime', () => {
    const s = createWeaponState(W);
    let fired = 0, started = false;
    for (let i = 0; i < 600 && !started; i++) { const e = stepWeapon(s, W, { trigger: true, reload: false }, dt); if (e.fired) fired++; if (e.reloadStarted) started = true; }
    expect(fired).toBe(W.magSize); expect(s.status).toBe('reloading');
    let finished = false, frames = 0;
    while (!finished && frames < 1000) { finished = stepWeapon(s, W, { trigger: false, reload: false }, dt).reloadFinished; frames++; }
    expect(frames * dt).toBeCloseTo(W.reloadTime, 1);
    expect(s.ammo).toBe(W.magSize);
  });
  it('cannot fire while reloading; manual reload only when not full', () => {
    const s = createWeaponState(W);
    expect(stepWeapon(s, W, { trigger: false, reload: true }, dt).reloadStarted).toBe(false);
    stepWeapon(s, W, { trigger: true, reload: false }, dt);
    for (let i = 0; i < 10; i++) stepWeapon(s, W, { trigger: false, reload: false }, dt);
    expect(stepWeapon(s, W, { trigger: false, reload: true }, dt).reloadStarted).toBe(true);
    expect(stepWeapon(s, W, { trigger: true, reload: false }, dt).fired).toBe(false);
  });
});

describe('enemy FSM', () => {
  const c = ENEMIES.windup;
  const mk = (): FsmData => ({ state: 'idle', timer: 0.5, cooldown: 0 });
  const run = (f: FsmData, p: any, secs: number) => { const evs = []; for (let t = 0; t < secs; t += dt) evs.push(stepFsm(f, c, p, dt)); return evs; };
  it('idle -> patrol when nothing seen', () => {
    const f = mk(); run(f, { dist: 99, canSee: false, playerAlive: true, dead: false }, 0.6);
    expect(f.state).toBe('patrol');
  });
  it('idle -> detect -> chase when player visible', () => {
    const f = mk();
    stepFsm(f, c, { dist: 8, canSee: true, playerAlive: true, dead: false }, dt);
    expect(f.state).toBe('detect');
    run(f, { dist: 8, canSee: true, playerAlive: true, dead: false }, c.detectDelay + 0.05);
    expect(f.state).toBe('chase');
  });
  it('chase -> attack (windup) -> release -> chase with cooldown', () => {
    const f: FsmData = { state: 'chase', timer: 0, cooldown: 0 };
    const ev = stepFsm(f, c, { dist: 1, canSee: true, playerAlive: true, dead: false }, dt);
    expect(f.state).toBe('attack'); expect(ev.windupStarted).toBe(true);
    const evs = run(f, { dist: 1, canSee: true, playerAlive: true, dead: false }, c.windup + 0.05);
    expect(evs.filter((e) => e.attackRelease).length).toBe(1);
    expect(f.state).toBe('chase'); expect(f.cooldown).toBeGreaterThan(0);
  });
  it('does not see through walls; dead is terminal', () => {
    const f = mk(); stepFsm(f, c, { dist: 5, canSee: false, playerAlive: true, dead: false }, dt);
    expect(f.state).toBe('idle');
    stepFsm(f, c, { dist: 5, canSee: true, playerAlive: true, dead: true }, dt);
    expect(f.state).toBe('dead');
    stepFsm(f, c, { dist: 5, canSee: true, playerAlive: true, dead: false }, dt);
    expect(f.state).toBe('dead');
  });
  it('chase -> patrol when player lost far away', () => {
    const f: FsmData = { state: 'chase', timer: 0, cooldown: 0 };
    stepFsm(f, c, { dist: c.loseRange + 1, canSee: false, playerAlive: true, dead: false }, dt);
    expect(f.state).toBe('patrol');
  });
});

describe('wave manager', () => {
  it('queues the right enemy mix', () => {
    const q = buildQueue({ windup: 3, gunner: 2 });
    expect(q.filter((x) => x === 'windup').length).toBe(3); expect(q.filter((x) => x === 'gunner').length).toBe(2);
  });
  it('runs intermission -> spawn -> fight -> clear for all waves, then complete', () => {
    const s = createWaveState(WAVE.intermission);
    let alive = 0, started: number[] = [], cleared: number[] = [], done = false;
    for (let i = 0; i < 60 * 400 && !done; i++) {
      const ev = stepWaves(s, WAVES, alive, dt, WAVE);
      alive += ev.spawn.length;
      if (ev.waveStarted !== null) started.push(ev.waveStarted);
      if (ev.waveCleared !== null) cleared.push(ev.waveCleared);
      if (s.phase === 'fighting' && alive > 0 && i % 10 === 0) alive--; // player kills one every half sec
      done = ev.allCleared;
    }
    const all = WAVES.map((_, i) => i); expect(started).toEqual(all); expect(cleared).toEqual(all);
    expect(s.phase).toBe('complete');
  });
  it('does not clear a wave while enemies are alive', () => {
    const s = createWaveState(0.1);
    for (let i = 0; i < 600; i++) stepWaves(s, WAVES, 5, dt, WAVE);
    expect(s.index).toBe(0); expect(s.phase).toBe('fighting');
  });
});

describe('core', () => {
  it('fixed stepper accumulates and caps', () => {
    const fs = new FixedStepper(1 / 60, 5);
    expect(fs.advance(1 / 120)).toBe(0); expect(fs.advance(1 / 120)).toBe(1);
    expect(fs.advance(10)).toBe(5);
  });
  it('collision lands on top of block and stops at wall', () => {
    const boxes = [{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } }];
    const pos = { x: 0, y: 1.2, z: 0 }, vel = { x: 0, y: -5, z: 0 };
    expect(moveAndCollide(pos, vel, { x: 0, y: -0.5, z: 0 }, 0.4, 1.5, boxes).grounded).toBe(true);
    expect(pos.y).toBe(1);
    const p2 = { x: -2, y: 0, z: 0 }, v2 = { x: 5, y: 0, z: 0 };
    moveAndCollide(p2, v2, { x: 1, y: 0, z: 0 }, 0.4, 1.5, boxes);
    expect(p2.x).toBeLessThanOrEqual(-1.4);
  });
});
