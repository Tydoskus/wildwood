import { carapaceAnglerSpriteFrame } from "./carapace-angler-sprite";
import { BOSS_ART } from "./boss-art";
import { DRAGON_SPRITE_Y_OFFSET, DRAGON_SPRITE_GROUND_OFFSET, DRAGON_ART_TOP, PRISMSHELL_SPRITE_GROUND_OFFSET, PRISMSHELL_ART_TOP, IRONHORN_ART_TOP, DREADREAPER_ART_TOP } from "../constants";
import { drawVerdantAttacks } from "./verdant-attack-art";
import { drawIonAttacks } from "./ion-attack-art";
import { drawNeonAttacks } from "./neon-attack-art";
import { drawVoltwardenArt, VOLTWARDEN_ART_TOP } from "./neon-boss-art";
import { drawGravebloomArt, GRAVEBLOOM_ART_TOP } from "./verdant-boss-art";
import { drawAegisPrimeArt, AEGIS_PRIME_ART_TOP } from "./ion-boss-art";
import { drawBossAtlasFrame } from "./boss-atlas-drawing";
import { bossFrameCrop, drawBossSheetFrame } from "./boss-frame-crop";
import { createGloomrootSpriteCache, GLOOMROOT_SPRITE_FILTER, paintGloomrootAura } from "./gloomroot-sprite-cache";
import { bossVerticalRadius } from "../../../shared/boss-hitbox";
import {
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  FROSTCLAW_RIFT_RANGE,
  FROSTCLAW_ROAR_RANGE,
  FROSTCLAW_SPRITE_GROUND_OFFSET,
  FROSTCLAW_SPRITE_Y_OFFSET,
  GLOOMROOT_SPRITE_GROUND_OFFSET,
  GLOOMROOT_SPRITE_Y_OFFSET,
  GLOOMROOT_SWEEP_HALF_ANGLE,
  GLOOMROOT_SWEEP_RANGE,
  MAGMALISK_BITE_HALF_ANGLE,
  MAGMALISK_BITE_RANGE,
  MAGMALISK_SPRITE_GROUND_OFFSET,
  MAGMALISK_SPRITE_Y_OFFSET,
  FROSTCLAW_ART_TOP,
  GLOOMROOT_ART_TOP,
  MAGMALISK_ART_TOP,
  MIREMAW_ART_TOP,
  SPIDER_ART_TOP,
  SPIDER_SPRITE_GROUND_OFFSET,
  TEMPEST_KIRIN_ART_TOP,
  MIREMAW_SPRITE_GROUND_OFFSET,
  MIREMAW_SPRITE_Y_OFFSET,
  KOI_SHOGUN_ART_TOP,
  PRISMSHELL_SPRITE_Y_OFFSET, IRONHORN_SPRITE_Y_OFFSET, DREADREAPER_SPRITE_Y_OFFSET, VOLTWARDEN_SPRITE_Y_OFFSET, GRAVEBLOOM_SPRITE_Y_OFFSET, AEGIS_PRIME_SPRITE_Y_OFFSET,
  MIREMAW_TONGUE_HALF_ANGLE,
  PRISMSHELL_SHATTER_HALF_ANGLE, IRONHORN_SHATTER_HALF_ANGLE, DREADREAPER_SHATTER_HALF_ANGLE,
  MIREMAW_TONGUE_RANGE,
  PRISMSHELL_SHATTER_RANGE, IRONHORN_SHATTER_RANGE, DREADREAPER_SHATTER_RANGE,
  KOI_SHOGUN_SLASH_HALF_ANGLE,
  KOI_SHOGUN_SLASH_RANGE,
  KOI_SHOGUN_SPRITE_GROUND_OFFSET,
  KOI_SHOGUN_SPRITE_Y_OFFSET,
  TIDEWYRM_SPRITE_Y_OFFSET,
  TIDEWYRM_SURGE_HALF_ANGLE,
  TIDEWYRM_SURGE_RANGE,
  TEMPEST_KIRIN_CHARGE_HALF_ANGLE,
  TEMPEST_KIRIN_CHARGE_RANGE,
  TEMPEST_KIRIN_SPRITE_GROUND_OFFSET,
  TEMPEST_KIRIN_SPRITE_Y_OFFSET,
  TAU,
} from "../constants";
import { clamp } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import type { Camera } from "./camera";
import {
  BOSS_NAME_FONT_SIZE,
  BOSS_STATUS_HEALTH_FONT_SIZE,
  bossStatusLabelOffsets,
} from "./boss-label-style";
import { healthBarTextY } from "./health-bar-layout";
import { BOSS_KINDS, type BossArtAssets, type BossHazards, type BossKind, type BossStates } from "./boss-registry";
import { drawScreenSpaceAt, snapWorldRenderCoordinate } from "./render-space";
import { scorpionSpriteFrame } from "./scorpion-sprite";
import { prismshellSpriteFrame } from "./prismshell-sprite";
import { ironhornSpriteFrame } from "./ironhorn-sprite";
import { dreadreaperSpriteFrame } from "./dreadreaper-sprite";

type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

/** The colours that set apart the crystal-shatter telegraph three bosses share. */
type ShatterPalette = {
  windupFill: string;
  windupStroke: string;
  activeFill: string;
  activeStroke: string;
  /** "r,g,b" of the burst fill; its alpha grows as the burst lands. */
  burstFill: string;
  burstStroke: string;
  oddShard: string;
  evenShard: string;
};
const PRISMSHELL_PALETTE: ShatterPalette = {
  windupFill: "rgba(171,139,230,.17)", windupStroke: "rgba(208,181,255,.96)",
  activeFill: "rgba(148,232,244,.24)", activeStroke: "rgba(213,252,255,.98)",
  burstFill: "172,142,226", burstStroke: "rgba(222,204,255,.96)",
  oddShard: "rgba(180,243,255,.92)", evenShard: "rgba(220,181,255,.92)",
};
const IRONHORN_PALETTE: ShatterPalette = {
  windupFill: "rgba(223,162,69,.17)", windupStroke: "rgba(255,215,139,.96)",
  activeFill: "rgba(247,202,107,.24)", activeStroke: "rgba(255,234,182,.98)",
  burstFill: "217,149,64", burstStroke: "rgba(255,213,127,.96)",
  oddShard: "rgba(255,193,96,.92)", evenShard: "rgba(201,220,207,.92)",
};
const DREADREAPER_PALETTE: ShatterPalette = {
  windupFill: "rgba(141,206,109,.17)", windupStroke: "rgba(205,255,162,.96)",
  activeFill: "rgba(210,244,137,.24)", activeStroke: "rgba(231,255,203,.98)",
  burstFill: "132,201,104", burstStroke: "rgba(224,255,176,.96)",
  oddShard: "rgba(179,235,116,.92)", evenShard: "rgba(240,175,91,.92)",
};

const BOSS_LABEL_FONT_FAMILY = '"Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const bossLabelFont = (size: number) => `900 ${size}px ${BOSS_LABEL_FONT_FAMILY}`;

export function createBossRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  devicePixelRatio: () => number;
  bosses: BossStates;
  hazards: BossHazards;
  art: BossArtAssets;
  gameTime: () => number;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  /** Developer overlay: draw each boss's collision shape over its artwork. */
  showBossHitboxes?: () => boolean;
  hpLossFlashDuration: number;
  spiderWebRange: number;
}) {
  const { ctx, camera, bosses, hazards, art } = options;
  const {
    dragon: boss, spider: spiderBoss, frostclaw: frostclawBoss, magmalisk: magmaliskBoss, gloomroot: gloomrootBoss,
    tidewyrm: tidewyrmBoss, koiShogun: koiShogunBoss, tempestKirin: tempestKirinBoss, miremaw: miremawBoss,
    prismshell: prismshellBoss, ironhorn: ironhornBoss, dreadreaper: dreadreaperBoss, voltwarden: voltwardenBoss,
    gravebloom: gravebloomBoss, aegisPrime: aegisPrimeBoss,
  } = bosses;
  const screenX = (worldX: number) => snapWorldRenderCoordinate(worldX - camera.x, camera.zoom, options.devicePixelRatio());
  const screenY = (worldY: number) => snapWorldRenderCoordinate(worldY - camera.y, camera.zoom, options.devicePixelRatio());
  const gloomrootSprites = createGloomrootSpriteCache();
  /**
   * The collision shape the server hits a boss with, drawn over its artwork.
   *
   * A boss is hit as an ellipse around its position: `r` across, and `ry`
   * down when the boss carries one. Nothing lines these two up automatically,
   * so the only way to see whether a hitbox matches what a player can see is
   * to draw it. Developer overlay; off by default.
   */
  function drawBossHitboxes() {
    if (!options.showBossHitboxes?.()) return;
    ctx.save();
    ctx.lineWidth = 3;
    for (const boss of BOSS_KINDS.map((kind) => bosses[kind])) {
      if (!boss || boss.dead || !(boss.r > 0)) continue;
      const x = screenX(boss.x);
      const y = screenY(boss.y);
      const horizontal = boss.r;
      const vertical = bossVerticalRadius(boss.r, (boss as { ry?: number }).ry);
      const centreY = y + ((boss as { hitboxOffsetY?: number }).hitboxOffsetY ?? 0);
      ctx.strokeStyle = "rgba(255, 64, 160, .95)";
      ctx.beginPath();
      ctx.ellipse(x, centreY, horizontal, vertical, 0, 0, TAU);
      ctx.stroke();
      // A cross at the anchor: the position the server measures from, which is
      // not always where the artwork's middle looks like it is.
      ctx.strokeStyle = "rgba(255, 255, 255, .9)";
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The stand-in for a horned boss whose art did not load: a body and two horns. */
  function drawHornedSilhouette(body: string, outline: string, horns: string) {
    ctx.fillStyle = body;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, 55, 160, 105, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = horns;
    ctx.beginPath();
    ctx.moveTo(-105, -5);
    ctx.lineTo(-70, -130);
    ctx.lineTo(-25, -5);
    ctx.moveTo(25, -5);
    ctx.lineTo(70, -130);
    ctx.lineTo(105, -5);
    ctx.fill();
    ctx.stroke();
  }
  function drawBossStatus(options_: {
    x: number;
    spriteTopY: number;
    barGap: number;
    barWidth: number;
    barHeight: number;
    hp: number;
    maxHp: number;
    hpLossFlashTimer: number;
    hpLossFlashFrom: number;
    backgroundColor: string;
    fillColor: string;
    name: { text: string; color: string };
    rewardBottomOffsetY?: number;
  }) {
    drawScreenSpaceAt(ctx, camera.zoom, options_.x, options_.spriteTopY, () => {
      const barX = -Math.floor(options_.barWidth / 2);
      const barY = -options_.barGap;
      const ratio = clamp(options_.hp / options_.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.9)";
      ctx.fillRect(barX - 2, barY - 2, options_.barWidth + 4, options_.barHeight + 4);
      ctx.fillStyle = options_.backgroundColor;
      ctx.fillRect(barX, barY, options_.barWidth, options_.barHeight);
      ctx.fillStyle = options_.fillColor;
      ctx.fillRect(barX, barY, Math.round(options_.barWidth * ratio), options_.barHeight);
      if (options_.hpLossFlashTimer > 0 && options_.hpLossFlashFrom > options_.hp) {
        const fromRatio = clamp(options_.hpLossFlashFrom / options_.maxHp, ratio, 1);
        ctx.save();
        ctx.globalAlpha = clamp(options_.hpLossFlashTimer / options.hpLossFlashDuration, 0, 1);
        ctx.fillStyle = "#fff";
        ctx.fillRect(
          barX + Math.round(options_.barWidth * ratio),
          barY,
          Math.max(1, Math.round(options_.barWidth * (fromRatio - ratio))),
          options_.barHeight,
        );
        ctx.restore();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = bossLabelFont(BOSS_STATUS_HEALTH_FONT_SIZE);
      options.outlinedText(
        `${formatCompactNumber(Math.max(0, Math.ceil(options_.hp)))} / ${formatCompactNumber(Math.ceil(options_.maxHp))}`,
        0,
        healthBarTextY(barY, options_.barHeight),
        "#fff",
        4,
      );
      ctx.textBaseline = "bottom";
      const labelOffsets = bossStatusLabelOffsets(0, options_.rewardBottomOffsetY);
      ctx.font = bossLabelFont(BOSS_NAME_FONT_SIZE);
      options.outlinedText(options_.name.text, 0, barY + labelOffsets.name, options_.name.color, 4);
    });
  }
  function drawBossTelegraphs() {
    if (boss.dead) return;
    if (boss.cone) {
      const x = screenX(boss.x); const y = screenY(boss.y); const cone = boss.cone;
      ctx.save(); ctx.fillStyle = "rgba(255,52,42,.20)"; ctx.strokeStyle = "rgba(255,92,64,.92)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, BOSS_CONE_RANGE, cone.angle - BOSS_CONE_HALF_ANGLE, cone.angle + BOSS_CONE_HALF_ANGLE); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (cone.windup <= 0) { const waveRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * clamp(1 - cone.timer / cone.duration, 0, 1); for (let index = 0; index < 9; index += 1) { const angle = cone.angle - BOSS_CONE_HALF_ANGLE + index / 8 * BOSS_CONE_HALF_ANGLE * 2; const fireX = x + Math.cos(angle) * waveRadius; const fireY = y + Math.sin(angle) * waveRadius; ctx.fillStyle = "#a83218"; options.pixelCircle(fireX, fireY, 15); ctx.fillStyle = "#ff6a28"; options.pixelCircle(fireX, fireY - 2, 11); ctx.fillStyle = "#ffd05c"; options.pixelCircle(fireX, fireY - 4, 6); } }
      ctx.restore();
    }
    for (const strike of hazards.dragon) { const x = screenX(strike.x); const y = screenY(strike.y); const progress = 1 - clamp(strike.timer / strike.maxTimer, 0, 1); const fallY = y - 150 * (1 - progress); ctx.save(); ctx.strokeStyle = "rgba(255,70,54,.92)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, strike.r, 0, TAU); ctx.stroke(); ctx.fillStyle = "#ff5b36"; options.pixelCircle(x, fallY, 9); ctx.fillStyle = "#ffd05c"; options.pixelCircle(x, fallY, 5); ctx.restore(); }
  }
  function drawBoss() {
    if (boss.dead || !art.dragon.ready()) return;
    const canvas = art.dragon.canvas; const cellW = canvas.width / 4; const drawW = BOSS_ART.DRAGON.drawWidth; const drawH = BOSS_ART.DRAGON.drawHeight; const x = screenX(boss.x); const y = screenY(boss.y);
    const frame = Math.floor(options.gameTime() * 4) % 4;
    options.drawShadow(x, y + DRAGON_SPRITE_Y_OFFSET + DRAGON_SPRITE_GROUND_OFFSET, BOSS_ART.DRAGON.shadowWidth, .24);
    ctx.save(); ctx.translate(x, y + DRAGON_SPRITE_Y_OFFSET);
    drawBossSheetFrame(ctx, canvas, { bossId: "DRAGON", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH }); ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: y + DRAGON_SPRITE_Y_OFFSET + DRAGON_ART_TOP + (bossFrameCrop("DRAGON", frame).statusOffsetY ?? 0),
      barGap: 20,
      barWidth: 220,
      barHeight: 20,
      hp: boss.hp,
      maxHp: boss.maxHp,
      hpLossFlashTimer: boss.hpLossFlashTimer,
      hpLossFlashFrom: boss.hpLossFlashFrom,
      backgroundColor: "#4d1d1d",
      fillColor: "#d8352d",
      name: { text: "Dragon", color: "#f5e9c4" },
      rewardBottomOffsetY: -5,
    });
  }
  function drawSpiderTelegraphs() {
    if (spiderBoss.dead) return; const x = screenX(spiderBoss.x); const y = screenY(spiderBoss.y);
    if (spiderBoss.web) { const radius = spiderBoss.r + (options.spiderWebRange - spiderBoss.r) * clamp(1 - spiderBoss.web.timer / spiderBoss.web.duration, 0, 1); ctx.save(); ctx.strokeStyle = "rgba(235,239,218,.9)"; ctx.lineWidth = 7; ctx.setLineDash([13, 10]); ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke(); ctx.restore(); }
    for (const pool of hazards.spider) { const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1); ctx.save(); ctx.fillStyle = `rgba(113,214,71,${.12 + progress * .18})`; ctx.strokeStyle = "rgba(155,238,88,.95)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(screenX(pool.x), screenY(pool.y), pool.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  function drawSpiderBoss() {
    if (spiderBoss.dead || !art.spider.ready()) return;
    const canvas = art.spider.canvas;
    const frame = scorpionSpriteFrame(options.gameTime(), canvas.width, canvas.height);
    const x = screenX(spiderBoss.x);
    const y = screenY(spiderBoss.y);
    const spriteTopY = y + frame.topOffset;
    options.drawShadow(x, y + SPIDER_SPRITE_GROUND_OFFSET, BOSS_ART.SPIDER.shadowWidth, .24);
    // Through the same path as every other sheet boss, so its frames can be
    // corrected too. The scorpion is placed from its feet, hence the top.
    ctx.save();
    ctx.translate(x, 0);
    drawBossSheetFrame(ctx, canvas, {
      bossId: "SPIDER", frame: frame.index,
      sourceX: frame.sourceX, sourceY: frame.sourceY,
      cellWidth: frame.sourceWidth, cellHeight: frame.sourceHeight,
      drawWidth: frame.drawWidth, drawHeight: frame.drawHeight, top: spriteTopY,
    });
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: y + SPIDER_ART_TOP + (bossFrameCrop("SPIDER", frame.index).statusOffsetY ?? 0),
      barGap: 32,
      barWidth: 250,
      barHeight: 22,
      hp: spiderBoss.hp,
      maxHp: spiderBoss.maxHp,
      hpLossFlashTimer: spiderBoss.hpLossFlashTimer,
      hpLossFlashFrom: spiderBoss.hpLossFlashFrom,
      backgroundColor: "#342027",
      fillColor: "#9f5c2f",
      name: { text: "Desert Scorpion", color: "#f5e9c4" },
      rewardBottomOffsetY: -5,
    });
  }

  function drawFrostclawTelegraphs() {
    if (frostclawBoss.dead) return;
    const x = screenX(frostclawBoss.x);
    const y = screenY(frostclawBoss.y);
    const time = options.gameTime();
    if (frostclawBoss.roar) {
      const roar = frostclawBoss.roar;
      ctx.save();
      if (roar.windup > 0) {
        const charge = clamp(1 - roar.windup / .85, 0, 1);
        ctx.fillStyle = `rgba(91,220,255,${.08 + charge * .12})`;
        ctx.beginPath(); ctx.arc(x, y, frostclawBoss.r + 95 * charge, 0, TAU); ctx.fill();
        for (let ring = 0; ring < 3; ring += 1) {
          ctx.strokeStyle = `rgba(190,249,255,${.28 + charge * .2})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([8 + ring * 3, 7]);
          ctx.lineDashOffset = -time * (35 + ring * 12);
          ctx.beginPath(); ctx.arc(x, y, frostclawBoss.r + 24 + ring * 26 + charge * 26, 0, TAU); ctx.stroke();
        }
      } else {
        const progress = clamp(1 - roar.timer / roar.duration, 0, 1);
        const radius = frostclawBoss.r + (FROSTCLAW_ROAR_RANGE - frostclawBoss.r) * progress;
        ctx.strokeStyle = "rgba(217,252,255,.95)"; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(66,196,255,.72)"; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();
        for (let shard = 0; shard < 24; shard += 1) {
          const angle = shard * TAU / 24 + time * .3;
          const shardX = x + Math.cos(angle) * radius;
          const shardY = y + Math.sin(angle) * radius;
          ctx.save(); ctx.translate(shardX, shardY); ctx.rotate(angle + Math.PI / 2);
          ctx.fillStyle = shard % 2 ? "#d9fbff" : "#68d9ff";
          ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }
    if (frostclawBoss.rift) {
      const rift = frostclawBoss.rift;
      const active = rift.windup <= 0;
      const progress = active ? clamp(1 - rift.timer / rift.duration, 0, 1) : 0;
      ctx.save();
      for (const offset of [-.28, 0, .28]) {
        const angle = rift.angle + offset;
        ctx.strokeStyle = active ? "rgba(109,224,255,.92)" : "rgba(202,248,255,.66)";
        ctx.lineWidth = active ? 13 : 4;
        ctx.setLineDash(active ? [] : [18, 12]);
        ctx.lineDashOffset = -time * 38;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * frostclawBoss.r, y + Math.sin(angle) * frostclawBoss.r);
        ctx.lineTo(x + Math.cos(angle) * FROSTCLAW_RIFT_RANGE, y + Math.sin(angle) * FROSTCLAW_RIFT_RANGE); ctx.stroke();
        if (!active) continue;
        const waveRadius = frostclawBoss.r + (FROSTCLAW_RIFT_RANGE - frostclawBoss.r) * progress;
        for (let shard = 0; shard < 5; shard += 1) {
          const radius = waveRadius - shard * 24;
          if (radius < frostclawBoss.r) continue;
          const shardX = x + Math.cos(angle) * radius;
          const shardY = y + Math.sin(angle) * radius;
          ctx.save(); ctx.translate(shardX, shardY); ctx.rotate(angle + Math.PI / 2);
          ctx.fillStyle = shard % 2 ? "#e2fdff" : "#38bff2";
          ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(11, 11); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }
    for (const strike of hazards.frostclaw) {
      const progress = 1 - clamp(strike.timer / strike.maxTimer, 0, 1);
      const strikeX = screenX(strike.x);
      const strikeY = screenY(strike.y);
      const fallY = strikeY - 220 * (1 - progress);
      ctx.save();
      ctx.fillStyle = `rgba(75,193,244,${.08 + progress * .18})`;
      ctx.strokeStyle = "rgba(205,249,255,.92)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -time * 32;
      ctx.beginPath(); ctx.arc(strikeX, strikeY, strike.r * (.7 + progress * .3), 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      const gradient = ctx.createLinearGradient(strikeX, fallY - 30, strikeX, fallY + 34);
      gradient.addColorStop(0, "rgba(231,253,255,.96)");
      gradient.addColorStop(1, "rgba(49,176,236,.94)");
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(strikeX, fallY + 35); ctx.lineTo(strikeX - 13, fallY - 12); ctx.lineTo(strikeX, fallY - 32); ctx.lineTo(strikeX + 13, fallY - 12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawFrostclawBoss() {
    if (frostclawBoss.dead || !art.frostclaw.ready()) return;
    const canvas = art.frostclaw.canvas;
    const cellW = canvas.width / 4;
    const drawW = BOSS_ART.FROSTCLAW.drawWidth;
    const drawH = BOSS_ART.FROSTCLAW.drawHeight;
    const x = screenX(frostclawBoss.x);
    const y = screenY(frostclawBoss.y);
    const visualY = y + FROSTCLAW_SPRITE_Y_OFFSET;
    const frame = frostclawBoss.roar ? 2 : frostclawBoss.rift ? 1 : hazards.frostclaw.length ? 3 : Math.floor(options.gameTime() * 3.5) % 4;
    const pulse = frostclawBoss.roar ? 1 + Math.sin(options.gameTime() * 15) * .018 : 1;
    options.drawShadow(x, visualY + FROSTCLAW_SPRITE_GROUND_OFFSET, BOSS_ART.FROSTCLAW.shadowWidth, .27);
    ctx.save(); ctx.translate(x, visualY + 2); ctx.scale(pulse, pulse);
    drawBossSheetFrame(ctx, canvas, { bossId: "FROSTCLAW", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH }); ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + FROSTCLAW_ART_TOP + (bossFrameCrop("FROSTCLAW", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 270,
      barHeight: 22,
      hp: frostclawBoss.hp,
      maxHp: frostclawBoss.maxHp,
      hpLossFlashTimer: frostclawBoss.hpLossFlashTimer,
      hpLossFlashFrom: frostclawBoss.hpLossFlashFrom,
      backgroundColor: "#17364b",
      fillColor: "#42c9f5",
      name: { text: "Frostclaw", color: "#dff8ff" },
    });
  }

  function drawMagmaliskTelegraphs() {
    if (magmaliskBoss.dead) return;
    const x = screenX(magmaliskBoss.x);
    const y = screenY(magmaliskBoss.y);
    const time = options.gameTime();
    if (magmaliskBoss.bite) {
      const bite = magmaliskBoss.bite;
      ctx.save();
      ctx.fillStyle = bite.windup > 0 ? "rgba(255,116,35,.15)" : "rgba(255,72,24,.22)";
      ctx.strokeStyle = "rgba(255,151,52,.94)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, MAGMALISK_BITE_RANGE, bite.angle - MAGMALISK_BITE_HALF_ANGLE, bite.angle + MAGMALISK_BITE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (bite.windup <= 0) {
        const radius = magmaliskBoss.r + (MAGMALISK_BITE_RANGE - magmaliskBoss.r) * clamp(1 - bite.timer / bite.duration, 0, 1);
        for (let flame = 0; flame < 11; flame += 1) {
          const angle = bite.angle - MAGMALISK_BITE_HALF_ANGLE + flame / 10 * MAGMALISK_BITE_HALF_ANGLE * 2;
          ctx.fillStyle = flame % 2 ? "#ffad2f" : "#ff5b22";
          options.pixelCircle(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, flame % 2 ? 12 : 16);
        }
      }
      ctx.restore();
    }
    for (const eruption of hazards.magmalisk) {
      const progress = 1 - clamp(eruption.timer / eruption.maxTimer, 0, 1);
      const strikeX = screenX(eruption.x);
      const strikeY = screenY(eruption.y);
      const fallY = strikeY - 230 * (1 - progress);
      ctx.save();
      ctx.fillStyle = `rgba(255,84,28,${.1 + progress * .2})`;
      ctx.strokeStyle = "rgba(255,176,58,.96)";
      ctx.lineWidth = 5;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -time * 38;
      ctx.beginPath(); ctx.arc(strikeX, strikeY, eruption.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#3b2925"; options.pixelCircle(strikeX, fallY, 14);
      ctx.fillStyle = "#ff6b21"; options.pixelCircle(strikeX, fallY + 3, 9);
      ctx.fillStyle = "#ffd34b"; options.pixelCircle(strikeX, fallY + 5, 4);
      ctx.restore();
    }
  }

  function drawMagmaliskBoss() {
    if (magmaliskBoss.dead || !art.magmalisk.ready()) return;
    const canvas = art.magmalisk.canvas;
    const cellW = canvas.width / 4;
    // The selected Magmalisk animation deliberately uses only source frames 0–2.
    const frame = hazards.magmalisk.length > 0 ? 2 : magmaliskBoss.bite ? 1 : 0;
    // Preprocessing isolates and re-packs each connected pose before rendering.
    const drawW = BOSS_ART.MAGMALISK.drawWidth;
    const drawH = BOSS_ART.MAGMALISK.drawHeight;
    const x = screenX(magmaliskBoss.x);
    const y = screenY(magmaliskBoss.y);
    const visualY = y + MAGMALISK_SPRITE_Y_OFFSET;
    const pulse = hazards.magmalisk.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    options.drawShadow(x, visualY + MAGMALISK_SPRITE_GROUND_OFFSET, BOSS_ART.MAGMALISK.shadowWidth, .29);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    drawBossSheetFrame(ctx, canvas, { bossId: "MAGMALISK", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH });
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + MAGMALISK_ART_TOP + (bossFrameCrop("MAGMALISK", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 290,
      barHeight: 23,
      hp: magmaliskBoss.hp,
      maxHp: magmaliskBoss.maxHp,
      hpLossFlashTimer: magmaliskBoss.hpLossFlashTimer,
      hpLossFlashFrom: magmaliskBoss.hpLossFlashFrom,
      backgroundColor: "#4b2119",
      fillColor: "#ef6428",
      name: { text: "Magmalisk", color: "#ffe0ad" },
    });
  }

  function drawGloomrootTelegraphs() {
    if (gloomrootBoss.dead) return;
    const x = screenX(gloomrootBoss.x);
    const y = screenY(gloomrootBoss.y);
    const time = options.gameTime();
    if (gloomrootBoss.sweep) {
      const sweep = gloomrootBoss.sweep;
      ctx.save();
      ctx.fillStyle = sweep.windup > 0 ? "rgba(63,214,221,.13)" : "rgba(73,239,238,.22)";
      ctx.strokeStyle = "rgba(128,247,244,.95)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, GLOOMROOT_SWEEP_RANGE, sweep.angle - GLOOMROOT_SWEEP_HALF_ANGLE, sweep.angle + GLOOMROOT_SWEEP_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (sweep.windup <= 0) {
        const radius = gloomrootBoss.r + (GLOOMROOT_SWEEP_RANGE - gloomrootBoss.r) * clamp(1 - sweep.timer / sweep.duration, 0, 1);
        for (let root = 0; root < 13; root += 1) {
          const angle = sweep.angle - GLOOMROOT_SWEEP_HALF_ANGLE + root / 12 * GLOOMROOT_SWEEP_HALF_ANGLE * 2;
          ctx.fillStyle = root % 2 ? "#56e7e9" : "#173d55";
          options.pixelCircle(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, root % 2 ? 10 : 15);
        }
      }
      ctx.restore();
    }
    for (const bloom of hazards.gloomroot) {
      const progress = 1 - clamp(bloom.timer / bloom.maxTimer, 0, 1);
      const bloomX = screenX(bloom.x);
      const bloomY = screenY(bloom.y);
      ctx.save();
      ctx.fillStyle = `rgba(36,196,210,${.08 + progress * .2})`;
      ctx.strokeStyle = "rgba(116,244,239,.96)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -time * 35;
      ctx.beginPath(); ctx.arc(bloomX, bloomY, bloom.r * (.72 + progress * .28), 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      for (let thorn = 0; thorn < 7; thorn += 1) {
        const angle = thorn * TAU / 7 + time * .45;
        const radius = bloom.r * (.35 + progress * .45);
        ctx.fillStyle = thorn % 2 ? "#7af5ee" : "#294d72";
        options.pixelCircle(bloomX + Math.cos(angle) * radius, bloomY + Math.sin(angle) * radius, 6 + progress * 4);
      }
      ctx.restore();
    }
  }

  function drawGloomrootBoss() {
    if (gloomrootBoss.dead) return;
    const canvas = art.gloomroot.canvas;
    const frame = hazards.gloomroot.length > 0 ? 3 : gloomrootBoss.sweep ? 1 : 0;
    const drawW = BOSS_ART.GLOOMROOT.drawWidth;
    const drawH = BOSS_ART.GLOOMROOT.drawHeight;
    const x = screenX(gloomrootBoss.x);
    const y = screenY(gloomrootBoss.y);
    const visualY = y + GLOOMROOT_SPRITE_Y_OFFSET;
    const pulse = hazards.gloomroot.length > 0 ? 1 + Math.sin(options.gameTime() * 13) * .018 : 1;
    options.drawShadow(x, visualY + GLOOMROOT_SPRITE_GROUND_OFFSET, BOSS_ART.GLOOMROOT.shadowWidth, .3);

    // A soft moon-sap aura separates the dark treant from the Night Forest,
    // while the fallback guarantees a visible target if its art fails to load.
    // The aura and the filtered frames are baked once and copied each frame.
    if (!gloomrootSprites.drawAura(ctx, x, visualY)) paintGloomrootAura(ctx, x, visualY);

    ctx.save();
    ctx.translate(x, visualY);
    if (art.gloomroot.ready() && canvas.width >= 2 && canvas.height >= 2) {
      const cellW = canvas.width / 2;
      const cellH = canvas.height / 2;
      const sheetFrame = { bossId: "GLOOMROOT", frame, cellWidth: cellW, cellHeight: cellH, columns: 2, drawWidth: drawW, drawHeight: drawH };
      if (!gloomrootSprites.drawFrame(ctx, canvas, sheetFrame, pulse)) {
        ctx.scale(pulse, pulse);
        ctx.filter = GLOOMROOT_SPRITE_FILTER;
        drawBossSheetFrame(ctx, canvas, sheetFrame);
      }
    } else {
      gloomrootSprites.reset();
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#172c3d";
      ctx.strokeStyle = "#65eee9";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-68, 176);
      ctx.quadraticCurveTo(-118, 92, -70, 18);
      ctx.lineTo(-132, -58);
      ctx.lineTo(-42, -18);
      ctx.quadraticCurveTo(-24, -138, 0, -184);
      ctx.quadraticCurveTo(28, -132, 42, -18);
      ctx.lineTo(132, -58);
      ctx.lineTo(70, 18);
      ctx.quadraticCurveTo(118, 92, 68, 176);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9ffff9";
      ctx.fillRect(-40, -78, 22, 14);
      ctx.fillRect(18, -78, 22, 14);
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + GLOOMROOT_ART_TOP + (bossFrameCrop("GLOOMROOT", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 300,
      barHeight: 23,
      hp: gloomrootBoss.hp,
      maxHp: gloomrootBoss.maxHp,
      hpLossFlashTimer: gloomrootBoss.hpLossFlashTimer,
      hpLossFlashFrom: gloomrootBoss.hpLossFlashFrom,
      backgroundColor: "#14293a",
      fillColor: "#39cbd3",
      name: { text: "Gloomroot", color: "#b9fbf5" },
    });
  }

  function drawTidewyrmTelegraphs() {
    if (tidewyrmBoss.dead) return;
    const x = screenX(tidewyrmBoss.x);
    const y = screenY(tidewyrmBoss.y);
    const time = options.gameTime();
    if (tidewyrmBoss.surge) {
      const surge = tidewyrmBoss.surge;
      ctx.save();
      ctx.fillStyle = surge.windup > 0 ? "rgba(62,211,232,.14)" : "rgba(83,230,250,.24)";
      ctx.strokeStyle = "rgba(185,249,255,.96)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, TIDEWYRM_SURGE_RANGE, surge.angle - TIDEWYRM_SURGE_HALF_ANGLE, surge.angle + TIDEWYRM_SURGE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (surge.windup <= 0) {
        const radius = tidewyrmBoss.r + (TIDEWYRM_SURGE_RANGE - tidewyrmBoss.r) * clamp(1 - surge.timer / surge.duration, 0, 1);
        for (let crest = 0; crest < 15; crest += 1) {
          const angle = surge.angle - TIDEWYRM_SURGE_HALF_ANGLE + crest / 14 * TIDEWYRM_SURGE_HALF_ANGLE * 2;
          const crestX = x + Math.cos(angle) * radius;
          const crestY = y + Math.sin(angle) * radius;
          ctx.fillStyle = crest % 2 ? "#baf8ff" : "#36c8e4";
          options.pixelCircle(crestX, crestY, crest % 2 ? 10 : 15);
          ctx.fillStyle = "#effeff";
          options.pixelCircle(crestX, crestY - 5, 5);
        }
      }
      ctx.restore();
    }
    for (const pool of hazards.tidewyrm) {
      const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1);
      const poolX = screenX(pool.x);
      const poolY = screenY(pool.y);
      ctx.save();
      ctx.fillStyle = `rgba(28,151,198,${.1 + progress * .2})`;
      ctx.strokeStyle = "rgba(171,247,255,.96)";
      ctx.lineWidth = 5;
      ctx.setLineDash([13, 8]);
      ctx.lineDashOffset = time * 54;
      ctx.beginPath();
      ctx.ellipse(poolX, poolY, pool.r, pool.r * .62, time * .7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(49,210,238,.9)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(poolX, poolY, pool.r * (.24 + progress * .36), pool.r * (.15 + progress * .22), -time, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTidewyrmBoss() {
    if (tidewyrmBoss.dead) return;
    const surge = tidewyrmBoss.surge;
    const attackElapsed = tidewyrmBoss.spriteAttackElapsed;
    const frame = carapaceAnglerSpriteFrame(options.gameTime(), attackElapsed);
    const page = art.tidewyrm.pages[frame.page];
    const x = screenX(tidewyrmBoss.x);
    const y = screenY(tidewyrmBoss.y);
    const visualY = y + TIDEWYRM_SPRITE_Y_OFFSET;
    // The Unity capture already includes the Angler’s ground shadow.
    ctx.save();
    ctx.translate(x, visualY);
    if (surge && Math.cos(surge.angle) > 0) ctx.scale(-1, 1);
    if (art.tidewyrm.ready() && page?.naturalWidth > 0) {
      // Separate crop identity preserves the user's original Tidewyrm adjustments.
      drawBossAtlasFrame(ctx, page, frame, "CARAPACE_ANGLER");
    } else {
      ctx.fillStyle = "#147f9d";
      ctx.strokeStyle = "#b9f8ff";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(0, 35, 150, 88, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0d405d";
      for (let fin = -2; fin <= 2; fin += 1) {
        ctx.beginPath();
        ctx.moveTo(fin * 42 - 12, -46);
        ctx.lineTo(fin * 42 + 2, -91);
        ctx.lineTo(fin * 42 + 20, -42);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#e7ffff";
      ctx.fillRect(-76, -3, 18, 13);
      ctx.fillRect(58, -3, 18, 13);
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + frame.top + (bossFrameCrop("CARAPACE_ANGLER", frame.tuningFrame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 310,
      barHeight: 23,
      hp: tidewyrmBoss.hp,
      maxHp: tidewyrmBoss.maxHp,
      hpLossFlashTimer: tidewyrmBoss.hpLossFlashTimer,
      hpLossFlashFrom: tidewyrmBoss.hpLossFlashFrom,
      backgroundColor: "#123b56",
      fillColor: "#35cce5",
      name: { text: "Carapace Angler", color: "#c7faff" },
    });
  }

  function drawKoiShogunTelegraphs() {
    if (koiShogunBoss.dead) return;
    const x = screenX(koiShogunBoss.x);
    const y = screenY(koiShogunBoss.y);
    const time = options.gameTime();
    if (koiShogunBoss.slash) {
      const slash = koiShogunBoss.slash;
      ctx.save();
      ctx.fillStyle = slash.windup > 0 ? "rgba(242,183,68,.13)" : "rgba(72,205,235,.23)";
      ctx.strokeStyle = slash.windup > 0 ? "rgba(255,221,137,.94)" : "rgba(193,250,255,.98)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, KOI_SHOGUN_SLASH_RANGE, slash.angle - KOI_SHOGUN_SLASH_HALF_ANGLE, slash.angle + KOI_SHOGUN_SLASH_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (slash.windup <= 0) {
        const radius = koiShogunBoss.r + (KOI_SHOGUN_SLASH_RANGE - koiShogunBoss.r) * clamp(1 - slash.timer / slash.duration, 0, 1);
        for (let crest = 0; crest < 15; crest += 1) {
          const angle = slash.angle - KOI_SHOGUN_SLASH_HALF_ANGLE + crest / 14 * KOI_SHOGUN_SLASH_HALF_ANGLE * 2;
          const crestX = x + Math.cos(angle) * radius;
          const crestY = y + Math.sin(angle) * radius;
          ctx.fillStyle = crest % 2 ? "#d6fbff" : "#42cbe7";
          options.pixelCircle(crestX, crestY, crest % 2 ? 10 : 15);
          ctx.fillStyle = "#ffffff";
          options.pixelCircle(crestX, crestY - 5, 5);
        }
      }
      ctx.restore();
    }
    for (const pool of hazards.koiShogun) {
      const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1);
      const poolX = screenX(pool.x);
      const poolY = screenY(pool.y);
      ctx.save();
      ctx.fillStyle = `rgba(28,151,198,${.1 + progress * .2})`;
      ctx.strokeStyle = "rgba(255,224,146,.96)";
      ctx.lineWidth = 5;
      ctx.setLineDash([13, 8]);
      ctx.lineDashOffset = time * 54;
      ctx.beginPath();
      ctx.ellipse(poolX, poolY, pool.r, pool.r * .62, time * .7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(49,210,238,.9)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(poolX, poolY, pool.r * (.24 + progress * .36), pool.r * (.15 + progress * .22), -time, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawKoiShogunBoss() {
    if (koiShogunBoss.dead) return;
    const canvas = art.koiShogun.canvas;
    const frame = hazards.koiShogun.length > 0 ? 3 : koiShogunBoss.slash ? (koiShogunBoss.slash.windup > 0 ? 2 : 1) : 0;
    const drawW = BOSS_ART.KOI_SHOGUN.drawWidth;
    const drawH = BOSS_ART.KOI_SHOGUN.drawHeight;
    const x = screenX(koiShogunBoss.x);
    const y = screenY(koiShogunBoss.y);
    const visualY = y + KOI_SHOGUN_SPRITE_Y_OFFSET;
    const pulse = hazards.koiShogun.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    const flipHorizontally = frame === 0 || frame === 1;
    options.drawShadow(x, visualY + KOI_SHOGUN_SPRITE_GROUND_OFFSET, BOSS_ART.KOI_SHOGUN.shadowWidth, .3);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(flipHorizontally ? -pulse : pulse, pulse);
    if (art.koiShogun.ready() && canvas.width >= 4 && canvas.height >= 2) {
      const cellW = canvas.width / 4;
      drawBossSheetFrame(ctx, canvas, { bossId: "KOI_SHOGUN", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH });
    } else {
      ctx.fillStyle = "#d87825";
      ctx.strokeStyle = "#4c2917";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(0, 30, 145, 90, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6b84d";
      ctx.beginPath();
      ctx.moveTo(-145, -28);
      ctx.lineTo(0, -112);
      ctx.lineTo(145, -28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + KOI_SHOGUN_ART_TOP + (bossFrameCrop("KOI_SHOGUN", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 310,
      barHeight: 23,
      hp: koiShogunBoss.hp,
      maxHp: koiShogunBoss.maxHp,
      hpLossFlashTimer: koiShogunBoss.hpLossFlashTimer,
      hpLossFlashFrom: koiShogunBoss.hpLossFlashFrom,
      backgroundColor: "#482719",
      fillColor: "#e2832d",
      name: { text: "Koi Shogun", color: "#ffe6a4" },
    });
  }

  function drawTempestKirinTelegraphs() {
    if (tempestKirinBoss.dead) return;
    const x = screenX(tempestKirinBoss.x);
    const y = screenY(tempestKirinBoss.y);
    const time = options.gameTime();
    if (tempestKirinBoss.charge) {
      const charge = tempestKirinBoss.charge;
      ctx.save();
      ctx.fillStyle = charge.windup > 0 ? "rgba(104,194,255,.13)" : "rgba(228,249,255,.25)";
      ctx.strokeStyle = charge.windup > 0 ? "rgba(151,220,255,.96)" : "rgba(255,232,139,.98)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, TEMPEST_KIRIN_CHARGE_RANGE, charge.angle - TEMPEST_KIRIN_CHARGE_HALF_ANGLE, charge.angle + TEMPEST_KIRIN_CHARGE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (charge.windup <= 0) {
        const radius = tempestKirinBoss.r + (TEMPEST_KIRIN_CHARGE_RANGE - tempestKirinBoss.r) * clamp(1 - charge.timer / charge.duration, 0, 1);
        ctx.strokeStyle = "rgba(242,253,255,.98)";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(x, y, radius, charge.angle - TEMPEST_KIRIN_CHARGE_HALF_ANGLE, charge.angle + TEMPEST_KIRIN_CHARGE_HALF_ANGLE);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const bolt of hazards.tempestKirin) {
      const progress = 1 - clamp(bolt.timer / bolt.maxTimer, 0, 1);
      const boltX = screenX(bolt.x);
      const boltY = screenY(bolt.y);
      ctx.save();
      ctx.fillStyle = `rgba(92,190,255,${.1 + progress * .2})`;
      ctx.strokeStyle = "rgba(255,231,133,.98)";
      ctx.lineWidth = 5;
      ctx.setLineDash([11, 7]);
      ctx.lineDashOffset = -time * 70;
      ctx.beginPath();
      ctx.arc(boltX, boltY, bolt.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(219,249,255,.94)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(boltX, boltY, bolt.r * (.2 + progress * .55), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTempestKirinBoss() {
    if (tempestKirinBoss.dead) return;
    const canvas = art.tempestKirin.canvas;
    const frame = hazards.tempestKirin.length > 0
      ? 3
      : tempestKirinBoss.charge
        ? (tempestKirinBoss.charge.windup > 0 ? 1 : 2)
        : 0;
    const drawW = BOSS_ART.TEMPEST_KIRIN.drawWidth;
    const drawH = BOSS_ART.TEMPEST_KIRIN.drawHeight;
    const x = screenX(tempestKirinBoss.x);
    const y = screenY(tempestKirinBoss.y);
    const visualY = y + TEMPEST_KIRIN_SPRITE_Y_OFFSET;
    const pulse = hazards.tempestKirin.length > 0 ? 1 + Math.sin(options.gameTime() * 15) * .016 : 1;
    options.drawShadow(x, visualY + TEMPEST_KIRIN_SPRITE_GROUND_OFFSET, BOSS_ART.TEMPEST_KIRIN.shadowWidth, .3);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    if (art.tempestKirin.ready() && canvas.width >= 4 && canvas.height >= 2) {
      const cellW = canvas.width / 4;
      drawBossSheetFrame(ctx, canvas, { bossId: "TEMPEST_KIRIN", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH });
    } else {
      ctx.fillStyle = "#ecfaff";
      ctx.strokeStyle = "#23466e";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(0, 36, 144, 88, -.08, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#74c8ff";
      ctx.beginPath();
      ctx.moveTo(-95, -15);
      ctx.lineTo(-12, -150);
      ctx.lineTo(45, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + TEMPEST_KIRIN_ART_TOP + (bossFrameCrop("TEMPEST_KIRIN", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 320,
      barHeight: 23,
      hp: tempestKirinBoss.hp,
      maxHp: tempestKirinBoss.maxHp,
      hpLossFlashTimer: tempestKirinBoss.hpLossFlashTimer,
      hpLossFlashFrom: tempestKirinBoss.hpLossFlashFrom,
      backgroundColor: "#193a67",
      fillColor: "#65c8ff",
      name: { text: "Tempest Kirin", color: "#e9fbff" },
    });
  }

  function drawMiremawTelegraphs() {
    if (miremawBoss.dead) return;
    const x = screenX(miremawBoss.x);
    const y = screenY(miremawBoss.y);
    const time = options.gameTime();
    if (miremawBoss.tongue) {
      const tongue = miremawBoss.tongue;
      ctx.save();
      ctx.fillStyle = tongue.windup > 0 ? "rgba(119,255,199,.13)" : "rgba(212,255,235,.24)";
      ctx.strokeStyle = tongue.windup > 0 ? "rgba(133,255,209,.95)" : "rgba(255,151,207,.98)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, MIREMAW_TONGUE_RANGE, tongue.angle - MIREMAW_TONGUE_HALF_ANGLE, tongue.angle + MIREMAW_TONGUE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (tongue.windup <= 0) {
        const radius = miremawBoss.r + (MIREMAW_TONGUE_RANGE - miremawBoss.r) * clamp(1 - tongue.timer / tongue.duration, 0, 1);
        ctx.strokeStyle = "rgba(255,174,218,.98)";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(x, y, radius, tongue.angle - MIREMAW_TONGUE_HALF_ANGLE, tongue.angle + MIREMAW_TONGUE_HALF_ANGLE);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const burst of hazards.miremaw) {
      const progress = 1 - clamp(burst.timer / burst.maxTimer, 0, 1);
      const burstX = screenX(burst.x);
      const burstY = screenY(burst.y);
      ctx.save();
      ctx.fillStyle = `rgba(100,238,187,${.1 + progress * .22})`;
      ctx.strokeStyle = "rgba(185,255,226,.96)";
      ctx.lineWidth = 5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 44;
      ctx.beginPath();
      ctx.arc(burstX, burstY, burst.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      for (let bubble = 0; bubble < 5; bubble += 1) {
        const angle = bubble * TAU / 5 + time * .8;
        const radius = burst.r * (.16 + progress * .58);
        ctx.strokeStyle = bubble % 2 ? "rgba(213,255,238,.9)" : "rgba(190,135,255,.86)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(burstX + Math.cos(angle) * radius, burstY + Math.sin(angle) * radius, 5 + bubble % 3 * 2, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  /**
   * Prismshell, Ironhorn and Dreadreaper share one telegraph: a jagged cone
   * front and six-shard bursts, differing only in palette.
   */
  function drawShatterTelegraphs(
    state: typeof prismshellBoss | typeof ironhornBoss | typeof dreadreaperBoss,
    bursts: readonly { x: number; y: number; r: number; timer: number; maxTimer: number }[],
    range: number,
    halfAngle: number,
    palette: ShatterPalette,
  ) {
    if (state.dead) return;
    const x = screenX(state.x);
    const y = screenY(state.y);
    const time = options.gameTime();
    if (state.shatter) {
      const shatter = state.shatter;
      ctx.save();
      ctx.fillStyle = shatter.windup > 0 ? palette.windupFill : palette.activeFill;
      ctx.strokeStyle = shatter.windup > 0 ? palette.windupStroke : palette.activeStroke;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, range, shatter.angle - halfAngle, shatter.angle + halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (shatter.windup <= 0) {
        const radius = state.r + (range - state.r) * clamp(1 - shatter.timer / shatter.duration, 0, 1);
        ctx.strokeStyle = palette.activeStroke;
        ctx.lineWidth = 9;
        ctx.beginPath();
        for (let point = 0; point <= 12; point += 1) {
          const angle = shatter.angle - halfAngle + point / 12 * halfAngle * 2;
          const reach = Math.max(state.r, radius - (point % 2 ? 24 : 0));
          const pointX = x + Math.cos(angle) * reach;
          const pointY = y + Math.sin(angle) * reach;
          if (point === 0) ctx.moveTo(pointX, pointY);
          else ctx.lineTo(pointX, pointY);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const burst of bursts) {
      const progress = 1 - clamp(burst.timer / burst.maxTimer, 0, 1);
      const burstX = screenX(burst.x);
      const burstY = screenY(burst.y);
      ctx.save();
      ctx.fillStyle = `rgba(${palette.burstFill},${.1 + progress * .22})`;
      ctx.strokeStyle = palette.burstStroke;
      ctx.lineWidth = 5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 44;
      ctx.beginPath();
      ctx.arc(burstX, burstY, burst.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      for (let shard = 0; shard < 6; shard += 1) {
        const angle = shard * TAU / 6 - Math.PI / 2;
        const radius = burst.r * (.24 + progress * .32);
        const shardX = burstX + Math.cos(angle) * radius;
        const shardY = burstY + Math.sin(angle) * radius;
        const length = 7 + progress * 12;
        ctx.fillStyle = shard % 2 ? palette.oddShard : palette.evenShard;
        ctx.beginPath();
        ctx.moveTo(shardX + Math.cos(angle) * length, shardY + Math.sin(angle) * length);
        ctx.lineTo(shardX - Math.sin(angle) * 5, shardY + Math.cos(angle) * 5);
        ctx.lineTo(shardX - Math.cos(angle) * length, shardY - Math.sin(angle) * length);
        ctx.lineTo(shardX + Math.sin(angle) * 5, shardY - Math.cos(angle) * 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
  const drawPrismshellTelegraphs = () => drawShatterTelegraphs(prismshellBoss, hazards.prismshell, PRISMSHELL_SHATTER_RANGE, PRISMSHELL_SHATTER_HALF_ANGLE, PRISMSHELL_PALETTE);
  const drawIronhornTelegraphs = () => drawShatterTelegraphs(ironhornBoss, hazards.ironhorn, IRONHORN_SHATTER_RANGE, IRONHORN_SHATTER_HALF_ANGLE, IRONHORN_PALETTE);
  const drawDreadreaperTelegraphs = () => drawShatterTelegraphs(dreadreaperBoss, hazards.dreadreaper, DREADREAPER_SHATTER_RANGE, DREADREAPER_SHATTER_HALF_ANGLE, DREADREAPER_PALETTE);
  function drawVoltwardenTelegraphs() {
    if (!voltwardenBoss.dead) drawNeonAttacks(ctx, voltwardenBoss, hazards.voltwarden, camera);
  }
  function drawGravebloomTelegraphs() {
    if (!gravebloomBoss.dead) drawVerdantAttacks(ctx, gravebloomBoss, hazards.gravebloom, camera);
  }
  function drawAegisPrimeTelegraphs() {
    if (!aegisPrimeBoss.dead) drawIonAttacks(ctx, aegisPrimeBoss, hazards.aegisPrime, camera);
  }

  function drawMiremawBoss() {
    if (miremawBoss.dead) return;
    const canvas = art.miremaw.canvas;
    const frame = hazards.miremaw.length > 0
      ? 3
      : miremawBoss.tongue
        ? (miremawBoss.tongue.windup > 0 ? 1 : 2)
        : 0;
    const drawW = BOSS_ART.MIREMAW.drawWidth;
    const drawH = BOSS_ART.MIREMAW.drawHeight;
    const x = screenX(miremawBoss.x);
    const y = screenY(miremawBoss.y);
    const visualY = y + MIREMAW_SPRITE_Y_OFFSET;
    const pulse = hazards.miremaw.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .018 : 1;
    options.drawShadow(x, visualY + MIREMAW_SPRITE_GROUND_OFFSET, BOSS_ART.MIREMAW.shadowWidth, .3);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    if (art.miremaw.ready() && canvas.width >= 4 && canvas.height >= 2) {
      const cellW = canvas.width / 4;
      drawBossSheetFrame(ctx, canvas, { bossId: "MIREMAW", frame, cellWidth: cellW, cellHeight: canvas.height, drawWidth: drawW, drawHeight: drawH });
    } else {
      drawHornedSilhouette("#3caa86", "#102b27", "#b788f4");
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + MIREMAW_ART_TOP + (bossFrameCrop("MIREMAW", frame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 330,
      barHeight: 23,
      hp: miremawBoss.hp,
      maxHp: miremawBoss.maxHp,
      hpLossFlashTimer: miremawBoss.hpLossFlashTimer,
      hpLossFlashFrom: miremawBoss.hpLossFlashFrom,
      backgroundColor: "#193c38",
      fillColor: "#55d6a8",
      name: { text: "Miremaw", color: "#e9fff5" },
    });
  }
  function drawPrismshellBoss() {
    if (prismshellBoss.dead) return;
    const shatter = prismshellBoss.shatter;
    const attackElapsed = shatter
      ? 1.65 - shatter.windup - shatter.timer
      : hazards.prismshell.length > 0
        ? Math.max(...hazards.prismshell.map((burst) => burst.maxTimer - burst.timer))
        : undefined;
    const frame = prismshellSpriteFrame(options.gameTime(), attackElapsed);
    const page = art.prismshell.pages[frame.page];
    const x = screenX(prismshellBoss.x);
    const y = screenY(prismshellBoss.y);
    const visualY = y + PRISMSHELL_SPRITE_Y_OFFSET;
    ctx.save();
    ctx.translate(x, visualY);
    // Ground the transparent artwork with a soft contact shadow. Keep it
    // independent of breathing and attack scaling so it stays on the floor.
    ctx.save();
    ctx.translate(0, PRISMSHELL_SPRITE_GROUND_OFFSET);
    ctx.scale(175, 48);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, "rgba(15, 9, 24, 0.42)");
    shadow.addColorStop(0.55, "rgba(15, 9, 24, 0.28)");
    shadow.addColorStop(1, "rgba(15, 9, 24, 0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    // The amethyst artwork faces left.
    if (shatter && Math.cos(shatter.angle) > 0) ctx.scale(-1, 1);
    if (art.prismshell.ready() && page?.naturalWidth > 0) {
      drawBossAtlasFrame(ctx, page, frame, "PRISMSHELL");
    } else {
      // A readable armored silhouette remains if the network fails an image.
      drawHornedSilhouette("#74749c", "#25273e", "#9adff0");
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + PRISMSHELL_ART_TOP + (bossFrameCrop("PRISMSHELL", frame.tuningFrame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 330,
      barHeight: 23,
      hp: prismshellBoss.hp,
      maxHp: prismshellBoss.maxHp,
      hpLossFlashTimer: prismshellBoss.hpLossFlashTimer,
      hpLossFlashFrom: prismshellBoss.hpLossFlashFrom,
      backgroundColor: "#333149",
      fillColor: "#ab8be6",
      name: { text: "Prismshell", color: "#f1e9ff" },
    });
  }
  /** An imported atlas prefab, which faces left and carries its own shadow. */
  function drawAtlasClipBoss(
    state: typeof ironhornBoss | typeof dreadreaperBoss,
    kind: "ironhorn" | "dreadreaper",
    look: {
      atlasId: "IRONHORN" | "DREADREAPER";
      spriteFrame: typeof ironhornSpriteFrame;
      spriteYOffset: number;
      artTop: number;
      fillColor: string;
      name: string;
    },
  ) {
    if (state.dead) return;
    const shatter = state.shatter;
    const attackElapsed = state.spriteAttackElapsed;
    const frame = look.spriteFrame(options.gameTime(), attackElapsed);
    const page = art[kind].pages[frame.page];
    const x = screenX(state.x);
    const y = screenY(state.y);
    const visualY = y + look.spriteYOffset;
    ctx.save();
    ctx.translate(x, visualY);
    // The imported prefab faces left and already contains its own shadow.
    if (shatter && Math.cos(shatter.angle) > 0) ctx.scale(-1, 1);
    if (art[kind].ready() && page?.naturalWidth > 0) {
      drawBossAtlasFrame(ctx, page, frame, look.atlasId);
    } else {
      // A readable armored silhouette remains if the network fails an image.
      drawHornedSilhouette("#74749c", "#25273e", "#9adff0");
    }
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY + look.artTop + (bossFrameCrop(look.atlasId, frame.tuningFrame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 330,
      barHeight: 23,
      hp: state.hp,
      maxHp: state.maxHp,
      hpLossFlashTimer: state.hpLossFlashTimer,
      hpLossFlashFrom: state.hpLossFlashFrom,
      backgroundColor: "#333149",
      fillColor: look.fillColor,
      name: { text: look.name, color: "#f1e9ff" },
    });
  }
  const drawIronhornBoss = () => drawAtlasClipBoss(ironhornBoss, "ironhorn", {
    atlasId: "IRONHORN", spriteFrame: ironhornSpriteFrame, spriteYOffset: IRONHORN_SPRITE_Y_OFFSET, artTop: IRONHORN_ART_TOP,
    fillColor: "#d9a64e", name: "Ironhorn",
  });
  const drawDreadreaperBoss = () => drawAtlasClipBoss(dreadreaperBoss, "dreadreaper", {
    atlasId: "DREADREAPER", spriteFrame: dreadreaperSpriteFrame, spriteYOffset: DREADREAPER_SPRITE_Y_OFFSET, artTop: DREADREAPER_ART_TOP,
    fillColor: "#a3c563", name: "Dreadreaper",
  });
  /** The expansion bosses pose by attack: a laser while the cone plays, a pulse while hazards stand. */
  function drawPosedBoss(
    state: typeof voltwardenBoss | typeof gravebloomBoss | typeof aegisPrimeBoss,
    kind: "voltwarden" | "gravebloom" | "aegisPrime",
    look: {
      drawArt: typeof drawVoltwardenArt;
      cropId: "VOLTWARDEN" | "GRAVEBLOOM" | "AEGIS_PRIME";
      /** Voltwarden's status sits on its posed frame; the others keep their idle frame's. */
      posedStatus: boolean;
      spriteYOffset: number;
      artTop: number;
      name: string;
    },
  ) {
    if (state.dead) return;
    const x = screenX(state.x);
    const y = screenY(state.y);
    const visualY = y + look.spriteYOffset;
    const pulsing = hazards[kind].length > 0;
    look.drawArt(ctx, x, visualY, options.gameTime(), state.shatter ? "laser" : pulsing ? "emp" : "idle",
      state.hurt, art[kind].ready() ? art[kind].pages[0] : undefined);
    const statusFrame = look.posedStatus ? (state.shatter ? 1 : pulsing ? 2 : 0) : 0;
    drawBossStatus({
      x,
      spriteTopY: visualY + look.artTop + (bossFrameCrop(look.cropId, statusFrame).statusOffsetY ?? 0),
      barGap: 34,
      barWidth: 330,
      barHeight: 23,
      hp: state.hp,
      maxHp: state.maxHp,
      hpLossFlashTimer: state.hpLossFlashTimer,
      hpLossFlashFrom: state.hpLossFlashFrom,
      backgroundColor: "#333149",
      fillColor: "#35dae6",
      name: { text: look.name, color: "#f1e9ff" },
    });
  }
  const drawVoltwardenBoss = () => drawPosedBoss(voltwardenBoss, "voltwarden", {
    drawArt: drawVoltwardenArt, cropId: "VOLTWARDEN", posedStatus: true,
    spriteYOffset: VOLTWARDEN_SPRITE_Y_OFFSET, artTop: VOLTWARDEN_ART_TOP, name: "Voltwarden",
  });
  const drawGravebloomBoss = () => drawPosedBoss(gravebloomBoss, "gravebloom", {
    drawArt: drawGravebloomArt, cropId: "GRAVEBLOOM", posedStatus: false,
    spriteYOffset: GRAVEBLOOM_SPRITE_Y_OFFSET, artTop: GRAVEBLOOM_ART_TOP, name: "Gravebloom",
  });
  const drawAegisPrimeBoss = () => drawPosedBoss(aegisPrimeBoss, "aegisPrime", {
    drawArt: drawAegisPrimeArt, cropId: "AEGIS_PRIME", posedStatus: false,
    spriteYOffset: AEGIS_PRIME_SPRITE_Y_OFFSET, artTop: AEGIS_PRIME_ART_TOP, name: "Aegis Prime",
  });
  return {
    drawBoss: {
      dragon: drawBoss, spider: drawSpiderBoss, frostclaw: drawFrostclawBoss, magmalisk: drawMagmaliskBoss,
      gloomroot: drawGloomrootBoss, tidewyrm: drawTidewyrmBoss, koiShogun: drawKoiShogunBoss, tempestKirin: drawTempestKirinBoss,
      miremaw: drawMiremawBoss, prismshell: drawPrismshellBoss, ironhorn: drawIronhornBoss, dreadreaper: drawDreadreaperBoss,
      voltwarden: drawVoltwardenBoss, gravebloom: drawGravebloomBoss, aegisPrime: drawAegisPrimeBoss,
    } satisfies Record<BossKind, () => void>,
    drawBossTelegraphs: {
      dragon: drawBossTelegraphs, spider: drawSpiderTelegraphs, frostclaw: drawFrostclawTelegraphs, magmalisk: drawMagmaliskTelegraphs,
      gloomroot: drawGloomrootTelegraphs, tidewyrm: drawTidewyrmTelegraphs, koiShogun: drawKoiShogunTelegraphs, tempestKirin: drawTempestKirinTelegraphs,
      miremaw: drawMiremawTelegraphs, prismshell: drawPrismshellTelegraphs, ironhorn: drawIronhornTelegraphs, dreadreaper: drawDreadreaperTelegraphs,
      voltwarden: drawVoltwardenTelegraphs, gravebloom: drawGravebloomTelegraphs, aegisPrime: drawAegisPrimeTelegraphs,
    } satisfies Record<BossKind, () => void>,
    drawBossHitboxes,
  };
}
