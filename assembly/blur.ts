// assembly/blur.ts
// Pointillist effect: computes average colour per grid cell.
// JS handles rendering (canvas arc for smooth circles) and animation.
//
// Memory layout:
//   [0 .. width*height*4)      = input pixel buffer (RGBA)
//   [width*height*4 .. ]       = cell data: each cell is 5 × i32
//                                 (cx, cy, r, g, b) = 20 bytes per cell

/**
 * Computes the average colour for each grid cell of the source image.
 * Returns the total number of cells written.
 *
 * @param width   - image width in pixels
 * @param height  - image height in pixels
 * @param spacing - distance between cell centres on the grid
 * @returns number of cells
 */
export function computeCells(width: i32, height: i32, spacing: i32): i32 {
  const stride: i32 = width << 2; 
  const cellOffset: i32 = height * stride;
  const halfSpacing: i32 = spacing >> 1;

  let cellIndex: i32 = 0;
  let writePtr: i32 = cellOffset;

  for (let gy: i32 = 0; gy < height; gy += spacing) {
    for (let gx: i32 = 0; gx < width; gx += spacing) {

      const cx: i32 = gx + halfSpacing;
      const cy: i32 = gy + halfSpacing;

      let rSum: i32 = 0;
      let gSum: i32 = 0;
      let bSum: i32 = 0;
      let count: i32 = 0;

      const yEnd: i32 = gy + spacing < height ? gy + spacing : height;
      const xEnd: i32 = gx + spacing < width  ? gx + spacing : width;

      for (let sy: i32 = gy; sy < yEnd; sy++) {
        const rowOffset: i32 = sy * stride;
        for (let sx: i32 = gx; sx < xEnd; sx++) {
          const off: i32 = rowOffset + (sx << 2);
          rSum += <i32>load<u8>(off);
          gSum += <i32>load<u8>(off + 1);
          bSum += <i32>load<u8>(off + 2);
          count++;
        }
      }

      // Write cell: 20 bytes
      store<i32>(writePtr,      cx);
      store<i32>(writePtr + 4,  cy);
      store<i32>(writePtr + 8,  rSum / count);
      store<i32>(writePtr + 12, gSum / count);
      store<i32>(writePtr + 16, bSum / count);

      writePtr += 20;
      cellIndex++;
    }
  }

  return cellIndex;
}
