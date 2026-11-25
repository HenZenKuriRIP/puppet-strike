# Visual Polish Status — 0.1.6-vis

Date: 2026-10-26 (Asia/Shanghai). Goal: commercial candy×combat 3D polish without touching combat/net/touch/HUD.

## Version
- `package.json`: **0.1.6**
- Android `versionCode` **7** / `versionName` **0.1.6-vis**
- APK: `/workspace/puppet-strike-debug.apk`

## Files changed
- `src/config/quality.ts` — exposure, bloomIntensity, chromaticAberration, smaa, contactShadows gates
- `src/game/entities/materials.ts` — plush sheen/iridescence, vinyl clearcoat, glossy, glow, glass transmission on high (`setMaterialTier`)
- `src/components/GameCanvas.tsx` — ACES Filmic + exposure, richer WorldLighting (warm key / cool fill / pink rim), softer tighter shadows, pedestal ContactShadows + preview rim lights, Bloom/N8AO tune, ChromaticAberration + SMAA (high)
- `src/game/levels/Decor.tsx` — richer Sky horizon, liquid chocolate river, plaza Physical floor + star light
- `src/game/levels/Arena.tsx` — richer ground/icing/cloud materials
- `src/game/effects/Effects.tsx` — candy/muzzle/blast emissive punch for bloom
- `src/tests/m3.test.ts` — quality gate assertions
- `package.json`, `android/app/build.gradle` — version bump

## Visual bullets (high vs prior)
1. ACES Filmic tone mapping, exposure ~1.15 (candy punch, not washed)
2. Warmer key + cooler fill + pink candy rim; soft god-ray-ish warm directional (no volumetrics)
3. Softer shadow bias / tighter follow frustum
4. Plush iridescence + sheen; vinyl/glossy clearcoat; glass transmission on high only
5. Bloom threshold lowered slightly; N8AO kept; subtle ChromaticAberration + SMAA on high
6. Sky richer horizon glow; chocolate river clearcoat + faster scroll
7. Plaza / icing / ground more premium Physical materials
8. Menu pedestal ContactShadows + pink/cyan rim lights
9. Candy bullets / muzzle / blasts more luminous under bloom
10. Medium stays vignette-only (no bloom/AO/CA) for mid Android; low still bare

## Gates
- `npm test`: **191 passed** | 2 skipped
- `npm run build`: OK (check:case + tsc + vite)
- Android debug APK: versionCode **7**, path `/workspace/puppet-strike-debug.apk`

## Screenshots
Saved under `docs/screenshots/`:
- `vis-menu-high.png`
- `vis-menu-chars-high.png`
- `vis-candy-overview-high.png`
- `vis-candy-plaza-high.png`
- `vis-candy-river-high.png`
- `vis-candy-player-high.png`
- `vis-block-overview-high.png`
- `vis-candy-plaza-medium.png` (medium reference)

Script: `scripts/shots-vis.mjs` (also runnable via ad-hoc preview on free port).
