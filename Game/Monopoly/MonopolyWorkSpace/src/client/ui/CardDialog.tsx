/**
 * The event card, turned over from the deck.
 *
 * A card is a small piece of paper in a dark room, so it is drawn as one: a tinted card with a hairline edge and a kind
 * label, on the shared panel. No postmark rings, no perforated edges, no stacked shadows — the travel theme is carried by
 * the city scenes on the property cards, where there is room for it, not by decorating every surface.
 *
 * The wording is the card's own text; the *effect* was already decided by the engine, so a line can never be reworded into
 * a different rule.
 */

import type { JSX } from "react";
import { DECK_CARDS, DECK_NAME, type CardDeck } from "../../shared/cards.ts";
import { Dialog } from "./Dialog.tsx";

export function CardDialog({ deck, cardId, onAck }: { deck: CardDeck; cardId: string; onAck: () => void }): JSX.Element | null {
  const card = DECK_CARDS[deck].find((entry) => entry.id === cardId);
  if (!card) return null;

  const accent = deck === "chance" ? "#b8901f" : "#2c6b9e";

  return (
    <Dialog onClose={onAck} label={DECK_NAME[deck]}>
      <div style={{ padding: "16px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <div className="eyebrow" style={{ color: accent }}>{DECK_NAME[deck]}</div>

        {/* The card. */}
        <div style={{
          width: "100%", maxWidth: "280px",
          background: "var(--surface-raised)",
          borderRadius: "var(--radius-lg)",
          border: `1px solid ${accent}`,
          overflow: "hidden",
          animation: "card-flip 240ms ease both"
        }}>
          {/* A flat colour band, the only decoration: it names the deck at a glance. */}
          <div style={{ height: "4px", background: accent }} />
          <div style={{ padding: "13px 14px 14px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: accent }}>{card.title}</div>
            <p style={{ margin: "7px 0 0", fontSize: "13px", lineHeight: 1.6, color: "var(--secondary-text)" }}>
              {card.text}
            </p>
          </div>
        </div>

        <button type="button" className="primary" onClick={onAck}>知道了</button>
      </div>
    </Dialog>
  );
}
