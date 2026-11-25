import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Shared, cached geometry helpers for the polished enemy models (bevelled boxes, lathe "bean" bodies, moulded brick
 * geometry with merged studs). Everything is cached by key so 40 pooled enemy slots reuse the same GPU buffers.
 */
const cache = new Map<string, THREE.BufferGeometry>();
const memo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g as T; };
const q = (n: number) => Math.round(n * 1000) / 1000;

/** box with rounded (bevelled) edges — radius is clamped to ~45% of the smallest side */
export function bevelBox(w: number, h: number, d: number, radius = 0.08, seg = 3): THREE.BufferGeometry {
  const r = Math.min(radius, Math.min(w, h, d) * 0.45);
  return memo(`bb${q(w)},${q(h)},${q(d)},${q(r)},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
}
/** rounded-edge cylinder (Y axis) made with a lathe profile: radius r, height h, edge round e */
export function roundCyl(r: number, h: number, e = 0.05, seg = 20): THREE.BufferGeometry {
  e = Math.min(e, r * 0.9, h * 0.45);
  return memo(`rc${q(r)},${q(h)},${q(e)},${seg}`, () => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
    const n = 4;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e)); }
    for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e)); }
    pts.push(new THREE.Vector2(0, h / 2));
    const g = new THREE.LatheGeometry(pts, seg); g.computeVertexNormals(); return g;
  });
}
/** lathe body from a [radius, y] profile (smooth-shaded), for gumdrops, bells, cones with round tips, jelly… */
export function lathe(key: string, prof: [number, number][], seg = 22): THREE.BufferGeometry {
  return memo(`lt${key}${seg}`, () => { const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg); g.computeVertexNormals(); return g; });
}
/** dome-topped gumdrop silhouette: wide flat base, round shoulder, tiny sugar flat top. height h, base radius r. */
export function gumdropGeo(r = 0.5, h = 0.6) {
  const prof: [number, number][] = [[0, 0]];
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; prof.push([r * (0.92 + 0.08 * Math.cos(a)) * (i === 0 ? 1 : 1), h * 0.1 * Math.sin(a)]); }
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; prof.push([r * Math.cos(a) * 0.98 + 0.001, h * 0.1 + (h * 0.9) * Math.sin(a) ** 0.85]); }
  return lathe(`gd${q(r)},${q(h)}`, prof, 28);
}
/** one stud (round-edged cylinder) lathe, Y axis, sitting on y=0 */
function studGeo(r: number, h: number) {
  return memo(`st${q(r)},${q(h)}`, () => { const g = new THREE.CylinderGeometry(r, r * 1.03, h, 10, 1); g.translate(0, h / 2, 0); return g; });
}
const toIndexed = (g: THREE.BufferGeometry) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") x.deleteAttribute(k); return x; };
/**
 * A single moulded brick: bevelled body + merged studs (ONE draw call per brick, instead of 1 + N studs).
 * size = [x,y,z]; studs: top-face stud grid (pitch ≈ pitch); the geometry is centred on the body.
 */
export function brickGeo(size: [number, number, number], studs = true, pitch = 0.32, studR = 0.1): THREE.BufferGeometry {
  const [sx, sy, sz] = size;
  return memo(`br${q(sx)},${q(sy)},${q(sz)},${studs ? 1 : 0},${q(pitch)},${q(studR)}`, () => {
    const r = Math.min(0.07, Math.min(sx, sy, sz) * 0.16);
    const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(sx, sy, sz, 2, r)];
    if (studs) {
      const nx = Math.max(1, Math.round(sx / pitch)), nz = Math.max(1, Math.round(sz / pitch));
      const sr = Math.min(studR, sx / nx * 0.32, sz / nz * 0.32), sh = sr * 0.8;
      for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
        const s = studGeo(sr, sh).clone(); s.translate(((a + 0.5) / nx - 0.5) * sx, sy / 2 - 0.005, ((c + 0.5) / nz - 0.5) * sz); parts.push(s);
      }
    }
    const g = mergeGeometries(parts.map(toIndexed), false)!;
    return g;
  });
}
/** round brick (cylinder with rounded edge); ring of studs on top (or one centre stud for small radius) */
export function cylBrickGeo(r: number, h: number, studs = true, studR = 0.1): THREE.BufferGeometry {
  return memo(`cb${q(r)},${q(h)},${studs ? 1 : 0},${q(studR)}`, () => {
    const parts: THREE.BufferGeometry[] = [roundCyl(r, h, Math.min(0.06, r * 0.2), 20).clone()];
    if (studs) {
      const sr = r < 0.45 ? Math.min(studR, r * 0.5) : studR, sh = sr * 0.8;
      if (r < 0.45) { const s = studGeo(sr, sh).clone(); s.translate(0, h / 2 - 0.005, 0); parts.push(s); }
      else { const n = Math.max(6, Math.round((r * 0.6 * Math.PI * 2) / (sr * 3.2))); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const s = studGeo(sr, sh).clone(); s.translate(Math.cos(a) * r * 0.6, h / 2 - 0.005, Math.sin(a) * r * 0.6); parts.push(s); } const c = studGeo(sr, sh).clone(); c.translate(0, h / 2 - 0.005, 0); parts.push(c); }
    }
    return mergeGeometries(parts.map(toIndexed), false)!;
  });
}
/** merge geometry parts (each already positioned via the callback) into one: for static detail clusters (sprinkles, wheel bolts…) */
export function mergedGeo(key: string, build: () => THREE.BufferGeometry[]): THREE.BufferGeometry {
  return memo(`mg${key}`, () => mergeGeometries(build().map(toIndexed), false)!);
}
export const T = THREE;
