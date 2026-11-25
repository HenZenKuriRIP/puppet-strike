import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  stickToKeys, setTouchMove, clearTouchMove, setTouchHold, tapTouch, addTouchLook,
  resetTouchInput, clearTouchLook, createPointerSession, getTouchLookActivity,
  aimAssistLookScale, markLookPadActive, isLookPadActive, isLookSuppressingAssist,
  effectiveAimAssistScale, clampLookDelta, LOOK_ASSIST_SUPPRESS_MS, POINTER_STALE_MS,
  LOOK_PAD_STALE_MS, LOOK_DELTA_CAP,
} from '../game/core/touchInput';
import { input } from '../game/core/input';
import { computeAimAssist, AIM_ASSIST } from '../game/combat/aimAssist';

describe('touch stick → WASD mapping', () => {
  it('maps forward/back/left/right with deadzone', () => {
    expect(stickToKeys(0, -1)).toEqual(['KeyW']);
    expect(stickToKeys(0, 1)).toEqual(['KeyS']);
    expect(stickToKeys(-1, 0)).toEqual(['KeyA']);
    expect(stickToKeys(1, 0)).toEqual(['KeyD']);
    expect(stickToKeys(0, 0)).toEqual([]);
    expect(stickToKeys(0.1, -0.1)).toEqual([]); // inside deadzone
  });
  it('allows diagonals', () => {
    expect(stickToKeys(-0.8, -0.8).sort()).toEqual(['KeyA', 'KeyW']);
  });
  it('writes into shared input.keys and clears', () => {
    input.reset();
    setTouchMove(0, -1);
    expect(input.keys.has('KeyW')).toBe(true);
    clearTouchMove();
    expect(input.keys.has('KeyW')).toBe(false);
  });
});

describe('touch buttons → InputLike', () => {
  beforeEach(() => { input.reset(); resetTouchInput(); });
  it('fire / ads hold mouse flags', () => {
    setTouchHold('fire', true); expect(input.mouseDown).toBe(true);
    setTouchHold('ads', true); expect(input.aimDown).toBe(true);
    setTouchHold('fire', false); setTouchHold('ads', false);
    expect(input.mouseDown).toBe(false); expect(input.aimDown).toBe(false);
  });
  it('tap skill / dodge / reload edges', async () => {
    tapTouch('KeyF'); expect(input.pressed.has('KeyF')).toBe(true);
    tapTouch('KeyC'); expect(input.pressed.has('KeyC')).toBe(true);
    tapTouch('KeyR'); expect(input.pressed.has('KeyR')).toBe(true);
    await Promise.resolve();
  });
  it('look drag accumulates dx/dy', () => {
    addTouchLook(10, -4);
    const [dx, dy] = input.consumeLook();
    expect(dx).toBeGreaterThan(0); expect(dy).toBeLessThan(0);
  });
  it('revive hold sets KeyE', () => {
    setTouchHold('revive', true); expect(input.keys.has('KeyE')).toBe(true);
    setTouchHold('revive', false); expect(input.keys.has('KeyE')).toBe(false);
  });
  it('resetTouchInput zeros look residual', () => {
    addTouchLook(5, 5);
    resetTouchInput();
    const [dx, dy] = input.consumeLook();
    expect(dx).toBe(0); expect(dy).toBe(0);
  });
  it('ignores non-finite look deltas', () => {
    addTouchLook(NaN, 5);
    addTouchLook(3, Infinity);
    const [dx, dy] = input.consumeLook();
    expect(dx).toBe(0); expect(dy).toBe(0);
  });
  it('clampLookDelta caps per-sample magnitude', () => {
    expect(LOOK_DELTA_CAP).toBeGreaterThan(20);
    const huge = clampLookDelta(500, -900);
    expect(huge.dx).toBe(LOOK_DELTA_CAP);
    expect(huge.dy).toBe(-LOOK_DELTA_CAP);
    const ok = clampLookDelta(10, -4);
    expect(ok.dx).toBe(10);
    expect(ok.dy).toBe(-4);
    const bad = clampLookDelta(NaN, 3);
    expect(bad.dx).toBe(0);
    expect(bad.dy).toBe(0);
  });
  it('addTouchLook applies per-sample clamp (huge spike ≠ uncapped)', () => {
    clearTouchLook();
    input.reset();
    addTouchLook(10_000, -10_000);
    const [dx, dy] = input.consumeLook();
    // Unclamped would be ~10000 * lookSens; clamped ≤ LOOK_DELTA_CAP * sens (sens ≤ 3)
    expect(Math.abs(dx)).toBeLessThanOrEqual(LOOK_DELTA_CAP * 3 + 1e-6);
    expect(Math.abs(dy)).toBeLessThanOrEqual(LOOK_DELTA_CAP * 3 + 1e-6);
    expect(Math.abs(dx)).toBeGreaterThan(0);
    expect(Math.abs(dy)).toBeGreaterThan(0);
  });
});

describe('pointer session (look pad / joystick stuck pointerId)', () => {
  it('lostcapture without up → new down id still owns (steal)', () => {
    const s = createPointerSession();
    s.down(1);
    expect(s.owns(1)).toBe(true);
    // Android WebView: lostpointercapture, no pointerup
    expect(s.lost(1)).toBe(true);
    expect(s.activeId).toBeNull();
    // New finger must still work
    s.down(2);
    expect(s.owns(2)).toBe(true);
    expect(s.owns(1)).toBe(false);
    expect(s.up(2)).toBe(true);
  });
  it('steal: new down while previous id still active', () => {
    const s = createPointerSession();
    s.down(1);
    s.down(2); // steal without up/lost on 1
    expect(s.owns(1)).toBe(false);
    expect(s.owns(2)).toBe(true);
    // stale up for old id ignored
    expect(s.up(1)).toBe(false);
    expect(s.owns(2)).toBe(true);
  });
  it('after lost, move for old id is rejected', () => {
    const s = createPointerSession();
    s.down(1);
    s.lost(1);
    expect(s.owns(1)).toBe(false);
    s.down(2);
    expect(s.owns(2)).toBe(true);
  });
  it('fire+look multi-touch: look session independent of hold steal', () => {
    const look = createPointerSession();
    const fire = createPointerSession();
    fire.down(10);
    look.down(20);
    expect(fire.owns(10)).toBe(true);
    expect(look.owns(20)).toBe(true);
    // New look finger steals look only
    look.down(21);
    expect(look.owns(21)).toBe(true);
    expect(fire.owns(10)).toBe(true);
    // Stale up for old look id ignored
    expect(look.up(20)).toBe(false);
    expect(look.owns(21)).toBe(true);
  });
});

describe('pointer session watchdog (stale)', () => {
  it('maybeClearStale clears active after staleMs with no touch', () => {
    const s = createPointerSession({ staleMs: 100 });
    s.down(1);
    expect(s.owns(1)).toBe(true);
    const t0 = s.lastAt;
    expect(s.isStale(t0 + 50)).toBe(false);
    expect(s.isStale(t0 + 150)).toBe(true);
    expect(s.maybeClearStale(t0 + 150)).toBe(true);
    expect(s.activeId).toBeNull();
    // New down still works after watchdog
    s.down(2);
    expect(s.owns(2)).toBe(true);
  });
  it('touch() refreshes lastAt so active session is not stale', () => {
    const s = createPointerSession({ staleMs: 100 });
    s.down(1);
    const t0 = s.lastAt;
    // Simulate move 80ms later via explicit touch + lastAt check
    expect(s.touch(1)).toBe(true);
    const t1 = s.lastAt;
    expect(t1).toBeGreaterThanOrEqual(t0);
    expect(s.isStale(t1 + 50)).toBe(false);
    expect(s.maybeClearStale(t1 + 50)).toBe(false);
    expect(s.owns(1)).toBe(true);
    expect(s.maybeClearStale(t1 + 150)).toBe(true);
    expect(s.activeId).toBeNull();
  });
  it('POINTER_STALE_MS is positive for production watchdog', () => {
    expect(POINTER_STALE_MS).toBeGreaterThan(200);
  });
  it('LOOK_PAD_STALE_MS is substantially longer than POINTER_STALE_MS (pause-friendly)', () => {
    expect(LOOK_PAD_STALE_MS).toBeGreaterThanOrEqual(4000);
    expect(LOOK_PAD_STALE_MS).toBeGreaterThan(POINTER_STALE_MS * 3);
  });
  it('stale clear then reclaim-on-move still delivers look deltas', () => {
    // Simulate LookPad session API: watchdog clears ownership; finger still down → reclaim via down()
    const s = createPointerSession({ staleMs: 100 });
    s.down(7);
    const t0 = s.lastAt;
    expect(s.maybeClearStale(t0 + 150)).toBe(true);
    expect(s.owns(7)).toBe(false);
    // Reclaim path (buttons !== 0 analogue): session.down(id) + seed last, then next move applies delta
    s.down(7);
    expect(s.owns(7)).toBe(true);
    clearTouchLook();
    input.reset();
    // After reclaim, a normal look sample must accumulate
    addTouchLook(12, -8);
    const [dx, dy] = input.consumeLook();
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
    expect(s.touch(7)).toBe(true);
    expect(s.owns(7)).toBe(true);
  });
});

describe('lookActivity / assist-off-while-looking', () => {
  beforeEach(() => { clearTouchLook(); input.reset(); });
  it('aimAssistLookScale is 1 at rest and →0 with high activity', () => {
    expect(aimAssistLookScale(0)).toBe(1);
    expect(aimAssistLookScale(1)).toBe(0);
    // Moderate activity should be well below 0.5 (sharper curve than 0.1.10)
    expect(aimAssistLookScale(0.5)).toBeLessThan(0.4);
  });
  it('addTouchLook raises lookActivity; scale drops', () => {
    expect(getTouchLookActivity()).toBe(0);
    expect(aimAssistLookScale(getTouchLookActivity())).toBe(1);
    addTouchLook(40, 0);
    const act = getTouchLookActivity();
    expect(act).toBeGreaterThan(0.5);
    expect(aimAssistLookScale(act)).toBeLessThan(0.5);
  });
  it('clearTouchLook / reset zeros activity', () => {
    addTouchLook(30, 10);
    clearTouchLook();
    expect(getTouchLookActivity()).toBe(0);
  });
  it('markLookPadActive zeros effective assist while finger down', () => {
    expect(isLookPadActive()).toBe(false);
    expect(effectiveAimAssistScale()).toBe(1);
    markLookPadActive(true);
    expect(isLookPadActive()).toBe(true);
    expect(isLookSuppressingAssist()).toBe(true);
    expect(effectiveAimAssistScale()).toBe(0);
    markLookPadActive(false);
    // Still suppressed briefly after release (LOOK_ASSIST_SUPPRESS_MS window from mark)
    expect(isLookSuppressingAssist()).toBe(true);
    expect(effectiveAimAssistScale()).toBe(0);
  });
  it('after look sample, assist stays suppressed for LOOK_ASSIST_SUPPRESS_MS', () => {
    addTouchLook(20, 0);
    const t0 = performance.now();
    expect(isLookSuppressingAssist(t0)).toBe(true);
    expect(effectiveAimAssistScale(t0)).toBe(0);
    // Just inside suppress window
    expect(isLookSuppressingAssist(t0 + LOOK_ASSIST_SUPPRESS_MS - 10)).toBe(true);
    // After suppress window — pad inactive, activity may still fade
    expect(isLookSuppressingAssist(t0 + LOOK_ASSIST_SUPPRESS_MS + 20)).toBe(false);
  });
  it('small intentional drag strongly reduces assist scale', () => {
    // Slow turn (~8px) should still raise activity enough to cut assist
    addTouchLook(8, 0);
    addTouchLook(8, 0);
    const scale = aimAssistLookScale(getTouchLookActivity());
    expect(scale).toBeLessThan(0.55);
  });
});

describe('aim assist', () => {
  const eye = { x: 0, y: 1.25, z: 0 };
  it('pulls yaw toward a visible enemy in cone', () => {
    const enemies = [{ active: true, dead: false, pos: { x: 2, y: 0, z: -8 }, aimY: 0.7 }];
    const r = computeAimAssist({
      yaw: 0, pitch: 0, eye, enemies,
      raycast: () => null,
      maxAngle: AIM_ASSIST.maxAngle * 2, pull: 1,
    });
    expect(r.locked).toBe(true);
    expect(Math.abs(r.dyaw) + Math.abs(r.dpitch)).toBeGreaterThan(0.001);
  });
  it('ignores enemies behind walls (no wall lock)', () => {
    const enemies = [{ active: true, dead: false, pos: { x: 0, y: 0, z: -10 }, aimY: 0.7 }];
    const r = computeAimAssist({
      yaw: 0, pitch: 0, eye, enemies,
      raycast: () => 2,
      pull: 1,
    });
    expect(r.locked).toBe(false);
    expect(r.dyaw).toBe(0);
  });
  it('ignores dead / inactive / out-of-cone', () => {
    const r = computeAimAssist({
      yaw: 0, pitch: 0, eye,
      enemies: [
        { active: false, dead: false, pos: { x: 0, y: 0, z: -5 }, aimY: 0.5 },
        { active: true, dead: true, pos: { x: 0, y: 0, z: -5 }, aimY: 0.5 },
        { active: true, dead: false, pos: { x: 20, y: 0, z: 0 }, aimY: 0.5 },
      ],
      raycast: () => null,
    });
    expect(r.locked).toBe(false);
  });
  it('default pull is gentler than 0.26 (0.1.10) and full snap', () => {
    expect(AIM_ASSIST.pull).toBeLessThanOrEqual(0.16);
    const enemies = [{ active: true, dead: false, pos: { x: 1.5, y: 0, z: -8 }, aimY: 0.7 }];
    const full = computeAimAssist({ yaw: 0, pitch: 0, eye, enemies, raycast: () => null, pull: 1 });
    const soft = computeAimAssist({ yaw: 0, pitch: 0, eye, enemies, raycast: () => null, pull: AIM_ASSIST.pull });
    expect(Math.abs(soft.dyaw)).toBeLessThan(Math.abs(full.dyaw) + 1e-9);
  });
  it('returns finite dyaw/dpitch', () => {
    const enemies = [{ active: true, dead: false, pos: { x: 0.01, y: 0, z: -5 }, aimY: 0.7 }];
    const r = computeAimAssist({ yaw: 0, pitch: 0, eye, enemies, raycast: () => null, pull: 1 });
    expect(Number.isFinite(r.dyaw)).toBe(true);
    expect(Number.isFinite(r.dpitch)).toBe(true);
  });
});
