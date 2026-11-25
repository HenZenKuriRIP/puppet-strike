# Touch turn / look stuck fix (0.1.10-touchfix)

**APK:** `/workspace/puppet-strike-debug.apk` (versionCode **11** / `0.1.10-touchfix`)  
**Status date:** 2026-10-26 Asia/Shanghai  
**Symptom (CN):** 玩一会后无法控制人物方向掉头 — after playing a while, cannot turn / control look direction on Android.

## Root cause (confirmed)

### Primary — stuck LookPad / Joystick `pointerId` (WebView)

`LookPad` and `Joystick` stored `active.current = e.pointerId` and only cleared it on `pointerup` / `pointercancel` for **that** id. Capacitor Android WebView frequently:

- fires `lostpointercapture` without a matching `pointerup`, or
- drops `pointercancel` after long sessions / multi-touch (fire + look),

leaving `active` non-null. All later look moves hit `if (active.current !== e.pointerId) return` → **look permanently dead** until remount.

Fire/ADS `HoldBtn` had the same class of bug: hold flags could stick `true` forever and interact badly with look.

### Secondary — aim assist fighting turn-away

`GameCanvas` applied `computeAimAssist` every touch frame with pull `0.32`. While turning away from a cluster of enemies, assist kept pulling yaw back → felt like “can’t turn around”.

## Fixes

| Area | Change |
|------|--------|
| `createPointerSession()` | Steal on new `pointerdown`; clear on `up` / `lostpointercapture` / `reset` |
| LookPad + Joystick | `onLostPointerCapture`; steal previous id on down |
| HoldBtn | Clear hold on lostcapture / cancel / global reset |
| Lifecycle | `visibilitychange` (hidden) / `blur` / `pagehide` → `resetTouchInput()` + `TOUCH_RESET_EVENT` |
| `touchInput` | `lookActivity` EMA from `addTouchLook`; `aimAssistLookScale`; `clearTouchLook`; `resetTouchInput` zeros `dx/dy` |
| GameCanvas | Multiply assist by `aimAssistLookScale(getTouchLookActivity())`; `Number.isFinite` guards on yaw/pitch |
| aimAssist | Default pull `0.32` → `0.26`; finite return guards |
| CSS | Look pad layout unchanged (right 55%, bottom reserved) — still hittable |

Combat formulas / netcode unchanged.

## Tests

`src/tests/touch.test.ts`:

- Pointer session: lostcapture without up → new id still owns; steal on down
- `aimAssistLookScale` / lookActivity reduce assist
- Existing stick / hold / assist cases still pass

## Gates

| Gate | Result |
|------|--------|
| `npm test` | PASS 199 / skip 2 (touch.test 19) |
| `npm run build` (tsc + vite) | PASS |
| Debug APK | PASS → `/workspace/puppet-strike-debug.apk` (versionCode 11 / 0.1.10-touchfix) |
