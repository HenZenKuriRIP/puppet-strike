// M4 run flow: modes, stages, upgrade picks, results + save. (No dependency on simulation.ts.)
import { world, resetWorld, resetStageState, spawnEnemy, createRun, GameMode, resetBoss, setupSlots, enterWorld } from '../core/world';
import type { WorldId } from '../levels/worlds';
import type { InputLike } from '../core/input';
import { uiSet, snd } from './fx';
import type { EndResults } from '../../net/protocol';
import { computeMods as _cm } from '../progression/upgrades';
import { COOP } from '../../config/game';
import { coopHpMult } from '../progression/waveManager';
import { useUI } from '../../app/store';
import { CHAR_STATS, CHARACTERS, CharacterId, isUnlocked } from '../characters/registry';
import { addUpgrade, computeMods, rollChoices, UpgradeId } from '../progression/upgrades';
import { getStage, nextStage, STAGES } from '../progression/adventure';
import { survivalWave } from '../progression/survival';
import { createBoss } from '../boss/kingGummy';
import { COLOSSUS } from '../boss/colossus';
import { WEAPON_ORDER } from '../../config/game';
import { input } from '../core/input';
import { sfx } from '../../audio/sfx';
import { v3 } from '../core/math';

const lock = () => { const c = (globalThis as any).__canvas as HTMLCanvasElement | undefined; try { (c?.requestPointerLock() as any)?.catch?.(() => {}); } catch { /* ignore */ } };
const unlock = () => { try { (globalThis as any).document?.exitPointerLock?.(); } catch { /* */ } };
const banner = (text: string, ms = 2000) => { uiSet({ banner: text }); setTimeout(() => { if (useUI.getState().banner === text) uiSet({ banner: '' }); }, ms); };
/** net layer hooks (runFlow must not import the session): finish = co-op host sends the guest its results; pick = client forwards its upgrade choice */
export const runHooks = { finish: null as ((res: EndResults, slotRes: (i: number) => EndResults) => void) | null, pick: null as ((id: string) => void) | null };

/** apply character stats + upgrade mods to the player (keeps hp ratio unless heal) */
export function refreshPlayerStats(heal = false) {
  const p = world.player, st = CHAR_STATS[world.run.character], m = world.run.mods;
  const max = st.maxHp + m.maxHpBonus;
  p.hp = heal ? max : Math.min(max, p.hp + Math.max(0, max - p.maxHp)); p.maxHp = max;
  const rmax = st.rollCharges; if (p.rollCharges > rmax) p.rollCharges = rmax;
}

/** run something with `world.active` = slot i (runFlow has no dependency on simulation.ts) */
function withActive<T>(i: number, fn: () => T): T { const prev = world.active; world.active = i; try { return fn(); } finally { world.active = prev; } }
const multi = () => world.slots.length > 1;

/** co-op host: build both slots (slot 0 = host, slot 1 = remote) and begin the stage */
export function startCoopRun(mode: GameMode, chars: CharacterId[], names: string[], remoteInputs: (InputLike | null)[], stage = 1, map: WorldId = 'candy') {
  resetWorld(); enterWorld(mode === 'adventure' ? getStage(stage).world : map, true);
  setupSlots(chars, names, remoteInputs);
  world.coop.on = true; world.coop.host = true; world.coop.client = false;
  world.run = createRun(mode, chars[0], stage);
  world.slots.forEach((sl, i) => withActive(i, () => {
    const r = sl.run as any; r.character = chars[i]; r.stacks = {}; r.mods = _cm({}); r.taken = [];
    const st = CHAR_STATS[chars[i]];
    sl.player.arsenal.index = Math.min(WEAPON_ORDER.length - 1, st.startWeapon);
    sl.player.rollCharges = st.rollCharges;
    refreshPlayerStats(true);
  }));
  useUI.getState().set({ mode, stage, coop: true, coopOffer: false, netMsg: '' });
  beginStage(stage, true);
}

export function startRun(mode: GameMode, character: CharacterId, stage = 1, map: WorldId = 'candy') {
  unlockedAtRunStart = null;
  resetWorld(); enterWorld(mode === 'adventure' ? getStage(stage).world : map, true);
  world.run = createRun(mode, character, stage);
  const st = CHAR_STATS[character];
  world.player.arsenal.index = Math.min(WEAPON_ORDER.length - 1, st.startWeapon);
  world.player.rollCharges = st.rollCharges;
  refreshPlayerStats(true);
  useUI.getState().set({ mode, stage });
  beginStage(stage, true);
}

export function beginStage(stage: number, first = false) {
  resetStageState();
  const r = world.run; r.stage = stage; r.stageClear = false;
  if (multi()) world.slots.forEach((sl) => { const p = sl.player; if (!sl.connected) return; if (p.dead) { p.dead = false; p.hp = Math.round(p.maxHp * 0.6); p.invuln = 2.5; p.revive = 0; } else p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25); });
  if (r.mode === 'survival') {
    r.waveDefs = [survivalWave(1, world.mapId), survivalWave(2, world.mapId)];
    uiSet({ totalWaves: 0 });
    if (first) banner(world.mapId === 'block' ? '玩具生存 · 积木都市 TOY SURVIVAL' : '玩具生存 TOY SURVIVAL', 2200);
  } else {
    const sd = getStage(stage);
    r.waveDefs = sd.waves.slice();
    uiSet({ stage, totalWaves: sd.waves.length, boss: null });
    if (sd.kind === 'boss') {
      world.waves.phase = 'complete';
      resetBoss(); const colo = sd.world === 'block';
      world.boss.s = colo ? createBoss(COLOSSUS, 'colossus') : createBoss();
      const k = spawnEnemy(colo ? 'colossus' : 'king', 0, -8);
      if (k) { world.boss.id = k.id; k.facing = 0; if (multi()) k.hp = k.maxHp = Math.round(k.maxHp * (1 + (coopHpMult(world.slots.length) - 1) * 1.4)); }
      world.cinematic = world.boss.s.intro;
      world.slots.forEach((sl, i) => { const p = sl.player, x = multi() ? (i ? 2.6 : -2.6) : 0; p.pos.x = x; p.pos.y = 0; p.pos.z = 8; p.prev.x = x; p.prev.z = 8; p.yaw = 0; p.pitch = 0.05; });
      uiSet({ callout: { text: colo ? '🧱 BRICK COLOSSUS 积木巨像 登场！' : '👑 KING GUMMY 软糖国王 登场！', tier: 4, key: performance.now() } });
      snd.wave();
    }
    banner(`${sd.label} ${sd.nameZh} · ${sd.name}`, 2400);
  }
  uiSet({ fade: performance.now() });
}

export function requestUpgrade(reason: 'wave' | 'stage') {
  if (multi()) { // co-op: per-player offers, the sim keeps running (phase stays 'playing')
    let any = false;
    world.slots.forEach((sl, i) => {
      const ch = rollChoices(sl.run.stacks, 3);
      if (!ch.length) { sl.offer = null; sl.picked = true; return; }
      sl.offer = { ids: ch.map((c) => c.id), reason, t: COOP.upgradeTimeout }; sl.picked = false; any = true;
      uiSet({ upgradeChoices: sl.offer.ids, upgradeReason: reason, coopOffer: true }, i);
    });
    offerReason = reason;
    if (!any) finishOffers();
    return;
  }
  const choices = rollChoices(world.run.stacks, 3);
  if (!choices.length) { continueAfterUpgrade(reason); return; }
  input.reset(); unlock();
  useUI.getState().set({ phase: 'upgrade', upgradeChoices: choices.map((c) => c.id), upgradeReason: reason });
}
let offerReason: 'wave' | 'stage' = 'wave';
function finishOffers() {
  if (world.slots.some((sl) => sl.offer)) return;
  if (offerReason === 'stage') { const n = nextStage(world.run.stage); if (n) beginStage(n.id); }
  offerReason = 'wave';
}
/** co-op: slot `i` picks upgrade `id` (host-side; also used by the auto-pick timeout) */
export function chooseUpgradeFor(i: number, id: UpgradeId) {
  const sl = world.slots[i]; if (!sl || !sl.offer || !sl.offer.ids.includes(id)) return;
  withActive(i, () => {
    if (addUpgrade(world.run.stacks, id)) { world.run.taken.push(id); world.run.mods = computeMods(world.run.stacks); refreshPlayerStats(id === 'vitality'); }
  });
  sl.offer = null; sl.picked = true;
  uiSet({ upgradeChoices: [], coopOffer: false }, i);
  finishOffers();
}
export function stepOffers(dt: number) {
  for (let i = 0; i < world.slots.length; i++) {
    const sl = world.slots[i]; if (!sl.offer) continue;
    sl.offer.t -= dt;
    if (sl.offer.t <= 0 || !sl.connected) chooseUpgradeFor(i, sl.offer.ids[0]);
  }
}
export function chooseUpgrade(id: UpgradeId) {
  const ui = useUI.getState();
  if (world.coop.client) { runHooks.pick?.(id); return; }
  if (multi()) { if (world.slots[world.local]?.offer) chooseUpgradeFor(world.local, id); return; }
  if (ui.phase !== 'upgrade') return;
  if (addUpgrade(world.run.stacks, id)) {
    world.run.taken.push(id); world.run.mods = computeMods(world.run.stacks);
    refreshPlayerStats(id === 'vitality');
    sfx.combo(3);
  }
  continueAfterUpgrade(ui.upgradeReason as 'wave' | 'stage');
}
function continueAfterUpgrade(reason: 'wave' | 'stage') {
  if (reason === 'stage') { const n = nextStage(world.run.stage); if (n) beginStage(n.id); }
  input.reset(); useUI.getState().set({ phase: 'playing', upgradeChoices: [] }); lock();
}

/** characters that were already unlocked when this run's first stage was cleared (stage clears persist before finishRun, so without this a stage-unlock would never be reported on the results screen) */
let unlockedAtRunStart: CharacterId[] | null = null;
/** adventure stage cleared (called from sim) */
export function stageCleared() {
  const r = world.run; if (r.stageClear) return; r.stageClear = true;
  if (!unlockedAtRunStart) unlockedAtRunStart = CHARACTERS.filter((c) => isUnlocked(c.id, useUI.getState().save.progress)).map((c) => c.id);
  useUI.getState().persist((s) => {
    if (!s.progress.cleared.includes(r.stage)) s.progress.cleared.push(r.stage);
    if (r.stage === 3 && !s.progress.unlockedWorlds.includes('block')) s.progress.unlockedWorlds.push('block'); // clearing 1-3 opens World 2
    s.progress.lastWorld = world.mapId;
  });
  if (multi()) snd.wave(); else sfx.win();
  banner('关卡完成！STAGE CLEAR!', 1800);
  const last = !nextStage(r.stage);
  setTimeout(() => {
    const ph = useUI.getState().phase; if (ph !== 'playing' && !(multi() && ph === 'paused')) return;
    if (last) finishRun(true); else requestUpgrade('stage');
  }, 1800);
}

export function finishRun(won: boolean) {
  const ui = useUI.getState(); const r = world.run;
  const before = ui.save.progress;
  const prevUnlocked = unlockedAtRunStart ?? CHARACTERS.filter((c) => isUnlocked(c.id, before)).map((c) => c.id); unlockedAtRunStart = null;
  const blk = world.mapId === 'block';
  const best = r.mode === 'survival' ? (blk ? before.bestSurvivalBlock : before.bestSurvival) : before.bestAdventure;
  const wave = Math.max(0, world.waves.index) + 1;
  ui.persist((s) => {
    if (r.mode === 'survival' && blk) { s.progress.bestSurvivalBlock = Math.max(s.progress.bestSurvivalBlock, world.score); s.progress.bestWaveBlock = Math.max(s.progress.bestWaveBlock, wave); }
    else if (r.mode === 'survival') { s.progress.bestSurvival = Math.max(s.progress.bestSurvival, world.score); s.progress.bestWave = Math.max(s.progress.bestWave, wave); }
    else s.progress.bestAdventure = Math.max(s.progress.bestAdventure, world.score);
  });
  const after = useUI.getState().save.progress;
  const unlocked = CHARACTERS.filter((c) => isUnlocked(c.id, after) && !prevUnlocked.includes(c.id)).map((c) => c.id);
  const slotRes = (i: number): EndResults => { const sl = world.slots[i] ?? world.slots[0]; return { won, mode: r.mode, stage: r.stage, score: world.score, kills: world.kills, maxCombo: r.maxCombo, time: r.time, wave, upgrades: sl.run.taken.slice(), character: sl.run.character }; };
  if (multi()) runHooks.finish?.(slotRes(0), slotRes);
  unlock();
  useUI.getState().set({
    phase: 'results', boss: null,
    results: { won, mode: r.mode, stage: r.stage, score: world.score, kills: world.kills, maxCombo: r.maxCombo, time: r.time, wave,
      upgrades: r.taken.slice(), newBest: world.score > best, unlocked, character: r.character },
  });
}
export { STAGES, v3 };
/** apply an upgrade without touching UI flow (headless balance sims: "carried over" upgrades) */
export function chooseUpgradeDirect(id: UpgradeId) {
  if (addUpgrade(world.run.stacks, id)) { world.run.taken.push(id); world.run.mods = computeMods(world.run.stacks); refreshPlayerStats(id === 'vitality'); }
}
