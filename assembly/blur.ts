// assembly/blur.ts
// Pointillist effect: computes average colour per grid cell.
// JS handles rendering (canvas arc for smooth circles) and animation.
//
// Memory layout:
//   [0 .. width*height*4)      = input pixel buffer (RGBA)
//   [width*height*4 .. ]       = cell data: each cell is 5 × i32
//                                 (cx, cy, r, g, b) = 20 bytes per cell

@external("env", "log")
declare function log(val: f64): void;

/**
 * Computes the average colour for each grid cell of the source image.
 * Returns the total number of cells written.
 *
 * @param width   - image width in pixels
 * @param height  - image height in pixels
 * @param spacing - distance between cell centres on the grid
 * @returns number of cells
 *
 * Input is read from offset 0.
 * Cell data is written starting at offset width * height * 4.
 * Each cell: 5 consecutive i32 values (cx, cy, r, g, b).
 */
export function computeCells(width: i32, height: i32, spacing: i32): i32 {
  const byteCount: i32 = width * height * 4;
  const inputOffset: i32 = 0;
  const cellOffset: i32 = byteCount;
  const halfSpacing: i32 = spacing / 2;

  let cellIndex: i32 = 0;

  for (let gy: i32 = 0; gy < height; gy += spacing) {
    for (let gx: i32 = 0; gx < width; gx += spacing) {

      const cx: i32 = gx + halfSpacing;
      const cy: i32 = gy + halfSpacing;

      // Average the source pixels in this cell
      let rSum: i32 = 0;
      let gSum: i32 = 0;
      let bSum: i32 = 0;
      let count: i32 = 0;

      const yEnd: i32 = gy + spacing < height ? gy + spacing : height;
      const xEnd: i32 = gx + spacing < width  ? gx + spacing : width;

      for (let sy: i32 = gy; sy < yEnd; sy++) {
        for (let sx: i32 = gx; sx < xEnd; sx++) {
          const off: i32 = inputOffset + (sy * width + sx) * 4;
          rSum += <i32>load<u8>(off);
          gSum += <i32>load<u8>(off + 1);
          bSum += <i32>load<u8>(off + 2);
          count++;
        }
      }

      const avgR: i32 = rSum / count;
      const avgG: i32 = gSum / count;
      const avgB: i32 = bSum / count;

      // Write cell: 5 × i32 = 20 bytes
      const base: i32 = cellOffset + cellIndex * 20;
      store<i32>(base,      cx);
      store<i32>(base + 4,  cy);
      store<i32>(base + 8,  avgR);
      store<i32>(base + 12, avgG);
      store<i32>(base + 16, avgB);

      cellIndex++;
    }
  }

  return cellIndex;
}
