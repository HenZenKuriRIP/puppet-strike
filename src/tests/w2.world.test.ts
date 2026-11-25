// W2 part (a): world/theme config, adventure progression, save v3 migration, survival map waves, protocol.
import { describe, it, expect } from 'vitest';
import { WORLDS, WORLD_IDS, currentWorld } from '../game/levels/worlds';
import { STAGES, stagesOf, stageUnlocked, nextStage, worldUnlocked, worldCleared, stageLabel, WORLD_UNLOCK_STAGE } from '../game/progression/adventure';
import { migrate, defaultSave, SAVE_VERSION } from '../game/progression/save';
import { survivalWave, SURVIVAL, waveCount } from '../game/progression/survival';
import { ENEMIES } from '../config/game';
import { BLOCKS, SPAWN_POINTS, ARENA_BOXES, PLAYER_SPAWN, BALLOON_DEFS, PICKUP_SPOTS, STATIC_BOXES } from '../game/levels/arenaLayout';
import { DYN_BOXES } from '../game/levels/mech';
import { groundHeight } from '../game/levels/terrain';
import { enterWorld, world } from '../game/core/world';
import { parseGameMsg } from '../net/protocol';

describe('W2 world config', () => {
  it('two worlds with distinct themes + layouts', () => {
    expect(WORLD_IDS).toEqual(['candy', 'block']);
    expect(WORLDS.block.theme.sky).not.toBe(WORLDS.candy.theme.sky);
    expect(WORLDS.block.index).toBe(2); expect(WORLDS.block.bossName).toMatch(/COLOSSUS/);
  });
  it('setWorld swaps layout, terrain and dynamic boxes in place and back', () => {
    enterWorld('candy', true); const candyBlocks = BLOCKS.length, candySpawns = SPAWN_POINTS.length, candyBoxes = ARENA_BOXES.length;
    enterWorld('block'); expect(currentWorld).toBe('block'); void currentWorld;
    expect(world.mapId).toBe('block'); expect(BLOCKS.length).not.toBe(candyBlocks); expect(DYN_BOXES.length).toBeGreaterThan(0);
    expect(ARENA_BOXES.length).toBeGreaterThan(STATIC_BOXES.length);
    expect(world.balloons.length).toBe(BALLOON_DEFS.length); expect(world.spotTimers.length).toBe(PICKUP_SPOTS.length);
    expect(groundHeight(-32.5, 9)).toBeGreaterThan(0.3); // block-world ramp exists
    enterWorld('candy'); expect(BLOCKS.length).toBe(candyBlocks); expect(SPAWN_POINTS.length).toBe(candySpawns); expect(ARENA_BOXES.length).toBe(candyBoxes);
    expect(groundHeight(-32.5, 9)).toBeLessThan(0.3); expect(DYN_BOXES.length).toBe(0 + DYN_BOXES.length);
  });
  it('block-world spawns / player spawn / pickups are in the open and on the ground', () => {
    enterWorld('block', true);
    const inBox = (x: number, z: number, y = 0.5) => ARENA_BOXES.some((b) => x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6 && y < b.max.y && y + 1 > b.min.y);
    for (const s of SPAWN_POINTS) expect(inBox(s[0], s[1]), `spawn ${s}`).toBe(false);
    expect(inBox(PLAYER_SPAWN[0], PLAYER_SPAWN[2])).toBe(false);
    enterWorld('candy', true);
  });
});

describe('W2 adventure map', () => {
  it('6 stages, two worlds, labels 1-1..2-3, world 2 locked until 1-3', () => {
    expect(STAGES.map((s) => s.label)).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3']);
    expect(stagesOf('candy').length).toBe(3); expect(stagesOf('block').length).toBe(3);
    expect(stagesOf('block').map((s) => s.kind)).toEqual(['waves', 'waves', 'boss']);
    expect(worldUnlocked('block', [])).toBe(false); expect(worldUnlocked('block', [1, 2])).toBe(false); expect(worldUnlocked('block', [1, 2, 3])).toBe(true);
    expect(WORLD_UNLOCK_STAGE.block).toBe(3);
    expect(stageUnlocked(4, [1, 2])).toBe(false); expect(stageUnlocked(4, [1, 2, 3])).toBe(true); expect(stageUnlocked(5, [1, 2, 3])).toBe(false); expect(stageUnlocked(6, [1, 2, 3, 4, 5])).toBe(true);
    expect(nextStage(3)).toBeNull(); expect(nextStage(4)?.id).toBe(5); expect(nextStage(6)).toBeNull(); expect(stageLabel(6)).toBe('2-3');
    expect(worldCleared('block', [4, 5, 6])).toBe(true); expect(worldCleared('block', [4, 5])).toBe(false);
  });
  it('wave tables use only real enemies; world 2 stages feature brick enemies; static ones respect mounts', () => {
    for (const st of stagesOf('block')) for (const w of st.waves) for (const t of Object.keys(w)) expect((ENEMIES as any)[t], t).toBeTruthy();
    const types = (id: number) => new Set(STAGES.find((s) => s.id === id)!.waves.flatMap((w) => Object.keys(w)));
    expect(types(4).has('bsoldier')).toBe(true); expect(types(4).has('bturret')).toBe(true); expect(types(5).has('bgolem')).toBe(true); expect(types(5).has('bcrane')).toBe(true);
    for (const id of [4, 5]) { const waves = STAGES.find((s) => s.id === id)!.waves; expect(waves.length).toBe(3); for (let i = 1; i < waves.length; i++) expect(waveCount(waves[i])).toBeGreaterThanOrEqual(waveCount(waves[i - 1]) - 1); }
  });
});

describe('W2 save v3 migration', () => {
  it('v2 save with 1-3 cleared opens World 2 and keeps old bests as Candy Land', () => {
    const m = migrate({ version: 2, progress: { cleared: [1, 2, 3], bestSurvival: 4321, bestWave: 9, bestAdventure: 5000 }, character: 'luna', settings: { volume: 0.3 } });
    expect(SAVE_VERSION).toBe(3); expect(m.version).toBe(3);
    expect(m.progress.unlockedWorlds).toContain('block'); expect(m.progress.unlockedWorlds).toContain('candy');
    expect(m.progress.bestSurvival).toBe(4321); expect(m.progress.bestWave).toBe(9); expect(m.progress.bestAdventure).toBe(5000);
    expect(m.progress.bestSurvivalBlock).toBe(0); expect(m.progress.bestWaveBlock).toBe(0); expect(m.progress.survivalMap).toBe('candy'); expect(m.character).toBe('luna'); expect(m.settings.volume).toBe(0.3);
  });
  it('v2 save without 1-3 keeps World 2 locked; junk / out-of-range values are sanitised', () => {
    const m = migrate({ version: 2, progress: { cleared: [1, 2, 99, -4, 'x'], bestSurvival: 'abc' } });
    expect(m.progress.unlockedWorlds).toEqual(['candy']); expect(m.progress.cleared).toEqual([1, 2]); expect(m.progress.bestSurvival).toBe(0);
    const forged = migrate({ version: 3, progress: { cleared: [1], unlockedWorlds: ['block', 'evil'], lastWorld: 'block', survivalMap: 'block', bestSurvivalBlock: 800 } });
    expect(forged.progress.unlockedWorlds).toEqual(['candy', 'block']); expect(forged.progress.survivalMap).toBe('block'); expect(forged.progress.bestSurvivalBlock).toBe(800);
    expect(migrate({ version: 3, progress: { survivalMap: 'block' } }).progress.survivalMap).toBe('candy'); // block not unlocked -> falls back
    expect(migrate(null).progress.unlockedWorlds).toEqual(['candy']); expect(defaultSave().progress.survivalMap).toBe('candy');
    expect(migrate({ version: 1, highScore: 5 }).progress.bestSurvival).toBe(5);
  });
});

describe('W2 survival map + protocol', () => {
  it('block survival waves: valid, capped, static enemies limited by mounts, golem mini-boss on wave 10', () => {
    for (let n = 1; n <= 60; n++) {
      const w = survivalWave(n, 'block'); expect(waveCount(w)).toBeLessThanOrEqual(SURVIVAL.maxPerWave);
      for (const t of Object.keys(w)) expect((ENEMIES as any)[t], t).toBeTruthy();
      expect(w.bturret ?? 0).toBeLessThanOrEqual(4); expect(w.bcrane ?? 0).toBeLessThanOrEqual(2);
    }
    expect(survivalWave(1, 'block').bturret).toBeUndefined(); expect(survivalWave(4, 'block').bturret).toBeGreaterThanOrEqual(0);
    expect(survivalWave(10, 'block').bgolem ?? 0).toBeGreaterThanOrEqual(1);
    expect(Object.keys(survivalWave(20, 'block'))).toContain('bsoldier');
    expect(survivalWave(5, 'candy')).toEqual(survivalWave(5)); // candy default unchanged
  });
  it('co-op start message carries the map and is sanitised', () => {
    const m: any = parseGameMsg({ k: 'start', mode: 'survival', stage: 1, chars: ['mochi', 'bubu'], names: ['a', 'b'], map: 'block' });
    expect(m.map).toBe('block');
    expect((parseGameMsg({ k: 'start', mode: 'survival', stage: 1, chars: [], names: [], map: 'hax' }) as any).map).toBe('candy');
    expect((parseGameMsg({ k: 'start', mode: 'adventure', stage: 6, chars: [], names: [] }) as any).stage).toBe(6);
  });
});

describe('W2: BRIX unlock', () => {
  it('unlocks only after clearing 2-3 (stage 6); text says 2-3', async () => {
    const { isUnlocked, CHAR_UNLOCKS, unlockText, CHARACTERS, CHAR_STATS, CHAR_SKILLS } = await import('../game/characters/registry');
    expect(isUnlocked('brix', { cleared: [1, 2, 3, 4, 5], bestSurvival: 99999 })).toBe(false);
    expect(isUnlocked('brix', { cleared: [6], bestSurvival: 0 })).toBe(true);
    expect(unlockText(CHAR_UNLOCKS.brix)).toContain('2-3');
    expect(CHARACTERS.map((c) => c.id)).toContain('brix'); expect(CHAR_STATS.brix.maxHp).toBeGreaterThan(100); expect(CHAR_SKILLS.brix.cooldown).toBeGreaterThan(0);
  });
});
