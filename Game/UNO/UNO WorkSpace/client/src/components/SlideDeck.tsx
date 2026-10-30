import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** How far past the edge a page can be pulled, so the drag feels resisted rather than stuck. */
const RUBBER_MAX = 64;
/** How far a drag has to travel before the page turns, as a share of the card's width. */
const TURN_RATIO = .22;
/** A flick this fast turns the page even if it did not travel far. */
const FLICK_PX_PER_MS = .45;
/** The smallest flick distance that still counts, so a stray twitch never turns a page. */
const FLICK_MIN_PX = 12;

export interface SlideDeckProps {
  /** How many pages there are. */
  count: number;
  /** The page on screen. */
  index: number;
  /** Asked to go to a page (the arrows, the dots and the swipes all end up here). */
  onIndex: (index: number) => void;
  /** Direction of the last change, so the slide animation matches the arrow that caused it. */
  direction: "next" | "prev";
  /** The page's contents. */
  children: ReactNode;
  /** The footer controls (dots and arrows), rendered outside the sliding area. */
  footer?: ReactNode;
  /** Class for the outer element, so the caller keeps its own panel styling. */
  className?: string;
  /** What to call a page, for the gesture area's label. */
  labelOf: (index: number) => string;
}

/**
 * A card that turns its pages by touch or mouse: drag it sideways and let go. Under `TURN_RATIO` of the width it settles
 * back; past it, or with a quick flick, it goes to the next/previous page. At the first and last page the drag is resisted
 * and springs back. A drag that starts vertically is never intercepted, so the text inside still scrolls.
 *
 * The same pointer handling serves a finger and a mouse, which is what "触屏左右滑动、桌面鼠标拖动" asks for.
 */
export function SlideDeck({ count, index, onIndex, direction, children, footer, className, labelOf }: SlideDeckProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** Live drag distance in pixels; 0 when the card is at rest. */
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** The press in progress: where it started, and which way it turned out to go. */
  const gesture = useRef<{ id: number; x: number; y: number; started: number; axis: "none" | "x" | "y"; moved: number } | null>(null);

  const reset = useCallback((): void => { gesture.current = null; setDragging(false); setDrag(0); }, []);

  const start = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A press on a link or a control belongs to it, not to the pages.
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(), axis: "none", moved: 0 };
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (state.axis === "none") {
      // Whichever way the first few pixels go wins: a vertical start belongs to the text, not to the pages.
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (state.axis === "x") {
        setDragging(true);
        // The pointer is captured only once the drag is horizontal, so a vertical scroll is never stolen from the text.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    if (state.axis !== "x") return;
    state.moved = dx;
    // Resist at both ends of the deck, so the first and last page feel like a wall rather than a page that failed to turn.
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === count - 1);
    setDrag(atEdge ? Math.sign(dx) * Math.min(RUBBER_MAX, Math.abs(dx) * .35) : dx);
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    if (!state || state.id !== event.pointerId) return;
    if (state.axis !== "x") { reset(); return; }
    const distance = state.moved;
    const elapsed = Math.max(1, performance.now() - state.started);
    const width = viewportRef.current?.clientWidth ?? 320;
    const flick = Math.abs(distance) / elapsed > FLICK_PX_PER_MS && Math.abs(distance) > FLICK_MIN_PX;
    const turn = Math.abs(distance) > width * TURN_RATIO || flick;
    const next = turn ? index + (distance < 0 ? 1 : -1) : index;
    reset();
    if (next !== index && next >= 0 && next < count) onIndex(next);
  };

  // A drag the browser cancels (a scroll taking over, the window losing the pointer) settles back instead of sticking.
  useEffect(() => {
    window.addEventListener("pointercancel", reset);
    return () => window.removeEventListener("pointercancel", reset);
  }, [reset]);

  return <section className={className} data-dragging={dragging || undefined} aria-label="更新记录">
    <div className="update-log-viewport" ref={viewportRef}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={reset}
      role="group" aria-roledescription="滑动切换" aria-label={`${labelOf(index)}，共 ${count} 条，可左右滑动`}>
      {/*
        The live page is always the second child while dragging, so the track is shifted by one page and the drag distance
        is added to that; at rest there is a single page and no shift at all.
      */}
      <div className="update-log-track" style={{ transform: dragging ? `translate3d(calc(-100% + ${drag}px), 0, 0)` : "translate3d(0, 0, 0)", transition: dragging ? "none" : "transform .28s cubic-bezier(.22, .8, .3, 1)" }}>
        {dragging ? <div className="update-log-page" aria-hidden="true">{children}</div> : null}
        <div className="update-log-page" data-dir={dragging ? undefined : direction}>{children}</div>
        {dragging ? <div className="update-log-page" aria-hidden="true">{children}</div> : null}
      </div>
    </div>
    {footer}
  </section>;
}
