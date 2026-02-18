"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAnimation } from "../../context/AnimationContext";
import "./playground.scss";

const DEFAULTS = { dotRadius: 16, spacing: 15, jitter: 6, opacity: 0.7, outputWidth: 800, shape: "circle", strokeLength: 2, rotationJitter: 0 };
const OUTPUT_SIZES = [400, 600, 800, 1200, 1600, 2000];
const SHAPES = ["circle", "square", "triangle", "line", "brushstroke", "mixed"];
const MIXED_SHAPES = ["circle", "square", "triangle", "brushstroke"];

// Brushstroke path data — wider, irregular silhouettes normalized to ~(-0.5, -0.5) to (0.5, 0.5)
// Inspired by watercolor stroke shapes: wide aspect ratio, tapered ends, uneven edges
const BRUSHSTROKE_PATHS = [
  // Wide tapered stroke — thick center, thin ragged ends, uneven top/bottom edges
  "M-0.5,0.02 C-0.45,-0.04 -0.38,-0.12 -0.28,-0.18 C-0.18,-0.22 -0.06,-0.24 0.05,-0.22 C0.16,-0.2 0.28,-0.15 0.38,-0.1 C0.44,-0.06 0.48,-0.02 0.5,0.01 C0.48,0.06 0.42,0.12 0.35,0.17 C0.24,0.22 0.1,0.24 -0.04,0.23 C-0.16,0.21 -0.3,0.16 -0.4,0.1 C-0.46,0.06 -0.5,0.04 -0.5,0.02Z",
  // Dry-brush drag — long, thin, with bumpy edges like bristle marks
  "M-0.5,0 C-0.42,-0.08 -0.35,-0.14 -0.25,-0.13 C-0.18,-0.16 -0.1,-0.11 -0.02,-0.15 C0.08,-0.12 0.15,-0.16 0.25,-0.12 C0.33,-0.1 0.42,-0.06 0.5,-0.01 C0.45,0.05 0.38,0.1 0.28,0.13 C0.2,0.16 0.1,0.12 0.02,0.15 C-0.08,0.13 -0.18,0.16 -0.28,0.12 C-0.38,0.09 -0.46,0.05 -0.5,0Z",
  // Loaded brush blob — wider in center with paint pooling, organic outline
  "M-0.4,0 C-0.38,-0.08 -0.3,-0.2 -0.18,-0.25 C-0.06,-0.28 0.08,-0.27 0.2,-0.22 C0.3,-0.17 0.38,-0.08 0.4,0 C0.38,0.1 0.3,0.22 0.18,0.27 C0.08,0.3 -0.08,0.28 -0.2,0.23 C-0.32,0.17 -0.39,0.08 -0.4,0Z",
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

function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

    // Draw the source image slightly larger than the output canvas so
    // the WASM grid generates cells that overshoot the right/bottom
    // edges.
    const pad = sp;
    const ew = w + pad;
    const eh = h + pad;
    const offscreen = document.createElement("canvas");
    offscreen.width = ew;
    offscreen.height = eh;
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(img, 0, 0, ew, eh);
    const imageData = offCtx.getImageData(0, 0, ew, eh);

    const wasm = await loadWasm();
    const byteCount = ew * eh * 4;
    const cols = Math.ceil(ew / sp);
    const rows = Math.ceil(eh / sp);
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

    const cellCount = wasm.computeCells(ew, eh, sp);
    const cellData = new Int32Array(memory.buffer, byteCount, cellCount * 5);
    const rotJitterRad = (rj * Math.PI) / 180;
    const cells = [];
    const makeCell = (cx, cy, cr, cg, cb) => {
      const cellShape = sh === "mixed" ? MIXED_SHAPES[Math.floor(Math.random() * MIXED_SHAPES.length)] : sh;
      return {
        x: cx + (Math.random() - 0.5) * 2 * jt,
        y: cy + (Math.random() - 0.5) * 2 * jt,
        r: cr, g: cg, b: cb,
        rotation: (Math.random() - 0.5) * 2 * rotJitterRad,
        shape: cellShape,
        brushIdx: Math.floor(Math.random() * BRUSHSTROKE_PATHS.length),
      };
    };
    for (let i = 0; i < cellCount; i++) {
      const base = i * 5;
      cells.push(makeCell(cellData[base], cellData[base + 1], cellData[base + 2], cellData[base + 3], cellData[base + 4]));
    }

    // Shuffle cells to avoid any remaining directional bias
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
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
    cellsRef.current = { cells, dr, op, sh, sl, sp };
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

    // Standard vibrant blending
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

  const handleRandomize = useCallback(() => {
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randFloat = (min, max, step) => {
      const steps = Math.round((max - min) / step);
      return min + Math.round(Math.random() * steps) * step;
    };

    const newShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const newDotRadius = randInt(4, 40);
    const newSpacing = randInt(4, 40);
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

    const params = {
      dotRadius: newDotRadius, spacing: newSpacing, jitter: newJitter,
      opacity: newOpacity, outputWidth, shape: newShape,
      strokeLength: newStrokeLength, rotationJitter: newRotationJitter,
    };

    // If no image selected yet, pick a random gallery image
    if (!srcImgRef.current && bgPics.length > 0) {
      const randomPic = bgPics[Math.floor(Math.random() * bgPics.length)];
      setSelectedSrc(randomPic);
      setProcessing(true);
      const img = new Image();
      img.src = randomPic;
      img.onload = () => {
        srcImgRef.current = img;
        renderWithParams(params);
      };
    } else {
      renderWithParams(params);
    }
  }, [bgPics, outputWidth, renderWithParams]);

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

    // 1. Quantize colors to group them (12-bit: 16 levels per channel)
    const quantize = (c) => Math.round(c / 16) * 16;
    const groups = new Map(); // key: hex, value: { shape, cells }
    
    cells.forEach(c => {
      const hex = rgbToHex(quantize(c.r), quantize(c.g), quantize(c.b));
      const key = `${hex}_${c.shape}`;
      if (!groups.has(key)) groups.set(key, { hex, shape: c.shape, cells: [] });
      groups.get(key).cells.push(c);
    });

    const symbols = [];
    // Only need symbols for complex brushstrokes now
    const usedShapes = new Set(cells.map(c => c.shape));
    if (usedShapes.has("brushstroke")) {
      BRUSHSTROKE_PATHS.forEach((path, i) => {
        symbols.push(`<symbol id="b${i}"><path d="${path}" transform="scale(${dr * 2})"/></symbol>`);
      });
    }

    const pathElements = [];
    groups.forEach(({ hex, shape, cells: groupCells }) => {
      if (shape === "square" || shape === "triangle" || shape === "line") {
        // Merge into a single path string
        const d = groupCells.map(c => {
          const cos = Math.cos(c.rotation || 0);
          const sin = Math.sin(c.rotation || 0);
          const p = (dx, dy) => {
            const nx = Math.round(c.x + dx * cos - dy * sin);
            const ny = Math.round(c.y + dx * sin + dy * cos);
            return `${nx},${ny}`;
          };

          if (shape === "square") {
            return `M${p(-dr, -dr)}L${p(dr, -dr)}L${p(dr, dr)}L${p(-dr, dr)}Z`;
          } else if (shape === "triangle") {
            const h = dr * Math.sqrt(3);
            return `M${p(0, -dr)}L${p(-h / 2, dr)}L${p(h / 2, dr)}Z`;
          } else if (shape === "line") {
            const lw = dr * sl, lh = dr * 0.3;
            return `M${p(-lw, -lh)}L${p(lw, -lh)}L${p(lw, lh)}L${p(-lw, lh)}Z`;
          }
          return "";
        }).join("");
        pathElements.push(`<path fill="${hex}" d="${d}"/>`);
      } else if (shape === "circle") {
        // Circles are small, but we still group them by color
        const circles = groupCells.map(c => `<circle cx="${Math.round(c.x)}" cy="${Math.round(c.y)}" r="${dr}"/>`).join("");
        pathElements.push(`<g fill="${hex}">${circles}</g>`);
      } else if (shape === "brushstroke") {
        // Group brushstrokes by color to save 'fill' attribute
        const brush = groupCells.map(c => {
          const x = Math.round(c.x), y = Math.round(c.y);
          const rot = c.rotation ? (c.rotation * 180 / Math.PI).toFixed(0) : 0;
          const sid = `b${c.brushIdx % BRUSHSTROKE_PATHS.length}`;
          const transform = `translate(${x},${y})${rot !== 0 ? ` rotate(${rot})` : ""}`;
          return `<use href="#${sid}" transform="${transform}"/>`;
        }).join("");
        pathElements.push(`<g fill="${hex}">${brush}</g>`);
      }
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">
<defs>${symbols.join("")}</defs>
<rect width="${size.w}" height="${size.h}" fill="${bg}"/>
<g fill-opacity="${op}">${pathElements.join("")}</g>
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
          <label className="playground-btn playground-upload-btn" role="button" tabIndex={0}
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

        <button type="button" className="playground-btn playground-randomize-btn" onClick={handleRandomize}>
          {t("playground.randomize")}
        </button>

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
          <button type="button" className="playground-btn playground-download-btn"
            onClick={handleDownloadPNG} disabled={!hasResult}>
            {t("playground.download")} (PNG)
          </button>
          <button type="button" className="playground-btn playground-download-btn"
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
