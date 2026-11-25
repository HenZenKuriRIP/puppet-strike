import { V3 } from '../core/math';
export interface AABB { min: V3; max: V3 }

/** ray-sphere; dir must be normalized. returns distance or null */
export function raySphere(o: V3, d: V3, c: V3, r: number, maxDist = Infinity): number | null {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > maxDist) return null;
  return t;
}

/** slab ray-AABB; returns entry distance or null */
export function rayAABB(o: V3, d: V3, box: AABB, maxDist = Infinity): number | null {
  let tmin = 0, tmax = maxDist;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < box.min[k] || o[k] > box.max[k]) return null;
    } else {
      const inv = 1 / d[k];
      let t1 = (box.min[k] - o[k]) * inv, t2 = (box.max[k] - o[k]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function rayBoxes(o: V3, d: V3, boxes: AABB[], maxDist: number): number | null {
  let best: number | null = null;
  for (const b of boxes) {
    const t = rayAABB(o, d, b, maxDist);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}
