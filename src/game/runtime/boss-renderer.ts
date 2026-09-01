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
  KOI_SHOGUN_SLASH_HALF_ANGLE,
  KOI_SHOGUN_SLASH_RANGE,
  KOI_SHOGUN_SPRITE_GROUND_OFFSET,
  KOI_SHOGUN_SPRITE_Y_OFFSET,
  TIDEWYRM_SPRITE_GROUND_OFFSET,
  TIDEWYRM_SPRITE_Y_OFFSET,
  TIDEWYRM_SURGE_HALF_ANGLE,
  TIDEWYRM_SURGE_RANGE,
  TAU,
} from "../constants";
import { clamp } from "../math";
import { REWARD_DATA, rewardLabel, type RewardType } from "../enemies";
import { formatCompactNumber } from "../../ui/number-format";
import {
  DRAGON_REWARD_DAMAGE,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
} from "../../../shared/rules";
import type { Camera } from "./camera";
import {
  BOSS_NAME_FONT_SIZE,
  BOSS_REWARD_FONT_SIZE,
  BOSS_STATUS_HEALTH_FONT_SIZE,
  bossStatusLabelOffsets,
} from "./boss-label-style";
import { healthBarTextY } from "./health-bar-layout";
import type { BossRainStrike, DragonBossState, FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption, SpiderBossState, SpiderVenomPool, TidewyrmBossState, TidewyrmWhirlpool } from "./types";
import { drawScreenSpaceAt, snapWorldRenderCoordinate } from "./render-space";
import { SCORPION_SPRITE, scorpionSpriteFrame } from "./scorpion-sprite";

type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

const BOSS_LABEL_FONT_FAMILY = '"Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const bossLabelFont = (size: number) => `900 ${size}px ${BOSS_LABEL_FONT_FAMILY}`;

export function createBossRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  devicePixelRatio: () => number;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  koiShogunBoss: KoiShogunBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  gloomrootBlooms: GloomrootBloom[];
  tidewyrmWhirlpools: TidewyrmWhirlpool[];
  koiShogunWhirlpools: KoiShogunWhirlpool[];
  dragonSpriteCanvas: HTMLCanvasElement;
  spiderSpriteCanvas: HTMLCanvasElement;
  frostclawSpriteCanvas: HTMLCanvasElement;
  magmaliskSpriteCanvas: HTMLCanvasElement;
  gloomrootSpriteCanvas: HTMLCanvasElement;
  tidewyrmSpriteCanvas: HTMLCanvasElement;
  koiShogunSpriteCanvas: HTMLCanvasElement;
  dragonReady: () => boolean;
  spiderReady: () => boolean;
  frostclawReady: () => boolean;
  magmaliskReady: () => boolean;
  gloomrootReady: () => boolean;
  tidewyrmReady: () => boolean;
  koiShogunReady: () => boolean;
  gameTime: () => number;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  hpLossFlashDuration: number;
  spiderWebRange: number;
  rewardMultiplier: () => number;
}) {
  const { ctx, camera, boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss } = options;
  const screenX = (worldX: number) => snapWorldRenderCoordinate(worldX - camera.x, camera.zoom, options.devicePixelRatio());
  const screenY = (worldY: number) => snapWorldRenderCoordinate(worldY - camera.y, camera.zoom, options.devicePixelRatio());
  const rewardText = (type: RewardType, baseAmount: number) => rewardLabel({
    type,
    amount: baseAmount * options.rewardMultiplier(),
  });
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
    rewards: readonly { text: string; color: string }[];
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
      const labelOffsets = bossStatusLabelOffsets(options_.rewards.length, options_.rewardBottomOffsetY);
      ctx.font = bossLabelFont(BOSS_NAME_FONT_SIZE);
      options.outlinedText(options_.name.text, 0, barY + labelOffsets.name, options_.name.color, 4);
      ctx.font = bossLabelFont(BOSS_REWARD_FONT_SIZE);
      for (const [index, reward] of options_.rewards.entries()) {
        options.outlinedText(reward.text, 0, barY + labelOffsets.rewards[index], reward.color, 4);
      }
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
    for (const strike of options.bossRain) { const x = screenX(strike.x); const y = screenY(strike.y); const progress = 1 - clamp(strike.timer / strike.maxTimer, 0, 1); const fallY = y - 150 * (1 - progress); ctx.save(); ctx.strokeStyle = "rgba(255,70,54,.92)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, strike.r, 0, TAU); ctx.stroke(); ctx.fillStyle = "#ff5b36"; options.pixelCircle(x, fallY, 9); ctx.fillStyle = "#ffd05c"; options.pixelCircle(x, fallY, 5); ctx.restore(); }
  }
  function drawBoss() {
    if (boss.dead || !options.dragonReady()) return;
    const canvas = options.dragonSpriteCanvas; const cellW = canvas.width / 4; const drawW = 300; const drawH = 400; const x = screenX(boss.x); const y = screenY(boss.y);
    options.drawShadow(x, y + 93, 188, .24); ctx.drawImage(canvas, Math.floor(options.gameTime() * 4) % 4 * cellW, 0, cellW, canvas.height, x - drawW / 2, y - drawH / 2, drawW, drawH);
    drawBossStatus({
      x,
      spriteTopY: y - drawH / 2,
      barGap: 20,
      barWidth: 220,
      barHeight: 20,
      hp: boss.hp,
      maxHp: boss.maxHp,
      hpLossFlashTimer: boss.hpLossFlashTimer,
      hpLossFlashFrom: boss.hpLossFlashFrom,
      backgroundColor: "#4d1d1d",
      fillColor: "#d8352d",
      name: { text: "DRAGON", color: "#f5e9c4" },
      rewardBottomOffsetY: -5,
      rewards: [
        { text: rewardText("damage", DRAGON_REWARD_DAMAGE), color: "#ff655a" },
      ],
    });
  }
  function drawSpiderTelegraphs() {
    if (spiderBoss.dead) return; const x = screenX(spiderBoss.x); const y = screenY(spiderBoss.y);
    if (spiderBoss.web) { const radius = spiderBoss.r + (options.spiderWebRange - spiderBoss.r) * clamp(1 - spiderBoss.web.timer / spiderBoss.web.duration, 0, 1); ctx.save(); ctx.strokeStyle = "rgba(235,239,218,.9)"; ctx.lineWidth = 7; ctx.setLineDash([13, 10]); ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke(); ctx.restore(); }
    for (const pool of options.spiderVenom) { const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1); ctx.save(); ctx.fillStyle = `rgba(113,214,71,${.12 + progress * .18})`; ctx.strokeStyle = "rgba(155,238,88,.95)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(screenX(pool.x), screenY(pool.y), pool.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  function drawSpiderBoss() {
    if (spiderBoss.dead || !options.spiderReady()) return;
    const canvas = options.spiderSpriteCanvas;
    const frame = scorpionSpriteFrame(options.gameTime(), canvas.width, canvas.height);
    const x = screenX(spiderBoss.x);
    const y = screenY(spiderBoss.y);
    const spriteTopY = y + frame.topOffset;
    options.drawShadow(x, y + SCORPION_SPRITE.groundOffset, 220, .24);
    ctx.drawImage(canvas, frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight,
      x - frame.drawWidth / 2, spriteTopY, frame.drawWidth, frame.drawHeight);
    drawBossStatus({
      x,
      spriteTopY,
      barGap: 32,
      barWidth: 250,
      barHeight: 22,
      hp: spiderBoss.hp,
      maxHp: spiderBoss.maxHp,
      hpLossFlashTimer: spiderBoss.hpLossFlashTimer,
      hpLossFlashFrom: spiderBoss.hpLossFlashFrom,
      backgroundColor: "#342027",
      fillColor: "#9f5c2f",
      name: { text: "DESERT SCORPION", color: "#f5e9c4" },
      rewardBottomOffsetY: -5,
      rewards: [
        { text: rewardText("damage", SPIDER_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", SPIDER_REWARD_HEALTH), color: "#6fe48e" },
      ],
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
    for (const strike of options.frostclawIcefalls) {
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
    if (frostclawBoss.dead || !options.frostclawReady()) return;
    const canvas = options.frostclawSpriteCanvas;
    const cellW = canvas.width / 4;
    const drawW = 330;
    const drawH = 440;
    const x = screenX(frostclawBoss.x);
    const y = screenY(frostclawBoss.y);
    const visualY = y + FROSTCLAW_SPRITE_Y_OFFSET;
    const frame = frostclawBoss.roar ? 2 : frostclawBoss.rift ? 1 : options.frostclawIcefalls.length ? 3 : Math.floor(options.gameTime() * 3.5) % 4;
    const pulse = frostclawBoss.roar ? 1 + Math.sin(options.gameTime() * 15) * .018 : 1;
    options.drawShadow(x, visualY + FROSTCLAW_SPRITE_GROUND_OFFSET, 215, .27);
    ctx.save(); ctx.translate(x, visualY + 2); ctx.scale(pulse, pulse);
    ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH); ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY - drawH / 2,
      barGap: 34,
      barWidth: 270,
      barHeight: 22,
      hp: frostclawBoss.hp,
      maxHp: frostclawBoss.maxHp,
      hpLossFlashTimer: frostclawBoss.hpLossFlashTimer,
      hpLossFlashFrom: frostclawBoss.hpLossFlashFrom,
      backgroundColor: "#17364b",
      fillColor: "#42c9f5",
      name: { text: "FROSTCLAW", color: "#dff8ff" },
      rewards: [
        { text: rewardText("damage", FROSTCLAW_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", FROSTCLAW_REWARD_HEALTH), color: "#6fe48e" },
        { text: rewardText("armor", FROSTCLAW_REWARD_ARMOR), color: REWARD_DATA.armor.color },
      ],
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
    for (const eruption of options.magmaliskEruptions) {
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
    if (magmaliskBoss.dead || !options.magmaliskReady()) return;
    const canvas = options.magmaliskSpriteCanvas;
    const cellW = canvas.width / 4;
    // The selected Magmalisk animation deliberately uses only source frames 0–2.
    const frame = options.magmaliskEruptions.length > 0 ? 2 : magmaliskBoss.bite ? 1 : 0;
    // Preprocessing isolates and re-packs each connected pose before rendering.
    const drawW = 390;
    const drawH = 520;
    const x = screenX(magmaliskBoss.x);
    const y = screenY(magmaliskBoss.y);
    const visualY = y + MAGMALISK_SPRITE_Y_OFFSET;
    const pulse = options.magmaliskEruptions.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    options.drawShadow(x, visualY + MAGMALISK_SPRITE_GROUND_OFFSET, 245, .29);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    drawBossStatus({
      x,
      spriteTopY: visualY - drawH / 2,
      barGap: 34,
      barWidth: 290,
      barHeight: 23,
      hp: magmaliskBoss.hp,
      maxHp: magmaliskBoss.maxHp,
      hpLossFlashTimer: magmaliskBoss.hpLossFlashTimer,
      hpLossFlashFrom: magmaliskBoss.hpLossFlashFrom,
      backgroundColor: "#4b2119",
      fillColor: "#ef6428",
      name: { text: "MAGMALISK", color: "#ffe0ad" },
      rewards: [
        { text: rewardText("damage", MAGMALISK_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", MAGMALISK_REWARD_HEALTH), color: "#6fe48e" },
        { text: rewardText("armor", MAGMALISK_REWARD_ARMOR), color: REWARD_DATA.armor.color },
        { text: rewardText("regen", MAGMALISK_REWARD_REGEN), color: REWARD_DATA.regen.color },
      ],
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
    for (const bloom of options.gloomrootBlooms) {
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
    const canvas = options.gloomrootSpriteCanvas;
    const frame = options.gloomrootBlooms.length > 0 ? 3 : gloomrootBoss.sweep ? 1 : 0;
    const drawW = 430;
    const drawH = 430;
    const x = screenX(gloomrootBoss.x);
    const y = screenY(gloomrootBoss.y);
    const visualY = y + GLOOMROOT_SPRITE_Y_OFFSET;
    const pulse = options.gloomrootBlooms.length > 0 ? 1 + Math.sin(options.gameTime() * 13) * .018 : 1;
    options.drawShadow(x, visualY + GLOOMROOT_SPRITE_GROUND_OFFSET, 260, .3);

    // A soft moon-sap aura separates the dark treant from the Night Forest,
    // while the fallback guarantees a visible target if its art fails to load.
    ctx.save();
    const aura = ctx.createRadialGradient(x, visualY + 45, 22, x, visualY + 55, 205);
    aura.addColorStop(0, "rgba(92,247,244,.3)");
    aura.addColorStop(.55, "rgba(35,154,173,.13)");
    aura.addColorStop(1, "rgba(14,45,65,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, visualY + 55, 205, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    if (options.gloomrootReady() && canvas.width >= 2 && canvas.height >= 2) {
      const cellW = canvas.width / 2;
      const cellH = canvas.height / 2;
      const sourceX = frame % 2 * cellW;
      const sourceY = Math.floor(frame / 2) * cellH;
      ctx.filter = "brightness(1.22) contrast(1.08) drop-shadow(0 0 12px rgba(88,238,240,.72))";
      ctx.drawImage(canvas, sourceX, sourceY, cellW, cellH, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
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
      spriteTopY: visualY - drawH / 2,
      barGap: 34,
      barWidth: 300,
      barHeight: 23,
      hp: gloomrootBoss.hp,
      maxHp: gloomrootBoss.maxHp,
      hpLossFlashTimer: gloomrootBoss.hpLossFlashTimer,
      hpLossFlashFrom: gloomrootBoss.hpLossFlashFrom,
      backgroundColor: "#14293a",
      fillColor: "#39cbd3",
      name: { text: "GLOOMROOT", color: "#b9fbf5" },
      rewards: [
        { text: rewardText("damage", GLOOMROOT_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", GLOOMROOT_REWARD_HEALTH), color: "#6fe48e" },
        { text: rewardText("armor", GLOOMROOT_REWARD_ARMOR), color: REWARD_DATA.armor.color },
        { text: rewardText("regen", GLOOMROOT_REWARD_REGEN), color: REWARD_DATA.regen.color },
      ],
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
    for (const pool of options.tidewyrmWhirlpools) {
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
    const canvas = options.tidewyrmSpriteCanvas;
    const frame = options.tidewyrmWhirlpools.length > 0 ? 3 : tidewyrmBoss.surge ? (tidewyrmBoss.surge.windup > 0 ? 2 : 1) : 0;
    const drawW = 440;
    const drawH = 440;
    const x = screenX(tidewyrmBoss.x);
    const y = screenY(tidewyrmBoss.y);
    const visualY = y + TIDEWYRM_SPRITE_Y_OFFSET;
    const pulse = options.tidewyrmWhirlpools.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    options.drawShadow(x, visualY + TIDEWYRM_SPRITE_GROUND_OFFSET, 280, .3);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    if (options.tidewyrmReady() && canvas.width >= 4 && canvas.height >= 2) {
      const cellW = canvas.width / 4;
      ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH);
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
      spriteTopY: visualY - drawH / 2,
      barGap: 34,
      barWidth: 310,
      barHeight: 23,
      hp: tidewyrmBoss.hp,
      maxHp: tidewyrmBoss.maxHp,
      hpLossFlashTimer: tidewyrmBoss.hpLossFlashTimer,
      hpLossFlashFrom: tidewyrmBoss.hpLossFlashFrom,
      backgroundColor: "#123b56",
      fillColor: "#35cce5",
      name: { text: "TIDEWYRM", color: "#c7faff" },
      rewards: [
        { text: rewardText("damage", TIDEWYRM_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", TIDEWYRM_REWARD_HEALTH), color: "#6fe48e" },
        { text: rewardText("armor", TIDEWYRM_REWARD_ARMOR), color: REWARD_DATA.armor.color },
        { text: rewardText("regen", TIDEWYRM_REWARD_REGEN), color: REWARD_DATA.regen.color },
      ],
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
    for (const pool of options.koiShogunWhirlpools) {
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
    const canvas = options.koiShogunSpriteCanvas;
    const frame = options.koiShogunWhirlpools.length > 0 ? 3 : koiShogunBoss.slash ? (koiShogunBoss.slash.windup > 0 ? 2 : 1) : 0;
    const drawW = 330;
    const drawH = 440;
    const x = screenX(koiShogunBoss.x);
    const y = screenY(koiShogunBoss.y);
    const visualY = y + KOI_SHOGUN_SPRITE_Y_OFFSET;
    const pulse = options.koiShogunWhirlpools.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    const flipHorizontally = frame === 0 || frame === 1;
    options.drawShadow(x, visualY + KOI_SHOGUN_SPRITE_GROUND_OFFSET, 210, .3);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(flipHorizontally ? -pulse : pulse, pulse);
    if (options.koiShogunReady() && canvas.width >= 4 && canvas.height >= 2) {
      const cellW = canvas.width / 4;
      ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH);
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
      spriteTopY: visualY - drawH / 2,
      barGap: 34,
      barWidth: 310,
      barHeight: 23,
      hp: koiShogunBoss.hp,
      maxHp: koiShogunBoss.maxHp,
      hpLossFlashTimer: koiShogunBoss.hpLossFlashTimer,
      hpLossFlashFrom: koiShogunBoss.hpLossFlashFrom,
      backgroundColor: "#482719",
      fillColor: "#e2832d",
      name: { text: "KOI SHOGUN", color: "#ffe6a4" },
      rewards: [
        { text: rewardText("damage", KOI_SHOGUN_REWARD_DAMAGE), color: "#ff655a" },
        { text: rewardText("health", KOI_SHOGUN_REWARD_HEALTH), color: "#6fe48e" },
        { text: rewardText("armor", KOI_SHOGUN_REWARD_ARMOR), color: REWARD_DATA.armor.color },
        { text: rewardText("regen", KOI_SHOGUN_REWARD_REGEN), color: REWARD_DATA.regen.color },
      ],
    });
  }
  return {
    drawBossTelegraphs,
    drawBoss,
    drawSpiderTelegraphs,
    drawSpiderBoss,
    drawFrostclawTelegraphs,
    drawFrostclawBoss,
    drawMagmaliskTelegraphs,
    drawMagmaliskBoss,
    drawGloomrootTelegraphs,
    drawGloomrootBoss,
    drawTidewyrmTelegraphs,
    drawTidewyrmBoss,
    drawKoiShogunTelegraphs,
    drawKoiShogunBoss,
  };
}
