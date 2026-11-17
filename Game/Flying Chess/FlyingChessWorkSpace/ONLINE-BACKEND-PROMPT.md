# 飞行棋 · 联机后端开发提示词

> 用法：把本文件整段交给编码助手。它包含现状事实、硬性约束、协议设计与验收清单，可直接作为开工依据。

---

## 一、任务

把 `Game/Flying Chess/FlyingChessWorkSpace/` 里已经可玩的**单机版飞行棋**改造成**在线多人对局**。

单机版目前是纯前端：规则引擎在浏览器里跑，AI 也是本地算的。联机版要把它拆成"服务端裁决 + 客户端呈现"两层，并接入现有游戏平台的账号、房间与好友系统。

---

## 二、现状事实（先读代码，不要凭猜测）

开工前必须实际读这些文件，它们决定了你要复用什么：

| 文件 | 作用 |
|---|---|
| `Game/Flying Chess/FlyingChessWorkSpace/src/game/board.ts` | 棋盘坐标表：52 格环线、四色跑道、基地、捷径、起飞/入口/安全格索引 |
| `Game/Flying Chess/FlyingChessWorkSpace/src/game/rules.ts` | 规则引擎（纯函数）：`createGame` / `afterRoll` / `legalMoves` / `resolveMove` / `applyMove` / `pickAiMove` |
| `Game/Flying Chess/FlyingChessWorkSpace/tools/rules-check.ts` | 规则自检，29 条用例，当前全过。**改造后必须仍然全过** |
| `Game/Flying Chess/FlyingChessWorkSpace/src/client/App.tsx` | 当前界面与本地对局循环，`DICE_READ_MS = 1100` 是点数停留时长 |
| `Game/Flying Chess/FlyingChessWorkSpace/src/client/components/Board.tsx` | 棋盘渲染；`onPick` 是现在唯一的下子入口 |
| `Game/UNO/UNO WorkSpace/server/app.ts` | **主服务总入口**。大富翁就是在这里注册的，照抄它的模式 |
| `Game/Monopoly/MonopolyWorkSpace/src/server/` | `index.ts` / `room.ts` / `rooms.ts` / `persist.ts`——**这是现成模板，逐行读** |
| `Game/UNO/UNO WorkSpace/shared/social.ts` | `GameKind` 联合类型、`FriendProfile`、邀请房间号规则 |
| `Game/UNO/UNO WorkSpace/server/social.ts` | 邀请校验里的房间号格式正则，按 game 分支 |
| `Game/UNO/UNO WorkSpace/client/src/components/FriendsPage.tsx` | 游戏中文名表与观战链接构造 |
| `Game/UNO/UNO WorkSpace/client/src/components/LobbyProfile.tsx` | 首页游戏卡片列表 |
| `Game/UNO/UNO WorkSpace/client/src/App.tsx` | 路由分发：`/monopoly` 的写法照搬给 `/flying-chess` |
| `Game/Monopoly/MonopolyWorkSpace/tools/patch-nginx-route.py` | Nginx 改法示例 |
| `Game/UNO/UNO WorkSpace/scripts/deploy-full.sh` | 部署脚本模板 |

**关键前提**：`src/game/rules.ts` 已经是纯函数、不依赖 DOM、不改入参（`resolveMove` 只读，`applyMove` 复制后再改）。这让它能被服务端直接 import，**不要重写规则逻辑**。

---

## 三、硬性约束

1. **服务端是唯一可信状态。** 骰子点数、合法移动、撞机、捷径、终点、胜负全部由服务端裁决。客户端只发意图（"我要掷骰"、"我要动第 2 架"），服务端校验后广播结果。客户端传来的任何点数、步数、坐标一律不采信。
2. **复用账号系统。** 用主服务的 `auth.verifyToken`，不新建账号体系，不写 `accounts.json`。
3. **不破坏现有服务。** 不改 UNO / UNION ARENA / 本将棋 / 大富翁 / OpenClaw（尤其 18815 端口）的任何既有逻辑。只做增量。
4. **命名中性。** 所有文件、页面标题、界面文案、日志、注释、README 中都**不得出现 "LayUDown"**。这是个人网名，不是品牌名。游戏一律叫"飞行棋"。
5. **小步可回滚。** 改 Nginx、改主服务前先备份；每阶段完成后自测再进入下一阶段。

---

## 四、约定：承载方式

**按大富翁的 A3 规范并入主服务**，不另起独立进程、不占新端口：

- `registerFlyingChess(app, io, deps)` 挂在 `server/app.ts`
- 独立 Socket.IO namespace：`/flying-chess`
- 独立数据目录：`server/data/flying-chess/`
- 鉴权中间件：`io.of("/flying-chess").use(...)`，无有效 token 直接 `next(new Error("AUTH_REQUIRED"))`
- presence 注册：让好友列表能看到"某人在飞行棋房间"

---

## 五、协议设计

命名空间 `/flying-chess`。以下事件名与载荷是建议基线，可微调，但必须做到**每个客户端动作都带 ack**，并且**所有状态变更都以服务端广播为准**。

### 客户端 → 服务端

| 事件 | 载荷 | 说明 |
|---|---|---|
| `fc:rooms:request` | — | 请求房间列表 |
| `fc:create` | `{ maxPlayers?: 2\|3\|4, sixOnly?: boolean }` | 建房，创建者自动成为房主并占座 |
| `fc:join` | `{ roomCode: string, asSpectator?: boolean }` | 凭房间号加入 |
| `fc:leave` | — | 主动离开座位（不销毁房间） |
| `fc:config` | `{ maxPlayers?: number, sixOnly?: boolean }` | **仅房主**，且仅在对局开始前 |
| `fc:seats` | `{ color: Color \| null }` | 选择阵营色（房主可改为自动分配） |
| `fc:ready` | `{ ready: boolean }` | 准备 |
| `fc:start` | — | **仅房主**，满员且全员准备后开始 |
| `fc:roll` | `{}` | 掷骰。服务端记账，重复掷骰必须拒绝 |
| `fc:move` | `{ planeIndex: 0\|1\|2\|3 }` | 选择移动哪架飞机。服务端用 `legalMoves` 校验 |
| `fc:bot` | `{ color: Color, enabled: boolean }` | **仅房主**，把空位交给电脑托管（复用 `pickAiMove`） |
| `fc:rejoin` | `{ roomCode: string }` | 刷新/重连后回到原座位，**必须校验该账号确实在座** |
| `fc:health` | — | 健康检查 |

### 服务端 → 客户端

| 事件 | 载荷 | 说明 |
|---|---|---|
| `fc:rooms` | `RoomSummary[]` | 大厅列表，房间变动时广播给所有在线连接 |
| `fc:state` | `PublicState` | **完整对局状态**，每次变更后广播给房间内所有人 |
| `fc:error` | `{ code: string, message: string }` | 拒绝原因，客户端有自己的文案表 |

### `PublicState` 要求

必须让客户端**不需要任何本地规则推理**就能渲染：

```ts
type PublicState = {
  roomCode: string;
  players: {
    id: string; username: string; avatarUrl: string | null;
    color: Color; ready: boolean; connected: boolean; isBot: boolean;
    planes: { step: number }[];   // -1 基地，0..47 环线，48..52 跑道，53 终点
    sixStreak: number;
  }[];
  spectators: { id: string; username: string }[];
  hostId: string;
  turn: number;              // players 数组下标
  dice: number | null;       // 当前点数
  phase: "waiting" | "roll" | "move" | "over";
  winner: Color | null;
  sixOnly: boolean;
  /** 服务端给出这一步所有可合法移动的机号。客户端只用来高亮，不自己算。 */
  legalPlaneIndices: number[];
  /** 最近事件（"起飞"、"击落敌机"、"触发捷径"…），供界面提示 */
  event: string;
  /** 每次状态变更递增，客户端可用来丢弃过期广播 */
  seq: number;
};
```

---

## 六、必须解决的问题

按重要性排列。**每一条都要有代码，不能只在文档里承诺。**

### 1. 断线重连

- 断开时**不立即移除座位**，只标记 `connected: false`，保留一个宽限期（建议 90 秒）。
- 宽限期内 `fc:rejoin` 要能回到原座位，并立即收到完整 `fc:state`。
- 宽限期过后：若房间已开始对局，交给电脑托管（`isBot` 置真）；若还在等待室，释放座位。
- 刷新页面等同于断线重连——**不允许刷新就丢对局**。

### 2. 防重放与防越权

- `fc:roll` 必须校验：当前是该玩家的回合、`phase === "roll"`、没有正在进行的移动。
- `fc:move` 必须校验：当前是该玩家的回合、`phase === "move"`、`planeIndex` 出现在 `legalPlaneIndices` 里。
- 所有房主专属操作（`fc:config` / `fc:start` / `fc:bot` / 解散）校验 `accountId === hostId`。
- 同一账号多开标签页时，只有一个连接能操作（建议用最近的连接，旧连接收到只读状态）。

### 3. 骰子节奏

单机版有 `DICE_READ_MS = 1100` 的停顿让玩家看清点数。联机版**必须保留这个体验**，但停顿不能靠客户端定时器决定对局推进——否则改客户端就能跳步。

推荐做法：服务端在 `fc:roll` 后立即广播 `{ dice, phase: "move", legalPlaneIndices }`，同时用一个**服务端定时器**在 1.1 秒后广播 `phase: "awaitingMove"`（或直接在状态里带一个 `notBefore` 时间戳）通知客户端"现在可以操作了"。客户端渲染这个时间戳，而不是自己起表。超时未操作（建议 30 秒）由服务端自动替玩家走一步 `pickAiMove`。

### 4. 状态持久化与恢复

- 房间落盘到 `server/data/flying-chess/`，键用 4 位房间号。
- 进程重启后恢复未完成的房间（参照大富翁 `rooms.ts` 的 `start()` 异步恢复与 `persist`）。
- 恢复时若房间内全是断线玩家，直接标记为可回收。

### 5. 房间生命周期

- 房间号：4 位，`[A-Z2-9]`（与现有游戏保持一致，避开易混淆字符）。
- 房主退出时自动移交，移交给最先加入的剩余人类玩家。
- 房主可解散；房间里没人了自动销毁。
- 观战者可以加入对局中的房间，只能读不能操作。

### 6. 电脑托管

- 复用 `src/game/rules.ts` 里的 `pickAiMove`，**不要重写 AI**。
- 电脑托管时同样受 1.1 秒节奏和超时约束，否则一瞬间就把局面走完了。

---

## 七、客户端改造

### 1. 抽出对局层

现在 `App.tsx` 里既管 UI 又管对局循环。要拆成：

- `useFlyingChessGame()`：一个 hook，内部持有 socket，暴露 `state` / `roll()` / `move(planeIndex)` / `createRoom()` / `joinRoom()` 等。**单机模式和联机模式都走它**，只是单机模式的实现是本地 reducer。
- `GameTable` / `Board` / `Dice` 只消费这个 hook 的输出，不关心背后是服务端还是本地。

这样单机练习和联机对局共享同一套界面，也保证两条路径的规则表现一致。

### 2. 复用现有视觉

- 棋子头像（`Avatar.tsx`）、棋盘（`Board.tsx`）、骰子（`Dice.tsx`）、汉堡菜单都已完成，联机版**不要重做**。
- `Board` 的 `onPick` 改为调用 `game.move(index)`；高亮来源改成服务端返回的 `legalPlaneIndices`。
- 座位区要显示每个玩家的连接状态（离线/托管）与准备状态。

### 3. 需要新做的界面

- 大厅：房间列表（房号、人数、玩法设置、是否已开始）、创建房间、输入房号加入。
- 等待室：房号可复制、阵营色自选、准备按钮、房主设置（人数/起飞规则）、开始按钮。
- 观战模式：只读状态 + "观战中"标记。

---

## 八、接入主服务与部署

### 1. 服务端注册

在 `server/app.ts` 中，照抄大富翁那几行的模式：

```ts
const flyingChess = registerFlyingChess(app, io as never, {
  dataDir: path.join(auth.dataDir, "flying-chess"),
  resolveAccount: (token) => auth.verifyToken(token)
});
presence.register((accountId) => flyingChess.rooms.locate(accountId));
```

并加上 namespace 鉴权中间件与 presence 监听。

### 2. 账号与社交

- `shared/social.ts`：`GameKind` 加 `"flying-chess"`。
- `server/social.ts`：邀请校验加分支，房间号正则用 `^[A-Z2-9]{4}$`。
- `client/src/components/FriendsPage.tsx`：加中文名"飞行棋"与观战链接 `/flying-chess?room=XXXX&watch=1`。

### 3. 前端路由与首页入口

- `client/src/App.tsx`：加 `/flying-chess` 路由，照抄 `MonopolyRoute` 的写法（会话加载中 → 未登录给 `AuthScreen` → 已登录给游戏入口）。
- `client/src/components/LobbyProfile.tsx`：加一张游戏卡片，封面组件新写一个原创 SVG（参考 `MonopolyCover.tsx` 的做法，不要用图片文件）。
- `tsconfig.json` / `vite.config.ts`：加 `@flying-chess` 别名，把飞行棋客户端代码纳入主构建。

### 4. Nginx

- `/flying-chess` 反代到 `127.0.0.1:3000`，复用已有的 `/socket.io` 块（namespace 走同一通道）。
- **两处配置要同步改**：`/etc/nginx/snippets/layudown-locations.conf` 和 `/etc/nginx/conf.d/layudown-gamesuite.conf`。
- 改前备份，`nginx -t` 通过后 reload。

### 5. 部署

照 `scripts/deploy-full.sh` 改：有对局在进行时拒绝重启、备份旧文件、重启后核对健康检查与进程启动时间。

---

## 九、验收清单

**必须实际跑起来测试，不接受"页面能打开"。**

规则层面（这些已有 `tools/rules-check.ts` 覆盖，改造后要扩到联机路径）：

- [ ] 2 / 3 / 4 人房间都能开局
- [ ] 起飞条件两种模式（5 或 6 / 仅 6）都验证过
- [ ] 掷出 6 获得额外回合；连续三次 6 第三次作废
- [ ] 撞机把敌机送回基地；安全格上的飞机不被撞
- [ ] 捷径跳跃正常，跳跃落点有敌机时按撞机处理
- [ ] 必须精确抵达终点，超出步数的飞机不可动
- [ ] 四架全部到终点判胜，之后不再接受操作

联机层面：

- [ ] **两个浏览器窗口**真人对局，双方看到的状态始终一致
- [ ] 刷新页面不丢对局，回到原座位
- [ ] 断网 30 秒再恢复，能继续
- [ ] 断线超过宽限期，房间交给电脑托管并且其它玩家看得出来
- [ ] 一个客户端重复点掷骰，只结算一次
- [ ] 非当前回合玩家点掷骰/移动被服务端拒绝
- [ ] 非房主改设置、强行开始被拒绝
- [ ] 观战者能看到对局但无法操作
- [ ] 房主退出后房主身份正确移交
- [ ] 三人房间中一人掉线，剩余两人对局不受影响

平台层面：

- [ ] 首页出现飞行棋卡片，样式与其它游戏一致
- [ ] 好友列表能看到"某人在飞行棋房间"，点击可去观战
- [ ] 主服务重启后未完成的房间能恢复
- [ ] Nginx 路由与 WebSocket 正常
- [ ] **原有 UNO / UNION ARENA / 本将棋 / 大富翁 / OpenClaw 全部照常工作**
- [ ] 全项目搜索，确认飞行棋相关文件中没有 "LayUDown"

性能层面：

- [ ] 一次状态广播不超过必要字段，不要每次把整盘历史都带上
- [ ] 房间数量与连接数增长时，广播不会退化成 O(n²)

---

## 十、交付物

1. 可用的联机飞行棋（服务端 + 客户端）
2. 扩展后的规则与联机测试
3. `CREDITS.md`：棋盘坐标来源 `SweetMikann/aeroplane-chess` 是 **CC BY 4.0**，必须署名（规则 Mikann / 棋盘 Damien / 程序 澄），不能写作原创。Three.js 若未引入则不必列。
4. 部署说明：服务依赖、数据目录、Nginx 路由、回滚方式
5. 一份简短的联机协议文档（`docs/PROTOCOL.md`，可参照大富翁的同名文件）

---

## 十一、开工前先确认

以下三点如果与你的判断不同，先问再动手：

1. **承载方式**：本文按"并入主服务、独立 namespace"写。若你希望改成独立进程 + 独立端口，需要额外解决账号互通与好友状态共享，工作量明显更大。
2. **是否保留单机模式**：本文假设保留（单机练习 + 联机对局共享界面）。若只保留联机，客户端改造会简单一些。
3. **电脑托管是否允许**：本文假设允许房主把空位交给电脑。若不允许，等待室必须凑齐真人才开始。

---

## 十二、最终目标

交付一款**真正可以多人在线游玩**的飞行棋：两名真实玩家在两个浏览器里，从创建房间、加入、准备、开局，到掷骰、撞机、捷径、抵达终点、分出胜负，全过程状态一致、断线可恢复、操作无法越权。

不是只有棋盘和骰子动画的前端原型，也不是只有房间没规则的后端骨架。
