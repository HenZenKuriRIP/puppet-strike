import { V3, v3 } from '../core/math';

/** Tank frontal armor: shots travelling against its facing are reduced. */
export function armorMultiplier(facing: number, shotDir: V3, armorFront: number | undefined): number {
  if (armorFront === undefined) return 1;
  const fx = -Math.sin(facing), fz = -Math.cos(facing); // enemy forward
  const l = Math.hypot(shotDir.x, shotDir.z) || 1;
  const d = (shotDir.x * fx + shotDir.z * fz) / l; // -1 = shot hits the face
  return d < -0.35 ? armorFront : 1;
}

/** Initial velocity for a ballistic leap from a to b in time t under gravity g. */
export function leapVelocity(a: V3, b: V3, t: number, g: number): V3 {
  return v3((b.x - a.x) / t, (b.y - a.y) / t + 0.5 * g * t, (b.z - a.z) / t);
}

/** Drone orbit point: circle around the player at radius r, advancing by angle. */
export function orbitPoint(center: V3, from: V3, r: number, advance: number): V3 {
  const a = Math.atan2(from.z - center.z, from.x - center.x) + advance;
  return v3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
}
