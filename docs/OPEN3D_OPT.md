# 0.1.13-o3d — open-3d-skills optimization pass

Source: https://github.com/Moh4696/open-3d-skills (commit 7b04ab4, read-only reference; install.sh not run).
Repo has 8 skills: threejs-scene, site-check, frame-capture, alpha-cutout, cursor-rig, exploded-view, motion-assets, scroll-film.
Only **threejs-scene** (SKILL.md + references/performance.md, lighting.md) applies to an R3F game; site-check's
"measure frame time / draw calls per tier" idea was applied via `scripts/shots-o3d.mjs`. The others are web-marketing
(scroll films, transparent video, cursor rigs, exploded product views) and were not applicable.

Already compliant before this pass (no change needed): ACES tone mapping + per-tier exposure, one shadow-casting sun
following the target, DPR caps (1 / 1.5 / 2), instanced decor, AO+bloom only on high, Draco GLBs, quality tiers.

## Changes (src/components/GameCanvas.tsx, src/game/perf/perfStats.ts)
1. **Texel-snapped shadow frustum** (lighting: "snapped to whole texels so shadows do not shimmer") — was a 2-unit snap.
2. **One-way auto DPR tier drop** (performance.md "Auto tiering"): 3 s windows, avg > 25 ms → DPR −0.25 down to 1; never
   raises again; frames >250 ms ignored. Quality preset/settings untouched. Current DPR in `perfStats.dpr`.
3. **Shader pre-compile** (`gl.compile(scene, camera)`) when a run starts → fewer first-seconds hitches on mobile.
4. WebGL context: `powerPreference: 'high-performance'`, `stencil: false`, `preserveDrawingBuffer` only in dev/e2e
   builds (release no longer forces a buffer copy per frame — real cost on Android WebView tilers).
No combat, netcode or touch-input code was touched. No GLB changes (Blender not needed for these fixes).

## Numbers (headless Chromium + SwiftShader 1280x720 — software GL, relative only)
| preset | before frameMs / calls / tris / programs | after |
|---|---|---|
| low | 306.9 / 178 / 281.8k / 47 | 280.1 / 178 / 281.8k / 66 |
| medium | 750.3 / 212 / 456k / 59 | 926.7 / 213 / 456k / 103 |
| high | 780.8 / 246 / 575k / 78 | 740.5 / 247 / 575k / 122 |
Draw calls/triangles unchanged (already within the skill's <300 calls budget). Program count rises because shaders are
now compiled up front instead of lazily mid-fight. SwiftShader frame times are noise; verify on a real phone.
Screenshots: /workspace/o3d-{before,after}-{menu,game}-{low,medium,high}.png
