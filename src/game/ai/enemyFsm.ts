import type { EnemyConfig } from '../../config/game';

export type AIState = 'idle' | 'patrol' | 'detect' | 'chase' | 'attack' | 'dead';
export interface FsmData { state: AIState; timer: number; cooldown: number }
export interface Perception { dist: number; canSee: boolean; playerAlive: boolean; dead: boolean }
export interface FsmEvents { changed: boolean; attackRelease: boolean; windupStarted: boolean }

export function setState(f: FsmData, s: AIState, timer = 0) { f.state = s; f.timer = timer; }

/** Pure transition logic for both enemy types. Mutates FsmData. */
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
      else if (p.dist <= cfg.attackRange && p.canSee && f.cooldown <= 0) {
        setState(f, 'attack', cfg.windup); ev.windupStarted = true;
      }
      break;
    case 'attack':
      if (f.timer <= 0) { ev.attackRelease = true; f.cooldown = cfg.cooldown; setState(f, 'chase'); }
      break;
    case 'dead': break;
  }
  ev.changed = prev !== f.state;
  return ev;
}
