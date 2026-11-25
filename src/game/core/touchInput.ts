/**
 * Maps virtual controls onto the shared `input` singleton (InputLike).
 * No combat logic — only keys / mouseDown / aimDown / look deltas the sim already reads.
 */
import { input } from './input';

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const;
const touchOwned = new Set<string>();
let stickX = 0, stickY = 0;
let lookSens = 1.35;
const DEAD = 0.28;

/** EMA of recent touch-look magnitude in [0,1]; decays after last drag. */
let lookActivity = 0;
let lookActivityAt = 0;
/** True after at least one look sample / pad-down (avoids now=0 edge with fake timers). */
let hasLookSample = false;
/** True while LookPad owns a live finger (or until watchdog clears). */
let lookPadActive = false;

/** After any look sample, force assist scale 0 for this many ms. */
export const LOOK_ASSIST_SUPPRESS_MS = 320;
/** LookActivity idle fade window (ms). Longer than 0.1.10's 120 so brief pauses don't re-enable assist. */
export const LOOK_ACTIVITY_IDLE_MS = 280;
/** Pointer session with no move for this long → treat as stuck (WebView). Used by Joystick / HoldBtn. */
export const POINTER_STALE_MS = 900;
/**
 * LookPad stale window (ms). 0.1.11 used POINTER_STALE_MS (~900) which cleared ownership while
 * the finger was still down but paused mid-aim → subsequent moves dropped → pitch stuck at floor.
 * Look intentionally pauses; keep watchdog for truly-orphaned ids but much longer.
 */
export const LOOK_PAD_STALE_MS = 6000;
/** Max |dx|/|dy| (CSS px) accepted per look sample — caps WebView jump spikes that slam pitch. */
export const LOOK_DELTA_CAP = 72;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Look sensitivity multiplier for finger drag (relative to mouse). */
export function setTouchLookSensitivity(s: number) { lookSens = Math.max(0.4, Math.min(3, s)); }

export function getTouchStick() { return { x: stickX, y: stickY }; }

/** Stick axes in screen space: +x right, +y down. Forward = up = negative y → KeyW. */
export function setTouchMove(x: number, y: number) {
  stickX = x; stickY = y;
  const want = new Set<string>();
  if (y < -DEAD) want.add('KeyW');
  if (y > DEAD) want.add('KeyS');
  if (x < -DEAD) want.add('KeyA');
  if (x > DEAD) want.add('KeyD');
  // Sprint when stick pushed hard forward
  if (y < -0.85) { input.keys.add('ShiftLeft'); touchOwned.add('ShiftLeft'); }
  else releaseOwned('ShiftLeft');
  for (const k of MOVE_KEYS) {
    if (want.has(k)) { input.keys.add(k); touchOwned.add(k); }
    else releaseOwned(k);
  }
}

export function clearTouchMove() { setTouchMove(0, 0); }

function releaseOwned(code: string) {
  if (!touchOwned.has(code)) return;
  input.keys.delete(code);
  touchOwned.delete(code);
}

/** Hold-style action (fire / ADS / revive). */
export function setTouchHold(code: 'fire' | 'ads' | 'revive', down: boolean) {
  if (code === 'fire') input.mouseDown = down;
  else if (code === 'ads') input.aimDown = down;
  else if (code === 'revive') {
    if (down) { input.keys.add('KeyE'); touchOwned.add('KeyE'); }
    else releaseOwned('KeyE');
  }
}

/** Edge-triggered tap → pressed (+ optional brief key hold). */
export function tapTouch(code: string) {
  input.pressed.add(code);
  input.keys.add(code);
  touchOwned.add(code);
  // Auto-release held key next microtask so sim sees pressed edge without sticky key
  setTimeout(() => {
    if (code === 'KeyE') return; // revive is hold
    releaseOwned(code);
  }, 0);
}

/** Clamp one look sample so a single WebView spike cannot pin pitch at minPitch. */
export function clampLookDelta(dx: number, dy: number, cap = LOOK_DELTA_CAP): { dx: number; dy: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { dx: 0, dy: 0 };
  const c = Math.max(1, cap);
  return {
    dx: Math.max(-c, Math.min(c, dx)),
    dy: Math.max(-c, Math.min(c, dy)),
  };
}

export function addTouchLook(dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const c = clampLookDelta(dx, dy);
  input.dx += c.dx * lookSens;
  input.dy += c.dy * lookSens;
  const mag = Math.hypot(c.dx, c.dy);
  // EMA: ~10px/frame → high activity (was 18 — too soft for slow intentional turns).
  lookActivity = Math.min(1, lookActivity * 0.45 + Math.min(1, mag / 10));
  lookActivityAt = nowMs();
  hasLookSample = true;
}

/** Mark look-pad finger down even before first move sample (zeros assist immediately). */
export function markLookPadActive(active: boolean) {
  lookPadActive = active;
  if (active) {
    lookActivity = Math.max(lookActivity, 0.85);
    lookActivityAt = nowMs();
    hasLookSample = true;
  }
}

export function isLookPadActive() { return lookPadActive; }

/** Peek recent look activity (0..1), time-decayed over LOOK_ACTIVITY_IDLE_MS. */
export function getTouchLookActivity(now = nowMs()): number {
  if (lookPadActive) return Math.max(lookActivity, 0.9);
  if (lookActivity <= 0) return 0;
  const age = now - lookActivityAt;
  if (age >= LOOK_ACTIVITY_IDLE_MS) return 0;
  return lookActivity * (1 - age / LOOK_ACTIVITY_IDLE_MS);
}

/**
 * True while a look drag is in progress or within LOOK_ASSIST_SUPPRESS_MS of last sample.
 * GameCanvas should multiply assist by 0 when this is true.
 */
export function isLookSuppressingAssist(now = nowMs()): boolean {
  if (lookPadActive) return true;
  if (!hasLookSample) return false;
  return (now - lookActivityAt) < LOOK_ASSIST_SUPPRESS_MS;
}

/**
 * Aim-assist pull scale given look activity: 1 when idle, →0 when actively turning.
 * Sharper than 0.1.10 smoothstep — moderate activity already near-zero.
 * Pure; used by GameCanvas and unit tests.
 */
export function aimAssistLookScale(activity: number): number {
  const t = Math.max(0, Math.min(1, activity));
  // Aggressive cutoff: moderate activity (~0.5) → scale near 0 so turns aren't fought
  const s = Math.min(1, t * t * 3.5);
  return Math.max(0, 1 - s);
}

/**
 * Combined scale for GameCanvas: 0 while suppressing / pad active, else activity scale.
 */
export function effectiveAimAssistScale(now = nowMs()): number {
  if (isLookSuppressingAssist(now)) return 0;
  return aimAssistLookScale(getTouchLookActivity(now));
}

export function clearTouchLook() {
  input.dx = 0;
  input.dy = 0;
  lookActivity = 0;
  lookActivityAt = 0;
  hasLookSample = false;
  lookPadActive = false;
}

/** Clear all touch-owned state (pause / menu / blur). Does not wipe keyboard. */
export function resetTouchInput() {
  for (const k of [...touchOwned]) releaseOwned(k);
  stickX = stickY = 0;
  input.mouseDown = false;
  input.aimDown = false;
  clearTouchLook();
}

export type PointerSessionOpts = {
  /** If >0, session auto-clears when no touch()/down for this many ms. */
  staleMs?: number;
};

/**
 * Pointer-id gate for look/joystick/hold: steal on new down, clear on up/lostcapture.
 * Android WebView often fires lostpointercapture without a matching up.
 * Optional staleMs enables watchdog via maybeClearStale().
 */
export function createPointerSession(opts: PointerSessionOpts = {}) {
  let active: number | null = null;
  let lastAt = 0;
  const staleMs = opts.staleMs ?? 0;
  return {
    get activeId() { return active; },
    get lastAt() { return lastAt; },
    /** Begin tracking id; steals previous if another was active. */
    down(id: number) {
      active = id;
      lastAt = nowMs();
      return true;
    },
    /** Record activity (call on pointermove). */
    touch(id?: number) {
      if (id !== undefined && active !== id) return false;
      if (active === null) return false;
      lastAt = nowMs();
      return true;
    },
    /** True iff this id currently owns the session. */
    owns(id: number) { return active === id; },
    /** Release if this id owns; returns whether it was cleared. */
    up(id: number) {
      if (active !== id) return false;
      active = null;
      return true;
    },
    /** Same as up — lostpointercapture without matching up. */
    lost(id: number) {
      if (active !== id) return false;
      active = null;
      return true;
    },
    /** Force-clear (visibility/blur/reset). */
    reset() { active = null; },
    /** True if active but no touch/down within staleMs. */
    isStale(now = nowMs()) {
      if (active === null || staleMs <= 0) return false;
      return (now - lastAt) > staleMs;
    },
    /** Clear if stale; returns whether cleared. */
    maybeClearStale(now = nowMs()) {
      if (!this.isStale(now)) return false;
      active = null;
      return true;
    },
  };
}

export type PointerSession = ReturnType<typeof createPointerSession>;

/** Custom event so LookPad/Joystick clear their pointer sessions on global reset. */
export const TOUCH_RESET_EVENT = 'puppet-touch-reset';

/** Pure helper for unit tests: map stick → WASD set. */
export function stickToKeys(x: number, y: number, dead = DEAD): string[] {
  const out: string[] = [];
  if (y < -dead) out.push('KeyW');
  if (y > dead) out.push('KeyS');
  if (x < -dead) out.push('KeyA');
  if (x > dead) out.push('KeyD');
  return out;
}
