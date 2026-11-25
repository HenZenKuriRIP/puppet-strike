# P0-2 / P0-2b / P0-2c — Mobile touch + landscape UI

**APK:** `/workspace/puppet-strike-debug.apk` (versionCode **6** / `0.1.5-p0.2e`)
**Status date:** 2026-10-26 Asia/Shanghai  
**Device verify:** **UNVERIFIED** (no physical Android phone in this environment; Playwright 812×375 + build/test only)

## Exact root causes (P0-2c)

1. **Menu `pointer-events: none` + full-screen WebGL canvas**  
   `MainMenu` root used `pointer-events-none` with only child buttons `pointer-events-auto`. Finger pans on empty/chrome areas fell through to `GameCanvas` (`absolute inset-0` WebGL), which captured the gesture → **no scroll**.

2. **`overflow: hidden` chain + fixed body**  
   `html/body/#root { overflow: hidden }` and `html[data-touch-ui] body { position: fixed }` block document scroll. Nested `.menu-scroll-panel { overflow: hidden }` then clipped settings without a reliable pan viewport on Android WebView.

3. **Combat HUD absolute stacking + look-pad**  
   HP/ammo used `transform: scale` over bottom controls; look-pad was `height: 100%` on the right 58%, covering fire/ADS hit targets and contributing to “UI overlapping”.

*(Document-level touchmove `preventDefault` was already scoped / not the menu blocker; TouchControls already unmounted when `phase !== 'playing'`.)*

## Fixes applied (P0-2c)

| Fix | Detail |
|-----|--------|
| `.ui-screen` shells | `pointer-events: auto; overflow: auto; touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch; overscroll-behavior: contain` for menu/play/chars/coop/pause/upgrade/end |
| Settings sheet | `position: fixed` full-screen scroller + sticky title bar; body content unrestricted height |
| GameCanvas | `pointer-events: none` unless desktop playing (touch uses TouchControls) |
| Look pad | Right 55%, bottom reserved (`--touch-bottom`) so it never covers stick/fire row |
| Combat HUD | Top-corner zones, no scale stacking; hide weapon strip + desktop key badges on touch; no HUD under pause |
| Pinch block | Only on `#touch-controls` while playing — never document-wide |
| versionCode | **4** / `0.1.3-p0.2c` |

## Gates

| Gate | Result |
|------|--------|
| `npm test` | PASS 190 / skip 2 |
| `npm run build` (tsc + vite) | PASS |
| Playwright scroll probe 812×375 | `canScroll:true`, `scrolled:true`, `canvasPe:none`, sheet `position:fixed` |
| Debug APK | PASS → `/workspace/puppet-strike-debug.apk` |

## Screenshots

- `docs/screenshots/p0-2c-desktop-menu.png`
- `docs/screenshots/p0-2c-desktop-settings.png`
- `docs/screenshots/p0-2c-desktop-play.png`
- `docs/screenshots/p0-2c-812x375-menu.png`
- `docs/screenshots/p0-2c-812x375-settings.png`
- `docs/screenshots/p0-2c-812x375-settings-scrolled.png`
- `docs/screenshots/p0-2c-812x375-chars.png`

## P0-2d — Character select landscape (2026-10-26)

**Problem:** On 812×375, detail card, horizontal char row, back button, lock text, and 3D lineup stacked/occluded each other.

**Fix:** Side-by-side `char-body` grid (detail | pick grid); sticky `char-head` with back; clamped fonts; safe-area; MenuShowcase characters view = single selected preview only.

**Screens:** `docs/screenshots/p0-2d-chars-812x375-before.png`, `...-after.png`  
**Probe:** overlapsBack=[], overlapsDetail=[], 7/7 cards visible.

**Files:** `src/ui/MainMenu.tsx`, `src/app/index.css`, `src/components/GameCanvas.tsx`, `android/app/build.gradle`, `package.json`, `docs/P0_2_STATUS.md`, `docs/screenshots/p0-2d-chars-812x375-*.png`

## P0-2e — Main menu START + Settings landscape (2026-10-26 Asia/Shanghai)

**Problem:** Play-mode 「开始 START」 clipped inside survival card on 812×375; main menu CONTROLS/SETTINGS cramped/near-clip; settings lower rows felt clipped with weak scroll affordance.

**Fix:**
- Main menu: `menu-main-grid` (hero | selected + horizontal action row); clear 44px+ PLAY tap; no title/button/selected overlaps; safe-area padding.
- Play select: header with back; compact side-by-side `mode-card`s; START always in-card (`startInCard`, `hitAt90`); overflow visible.
- Settings: sectioned 操作 / 画面 / 存档; denser toggles grid; `ui-sheet-panel` + sticky bar + scrollable body; safe-area.

**Gates:** `npm test` 190 pass / 2 skip; `npm run build` PASS; Playwright 812×375 menu overlaps=[]; play START visible+tappable; settings `canScroll:true` `scrolled:true`.

**Screens:**  
- before: `docs/screenshots/p0-2e-menu-812x375-before.png`, `p0-2e-play-812x375-before.png`, `p0-2e-settings-812x375-before.png`  
- after: `docs/screenshots/p0-2e-menu-812x375-after.png`, `p0-2e-play-812x375-after.png`, `p0-2e-settings-812x375-after.png`, `p0-2e-settings-812x375-scrolled.png`

**Files:** `src/ui/MainMenu.tsx`, `src/ui/Settings.tsx`, `src/app/index.css`, `android/app/build.gradle`, `package.json`, `docs/P0_2_STATUS.md`

**Device verify:** **UNVERIFIED** (no physical phone).

