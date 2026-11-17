/**
 * Which actions a player may legally take right now.
 *
 * The engine in `turn.ts` is the only authority: it refuses an illegal action with a code. This file answers the same
 * question *before* the action is sent, so the interface can enable the right buttons instead of letting a player press
 * something that will be refused. It is derived from the same state, never a second copy of the rules.
 *
 * A player always sees two kinds of action: the ones that answer the open question (if they are the one being asked),
 * and the ones that only move their own money — building, selling, mortgaging — which are legal at any time, even out of
 * turn, because raising cash is how a debt gets paid.
 */

import { REGION_PROPERTIES, commercialAt } from "./board.ts";
import { rulesOf, activePlayer, findPlayer, holdsWholeRegion, ownershipOf } from "./rules.ts";
import { bankDebtOf, remainingLoanRoom } from "./bank.ts";
import type { MonopolyGame, MonopolyAction, PlayerState } from "./protocol.ts";

/** True when `playerId` is the one the open question is addressed to, so only they may answer it. */
export function isBeingAsked(game: MonopolyGame, playerId: string): boolean {
  const pending = game.pending;
  if (!pending) return false;
  if (pending.kind === "auction") return pending.bidders.includes(playerId);
  if (pending.kind === "trade") return pending.fromId === playerId || pending.toId === playerId;
  return pending.playerId === playerId;
}

/** The actions that answer the open question, for the player it is addressed to. Empty when they owe nothing to answer. */
export function answerActions(game: MonopolyGame, playerId: string): MonopolyAction[] {
  const pending = game.pending;
  if (!pending) return [];
  const player = findPlayer(game, playerId);
  if (!player || player.bankrupt) return [];

  switch (pending.kind) {
    case "buy": {
      if (pending.playerId !== playerId) return [];
      // Buying is only offered when it can actually be paid for; otherwise declining (into an auction) is the way out.
      return player.cash >= pending.price
        ? [{ type: "buy" }, { type: "decline" }]
        : [{ type: "decline" }];
    }
    case "card":
      return pending.playerId === playerId ? [{ type: "ackCard" }] : [];
    case "debt": {
      if (pending.playerId !== playerId) return [];
      // The way out of a debt is to raise money; declaring bankruptcy is always available as the last resort.
      return [{ type: "declareBankrupt" }];
    }
    case "auction": {
      if (!pending.bidders.includes(playerId)) return [];
      // A bid may never exceed cash, so a broke bidder can only watch or leave.
      const minimum = pending.highBid === 0 ? 1 : pending.highBid + rulesOf(game).auctionMinRaise;
      const actions: MonopolyAction[] = [{ type: "pass" }];
      if (player.cash >= minimum) actions.unshift({ type: "bid", amount: minimum });
      return actions;
    }
    case "trade": {
      if (pending.toId === playerId) return [{ type: "answerTrade", accept: true }, { type: "answerTrade", accept: false }];
      if (pending.fromId === playerId) return [{ type: "cancelTrade" }];
      return [];
    }
    default:
      return [];
  }
}

/** The tile-management actions a player may take on their own holdings, whatever else is happening. */
export function manageActions(game: MonopolyGame, playerId: string): MonopolyAction[] {
  const player = findPlayer(game, playerId);
  if (!player || player.bankrupt || game.winner) return [];
  const rules = rulesOf(game);
  const actions: MonopolyAction[] = [];
  const held = game.ownership.filter((entry) => entry.ownerId === playerId);

  for (const entry of held) {
    const info = commercialAt(entry.tile);
    if (!info) continue;
    if (entry.mortgaged) {
      const cost = Math.round(info.mortgage * (1 + rules.mortgageInterest));
      if (player.cash >= cost) actions.push({ type: "unmortgage", tile: entry.tile });
      continue;
    }
    // Selling one level back is always possible below the top, and is how a mortgage-blocked tile is freed up.
    if (entry.level > 0) actions.push({ type: "sellBuilding", tile: entry.tile });
    // Mortgaging needs the tile clear of buildings — and, classically, the whole colour group clear as well.
    const groupHasBuildings = info.kind === "property"
      && (REGION_PROPERTIES[info.region] ?? []).some((member) => (ownershipOf(game, member.index)?.level ?? 0) > 0);
    if (entry.level === 0 && !groupHasBuildings) actions.push({ type: "mortgage", tile: entry.tile });
  }

  // Building: the whole region held, every tile of it clear of mortgages, and the even-build rule not broken.
  for (const entry of held) {
    const info = commercialAt(entry.tile);
    if (!info || info.kind !== "property" || entry.mortgaged) continue;
    if (entry.level >= rules.maxBuildLevel) continue;
    if (player.cash < info.buildCost) continue;
    if (!holdsWholeRegion(game, playerId, entry.tile)) continue;
    const members = REGION_PROPERTIES[info.region] ?? [];
    if (members.some((member) => ownershipOf(game, member.index)?.mortgaged)) continue;
    if (rules.buildEvenly) {
      const levels = members.map((member) => ownershipOf(game, member.index)?.level ?? 0);
      if (entry.level > Math.min(...levels)) continue;
    }
    actions.push({ type: "build", tile: entry.tile });
  }
  return actions;
}

/**
 * Everything `playerId` may send right now, most relevant first: the answer to an open question, then their turn's own
 * moves, then the money moves. The client uses this to decide what to show; it is a hint, not a gate — the engine still
 * refuses anything that has become illegal since this was computed.
 */
export function legalActions(game: MonopolyGame, playerId: string): MonopolyAction[] {
  if (game.winner) return [];
  const player = findPlayer(game, playerId);
  if (!player || player.bankrupt) return [];
  const actions: MonopolyAction[] = [...answerActions(game, playerId)];

  // While a question is open, only its answers (and money moves) may be sent.
  const blocked = !!game.pending;
  const theirTurn = activePlayer(game)?.id === playerId;
  if (theirTurn && !blocked) {
    if (game.stage === "roll") {
      if (player.inJail) {
        const rules = rulesOf(game);
        if (player.jailCards > 0) actions.push({ type: "useJailCard" });
        if (player.cash >= rules.jailFine) actions.push({ type: "payJailFine" });
      }
      actions.push({ type: "roll" });
    }
    if (game.stage === "end") actions.push({ type: "endTurn" });
  }
  // Trading is offered while it is the player's turn and nothing else is on the table.
  if (theirTurn && !blocked) actions.push({ type: "offerTrade", toId: "", offer: { give: [], take: [], money: 0, jailCards: 0 } });

  // 银行随时可去：有额度就能借，有欠款就能还。金额与请求编号由界面在真正提交时填。
  const room = remainingLoanRoom(game, player);
  if (room > 0 && rulesOf(game).loanTiers.some((tier) => tier.amount <= room)) {
    actions.push({ type: "takeLoan", amount: 0, requestId: "" });
  }
  if (bankDebtOf(player) > 0 && player.cash > 0) {
    actions.push({ type: "repayLoan", amount: 0, requestId: "" });
  }

  actions.push(...manageActions(game, playerId));
  return actions;
}

/** True when the action is in the list, by kind alone (or by kind and tile), which is what a button needs to know. */
export function canDo(game: MonopolyGame, playerId: string, action: MonopolyAction): boolean {
  return legalActions(game, playerId).some((candidate) => {
    if (candidate.type !== action.type) return false;
    if (candidate.type === "build" && action.type === "build") return candidate.tile === action.tile;
    if (candidate.type === "sellBuilding" && action.type === "sellBuilding") return candidate.tile === action.tile;
    if (candidate.type === "mortgage" && action.type === "mortgage") return candidate.tile === action.tile;
    if (candidate.type === "unmortgage" && action.type === "unmortgage") return candidate.tile === action.tile;
    return true;
  });
}

/** Which players the viewer may open a trade with: everyone else still in the game. */
export function tradePartners(game: MonopolyGame, playerId: string): PlayerState[] {
  return game.players.filter((player) => player.id !== playerId && !player.bankrupt);
}
