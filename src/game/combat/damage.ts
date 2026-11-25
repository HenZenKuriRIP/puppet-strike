export interface Damageable { hp: number; maxHp: number; dead: boolean; flash: number }
export interface DamageResult { dealt: number; killed: boolean }

export function falloff(distance: number, start: number, range: number, min: number): number {
  if (distance <= start) return 1;
  if (distance >= range) return min;
  const t = (distance - start) / (range - start);
  return 1 - t * (1 - min);
}

export function applyDamage(target: Damageable, amount: number, flashTime = 0.12): DamageResult {
  if (target.dead || amount <= 0) return { dealt: 0, killed: false };
  const dealt = Math.min(target.hp, Math.round(amount));
  target.hp -= dealt;
  target.flash = flashTime;
  if (target.hp <= 0) { target.hp = 0; target.dead = true; return { dealt, killed: true }; }
  return { dealt, killed: false };
}
