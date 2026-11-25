# BGM Status — 0.1.8-bgm

Date: 2026-10-26 (Asia/Shanghai). Goal: original procedural loopable music with strong rhythm, cute×combat candy aesthetic, integrated with phase/world/boss switching.

## Version
- `package.json`: **0.1.8**
- Android `versionCode` **9** / `versionName` **0.1.8-bgm**
- APK: `/workspace/puppet-strike-debug.apk`

## Tracks (`public/audio/*.ogg`)

| File | BPM | Loop | Size | When it plays |
|------|-----|------|------|---------------|
| `menu.ogg` | 115 | ~33.4s | ~283 KB | phase `menu` |
| `combat.ogg` | 134 | ~28.7s | ~300 KB | playing / paused / upgrade in **Candy Land** (no boss) |
| `combat_block.ogg` | 132 | ~29.1s | ~310 KB | same, **Block City** (`world.mapId === 'block'`) |
| `boss.ogg` | 108 | ~44.4s | ~361 KB | boss active (`ui.boss` set — King Gummy / Colossus) |
| `win.ogg` | — | ~2.6s stinger | ~15 KB | phase `won` |
| `lose.ogg` | — | ~2.6s stinger | ~13 KB | phase `lost` |

**Total OGG ≈ 1.3 MB** (under 1.5 MB budget). WAV sources in `tools/music/` .

## Character
- **menu** — bouncy pastel candy groove; kick on 1/3, clap on 2/4, plucky major arps, soft pads, light sidechain.
- **combat** — four-on-floor punch, snare+clap backbeat, driving bass, bright candy lead riff.
- **combat_block** — same energy with toy-brick / woodblock percussion + squarer bass (industrial toy feel).
- **boss** — darker Dm-ish progression, bigger kicks, half-time build → drop with denser hats and tense square lead.

All tracks are **original procedural synthesis** (numpy) — no copyrighted samples.

## Regeneration
```bash
python3 tools/gen-music.py
# needs: python3 + numpy + ffmpeg
# writes tools/music/*.wav and public/audio/*.ogg (~72–80 kbps Vorbis, 22050 Hz mono)
```

## Integration
- `src/audio/music.ts` — HTMLAudioElement dual-buffer crossfade (~0.85s), `musicGain = volume * 0.55`, pause ducks to 40%, mute at volume=0 or settings.music=false.
- `src/audio/MusicDirector.tsx` — mounted in `App`; selects track from phase + `ui.boss` + `world.mapId`; polls every 500ms while in-run so mid-stage boss swaps work.
- Unlock shares first-gesture path with SFX (`initAudio` + `initMusic` from MainMenu / actions / App click handler).
- Settings: existing **音量** drives music; optional **音乐 Music** toggle (`settings.music`, default true).

## Files changed
- `tools/gen-music.py` (new), `tools/music/*.wav`, `public/audio/*.ogg`
- `src/audio/music.ts`, `src/audio/MusicDirector.tsx` (new)
- `src/app/App.tsx`, `src/app/actions.ts`, `src/app/store.ts`
- `src/ui/MainMenu.tsx`, `src/ui/Settings.tsx`
- `src/game/progression/save.ts` (`music?: boolean`)
- test mocks for sfx also mock `music` / `MusicDirector`
- `package.json`, `android/app/build.gradle`
- `docs/BGM_STATUS.md`

## Gates
- `npm test`: **191 passed | 2 skipped** (15 files passed | 2 skipped)
- `npm run build`: PASS
- Android: `cap sync` + `assembleDebug` PASS → `/workspace/puppet-strike-debug.apk` (versionCode=9 versionName=0.1.8-bgm)
