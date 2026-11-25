import type { AABB } from '../combat/raycast';
import type { V3 } from '../core/math';
import { groundHeight, STEP_UP } from '../levels/terrain';

const SNAP = 0.3; // stick-to-ground distance when walking down slopes

/** Axis-separated AABB-vs-AABB resolution for a vertical box body (feet at pos.y) over an analytic heightfield.
 *  Higher terrain than STEP_UP acts as a cliff (per-axis revert). Returns grounded flag. */
export function moveAndCollide(pos: V3, vel: V3, delta: V3, r: number, h: number, boxes: AABB[]): { grounded: boolean; hitHead: boolean } {
  let grounded = false, hitHead = false;
  const overlap = (b: AABB) =>
    pos.x + r > b.min.x && pos.x - r < b.max.x && pos.z + r > b.min.z && pos.z - r < b.max.z &&
    pos.y + h > b.min.y && pos.y < b.max.y;
  const wasVy = vel.y;
  // X
  const ox = pos.x;
  pos.x += delta.x;
  for (const b of boxes) if (overlap(b)) { pos.x = delta.x > 0 ? b.min.x - r - 1e-4 : b.max.x + r + 1e-4; vel.x = 0; }
  if (pos.x !== ox && groundHeight(pos.x, pos.z) > pos.y + STEP_UP) { pos.x = ox; vel.x = 0; }
  // Z
  const oz = pos.z;
  pos.z += delta.z;
  for (const b of boxes) if (overlap(b)) { pos.z = delta.z > 0 ? b.min.z - r - 1e-4 : b.max.z + r + 1e-4; vel.z = 0; }
  if (pos.z !== oz && groundHeight(pos.x, pos.z) > pos.y + STEP_UP) { pos.z = oz; vel.z = 0; }
  // Y
  pos.y += delta.y;
  for (const b of boxes) if (overlap(b)) {
    if (delta.y <= 0) { pos.y = b.max.y; grounded = true; } else { pos.y = b.min.y - h - 1e-4; hitHead = true; }
    vel.y = 0;
  }
  const g = groundHeight(pos.x, pos.z);
  if (pos.y <= g || (!grounded && wasVy <= 0 && vel.y <= 0 && pos.y - g < SNAP && pos.y - g > -0.01 && delta.y <= 0.0001)) { pos.y = g; if (vel.y < 0) vel.y = 0; grounded = true; }
  return { grounded, hitHead };
}
