# 大富翁协议文档

版本：`monopoly-1.0.0`（与 `src/shared/economy.ts` 的 `RULES_VERSION` 一致）

本文定义客户端与服务端之间交换的全部数据。**服务端是唯一的规则权威**：客户端只提交「意图」，服务端判定合法性并广播结果状态。客户端不能移动金钱、掷骰、改归属或定价。

---

## 1. 状态模型

### 1.1 房间

```ts
RoomState {
  roomCode: string
  phase: "lobby" | "playing" | "over"
  config: RoomConfig
  players: MonopolyPlayer[]      // 座位
  spectators: MonopolySpectator[]
  game: MonopolyGame | null      // lobby 阶段为 null
  onGame: boolean
  isHost: boolean
  playerCount: number
  startAllowed: boolean
  canEditConfig: boolean
  youAreSpectator: boolean
}
```

### 1.2 对局

`MonopolyGame` 是**完整快照**，不含任何私有信息：每位玩家拿到的对象完全相同。

| 字段 | 说明 |
|---|---|
| `rulesVersion` | 本局使用的数值版本，用于追溯结算 |
| `config` | 开局冻结的房间规则（含所有经济参数覆盖） |
| `turn` / `turnIndex` / `order` | 第几回合、轮到 `order` 的哪一位 |
| `stage` | `roll` → `resolve` → `end`，引擎只接受当前阶段允许的操作 |
| `players` | 每位玩家的座位、位置、现金、破产、在狱、出狱卡数，以及银行贷款账户 `bank: { principal, interest }` |
| `ownership` | 按格子的归属：`{ tile, ownerId, level, mortgaged }`，`level` 0 空、1–4 房屋、5 酒店 |
| `pending` | **当前等待回答的唯一问题**，见 §1.3 |
| `lastRoll` | 最近一次骰子，客户端用于动画 |
| `decks` / `drawnCard` | 牌堆剩余 id 与刚抽到的牌 |
| `log` | 公开记录，每一笔金钱变动都有一行：`{ id, turn, actorId?, text, kind, amount?, tile? }`。`tile`（可选）是这一行涉及的格子（落地、买卖、建造、抵押、拍卖、监狱），客户端用它做"点日志定位到格子"与动效；旧日志没有这个字段，客户端必须容忍缺省 |
| `winner` | 结束后才有：胜者、结束原因、最终排名 |
| `startedAt` / `turnStartedAt` | 时钟基线，客户端据此显示倒计时 |
| `roomCode` | 本局所属房间；离线局为 `local`。账本用它标注每一笔 |
| `clock` | 游戏时钟 `{ day, minute, paused, anchorAt, settledDay }`，由服务器推进（§3.6） |
| `ledger` | 银行账本，只增不改：`{ id, room, playerId, kind, amount, gameMinute, before, after, status }` |
| `bankAuctions` | 破产清盘后等待银行逐间拍卖的地产编号队列 |
| `seenRequests` | 最近 400 个已受理的银行请求编号，用于防重放 |

### 1.3 待回答的问题（`pending`）

同一时刻**只有一个**问题打开。这是动画队列与按钮状态的唯一依据。

| kind | 谁必须回答 | 可选操作 |
|---|---|---|
| `buy` | 落点玩家 | `buy` / `decline`（拒绝即进入拍卖） |
| `auction` | `bidders` 中的每一位 | `bid` / `pass` |
| `debt` | 欠款玩家 | 变卖/抵押（见 §3.3）或 `declareBankrupt` |
| `card` | 抽牌玩家 | `ackCard` |
| `trade` | 双方 | 受邀方 `answerTrade`；发起方 `cancelTrade` |

`stage` 为 `resolve` 时表示「有问题未回答」；`end` 表示本回合可以结束了。

---

## 2. 操作（客户端 → 服务端）

客户端只发 `MonopolyAction`。每条都带房间号（由连接绑定）与操作序号（由传输层保证顺序）。

```ts
roll | buy | decline | bid{amount} | pass
build{tile} | sellBuilding{tile} | mortgage{tile} | unmortgage{tile}
offerTrade{toId, offer} | answerTrade{accept} | cancelTrade
payJailFine | useJailCard | ackCard | declareBankrupt | endTurn
takeLoan{amount, requestId} | repayLoan{amount, requestId}
pauseClock | resumeClock
```

`TradeOffer { give: number[], take: number[], money: number, jailCards: number }`
— `give` 是我方付出的格子，`take` 是索取的格子，`money` 由我方向对方支付（单向）。

### 2.1 任何时刻都可以做的操作

`build` / `sellBuilding` / `mortgage` / `unmortgage` **不需要轮到本方**：那是玩家自己的钱，也是还债的途径。它们永远只影响自己的资产。`takeLoan` / `repayLoan` 同样随时可发（欠款待还时借款可直接用来还债）。`pauseClock` / `resumeClock` 只有房主可以发送。其余操作都要求轮到本方且阶段匹配。

### 2.2 合法性预判

`src/shared/legal.ts` 的 `legalActions(game, playerId)` 给出当前可选操作，与服务端同源（都从同一份状态推导），供界面决定按钮可用性。它只是**提示**：服务端仍会拒绝任何此刻已不合法的操作。

---

## 3. 关键流程

### 3.1 掷骰与移动

1. 客户端 `roll`（仅本方回合、`stage === "roll"`）。
2. 服务端掷骰 → 移动 → 落点结算 → 广播新状态。
3. 掷出双骰且未满三次：`stage` 回到 `roll`，可再掷；否则 `end`。

### 3.2 购买与拍卖

- 落在无主地：`pending = buy`。买下 → 归位；拒绝 → 若 `auctionsEnabled` 则开 `auction`，否则保持无主。
- 拍卖：`bidders` 为全部未破产玩家。首次出价不得低于地价的 `auctionOpeningShare`（默认 0.5），之后每次至少加 `auctionMinRaise`。每次出价刷新 `endsAt`（`auctionSeconds`）。只剩一名竞价者、或时间到、或无人出价时结算。退出即永久离场，本场不能再加价。
- **出价不得超过现金**，因此拍卖不会以欠款收场。

### 3.3 资金不足（债务）

任何付款（租金/税/卡牌）都由 `charge()` 统一处理：现金不足时**不会变成负数**，而是打开 `pending = debt`，玩家必须变卖建筑、抵押地产、向银行借款筹钱，或 `declareBankrupt`。变卖、抵押或借款后若已够付，引擎自动结清。

### 3.4 均衡建房

集齐整组且组内无抵押才可建。`buildEvenly` 生效时，任一格不得超过该组最低等级（即不能把一格堆到 2 级而邻居还是 0）。

### 3.5 破产

资产归债权人（否则归银行），建筑拆回银行，债权人继承抵押并支付利息。剩不足 2 人立即结算。欠银行的现金贷款与未付利息由银行承担，不转给债权人；无债权人时地产回到银行，按 `bankAuctions` 队列在回合之间逐间重新拍卖。

### 3.6 游戏时钟与银行

- **时钟**：开局 08:00；现实每 30 秒推进游戏 30 分钟（`clockHalfHourSeconds`），每天 12 分钟。服务器每秒检查一次，只按完整的半小时步长走，不跳时。暂停时把已走完的半步结清后冻结；恢复时把锚点挪到此刻；服务器停机或进程被挂起超过 5 秒的离线时间不计入游戏。
- **每日利息**：跨过游戏时间 00:00 时，对所有未破产玩家按未还本金 × 2% 向上取整计入应付利息，`clock.settledDay` 保证每个游戏日只结算一次。
- **贷款**：三档 $500 / $1,000 / $2,000，未还本金上限 $3,000，可多笔。还款先息后本，可部分还款，不能超过总欠款或现金。
- **防重放**：`takeLoan` / `repayLoan` 必须带客户端新生成的 `requestId`，同一编号只受理一次（`DUPLICATE_REQUEST`）。
- **账本**：贷款、还款、利息、购买、拍卖、建造、变卖、抵押、赎回、税款、租金、交易、破产清盘都写一条 `ledger`，含交易前后现金与游戏时间。

---

## 4. 胜负与结算

| 模式 | 条件 |
|---|---|
| 标准局 `lastStanding` | 剩最后一人 |
| 快速局 `assets` | 时间到或主动结束，按**净资产**排名 |

净资产 = 现金 + 地产价值 + 建筑价值 − 解押欠款 − 银行贷款（本金 + 未付利息）。
默认房间是**快速局 60 分钟**：`timeLimitMinutes: 60`、`winCondition: "assets"`。

---

## 5. 错误码

服务端以 `MonopolyError` 拒绝，客户端据此给出文案：

```
NOT_YOUR_TURN NOT_NOW INVALID_ACTION NOT_ENOUGH_CASH NOT_OWNER NOT_OWNED
MORTGAGED ALREADY_MORTGAGED NOT_MORTGAGED BUILD_LIMIT BUILD_EVENLY
GROUP_INCOMPLETE HAS_BUILDINGS TILE_NOT_BUYABLE ALREADY_OWNED BID_TOO_LOW
AUCTION_CLOSED NOT_IN_AUCTION TRADE_INVALID TRADE_PENDING PENDING_DECISION
BANKRUPT NEED_RAISE_MONEY GAME_OVER DECK_EMPTY
LOAN_LIMIT LOAN_AMOUNT NOTHING_TO_REPAY REPAY_TOO_MUCH DUPLICATE_REQUEST
```

---

## 6. 传输与重连

Socket.IO，namespace `/monopoly`。

**客户端 → 服务端**

```ts
"monopoly:create"  ({maxPlayers?, allowSpectators?}, ack)
"monopoly:join"    ({roomCode, asSpectator?}, ack)
"monopoly:leave"   (ack?)
"monopoly:config"  (Partial<RoomConfig>, ack?)
"monopoly:ready"   ({ready}, ack?)
"monopoly:start"   (ack?)
"monopoly:action"  (MonopolyAction, ack)
```

**服务端 → 客户端**

```ts
"monopoly:state"  (RoomState)      // 完整快照
"monopoly:rooms"  (RoomSummary[])
"monopoly:closed" ({reason})
"monopoly:error"  ({message})
```

### 6.1 重连

1. 客户端重连后携带 `roomCode` 与最后处理的事件序号调用 `join`。
2. 服务端能补发则补发，否则直接发 `monopoly:state` 快照。
3. 客户端以快照为准**直接对齐**，清空未播完的动画队列。

当前状态以快照为主、事件仅用于动画，因此「落后就对齐」永远安全。

### 6.2 离线托管

宽限 60 秒内可重连；超时进入托管，只做最低限度操作（自动掷骰、不买、自动付费）。托管不是 AI，不做任何策略决定。

---

## 7. 客户端动画队列约定

- 每次收到 `state`，与本地已知状态做差异，生成动画事件（移动、金额、建屋、抽卡…）。
- 动画只使用 `transform` 与 `opacity`，保证移动端 60 帧。
- 收到更新的快照时，若队列落后超过阈值，**丢弃剩余动画直接对齐**。
- 尊重系统「减少动态效果」；提供 正常 / 快速 / 关闭 三档速度。
- 实现见 `src/client/fx/`：`diff.ts` 把相邻两份快照（加上新增的 `log` 行）翻译成一次性意图，`runner.ts` 用 WAAPI 播放；
  棋子始终画在真相位置，动画只叠加 transform，所以跳过（点任意处 / Esc / “跳过动画”按钮）就是直落终态。
- 单机与联机走同一套表现层，表现层不参与任何裁决。
