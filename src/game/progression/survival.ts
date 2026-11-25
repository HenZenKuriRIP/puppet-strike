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
  const fresh = UNLOCK_BLOCK.filter(([, w0]) => n >= w0 && n - w0 <= 1).map(([t]) => t);
  return capTypes(w, base, SURVIVAL_TYPE_CAP, fresh);
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
  const fresh = UNLOCK.filter(([, w0]) => n >= w0 && n - w0 <= 1).map(([t]) => t);
  return capTypes(w, base, SURVIVAL_TYPE_CAP, fresh);
}
export const survivalHpMult = (n: number) => Math.min(SURVIVAL.maxHpMult, 1 + SURVIVAL.hpPerWave * (n - 1));
export const survivalDmgMult = (n: number) => Math.min(SURVIVAL.maxDmgMult, 1 + SURVIVAL.dmgPerWave * (n - 1));
export const waveCount = (w: WaveDef) => Object.values(w).reduce((a, b) => a + (b ?? 0), 0);

/** Keep early/mid survival waves readable: at most this many archetypes at once. */
export const SURVIVAL_TYPE_CAP = 4;
function capTypes(w: WaveDef, preferred: EnemyType[], max = SURVIVAL_TYPE_CAP, fresh: EnemyType[] = []): WaveDef {
  const keys = (Object.keys(w) as EnemyType[]).filter((k) => (w[k] ?? 0) > 0);
  if (keys.length <= max) return w;
  const keep = new Set<EnemyType>();
  for (const t of ['mega', 'king', 'colossus', 'bgolem'] as EnemyType[]) if ((w[t] ?? 0) > 0) keep.add(t);
  // Newly unlocked threats should actually show up on the waves that introduce them.
  for (const t of fresh) if ((w[t] ?? 0) > 0 && keep.size < max) keep.add(t);
  // Keep the original wave-1 core so late waves still have fodder (tests + readable frontline).
  let early = 0;
  for (const t of preferred) {
    if ((w[t] ?? 0) > 0 && early < 2 && keep.size < max) { keep.add(t); early++; }
  }
  for (let i = preferred.length - 1; i >= 0 && keep.size < max; i--) if ((w[preferred[i]] ?? 0) > 0) keep.add(preferred[i]);
  for (const t of keys) if (keep.size < max) keep.add(t);
  let leftover = 0;
  for (const t of keys) if (!keep.has(t)) { leftover += w[t] ?? 0; delete w[t]; }
  if (leftover) {
    let sink: EnemyType | null = null;
    const bosses = new Set(['mega', 'king', 'colossus', 'bgolem']);
    for (let i = preferred.length - 1; i >= 0; i--) if (keep.has(preferred[i]) && !bosses.has(preferred[i])) { sink = preferred[i]; break; }
    if (!sink) sink = [...keep][0];
    if (sink) w[sink] = (w[sink] ?? 0) + leftover;
  }
  return w;
}
export function survivalWaveGoal(n: number, map: 'candy' | 'block' = 'candy'): { text: string; priority?: string } | null {
  if (map === 'block') {
    if (n === 1) return { text: '积木士兵会列队压上，先打靠前的那些', priority: 'bsoldier' };
    if (n === 3) return { text: '优先拆除积木炮台', priority: 'bturret' };
    if (n === 5) return { text: '先风筝积木巨人', priority: 'bgolem' };
    return null;
  }
  if (n === 1) return { text: '先压住炮手，发条兵可以后打', priority: 'gunner' };
  if (n === 2) return { text: '软糖坦克是优先目标', priority: 'gumdrop' };
  if (n === 3) return { text: '别让炸弹小丑靠近', priority: 'clown' };
  return null;
}
export const isUpgradeWave = (clearedWave: number) => clearedWave > 0 && clearedWave % SURVIVAL.upgradeEvery === 0;
