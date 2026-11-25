# P0-1 Android packaging status

**Date:** 2026-10-25 (Asia/Shanghai)  
**Scope:** Capacitor Android packaging infrastructure only.  
**Out of scope (unchanged):** gameplay, combat values, rendering, network protocol, game UI, unrelated dep upgrades, directory restructure.

## Done

| Item | Detail |
|------|--------|
| Capacitor 8 | `@capacitor/core` / `cli` / `android` 8.5.3; `@capacitor/app` 8.1.2; `@capacitor/splash-screen` 8.0.2 |
| Config | `capacitor.config.ts` — `appId` `com.puppetstrike.toybox`, `webDir` `dist`, pink splash, `androidScheme: https`, `allowNavigation` empty (notes only) |
| Vite | `base: './'` so WebView asset paths resolve offline |
| Bridge | `src/native/androidBridge.ts` — back button, background `persist()`, splash hide; wired from `src/app/main.tsx` |
| npm scripts | `android:sync`, `android:dev`, `android:build`, `android:release`, `cap:sync` (existing web scripts kept) |
| Env template | `.env.android.example` (no secrets) |
| Gitignore | keystores, `local.properties`, `.gradle`/`build`, `*.apk`/`*.aab`, `.env.android`, `secrets/` |
| Android project | `android/` via `npx cap add android` |
| Landscape | `android:screenOrientation="sensorLandscape"` |
| Versions | `versionName "0.1.0"`, `versionCode 1` placeholders |
| Splash / icons | Pink placeholder `splash.png` (land/port densities) + mipmap placeholders |
| Deep-link notes | Manifest comment + config comments; no App Links enabled |
| Docs | README「Android 打包」+ this file |
| Gates | `npm run build` and `npm test` (see below) |

## Back-button policy

1. `phase === 'playing'` → `pauseGame()`
2. `phase === 'menu'` → `App.exitApp()`
3. `paused` / `results` / `upgrade` / `won` / `lost` → `toMenu()` (then another back exits)

## Save / resume expectations

- Progress/settings use existing zustand → `localStorage` (`persist()`).
- On Capacitor `appStateChange(isActive=false)` and `pause`, bridge calls `persist()` — **no wipe, no migration**.
- If the OS keeps the WebView process: resume should show the previous UI (may flash one black frame while GL context restores — **UNVERIFIED on device**).
- If the OS kills the process: cold start → native splash → JS boot → menu; unlocked progress should reload from localStorage (**UNVERIFIED on device**).

## Deep-link / external URL allowlist

- P0-1 does **not** register App Links / custom scheme handlers beyond Capacitor defaults.
- Keep `server.allowNavigation` empty until a real HTTPS origin exists; never commit personal domains.
- When enabling App Links later: trusted hosts only, `android:autoVerify`, match allowlist.

## Commands used on this box

```bash
# Node 22 required for Capacitor 8 CLI (box system node was v20; used local Node 22 tarball for cap)
export PATH="$HOME/.local/node22/bin:$PATH"
npm install   # already had capacitor deps
npm run build
npx cap add android
# native edits (manifest / versions / splash / icons / colors)
npm run build
npm test
```

## How to build an APK (developer machine)

1. Install **Node ≥ 22**, Android Studio (SDK + JDK 17+).
2. `npm install && npm run android:sync`
3. Open `android/` in Android Studio (or `npm run android:dev`).
4. Debug: Run on emulator/device, or `cd android && ./gradlew assembleDebug`.
5. Release: copy `.env.android.example` → `.env.android`, create keystore **outside** git, configure signing, then `./gradlew assembleRelease` or Studio **Generate Signed Bundle / APK**.
6. Never commit `*.jks` / `*.keystore` / `local.properties` / `.env.android`.

## UNVERIFIED (especially: no real Android device / SDK on this box)

- **No Java / Android SDK / emulator / physical device** on the packaging sandbox → `assembleDebug` / `assembleRelease` **not run**; no APK artifact produced here.
- Landscape lock on foldables / multi-window.
- Hardware back button vs gesture navigation.
- Splash duration / hide timing on cold start.
- WebGL / Rapier / audio resume after background (black screen recovery).
- localStorage survival across process death and app updates.
- Touch controls / virtual joystick (game still keyboard/mouse oriented — out of P0-1 scope).
- Play Store listing, App Links, ProGuard/R8, 16 KB page size / targetSdk policy compliance beyond Capacitor defaults.
- Capacitor CLI Node engine: documented ≥22; system Node 20 alone cannot run `cap`.

## New / modified files (P0-1)

**New:** `capacitor.config.ts`, `src/native/androidBridge.ts`, `.env.android.example`, `scripts/android-release-hint.mjs`, `docs/P0_1_STATUS.md`, `android/**` (platform scaffold + placeholders)

**Modified:** `package.json`, `package-lock.json`, `vite.config.ts`, `src/app/main.tsx`, `index.html`, `.gitignore`, `README.md`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `android/app/src/main/res/values/colors.xml` (added), splash/mipmap assets, `ic_launcher_background.xml`

## Zip

`/workspace/puppet-strike-p0-1.zip` — source + Capacitor config + `android/` scaffold (no `node_modules`, no Gradle build outputs, no `screenshots/`, no synced `android/.../assets/public` — regenerate with `npm run android:sync`), &lt; 24 MB.
