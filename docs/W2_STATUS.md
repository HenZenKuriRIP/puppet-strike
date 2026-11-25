# W2 (World 2 Block City) 状态 — 防中断
开始：2026-10-23 18:51 (Asia/Shanghai)。zip: `python3 scripts/zip-w2.py` → /workspace/puppet-strike-w2.zip

## 计划 / 进度
- [x] (a) 世界/主题系统：`levels/worlds.ts`(candy|block, setWorld 原地切换 layout+terrain+mech)；`terrain.ts` 可变；`arenaLayout.ts` 改为 `buildCandyLayout()`+`applyLayout()`；`blockLayout.ts` 积木都市数据
- [x] (a) 冒险：stages 1–6 (`world`,`label`)；世界 2 通关 1-3 解锁；生存选图(存档 `survivalMap`)；存档 v3 迁移 + 测试 (`tests/w2.world.test.ts`)；co-op `start` 消息带 `map`
- [x] (c-data) `levels/mech.ts` 机关纯逻辑：可推/可击碎巨砖、玩具火车、升降台、多米诺链、传送门、传送带、风扇、快照
- [x] (c-glue-sim) `systems/mechSim.ts`：推砖/火车伤害/多米诺伤害/传送门(敌人也用)/传送带/风扇偏转弹道；`dy` 快照同步；`tests/w2.mech.test.ts` 23 条(含 layout 碰撞校验)；npm test 138 绿 (19:16)；修了 collision 站在升降台上被吸回地面的 bug
- [x] (c-render) `levels/BlockCity.tsx` 内 BlockMech：砖/火车/轨道/升降台/多米诺/传送门/传送带/风扇渲染 (19:25)
- [x] (b) `BlockCity.tsx`(实例化带钉砖层/塔楼/街道/运河桥/坡道/天际线/树/云) + `WorldArena.tsx`(按世界 key 重挂载, Rapier 静态碰撞) + 主题天空/雾/光(`WorldLighting`) + 小地图分世界；截图已验证 (19:25)；相机碰撞待核对
- [x] (d) 新敌人 bsoldier/bturret/bgolem/bcrane：config+AI(`stepEnemies`)+程序化积木模型(`BrickEnemies.tsx`，搭建/散架动画)+`MOUNTS` 固定点位(炮台/吊车)；npm test 115 绿 (19:07)
- [x] (e) BRICK COLOSSUS：`boss/colossus.ts`(配置/部件/货运线/砖墙位) + `stepBoss(cfg)` 通用化 + `stepColossus`(shower/fan/ring/wall/summon/stomp/train/wreck) + `Colossus.tsx` 砖块模型(部件脱落/解体) + HUD/intro/defeat；`tests/w2.boss.test.ts` 9 条；npm test 147 绿 (19:30)，zip 已刷新；**待截图验证模型**
- [ ] (f) 解锁(世界2通关→新角色) / 结算
- [ ] (g) 测试：stuck 模拟、平衡 bot 4–6、coop e2e、e2e
- [ ] (h) 截图 `screenshots/w2-*.png`、README、最终 zip

## 设计要点
- 舞台 id 全局 1–6（世界2 = 4,5,6），`nextStage` 仅限同世界。
- `ENEMY_IDS` 是快照类型索引：新敌人追加在 `king` 之后。
- 火车/升降台是共享时钟 `world.time` 的纯函数 → 不用同步；砖块/多米诺走 `dy`。
- 项目现在 tsc 干净、测试全绿；colossus 在 MODELS 里是空占位，待 (e)。

## 19:42 更新
- Colossus.tsx 模型已加入并截图验证 p1/p2 (见 screenshots/w2-boss-*.png)；修了 HUD callout 非整数 tier 导致 React 崩溃（粉屏）的 bug
- 机关/敌人/世界地图截图已出 (w2-mech-*, w2-enemy-*, w2-world-map)；脚本 `ONLY=boss,world node scripts/shots-w2.mjs`

## 19:55 更新
- (e2) 完成：boss-intro/p1/p1-telegraph/p2/p2-walls/p3/p3-attack/defeat 截图已目检（p3 头盔+胸甲脱落，defeat 积木散落）；修复 HUD callout tier 崩溃。
- (f) 完成：清 2-3 解锁 BRIX（registry/Puppet/MainMenu），runFlow `unlockedAtRunStart` 修复"关卡解锁不显示在结算页"的旧 bug；结算页 #world-unlock/#world-clear；w2.boss.test 9/9；m3 角色数测试更新为 7。
- 主菜单地图选择按钮 nowrap 修复。
- 下一步：(g) 测试 → (h) 截图 / README / 最终 zip。

## 20:35 更新 (g 进行中)
- 新增 `tests/w2.nav.test.ts`(出生点/12 种子卡死模拟/镜头碰撞，3 条绿)。coop-e2e 新增场景 3（世界 2 同步：地图/砖块位置/击碎/多米诺触发时间/共享时钟/新敌人类型）；砖数阈值改为 ≥4（地图共 6 块可推砖）。
- 平衡：首轮 W2 扫描(调参前)第 5 关 31/31/53%、第 6 关 22/33/42% → 调参：Colossus hp 4200→3000、各攻击伤害约 -35%、gap +0.4、summon maxMinions 5→3、接触 12 不变；bgolem hp 700→600 dmg 22→12 windup 1.2；bcrane dmg 28→14 windup 1.4；第 5 关去掉部分 drone/clown/gumdrop/lolli。
- 调参后完整扫描(324 局, docs/balance-data-w2.json)：4: 75/92/89；5: 69/69/75；6: 72/72/86 (新手/普通/熟练 %)。
- 待办：build/test/check:case、coop e2e、npm run test:e2e(后台)、重拍 w2-enemy-soldier-golem/survival-map-choice/推砖前后、README、最终 zip。

## 20:50 更新
- build ✓、npm test 12 files / 151 passed (+2 skipped)、check:case ✓ (210 files)；README 世界 2 章节已写。
- 待办：coop e2e、npm run test:e2e（各自独占 CPU、后台+日志）、少量重拍、最终 zip。
- 20:41 coop-e2e (调参后最新构建) 35 PASS，"COOP E2E OK"，含 8 条 W2 检查；w2-coop-guest.png 已目检。npm run test:e2e 后台运行中 (/tmp/e2e.log)。
- 21:05 npm run test:e2e 11/11 OK（独占 CPU，约 12 分钟）；w2-survival-map-choice 已重拍(nowrap 生效)；README 加截图清单。剩：最终 zip → 完成。
