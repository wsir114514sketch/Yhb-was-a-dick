/**
 * The room: seats, host, ready flags and the wiring from a socket message to the engine.
 *
 * A room owns one game and nothing else. It does not know about sockets — the namespace (see `index.ts`) translates a
 * socket into a player id and calls these methods. That keeps the room testable without a network and keeps the socket
 * code to a switch statement.
 *
 * Everything here goes through `applyAction` in the shared engine, so the server can never reach a state a single-player
 * game could not: the wire format and the rules are the same objects the client already uses.
 */

import { applyAction, settleAuction } from "../shared/turn.ts";
import { activePlayer, checkClock, finishGame, newGame } from "../shared/rules.ts";
import { answerActions } from "../shared/legal.ts";
import type {
  MonopolyAction, MonopolyError, MonopolyGame, MonopolyPlayer, MonopolySpectator,
  Pending, RoomConfig, RoomPhase, RoomState, Standing
} from "../shared/protocol.ts";

/** How a room reports a problem to the caller, without throwing across the socket layer. */
export class RoomError extends Error {
  code: MonopolyError | "ROOM_FULL" | "ROOM_NOT_FOUND" | "NOT_IN_ROOM" | "GAME_STARTED" | "NOT_HOST";
  constructor(code: RoomError["code"]) { super(code); this.code = code; }
}

/** A source of randomness. Injected so a test can make a room deterministic. */
export type Random = () => number;

export interface RoomOptions {
  code: string;
  maxPlayers: number;
  allowSpectators: boolean;
  config?: Partial<RoomConfig>;
  random?: Random;
  now?: () => number;
}

/** A seat, keyed by the account id so a reconnect lands back in the same place. */
interface Seat {
  id: string;
  username: string;
  avatarUrl: string | null;
  connected: boolean;
  ready: boolean;
}

export class Room {
  readonly code: string;
  phase: RoomPhase = "lobby";
  /** The host's account id. The first player to join, and handed on if the host leaves before the game starts. */
  hostId: string;
  game: MonopolyGame | null = null;
  readonly createdAt: number;

  private readonly seats = new Map<string, Seat>();
  private readonly spectators = new Map<string, MonopolySpectator>();
  private readonly random: Random;
  private readonly clock: () => number;
  private maxPlayers: number;
  private allowSpectators: boolean;
  private overrides: Partial<RoomConfig>;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.maxPlayers = Math.max(2, Math.min(8, options.maxPlayers));
    this.allowSpectators = options.allowSpectators;
    this.overrides = options.config ?? {};
    this.random = options.random ?? Math.random;
    this.clock = options.now ?? (() => Date.now());
    this.createdAt = this.clock();
    this.hostId = "";
  }

  // ---- Lobby ----

  /** Adds a player, or moves an existing one back into their old seat on reconnect. */
  join(account: { id: string; username: string; avatarUrl?: string | null }): void {
    if (this.phase !== "lobby" && !this.seats.has(account.id)) {
      // A running game only accepts its own players back; a stranger has to wait for the next game.
      throw new RoomError("GAME_STARTED");
    }
    const existing = this.seats.get(account.id);
    if (existing) {
      existing.connected = true;
      existing.username = account.username;
      existing.avatarUrl = account.avatarUrl ?? null;
      return;
    }
    if (this.seats.size >= this.maxPlayers) throw new RoomError("ROOM_FULL");
    this.seats.set(account.id, {
      id: account.id,
      username: account.username,
      avatarUrl: account.avatarUrl ?? null,
      connected: true,
      ready: false
    });
    if (!this.hostId) this.hostId = account.id;
  }

  /** Adds a spectator: someone who may watch but not sit at the table. */
  spectate(account: { id: string; username: string; avatarUrl?: string | null }): void {
    if (!this.allowSpectators) throw new RoomError("ROOM_FULL");
    this.spectators.set(account.id, {
      id: account.id, username: account.username, avatarUrl: account.avatarUrl ?? null, connected: true
    });
  }

  /** Marks a player offline but keeps their seat and their game, so a reconnect resumes where they were. */
  disconnect(accountId: string): void {
    const seat = this.seats.get(accountId);
    if (seat) { seat.connected = false; return; }
    const spectator = this.spectators.get(accountId);
    if (spectator) spectator.connected = false;
  }

  /** Removes someone for good. Before the game starts a leaving host hands the room on; during a game they stay a player. */
  leave(accountId: string): void {
    if (this.spectators.delete(accountId)) return;
    if (this.phase === "playing") {
      // A player who leaves mid-game keeps their seat: the game is theirs and abandoning it would strand the table.
      const seat = this.seats.get(accountId);
      if (seat) seat.connected = false;
      return;
    }
    this.seats.delete(accountId);
    if (this.hostId === accountId) {
      this.hostId = [...this.seats.keys()][0] ?? "";
    }
  }

  setReady(accountId: string, ready: boolean): void {
    const seat = this.seats.get(accountId);
    if (!seat) throw new RoomError("NOT_IN_ROOM");
    seat.ready = ready;
  }

  /** The host may change the table before the game begins; the settings freeze once it does. */
  configure(accountId: string, patch: Partial<RoomConfig>): void {
    if (accountId !== this.hostId) throw new RoomError("NOT_HOST");
    if (this.phase !== "lobby") throw new RoomError("GAME_STARTED");
    if (typeof patch.maxPlayers === "number") {
      this.maxPlayers = Math.max(2, Math.min(8, Math.floor(patch.maxPlayers)));
    }
    if (typeof patch.allowSpectators === "boolean") this.allowSpectators = patch.allowSpectators;
    // Any economy value may be overridden; the engine merges this over its defaults.
    this.overrides = { ...this.overrides, ...patch };
  }

  /** True when the host may start: two or more players, all present, and only the host need not be ready. */
  get startAllowed(): boolean {
    if (this.phase !== "lobby") return false;
    if (this.seats.size < 2) return false;
    return [...this.seats.values()].every((seat) => seat.connected && (seat.id === this.hostId || seat.ready));
  }

  // ---- The game ----

  /** Starts the game with the seated players, in the order they joined. */
  start(accountId: string): void {
    if (accountId !== this.hostId) throw new RoomError("NOT_HOST");
    if (this.phase !== "lobby") throw new RoomError("GAME_STARTED");
    if (this.seats.size < 2) throw new RoomError("NOT_IN_ROOM");
    const order = [...this.seats.keys()];
    const people = new Map([...this.seats.values()].map((seat) => [seat.id, { username: seat.username, avatarUrl: seat.avatarUrl }]));
    const config: RoomConfig = {
      maxPlayers: this.maxPlayers,
      allowSpectators: this.allowSpectators,
      ...this.overrides
    };
    this.game = newGame(order, people, config, this.random, this.clock());
    this.phase = "playing";
  }

  /**
   * Applies one action for one player. The engine decides legality; a refusal comes back as a code and leaves the game
   * untouched. This is the only write path into `game`.
   */
  act(accountId: string, action: MonopolyAction): void {
    if (!this.game) throw new RoomError("GAME_STARTED");
    if (!this.seats.has(accountId)) throw new RoomError("NOT_IN_ROOM");
    applyAction(this.game, accountId, action, this.clock(), this.random);
    this.settleIfOver();
  }

  /**
   * Closes a lapsed auction. Called by the room timer, which is the only thing that can end one nobody answers.
   * Returns true when it actually settled something, so the manager knows to broadcast and save.
   */
  tickAuction(): boolean {
    if (!this.game) return false;
    if (this.game.pending?.kind !== "auction") return false;
    if (this.clock() < this.game.pending.endsAt) return false;
    settleAuction(this.game, this.clock());
    return true;
  }

  /** Ends the game when the clock runs out, and returns true when that changed anything. */
  tickClock(): boolean {
    if (!this.game || this.phase !== "playing") return false;
    const before = this.game.winner;
    checkClock(this.game, this.clock());
    this.settleIfOver();
    return before !== this.game.winner;
  }

  private settleIfOver(): void {
    if (this.game?.winner) this.phase = "over";
  }

  // ---- Views ----

  /** What one client is allowed to see. Every player gets the same object; nothing here is private. */
  stateFor(accountId: string): RoomState {
    const players = this.playerList();
    return {
      roomCode: this.code,
      phase: this.phase,
      config: {
        maxPlayers: this.maxPlayers,
        allowSpectators: this.allowSpectators,
        ...this.overrides
      },
      players,
      spectators: [...this.spectators.values()],
      game: this.game,
      onGame: this.seats.has(accountId),
      isHost: accountId === this.hostId,
      playerCount: this.seats.size,
      startAllowed: this.startAllowed,
      canEditConfig: accountId === this.hostId && this.phase === "lobby",
      youAreSpectator: this.spectators.has(accountId)
    };
  }

  playerList(): MonopolyPlayer[] {
    return [...this.seats.values()].map((seat) => ({
      id: seat.id, username: seat.username, avatarUrl: seat.avatarUrl,
      isHost: seat.id === this.hostId, connected: seat.connected, ready: seat.ready
    }));
  }

  /** A short card for the room list. */
  summary(): { code: string; host: string; players: number; maxPlayers: number; spectators: number; phase: RoomPhase; allowSpectators: boolean } {
    return {
      code: this.code,
      host: this.seats.get(this.hostId)?.username ?? "",
      players: this.seats.size,
      maxPlayers: this.maxPlayers,
      spectators: this.spectators.size,
      phase: this.phase,
      allowSpectators: this.allowSpectators
    };
  }

  /** True when nobody is connected and nothing is happening: the manager may drop it. */
  get isAbandoned(): boolean {
    if (this.phase === "playing") return false;
    return [...this.seats.values()].every((seat) => !seat.connected)
      && [...this.spectators.values()].every((spectator) => !spectator.connected);
  }

  /** Who the engine is waiting on, if anyone — the room timer uses this to know whether it has work to do. */
  get waitingOn(): string | null {
    const pending = this.game?.pending;
    if (!pending) return null;
    if (pending.kind === "auction") return pending.bidders[0] ?? null;
    if (pending.kind === "trade") return pending.toId;
    return pending.playerId;
  }

  /** The player whose turn it is, for a client that wants to know without reading the whole game. */
  get activeId(): string | null {
    return this.game ? activePlayer(this.game)?.id ?? null : null;
  }

  /** The actions `accountId` could legally send right now, as a hint for the interface. */
  answersFor(accountId: string): MonopolyAction[] {
    return this.game ? answerActions(this.game, accountId) : [];
  }

  /** Ends the game early, e.g. the host closing the table. */
  finish(reason: string): void {
    if (!this.game) return;
    finishGame(this.game, this.clock(), reason);
    this.phase = "over";
  }

  /** Back to the lobby for another round, keeping the same seats. */
  reset(): void {
    if (this.phase === "playing") return;
    this.game = null;
    this.phase = "lobby";
    for (const seat of this.seats.values()) seat.ready = false;
  }

  /** Used by persistence to restore a game in progress. */
  adopt(game: MonopolyGame): void {
    this.game = game;
    this.phase = game.winner ? "over" : "playing";
    for (const player of game.players) {
      if (!this.seats.has(player.id)) {
        this.seats.set(player.id, {
          id: player.id, username: player.username, avatarUrl: player.avatarUrl,
          connected: false, ready: true
        });
      }
    }
    if (!this.hostId) this.hostId = game.order[0] ?? "";
  }

  /** The standings, for the settlement screen. */
  standings(): Standing[] {
    return this.game?.winner?.standings ?? [];
  }
}

/** Exposed for the namespace's timer, which needs to know whether a room has anything pending. */
export type { Pending };
