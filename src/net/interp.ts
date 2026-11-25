/** Pure snapshot-interpolation helpers (unit-tested). The client renders the world `delay` seconds behind the newest host snapshot,
 *  interpolating between the two snapshots that bracket the render time. */
export interface Timed { t: number }
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
export interface Sample<T> { a: T; b: T; k: number; /** seconds past the newest snapshot (extrapolation), 0 when interpolating */ extra: number }

export class SnapBuffer<T extends Timed> {
  items: T[] = [];
  constructor(public max = 24) {}
  /** insert keeping time order; ignores duplicates / stale out-of-order frames older than the oldest kept one */
  push(s: T) {
    const it = this.items; let i = it.length;
    while (i > 0 && it[i - 1].t > s.t) i--;
    if (i > 0 && it[i - 1].t === s.t) return;
    it.splice(i, 0, s);
    while (it.length > this.max) it.shift();
  }
  get newest(): T | undefined { return this.items[this.items.length - 1]; }
  clear() { this.items.length = 0; }
  sample(renderT: number): Sample<T> | null {
    const it = this.items; if (!it.length) return null;
    if (renderT <= it[0].t) return { a: it[0], b: it[0], k: 0, extra: 0 };
    const last = it[it.length - 1];
    if (renderT >= last.t) return { a: last, b: last, k: 0, extra: renderT - last.t };
    for (let i = it.length - 1; i > 0; i--) {
      if (it[i - 1].t <= renderT) { const a = it[i - 1], b = it[i]; return { a, b, k: (renderT - a.t) / Math.max(1e-6, b.t - a.t), extra: 0 }; }
    }
    return { a: it[0], b: it[0], k: 0, extra: 0 };
  }
}

/** Estimates the host sim clock on the client and keeps `renderT` gliding smoothly (no per-snapshot stutter). */
export class RenderClock {
  renderT = 0; started = false;
  private lastHostT = 0; private lastRecv = 0;
  constructor(public delay = 0.1) {}
  /** call when a snapshot arrives (`now` = local seconds) */
  onSnapshot(hostT: number, now: number) { this.lastHostT = hostT; this.lastRecv = now; }
  /** advance one frame; returns renderT */
  step(dt: number, now: number): number {
    const target = this.lastHostT + (now - this.lastRecv) - this.delay;
    if (!this.started) { this.renderT = target; this.started = true; return this.renderT; }
    this.renderT += dt;
    const err = target - this.renderT;
    if (Math.abs(err) > 0.5) this.renderT = target; // big jump (stall / host hitch): resync
    else this.renderT += err * Math.min(1, dt * 4); // gentle slew toward the estimate
    return this.renderT;
  }
}
