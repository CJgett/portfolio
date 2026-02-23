"use client";
import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Manages canvas pan (spacebar + drag) and zoom (scroll wheel, buttons).
 *
 * @param {object} opts
 * @param {React.RefObject} opts.canvasRef - The visible output canvas (for cursor updates)
 * @param {boolean}         opts.hasResult - Whether a result is currently rendered
 *
 * @returns {{
 *   canvasViewportRef: React.RefObject,
 *   spaceDownRef:      React.RefObject,  // shared with useBrush to block painting during pan
 *   canvasZoom:        number,
 *   canvasZoomRef:     React.RefObject,
 *   zoomTo:            (newZoom: number) => void,
 *   canvasZoomStyle:   object | undefined,
 * }}
 */
export function usePanZoom({ canvasRef, hasResult }) {
  const canvasViewportRef = useRef(null);
  const canvasZoomRef     = useRef(1);
  const canvasFitSizeRef  = useRef({ w: 0, h: 0 });
  const pendingScrollRef  = useRef(null);
  const spaceDownRef      = useRef(false);

  const [canvasZoom, setCanvasZoom] = useState(1);
  canvasZoomRef.current = canvasZoom;

  // Non-passive wheel listener — zoom toward cursor position
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
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

  // Measure the canvas's CSS display size when zoom is at 1 (for zoom style computation)
  useEffect(() => {
    if (!hasResult || canvasZoom !== 1) return;
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        const { width, height } = canvasRef.current.getBoundingClientRect();
        if (width > 0) canvasFitSizeRef.current = { w: width, h: height };
      }
    });
  }, [hasResult, canvasZoom, canvasRef]);

  // Space bar = temporary pan mode (grab cursor, blocks brush strokes)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== " " || spaceDownRef.current) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      spaceDownRef.current = true;
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
      if (canvasViewportRef.current) {
        canvasViewportRef.current.style.cursor = "";
        canvasViewportRef.current.style.touchAction = "";
      }
      if (canvasRef.current) canvasRef.current.style.cursor = "";
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [canvasRef]);

  // Pan via pointer events — setPointerCapture guarantees move delivery across
  // all input types (mouse, trackpad, touch). touch-action:none is set dynamically
  // on spacebar so the browser doesn't fire pointercancel for touch-type events.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    let panStart = null;
    const onDown = (e) => {
      if (!spaceDownRef.current) return;
      if (!el.contains(e.target)) return;
      e.preventDefault();
      panStart = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    };
    const onMove = (e) => {
      if (!panStart) return;
      el.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
      el.scrollTop  = panStart.scrollTop  - (e.clientY - panStart.y);
    };
    const onUp = () => {
      if (!panStart) return;
      panStart = null;
      const cursor = spaceDownRef.current ? "grab" : "";
      el.style.cursor = cursor;
      if (canvasRef.current) canvasRef.current.style.cursor = cursor;
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
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

  return { canvasViewportRef, spaceDownRef, canvasZoom, canvasZoomRef, zoomTo, canvasZoomStyle };
}
