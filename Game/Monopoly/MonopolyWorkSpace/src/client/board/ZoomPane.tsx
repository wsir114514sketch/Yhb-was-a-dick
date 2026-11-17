/**
 * A pinch-zoom / drag-to-pan viewport around the board.
 *
 * A 48-tile board on a 375px-wide phone cannot show every label at once — that is arithmetic, not a styling problem. The
 * board is therefore shown whole by default and can be zoomed into with two fingers (or a wheel on a desktop), dragged to
 * anywhere, and returned to the whole-board view with one button. That is the "格子精简显示 + 双指缩放拖动 + 回到全局" the
 * design calls for, and it is the only approach that keeps the tile count without shrinking the labels past reading.
 *
 * It animates only `transform`, so the pan and zoom stay on the compositor and a phone holds its frame rate.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";

const MIN_SCALE = 1;
/**
 * How far a phone may zoom in. At 3× a board tile goes from ~26px to ~78px — comfortably readable — while the pan range
 * (±1× the box) is still enough to reach every edge tile. Going further would make the tiles bigger than they need to be
 * and leave the far corners of the board unreachable.
 */
const MAX_SCALE = 3;

interface Point { x: number; y: number; }

export function ZoomPane({ children, enabled }: { children: React.ReactNode; enabled: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  // Live pointers, keyed by pointerId: two of them means a pinch.
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; scale: number; center: Point; origin: Point } | null>(null);
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  /** Keeps the pan from dragging the board entirely out of view. */
  const clamp = useCallback((next: Point, atScale: number): Point => {
    const host = hostRef.current;
    if (!host) return next;
    // The scaled content overflows the box by `size * (scale - 1)` in total, which is `size * (scale - 1) / 2` on each
    // side. That full amount has to be reachable, or a tile at the edge of the board can never be brought into view.
    const maxX = (host.clientWidth * (atScale - 1)) / 2;
    const maxY = (host.clientHeight * (atScale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y))
    };
  }, []);

  useEffect(() => {
    if (!enabled) { reset(); }
  }, [enabled, reset]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    const onPointerDown = (event: PointerEvent): void => {
      // A second finger turns a drag into a pinch.
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        pinchStart.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale,
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          origin: offset
        };
        dragStart.current = null;
      } else if (pointers.current.size === 1) {
        dragStart.current = { pointer: { x: event.clientX, y: event.clientY }, offset };
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size >= 2 && pinchStart.current) {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = distance / Math.max(pinchStart.current.distance, 1);
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.current.scale * ratio));
        setScale(next);
        // Keep the point between the fingers under the fingers: zooming about the centre of the box would slide whatever
        // the player is pinching away from them, which is the one thing a pinch must never do.
        const box = host.getBoundingClientRect();
        const origin = pinchStart.current.origin;
        const focusX = pinchStart.current.center.x - (box.left + box.width / 2);
        const focusY = pinchStart.current.center.y - (box.top + box.height / 2);
        const applied = next / pinchStart.current.scale;
        setOffset(clamp({
          x: origin.x + (focusX - origin.x) * (1 - applied),
          y: origin.y + (focusY - origin.y) * (1 - applied)
        }, next));
        return;
      }

      if (dragStart.current && scale > 1) {
        const dx = event.clientX - dragStart.current.pointer.x;
        const dy = event.clientY - dragStart.current.pointer.y;
        setOffset(clamp({ x: dragStart.current.offset.x + dx, y: dragStart.current.offset.y + dy }, scale));
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
      if (pointers.current.size === 0) dragStart.current = null;
      // Snapping back when barely zoomed keeps the board from being left in a useless in-between state.
      setScale((current) => (current < 1.08 ? 1 : current));
    };

    /** A desktop can zoom with the wheel, which the pointer events do not cover. */
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale((current) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current * step));
        setOffset((position) => clamp(position, next));
        return next;
      });
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
    };
  }, [enabled, scale, offset, clamp]);

  const zoomed = scale > 1.02;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}>
      <div
        ref={hostRef}
        style={{
          width: "100%", height: "100%",
          display: "grid", placeItems: "center",
          // While zoomed, the fingers must pan rather than scroll the page.
          touchAction: enabled ? "none" : "auto",
          cursor: zoomed ? "grab" : "default"
        }}
      >
        <div style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: pointers.current.size > 0 ? "none" : "transform 220ms cubic-bezier(.2,.8,.3,1)",
          willChange: "transform",
          width: "100%", height: "100%",
          display: "grid", placeItems: "center"
        }}>
          {children}
        </div>
      </div>

      {/* 回到全局: only offered when there is something to return from. */}
      {zoomed ? (
        <button
          type="button"
          onClick={reset}
          style={{
            position: "absolute", right: "8px", bottom: "8px", zIndex: 6,
            height: "32px", minHeight: "32px", padding: "0 11px", borderRadius: "var(--radius)",
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            color: "var(--text)", fontSize: "11px", fontWeight: 650,
            animation: "fade-in 140ms ease both"
          }}
        >
          回到全局
        </button>
      ) : null}
    </div>
  );
}
