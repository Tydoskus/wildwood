import { BASIC_PAPER_HAT, STARTER_STONE } from "./inventory";
import { ITEM_PRESENTATIONS, itemPresentation, type WorldSpritePresentation } from "./item-presentation";

export const PLAYER_SKIN_TONES = [
  "#f9dfd0", "#f2c8ac", "#e9b58f", "#d99e76", "#c88358",
  "#ae6f48", "#8e5738", "#6d402a", "#4f2d20", "#352017",
  "#c9f3a1", "#76d7a0", "#69c7df", "#7d9ff0", "#b496ed",
  "#ee9dca", "#ed7884", "#c97be4", "#e0bf6d", "#aeb7c5",
] as const;
export const PLAYER_SKIN_TONE_NAMES = [
  "porcelain", "fair", "light", "warm beige", "golden", "tan", "brown", "deep brown", "rich espresso", "deep umber",
  "light green", "mint", "sky blue", "periwinkle", "lavender", "pink", "coral red", "violet", "gold", "cool gray",
] as const;
export const DEFAULT_SKIN_TONE = 3;
export const BOW_RIGHT_HAND_ANGLE_DEGREES = 125;
const BOW_SOURCE_DOWN_ANGLE_DEGREES = 180;
const DEGREES_TO_RADIANS = Math.PI / 180;

export type PlayerAppearanceAssets = {
  basicFrontLeg: HTMLImageElement;
  basicBackLeg: HTMLImageElement;
  equipment: Record<string, {
    sprite?: HTMLImageElement;
    frontLeg?: HTMLImageElement;
    backLeg?: HTMLImageElement;
  }>;
};

function image(source: string, settled: () => void) {
  const asset = new Image();
  asset.addEventListener("load", settled, { once: true });
  asset.addEventListener("error", settled, { once: true });
  asset.src = source;
  return asset;
}

export function loadPlayerAppearanceAssets(settled: () => void): PlayerAppearanceAssets {
  const expectedAssetCount = 2 + Object.values(ITEM_PRESENTATIONS).reduce((count, presentation) =>
    count + (presentation.world?.kind === "LEGS" ? 2 : presentation.world ? 1 : 0), 0);
  let settledAssetCount = 0;
  const markAssetSettled = () => {
    settledAssetCount += 1;
    if (settledAssetCount >= expectedAssetCount) settled();
  };
  const equipment: PlayerAppearanceAssets["equipment"] = {};
  for (const [itemId, presentation] of Object.entries(ITEM_PRESENTATIONS)) {
    if (!presentation.world) continue;
    equipment[itemId] = presentation.world.kind === "LEGS"
      ? {
        frontLeg: image(presentation.world.frontSource, markAssetSettled),
        backLeg: image(presentation.world.backSource, markAssetSettled),
      }
      : { sprite: image(presentation.world.source, markAssetSettled) };
  }
  return {
    basicFrontLeg: image("assets/wildwood/player-parts/basic-leg-front.png", markAssetSettled),
    basicBackLeg: image("assets/wildwood/player-parts/basic-leg-back.png", markAssetSettled),
    equipment,
  };
}

export function skinToneColor(value: number | undefined) {
  return PLAYER_SKIN_TONES[Math.max(0, Math.min(PLAYER_SKIN_TONES.length - 1, Math.floor(value ?? DEFAULT_SKIN_TONE)))] ?? PLAYER_SKIN_TONES[DEFAULT_SKIN_TONE];
}

/** Converts the requested 125° right-hand pose into canvas rotation. */
export function bowHeldRotationRadians(options: {
  combatFacing?: number | null;
  facingLeft: boolean;
  heldInLeftHand: boolean;
}) {
  const handOffsetDegrees = options.heldInLeftHand
    ? BOW_SOURCE_DOWN_ANGLE_DEGREES - BOW_RIGHT_HAND_ANGLE_DEGREES
    : BOW_RIGHT_HAND_ANGLE_DEGREES - BOW_SOURCE_DOWN_ANGLE_DEGREES;
  const localAim = options.combatFacing === null || options.combatFacing === undefined
    ? 0
    : options.facingLeft ? Math.PI - options.combatFacing : options.combatFacing;
  return localAim + handOffsetDegrees * DEGREES_TO_RADIANS;
}

/** Mirrors the tuned right-hand bow alignment when the bow changes hands. */
export function bowHeldAlignment(heldInLeftHand: boolean) {
  return {
    x: heldInLeftHand ? -4 : 4,
    y: -2,
    scaleX: heldInLeftHand ? -1 : 1,
  };
}

/** Subtle client-side arm sway shared by every held weapon while running. */
export function heldWeaponRunMotion(options: {
  moving?: boolean;
  gameTime: number;
  heldInLeftHand: boolean;
}) {
  if (!options.moving) return { x: 0, y: 0, rotation: 0 };
  const phase = options.gameTime * 12;
  const handDirection = options.heldInLeftHand ? -1 : 1;
  return {
    x: Math.sin(phase) * 2.5 * handDirection,
    y: Math.sin(phase * 2) * 1.5,
    rotation: Math.sin(phase) * 4.5 * DEGREES_TO_RADIANS * handDirection,
  };
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
  options: { x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; gameTime: number; throwClock?: number; skinTone?: number; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string; alpha?: number; scale?: number },
) {
  const scale = options.scale ?? .6;
  const walkFrame = options.moving ? Math.floor(options.gameTime * 10) % 3 + 1 : 0;
  const idleFrame = Math.floor(options.gameTime * 2) % 4;
  const gait = {
    back: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -3 }][walkFrame] ?? { x: 0, y: 0 },
    front: [{ x: 0, y: 0 }, { x: -1, y: -3 }, { x: -4, y: 0 }, { x: 2, y: 0 }][walkFrame] ?? { x: 0, y: 0 },
    head: [0, -2, -3, -2][idleFrame] ?? 0,
  };
  const facingLeft = Math.cos(options.facing) < 0;
  const attackElapsed = Math.max(0, .42 - (options.throwClock ?? 0));
  const handStateKnown = options.rightHandItem !== undefined || options.leftHandItem !== undefined;
  const heldItem = options.rightHandItem || options.leftHandItem || (!handStateKnown ? STARTER_STONE : "");
  const heldInLeftHand = Boolean(heldItem && options.leftHandItem === heldItem);
  const heldPresentation = itemPresentation(heldItem)?.world;
  const heldSpritePresentation = heldPresentation?.kind === "SPRITE" && heldPresentation.layer === "HAND"
    ? heldPresentation
    : undefined;
  // Mirroring the hand anchor makes the same item visibly change sides.
  let heldX = heldInLeftHand ? (facingLeft ? -11 : 30) : (facingLeft ? 30 : -11);
  let heldY = heldSpritePresentation?.top ?? 116;
  const bowAlignment = heldSpritePresentation?.handAction === "BOW"
    ? bowHeldAlignment(heldInLeftHand)
    : { x: 0, y: 0, scaleX: 1 };
  heldX += bowAlignment.x;
  heldY += bowAlignment.y;
  let heldVisible = true;
  if (heldSpritePresentation?.handAction === "THROW") {
    if (attackElapsed > 0 && attackElapsed < .12) {
      const windup = attackElapsed / .12;
      heldX -= 11 * (1 - (1 - windup) * (1 - windup));
      heldY += 2 * windup;
    } else if (attackElapsed >= .12 && attackElapsed < .20) {
      heldVisible = false;
    } else if (attackElapsed >= .20 && attackElapsed < .42) {
      const reload = (attackElapsed - .20) / .22;
      heldX += 14 * (1 - reload);
      heldY -= Math.sin(reload * Math.PI) * 5;
    }
  } else if (attackElapsed > 0 && attackElapsed < .12) {
    const windup = attackElapsed / .12;
    heldX -= 6 * (1 - (1 - windup) * (1 - windup));
    heldY += 2 * windup;
  } else if (attackElapsed >= .12 && attackElapsed < .20) {
    const release = (attackElapsed - .12) / .08;
    heldX += 4 * (1 - release);
  } else if (attackElapsed >= .20 && attackElapsed < .42) {
    const settle = (attackElapsed - .20) / .22;
    heldX += 3 * (1 - settle);
    heldY -= Math.sin(settle * Math.PI) * 2;
  }
  const runMotion = heldWeaponRunMotion({
    moving: options.moving,
    gameTime: options.gameTime,
    heldInLeftHand,
  });
  heldX += runMotion.x;
  heldY += runMotion.y;
  const feetAssets = options.feetItem ? assets.equipment[options.feetItem] : undefined;
  const backLeg = feetAssets?.backLeg ?? assets.basicBackLeg;
  const frontLeg = feetAssets?.frontLeg ?? assets.basicFrontLeg;
  const drawLayer = (asset: HTMLImageElement, x: number, y: number, width = asset.naturalWidth, height = asset.naturalHeight) => {
    if (asset.complete && asset.naturalWidth > 0) ctx.drawImage(asset, x, y, width, height);
  };
  const drawEquippedSprite = (itemId: string | undefined, layer: WorldSpritePresentation["layer"], gaitY = 0) => {
    if (!itemId) return;
    const presentation = itemPresentation(itemId)?.world;
    const asset = assets.equipment[itemId]?.sprite;
    if (!asset || presentation?.kind !== "SPRITE" || presentation.layer !== layer) return;
    const width = presentation.width ?? asset.naturalWidth;
    const height = presentation.height ?? asset.naturalHeight;
    const y = presentation.top ?? (presentation.bottom ?? height) - height + gaitY;
    drawLayer(asset, 90 - width / 2, y, width, height);
  };

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.translate(Math.round(options.x), Math.round(options.y + 29));
  if (facingLeft) ctx.scale(-1, 1);
  ctx.scale(scale, scale); ctx.translate(-90, -171);
  const drawHeldItem = () => {
    if (!heldItem || !heldSpritePresentation || !heldVisible) return;
    const asset = assets.equipment[heldItem]?.sprite;
    if (!asset) return;
    const width = heldSpritePresentation.width ?? asset.naturalWidth;
    const height = heldSpritePresentation.height ?? asset.naturalHeight;
    const left = 90 - width / 2 + heldX;
    ctx.save();
    ctx.translate(left + width / 2, heldY + height / 2);
    const baseRotation = heldSpritePresentation.handAction === "BOW"
      ? bowHeldRotationRadians({ combatFacing: options.combatFacing, facingLeft, heldInLeftHand })
      : 0;
    ctx.rotate(baseRotation + runMotion.rotation);
    ctx.scale(bowAlignment.scaleX, 1);
    drawLayer(asset, -width / 2, -height / 2, width, height);
    ctx.restore();
  };
  // The off-side hand belongs behind the body. Handedness must invert that
  // depth rule as the character turns, otherwise a left-hand weapon appears
  // in front while facing right.
  const heldBehindBody = heldInLeftHand ? !facingLeft : facingLeft;
  if (heldBehindBody) drawHeldItem();
  drawLayer(backLeg, 90 - backLeg.naturalWidth / 2 - 8 + gait.back.x, 171 - backLeg.naturalHeight + gait.back.y);
  drawLayer(frontLeg, 90 - frontLeg.naturalWidth / 2 + 8 + gait.front.x, 171 - frontLeg.naturalHeight + gait.front.y);
  ctx.save(); ctx.translate(90 - 41.4675 / 2, 157 - 45.315); drawEgg(ctx, 41.4675, 45.315, 0, "#000"); drawEgg(ctx, 41.4675, 45.315, 3, skinToneColor(options.skinTone)); ctx.restore();
  drawEquippedSprite(options.chestItem, "CHEST");
  ctx.save(); ctx.translate(90 - 61.75 / 2, 104 - 40 + 15 + gait.head); drawPillHead(ctx, 61.75, 40, skinToneColor(options.skinTone)); ctx.restore();
  drawEquippedSprite(options.headItem === undefined ? BASIC_PAPER_HAT : options.headItem, "HEAD", gait.head);
  if (!heldBehindBody) drawHeldItem();
  ctx.restore();
}
