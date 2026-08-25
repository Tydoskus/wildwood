import {
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  FROSTCLAW_RIFT_RANGE,
  FROSTCLAW_ROAR_RANGE,
  FROSTCLAW_SPRITE_GROUND_OFFSET,
  FROSTCLAW_SPRITE_Y_OFFSET,
  MAGMALISK_BITE_HALF_ANGLE,
  MAGMALISK_BITE_RANGE,
  MAGMALISK_SPRITE_GROUND_OFFSET,
  MAGMALISK_SPRITE_Y_OFFSET,
  TAU,
} from "../constants";
import { clamp } from "../math";
import { rewardLabel, type RewardType } from "../enemies";
import { formatCompactNumber } from "../../ui/number-format";
import {
  DRAGON_REWARD_DAMAGE,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
} from "../../../shared/rules";
import type { Camera } from "./camera";
import { healthBarTextY } from "./health-bar-layout";
import type { BossRainStrike, DragonBossState, FrostclawBossState, FrostclawIcefall, MagmaliskBossState, MagmaliskEruption, SpiderBossState, SpiderVenomPool } from "./types";

type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

export function createBossRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  dragonSpriteCanvas: HTMLCanvasElement;
  spiderSpriteCanvas: HTMLCanvasElement;
  frostclawSpriteCanvas: HTMLCanvasElement;
  magmaliskSpriteCanvas: HTMLCanvasElement;
  dragonReady: () => boolean;
  spiderReady: () => boolean;
  frostclawReady: () => boolean;
  magmaliskReady: () => boolean;
  gameTime: () => number;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  hpLossFlashDuration: number;
  spiderWebRange: number;
  rewardMultiplier: () => number;
}) {
  const { ctx, camera, boss, spiderBoss, frostclawBoss, magmaliskBoss } = options;
  const rewardText = (type: RewardType, baseAmount: number) => rewardLabel({
    type,
    amount: baseAmount * options.rewardMultiplier(),
  });
  function drawBossTelegraphs() {
    if (boss.dead) return;
    if (boss.cone) {
      const x = boss.x - camera.x; const y = boss.y - camera.y; const cone = boss.cone;
      ctx.save(); ctx.fillStyle = "rgba(255,52,42,.20)"; ctx.strokeStyle = "rgba(255,92,64,.92)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, BOSS_CONE_RANGE, cone.angle - BOSS_CONE_HALF_ANGLE, cone.angle + BOSS_CONE_HALF_ANGLE); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (cone.windup <= 0) { const waveRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * clamp(1 - cone.timer / cone.duration, 0, 1); for (let index = 0; index < 9; index += 1) { const angle = cone.angle - BOSS_CONE_HALF_ANGLE + index / 8 * BOSS_CONE_HALF_ANGLE * 2; const fireX = x + Math.cos(angle) * waveRadius; const fireY = y + Math.sin(angle) * waveRadius; ctx.fillStyle = "#a83218"; options.pixelCircle(fireX, fireY, 15); ctx.fillStyle = "#ff6a28"; options.pixelCircle(fireX, fireY - 2, 11); ctx.fillStyle = "#ffd05c"; options.pixelCircle(fireX, fireY - 4, 6); } }
      ctx.restore();
    }
    for (const strike of options.bossRain) { const x = strike.x - camera.x; const y = strike.y - camera.y; const progress = 1 - clamp(strike.timer / strike.maxTimer, 0, 1); const fallY = y - 150 * (1 - progress); ctx.save(); ctx.strokeStyle = "rgba(255,70,54,.92)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, strike.r, 0, TAU); ctx.stroke(); ctx.fillStyle = "#ff5b36"; options.pixelCircle(x, fallY, 9); ctx.fillStyle = "#ffd05c"; options.pixelCircle(x, fallY, 5); ctx.restore(); }
  }
  function drawBoss() {
    if (boss.dead || !options.dragonReady()) return;
    const canvas = options.dragonSpriteCanvas; const cellW = canvas.width / 4; const drawW = 300; const drawH = 400; const x = Math.floor(boss.x - camera.x); const y = Math.floor(boss.y - camera.y);
    options.drawShadow(x, y + 93, 188, .24); ctx.drawImage(canvas, Math.floor(options.gameTime() * 4) % 4 * cellW, 0, cellW, canvas.height, Math.floor(x - drawW / 2), Math.floor(y - drawH / 2), drawW, drawH);
    const barW = 220; const barH = 20; const barX = x - Math.floor(barW / 2); const barY = y - drawH / 2 - 20; const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.86)"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4); ctx.fillStyle = "#4d1d1d"; ctx.fillRect(barX, barY, barW, barH); ctx.fillStyle = "#d8352d"; ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    if (boss.hpLossFlashTimer > 0 && boss.hpLossFlashFrom > boss.hp) { const flashRight = barX + Math.round(barW * clamp(boss.hpLossFlashFrom / boss.maxHp, ratio, 1)); ctx.save(); ctx.globalAlpha = clamp(boss.hpLossFlashTimer / options.hpLossFlashDuration, 0, 1); ctx.fillStyle = "#fff"; ctx.fillRect(barX + Math.round(barW * ratio), barY, Math.max(1, flashRight - (barX + Math.round(barW * ratio))), barH); ctx.restore(); }
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'; options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(boss.hp)))} / ${formatCompactNumber(Math.ceil(boss.maxHp))}`, x, healthBarTextY(barY, barH), "#fff", 4); ctx.textBaseline = "bottom"; options.outlinedText("DRAGON", x, barY - 18, "#f5e9c4", 4); options.outlinedText(rewardText("damage", DRAGON_REWARD_DAMAGE), x, barY - 5, "#ff655a", 4); ctx.restore();
  }
  function drawSpiderTelegraphs() {
    if (spiderBoss.dead) return; const x = spiderBoss.x - camera.x; const y = spiderBoss.y - camera.y;
    if (spiderBoss.web) { const radius = spiderBoss.r + (options.spiderWebRange - spiderBoss.r) * clamp(1 - spiderBoss.web.timer / spiderBoss.web.duration, 0, 1); ctx.save(); ctx.strokeStyle = "rgba(235,239,218,.9)"; ctx.lineWidth = 7; ctx.setLineDash([13, 10]); ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke(); ctx.restore(); }
    for (const pool of options.spiderVenom) { const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1); ctx.save(); ctx.fillStyle = `rgba(113,214,71,${.12 + progress * .18})`; ctx.strokeStyle = "rgba(155,238,88,.95)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pool.x - camera.x, pool.y - camera.y, pool.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  function drawSpiderBoss() {
    if (spiderBoss.dead || !options.spiderReady()) return; const canvas = options.spiderSpriteCanvas; const cellW = canvas.width / 4; const cellH = canvas.height / 2; const frame = Math.floor(options.gameTime() * 5) % 8; const drawW = 310; const drawH = 155; const x = Math.floor(spiderBoss.x - camera.x); const y = Math.floor(spiderBoss.y - camera.y);
    options.drawShadow(x, y + 55, 220, .24); ctx.drawImage(canvas, frame % 4 * cellW, Math.floor(frame / 4) * cellH, cellW, cellH, Math.floor(x - drawW / 2), Math.floor(y - drawH / 2), drawW, drawH);
    const barW = 250; const barH = 22; const barX = x - Math.floor(barW / 2); const barY = y - drawH / 2 - 32; const ratio = clamp(spiderBoss.hp / spiderBoss.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.86)"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4); ctx.fillStyle = "#342027"; ctx.fillRect(barX, barY, barW, barH); ctx.fillStyle = "#9f5c2f"; ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    if (spiderBoss.hpLossFlashTimer > 0 && spiderBoss.hpLossFlashFrom > spiderBoss.hp) { const fromRatio = clamp(spiderBoss.hpLossFlashFrom / spiderBoss.maxHp, ratio, 1); ctx.save(); ctx.globalAlpha = clamp(spiderBoss.hpLossFlashTimer / options.hpLossFlashDuration, 0, 1); ctx.fillStyle = "#fff"; ctx.fillRect(barX + Math.round(barW * ratio), barY, Math.max(1, Math.round(barW * (fromRatio - ratio))), barH); ctx.restore(); }
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'; options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(spiderBoss.hp)))} / ${formatCompactNumber(Math.ceil(spiderBoss.maxHp))}`, x, healthBarTextY(barY, barH), "#fff", 4); ctx.textBaseline = "bottom"; options.outlinedText("DESERT SPIDER", x, barY - 30, "#f5e9c4", 4); options.outlinedText(rewardText("damage", SPIDER_REWARD_DAMAGE), x, barY - 17, "#ff655a", 4); options.outlinedText(rewardText("health", SPIDER_REWARD_HEALTH), x, barY - 5, "#6fe48e", 4); ctx.restore();
  }

  function drawFrostclawTelegraphs() {
    if (frostclawBoss.dead) return;
    const x = frostclawBoss.x - camera.x;
    const y = frostclawBoss.y - camera.y;
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
      const strikeX = strike.x - camera.x;
      const strikeY = strike.y - camera.y;
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
    const x = Math.floor(frostclawBoss.x - camera.x);
    const y = Math.floor(frostclawBoss.y - camera.y);
    const visualY = y + FROSTCLAW_SPRITE_Y_OFFSET;
    const frame = frostclawBoss.roar ? 2 : frostclawBoss.rift ? 1 : options.frostclawIcefalls.length ? 3 : Math.floor(options.gameTime() * 3.5) % 4;
    const pulse = frostclawBoss.roar ? 1 + Math.sin(options.gameTime() * 15) * .018 : 1;
    options.drawShadow(x, visualY + FROSTCLAW_SPRITE_GROUND_OFFSET, 215, .27);
    ctx.save(); ctx.translate(x, visualY + 2); ctx.scale(pulse, pulse);
    ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH); ctx.restore();
    const barW = 270; const barH = 22; const barX = x - Math.floor(barW / 2); const barY = visualY - drawH / 2 - 34; const ratio = clamp(frostclawBoss.hp / frostclawBoss.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.88)"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4); ctx.fillStyle = "#17364b"; ctx.fillRect(barX, barY, barW, barH); ctx.fillStyle = "#42c9f5"; ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    if (frostclawBoss.hpLossFlashTimer > 0 && frostclawBoss.hpLossFlashFrom > frostclawBoss.hp) { const fromRatio = clamp(frostclawBoss.hpLossFlashFrom / frostclawBoss.maxHp, ratio, 1); ctx.save(); ctx.globalAlpha = clamp(frostclawBoss.hpLossFlashTimer / options.hpLossFlashDuration, 0, 1); ctx.fillStyle = "#fff"; ctx.fillRect(barX + Math.round(barW * ratio), barY, Math.max(1, Math.round(barW * (fromRatio - ratio))), barH); ctx.restore(); }
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'; options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(frostclawBoss.hp)))} / ${formatCompactNumber(Math.ceil(frostclawBoss.maxHp))}`, x, healthBarTextY(barY, barH), "#fff", 4); ctx.textBaseline = "bottom"; options.outlinedText("FROSTCLAW", x, barY - 43, "#dff8ff", 4); options.outlinedText(rewardText("damage", FROSTCLAW_REWARD_DAMAGE), x, barY - 30, "#ff655a", 4); options.outlinedText(rewardText("health", FROSTCLAW_REWARD_HEALTH), x, barY - 17, "#6fe48e", 4); options.outlinedText(rewardText("armor", FROSTCLAW_REWARD_ARMOR), x, barY - 4, "#d3dbe0", 4); ctx.restore();
  }

  function drawMagmaliskTelegraphs() {
    if (magmaliskBoss.dead) return;
    const x = magmaliskBoss.x - camera.x;
    const y = magmaliskBoss.y - camera.y;
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
      const strikeX = eruption.x - camera.x;
      const strikeY = eruption.y - camera.y;
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
    const x = Math.floor(magmaliskBoss.x - camera.x);
    const y = Math.floor(magmaliskBoss.y - camera.y);
    const visualY = y + MAGMALISK_SPRITE_Y_OFFSET;
    const pulse = options.magmaliskEruptions.length > 0 ? 1 + Math.sin(options.gameTime() * 14) * .016 : 1;
    options.drawShadow(x, visualY + MAGMALISK_SPRITE_GROUND_OFFSET, 245, .29);
    ctx.save();
    ctx.translate(x, visualY);
    ctx.scale(pulse, pulse);
    ctx.drawImage(canvas, frame * cellW, 0, cellW, canvas.height, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    const barW = 290; const barH = 23; const barX = x - Math.floor(barW / 2); const barY = visualY - drawH / 2 - 34;
    const ratio = clamp(magmaliskBoss.hp / magmaliskBoss.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.9)"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#4b2119"; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "#ef6428"; ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    if (magmaliskBoss.hpLossFlashTimer > 0 && magmaliskBoss.hpLossFlashFrom > magmaliskBoss.hp) {
      const fromRatio = clamp(magmaliskBoss.hpLossFlashFrom / magmaliskBoss.maxHp, ratio, 1);
      ctx.save(); ctx.globalAlpha = clamp(magmaliskBoss.hpLossFlashTimer / options.hpLossFlashDuration, 0, 1); ctx.fillStyle = "#fff";
      ctx.fillRect(barX + Math.round(barW * ratio), barY, Math.max(1, Math.round(barW * (fromRatio - ratio))), barH); ctx.restore();
    }
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(magmaliskBoss.hp)))} / ${formatCompactNumber(Math.ceil(magmaliskBoss.maxHp))}`, x, healthBarTextY(barY, barH), "#fff", 4);
    ctx.textBaseline = "bottom";
    options.outlinedText("MAGMALISK", x, barY - 56, "#ffe0ad", 4);
    options.outlinedText(rewardText("damage", MAGMALISK_REWARD_DAMAGE), x, barY - 43, "#ff655a", 4);
    options.outlinedText(rewardText("health", MAGMALISK_REWARD_HEALTH), x, barY - 30, "#6fe48e", 4);
    options.outlinedText(rewardText("armor", MAGMALISK_REWARD_ARMOR), x, barY - 17, "#d3dbe0", 4);
    options.outlinedText(rewardText("regen", MAGMALISK_REWARD_REGEN), x, barY - 4, "#b877ff", 4);
    ctx.restore();
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
  };
}
