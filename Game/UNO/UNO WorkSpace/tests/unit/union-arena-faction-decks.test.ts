import { describe, expect, it } from "vitest";
import { PRESET_DECKS, deckCards, presetDecksFor, resolvePresets } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/ai/decks.ts";
import { actingPlayerId, applyAction } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/engine.ts";
import { legalActions } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/ai/legal.ts";
import { chooseHeuristic } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/ai/heuristic.ts";
import { createMatch, makeRng, wantsMulligan } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/ai/match.ts";
import { deckIsLegal } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/rl/train_decks.ts";
import { TITLE_CARDS, titleContext, titleCard } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/rl/title-catalog.ts";
import { isAutomated } from "../../../../unionarena/UnionArenaWorkSpace/Arknights/src/shared/abilities/registry.ts";

const FACTION_DECKS = PRESET_DECKS.filter((deck) => deck.byNumber);

describe("faction preset decks of the other titles", () => {
  it("offers four decks for Attack on Titan and Demon Slayer, three for Jujutsu Kaisen, one for Evangelion", () => {
    for (const [ip, count] of [["aot", 4], ["kmy", 4], ["jjk", 3], ["eva", 1]] as const) expect(FACTION_DECKS.filter((deck) => deck.ipId === ip), ip).toHaveLength(count);
    expect(presetDecksFor("eva")).toHaveLength(1);
    for (const ip of ["ark", "aot", "kmy", "jjk"] as const) expect(presetDecksFor(ip).length, ip).toBeLessThanOrEqual(4);
    expect(new Set(PRESET_DECKS.map((deck) => deck.id)).size).toBe(PRESET_DECKS.length);
    expect(new Set(PRESET_DECKS.map((deck) => deck.name)).size).toBe(PRESET_DECKS.length);
  });

  for (const deck of FACTION_DECKS) {
    it(`${deck.name}: 50 legal cards of one title and at most two colours, all played by the engine itself`, () => {
      const numbers = deckCards(deck);
      expect(numbers).toHaveLength(50);
      expect(deckIsLegal(numbers)).toBe(true);
      // The same card printed under several set codes (UE10BT / UE10ST / UEPR …) counts as one card: four copies at most.
      const copies = new Map<string, number>();
      for (const number of numbers) copies.set(number.split("/")[1]!, (copies.get(number.split("/")[1]!) ?? 0) + 1);
      expect(Math.max(...copies.values())).toBeLessThanOrEqual(4);
      for (const number of numbers) {
        const card = titleCard(number);
        expect(card.ipId, number).toBe(deck.ipId);
        expect(isAutomated(card), number).toBe(true);
      }
      expect(new Set(numbers.map((number) => titleCard(number).stats.color)).size).toBeLessThanOrEqual(2);
      // Enough cards that need no energy to get going.
      expect(numbers.filter((number) => titleCard(number).stats.energyCost === 0).length).toBeGreaterThanOrEqual(10);
    });
  }

  it("turns numbers into catalog ids, and leaves out a deck whose cards the catalog does not have", () => {
    const first = FACTION_DECKS[0]!;
    const catalog = deckCards(first).map((number) => ({ id: `id-${number}`, number, imageAvailable: true }));
    const resolved = resolvePresets(catalog).find((deck) => deck.id === first.id)!;
    expect(deckCards(resolved)).toEqual(deckCards(first).map((number) => `id-${number}`));
    expect(resolvePresets([]).some((deck) => deck.byNumber)).toBe(false);
    // The first print with art wins over an earlier one without.
    const twice = resolvePresets([{ id: "plain", number: deckCards(first)[0]!, imageAvailable: false }, ...catalog]);
    expect(deckCards(twice.find((deck) => deck.id === first.id)!)[0]).toBe(`id-${deckCards(first)[0]}`);
  });

  it("computer players play whole games with every faction deck against another title's deck", () => {
    const rng = makeRng(7);
    FACTION_DECKS.forEach((deck, index) => {
      const other = FACTION_DECKS[(index + 5) % FACTION_DECKS.length]!;
      const match = createMatch([{ id: "A", name: "A", deck: deckCards(deck) }, { id: "B", name: "B", deck: deckCards(other) }], 1000 + index,
        { first: (index % 2) as 0 | 1, mulligan: (player) => wantsMulligan(titleContext, player.hand) });
      let steps = 0;
      while (match.game.step === "turn" && steps < 3000) {
        steps += 1;
        const actor = actingPlayerId(match.game)!;
        const actions = legalActions(match.game, match.players, titleContext, actor);
        expect(actions.length, `${deck.id} vs ${other.id} step ${steps}`).toBeGreaterThan(0);
        applyAction(match.game, match.players, titleContext, actor, chooseHeuristic(match, titleContext, actor, "normal", rng, actions)!);
      }
      expect(match.game.step, `${deck.id} vs ${other.id}`).not.toBe("turn");
    });
  });

  it("every title's cards used here exist in the printed data", () => {
    const known = new Set(TITLE_CARDS.map((card) => card.id));
    for (const deck of FACTION_DECKS) for (const [number] of deck.cards) expect(known.has(number), number).toBe(true);
  });
});
