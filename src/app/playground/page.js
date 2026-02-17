"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAnimation } from "../../context/AnimationContext";
import "./playground.scss";

const DEFAULTS = { dotRadius: 16, spacing: 15, jitter: 6, opacity: 0.7, outputWidth: 800, shape: "circle", strokeLength: 2, rotationJitter: 0 };
const OUTPUT_SIZES = [400, 600, 800, 1200, 1600, 2000];
const SHAPES = ["circle", "square", "triangle", "line", "brushstroke", "mixed"];
const MIXED_SHAPES = ["circle", "square", "triangle", "brushstroke"];

// Brushstroke path data — simple tapered silhouettes normalized to ~(-0.5, -0.5) to (0.5, 0.5)
const BRUSHSTROKE_PATHS = [
  // Tapered ellipse — fat middle, thin ends
  "M-0.5,0 C-0.4,-0.25 -0.1,-0.35 0.1,-0.3 C0.3,-0.25 0.45,-0.1 0.5,0 C0.45,0.1 0.3,0.25 0.1,0.3 C-0.1,0.35 -0.4,0.25 -0.5,0Z",
  // Comma stroke — thick head tapering to a curve
  "M-0.15,-0.4 C0.15,-0.4 0.35,-0.25 0.35,-0.05 C0.35,0.1 0.2,0.2 0.05,0.35 C-0.02,0.42 -0.1,0.45 -0.15,0.4 C-0.1,0.3 0.0,0.15 0.1,0.0 C0.15,-0.1 0.1,-0.2 -0.05,-0.2 C-0.15,-0.2 -0.25,-0.15 -0.3,-0.05 C-0.35,0.05 -0.4,-0.15 -0.15,-0.4Z",
  // Broad sweep — wide arc
  "M-0.5,-0.1 C-0.3,-0.35 0.0,-0.4 0.3,-0.3 C0.45,-0.25 0.5,-0.1 0.5,0.0 C0.5,0.1 0.4,0.2 0.25,0.25 C0.0,0.3 -0.3,0.25 -0.45,0.15 C-0.5,0.1 -0.5,0.0 -0.5,-0.1Z",
];

// Pre-create Path2D objects (lazily, since Path2D isn't available at module scope in SSR)
let brushstrokePath2Ds = null;
function getBrushstrokePaths() {
  if (!brushstrokePath2Ds) {
    brushstrokePath2Ds = BRUSHSTROKE_PATHS.map((d) => new Path2D(d));
  }
  return brushstrokePath2Ds;
}

// Draw a single shape on canvas
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
      const h = dr * Math.sqrt(3);
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
      ctx.scale(dr * 2, dr * 2);
      ctx.fill(paths[brushIdx % paths.length]);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// Generate SVG element string for a single shape
function shapeToSVG(shape, x, y, dr, rotation, op, r, g, b, strokeLen, brushIdx) {
  const fill = `rgba(${r},${g},${b},${op})`;
  const rotDeg = rotation ? (rotation * 180 / Math.PI).toFixed(1) : 0;
  const transform = rotation ? ` transform="rotate(${rotDeg},${x.toFixed(1)},${y.toFixed(1)})"` : "";

  switch (shape) {
    case "circle":
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dr}" fill="${fill}"/>`;
    case "square":
      return `<rect x="${(x - dr).toFixed(1)}" y="${(y - dr).toFixed(1)}" width="${(2 * dr).toFixed(1)}" height="${(2 * dr).toFixed(1)}" fill="${fill}"${transform}/>`;
    case "triangle": {
      const h = dr * Math.sqrt(3);
      const p1 = `${x.toFixed(1)},${(y - dr).toFixed(1)}`;
      const p2 = `${(x - h / 2).toFixed(1)},${(y + dr).toFixed(1)}`;
      const p3 = `${(x + h / 2).toFixed(1)},${(y + dr).toFixed(1)}`;
      return `<polygon points="${p1} ${p2} ${p3}" fill="${fill}"${transform}/>`;
    }
    case "line": {
      const lw = dr * strokeLen;
      const lh = dr * 0.3;
      return `<rect x="${(x - lw).toFixed(1)}" y="${(y - lh).toFixed(1)}" width="${(2 * lw).toFixed(1)}" height="${(2 * lh).toFixed(1)}" fill="${fill}"${transform}/>`;
    }
    case "brushstroke": {
      const s = dr * 2;
      const d = BRUSHSTROKE_PATHS[brushIdx % BRUSHSTROKE_PATHS.length];
      return `<path d="${d}" fill="${fill}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rotDeg}) scale(${s.toFixed(1)})"/>`;
    }
    default:
      return "";
  }
}

export default function Playground() {
  const { t } = useLanguage();
  const { globalPlaying, setGlobalPlaying } = useAnimation();
  const prevPlayingRef = useRef(globalPlaying);
  const canvasRef = useRef(null);
  const wasmRef = useRef(null);
  const fileInputRef = useRef(null);
  const srcImgRef = useRef(null);
  const cellsRef = useRef(null);
  const bgColorRef = useRef(null);
  const outputSizeRef = useRef({ w: 0, h: 0 });

  // Pause background animation on mount, restore on unmount
  useEffect(() => {
    prevPlayingRef.current = globalPlaying;
    setGlobalPlaying(false);
    return () => setGlobalPlaying(prevPlayingRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [dotRadius, setDotRadius] = useState(DEFAULTS.dotRadius);
  const [spacing, setSpacing] = useState(DEFAULTS.spacing);
  const [jitter, setJitter] = useState(DEFAULTS.jitter);
  const [opacity, setOpacity] = useState(DEFAULTS.opacity);
  const [outputWidth, setOutputWidth] = useState(DEFAULTS.outputWidth);
  const [shape, setShape] = useState(DEFAULTS.shape);
  const [strokeLength, setStrokeLength] = useState(DEFAULTS.strokeLength);
  const [rotationJitter, setRotationJitter] = useState(DEFAULTS.rotationJitter);
  const [bgPics, setBgPics] = useState([]);
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [hasResult, setHasResult] = useState(false);

  // Fetch available bg_pics on mount
  useEffect(() => {
    fetch("/api/bg-pics")
      .then((res) => res.json())
      .then(setBgPics)
      .catch(() => {});
  }, []);

  // Load Wasm module once
  const loadWasm = useCallback(async () => {
    if (wasmRef.current) return wasmRef.current;
    const imports = {
      env: {
        abort: () => console.log("Abort!"),
        log: (val) => console.log("WASM Log:", val),
      },
    };
    const response = await fetch("/blur.wasm");
    const module = await WebAssembly.instantiateStreaming(response, imports);
    wasmRef.current = module.instance.exports;
    return wasmRef.current;
  }, []);

  // Core render: takes explicit params to avoid stale closure issues
  const renderWithParams = useCallback(async (params) => {
    const img = srcImgRef.current;
    if (!img) return;

    const {
      dotRadius: dr, spacing: sp, jitter: jt, opacity: op, outputWidth: ow,
      shape: sh, strokeLength: sl, rotationJitter: rj,
    } = params;

    setProcessing(true);

    // Compute output dimensions preserving aspect ratio
    const aspect = img.naturalHeight / img.naturalWidth;
    const w = ow;
    const h = Math.round(ow * aspect);

    // Sample the image at output size
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(img, 0, 0, w, h);
    const imageData = offCtx.getImageData(0, 0, w, h);

    // Load Wasm and process
    const wasm = await loadWasm();
    const byteCount = w * h * 4;
    const cols = Math.ceil(w / sp);
    const rows = Math.ceil(h / sp);
    const maxCells = cols * rows;
    const requiredBytes = byteCount + maxCells * 20;
    const memory = wasm.memory;

    if (requiredBytes > memory.buffer.byteLength) {
      const pagesToGrow = Math.ceil(
        (requiredBytes - memory.buffer.byteLength) / (64 * 1024)
      );
      memory.grow(pagesToGrow);
    }

    const inputView = new Uint8ClampedArray(memory.buffer, 0, byteCount);
    inputView.set(imageData.data);

    const cellCount = wasm.computeCells(w, h, sp);
    const cellData = new Int32Array(memory.buffer, byteCount, cellCount * 5);
    const rotJitterRad = (rj * Math.PI) / 180;
    const cells = [];
    for (let i = 0; i < cellCount; i++) {
      const base = i * 5;
      const cellShape = sh === "mixed" ? MIXED_SHAPES[Math.floor(Math.random() * MIXED_SHAPES.length)] : sh;
      cells.push({
        x: cellData[base] + (Math.random() - 0.5) * 2 * jt,
        y: cellData[base + 1] + (Math.random() - 0.5) * 2 * jt,
        r: cellData[base + 2],
        g: cellData[base + 3],
        b: cellData[base + 4],
        rotation: (Math.random() - 0.5) * 2 * rotJitterRad,
        shape: cellShape,
        brushIdx: Math.floor(Math.random() * BRUSHSTROKE_PATHS.length),
      });
    }

    // Compute background color
    let totalR = 0, totalG = 0, totalB = 0;
    for (const c of cells) { totalR += c.r; totalG += c.g; totalB += c.b; }
    const n = cells.length || 1;
    const avgR = totalR / n, avgG = totalG / n, avgB = totalB / n;
    const bgR = Math.round(avgR + (255 - avgR) * 0.85);
    const bgG = Math.round(avgG + (255 - avgG) * 0.85);
    const bgB = Math.round(avgB + (255 - avgB) * 0.85);
    const bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

    // Store for SVG export
    cellsRef.current = { cells, dr, op, sh, sl };
    bgColorRef.current = bgColor;
    outputSizeRef.current = { w, h };

    // Draw to canvas
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

  // Helper to get current params
  const getCurrentParams = useCallback(() => ({
    dotRadius, spacing, jitter, opacity, outputWidth, shape, strokeLength, rotationJitter,
  }), [dotRadius, spacing, jitter, opacity, outputWidth, shape, strokeLength, rotationJitter]);

  // Render on slider/size release
  const handleSliderRelease = useCallback(() => {
    if (srcImgRef.current) renderWithParams(getCurrentParams());
  }, [renderWithParams, getCurrentParams]);

  // Handle image selection (gallery or upload)
  const selectImage = useCallback(async (src) => {
    setSelectedSrc(src);
    setProcessing(true);

    const img = new Image();
    img.src = src;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    srcImgRef.current = img;
    await renderWithParams(getCurrentParams());
  }, [renderWithParams, getCurrentParams]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    selectImage(url);
  }, [selectImage]);

  const handleDownloadPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "pointillist.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  const handleDownloadSVG = useCallback(() => {
    const data = cellsRef.current;
    const bg = bgColorRef.current;
    const size = outputSizeRef.current;
    if (!data || !bg) return;

    const { cells, dr, op, sl } = data;
    const elements = cells.map((c) =>
      shapeToSVG(c.shape, c.x, c.y, dr, c.rotation, op, c.r, c.g, c.b, sl, c.brushIdx)
    ).join("\n  ");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">
  <rect width="${size.w}" height="${size.h}" fill="${bg}"/>
  ${elements}
</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "pointillist.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="playground-page">
      <h2>{t("playground.title")}</h2>
      <p className="playground-description">{t("playground.description")}</p>

      <div className="playground-body">
      <div className="playground-controls">
        <div className="playground-image-sources">
          <label className="playground-upload-btn" role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}>
            {t("playground.upload")}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              hidden
            />
          </label>

          {bgPics.length > 0 && (
            <>
              <p className="playground-gallery-label" id="gallery-label">{t("playground.gallery")}</p>
              <div className="playground-gallery" role="group" aria-labelledby="gallery-label">
                {bgPics.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={`playground-thumb${selectedSrc === src ? " active" : ""}`}
                    onClick={() => selectImage(src)}
                    aria-label={t("playground.galleryImg").replace("{index}", i + 1)}
                    aria-pressed={selectedSrc === src}
                  >
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="playground-sliders">
          <label>
            {t("playground.shape")}:
            <select value={shape} onChange={(e) => {
              const newShape = e.target.value;
              setShape(newShape);
              if (srcImgRef.current) renderWithParams({ ...getCurrentParams(), shape: newShape });
            }}>
              {SHAPES.map((s) => (
                <option key={s} value={s}>{t(`playground.shape.${s}`)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("playground.outputWidth")}:
            <select value={outputWidth} onChange={(e) => {
              const newWidth = Number(e.target.value);
              setOutputWidth(newWidth);
              if (srcImgRef.current) renderWithParams({ ...getCurrentParams(), outputWidth: newWidth });
            }}>
              {OUTPUT_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </label>
          <label>
            {t("playground.dotRadius")}: {dotRadius}
            <input type="range" min="4" max="40" value={dotRadius}
              onChange={(e) => setDotRadius(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease} />
          </label>
          <label>
            {t("playground.spacing")}: {spacing}
            <input type="range" min="4" max="40" value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease} />
          </label>
          <label>
            {t("playground.jitter")}: {jitter}
            <input type="range" min="0" max="20" value={jitter}
              onChange={(e) => setJitter(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease} />
          </label>
          <label>
            {t("playground.opacity")}: {opacity}
            <input type="range" min="0.1" max="1" step="0.05" value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease} />
          </label>
          <label>
            {t("playground.rotationJitter")}: {rotationJitter}°
            <input type="range" min="0" max="180" value={rotationJitter}
              onChange={(e) => setRotationJitter(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease} />
          </label>
          {shape === "line" && (
            <label>
              {t("playground.strokeLength")}: {strokeLength}
              <input type="range" min="1" max="5" step="0.5" value={strokeLength}
                onChange={(e) => setStrokeLength(Number(e.target.value))}
                onPointerUp={handleSliderRelease}
                onKeyUp={handleSliderRelease} />
            </label>
          )}
        </div>

        <div className="playground-download-row">
          <button type="button" className="playground-download-btn"
            onClick={handleDownloadPNG} disabled={!hasResult}>
            {t("playground.download")} (PNG)
          </button>
          <button type="button" className="playground-download-btn"
            onClick={handleDownloadSVG} disabled={!hasResult}>
            {t("playground.download")} (SVG)
          </button>
        </div>
      </div>

      <div className="playground-preview">
        <p className="playground-processing" aria-live="polite">
          {processing ? t("playground.processing") : ""}
        </p>
        <canvas ref={canvasRef} role="img" aria-label={t("playground.canvasAlt")}
          style={hasResult ? undefined : { display: "none" }} />
        {!hasResult && (
          <div className="playground-placeholder">
            <p>{t("playground.placeholder")}</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
