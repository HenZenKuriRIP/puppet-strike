import { describe, it, expect } from 'vitest';
import { QUALITY, QUALITY_ORDER } from '../config/quality';
import { CHARACTERS, getCharacter } from '../game/characters/registry';
import { HITSTOP, ADS, CAMERA } from '../config/game';

describe('quality presets', () => {
  it('has low/medium/high in order', () => expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high']));
  it('costs increase monotonically', () => {
    const [l, m, h] = QUALITY_ORDER.map((q) => QUALITY[q]);
    expect(l.dpr[1]).toBeLessThanOrEqual(m.dpr[1]); expect(m.dpr[1]).toBeLessThanOrEqual(h.dpr[1]);
    expect(l.decorDensity).toBeLessThan(m.decorDensity); expect(m.decorDensity).toBeLessThanOrEqual(h.decorDensity);
    expect(m.shadowMapSize).toBeLessThanOrEqual(h.shadowMapSize);
  });
  it('low disables shadows and post FX; high enables bloom+AO', () => {
    expect(QUALITY.low.shadows).toBe(false); expect(QUALITY.low.postFX).toBe(false);
    expect(QUALITY.high.bloom && QUALITY.high.ao && QUALITY.high.postFX).toBe(true);
  });
  it('sub-effects require postFX', () => {
    for (const q of QUALITY_ORDER) {
      const p = QUALITY[q];
      if (!p.postFX) expect(p.bloom || p.ao || p.vignette || p.chromaticAberration || p.smaa).toBe(false);
    }
  });
  it('high-only extras stay off on medium/low for mid-device safety', () => {
    expect(QUALITY.high.chromaticAberration && QUALITY.high.smaa && QUALITY.high.bloom).toBe(true);
    expect(QUALITY.medium.bloom || QUALITY.medium.ao || QUALITY.medium.chromaticAberration || QUALITY.medium.smaa).toBe(false);
    expect(QUALITY.low.contactShadows).toBe(false);
    expect(QUALITY.high.exposure).toBeGreaterThanOrEqual(1.05);
    expect(QUALITY.high.exposure).toBeLessThanOrEqual(1.2);
  });
});

describe('character registry', () => {
  it('has 7 unique characters (6 + World-2 reward BRIX)', () => {
    expect(CHARACTERS).toHaveLength(7);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(7);
    expect(CHARACTERS.map((c) => c.id)).toEqual(['mochi', 'bubu', 'kiki', 'bolt', 'luna', 'poppy', 'brix']);
  });
  it('mochi is the default, others honestly flagged cosmetic-only', () => {
    expect(getCharacter('mochi').cosmeticOnly).toBe(false);
    CHARACTERS.forEach((c) => expect(c.cosmeticOnly).toBe(false)); // M4: all characters are real
  });
  it('every character has full colors and names', () => {
    for (const c of CHARACTERS) {
      for (const k of ['body', 'belly', 'accent', 'eye', 'cheek'] as const) expect(c.colors[k]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.name.length).toBeGreaterThan(0); expect(c.nameZh.length).toBeGreaterThan(0);
    }
  });
  it('unknown id falls back to mochi', () => expect(getCharacter('nope' as any).id).toBe('mochi'));
});

describe('feel tuning', () => {
  it('hit-stop is short and capped', () => { expect(HITSTOP.max).toBeLessThanOrEqual(0.1); expect(HITSTOP.critKill).toBeLessThanOrEqual(HITSTOP.max); });
  it('ADS zooms in and slows sensitivity', () => { expect(ADS.fov).toBeLessThan(CAMERA.fov); expect(ADS.sensMult).toBeLessThan(1); expect(ADS.spreadMult).toBeLessThan(1); });
});

import { vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, resetWorld, spawnEnemy } from '../game/core/world';
import { explode } from '../game/systems/simulation';

describe('M3 FX hooks (sim side)', () => {
  it('explosion kill triggers hit-stop, confetti and a shockwave ring', () => {
    resetWorld();
    const e = spawnEnemy('windup', 0, 0)!; e.hp = 1;
    explode({ x: 0, y: 0.5, z: 0 }, 3, 50, 2, 0);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(world.hitStop).toBeGreaterThan(0); expect(world.hitStop).toBeLessThanOrEqual(HITSTOP.max);
    expect(world.sparks.items.some((s) => s.active && s.kind === 1)).toBe(true);
    expect(world.blastFx.items.some((b) => b.active && b.ring)).toBe(true);
  });
});
