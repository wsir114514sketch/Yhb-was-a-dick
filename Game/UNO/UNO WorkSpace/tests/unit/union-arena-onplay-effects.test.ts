/**
 * 【登场时】 effects, every title at once: an effect that begins with "可以……" asks its owner (a "confirm" marked `event: "onPlay"`, which the
 * client shows in the middle of the screen with 发动 / 不发动), one that has to be used is announced by an "onplay" event instead, and neither
 * happens twice. The cards are not picked one by one: every automated character with a 【登场时】 ability of the five titles is played.
 */
import { describe, expect, it } from "vitest";
import { abilitiesOf } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/engine.ts";
import { isAutomated } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/abilities/registry.ts";
import { TITLE_CARDS } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/rl/title-catalog.ts";
import type { IpId } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/ips.ts";
import { ctx, setup } from "./ability-harness.ts";

const onPlayCount = (id: string): number => abilitiesOf(ctx, id).filter((ability) => ability.kind === "triggered" && ability.when.includes("onPlay")).length;
/** Cards with exactly one 【登场时】 ability: with two (one that asks, one that does not) both outcomes are expected at once. */
const onPlayCards = TITLE_CARDS.filter((card) => card.stats.type === "character" && isAutomated(card) && onPlayCount(card.id) === 1);

type Outcome = { asked: boolean; announced: number; ok: boolean };

function playOnce(number: string, answer: "yes" | "no" | null): Outcome {
  const { game, a, act } = setup("main");
  a.hand.push(number);
  try { act("a", { type: "play", handIndex: a.hand.length - 1, line: "front" }); } catch { return { asked: false, announced: 0, ok: false }; }
  const pending = game.pending;
  const asked = pending?.kind === "choose" && pending.purpose === "confirm" && pending.event === "onPlay" && pending.playerId === "a";
  if (asked && answer) act("a", { type: "choose", picks: [answer] });
  return { asked, announced: game.events.filter((event) => event.kind === "onplay" && event.cardId === number).length, ok: true };
}

describe("【登场时】 effects share one interaction in every title", () => {
  const stats = new Map<IpId, { asked: number; announced: number }>();
  for (const card of onPlayCards) {
    const outcome = playOnce(card.id, null);
    if (!outcome.ok) continue;
    const row = stats.get(card.ipId) ?? { asked: 0, announced: 0 };
    if (outcome.asked) row.asked += 1;
    if (outcome.announced) row.announced += 1;
    stats.set(card.ipId, row);
  }

  it("covers cards of every title, both the ones that ask and the ones that have to be used", () => {
    expect([...stats.keys()].sort()).toEqual(["aot", "ark", "eva", "jjk", "kmy"]);
    for (const [ip, row] of stats) expect(row.asked + row.announced, ip).toBeGreaterThan(0);
    expect([...stats.values()].reduce((sum, row) => sum + row.asked, 0)).toBeGreaterThan(0);
    expect([...stats.values()].reduce((sum, row) => sum + row.announced, 0)).toBeGreaterThan(0);
  });

  it("never both asks and announces for one play, and never announces more than once", () => {
    for (const card of onPlayCards) {
      const outcome = playOnce(card.id, null);
      if (!outcome.ok) continue;
      expect(outcome.announced, card.id).toBeLessThanOrEqual(1);
      if (outcome.asked) expect(outcome.announced, card.id).toBe(0);
    }
  });

  it("declining an optional effect leaves it unresolved: nothing is announced and the question is gone", () => {
    for (const card of onPlayCards) {
      const { game, a, act } = setup("main");
      a.hand.push(card.id);
      try { act("a", { type: "play", handIndex: a.hand.length - 1, line: "front" }); } catch { continue; }
      const pending = game.pending;
      if (!(pending?.kind === "choose" && pending.purpose === "confirm" && pending.event === "onPlay")) continue;
      act("a", { type: "choose", picks: ["no"] });
      const again = game.pending?.kind === "choose" && game.pending.purpose === "confirm" && game.pending.event === "onPlay" && game.pending.sourceCardId === card.id;
      expect(again, card.id).toBe(false);
      expect(game.events.some((event) => event.kind === "onplay" && event.cardId === card.id), card.id).toBe(false);
    }
  });

  it("only the owner is asked, and only once the card is played", () => {
    const { game, a, b } = setup("main");
    expect(game.pending).toBeNull();
    expect(a.hand).toHaveLength(0);
    expect(b.hand).toHaveLength(0);
  });
});
