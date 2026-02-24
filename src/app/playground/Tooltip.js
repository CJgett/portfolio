"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_W  = 200;
const MARGIN     = 8;

/**
 * Info icon that shows a floating tooltip on hover or keyboard focus.
 * Renders via a portal to escape overflow:hidden ancestors.
 * Position is clamped so the box never overflows the viewport edge.
 */
export function Tooltip({ text }) {
  const [pos, setPos]         = useState(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Compute left edge of the tooltip box, centered on the icon but clamped to viewport
    const ideal = r.left + r.width / 2 - TOOLTIP_W / 2;
    const left  = Math.max(MARGIN, Math.min(window.innerWidth - TOOLTIP_W - MARGIN, ideal));
    setPos({ top: r.top, left });
  };

  const hide = () => setPos(null);

  return (
    <>
      <span
        className="tooltip-trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        ref={ref}
        tabIndex={0}
        aria-label={text}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      </span>
      {mounted && pos && createPortal(
        <span className="tooltip-box" role="tooltip" style={{ top: pos.top, left: pos.left }}>
          {text}
        </span>,
        document.body
      )}
    </>
  );
}
