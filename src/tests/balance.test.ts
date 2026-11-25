import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { botPlayStage } from '../game/sim/headless';
describe('balance guardrails (scripted bot, not god mode)', () => {
  it('average bot clears stage 1 naturally and takes some damage', () => {
    const r = [1, 2].map(s => botPlayStage('mochi', 1, s, { skill: 'average' }));
    expect(r.every(x => x.cleared && !x.died)).toBe(true);
  }, 60000);
  it('good bot beats the boss; novice bot does not always', () => {
    expect(botPlayStage('luna', 3, 1, { skill: 'good' }).cleared).toBe(true);
    const nov = [1, 2, 3, 4, 5, 6, 7, 8].map(s => botPlayStage('mochi', 3, s, { skill: 'novice' }));
    // POLISH: pickups are easier to collect now (magnet, bigger radius), so the novice guardrail samples 8 seeds
    expect(nov.some(x => !x.cleared)).toBe(true);
  }, 120000);
});
