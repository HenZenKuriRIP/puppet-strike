import type { EnemyConfig } from '../../config/game';

export type AIState = 'idle' | 'patrol' | 'detect' | 'chase' | 'attack' | 'recover' | 'investigate' | 'dead';
export interface FsmData { state: AIState; timer: number; cooldown: number }
export interface Perception { dist: number; canSee: boolean; playerAlive: boolean; dead: boolean }
export interface FsmEvents { changed: boolean; attackRelease: boolean; windupStarted: boolean }

export function setState(f: FsmData, s: AIState, timer = 0) { f.state = s; f.timer = timer; }

/** Recover window after a committed attack; long enough to be punishable, short enough for mobile crowds. */
export const recoverTime = (cfg: EnemyConfig) => Math.max(0.28, Math.min(0.55, (cfg.windup || 0.5) * 0.65));
export const INVESTIGATE_TIME = 2.2;

/** Pure transition logic. Mutates FsmData. */
export function stepFsm(f: FsmData, cfg: EnemyConfig, p: Perception, dt: number): FsmEvents {
  const ev: FsmEvents = { changed: false, attackRelease: false, windupStarted: false };
  const prev = f.state;
  f.timer -= dt;
  if (f.cooldown > 0) f.cooldown -= dt;

  if (p.dead) { if (f.state !== 'dead') setState(f, 'dead'); ev.changed = prev !== f.state; return ev; }
  const sees = p.playerAlive && p.canSee && p.dist <= cfg.detectRange;

  switch (f.state) {
    case 'idle':
      if (sees) setState(f, 'detect', cfg.detectDelay);
      else if (f.timer <= 0) setState(f, 'patrol', 3 + Math.random() * 2);
      break;
    case 'patrol':
      if (sees) setState(f, 'detect', cfg.detectDelay);
      else if (f.timer <= 0) setState(f, 'idle', 1 + Math.random());
      break;
    case 'detect':
      if (!p.playerAlive) setState(f, 'idle', 1);
      else if (f.timer <= 0) setState(f, 'chase');
      break;
    case 'chase':
      if (!p.playerAlive || p.dist > cfg.loseRange) setState(f, 'patrol', 3);
      else if (!p.canSee) setState(f, 'investigate', INVESTIGATE_TIME);
      else if (p.dist <= cfg.attackRange && p.canSee && f.cooldown <= 0) {
        setState(f, 'attack', cfg.windup); ev.windupStarted = true;
      }
      break;
    case 'attack':
      // committed: finish the windup even if sight is lost, then recover
      if (f.timer <= 0) { ev.attackRelease = true; f.cooldown = cfg.cooldown; setState(f, 'recover', recoverTime(cfg)); }
      break;
    case 'recover':
      if (f.timer > 0) break; // minimum dwell
      if (!p.playerAlive || p.dist > cfg.loseRange) setState(f, 'patrol', 3);
      else if (!p.canSee) setState(f, 'investigate', INVESTIGATE_TIME);
      else setState(f, 'chase');
      break;
    case 'investigate':
      if (sees) setState(f, 'detect', Math.min(0.2, cfg.detectDelay));
      else if (f.timer <= 0 || !p.playerAlive) setState(f, 'patrol', 3);
      break;
    case 'dead': break;
  }
  ev.changed = prev !== f.state;
  return ev;
}
