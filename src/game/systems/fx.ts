/** M6: all visual / audio / HUD side effects of the sim. Each recording helper also pushes a compact net event (host in co-op);
 *  the matching `do*` functions replay the same effect locally (host) or from an event (client). */
import { world } from '../core/world';
import { V3 } from '../core/math';
import { emit, evq, r2 } from '../core/events';
import { sfx } from '../../audio/sfx';
import { useUI } from '../../app/store';

const copy = (dst: V3, src: V3) => { dst.x = src.x; dst.y = src.y; dst.z = src.z; };
export const CONFETTI = ['#ff9ec7', '#9ef0d0', '#fff3a0', '#c9a8ff', '#a8d8ff'];

export function doBurst(x: number, y: number, z: number, n: number, colors: string[], speed = 4, life = 0.45, size = 1, vis = -1) {
  for (let i = 0; i < n; i++) {
    const s = world.sparks.spawnOrRecycle();
    s.pos.x = x; s.pos.y = y; s.pos.z = z;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, k = speed * (0.4 + Math.random() * 0.8);
    const r = Math.sqrt(1 - u * u);
    s.vel.x = Math.cos(a) * r * k; s.vel.y = Math.abs(u) * k + 1; s.vel.z = Math.sin(a) * r * k;
    s.life = s.maxLife = life * (0.6 + Math.random() * 0.6); s.color = colors[i % colors.length]; s.size = size; s.kind = 0; s.vis = vis;
  }
}
export function doConfetti(x: number, y: number, z: number, n: number) {
  for (let i = 0; i < n; i++) {
    const s = world.sparks.spawnOrRecycle(); s.pos.x = x; s.pos.y = y; s.pos.z = z;
    const a = Math.random() * Math.PI * 2, k = 2.2 + Math.random() * 4.5;
    s.vel.x = Math.cos(a) * k; s.vel.y = 4.5 + Math.random() * 5; s.vel.z = Math.sin(a) * k;
    s.life = s.maxLife = 1.25 + Math.random() * 0.85; s.color = CONFETTI[i % CONFETTI.length]; s.size = 1.15; s.kind = 1; s.vis = -1;
  }
}
export function doPuff(x: number, y: number, z: number, size = 0.5, color = '#ffffff') { const b = world.blastFx.spawnOrRecycle(); b.pos.x = x; b.pos.y = y; b.pos.z = z; b.radius = size; b.life = b.maxLife = 0.36; b.color = color; b.ring = false; }
export function doDmgNumber(x: number, y: number, z: number, value: number, crit: boolean, text = '') {
  const d = world.dmgNums.spawnOrRecycle();
  d.pos.x = x + (Math.random() - 0.5) * 0.35; d.pos.y = y; d.pos.z = z; d.value = value; d.life = crit ? 1.05 : 0.95; d.crit = crit; d.text = text;
}
export function doBlast(x: number, y: number, z: number, radius: number, color: string, life = 0.4) {
  const b = world.blastFx.spawnOrRecycle(); b.pos.x = x; b.pos.y = y; b.pos.z = z; b.radius = radius; b.life = b.maxLife = life; b.color = color; b.ring = true;
}
export function doTracer(from: V3, to: V3, life: number, color: string, width: number, vis = -1, size = 0.2) {
  const t = world.tracers.spawnOrRecycle(); copy(t.from, from); copy(t.to, to); t.life = t.maxLife = life; t.color = color; t.width = width; t.vis = vis; t.size = size;
}

export function burst(p: V3, n: number, colors: string[], speed = 4, life = 0.45, size = 1, vis = -1) {
  if (evq.recording) emit('b', r2(p.x), r2(p.y), r2(p.z), n, colors, speed, life, size, vis);
  doBurst(p.x, p.y, p.z, n, colors, speed, life, size, vis);
}
export function confetti(p: V3, n: number) { if (evq.recording) emit('cf', r2(p.x), r2(p.y), r2(p.z), n); doConfetti(p.x, p.y, p.z, n); }
export function puff(p: V3, size = 0.5, color = '#ffffff') { if (evq.recording) emit('pf', r2(p.x), r2(p.y), r2(p.z), size, color); doPuff(p.x, p.y, p.z, size, color); }
export function dmgNumber(p: V3, value: number, crit: boolean, text = '') { if (evq.recording) emit('dn', r2(p.x), r2(p.y), r2(p.z), Math.round(value), crit, text); doDmgNumber(p.x, p.y, p.z, value, crit, text); }
export function blastFx(p: V3, radius: number, color: string, life = 0.4) { if (evq.recording) emit('bl', r2(p.x), r2(p.y), r2(p.z), radius, color, life); doBlast(p.x, p.y, p.z, radius, color, life); }
export function tracer(from: V3, to: V3, life: number, color: string, width: number, vis = -1, size = 0.2) {
  if (evq.recording) emit('tr', r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z), life, color, width, vis, size);
  doTracer(from, to, life, color, width, vis, size);
}

/** Cartoon funny-kill pack (layered on confetti). Caps particles; pools recycle. Host emits `fk` for co-op guests. */
export const FUNNY_WORDS = ['砰!', 'BOOM!', 'POP!', '糖!', 'Q!', '啪!'] as const;
const BRICK_FRAG = ['#e53935', '#1e6fe8', '#ffd21f', '#2fb344', '#ff8a1f', '#ffffff', '#cfd8dc'];
const CANDY_FRAG = ['#ff9ec7', '#9ef0d0', '#fff3a0', '#c9a8ff', '#a8d8ff', '#ffb347', '#ffffff'];
const STAR_COLS = ['#fff3a0', '#ffd27a', '#ffffff', '#ff9ec7'];
const FRAG_CAP = 12, STAR_CAP = 10, SMOKE_CAP = 5;

export function doFunnyKill(x: number, y: number, z: number, brick: boolean, scale = 1) {
  if (!useUI.getState().settings.funnyFx) return;
  const s = Math.max(0.55, Math.min(2.4, scale));
  // 1) exaggerated shockwave ring (Q弹 punch)
  doBlast(x, Math.max(0.05, y - 0.1 * s), z, 3.4 * s, brick ? '#ffd21f' : '#ff9ec7', 0.72);
  // 2) cartoon smoke puff / mushroom (soft spheres, no ring)
  doPuff(x, y + 0.25 * s, z, 1.05 * s, '#fff5e8');
  doPuff(x, y + 0.95 * s, z, 1.65 * s, '#ffffff');
  doPuff(x, y + 1.45 * s, z, 0.7 * s, '#ffe8f4');
  for (let i = 0; i < SMOKE_CAP; i++) {
    const sp = world.sparks.spawnOrRecycle();
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4 * s;
    sp.pos.x = x + Math.cos(a) * r; sp.pos.y = y + 0.2 * s + Math.random() * 0.45 * s; sp.pos.z = z + Math.sin(a) * r;
    sp.vel.x = (Math.random() - 0.5) * 0.75; sp.vel.y = 1.4 + Math.random() * 1.9 * s; sp.vel.z = (Math.random() - 0.5) * 0.75;
    sp.life = sp.maxLife = 0.7 + Math.random() * 0.45; sp.color = Math.random() < 0.5 ? '#fff8f0' : '#e8e0d8';
    sp.size = (1.05 + Math.random() * 0.95) * s; sp.kind = 5; sp.vis = -1;
  }
  // 3) toy-fragment scatter (candy wrappers vs brick studs) — capped for pools
  const cols = brick ? BRICK_FRAG : CANDY_FRAG;
  const nFrag = Math.min(FRAG_CAP, Math.round(8 + 4 * s));
  for (let i = 0; i < nFrag; i++) {
    const sp = world.sparks.spawnOrRecycle();
    sp.pos.x = x; sp.pos.y = y; sp.pos.z = z;
    const a = Math.random() * Math.PI * 2, k = (2.8 + Math.random() * 5.2) * s;
    sp.vel.x = Math.cos(a) * k; sp.vel.y = 4 + Math.random() * 5.5 * s; sp.vel.z = Math.sin(a) * k;
    sp.life = sp.maxLife = 0.9 + Math.random() * 0.65; sp.color = cols[i % cols.length];
    sp.size = (brick ? 2.05 : 1.8) * (0.9 + Math.random() * 1.0) * s;
    sp.kind = brick ? 3 : 2; sp.vis = -1;
  }
  // 4) star burst (reuses candy star visual via vis=2)
  doBurst(x, y + 0.35 * s, z, Math.min(STAR_CAP, Math.round(6 + 3.5 * s)), STAR_COLS, 5.2 * s, 0.62, 1.45 * s, 2);
  // 5) floating popup text (springier bounce+fade in Effects)
  const d = world.dmgNums.spawnOrRecycle();
  d.pos.x = x + (Math.random() - 0.5) * 0.2; d.pos.y = y + 1.15 * s; d.pos.z = z;
  d.value = 0; d.crit = true; d.text = FUNNY_WORDS[(Math.random() * FUNNY_WORDS.length) | 0]; d.life = 1.2;
}

export function funnyKill(p: V3, brick: boolean, scale = 1) {
  if (!useUI.getState().settings.funnyFx) return;
  if (evq.recording) emit('fk', r2(p.x), r2(p.y), r2(p.z), brick ? 1 : 0, Math.round(scale * 100) / 100);
  doFunnyKill(p.x, p.y, p.z, brick, scale);
}

export function shake(a: number, slot = -1) {
  if (slot < 0 || slot === world.local) world.shake = Math.max(world.shake, a);
  if (evq.recording && (slot < 0 || world.slots[slot]?.remote)) emit('sh', a, slot);
}
export function recoil(dyaw: number, dpitch: number) {
  const sl = world.slots[world.active], p = sl.player;
  if (sl.remote) { emit('rc', world.active, r2(dyaw * 1000) / 1000, r2(dpitch * 1000) / 1000); return; }
  p.yaw += dyaw; p.pitch += dpitch;
}

// ---- HUD patches: slot = -1 → everybody; otherwise only that slot ----
export function uiSet(patch: Record<string, unknown>, slot = -1) {
  const mine = slot < 0 || slot === world.local;
  if (evq.recording && (slot < 0 || world.slots[slot]?.remote)) emit('ui', slot, patch);
  if (mine) useUI.getState().set(patch as any);
}
/** replay a ui patch received from the host (keys that depend on the local clock are rewritten) */
export function applyUiPatch(patch: Record<string, any>) {
  const p = { ...patch };
  if ('hitMarker' in p) p.hitMarker = performance.now();
  if ('fade' in p) p.fade = performance.now();
  if (p.callout) p.callout = { ...p.callout, key: performance.now() };
  useUI.getState().set(p);
}
export const callout = (text: string, tier: number, slot = world.active) => uiSet({ callout: { text, tier, key: performance.now() } }, slot);

// ---- audio: private sounds only play for the slot they belong to ----
const PRIVATE = new Set(['hurt', 'jump', 'roll', 'dash', 'reload', 'dry', 'swap', 'hit', 'combo', 'lose', 'win', 'click']);
export const snd = new Proxy(sfx, {
  get(target, k: string) {
    const fn = (target as any)[k];
    if (typeof fn !== 'function') return fn;
    return (...a: unknown[]) => {
      const priv = PRIVATE.has(k), owner = world.active;
      if (evq.recording) emit('sx', k, priv ? owner : -1, a);
      if (!priv || owner === world.local) fn(...a);
    };
  },
}) as typeof sfx;
/** client side: play a sound event */
export function doSfx(k: string, owner: number, args: unknown[]) {
  if (owner >= 0 && owner !== world.local) return;
  const fn = (sfx as any)[k]; if (typeof fn === 'function') fn(...args);
}
