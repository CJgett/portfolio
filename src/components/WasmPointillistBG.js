"use client";
import React, { useRef, useEffect, useState } from "react";
import { useAnimation } from "../context/AnimationContext";
import "./WasmBackground.scss";

function WasmPointillistBG() {
  const containerRef = useRef(null);
  const workerRef = useRef(null);
  const { globalPlaying } = useAnimation();
  // Tracks tab visibility so the worker pauses when backgrounded — it paces
  // itself with setTimeout (no requestAnimationFrame in workers), so it
  // wouldn't otherwise get the browser's usual background-tab throttling.
  const [pageHidden, setPageHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );

  useEffect(() => {
    if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return; // Safari < 16.4 guard

    // Create the canvas inside the effect so every invocation (including React Strict
    // Mode's double-invoke) gets a fresh element that hasn't been transferred yet.
    const canvas = document.createElement('canvas');
    canvas.className = 'wasm-background-canvas';
    containerRef.current.appendChild(canvas);

    const worker = new Worker(new URL('./wasmBgWorker.js', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'colors') {
        document.documentElement.style.setProperty('--bg-color', e.data.bgColor);
        document.documentElement.style.setProperty('--text-bg', e.data.compColor);
      }
    };

    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage(
      { type: 'init', canvas: offscreen, width: window.innerWidth, height: window.innerHeight },
      [offscreen]
    );

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        worker.postMessage({ type: 'resize', width: window.innerWidth, height: window.innerHeight });
      }, 100);
    };
    window.addEventListener('resize', onResize);

    const onVisibilityChange = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.remove();
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause to worker: paused whenever the user paused it manually,
  // or the tab is in the background. Runs on mount too, so it also covers
  // the initial pause state set by the effect above.
  useEffect(() => {
    const shouldPlay = globalPlaying && !pageHidden;
    workerRef.current?.postMessage({ type: shouldPlay ? 'resume' : 'pause' });
  }, [globalPlaying, pageHidden]);

  // Render an empty container; the canvas is injected/removed by the effect.
  return <div ref={containerRef} />;
}

export default WasmPointillistBG;
