/**
 * Plays many games between computer players on random decks of every title and reports what goes wrong: an action the engine refuses
 * although `legalActions` offered it (INVALID_*, NOT_*, …), a game that does not finish, an exception inside the engine. Every problem is
 * reported with the action, the pending question (and the card whose ability asked it), and the last log lines, grouped by error and card.
 *
 * Usage (from Game/UNO/UNO WorkSpace): npx tsx ../../unionarena/UnionArenaWorkSpace/Arknights/rl/fuzz.ts <seed> <games> [policy weights.json]
 */
import { actingPlayerId, applyAction, choiceAllowed, type EngineContext } from "../src/shared/engine.ts";
import { legalActions } from "../src/shared/ai/legal.ts";
import { chooseHeuristic } from "../src/shared/ai/heuristic.ts";
import { chooseByPolicy, loadPolicy, type Policy, type PolicyWeightsJson } from "../src/shared/ai/policy.ts";
import { createMatch, makeRng, nextRandom, wantsMulligan } from "../src/shared/ai/match.ts";
import { randomTitleDeck } from "./train_decks.ts";
import { titleContext } from "./title-catalog.ts";
import { readFileSync } from "node:fs";

const ctx: EngineContext = titleContext;
const [seedText = "1", gamesText = "200", weights] = process.argv.slice(2);
const seed = Number(seedText);
const policy: Policy | null = weights ? loadPolicy(JSON.parse(readFileSync(weights, "utf8")) as PolicyWeightsJson) : null;
const rng = makeRng(seed);
const problems = new Map<string, { count: number; sample: string }>();
let finished = 0;
let unfinished = 0;

function note(key: string, sample: string): void {
  const entry = problems.get(key) ?? { count: 0, sample };
  entry.count += 1;
  problems.set(key, entry);
}

const nameOf = (cardId: string | null | undefined): string => (cardId ? `${ctx.card(cardId)?.number ?? cardId}` : "-");

for (let game = 0; game < Number(gamesText); game += 1) {
  const decks = [randomTitleDeck(rng), randomTitleDeck(rng)];
  const match = createMatch([{ id: "A", name: "A", deck: decks[0]! }, { id: "B", name: "B", deck: decks[1]! }], seed * 100003 + game, { first: (game % 2) as 0 | 1, mulligan: (player) => wantsMulligan(ctx, player.hand) });
  let steps = 0;
  let failed = false;
  while (match.game.step === "turn" && steps < 3000 && !failed) {
    steps += 1;
    const actor = actingPlayerId(match.game, match.players)!;
    let action;
    try {
      const actions = legalActions(match.game, match.players, ctx, actor);
      if (!actions.length) { note("NO_LEGAL_ACTION", `pending ${JSON.stringify(match.game.pending)?.slice(0, 300)}`); failed = true; break; }
      action = policy && actor === "A" ? chooseByPolicy(policy, match.game, match.players, ctx, actor, actions)! : chooseHeuristic(match, ctx, actor, nextRandom(rng) < 0.2 ? "easy" : "normal", rng, actions)!;
    } catch (error) {
      note(`legal/choose threw ${(error as Error).message}`, (error as Error).stack?.split("\n").slice(0, 4).join(" | ") ?? "");
      failed = true;
      break;
    }
    const pending = match.game.pending;
    const source = pending && "sourceCardId" in pending ? nameOf(pending.sourceCardId) : pending?.kind ?? "-";
    const resolving = match.game.resolving?.entry?.cardId;
    try {
      applyAction(match.game.constructor === Object ? match.game : match.game, match.players, ctx, actor, action);
    } catch (error) {
      const message = (error as Error).message;
      const card = source !== "-" && !["choose", "block", "damage", "triggers", "discard"].includes(source) ? source : nameOf(resolving);
      note(`${message} @ ${card} (${action.type}${pending ? `, pending ${pending.kind}` : ""})`, `action ${JSON.stringify(action).slice(0, 240)} | pending ${JSON.stringify(pending)?.slice(0, 260)} | log ${match.game.log.slice(-3).join(" // ")}`);
      if (message === "INVALID_CHOICE" && action.type === "choose" && process.env.FUZZ_DEBUG) {
        console.log("DEBUG choiceAllowed:", choiceAllowed(match.game, match.players, ctx, action.picks), "vars:", JSON.stringify(match.game.resolving?.vars), "options:", JSON.stringify((pending as { options?: string[] } | null)?.options), "min/max:", (pending as { min?: number; max?: number } | null)?.min, (pending as { max?: number } | null)?.max);
      }
      failed = true;
    }
  }
  if (match.game.step === "over") finished += 1; else if (!failed) { unfinished += 1; note("UNFINISHED (3000 actions)", match.game.log.slice(-4).join(" // ")); }
}
const rows = [...problems.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(JSON.stringify({ games: Number(gamesText), finished, unfinished, problemKinds: rows.length, problemGames: rows.reduce((sum, [, v]) => sum + v.count, 0) }));
for (const [key, value] of rows.slice(0, 60)) console.log(`${String(value.count).padStart(4)}  ${key}\n        ${value.sample}`);
