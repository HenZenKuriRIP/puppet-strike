# PUPPET STRIKE: Toybox Mayhem · 人偶突击队：玩具大乱斗（M6 联机版 + 世界 2：积木都市）

原创 3D 第三人称糖果射击网页游戏：6 位玩具人偶、4 把糖果武器、**12 种敌人（含 6 种糖果坦克）**、**10 种糖果子弹造型**、**更大的地图（含小地图）**、Boss「软糖国王 KING GUMMY」，冒险（3 关）与无尽生存两种模式，**新增局域网 2 人联机合作（CO-OP）**。

技术栈：TypeScript · Vite · Three.js · React Three Fiber · Drei · Rapier · Zustand · React · Tailwind · Vitest · Playwright(core) · ws（联机中继）

## 安装与运行
```bash
npm install
npm run dev          # 单人开发服务器 http://localhost:5173
npm run build        # 大小写检查 + 类型检查 + 生产构建 → dist/
npm run preview      # 预览生产构建
```


## Android 打包（P0-1 · Capacitor）

本仓库已接入 **Capacitor 8 + Android 平台**。网页 `npm` 脚本（`dev` / `build` / `test` 等）保持不变；Android 相关为增量脚本。

### 前置条件
- **Node.js ≥ 22**（Capacitor 8 CLI 要求；本仓库开发机若仍是 Node 20，请用 nvm/官方二进制切到 22 再跑 `cap`）
- **Android Studio**（含 Android SDK、JDK 17+）与一台真机或模拟器
- 本 CI/打包沙箱**没有** Android SDK / 真机，**无法在此直接产出已签名 APK** —— 请在本机 Android Studio 完成汇编与验证

### 常用命令
```bash
npm install
npm run android:sync     # build → dist/ → cap sync android
npm run android:dev      # sync 后打开 Android Studio（cap open android）
npm run android:build    # 同 sync，准备本地 Gradle 编译
npm run android:release  # sync + 打印签名/发包提示（不上传、不写密钥）
```

在 Android Studio 中：打开 `android/` → 连接设备 → Run，或 **Build → Build Bundle(s) / APK(s)**。
命令行（需本机已配置 `ANDROID_HOME` / `local.properties`）：
```bash
cd android && ./gradlew assembleDebug    # 调试包
cd android && ./gradlew assembleRelease  # 发布包（需配置签名）
```

### 签名与密钥（NEVER 提交到 Git）
1. 复制 `.env.android.example` → `.env.android`（已在 `.gitignore`）
2. 用 Android Studio 或 `keytool` 在**仓库外**生成 keystore（例如 `../secrets/puppet-strike-upload.jks`）
3. 在 `android/app` 的 release `signingConfig` 中引用本地路径，或使用 `keystore.properties` / `android/key.properties`（均已 gitignore）
4. **禁止**提交：`*.jks` / `*.keystore` / `local.properties` / `.env.android` / `secrets/`

版本号占位：`android/app/build.gradle` 中 `versionName "0.1.0"` / `versionCode 1`，发版时与根目录 `package.json` 的 `version` 一并递增。

### 行为约定（P0-1）
| 项 | 行为 |
|---|---|
| 横屏 | `AndroidManifest`：`sensorLandscape` |
| 返回键 | 对局中 → 先暂停；主菜单 → `App.exitApp()`；暂停/结算等 → 回主菜单（见 `src/native/androidBridge.ts`） |
| 切后台 | 触发 `persist()` 刷盘；**不会**静默清空存档 |
| 黑屏/恢复 | 进程未被杀：WebView 恢复后应回到原界面；被系统杀进程：冷启动 → 闪屏 → 主菜单，进度依赖 localStorage |
| 外链 / Deep link | P0-1 **未**启用 App Links；`capacitor.config.ts` 的 `allowNavigation` 保持空，仅允许可信 https 源时再填 |

图标与闪屏目前为粉色占位资源，可用 Android Studio **Image Asset** 替换 `mipmap-*` / `drawable/splash.png`。

更细状态与 **UNVERIFIED** 清单见 [`docs/P0_1_STATUS.md`](docs/P0_1_STATUS.md)。

## 局域网双人联机（CO-OP）

### 一条命令启动（推荐）
```bash
npm run dev:coop     # 同时启动：Vite 开发服务器（5173，LAN 可见）+ ws 中继服务器（8787）
```
Ctrl+C 同时停止两者。也可分开跑：终端 A `npm run server`，终端 B `npm run dev`。

只用一个端口的方式：`npm run build && npm run server`，然后两台电脑都打开 `http://房主IP:8787`（中继服务器会同时托管 `dist/`）。端口可用环境变量改：`PS_PORT=9000 npm run server`；客户端连接地址默认是 `ws://当前页面主机名:8787`，也可在网址后加 `?ws=主机[:端口]` 覆盖。

### 怎么玩
1. **房主**电脑运行 `npm run dev:coop`，浏览器打开 `http://localhost:5173`。
2. 主菜单点 **CO-OP** → **创建房间（HOST）**，会显示 **4 位房间码**（字母，例如 `MHFP`）和局域网地址。选好角色，等对方加入后点开始。
3. **另一台电脑**（同一 Wi-Fi / 路由器）浏览器打开 `http://房主IP:5173`，主菜单 **CO-OP → 加入（JOIN）**，输入 4 位房间码，或直接在自动发现的房间列表里点房间。选**不同于房主**的角色。
4. 房主点开始，双方进入同一局（冒险或生存）。

### 查找房主的局域网 IP
- **Mac**：终端执行 `ipconfig getifaddr en0`（有线网卡或其它接口可试 `en1`），或「系统设置 → 网络 → Wi-Fi → 详细信息」。
- **Windows**：命令提示符执行 `ipconfig`，看当前网卡下的 **IPv4 地址**（形如 `192.168.x.x`）。
- Linux：`hostname -I`。
- 客人在浏览器输入 `http://192.168.x.x:5173`。

### 防火墙 / 网络注意
- 房主电脑需要允许入站 **TCP 5173（页面）和 8787（联机中继）**。Mac 首次运行 node 时点「允许」；Windows 在「Windows Defender 防火墙」弹窗里勾选「专用网络」，或手动放行这两个端口。
- 两台电脑必须在同一局域网；部分公共/访客 Wi-Fi 开启了「客户端隔离」，会导致无法互访。
- 仅设计用于局域网，不含公网穿透、加密或鉴权，请勿暴露到公网。

### 联机机制
- **房主权威**：模拟（敌人、弹丸、伤害、波次、掉落）只在房主浏览器里跑；客人发送输入（40 Hz），房主广播快照（30 Hz，约 5 KB/个）；客人用 0.1 秒插值延迟渲染伙伴与敌人。
- **倒地与复活**：生命归零 = 倒地（不是出局）。存活伙伴靠近（2.8 米内）**按住 E 约 2.2 秒**可复活（50% 血）；波次清空/进入新一关时倒地者以 60% 血自动复活；双方都倒地则本局失败。
- **难度倍率**：双人时敌人数量 ×1.6、血量 ×1.45；敌人优先攻击最近的存活玩家。
- **HUD**：左上伙伴血条与名字、头顶伙伴名牌、小地图上的伙伴标记、右上连接状态与 ping。
- **断线**：客人侧在房主离开/超过 5 秒收不到快照时返回主菜单并提示「房主已离开房间 Host left the room」；房主侧检测到客人断线后继续单人。

## 操作
| 按键 | 功能 |
|---|---|
| 鼠标（点击画面锁定指针） | 瞄准；左键射击，右键瞄准缩放 |
| WASD / Space / Shift | 移动 / 跳跃 / 冲刺 |
| Q · 1-4 · 滚轮 | 切换武器；R 换弹 |
| F | 角色专属技能 |
| Ctrl 或 C | 翻滚闪避（无敌帧，建议用 C，避免 Ctrl+W 关标签） |
| **按住 E** | **（联机）复活倒地的伙伴** |
| Esc / P | 暂停（联机时的暂停行为未专门验证，见「未验证项」） |

## M6 新内容
- **糖果坦克（6 种）**：软糖坦克 gumdrop（快、三连发）· 巧克力重型坦克 choco（厚装甲、慢）· 棒棒糖炮兵 lolli（远程抛射弹，保持距离）· 薄荷旋转坦克 mint（螺旋环形弹幕）· 迷你果冻坦克 jelly（成群冲撞）· 巨型糖果坦克 mega（迷你 Boss，仅出现在无尽生存后期）。已接入冒险第 2 关波次表和生存波次表。
- **糖果子弹（10 种造型）**：软糖 / 包装糖 / 星星 / 爱心 / 豆豆 / 漩涡 / 拐杖 / 曲奇 / 缎带 / 巧克力块；全部走实例化对象池（`InstancedMesh`，只绘制活跃实例）。
- **更大的地图**：半边长 36（约为 M5 面积的 2–3 倍），分区：中央广场、河流 + 3 座桥、森林、村庄、糖果穹顶与坡道、敌人出生门、Boss 竞技场；新增弹簧垫、气球、拾取物、移动平台；带**圆形小地图**（玩家朝向、敌人、伙伴箭头）。
- **碰撞/卡住**：新地图碰撞体 + 多种子卡死测试（M5 的 16 个种子 + M6 新增 12 个种子）全部通过。

## 世界 2：积木都市（Block City）
通关世界 1 的第 1-3 关后解锁。冒险关卡 4 / 5 / 6 = 2-1 / 2-2 / 2-3（2-3 是 Boss）；生存模式与局域网联机都可在主菜单 / 大厅里选「糖果乐园 / 积木都市」地图（选择会存档）。

### 地图与视觉
全部为程序生成的积木风格：带钉砖块建筑与塔楼、街道、运河与桥、坡道、积木树、云与天际线，天空/雾/光照随世界切换（`levels/worlds.ts`，同一套渲染器原地切换 layout + 地形 + 机关）。地图边界、碰撞体、镜头碰撞都对积木地图做了检查。

### 新机关（`levels/mech.ts` + `systems/mechSim.ts`，联机由房主权威）
| 机关 | 行为 |
|---|---|
| 可推 / 可击碎巨砖 ×6 | 贴身推动；子弹/爆炸可击碎；大砖碎成两块小砖（小砖可继续击碎）；Boss 的护盾砖墙也用同一套砖块 |
| 玩具火车 | 沿矩形轨道循环，车厢撞人造成伤害，也可以站上去被带着走 |
| 升降台 ×2 | 周期升降，通往高处砖台 |
| 多米诺链 ×2 | 打倒第一块后连锁倒下，伤害范围内的敌人（85 点） |
| 传送门 ×2 对 | 玩家和敌人都会被传送，有冷却 |
| 传送带 ×2 | 把站在上面的人 / 敌人往一个方向送 |
| 风扇 ×1 | 吹走玩家并偏转弹道 |
| 弹簧垫 ×4 | 弹起（沿用世界 1 的机制） |

联机同步：火车与升降台是共享时钟 `world.time` 的纯函数，不需要同步；砖块位置/存亡、多米诺触发时间走快照的 `dy` 字段；新敌人类型追加在 `ENEMY_IDS` 末尾，保持旧快照类型索引不变。

### 新敌人（4 种，程序化积木模型，带"搭建 / 散架"动画）
- **积木士兵 bsoldier**：成群推进的近中程射手。
- **积木炮台 bturret**：固定点位（`MOUNTS`），三连发。
- **积木巨人 bgolem**：慢速重型，正面有装甲；砸地（预警圆环）和抛岩两种攻击。
- **拆楼吊车 bcrane**：固定点位，大范围横扫的拆楼臂（预警扇形）。

### Boss：积木巨像 BRICK COLOSSUS（2-3）
血量 3000，三阶段（血量 70% / 35% 切换）：
1. **积木雨**：带预警圈的落砖、砖扇、砖环。
2. **护盾砖墙**：左臂脱落，在你和 Boss 之间搭起可击碎 / 可推开的巨型护盾砖墙，并召唤积木士兵（最多同时 3 只）。
3. **货运与拆楼**：胸甲和头盔崩落露出红色核心；货运列车横扫全场（缝隙是安全道）、拆楼球、践踏范围攻击。
模型部件随阶段脱落（`partsAttached`），击败后散落成积木。

### 解锁与结算
通关 2-3 解锁第 7 位角色 **BRIX（布里克斯）**（技能：积木炮台，9 秒自动炮台）。结算页显示"世界通关 / 解锁新角色"。顺带修复了旧 bug：关卡解锁的角色此前不会出现在结算页。存档版本升到 v3（自动迁移旧存档）。

### 世界 2 平衡（脚本机器人，324 局，`docs/balance-data-w2.json`）
通关率（每格 36 局 = 6 角色 × 6 种子）：

| 技能水平 | 2-1（第 4 关） | 2-2（第 5 关） | 2-3 Boss（第 6 关） |
|---|---|---|---|
| 新手 | 75% | 69% | 72% |
| 普通 | 92% | 69% | 72% |
| 熟练 | 89% | 75% | 86% |

调参前第 5 关为 31/31/53%、第 6 关为 22/33/42%，通过削弱 bgolem / bcrane 伤害、减少第 5 关敌人、削弱 Boss 血量与各攻击伤害、限制召唤数量后上升。**2-2 与 2-3 的熟练档仍低于世界 1（接近 100%），说明世界 2 对机器人偏难；机器人不会利用机关，真人是否更容易未验证。**

### 世界 2 测试
- `src/tests/w2.world.test.ts`（世界/存档迁移/关卡表/配置）、`w2.mech.test.ts`（机关纯逻辑 + 快照）、`w2.boss.test.ts`（Boss 阶段/部件/攻击/联机快照/通关解锁）、`w2.nav.test.ts`（出生点不在几何内、12 种子卡死模拟、镜头碰撞 3000 采样）。
- `node scripts/coop-e2e.mjs` 新增场景 3：两个浏览器进入积木都市，检查地图一致、砖块位置同步、击碎同步、多米诺触发时间同步、共享时钟误差 <1.5 s、新敌人类型复制正确。
- 截图脚本：`ONLY=city,mech,enemy,boss,world node scripts/shots-w2.mjs`（需先 `npm run build:e2e` 并启动 preview 于 4174）；截图在 `screenshots/w2-*.png`。
- 打包：`python3 scripts/zip-w2.py` → `/workspace/puppet-strike-w2.zip`（不含 node_modules / dist / dist-e2e）。

### 世界 2 截图
`screenshots/w2-*.png`：w2-boss-defeat · w2-boss-intro · w2-boss-p1 · w2-boss-p1-telegraph · w2-boss-p2 · w2-boss-p2-walls · w2-boss-p3 · w2-boss-p3-attack · w2-bricks-closeup · w2-city-overview · w2-city-street · w2-coop-guest · w2-enemy-crane · w2-enemy-soldier-golem · w2-enemy-turret · w2-mech-brick-giant · w2-mech-conveyor · w2-mech-domino-falling · w2-mech-domino-standing · w2-mech-fan · w2-mech-lift · w2-mech-portal-a · w2-mech-portal-b · w2-mech-spring · w2-mech-train · w2-survival-map-choice · w2-world-map。（`w2-enemy-soldier-golem` 拍到的是敌人下落/出生过程，不是理想姿态；推砖前/后对比图未单独拍，仅有 `w2-mech-brick-giant`。）

### 世界 2 已知限制
- 敌人子弹不会破坏砖块或多米诺。
- 世界 2 里的子弹造型、拾取物、气球仍是糖果主题；主菜单背景保留上一次世界的场景。
- 火车 / 升降台携带玩家时可能有轻微抖动。
- 同屏危险区（`Hazards`）对象池上限 24。
- 平衡数据只来自脚本机器人（单人）；双人在世界 2 的平衡、真实手感、真实 GPU 帧率均未验证。

## 更新日志：搞笑击杀特效（Funny FX，2026-10-24）
- 敌人死亡时在原有彩纸/砖块爆破之上叠加卡通「搞笑爆炸包」：夸张冲击波环、玩具碎片散射（糖果世界彩色糖纸 / 积木世界砖块碎粒）、烟蘑菇、星星迸射、弹跳淡出的「砰! / BOOM! / POP!」飘字。
- 设置里新增 **搞笑击杀特效 Funny FX**（默认开）；关掉可省性能。粒子走对象池并有上限。
- 联机由房主发 `fk` 事件，客人本地回放（各自仍尊重自己的开关）。
- 截图：`screenshots/funny-kill-*.png`。

## 更新日志：打磨版（Polish，2026-10-23）
**一、奖励糖果"吃不到"的修复**（详见 `docs/POLISH_STATUS.md`，24 个新测试 `src/tests/polish.pickups.test.ts`）
- **主因**：满血 / 满弹时拾取被静默拒绝，玩家走过去没反应、糖果也不消失 → 现在会给出明确提示，并保留糖果；需要时可再回来吃。
- 掉落点没有校验：可能落在碰撞体内、移动方块上或 Boss 圈外够不到的地方 → 新增 `levels/pickupSpot.ts`，掉落点必须落在可达位置。
- 拾取判定按脚底高度，站在平台/弹簧垫上够不到 → 改为按身体范围的垂直判定。
- 新增**磁吸**：靠近后糖果被吸向玩家，不用精确贴脸；联机中客人拾取也有反馈事件（音效/特效）；小地图显示拾取物；拾取音效与特效增强。
- 糖果模型（爱心 / 包装糖）加密、倒角更圆润。

**二、敌人模型重做（不再是"方块"）**
- 共用工具 `entities/geo.ts`：倒角盒、圆角圆柱、车削体、软糖形、合并几何（砖块+凸点合为 1 次绘制）。
- **糖果世界**：发条兵、机器人炮手、弹簧兔、坦克、无人机、小丑、软糖坦克、巧克力重坦、棒棒糖炮兵、薄荷坦克、果冻坦克（半透明 + 内核 + 高光）、巨型糖果坦克——圆润倒角车身、糖霜/奶油圈、糖粒、带高光的眼睛 + 腮红 + 笑脸、滚动履带轮、呼吸 / 受击挤压 / 无人机悬停动画。
- **积木世界**：积木兵、炮塔、巨人、起重机、积木巨像——倒角积木 + 凸点、圆头 / 圆球关节 / 圆柱手臂、带高光的眼睛；顺手修复 `brickPose`：编号靠后的积木在"拼装完成"后不再错位 / 隐藏。
- 糖果世界的方块掩体加了圆角糖霜盖和糖粒（仅视觉，碰撞不变）。
- 快照格式与 `ENEMY_IDS` 未改动，联机兼容；绘制调用基本持平（中 / 高画质 182→178、204→207），三角形略降（见 `docs/POLISH_STATUS.md`）。
- 截图：`screenshots/polish-after-*.png`（阵容 `lineup-small` / `lineup-tanks` / `lineup-block`，每种敌人特写，King / Colossus 正反面，拾取物与掩体）；`polish-before-*` 为改前对比。
- 验证：vitest 174 通过 + 2 跳过；`check:case` 通过；构建通过。视觉效果仅在 SwiftShader 软件渲染的截图中检查，未在真实 GPU 上看过。

## 测试
```bash
npm test             # Vitest：151 通过，2 个按需报告默认跳过（含联机序列化/快照/插值/难度倍率/复活、糖果子弹、坦克、地图卡死测试）
npm run test:e2e     # 构建 dist-e2e（VITE_E2E=1）并用无头 Chromium 跑单人端到端流程（11 项）
npm run test:coop    # 构建 dist-e2e 并跑联机 e2e：真实 ws 服务 + 两个无头 Chromium 页面（房主/客人）
npm run check:case   # macOS/Windows 大小写安全检查（已接入 build / test）
npm run test:balance # 机器人平衡扫描（约 8.5 分钟，建议后台运行）→ docs/balance-data.json + docs/BALANCE_REPORT.md
npm run test:perf    # 无头模拟 CPU 剖析（含双人场景）→ docs/perf-sim.json
node scripts/perf-browser.mjs   # 浏览器 renderer.info + 内存循环 → docs/perf-browser.json（需先 npm run build:e2e）
node scripts/shots-m6.mjs       # M6 截图（地图/小地图/坦克/子弹）
```
e2e 需要 Chromium（`npx playwright install chromium`，或 `CHROME=/path/to/chrome`）。`dist-e2e` 由 `vite preview` 在 4174 端口提供；联机 e2e 的中继端口默认 18787（`PS_PORT`）。

联机 e2e 覆盖：房间创建/4 位码/自动列表 → 角色互斥 → 双方进入同一局 → 客人输入驱动客人角色 → 双方互相看到对方（位置误差 <0.4 m）→ 分数/击杀/敌人数同步 → 伤害与击杀同步（同一敌人 id）→ 倒地同步 → 按住 E 复活并同步 → 客人断线房主继续 → 房主断线客人回菜单带提示 → 无页面错误。

### 大小写安全（macOS / Windows）
`npm run check:case` 检查：① 路径忽略大小写后是否重名；② 无扩展名模块名冲突（例如 `arena.ts` 与 `Arena.tsx`）；③ 所有相对 import 大小写与真实文件完全一致。约定：`.tsx` 组件用 PascalCase，纯逻辑模块用 camelCase，同目录不得出现仅大小写不同的名字。

## 结果摘要（均为本机无头环境数据，详见 docs/）
- **平衡**（脚本机器人，非无敌，每格 6 种子，`docs/BALANCE_REPORT.md`，M6 加入坦克后第 2 关重新调参）：

| 技能水平 | 第 1 关 | 第 2 关 | Boss |
|---|---|---|---|
| 新手 | 86% | 64% | 72% |
| 普通 | 100% | 89% | 92% |
| 熟练 | 100% | 100% | 100% |

  （第 2 关首次加入坦克时通关率崩到 8%/56%/72%，已通过减少数量、移除第 3 波的 mega 调整。）
- **模拟 CPU**（`docs/perf-sim.json`）：常规 0.11 ms/步；满池压力 2.6 ms/步；**双人联机场景（2 玩家 + 44 敌人）房主 0.79 ms/步（p95 1.09，max 1.97），快照构建 0.044 ms、平均约 5 KB**。
- **渲染（无头 SwiftShader，1280×720，`docs/perf-browser-after.json`）**：绘制调用 Low 143 / Medium 175 / High 204；三角形 Low 19.3 万 / Medium 29.7 万 / High 41.6 万（M5 为 8.9 / 18.3 / 21.6 万，地图和装饰变大所致；已通过精简装饰几何与仅 High 画质开启远处装饰阴影，从 23.5/53/65 万降下来）。
- **联机双页面（`docs/perf-coop.json`，同一台机器两个无头页面，房主 30 个额外坦克）**：房主 667 次绘制调用 / 约 31.8 万三角形，客人 68 / 21.6 万；FPS 约 7（软件渲染，无意义）。
- **内存**（`docs/perf-browser.json`，12 轮 开始/重开/Boss/退出/切画质）：JS 堆 165–175 MB，**12 轮内无单调增长**（几何/纹理随画质回到同一水平，无泄漏迹象）。但基线高于 M5（约 45 MB），原因未深入排查，推测与更大地图/装饰有关。

## 截图
`screenshots/m6-*.png`：`m6-menu` · `m6-bullets-sheet`（10 种子弹）· `m6-bullets-fire-0..3` · `m6-tanks` / `m6-tanks-closeup` / `m6-tanks-fighting` · `m6-map-overview` / `m6-map-overview-angle` / `m6-map-river-bridge` · `m6-hud-minimap` / `m6-minimap` · 联机：`m6-coop-lobby` / `m6-coop-host` / `m6-coop-client`（两名玩家同框）/ `m6-coop-host-view` / `m6-coop-client-view` / `m6-coop-downed` / `m6-coop-disconnect`。

## 已知限制
- **客人不是真正的客户端预测**：客人自己的角色 = 最新快照 + 速度外推 + 平滑，延迟较高时转向/停止会有可感知的滞后。
- 房主浏览器标签页若被切到后台被浏览器节流，整局模拟（含客人）会变慢——房主请保持该标签页在前台。
- 最多 2 名玩家；无分屏；联机结算界面只有 MENU 按钮。
- 无加密/鉴权/公网穿透；仅局域网。
- 敌人寻路为追踪 + 卡住侧滑，非导航网格；不支持手柄/触控；仅在 Chromium 测试。

## 未验证项（请如实看待）
- **真实局域网延迟/丢包**：联机只在**一台机器上用两个无头 Chromium + 本机回环**验证过，没有两台真实电脑、没有真实 Wi-Fi。e2e 中的 ping 约 70–200 ms 是软件渲染下页面卡顿造成的，不代表真实网络。
- 真实 GPU 帧率（所有 FPS 均为 SwiftShader 软件渲染）；真人手感（灵敏度、镜头、联机操控滞后）；音频听感。
- **双人平衡**：平衡机器人只跑单人；双人倍率（×1.6 数量 / ×1.45 血量）只有单元/e2e 测试，没有双人机器人平衡数据。
- 联机时按 Esc/暂停（尤其房主暂停）对对方模拟的影响；Boss 竞技场在联机下的完整流程；小地图伙伴箭头朝向的准确性。
- 内存循环是在装饰精简之前跑的（堆基线为精简前的数值）；精简后只重测了三角形/绘制调用。
- 单人 e2e 在软件渲染下较慢（第 1 关由机器人自然通关约 460 秒），首次重跑曾因结果页按钮「未稳定」超时，已改为 `force` 点击后 11 项全部通过；这是无头软件渲染 FPS 低造成的，不是游戏逻辑错误。
- `m6-bullets-fire-*` 截图多数朝向天空，只能看到子弹造型，不展示命中效果。
- Firefox/Safari 未测；macOS/Windows 未实机运行（只做了大小写静态检查）。
- **Android APK 真机/模拟器**：本沙箱无 Java/Android SDK/真机，未执行 `assembleDebug`/`assembleRelease`，未验证横屏锁定、返回键、闪屏、切后台存档与 WebView 恢复。
