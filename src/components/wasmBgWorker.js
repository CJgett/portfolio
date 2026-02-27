// wasmBgWorker.js — full animation loop running in a Web Worker with OffscreenCanvas

// Workers resolve relative URLs against the worker script URL, not the page root.
// Use the origin so all fetches hit the correct host regardless of the bundler output path.
const ORIGIN = self.location.origin;
const toAbsolute = (path) =>
  /^https?:\/\//.test(path) ? path : ORIGIN + (path.startsWith('/') ? '' : '/') + path;

const DOT_RADIUS = 16;
const SPACING = 15;
const JITTER = 6;
const OPACITY = 0.85;
const DOTS_PER_FRAME = 20;
const PAUSE_MS = 3000;
const ERASE_PER_FRAME = 40;

let canvas = null;
let ctx = null;
let wasmExports = null;
let abortController = new AbortController();
let cancelled = false;
let paused = false;
let resumeCallback = null;
let canvasWidth = 0;
let canvasHeight = 0;

// Tracks currently-shown state for redrawing on resize
const state = { cells: null, drawn: 0, bgColor: '#ffffff', srcW: 1, srcH: 1 };

function pickRandom(arr, exclude) {
  if (arr.length <= 1) return arr[0];
  let pick;
  do {
    pick = arr[Math.floor(Math.random() * arr.length)];
  } while (pick === exclude);
  return pick;
}

// ~60fps frame pacing without requestAnimationFrame (unavailable in workers)
const nextFrame = () => new Promise(resolve => setTimeout(resolve, 16));

const waitForResume = () => new Promise(resolve => {
  resumeCallback = resolve;
});

function getCoverTransform() {
  const scale = Math.max(canvas.width / state.srcW, canvas.height / state.srcH);
  return {
    scale,
    offsetX: (canvas.width  - state.srcW * scale) / 2,
    offsetY: (canvas.height - state.srcH * scale) / 2,
  };
}

// Draw cells[from..to] using the current cover transform (no canvas clear).
function paintCells(cells, from, to) {
  const { scale, offsetX, offsetY } = getCoverTransform();
  for (let i = from; i < to; i++) {
    const c = cells[i];
    ctx.beginPath();
    ctx.arc(c.ix * scale + offsetX, c.iy * scale + offsetY, DOT_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = c.style;
    ctx.fill();
  }
}

// Clear the canvas and repaint cells[0..count]. Used by animateOut and resize redraws.
function paintFrame(cells, count) {
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintCells(cells, 0, count);
}

function redrawCurrent() {
  if (state.cells) paintFrame(state.cells, state.drawn);
}

async function prepareImage(src) {
  // Workers can't use new Image() — fetch the blob and create a bitmap instead
  const blob = await fetch(toAbsolute(src), { signal: abortController.signal }).then(r => r.blob());
  const bitmap = await createImageBitmap(blob);

  if (cancelled) { bitmap.close(); return null; }

  // Scale source image to cover the current canvas (1x, no DPR)
  const imgScale = Math.max(canvasWidth / bitmap.width, canvasHeight / bitmap.height);
  const srcW = Math.round(bitmap.width  * imgScale);
  const srcH = Math.round(bitmap.height * imgScale);

  // Read pixels via an OffscreenCanvas — no document.createElement needed in workers
  const offscreen = new OffscreenCanvas(srcW, srcH);
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(bitmap, 0, 0, srcW, srcH);
  bitmap.close();
  const imageData = offCtx.getImageData(0, 0, srcW, srcH);

  // Load the Wasm module once across all cycles
  if (!wasmExports) {
    const imports = { env: { abort: () => {}, log: (v) => console.log('WASM:', v) } };
    const response = await fetch(toAbsolute('/blur.wasm'), { signal: abortController.signal });
    const module = await WebAssembly.instantiateStreaming(response, imports);
    wasmExports = module.instance.exports;
  }

  if (cancelled) return null;

  const wasm = wasmExports;
  const byteCount = srcW * srcH * 4;
  const maxCells = Math.ceil(srcW / SPACING) * Math.ceil(srcH / SPACING);
  const requiredBytes = byteCount + maxCells * 20;

  if (requiredBytes > wasm.memory.buffer.byteLength) {
    const pagesToGrow = Math.ceil((requiredBytes - wasm.memory.buffer.byteLength) / 65536);
    wasm.memory.grow(pagesToGrow);
  }

  new Uint8ClampedArray(wasm.memory.buffer, 0, byteCount).set(imageData.data);

  const cellCount = wasm.computeCells(srcW, srcH, SPACING);
  const cellData = new Int32Array(wasm.memory.buffer, byteCount, cellCount * 5);
  const cells = [];
  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < cellCount; i++) {
    const b = i * 5;
    const r = cellData[b + 2], g = cellData[b + 3], bv = cellData[b + 4];
    sumR += r; sumG += g; sumB += bv;
    cells.push({
      ix:    cellData[b]     + (Math.random() - 0.5) * 2 * JITTER,
      iy:    cellData[b + 1] + (Math.random() - 0.5) * 2 * JITTER,
      style: `rgba(${r},${g},${bv},${OPACITY})`,
    });
  }

  // Sort so the animation radiates outward from a random origin
  const ox = Math.random() * srcW;
  const oy = Math.random() * srcH;
  cells.sort((a, b) =>
    ((a.ix - ox) ** 2 + (a.iy - oy) ** 2) - ((b.ix - ox) ** 2 + (b.iy - oy) ** 2)
  );

  // Compute dominant colour, boost saturation, derive bg + text-bg tints
  const n = cells.length || 1;
  const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;

  const max = Math.max(avgR, avgG, avgB);
  const min = Math.min(avgR, avgG, avgB);
  const mid = (max + min) / 2;
  const boost = v => Math.min(255, Math.max(0, mid + (v - mid) * 2.5));
  const bR = boost(avgR), bG = boost(avgG), bB = boost(avgB);
  const blend = (v, t) => Math.round(v + (255 - v) * t);

  return {
    cells, srcW, srcH,
    bgColor:   `rgb(${blend(bR, 0.80)}, ${blend(bG, 0.80)}, ${blend(bB, 0.80)})`,
    compColor: `rgb(${blend(bR, 0.65)}, ${blend(bG, 0.65)}, ${blend(bB, 0.65)})`,
  };
}

async function cycle() {
  const res = await fetch(toAbsolute('/data/bgPics.json'), { signal: abortController.signal });
  const pics = await res.json();
  if (!pics.length) { console.error('wasmBgWorker: no images in bgPics.json'); return; }

  let lastSrc = null;

  while (!cancelled) {
    if (paused) await waitForResume();
    if (cancelled) return;

    const src = pickRandom(pics, lastSrc);
    lastSrc = src;

    let result;
    try {
      result = await prepareImage(src);
    } catch (err) {
      if (cancelled) return; // AbortError from destroy
      throw err;
    }
    if (!result || cancelled) return;

    const { cells, srcW, srcH, bgColor, compColor } = result;
    state.cells = cells;
    state.srcW  = srcW;
    state.srcH  = srcH;
    state.bgColor = bgColor;
    state.drawn = 0;

    // Reset canvas to current dimensions (clears it)
    canvas.width  = canvasWidth;
    canvas.height = canvasHeight;

    self.postMessage({ type: 'colors', bgColor, compColor });

    // --- Animate dots in ---
    let drawn = 0;
    while (drawn < cells.length && !cancelled) {
      if (paused) await waitForResume();
      if (cancelled) return;

      const end = Math.min(drawn + DOTS_PER_FRAME, cells.length);
      paintCells(cells, drawn, end);
      drawn = end;
      state.drawn = drawn;
      await nextFrame();
    }

    if (cancelled) return;

    // --- Pause between cycles ---
    await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    if (cancelled) return;

    // --- Erase dots (reverse order, paint bg-color over each removed dot) ---
    // O(ERASE_PER_FRAME) per frame instead of O(remaining) — matches animate-in cost.
    // Neighboring dots get lightly smudged where they overlap, but the bg tint is close
    // enough to the image palette that it reads as a natural dissolve.
    let remaining = cells.length;
    while (remaining > 0 && !cancelled) {
      if (paused) await waitForResume();
      if (cancelled) return;

      const { scale, offsetX, offsetY } = getCoverTransform();
      ctx.fillStyle = state.bgColor;
      const eraseEnd = remaining;
      remaining = Math.max(0, remaining - ERASE_PER_FRAME);
      state.drawn = remaining;
      for (let i = remaining; i < eraseEnd; i++) {
        const c = cells[i];
        ctx.beginPath();
        ctx.arc(c.ix * scale + offsetX, c.iy * scale + offsetY, DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      }
      await nextFrame();
    }
  }
}

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'init':
      canvas = data.canvas;
      canvasWidth  = data.width;
      canvasHeight = data.height;
      canvas.width  = canvasWidth;
      canvas.height = canvasHeight;
      ctx = canvas.getContext('2d');
      cycle().catch(err => { if (!cancelled) console.error('wasmBgWorker:', err); });
      break;

    case 'pause':
      paused = true;
      break;

    case 'resume':
      if (paused) {
        paused = false;
        if (resumeCallback) {
          const cb = resumeCallback;
          resumeCallback = null;
          cb();
        }
      }
      break;

    case 'resize':
      canvasWidth  = data.width;
      canvasHeight = data.height;
      if (canvas) {
        canvas.width  = canvasWidth;
        canvas.height = canvasHeight;
        redrawCurrent();
      }
      break;

    case 'destroy':
      cancelled = true;
      abortController.abort();
      if (resumeCallback) {
        const cb = resumeCallback;
        resumeCallback = null;
        cb(); // unblock any awaiting waitForResume so the loop can exit
      }
      break;
  }
};
