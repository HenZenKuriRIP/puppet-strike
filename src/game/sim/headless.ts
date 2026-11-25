// M5: headless runner — the real stepSim + runFlow, a virtual clock for setTimeout, a seeded RNG,
// and the camera computed exactly like GameCanvas does. Used by Vitest balance/collision tests and scripts.
import { SIM } from '../../config/game';
import { world } from '../core/world';
import { input } from '../core/input';
import { computeCamera } from '../camera/cameraRig';
import { stepSim } from '../systems/simulation';
import * as runFlow from '../systems/runFlow';
import { useUI } from '../../app/store';
import { CharacterId } from '../characters/registry';
import { botStep, createBot, BotOpts, BOT_SKILL } from './bot';

export const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Virtual timers so runFlow's setTimeout-based transitions advance with sim time. */
export function withVirtualTime<T>(fn: (advance: (ms: number) => void) => T): T {
  const q: { at: number; f: () => void }[] = []; let now = 0;
  const realST = globalThis.setTimeout;
  (globalThis as any).setTimeout = (f: () => void, ms = 0) => { q.push({ at: now + ms, f }); return q.length as any; };
  const advance = (ms: number) => { now += ms; for (;;) { q.sort((a, b) => a.at - b.at); if (!q.length || q[0].at > now) break; q.shift()!.f(); } };
  try { return fn(advance); } finally { (globalThis as any).setTimeout = realST; }
}
export function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random; Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = real; }
}

export function tick(advance: (ms: number) => void) {
  const p = world.player;
  const c = computeCamera(p.pos, p.yaw, p.pitch, world.raycast);
  world.cam.pos = c.pos; world.cam.fwd = c.fwd;
  stepSim(SIM.fixedDt);
  world.hitStop = 0;
  advance(SIM.fixedDt * 1000);
}

export interface RunStats { character: CharacterId; stage: number; seed: number; cleared: boolean; died: boolean; time: number; damageTaken: number; hits: number; hpLeft: number; kills: number; skillUses: number; bossPhase?: number; bossHpFrac?: number }

/** Bot plays one adventure stage start-to-finish (or until death / timeout). Upgrade picks: first card (seeded). */
export function botPlayStage(character: CharacterId, stage: number, seed: number, opts: BotOpts & { maxTime?: number; upgrades?: number; skill?: keyof typeof BOT_SKILL } = {}): RunStats {
  return withSeed(seed, () => withVirtualTime((advance) => {
    input.reset();
    useUI.getState().set({ character } as any);
    runFlow.startRun('adventure', character, stage);
    const autoResolve = () => {
      const ui = useUI.getState();
      if (ui.phase !== 'upgrade' && !(world.slots[world.local]?.offer)) return false;
      if (ui.upgradeReason === 'stage') return false;
      // Mid-wave / start offers must not stall the bot, but also must not grant free power
      // that would invalidate the scripted balance tests.
      runFlow.chooseUpgrade(OFFER_SKIP); return true;
    };
    while (autoResolve()) { /* start / leftover offer */ }
    useUI.getState().set({ phase: 'playing' } as any);
    // simulate the upgrades a player would have collected on earlier stages
    for (let i = 0; i < (opts.upgrades ?? (stage - 1) * 1); i++) { const ch = runFlowRoll(); if (ch) runFlow.chooseUpgradeDirect(ch); }
    const b = createBot(); const maxT = opts.maxTime ?? 300;
    let dmg = 0, lastHp = world.player.hp + world.shield.hp, t = 0;
    const startStage = stage;
    while (t < maxT) {
      const ui = useUI.getState();
      if (ui.phase === 'results') break;
      if (ui.phase === 'upgrade') {
        if (ui.upgradeReason === 'stage') break; // stage cleared -> pick screen
        autoResolve();
        continue;
      }
      botStep(b, SIM.fixedDt, { ...BOT_SKILL[opts.skill ?? 'average'], ...opts, rand: Math.random });
      tick(advance); t += SIM.fixedDt;
      const hp = world.player.hp + world.shield.hp; if (hp < lastHp) dmg += lastHp - hp; lastHp = hp;
      if (world.player.dead) { advance(3000); break; }
    }
    const ui = useUI.getState();
    const king = world.boss.id >= 0 ? world.enemies.items[world.boss.id] : null;
    const res: RunStats = { character, stage: startStage, seed, cleared: world.run.stageClear && !world.player.dead, died: world.player.dead, time: +t.toFixed(1),
      damageTaken: Math.round(world.stats.damageTaken), hits: world.stats.hitsTaken, hpLeft: Math.round(world.player.hp), kills: world.kills, skillUses: world.stats.skillCasts };
    if (getStageKind(startStage) === 'boss' && king) { res.bossPhase = world.boss.s.phase; res.bossHpFrac = +(Math.max(0, king.hp) / king.maxHp).toFixed(2); }
    void ui; input.reset();
    return res;
  }));
}
import { rollChoices, OFFER_SKIP } from '../progression/upgrades';
import { getStage } from '../progression/adventure';
const getStageKind = (id: number) => getStage(id).kind;
const runFlowRoll = () => rollChoices(world.run.stacks, 3)[0]?.id;
