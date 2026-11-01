import { SOUL_STAT_DETAILS, type SoulStatId } from "../../../../shared/soul-dimension";
import { formatCompactNumber } from "../../../../shared/compact-number";
import { soulRewardText, soulStatOfCampName } from "../../soul-world";
import { REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from "../../enemies";
import { clamp } from "../../math";
import type { TextSegment } from "../../canvas";
import { ENEMY_HP_LOSS_FLASH_SECONDS } from "../../constants";
import { enemyHpNumbersEnabled } from "../../../ui/enemy-hp-setting";
import { liveRewardText, soulRewardCapped, type RewardLabelContext } from "../reward-labels";
import { ENEMY_HEALTH_BAR_HEIGHT, ENEMY_HEALTH_FILL, ENEMY_NAME_GAP, createEnemyStatusPlates, drawPillImage, fillPill } from "../enemies/enemy-status-plate";
import type { EnemyState } from "../types";
import type { Camera } from "./camera";
import { cameraZoomPreference } from "./camera-zoom-preference";
import { createCanvasAtlas, drawAtlasImage } from "./canvas-atlas";
import { healthBarTextY } from "./health-bar-layout";
import { plateFont, platePixels, plateSize, plateStroke } from "./nameplate-scale";
import { createPlateLabelSprites, drawPlateLabel, type PlateLabelSprite } from "./plate-label-sprites";
import { canvasRenderPixelRatio } from "./render-budget";
import { transformAtScale } from "./render-space";

type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type OutlinedSegments = (segments: readonly TextSegment[], x: number, y: number, strokeWidth?: number) => void;
type Labels = { name: string; reward: readonly TextSegment[] };

/** The health numbers on a bar, when Settings asks for them. */
const ENEMY_HP_FONT = plateFont(10);
const ENEMY_HP_BAR_HEIGHT = platePixels(11);
const ENEMY_HP_TEXT_STROKE = plateStroke(2);
/** Pixels between the top of an enemy's sprite and the bottom of its bar. */
const ENEMY_BAR_GAP = plateSize(4);
// Rewards under an enemy at full size; names over its bar at plate scale (nameplate-scale.ts).
const REWARD_LABEL_FONT = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const REWARD_STROKE = 4;
const NAME_LABEL_FONT = plateFont(11);
const NAME_STROKE = plateStroke(4);
const NAME_COLOR = "#f5e9c4";
const LOSS_COLOR = "#ffffff";

/**
 * An enemy's overhead plate: its bar, its name over it and its reward under its feet. Where the plate lands
 * one to one on the screen's pixels, the bar, its fill and both labels are copies from the shared plate pages,
 * with nothing measured or looked up by string in a frame; elsewhere they are drawn as text and shapes.
 */
export function createEnemyOverheadPlates(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  devicePixelRatio: () => number;
  rewardMultiplier: () => number;
  rewardAmount?: (type: EnemyDefinition["reward"]["type"], amount: number) => number;
  /** What attack speed and crit enemies' labels are worked out from, so they show what a kill gives now. */
  rewardContext?: () => RewardLabelContext;
  outlinedText: OutlinedText;
  /** Text in several colours as one snapped sprite (canvas.ts): the reward under an enemy. */
  outlinedSegments: OutlinedSegments;
  /** The map being drawn: its labels and plates replace the last map's on the shared pages. */
  mapId?: () => string;
}) {
  const { ctx, camera } = options;
  // Reward runs per label text, so a frame builds none.
  const enemyLabelCache = new Map<string, readonly TextSegment[]>();
  // Plates are packed onto a few shared pages instead of a canvas each (canvas-atlas.ts).
  const plateAtlas = createCanvasAtlas();
  const statusPlates = createEnemyStatusPlates({ pixelRatio: options.devicePixelRatio, atlas: plateAtlas });
  const labelSprites = createPlateLabelSprites(plateAtlas);
  let atlasMapId: string | undefined;
  /** Text is measured on its own small canvas, before the label's room is taken. */
  let labelMeasure: CanvasRenderingContext2D | null | undefined;
  // An enemy's "440 / 500" changes only when its health does: kept per enemy, not formatted every frame.
  const hpLabels = new WeakMap<EnemyState, { hp: number; maxHp: number; label: string }>();
  // Labels that depend on nothing but the reward's amount, kept per enemy until its name or amount changes.
  const fixedLabels = new WeakMap<EnemyState, { name: string; type: string; amount: number; labels: Labels }>();
  const rewardScratch = { type: "damage", amount: 0 } as EnemyDefinition["reward"];

  function enemyHpLabel(enemy: EnemyState, hp: number) {
    const shownHp = Math.max(0, Math.ceil(hp)), shownMax = Math.ceil(enemy.maxHp);
    const cached = hpLabels.get(enemy);
    if (cached && cached.hp === shownHp && cached.maxHp === shownMax) return cached.label;
    const label = `${formatCompactNumber(shownHp)} / ${formatCompactNumber(shownMax)}`;
    hpLabels.set(enemy, { hp: shownHp, maxHp: shownMax, label });
    return label;
  }
  /** How far the names' alphabetic baseline sits above the bottom of their em box. */
  let nameBaselineLift: number | undefined;
  function nameLift() {
    if (nameBaselineLift !== undefined) return nameBaselineLift;
    if (labelMeasure === undefined) labelMeasure = document.createElement("canvas").getContext("2d");
    if (!labelMeasure) return 0;
    labelMeasure.font = NAME_LABEL_FONT;
    labelMeasure.textBaseline = "bottom";
    const fromBottom = labelMeasure.measureText("H").actualBoundingBoxDescent;
    labelMeasure.textBaseline = "alphabetic";
    const fromBaseline = labelMeasure.measureText("H").actualBoundingBoxDescent;
    const lift = fromBaseline - fromBottom;
    return nameBaselineLift = Number.isFinite(lift) && lift >= 0 ? lift : 0;
  }
  /** How far the rewards' alphabetic baseline sits below the top of their em box. */
  let rewardBaselineDrop: number | undefined;
  function rewardDrop() {
    if (rewardBaselineDrop !== undefined) return rewardBaselineDrop;
    if (labelMeasure === undefined) labelMeasure = document.createElement("canvas").getContext("2d");
    if (!labelMeasure) return 0;
    labelMeasure.font = REWARD_LABEL_FONT;
    labelMeasure.textBaseline = "top";
    const fromTop = labelMeasure.measureText("H").actualBoundingBoxAscent;
    labelMeasure.textBaseline = "alphabetic";
    const drop = labelMeasure.measureText("H").actualBoundingBoxAscent - fromTop;
    return rewardBaselineDrop = Number.isFinite(drop) && drop >= 0 ? drop : 0;
  }

  /** A Soul Dimension enemy is named for the soul stat it pays, and shows that flat reward in its colour. */
  function soulEnemyLabels(stat: SoulStatId): Labels {
    const context = options.rewardContext?.();
    const capped = soulRewardCapped(stat, context);
    const multiplier = Math.max(1, context?.soulRewardMultiplier ?? 1);
    const detail = SOUL_STAT_DETAILS[stat];
    return {
      name: `Soul ${detail.label}`,
      reward: cachedLabel(`soul:${stat}:${capped ? "capped" : ""}:${multiplier}`, () => {
        const amount = capped ? "Capped" : stat === "critDamage" ? `+${+(detail.reward * multiplier * 100).toFixed(1)}%` : soulRewardText(stat, multiplier);
        return [{ text: `${amount} `, color: "#ffffff" }, { text: detail.label, color: detail.color }];
      }),
    };
  }

  // A name is cached apart from the reward under it, which moves with the player's attack speed
  // and crit, so the name and its plate are not redrawn at every step.
  function cachedLabel(key: string, create: () => readonly TextSegment[]) {
    let label = enemyLabelCache.get(key);
    if (!label) {
      if (enemyLabelCache.size >= 512) enemyLabelCache.clear();
      enemyLabelCache.set(key, label = create());
    }
    return label;
  }

  function enemyLabels(type: string, reward: EnemyDefinition["reward"]): Labels {
    const amountText = liveRewardText(reward, options.rewardContext?.()) ?? rewardAmountLabel(reward);
    return {
      name: type,
      reward: cachedLabel(`reward:${reward.type}:${amountText}`, () => [
        { text: `${amountText} `, color: "#ffffff" },
        { text: reward.type === "speed" ? "Atk Speed" : reward.type === "crit" ? "Crit Multiplier" : rewardStatLabel(reward), color: REWARD_DATA[reward.type].color },
      ]),
    };
  }

  /** The enemy's name and reward; attack speed and crit follow the player's stats, the rest only the amount. */
  function labelsFor(enemy: EnemyState) {
    const soulStat = soulStatOfCampName(enemy.campName);
    if (soulStat) return soulEnemyLabels(soulStat);
    const name = enemy.displayName ?? (enemy.generatedBoss ? enemy.campName : enemy.type);
    const { type, amount: baseAmount } = enemy.reward;
    const amount = options.rewardAmount?.(type, baseAmount) ?? baseAmount * options.rewardMultiplier();
    rewardScratch.type = type;
    rewardScratch.amount = amount;
    if (type === "speed" || type === "crit") return enemyLabels(name, rewardScratch);
    const kept = fixedLabels.get(enemy);
    if (kept && kept.name === name && kept.type === type && kept.amount === amount) return kept.labels;
    const labels = enemyLabels(name, rewardScratch);
    fixedLabels.set(enemy, { name, type, amount, labels });
    return labels;
  }

  /**
   * The green fill over an enemy's empty bar and, fading, the health just lost. `pixels`: the bar is in
   * device pixels, so the fill's end is rounded to one too, and drawn from the pre-drawn pills.
   */
  function drawEnemyHealthFill(x: number, y: number, width: number, height: number, ratio: number, lossFrom: number | null, lossAlpha: number, pixels: boolean) {
    const at = (value: number) => !pixels ? width * value : value > 0 ? Math.max(1, Math.round(width * value)) : 0;
    const filled = at(ratio);
    if (!pixels || !drawPillImage(ctx, statusPlates, ENEMY_HEALTH_FILL, x, y, filled, height, width)) {
      ctx.fillStyle = ENEMY_HEALTH_FILL;
      fillPill(ctx, x, y, filled, height);
    }
    // Only the health just lost lights up, fading out, the way a boss's bar does.
    if (lossFrom === null) return;
    ctx.save();
    ctx.globalAlpha = lossAlpha;
    const lost = Math.max(1, at(lossFrom) - filled);
    if (!pixels || !drawPillImage(ctx, statusPlates, LOSS_COLOR, x + filled, y, lost, height, width)) {
      ctx.fillStyle = LOSS_COLOR;
      fillPill(ctx, x + filled, y, lost, height);
    }
    ctx.restore();
  }

  /** `spriteTop` and `spriteBottom`: the art's extent from the enemy's point, before the camera's zoom. */
  function draw(enemy: EnemyState, x: number, y: number, spriteTop: number, spriteBottom: number, spriteSize: number, visibility: number) {
    const rewardY = spriteBottom * camera.zoom + 13;
    // A long, thin pill with no numbers: one plate image at full health, one fill when wounded.
    const barW = platePixels(Math.max(60, Math.min(100, spriteSize * 1.35)));
    // Taller with the numbers on it (Settings > Enemy HP Numbers), with the same bottom edge.
    const showNumbers = enemyHpNumbersEnabled();
    const barH = showNumbers ? ENEMY_HP_BAR_HEIGHT : ENEMY_HEALTH_BAR_HEIGHT;
    const barX = -barW / 2;
    const barCenterX = barX + barW / 2;
    const barY = spriteTop * camera.zoom - ENEMY_BAR_GAP - barH;
    const displayedHp = enemy.remoteCombatHp ?? enemy.hp;
    const hpRatio = clamp(displayedHp / enemy.maxHp, 0, 1);
    // A full atlas starts over only here, before this enemy takes anything from it; a new map lets every page go.
    const mapId = options.mapId?.();
    if (mapId !== atlasMapId) {
      atlasMapId = mapId;
      enemyLabelCache.clear();
      plateAtlas.release();
    }
    plateAtlas.resetIfFull();
    const labels = labelsFor(enemy);
    const rewardShown = !enemy.remoteCombatGhost && !enemy.generatedBoss;
    // The empty bar, plus the full bar at full health: one image shared by
    // every enemy with a bar this size (enemy-status-plate.ts).
    const full = hpRatio >= 1;
    const lossTimer = enemy.hpLossFlashTimer ?? 0;
    const lossFrom = lossTimer > 0 && (enemy.hpLossFlashFrom ?? 0) > displayedHp
      ? clamp((enemy.hpLossFlashFrom ?? 0) / enemy.maxHp, hpRatio, 1) : null;
    const lossAlpha = visibility * clamp(lossTimer / ENEMY_HP_LOSS_FLASH_SECONDS, 0, 1);

    // Labels are sized on screen, as drawScreenSpaceAt (render-space.ts) sizes them.
    const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
    const labelScale = cameraZoomPreference() / zoom;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(labelScale, labelScale);
    try {
      ctx.globalAlpha = visibility;
      // At the plates' own scale the bar is drawn on whole device pixels: its plate copied one to one,
      // the fill on the same edges, and the text placed from where the bar landed.
      const scale = options.devicePixelRatio() * cameraZoomPreference();
      const grid = transformAtScale(ctx, scale);
      let barTop = barY, barHeight = barH;
      if (grid) {
        const plate = statusPlates.plate(barW, barH, full, scale);
        const left = Math.round(grid.a * barX + grid.e), top = Math.round(grid.d * barY + grid.f);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawAtlasImage(ctx, plate, left - plate.inset, top - plate.inset, plate.pixelWidth, plate.pixelHeight);
        if (!full) drawEnemyHealthFill(left, top, plate.barPixelWidth, plate.barPixelHeight, hpRatio, lossFrom, lossAlpha, true);
        barTop = (top - grid.f) / grid.d;
        barHeight = plate.barPixelHeight / grid.d;
        // canvas.ts draws text one to one at the pixel ratio times the player's zoom; anywhere else it scales its sprites.
        const textScale = canvasRenderPixelRatio(window.devicePixelRatio || 1) * cameraZoomPreference();
        const oneToOne = Math.abs(grid.a - textScale) < .01 && Math.abs(grid.d - textScale) < .01;
        const direction = oneToOne ? ctx.direction : "inherit";
        const name = oneToOne ? labelSprites.name(labels.name, NAME_COLOR, NAME_LABEL_FONT, NAME_STROKE, textScale, direction) : null;
        const reward = oneToOne && rewardShown ? labelSprites.segments(labels.reward, REWARD_LABEL_FONT, REWARD_STROKE, textScale, direction) : null;
        drawLabels(grid, labels, barCenterX, barTop, barHeight, rewardY, enemy, displayedHp, showNumbers, rewardShown, name, reward);
        return;
      }
      const plate = statusPlates.plate(barW, barH, full);
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      drawAtlasImage(ctx, plate, barX + plate.left, barY + plate.top, plate.width, plate.height);
      ctx.imageSmoothingEnabled = smoothing;
      if (!full) drawEnemyHealthFill(barX, barY, barW, barH, hpRatio, lossFrom, lossAlpha, false);
      drawLabels(null, labels, barCenterX, barTop, barHeight, rewardY, enemy, displayedHp, showNumbers, rewardShown, null, null);
    } finally {
      ctx.restore();
    }
  }

  /** The name, the health numbers when shown and the reward: from the pages when given, else as text under `grid`. */
  function drawLabels(grid: DOMMatrix | null, labels: Labels, centerX: number, barTop: number, barHeight: number, rewardY: number,
    enemy: EnemyState, displayedHp: number, showNumbers: boolean, rewardShown: boolean, name: PlateLabelSprite | null, reward: PlateLabelSprite | null) {
    const nameY = barTop - ENEMY_NAME_GAP - nameLift();
    if (grid && name) drawPlateLabel(ctx, grid, name, centerX, nameY);
    else {
      if (grid) ctx.setTransform(grid);
      ctx.font = NAME_LABEL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      options.outlinedText(labels.name, centerX, nameY, NAME_COLOR, NAME_STROKE);
    }
    if (showNumbers) {
      if (grid) ctx.setTransform(grid);
      ctx.textAlign = "center";
      ctx.font = ENEMY_HP_FONT;
      ctx.textBaseline = "middle";
      options.outlinedText(enemyHpLabel(enemy, displayedHp), centerX, healthBarTextY(barTop, barHeight), "#ffffff", ENEMY_HP_TEXT_STROKE);
    }
    if (!rewardShown) return;
    const y = rewardY + rewardDrop();
    if (grid && reward) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawPlateLabel(ctx, grid, reward, 0, y);
      return;
    }
    if (grid) ctx.setTransform(grid);
    ctx.font = REWARD_LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    options.outlinedSegments(labels.reward, 0, y, REWARD_STROKE);
  }

  return { draw };
}