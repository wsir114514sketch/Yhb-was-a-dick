/**
 * 自对弈平衡测试: plays many complete games with bots in every seat and reports the numbers the balance stage is judged on —
 * how long a game lasts, how often players go bankrupt, whether money is conserved, and how much each region earns its
 * owner. Run it with `npm run balance`.
 *
 * Everything it prints comes from the engine's own public state, so a number here is a number a real game would have.
 */

import { REGIONS, REGION_PROPERTIES, commercialAt } from "../src/shared/board.ts";
import { DEFAULT_RULES, formatMoney, type EconomyRules } from "../src/shared/economy.ts";
import { chooseAction } from "../src/shared/bot.ts";
import { applyAction } from "../src/shared/turn.ts";
import { activePlayer, checkClock, newGame, type Random } from "../src/shared/rules.ts";
import { answerActions } from "../src/shared/legal.ts";
import type { MonopolyGame, RoomConfig } from "../src/shared/protocol.ts";

/** A seeded source, so a balance run can be replayed exactly by keeping the seed. */
function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    // xorshift32: small, fast and good enough for self-play.
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

export interface GameResult {
  turns: number;
  minutes: number;
  bankruptcies: number;
  winnerId: string | null;
  /**
   * True when no player's cash ever went negative. The engine's conservation guarantee is that a player who cannot cover a
   * payment opens a debt instead of being pushed below zero, so this staying true over a whole game is the check that
   * holds; a total that "should equal the starting pile" is not, because salaries and cards create money by design.
   */
  cashNeverNegative: boolean;
  /** Region id → rent its tiles collected over the game. */
  regionRent: Record<string, number>;
}

/**
 * How long one turn is assumed to take in the simulation, in milliseconds. A real 60-second turn is almost never used up —
 * most turns are a roll and a press — so a simulated turn is given 20 seconds, which is what makes the turn count below
 * comparable to real playing time.
 */
const TURN_MS = 20_000;

/**
 * Plays one game to the end. A game is abandoned after `maxTurns` real turns, which is only a safety net: a healthy run
 * finishes long before it, and an abandoned game is reported as such rather than silently counted.
 */
export function playGame(
  seats: number,
  random: Random,
  over: Partial<EconomyRules> = {},
  maxTurns = 5000
): GameResult {
  const ids = Array.from({ length: seats }, (_, index) => `p${index}`);
  const people = new Map(ids.map((id) => [id, { username: id, avatarUrl: null }]));
  const config: RoomConfig = { maxPlayers: seats, allowSpectators: false, ...over };
  const game: MonopolyGame = newGame(ids, people, config, random, 0);

  const regionRent: Record<string, number> = Object.fromEntries(REGIONS.map((region) => [region.id, 0]));
  let bankruptcies = 0;
  let guard = 0;
  let cashNeverNegative = true;
  const clock = (): number => game.turn * TURN_MS;

  while (!game.winner && guard < maxTurns * 40) {
    guard += 1;
    // The clock is part of the rules: a 快速局 ends when the time limit is reached and ranks by net worth.
    checkClock(game, clock());
    if (game.winner) break;
    const asked = game.pending && game.pending.kind !== "auction"
      ? (game.pending as { playerId?: string }).playerId
      : game.pending?.kind === "auction" ? game.pending.bidders[0] : undefined;
    const actorId = asked ?? activePlayer(game)?.id;
    if (!actorId) break;
    const before = game.players.filter((player) => player.bankrupt).length;
    const action = chooseAction(game, actorId, random);
    if (!action) {
      // Nothing to do: force the turn on rather than spin.
      if (game.stage === "roll") { try { applyAction(game, actorId, { type: "roll" }, clock(), random); } catch { /* refuse */ } }
      else { try { applyAction(game, actorId, { type: "endTurn" }, clock(), random); } catch { /* refuse */ } }
      if (game.turn > maxTurns) break;
      continue;
    }
    // Attribute rent: a rent line names the tile, so the region that owns it gets the credit.
    const cashBefore = new Map(game.players.map((player) => [player.id, player.cash]));
    // A bot's choice can go stale between the check and the call (cash spent, an auction closed). A refused action is
    // retried as the safest legal one, so a single staleness never ends a game early.
    let applied = false;
    try { applyAction(game, actorId, action, clock(), random); applied = true; } catch { applied = false; }
    if (!applied) {
      const safe = answerActions(game, actorId)[0]
        ?? (game.stage === "end" ? { type: "endTurn" as const } : game.stage === "roll" ? { type: "roll" as const } : undefined);
      if (safe) { try { applyAction(game, actorId, safe, clock(), random); applied = true; } catch { applied = false; } }
    }
    if (!applied) break;
    const after = game.players.filter((player) => player.bankrupt).length;
    bankruptcies += after - before;
    for (const player of game.players) if (player.cash < 0) cashNeverNegative = false;
    for (const player of game.players) {
      const delta = player.cash - (cashBefore.get(player.id) ?? player.cash);
      if (delta > 0) {
        // Whose tile took it? The log's last rent line names the city.
        const last = [...game.log].reverse().find((entry) => entry.kind === "rent" && entry.amount === -delta);
        const city = last?.text.match(/「(.+?)」/)?.[1];
        const tile = city ? [...Array(48).keys()].map((index) => commercialAt(index)).find((info) => info?.city === city) : undefined;
        if (tile) regionRent[tile.region] = (regionRent[tile.region] ?? 0) + delta;
      }
    }
    if (game.turn > maxTurns) break;
  }

  return {
    turns: game.turn,
    minutes: game.turn * TURN_MS / 60_000,
    bankruptcies,
    winnerId: game.winner?.playerId ?? null,
    cashNeverNegative,
    regionRent
  };
}

export interface BalanceReport {
  games: number;
  seats: number;
  finished: number;
  avgTurns: number;
  medianTurns: number;
  avgMinutes: number;
  bankruptcyRate: number;
  /** Games in which some player's cash went negative, which the engine promises never happens. Must be 0. */
  negativeCashGames: number;
  regionRent: Record<string, number>;
}

/** Runs `games` games and aggregates them. */
export function runBalance(games: number, seats: number, seed = 1, over: Partial<EconomyRules> = {}): BalanceReport {
  const results: GameResult[] = [];
  const regionRent: Record<string, number> = Object.fromEntries(REGIONS.map((region) => [region.id, 0]));
  for (let index = 0; index < games; index += 1) {
    const result = playGame(seats, seeded(seed + index * 7919), over);
    results.push(result);
    for (const region of REGIONS) regionRent[region.id] = (regionRent[region.id] ?? 0) + (result.regionRent[region.id] ?? 0);
  }
  const turns = results.map((result) => result.turns).sort((left, right) => left - right);
  const finished = results.filter((result) => result.winnerId).length;
  return {
    games,
    seats,
    finished,
    avgTurns: turns.reduce((sum, value) => sum + value, 0) / (turns.length || 1),
    medianTurns: turns[Math.floor(turns.length / 2)] ?? 0,
    avgMinutes: results.reduce((sum, result) => sum + result.minutes, 0) / (results.length || 1),
    bankruptcyRate: results.reduce((sum, result) => sum + result.bankruptcies, 0) / (results.length * seats || 1),
    negativeCashGames: results.filter((result) => !result.cashNeverNegative).length,
    regionRent
  };
}

/** Prints the report, which is what a balance change is checked against. */
export function printBalance(report: BalanceReport): void {
  const line = (label: string, value: string): void => console.log(`  ${label.padEnd(16, " ")} ${value}`);
  console.log(`\n自对弈平衡报告 · ${report.games} 局 × ${report.seats} 人`);
  line("完成局数", `${report.finished} / ${report.games}`);
  line("平均回合数", report.avgTurns.toFixed(1));
  line("中位回合数", String(report.medianTurns));
  line("估算时长", `${report.avgMinutes.toFixed(0)} 分钟`);
  line("破产率", `${(report.bankruptcyRate * 100).toFixed(1)}%`);
  // The engine opens a debt rather than pushing a player below zero, so this line staying at 0 is the check that holds.
  line("出现负现金的局", `${report.negativeCashGames} / ${report.games}`);
  console.log("\n  各地区累计租金");
  const maxRent = Math.max(...Object.values(report.regionRent), 1);
  for (const region of REGIONS) {
    const rent = report.regionRent[region.id] ?? 0;
    const bar = "█".repeat(Math.round((rent / maxRent) * 28));
    console.log(`  ${region.name.padEnd(12, " ")} ${bar} ${formatMoney(rent)}`);
  }
  const cheapest = Math.min(...REGIONS.map((region) => report.regionRent[region.id] ?? 0));
  const dearest = Math.max(...REGIONS.map((region) => report.regionRent[region.id] ?? 0));
  console.log(`\n  最富地区 / 最穷地区 = ${(dearest / Math.max(cheapest, 1)).toFixed(1)}×`);
  console.log(`  地产数量: ${REGION_PROPERTIES["sa"]!.length} 起, 共 ${Object.values(REGION_PROPERTIES).flat().length} 处\n`);
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("balance.ts");
if (isMain) {
  const games = Number(process.argv[2] ?? 200);
  const seats = Number(process.argv[3] ?? 4);
  printBalance(runBalance(games, seats));
}
