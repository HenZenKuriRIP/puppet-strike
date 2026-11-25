# QFX Status — 0.1.7-qfx（夸张 Q弹 武器/中弹）

Date: 2026-10-26 (Asia/Shanghai). Goal: commercial cartoon TPS juice — bigger muzzle, weapon squash-stretch, candy projectile spin/trails, Q弹 enemy hit/death, amped funny kill — **without** changing damage formulas, hit detection, net event shapes, knockback/aoeRadius/fire rates, touch/HUD, or quality structure.

## Version
- `package.json`: **0.1.7**
- Android `versionCode` **8** / `versionName` **0.1.7-qfx**
- APK: `/workspace/puppet-strike-debug.apk` (aapt: versionCode=8 versionName=0.1.7-qfx)

## Files changed
- `src/config/game.ts` — cosmetic `bulletSize` / `sprinkles` bumps; `FX.hitFlashTime` / hurt&blast shake; deathPopTime kept 0.35 (corpse pool / balance); `POOLS.sparks` 600→720
- `src/game/systems/fx.ts` — longer confetti; juicier `doDmgNumber` life; `FUNNY_WORDS` +糖!/Q!/啪!; amped `doFunnyKill` shockwave/puffs/fragments/stars/POP life (caps FRAG≤12 SMOKE=5 for tests)
- `src/game/effects/Effects.tsx` — denser/faster candy spin+sprinkles; thicker longer tracers; bigger muzzle meshes (star/heart sprinkle); springy funny/crit DOM bounce; brighter muzzle light
- `src/game/entities/Puppet.tsx` — weapon mesh squash-stretch kick + bob on `shootAnim` (aim-stable)
- `src/game/entities/Enemies.tsx` — stronger hit squash/wobble/flash; jelly wobble on `deathPop`
- `src/game/systems/simulation.ts` — muzzle candy star/heart burst on fire; longer muzzleFlash; juicier hit/crit spark + gated crit shake; hurt flash burst; slightly longer blast/confetti visuals; slower shootAnim decay for kick read
- `src/app/index.css` — larger `.dmg` / `.dmg-funny` + `.dmg-crit`
- `package.json`, `android/app/build.gradle` — version bump
- `scripts/shots-qfx.mjs` — fire / hit / funny kill stills helper
- `docs/QFX_STATUS.md` — this file

## What got juicier
1. **Weapons** — bigger muzzle flash groups + light; star/heart sprinkle burst on fire; weapon Y-squash → spring back; denser candy trails/spin; thicker tracer ribbons; cosmetic bulletSize up
2. **Hit** — stronger white flash + Q弹 squash; bigger bouncing damage numbers; denser candy sparks; crit star burst + settings.shake punch
3. **Kill / funny** — bigger shockwave, more hang on confetti/fragments, springier POP/砰/BOOM/糖!/Q!/啪! text; jelly deathPop scale wobble
4. **Hurt / blast** — juicier hurt particles + shake; slightly longer blast rings

## Hard constraints respected
- No damage / falloff / knockback / aoeRadius / fireRate / mag changes
- Same net event types (`b`/`cf`/`pf`/`dn`/`bl`/`tr`/`fk`/`sh`/`rc`/…) with compatible fields
- funnyFx still gates `doFunnyKill`; muzzle/hit juice always-on at moderate levels; heaviest kill pack still toggled
- Touch/HUD/menus/quality structure untouched
- deathPopTime left at 0.35 so balance novice-all-clear / corpse pool occupancy stay valid

## Gates
- `npm test`: **191 passed | 2 skipped** (15 files passed | 2 skipped)
- `npm run build`: PASS
- `npm run build:e2e`: PASS
- Android: `cap sync` + `assembleDebug` PASS → `/workspace/puppet-strike-debug.apk`

## Screenshots
- `docs/screenshots/qfx-fire-muzzle.png`
- `docs/screenshots/qfx-hit-squash.png`
- `docs/screenshots/qfx-funny-kill.png`
