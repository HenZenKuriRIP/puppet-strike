// W2 part (e): BRICK COLOSSUS — scheduler (phases/telegraphs), attack effects in the real sim, parts, defeat, co-op sync of shield bricks.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { damageEnemy } from '../game/systems/simulation';
import { world } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { createBoss, stepBoss, phaseFor, bossInvulnerable, BossAttack } from '../game/boss/kingGummy';
import { COLOSSUS, PART_NAMES, partsAttached, freightLine, wallSlots } from '../game/boss/colossus';
import { MECH, mechSnap, applyMechSnap } from '../game/levels/mech';
import { BOSS_BOUND } from '../game/levels/arenaLayout';
import { getStage } from '../game/progression/adventure';
import { buildSnapshot, decodeSnap } from '../net/snapshot';

const run = (s: ReturnType<typeof createBoss>, hp: number, t: number) => { const evs = []; for (let i = 0; i < Math.round(t * 60); i++) evs.push(stepBoss(s, hp, 1 / 60, COLOSSUS)); return evs; };

describe('colossus scheduler', () => {
  it('config: 3 phases, every telegraph defined, cycles only use defined attacks', () => {
    expect(COLOSSUS.phases).toEqual([1, 0.7, 0.35]);
    for (const ph of [1, 2, 3] as const) for (const a of COLOSSUS.cycles[ph]) expect(COLOSSUS.telegraph[a]).toBeGreaterThan(0);
    expect(phaseFor(1, COLOSSUS)).toBe(1); expect(phaseFor(0.69, COLOSSUS)).toBe(2); expect(phaseFor(0.34, COLOSSUS)).toBe(3);
  });
  it('intro invulnerable, telegraph precedes every attack, phases go forward only', () => {
    const s = createBoss(COLOSSUS, 'colossus'); expect(s.kind).toBe('colossus'); expect(bossInvulnerable(s)).toBe(true);
    const evs = run(s, 1, COLOSSUS.introTime + 14);
    expect(bossInvulnerable(s)).toBe(false);
    let last: BossAttack | null = null;
    for (const e of evs) { if (e.telegraph) last = e.telegraph; if (e.attack) { expect(e.attack).toBe(last); last = null; } }
    expect(evs.some((e) => e.attack === 'shower')).toBe(true);
    expect(run(s, 0.6, 0.1).some((e) => e.phaseChanged === 2)).toBe(true); expect(bossInvulnerable(s)).toBe(true);
    run(s, 0.9, COLOSSUS.transitionTime + 0.3); expect(s.phase).toBe(2);
    const a2 = run(s, 0.6, 25).map((e) => e.attack).filter(Boolean);
    expect(a2).toContain('wall'); expect(a2).toContain('summon'); expect(a2).not.toContain('train');
    expect(run(s, 0.3, 0.1).some((e) => e.phaseChanged === 3)).toBe(true);
    run(s, 0.3, COLOSSUS.transitionTime + 0.3);
    const a3 = run(s, 0.3, 30).map((e) => e.attack).filter(Boolean);
    for (const a of ['stomp', 'train', 'wreck'] as BossAttack[]) expect(a3).toContain(a);
    expect(a3).not.toContain('wall');
    expect(stepBoss(s, 0, 1 / 60, COLOSSUS).defeated).toBe(true);
  });
  it('parts break off per phase (arm in 2, plate + helmet in 3)', () => {
    expect(PART_NAMES.every((n) => partsAttached(1)[n])).toBe(true);
    expect(partsAttached(2).armL).toBe(false); expect(partsAttached(2).plate).toBe(true);
    expect(partsAttached(3).plate).toBe(false); expect(partsAttached(3).helmet).toBe(false); expect(partsAttached(3).legL).toBe(true);
  });
  it('freight line leaves safe lanes between circles; wall slots are bounded and between boss and target', () => {
    const f = freightLine(2, 3, BOSS_BOUND, false), r = COLOSSUS.train.radius;
    expect(f.length).toBe(COLOSSUS.train.count);
    for (let i = 1; i < f.length; i++) expect(Math.hypot(f[i].x - f[i - 1].x, f[i].z - f[i - 1].z)).toBeGreaterThan(2 * r + 1.2); // ≥1.2 m gap to slip through
    const ts = f.map((h) => h.t); expect(ts[1]).toBeGreaterThan(ts[0]); // sweeps one end to the other
    const w = wallSlots(0, -8, 0, 8, BOSS_BOUND);
    expect(w.length).toBe(COLOSSUS.wall.count); for (const s of w) { expect(Math.abs(s.x)).toBeLessThanOrEqual(BOSS_BOUND); expect(s.z).toBeGreaterThan(-8); expect(s.z).toBeLessThan(8); }
  });
});

function setup(fn: (adv: (ms: number) => void, step: (s: number) => void) => void) {
  withSeed(11, () => withVirtualTime((adv) => {
    input.reset(); runFlow.startRun('adventure', 'mochi', 6); useUI.getState().set({ phase: 'playing' } as any);
    const step = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) tick(adv); };
    tick(adv); fn(adv, step);
  }));
}
const boss = () => world.enemies.items[world.boss.id];

describe('colossus in the sim (stage 2-3)', () => {
  it('stage 6 is a block boss stage; starting it spawns the colossus with a cinematic intro', () => {
    expect(getStage(6).kind).toBe('boss'); expect(getStage(6).world).toBe('block');
    setup(() => {
      expect(world.mapId).toBe('block'); const b = boss(); expect(b.type).toBe('colossus'); expect(b.maxHp).toBe(COLOSSUS.hp);
      expect(world.cinematic).toBeGreaterThan(0); expect(world.boss.s.kind).toBe('colossus');
      expect(useUI.getState().boss).not.toBeNull(); expect(useUI.getState().boss!.kind).toBe('colossus');
    });
  });
  it('phase 1 shower: telegraphed falling-brick hazards appear, detonate and hurt a player standing in them', () => {
    setup((adv, step) => {
      world.cinematic = 0; world.boss.s.intro = 0; const p = world.player; p.pos.x = 0; p.pos.z = 8; p.prev.x = 0; p.prev.z = 8; p.invuln = 0;
      world.boss.s.tele = null; world.boss.s.timer = 0.01; world.boss.s.cycleIdx = 0; // cycle[0] = shower
      let seen = 0, hp0 = p.hp; for (let i = 0; i < 240 && seen === 0; i++) { tick(adv); seen = world.hazards.filter((h) => h.kind === 'shell').length; }
      expect(seen).toBeGreaterThanOrEqual(5); expect(world.boss.tele).toBe('shower');
      for (const h of world.hazards) expect(h.t).toBeGreaterThan(0.9); // generous telegraph
      p.invuln = 0; p.hp = hp0; world.hazards[0].pos.x = p.pos.x; world.hazards[0].pos.z = p.pos.z;
      step(2.2); expect(p.hp).toBeLessThan(hp0); expect(world.hazards.length).toBe(0);
    });
  });
  it('phase 2: wall attack assembles shield bricks (giant bricks, synced to the guest with their size) and summons brick soldiers', () => {
    setup((adv, step) => {
      world.cinematic = 0; const B = world.boss; B.s.intro = 0; const b = boss(); b.hp = b.maxHp * 0.6; step(COLOSSUS.transitionTime + 0.5); expect(B.s.phase).toBe(2);
      const alive0 = MECH.bricks.filter((k) => k.alive).length;
      B.s.tele = null; B.s.timer = 0.01; B.s.cycleIdx = 0; // cycle[0] = wall
      step(COLOSSUS.telegraph.wall + 0.6);
      const made = MECH.bricks.filter((k) => k.alive && !MECH.def.bricks[k.slot]);
      expect(MECH.bricks.filter((k) => k.alive).length).toBeGreaterThan(alive0);
      expect(made.length).toBeGreaterThanOrEqual(2);
      // snapshot round trip: a runtime brick (no layout def) carries its size
      const snap = mechSnap()!, row = snap.b.find((r) => r[0] === made[0].slot)!; expect(row.length).toBe(9);
      const k = made[0], sx = k.sx; k.alive = false; k.sx = 1; applyMechSnap(JSON.parse(JSON.stringify(snap)));
      expect(k.alive).toBe(true); expect(k.sx).toBeCloseTo(sx, 2);
      B.s.tele = null; B.s.timer = 0.01; B.s.cycleIdx = 2; // summon
      step(COLOSSUS.telegraph.summon + 0.5);
      expect(world.enemies.countActive((e) => e.type === 'bsoldier' && !e.dead)).toBeGreaterThanOrEqual(1);
      expect(buildSnapshot(1).bs!.ph).toBe(2); expect(decodeSnap(JSON.parse(JSON.stringify(buildSnapshot(2))), 0).bs!.id).toBe(B.id);
    });
  });
  it('phase 3: freight line + wrecking balls + stomp spawn hazards of the right kinds; stomp is avoided by jumping', () => {
    setup((adv, step) => {
      world.cinematic = 0; const B = world.boss; B.s.intro = 0; const b = boss(); b.hp = b.maxHp * 0.3; step(COLOSSUS.transitionTime + 0.5); expect(B.s.phase).toBe(3);
      B.s.tele = null; B.s.timer = 0.01; B.s.cycleIdx = 1; // train
      step(0.3); expect(world.hazards.filter((h) => h.kind === 'hazard').length).toBe(COLOSSUS.train.count);
      step(3);
      B.s.tele = null; B.s.timer = 0.01; B.s.cycleIdx = 3; // wreck
      step(0.3); expect(world.hazards.filter((h) => h.kind === 'hazard').length).toBe(COLOSSUS.wreck.count);
      step(3); world.hazards = [];
      B.s.tele = null; B.s.timer = 0.01; B.s.cycleIdx = 0; // stomp
      step(0.3); const sl = world.hazards.find((h) => h.kind === 'slam')!; expect(sl.r).toBe(COLOSSUS.stomp.radius);
      const p = world.player; p.invuln = 0; p.hp = p.maxHp; p.pos.x = b.pos.x + 2; p.pos.z = b.pos.z + 2; p.pos.y = 3; p.vel.y = 0;
      sl.t = 0.001; step(0.02); expect(p.hp).toBe(p.maxHp); // airborne above the slam
    });
  });
  it('defeat: all minions die, outcome is a win after the disassembly delay, hud shows no boss afterwards', () => {
    setup((adv, step) => {
      world.cinematic = 0; world.boss.s.intro = 0; const b = boss(); b.hp = b.maxHp * 0.3; step(COLOSSUS.transitionTime * 2 + 1);
      expect(world.outcome).toBeNull();
      damageEnemy(b, 99999); step(0.1); expect(b.dead).toBe(true); expect(b.deathTimer).toBeGreaterThan(0.5); expect(world.slots[0].player.won).toBe(true);
      step(10); expect(world.run.stageClear).toBe(true); expect(useUI.getState().save.progress.cleared).toContain(6); expect(useUI.getState().phase).toBe('results');
      expect(useUI.getState().results!.won).toBe(true); expect(useUI.getState().results!.unlocked).toContain('brix');
    });
  });
});
