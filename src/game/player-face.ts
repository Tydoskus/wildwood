import { drawAlignedPlayerLayer, type LayerAdjustment, type LayerBounds, type PlayerLayer } from "./player-layer-alignment";
import { VENDOR_LEFT_EYE_PATH, VENDOR_RIGHT_EYE_PATH, type FaceKnot } from "./player-face-paths";

import { EXPANSION_HEAD_FRAME, EXPANSION_HEAD_RUNS } from "./player-head-template";
export const PLAYER_HEAD_SIZE = { width: EXPANSION_HEAD_FRAME.width, height: EXPANSION_HEAD_FRAME.height };
// The expansion template has no eyes. Preserve our eye pair independently of its mask.
export const PLAYER_EYE_CENTERS = { left: 32, right: 53.6, y: 27.4 };
const headCache = new Map<string, HTMLCanvasElement>();

export function tintedHeadPixels(skin: string) {
  const rgb = [1, 3, 5].map(start => parseInt(skin.slice(start, start + 2), 16));
  const pixels = new Uint8ClampedArray(PLAYER_HEAD_SIZE.width * PLAYER_HEAD_SIZE.height * 4);
  let offset = 0;
  for (let i = 0; i < EXPANSION_HEAD_RUNS.length; i += 3) {
    const [count, value, alpha] = EXPANSION_HEAD_RUNS.subarray(i, i + 3);
    for (let n = 0; n < count; n++) {
      for (let c = 0; c < 3; c++) pixels[offset++] = rgb[c] * value / 255;
      pixels[offset++] = alpha;
    }
  }
  return pixels;
}

/** Trace the original Photoshop cubic paths, including their slightly oval eyes. */
export function traceFacePath(ctx: CanvasRenderingContext2D, path: readonly FaceKnot[], sx = 1, sy = 1, dx = 0, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(path[0][0] * sx + dx, path[0][1] * sy + dy);
  for (let i = 1; i <= path.length; i++) {
    const previous = path[i - 1], next = path[i % path.length];
    ctx.bezierCurveTo(previous[4] * sx + dx, previous[5] * sy + dy,
      next[2] * sx + dx, next[3] * sy + dy, next[0] * sx + dx, next[1] * sy + dy);
  }
  ctx.closePath();
}

/** Render the user-edited template with its preserved silhouette and antialiasing. */
export function drawPlayerHead(ctx: CanvasRenderingContext2D, width: number, height: number, skin: string) {
  let canvas = headCache.get(skin);
  if (!canvas) {
    if (typeof document === "undefined") return;
    canvas = document.createElement("canvas");
    canvas.width = PLAYER_HEAD_SIZE.width; canvas.height = PLAYER_HEAD_SIZE.height;
    const target = canvas.getContext("2d");
    if (!target) return;
    const pixels = target.createImageData(canvas.width, canvas.height);
    pixels.data.set(tintedHeadPixels(skin)); target.putImageData(pixels, 0, 0);
    if (headCache.size >= 32) headCache.delete(headCache.keys().next().value!);
    headCache.set(skin, canvas);
  }
  ctx.drawImage(canvas, 0, 0, width, height);
}

export function eyeGeometry(width: number, height: number, spacing = 1) {
  const sx = width / PLAYER_HEAD_SIZE.width, sy = height / PLAYER_HEAD_SIZE.height;
  const left = PLAYER_EYE_CENTERS.left * sx, right = PLAYER_EYE_CENTERS.right * sx;
  const center = (left + right) / 2, halfGap = (right - left) * spacing / 2;
  return { left: spacing === 1 ? left : center - halfGap,
    right: spacing === 1 ? right : center + halfGap, y: PLAYER_EYE_CENTERS.y * sy,
    radius: 6.01879 * sx, radiusY: 6.01879 * sy };
}

const EYE_INK = "#0d0d0d";
/** In head units, so the outline holds its weight at every draw size. */
const EYE_OUTLINE_WIDTH = 1.4;
const EYE_PUPIL_SCALE = 0.5;
/** Off-centre towards the nose side, so the face reads as looking ahead. */
const EYE_PUPIL_OFFSET_X = 1;

export function drawPlayerEyes(
  ctx: CanvasRenderingContext2D, width: number, height: number, adjustment?: LayerAdjustment,
  onBounds?: (layer: PlayerLayer, bounds: LayerBounds) => void,
) {
  const eye = eyeGeometry(width, height, adjustment?.spacing);
  const sx = width / PLAYER_HEAD_SIZE.width, sy = height / PLAYER_HEAD_SIZE.height;
  // A white eye with a black pupil and a black outline, rather than the solid
  // dark almond the vendor artwork shipped with.
  const draw = () => {
    const outline = Math.max(0.5, EYE_OUTLINE_WIDTH * Math.min(sx, sy));
    ctx.lineJoin = "round";
    ctx.lineWidth = outline;
    ctx.strokeStyle = EYE_INK;
    ctx.fillStyle = "#fff";
    traceFacePath(ctx, VENDOR_LEFT_EYE_PATH, sx, sy, eye.left - 26.05594 * sx, eye.y - 35.05619 * sy);
    ctx.fill(); ctx.stroke();
    traceFacePath(ctx, VENDOR_RIGHT_EYE_PATH, sx, sy, eye.right - 49.39983 * sx, eye.y - 35.05619 * sy);
    ctx.fill(); ctx.stroke();
    // The pupil is the eye's own outline at half size, so it keeps the shape
    // the artwork was drawn with instead of a plain circle inside it.
    ctx.fillStyle = EYE_INK;
    const pupilX = sx * EYE_PUPIL_SCALE, pupilY = sy * EYE_PUPIL_SCALE;
    const nudge = EYE_PUPIL_OFFSET_X * sx;
    traceFacePath(ctx, VENDOR_LEFT_EYE_PATH, pupilX, pupilY,
      eye.left - 26.05594 * pupilX + nudge, eye.y - 35.05619 * pupilY); ctx.fill();
    traceFacePath(ctx, VENDOR_RIGHT_EYE_PATH, pupilX, pupilY,
      eye.right - 49.39983 * pupilX + nudge, eye.y - 35.05619 * pupilY); ctx.fill();
  };
  if (!adjustment && !onBounds) { draw(); return; }
  drawAlignedPlayerLayer(ctx, "eyes", {
    x: eye.left - eye.radius, y: eye.y - eye.radiusY,
    width: eye.right - eye.left + eye.radius * 2, height: eye.radiusY * 2,
  }, adjustment, draw, onBounds);
}
