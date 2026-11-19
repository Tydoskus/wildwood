import {
  CROSSING_STEPS,
  GUILD_CROSSING_CENTER_X,
  GUILD_CROSSING_EXIT_PAD,
  GUILD_CROSSING_FEET_OFFSET,
  GUILD_CROSSING_FINISH_PORTAL,
  GUILD_HALL_CROSSING_PORTAL,
  crossingStepY,
  crossingTileRect,
  type CrossingFall,
  type CrossingSide,
} from "../../../../shared/guild-crossing";
import { guildEmblemCell, guildEmblemFor } from "../../guild-emblems";
import { guildHallFrame } from "../../guild-hall";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, type PlayerAppearanceAssets } from "../../player-appearance";
import type { Camera } from "../render/camera";
import { createTintedImageCanvas } from "../render/image-tint";
import { guildCrossingScene, pickCrossingFallCry } from "./guild-crossing-scene";

const FONT = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const FONT_SMALL = '800 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const FONT_BIG = '900 17px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const FONT_POP = '900 19px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';

/** Exact cel-shaded stone/ink palette from WildStat's Duel Arena (`duel-floating-platform-v1.webp`). */
const STONE_INK = "#13182a";
const STONE_MID = "#4a5476";
const STONE_SIDE = "#2c3452";
const STONE_DEEP = "#1b2138";
const GLASS_DEPTH = 15;

export type CrossingArtAssets = {
  duelSpaceBackground?: HTMLImageElement;
  duelPlatformArt?: HTMLImageElement;
  portalArch?: HTMLImageElement;
  portalSwirl?: HTMLImageElement;
  guildHallProps?: HTMLImageElement;
  guildEmblemSheets?: readonly (HTMLImageElement | undefined)[];
  playerAppearanceAssets?: PlayerAppearanceAssets;
  skinTone?: (identity: string | undefined) => number | undefined;
  equipmentForIdentity?: (identity: string | undefined) => {
    headItem?: string;
    chestItem?: string;
    feetItem?: string;
    rightHandItem?: string;
    leftHandItem?: string;
  };
};

function imageReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

/** Deterministic pseudo-random float in `[0, 1)` for subtle per-slab crystal reflections and shard drift. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Active camera shake offset in world/screen pixels (subtle crackle tremble or punchy shatter impact). */
export function crossingShakeOffset(time: number): { x: number; y: number } {
  const { shake, stepping } = guildCrossingScene;
  if (shake.left > 0 && shake.duration > 0) {
    const decay = shake.left / shake.duration;
    const amp = shake.intensity * decay;
    return { x: Math.sin(time * 92) * amp, y: Math.cos(time * 113) * amp * 0.85 };
  }
  if (stepping) {
    const amp = 1.2 + stepping.progress * 3.0;
    return { x: Math.sin(time * 78) * amp, y: Math.cos(time * 96) * amp * 0.65 };
  }
  return { x: 0, y: 0 };
}

/** Wraps `drawPlayer` for the smooth parabolic 2.5D tile-leap arc and the shattered-glass chasm plummet. */
export function drawCrossingFall(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, drawPlayer: () => void) {
  const { fall, leap } = guildCrossingScene;
  if (!fall.active) {
    if (leap.active && leap.duration > 0) {
      const t = Math.max(0, Math.min(1, leap.elapsed / leap.duration));
      const lift = Math.sin(t * Math.PI) * leap.arc;
      ctx.save();
      ctx.translate(0, -lift);
      drawPlayer();
      ctx.restore();
      return;
    }
    drawPlayer();
    return;
  }
  const t = Math.max(0, Math.min(1, fall.progress));
  const ease = t * t;
  const scale = Math.max(0.22, 1 - ease * 0.72);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (t - 0.68) / 0.32));
  ctx.translate(screenX + fall.direction * t * 18, screenY + ease * 96);
  ctx.rotate(fall.direction * t * 2.6);
  ctx.scale(scale, scale);
  ctx.translate(-screenX, -screenY);
  drawPlayer();
  ctx.restore();
}

function drawOutlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = STONE_INK, lineWidth = 4) {
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Draws a Guild Hall prop frame anchored at `(x, y)`. */
function drawHallProp(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement | undefined, frameName: string, x: number, y: number, scale = 1) {
  if (!imageReady(sheet)) return;
  const f = guildHallFrame(frameName);
  if (!f) return;
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, x - f.ax * scale, y - f.ay * scale, f.w * scale, f.h * scale);
}

/** Draws a soft contact shadow on stone matching WildStat's `drawShadow` (`alpha ≈ 0.20`, never jet-black). */
function drawSoftContactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.22) {
  ctx.save();
  ctx.fillStyle = `rgba(9, 13, 24, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws a flaming Guild Hall iron brazier on a floating stone island with warm firelight and a subtle contact shadow. */
function drawBrazier(ctx: CanvasRenderingContext2D, hallProps: HTMLImageElement | undefined, x: number, y: number, time: number, phase: number, scale = 0.80) {
  const flicker = 0.88 + 0.12 * Math.sin(time * 13 + phase);
  const glow = ctx.createRadialGradient(x, y - 16 * scale, 4, x, y - 16 * scale, 74 * scale * flicker);
  glow.addColorStop(0, "rgba(255, 186, 78, 0.34)");
  glow.addColorStop(0.5, "rgba(255, 118, 42, 0.12)");
  glow.addColorStop(1, "rgba(255, 100, 30, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y - 16 * scale, 74 * scale * flicker, 0, Math.PI * 2); ctx.fill();

  drawSoftContactShadow(ctx, x, y + 1, 20 * scale, 8 * scale, 0.22);
  if (imageReady(hallProps)) {
    drawHallProp(ctx, hallProps, "21", x, y, scale);
    const frame = 15 + (Math.floor(time * 10 + phase) % 5);
    drawHallProp(ctx, hallProps, String(frame), x, y, scale);
  }
}

/** Draws a Guild Hall standing banner (`f: 5`) stamped with the guild's real emblem crest. */
function drawGuildBanner(
  ctx: CanvasRenderingContext2D,
  hallProps: HTMLImageElement | undefined,
  emblemSheets: readonly (HTMLImageElement | undefined)[] | undefined,
  guildName: string,
  guildEmblem: number | undefined,
  x: number,
  y: number,
  scale = 0.68,
) {
  drawSoftContactShadow(ctx, x, y + 2, 16 * scale, 6 * scale, 0.20);
  drawHallProp(ctx, hallProps, "5", x, y, scale);
  if (!emblemSheets?.length) return;
  const cell = guildEmblemCell(guildEmblemFor(guildName, guildEmblem));
  const sheet = emblemSheets[cell.sheet];
  if (!imageReady(sheet)) return;
  const size = Math.round(66 * scale);
  const cy = y - 151 * scale;
  ctx.drawImage(sheet, cell.x, cell.y, cell.size, cell.size, x - size / 2, cy - size / 2, size, size);
}

const tintedCrossingSwirls = new Map<string, HTMLCanvasElement>();
function tintedCrossingSwirl(swirl: HTMLImageElement, tint: string): HTMLCanvasElement | HTMLImageElement {
  const key = `${swirl.src}:${tint}`;
  const cached = tintedCrossingSwirls.get(key);
  if (cached) return cached;
  const maxDim = 512;
  const canvas = createTintedImageCanvas(swirl, Math.min(swirl.naturalWidth, maxDim), Math.min(swirl.naturalHeight, maxDim), tint, true);
  if (canvas) {
    tintedCrossingSwirls.set(key, canvas);
    return canvas;
  }
  return swirl;
}

/** Draws WildStat's real Stone Portal Arch + pixel-matched tinted swirling vortex (gold for Victory, emerald for Cleared, cyan for Return). */
function drawWildstatPortal(
  ctx: CanvasRenderingContext2D,
  arch: HTMLImageElement | undefined,
  swirl: HTMLImageElement | undefined,
  x: number,
  y: number,
  time: number,
  kind: "victory" | "return" | "cleared",
  scale = 1,
) {
  const archW = Math.round(156 * scale);
  const archH = Math.round(156 * scale);
  const tint = kind === "victory" ? "#ffd24c" : kind === "cleared" ? "#54e88a" : "#5fe3d6";
  const glowColor = kind === "victory" ? "255, 210, 76" : kind === "cleared" ? "84, 232, 138" : "95, 227, 214";
  const pulse = 0.88 + 0.12 * Math.sin(time * 3.4);

  drawSoftContactShadow(ctx, x, y - 4 * scale, archW * 0.40, 12 * scale, 0.20);

  const aura = ctx.createRadialGradient(x, y - archH * 0.46, 10, x, y - archH * 0.46, 98 * scale * pulse);
  aura.addColorStop(0, `rgba(${glowColor}, 0.54)`);
  aura.addColorStop(0.55, `rgba(${glowColor}, 0.16)`);
  aura.addColorStop(1, `rgba(${glowColor}, 0)`);
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(x, y - archH * 0.46, 98 * scale * pulse, 0, Math.PI * 2); ctx.fill();

  if (imageReady(swirl)) {
    const tinted = tintedCrossingSwirl(swirl, tint);
    const sweep = 0.5 - Math.cos((time / 3) * Math.PI * 2) * 0.5;
    const frameIndex = Math.round(sweep * 15);
    const cellW = tinted.width / 4;
    const cellH = tinted.height / 4;
    const sw = Math.round(archW * 0.59 * 1.265 * 1.05);
    const sh = Math.round(archH * 0.75 * 1.265);
    ctx.drawImage(
      tinted,
      (frameIndex % 4) * cellW,
      Math.floor(frameIndex / 4) * cellH,
      cellW,
      cellH,
      x - sw / 2,
      y - sh - Math.round(5 * scale),
      sw,
      sh,
    );
  }

  if (imageReady(arch)) {
    ctx.drawImage(arch, x - archW / 2, y - archH, archW, archH);
  }
}

/** Draws the cosmic starry Duel space background (seamless mirrored parallax) + distant craggy cel-shaded floating rocks. */
function drawCosmicChasm(
  ctx: CanvasRenderingContext2D,
  spaceBg: HTMLImageElement | undefined,
  camX: number,
  camY: number,
  width: number,
  height: number,
  time: number,
) {
  ctx.fillStyle = "#060814";
  ctx.fillRect(0, 0, width, height);

  if (imageReady(spaceBg)) {
    const tileW = Math.max(width, spaceBg.naturalWidth * 0.85);
    const tileH = tileW * (spaceBg.naturalHeight / spaceBg.naturalWidth);
    const startRow = Math.floor((camY * 0.24) / tileH) - 1;
    const endRow = Math.ceil((camY * 0.24 + height) / tileH) + 1;
    const startCol = Math.floor((camX * 0.16) / tileW) - 1;
    const endCol = Math.ceil((camX * 0.16 + width) / tileW) + 1;
    for (let row = startRow; row <= endRow; row++) {
      const y = row * tileH - camY * 0.24;
      const flipY = (row & 1) !== 0;
      for (let col = startCol; col <= endCol; col++) {
        const x = col * tileW - camX * 0.16;
        const flipX = (col & 1) !== 0;
        ctx.save();
        ctx.translate(x + (flipX ? tileW : 0), y + (flipY ? tileH : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(spaceBg, 0, 0, tileW + 1, tileH + 1);
        ctx.restore();
      }
    }
  }

  // Distant cel-shaded cosmic rocks drifting far below (0.55× parallax for 2.5D vertigo)
  const rocks = [
    { x: 430, y: 2_760, r: 42, phase: 0.4 },
    { x: 1_395, y: 2_480, r: 50, phase: 1.7 },
    { x: 380, y: 2_010, r: 36, phase: 2.8 },
    { x: 1_445, y: 1_650, r: 46, phase: 4.1 },
    { x: 425, y: 1_210, r: 52, phase: 5.2 },
    { x: 1_385, y: 860, r: 40, phase: 0.9 },
  ];
  for (const rock of rocks) {
    const rx = (rock.x - GUILD_CROSSING_CENTER_X) * 0.65 + (GUILD_CROSSING_CENTER_X - camX);
    const ry = rock.y - camY * 0.58 - 420 + Math.sin(time * 0.55 + rock.phase) * 9;
    if (ry < -120 || ry > height + 120 || rx < -120 || rx > width + 120) continue;
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = STONE_DEEP;
    ctx.strokeStyle = STONE_INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - rock.r, ry);
    ctx.lineTo(rx - rock.r * 0.72, ry + rock.r * 0.78);
    ctx.lineTo(rx - rock.r * 0.12, ry + rock.r * 1.04);
    ctx.lineTo(rx + rock.r * 0.34, ry + rock.r * 0.88);
    ctx.lineTo(rx + rock.r * 0.84, ry + rock.r * 0.56);
    ctx.lineTo(rx + rock.r, ry - rock.r * 0.08);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx - rock.r * 0.12, ry + rock.r * 0.26); ctx.lineTo(rx - rock.r * 0.12, ry + rock.r * 1.0); ctx.stroke();
    ctx.fillStyle = STONE_SIDE;
    ctx.beginPath();
    ctx.moveTo(rx - rock.r, ry);
    ctx.lineTo(rx - rock.r * 0.42, ry - rock.r * 0.52);
    ctx.lineTo(rx + rock.r * 0.54, ry - rock.r * 0.44);
    ctx.lineTo(rx + rock.r, ry - rock.r * 0.08);
    ctx.lineTo(rx + rock.r * 0.35, ry + rock.r * 0.25);
    ctx.lineTo(rx - rock.r * 0.48, ry + rock.r * 0.22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = STONE_MID;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx - rock.r * 0.38, ry - rock.r * 0.42); ctx.lineTo(rx + rock.r * 0.44, ry - rock.r * 0.36); ctx.stroke();
    ctx.restore();
  }
}

/** Draws a real Duel floating carved stone island (`duel-floating-platform-v1.webp`). */
function drawFloatingIsland(
  ctx: CanvasRenderingContext2D,
  platformArt: HTMLImageElement | undefined,
  cx: number,
  cy: number,
  size: number,
  goldGlow = false,
) {
  if (goldGlow) {
    const aura = ctx.createRadialGradient(cx, cy - 10, size * 0.18, cx, cy, size * 0.58);
    aura.addColorStop(0, "rgba(255, 210, 88, 0.22)");
    aura.addColorStop(0.65, "rgba(110, 210, 255, 0.06)");
    aura.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.58, 0, Math.PI * 2); ctx.fill();
  }
  if (imageReady(platformArt)) {
    ctx.drawImage(platformArt, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  ctx.fillStyle = STONE_SIDE;
  ctx.strokeStyle = STONE_INK;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(cx, cy + 20, size * 0.44, size * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = STONE_MID;
  ctx.beginPath(); ctx.ellipse(cx, cy, size * 0.44, size * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/**
 * Draws the ACTUAL fallen WildStat guildmate's character body drifting freely in zero-gravity
 * cosmic space where the glass slab shattered beneath them!
 */
function drawFallenGuildmateBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fall: CrossingFall,
  time: number,
  assets: CrossingArtAssets,
  isMostRecent: boolean,
) {
  const bob = Math.sin(time * 1.4 + fall.step * 1.9) * 5;
  const driftX = Math.cos(time * 0.9 + fall.step * 2.3) * 4;
  const baseRot = (fall.step % 2 === 0 ? 1 : -1) * (1.25 + ((fall.step * 37) % 10) * 0.09);
  const rot = baseRot + Math.sin(time * 0.75 + fall.step) * 0.16;

  // Soft eerie cosmic rim-light behind the floating fallen player
  const rim = ctx.createRadialGradient(cx + driftX, cy + 4 + bob, 6, cx + driftX, cy + 4 + bob, 48);
  rim.addColorStop(0, "rgba(148, 178, 255, 0.28)");
  rim.addColorStop(0.6, "rgba(255, 108, 138, 0.11)");
  rim.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx + driftX, cy + 4 + bob, 48, 0, Math.PI * 2); ctx.fill();

  const liveEquip = assets.equipmentForIdentity?.(fall.identity);
  const skinTone = fall.skinTone ?? assets.skinTone?.(fall.identity) ?? DEFAULT_SKIN_TONE;
  const headItem = fall.headItem ?? liveEquip?.headItem ?? "";
  const chestItem = fall.chestItem ?? liveEquip?.chestItem ?? "";
  const feetItem = fall.feetItem ?? liveEquip?.feetItem ?? "";
  const rightHandItem = fall.rightHandItem ?? liveEquip?.rightHandItem ?? "";
  const leftHandItem = fall.leftHandItem ?? liveEquip?.leftHandItem ?? "";

  if (assets.playerAppearanceAssets) {
    ctx.save();
    ctx.translate(cx + driftX, cy + 6 + bob);
    ctx.rotate(rot);
    ctx.scale(0.78, 0.78);
    drawStartingPlayer(ctx, assets.playerAppearanceAssets, {
      x: 0,
      y: 0,
      facing: fall.side === "left" ? 0 : Math.PI,
      moving: false,
      gameTime: 0,
      skinTone,
      headItem,
      chestItem,
      feetItem,
      rightHandItem,
      leftHandItem,
      alpha: 0.94,
    });
    ctx.restore();
  }

  ctx.font = FONT_SMALL;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawOutlinedText(ctx, fall.name, cx, cy + 40, "#ffd4dc", "#090c18", 4);

  if (isMostRecent) {
    const cry = pickCrossingFallCry(fall.step, fall.name);
    const bubbleY = cy - 30 + Math.sin(time * 2.2) * 2.2;
    ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const tw = ctx.measureText(cry).width;
    const bw = tw + 16;
    const bh = 20;
    ctx.save();
    ctx.fillStyle = "rgba(255, 252, 244, 0.95)";
    ctx.strokeStyle = STONE_INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, bubbleY - bh / 2, bw, bh, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, bubbleY + bh / 2 - 1);
    ctx.lineTo(cx, bubbleY + bh / 2 + 5);
    ctx.lineTo(cx + 5, bubbleY + bh / 2 - 1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#181d2c";
    ctx.fillText(cry, cx, bubbleY + 0.5);
    ctx.restore();
  }
}

/**
 * Draws one pure floating 2.5D crystal-glass stepping slab suspended directly in cosmic space —
 * NO heavy grey metal cage around it! Shattered tiles become pure open starry space with a few
 * gently drifting broken crystal shards and the fallen guildmate's real body adrift in the void.
 */
function drawFloatingGlassSlab(
  ctx: CanvasRenderingContext2D,
  step: number,
  side: CrossingSide,
  camX: number,
  camY: number,
  time: number,
  revealed: number,
  completed: boolean,
  safeSide: CrossingSide | undefined,
  fall: CrossingFall | undefined,
  isMostRecentFall: boolean,
  assets: CrossingArtAssets,
) {
  const rect = crossingTileRect(step, side);
  const seed = step * 19 + (side === "right" ? 7 : 3);
  const isRevealed = step < revealed;
  const isFrontier = step === revealed && !completed;
  const isStepping = guildCrossingScene.stepping?.step === step && guildCrossingScene.stepping.side === side;
  const isFlashSafe = guildCrossingScene.safeFlash?.step === step && guildCrossingScene.safeFlash.side === side;
  const isSafe = isRevealed && safeSide === side;

  // Gentle weightless hover bob in deep space (stops steady when you are stepping on it)
  const hover = isStepping ? 0 : Math.sin(time * 1.8 + step * 0.7 + (side === "right" ? 1.5 : 0)) * 2.5;
  const x = rect.left - camX;
  const y = rect.top - camY + hover;
  const w = rect.width;
  const h = rect.height;
  const cx = rect.cx - camX;
  const cy = rect.cy - camY + hover;

  // SHATTERED SLOT: open cosmic void + drifting broken crystal splinters + real fallen guildmate body!
  if (isRevealed && !isSafe) {
    // A handful of small broken crystal splinters drifting lazily in zero-G space
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI * 2 * i) / 6 + hash01(seed + i) * 0.8;
      const dist = 42 + hash01(seed + i + 20) * 24;
      const sx = rect.cx - camX + Math.cos(ang + time * 0.14) * dist;
      const sy = rect.cy - camY + Math.sin(ang + time * 0.14) * (dist * 0.66) + Math.sin(time * 1.4 + i) * 3;
      const sz = 5 + hash01(seed + i + 40) * 6;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang + time * (i % 2 === 0 ? 0.35 : -0.35));
      ctx.fillStyle = "rgba(176, 232, 255, 0.36)";
      ctx.strokeStyle = STONE_INK;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.72, sz * 0.4);
      ctx.lineTo(-sz * 0.56, sz * 0.7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    if (fall) {
      drawFallenGuildmateBody(ctx, rect.cx - camX, rect.cy - camY, fall, time, assets, isMostRecentFall);
    }
    return;
  }

  // INTACT 2.5D FLOATING CRYSTAL SLAB
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.6 + (side === "right" ? 1.2 : 0));

  ctx.save();
  // Soft seamless elliptical under-glow (scaled radial gradient reaches 0 alpha well before the arc edge — zero visible rim)
  if (isSafe || isFrontier || isStepping) {
    const glowRgb = isSafe ? "74, 232, 146" : isStepping ? "255, 214, 96" : "108, 226, 248";
    const glowAlpha = isStepping ? 0.30 : isFrontier ? 0.14 + pulse * 0.10 : 0.17;
    const r = w * 0.92;
    ctx.save();
    ctx.translate(cx, cy + 8);
    ctx.scale(1, 0.72);
    const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, r);
    aura.addColorStop(0, `rgba(${glowRgb}, ${glowAlpha.toFixed(3)})`);
    aura.addColorStop(0.42, `rgba(${glowRgb}, ${(glowAlpha * 0.42).toFixed(3)})`);
    aura.addColorStop(0.76, `rgba(${glowRgb}, ${(glowAlpha * 0.08).toFixed(3)})`);
    aura.addColorStop(1, `rgba(${glowRgb}, 0)`);
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 1. Thick 2.5D beveled crystal underside hanging in deep space
  const frontTop = y + h - 4;
  const frontGrad = ctx.createLinearGradient(x, frontTop, x, frontTop + GLASS_DEPTH);
  if (isSafe) {
    frontGrad.addColorStop(0, isFlashSafe ? "rgba(140, 255, 192, 0.90)" : "rgba(46, 186, 114, 0.84)");
    frontGrad.addColorStop(1, "rgba(16, 86, 56, 0.95)");
  } else if (isStepping) {
    frontGrad.addColorStop(0, "rgba(255, 220, 102, 0.88)");
    frontGrad.addColorStop(1, "rgba(148, 92, 24, 0.95)");
  } else if (isFrontier) {
    frontGrad.addColorStop(0, `rgba(124, 232, 248, ${(0.66 + pulse * 0.16).toFixed(3)})`);
    frontGrad.addColorStop(1, "rgba(38, 106, 152, 0.92)");
  } else {
    frontGrad.addColorStop(0, "rgba(120, 174, 224, 0.50)");
    frontGrad.addColorStop(1, "rgba(36, 58, 98, 0.84)");
  }
  ctx.fillStyle = frontGrad;
  ctx.beginPath();
  ctx.roundRect(x, frontTop, w, GLASS_DEPTH + 4, [0, 0, 11, 11]);
  ctx.fill();
  ctx.strokeStyle = STONE_INK;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Vertical crystal refraction highlights along the 3D glass edge
  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(x + 18 + Math.round(hash01(seed) * 16), frontTop + 3, 14, GLASS_DEPTH - 3);
  ctx.fillRect(x + w - 44 + Math.round(hash01(seed + 5) * 12), frontTop + 3, 8, GLASS_DEPTH - 3);

  // 2. Main translucent crystal top surface (stars & nebula softly shine right through!)
  const topGrad = ctx.createLinearGradient(x, y, x + w * 0.65, y + h);
  if (isSafe) {
    topGrad.addColorStop(0, isFlashSafe ? "rgba(176, 255, 208, 0.80)" : "rgba(88, 238, 156, 0.52)");
    topGrad.addColorStop(1, isFlashSafe ? "rgba(92, 238, 148, 0.64)" : "rgba(32, 168, 98, 0.36)");
  } else if (isStepping) {
    topGrad.addColorStop(0, "rgba(255, 238, 154, 0.60)");
    topGrad.addColorStop(1, "rgba(255, 180, 68, 0.36)");
  } else if (isFrontier) {
    topGrad.addColorStop(0, `rgba(182, 248, 255, ${(0.38 + pulse * 0.14).toFixed(3)})`);
    topGrad.addColorStop(1, `rgba(94, 202, 238, ${(0.24 + pulse * 0.10).toFixed(3)})`);
  } else {
    topGrad.addColorStop(0, "rgba(168, 214, 252, 0.26)");
    topGrad.addColorStop(1, "rgba(92, 140, 196, 0.15)");
  }
  ctx.fillStyle = topGrad;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();

  // 3. Cel-shaded diagonal specular glass reflections + unique per-pane crystal facets
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 8); ctx.clip();
  const shift = (hash01(seed + 9) - 0.5) * 28;
  ctx.fillStyle = isFrontier || isSafe ? "rgba(255, 255, 255, 0.23)" : "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(x - 14 + shift, y + h * 0.72);
  ctx.lineTo(x + w * 0.44 + shift, y - 10);
  ctx.lineTo(x + w * 0.60 + shift, y - 10);
  ctx.lineTo(x + w * 0.02 + shift, y + h + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.67 + shift, y - 10);
  ctx.lineTo(x + w * 0.75 + shift, y - 10);
  ctx.lineTo(x + w * 0.18 + shift, y + h + 10);
  ctx.lineTo(x + w * 0.10 + shift, y + h + 10);
  ctx.closePath();
  ctx.fill();

  // Subtle unique crystal scratch/gleam per pane
  ctx.strokeStyle = isSafe ? "rgba(220, 255, 236, 0.24)" : "rgba(225, 245, 255, 0.18)";
  ctx.lineWidth = 1.5;
  const sx1 = x + 18 + hash01(seed + 11) * (w - 50);
  const sy1 = y + 16 + hash01(seed + 12) * (h - 36);
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx1 + 16, sy1 + (hash01(seed + 13) > 0.5 ? 7 : -7));
  ctx.stroke();

  // Racing spiderweb fracture cracks during the heart-stopping suspense beat!
  if (isStepping) {
    const p = guildCrossingScene.stepping?.progress ?? 0.5;
    ctx.strokeStyle = "#fff9da";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx - 38 * p, cy - 26 * p);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 46 * p, cy - 18 * p);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + 28 * p, cy + 32 * p);
    ctx.moveTo(cx, cy); ctx.lineTo(cx - 44 * p, cy + 22 * p);
    if (p > 0.35) {
      ctx.moveTo(cx - 22 * p, cy - 15 * p); ctx.lineTo(cx - 8 * p, cy - 36 * p);
      ctx.moveTo(cx + 24 * p, cy - 10 * p); ctx.lineTo(cx + 52 * p, cy + 8 * p);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 4. Luminous inner crystal bevel + clean chunky cel-shaded dark ink border
  ctx.strokeStyle = isSafe
    ? (isFlashSafe ? "#d4ffe4" : "rgba(148, 255, 194, 0.88)")
    : isStepping
      ? "#ffe57f"
      : isFrontier
        ? `rgba(182, 252, 255, ${(0.70 + pulse * 0.28).toFixed(3)})`
        : "rgba(186, 224, 255, 0.42)";
  ctx.lineWidth = isFrontier || isSafe ? 3 : 2;
  ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 8); ctx.stroke();

  ctx.strokeStyle = STONE_INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.stroke();
  ctx.restore();
}

/** Draws the pure, frameless 2.5D WildStat Glass Crossing world: two floating Duel islands + 16 pairs of floating crystal slabs over deep space. */
export function createGuildCrossingGroundRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  time: () => number;
  active: () => boolean;
  assets?: () => CrossingArtAssets;
  /** Draw the south Return Portal arch here (UI Studio preview); in the live game `world.drawPortal` draws it depth-sorted. */
  drawExitPortal?: boolean;
}) {
  return () => {
    if (!options.active()) return;
    const { ctx, camera } = options;
    const view = options.viewport();
    const zoom = camera.zoom || 1;
    const width = view.width / zoom;
    const height = view.height / zoom;
    const time = options.time();
    const shake = crossingShakeOffset(time);
    const camX = camera.x + shake.x;
    const camY = camera.y + shake.y;
    const snap = guildCrossingScene.snapshot;
    const revealed = snap?.revealed ?? 0;
    const completed = Boolean(snap?.completed);
    const assets = options.assets?.() ?? {};

    ctx.save();
    // 1. Real Duel cosmic space nebula + drifting distant space rocks
    drawCosmicChasm(ctx, assets.duelSpaceBackground, camX, camY, width, height, time);

    // 2. North Victory Island (farthest north)
    const finCx = GUILD_CROSSING_CENTER_X - camX;
    const finCy = 505 - camY;
    const finishReady = revealed >= CROSSING_STEPS && !completed;
    if (finCy > -380 && finCy < height + 380) {
      drawFloatingIsland(ctx, assets.duelPlatformArt, finCx, finCy, 590, finishReady || completed);
      // Guild emblem banners + gleaming Gold Victory Portal + softly-shadowed flaming braziers
      drawGuildBanner(ctx, assets.guildHallProps, assets.guildEmblemSheets, snap?.guildName ?? "", snap?.guildEmblem, finCx - 146, finCy - 24, 0.68);
      drawGuildBanner(ctx, assets.guildHallProps, assets.guildEmblemSheets, snap?.guildName ?? "", snap?.guildEmblem, finCx + 146, finCy - 24, 0.68);
      const portalX = GUILD_CROSSING_FINISH_PORTAL.x - camX;
      const portalY = GUILD_CROSSING_FINISH_PORTAL.y + 72 - camY;
      drawWildstatPortal(ctx, assets.portalArch, assets.portalSwirl, portalX, portalY, time, completed ? "cleared" : "victory", 1.10);
      drawBrazier(ctx, assets.guildHallProps, finCx - 122, finCy + 72, time, 1.1, 0.82);
      drawBrazier(ctx, assets.guildHallProps, finCx + 122, finCy + 72, time, 3.4, 0.82);

      const bob = Math.sin(time * 2.3) * 2.5;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = FONT_BIG;
      drawOutlinedText(
        ctx,
        completed ? `Cleared by ${snap?.winner?.name ?? "Guild"}!` : "Victory Portal",
        portalX,
        portalY - 180 + bob,
        completed ? "#9df8b4" : "#ffe27a",
        STONE_INK,
        5,
      );
      if (!completed) {
        ctx.font = FONT_SMALL;
        drawOutlinedText(ctx, finishReady ? "Step through · +20 pts" : "+20 Bonus Points", portalX, portalY - 161 + bob, "#fff1be", STONE_INK, 4);
      }
    }

    // 3. All 16 pairs of pure floating 2.5D crystal slabs drawn NORTH-TO-SOUTH (Step 16 -> Step 1)
    const falls = snap?.falls ?? [];
    const fallsByStep = new Map(falls.map(f => [f.step, f]));
    const latestFallStep = falls.length ? falls[falls.length - 1].step : -1;

    for (let step = CROSSING_STEPS - 1; step >= 0; step--) {
      const cy = crossingStepY(step);
      if (cy - camY < -180 || cy - camY > height + 180) continue;

      const safeSide = snap?.revealedSides[step];
      const fall = fallsByStep.get(step);
      drawFloatingGlassSlab(ctx, step, "left", camX, camY, time, revealed, completed, safeSide, fall?.side === "left" ? fall : undefined, fall?.side === "left" && step === latestFallStep, assets);
      drawFloatingGlassSlab(ctx, step, "right", camX, camY, time, revealed, completed, safeSide, fall?.side === "right" ? fall : undefined, fall?.side === "right" && step === latestFallStep, assets);

      // Subtle floating step number hovering lightly between the pair (clean, zero clutter)
      const isFrontier = step === revealed && !completed;
      ctx.save();
      ctx.globalAlpha = isFrontier ? 0.95 : 0.42;
      ctx.font = FONT_SMALL;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      drawOutlinedText(ctx, String(step + 1), GUILD_CROSSING_CENTER_X - camX, cy - camY, isFrontier ? "#a8faff" : "#a8bad8", STONE_INK, 3);
      ctx.restore();
    }

    // 4. South Start Island (closest to camera in 2.5D) — clean Duel island + cyan Return Portal + softly lit braziers
    const startCx = GUILD_CROSSING_CENTER_X - camX;
    const startCy = 3_150 - camY;
    if (startCy > -380 && startCy < height + 380) {
      drawFloatingIsland(ctx, assets.duelPlatformArt, startCx, startCy, 590, false);
      drawBrazier(ctx, assets.guildHallProps, startCx - 134, startCy - 66, time, 0.3, 0.82);
      drawBrazier(ctx, assets.guildHallProps, startCx + 134, startCy - 66, time, 2.1, 0.82);
      if (options.drawExitPortal) {
        const exitX = GUILD_CROSSING_EXIT_PAD.x - camX;
        const exitY = GUILD_CROSSING_EXIT_PAD.y - camY;
        drawWildstatPortal(ctx, assets.portalArch, assets.portalSwirl, exitX, exitY, time, "return", 136 / 156);
        const bob = Math.sin(time * 2.2) * 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.font = FONT;
        drawOutlinedText(ctx, "Town", exitX, exitY - 144 + bob, "#9efbf2", STONE_INK, 4);
      }
    }

    // 5. Subtle target landing ring while leaping between floating crystal slabs
    if (guildCrossingScene.leap.active) {
      const lx = guildCrossingScene.leap.toX - camX;
      const ly = guildCrossingScene.leap.toY + GUILD_CROSSING_FEET_OFFSET - camY;
      const t = Math.min(1, guildCrossingScene.leap.elapsed / Math.max(0.01, guildCrossingScene.leap.duration));
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - t * 0.45);
      ctx.strokeStyle = "#9efbf2";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(lx, ly, 24 - t * 8, 12 - t * 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 6. Expanding glowing shockwaves on safe holds / clears
    for (const w of guildCrossingScene.shockwaves) {
      const alpha = Math.max(0, w.life / w.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 4 * alpha + 1.5;
      ctx.beginPath(); ctx.arc(w.x - camX, w.y - camY, w.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  };
}

/** Draws spinning cel-shaded crystal shards, viral floating comic pops, and a slim non-intrusive top status chip. */
export function createGuildCrossingOverlayRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  time?: () => number;
  active: () => boolean;
  topInset?: number;
}) {
  return () => {
    if (!options.active()) return;
    const { ctx, camera } = options;
    const { width } = options.viewport();
    const shake = crossingShakeOffset(options.time?.() ?? 0);
    const camX = camera.x + shake.x;
    const camY = camera.y + shake.y;

    if (guildCrossingScene.shards.length) {
      ctx.save();
      for (const s of guildCrossingScene.shards) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life / (s.maxLife * 0.72)));
        ctx.translate(s.x - camX, s.y - camY);
        ctx.rotate(s.rot);
        ctx.fillStyle = s.color;
        ctx.strokeStyle = STONE_INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -s.size);
        ctx.lineTo(s.size * 0.72, s.size * 0.35);
        ctx.lineTo(-s.size * 0.58, s.size * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    if (guildCrossingScene.pops.length) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const p of guildCrossingScene.pops) {
        const t = 1 - p.life / p.maxLife;
        const alpha = t < 0.72 ? 1 : Math.max(0, (1 - t) / 0.28);
        const popScale = t < 0.14 ? 0.65 + (t / 0.14) * 0.5 : 1.15 - Math.min(0.15, (t - 0.14) * 0.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x - camX, p.y - camY);
        ctx.scale(p.scale * popScale, p.scale * popScale);
        if (p.speech) {
          ctx.font = FONT;
          const tw = ctx.measureText(p.text).width;
          ctx.fillStyle = "#fffdf5";
          ctx.strokeStyle = STONE_INK;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.roundRect(-tw / 2 - 12, -14, tw + 24, 28, 11); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#161b29";
          ctx.fillText(p.text, 0, 1);
        } else {
          ctx.font = FONT_POP;
          drawOutlinedText(ctx, p.text, 0, 0, p.color, STONE_INK, 5);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    const snap = guildCrossingScene.snapshot;
    if (snap) {
      const zoom = camera.zoom || 1;
      ctx.save();
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.font = FONT_SMALL;
      const line = snap.completed
        ? `Glass Crossing · Cleared · +${snap.pointsAwarded} pts · Tap tiles to hop`
        : `Step ${Math.min(snap.revealed, snap.steps)}/${snap.steps} · +${snap.pointsAwarded}/${snap.maxPoints} pts · ${snap.remainingToday}/${snap.dailyLimit} ${snap.dailyLimit === 1 ? "try" : "tries"}${snap.currentStreak > 1 ? ` · 🔥×${snap.currentStreak}` : ""} · Tap tile to jump`;
      const pillW = Math.min(width - 24, Math.max(220, ctx.measureText(line).width + 28));
      const pillX = (width - pillW) / 2;
      const pillY = options.topInset ?? 14;
      ctx.fillStyle = "rgba(14, 19, 34, 0.80)";
      ctx.strokeStyle = snap.completed ? "rgba(86, 230, 142, 0.72)" : "rgba(130, 184, 232, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, 28, 14); ctx.fill(); ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = snap.completed ? "#9df8b4" : "#eef6ff";
      ctx.fillText(line, width / 2, pillY + 14.5);

      const banner = guildCrossingScene.banner;
      if (banner && banner.left > 0) {
        ctx.globalAlpha = Math.min(1, banner.left * 2);
        ctx.font = FONT_BIG;
        drawOutlinedText(ctx, banner.text, width / 2, pillY + 48, banner.color, STONE_INK, 5);
      }
      ctx.restore();
    }
  };
}

/** Draws the real Stone Portal Arch + aqua swirl leading into Glass Crossing on the Guild Hall courtyard west lawn. */
export function createGuildHallCrossingPortalRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  time: () => number;
  active: () => boolean;
  arch?: () => HTMLImageElement | undefined;
  swirl?: () => HTMLImageElement | undefined;
}) {
  return () => {
    if (!options.active()) return;
    const { ctx, camera } = options;
    const t = options.time();
    const x = GUILD_HALL_CROSSING_PORTAL.x - camera.x;
    const y = GUILD_HALL_CROSSING_PORTAL.y - camera.y;
    ctx.save();
    drawWildstatPortal(ctx, options.arch?.(), options.swirl?.(), x, y + 36, t, "return", 0.88);
    const bob = Math.sin(t * 2.2) * 2;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    drawOutlinedText(ctx, "Glass Crossing", x, y - 98 + bob, "#9efbf2", STONE_INK, 4);
    ctx.restore();
  };
}
