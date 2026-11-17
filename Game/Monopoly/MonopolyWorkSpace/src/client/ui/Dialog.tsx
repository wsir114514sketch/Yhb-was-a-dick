/**
 * A dialog that rises from the bottom edge on a phone and centres on a desktop. One component either way: the sheet is
 * anchored to the bottom on a narrow screen, which is where a thumb can reach.
 *
 * It closes on a tap outside, on Escape, and on its own close button. The look is the shared panel: hairline border, the
 * same radius as every other surface in the game.
 */

import { useEffect, useRef } from "react";
import type { JSX } from "react";

export function Dialog({ children, onClose, wide, label }: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** A short name for the dialog, for screen readers. */
  label: string;
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 手机上的下拉关闭：拖动顶部把手，面板跟着手指下移（rAF 节流，只写 transform），松手超过 90px 即关闭。
  const panel = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ start: number; dy: number; frame: number } | null>(null);
  const grab = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { start: event.clientY, dy: 0, frame: 0 };
      if (panel.current) panel.current.style.transition = "none";
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>): void => {
      const state = drag.current;
      if (!state) return;
      state.dy = Math.max(0, event.clientY - state.start);
      if (!state.frame) {
        state.frame = requestAnimationFrame(() => {
          state.frame = 0;
          if (panel.current) panel.current.style.transform = `translateY(${state.dy}px)`;
        });
      }
    },
    onPointerUp: (): void => {
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      if (state.frame) cancelAnimationFrame(state.frame);
      if (state.dy > 90) { onClose(); return; }
      if (panel.current) {
        panel.current.style.transition = "transform 160ms ease";
        panel.current.style.transform = "";
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "rgba(0, 0, 0, 0.45)",
        display: "grid",
        alignItems: "var(--dialog-anchor, end)",
        justifyItems: "center",
        padding: "var(--safe-top) var(--safe-right) 0 var(--safe-left)",
        animation: "fade-in 140ms ease both"
      }}
    >
      <div
        ref={panel}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%", maxWidth: wide ? "540px" : "420px",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderBottom: "var(--dialog-edge, none)",
          borderRadius: "var(--dialog-radius, var(--radius-lg) var(--radius-lg) 0 0)",
          paddingBottom: "calc(var(--safe-bottom) + 8px)",
          overflow: "hidden",
          animation: "panel-in 200ms ease both"
        }}
      >
        <div className="sheet-grab" aria-hidden="true" {...grab} onPointerCancel={grab.onPointerUp} />
        <div style={{ overflowY: "auto", minHeight: 0, flex: "1 1 auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A dialog header: title on the left, a close button on the right, always reachable. */
export function DialogHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }): JSX.Element {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px",
      borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
      background: "var(--surface)", zIndex: 1
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "14px", fontWeight: 650 }}>{title}</span>
        {subtitle ? <span style={{ display: "block", fontSize: "11px", color: "var(--muted)" }}>{subtitle}</span> : null}
      </span>
      <button type="button" onClick={onClose} aria-label="关闭" className="secondary"
        style={{
          width: "30px", height: "30px", minWidth: "30px", minHeight: "30px", padding: 0,
          borderRadius: "var(--radius)", fontSize: "16px", lineHeight: 1,
          display: "grid", placeItems: "center"
        }}>×</button>
    </div>
  );
}
