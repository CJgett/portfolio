"use client";
import React, { useRef, useEffect } from "react";
import { useAnimation } from "../context/AnimationContext";
import "./WasmBackground.scss";

function WasmPointillistBG() {
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const { globalPlaying } = useAnimation();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.transferControlToOffscreen) return; // Safari < 16.4 guard

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

    const onResize = () => worker.postMessage({
      type: 'resize', width: window.innerWidth, height: window.innerHeight,
    });
    window.addEventListener('resize', onResize);

    return () => {
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
      window.removeEventListener('resize', onResize);
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause to worker
  useEffect(() => {
    workerRef.current?.postMessage({ type: globalPlaying ? 'resume' : 'pause' });
  }, [globalPlaying]);

  return <canvas className="wasm-background-canvas" ref={canvasRef} />;
}

export default WasmPointillistBG;
