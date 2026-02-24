export const BRUSHSTROKE_PATHS = [
  "M-0.417,-0.042 Q0,-0.083 0.375,-0.042 L0.333,0.083 Q-0.042,0.125 -0.458,0.083 Z",
  "M-0.458,-0.067 Q0,-0.125 0.417,-0.067 L0.4,0 Q-0.017,-0.058 -0.475,0 Z",
  "M-0.375,0.042 Q0.042,0.1 0.333,0.042 L0.317,0.125 Q0.025,0.183 -0.392,0.125 Z"
];

export const MIXED_SHAPES = ["circle", "rectangle", "triangle", "brushstroke"];

export const SQRT_THREE = Math.sqrt(3);

let brushstrokePath2Ds = null;
export function getBrushstrokePaths() {
  if (!brushstrokePath2Ds) brushstrokePath2Ds = BRUSHSTROKE_PATHS.map((d) => new Path2D(d));
  return brushstrokePath2Ds;
}

export function drawShape(ctx, shape, x, y, dr, rotation, strokeLen, brushIdx) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, dr, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case "rectangle":
      ctx.fillRect(-dr * strokeLen / 5, -dr, 2 * dr * strokeLen / 5, 2 * dr);
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
    case "brushstroke": {
      const paths = getBrushstrokePaths();
      ctx.scale(4 * dr * strokeLen / 2, 10 * dr);
      ctx.fill(paths[brushIdx % paths.length]);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
