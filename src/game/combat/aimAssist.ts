/**
 * Light aim assist for touch: small angular pull toward visible enemies only.
 * No wall lock — LOS via raycast. Does not change damage formulas.
 */
import { clamp, forwardFrom, wrapAngle, type V3 } from '../core/math';

export const AIM_ASSIST = {
  /** Max cone (radians) ~8° */
  maxAngle: (8 * Math.PI) / 180,
  /** Fraction of angular error corrected per apply (gentle; further scaled by look activity) */
  pull: 0.14,
  maxDist: 42,
};

export interface AimAssistEnemy {
  active: boolean;
  dead: boolean;
  pos: V3;
  /** Aim point height offset from feet */
  aimY: number;
}

export interface AimAssistInput {
  yaw: number;
  pitch: number;
  eye: V3;
  enemies: AimAssistEnemy[];
  /** Returns hit distance or null if clear to max */
  raycast: (o: V3, d: V3, max: number) => number | null;
  maxAngle?: number;
  pull?: number;
  maxDist?: number;
}

export function computeAimAssist(a: AimAssistInput): { dyaw: number; dpitch: number; locked: boolean } {
  const maxAngle = a.maxAngle ?? AIM_ASSIST.maxAngle;
  const pull = a.pull ?? AIM_ASSIST.pull;
  const maxDist = a.maxDist ?? AIM_ASSIST.maxDist;
  const fwd = forwardFrom(a.yaw, a.pitch);
  let bestAng = maxAngle;
  let bestDyaw = 0, bestDpitch = 0, found = false;

  for (const e of a.enemies) {
    if (!e.active || e.dead) continue;
    const tx = e.pos.x - a.eye.x, ty = e.pos.y + e.aimY - a.eye.y, tz = e.pos.z - a.eye.z;
    const dist = Math.hypot(tx, ty, tz);
    if (dist < 0.4 || dist > maxDist) continue;
    const inv = 1 / dist;
    const dx = tx * inv, dy = ty * inv, dz = tz * inv;
    const dot = fwd.x * dx + fwd.y * dy + fwd.z * dz;
    if (dot < 0.15) continue; // behind / extreme side
    const ang = Math.acos(clamp(dot, -1, 1));
    if (ang > bestAng) continue;

    // LOS: wall closer than enemy → skip (no wall lock)
    const hit = a.raycast(a.eye, { x: dx, y: dy, z: dz }, dist - 0.15);
    if (hit !== null && hit < dist - 0.2) continue;

    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.asin(clamp(dy, -1, 1));
    const dyaw = wrapAngle(targetYaw - a.yaw);
    const dpitch = targetPitch - a.pitch;
    bestAng = ang;
    bestDyaw = dyaw;
    bestDpitch = dpitch;
    found = true;
  }

  if (!found) return { dyaw: 0, dpitch: 0, locked: false };
  const dyaw = bestDyaw * pull;
  const dpitch = bestDpitch * pull;
  return {
    dyaw: Number.isFinite(dyaw) ? dyaw : 0,
    dpitch: Number.isFinite(dpitch) ? dpitch : 0,
    locked: true,
  };
}
