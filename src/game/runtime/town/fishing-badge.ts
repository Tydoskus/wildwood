import { FISHING_MAX_LEVEL, fishingExperienceForLevel, fishingLevel } from "../../../../shared/fishing";
import { formatCompactNumber } from "../../../../shared/compact-number";
import { fishingScene } from "./fishing-scene";

/** The badge's height in screen pixels, for what stacks over it. */
export const FISHING_BADGE_HEIGHT = 38;
const FONT = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const SURFACE = "rgba(14, 14, 14, .84)", EDGE = "rgba(255, 255, 255, .24)", TRACK = "rgba(255, 255, 255, .16)";
const TEXT = "#ffffff", MUTED = "#bdbdbd", GAIN = "#ffd34d";

/** A small fish, facing right, its middle at (x, y). */
function fishMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = TEXT;
  ctx.beginPath(); ctx.ellipse(x + 2, y, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 8, y - 4); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.beginPath(); ctx.arc(x + 5, y - 1, 1, 0, Math.PI * 2); ctx.fill();
}

/**
 * Over the player while the rod is out, in screen pixels with its bottom middle at (0, bottom): the Fishing level, the
 * experience into it against what the next takes, a thin bar of the same, and each catch's experience rising off it.
 */
export function paintFishingBadge(ctx: CanvasRenderingContext2D, bottom: number) {
  const experience = fishingScene.experience, level = fishingLevel(experience), top = bottom - FISHING_BADGE_HEIGHT;
  const floor = fishingExperienceForLevel(level), maxed = level >= FISHING_MAX_LEVEL;
  const needed = maxed ? 0 : fishingExperienceForLevel(level + 1) - floor, into = maxed ? 0 : experience - floor;
  const label = `Lv ${level}`, progress = maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)}`;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  const labelWidth = ctx.measureText(label).width, progressWidth = ctx.measureText(progress).width;
  const width = Math.round(20 + labelWidth + 12 + progressWidth + 20), left = -width / 2;
  ctx.fillStyle = SURFACE;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(left, top, width, FISHING_BADGE_HEIGHT, 9); ctx.fill(); ctx.stroke();
  const textY = top + 15;
  fishMark(ctx, left + 15, textY);
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT;
  ctx.fillText(label, left + 26, textY);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.fillText(progress, left + width - 10, textY);
  // The bar along its foot, inside the edge.
  const barX = left + 10, barW = width - 20, barY = top + FISHING_BADGE_HEIGHT - 10;
  ctx.fillStyle = TRACK;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, 4, 2); ctx.fill();
  ctx.fillStyle = TEXT;
  const share = maxed ? 1 : needed > 0 ? Math.max(0, Math.min(1, into / needed)) : 0;
  if (share > 0) { ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(4, barW * share), 4, 2); ctx.fill(); }
  // A catch's experience floats up off the badge and fades.
  if (fishingScene.gainLeft > 0 && fishingScene.gain > 0) {
    const rise = 1 - fishingScene.gainLeft;
    ctx.globalAlpha = Math.min(1, fishingScene.gainLeft * 2.5);
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, .8)";
    ctx.fillStyle = GAIN;
    const gainY = top - 9 - rise * 18, text = `+${formatCompactNumber(fishingScene.gain)} XP`;
    ctx.strokeText(text, 0, gainY);
    ctx.fillText(text, 0, gainY);
  }
  ctx.restore();
}
