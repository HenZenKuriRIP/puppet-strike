import { describe, it, expect } from 'vitest';
import { UPGRADES, RARITY, PERF_CAPS, rollChoices, upgradeWeight, isEligible, addUpgrade, computeMods, getUpgrade, Stacks } from '../game/progression/upgrades';
import { migrate, loadSave, writeSave, resetSave, SAVE_VERSION, SAVE_KEY, defaultSave, KV } from '../game/progression/save';
import { CHARACTERS, CHAR_STATS, CHAR_SKILLS, CHAR_UNLOCKS, isUnlocked } from '../game/characters/registry';
import { KING, createBoss, stepBoss, phaseFor, bossInvulnerable } from '../game/boss/kingGummy';
import { survivalWave, survivalHpMult, survivalDmgMult, waveCount, isUpgradeWave, SURVIVAL } from '../game/progression/survival';
import { STAGES, stageUnlocked, nextStage } from '../game/progression/adventure';

const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('upgrade registry', () => {
  it('has ~15+ unique upgrades with all rarities', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
    for (const r of Object.keys(RARITY)) expect(UPGRADES.some((u) => u.rarity === r)).toBe(true);
  });
  it('rolls 3 distinct choices, weights follow rarity', () => {
    const rng = seeded(7); const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const c = rollChoices({}, 3, rng); expect(new Set(c.map((x) => x.id)).size).toBe(3); counts[c[0].rarity] = (counts[c[0].rarity] ?? 0) + 1; }
    expect(counts.common).toBeGreaterThan(counts.rare); expect(counts.rare).toBeGreaterThan(counts.epic); expect(counts.epic).toBeGreaterThan(counts.legendary ?? 0);
  });
  it('enforces caps (maxStacks + perf caps)', () => {
    const st: Stacks = {};
    for (let i = 0; i < 10; i++) addUpgrade(st, 'multishot');
    expect(st.multishot).toBe(getUpgrade('multishot').maxStacks);
    expect(isEligible(getUpgrade('multishot'), st)).toBe(false);
    expect(rollChoices(st, 3, seeded(3)).some((u) => u.id === 'multishot')).toBe(false);
    const m = computeMods({ multishot: 99, lightning: 99, bounce: 99, split: 99 });
    expect(m.extraProjectiles).toBe(PERF_CAPS.extraProjectiles); expect(m.chainTargets).toBe(PERF_CAPS.chainTargets);
    expect(m.bounces).toBe(PERF_CAPS.bounces); expect(m.splitShards).toBe(PERF_CAPS.splitShards);
  });
  it('synergy: Storm Core requires lightning + infusion and is boosted once eligible', () => {
    const storm = getUpgrade('stormCore');
    expect(upgradeWeight(storm, {})).toBe(0); expect(upgradeWeight(storm, { lightning: 1 })).toBe(0);
    expect(upgradeWeight(storm, { lightning: 1, infusion: 1 })).toBe(RARITY.legendary.weight * 3);
    expect(computeMods({ lightning: 1, infusion: 1 }).chainChance).toBeLessThan(1);
    const m = computeMods({ lightning: 1, infusion: 1, stormCore: 1 });
    expect(m.chainChance).toBe(1); expect(m.burnDps).toBeGreaterThan(computeMods({ infusion: 1 }).burnDps);
  });
  it('mods stack multiplicatively/additively as described', () => {
    expect(computeMods({}).damage).toBe(1);
    expect(computeMods({ power: 2 }).damage).toBeCloseTo(1.24);
    expect(computeMods({ skillCd: 2 }).skillCdMult).toBeCloseTo(0.7225);
    expect(computeMods({ vitality: 2 }).maxHpBonus).toBe(50);
  });
});

describe('save / load / migration', () => {
  it('round-trips and versions', () => {
    const kv = mem(); const d = defaultSave(); d.progress.cleared = [1]; d.progress.bestSurvival = 1234; d.character = 'bubu';
    writeSave(d, kv); const l = loadSave(kv);
    expect(l.version).toBe(SAVE_VERSION); expect(l.progress.cleared).toEqual([1]); expect(l.progress.bestSurvival).toBe(1234); expect(l.character).toBe('bubu');
  });
  it('migrates v1 (highScore) and survives junk', () => {
    const m = migrate({ version: 1, highScore: 777, settings: { volume: 0.2 } });
    expect(m.version).toBe(SAVE_VERSION); expect(m.progress.bestSurvival).toBe(777); expect(m.settings.volume).toBe(0.2);
    const kv = mem(); kv.setItem(SAVE_KEY, '{not json'); expect(loadSave(kv).progress.cleared).toEqual([]);
    expect(migrate({ version: 2, progress: { cleared: [1, 'x', -1, 2.5, 2, 2] } }).progress.cleared).toEqual([1, 2]);
  });
  it('reset clears storage', () => {
    const kv = mem(); writeSave({ ...defaultSave(), character: 'kiki' }, kv); const r = resetSave(kv);
    expect(kv.m.has(SAVE_KEY)).toBe(false); expect(r.character).toBe('mochi');
  });
});

describe('characters', () => {
  it('every character has stats + unique skill', () => {
    const ids = new Set(CHARACTERS.map((c) => CHAR_SKILLS[c.id].id)); expect(ids.size).toBe(6);
    for (const c of CHARACTERS) { expect(CHAR_STATS[c.id].maxHp).toBeGreaterThan(0); expect(CHAR_SKILLS[c.id].cooldown).toBeGreaterThan(0); expect(c.cosmeticOnly).toBe(false); }
  });
  it('role differences', () => {
    expect(CHAR_STATS.bubu.maxHp).toBeGreaterThan(Math.max(...CHARACTERS.filter((c) => c.id !== 'bubu').map((c) => CHAR_STATS[c.id].maxHp)));
    expect(CHAR_STATS.kiki.rollCharges).toBeGreaterThan(1);
    expect(CHAR_SKILLS.luna.params.damage).toBeGreaterThan(100);
    expect(CHAR_SKILLS.poppy.params.radius).toBeGreaterThan(0);
  });
  it('unlocks: MOCHI+BUBU start, others by stage/score', () => {
    const p0 = { cleared: [] as number[], bestSurvival: 0 };
    expect(CHARACTERS.filter((c) => isUnlocked(c.id, p0)).map((c) => c.id).sort()).toEqual(['bubu', 'mochi']);
    expect(isUnlocked('kiki', { cleared: [1], bestSurvival: 0 })).toBe(true);
    expect(isUnlocked('luna', { cleared: [1, 2, 3], bestSurvival: 0 })).toBe(true);
    const u = CHAR_UNLOCKS.poppy; expect(u.kind).toBe('score');
    if (u.kind === 'score') expect(isUnlocked('poppy', { cleared: [], bestSurvival: u.score })).toBe(true);
  });
});

describe('boss KING GUMMY', () => {
  const run = (s: ReturnType<typeof createBoss>, hp: number, t: number) => { const evs = []; for (let i = 0; i < t * 60; i++) evs.push(stepBoss(s, hp, 1 / 60)); return evs; };
  it('intro is invulnerable then attacks with telegraph first', () => {
    const s = createBoss(); expect(bossInvulnerable(s)).toBe(true);
    const evs = run(s, 1, KING.introTime + 4);
    expect(bossInvulnerable(s)).toBe(false);
    const ti = evs.findIndex((e) => e.telegraph), ai = evs.findIndex((e) => e.attack);
    expect(ti).toBeGreaterThan(0); expect(ai).toBeGreaterThan(ti); expect(evs[ai].attack).toBe(evs[ti].telegraph);
  });
  it('phase transitions at thresholds, only forward, invulnerable during transition', () => {
    expect(phaseFor(1)).toBe(1); expect(phaseFor(0.6)).toBe(2); expect(phaseFor(0.2)).toBe(3);
    const s = createBoss(); run(s, 1, KING.introTime + 0.1);
    const e = stepBoss(s, 0.5, 1 / 60); expect(e.phaseChanged).toBe(2); expect(bossInvulnerable(s)).toBe(true);
    run(s, 0.9, KING.transitionTime + 0.2); expect(s.phase).toBe(2); // no regression on heal
    expect(run(s, 0.3, 0.1).some((x) => x.phaseChanged === 3)).toBe(true);
    run(s, 0.3, KING.transitionTime + 6);
    const att = run(s, 0.3, 20).map((x) => x.attack).filter(Boolean);
    expect(att).toContain('slam'); expect(att).toContain('hazard');
  });
  it('phase 2 summons, defeated at 0 hp', () => {
    const s = createBoss(); run(s, 1, KING.introTime + 0.1); run(s, 0.5, KING.transitionTime + 0.1);
    expect(run(s, 0.5, 15).some((x) => x.attack === 'summon')).toBe(true);
    expect(stepBoss(s, 0, 1 / 60).defeated).toBe(true);
  });
});

describe('survival scaling + adventure', () => {
  it('waves grow, cap, and add enemy types', () => {
    expect(waveCount(survivalWave(10))).toBeGreaterThan(waveCount(survivalWave(1)));
    expect(waveCount(survivalWave(200))).toBeLessThanOrEqual(SURVIVAL.maxPerWave);
    expect(survivalWave(1).tank).toBeUndefined(); expect(Object.keys(survivalWave(8)).length).toBeGreaterThan(Object.keys(survivalWave(1)).length);
    expect(survivalHpMult(1)).toBe(1); expect(survivalHpMult(10)).toBeGreaterThan(1); expect(survivalHpMult(999)).toBe(SURVIVAL.maxHpMult);
    expect(survivalDmgMult(999)).toBe(SURVIVAL.maxDmgMult);
  });
  it('upgrade every 3 waves', () => { expect([1, 2, 3, 4, 5, 6].filter(isUpgradeWave)).toEqual([3, 6]); });
  it('adventure: 3 stages, last is boss, sequential unlock', () => {
    expect(STAGES.length).toBe(6); expect(STAGES[2].kind).toBe('boss'); expect(STAGES[5].kind).toBe('boss');
    expect(stageUnlocked(2, [])).toBe(false); expect(stageUnlocked(2, [1])).toBe(true); expect(nextStage(3)).toBeNull();
  });
});
