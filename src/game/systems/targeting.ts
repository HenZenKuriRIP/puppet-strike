// M6: pure enemy target selection (unit-tested). Returns an index into the candidate list.
export interface TargetCand { x: number; z: number; alive: boolean }
export type TargetMode = 'nearest' | 'random';

/**
 * nearest: the closest alive candidate, with hysteresis (stay on the current target unless another is clearly closer) so enemies don't flip-flop.
 * random:  keep the current alive target; if none (cur < 0 or downed) choose uniformly among the alive ones using `rnd` in [0,1).
 * If nobody is alive the current index (or 0) is returned.
 */
export function pickTarget(mode: TargetMode, ex: number, ez: number, cands: TargetCand[], cur: number, rnd: number, hysteresis = 3): number {
  let aliveN = 0;
  for (const c of cands) if (c.alive) aliveN++;
  if (aliveN === 0) return cur >= 0 && cur < cands.length ? cur : 0;
  if (mode === 'random') {
    if (cur >= 0 && cur < cands.length && cands[cur].alive) return cur;
    let k = Math.min(aliveN - 1, Math.floor(rnd * aliveN));
    for (let i = 0; i < cands.length; i++) if (cands[i].alive) { if (k === 0) return i; k--; }
    return 0;
  }
  let best = -1, bd = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]; if (!c.alive) continue;
    const d = Math.hypot(c.x - ex, c.z - ez);
    if (d < bd) { bd = d; best = i; }
  }
  if (cur >= 0 && cur < cands.length && cands[cur].alive && cur !== best) {
    const dc = Math.hypot(cands[cur].x - ex, cands[cur].z - ez);
    if (dc <= bd + hysteresis) return cur;
  }
  return best;
}
