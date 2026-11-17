/**
 * A simple, deterministic-in-spirit opponent, used two ways: to run thousands of self-played games for balance, and to fill
 * a seat so a single person can play a full game without a server or a second human.
 *
 * It is deliberately not clever. It answers every question the engine asks it, acts only through `applyAction` — the same
 * door a client uses — and never reads or writes state the engine does not expose. That keeps it honest: if the bot can
 * play a game to the end, a well-behaved client can too.
 */

import { REGION_PROPERTIES, commercialAt, tileAt } from "./board.ts";
import { rulesOf, activePlayer, findPlayer, holdsWholeRegion, ownershipOf, rentOf } from "./rules.ts";
import { answerActions, manageActions, tradePartners } from "./legal.ts";
import type { MonopolyAction, MonopolyGame, PlayerState } from "./protocol.ts";
import { applyAction } from "./turn.ts";
import type { Random } from "./rules.ts";

/**
 * The turn on which each game's bot last put a trade on the table. A WeakMap keeps this out of the game state: it is
 * bookkeeping for the bot alone, and a game that is dropped is collected with its entry.
 *
 * It exists to stop a livelock. Two bots will both decline an offer they consider bad, and the offerer would then offer
 * the identical trade again on every subsequent step of the same turn — forever, because nothing about the table changed.
 * One offer per turn breaks the loop and lets the turn end.
 */
const lastTradeTurn = new WeakMap<MonopolyGame, number>();
export function tileWorth(game: MonopolyGame, player: PlayerState, tile: number): number {
  const info = commercialAt(tile);
  if (!info) return 0;
  const value = info.price;
  // Finishing a group doubles rent and unlocks building, so it is worth a premium. "Completing" means every other tile
  // of the group is already the player's, and this one is the last piece missing.
  if (info.kind === "property") {
    const members = REGION_PROPERTIES[info.region] ?? [];
    const notMine = members.filter((member) => member.index !== tile && ownershipOf(game, member.index)?.ownerId !== player.id);
    if (notMine.length === 0) return value * 2.2;
  }
  return value;
}

/** The highest bid a bot is willing to make, so an auction ends at a sane price rather than at everything it has. */
function bidLimit(game: MonopolyGame, player: PlayerState, tile: number): number {
  const worth = tileWorth(game, player, tile);
  // Never more than the price plus a little, and never more than half its cash, so it cannot be left unable to pay rent.
  return Math.min(player.cash, Math.floor(Math.min(worth * 1.1, worth + 60)));
}

/**
 * Chooses one action for `playerId`, or null when there is nothing to do. `random` only breaks ties, so a bot never needs
 * to be replayable to be useful.
 */
export function chooseAction(game: MonopolyGame, playerId: string, random: Random): MonopolyAction | null {
  const player = findPlayer(game, playerId);
  if (!player || player.bankrupt || game.winner) return null;
  const rules = rulesOf(game);
  const pending = game.pending;

  // ---- Answer the open question first ----
  if (pending) {
    const answers = answerActions(game, playerId);
    if (answers.length) {
      switch (pending.kind) {
        case "buy": {
          const affordable = player.cash >= pending.price;
          const worth = tileWorth(game, player, pending.tile);
          // Buy anything it can comfortably afford; leave the very expensive ones to the auction.
          const comfortable = player.cash - pending.price > 200;
          // A group-completing tile is worth stretching for, but never past the cash it actually has.
          return affordable && (comfortable || worth >= pending.price * 1.5)
            ? { type: "buy" }
            : { type: "decline" };
        }
        case "card":
          return { type: "ackCard" };
        case "debt": {
          // Try to raise the money before giving up: sell buildings, then mortgage, cheapest first.
          const raise = answers.find((action) => action.type === "mortgage");
          if (raise) return raise;
          const sell = manageActions(game, playerId).find((action) => action.type === "sellBuilding");
          if (sell) return sell;
          return { type: "declareBankrupt" };
        }
        case "auction": {
          const limit = bidLimit(game, player, pending.tile);
          const minimum = pending.highBid === 0 ? 1 : pending.highBid + rules.auctionMinRaise;
          if (pending.highBidderId === playerId) return { type: "pass" };
          if (minimum <= limit) return { type: "bid", amount: minimum };
          return { type: "pass" };
        }
        case "trade": {
          if (pending.toId === playerId) {
            // Accept only what is clearly good value: it receives more than it gives.
            const gain = pending.offer.take.reduce((sum, tile) => sum + tileWorth(game, player, tile), 0) + pending.offer.money;
            const loss = pending.offer.give.reduce((sum, tile) => sum + tileWorth(game, player, tile), 0);
            return { type: "answerTrade", accept: gain > loss * 1.25 };
          }
          return { type: "cancelTrade" };
        }
        default:
          return answers[0] ?? null;
      }
    }
    // Not its question: it may still raise money, but nothing else.
    const manage = manageActions(game, playerId);
    void manage;
    return null;
  }

  if (activePlayer(game)?.id !== playerId) {
    // Out of turn a bot stays quiet; the room's timer is what asks it again on its own turn.
    return null;
  }

  // ---- Its own turn ----
  if (game.stage === "roll") {
    if (player.inJail) {
      if (player.jailCards > 0) return { type: "useJailCard" };
      if (player.cash >= rules.jailFine) return { type: "payJailFine" };
    }
    return { type: "roll" };
  }

  if (game.stage === "end") {
    // Build when it can afford it and the group is complete; the even-build rule is applied by the engine.
    const builds = manageActions(game, playerId).filter((action) => action.type === "build");
    if (builds.length && player.cash > 400) {
      const pick = builds[Math.floor(random() * builds.length)]!;
      return pick;
    }
    // A trade offer when a tile would complete a group and the partner holds it. Only once per turn: a declined offer
    // that is immediately repeated would loop forever between two bots, since neither ever changes its mind.
    if (lastTradeTurn.get(game) !== game.turn) {
      const trade = bestTrade(game, player, random);
      if (trade) {
        lastTradeTurn.set(game, game.turn);
        return trade;
      }
    }
    return { type: "endTurn" };
  }

  return null;
}

/**
 * A single sensible trade: offer cash for one tile that would complete a region the bot nearly holds. Returning null keeps
 * the bot from spamming offers — a kind of spam that would make self-play noisy and the balance numbers meaningless.
 */
function bestTrade(game: MonopolyGame, player: PlayerState, random: Random): MonopolyAction | null {
  for (const regionId of Object.keys(REGION_PROPERTIES)) {
    const members = REGION_PROPERTIES[regionId] ?? [];
    const mine = members.filter((member) => ownershipOf(game, member.index)?.ownerId === player.id);
    if (mine.length !== members.length - 1) continue;
    const wanted = members.find((member) => {
      const entry = ownershipOf(game, member.index);
      return !!entry && entry.ownerId !== player.id && entry.level === 0;
    });
    if (!wanted) continue;
    const entry = ownershipOf(game, wanted.index)!;
    const partner = findPlayer(game, entry.ownerId);
    // Never trade with someone who is out, and never offer more cash than it has to spare.
    if (!partner || partner.bankrupt) continue;
    if (!tradePartners(game, player.id).some((other) => other.id === partner.id)) continue;
    const offer = Math.min(Math.floor(player.cash * 0.4), Math.round(wanted.price * 1.6));
    if (offer < 1) continue;
    void random;
    return { type: "offerTrade", toId: partner.id, offer: { give: [], take: [wanted.index], money: offer, jailCards: 0 } };
  }
  return null;
}

/** Runs one step for the player the game is waiting on. Returns false when that player had nothing to do. */
export function stepBot(game: MonopolyGame, now: number, random: Random): boolean {
  if (game.winner) return false;
  // The game always has someone to answer: the player being asked, else the active player.
  const asked = game.pending && game.pending.kind !== "auction"
    ? (game.pending as { playerId?: string }).playerId
    : game.pending?.kind === "auction" ? game.pending.bidders[0] : undefined;
  const playerId = asked ?? activePlayer(game)?.id;
  if (!playerId) return false;
  const action = chooseAction(game, playerId, random);
  if (!action) return false;
  try {
    applyAction(game, playerId, action, now, random);
    return true;
  } catch {
    // A hint that has gone stale must not wedge a self-play run: fall back to the safest action available.
    const fallback = answerActions(game, playerId)[0] ?? manageActions(game, playerId)[0];
    if (fallback) {
      try { applyAction(game, playerId, fallback, now, random); return true; } catch { return false; }
    }
    return false;
  }
}

/** Where a tile's rent stands for the bot's own bookkeeping; exported so balance output can show it. */
export const botRentOf = rentOf;
export const botTileName = (tile: number): string => tileAt(tile).name ?? "";
