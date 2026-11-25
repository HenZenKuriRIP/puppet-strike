import { COMBO } from '../../config/game';

export interface ComboState { count: number; timer: number; tier: number; best: number; regenUsed: number }
export type ComboCfg = typeof COMBO;
export const createCombo = (): ComboState => ({ count: 0, timer: 0, tier: 0, best: 0, regenUsed: 0 });

export function tierFor(count: number, thresholds: number[]): number {
  let t = 0; for (let i = 0; i < thresholds.length; i++) if (count >= thresholds[i]) t = i + 1; return t;
}
export const multiplierFor = (tier: number, cfg: ComboCfg) => Math.min(cfg.maxMultiplier, cfg.multipliers[Math.min(tier, cfg.multipliers.length - 1)]);

export interface ComboKill { tierUp: boolean; tier: number; multiplier: number; regen: number; heal: number }
/** Register a kill inside the chain window. Multiplier and regen are capped. */
export function comboKill(s: ComboState, cfg: ComboCfg = COMBO): ComboKill {
  if (s.timer <= 0) { s.count = 0; s.tier = 0; s.regenUsed = 0; }
  s.count++; s.timer = cfg.window; s.best = Math.max(s.best, s.count);
  const tier = tierFor(s.count, cfg.thresholds);
  const tierUp = tier > s.tier; s.tier = tier;
  const want = cfg.cooldownRegen[Math.min(tier, cfg.cooldownRegen.length - 1)];
  const regen = Math.max(0, Math.min(want, cfg.regenCapPerChain - s.regenUsed));
  s.regenUsed += regen;
  return { tierUp, tier, multiplier: multiplierFor(tier, cfg), regen, heal: tierUp ? cfg.healOnTierUp : 0 };
}
/** returns true when the chain just expired */
export function stepCombo(s: ComboState, dt: number): boolean {
  if (s.timer <= 0) return false;
  s.timer -= dt;
  if (s.timer <= 0) { s.timer = 0; s.count = 0; s.tier = 0; s.regenUsed = 0; return true; }
  return false;
}
export const currentMultiplier = (s: ComboState, cfg: ComboCfg = COMBO) => (s.timer > 0 ? multiplierFor(s.tier, cfg) : 1);
