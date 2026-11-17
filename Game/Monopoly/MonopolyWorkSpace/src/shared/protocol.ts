/**
 * Everything the client and the server agree on: the shape of a game, the actions a player may send, and the state each
 * player is allowed to see.
 *
 * The server owns the state. A client only ever sends an action from `MonopolyAction`; the engine decides whether it is
 * legal and what it does, and the room broadcasts the resulting state. Nothing in the client can move money, roll dice,
 * change an owner or set a price.
 */

import type { CardDeck, CardEffect } from "./cards.ts";
import type { EconomyRules } from "./economy.ts";

/** A player seated at a room. */
export interface MonopolyPlayer {
  id: string;
  username: string;
  avatarUrl: string | null;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

/** A spectator: seated at the room but not at the table. */
export interface MonopolySpectator { id: string; username: string; avatarUrl: string | null; connected: boolean; }

export type RoomPhase = "lobby" | "playing" | "over";

/** What a room shows of itself in the lobby list. */
export interface RoomSummary {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  spectators: number;
  phase: RoomPhase;
  /** True when spectators are allowed in this room. */
  allowSpectators: boolean;
}

/**
 * A room's settings. The host may change these before the first turn; they are frozen once the game begins, so a room's
 * prices and rules cannot shift under the players. Any economy value may be overridden here — the engine merges this over
 * `DEFAULT_RULES` — which is also how a test sets, say, a two-second auction.
 */
export interface RoomConfig extends Partial<EconomyRules> {
  /** 2–8 official players; the host may lower it before the game starts. */
  maxPlayers: number;
  allowSpectators: boolean;
}

/** Where one owner stands on one tile. Ownership is keyed by tile index; every tile is unique on the board. */
export interface Ownership {
  tile: number;
  ownerId: string;
  /** 0 = unbuilt; 1–4 homes; 5 = hotel. */
  level: number;
  mortgaged: boolean;
}

/** One player's bank account: the outstanding loan principal and the interest it has accrued and not been paid. */
export interface BankAccount {
  /** 未偿还本金；每日利息只按它计算，不计算复利。 */
  principal: number;
  /** 已产生但尚未支付的利息；还款时先清它，再还本金。 */
  interest: number;
}

/** One player's public economic position. Cash and holdings are public; nothing here is private. */
export interface PlayerState {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** Where the piece stands. */
  position: number;
  /** Money in the bank, never negative: a player who cannot pay goes bankrupt instead. */
  cash: number;
  /** 银行贷款账户：无抵押贷款的本金与未付利息，和地产抵押完全独立。 */
  bank: BankAccount;
  /** True once the player is out; they keep their seat and their frozen assets for display. */
  bankrupt: boolean;
  /** Turns left in jail, or 0 when free. */
  jailTurns: number;
  /** 免费出狱 cards in hand (public: the count is shown on the board). */
  jailCards: number;
  /** True while this player is in the middle of their turn. */
  active: boolean;
  /** Where they are: 监狱 is a position, and the piece shows in the jail box. */
  inJail: boolean;
  /** Order of play, 0-based, fixed at the start. */
  seat: number;
}

/**
 * 游戏时钟。时间是服务器权威的：客户端只读它来显示，不自己推进。
 *
 * `day` + `minute` 是最近一次结算时刻的游戏时间，`anchorAt` 是那一刻对应的现实毫秒数——服务器每半小时游戏时间
 * 推进一次，所以两次推进之间的显示由 `anchorAt` 推算，而暂停、重启或异常中断时只要把锚点挪到恢复时刻，离线时间
 * 就不会被算进游戏。
 */
export interface GameClock {
  /** 游戏第几天，0 起；第 0 天从 `clockStartMinute` 开始。 */
  day: number;
  /** 当天经过的分钟数，0–1439。 */
  minute: number;
  paused: boolean;
  /** 暂停开始的现实毫秒数，0 表示没在暂停；恢复时用它把暂停时长从对局计时里扣掉。 */
  pausedAt: number;
  /** 最近一次推进对应的现实毫秒数。 */
  anchorAt: number;
  /** 已结算过利息的游戏日；-1 表示还没有跨过第一个 00:00。 */
  settledDay: number;
}

/** 一条银行账本记录：唯一编号、房间、玩家、类型、金额、游戏时间、交易前后余额。 */
export interface LedgerEntry {
  id: number;
  room: string;
  playerId: string;
  kind: "loan" | "repay" | "interest" | "mortgage" | "unmortgage" | "buy" | "auction" | "build" | "sell" | "tax" | "rent" | "trade" | "bankrupt" | "settle";
  /** 金额；利息与贷款记正数，支出（还本、税款、购买）也记正数，方向由 `kind` 决定。 */
  amount: number;
  /** 游戏时间，等于 `day * 1440 + minute`。 */
  gameMinute: number;
  before: number;
  after: number;
  status: "ok";
}

/** A log line. Every money change and every state change has one, so a game can be reconstructed from the record. */
export interface LogEntry {
  id: number;
  turn: number;
  /** The player who caused it, if one did. */
  actorId?: string;
  text: string;
  /** What kind of thing happened, for the client to pick an icon and a colour. */
  kind: "roll" | "move" | "buy" | "rent" | "build" | "sell" | "mortgage" | "unmortgage" | "trade" | "auction" | "card" | "jail" | "tax" | "bankrupt" | "end" | "text" | "loan" | "repay" | "interest";
  /** Money moved, positive when it came in to `actorId`. */
  amount?: number;
  /** 这一行关于哪一格（落地、买卖、建造、抵押、拍卖、监狱等）。可选：旧版本的日志没有它，客户端只用它做定位与动效。 */
  tile?: number;
}

/** The pending question the engine is waiting for an answer to. Only one is ever open. */
export type Pending =
  /** Landed on an unowned tile: buy it, or put it up for auction. */
  | { kind: "buy"; playerId: string; tile: number; price: number }
  /** An auction over one tile; `bidders` are the players still in it. */
  | { kind: "auction"; tile: number; highBid: number; highBidderId: string | null; bidders: string[]; endsAt: number }
  /** A player cannot pay what they owe and must raise money, or declare bankruptcy. */
  | { kind: "debt"; playerId: string; creditorId: string | null; amount: number }
  /** Drafting a trade with another player. */
  | { kind: "trade"; fromId: string; toId: string; offer: TradeOffer; status: "pending" | "accepted" | "declined" }
  /** An event card waiting to be read and acknowledged. */
  | { kind: "card"; playerId: string; deck: CardDeck; cardId: string };

/** A trade: tiles plus money, each way, plus jail cards. */
export interface TradeOffer {
  /** Tiles given by the player making the offer. */
  give: number[];
  /** Tiles given by the other side. */
  take: number[];
  /** Money from the offerer to the other side; negative means the other way (only one direction is allowed). */
  money: number;
  /** 免费出狱 cards from the offerer. */
  jailCards: number;
}

/** The whole visible game. Each player gets the same object; nothing in it is private. */
export interface MonopolyGame {
  rulesVersion: string;
  config: RoomConfig;
  /** Whose turn it is. */
  turn: number;
  /** 0-based order of the players, fixed at the start. */
  order: string[];
  /** Points at `order`; the player whose turn it is. */
  turnIndex: number;
  /** `roll` → `move` → `resolve` → `end`; the engine only accepts the actions its stage allows. */
  stage: "roll" | "resolve" | "end";
  players: PlayerState[];
  ownership: Ownership[];
  pending: Pending | null;
  /** The last dice roll, for the client's animation. */
  lastRoll: { dice: [number, number]; byId: string; doubles: boolean; doubleCount: number } | null;
  /** Card decks: the ids left to draw, shuffled at the start. */
  decks: Record<CardDeck, string[]>;
  /** The card that was just drawn, so the client can turn it over. */
  drawnCard: { deck: CardDeck; cardId: string; byId: string } | null;
  log: LogEntry[];
  /** Set when the game is over. */
  winner: { playerId: string | null; reason: string; standings: Standing[] } | null;
  /** Milliseconds since the epoch, for the clock and the auction timer. */
  startedAt: number;
  /** When the current player's turn began, so the client can show a per-turn timer. */
  turnStartedAt: number;
  /** 本局所属房间编号；离线局记 `local`。账本用它标注每一笔。 */
  roomCode: string;
  /** 游戏时钟，服务器权威。 */
  clock: GameClock;
  /** 银行账本。 */
  ledger: LedgerEntry[];
  /** 破产清盘后按顺序逐间拍卖的地产（屋主破产、地产回到银行）。 */
  bankAuctions: number[];
  /** 已经处理过的客户端请求编号，防止重连或重发把同一笔钱记两次。 */
  seenRequests: string[];
}

/** One player's place in the final or provisional ranking. */
export interface Standing {
  playerId: string;
  username: string;
  cash: number;
  propertyValue: number;
  buildingValue: number;
  mortgageDebt: number;
  /** 银行贷款本金 + 未付利息；参与净资产计算。 */
  bankDebt?: number;
  /** cash + property + buildings − mortgage debt − bank debt, which is what the assets win condition compares. */
  netWorth: number;
  bankrupt: boolean;
}

// ---- Actions ----

export type MonopolyAction =
  /** Roll two dice. Only the player whose turn it is, and only in the `roll` stage (or once more after doubles). */
  | { type: "roll" }
  /** Buy the tile they landed on, at its price. */
  | { type: "buy" }
  /** Decline to buy; the tile is auctioned if the rules allow it, otherwise it stays unowned. */
  | { type: "decline" }
  /** Bid in an open auction. */
  | { type: "bid"; amount: number }
  /** Leave the auction (or pass); the last bidder wins when everyone else has left. */
  | { type: "pass" }
  /** Build one step on a tile. */
  | { type: "build"; tile: number }
  /** Sell one building step. */
  | { type: "sellBuilding"; tile: number }
  /** Mortgage a tile. */
  | { type: "mortgage"; tile: number }
  /** Lift a mortgage. */
  | { type: "unmortgage"; tile: number }
  /** Put a trade on the table. */
  | { type: "offerTrade"; toId: string; offer: TradeOffer }
  /** Accept or decline the trade on the table. */
  | { type: "answerTrade"; accept: boolean }
  /** Withdraw the trade on the table (the offerer only). */
  | { type: "cancelTrade" }
  /** Pay the jail fine and get out. */
  | { type: "payJailFine" }
  /** Use a 免费出狱 card. */
  | { type: "useJailCard" }
  /** Acknowledge the event card that was just drawn. */
  | { type: "ackCard" }
  /** Give up: the assets go to the creditor, or to the bank. */
  | { type: "declareBankrupt" }
  /** 申请一笔无抵押现金贷款；`requestId` 由客户端为每次操作新生成，服务器据此去重。 */
  | { type: "takeLoan"; amount: number; requestId: string }
  /** 还贷款：先息后本，可以只还一部分；`amount` 是这次付出的现金。 */
  | { type: "repayLoan"; amount: number; requestId: string }
  /** 暂停游戏时钟（房主）。 */
  | { type: "pauseClock" }
  /** 恢复游戏时钟（房主）。 */
  | { type: "resumeClock" }
  /** Finish the turn (after building, trading and mortgaging) and pass to the next player. */
  | { type: "endTurn" };

/** Why an action was refused, as an error code the client turns into a message. */
export type MonopolyError =
  | "NOT_YOUR_TURN" | "NOT_NOW" | "INVALID_ACTION" | "NOT_ENOUGH_CASH" | "NOT_OWNER" | "NOT_OWNED"
  | "MORTGAGED" | "ALREADY_MORTGAGED" | "NOT_MORTGAGED" | "BUILD_LIMIT" | "BUILD_EVENLY"
  | "GROUP_INCOMPLETE" | "HAS_BUILDINGS" | "TILE_NOT_BUYABLE" | "ALREADY_OWNED" | "BID_TOO_LOW"
  | "AUCTION_CLOSED" | "NOT_IN_AUCTION" | "TRADE_INVALID" | "TRADE_PENDING" | "PENDING_DECISION"
  | "BANKRUPT" | "NEED_RAISE_MONEY" | "GAME_OVER" | "DECK_EMPTY"
  /** 银行：超过可借额度、还款额不合法、没有欠款、请求重放。 */
  | "LOAN_LIMIT" | "LOAN_AMOUNT" | "NOTHING_TO_REPAY" | "REPAY_TOO_MUCH" | "DUPLICATE_REQUEST";

/** The engine throws this; the room turns it into the client's message. */
export class MonopolyRuleError extends Error {
  code: MonopolyError;
  constructor(code: MonopolyError) { super(code); this.code = code; }
}

// ---- Socket payloads ----

/** What a client sends when it joins or creates a room. */
export interface JoinResult { roomCode: string; }

/** The state of a room, as sent to one client. */
export interface RoomState {
  roomCode: string;
  phase: RoomPhase;
  config: RoomConfig;
  players: MonopolyPlayer[];
  spectators: MonopolySpectator[];
  /** Null in the lobby. */
  game: MonopolyGame | null;
  onGame: boolean;
  isHost: boolean;
  playerCount: number;
  startAllowed: boolean;
  canEditConfig: boolean;
  youAreSpectator: boolean;
}

/** A client-to-server message and its acknowledgement. */
export interface ClientToServer {
  "monopoly:create": (payload: { maxPlayers?: number; allowSpectators?: boolean }, ack: (result: { ok: boolean; roomCode?: string; message?: string; error?: MonopolyError }) => void) => void;
  "monopoly:join": (payload: { roomCode: string; asSpectator?: boolean }, ack: (result: { ok: boolean; roomCode?: string; message?: string }) => void) => void;
  "monopoly:leave": (ack?: (result: { ok: boolean }) => void) => void;
  "monopoly:config": (payload: Partial<RoomConfig>, ack?: (result: { ok: boolean; error?: MonopolyError }) => void) => void;
  "monopoly:ready": (payload: { ready: boolean }, ack?: (result: { ok: boolean }) => void) => void;
  "monopoly:start": (ack?: (result: { ok: boolean; error?: MonopolyError }) => void) => void;
  /** Back into the room this account was last in, after a reconnect or a page reload. */
  "monopoly:rejoin": (payload: { roomCode: string }, ack: (result: { ok: boolean; roomCode?: string; error?: MonopolyError }) => void) => void;
  "monopoly:action": (payload: MonopolyAction, ack: (result: { ok: boolean; error?: MonopolyError }) => void) => void;
}

/** A server-to-client message. */
export interface ServerToClient {
  "monopoly:state": (state: RoomState) => void;
  "monopoly:rooms": (rooms: RoomSummary[]) => void;
  "monopoly:closed": (payload: { reason: string }) => void;
  "monopoly:error": (payload: { message: string }) => void;
}

export type { CardDeck, CardEffect };
