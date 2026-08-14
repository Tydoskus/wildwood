import { BOSS_CONE_HALF_ANGLE, BOSS_CONE_RANGE, TAU } from "../constants";
import { clamp } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import type { Camera } from "./camera";
import type { BossRainStrike, DragonBossState, SpiderBossState, SpiderVenomPool } from "./types";

type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

export function createBossRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  dragonSpriteCanvas: HTMLCanvasElement;
  spiderSpriteCanvas: HTMLCanvasElement;
  dragonReady: () => boolean;
  spiderReady: () => boolean;
  gameTime: () => number;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  hpLossFlashDuration: number;
  spiderWebRange: number;
}) {
  const { ctx, camera, boss, spiderBoss } = options;
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
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'; options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(boss.hp)))} / ${formatCompactNumber(Math.ceil(boss.maxHp))} HP`, x, barY + barH / 2, "#fff", 4); ctx.textBaseline = "bottom"; options.outlinedText("DRAGON", x, barY - 18, "#f5e9c4", 4); options.outlinedText("+650 DAMAGE", x, barY - 5, "#ff655a", 4); ctx.restore();
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
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'; options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(spiderBoss.hp)))} / ${formatCompactNumber(Math.ceil(spiderBoss.maxHp))} HP`, x, barY + barH / 2, "#fff", 4); ctx.textBaseline = "bottom"; options.outlinedText("DESERT SPIDER", x, barY - 30, "#f5e9c4", 4); options.outlinedText("+75K DAMAGE", x, barY - 17, "#ff655a", 4); options.outlinedText("+200K MAX HEALTH", x, barY - 5, "#6fe48e", 4); ctx.restore();
  }
  return { drawBossTelegraphs, drawBoss, drawSpiderTelegraphs, drawSpiderBoss };
}
