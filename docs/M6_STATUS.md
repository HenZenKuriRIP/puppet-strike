# M6 状态 (自动维护，防中断)

最后更新：2026-10-23 16:50 (Asia/Shanghai)

## 已完成（build + vitest 均通过：106 passed / 2 skipped；check:case OK；tsc clean）
- [x] 糖果子弹：10 种 bulletVisual、实例化池、糖粒拖尾、命中爆裂、数量上限、snapshot 带 visual id（单测 + 截图 bullets-* 已有）
- [x] 糖果坦克：gumdrop/choco/lolli/mint/jelly/mega，配置驱动，已入生存/冒险波次表；平衡机器人已重跑，docs/BALANCE_REPORT.md 已更新（第2关已调参）
- [x] 大地图：ARENA.half=36，区域/桥/斜坡/玩具/传送门/小地图；碰撞与卡死测试（M5 16 seeds + M6 12 seeds）通过
- [x] 联机：server/ws-server.mjs、src/net/*、src/ui/Coop.tsx、倒地/救援、难度倍率、HUD；co-op e2e 此前通过（需重跑确认）
- [x] 平衡：stage1 86/100/100，stage2 64/89/100，boss 72/92/100 (novice/average/good)

## 待完成
- [ ] 截图：m6-menu, bullets-*, tanks, tanks-fighting 已有；缺 map-overview, map-overview-angle, map-river-bridge, hud-minimap, minimap, coop-*（shots-m6.mjs 在地图步骤中被中断）
- [ ] 重跑 `node scripts/coop-e2e.mjs`，`npm run test:e2e`
- [ ] 性能 (test:perf, perf-browser, 2 玩家+大量敌人) 与内存循环复查
- [ ] README 中文改写（M6）
- [ ] 最终 zip /workspace/puppet-strike-m6.zip

## 注意
- 长任务（balance 扫描 ≈ 8 分钟）必须 nohup 后台运行；前台 >13 分钟会导致 box 被还原。
- 运行 e2e 前 `pkill -f "vite preview"`。

## 进度更新 16:50
- [x] 截图 m6-menu/bullets-*/tanks*/map-*/hud-minimap/minimap 已生成
- [x] coop e2e（脚本含性能快照）此前 PASS（COOP E2E OK）；修复了 pointer-lock 报错与倒地检查竞态
- [x] e2e (scripts/e2e.mjs) PASS 11 checks
- [x] 性能：sim 与内存循环已测（见 docs/perf-*.json）；装饰几何削减后 triangles：low 193k/medium 297k/high 416k（削减前 235k/531k/654k）
- [ ] 最终重跑：build + vitest + coop e2e（生成 m6-coop-*.png 到 screenshots/）
- [ ] README 中文改写
- [ ] 最终 zip

## 进度更新 17:05 (Asia/Shanghai)
- [x] build + vitest 通过（106 passed / 2 skipped）
- [x] coop e2e 重跑 COOP E2E OK（全部 PASS，含 hold-E 复活；修复：复活检查前清场并关闭房主 bot、超时 20s）
- [x] 截图 m6-coop-host.png / m6-coop-client.png（两名玩家同框）+ lobby/host-view/client-view/downed/disconnect 已生成；docs/perf-coop.json 已生成
- [x] README 中文改写（M6）
- [x] zip 已刷新
- [ ] npm run test:e2e 在装饰精简后的重跑（可选）

## 17:35
- [x] npm run test:e2e 重跑 E2E OK (11 checks)（e2e.mjs 点击 #btn-menu 改 force，软件渲染下按钮 stable 检查超时）
- 全部完成，zip 已最终刷新
