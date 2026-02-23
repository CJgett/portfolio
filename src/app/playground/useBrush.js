"use client";
import { useRef, useEffect, useCallback } from "react";
import { drawShape, MIXED_SHAPES, BRUSHSTROKE_PATHS } from "./canvasUtils";

/**
 * Manages the brush painting engine: offscreen canvases, RAF spray loop,
 * pointer event handlers, and eraser.
 *
 * @param {object}   opts
 * @param {React.RefObject} opts.canvasRef     - The visible output canvas
 * @param {React.RefObject} opts.outputSizeRef - { w, h } of the current output
 * @param {React.RefObject} opts.bgColorRef    - Current background color string
 * @param {React.RefObject} opts.spaceDownRef  - True when spacebar is held (pan mode)
 * @param {object}   opts.brushParams          - Current brush slider/tool values (synced each render)
 * @param {boolean}  opts.showGuide            - Whether the reference guide is visible
 * @param {Function} opts.loadWasm             - Returns a Promise<WasmExports>
 */
export function useBrush({ canvasRef, outputSizeRef, bgColorRef, spaceDownRef, brushParams, showGuide, loadWasm }) {
  const paintLayerRef    = useRef(null);
  const sourceCanvasRef  = useRef(null);
  const brushCellsRef    = useRef([]);
  const isSprayingRef    = useRef(false);
  const pointerPosRef    = useRef({ x: 0, y: 0 });
  const sprayRAFRef      = useRef(null);
  const brushParamsRef   = useRef(brushParams);
  const showGuideRef     = useRef(showGuide);
  // WASM-precomputed average-color grid: { data: Uint8Array, cols, rows, sp }
  // Populated asynchronously in setupBrushCanvases; null while loading.
  const colorGridRef     = useRef(null);

  // Sync refs with latest values on every render (avoids stale closures in RAF loop)
  brushParamsRef.current = brushParams;
  showGuideRef.current   = showGuide;

  // Stop spray RAF on unmount
  useEffect(() => {
    return () => {
      isSprayingRef.current = false;
      if (sprayRAFRef.current) cancelAnimationFrame(sprayRAFRef.current);
    };
  }, []);

  const compositeBrushCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paintCanvas = paintLayerRef.current;
    const srcCanvas = sourceCanvasRef.current;
    if (!paintCanvas || !srcCanvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bgColorRef.current || "#f5f5f5";
    ctx.fillRect(0, 0, w, h);
    if (showGuideRef.current) {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(srcCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(paintCanvas, 0, 0);
  }, [canvasRef, bgColorRef]);

  const setupBrushCanvases = useCallback((img, w, h, cropX, cropY) => {
    if (!img) return;

    // Source canvas: source image at output size, used for pixel color sampling
    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = document.createElement("canvas");
    }
    const srcCanvas = sourceCanvasRef.current;
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext("2d");

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const imgCoverScale = Math.max(w / imgW, h / imgH);
    const scaledW = imgW * imgCoverScale;
    const scaledH = imgH * imgCoverScale;
    const clampedX = Math.max(0, Math.min(cropX, scaledW - w));
    const clampedY = Math.max(0, Math.min(cropY, scaledH - h));
    srcCtx.drawImage(img, -clampedX, -clampedY, scaledW, scaledH);

    // Compute bg color (sample every 8th pixel for speed) and capture imgData
    // for reuse in the WASM color grid computation below.
    const imgData = srcCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    for (let i = 0; i < data.length; i += 4 * 8) {
      totalR += data[i]; totalG += data[i + 1]; totalB += data[i + 2]; count++;
    }
    const n = count || 1;
    const avgR = totalR / n, avgG = totalG / n, avgB = totalB / n;
    const bgR = Math.round(avgR + (255 - avgR) * 0.85);
    const bgG = Math.round(avgG + (255 - avgG) * 0.85);
    const bgB = Math.round(avgB + (255 - avgB) * 0.85);
    bgColorRef.current = `rgb(${bgR}, ${bgG}, ${bgB})`;

    // Paint layer: accumulates painted shapes (transparent background)
    if (!paintLayerRef.current) {
      paintLayerRef.current = document.createElement("canvas");
    }
    const paintCanvas = paintLayerRef.current;
    paintCanvas.width = w;
    paintCanvas.height = h;
    paintCanvas.getContext("2d").clearRect(0, 0, w, h);

    outputSizeRef.current = { w, h };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = w;
      canvas.height = h;
    }

    compositeBrushCanvas();

    // Build WASM color grid in the background using the imgData we already have.
    // Brush painting starts immediately with the bounding-box getImageData fallback
    // (see brushTick), then silently switches to the grid once it's ready.
    colorGridRef.current = null;
    loadWasm().then((wasm) => {
      // Guard: bail if a new image was loaded before WASM returned
      if (sourceCanvasRef.current?.width !== w || sourceCanvasRef.current?.height !== h) return;

      // Cell size = dot radius at setup time (averaging area matches dot size).
      // Minimum of 4 to keep cell count reasonable for very small dots.
      const sp = Math.max(4, Math.round(brushParamsRef.current.dotRadius));
      const byteCount = w * h * 4;
      const maxCells = Math.ceil(w / sp) * Math.ceil(h / sp);
      const requiredBytes = byteCount + maxCells * 20;

      if (requiredBytes > wasm.memory.buffer.byteLength) {
        const pagesToGrow = Math.ceil((requiredBytes - wasm.memory.buffer.byteLength) / (64 * 1024));
        wasm.memory.grow(pagesToGrow);
      }

      // Reuse the imgData captured from the getImageData call above — no extra readback needed.
      new Uint8ClampedArray(wasm.memory.buffer, 0, byteCount).set(imgData.data);

      const cellCount = wasm.computeCells(w, h, sp);
      const cellData = new Int32Array(wasm.memory.buffer, byteCount, cellCount * 5);

      const cols = Math.ceil(w / sp);
      const rows = Math.ceil(h / sp);
      const gridData = new Uint8Array(cols * rows * 3);

      for (let i = 0; i < cellCount; i++) {
        const base = i * 5;
        const cx = cellData[base], cy = cellData[base + 1];
        const cr = cellData[base + 2], cg = cellData[base + 3], cb = cellData[base + 4];
        const col = Math.min(cols - 1, Math.floor(cx / sp));
        const row = Math.min(rows - 1, Math.floor(cy / sp));
        const idx = (row * cols + col) * 3;
        gridData[idx] = cr; gridData[idx + 1] = cg; gridData[idx + 2] = cb;
      }

      colorGridRef.current = { data: gridData, cols, rows, sp };
    }).catch(() => {
      colorGridRef.current = null;
    });
  }, [canvasRef, outputSizeRef, bgColorRef, compositeBrushCanvas, loadWasm]);

  const brushTick = useCallback(() => {
    if (!isSprayingRef.current) return;
    const { x, y } = pointerPosRef.current;
    const { w, h } = outputSizeRef.current;
    const paintCanvas = paintLayerRef.current;
    const srcCanvas = sourceCanvasRef.current;
    if (!paintCanvas || !srcCanvas) return;

    const { brushTool: tool, eraserRadius: er, brushRadius: br, dotRadius: dr, opacity: op, jitter: jt, rotationJitter: rj, shape: sh, strokeLength: sl } = brushParamsRef.current;
    const paintCtx = paintCanvas.getContext("2d");

    if (tool === "erase") {
      paintCtx.save();
      paintCtx.globalCompositeOperation = "destination-out";
      paintCtx.beginPath();
      paintCtx.arc(x, y, er, 0, 2 * Math.PI);
      paintCtx.fill();
      paintCtx.restore();
      // Remove cells whose center falls within the eraser circle (keeps SVG export accurate)
      const erSq = er * er;
      brushCellsRef.current = brushCellsRef.current.filter(c => {
        const dx = c.x - x, dy = c.y - y;
        return dx * dx + dy * dy > erSq;
      });
    } else {
      const rotJitterRad = (rj * Math.PI) / 180;
      const shapesPerTick = Math.max(1, Math.ceil(Math.PI * br * br / 3000));

      // Color source: use the WASM-precomputed average-color grid when ready (O(1) typed-array
      // lookup, no GPU readback). Falls back to a single bounding-box getImageData per tick
      // while the grid is still loading (typically < one frame after first WASM use).
      const grid = colorGridRef.current;
      let srcPixels = null, boxX = 0, boxY = 0, boxW = 0;
      if (!grid) {
        boxX = Math.max(0, Math.floor(x - br));
        boxY = Math.max(0, Math.floor(y - br));
        boxW = Math.min(w, Math.ceil(x + br)) - boxX;
        const boxH = Math.min(h, Math.ceil(y + br)) - boxY;
        if (boxW > 0 && boxH > 0) {
          srcPixels = srcCanvas.getContext("2d").getImageData(boxX, boxY, boxW, boxH).data;
        }
      }

      for (let i = 0; i < shapesPerTick; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const r = br * Math.sqrt(Math.random()); // uniform disk distribution
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        const cx = Math.max(0, Math.min(Math.round(px), w - 1));
        const cy = Math.max(0, Math.min(Math.round(py), h - 1));

        let pr, pg, pb;
        if (grid) {
          const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(cx / grid.sp)));
          const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(cy / grid.sp)));
          const idx = (row * grid.cols + col) * 3;
          pr = grid.data[idx]; pg = grid.data[idx + 1]; pb = grid.data[idx + 2];
        } else if (srcPixels) {
          const idx = ((cy - boxY) * boxW + (cx - boxX)) * 4;
          pr = srcPixels[idx]; pg = srcPixels[idx + 1]; pb = srcPixels[idx + 2];
        } else {
          pr = pg = pb = 0;
        }

        const jx = px + (Math.random() - 0.5) * 2 * jt;
        const jy = py + (Math.random() - 0.5) * 2 * jt;
        const rotation = (Math.random() - 0.5) * 2 * rotJitterRad;
        const brushIdx = Math.floor(Math.random() * BRUSHSTROKE_PATHS.length);
        const cellShape = sh === "mixed"
          ? MIXED_SHAPES[Math.floor(Math.random() * MIXED_SHAPES.length)]
          : sh;

        paintCtx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${op})`;
        drawShape(paintCtx, cellShape, jx, jy, dr, rotation, sl, brushIdx);

        brushCellsRef.current.push({
          x: jx, y: jy, r: pr, g: pg, b: pb,
          rotation, shape: cellShape, brushIdx,
          dr, op, sl,
        });
      }
    }

    compositeBrushCanvas();
    sprayRAFRef.current = requestAnimationFrame(brushTick);
  }, [outputSizeRef, compositeBrushCanvas]);

  const startSpray = useCallback((e) => {
    if (spaceDownRef.current) return; // space held = pan mode, not paint
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    pointerPosRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
    isSprayingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    sprayRAFRef.current = requestAnimationFrame(brushTick);
  }, [canvasRef, spaceDownRef, brushTick]);

  const updateSpray = useCallback((e) => {
    if (!isSprayingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    pointerPosRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [canvasRef]);

  const stopSpray = useCallback(() => {
    isSprayingRef.current = false;
    if (sprayRAFRef.current) {
      cancelAnimationFrame(sprayRAFRef.current);
      sprayRAFRef.current = null;
    }
  }, []);

  const handleClearBrush = useCallback(() => {
    const paintCanvas = paintLayerRef.current;
    if (paintCanvas) {
      paintCanvas.getContext("2d").clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    }
    brushCellsRef.current = [];
    compositeBrushCanvas();
  }, [compositeBrushCanvas]);

  // Updates the ref and redraws immediately, avoiding the one-render lag
  // that would occur if we relied solely on the showGuide state syncing the ref.
  const toggleShowGuide = useCallback((show) => {
    showGuideRef.current = show;
    compositeBrushCanvas();
  }, [compositeBrushCanvas]);

  return {
    paintLayerRef,
    brushCellsRef,
    isSprayingRef,
    sprayRAFRef,
    compositeBrushCanvas,
    setupBrushCanvases,
    startSpray,
    updateSpray,
    stopSpray,
    handleClearBrush,
    toggleShowGuide,
  };
}
