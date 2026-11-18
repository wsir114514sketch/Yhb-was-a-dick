/**
 * A local game session: the whole authoritative loop, in the browser, for playing without a server.
 *
 * The server is not being built yet, but the engine is already written to be driven by one — a state, an action, a clock.
 * This class *is* that driver, at the smallest size that plays a real game: it holds the state, applies actions through the
 * very same `applyAction` the server will call, runs the bots for the seats nobody is sitting in, and tells React when to
 * re-render. Nothing here re-implements a rule; if this drifts from the server version, that is a bug in this file alone.
 *
 * When the server module is built, it can call the same engine calls; the client then keeps only the view. Keeping this
 * split is what makes the server swap a wiring change rather than a rewrite.
 */

import { applyAction, expireTrade, settleAuction } from "../shared/turn.ts";
import { activePlayer, checkClock, finishGame, newGame } from "../shared/rules.ts";
import { advanceGameClock } from "../shared/clock.ts";
import { chooseAction } from "../shared/bot.ts";
import { answerActions } from "../shared/legal.ts";
import type { MonopolyAction, MonopolyError, MonopolyGame, PlayerState, RoomConfig } from "../shared/protocol.ts";

/** Bumped on every state change, so React can subscribe to a number rather than a mutable object. */
export type Listener = () => void;

export interface SessionOptions {
  /** How many seats are at the table. The human takes seat 0. */
  seats: number;
  /** Which seats are bots. Any seat not listed is played by the human. */
  botSeats?: number[];
  config?: Partial<RoomConfig>;
  /** Called when an action is refused, so the interface can explain why. */
  onError?: (code: MonopolyError) => void;
  /** A source of randomness. Overridable so a session can be made reproducible for a test. */
  random?: () => number;
}

/**
 * The turn timer, in milliseconds. The rules specify 60 seconds per turn; a local game keeps that, and the timeout action
 * is the same one the server's timer would take — roll, or end the turn — so the local and remote games behave alike.
 */
export const TURN_SECONDS = 60;

/**
 * How long the interface pauses between bot steps, in milliseconds. Bot moves have to be slow enough to follow; this is
 * also the animation budget for one move, so it is shared with the board's move duration.
 */
export const BOT_STEP_MS = 620;

export class GameSession {
  game: MonopolyGame;
  /** The seat the human plays. */
  readonly humanSeat = 0;
  readonly seats: number;
  private readonly botSeats: Set<number>;
  private readonly listeners = new Set<Listener>();
  private readonly random: () => number;
  private readonly onError: (code: MonopolyError) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  /** 本地局自己就是时钟的权威，所以这里也要像服务器一样每秒推进一次。 */
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  /** The id of the player the interface is watching, i.e. the human. */
  readonly humanId = "you";

  constructor(options: SessionOptions) {
    this.seats = options.seats;
    this.botSeats = new Set(options.botSeats ?? []);
    this.random = options.random ?? (() => Math.random());
    this.onError = options.onError ?? (() => {});
    const ids = Array.from({ length: options.seats }, (_, seat) => (seat === this.humanSeat ? this.humanId : `bot-${seat}`));
    const people = new Map(ids.map((id, seat) => [id, { username: seat === this.humanSeat ? "你" : `玩家 ${seat + 1}`, avatarUrl: null }]));
    const config: RoomConfig = { maxPlayers: options.seats, allowSpectators: false, ...options.config };
    this.game = newGame(ids, people, config, this.random, Date.now());
    // 游戏时钟独立于回合计时：不管轮到谁、有没有决策，都按同样的节奏走。
    this.clockTimer = setInterval(() => {
      if (advanceGameClock(this.game, Date.now())) this.emit();
    }, 1000);
    // Start the table: if seat 0 is a bot too, the opening turn is its move, and nothing above will ever fire without this.
    this.queueStep(0);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** The player the interface is showing: always the human. */
  get me(): PlayerState {
    return this.game.players.find((player) => player.id === this.humanId) ?? this.game.players[0]!;
  }

  /** True when it is the human's move and nothing is blocking it. */
  get isMyTurn(): boolean {
    return activePlayer(this.game)?.id === this.humanId && !this.game.winner;
  }

  /** Answers the open question if it is addressed to the human; otherwise false. */
  get isMyQuestion(): boolean {
    const pending = this.game.pending;
    if (!pending) return false;
    if (pending.kind === "auction") return pending.bidders.includes(this.humanId);
    if (pending.kind === "trade") return pending.fromId === this.humanId || pending.toId === this.humanId;
    return pending.playerId === this.humanId;
  }

  /**
   * Sends one action. The human's action is applied through the engine; a refusal is reported and the state is untouched,
   * exactly as a server would answer a bad request.
   */
  act(action: MonopolyAction): boolean {
    const actorId = this.isMyQuestion || this.isMyTurn ? this.humanId : activePlayer(this.game)?.id;
    if (!actorId) return false;
    // A queued bot step must not fire on top of the human's action and answer something that just changed.
    this.stopStep();
    return this.apply(actorId, action);
  }

  private apply(actorId: string, action: MonopolyAction): boolean {
    try {
      applyAction(this.game, actorId, action, Date.now(), this.random);
    } catch (error) {
      const code = (error as { code?: MonopolyError }).code ?? "INVALID_ACTION";
      this.onError(code);
      return false;
    }
    this.emit();
    this.schedule();
    return true;
  }  /** Runs the bots and the clock until it is the human's turn or the game is over. */
  private schedule(): void {
    if (this.game.winner) { this.emit(); return; }
    // The clock is part of the rules.
    checkClock(this.game, Date.now());
    if (this.game.winner) { this.emit(); return; }
    this.queueStep();
  }

  /**
   * Queues one step of the loop. A timeout rather than a microtask: a microtask chain drains before the browser paints, so
   * every bot move in a turn would happen invisibly and the table would jump. Yielding between steps lets the board paint
   * each move. The small delay is also what makes a bot's turn readable — a bot that moves faster than the eye can follow is
   * indistinguishable from a bug.
   */
  private queueStep(delay = BOT_STEP_MS): void {
    if (this.stepTimer !== null) return;
    this.stepTimer = setTimeout(() => {
      this.stepTimer = null;
      this.advance();
    }, delay);
  }

  /**
   * One step of the loop: if a bot is on the spot, play for it and continue; if the human is needed, stop and let the
   * interface ask. A microtask, not a timer, so the bots do not make the human wait.
   */
  private advance(): void {
    if (this.game.winner) return;
    const pending = this.game.pending;
    // An auction closes on its own deadline, or as soon as only its highest bidder is left. Both are settled here rather
    // than waiting for a bid that will not come — with every seat a bot, nothing else would ever drive the clock.
    if (pending?.kind === "auction") {
      const soleLeader = pending.bidders.length === 1 && pending.highBidderId === pending.bidders[0];
      if (Date.now() >= pending.endsAt || soleLeader) {
        settleAuction(this.game, Date.now());
        this.emit();
        this.schedule();
        return;
      }
    }
    // A trade offer nobody answers cancels itself; otherwise the whole table waits on it, since an open trade refuses
    // every other action.
    if (pending?.kind === "trade" && expireTrade(this.game, Date.now())) {
      this.emit();
      this.schedule();
      return;
    }
    // Who must act right now? A bot only plays when the table is waiting on it: on its own turn, or on a question it is
    // one of the parties to — never merely because the turn belongs to its seat.
    const askedId = pending
      ? pending.kind === "auction"
        // 领先的机器人没有动作可做（它不能给自己加价）；把它排除，这样没有可出价的人时循环会停下来等计时器。
        ? pending.bidders.find((id) => this.isBot(id) && id !== pending.highBidderId)
        : pending.kind === "trade" ? (this.isBot(pending.toId) ? pending.toId : this.isBot(pending.fromId) ? pending.fromId : undefined)
          : this.isBot(pending.playerId) ? pending.playerId : undefined
      : undefined;
    const actorId = pending ? askedId : this.isBot(activePlayer(this.game)?.id) ? activePlayer(this.game)?.id : undefined;
    if (!actorId) {
      // It is the human's turn, or the human owes an answer: start the clock and stop here, so the interface can ask.
      this.startTimer();
      this.emit();
      return;
    }
    const action = chooseAction(this.game, actorId, this.random);
    if (!action) {
      // A bot with nothing to do: end the turn rather than stall.
      if (this.game.stage === "end") this.apply(actorId, { type: "endTurn" });
      else if (this.game.stage === "roll") this.apply(actorId, { type: "roll" });
      else this.emit();
      return;
    }
    this.apply(actorId, action);
  }

  private isBot(id: string | undefined): boolean {
    if (!id) return false;
    const player = this.game.players.find((entry) => entry.id === id);
    // Membership of `botSeats` decides, not identity: a test can make seat 0 a bot, and a seat the human sits in is played
    // by the human only because it was not listed.
    return !!player && this.botSeats.has(player.seat);
  }

  /** The turn timer: at 60 seconds the same action the server's timer would take is applied. */
  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.game.winner) { this.stopTimer(); return; }
      // An auction has its own deadline, and it closes whether or not anyone still owes an answer — including when only
      // the human is left in it. Without this the auction would never settle and the table would sit there.
      if (this.game.pending?.kind === "auction") {
        if (Date.now() >= this.game.pending.endsAt) {
          settleAuction(this.game, Date.now());
          this.emit();
          this.schedule();
        }
        return;
      }
      if (this.game.pending?.kind === "trade") {
        if (expireTrade(this.game, Date.now())) {
          this.emit();
          this.schedule();
        }
        return;
      }
      if (!this.isMyTurn) { this.stopTimer(); return; }
      const elapsed = Date.now() - this.game.turnStartedAt;
      if (elapsed < TURN_SECONDS * 1000) { this.emit(); return; }
      // Out of time. The rules say a lapsed turn auto-rolls, and a lapsed *decision* is treated as "no": a purchase is
      // declined (which sends the tile to auction) and a card is acknowledged. Ending the turn here would be refused by
      // the engine, because a turn cannot end while a question is still open. An auction never reaches this point: it is
      // closed by its own deadline at the top of this timer.
      const open = this.game.pending;
      if (open) {
        // The last answer in the list is the passive one: decline rather than buy.
        const passive = answerActions(this.game, this.humanId).at(-1);
        if (open.kind === "buy" && passive) { this.apply(this.humanId, passive); return; }
        if (open.kind === "card") { this.apply(this.humanId, { type: "ackCard" }); return; }
        if (open.kind === "debt") { this.apply(this.humanId, { type: "declareBankrupt" }); return; }
        return;
      }
      if (this.game.stage === "roll") this.apply(this.humanId, { type: "roll" });
      else this.apply(this.humanId, { type: "endTurn" });
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  private stopStep(): void {
    if (this.stepTimer !== null) { clearTimeout(this.stepTimer); this.stepTimer = null; }
  }

  /** Ends the game early, as the menu's 退出 would. */
  resign(): void {
    finishGame(this.game, Date.now(), "主动结束");
    this.stopTimer();
    this.stopStep();
    this.emit();
  }

  /** Cleans up when the component unmounts. */
  dispose(): void {
    this.stopTimer();
    this.stopStep();
    if (this.clockTimer !== null) { clearInterval(this.clockTimer); this.clockTimer = null; }
    this.listeners.clear();
  }

  /** Answers for a bot seat directly, used by the tests to drive a session without timers. */
  stepBot(): boolean {
    const actorId = activePlayer(this.game)?.id;
    if (!actorId) return false;
    const action = chooseAction(this.game, actorId, this.random);
    if (!action) return false;
    return this.apply(actorId, action);
  }

  /** Exposed so a test can check what the engine would accept before sending it. */
  answersFor(playerId: string): MonopolyAction[] {
    return answerActions(this.game, playerId);
  }
}
