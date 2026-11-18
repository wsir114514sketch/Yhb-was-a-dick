/**
 * One action in, one legal state change out. Every branch is a rule the server enforces itself: a client's button only
 * proposes an action, and a proposal that breaks a rule is refused with a code instead of being applied.
 *
 * Everything shared with the landing logic (money, movement, rent, the turn skeleton) lives in `rules.ts`; this file is the
 * dispatcher plus the decisions a roll can put on the table — buying, auctions, building, trades, jail and bankruptcy.
 */

import { BOARD_SIZE, REGION_PROPERTIES, commercialAt, tileAt, tileName } from "./board.ts";
import { rulesOf } from "./rules.ts";
import { DEFAULT_RULES, formatMoney } from "./economy.ts";
import { bankDebtOf, clearBankDebt, repayLoan, takeLoan } from "./bank.ts";
import { setClockPaused } from "./clock.ts";
import { recordLedger } from "./ledger.ts";
import type { MonopolyAction, MonopolyGame, PlayerState, TradeOffer } from "./protocol.ts";
import {
  JAIL_TILE, MonopolyRuleError, activePlayer, advance, applyCard, charge, finishGame, findPlayer, goTo, holdsWholeRegion,
  landOn, nameOf, nextTurn, ownershipOf, owners, pushLog, rentOf, rollDice, standingsOf, type Random
} from "./rules.ts";

/**
 * Picks the stage up again once whatever a roll opened has been answered. A roll of doubles earns another roll, so the
 * stage goes back to `roll` — but only when the resolution left nothing else to answer, and only while the third-double
 * jail rule has not fired. Everything else ends the turn here.
 */
function resumeAfterDecision(game: MonopolyGame): void {
  if (game.pending) return;
  const roll = game.lastRoll;
  const actorId = game.order[game.turnIndex];
  const extraRoll = !!roll && roll.byId === actorId && roll.doubles && roll.doubleCount < 3;
  game.stage = extraRoll ? "roll" : "end";
}

/** Applies one action. Throws `MonopolyRuleError` when it is not legal, so a refused action leaves the game untouched. */
export function applyAction(game: MonopolyGame, actorId: string, action: MonopolyAction, now: number, random: Random): void {
  applyActionInner(game, actorId, action, now, random);
  // 破产清盘留下的地产由银行逐间重新拍卖；有了新的待决问题就先等它结束。
  startQueuedBankAuction(game, now);
}

function applyActionInner(game: MonopolyGame, actorId: string, action: MonopolyAction, now: number, random: Random): void {
  if (game.winner) throw new MonopolyRuleError("GAME_OVER");
  const actor = findPlayer(game, actorId);
  if (!actor) throw new MonopolyRuleError("INVALID_ACTION");
  if (actor.bankrupt) throw new MonopolyRuleError("BANKRUPT");

  const pending = game.pending;

  // An open decision belongs to one player; everyone else may only do the things that never need the turn.
  if (pending?.kind === "debt" && pending.playerId === actorId) {
    if (action.type === "declareBankrupt") { declareBankrupt(game, actorId, now); return; }
    if (action.type === "sellBuilding" || action.type === "mortgage" || action.type === "unmortgage") {
      // Raising (or spending) money is the way out of a debt; the settlement is re-checked at the end of each of these.
      applyMoneyMove(game, actorId, action, now);
      settleOpenDebt(game, actorId);
      return;
    }
    if (action.type === "takeLoan") {
      // 向银行借一笔无抵押贷款也是筹款；到账后如果够还，就立刻结清欠款。
      takeLoan(game, actorId, action.amount, action.requestId);
      settleOpenDebt(game, actorId);
      return;
    }
    throw new MonopolyRuleError("NEED_RAISE_MONEY");
  }
  if (pending?.kind === "card" && pending.playerId === actorId) {
    if (action.type !== "ackCard") throw new MonopolyRuleError("PENDING_DECISION");
    game.pending = null;
    applyCard(game, actorId, pending.deck, pending.cardId, random);
    // A card that moved the piece has already resolved its landing (which may open a buy, a debt…); otherwise pick the
    // stage up again — doubles still earn the extra roll that this card interrupted.
    resumeAfterDecision(game);
    return;
  }
  if (pending?.kind === "buy" && pending.playerId === actorId) {
    if (action.type === "buy") { buyTile(game, actorId, pending.tile); return; }
    if (action.type === "decline") { declineBuy(game, actorId, pending.tile, now); return; }
    if (action.type === "takeLoan") {
      // 现金不够买下它时，先向银行借一笔是合法的筹钱方式；买地的问题继续等回答。
      takeLoan(game, actorId, action.amount, action.requestId);
      return;
    }
    throw new MonopolyRuleError("PENDING_DECISION");
  }
  if (pending?.kind === "auction") {
    if (action.type === "bid") { bid(game, actorId, pending.tile, action.amount, now); return; }
    if (action.type === "pass") { passAuction(game, actorId, now); return; }
    // 拍卖进行中也可以去银行借钱（例如为了继续加价）；出价本身仍受现金约束。
    if (action.type === "takeLoan") { takeLoan(game, actorId, action.amount, action.requestId); return; }
    throw new MonopolyRuleError("PENDING_DECISION");
  }
  if (pending?.kind === "trade") {
    if (action.type === "answerTrade") {
      if (actorId !== pending.toId && actorId !== pending.fromId) throw new MonopolyRuleError("INVALID_ACTION");
      // Only the other side can accept; the offerer withdrawing is a cancel, not a decline.
      if (action.accept && actorId !== pending.toId) throw new MonopolyRuleError("INVALID_ACTION");
      if (action.accept) acceptTrade(game, now);
      else declineTrade(game, actorId);
      return;
    }
    if (action.type === "cancelTrade") {
      if (pending.fromId !== actorId) throw new MonopolyRuleError("INVALID_ACTION");
      declineTrade(game, actorId);
      return;
    }
    if (action.type === "offerTrade") throw new MonopolyRuleError("TRADE_PENDING");
    // Everything else waits for the trade to be answered.
    throw new MonopolyRuleError("PENDING_DECISION");
  }

  const isTheirTurn = game.order[game.turnIndex] === actorId;

  switch (action.type) {
    case "roll": {
      if (!isTheirTurn) throw new MonopolyRuleError("NOT_YOUR_TURN");
      if (game.stage !== "roll") throw new MonopolyRuleError("NOT_NOW");
      doRoll(game, actor, random);
      return;
    }
    // Building, selling and mortgaging are open to every player at any time: it is their own money, and it is how a debt
    // is paid off. They never need the turn, and they never touch anyone else's property.
    case "build": build(game, actorId, action.tile); settleOpenDebt(game, actorId); return;
    case "sellBuilding": sellBuilding(game, actorId, action.tile); settleOpenDebt(game, actorId); return;
    case "mortgage": mortgage(game, actorId, action.tile); settleOpenDebt(game, actorId); return;
    case "unmortgage": unmortgage(game, actorId, action.tile, now); return;
    // 银行随时可去，和建造、抵押一样不需要轮到自己的回合。
    case "takeLoan": takeLoan(game, actorId, action.amount, action.requestId); settleOpenDebt(game, actorId); return;
    case "repayLoan": repayLoan(game, actorId, action.amount, action.requestId); return;
    case "pauseClock": setClockPaused(game, true, now); return;
    case "resumeClock": setClockPaused(game, false, now); return;
    case "offerTrade": {
      if (!actor) throw new MonopolyRuleError("INVALID_ACTION");
      offerTrade(game, actorId, action.toId, action.offer, now);
      return;
    }
    case "payJailFine": {
      if (!isTheirTurn) throw new MonopolyRuleError("NOT_YOUR_TURN");
      payJailFine(game, actorId);
      return;
    }
    case "useJailCard": {
      if (!isTheirTurn) throw new MonopolyRuleError("NOT_YOUR_TURN");
      useJailCard(game, actorId);
      return;
    }
    case "declareBankrupt": declareBankrupt(game, actorId, now); return;
    case "endTurn": {
      if (!isTheirTurn) throw new MonopolyRuleError("NOT_YOUR_TURN");
      if (game.stage !== "end") throw new MonopolyRuleError("NOT_NOW");
      // A trade still on the table is withdrawn when the turn passes, so it cannot linger into the next player's turn.
      if (game.pending?.kind === "trade") game.pending = null;
      nextTurn(game, now);
      return;
    }
    default:
      throw new MonopolyRuleError("INVALID_ACTION");
  }
}

/** The three actions that only move the actor's own money, shared by the plain case and the debt case. */
function applyMoneyMove(game: MonopolyGame, actorId: string, action: Extract<MonopolyAction, { type: "sellBuilding" | "mortgage" | "unmortgage" }>, now: number): void {
  if (action.type === "sellBuilding") sellBuilding(game, actorId, action.tile);
  else if (action.type === "mortgage") mortgage(game, actorId, action.tile);
  else unmortgage(game, actorId, action.tile, now);
}

/** After a sale or a mortgage, a debt the player can now cover is paid at once, so the table never waits on a stale prompt. */
function settleOpenDebt(game: MonopolyGame, actorId: string): void {
  const pending = game.pending;
  if (pending?.kind !== "debt" || pending.playerId !== actorId) return;
  const payer = findPlayer(game, actorId);
  if (!payer || payer.cash < pending.amount) return;
  payer.cash -= pending.amount;
  const creditor = pending.creditorId ? findPlayer(game, pending.creditorId) : undefined;
  if (creditor) creditor.cash += pending.amount;
  game.pending = null;
  pushLog(game, actorId, `${payer.username} 付清 ${formatMoney(pending.amount)} 给${nameOf(game, pending.creditorId)}。`, "rent", -pending.amount);
  // Paying a debt never grants an extra roll, so the turn ends here whatever the dice said.
  game.stage = "end";
}

// ---- Rolling ----

function doRoll(game: MonopolyGame, actor: PlayerState, random: Random): void {
  const rules = rulesOf(game);
  if (actor.inJail) { rollInJail(game, actor, random); return; }
  const dice = rollDice(random);
  const doubles = dice[0] === dice[1];
  const previous = game.lastRoll?.byId === actor.id ? game.lastRoll.doubleCount : 0;
  const doubleCount = doubles ? previous + 1 : 0;
  game.lastRoll = { dice, byId: actor.id, doubles, doubleCount };
  if (rules.tripleDoubleJail && doubleCount >= 3) {
    pushLog(game, actor.id, `${actor.username} 连掷三次双骰，直接入狱。`, "jail", undefined, JAIL_TILE);
    actor.position = JAIL_TILE;
    actor.inJail = true;
    actor.jailTurns = rules.jailMaxTurns;
    game.stage = "end";
    return;
  }
  pushLog(game, actor.id, `${actor.username} 掷出 ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}${doubles ? "（双骰）" : ""}。`, "roll");
  advanceAndLand(game, actor, dice[0] + dice[1], random);
  // Landing changed money and may have opened a purchase, a debt or a card; only an unanswered turn moves on.
  if (game.pending) game.stage = "resolve";
  else game.stage = doubles ? "roll" : "end";
}

function advanceAndLand(game: MonopolyGame, actor: PlayerState, steps: number, random: Random): void {
  advance(game, actor, steps);
  landOn(game, actor, random);
  // While something is waiting to be answered the stage says so; once it is answered, `resumeAfterDecision` moves on.
  if (game.pending) game.stage = "resolve";
}

function rollInJail(game: MonopolyGame, actor: PlayerState, random: Random): void {
  const rules = rulesOf(game);
  const dice = rollDice(random);
  const doubles = dice[0] === dice[1];
  game.lastRoll = { dice, byId: actor.id, doubles, doubleCount: doubles ? 1 : 0 };
  pushLog(game, actor.id, `${actor.username} 在狱中掷出 ${dice[0]} + ${dice[1]}${doubles ? "（双骰）" : ""}。`, "roll");
  if (doubles) {
    actor.inJail = false;
    actor.jailTurns = 0;
    pushLog(game, actor.id, `${actor.username} 掷出双骰，出狱并前进。`, "jail");
    advanceAndLand(game, actor, dice[0] + dice[1], random);
    return;
  }
  actor.jailTurns = Math.max(0, actor.jailTurns - 1);
  if (actor.jailTurns === 0) {
    pushLog(game, actor.id, `${actor.username} 第三次未掷出双骰，缴纳 ${formatMoney(rules.jailFine)} 后出狱。`, "jail", -rules.jailFine);
    charge(game, actor.id, null, rules.jailFine, "出狱费");
    actor.inJail = false;
    if (!game.pending) advanceAndLand(game, actor, dice[0] + dice[1], random);
    return;
  }
  game.stage = "end";
}

// ---- Buying and auctions ----

function buyTile(game: MonopolyGame, actorId: string, tile: number): void {
  const info = commercialAt(tile);
  if (!info) throw new MonopolyRuleError("TILE_NOT_BUYABLE");
  if (ownershipOf(game, tile)) throw new MonopolyRuleError("ALREADY_OWNED");
  const actor = findPlayer(game, actorId)!;
  if (actor.cash < info.price) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  const before = actor.cash;
  actor.cash -= info.price;
  game.ownership.push({ tile, ownerId: actorId, level: 0, mortgaged: false });
  recordLedger(game, actorId, "buy", info.price, before, actor.cash);
  pushLog(game, actorId, `${actor.username} 买下「${info.city}」，支付 ${formatMoney(info.price)}。`, "buy", -info.price, tile);
  game.pending = null;
  resumeAfterDecision(game);
}

/** Refusing a purchase: with auctions on, the tile goes up for auction at once. */
function declineBuy(game: MonopolyGame, actorId: string, tile: number, now: number): void {
  const rules = rulesOf(game);
  const actor = findPlayer(game, actorId)!;
  const info = commercialAt(tile);
  game.pending = null;
  if (!rules.auctionsEnabled) {
    pushLog(game, actorId, `${actor.username} 不购买「${info?.city ?? "这块地"}」。`, "buy", undefined, tile);
    resumeAfterDecision(game);
    return;
  }
  game.pending = {
    kind: "auction", tile, highBid: 0, highBidderId: null,
    bidders: game.players.filter((player) => !player.bankrupt).map((player) => player.id),
    endsAt: now + rules.auctionSeconds * 1000
  };
  pushLog(game, actorId, `「${info?.city ?? "这块地"}」进入拍卖。`, "auction", undefined, tile);
}

type AuctionPending = Extract<NonNullable<MonopolyGame["pending"]>, { kind: "auction" }>;

/**
 * 当前拍卖的最低出价：第一次出价按地价的固定比例起拍，之后每次至少在上一位的基础上加 `auctionMinRaise`。
 * 引擎、合法动作预览、机器人和界面都从这里取，避免几处各写一份公式。
 */
export function minimumBidFor(game: MonopolyGame, pending: AuctionPending): number {
  const rules = rulesOf(game);
  if (pending.highBid > 0) return pending.highBid + rules.auctionMinRaise;
  const price = commercialAt(pending.tile)?.price ?? 0;
  return Math.max(1, Math.round(price * rules.auctionOpeningShare));
}

function bid(game: MonopolyGame, actorId: string, tile: number, amount: number, now: number): void {
  const pending = game.pending;
  if (pending?.kind !== "auction" || pending.tile !== tile) throw new MonopolyRuleError("AUCTION_CLOSED");
  if (!pending.bidders.includes(actorId)) throw new MonopolyRuleError("NOT_IN_AUCTION");
  if (!Number.isInteger(amount) || amount <= 0) throw new MonopolyRuleError("INVALID_ACTION");
  const rules = rulesOf(game);
  const minimum = minimumBidFor(game, pending);
  if (amount < minimum) throw new MonopolyRuleError("BID_TOO_LOW");
  // A bid may never exceed what the bidder could actually pay, so an auction cannot end in a debt.
  const actor = findPlayer(game, actorId)!;
  if (amount > actor.cash) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  pending.highBid = amount;
  pending.highBidderId = actorId;
  pending.endsAt = now + rules.auctionSeconds * 1000;
  pushLog(game, actorId, `${actor.username} 出价 ${formatMoney(amount)}。`, "auction", undefined, tile);
}

function passAuction(game: MonopolyGame, actorId: string, now: number): void {
  const pending = game.pending;
  if (pending?.kind !== "auction") throw new MonopolyRuleError("AUCTION_CLOSED");
  if (!pending.bidders.includes(actorId)) throw new MonopolyRuleError("NOT_IN_AUCTION");
  pending.bidders = pending.bidders.filter((id) => id !== actorId);
  pushLog(game, actorId, `${nameOf(game, actorId)} 退出拍卖。`, "auction", undefined, pending.tile);
  settleAuction(game, now);
}

/** Also called by the room's timer, and after every pass: the auction closes when only one bidder is left or time is up. */
export function settleAuction(game: MonopolyGame, now: number): void {
  settleAuctionInner(game, now);
  // 一场拍卖结束（包括计时器收尾）后，银行清盘的下一间地产接着拍。
  startQueuedBankAuction(game, now);
}

function settleAuctionInner(game: MonopolyGame, now: number): void {
  const pending = game.pending;
  if (pending?.kind !== "auction") return;
  // 拍卖可能是落点后的“放弃购买”开的（此时 stage 是 resolve），也可能是银行清盘后插在回合之间的（stage 是 roll
  // 或 end）。只有前一种在拍卖结束后要把回合接着往下走；后一种结算完不能把下一个玩家的掷骰阶段改成结束。
  const fromLanding = game.stage === "resolve";
  const afterAuction = (): void => { if (fromLanding) resumeAfterDecision(game); };
  const bidderLeft = pending.bidders.length === 1 && pending.highBidderId === pending.bidders[0];
  const everyoneOut = pending.bidders.length === 0;
  const timeUp = now >= pending.endsAt;
  if (!bidderLeft && !everyoneOut && !timeUp) return;
  const info = commercialAt(pending.tile);
  if (!pending.highBidderId || !info) {
    // Nobody bid, or the last bidders left: the tile stays with the bank.
    game.pending = null;
    pushLog(game, undefined, `「${info?.city ?? "这块地"}」无人出价，仍归银行。`, "auction", undefined, pending.tile);
    afterAuction();
    return;
  }
  const winner = findPlayer(game, pending.highBidderId);
  if (!winner || winner.cash < pending.highBid) {
    // A bid was checked against cash when it was made; if that no longer holds the sale is refused rather than forced.
    game.pending = null;
    pushLog(game, undefined, `「${info.city}」的拍卖因出价者资金不足而取消。`, "auction", undefined, pending.tile);
    afterAuction();
    return;
  }
  const before = winner.cash;
  winner.cash -= pending.highBid;
  game.ownership.push({ tile: pending.tile, ownerId: winner.id, level: 0, mortgaged: false });
  recordLedger(game, winner.id, "auction", pending.highBid, before, winner.cash);
  game.pending = null;
  pushLog(game, winner.id, `${winner.username} 以 ${formatMoney(pending.highBid)} 拍得「${info.city}」。`, "auction", -pending.highBid, pending.tile);
  afterAuction();
}

// ---- Building, selling, mortgaging ----

function build(game: MonopolyGame, actorId: string, tile: number): void {
  const info = commercialAt(tile);
  if (!info || info.kind !== "property") throw new MonopolyRuleError("TILE_NOT_BUYABLE");
  const entry = ownershipOf(game, tile);
  if (!entry || entry.ownerId !== actorId) throw new MonopolyRuleError("NOT_OWNER");
  const rules = rulesOf(game);
  if (entry.mortgaged) throw new MonopolyRuleError("MORTGAGED");
  if (!holdsWholeRegion(game, actorId, tile)) throw new MonopolyRuleError("GROUP_INCOMPLETE");
  if (entry.level >= rules.maxBuildLevel) throw new MonopolyRuleError("BUILD_LIMIT");
  const members = REGION_PROPERTIES[info.region] ?? [];
  if (members.some((member) => ownershipOf(game, member.index)?.mortgaged)) throw new MonopolyRuleError("MORTGAGED");
  if (rules.buildEvenly) {
    // 均衡建设: no tile may be more than one level ahead of the lowest in its group.
    const levels = members.map((member) => ownershipOf(game, member.index)?.level ?? 0);
    if (entry.level > Math.min(...levels)) throw new MonopolyRuleError("BUILD_EVENLY");
  }
  const actor = findPlayer(game, actorId)!;
  if (actor.cash < info.buildCost) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  const before = actor.cash;
  actor.cash -= info.buildCost;
  entry.level += 1;
  recordLedger(game, actorId, "build", info.buildCost, before, actor.cash);
  pushLog(game, actorId, `${actor.username} 在「${info.city}」${entry.level === rules.maxBuildLevel ? "建成酒店" : `建成第 ${entry.level} 栋房屋`}，花费 ${formatMoney(info.buildCost)}。`, "build", -info.buildCost, tile);
}

function sellBuilding(game: MonopolyGame, actorId: string, tile: number): void {
  const info = commercialAt(tile);
  if (!info) throw new MonopolyRuleError("TILE_NOT_BUYABLE");
  const entry = ownershipOf(game, tile);
  if (!entry || entry.ownerId !== actorId) throw new MonopolyRuleError("NOT_OWNER");
  if (entry.level <= 0) throw new MonopolyRuleError("BUILD_LIMIT");
  const rules = rulesOf(game);
  if (rules.buildEvenly) {
    const levels = (REGION_PROPERTIES[info.region] ?? []).map((member) => ownershipOf(game, member.index)?.level ?? 0);
    if (entry.level < Math.max(...levels)) throw new MonopolyRuleError("BUILD_EVENLY");
  }
  const back = Math.round(info.buildCost * rules.buildingSellRate);
  entry.level -= 1;
  const actor = findPlayer(game, actorId)!;
  const before = actor.cash;
  actor.cash += back;
  recordLedger(game, actorId, "sell", back, before, actor.cash);
  pushLog(game, actorId, `${actor.username} 拆掉「${info.city}」的一级建筑，回收 ${formatMoney(back)}。`, "sell", back, tile);
}

function mortgage(game: MonopolyGame, actorId: string, tile: number): void {
  const info = commercialAt(tile);
  if (!info) throw new MonopolyRuleError("TILE_NOT_BUYABLE");
  const entry = ownershipOf(game, tile);
  if (!entry || entry.ownerId !== actorId) throw new MonopolyRuleError("NOT_OWNER");
  if (entry.mortgaged) throw new MonopolyRuleError("ALREADY_MORTGAGED");
  // 经典规则：抵押一整组之前，要先把该组所有房屋/酒店卖回银行。
  if (entry.level > 0) throw new MonopolyRuleError("HAS_BUILDINGS");
  if (info.kind === "property") {
    const members = REGION_PROPERTIES[info.region] ?? [];
    if (members.some((member) => (ownershipOf(game, member.index)?.level ?? 0) > 0)) {
      throw new MonopolyRuleError("HAS_BUILDINGS");
    }
  }
  const value = Math.round(info.price * rulesOf(game).mortgageRate);
  entry.mortgaged = true;
  const actor = findPlayer(game, actorId)!;
  const before = actor.cash;
  actor.cash += value;
  recordLedger(game, actorId, "mortgage", value, before, actor.cash);
  pushLog(game, actorId, `${actor.username} 抵押「${info.city}」，获得 ${formatMoney(value)}。`, "mortgage", value, tile);
}

function unmortgage(game: MonopolyGame, actorId: string, tile: number, now: number): void {
  const info = commercialAt(tile);
  if (!info) throw new MonopolyRuleError("TILE_NOT_BUYABLE");
  const entry = ownershipOf(game, tile);
  if (!entry || entry.ownerId !== actorId) throw new MonopolyRuleError("NOT_OWNER");
  if (!entry.mortgaged) throw new MonopolyRuleError("NOT_MORTGAGED");
  const cost = Math.round(info.mortgage * (1 + rulesOf(game).mortgageInterest));
  const actor = findPlayer(game, actorId)!;
  if (actor.cash < cost) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  const before = actor.cash;
  actor.cash -= cost;
  entry.mortgaged = false;
  recordLedger(game, actorId, "unmortgage", cost, before, actor.cash);
  pushLog(game, actorId, `${actor.username} 赎回「${info.city}」，支付 ${formatMoney(cost)}。`, "unmortgage", -cost, tile);
  void now;
}

// ---- Trades ----

function validTradeTile(game: MonopolyGame, tile: number, ownerId: string): boolean {
  const entry = ownershipOf(game, tile);
  // Only unbuilt tiles: a building cannot be handed over inside a trade, it would bypass the even-build rule.
  return !!entry && entry.ownerId === ownerId && entry.level === 0;
}

function offerTrade(game: MonopolyGame, fromId: string, toId: string, offer: TradeOffer, now: number): void {
  // One question at a time: a trade must never overwrite a buy/card/auction/debt the table is already waiting on.
  // Without this, an offer landing in that window erases the question and leaves the turn stuck in `resolve`.
  if (game.pending) throw new MonopolyRuleError("PENDING_DECISION");
  if (fromId === toId) throw new MonopolyRuleError("TRADE_INVALID");
  const from = findPlayer(game, fromId);
  const to = findPlayer(game, toId);
  if (!from || !to || to.bankrupt) throw new MonopolyRuleError("TRADE_INVALID");
  if (!Array.isArray(offer.give) || !Array.isArray(offer.take)) throw new MonopolyRuleError("TRADE_INVALID");
  if (!Number.isInteger(offer.money) || offer.money < 0) throw new MonopolyRuleError("TRADE_INVALID");
  if (!Number.isInteger(offer.jailCards) || offer.jailCards < 0) throw new MonopolyRuleError("TRADE_INVALID");
  if (new Set([...offer.give, ...offer.take]).size !== offer.give.length + offer.take.length) throw new MonopolyRuleError("TRADE_INVALID");
  if (!offer.give.every((tile) => validTradeTile(game, tile, fromId))) throw new MonopolyRuleError("TRADE_INVALID");
  if (!offer.take.every((tile) => validTradeTile(game, tile, toId))) throw new MonopolyRuleError("TRADE_INVALID");
  if (offer.money > from.cash) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  if (offer.jailCards > from.jailCards) throw new MonopolyRuleError("TRADE_INVALID");
  game.pending = { kind: "trade", fromId, toId, offer, status: "pending", endsAt: now + rulesOf(game).tradeSeconds * 1000 };
  // 日志把交易内容写全：谁给哪些地、多少现金和出狱卡，向对方要哪些地——判断值不值得接受不用再问一次。
  pushLog(game, fromId, `${from.username} 向${to.username} 提出交易${describeOffer(offer)}。`, "trade");
}

/** 交易内容的短句，日志和界面共用同一套读法。 */
export function describeOffer(offer: TradeOffer): string {
  const names = (tiles: number[]): string => tiles.map((tile) => tileName(tileAt(tile))).join("、");
  const parts: string[] = [];
  if (offer.give.length) parts.push(`给出 ${names(offer.give)}`);
  if (offer.money > 0) parts.push(`加 ${formatMoney(offer.money)} 现金`);
  if (offer.jailCards > 0) parts.push(`加 ${offer.jailCards} 张出狱卡`);
  if (offer.take.length) parts.push(`索要 ${names(offer.take)}`);
  return parts.length ? `：${parts.join("，")}` : "（空提议）";
}

function acceptTrade(game: MonopolyGame, now: number): void {
  const pending = game.pending;
  if (pending?.kind !== "trade") return;
  const { fromId, toId, offer } = pending;
  const from = findPlayer(game, fromId);
  const to = findPlayer(game, toId);
  if (!from || !to) throw new MonopolyRuleError("TRADE_INVALID");
  // Re-checked in full: the table may have changed since the offer was written.
  if (offer.money > from.cash) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  if (offer.jailCards > from.jailCards) throw new MonopolyRuleError("TRADE_INVALID");
  if (!offer.give.every((tile) => validTradeTile(game, tile, fromId))) throw new MonopolyRuleError("TRADE_INVALID");
  if (!offer.take.every((tile) => validTradeTile(game, tile, toId))) throw new MonopolyRuleError("TRADE_INVALID");
  // Atomically: money, cards and tiles all move, or nothing does.
  const fromBefore = from.cash;
  const toBefore = to.cash;
  from.cash -= offer.money;
  to.cash += offer.money;
  from.jailCards -= offer.jailCards;
  to.jailCards += offer.jailCards;
  for (const tile of offer.give) ownershipOf(game, tile)!.ownerId = toId;
  for (const tile of offer.take) ownershipOf(game, tile)!.ownerId = fromId;
  game.pending = null;
  if (offer.money > 0) {
    recordLedger(game, fromId, "trade", offer.money, fromBefore, from.cash);
    recordLedger(game, toId, "trade", offer.money, toBefore, to.cash);
  }
  pushLog(game, fromId, `交易达成：${from.username} 与${to.username} 交换了资产${offer.money ? `，${from.username} 支付 ${formatMoney(offer.money)}` : ""}。`, "trade", -offer.money);

  // 经典规则：抵押地产换了主人，新业主向银行支付抵押额的 10% 手续费才算接过去；本金仍挂在那块地上，
  // 由新业主之后自己赎回。付不出就照常开一个银行债务。
  const rules = rulesOf(game);
  const transfers = [
    ...offer.give.map((tile) => ({ tile, payerId: toId })),
    ...offer.take.map((tile) => ({ tile, payerId: fromId }))
  ];
  for (const transfer of transfers) {
    const entry = ownershipOf(game, transfer.tile);
    const info = commercialAt(transfer.tile);
    const payer = findPlayer(game, transfer.payerId);
    if (!entry?.mortgaged || !info || !payer) continue;
    const fee = Math.round(info.mortgage * rules.mortgageInterest);
    if (fee <= 0) continue;
    const before = payer.cash;
    pushLog(game, payer.id, `${payer.username} 受让抵押地产「${info.city}」，向银行支付 ${formatMoney(fee)} 手续费。`, "trade", -fee, transfer.tile);
    if (charge(game, payer.id, null, fee, "抵押地产受让手续费")) {
      recordLedger(game, payer.id, "trade", fee, before, payer.cash);
    }
  }
  resumeAfterTrade(game);
  void now;
}

function declineTrade(game: MonopolyGame, actorId: string): void {
  const pending = game.pending;
  if (pending?.kind !== "trade") return;
  game.pending = null;
  pushLog(game, actorId, `${nameOf(game, actorId)} 结束了交易提议。`, "trade");
  resumeAfterTrade(game);
}

/**
 * A trade ending while the turn is still in `resolve` would leave nothing to answer and no way forward — the roll and
 * the end-turn are both refused in that stage. No new trade can start there any more, so this only repairs a table that
 * was already stuck (a game saved by an older build).
 */
function resumeAfterTrade(game: MonopolyGame): void {
  if (game.stage === "resolve" && !game.pending) resumeAfterDecision(game);
}

/** Cancels a trade nobody answered in time. Returns true when it actually cleared one. */
export function expireTrade(game: MonopolyGame, now: number): boolean {
  const pending = game.pending;
  if (pending?.kind !== "trade") return false;
  const seconds = rulesOf(game).tradeSeconds;
  if (seconds <= 0 || now < pending.endsAt) return false;
  game.pending = null;
  pushLog(game, undefined, "交易提议超时，已自动取消。", "trade");
  resumeAfterTrade(game);
  return true;
}

// ---- Jail ----

function payJailFine(game: MonopolyGame, actorId: string): void {
  const actor = findPlayer(game, actorId)!;
  if (!actor.inJail) throw new MonopolyRuleError("NOT_NOW");
  const fine = rulesOf(game).jailFine;
  if (actor.cash < fine) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  actor.cash -= fine;
  actor.inJail = false;
  actor.jailTurns = 0;
  pushLog(game, actorId, `${actor.username} 缴纳 ${formatMoney(fine)} 出狱。`, "jail", -fine, JAIL_TILE);
}

function useJailCard(game: MonopolyGame, actorId: string): void {
  const actor = findPlayer(game, actorId)!;
  if (!actor.inJail) throw new MonopolyRuleError("NOT_NOW");
  if (actor.jailCards <= 0) throw new MonopolyRuleError("INVALID_ACTION");
  actor.jailCards -= 1;
  actor.inJail = false;
  actor.jailTurns = 0;
  pushLog(game, actorId, `${actor.username} 使用免费出狱卡出狱。`, "jail", undefined, JAIL_TILE);
}

// ---- Bankruptcy ----

/**
 * Out of the game. The creditor takes the tiles and whatever cash is left, and inherits the mortgages on them; with no
 * creditor (a tax or a card) everything goes back to the bank. Debts are never forgiven into silence: the record says who
 * owed what, and the winner is decided as soon as fewer than two players are left.
 */
function declareBankrupt(game: MonopolyGame, actorId: string, now: number): void {
  const actor = findPlayer(game, actorId)!;
  const debt = game.pending?.kind === "debt" && game.pending.playerId === actorId ? game.pending : null;
  const creditorId = debt?.creditorId ?? null;
  const rules = rulesOf(game);
  const loanDebt = bankDebtOf(actor);

  actor.bankrupt = true;
  actor.active = false;
  pushLog(game, actorId,
    `${actor.username} 宣告破产${debt ? `，欠${nameOf(game, debt.creditorId)} ${formatMoney(debt.amount)}` : ""}`
    + `${loanDebt > 0 ? `；另有银行贷款 ${formatMoney(loanDebt)} 未还` : ""}。`, "bankrupt");
  // 无抵押贷款和未付利息由银行承担，不转给债权人，也不从已转移的资产里再扣一次。
  clearBankDebt(game, actorId);

  for (const entry of owners(game, actorId)) {
    if (creditorId) {
      entry.ownerId = creditorId;
      // Buildings are sold back to the bank as part of the settlement.
      entry.level = 0;
      if (entry.mortgaged) {
        // The creditor inherits the mortgage and pays the interest on it.
        const info = commercialAt(entry.tile);
        const interest = info ? Math.round(info.mortgage * rules.bankruptcyInterestRate) : 0;
        const creditor = findPlayer(game, creditorId);
        if (interest && creditor && creditor.cash >= interest) creditor.cash -= interest;
      }
    } else {
      // 地产回到银行，清盘后由银行逐间重新拍卖（`bankAuctions` 队列）。
      game.ownership = game.ownership.filter((kept) => kept !== entry);
      if (commercialAt(entry.tile)) game.bankAuctions.push(entry.tile);
    }
  }
  if (creditorId) {
    const left = Math.max(0, actor.cash);
    actor.cash = 0;
    const creditor = findPlayer(game, creditorId);
    if (left && creditor) creditor.cash += left;
  } else {
    actor.cash = 0;
  }
  game.pending = null;

  const alive = game.players.filter((player) => !player.bankrupt);
  if (alive.length <= 1) { finishGame(game, now); return; }
  // The bankrupt player's turn is over even if it was happening now.
  if (game.order[game.turnIndex] === actorId) nextTurn(game, now);
  else game.stage = "end";
}

/**
 * 银行清盘后没有人认领的地产，一间一间重新拍卖。没有待决问题时才开下一场，所以它会插在回合之间而不是叠在一起；
 * 拍卖本身仍由房间的计时器收尾。
 */
export function startQueuedBankAuction(game: MonopolyGame, now: number): boolean {
  if (game.winner || game.pending) return false;
  const rules = rulesOf(game);
  while (game.bankAuctions.length > 0) {
    const tile = game.bankAuctions.shift()!;
    const info = commercialAt(tile);
    if (!info || ownershipOf(game, tile) || !rules.auctionsEnabled) continue;
    const bidders = game.players.filter((player) => !player.bankrupt).map((player) => player.id);
    if (bidders.length === 0) return false;
    game.pending = {
      kind: "auction", tile, highBid: 0, highBidderId: null, bidders,
      endsAt: now + rules.auctionSeconds * 1000
    };
    pushLog(game, undefined, `「${info.city}」由银行重新拍卖。`, "auction", undefined, tile);
    return true;
  }
  return false;
}

export { settleAuction as closeAuction, standingsOf, activePlayer, owners, rentOf, goTo, DEFAULT_RULES };
