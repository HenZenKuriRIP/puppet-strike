import { CAMERA } from '../../config/game';
import { forwardFrom, rightFrom, V3, v3, sub, len, scale, add } from '../core/math';
import type { RaycastFn } from '../core/world';

/** Over-the-shoulder camera with collision: ray from pivot to desired spot, pulled in on hit. */
export function computeCamera(playerPos: V3, yaw: number, pitch: number, raycast: RaycastFn, opts: { distance?: number; shoulderX?: number } = {}) {
  const DIST = opts.distance ?? CAMERA.distance, SX = opts.shoulderX ?? CAMERA.shoulderX;
  const fwd = forwardFrom(yaw, pitch), right = rightFrom(yaw);
  const pivot = v3(playerPos.x, playerPos.y + CAMERA.pivotHeight, playerPos.z);
  // shoulder point first (collide sideways), then back along -fwd
  const shoulderDir = v3(right.x, 0, right.z);
  const hs = raycast(pivot, shoulderDir, SX + CAMERA.collisionPadding);
  const sx = hs === null ? SX : Math.max(0, hs - CAMERA.collisionPadding);
  const shoulder = add(pivot, add(scale(shoulderDir, sx), v3(0, CAMERA.shoulderY, 0)));
  const back = scale(fwd, -1);
  const hb = raycast(shoulder, back, DIST + CAMERA.collisionPadding);
  const d = hb === null ? DIST : Math.max(0, hb - CAMERA.collisionPadding); // M5: never force a min distance past a wall
  const pos = add(shoulder, scale(back, d));
  if (pos.y < 0.25) pos.y = 0.25;
  return { pos, fwd, pivot, dist: len(sub(pos, pivot)) };
}
