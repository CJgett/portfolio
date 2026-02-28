"use client";
import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Manages canvas pan (spacebar + drag, or persistent pan mode) and zoom (scroll wheel, buttons).
 *
 * @param {object} opts
 * @param {React.RefObject} opts.canvasRef - The visible output canvas (for cursor updates)
 * @param {boolean}         opts.hasResult - Whether a result is currently rendered
 * @param {boolean}         opts.panMode   - Persistent pan mode (button toggle)
 *
 * @returns {{
 *   canvasViewportRef: React.RefObject,
 *   panActiveRef:      React.RefObject,  // true when pan is active (spacebar OR panMode); shared with useBrush
 *   canvasZoom:        number,
 *   canvasZoomRef:     React.RefObject,
 *   zoomTo:            (newZoom: number) => void,
 *   canvasZoomStyle:   object | undefined,
 * }}
 */
export function usePanZoom({ canvasRef, hasResult, panMode = false }) {
  const canvasViewportRef = useRef(null);
  const canvasZoomRef     = useRef(1);
  const canvasFitSizeRef  = useRef({ w: 0, h: 0 });
  const pendingScrollRef  = useRef(null);
  const spaceDownRef      = useRef(false);
  const panOffsetRef      = useRef({ x: 0, y: 0 });
  // Combines spacebar hold and persistent panMode button; used by useBrush to block painting.
  const panActiveRef      = useRef(panMode);
  const panModeRef        = useRef(panMode);
  panModeRef.current      = panMode;

  const [canvasZoom, setCanvasZoom] = useState(1);
  canvasZoomRef.current = canvasZoom;

  // Non-passive wheel listener — zoom toward cursor position
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      // Fallback: measure fit size on first wheel event if the effect hasn't fired yet
      if (canvasFitSizeRef.current.w === 0 && canvasRef.current) {
        const { width, height } = canvasRef.current.getBoundingClientRect();
        if (width > 0) canvasFitSizeRef.current = { w: width, h: height };
      }
      const oldZoom = canvasZoomRef.current;
      const newZoom = Math.min(8, Math.max(0.25, oldZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const rect = el.getBoundingClientRect();
      const vpX = e.clientX - rect.left;
      const vpY = e.clientY - rect.top;
      const contentX = el.scrollLeft + vpX;
      const contentY = el.scrollTop + vpY;
      pendingScrollRef.current = {
        left: contentX * (newZoom / oldZoom) - vpX,
        top:  contentY * (newZoom / oldZoom) - vpY,
      };
      setCanvasZoom(newZoom);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply pending scroll after zoom re-render so the pivot point stays under cursor
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    requestAnimationFrame(() => {
      const el = canvasViewportRef.current;
      if (el && pendingScrollRef.current) {
        el.scrollLeft = Math.max(0, pendingScrollRef.current.left);
        el.scrollTop  = Math.max(0, pendingScrollRef.current.top);
        pendingScrollRef.current = null;
      }
    });
  }, [canvasZoom]);

  // Measure the canvas's CSS display size when zoom is at 1 (for zoom style computation).
  // useEffect fires after paint — layout is already final, no RAF needed.
  useEffect(() => {
    if (!hasResult || canvasZoom !== 1) return;
    if (!canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width > 0) canvasFitSizeRef.current = { w: width, h: height };
  }, [hasResult, canvasZoom, canvasRef]);

  // Reset transform-based pan offset when zoom changes or a new image is loaded.
  useEffect(() => {
    panOffsetRef.current = { x: 0, y: 0 };
    if (canvasRef.current) canvasRef.current.style.transform = "";
  }, [canvasZoom, hasResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync cursor/touchAction when the persistent panMode prop changes.
  useEffect(() => {
    panActiveRef.current = panMode || spaceDownRef.current;
    const el = canvasViewportRef.current;
    if (panMode) {
      if (el) { el.style.cursor = "grab"; el.style.touchAction = "none"; }
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    } else if (!spaceDownRef.current) {
      if (el) { el.style.cursor = ""; el.style.touchAction = ""; }
      if (canvasRef.current) canvasRef.current.style.cursor = "";
    }
  }, [panMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Space bar = temporary pan mode (grab cursor, blocks brush strokes)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== " " || spaceDownRef.current) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      spaceDownRef.current = true;
      panActiveRef.current = true;
      if (canvasViewportRef.current) {
        canvasViewportRef.current.style.cursor = "grab";
        canvasViewportRef.current.style.touchAction = "none";
      }
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      e.preventDefault();
    };
    const onKeyUp = (e) => {
      if (e.key !== " ") return;
      // preventDefault prevents focused buttons from activating on keyup
      e.preventDefault();
      spaceDownRef.current = false;
      panActiveRef.current = panModeRef.current;
      // Only reset cursor if the panMode button is also off
      if (!panModeRef.current) {
        if (canvasViewportRef.current) {
          canvasViewportRef.current.style.cursor = "";
          canvasViewportRef.current.style.touchAction = "";
        }
        if (canvasRef.current) canvasRef.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [canvasRef]);

  // Pan and pinch-to-zoom via pointer events.
  // Pointerdown on el (for setPointerCapture); move/up on window (handles out-of-bounds drags).
  // All active pointers are tracked in a Map so a second finger triggers pinch instead of pan.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;

    const ptrs = new Map();  // pointerId → { x, y }
    let panStart   = null;
    let pinchStart = null;   // { dist, zoom, midX, midY } — baseline for current pinch

    const onDown = (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size >= 2) {
        // Second finger arrived — cancel any pan; pinch initialises on first onMove
        panStart = null;
        pinchStart = null;
        return;
      }

      if (!panActiveRef.current) return;
      e.preventDefault();
      panStart = {
        x: e.clientX, y: e.clientY,
        scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
        panX: panOffsetRef.current.x, panY: panOffsetRef.current.y,
      };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    };

    const onMove = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size >= 2) {
        panStart = null; // cancel pan if second finger moves first

        const [p1, p2] = [...ptrs.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        if (!pinchStart) {
          if (canvasFitSizeRef.current.w === 0 && canvasRef.current) {
            const { width, height } = canvasRef.current.getBoundingClientRect();
            if (width > 0) canvasFitSizeRef.current = { w: width, h: height };
          }
          const rect = el.getBoundingClientRect();
          pinchStart = {
            dist,
            zoom: canvasZoomRef.current,
            midX: (p1.x + p2.x) / 2 - rect.left,
            midY: (p1.y + p2.y) / 2 - rect.top,
          };
        }

        const newZoom = Math.min(8, Math.max(0.25, pinchStart.zoom * (dist / pinchStart.dist)));
        const oldZoom = canvasZoomRef.current;
        if (newZoom !== oldZoom) {
          const contentX = el.scrollLeft + pinchStart.midX;
          const contentY = el.scrollTop  + pinchStart.midY;
          pendingScrollRef.current = {
            left: contentX * (newZoom / oldZoom) - pinchStart.midX,
            top:  contentY * (newZoom / oldZoom) - pinchStart.midY,
          };
          setCanvasZoom(newZoom);
        }
        return;
      }

      // Single pointer pan
      if (!panStart) return;
      if (canvasZoomRef.current > 1) {
        el.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
        el.scrollTop  = panStart.scrollTop  - (e.clientY - panStart.y);
      } else {
        const x = panStart.panX + (e.clientX - panStart.x);
        const y = panStart.panY + (e.clientY - panStart.y);
        panOffsetRef.current = { x, y };
        if (canvasRef.current) canvasRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
    };

    const onUp = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchStart = null;
      if (!panStart) return;
      panStart = null;
      const cursor = panActiveRef.current ? "grab" : "";
      el.style.cursor = cursor;
      if (canvasRef.current) canvasRef.current.style.cursor = cursor;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [canvasRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = useCallback((newZoom) => {
    const el = canvasViewportRef.current;
    if (el) {
      const vpX = el.clientWidth / 2;
      const vpY = el.clientHeight / 2;
      pendingScrollRef.current = {
        left: (el.scrollLeft + vpX) * (newZoom / canvasZoomRef.current) - vpX,
        top:  (el.scrollTop  + vpY) * (newZoom / canvasZoomRef.current) - vpY,
      };
    }
    setCanvasZoom(newZoom);
  }, []);

  const canvasZoomStyle = canvasZoom !== 1 && canvasFitSizeRef.current.w > 0 ? {
    width: Math.round(canvasFitSizeRef.current.w * canvasZoom),
    height: Math.round(canvasFitSizeRef.current.h * canvasZoom),
    maxWidth: "none",
    maxHeight: "none",
  } : undefined;

  return { canvasViewportRef, panActiveRef, canvasZoom, canvasZoomRef, canvasFitSizeRef, zoomTo, canvasZoomStyle };
}
