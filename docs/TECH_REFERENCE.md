# 技术参考笔记 (Tech Reference)

> 仅参考**设计思路**。下列项目多为 GPL 系许可，本项目**未复制任何代码或素材**，所有模型/音效均为程序化原创。

| 项目 | 许可 | 借鉴的设计点 |
|---|---|---|
| [bobeff/open-source-games](https://github.com/bobeff/open-source-games) | 列表本身（各条目许可各异） | 用作索引，筛选出下列 FPS/TPS 参考 |
| Xonotic (DarkPlaces) | GPLv2+ | 加速/摩擦分离的地面/空中移动模型；武器 = 数据驱动参数（refire、ammo、spread）；`sv_ticrate` 固定服务器 tick |
| Red Eclipse (Tesseract) | 代码 zlib-like / 多数素材 CC-BY-SA | 跳跃宽容度（coyote、buffer 一类的“手感”宽容）、冲刺/视角 FOV 反馈；第三人称镜头肩位 |
| AssaultCube (Cube engine) | zlib 系 + 素材各自许可 | 简洁的 hitscan 武器、后坐力累积到视角 pitch、换弹状态 |
| Hypersomnia | AGPL-3.0 | 确定性固定步长模拟、实体池/无分配热路径、武器状态机清晰分层 |

## 采用的结论
- **玩家控制器**：期望速度 → 按加速度/减速度逼近（approach），空中控制系数；coyote time + jump buffer；朝向用指数平滑。
- **Hitscan vs Projectile**：玩家 SMG 用 hitscan（射速高、反馈即时）；敌方炮手用**慢速可躲避弹丸**，让玩家有反应空间。
- **视差修正**：先从摄像机中心发射线求目标点，再从枪口向该点二次射线判定遮挡（越肩视角标准做法）。
- **武器状态机**：`ready → cooldown → ready/empty`，`* → reloading → ready`，纯函数 + 配置驱动。
- **敌人 FSM**：Idle / Patrol / Detect / Chase / Attack(带蓄力前摇) / Dead；转移逻辑纯函数，可单测。
- **固定时间步长**：渲染帧累加器，`1/60s` 逻辑 tick，最多 5 步防“死亡螺旋”；游戏状态在 React 之外的普通对象中，React 仅订阅低频 HUD 数据（Zustand）。
- **对象池**：敌人、弹丸、火花、曳光、伤害数字均预分配。
