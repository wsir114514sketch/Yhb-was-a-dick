# 飞行棋联机协议

版本：`flying-chess-1`（房间号、事件名与状态字段的当前约定）

服务端是唯一可信状态。客户端只提交意图（掷骰、移动哪架飞机、准备、开始），服务端校验后广播完整快照。客户端传来的点数、步数、坐标一律不采信。

---

## 1. 传输与鉴权

- Socket.IO，namespace **`/flying-chess`**，与站点共用同一个 `/socket.io` 通道。
- 连接时在 `handshake.auth.token` 带站点登录 token；无有效 token 的连接在中间件阶段被拒绝，错误为 `AUTH_REQUIRED`。
- 账号复用主服务 `auth.verifyToken`，不新建账号体系。
- 数据目录：`server/data/flying-chess/`，一个房间一个 JSON，键为 4 位房间号。
- HTTP：`GET /api/flying-chess/health`、`GET /api/flying-chess/rooms`。

## 2. 事件

### 客户端 → 服务端

除 `fc:create` / `fc:join` / `fc:config` / `fc:seats` / `fc:ready` / `fc:move` / `fc:bot` / `fc:rejoin` 外，其余事件没有载荷；**没有载荷的事件必须把 ack 回调作为第一个参数**，传 `undefined` 占位会让 ack 永远不回来。

| 事件 | 载荷 | ack | 说明 |
|---|---|---|---|
| `fc:rooms:request` | — | 否 | 请求房间列表 |
| `fc:create` | `{ maxPlayers?: 2\|3\|4, sixOnly?: boolean }` | 是 | 建房，创建者成为房主并占座 |
| `fc:join` | `{ roomCode, asSpectator? }` | 是 | 凭房间号加入；已在本房的人会回到原座位 |
| `fc:leave` | — | 是 | 离开座位/观战席 |
| `fc:config` | `{ maxPlayers?, sixOnly? }` | 是 | 仅房主，仅等待室 |
| `fc:seats` | `{ color: Color \| null }` | 是 | 选择阵营色；`null` 为自动分配 |
| `fc:ready` | `{ ready: boolean }` | 是 | 准备 |
| `fc:start` | — | 是 | 仅房主；满员且全员准备后开始 |
| `fc:roll` | — | 是 | 掷骰；重复掷骰被拒绝 |
| `fc:move` | `{ planeIndex: 0\|1\|2\|3 }` | 是 | 移动哪架飞机 |
| `fc:bot` | `{ color, enabled }` | 是 | 仅房主，等待室把空颜色交给电脑 |
| `fc:rejoin` | `{ roomCode }` | 是 | 刷新/重连后回到原座位 |
| `fc:health` | — | 是 | 健康检查 |

ack 形如 `{ ok: true, roomCode? }` 或 `{ ok: false, error, message }`。

### 服务端 → 客户端

| 事件 | 载荷 | 说明 |
|---|---|---|
| `fc:state` | `PublicState` | 房间内每个连接各收一份完整快照 |
| `fc:rooms` | `RoomSummary[]` | 大厅列表，房间变动时广播 |
| `fc:error` | `{ code, message }` | 拒绝原因；带 ack 的动作把错误放进 ack |

## 3. PublicState

```ts
type PublicState = {
  roomCode: string;
  phase: "waiting" | "roll" | "move" | "over";
  players: {
    id: string;              // 账号 id；电脑座位是 bot:<颜色>
    username: string;
    avatarUrl: string | null;
    color: "red" | "green" | "blue" | "yellow";
    ready: boolean;
    connected: boolean;
    isBot: boolean;
    isHost: boolean;
    planes: { step: number }[];  // -1 基地，0..47 环线，48..52 跑道，53 终点
    sixStreak: number;
  }[];
  spectators: { id: string; username: string; avatarUrl: string | null; connected: boolean }[];
  hostId: string;
  maxPlayers: number;
  sixOnly: boolean;
  turn: number;                  // players 下标
  dice: number | null;           // 最近一次点数，停住不消失
  winner: Color | null;
  legalPlaneIndices: number[];   // 当前这一步服务端认可的可移动机号
  event: string;
  seq: number;                   // 每次广播递增，用于丢弃过期快照
  notBefore: number;             // 服务端时间戳；早于它之前不可操作
  startAllowed: boolean;
  isHost: boolean;
  onGame: boolean;
  youAreSpectator: boolean;
  active: boolean;               // 同一账号多开时只有最近连接为 true
};
```

客户端渲染所需的信息全在这里：高亮直接用 `legalPlaneIndices`，不需要本地规则推理。

## 4. 回合与节奏

1. 服务端掷骰后立刻广播 `{ dice, phase: "move", legalPlaneIndices, notBefore: now + 1100 }`。
2. 客户端渲染 `notBefore`，在骰子停留结束前禁用操作；**推进对局不靠客户端定时器**。
3. 服务端同样校验 `notBefore`，早于它到达的 `fc:move` 返回 `NOT_YET`。
4. 移动阶段超过 **30 秒**未操作，服务端用同一套 `pickAiMove` 替玩家走一步。
5. 掷出 6 额外回合；连续三次 6 第三次作废并换人；无合法移动自动跳过。

电脑托管的节奏与真人一致：掷骰前 700ms、骰子停留 1.1 秒后再移动，不会一瞬间走完。

## 5. 断线、重连与多标签页

- 断开不立即移除座位，只标记 `connected: false`，宽限 **90 秒**。
- 宽限内 `fc:rejoin` 回到原座位，立刻收到完整 `fc:state`；若此前已转托管，控制权交还给人。
- 宽限超时：对局中 → 该座位 `isBot: true`，由电脑接管；等待室 → 释放座位。
- 刷新页面等同于断线重连，不丢对局。
- 同一账号多开：最近建立的连接是 `active`，其余连接收到 `active: false` 的只读状态，操作返回 `READ_ONLY`。

## 6. 房间生命周期

- 房间号 4 位，字母表 `A-Z2-9`，避开易混淆字符。
- 开局条件：座位满员、所有真人连接在线、除房主外均已准备；电脑座位自动准备。
- 房主离开时移交给最早加入的剩余真人；房间没人后自动销毁。
- 观战者可在任何阶段加入，只读。
- 结束（`over`）后房间不再出现在大厅列表，可离开；进程重启会恢复未完成的房间。

## 7. 错误码

```
ROOM_NOT_FOUND ROOM_FULL ROOM_LIMIT NOT_IN_ROOM GAME_STARTED NOT_STARTED
NOT_HOST NOT_YOUR_TURN NOT_NOW NOT_YET INVALID_MOVE COLOR_TAKEN READ_ONLY
INVALID_ACTION
```

客户端有对应中文文案；服务端也带一份 `message` 兜底。

## 8. 落盘

`StoredFlyingChessRoom` 保存：房间号、房主、阶段、人数与起飞规则、座位（含电脑位）、完整 `GameState`、最近点数、事件与保存时间。写入先写临时文件再改名；同一房间最短 4 秒落一次盘。恢复时真人座位以离线开始，重新走 90 秒宽限。
