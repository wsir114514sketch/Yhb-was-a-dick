import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Where each life card was last drawn. A card that is revealed is taken off its owner's life area by the engine in the
 * same step that reveals it, so by the time the reveal reaches this client the slot is gone from the DOM and its
 * rectangle can only be recalled from an earlier frame.
 */
const lifeRects = new Map<string, DOMRect>();
/**
 * The life area itself, per side. When two or more cards are revealed at once the engine has already taken all of them
 * off the mat, so only the first one has a remembered slot of its own; the others fly out of the life area instead.
 */
const zoneRects = new Map<string, DOMRect>();

/** Records every life card's rectangle and both life areas'; called from a layout effect on the table, before the next paint. */
export function rememberLifeRects(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-life-id]")) {
    const id = element.dataset.lifeId;
    if (id) lifeRects.set(id, element.getBoundingClientRect());
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-life-zone]")) {
    const side = element.dataset.lifeZone;
    if (side) zoneRects.set(side, element.getBoundingClientRect());
  }
}

/** True when the reader asked the system to keep motion down: the flight becomes a plain fade. */
function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The printed card is 600 × 838, the same ratio `.ua-reveal-card` uses. */
const CARD_RATIO = 600 / 838;
/** Leaving the life area and growing into the middle of the screen. */
const FLY_MS = 1000;
/** Travelling from the middle into the sideline. Also how long the answer waits, so the card is in the pile before the state says so. */
export const REVEAL_OUT_MS = 460;

/** The middle of the screen, and the size the card has there: 62% of the height, never wider than the screen. */
function centreBox(): { left: number; top: number; width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const height = Math.max(Math.min(vh * .62, (vw * .82) / CARD_RATIO), Math.min(160, vh * .3));
  const width = height * CARD_RATIO;
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

export interface RevealedCard { name: string; number: string; imageUrl?: string | null; }

export interface LifeRevealProps {
  /** The revealed slot's id: a new card restarts the flight. */
  lifeId: string;
  /** Which side's life area this card came out of (`self` or `opponent`), used when its own slot is no longer known. */
  side: "self" | "opponent";
  /** The card's face, when this client knows it. */
  card?: RevealedCard;
  /** Drop id of the sideline it travels to once it has been dealt with (`you:sideline` or `opp:sideline`). */
  toZone: string;
  /** True for the opponent's read-only copy: the same flight, with a status line where the buttons would be. */
  readOnly?: boolean;
  /** Set when the card has been dealt with: the exit animation runs, then `onGone`. */
  leaving?: boolean;
  /** The name, the trigger text, the tabs and the buttons, shown once the card has landed in the middle. */
  children: ReactNode;
  /** Called after the exit animation, so the caller can stop rendering this card. */
  onGone?: () => void;
}

/**
 * One revealed life card, animated as the rule manual describes the moment: it leaves the life area face down, turns
 * over around its vertical axis while it grows into the middle of the screen (ease-in, one second), waits there for the
 * player's answer, and then travels to the sideline (ease-out). The board behind it stays visible but dimmed.
 *
 * With `prefers-reduced-motion` the flight and the flip are replaced by a short fade; nothing else changes.
 */
export function LifeReveal({ lifeId, side, card, toZone, readOnly = false, leaving = false, children, onGone }: LifeRevealProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(false);
  const [gone, setGone] = useState(false);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer) return undefined;
    const box = centreBox();
    outer.style.width = `${box.width}px`;
    outer.style.height = `${box.height}px`;
    let cancelled = false;
    const land = (): void => { if (!cancelled) setLanded(true); };
    const from = lifeRects.get(lifeId) ?? zoneRects.get(side) ?? null;
    if (!from || reducedMotion()) {
      outer.style.transform = `translate(${box.left}px, ${box.top}px)`;
      outer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" }).finished.then(land, land);
      return () => { cancelled = true; };
    }
    // Life cards lie sideways on the mat, so the flight starts from that orientation and unwinds it.
    const scale = from.width / box.width;
    const move = outer.animate([
      { transform: `translate(${from.left + from.width / 2 - box.width / 2}px, ${from.top + from.height / 2 - box.height / 2}px) scale(${scale}) rotate(90deg)` },
      { transform: `translate(${box.left}px, ${box.top}px) scale(1) rotate(0deg)` }
    ], { duration: FLY_MS, easing: "cubic-bezier(.55, 0, .9, .35)", fill: "forwards" });
    // The turn-over is over within the first 70% of the flight, so the face is readable before the card settles.
    const flip = inner?.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
      { duration: FLY_MS * .7, easing: "ease-in-out", fill: "forwards" });
    move.finished.then(land, land);
    return () => { cancelled = true; move.cancel(); flip?.cancel(); };
  }, [lifeId, side]);

  // The exit, once the card has been answered: middle of the screen → the sideline it was just put into.
  useEffect(() => {
    if (!leaving || gone) return undefined;
    const outer = outerRef.current;
    let cancelled = false;
    const done = (): void => { if (!cancelled) { setGone(true); onGone?.(); } };
    if (!outer || reducedMotion()) { done(); return () => { cancelled = true; }; }
    const box = centreBox();
    const target = document.querySelector<HTMLElement>(`[data-drop="${toZone}"]`)?.getBoundingClientRect() ?? null;
    if (!target) { done(); return () => { cancelled = true; }; }
    const scale = Math.max(target.width / box.width, .12);
    outer.animate([{ transform: `translate(${box.left}px, ${box.top}px) scale(1)`, opacity: 1 }, {
      transform: `translate(${target.left + target.width / 2 - box.width / 2}px, ${target.top + target.height / 2 - box.height / 2}px) scale(${scale})`,
      opacity: .5
    }], { duration: REVEAL_OUT_MS, easing: "cubic-bezier(.2, .7, .4, 1)", fill: "forwards" }).finished.then(done, done);    return () => { cancelled = true; };
  }, [leaving, gone, onGone, toZone]);

  if (gone) return null;
  return <div className="ua-reveal" data-readonly={readOnly || undefined} role="dialog" aria-modal="true" aria-label={readOnly ? "对方翻开的生命卡" : "翻开的生命卡"}>
    <div className="ua-reveal-stage" aria-hidden="true">
      <div className="ua-flip" ref={outerRef}>
        <div className="ua-flip-inner" ref={innerRef}>
          {/* The back is covered by the face as soon as the turn-over passes 90°, so it is drawn under it at all times. */}
          <div className="ua-flip-back" />
          {card?.imageUrl
            ? <img className="ua-flip-face" src={card.imageUrl} alt="" draggable={false} />
            : <div className="ua-flip-face ua-flip-missing"><span>{card?.name ?? "生命卡"}</span></div>}
        </div>
      </div>
    </div>
    <div className="ua-reveal-info" data-landed={landed || undefined}>{children}</div>
  </div>;
}

/**
 * Plays revealed life cards one after another: only one is on screen, the next starts once the previous one has finished
 * travelling to the sideline, so a two-damage hit reads as two cards rather than a pile of overlapping panels. Nothing is
 * sent from here: `answer` records the player's press, the caller sends the action, and the card leaves once the state
 * says it has.
 */
export function useRevealQueue(ids: readonly string[]) {
  /** The slot on screen, if any. */
  const [shown, setShown] = useState<string | null>(null);
  /** True while the card on screen is travelling to the sideline. */
  const [leaving, setLeaving] = useState(false);
  /** Cards this player has answered but whose answer the server has not confirmed yet. */
  const answered = useRef<Set<string>>(new Set());

  useEffect(() => {
    // A card the server has dealt with: let it finish its exit before the next one appears.
    if (shown && !ids.includes(shown)) { setLeaving(true); return; }
    if (shown) return;
    // Never start the next card while an answer is still on its way: the queue must not run ahead of the table.
    if (ids.some((id) => answered.current.has(id))) return;
    const next = ids.find((id) => !answered.current.has(id));
    if (next) { setLeaving(false); setShown(next); }
  }, [ids, shown]);

  // Forget the cards that have left the queue, so a later reveal of the same slot id is not skipped.
  useEffect(() => { for (const id of [...answered.current]) if (!ids.includes(id)) answered.current.delete(id); }, [ids]);

  return {
    shown,
    leaving,
    /** Look at another revealed card first (the manual lets the defending player choose the order). */
    pick: useCallback((id: string) => { setLeaving(false); setShown(id); }, []),
    /** The player pressed a button for this card: it starts leaving, and the caller sends the action. */
    answer: useCallback((id: string) => { answered.current.add(id); setLeaving(true); }, []),
    /** The action was refused: bring the card back, still waiting for a real answer. */
    retry: useCallback((id: string) => { answered.current.delete(id); setLeaving(false); setShown(id); }, []),
    /** The exit animation is over: free the screen so the next card can fly in. */
    finish: useCallback(() => { setLeaving(false); setShown(null); }, [])
  };
}
