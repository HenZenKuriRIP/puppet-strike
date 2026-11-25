import { V3, v3 } from '../core/math';
import { applyDamage } from './damage';

export interface AoeTarget {
  pos: V3; vel: V3; hp: number; maxHp: number; dead: boolean; flash: number; active: boolean;
  bound: number; knockT: number; centerY?: number;
}
export interface Blast { center: V3; radius: number; damage: number; knockback: number }
export interface AoeHit<T> { target: T; dealt: number; killed: boolean; fromBurst: boolean }
export interface AoeResult<T> { hits: AoeHit<T>[]; bursts: V3[] }

export const blastFalloff = (d: number, r: number) => (d >= r ? 0 : 1 - 0.5 * (d / r));

/**
 * Resolve an explosion against targets. Any bubble-bound target caught in it bursts:
 * the bubble pops (bind cleared) and spawns a secondary AoE at its position (chains, capped).
 */
export function resolveExplosion<T extends AoeTarget>(blast: Blast, targets: T[], burst: { radius: number; damage: number; knockback: number; maxChain: number }): AoeResult<T> {
  const res: AoeResult<T> = { hits: [], bursts: [] };
  const queue: { b: Blast; fromBurst: boolean }[] = [{ b: blast, fromBurst: false }];
  while (queue.length) {
    const { b, fromBurst } = queue.shift()!;
    for (const t of targets) {
      if (!t.active || t.dead) continue;
      const cy = t.pos.y + (t.centerY ?? 0.6);
      const dx = t.pos.x - b.center.x, dy = cy - b.center.y, dz = t.pos.z - b.center.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > b.radius) continue;
      const k = blastFalloff(d, b.radius);
      const wasBound = t.bound > 0;
      const r = applyDamage(t, b.damage * k);
      const l = d || 1;
      t.vel.x += (dx / l) * b.knockback * k; t.vel.z += (dz / l) * b.knockback * k; t.vel.y += b.knockback * 0.55 * k;
      t.knockT = 0.45;
      res.hits.push({ target: t, dealt: r.dealt, killed: r.killed, fromBurst });
      if (wasBound && res.bursts.length < burst.maxChain) {
        t.bound = 0;
        const c = v3(t.pos.x, cy, t.pos.z);
        res.bursts.push(c);
        queue.push({ b: { center: c, radius: burst.radius, damage: burst.damage, knockback: burst.knockback }, fromBurst: true });
      }
    }
  }
  return res;
}
