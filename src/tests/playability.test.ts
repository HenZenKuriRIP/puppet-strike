import { describe, it, expect } from 'vitest';
import { UPGRADES, rollChoices, computeMods, addUpgrade, OFFER_SKIP, OFFER_REROLL, isOfferAction, Stacks } from '../game/progression/upgrades';
import { STAGES, waveGoal, startPicksUnlocked } from '../game/progression/adventure';
import { survivalWave, SURVIVAL_TYPE_CAP } from '../game/progression/survival';
import { TANK_TYPES, WEAPONS, ENEMIES, EnemyType } from '../config/game';
import { stepFsm, FsmData, recoverTime, INVESTIGATE_TIME } from '../game/ai/enemyFsm';
import { migrate, defaultSave, SAVE_VERSION, KV, loadSave, SAVE_KEY, resetSave } from '../game/progression/save';
import { parseGameMsg, FSM_STATES } from '../net/protocol';
import { startRun, requestUpgrade, chooseUpgrade } from '../game/systems/runFlow';
import { world } from '../game/core/world';
import { useUI } from '../app/store';
import { input } from '../game/core/input';
import { withSeed, withVirtualTime } from '../game/sim/headless';
import { stepWaves, createWaveState } from '../game/progression/waveManager';
import { WAVE } from '../config/game';

const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const ttk = (hp: number, dmg: number, rate: number) => { const shots = Math.ceil(hp / dmg); return (shots - 1) / rate; };

describe('0.1.14 offer rolling', () => {
  it('diversifies roles when the pool allows and never repeats an id', () => {
    const rng = seeded(11);
    for (let i = 0; i < 200; i++) {
      const c = rollChoices({}, 3, rng, { diversify: true });
      expect(new Set(c.map((x) => x.id)).size).toBe(3);
      expect(new Set(c.map((x) => x.role)).size).toBeGreaterThanOrEqual(2);
    }
  });
  it('reroll excludes the current offer and skip/reroll are reserved actions', () => {
    expect(isOfferAction(OFFER_SKIP)).toBe(true);
    expect(isOfferAction(OFFER_REROLL)).toBe(true);
    const first = rollChoices({}, 3, seeded(3), { diversify: true }).map((u) => u.id);
    const second = rollChoices({}, 3, seeded(4), { exclude: first, diversify: true }).map((u) => u.id);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });
  it('new verb upgrades set flags rather than only percentages', () => {
    const ids = ['rollReload', 'reloadPulse', 'windupBreak', 'bubblePop', 'pierceFocus', 'skillSurge'] as const;
    for (const id of ids) expect(UPGRADES.some((u) => u.id === id)).toBe(true);
    const st: Stacks = {};
    for (const id of ids) expect(addUpgrade(st, id)).toBe(true);
    const m = computeMods(st);
    expect(m.rollReload && m.reloadPulse && m.windupBreak && m.bubblePop && m.pierceFocus && m.skillSurge).toBe(true);
    expect(addUpgrade(st, 'rollReload')).toBe(false);
  });
});

describe('0.1.14 encounters', () => {
  it('1-1 and 1-2 keep a readable archetype cap and a priority target', () => {
    for (const id of [1, 2]) {
      const st = STAGES.find((s) => s.id === id)!;
      expect(st.waves.length).toBe(3);
      st.waves.forEach((w, i) => {
        const types = Object.keys(w).filter((k) => (w as any)[k] > 0);
        expect(types.length).toBeGreaterThan(0);
        expect(types.length).toBeLessThanOrEqual(4);
        const goal = waveGoal(id, i);
        expect(goal).toBeTruthy();
        if (goal?.priority) expect(types).toContain(goal.priority);
      });
    }
    const tankIn = (id: number) => STAGES.find((s) => s.id === id)!.waves.some((w) => Object.keys(w).some((t) => TANK_TYPES.includes(t as any)));
    expect(tankIn(1)).toBe(true); expect(tankIn(2)).toBe(true);
  });
  it('survival early waves stay under the archetype cap and wave 1 still has no tanks', () => {
    expect(Object.keys(survivalWave(1)).some((t) => TANK_TYPES.includes(t as any))).toBe(false);
    for (let n = 1; n <= 20; n++) {
      if (n % 10 === 0) continue; // mini-boss wave may add mega on top of the cap helper's kept types
      expect(Object.keys(survivalWave(n)).length).toBeLessThanOrEqual(SURVIVAL_TYPE_CAP);
    }
  });
});

describe('0.1.14 enemy FSM', () => {
  const c = ENEMIES.windup;
  const mk = (): FsmData => ({ state: 'idle', timer: 0.2, cooldown: 0 });
  it('enters recover after a committed attack and then chases', () => {
    const f: FsmData = { state: 'attack', timer: 0.01, cooldown: 0 };
    const ev = stepFsm(f, c, { dist: 1, canSee: true, playerAlive: true, dead: false }, 1 / 60);
    expect(ev.attackRelease).toBe(true);
    expect(f.state).toBe('recover');
    expect(f.timer).toBeCloseTo(recoverTime(c), 3);
    // Only step through the recover window (plus a short beat). A full second at melee
    // range would let cooldown expire and the FSM re-enter attack.
    const steps = Math.ceil((recoverTime(c) + 0.12) * 60);
    for (let i = 0; i < steps; i++) stepFsm(f, c, { dist: 1, canSee: true, playerAlive: true, dead: false }, 1 / 60);
    expect(f.state).toBe('chase');
    expect(f.cooldown).toBeGreaterThan(0);
  });
  it('chases last-known position when sight is lost inside loseRange', () => {
    const f: FsmData = { state: 'chase', timer: 0, cooldown: 0 };
    stepFsm(f, c, { dist: 8, canSee: false, playerAlive: true, dead: false }, 1 / 60);
    expect(f.state).toBe('investigate');
    expect(f.timer).toBeCloseTo(INVESTIGATE_TIME, 3);
    for (let i = 0; i < Math.ceil(INVESTIGATE_TIME * 60) + 2; i++) stepFsm(f, c, { dist: 8, canSee: false, playerAlive: true, dead: false }, 1 / 60);
    expect(f.state).toBe('patrol');
  });
  it('still patrols when the target is beyond loseRange', () => {
    const f: FsmData = { state: 'chase', timer: 0, cooldown: 0 };
    stepFsm(f, c, { dist: c.loseRange + 1, canSee: false, playerAlive: true, dead: false }, 1 / 60);
    expect(f.state).toBe('patrol');
  });
});

describe('0.1.14 TTK table', () => {
  it('puts standard trash in a trackable SMG TTK band; clowns/jelly stay squishier', () => {
    const smg = WEAPONS.candySmg;
    const band = (t: EnemyType) => ttk(ENEMIES[t].hp, smg.damage, smg.fireRate);
    for (const t of ['windup', 'gunner', 'bunny', 'drone', 'bsoldier'] as EnemyType[]) {
      const v = band(t);
      expect(v).toBeGreaterThanOrEqual(0.55);
      expect(v).toBeLessThanOrEqual(1.3);
    }
    expect(band('clown')).toBeLessThan(0.55);
    expect(band('jelly')).toBeLessThan(0.55);
  });
});

describe('0.1.14 save compatibility', () => {
  it('does not bump the save version and still opens start picks from a v3 clear of 1-3', () => {
    expect(SAVE_VERSION).toBe(3);
    const m = migrate({ version: 3, progress: { cleared: [1, 2, 3], bestSurvival: 10 }, character: 'luna' });
    expect(m.version).toBe(3);
    expect(startPicksUnlocked(m.progress.cleared)).toBe(true);
    expect(startPicksUnlocked(defaultSave().progress.cleared)).toBe(false);
    const kv: KV & { m: Map<string, string> } = (() => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; })();
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 2, progress: { cleared: [1], bestSurvival: 4 } }));
    const loaded = loadSave(kv);
    expect(loaded.version).toBe(3);
    expect(startPicksUnlocked(loaded.progress.cleared)).toBe(false);
  });
});

describe('0.1.14 net offer actions', () => {
  it('accepts skip/reroll as host-validated upgrade messages and keeps old FSM indices', () => {
    expect(parseGameMsg({ k: 'up', id: OFFER_SKIP })).toEqual({ k: 'up', id: OFFER_SKIP });
    expect(parseGameMsg({ k: 'up', id: OFFER_REROLL })).toEqual({ k: 'up', id: OFFER_REROLL });
    expect(FSM_STATES[0]).toBe('idle');
    expect(FSM_STATES[4]).toBe('attack');
    expect(FSM_STATES[5]).toBe('dead');
    expect(FSM_STATES).toContain('recover');
    expect(FSM_STATES).toContain('investigate');
  });
});

describe('0.1.14 run offers', () => {
  it('reroll mutates the solo offer once, skip adds no stacks', () => {
    withSeed(9, () => {
      input.reset();
      resetSave();
      startRun('adventure', 'mochi', 1);
      requestUpgrade('wave');
      const first = useUI.getState().upgradeChoices.slice();
      expect(first.length).toBe(3);
      expect(useUI.getState().upgradeRerolls).toBe(1);
      chooseUpgrade(OFFER_REROLL);
      const second = useUI.getState().upgradeChoices.slice();
      expect(second.length).toBe(3);
      expect(second.some((id) => first.includes(id))).toBe(false);
      expect(useUI.getState().upgradeRerolls).toBe(0);
      chooseUpgrade(OFFER_REROLL);
      expect(useUI.getState().upgradeChoices).toEqual(second);
      chooseUpgrade(OFFER_SKIP);
      expect(world.run.taken.length).toBe(0);
      expect(useUI.getState().phase).toBe('playing');
    });
  });
  it('adventure mid-wave offers once and does not offer again on the final wave of a stage', () => {
    withSeed(2, () => withVirtualTime((adv) => {
      input.reset();
      resetSave();
      startRun('adventure', 'mochi', 1);
      if (useUI.getState().phase === 'upgrade') chooseUpgrade(OFFER_SKIP);
      useUI.getState().set({ phase: 'playing' });
      const defs = world.run.waveDefs;
      expect(defs.length).toBe(3);
      const s = world.waves;
      let offers = 0;
      // drive the real wave state machine with no living enemies
      s.phase = 'intermission'; s.timer = 0; s.index = -1; s.queue = [];
      for (let i = 0; i < 60 * 40; i++) {
        const ev = stepWaves(s, defs, 0, 1 / 60, WAVE);
        if (ev.waveCleared !== null && ev.allCleared) break;
        if (ev.waveCleared !== null && !ev.allCleared) offers++;
      }
      expect(offers).toBe(2);
      expect(s.index).toBe(defs.length - 1);
      void adv;
    }));
  });
});
