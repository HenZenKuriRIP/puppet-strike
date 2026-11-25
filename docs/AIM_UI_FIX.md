# Aim + premium UI fix (0.1.11-aim-ui)

**APK:** `/workspace/puppet-strike-debug.apk` (versionCode **12** / `0.1.11-aim-ui`)  
**Status date:** 2026-10-26 Asia/Shanghai  
**Symptom (CN):** 玩一会后仍无法调整瞄准方向；主菜单/设置页过于丑陋、缺少高级感。

Prior fix: `docs/TOUCH_TURN_FIX.md` (0.1.10-touchfix / versionCode 11).

## Root cause remaining after 0.1.10

### 1) Aim assist still fighting intentional look (primary “can’t turn”)

0.1.10 lowered pull `0.32→0.26` and scaled by `lookActivity` EMA, but:

- Assist stayed **on by default**.
- Activity decay window was only **120ms** — brief pauses mid-turn re-enabled pull.
- Moderate / slow drags did not drive activity high enough (`mag/18` threshold).
- Assist applied every frame even while the LookPad finger was down.

Result: with enemies in cone, yaw kept snapping back → felt like “无法调整瞄准方向”.

### 2) Stale pointer edge cases still possible

Pointer steal + `lostpointercapture` covered the main WebView bug, but long sessions could still leave:

- LookPad / Joystick / HoldBtn `active` non-null with **no further move events** (gesture interrupted without up/lost).
- Fire hold stuck `true` interacting with look multi-touch.

No watchdog meant recovery required remount / pause.

## Fixes (0.1.11)

| Area | Change |
|------|--------|
| Settings default | **触摸辅助瞄准 default OFF** (`aimAssist: false`) |
| `AIM_ASSIST.pull` | `0.26` → **`0.14`** (if user re-enables) |
| `touchInput` | `markLookPadActive` / `isLookSuppressingAssist` — assist scale **0** while pad finger down + **320ms** after last look sample |
| lookActivity | Stronger EMA (`mag/10`, idle **280ms**); sharper `aimAssistLookScale` (`t²×3.5`) |
| `effectiveAimAssistScale()` | Combined gate used by GameCanvas |
| Pointer session | Optional `staleMs` + `touch()` / `maybeClearStale()` **watchdog** (~900ms) |
| LookPad / Joystick / HoldBtn | Watchdog intervals; HoldBtn uses steal session like LookPad |
| Finite guards | `addTouchLook` ignores NaN/Inf; GameCanvas yaw/pitch finite guards kept |
| Combat / netcode | **Unchanged** |

## Part B — Premium menu / settings

Candy toybox identity kept (sakura / mint / lavender / cream), elevated:

- Layered glass panels (`glass-card` / `glass-panel` / `glass-inset`)
- Hero splash treatment (badge + glow + gradient title)
- Selected character card with avatar hierarchy
- Dominant PLAY CTA (`cta-play`)
- Settings: section cards, pill segmented quality control, custom switch rows, refined ranges
- Sheet modal: gradient chrome bar + soft glass body
- Landscape / scroll / `.ui-screen` pointer-events unchanged; test ids preserved (`btn-play`, `btn-settings`, `aim-assist-toggle`, `music-toggle`, `q-*`, …)

Files: `src/ui/MainMenu.tsx`, `src/ui/Settings.tsx`, `src/app/index.css`.

## Tests

`src/tests/touch.test.ts` extended:

- Watchdog `maybeClearStale` / `touch()` refresh
- Fire+look multi-touch steal independence
- Assist-off-while-looking / suppress window / sharper scale
- Non-finite look deltas ignored
- Default pull ≤ 0.16

## Gates

| Gate | Result |
|------|--------|
| `npm test` | **PASS** — 207 tests |
| `npm run build` | **PASS** (vite production) |
| `npx cap sync android` | **PASS** (Node 22) |
| `./gradlew assembleDebug` | **PASS** |
| Debug APK | versionCode **12** / `0.1.11-aim-ui` → `/workspace/puppet-strike-debug.apk` (6.7 MB) |
| Copy to Mac | **OK** → machine `10321f81-…` `/Users/han/Downloads/puppet-strike-debug.apk` |

## Retest notes (real phone)

1. Fresh install or clear app data so aim assist default is **off**.
2. Play several minutes: look pad + fire multi-touch; background app and resume; confirm look still works.
3. Optionally enable 触摸辅助瞄准 — verify turning away from enemy clusters is still free (suppress while dragging).
4. Open 设置 / 操作 sheets in landscape; confirm scroll + close.
