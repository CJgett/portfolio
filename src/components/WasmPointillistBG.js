"use client";
import React, { useRef, useEffect } from "react";
import { useAnimation } from "../context/AnimationContext";
import "./WasmBackground.scss";

function WasmPointillistBG() {
  const containerRef = useRef(null);
  const workerRef = useRef(null);
  const { globalPlaying } = useAnimation();

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

    if (!globalPlaying) worker.postMessage({ type: 'pause' });

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        worker.postMessage({ type: 'resize', width: window.innerWidth, height: window.innerHeight });
      }, 100);
    };
    window.addEventListener('resize', onResize);

    return () => {
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
      window.removeEventListener('resize', onResize);
      canvas.remove();
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause to worker
  useEffect(() => {
    workerRef.current?.postMessage({ type: globalPlaying ? 'resume' : 'pause' });
  }, [globalPlaying]);

  // Render an empty container; the canvas is injected/removed by the effect.
  return <div ref={containerRef} />;
}

export default WasmPointillistBG;
