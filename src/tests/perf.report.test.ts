// Opt-in headless CPU profile: PERF=1 npx vitest run src/tests/perf.report.test.ts  → docs/perf-sim.json
import { it, vi, expect } from 'vitest';
// @ts-ignore node builtin
import { writeFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { botStep, createBot, BOT_SKILL } from '../game/sim/bot';
import { SIM, POOLS } from '../config/game';
import { v3 } from '../game/core/math';
import { SPAWN_POINTS } from '../game/levels/arenaLayout';
import { buildSnapshot } from '../net/snapshot';

function scenario(name: string, setup: () => void, refill: () => void, frames = 1200) {
  return withSeed(5, () => withVirtualTime((adv) => {
    input.reset(); useUI.getState().set({ character: 'poppy' } as any);
    runFlow.startRun('survival', 'poppy'); useUI.getState().set({ phase: 'playing' } as any);
    setup(); const b = createBot(); const t: number[] = [];
    for (let i = 0; i < frames; i++) {
      refill(); world.player.invuln = 9; world.player.hp = world.player.maxHp;
      botStep(b, SIM.fixedDt, { ...BOT_SKILL.good, rand: Math.random });
      const t0 = performance.now(); tick(adv); t.push(performance.now() - t0);
    }
    t.sort((a, z) => a - z);
    return { name, frames, meanMs: +(t.reduce((a, z) => a + z, 0) / t.length).toFixed(4), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(4), maxMs: +t[t.length - 1].toFixed(3),
      enemies: world.enemies.countActive(), projectiles: world.projectiles.countActive(), sparks: world.sparks.countActive(), hazards: world.hazards.length };
  }));
}

/** M6: 2-player co-op host sim with a tank-heavy horde; also times buildSnapshot (30 Hz in game) and reports its JSON size. */
function coopScenario(name: string, frames = 1200) {
  return withSeed(5, () => withVirtualTime((adv) => {
    input.reset();
    runFlow.startCoopRun('survival', ['mochi', 'poppy'], ['Host', 'Guest'], [null, null] as any, 1); useUI.getState().set({ phase: 'playing' } as any); world.cinematic = 0;
    const kinds = ['gumdrop', 'choco', 'lolli', 'mint', 'jelly', 'windup', 'gunner', 'drone', 'mega'] as const;
    const b = createBot(); const t: number[] = [], sn: number[] = []; let bytes = 0, n = 0;
    for (let i = 0; i < frames; i++) {
      while (world.enemies.countActive() < 40) { const [x, z] = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]; if (!spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], x, z)) break; }
      for (const sl of world.slots) { sl.player.invuln = 9; sl.player.hp = sl.player.maxHp; }
      botStep(b, SIM.fixedDt, { ...BOT_SKILL.good, rand: Math.random });
      const t0 = performance.now(); tick(adv); t.push(performance.now() - t0);
      if (i % 2 === 0) { const s0 = performance.now(); const w = buildSnapshot(i); sn.push(performance.now() - s0); if (i % 60 === 0) { bytes += JSON.stringify(w).length; n++; } }
    }
    t.sort((a, z) => a - z); sn.sort((a, z) => a - z);
    return { name, players: world.slots.length, frames, meanMs: +(t.reduce((a, z) => a + z, 0) / t.length).toFixed(4), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(4), maxMs: +t[t.length - 1].toFixed(3),
      snapshotMeanMs: +(sn.reduce((a, z) => a + z, 0) / sn.length).toFixed(4), snapshotP95Ms: +sn[Math.floor(sn.length * 0.95)].toFixed(4), snapshotAvgBytes: Math.round(bytes / n),
      enemies: world.enemies.countActive(), projectiles: world.projectiles.countActive(), sparks: world.sparks.countActive(), hazards: world.hazards.length };
  }));
}
it.runIf(process.env.PERF === '1')('sim perf', () => {
  const fill = () => {
    while (world.enemies.countActive() < POOLS.enemies) { const [x, z] = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]; spawnEnemy((['windup', 'gunner', 'bunny', 'drone', 'tank'] as const)[Math.floor(Math.random() * 5)], x, z); }
    while (world.projectiles.countActive() < POOLS.projectiles) { const pr = world.projectiles.spawn(); if (!pr) break; pr.pos = v3((Math.random() - .5) * 36, 1, (Math.random() - .5) * 36); pr.vel = v3((Math.random() - .5) * 20, 0, (Math.random() - .5) * 20); pr.life = 2; pr.damage = 0; pr.size = 0.4; pr.color = '#fff'; }
    while (world.sparks.countActive() < POOLS.sparks) { const s = world.sparks.spawn(); if (!s) break; s.pos = v3(0, 2, 0); s.vel = v3(Math.random() - .5, 3, Math.random() - .5); s.life = 1; (s as any).maxLife = 1; }
  };
  const res = [
    scenario('idle arena (bot, survival wave 1)', () => {}, () => {}),
    scenario('stress: 20 enemies + 200 projectiles + 500 sparks (pools full every frame)', () => {}, fill),
    coopScenario('M6 co-op: 2 players + 40 candy-tank/classic enemies (host sim + snapshot build)'),
  ];
  writeFileSync('docs/perf-sim.json', JSON.stringify(res, null, 1)); console.log(res);
  expect(res[1].meanMs).toBeLessThan(16);
}, 120000);
