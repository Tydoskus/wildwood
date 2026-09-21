import { TAU } from "../constants";

/**
 * Samurai Garden is the only map whose trees are painted rather than blitted
 * from a spritesheet, so every visible tree used to cost ten filled ellipses
 * and a stroked branch path per frame. The painting happens once into an
 * offscreen canvas here, and the map blits the result like every other map.
 */

/** Draw size the cluster offsets below are authored against. */
export const CHERRY_TREE_BASE_SIZE = 154;

/**
 * The layout scales trees between .7 and 1.18. Sources are rendered at the top
 * of each band so a tree only ever samples its sprite down, never up.
 */
export const CHERRY_TREE_SOURCE_SCALES = [.92, 1.25] as const;

const HALF_WIDTH_UNITS = 85;
const HEIGHT_UNITS = 152;
const PADDING_UNITS = 4;

const TRUNK_COLOR = "#6d4650";
const TRUNK_HIGHLIGHT_COLOR = "#a16a68";
const BRANCH_COLOR = "#49303a";
const BLOSSOM_HIGHLIGHT_COLOR = "rgba(255,214,233,.82)";

export const CHERRY_TREE_BLOSSOM_FALLBACK = ["#f47fb2", "#ff94c2", "#e96ca7"] as const;
export const CHERRY_TREE_SHADOW_COLOR = "#7b355c";

/** Blossom clusters, in the authored 154px space, before per-tree drift. */
const CLUSTERS = [
  { dx: -42, dy: -16, rx: 34, ry: 25, drifts: true },
  { dx: -16, dy: -37, rx: 39, ry: 29, drifts: false },
  { dx: 19, dy: -37, rx: 38, ry: 29, drifts: false },
  { dx: 45, dy: -14, rx: 31, ry: 24, drifts: true },
  { dx: 3, dy: -9, rx: 45, ry: 31, drifts: false },
] as const;

export type CherryTreeColors = {
  /** Backing silhouette drawn behind each blossom cluster. */
  shadow: string;
  /** One colour per cluster, in cluster order. */
  clusters: readonly string[];
};

type CherryTreeContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Sideways sway that keeps neighbouring trees from looking stamped. */
export function cherryTreeDrift(variant: number, scale: number) {
  return (Math.abs(Math.trunc(variant)) % 3 - 1) * Math.round(4 * scale);
}

/** Which cluster colour a variant's blossoms use, matching the painted order. */
export function cherryTreeColors(
  paletteColor: (index: number) => string,
  override?: string,
): CherryTreeColors {
  if (override) return { shadow: override, clusters: CLUSTERS.map(() => override) };
  return { shadow: CHERRY_TREE_SHADOW_COLOR, clusters: CLUSTERS.map((_, index) => paletteColor(index)) };
}

/**
 * Smallest source scale that still covers this tree, so the blit downsamples.
 * Trees larger than the widest band clamp to it rather than growing the cache.
 */
export function cherryTreeSourceScale(treeScale: number) {
  const scale = Number.isFinite(treeScale) && treeScale > 0 ? treeScale : 1;
  return CHERRY_TREE_SOURCE_SCALES.find(source => source >= scale)
    ?? CHERRY_TREE_SOURCE_SCALES[CHERRY_TREE_SOURCE_SCALES.length - 1];
}

/**
 * Pixel box the painted tree occupies. The origin is the tree's ground point:
 * blitting at `x - originX, y - originY` puts the trunk base back on the spot
 * the painted version used.
 */
export function cherryTreeSpriteBox(drawSize: number) {
  const scale = drawSize / CHERRY_TREE_BASE_SIZE;
  const padding = Math.ceil(PADDING_UNITS * scale);
  const originX = Math.ceil(HALF_WIDTH_UNITS * scale) + padding;
  const originY = Math.ceil(HEIGHT_UNITS * scale) + padding;
  return { width: originX * 2, height: originY + padding, originX, originY };
}

/** Paints one cherry tree with its ground point at (x, y). */
export function paintCherryTree(
  ctx: CherryTreeContext,
  x: number,
  y: number,
  drawSize: number,
  variant: number,
  colors: CherryTreeColors,
) {
  const scale = drawSize / CHERRY_TREE_BASE_SIZE;
  const trunkWidth = Math.max(8, Math.round(14 * scale));
  const trunkHeight = Math.round(82 * scale);
  const crownY = y - trunkHeight;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = BRANCH_COLOR;
  ctx.lineWidth = Math.max(4, Math.round(8 * scale));
  ctx.beginPath();
  ctx.moveTo(x, y - Math.round(6 * scale));
  ctx.lineTo(x - Math.round(2 * scale), crownY + Math.round(18 * scale));
  ctx.lineTo(x - Math.round(28 * scale), crownY - Math.round(7 * scale));
  ctx.moveTo(x - Math.round(1 * scale), crownY + Math.round(24 * scale));
  ctx.lineTo(x + Math.round(30 * scale), crownY - Math.round(10 * scale));
  ctx.stroke();
  ctx.fillStyle = TRUNK_COLOR;
  ctx.fillRect(x - Math.floor(trunkWidth / 2), y - trunkHeight, trunkWidth, trunkHeight);
  ctx.fillStyle = TRUNK_HIGHLIGHT_COLOR;
  ctx.fillRect(x - Math.floor(trunkWidth / 2) + 2, y - trunkHeight + 4, Math.max(2, Math.round(trunkWidth * .24)), trunkHeight - 8);

  const drift = cherryTreeDrift(variant, scale);
  for (let index = 0; index < CLUSTERS.length; index += 1) {
    const cluster = CLUSTERS[index];
    const cx = x + Math.round((cluster.dx + (cluster.drifts ? drift : 0)) * scale);
    const cy = crownY + Math.round(cluster.dy * scale);
    const rx = Math.round(cluster.rx * scale);
    const ry = Math.round(cluster.ry * scale);
    ctx.fillStyle = colors.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + Math.round(2 * scale), rx + Math.round(3 * scale), ry + Math.round(3 * scale), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = colors.clusters[index] ?? CHERRY_TREE_BLOSSOM_FALLBACK[index % CHERRY_TREE_BLOSSOM_FALLBACK.length];
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BLOSSOM_HIGHLIGHT_COLOR;
    ctx.fillRect(cx - Math.round(rx * .42), cy - Math.round(ry * .48), Math.max(2, Math.round(6 * scale)), Math.max(2, Math.round(4 * scale)));
  }
  ctx.restore();
}
