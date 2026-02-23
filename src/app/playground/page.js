"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAnimation } from "../../context/AnimationContext";
import { drawShape, rgbToHex, BRUSHSTROKE_PATHS, MIXED_SHAPES } from "./canvasUtils";
import { useBrush } from "./useBrush";
import { usePanZoom } from "./usePanZoom";
import { DownloadModal } from "./DownloadModal";
import "./playground.scss";

const DEFAULTS = { dotRadius: 16, spacing: 15, jitter: 6, opacity: 0.7, outputW: 800, outputH: 600, cropX: 0, cropY: 0, shape: "circle", strokeLength: 2, rotationJitter: 0 };
const SHAPES = ["circle", "square", "triangle", "line", "brushstroke", "mixed"];

export default function Playground() {
  const { t } = useLanguage();
  const { globalPlaying, setGlobalPlaying, isFullscreen, setIsFullscreen } = useAnimation();
  const prevPlayingRef = useRef(globalPlaying);
  const canvasRef      = useRef(null);
  const wasmRef        = useRef(null);
  const fileInputRef   = useRef(null);
  const srcImgRef      = useRef(null);
  const cellsRef       = useRef(null);
  const bgColorRef     = useRef(null);
  const outputSizeRef  = useRef({ w: 0, h: 0 });
  const previewRef     = useRef(null);

  // Pause global animations while playground is open; restore on unmount
  useEffect(() => {
    prevPlayingRef.current = globalPlaying;
    setGlobalPlaying(false);
    return () => {
      setGlobalPlaying(prevPlayingRef.current);
      setIsFullscreen(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setIsFullscreen]);

  // --- Render parameters (auto mode) ---
  const [dotRadius, setDotRadius]           = useState(DEFAULTS.dotRadius);
  const [spacing, setSpacing]               = useState(DEFAULTS.spacing);
  const [jitter, setJitter]                 = useState(DEFAULTS.jitter);
  const [opacity, setOpacity]               = useState(DEFAULTS.opacity);
  const [outputSize, setOutputSize]         = useState({ w: DEFAULTS.outputW, h: DEFAULTS.outputH });
  const [cropOffset, setCropOffset]         = useState({ x: DEFAULTS.cropX, y: DEFAULTS.cropY });
  const [shape, setShape]                   = useState(DEFAULTS.shape);
  const [strokeLength, setStrokeLength]     = useState(DEFAULTS.strokeLength);
  const [rotationJitter, setRotationJitter] = useState(DEFAULTS.rotationJitter);
  const [bgPics, setBgPics]                 = useState([]);
  const [selectedSrc, setSelectedSrc]       = useState(null);
  const [processing, setProcessing]         = useState(false);
  const [hasResult, setHasResult]           = useState(false);
  const [mode, setMode]                     = useState("auto");

  // --- Brush tool state (passed into useBrush each render) ---
  const [brushRadius, setBrushRadius]   = useState(50);
  const [brushTool, setBrushTool]       = useState("paint"); // "paint" | "erase"
  const [eraserRadius, setEraserRadius] = useState(30);
  const [showGuide, setShowGuide]       = useState(true);

  // --- WASM loader ---
  const loadWasm = useCallback(async () => {
    if (wasmRef.current) return wasmRef.current;
    const response = await fetch("/blur.wasm");
    const module = await WebAssembly.instantiateStreaming(response, {});
    wasmRef.current = module.instance.exports;
    return wasmRef.current;
  }, []);

  // --- Pan / zoom ---
  const { canvasViewportRef, spaceDownRef, canvasZoom, canvasZoomRef, zoomTo, canvasZoomStyle } =
    usePanZoom({ canvasRef, hasResult });

  // --- Brush engine ---
  const brushParams = { brushRadius, dotRadius, opacity, jitter, rotationJitter, shape, strokeLength, brushTool, eraserRadius };
  const { paintLayerRef, brushCellsRef, isSprayingRef, sprayRAFRef, cursorRef, compositeBrushCanvas, setupBrushCanvases, startSpray, updateSpray, stopSpray, handleClearBrush, toggleShowGuide, drawCursor, hideCursor } =
    useBrush({ canvasRef, outputSizeRef, bgColorRef, spaceDownRef, brushParams, showGuide, loadWasm });

  // --- Modal state ---
  const [sizeModalOpen, setSizeModalOpen] = useState(false);

  useEffect(() => {
    fetch("data/bgPics.json")
      .then((res) => res.json())
      .then(setBgPics)
      .catch(() => {});
  }, []);

  // --- Auto mode rendering ---
  const renderWithParams = useCallback(async (params) => {
    const img = srcImgRef.current;
    if (!img) return;

    const { dotRadius: dr, spacing: sp, jitter: jt, opacity: op, outputW: ow, outputH: oh, cropX: cx, cropY: cy, shape: sh, strokeLength: sl, rotationJitter: rj } = params;

    setProcessing(true);

    const w = ow;
    const h = oh;
    const pad = sp;
    const ew = w + pad;
    const eh = h + pad;
    const offscreen = document.createElement("canvas");
    offscreen.width = ew;
    offscreen.height = eh;
    const offCtx = offscreen.getContext("2d");

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const imgCoverScale = Math.max(ew / imgW, eh / imgH);
    const scaledW = imgW * imgCoverScale;
    const scaledH = imgH * imgCoverScale;
    const clampedX = Math.max(0, Math.min(cx, scaledW - ew));
    const clampedY = Math.max(0, Math.min(cy, scaledH - eh));
    offCtx.drawImage(img, -clampedX, -clampedY, scaledW, scaledH);

    const imageData = offCtx.getImageData(0, 0, ew, eh);

    const wasm = await loadWasm();
    const byteCount = ew * eh * 4;
    const maxCells = Math.ceil(ew / sp) * Math.ceil(eh / sp);
    const requiredBytes = byteCount + maxCells * 20;
    const memory = wasm.memory;

    if (requiredBytes > memory.buffer.byteLength) {
      const pagesToGrow = Math.ceil((requiredBytes - memory.buffer.byteLength) / (64 * 1024));
      memory.grow(pagesToGrow);
    }

    const inputView = new Uint8ClampedArray(memory.buffer, 0, byteCount);
    inputView.set(imageData.data);

    const cellCount = wasm.computeCells(ew, eh, sp);
    const cellData = new Int32Array(memory.buffer, byteCount, cellCount * 5);
    const rotJitterRad = (rj * Math.PI) / 180;
    const cells = [];

    let totalR = 0, totalG = 0, totalB = 0;

    for (let i = 0; i < cellCount; i++) {
      const base = i * 5;
      const cellCx = cellData[base], cellCy = cellData[base + 1], cr = cellData[base + 2], cg = cellData[base + 3], cb = cellData[base + 4];

      totalR += cr; totalG += cg; totalB += cb;

      const cellShape = sh === "mixed" ? MIXED_SHAPES[Math.floor(Math.random() * MIXED_SHAPES.length)] : sh;
      cells.push({
        x: cellCx + (Math.random() - 0.5) * 2 * jt,
        y: cellCy + (Math.random() - 0.5) * 2 * jt,
        r: cr, g: cg, b: cb,
        rotation: (Math.random() - 0.5) * 2 * rotJitterRad,
        shape: cellShape,
        brushIdx: Math.floor(Math.random() * BRUSHSTROKE_PATHS.length),
      });
    }

    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const n = cellCount || 1;
    const avgR = totalR / n, avgG = totalG / n, avgB = totalB / n;
    const bgR = Math.round(avgR + (255 - avgR) * 0.85);
    const bgG = Math.round(avgG + (255 - avgG) * 0.85);
    const bgB = Math.round(avgB + (255 - avgB) * 0.85);
    const bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

    cellsRef.current = { cells, dr, op, sh, sl, sp };
    bgColorRef.current = bgColor;
    outputSizeRef.current = { w, h };

    const canvas = canvasRef.current;
    if (!canvas) { setProcessing(false); return; }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    for (const c of cells) {
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${op})`;
      drawShape(ctx, c.shape, c.x, c.y, dr, c.rotation, sl, c.brushIdx);
    }

    setProcessing(false);
    setHasResult(true);
  }, [loadWasm]);

  const getCurrentParams = useCallback(() => ({
    dotRadius, spacing, jitter, opacity,
    outputW: outputSize.w, outputH: outputSize.h,
    cropX: cropOffset.x, cropY: cropOffset.y,
    shape, strokeLength, rotationJitter,
  }), [dotRadius, spacing, jitter, opacity, outputSize, cropOffset, shape, strokeLength, rotationJitter]);

  const switchMode = useCallback((newMode) => {
    zoomTo(1);
    isSprayingRef.current = false;
    if (sprayRAFRef.current) {
      cancelAnimationFrame(sprayRAFRef.current);
      sprayRAFRef.current = null;
    }
    if (newMode === "brush") {
      brushCellsRef.current = [];
      const img = srcImgRef.current;
      if (img) {
        const params = getCurrentParams();
        const { w, h } = outputSizeRef.current;
        setupBrushCanvases(img, w, h, params.cropX, params.cropY);
        setHasResult(true);
      }
    } else {
      if (srcImgRef.current) {
        renderWithParams(getCurrentParams());
      } else {
        setHasResult(false);
      }
    }
    setMode(newMode);
  }, [zoomTo, setupBrushCanvases, renderWithParams, getCurrentParams, isSprayingRef, sprayRAFRef, brushCellsRef]);

  const handleSliderRelease = useCallback(() => {
    if (mode === "auto" && srcImgRef.current) renderWithParams(getCurrentParams());
  }, [mode, renderWithParams, getCurrentParams]);

  const autoSizeForImage = (img) => {
    const availW = previewRef.current?.clientWidth || 800;
    const w = Math.min(availW, img.naturalWidth);
    const h = Math.round(w * img.naturalHeight / img.naturalWidth);
    return { w, h };
  };

  const selectImage = useCallback(async (src) => {
    zoomTo(1);
    setSelectedSrc(src);
    setCropOffset({ x: 0, y: 0 });
    setProcessing(true);
    const img = new Image();
    img.src = src;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    srcImgRef.current = img;
    const { w: natW, h: natH } = autoSizeForImage(img);
    setOutputSize({ w: natW, h: natH });
    if (mode === "brush") {
      brushCellsRef.current = [];
      setupBrushCanvases(img, natW, natH, 0, 0);
      setHasResult(true);
      setProcessing(false);
    } else {
      await renderWithParams({ ...getCurrentParams(), outputW: natW, outputH: natH, cropX: 0, cropY: 0 });
    }
  }, [mode, renderWithParams, getCurrentParams, setupBrushCanvases, zoomTo, brushCellsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    selectImage(url);
  }, [selectImage]);

  const handleRandomize = useCallback(() => {
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randFloat = (min, max, step) => {
      const steps = Math.round((max - min) / step);
      return min + Math.round(Math.random() * steps) * step;
    };

    const newShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const newDotRadius = randInt(1, 100);
    const newSpacing = randInt(1, 100);
    const newJitter = randInt(0, 20);
    const newOpacity = Math.round(randFloat(0.1, 1, 0.05) * 1000) / 1000;
    const newRotationJitter = randInt(0, 180);
    const newStrokeLength = randFloat(1, 5, 0.5);

    setShape(newShape);
    setDotRadius(newDotRadius);
    setSpacing(newSpacing);
    setJitter(newJitter);
    setOpacity(newOpacity);
    setRotationJitter(newRotationJitter);
    setStrokeLength(newStrokeLength);

    if (mode === "brush") {
      // In brush mode, slider state updates are enough (brushParamsRef syncs automatically).
      // If no image loaded yet, pick a random one.
      if (!srcImgRef.current && bgPics.length > 0) {
        const randomPic = bgPics[Math.floor(Math.random() * bgPics.length)];
        setSelectedSrc(randomPic);
        setCropOffset({ x: 0, y: 0 });
        setProcessing(true);
        const img = new Image();
        img.src = randomPic;
        img.onload = () => {
          srcImgRef.current = img;
          const { w: natW, h: natH } = autoSizeForImage(img);
          setOutputSize({ w: natW, h: natH });
          brushCellsRef.current = [];
          setupBrushCanvases(img, natW, natH, 0, 0);
          setHasResult(true);
          setProcessing(false);
        };
      }
      return;
    }

    const params = {
      dotRadius: newDotRadius, spacing: newSpacing, jitter: newJitter,
      opacity: newOpacity, outputW: outputSize.w, outputH: outputSize.h,
      cropX: cropOffset.x, cropY: cropOffset.y, shape: newShape,
      strokeLength: newStrokeLength, rotationJitter: newRotationJitter,
    };

    if (!srcImgRef.current && bgPics.length > 0) {
      const randomPic = bgPics[Math.floor(Math.random() * bgPics.length)];
      setSelectedSrc(randomPic);
      setCropOffset({ x: 0, y: 0 });
      setProcessing(true);
      const img = new Image();
      img.src = randomPic;
      img.onload = () => {
        srcImgRef.current = img;
        const { w: natW, h: natH } = autoSizeForImage(img);
        setOutputSize({ w: natW, h: natH });
        renderWithParams({ ...params, outputW: natW, outputH: natH, cropX: 0, cropY: 0 });
      };
    } else {
      renderWithParams(params);
    }
  }, [mode, bgPics, outputSize, cropOffset, renderWithParams, setupBrushCanvases, brushCellsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Download functions ---
  const handleDownloadPNG = useCallback(() => {
    if (mode === "brush") {
      const paintCanvas = paintLayerRef.current;
      if (!paintCanvas) return;
      const { w, h } = outputSizeRef.current;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      const ctx = tempCanvas.getContext("2d");
      ctx.fillStyle = bgColorRef.current || "#f5f5f5";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(paintCanvas, 0, 0);
      const link = document.createElement("a");
      link.download = "pointillist.png";
      link.href = tempCanvas.toDataURL("image/png");
      link.click();
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = "pointillist.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
  }, [mode, paintLayerRef, bgColorRef]);

  const handleDownloadSVG = useCallback(() => {
    const bg = bgColorRef.current;
    const size = outputSizeRef.current;
    if (!bg) return;

    let cells;
    if (mode === "brush") {
      cells = brushCellsRef.current;
      if (!cells || cells.length === 0) return;
    } else {
      const data = cellsRef.current;
      if (!data) return;
      // Inject shared params into each cell for unified processing
      cells = data.cells.map(c => ({ ...c, dr: data.dr, op: data.op, sl: data.sl }));
    }

    const quantize = (c) => Math.round(c / 16) * 16;
    const groups = new Map();
    cells.forEach(c => {
      const hex = rgbToHex(quantize(c.r), quantize(c.g), quantize(c.b));
      const key = `${hex}_${c.shape}_${c.dr}_${c.op}_${c.sl}`;
      if (!groups.has(key)) groups.set(key, { hex, shape: c.shape, dr: c.dr, op: c.op, sl: c.sl, cells: [] });
      groups.get(key).cells.push(c);
    });

    // Collect only the brushstroke symbols actually used (keyed by brushIdx + dr)
    const usedBrushSymbols = new Set();
    cells.forEach(c => {
      if (c.shape === "brushstroke") {
        usedBrushSymbols.add(`${c.brushIdx % BRUSHSTROKE_PATHS.length}_${c.dr}`);
      }
    });

    const symbols = [];
    usedBrushSymbols.forEach(key => {
      const [idxStr, drStr] = key.split("_");
      const idx = Number(idxStr);
      const dr = Number(drStr);
      symbols.push(`<symbol id="b${idx}_r${dr}"><path d="${BRUSHSTROKE_PATHS[idx]}" transform="scale(${4 * dr}, ${10 * dr})"/></symbol>`);
    });

    const pathElements = [];
    groups.forEach(({ hex, shape, dr, op, sl, cells: groupCells }) => {
      if (shape === "square" || shape === "triangle" || shape === "line") {
        const d = groupCells.map(c => {
          const cos = Math.cos(c.rotation || 0), sin = Math.sin(c.rotation || 0);
          const p = (dx, dy) => {
            return `${Math.round(c.x + dx * cos - dy * sin)},${Math.round(c.y + dx * sin + dy * cos)}`;
          };
          if (shape === "square") return `M${p(-dr, -dr)}L${p(dr, -dr)}L${p(dr, dr)}L${p(-dr, dr)}Z`;
          if (shape === "triangle") {
            const h = dr * Math.sqrt(3);
            return `M${p(0, -dr)}L${p(-h / 2, dr)}L${p(h / 2, dr)}Z`;
          }
          if (shape === "line") {
            const lw = dr * sl, lh = dr * 0.3;
            return `M${p(-lw, -lh)}L${p(lw, -lh)}L${p(lw, lh)}L${p(-lw, lh)}Z`;
          }
          return "";
        }).join("");
        pathElements.push(`<path fill="${hex}" fill-opacity="${op}" d="${d}"/>`);
      } else if (shape === "circle") {
        const circles = groupCells.map(c => `<circle cx="${Math.round(c.x)}" cy="${Math.round(c.y)}" r="${dr}"/>`).join("");
        pathElements.push(`<g fill="${hex}" fill-opacity="${op}">${circles}</g>`);
      } else if (shape === "brushstroke") {
        const brush = groupCells.map(c => {
          const x = Math.round(c.x), y = Math.round(c.y);
          const rot = c.rotation ? (c.rotation * 180 / Math.PI).toFixed(0) : 0;
          const sid = `b${c.brushIdx % BRUSHSTROKE_PATHS.length}_r${dr}`;
          return `<use href="#${sid}" transform="translate(${x},${y})${rot !== "0" ? ` rotate(${rot})` : ""}"/>`;
        }).join("");
        pathElements.push(`<g fill="${hex}" fill-opacity="${op}">${brush}</g>`);
      }
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">
<defs>${symbols.join("")}</defs>
<rect width="${size.w}" height="${size.h}" fill="${bg}"/>
${pathElements.join("")}</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "pointillist.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [mode, brushCellsRef, bgColorRef]);

  // Called by DownloadModal on confirm
  const handleModalApply = useCallback(async ({ w, h, cropOffset: newCrop, format }) => {
    const scaleFactor = Math.sqrt((w * h) / (outputSize.w * outputSize.h));
    const newDotRadius = Math.round(Math.max(1, Math.min(100, dotRadius * scaleFactor)));
    const newSpacing   = Math.round(Math.max(1, Math.min(100, spacing   * scaleFactor)));
    const newJitter    = Math.round(Math.max(0, Math.min(20,  jitter    * scaleFactor)));

    setDotRadius(newDotRadius);
    setSpacing(newSpacing);
    setJitter(newJitter);
    setOutputSize({ w, h });
    setCropOffset(newCrop);

    if (srcImgRef.current) {
      if (mode === "brush") {
        // Scale existing cells to the new canvas size
        const scaleX = w / outputSize.w;
        const scaleY = h / outputSize.h;
        const drScale = Math.sqrt(scaleX * scaleY);
        brushCellsRef.current = brushCellsRef.current.map(c => ({
          ...c,
          x: c.x * scaleX,
          y: c.y * scaleY,
          dr: Math.max(1, Math.round(c.dr * drScale)),
        }));
        // Set up canvases at new size (clears paint layer), then redraw scaled cells
        setupBrushCanvases(srcImgRef.current, w, h, newCrop.x, newCrop.y);
        if (brushCellsRef.current.length > 0) {
          const paintCanvas = paintLayerRef.current;
          if (paintCanvas) {
            const ctx = paintCanvas.getContext("2d");
            for (const c of brushCellsRef.current) {
              ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.op})`;
              drawShape(ctx, c.shape, c.x, c.y, c.dr, c.rotation, c.sl, c.brushIdx);
            }
            compositeBrushCanvas();
          }
        }
        setHasResult(true);
      } else {
        await renderWithParams({
          ...getCurrentParams(),
          outputW: w, outputH: h,
          cropX: newCrop.x, cropY: newCrop.y,
          dotRadius: newDotRadius, spacing: newSpacing, jitter: newJitter,
        });
      }
    }

    if (format === "svg") handleDownloadSVG();
    else handleDownloadPNG();
  }, [mode, outputSize, dotRadius, spacing, jitter, renderWithParams, getCurrentParams, setupBrushCanvases, compositeBrushCanvas, paintLayerRef, brushCellsRef, handleDownloadPNG, handleDownloadSVG]);

  return (
    <div className="playground-page">
      <div className="brush-cursor" ref={cursorRef} />
      <h2>{t("playground.title")}</h2>
      <p className="playground-description">{t("playground.description")}</p>
      <div className="playground-body">
        <div className="playground-controls">
          <div className="playground-mode-toggle">
            <button
              type="button"
              className={`playground-btn playground-mode-btn${mode === "auto" ? " active" : ""}`}
              onClick={() => switchMode("auto")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/></svg>
              {t("playground.mode.auto")}
            </button>
            <button
              type="button"
              className={`playground-btn playground-mode-btn${mode === "brush" ? " active" : ""}`}
              onClick={() => switchMode("brush")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>
              {t("playground.mode.brush")}
            </button>
          </div>
          <div className="playground-image-sources">
            <label className="playground-btn playground-upload-btn" role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
              {t("playground.upload")}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} hidden />
            </label>
            {bgPics.length > 0 && (
              <>
                <p className="playground-gallery-label" id="gallery-label">{t("playground.gallery")}</p>
                <div className="playground-gallery" role="group" aria-labelledby="gallery-label">
                  {bgPics.map((src, i) => (
                    <button key={src} type="button" className={`playground-thumb${selectedSrc === src ? " active" : ""}`}
                      onClick={() => selectImage(src)} aria-label={t("playground.galleryImg").replace("{index}", i + 1)} aria-pressed={selectedSrc === src}>
                      <img src={src} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button type="button" className="playground-btn playground-randomize-btn" onClick={handleRandomize}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            {t("playground.randomize")}
          </button>
          <div className="playground-sliders">
            <label className="slider-full">
              <span>{t("playground.shape")}:</span>
              <select value={shape} onChange={(e) => {
                const newShape = e.target.value;
                setShape(newShape);
                if (mode === "auto" && srcImgRef.current) renderWithParams({ ...getCurrentParams(), shape: newShape });
              }}>
                {SHAPES.map((s) => (
                  <option key={s} value={s}>{t(`playground.shape.${s}`)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("playground.dotRadius")}: {dotRadius}</span>
              <input type="range" min="1" max="100" value={dotRadius} onChange={(e) => setDotRadius(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
            </label>
            <label>
              <span>{t("playground.spacing")}: {spacing}</span>
              <input type="range" min="1" max="100" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
            </label>
            <label>
              <span>{t("playground.jitter")}: {jitter}</span>
              <input type="range" min="0" max="20" value={jitter} onChange={(e) => setJitter(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
            </label>
            <label>
              <span>{t("playground.opacity")}: {opacity}</span>
              <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
            </label>
            <label className="slider-full">
              <span>{t("playground.rotationJitter")}: {rotationJitter}°</span>
              <input type="range" min="0" max="180" value={rotationJitter} onChange={(e) => setRotationJitter(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
            </label>
            {shape === "line" && (
              <label className="slider-full">
                <span>{t("playground.strokeLength")}: {strokeLength}</span>
                <input type="range" min="1" max="5" step="0.5" value={strokeLength} onChange={(e) => setStrokeLength(Number(e.target.value))} onPointerUp={handleSliderRelease} onKeyUp={handleSliderRelease} />
              </label>
            )}
          </div>
          {mode === "brush" && (
            <div className="playground-brush-controls">
              <div className="playground-tool-toggle">
                <button
                  type="button"
                  className={`playground-btn playground-tool-btn${brushTool === "paint" ? " active" : ""}`}
                  onClick={() => setBrushTool("paint")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  {t("playground.tool.paint")}
                </button>
                <button
                  type="button"
                  className={`playground-btn playground-tool-btn${brushTool === "erase" ? " active" : ""}`}
                  onClick={() => setBrushTool("erase")}
                >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.17,6.29l-4.70,-4.71c-1.56,-1.56,-3.50,-0.54,-4.04,0l-13.59,13.59c-1.11,1.11,-1.11,2.92,0,4.04l3.83,3.83c0.12,0.12,0.29,0.19,0.47,0.19h4.84c0.17,0,0.34,-0.07,0.47,-0.19l12.72,-12.72C24.28,9.22,24.28,7.41,23.17,6.29z M9.70,21.91h-4.28l-3.64,-3.64c-0.60,-0.60,-0.60,-1.56,0,-2.15l3.18,-3.18l6.85,6.85L9.70,21.91z M22.22,9.39l-9.46,9.46L5.91,12.00l9.46,-9.46c0.29,-0.29,1.28,-0.87,2.15,0l4.70,4.70C22.81,7.83,22.81,8.80,22.22,9.39z"/></svg>
                  {t("playground.tool.erase")}
                </button>
              </div>
              {brushTool === "paint" ? (
                <label>
                  <span>{t("playground.brushRadius")}: {brushRadius}</span>
                  <input type="range" min="10" max="200" value={brushRadius} onChange={(e) => setBrushRadius(Number(e.target.value))} />
                </label>
              ) : (
                <label>
                  <span>{t("playground.eraserRadius")}: {eraserRadius}</span>
                  <input type="range" min="5" max="200" value={eraserRadius} onChange={(e) => setEraserRadius(Number(e.target.value))} />
                </label>
              )}
            </div>
          )}
          <div className="playground-bottom-actions">
            <button type="button" className="playground-btn playground-download-btn" onClick={() => setSizeModalOpen(true)} disabled={!hasResult}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              {t("playground.download")}
            </button>
            {mode === "brush" && (
              <button
                type="button"
                className="playground-btn playground-download-btn"
                onClick={handleClearBrush}
                disabled={!hasResult}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                {t("playground.clear")}
              </button>
            )}
          </div>
        </div>
        <div className="playground-preview" ref={previewRef}>
          <p className="playground-processing" aria-live="polite">{processing ? t("playground.processing") : ""}</p>
          <div className="playground-canvas-overlay">
            <button
              type="button"
              className="playground-btn playground-icon-btn"
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={isFullscreen ? t("playground.exitFullscreen") : t("playground.fullscreen")}
              title={isFullscreen ? t("playground.exitFullscreen") : t("playground.fullscreen")}
            >
              {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              )}
            </button>
            {mode === "brush" && (
              <button
                type="button"
                className="playground-btn playground-icon-btn"
                onClick={() => { const newVal = !showGuide; setShowGuide(newVal); toggleShowGuide(newVal); }}
                aria-label={showGuide ? t("playground.hideGuide") : t("playground.showGuide")}
                title={showGuide ? t("playground.hideGuide") : t("playground.showGuide")}
              >
                {showGuide ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                )}
              </button>
            )}
          </div>
          {hasResult && (
            <div className="playground-zoom-controls">
              <button type="button" className="playground-btn" onClick={() => zoomTo(Math.max(0.25, canvasZoomRef.current / 1.25))} aria-label="Zoom out" title="Zoom out">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>
              </button>
              <button type="button" className="playground-btn playground-zoom-level" onClick={() => zoomTo(1)} title="Reset zoom">
                {Math.round(canvasZoom * 100)}%
              </button>
              <button type="button" className="playground-btn" onClick={() => zoomTo(Math.min(8, canvasZoomRef.current * 1.25))} aria-label="Zoom in" title="Zoom in">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm2.5-4h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
              </button>
            </div>
          )}
          <div
            className="canvas-viewport"
            ref={canvasViewportRef}
            onDoubleClick={() => zoomTo(1)}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={t("playground.canvasAlt")}
              style={hasResult ? canvasZoomStyle : { display: "none" }}
              className={mode === "brush" ? "brush-mode" : undefined}
              onPointerDown={mode === "brush" ? startSpray : undefined}
              onPointerMove={mode === "brush" ? (e) => { updateSpray(e); drawCursor(e); } : undefined}
              onPointerUp={mode === "brush" ? stopSpray : undefined}
              onPointerCancel={mode === "brush" ? stopSpray : undefined}
              onPointerLeave={mode === "brush" ? hideCursor : undefined}
            />
            {!hasResult && (
              <div className="playground-placeholder">
                <p>{t("playground.placeholder")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <DownloadModal
        isOpen={sizeModalOpen}
        onClose={() => setSizeModalOpen(false)}
        onApply={handleModalApply}
        canvasRef={canvasRef}
        srcImgRef={srcImgRef}
        initialW={outputSize.w}
        initialH={outputSize.h}
        initialCrop={cropOffset}
        mode={mode}
        t={t}
      />
    </div>
  );
}
