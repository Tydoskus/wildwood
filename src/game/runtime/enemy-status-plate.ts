import { textSpriteLayout } from "../canvas";
import { healthBarTextY } from "./health-bar-layout";

/** A label already drawn to its own canvas (an enemy's name). */
export type StatusPlateLabel = { canvas: HTMLCanvasElement; width: number; height: number; anchorY: number };

/**
 * The part of an enemy's status that every enemy of the same kind shares:
 * its name over the empty health bar and, at full health, the full bar and its
 * "440 / 500". Positions are relative to the bar's top edge, centred on x.
 */
export type EnemyStatusPlate = { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number };

export const ENEMY_STATUS_HP_FONT = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const HP_TEXT_STROKE = 2;
const PLATE_CACHE_LIMIT = 512;

/**
 * A mob group is the same enemy many times over, and at full health each one's
 * name, bar and numbers are identical. Drawn one piece at a time that is about
 * nine canvas operations per enemy per frame; drawn from a plate made once per
 * kind it is one. A wounded enemy still uses the plate for its name and empty
 * bar, and draws only the green fill and its own numbers on top.
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

  function build(name: StatusPlateLabel, barW: number, barH: number, fullLabel: string | null, scale: number): EnemyStatusPlate {
    const canvas = createCanvas();
    const plateCtx = canvas.getContext("2d");
    const nameTop = -4 - name.anchorY;
    const barLeft = -barW / 2;
    let textLayout: ReturnType<typeof textSpriteLayout> | null = null;
    if (plateCtx && fullLabel !== null) {
      plateCtx.font = ENEMY_STATUS_HP_FONT;
      textLayout = textSpriteLayout(plateCtx.measureText(fullLabel), 10, HP_TEXT_STROKE);
    }
    const textY = healthBarTextY(0, barH);
    const left = Math.floor(Math.min(-name.width / 2, barLeft - 2, textLayout ? -textLayout.logicalWidth / 2 : 0)) - 1;
    const right = Math.ceil(Math.max(name.width / 2, barLeft + barW + 2, textLayout ? textLayout.logicalWidth / 2 : 0)) + 1;
    const top = Math.floor(Math.min(nameTop, -2, textLayout ? textY - textLayout.logicalHeight / 2 : 0)) - 1;
    const bottom = Math.ceil(Math.max(nameTop + name.height, barH + 2, textLayout ? textY + textLayout.logicalHeight / 2 : 0)) + 1;
    const width = right - left;
    const height = bottom - top;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    if (plateCtx) {
      plateCtx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
      plateCtx.imageSmoothingEnabled = true;
      plateCtx.drawImage(name.canvas, -name.width / 2, nameTop, name.width, name.height);
      plateCtx.fillStyle = "rgba(0,0,0,.86)";
      plateCtx.fillRect(barLeft - 2, -2, barW + 4, barH + 4);
      plateCtx.fillStyle = "#472225";
      plateCtx.fillRect(barLeft, 0, barW, barH);
      if (fullLabel !== null && textLayout) {
        plateCtx.fillStyle = "#55d568";
        plateCtx.fillRect(barLeft, 0, Math.round(barW), barH);
        // The same box a cached outlined text sprite centres on the bar.
        const originX = -textLayout.textWidth / 2;
        const baseline = textY - textLayout.logicalHeight / 2 + textLayout.padding + textLayout.ascent;
        plateCtx.font = ENEMY_STATUS_HP_FONT;
        plateCtx.textAlign = "left";
        plateCtx.textBaseline = "alphabetic";
        plateCtx.lineJoin = "round";
        plateCtx.lineWidth = HP_TEXT_STROKE;
        plateCtx.strokeStyle = "#000";
        plateCtx.strokeText(fullLabel, originX, baseline);
        plateCtx.fillStyle = "#ffffff";
        plateCtx.fillText(fullLabel, originX, baseline);
      }
    }
    return { canvas, left, top, width, height };
  }

  /** `fullLabel` is the health text when the enemy is at full health, else null for the bare plate. */
  function plate(name: StatusPlateLabel, barW: number, barH: number, fullLabel: string | null) {
    const scale = options.pixelRatio();
    const key = `${scale}|${barW}|${barH}|${fullLabel ?? ""}`;
    let byName = plates.get(name);
    const cached = byName?.get(key);
    if (cached) return cached;
    if (size >= PLATE_CACHE_LIMIT) { plates.clear(); size = 0; byName = undefined; }
    if (!byName) { byName = new Map(); plates.set(name, byName); }
    const built = build(name, barW, barH, fullLabel, scale);
    byName.set(key, built);
    size++;
    return built;
  }

  return { plate, size: () => size };
}
