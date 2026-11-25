# 0.1.14 可玩性改造记录

日期：2026-11-25（Asia/Shanghai）  
版本：`package.json` 0.1.14；Android `versionCode` 15，`versionName` `0.1.14-playability`

这是第一轮**玩法**改造，不是画面或触控修复。未宣称已在真机上验证“更好玩”。视觉、瞄准手感、联机延迟仍需真机与双机验证。

## 技能来源（只作设计参考，未执行外部脚本、未安装进项目）

- [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)（Apache-2.0）  
  已读：`skills/genres/roguelike/SKILL.md`、`skills/genres/fps-shooter/SKILL.md`、`skills/disciplines/game-ai/SKILL.md`
- [MengTo/Skills](https://github.com/MengTo/Skills)（MIT）  
  已读：`agent-skills/game-development/design-action-combat/SKILL.md`、`design-game-encounters/SKILL.md`、`tune-enemy-ai/SKILL.md`、`build-mobile-threejs-games/SKILL.md`

详细对照见仓库外工作笔记（若有）或本次开发过程记录。

## 实际完成

1. **Roguelite 决策**  
   冒险模式每波清除（非关卡最后一波）都会三选一；关卡结束后仍有关卡奖励。每次可选 **重随 1 次** 或 **跳过**。抽卡尽量让 3 张职能（火力/控制/生存/机动）不同。  
   新增 6 个改变动作的升级：翻滚装填、换弹糖波、酸糖打断、刺破泡泡、开镜贯穿、技能糖潮。原有数值升级与两个传说协同保留。  
   通关世界 1（1-3）后，新一局开始可做一次开局自选（由已有 `cleared` 推导，**存档版本仍为 3**，旧存档可直接用）。

2. **遭遇组合**  
   重写 1-1、1-2，每波最多 4 种 archetype，并有一句优先目标。生存前段限制同时出现的种类。未新做地图或敌人模型。

3. **敌人可读窗口**  
   FSM 在攻击后进入 `recover` 硬直；丢失视线且仍在 loseRange 内会 `investigate` 最后位置，不会全图锁人。棒棒糖炮兵不再无视遮挡。杂兵（发条/炮手/弹跳兔/无人机/积木士兵）对糖果冲锋枪的理想体射 TTK 被拉到约 0.6s 以上；小丑和果冻群仍更脆，方便优先处理。

未改：`touchInput.ts`、`TouchControls.tsx`、相机与瞄准辅助、全员寻路、第三世界、新角色/枪模。联机仍是 host 权威，升级选择不暂停模拟，超时自动选第一项。

## 风险与未完成 / 未验证

- 无头机器人与单元测试不能代替真机手感；触控升级弹窗后能否继续转向，必须真机回归。
- 联机只在既有自动化范围内覆盖协议/选择消息，没有双机真网验证。
- 杂兵生命上调后，平衡报告（`docs/BALANCE_REPORT.md`）是旧数据，未在本轮重跑完整 BALANCE 扫描。
- 开镜贯穿、打断、换弹糖波的手感与特效强度未做真机调参。
- 未证明“更好玩”，只完成了设计方案中的第一版可实现范围。
