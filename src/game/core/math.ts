export interface V3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return scale(a, 1 / l); };
export const dist = (a: V3, b: V3) => len(sub(a, b));
export const dist2D = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const approach = (cur: number, target: number, maxDelta: number) =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);
export const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
/** forward for yaw (0 = -Z) and pitch */
export const forwardFrom = (yaw: number, pitch: number): V3 =>
  v3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
export const rightFrom = (yaw: number): V3 => v3(Math.cos(yaw), 0, -Math.sin(yaw));
