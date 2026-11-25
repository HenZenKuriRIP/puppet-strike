import { ENEMIES, ENEMY_ORDER, EnemyType, WaveDef, COOP } from '../../config/game';

export type WavePhase = 'intermission' | 'spawning' | 'fighting' | 'complete';
export interface WaveState { index: number; phase: WavePhase; timer: number; queue: EnemyType[] }
export interface WaveEvents { spawn: EnemyType[]; waveStarted: number | null; waveCleared: number | null; allCleared: boolean }

export const createWaveState = (intermission: number): WaveState => ({ index: -1, phase: 'intermission', timer: intermission, queue: [] });

export function buildQueue(w: WaveDef): EnemyType[] {
  // round-robin across types so mixes interleave; easier types first in each round
  const left = ENEMY_ORDER.map((t) => [t, (w[t] ?? 0) * (ENEMIES[t].swarm ?? 1)] as [EnemyType, number]);
  const q: EnemyType[] = [];
  let any = true;
  while (any) { any = false; for (const e of left) if (e[1] > 0) { q.push(e[0]); e[1]--; any = true; } }
  return q;
}

export function stepWaves(s: WaveState, waves: WaveDef[], aliveCount: number, dt: number,
  opts: { intermission: number; spawnInterval: number }, scale?: (w: WaveDef) => WaveDef): WaveEvents {
  const ev: WaveEvents = { spawn: [], waveStarted: null, waveCleared: null, allCleared: false };
  if (s.phase === 'complete') return ev;
  s.timer -= dt;
  if (s.phase === 'intermission' && s.timer <= 0) {
    s.index++;
    s.queue = buildQueue(scale ? scale(waves[s.index]) : waves[s.index]);
    s.phase = 'spawning'; s.timer = 0; ev.waveStarted = s.index;
  }
  if (s.phase === 'spawning') {
    while (s.timer <= 0 && s.queue.length) { ev.spawn.push(s.queue.shift()!); s.timer += opts.spawnInterval; }
    if (!s.queue.length) s.phase = 'fighting';
  } else if (s.phase === 'fighting' && aliveCount === 0) {
    ev.waveCleared = s.index;
    if (s.index >= waves.length - 1) { s.phase = 'complete'; ev.allCleared = true; }
    else { s.phase = 'intermission'; s.timer = opts.intermission; }
  }
  return ev;
}

export const remainingInWave = (s: WaveState, alive: number) => alive + s.queue.length;

/** Co-op: scale a wave definition's counts (mini-boss tanks are never multiplied; HP is scaled instead). */
export function scaleWave(w: WaveDef, mult: number, cap = 44): WaveDef {
  if (mult === 1) return w;
  const out: WaveDef = {};
  let total = 0;
  for (const t of ENEMY_ORDER) {
    const c = w[t] ?? 0; if (!c) continue;
    const n = t === 'mega' || t === 'king' || t === 'colossus' ? c : Math.max(c, Math.round(c * mult));
    out[t] = n; total += n * (ENEMIES[t].swarm ?? 1);
  }
  // keep within the enemy pool: trim the most numerous non-boss type
  while (total > cap) {
    let best: EnemyType | null = null;
    for (const t of ENEMY_ORDER) if ((out[t] ?? 0) > 1 && t !== 'mega' && (!best || (out[t] ?? 0) * (ENEMIES[t].swarm ?? 1) > (out[best] ?? 0) * (ENEMIES[best].swarm ?? 1))) best = t;
    if (!best) break;
    out[best] = (out[best] ?? 0) - 1; total -= ENEMIES[best].swarm ?? 1;
  }
  return out;
}
export const coopCountMult = (n: number) => COOP.enemyCountMult[Math.min(n, COOP.enemyCountMult.length) - 1] ?? 1;
export const coopHpMult = (n: number) => COOP.enemyHpMult[Math.min(n, COOP.enemyHpMult.length) - 1] ?? 1;
