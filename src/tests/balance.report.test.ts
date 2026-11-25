// Opt-in balance sweep: BALANCE=1 npx vitest run src/tests/balance.report.test.ts
// Writes docs/balance-data.json, consumed by docs/BALANCE_REPORT.md
import { it, vi } from 'vitest';
// @ts-ignore node builtin (no @types/node in this project)
import { writeFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { botPlayStage } from '../game/sim/headless';
it.runIf(process.env.BALANCE === '1')('balance sweep', () => {
  const out: any[] = [];
  for (const skill of ['novice', 'average', 'good'] as const)
    for (const ch of ['mochi', 'bubu', 'kiki', 'bolt', 'luna', 'poppy'] as const)
      for (const st of (process.env.BAL_STAGES ?? '1,2,3').split(',').map(Number)) for (const seed of [1, 2, 3, 4, 5, 6]) out.push({ skill, ch, st, ...botPlayStage(ch, st, seed, { skill }) });
  writeFileSync(process.env.BAL_OUT ?? 'docs/balance-data.json', JSON.stringify(out));
}, 1200000);
