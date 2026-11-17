# 飞行棋 · 开发计划（M0 输出）

> 本文是开发前的计划与风险清单，经确认后进入 M1。

---

## 一、已勘察的现状

| 项 | 现状 |
|---|---|
| 工作区 | `Game/Flying Chess/FlyingChessWorkSpace/`（目前只有本计划的骰子原型 `prototype/`） |
| 棋盘素材 | `Game/Flying Chess/素材/Map/flying_chess.svg`（900×900，坐标完整） |
| 主服务 | `Game/UNO/UNO WorkSpace/`：Express 5 + Socket.IO，`server/app.ts` 是总入口，端口 3000 |
| 接入模板 | 大富翁（commit `ca395be`）刚按《服务器统一与承载计划》A3 并入主服务，可直接照抄 |
| 认证 | `server/auth.ts` 统一账号，`auth.verifyToken(token)`；`accounts.json` 在 `data/` |
| 社交 | `shared/social.ts` 的 `GameKind`、`server/social.ts` 的房间号校验、`FriendsPage.tsx` 的标签与观战链接 |
| 首页 | `client/src/components/LobbyProfile.tsx`，每个游戏一个 `<section className="game-feature panel">` + 封面组件 |
| Node | v24.11.1，npm 11.6.2；主服务已有 react 19 / socket.io 4 / vite 8 / vitest |

棋盘 SVG 的坐标统计：**52 格外环 + 4×5 格跑道 + 4 角基地（各 4 个停机位）+ 4 条捷径虚线箭头 + 四角装饰圆**。坐标不是原创，`<desc>` 注明来自 `SweetMikann/aeroplane-chess`（CC BY 4.0，作者 规则 Mikann / 棋盘 Damien / 程序 澄），**必须在 CREDITS.md 署名**，不能写成"原创"。

---

## 二、骰子选型（截图已发）

原型页在 `prototype/index.html` 与 `prototype/oss.html`，截图在 `prototype/shots/`。

| 方案 | 说明 | 结论 |
|---|---|---|
| A 象牙 | 暖白骰身 + 炭黑点，圆角立方体，假阴影 | **推荐** |
| B 墨石 | 深灰骰身 + 象牙点 | 备选（中央更压得住，但和深色 UI 融合） |
| C 瓷白描边 | 近白 + 每面细描边，最轻 | 备选 |
| D CSS 3D | 无 WebGL / prefers-reduced-motion 的降级 | **必做** |
| 开源 dice-box 材质 | paper / stone / marble / speckles / wood（MIT） | 仅作观感参考，**不引入** |

**不采用 dice-box-threejs**：它依赖 Babylon.js + Cannon 跑真实物理，体积与 CPU 成本与"服务端定结果、只播预设动画"的设计目标冲突。我们自建极简 Three.js 骰子（`RoundedBoxGeometry` + Canvas 图集纹理 + 假阴影），保持 1 个 draw call。

---

## 三、需要你决定的两件事

### 决策 1：承载方式（影响最大）

| 方案 | 做法 | 代价 |
|---|---|---|
| **A（推荐）** | 照大富翁 A3 规范：`registerFlyingChess(app, io)` 挂进主服务，独立 namespace `/flying-chess`，独立数据目录 `server/data/flying-chess/`，无新端口 | 与"独立进程/独立端口"的字面要求不符，但与最新架构决定一致 |
| B | 独立进程 + 独立内部端口（如 3010），Nginx 反代 | 要自己接认证（读同一份 accounts.json 或调主服务校验）、好友/在线状态无法共享、多一个 systemd 单元 |

推荐 A 的理由：大富翁刚按这套规范落地并提交；共享账号后，飞行棋才能出现在好友列表、支持邀请码与观战链接；也不触碰 18815 (OpenClaw) 与其它服务。

### 决策 2：棋盘是否严格照搬 SVG

我按你给的 SVG 提取坐标表（52 环 + 跑道 + 捷径点），保持格数、顺逆时针、起飞位、捷径起终点完全一致；只重绘视觉（描边、圆点、配色统一到站点低饱和风格）。

若你希望改格数或路线，现在说，改坐标表比改完再改便宜得多。

---

## 四、架构

```
Flying Chess/FlyingChessWorkSpace/
  src/
    shared/          纯逻辑，无 IO —— 规则引擎与坐标表
      board.ts       52 环 + 4 跑道 + 基地 + 捷径 的坐标与索引
      rules.ts       移动合法性、撞机、安全格、捷径、终点、胜负
      protocol.ts    动作与状态类型
    server/          房间、持久化、Socket.IO 接入
      index.ts       registerFlyingChess(app, io, deps)
      room.ts        单房间状态机
      rooms.ts       房间管理与落盘
    client/
      FlyingChessEntry.tsx   路由入口 + 账号会话
      GameTable.tsx          对局界面
      board/Board.tsx        程序生成 SVG 棋盘
      board/Plane.tsx        阵营着色 SVG 飞机
      dice/Dice3D.tsx        Three.js 骰子（懒加载 chunk）
      dice/fallback.tsx      CSS 3D 降级
      ui/...                 大厅、等待室、规则说明、事件提示
  tests/unit/rules.test.ts
  tools/  CREDITS.md
```

**服务端是唯一可信状态**：骰子点数、合法移动、撞机、捷径、胜负全部服务端计算；客户端只发 `{type:"roll"}` / `{type:"move", planeId}`。所有客户端动作带规则校验与幂等保护。

---

## 五、阶段计划

### M1 棋盘与骰子（先出可看的成品）
1. 从 SVG 提取坐标表 → `shared/board.ts`，写一个校验脚本确认 52 环闭合、跑道入口唯一、捷径点对齐。
2. `Board.tsx` 程序生成 SVG：四角基地、环线、跑道、捷径箭头、安全格，响应式（桌面 / 平板 / 手机横竖屏）。
3. `Plane.tsx` 原创 SVG 飞机图标，按阵营着色，同格多机用偏移错位排布（不遮挡）。
4. `Dice3D.tsx`：Canvas 图集纹理、预设翻滚关键帧、终止四元数精确停在点数上、按需渲染（静止即停）、`visibilitychange` 暂停、`dispose` 完整释放、`devicePixelRatio` 上限 2（手机 1.5）、低端机关抗锯齿、Three.js 独立 chunk 懒加载。
5. 性能基线：记录首次加载增量体积、桌面 fps、手机 fps，写进 `docs/PERFORMANCE.md`。
6. **验收**：四种配色各摆一盘静止对局截图；掷骰动画停点正确。

### M2 规则引擎 + 单元测试
- 起飞（5/6 vs 仅 6）、6 点额外回合、连续三次 6 作废、精确抵达终点、撞机、安全格、捷径、无合法移动自动结束、四架到达获胜。
- 特殊情况优先级按提示词：普通移动 → 捷径 → 撞机（安全格豁免）→ 终点 → 额外回合。
- `vitest` 覆盖上述每条，含边界（越过终点、同格多机、捷径落点有敌机）。

### M3 房间与联机
- 大厅（创建/加入/列表/在线）、房间（2–4 人、自动分色、房主设置、满员开始、房主移交、解散）。
- 断线重连：刷新回原座位，`rejoin` 校验账号在座；重连宽限期内不踢人。
- 状态与对局分离，落盘 `server/data/flying-chess/`。

### M4 接入与部署
- `server/app.ts` 注册 + namespace 鉴权中间件 + presence 注册。
- `shared/social.ts` 加 `"flying-chess"`；`FriendsPage.tsx` 加中文名与观战链接。
- `App.tsx` 加 `/flying-chess` 路由；`LobbyProfile.tsx` 加首页卡片 + 原创封面 SVG。
- `tsconfig.json` / `vite.config.ts` 加 `@flying-chess` 别名。
- Nginx：`/flying-chess` 反代到 3000（复用已有 `/socket.io` 块）。改前备份，两处配置同步。
- 部署脚本照 `scripts/deploy-full.sh` 改，带备份、健康检查、进程启动时间核对。

### M5 验收与文档
- 2/3/4 人实战、两种起飞规则、三连 6 作废、撞机/安全格/捷径/终点、并发一致、断线重连、胜负。
- Windows / 平板 / 手机布局；3D 骰子性能与降级路径。
- 全项目搜索确认飞行棋相关文件无 "LayUDown"。
- Nginx 路由与 WebSocket；原有 UNO / UNION ARENA / 本将棋 / 大富翁 / OpenClaw 全部正常。
- `CREDITS.md`（棋盘坐标 CC BY 4.0 署名 + Three.js MIT）、`README.md`、部署说明、版本记录。

---

## 六、风险清单

| 风险 | 影响 | 应对 |
|---|---|---|
| 棋盘坐标语义不明确（SVG 只给了图形，没给"第几格属于哪色"） | 路线/起飞位可能错 | M1 先按几何推导出坐标表，画一张编号图给你确认，再写规则 |
| 你给的 SVG 坐标来自 CC BY 4.0 仓库 | 许可证合规 | `CREDITS.md` 明确署名，不称原创 |
| 主服务重启影响在线的其它游戏 | 用户中断 | 部署脚本已有"有对局不重启"保护，沿用 |
| Three.js 体积 | 首屏变大 | 独立 chunk + 进房间才懒加载，并做体积预算 |
| 手机 WebGL 性能 | 掉帧/发热 | DPR 上限 1.5、关抗锯齿、静止停渲染、可降级 |
| 与主服务共享代码后 `typecheck` 变慢/报错相互牵连 | 开发体验 | 新增代码严格独立目录，只通过别名引入，不改既有文件逻辑 |

---

## 七、需要你确认

1. **承载方式**：A 并入主服务（推荐）/ B 独立进程
2. **棋盘**：严格照搬 SVG 坐标（推荐）/ 需要调整
3. **骰子**：A 象牙（推荐）/ B 墨石 / C 瓷白 / 用开源材质
4. 首页卡片与路由用 `/flying-chess`，中文名"飞行棋"——是否认可
