"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAnimation } from "../../context/AnimationContext";
import "./playground.scss";

const DEFAULTS = { dotRadius: 16, spacing: 15, jitter: 6, opacity: 0.7, outputW: 800, outputH: 600, cropX: 0, cropY: 0, shape: "circle", strokeLength: 2, rotationJitter: 0 };
const SHAPES = ["circle", "square", "triangle", "line", "brushstroke", "mixed"];
const MIXED_SHAPES = ["circle", "square", "triangle", "brushstroke"];

const BRUSHSTROKE_PATHS = [
  "M-0.417,-0.042 Q0,-0.083 0.375,-0.042 L0.333,0.083 Q-0.042,0.125 -0.458,0.083 Z",
  "M-0.458,-0.067 Q0,-0.125 0.417,-0.067 L0.4,0 Q-0.017,-0.058 -0.475,0 Z",
  "M-0.375,0.042 Q0.042,0.1 0.333,0.042 L0.317,0.125 Q0.025,0.183 -0.392,0.125 Z"
];

const SQRT_THREE = Math.sqrt(3);

let brushstrokePath2Ds = null;
function getBrushstrokePaths() {
  if (!brushstrokePath2Ds) brushstrokePath2Ds = BRUSHSTROKE_PATHS.map((d) => new Path2D(d));
  return brushstrokePath2Ds;
}

function drawShape(ctx, shape, x, y, dr, rotation, strokeLen, brushIdx) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, dr, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case "square":
      ctx.fillRect(-dr, -dr, 2 * dr, 2 * dr);
      break;
    case "triangle": {
      const h = dr * SQRT_THREE;
      ctx.beginPath();
      ctx.moveTo(0, -dr);
      ctx.lineTo(-h / 2, dr);
      ctx.lineTo(h / 2, dr);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "line":
      ctx.fillRect(-dr * strokeLen, -dr * 0.3, 2 * dr * strokeLen, dr * 0.6);
      break;
    case "brushstroke": {
      const paths = getBrushstrokePaths();
      ctx.scale(4 * dr, 10 * dr);
      ctx.fill(paths[brushIdx % paths.length]);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const PREVIEW_MAX = 300;

export default function Playground() {
  const { t } = useLanguage();
  const { globalPlaying, setGlobalPlaying, isFullscreen, setIsFullscreen } = useAnimation();
  const prevPlayingRef = useRef(globalPlaying);
  const canvasRef = useRef(null);
  const wasmRef = useRef(null);
  const fileInputRef = useRef(null);
  const srcImgRef = useRef(null);
  const cellsRef = useRef(null);
  const bgColorRef = useRef(null);
  const outputSizeRef = useRef({ w: 0, h: 0 });
  const panDragRef = useRef(null);
  const previewRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const canvasFitSizeRef = useRef({ w: 0, h: 0 });
  const canvasZoomRef = useRef(1);
  const pendingScrollRef = useRef(null);
  const spaceDownRef = useRef(false);

  // Brush mode refs
  const paintLayerRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const brushCellsRef = useRef([]);
  const isSprayingRef = useRef(false);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const sprayRAFRef = useRef(null);
  // Holds current slider/tool values for use inside brushTick RAF loop (avoids stale closures)
  const brushParamsRef = useRef({
    brushRadius: 50,
    dotRadius: DEFAULTS.dotRadius,
    opacity: DEFAULTS.opacity,
    jitter: DEFAULTS.jitter,
    rotationJitter: DEFAULTS.rotationJitter,
    shape: DEFAULTS.shape,
    strokeLength: DEFAULTS.strokeLength,
    brushTool: "paint",
    eraserRadius: 30,
  });
  const showGuideRef = useRef(true);

  useEffect(() => {
    prevPlayingRef.current = globalPlaying;
    setGlobalPlaying(false);
    return () => {
      setGlobalPlaying(prevPlayingRef.current);
      setIsFullscreen(false);
      isSprayingRef.current = false;
      if (sprayRAFRef.current) cancelAnimationFrame(sprayRAFRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setIsFullscreen]);

  const [dotRadius, setDotRadius] = useState(DEFAULTS.dotRadius);
  const [spacing, setSpacing] = useState(DEFAULTS.spacing);
  const [jitter, setJitter] = useState(DEFAULTS.jitter);
  const [opacity, setOpacity] = useState(DEFAULTS.opacity);
  const [outputSize, setOutputSize] = useState({ w: DEFAULTS.outputW, h: DEFAULTS.outputH });
  const [cropOffset, setCropOffset] = useState({ x: DEFAULTS.cropX, y: DEFAULTS.cropY });
  const [shape, setShape] = useState(DEFAULTS.shape);
  const [strokeLength, setStrokeLength] = useState(DEFAULTS.strokeLength);
  const [rotationJitter, setRotationJitter] = useState(DEFAULTS.rotationJitter);
  const [bgPics, setBgPics] = useState([]);
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [mode, setMode] = useState("auto");
  const [brushRadius, setBrushRadius] = useState(50);
  const [brushTool, setBrushTool] = useState("paint"); // "paint" | "erase"
  const [eraserRadius, setEraserRadius] = useState(30);
  const [showGuide, setShowGuide] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(1);

  // Sync refs with current state on every render (avoids stale closures in RAF loop / event handlers)
  brushParamsRef.current = { brushRadius, dotRadius, opacity, jitter, rotationJitter, shape, strokeLength, brushTool, eraserRadius };
  showGuideRef.current = showGuide;
  canvasZoomRef.current = canvasZoom;

  // Size modal state
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [modalW, setModalW] = useState(DEFAULTS.outputW);
  const [modalH, setModalH] = useState(DEFAULTS.outputH);
  const [modalLock, setModalLock] = useState(true);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [rawW, setRawW] = useState(String(DEFAULTS.outputW));
  const [rawH, setRawH] = useState(String(DEFAULTS.outputH));
  const [canvasDataUrl, setCanvasDataUrl] = useState(null);
  const [downloadFormat, setDownloadFormat] = useState("png");

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

  // Apply pending scroll after zoom re-render so the pivot point stays under cursor/center
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

  // Measure the canvas's CSS display size when zoom is at 1 (after content renders)
  useEffect(() => {
    if (!hasResult || canvasZoom !== 1) return;
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        const { width, height } = canvasRef.current.getBoundingClientRect();
        if (width > 0) canvasFitSizeRef.current = { w: width, h: height };
      }
    });
  }, [hasResult, canvasZoom]);

  // Space bar = temporary pan mode (grab cursor, block brush strokes)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== " " || spaceDownRef.current) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      spaceDownRef.current = true;
      if (canvasViewportRef.current) canvasViewportRef.current.style.cursor = "grab";
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      e.preventDefault();
    };
    const onKeyUp = (e) => {
      if (e.key !== " ") return;
      // preventDefault prevents focused buttons (e.g. zoom controls) from activating on keyup
      e.preventDefault();
      spaceDownRef.current = false;
      if (canvasViewportRef.current) canvasViewportRef.current.style.cursor = "";
      if (canvasRef.current) canvasRef.current.style.cursor = "";
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Pan preview computations (used in modal JSX and pointer handlers)
  const previewImg = srcImgRef.current;
  const previewImgW = previewImg?.naturalWidth ?? 1;
  const previewImgH = previewImg?.naturalHeight ?? 1;
  const dispFit = Math.min(1, PREVIEW_MAX / Math.max(modalW, modalH, 1));
  const displayW = Math.round(modalW * dispFit);
  const displayH = Math.round(modalH * dispFit);
  const coverScale = Math.max(modalW / previewImgW, modalH / previewImgH);
  const scaledImgW = previewImgW * coverScale;
  const scaledImgH = previewImgH * coverScale;
  const maxPanX = Math.max(0, scaledImgW - modalW);
  const maxPanY = Math.max(0, scaledImgH - modalH);
  const dispImgW = Math.round(scaledImgW * dispFit);
  const dispImgH = Math.round(scaledImgH * dispFit);
  const dispOffX = Math.round(modalOffset.x * dispFit);
  const dispOffY = Math.round(modalOffset.y * dispFit);
  const canPan = maxPanX > 0 || maxPanY > 0;

  useEffect(() => {
    fetch("data/bgPics.json")
      .then((res) => res.json())
      .then(setBgPics)
      .catch(() => {});
  }, []);

  const loadWasm = useCallback(async () => {
    if (wasmRef.current) return wasmRef.current;
    const response = await fetch("/blur.wasm");
    const module = await WebAssembly.instantiateStreaming(response, {});
    wasmRef.current = module.instance.exports;
    return wasmRef.current;
  }, []);

  // --- Brush mode functions ---

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
  }, []);

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

    // Compute bg color (sample every 8th pixel for speed)
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
  }, [compositeBrushCanvas]);

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
      const srcCtx = srcCanvas.getContext("2d");
      const rotJitterRad = (rj * Math.PI) / 180;
      const shapesPerTick = Math.max(1, Math.ceil(Math.PI * br * br / 3000));

      for (let i = 0; i < shapesPerTick; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const r = br * Math.sqrt(Math.random()); // uniform disk distribution
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        const cx = Math.max(0, Math.min(Math.round(px), w - 1));
        const cy = Math.max(0, Math.min(Math.round(py), h - 1));

        const pixel = srcCtx.getImageData(cx, cy, 1, 1).data;
        const jx = px + (Math.random() - 0.5) * 2 * jt;
        const jy = py + (Math.random() - 0.5) * 2 * jt;
        const rotation = (Math.random() - 0.5) * 2 * rotJitterRad;
        const brushIdx = Math.floor(Math.random() * BRUSHSTROKE_PATHS.length);
        const cellShape = sh === "mixed"
          ? MIXED_SHAPES[Math.floor(Math.random() * MIXED_SHAPES.length)]
          : sh;

        paintCtx.fillStyle = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${op})`;
        drawShape(paintCtx, cellShape, jx, jy, dr, rotation, sl, brushIdx);

        brushCellsRef.current.push({
          x: jx, y: jy, r: pixel[0], g: pixel[1], b: pixel[2],
          rotation, shape: cellShape, brushIdx,
          dr, op, sl,
        });
      }
    }

    compositeBrushCanvas();
    sprayRAFRef.current = requestAnimationFrame(brushTick);
  }, [compositeBrushCanvas]);

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
  }, [brushTick]);

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
  }, []);

  const stopSpray = useCallback(() => {
    isSprayingRef.current = false;
    if (sprayRAFRef.current) {
      cancelAnimationFrame(sprayRAFRef.current);
      sprayRAFRef.current = null;
    }
  }, []);

  // Pan via mouse events on window (more reliable than pointer events in Firefox).
  // mousedown checks el.contains(e.target) so only clicks inside the viewport start a pan.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    let panStart = null;
    const onDown = (e) => {
      if (!spaceDownRef.current) return;
      if (!el.contains(e.target)) return;
      e.preventDefault();
      panStart = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
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
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom to center helper for zoom buttons
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

  const handleClearBrush = useCallback(() => {
    const paintCanvas = paintLayerRef.current;
    if (paintCanvas) {
      paintCanvas.getContext("2d").clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    }
    brushCellsRef.current = [];
    compositeBrushCanvas();
  }, [compositeBrushCanvas]);

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
    setCanvasZoom(1);
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
  }, [setupBrushCanvases, renderWithParams, getCurrentParams]);

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
    setCanvasZoom(1);
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
  }, [mode, renderWithParams, getCurrentParams, setupBrushCanvases]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [mode, bgPics, outputSize, cropOffset, renderWithParams, setupBrushCanvases]); // eslint-disable-line react-hooks/exhaustive-deps

  // Size modal handlers
  const openSizeModal = () => {
    setModalW(outputSize.w);
    setModalH(outputSize.h);
    setRawW(String(outputSize.w));
    setRawH(String(outputSize.h));
    setModalOffset(cropOffset);
    setModalLock(true);
    setCanvasDataUrl(canvasRef.current?.toDataURL() ?? null);
    setDownloadFormat("png");
    setSizeModalOpen(true);
  };

  const applyW = (raw, prevW, prevH) => {
    const val = Math.max(100, Math.min(4000, Math.round(Number(raw)) || 100));
    if (modalLock && prevW > 0) {
      const newH = Math.max(100, Math.min(4000, Math.round(val * prevH / prevW)));
      setModalH(newH);
      setRawH(String(newH));
    }
    setModalW(val);
    setRawW(String(val));
    setModalOffset({ x: 0, y: 0 });
  };

  const applyH = (raw, prevW, prevH) => {
    const val = Math.max(100, Math.min(4000, Math.round(Number(raw)) || 100));
    if (modalLock && prevH > 0) {
      const newW = Math.max(100, Math.min(4000, Math.round(val * prevW / prevH)));
      setModalW(newW);
      setRawW(String(newW));
    }
    setModalH(val);
    setRawH(String(val));
    setModalOffset({ x: 0, y: 0 });
  };

  const handleWChange = (e) => {
    const raw = e.target.value;
    setRawW(raw);
    const num = Math.round(Number(raw));
    if (num >= 100 && num <= 4000) applyW(raw, modalW, modalH);
  };

  const handleHChange = (e) => {
    const raw = e.target.value;
    setRawH(raw);
    const num = Math.round(Number(raw));
    if (num >= 100 && num <= 4000) applyH(raw, modalW, modalH);
  };

  const handleWBlur = () => applyW(rawW, modalW, modalH);
  const handleHBlur = () => applyH(rawH, modalW, modalH);

  const handleToggleLock = (checked) => {
    setModalLock(checked);
    if (checked) setModalOffset({ x: 0, y: 0 });
  };

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
  }, [mode]);

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
  }, [mode]);

  const applySizeModal = useCallback(async () => {
    const newCrop = modalLock ? { x: 0, y: 0 } : modalOffset;

    const scaleFactor = Math.sqrt((modalW * modalH) / (outputSize.w * outputSize.h));
    const newDotRadius = Math.round(Math.max(1, Math.min(100, dotRadius * scaleFactor)));
    const newSpacing   = Math.round(Math.max(1, Math.min(100, spacing   * scaleFactor)));
    const newJitter    = Math.round(Math.max(0, Math.min(20, jitter    * scaleFactor)));

    setDotRadius(newDotRadius);
    setSpacing(newSpacing);
    setJitter(newJitter);
    setOutputSize({ w: modalW, h: modalH });
    setCropOffset(newCrop);
    setSizeModalOpen(false);
    if (srcImgRef.current) {
      if (mode === "brush") {
        // Scale existing cells to the new canvas size
        const scaleX = modalW / outputSize.w;
        const scaleY = modalH / outputSize.h;
        const drScale = Math.sqrt(scaleX * scaleY);
        brushCellsRef.current = brushCellsRef.current.map(c => ({
          ...c,
          x: c.x * scaleX,
          y: c.y * scaleY,
          dr: Math.max(1, Math.round(c.dr * drScale)),
        }));
        // Set up canvases at new size (clears paint layer), then redraw scaled cells
        setupBrushCanvases(srcImgRef.current, modalW, modalH, newCrop.x, newCrop.y);
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
          outputW: modalW, outputH: modalH,
          cropX: newCrop.x, cropY: newCrop.y,
          dotRadius: newDotRadius, spacing: newSpacing, jitter: newJitter,
        });
      }
    }
  }, [mode, modalW, modalH, modalLock, modalOffset, outputSize, dotRadius, spacing, jitter, renderWithParams, getCurrentParams, setupBrushCanvases]);

  const canvasZoomStyle = canvasZoom !== 1 && canvasFitSizeRef.current.w > 0 ? {
    width: Math.round(canvasFitSizeRef.current.w * canvasZoom),
    height: Math.round(canvasFitSizeRef.current.h * canvasZoom),
    maxWidth: "none",
    maxHeight: "none",
  } : undefined;

  const handleDownloadFromModal = useCallback(async () => {
    await applySizeModal();
    if (downloadFormat === "svg") handleDownloadSVG();
    else handleDownloadPNG();
  }, [applySizeModal, downloadFormat, handleDownloadPNG, handleDownloadSVG]);

  return (
    <div className="playground-page">
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>
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
              <div className="playground-brush-actions">
                <button
                  type="button"
                  className="playground-btn playground-icon-btn"
                  onClick={() => { const newVal = !showGuide; showGuideRef.current = newVal; setShowGuide(newVal); compositeBrushCanvas(); }}
                  aria-label={showGuide ? t("playground.hideGuide") : t("playground.showGuide")}
                  title={showGuide ? t("playground.hideGuide") : t("playground.showGuide")}
                >
                  {showGuide ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                  )}
                </button>
                <button
                  type="button"
                  className="playground-btn playground-icon-btn"
                  onClick={handleClearBrush}
                  disabled={!hasResult}
                  aria-label={t("playground.clear")}
                  title={t("playground.clear")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
              </div>
            </div>
          )}
          <button type="button" className="playground-btn playground-download-btn" onClick={openSizeModal} disabled={!hasResult}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            {t("playground.download")}
          </button>
        </div>
        <div className="playground-preview" ref={previewRef}>
          <button
            type="button"
            className="playground-btn playground-fullscreen-btn"
            onClick={() => setIsFullscreen((f) => !f)}
            aria-label={isFullscreen ? t("playground.exitFullscreen") : t("playground.fullscreen")}
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
          <p className="playground-processing" aria-live="polite">{processing ? t("playground.processing") : ""}</p>
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
              onPointerMove={mode === "brush" ? updateSpray : undefined}
              onPointerUp={mode === "brush" ? stopSpray : undefined}
              onPointerCancel={mode === "brush" ? stopSpray : undefined}
            />
            {!hasResult && (
              <div className="playground-placeholder">
                <p>{t("playground.placeholder")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {sizeModalOpen && (
        <div className="modal-overlay" onClick={() => setSizeModalOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>{t("playground.download")}</h3>
            <div className="size-inputs">
              <label>
                W
                <div className="size-input-row">
                  <input type="number" min="100" max="4000" value={rawW}
                    onChange={handleWChange}
                    onBlur={handleWBlur} />
                  <span>px</span>
                </div>
              </label>
              <label>
                H
                <div className="size-input-row">
                  <input type="number" min="100" max="4000" value={rawH}
                    onChange={handleHChange}
                    onBlur={handleHBlur} />
                  <span>px</span>
                </div>
              </label>
            </div>
            <label className="size-lock">
              <input type="checkbox" checked={modalLock} onChange={(e) => handleToggleLock(e.target.checked)} />
              {t("playground.lockAspect")}
            </label>
            {!modalLock && canvasDataUrl && (
              <div className="pan-section">
                <p className="pan-label">{t("playground.pan")}</p>
                <div
                  className="pan-preview"
                  style={{ width: displayW, height: displayH, cursor: canPan ? "grab" : "default" }}
                  onPointerDown={(e) => {
                    if (!canPan) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    panDragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: modalOffset.x, startOffY: modalOffset.y };
                  }}
                  onPointerMove={(e) => {
                    if (!panDragRef.current) return;
                    const { startX, startY, startOffX, startOffY } = panDragRef.current;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    setModalOffset({
                      x: Math.max(0, Math.min(startOffX - dx / dispFit, maxPanX)),
                      y: Math.max(0, Math.min(startOffY - dy / dispFit, maxPanY)),
                    });
                  }}
                  onPointerUp={() => { panDragRef.current = null; }}
                  onPointerCancel={() => { panDragRef.current = null; }}
                >
                  <img
                    src={canvasDataUrl}
                    style={{
                      position: "absolute",
                      width: dispImgW,
                      height: dispImgH,
                      top: -dispOffY,
                      left: -dispOffX,
                    }}
                    draggable={false}
                    alt=""
                  />
                </div>
              </div>
            )}
            {mode !== "brush" && (
              <div className="playground-tool-toggle download-format-toggle">
                <button
                  type="button"
                  className={`playground-btn playground-tool-btn${downloadFormat === "png" ? " active" : ""}`}
                  onClick={() => setDownloadFormat("png")}
                >PNG</button>
                <button
                  type="button"
                  className={`playground-btn playground-tool-btn${downloadFormat === "svg" ? " active" : ""}`}
                  onClick={() => setDownloadFormat("svg")}
                >SVG</button>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="playground-btn" onClick={() => setSizeModalOpen(false)}>
                {t("playground.cancel")}
              </button>
              <button type="button" className="playground-btn" onClick={handleDownloadFromModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                {t("playground.download")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
