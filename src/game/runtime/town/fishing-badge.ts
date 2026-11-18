import { FISHING_MAX_LEVEL, fishingExperienceForLevel, fishingLevel } from "../../../../shared/fishing";
import { CRAFT_MAX_LEVEL, craftExperienceForLevel, craftLevel } from "../../../../shared/crafting";
import { MINING_VEINS } from "../../../../shared/mining";
import { WOOD_STANDS } from "../../../../shared/woodcutting";
import { formatCompactNumber } from "../../../../shared/compact-number";
import { fishingScene } from "./fishing-scene";
import { miningScene } from "./mining-scene";
import { woodcuttingScene } from "./woodcutting-scene";
import { cookingScene } from "./cooking-scene";

/** The badge's height in screen pixels, for what stacks over it. */
export const FISHING_BADGE_HEIGHT = 38;
export const SKILL_BADGE_HEIGHT = FISHING_BADGE_HEIGHT;
const FONT = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const SURFACE = "rgba(14, 14, 14, .84)", EDGE = "rgba(255, 255, 255, .24)", TRACK = "rgba(255, 255, 255, .16)";
const TEXT = "#ffffff", MUTED = "#bdbdbd", GAIN = "#ffd34d";

export type OverheadSkillKind = "fishing" | "mining" | "woodcutting" | "cooking";

/** A small fish, facing right, its middle at (x, y). */
function fishMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = TEXT;
  ctx.beginPath(); ctx.ellipse(x + 2, y, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 8, y - 4); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.beginPath(); ctx.arc(x + 5, y - 1, 1, 0, Math.PI * 2); ctx.fill();
}

/** A small pickaxe, angled up-right, its middle at (x, y). */
function pickaxeMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 3, y - 3); ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(x - 1, y + 1, 6.2, -Math.PI * .68, -Math.PI * .06); ctx.stroke();
}

/** A small hatchet, its middle at (x, y). */
function axeMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 4, y - 4); ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 5); ctx.lineTo(x + 6, y - 1);
  ctx.quadraticCurveTo(x + 5, y + 3, x + 1, y + 2);
  ctx.lineTo(x - 1, y - 2); ctx.closePath(); ctx.fill();
}

/** A small campfire flame, its middle at (x, y). */
function flameMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = TEXT;
  ctx.beginPath();
  ctx.moveTo(x, y - 6.5);
  ctx.bezierCurveTo(x + 5, y - 2, x + 5.5, y + 4.5, x, y + 6);
  ctx.bezierCurveTo(x - 5.5, y + 4.5, x - 5, y - 2, x, y - 6.5);
  ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.beginPath();
  ctx.moveTo(x, y - 1.5);
  ctx.bezierCurveTo(x + 2, y + 1, x + 2, y + 3.8, x, y + 4.5);
  ctx.bezierCurveTo(x - 2, y + 3.8, x - 2, y + 1, x, y - 1.5);
  ctx.fill();
}

type BadgeSpec = {
  mark: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  label: string;
  progress: string;
  share: number;
  gain: number;
  gainLeft: number;
  gainUnit: string;
};

/** Progress toward the next vein or stand gate for uncapped gathering stats (Mining / Woodcutting). */
function statMilestone(value: number, gates: readonly number[]) {
  const current = Math.max(0, Math.floor(value));
  const nextIndex = gates.findIndex(gate => gate > current);
  if (nextIndex < 0) return { progress: "All Open", share: 1 };
  const floor = nextIndex > 0 ? gates[nextIndex - 1] : 0, ceiling = gates[nextIndex];
  const span = Math.max(1, ceiling - floor);
  return {
    progress: `${formatCompactNumber(current)} / ${formatCompactNumber(ceiling)}`,
    share: Math.max(0, Math.min(1, (current - floor) / span)),
  };
}

const MINING_GATES = MINING_VEINS.map(vein => vein.mining).filter(at => at > 0);
const WOOD_GATES = WOOD_STANDS.map(stand => stand.woodcutting).filter(at => at > 0);

function badgeSpec(kind: OverheadSkillKind): BadgeSpec {
  if (kind === "fishing") {
    const experience = fishingScene.experience, level = fishingLevel(experience);
    const floor = fishingExperienceForLevel(level), maxed = level >= FISHING_MAX_LEVEL;
    const needed = maxed ? 0 : fishingExperienceForLevel(level + 1) - floor, into = maxed ? 0 : experience - floor;
    return {
      mark: fishMark, label: `Lv ${level}`,
      progress: maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)}`,
      share: maxed ? 1 : needed > 0 ? Math.max(0, Math.min(1, into / needed)) : 0,
      gain: fishingScene.gain, gainLeft: fishingScene.gainLeft, gainUnit: " XP",
    };
  }
  if (kind === "cooking") {
    const experience = cookingScene.experience, level = craftLevel(experience);
    const floor = craftExperienceForLevel(level), maxed = level >= CRAFT_MAX_LEVEL;
    const needed = maxed ? 0 : craftExperienceForLevel(level + 1) - floor, into = maxed ? 0 : experience - floor;
    return {
      mark: flameMark, label: `Lv ${level}`,
      progress: maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)}`,
      share: maxed ? 1 : needed > 0 ? Math.max(0, Math.min(1, into / needed)) : 0,
      gain: cookingScene.gain, gainLeft: cookingScene.gainLeft, gainUnit: " XP",
    };
  }
  if (kind === "mining") {
    const level = Math.max(0, Math.floor(miningScene.level));
    const { progress, share } = statMilestone(level, MINING_GATES);
    return {
      mark: pickaxeMark, label: `Lv ${formatCompactNumber(level)}`, progress, share,
      gain: miningScene.gain, gainLeft: miningScene.gainLeft, gainUnit: "",
    };
  }
  const level = Math.max(0, Math.floor(woodcuttingScene.level));
  const { progress, share } = statMilestone(level, WOOD_GATES);
  return {
    mark: axeMark, label: `Lv ${formatCompactNumber(level)}`, progress, share,
    gain: woodcuttingScene.gain, gainLeft: woodcuttingScene.gainLeft, gainUnit: "",
  };
}

/** Which gathering or cooking skill badge should show over the player right now, or null. */
export function activeSkillBadge(): OverheadSkillKind | null {
  if (fishingScene.rodOut) return "fishing";
  if (cookingScene.active || cookingScene.badgeLeft > 0) return "cooking";
  if (miningScene.pickaxeOut || miningScene.badgeLeft > 0) return "mining";
  if (woodcuttingScene.hatchetOut || woodcuttingScene.badgeLeft > 0) return "woodcutting";
  return null;
}

/**
 * Over the player while fishing, mining, chopping or cooking, in screen pixels with its bottom middle at (0, bottom):
 * the skill icon and level, progress to the next level or unlock, a thin bar of the same, and each gain rising off it.
 */
export function paintSkillBadge(ctx: CanvasRenderingContext2D, bottom: number, kind: OverheadSkillKind) {
  const spec = badgeSpec(kind), top = bottom - FISHING_BADGE_HEIGHT;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  const labelWidth = ctx.measureText(spec.label).width, progressWidth = ctx.measureText(spec.progress).width;
  const width = Math.round(20 + labelWidth + 12 + progressWidth + 20), left = -width / 2;
  ctx.fillStyle = SURFACE;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(left, top, width, FISHING_BADGE_HEIGHT, 9); ctx.fill(); ctx.stroke();
  const textY = top + 15;
  spec.mark(ctx, left + 15, textY);
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT;
  ctx.fillText(spec.label, left + 26, textY);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.fillText(spec.progress, left + width - 10, textY);
  // The bar along its foot, inside the edge.
  const barX = left + 10, barW = width - 20, barY = top + FISHING_BADGE_HEIGHT - 10;
  ctx.fillStyle = TRACK;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, 4, 2); ctx.fill();
  ctx.fillStyle = TEXT;
  if (spec.share > 0) { ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(4, barW * spec.share), 4, 2); ctx.fill(); }
  // Each completion's gain floats up off the badge and fades.
  if (spec.gainLeft > 0 && spec.gain > 0) {
    const rise = 1 - spec.gainLeft;
    ctx.globalAlpha = Math.min(1, spec.gainLeft * 2.5);
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, .8)";
    ctx.fillStyle = GAIN;
    const gainY = top - 9 - rise * 18, text = `+${formatCompactNumber(spec.gain)}${spec.gainUnit}`;
    ctx.strokeText(text, 0, gainY);
    ctx.fillText(text, 0, gainY);
  }
  ctx.restore();
}

export function paintFishingBadge(ctx: CanvasRenderingContext2D, bottom: number) {
  paintSkillBadge(ctx, bottom, "fishing");
}
