# Pitch floor / LookPad reclaim fix (0.1.12-pitchfix)

**APK:** `/workspace/puppet-strike-debug.apk` (versionCode **13** / `0.1.12-pitchfix`)  
**Status date:** 2026-10-27 Asia/Shanghai  
**Symptom (CN):** 玩一会后瞄准星一直指向地上，指不到敌人，怎么转动摇杆都不行。

Prior: `docs/AIM_UI_FIX.md` (0.1.11-aim-ui / versionCode 12), `docs/TOUCH_TURN_FIX.md` (0.1.10).

## Root cause (confirmed)

### Primary — 0.1.11 LookPad watchdog regression

0.1.11 added `POINTER_STALE_MS ≈ 900` + `maybeClearStale()` on LookPad. Aim fingers often **pause mid-drag** (still down, no move events). After ~900ms the watchdog cleared `active` and set `lookPadActive=false`.

Later `pointermove` hit:

```ts
if (!session.current.owns(e.pointerId)) return;
```

→ **vertical look dead** for that finger until a new `pointerdown`. Left stick only drives WASD (never pitch), so “摇杆怎么转都不行” matches: user tried the stick to raise the reticle and nothing happened.

### Secondary — pitch slam to `CAMERA.minPitch` (-1.1)

One large WebView `clientY` jump (or stacked look deltas) can pin pitch at the floor. With look reclaim broken, the player could not pull pitch back up → reticle stared at the ground.

Checked and **not** the cause:

- Aim assist default OFF; pull soft when enabled; `effectiveAimAssistScale` zeros while looking.
- `recoilPitch` is **positive** → looks **up** (fine).
- GameCanvas look path (`consumeLook` → yaw/pitch clamp) finite guards intact.

## Fixes (0.1.12)

| Area | Change |
|------|--------|
| LookPad reclaim | On `pointermove`, if session does **not** own id but `e.buttons !== 0`, **reclaim** via `session.down(id)`, seed last pos, `markLookPadActive(true)` — skip that sample (no spike from stale last) |
| LookPad stale | `LOOK_PAD_STALE_MS = 6000` (pause-friendly); stick/hold keep `POINTER_STALE_MS = 900` |
| Joystick reclaim | Same buttons≠0 reclaim after watchdog clear |
| Look delta clamp | `LOOK_DELTA_CAP` (72px) via `clampLookDelta` inside `addTouchLook` |
| Pitch recovery | Mild ×1.32 pull-up boost when pitch ≤ minPitch+0.28 and look dy raises view |
| UX | One-shot first-run tip `右侧滑动 = 视角` (localStorage, non-blocking) |
| Combat / netcode | **Unchanged** |

## Tests

`src/tests/touch.test.ts`:

- Stale clear then reclaim-on-move still delivers look deltas
- `LOOK_PAD_STALE_MS` ≫ `POINTER_STALE_MS`
- `clampLookDelta` / `addTouchLook` per-sample cap

## Gates

| Gate | Result |
|------|--------|
| `npm test` | **PASS** — 211 tests (2 skipped) |
| `npm run build` | **PASS** (tsc + vite) |
| Debug APK | versionCode **13** / `0.1.12-pitchfix` → `/workspace/puppet-strike-debug.apk` |
| Copy to Mac | **OK** → machine `10321f81-…` `/Users/han/Downloads/puppet-strike-debug.apk` (6.7 MB) |

## Retest (real phone)

1. Play a match; drag look on **right** side; **pause finger mid-look ~1–2s** then continue sliding — view must keep turning (reclaim).
2. Intentionally look at the floor; swipe **up** on the right — pitch recovers (clamp + boost).
3. Left stick only moves; does **not** aim — confirm tip / settings row “右侧滑动 = 视角”.
4. Fire + look multi-touch still works; blur/background still clears stuck holds.
