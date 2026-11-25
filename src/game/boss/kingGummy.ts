// M4 boss KING GUMMY: pure phase + pattern scheduler (simulation turns events into bullets/minions/slams).
export const KING = {
  hp: 3000, phases: [1, 0.66, 0.33] as const, transitionTime: 2.2, introTime: 2.8,
  telegraph: { ring: 0.8, spiral: 0.6, fan: 0.5, summon: 0.9, slam: 1.1, hazard: 1.2 },
  // learnable fixed cycles per phase
  cycles: { 1: ['ring', 'fan', 'spiral', 'fan'], 2: ['summon', 'fan', 'ring', 'fan'], 3: ['slam', 'hazard', 'ring', 'hazard', 'spiral'] } as Record<1 | 2 | 3, BossAttack[]>,
  gap: { 1: 1.3, 2: 1.2, 3: 0.9 } as Record<1 | 2 | 3, number>,
  ring: { count: 18, speed: 9, damage: 12 }, spiral: { arms: 3, shots: 24, interval: 0.07, speed: 10, damage: 9 },
  fan: { count: 5, arc: 0.7, speed: 14, damage: 11 }, summon: { count: 3, maxMinions: 5 },
  slam: { radius: 7.5, damage: 30 }, hazard: { count: 3, radius: 2.6, damage: 22 },
  moveSpeed: 2.2, keepDist: 9,
};
export type BossAttack = 'ring' | 'spiral' | 'fan' | 'summon' | 'slam' | 'hazard' | 'shower' | 'wall' | 'train' | 'wreck' | 'stomp';
/** scheduler config shared by every boss (W2: BRICK COLOSSUS reuses the same phase / telegraph machine) */
export interface BossCfg { phases: readonly number[]; transitionTime: number; introTime: number; telegraph: Record<string, number>; cycles: Record<1 | 2 | 3, BossAttack[]>; gap: Record<1 | 2 | 3, number> }
export type BossKind = 'king' | 'colossus';
export const isBossType = (t: string) => t === 'king' || t === 'colossus';
export type BossPhase = 1 | 2 | 3;
export interface BossState { kind: BossKind; phase: BossPhase; transition: number; intro: number; cycleIdx: number; timer: number; tele: BossAttack | null; teleT: number; defeated: boolean }
export const createBoss = (cfg: BossCfg = KING, kind: BossKind = 'king'): BossState => ({ kind, phase: 1, transition: 0, intro: cfg.introTime, cycleIdx: 0, timer: 1.5, tele: null, teleT: 0, defeated: false });
export const phaseFor = (hpFrac: number, cfg: BossCfg = KING): BossPhase => hpFrac > cfg.phases[1] ? 1 : hpFrac > cfg.phases[2] ? 2 : 3;
export const bossInvulnerable = (s: BossState) => s.intro > 0 || s.transition > 0;
export interface BossEvents { phaseChanged: BossPhase | null; telegraph: BossAttack | null; attack: BossAttack | null; defeated: boolean }

export function stepBoss(s: BossState, hpFrac: number, dt: number, cfg: BossCfg = KING): BossEvents {
  const ev: BossEvents = { phaseChanged: null, telegraph: null, attack: null, defeated: false };
  if (s.defeated) return ev;
  if (hpFrac <= 0) { s.defeated = true; s.tele = null; ev.defeated = true; return ev; }
  if (s.intro > 0) { s.intro -= dt; return ev; }
  const want = phaseFor(hpFrac, cfg);
  if (want > s.phase) { // phases only advance; transition = invulnerable roar, cancels telegraph
    s.phase = want; s.transition = cfg.transitionTime; s.cycleIdx = 0; s.tele = null; s.timer = cfg.transitionTime + 0.6; ev.phaseChanged = want;
  }
  if (s.transition > 0) { s.transition -= dt; s.timer -= dt; return ev; }
  if (s.tele) {
    s.teleT -= dt;
    if (s.teleT <= 0) { ev.attack = s.tele; s.tele = null; s.timer = cfg.gap[s.phase]; }
    return ev;
  }
  s.timer -= dt;
  if (s.timer <= 0) {
    const cyc = cfg.cycles[s.phase]; const a = cyc[s.cycleIdx % cyc.length]; s.cycleIdx++;
    s.tele = a; s.teleT = cfg.telegraph[a]; ev.telegraph = a;
  }
  return ev;
}
