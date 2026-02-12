"use client";
import React, { useRef, useEffect } from "react";

const DEFAULT_DOT_RADIUS = 18;
const DEFAULT_SPACING = 18; // tighter than 2×radius → overlap
const DEFAULT_JITTER = 8;  // max px offset from grid centre
const DEFAULT_OPACITY = 0.7;
const DEFAULT_DOTS_PER_FRAME = 10;
const DEFAULT_PAUSE_MS = 3000;
const DEFAULT_ERASE_PER_FRAME = 60;

function pickRandom(arr, exclude) {
  if (arr.length <= 1) return arr[0];
  let pick;
  do {
    pick = arr[Math.floor(Math.random() * arr.length)];
  } while (pick === exclude);
  return pick;
}

function WasmBackground2({
  dotRadius = DEFAULT_DOT_RADIUS,
  spacing = DEFAULT_SPACING,
  jitter = DEFAULT_JITTER,
  opacity = DEFAULT_OPACITY,
  dotsPerFrame = DEFAULT_DOTS_PER_FRAME,
  pauseMs = DEFAULT_PAUSE_MS,
  erasePerFrame = DEFAULT_ERASE_PER_FRAME,
}) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const timeoutRef = useRef(null);
  // Cell positions stored in source-image pixel coords + RGB
  const cellsRef = useRef(null);
  // Source image dimensions for computing the cover transform
  const srcSizeRef = useRef(null);
  // How many cells have been drawn so far in the animation
  const drawnRef = useRef(0);
  // Wasm instance — loaded once, reused across cycles
  const wasmRef = useRef(null);
  // Current canvas background colour extracted from the image
  const bgColorRef = useRef("#ffffff");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let lastSrc = null;

    // Compute an object-fit: cover transform from source image to canvas
    const getCoverTransform = () => {
      const src = srcSizeRef.current;
      if (!src) return null;
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / src.w, ch / src.h);
      return {
        scale,
        offsetX: (cw - src.w * scale) / 2,
        offsetY: (ch - src.h * scale) / 2,
      };
    };

    // Redraw all cells that have been revealed so far
    const redrawAll = () => {
      const cells = cellsRef.current;
      const t = getCoverTransform();
      if (!cells || !t) return;

      ctx.fillStyle = bgColorRef.current;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const count = drawnRef.current;
      for (let i = 0; i < count; i++) {
        const c = cells[i];
        ctx.beginPath();
        ctx.arc(
          c.ix * t.scale + t.offsetX,
          c.iy * t.scale + t.offsetY,
          dotRadius,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
        ctx.fill();
      }
    };

    const handleResize = () => {
      canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
      canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
      redrawAll();
    };

    // Load an image and compute its cell data via Wasm
    const prepareImage = async (src) => {
      const img = new Image();
      img.src = src;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      if (cancelled) return null;

      // Scale the image to the current canvas size so that spacing/jitter
      // are consistent in screen pixels regardless of source resolution.
      const cw = canvas.width;
      const ch = canvas.height;
      const imgScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const srcW = Math.round(img.naturalWidth * imgScale);
      const srcH = Math.round(img.naturalHeight * imgScale);

      // Read pixels via an offscreen canvas so the source image never flashes
      const offscreen = document.createElement("canvas");
      offscreen.width = srcW;
      offscreen.height = srcH;
      const offCtx = offscreen.getContext("2d");
      offCtx.drawImage(img, 0, 0, srcW, srcH);
      const imageData = offCtx.getImageData(0, 0, srcW, srcH);

      // Load Wasm module once
      if (!wasmRef.current) {
        const imports = {
          env: {
            abort: () => console.log("Abort!"),
            log: (val) => console.log("WASM Log:", val),
          },
        };
        const response = await fetch("/blur.wasm");
        const module = await WebAssembly.instantiateStreaming(response, imports);
        wasmRef.current = module.instance.exports;
      }

      if (cancelled) return null;

      const wasm = wasmRef.current;
      const byteCount = srcW * srcH * 4;

      // Allocate Wasm memory
      const cols = Math.ceil(srcW / spacing);
      const rows = Math.ceil(srcH / spacing);
      const maxCells = cols * rows;
      const requiredBytes = byteCount + maxCells * 20;
      const memory = wasm.memory;

      if (requiredBytes > memory.buffer.byteLength) {
        const pagesToGrow = Math.ceil(
          (requiredBytes - memory.buffer.byteLength) / (64 * 1024)
        );
        memory.grow(pagesToGrow);
      }

      // Copy pixels into Wasm input buffer (offset 0)
      const inputView = new Uint8ClampedArray(memory.buffer, 0, byteCount);
      inputView.set(imageData.data);

      // Compute cell colours in Wasm
      const cellCount = wasm.computeCells(srcW, srcH, spacing);

      // Read cell data into image-space coords, apply jitter
      const cellData = new Int32Array(memory.buffer, byteCount, cellCount * 5);
      const cells = [];
      for (let i = 0; i < cellCount; i++) {
        const base = i * 5;
        cells.push({
          ix: cellData[base] + (Math.random() - 0.5) * 2 * jitter,
          iy: cellData[base + 1] + (Math.random() - 0.5) * 2 * jitter,
          r: cellData[base + 2],
          g: cellData[base + 3],
          b: cellData[base + 4],
        });
      }

      // Sort by distance from a random origin so animation radiates outward
      const ox = Math.random() * srcW;
      const oy = Math.random() * srcH;
      cells.sort((a, b) => {
        const da = (a.ix - ox) ** 2 + (a.iy - oy) ** 2;
        const db = (b.ix - ox) ** 2 + (b.iy - oy) ** 2;
        return da - db;
      });

      // Compute dominant colour from cell averages
      let totalR = 0, totalG = 0, totalB = 0;
      for (let i = 0; i < cells.length; i++) {
        totalR += cells[i].r;
        totalG += cells[i].g;
        totalB += cells[i].b;
      }
      const n = cells.length || 1;
      const avgR = totalR / n;
      const avgG = totalG / n;
      const avgB = totalB / n;

      // Light tint for canvas background (blend 90% toward white)
      const bgR = Math.round(avgR + (255 - avgR) * 0.9);
      const bgG = Math.round(avgG + (255 - avgG) * 0.9);
      const bgB = Math.round(avgB + (255 - avgB) * 0.9);

      // Slightly darker tint for text component backgrounds (blend 75% toward white)
      const compR = Math.round(avgR + (255 - avgR) * 0.75);
      const compG = Math.round(avgG + (255 - avgG) * 0.75);
      const compB = Math.round(avgB + (255 - avgB) * 0.75);

      return {
        cells, srcW, srcH,
        bgColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
        compColor: `rgb(${compR}, ${compG}, ${compB})`,
      };
    };

    // Main loop: draw in → pause → erase → repeat
    const cycle = async () => {
      // Fetch the list of available background pictures
      const res = await fetch("/api/bg-pics");
      const pics = await res.json();
      if (!pics.length) {
        console.error("WasmBackground2: no images found in /bg_pics");
        return;
      }

      while (!cancelled) {
        const src = pickRandom(pics, lastSrc);
        lastSrc = src;

        const result = await prepareImage(src);
        if (!result || cancelled) return;

        const { cells, srcW, srcH, bgColor, compColor } = result;
        srcSizeRef.current = { w: srcW, h: srcH };
        cellsRef.current = cells;
        drawnRef.current = 0;
        bgColorRef.current = bgColor;

        // Transition the component colours via CSS custom properties
        const root = document.documentElement;
        root.style.setProperty("--bg-color", bgColor);
        root.style.setProperty("--text-bg", compColor);

        // Size the visible canvas to the window
        canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
        canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- Animate dots in ---
        await new Promise((resolve) => {
          let drawn = 0;

          const animateIn = () => {
            if (cancelled) { resolve(); return; }

            const t = getCoverTransform();
            if (!t) { resolve(); return; }

            const end = Math.min(drawn + dotsPerFrame, cells.length);

            for (let i = drawn; i < end; i++) {
              const c = cells[i];
              ctx.beginPath();
              ctx.arc(
                c.ix * t.scale + t.offsetX,
                c.iy * t.scale + t.offsetY,
                dotRadius,
                0,
                2 * Math.PI
              );
              ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
              ctx.fill();
            }

            drawn = end;
            drawnRef.current = drawn;

            if (drawn < cells.length) {
              requestRef.current = requestAnimationFrame(animateIn);
            } else {
              resolve();
            }
          };

          requestRef.current = requestAnimationFrame(animateIn);
        });

        if (cancelled) return;

        // --- Pause ---
        await new Promise((resolve) => {
          timeoutRef.current = setTimeout(resolve, pauseMs);
        });

        if (cancelled) return;

        // --- Erase dots (reverse order) ---
        await new Promise((resolve) => {
          let remaining = cells.length;

          const animateOut = () => {
            if (cancelled) { resolve(); return; }

            const t = getCoverTransform();
            if (!t) { resolve(); return; }

            const eraseCount = Math.min(erasePerFrame, remaining);

            // Remove dots from the end
            remaining -= eraseCount;
            drawnRef.current = remaining;

            ctx.fillStyle = bgColorRef.current;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < remaining; i++) {
              const c = cells[i];
              ctx.beginPath();
              ctx.arc(
                c.ix * t.scale + t.offsetX,
                c.iy * t.scale + t.offsetY,
                dotRadius,
                0,
                2 * Math.PI
              );
              ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
              ctx.fill();
            }

            if (remaining > 0) {
              requestRef.current = requestAnimationFrame(animateOut);
            } else {
              resolve();
            }
          };

          requestRef.current = requestAnimationFrame(animateOut);
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    cycle().catch((err) => console.error("WasmBackground2 error:", err));

    return () => {
      cancelled = true;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [dotRadius, spacing, jitter, opacity, dotsPerFrame, pauseMs, erasePerFrame]);

  return <canvas className="wasm-background-canvas" ref={canvasRef} />;
}

export default WasmBackground2;
