import { describe, expect, it, vi } from "vitest";
import { GameSession, BOT_STEP_MS } from "../../src/client/session.ts";

const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
};

/** A session with every seat a bot, so a test can play it out without a human in the loop. */
function allBots(seed: number, seats = 3): GameSession {
  return new GameSession({
    seats,
    botSeats: Array.from({ length: seats }, (_, seat) => seat),
    config: { timeLimitMinutes: 0 },
    random: seeded(seed)
  });
}

describe("大富翁：本地对局", () => {
  it("gives the human seat 0 and a bot every other seat", () => {
    const session = new GameSession({ seats: 4, botSeats: [1, 2, 3], random: seeded(1) });
    expect(session.humanId).toBe("you");
    expect(session.game.order[0]).toBe("you");
    expect(session.game.players).toHaveLength(4);
    // The human starts with the full starting cash, like everyone else.
    expect(session.me.cash).toBe(1500);
    session.dispose();
  });

  it("applies the human's action through the engine and reports a refusal", () => {
    const errors: string[] = [];
    const session = new GameSession({ seats: 2, botSeats: [1], random: seeded(2), onError: (code) => errors.push(code) });
    // It is the human's turn, so a roll is legal and must change the state.
    expect(session.isMyTurn).toBe(true);
    const before = session.me.position;
    session.act({ type: "roll" });
    // Either the piece moved, or a question opened on the starting tile — but one of the two must hold.
    expect(session.me.position !== before || session.game.pending !== null).toBe(true);
    // An end-turn before rolling is refused, and the refusal is reported rather than thrown.
    const fresh = new GameSession({ seats: 2, botSeats: [1], random: seeded(3), onError: (code) => errors.push(code) });
    fresh.act({ type: "endTurn" });
    expect(errors).toContain("NOT_NOW");
    session.dispose();
    fresh.dispose();
  });

  it("plays a whole game to a winner with the bots doing all the work", async () => {
    vi.useFakeTimers();
    try {
      const session = allBots(4, 3);
      // Every seat is a bot, so the session's own loop should carry the game to a winner without any help.
      for (let tick = 0; tick < 20_000 && !session.game.winner; tick += 1) {
        await vi.advanceTimersByTimeAsync(BOT_STEP_MS + 10);
      }
      expect(session.game.winner).not.toBeNull();
      // The engine's promise holds for the whole game, not just a turn.
      for (const player of session.game.players) expect(player.cash).toBeGreaterThanOrEqual(0);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops on the human and does not keep playing their seat", () => {
    const session = new GameSession({ seats: 3, botSeats: [1, 2], random: seeded(5) });
    expect(session.isMyTurn).toBe(true);
    // The bots must not act for the human: the human's piece is still on 起点 and nothing was rolled.
    expect(session.me.position).toBe(0);
    session.dispose();
  });

  it("does not send a refused action when the turn clock runs out during a decision", async () => {
    vi.useFakeTimers();
    try {
      const errors: string[] = [];
      const session = new GameSession({
        seats: 2, botSeats: [1], config: { timeLimitMinutes: 0 }, random: seeded(17), onError: (code) => errors.push(code)
      });
      // Play until a question is open for the human — a purchase or a card — which is the state a lapsed turn must handle.
      for (let step = 0; step < 400 && !session.isMyQuestion; step += 1) {
        if (session.isMyTurn && session.game.stage === "roll") session.act({ type: "roll" });
        else if (session.isMyTurn && session.game.stage === "end") session.act({ type: "endTurn" });
        else await vi.advanceTimersByTimeAsync(BOT_STEP_MS + 10);
      }
      if (!session.isMyQuestion) { session.dispose(); vi.useRealTimers(); return; }

      errors.length = 0;
      // Let the 60-second turn clock expire while the question is still open. The old code sent `endTurn` here, which the
      // engine refused (NOT_NOW) and which surfaced to the player as an error toast.
      await vi.advanceTimersByTimeAsync(70_000);
      expect(errors).not.toContain("NOT_NOW");
      expect(errors).not.toContain("PENDING_DECISION");
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes an auction even when only the human is left in it", async () => {
    vi.useFakeTimers();
    try {
      // A short auction, so the deadline arrives within the test.
      const session = new GameSession({
        seats: 3, botSeats: [1, 2], config: { timeLimitMinutes: 0, auctionSeconds: 2 }, random: seeded(11)
      });
      let settled = false;
      // Play the human's turns, declining every purchase so the tiles go to auction.
      for (let step = 0; step < 4000 && !settled; step += 1) {
        const game = session.game;
        if (game.winner) break;
        if (game.pending?.kind === "auction") {
          // The bots pass on their own; once only the human is left, the deadline has to close it. Nothing here bids.
          await vi.advanceTimersByTimeAsync(BOT_STEP_MS + 10);
          if (session.game.pending?.kind !== "auction") settled = true;
          continue;
        }
        if (game.pending?.kind === "buy" && game.pending.playerId === session.humanId) { session.act({ type: "decline" }); continue; }
        if (game.pending?.kind === "card" && game.pending.playerId === session.humanId) { session.act({ type: "ackCard" }); continue; }
        if (session.isMyTurn && game.stage === "roll") { session.act({ type: "roll" }); continue; }
        if (session.isMyTurn && game.stage === "end") { session.act({ type: "endTurn" }); continue; }
        await vi.advanceTimersByTimeAsync(BOT_STEP_MS + 10);
      }
      // The table must not be left waiting on an auction nobody can close.
      expect(settled).toBe(true);
      expect(session.game.pending?.kind).not.toBe("auction");
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
