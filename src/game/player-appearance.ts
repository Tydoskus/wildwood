import { TRAILBLAZER_BOOTS } from "./inventory";

export const PLAYER_SKIN_TONES = [
  "#f9dfd0", "#f2c8ac", "#e9b58f", "#d99e76", "#c88358",
  "#ae6f48", "#8e5738", "#6d402a", "#4f2d20", "#352017",
] as const;
export const PLAYER_SKIN_TONE_NAMES = ["porcelain", "fair", "light", "warm beige", "golden", "tan", "brown", "deep brown", "rich espresso", "deep umber"] as const;
export const DEFAULT_SKIN_TONE = 3;

export type PlayerAppearanceAssets = {
  basicFrontLeg: HTMLImageElement;
  basicBackLeg: HTMLImageElement;
  bootsFrontLeg: HTMLImageElement;
  bootsBackLeg: HTMLImageElement;
  stone: HTMLImageElement;
  basicPaperHat: HTMLImageElement;
};

function image(source: string, settled: () => void) {
  const asset = new Image();
  asset.addEventListener("load", settled, { once: true });
  asset.addEventListener("error", settled, { once: true });
  asset.src = source;
  return asset;
}

export function loadPlayerAppearanceAssets(settled: () => void): PlayerAppearanceAssets {
  return {
    basicFrontLeg: image("assets/wildwood/player-parts/basic-leg-front.png", settled),
    basicBackLeg: image("assets/wildwood/player-parts/basic-leg-back.png", settled),
    bootsFrontLeg: image("assets/wildwood/player-parts/boots-leg-front.png", settled),
    bootsBackLeg: image("assets/wildwood/player-parts/boots-leg-back.png", settled),
    stone: image("assets/wildwood/player-parts/stone.png", settled),
    basicPaperHat: image("assets/wildwood/player-parts/basic-paper-hat.png", settled),
  };
}

export function skinToneColor(value: number | undefined) {
  return PLAYER_SKIN_TONES[Math.max(0, Math.min(PLAYER_SKIN_TONES.length - 1, Math.floor(value ?? DEFAULT_SKIN_TONE)))] ?? PLAYER_SKIN_TONES[DEFAULT_SKIN_TONE];
}

function drawEgg(ctx: CanvasRenderingContext2D, width: number, height: number, inset: number, fill: string) {
  const left = inset, top = inset, eggWidth = width - inset * 2, eggHeight = height - inset * 2, middle = left + eggWidth / 2;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(middle, top);
  ctx.bezierCurveTo(left + eggWidth * .78, top, left + eggWidth, top + eggHeight * .2, left + eggWidth, top + eggHeight * .56);
  ctx.bezierCurveTo(left + eggWidth, top + eggHeight * .84, left + eggWidth * .74, top + eggHeight, middle, top + eggHeight);
  ctx.bezierCurveTo(left + eggWidth * .26, top + eggHeight, left, top + eggHeight * .84, left, top + eggHeight * .56);
  ctx.bezierCurveTo(left, top + eggHeight * .2, left + eggWidth * .22, top, middle, top); ctx.closePath(); ctx.fill();
}

function drawPillHead(ctx: CanvasRenderingContext2D, width: number, height: number, skin: string) {
  const pill = (inset: number, fill: string) => {
    const pillWidth = width - inset * 2, pillHeight = height - inset * 2, radius = pillHeight / 2, left = inset, top = inset;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(left + radius, top); ctx.lineTo(left + pillWidth - radius, top);
    ctx.arc(left + pillWidth - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(left + radius, top + pillHeight); ctx.arc(left + radius, top + radius, radius, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  };
  pill(0, "#000"); pill(3.5, skin);
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(width * .42, height * .51, 5.7, 0, Math.PI * 2); ctx.arc(width * .77, height * .51, 5.7, 0, Math.PI * 2); ctx.fill();
}

export function drawStartingPlayer(
  ctx: CanvasRenderingContext2D,
  assets: PlayerAppearanceAssets,
  options: { x: number; y: number; facing: number; moving?: boolean; gameTime: number; skinTone?: number; feetItem?: string; alpha?: number; scale?: number },
) {
  const scale = options.scale ?? .6;
  const walkFrame = options.moving ? Math.floor(options.gameTime * 10) % 3 + 1 : 0;
  const idleFrame = Math.floor(options.gameTime * 2) % 4;
  const gait = {
    back: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -3 }][walkFrame] ?? { x: 0, y: 0 },
    front: [{ x: 0, y: 0 }, { x: -1, y: -3 }, { x: -4, y: 0 }, { x: 2, y: 0 }][walkFrame] ?? { x: 0, y: 0 },
    head: [0, -2, -3, -2][idleFrame] ?? 0,
  };
  const boots = options.feetItem === TRAILBLAZER_BOOTS;
  const backLeg = boots ? assets.bootsBackLeg : assets.basicBackLeg;
  const frontLeg = boots ? assets.bootsFrontLeg : assets.basicFrontLeg;
  const drawLayer = (asset: HTMLImageElement, x: number, y: number) => {
    if (asset.complete && asset.naturalWidth > 0) ctx.drawImage(asset, x, y, asset.naturalWidth, asset.naturalHeight);
  };

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.translate(Math.round(options.x), Math.round(options.y + 29));
  if (Math.cos(options.facing) < 0) ctx.scale(-1, 1);
  ctx.scale(scale, scale); ctx.translate(-90, -171);
  drawLayer(backLeg, 90 - backLeg.naturalWidth / 2 - 8 + gait.back.x, 171 - backLeg.naturalHeight + gait.back.y);
  drawLayer(frontLeg, 90 - frontLeg.naturalWidth / 2 + 8 + gait.front.x, 171 - frontLeg.naturalHeight + gait.front.y);
  ctx.save(); ctx.translate(90 - 41.4675 / 2, 157 - 45.315); drawEgg(ctx, 41.4675, 45.315, 0, "#000"); drawEgg(ctx, 41.4675, 45.315, 3, skinToneColor(options.skinTone)); ctx.restore();
  ctx.save(); ctx.translate(90 - 61.75 / 2 + 4, 104 - 40 + 15 + gait.head); drawPillHead(ctx, 61.75, 40, skinToneColor(options.skinTone)); ctx.restore();
  drawLayer(assets.basicPaperHat, 90 - assets.basicPaperHat.naturalWidth / 2 + 4, 118 - assets.basicPaperHat.naturalHeight + 26 + gait.head);
  drawLayer(assets.stone, 90 - assets.stone.naturalWidth / 2 + 18, 112);
  ctx.restore();
}
