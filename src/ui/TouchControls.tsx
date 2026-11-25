/**
 * Combat-only touch HUD. Unmounts when not playing so menus can receive finger pans.
 * Stick + fire/ADS/dodge/skill/reload/swap → shared `input`.
 *
 * Android WebView often drops pointerup / fires lostpointercapture without a matching
 * up after long sessions / multi-touch. Pointer sessions steal on down + clear on lost.
 * 0.1.11: stale-pointer watchdog + look-pad active flag zeros aim assist while dragging.
 * 0.1.12: LookPad reclaim-on-move after watchdog + longer look stale; per-sample look delta clamp.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { preferTouchControls } from '../game/core/touchDetect';
import {
  addTouchLook, clearTouchMove, createPointerSession, markLookPadActive,
  LOOK_PAD_STALE_MS, POINTER_STALE_MS, resetTouchInput, setTouchHold, setTouchMove, tapTouch,
  TOUCH_RESET_EVENT,
} from '../game/core/touchInput';
import { useUI } from '../app/store';
import { CHAR_SKILLS } from '../game/characters/registry';

function useShowTouch() {
  const [show, setShow] = useState(() => preferTouchControls());
  useEffect(() => {
    const upd = () => setShow(preferTouchControls());
    upd();
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener?.('change', upd);
    window.addEventListener('resize', upd);
    return () => { mq.removeEventListener?.('change', upd); window.removeEventListener('resize', upd); };
  }, []);
  return show;
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const session = useRef(createPointerSession({ staleMs: POINTER_STALE_MS }));
  const R = 48;

  const release = useCallback(() => {
    session.current.reset();
    setKnob({ x: 0, y: 0 });
    clearTouchMove();
  }, []);

  useEffect(() => {
    const onReset = () => release();
    window.addEventListener(TOUCH_RESET_EVENT, onReset);
    return () => window.removeEventListener(TOUCH_RESET_EVENT, onReset);
  }, [release]);

  // Watchdog: stuck stick pointer with no move → force release
  useEffect(() => {
    const id = window.setInterval(() => {
      if (session.current.maybeClearStale()) {
        setKnob({ x: 0, y: 0 });
        clearTouchMove();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    session.current.down(e.pointerId);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    move(e);
  };
  const move = (e: React.PointerEvent | PointerEvent) => {
    if (!base.current) return;
    // Reclaim after watchdog clear while finger still down (buttons !== 0)
    if (!session.current.owns(e.pointerId)) {
      const buttons = 'buttons' in e ? e.buttons : 0;
      if (!buttons) return;
      session.current.down(e.pointerId);
    }
    session.current.touch(e.pointerId);
    const r = base.current.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    setKnob({ x: dx, y: dy });
    setTouchMove(dx / R, dy / R);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!session.current.up(e.pointerId)) return;
    setKnob({ x: 0, y: 0 });
    clearTouchMove();
  };
  const onLost = (e: React.PointerEvent) => {
    if (!session.current.lost(e.pointerId)) return;
    setKnob({ x: 0, y: 0 });
    clearTouchMove();
  };

  return (
    <div id="touch-move" className="touch-stick" ref={base} aria-label="移动"
      onPointerDown={onDown} onPointerMove={move} onPointerUp={onUp} onPointerCancel={onUp}
      onLostPointerCapture={onLost}>
      <div className="touch-stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Look zone: top-right only — never covers bottom action buttons or left stick. */
function LookPad() {
  // Longer stale than stick/hold: aim finger often pauses mid-drag without releasing.
  const session = useRef(createPointerSession({ staleMs: LOOK_PAD_STALE_MS }));
  const last = useRef({ x: 0, y: 0 });

  const clearLook = useCallback(() => {
    session.current.reset();
    markLookPadActive(false);
  }, []);

  useEffect(() => {
    const onReset = () => clearLook();
    window.addEventListener(TOUCH_RESET_EVENT, onReset);
    return () => window.removeEventListener(TOUCH_RESET_EVENT, onReset);
  }, [clearLook]);

  // Watchdog: orphaned look id with no move for LOOK_PAD_STALE_MS → clear (reclaim-on-move recovers live fingers)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (session.current.maybeClearStale()) markLookPadActive(false);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.('.touch-btn, .touch-stick, .touch-fire')) return;
    e.preventDefault();
    // Steal: force-release previous stuck pointerId so new digests work
    session.current.down(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY };
    markLookPadActive(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    // 0.1.12 reclaim: watchdog may have cleared ownership while finger still down + paused.
    // If buttons !== 0, re-own and seed last pos (skip this sample to avoid huge jump from stale last).
    if (!session.current.owns(e.pointerId)) {
      if (e.buttons === 0) return;
      session.current.down(e.pointerId);
      last.current = { x: e.clientX, y: e.clientY };
      markLookPadActive(true);
      return;
    }
    session.current.touch(e.pointerId);
    const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    if (Number.isFinite(dx) && Number.isFinite(dy)) addTouchLook(dx, dy);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!session.current.up(e.pointerId)) return;
    markLookPadActive(false);
  };
  const onLost = (e: React.PointerEvent) => {
    if (!session.current.lost(e.pointerId)) return;
    markLookPadActive(false);
  };
  return (
    <div id="touch-look" className="touch-look"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onLostPointerCapture={onLost} />
  );
}

function HoldBtn({ id, icon, aria, cls, hold, onTap }: {
  id: string; icon: string; aria: string; cls?: string;
  hold?: 'fire' | 'ads' | 'revive'; onTap?: () => void;
}) {
  const session = useRef(createPointerSession({ staleMs: POINTER_STALE_MS }));

  const releaseHold = useCallback(() => {
    session.current.reset();
    if (hold) setTouchHold(hold, false);
  }, [hold]);

  const down = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    // Steal stuck fire/ADS pointer so a new finger always works (multi-touch with look)
    session.current.down(e.pointerId);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (hold) setTouchHold(hold, true);
    onTap?.();
  }, [hold, onTap]);
  const up = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!session.current.up(e.pointerId)) return;
    if (hold) setTouchHold(hold, false);
  }, [hold]);
  const lost = useCallback((e: React.PointerEvent) => {
    if (!session.current.lost(e.pointerId)) return;
    if (hold) setTouchHold(hold, false);
  }, [hold]);

  useEffect(() => {
    const onReset = () => releaseHold();
    window.addEventListener(TOUCH_RESET_EVENT, onReset);
    return () => window.removeEventListener(TOUCH_RESET_EVENT, onReset);
  }, [releaseHold]);

  // Watchdog for stuck hold (fire stuck true forever)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (session.current.maybeClearStale() && hold) setTouchHold(hold, false);
    }, 250);
    return () => window.clearInterval(id);
  }, [hold]);

  return (
    <button type="button" id={id} className={`touch-btn ${cls ?? ''}`} aria-label={aria}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={lost}>
      <span className="touch-btn-main">{icon}</span>
    </button>
  );
}

const LOOK_HINT_KEY = 'ps-look-hint-v1';

export function TouchControls() {
  const show = useShowTouch();
  const phase = useUI((s) => s.phase);
  const char = useUI((s) => s.character);
  const hint = useUI((s) => s.hint);
  const downed = useUI((s) => s.downed);
  const playing = phase === 'playing';
  const [lookHint, setLookHint] = useState(false);

  useEffect(() => {
    if (show) document.documentElement.dataset.touchUi = '1';
  }, [show]);

  // Light UX: one-line first-run tip that 右侧滑动 = 视角 (does not block input)
  useEffect(() => {
    if (!show || !playing) return;
    try {
      if (localStorage.getItem(LOOK_HINT_KEY)) return;
      localStorage.setItem(LOOK_HINT_KEY, '1');
    } catch { /* private mode */ }
    setLookHint(true);
    const t = window.setTimeout(() => setLookHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [show, playing]);

  useEffect(() => {
    if (!playing) resetTouchInput();
    return () => resetTouchInput();
  }, [playing]);

  // Global lifecycle: Android WebView drops pointers on blur / background / tab hide / focus flicker.
  useEffect(() => {
    if (!show || !playing) return;
    const broadcastReset = () => {
      resetTouchInput();
      window.dispatchEvent(new Event(TOUCH_RESET_EVENT));
    };
    const onVis = () => {
      // Both hidden AND return-to-visible: clear stuck sessions from mid-gesture interruptions
      if (document.visibilityState === 'hidden') broadcastReset();
    };
    const onFocus = () => {
      // Focus regain after system UI / notification can leave pointer stuck without events
      // Soft clear look pad only if we think a pad is active with no recent samples — handled by watchdog.
    };
    window.addEventListener('blur', broadcastReset);
    window.addEventListener('pagehide', broadcastReset);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', broadcastReset);
      window.removeEventListener('pagehide', broadcastReset);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [show, playing]);

  // Pinch-block ONLY on the combat overlay element — never document-wide (that kills menu scroll).
  useEffect(() => {
    if (!show || !playing) return;
    const el = document.getElementById('touch-controls');
    if (!el) return;
    const block = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [show, playing]);

  if (!show || !playing) return null;
  const sk = CHAR_SKILLS[char];
  const needRevive = (!!hint && hint.includes('E')) || downed;

  return (
    <div id="touch-controls" className="touch-root" aria-hidden={false}>
      <LookPad />
      {lookHint && (
        <div className="touch-look-hint" aria-live="polite">右侧滑动 = 视角</div>
      )}
      <div className="touch-safe touch-left">
        <Joystick />
      </div>
      <div className="touch-safe touch-right">
        <div className="touch-right-col">
          <HoldBtn id="touch-ads" icon="◎" aria="瞄准" cls="touch-btn-sm" hold="ads" />
          <HoldBtn id="touch-dodge" icon="🌀" aria="闪避" cls="touch-btn-sm" onTap={() => tapTouch('KeyC')} />
          <HoldBtn id="touch-skill" icon={sk.icon} aria="技能" cls="touch-btn-sm touch-skill" onTap={() => tapTouch('KeyF')} />
          <HoldBtn id="touch-reload" icon="↺" aria="换弹" cls="touch-btn-sm" onTap={() => tapTouch('KeyR')} />
          <HoldBtn id="touch-swap" icon="⇄" aria="切枪" cls="touch-btn-sm" onTap={() => tapTouch('KeyQ')} />
          {needRevive && (
            <HoldBtn id="touch-revive" icon="✚" aria="救援" cls="touch-btn-sm touch-revive" hold="revive" />
          )}
        </div>
        <HoldBtn id="touch-fire" icon="🔥" aria="射击" cls="touch-fire" hold="fire" />
      </div>
    </div>
  );
}
