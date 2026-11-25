/** Funny kill FX: toggle, particle caps, host event emit for co-op guests. */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { damageEnemy } from '../game/systems/simulation';
import { doFunnyKill, funnyKill, FUNNY_WORDS } from '../game/systems/fx';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { drain, evq } from '../game/core/events';
import { v3 } from '../game/core/math';
import { playEvent } from '../net/session';

function sandbox(fn: (step: (n?: number) => void) => void, map: 'candy' | 'block' = 'candy') {
  return withSeed(7, () => withVirtualTime((adv) => {
    input.reset(); evq.recording = false; evq.list = [];
    runFlow.startRun('survival', 'mochi', 1, map);
    useUI.getState().set({ phase: 'playing' } as any);
    useUI.getState().setSettings({ funnyFx: true });
    world.run.waveDefs = []; world.cinematic = 0; world.waves.timer = 1e9 as any;
    const step = (n = 1) => { for (let i = 0; i < n; i++) tick(adv); };
    step(2); for (const e of world.enemies.items) e.active = false;
    try { fn(step); } finally { input.reset(); evq.recording = false; evq.list = []; }
  }));
}
const clearFx = () => {
  for (const p of [world.sparks, world.blastFx, world.dmgNums]) p.clear();
};

describe('funny kill FX', () => {
  it('spawns shockwave + fragments + smoke + popup when enabled', () => {
    sandbox(() => {
      clearFx();
      doFunnyKill(0, 1, 0, false, 1);
      const frags = world.sparks.items.filter((s) => s.active && (s.kind === 2 || s.kind === 4 || s.kind === 0));
      const smoke = world.sparks.items.filter((s) => s.active && s.kind === 5);
      const candyFrag = world.sparks.items.filter((s) => s.active && s.kind === 2);
      expect(candyFrag.length).toBeGreaterThanOrEqual(8);
      expect(candyFrag.length).toBeLessThanOrEqual(12);
      expect(smoke.length).toBe(5);
      expect(world.blastFx.items.some((b) => b.active && b.ring)).toBe(true);
      expect(world.dmgNums.items.some((d) => d.active && (FUNNY_WORDS as readonly string[]).includes(d.text))).toBe(true);
      expect(frags.length + smoke.length).toBeLessThanOrEqual(30);
    });
  });

  it('uses brick fragment kind on block enemies', () => {
    sandbox(() => {
      clearFx();
      doFunnyKill(1, 1, 1, true, 1);
      const brick = world.sparks.items.filter((s) => s.active && s.kind === 3);
      expect(brick.length).toBeGreaterThanOrEqual(8);
      expect(world.sparks.items.some((s) => s.active && s.kind === 2)).toBe(false);
    }, 'block');
  });

  it('no-ops when Funny FX setting is off', () => {
    sandbox(() => {
      useUI.getState().setSettings({ funnyFx: false });
      clearFx();
      doFunnyKill(0, 1, 0, false, 1);
      expect(world.sparks.items.every((s) => !s.active)).toBe(true);
      expect(world.blastFx.items.every((b) => !b.active)).toBe(true);
      expect(world.dmgNums.items.every((d) => !d.active)).toBe(true);
    });
  });

  it('host emits fk event; guest playEvent replays the pack', () => {
    sandbox(() => {
      clearFx();
      evq.recording = true; evq.now = 1.25; evq.list = [];
      funnyKill(v3(3, 1.2, -2), false, 1.45);
      const evs = drain();
      expect(evs.some((e) => e[1] === 'fk')).toBe(true);
      const fk = evs.find((e) => e[1] === 'fk')!;
      expect(fk[0]).toBe(1.25);
      expect(fk[2]).toBe(3); expect(fk[4]).toBe(-2);
      expect(fk[5]).toBe(0); expect(fk[6]).toBe(1.45);
      clearFx();
      playEvent(fk as any);
      expect(world.sparks.items.some((s) => s.active && s.kind === 2)).toBe(true);
      expect(world.dmgNums.items.some((d) => d.active && d.text.length > 0)).toBe(true);
    });
  });

  it('killing an enemy triggers funny pack on top of confetti', () => {
    sandbox((step) => {
      clearFx();
      const e = spawnEnemy('windup', 2, 2)!;
      e.spawnAnim = 0; e.hp = 1;
      damageEnemy(e, 999);
      expect(e.dead).toBe(true);
      expect(world.sparks.items.some((s) => s.active && s.kind === 2)).toBe(true);
      expect(world.sparks.items.some((s) => s.active && s.kind === 1)).toBe(true); // existing confetti
      expect(world.dmgNums.items.some((d) => d.active && (FUNNY_WORDS as readonly string[]).includes(d.text))).toBe(true);
      step(3);
    });
  });
});
