// M4 MODE A Toy Survival: endless escalating waves.
import type { WaveDef, EnemyType } from '../../config/game';
export const SURVIVAL = { upgradeEvery: 3, maxPerWave: 16, hpPerWave: 0.07, maxHpMult: 3.5, dmgPerWave: 0.03, maxDmgMult: 2 };
const UNLOCK: [EnemyType, number][] = [['windup', 1], ['gunner', 1], ['gumdrop', 2], ['bunny', 2], ['jelly', 3], ['clown', 3], ['drone', 4], ['tank', 5], ['mint', 6], ['choco', 7], ['lolli', 8]];
/** tank family counts double in the rotation: survival leans toward candy tanks as waves unlock them */
const TANK_FAMILY: EnemyType[] = ['gumdrop', 'jelly', 'mint', 'choco', 'lolli'];
/** per-wave caps for the heavier types (units, a jelly unit = a swarm of 5) */
const capFor = (t: EnemyType, n: number) => t === 'tank' ? 1 + Math.floor(n / 6) : t === 'choco' ? 1 + Math.floor((n - 7) / 5) : t === 'lolli' ? 1 + Math.floor((n - 8) / 5) : t === 'mint' ? 1 + Math.floor((n - 6) / 5) : t === 'jelly' ? 1 + Math.floor(n / 6) : 99;
/** W2 Block City rotation: brick enemies join the toys (static turrets / cranes are capped by the map's mount points) */
const UNLOCK_BLOCK: [EnemyType, number][] = [['windup', 1], ['bsoldier', 1], ['gunner', 2], ['bunny', 2], ['bturret', 3], ['gumdrop', 3], ['drone', 4], ['clown', 4], ['bgolem', 5], ['bcrane', 6], ['mint', 7], ['choco', 9], ['lolli', 10]];
const capBlock = (t: EnemyType, n: number) => t === 'bturret' ? Math.min(4, 1 + Math.floor((n - 3) / 3)) : t === 'bcrane' ? Math.min(2, 1 + Math.floor((n - 6) / 5)) : t === 'bgolem' ? 1 + Math.floor((n - 5) / 4)
  : t === 'mint' ? 1 + Math.floor((n - 7) / 5) : t === 'choco' ? 1 + Math.floor((n - 9) / 5) : t === 'lolli' ? 1 + Math.floor((n - 10) / 5) : t === 'gumdrop' ? 2 + Math.floor(n / 5) : 99;
export function survivalWaveBlock(n: number): WaveDef {
  const base = UNLOCK_BLOCK.filter(([, w]) => n >= w).map(([t]) => t);
  const types = base.flatMap((t) => (t === 'bsoldier' || t === 'gumdrop' ? [t, t] : [t]));
  const total = Math.min(SURVIVAL.maxPerWave, 3 + Math.floor(n * 1.4));
  const w: WaveDef = {};
  for (let i = 0; i < total; i++) { const t = types[(i * 7 + n) % types.length]; w[t] = (w[t] ?? 0) + 1; }
  for (const t of base) if ((w[t] ?? 0) > capBlock(t, n)) w[t] = capBlock(t, n);
  if (n % 10 === 0) { // mini-bosses: twin golems (replace part of the crowd)
    w.bgolem = (w.bgolem ?? 0) + Math.min(2, n / 10);
    while (waveCount(w) > SURVIVAL.maxPerWave) { let b: EnemyType | null = null; for (const t of base) if (t !== 'bgolem' && (w[t] ?? 0) > 0 && (!b || (w[t] ?? 0) > (w[b] ?? 0))) b = t; if (!b) break; w[b] = (w[b] ?? 0) - 1; }
  }
  return w;
}
/** wave n is 1-based */
export function survivalWave(n: number, map: 'candy' | 'block' = 'candy'): WaveDef {
  if (map === 'block') return survivalWaveBlock(n);
  const base = UNLOCK.filter(([, w]) => n >= w).map(([t]) => t);
  const types = base.flatMap((t) => (TANK_FAMILY.includes(t) ? [t, t] : [t]));
  const total = Math.min(SURVIVAL.maxPerWave, 3 + Math.floor(n * 1.4));
  const w: WaveDef = {};
  for (let i = 0; i < total; i++) { const t = types[(i * 7 + n) % types.length]; w[t] = (w[t] ?? 0) + 1; }
  for (const t of base) if ((w[t] ?? 0) > capFor(t, n)) w[t] = capFor(t, n);
  if (n % 10 === 0) { // mini-boss every 10th wave (replaces some of the crowd so the wave total stays capped)
    w.mega = Math.min(2, n / 10);
    const sum = () => waveCount(w);
    while (sum() > SURVIVAL.maxPerWave) { let b: EnemyType | null = null; for (const t of base) if ((w[t] ?? 0) > 0 && (!b || (w[t] ?? 0) > (w[b] ?? 0))) b = t; if (!b) break; w[b] = (w[b] ?? 0) - 1; }
  }
  return w;
}
export const survivalHpMult = (n: number) => Math.min(SURVIVAL.maxHpMult, 1 + SURVIVAL.hpPerWave * (n - 1));
export const survivalDmgMult = (n: number) => Math.min(SURVIVAL.maxDmgMult, 1 + SURVIVAL.dmgPerWave * (n - 1));
export const waveCount = (w: WaveDef) => Object.values(w).reduce((a, b) => a + (b ?? 0), 0);
export const isUpgradeWave = (clearedWave: number) => clearedWave > 0 && clearedWave % SURVIVAL.upgradeEvery === 0;
