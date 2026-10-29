/**
 * The deck dropdown shared by the vs-computer page and the room page: "自定义" first, then the preset decks of one
 * title. A preset is only a ready-made deck, never a faction, so its colour suffix ("（蓝）") is not shown.
 */
import type { PresetDeck } from "../shared/ai/decks.ts";
import type { IpId } from "../shared/ips.ts";

/** The value of the first option: the deck the player builds. Every other value is a preset deck's id. */
export const CUSTOM_DECK = "custom";

/** "罗德岛（蓝）" -> "罗德岛": the trailing colour is the card energy, not part of the deck's name. */
export function presetDisplayName(name: string): string {
  return name.replace(/\s*[（(][^）)]*[）)]\s*$/, "");
}

/** The presets of one title, in the order they are declared. */
export function presetsOf(presets: readonly PresetDeck[], ipId: IpId): PresetDeck[] {
  return presets.filter((deck) => deck.ipId === ipId);
}

/** Whether a dropdown value can be used for this title: custom always, a preset only when it is one of the title's. */
export function validChoice(presets: readonly PresetDeck[], ipId: IpId, value: string): boolean {
  return value === CUSTOM_DECK || presetsOf(presets, ipId).some((deck) => deck.id === value);
}

export function DeckSelect({ presets, ipId, value, onChange, disabled = false, label }: {
  presets: readonly PresetDeck[];
  ipId: IpId;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return <select aria-label={label} value={validChoice(presets, ipId, value) ? value : CUSTOM_DECK} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value={CUSTOM_DECK}>自定义</option>
    {presetsOf(presets, ipId).map((deck) => <option key={deck.id} value={deck.id}>{presetDisplayName(deck.name)}</option>)}
  </select>;
}
