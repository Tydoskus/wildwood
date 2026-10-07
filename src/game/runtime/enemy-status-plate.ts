/** A label already drawn to its own canvas (an enemy's name). */
export type StatusPlateLabel = { canvas: HTMLCanvasElement; width: number; height: number; anchorY: number };

/**
 * The part of an enemy's status that every enemy of the same kind shares:
 * its name over the empty health bar and, at full health, the full bar.
 * Positions are relative to the bar's top edge, centred on x.
 */
export type EnemyStatusPlate = { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number };

/** An enemy's health bar: a long, thin pill with no numbers on it. */
export const ENEMY_HEALTH_BAR_HEIGHT = 5;
export const ENEMY_HEALTH_FILL = "#55d568";
const PLATE_CACHE_LIMIT = 512;
const OUTLINE = 1;

type PillContext = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "arcTo" | "closePath" | "fill">;
/** A rounded bar, its ends as round as its height allows; a sliver narrower than that stays a sliver. */
export function fillPill(ctx: PillContext, x: number, y: number, width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return;
  const radius = Math.min(height / 2, width / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * A mob group is the same enemy many times over, and at full health each
 * one's name and bar are identical, so each kind's is drawn once to a plate
 * and every enemy of it is one image. A wounded enemy still uses the plate
 * for its name and empty bar, and draws only its green fill on top. With no
 * numbers on the bar there is nothing per enemy to cache but that fill.
 *
 * Plates are drawn at the device pixel ratio so they land one-to-one on the
 * screen, and the cache is dropped whole when it fills, which only a very long
 * session across many maps can do.
 */
export function createEnemyStatusPlates(options: {
  pixelRatio: () => number;
  createCanvas?: () => HTMLCanvasElement;
}) {
  const plates = new Map<StatusPlateLabel, Map<string, EnemyStatusPlate>>();
  let size = 0;
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));

  function build(name: StatusPlateLabel, barW: number, barH: number, full: boolean, scale: number): EnemyStatusPlate {
    const canvas = createCanvas();
    const plateCtx = canvas.getContext("2d");
    const nameTop = -4 - name.anchorY;
    const barLeft = -barW / 2;
    const left = Math.floor(Math.min(-name.width / 2, barLeft - OUTLINE)) - 1;
    const right = Math.ceil(Math.max(name.width / 2, barLeft + barW + OUTLINE)) + 1;
    const top = Math.floor(Math.min(nameTop, -OUTLINE)) - 1;
    const bottom = Math.ceil(Math.max(nameTop + name.height, barH + OUTLINE)) + 1;
    const width = right - left;
    const height = bottom - top;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    if (plateCtx) {
      plateCtx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
      plateCtx.imageSmoothingEnabled = true;
      plateCtx.drawImage(name.canvas, -name.width / 2, nameTop, name.width, name.height);
      plateCtx.fillStyle = "rgba(0,0,0,.8)";
      fillPill(plateCtx, barLeft - OUTLINE, -OUTLINE, barW + OUTLINE * 2, barH + OUTLINE * 2);
      plateCtx.fillStyle = "#000";
      fillPill(plateCtx, barLeft, 0, barW, barH);
      if (full) {
        plateCtx.fillStyle = ENEMY_HEALTH_FILL;
        fillPill(plateCtx, barLeft, 0, barW, barH);
      }
    }
    return { canvas, left, top, width, height };
  }

  /** `full`: the enemy is at full health, so the plate carries the full bar too. */
  function plate(name: StatusPlateLabel, barW: number, barH: number, full: boolean) {
    const scale = options.pixelRatio();
    const key = `${scale}|${barW}|${barH}|${full ? 1 : 0}`;
    let byName = plates.get(name);
    const cached = byName?.get(key);
    if (cached) return cached;
    if (size >= PLATE_CACHE_LIMIT) { plates.clear(); size = 0; byName = undefined; }
    if (!byName) { byName = new Map(); plates.set(name, byName); }
    const built = build(name, barW, barH, full, scale);
    byName.set(key, built);
    size++;
    return built;
  }

  return { plate, size: () => size };
}
