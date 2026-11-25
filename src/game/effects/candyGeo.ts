/** M6: procedural candy-shaped bullet geometries. Unit radius ≈ 1, travel axis = +Y, flat shapes lie in the XZ plane
 *  (so they face the camera when flying away from it). Vertex colours are light tints; the instance colour multiplies them. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BULLET_VISUALS, BulletVisualId } from '../../config/game';

function paint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const prep = (g: THREE.BufferGeometry) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; };
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(prep), false)!;
const T = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => g.translate(x, y, z);

let HI = false; // pickups are few → built with finer tessellation than bullets (triangle budget test)
function flat(shape: THREE.Shape, depth: number, bevel = HI ? 0.11 : 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: HI ? 4 : 1, curveSegments: HI ? 14 : 6 });
  g.center(); g.rotateX(-Math.PI / 2); return g;
}
function starShape(r1: number, r2: number, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r2 : r1; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath(); return s;
}
function heartShape(k: number) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.95 * k); s.bezierCurveTo(-0.2 * k, -0.7 * k, -1.0 * k, -0.2 * k, -1.0 * k, 0.28 * k);
  s.bezierCurveTo(-1.0 * k, 0.78 * k, -0.35 * k, 0.95 * k, 0, 0.5 * k);
  s.bezierCurveTo(0.35 * k, 0.95 * k, 1.0 * k, 0.78 * k, 1.0 * k, 0.28 * k);
  s.bezierCurveTo(1.0 * k, -0.2 * k, 0.2 * k, -0.7 * k, 0, -0.95 * k); return s;
}

const BUILD: Record<BulletVisualId, () => THREE.BufferGeometry> = {
  /** round gumdrop: sugar-crusted dome with a flat base */
  gumdrop: () => {
    const dome = paint(new THREE.SphereGeometry(0.9, HI ? 24 : 14, HI ? 14 : 10, 0, Math.PI * 2, 0, Math.PI * 0.62), '#ffffff');
    const base = paint(new THREE.CylinderGeometry(0.88, 0.95, 0.18, HI ? 24 : 14), '#e8e8e8'); T(base, 0, -0.15, 0);
    const dots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.55 * Math.sin(i * 0.9 + 1); const d = paint(new THREE.SphereGeometry(0.1, 4, 3), '#fffdf2'); T(d, Math.cos(a) * 0.55, 0.62 + 0.25 * Math.cos(r), Math.sin(a) * 0.55); dots.push(d); }
    const g = merge([dome, base, ...dots]); g.translate(0, -0.1, 0); return g;
  },
  /** wrapped hard candy: ball with twisted cellophane ends */
  wrapped: () => {
    const ball = paint(new THREE.SphereGeometry(0.62, HI ? 24 : 12, HI ? 16 : 10), '#ffffff'); ball.scale(1, 1.15, 1);
    const w1 = paint(new THREE.ConeGeometry(0.5, 0.7, HI ? 20 : 8), '#fff7fb'); w1.rotateX(Math.PI); T(w1, 0, 0.98, 0);
    const w2 = paint(new THREE.ConeGeometry(0.5, 0.7, HI ? 20 : 8), '#fff7fb'); T(w2, 0, -0.98, 0);
    const band = paint(new THREE.TorusGeometry(0.62, 0.07, HI ? 8 : 5, HI ? 28 : 14), '#ffe9f2'); band.rotateX(Math.PI / 2);
    return merge([ball, w1, w2, band]);
  },
  star: () => merge([paint(flat(starShape(1, 0.46), 0.35), '#ffffff'), paint(flat(starShape(0.55, 0.27), 0.62), '#fff6c8')]),
  heart: () => merge([paint(flat(heartShape(1), 0.5), '#ffffff'), paint(flat(heartShape(0.5), 0.74), '#ffe0ec')]),
  /** jelly bean: fat capsule with a glossy highlight */
  bean: () => {
    const b = paint(new THREE.CapsuleGeometry(0.5, 0.85, HI ? 8 : 4, HI ? 16 : 10), '#ffffff'); b.scale(1, 1, 0.82);
    const h = paint(new THREE.SphereGeometry(0.16, 6, 5), '#ffffff'); h.scale(0.7, 1.7, 0.7); T(h, 0.22, 0.2, 0.34);
    return merge([b, h]);
  },
  /** lollipop swirl disc with a stub of stick */
  swirl: () => {
    const disc = paint(new THREE.CylinderGeometry(0.95, 0.95, 0.26, 20), '#ffffff');
    const rings: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) { const t = paint(new THREE.TorusGeometry(0.22 + i * 0.26, 0.055, 5, 20), '#fff5fa'); t.rotateX(Math.PI / 2); T(t, 0, 0.15, 0); rings.push(t); }
    const stick = paint(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), '#f4efe6'); T(stick, 0, -0.55, 0);
    return merge([disc, ...rings, stick]);
  },
  /** candy cane: striped hook (red/white by segment) */
  cane: () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(0, -1 + i * 0.28, 0));
    for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI; pts.push(new THREE.Vector3(Math.sin(a) * 0.38 * 0.5 * 2, 0.68 + Math.sin(a * 0.5) * 0.0 + (1 - Math.cos(a)) * 0.19, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts), segs = 10, parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < segs; i++) {
      const sub = new THREE.CatmullRomCurve3(Array.from({ length: 5 }, (_, j) => curve.getPoint((i + j / 4) / segs)));
      parts.push(paint(new THREE.TubeGeometry(sub, 5, 0.17, 6, false), i % 2 ? '#ffffff' : '#ff6f8f'));
    }
    return merge(parts);
  },
  /** cookie / biscuit with chocolate chips */
  cookie: () => {
    const c = paint(new THREE.CylinderGeometry(0.95, 0.9, 0.34, 16), '#ffffff'); c.scale(1, 1, 1);
    const chips: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) { const a = i * 1.1, r = 0.2 + (i % 3) * 0.22; const ch = paint(new THREE.SphereGeometry(0.15, 5, 4), '#6b4a3a'); ch.scale(1, 0.5, 1); T(ch, Math.cos(a) * r, 0.18, Math.sin(a) * r); chips.push(ch); }
    const rim = paint(new THREE.TorusGeometry(0.93, 0.07, 5, 16), '#f3e3cc'); rim.rotateX(Math.PI / 2);
    return merge([c, rim, ...chips]);
  },
  /** rainbow ribbon pellet: twisted flat ribbon strip */
  ribbon: () => {
    const parts: THREE.BufferGeometry[] = [];
    const cols = ['#ffffff', '#fff2f2', '#ffffff', '#f2fff6', '#ffffff'];
    for (let i = 0; i < 5; i++) { const b = paint(new THREE.BoxGeometry(1.0, 0.36, 0.06), cols[i]); b.rotateY(i * 0.55); T(b, 0, -0.8 + i * 0.4, 0); parts.push(b); }
    const knot = paint(new THREE.SphereGeometry(0.2, 6, 5), '#ffffff'); parts.push(knot);
    return merge(parts);
  },
  /** chocolate chunk: scored bar piece */
  choc: () => {
    const b = paint(new THREE.BoxGeometry(1.5, 1.1, 1.2), '#ffffff');
    const tiles: THREE.BufferGeometry[] = [];
    for (let i = -1; i <= 0; i++) for (let j = -1; j <= 0; j++) { const t = paint(new THREE.BoxGeometry(0.62, 0.16, 0.5), '#d6d6d6'); T(t, i * 0.7 + 0.35, 0.6, j * 0.58 + 0.29); tiles.push(t); }
    const bite = paint(new THREE.BoxGeometry(0.4, 0.4, 0.3), '#cccccc'); T(bite, 0.75, 0.55, 0.6); tiles.push(bite);
    const g = merge([b, ...tiles]); g.scale(0.85, 0.85, 0.85); return g;
  },
};

const cache = new Map<string, THREE.BufferGeometry>();
export function candyGeometry(id: BulletVisualId, hi = false) { const key = hi ? id + ':hi' : id; let g = cache.get(key); if (!g) { HI = hi; try { g = BUILD[id](); } finally { HI = false; } g.computeVertexNormals(); cache.set(key, g); } return g; }
export function candyTriangles() { return BULLET_VISUALS.reduce((n, id) => n + candyGeometry(id).attributes.position.count / 3, 0); }
