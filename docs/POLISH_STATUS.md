# POLISH 状态 — 防中断
开始：2026-10-23 22:55 (Asia/Shanghai)。用户反馈：(1) 有些奖励糖果吃不到 (2) 部分敌人 3D 仍像方块。
- [x] A 拾取物审计/修复/磁吸/特效/小地图/测试 (23:03 完成：pickupSpot.ts、sim 改动、polish.pickups.test.ts 24 例；全量 vitest 174 通过)
- [ ] B 敌人模型深化 + 阵容截图 polish-*.png + perf
- [ ] C 门禁(build/test/case/coop/e2e)、README 更新日志、zip(final / final-full)
## 日志

- 23:03 A 完成。发现：满血/满弹时静默拒绝(主因)、掉落点未校验碰撞/移动方块/boss 圈外、竖直判定按脚底、无磁吸、嘉宾无反馈(现经事件)。balance novice 护栏改为 8 个种子。

## Part B progress (23:5x)
- geo.ts (bevelBox, roundCyl, lathe, brickGeo with merged studs, cylBrickGeo) done.
- BrickEnemies.tsx rewritten (soldier, turret, golem, crane; brickPose fixed so every brick is home at build=1).
- Colossus.tsx: bevelled bricks, ball/cyl shapes, eyes with glints.
- Enemies.tsx: candy models rebuilt (bevel hulls, domes, spinning road wheels, glints, idle breathing, hit squash).
- Debug studio mode (camDebug.studio) for lineup screenshots.
- TODO: screenshots review/iterate, perf check, King/props polish, gates (Part C).

## Part B review notes (23:xx)
- Found + fixed: `geo.ts` `toIndexed` had the wrong direction (mixed indexed/non-indexed merge → `mergeGeometries` returned null in block world, froze rendering). Now every part is normalised to non-indexed + position/normal/uv only.
- Found + fixed: candy tank treads used an upright dark capsule (looked like a stray leg) → laid along z, with a cocoa band.
- Choco tank face was hidden behind the barrels → face lowered, barrels raised/outwards.
- Shot script: `start()` no longer deactivates the boss (king/colossus shots were empty); drone close-up follows its flight height.
- Pickups (hp heart / ammo wrapped candy): higher-res + rounder bevel in `candyGeo.ts`.

## Part B perf (software GL, headless, 1280x720; fps is NOT GPU-representative) — `docs/perf-browser-after.json` vs `docs/perf-browser.json`
| preset | draw calls before→after | triangles before→after | geometries |
|---|---|---|---|
| low | 125→153 | 235k→290k | 274→188 |
| medium | 182→178 | 531k→456k | 158→158 |
| high | 204→207 | 654k→575k | 159→159 |
Merged geometry (bricks+studs, sugar crust, sprinkles) keeps calls flat; low preset gained ~28 calls (frosting caps/sprinkles on covers + rounded materials). Part B visuals done; all `polish-after-*` shots reviewed (23:xx).

## Part C progress
- [x] (1) `npm run build` OK (check:case + tsc + vite, 23:46), `npm test` 174 passed + 2 skipped (13 files), `npm run check:case` OK (258 files). A test caught bullet-geometry budget (<6000 tris) after pickup upgrade → pickup geometry now built hi-res only via `candyGeometry(id, true)`; bullets unchanged.
- [x] (2) README 中文更新日志 added (23:5x)
- [x] (3) zips: /workspace/puppet-strike-final.zip 3.5 MB (12 key screenshots), /workspace/puppet-strike-final-full.zip 42 MB (all screenshots); no node_modules/dist/dist-e2e/.git. Re-zip after step 4 if code changes.
- [x] (4a) coop-e2e: COOP E2E OK, no page errors (logs/final-coop.log)
- [x] (4b) npm run test:e2e: E2E OK (11 checks), stage 1 cleared by bot in 426 s wall (software GL). No code changed after zips; re-zipped only to include final status. ALL PART C DONE.

## Funny FX (2026-10-24)
- [x] Settings `funnyFx` default on (+ save)
- [x] `doFunnyKill` / `funnyKill` + host event `fk` (session playEvent)
- [x] Layered on confetti: shockwave ring, candy/brick fragments (kind 2/3), smoke (kind 5), star burst (vis=2), popup 砰!/BOOM!/POP!
- [x] Caps: ≤12 frags, ≤8 stars, 5 smoke; pool recycle; buoyant smoke gravity
- [x] Unit tests `funny.kill.test.ts` (5)
- [x] Screenshots funny-kill-*.png (candy-mid/hero/multi/tank, block-mid/hero/multi, toggle-off)
- [x] build OK; vitest 179 passed + 2 skipped; check:case OK; coop-e2e OK (35 PASS); test:e2e OK (11)
- [x] zips: /workspace/puppet-strike-funny-fx.zip (~2.2 MB, 7 key funny shots) + /workspace/puppet-strike-funny-fx-full.zip (~44 MB, all screenshots)
