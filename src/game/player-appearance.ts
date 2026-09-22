import { swordSwingPose, drawSwordTrail } from "./sword-swing";
import { defaultWeaponAlignment } from "./equipment-alignment";
import { EXPANSION_HEAD_FRAME, DEFAULT_HEAD_ALIGNMENT } from "./player-head-template";
import { drawPlayerHead, drawPlayerEyes } from "./player-face";
import { drawAlignedPlayerLayer, type PlayerLayer, type PlayerLayerAlignment, type LayerBounds } from "./player-layer-alignment";
import { STARTER_STONE } from "./inventory";
import { ITEM_PRESENTATIONS, itemPresentation, type WorldSpritePresentation } from "./item-presentation";
import { PLAYER_WORLD_SCALE } from "./player-render-scale";

import { PLAYER_SKIN_TONES, DEFAULT_SKIN_TONE } from "../../shared/player-skin-tones";
export { PLAYER_SKIN_TONES, PLAYER_SKIN_TONE_NAMES, DEFAULT_SKIN_TONE } from "../../shared/player-skin-tones";
const BOW_SOURCE_DOWN_ANGLE_DEGREES = 90;
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

type PlayerAppearanceWarmupOptions = {
  skinTone?: number;
  headItem?: string;
  chestItem?: string;
  feetItem?: string;
  rightHandItem?: string;
  leftHandItem?: string;
};

const PLAYER_BODY_WIDTH = 180;
const PLAYER_BODY_HEIGHT = 171;
const PLAYER_BODY_CACHE_LIMIT = 128;
const playerBodyCaches = new WeakMap<PlayerAppearanceAssets, Map<string, HTMLCanvasElement>>();

/** A layer is either loaded artwork or a canvas we tinted from it. */
export type PlayerLayerAsset = HTMLImageElement | HTMLCanvasElement;
const assetWidth = (asset: PlayerLayerAsset) => "naturalWidth" in asset ? asset.naturalWidth : asset.width;
const assetHeight = (asset: PlayerLayerAsset) => "naturalHeight" in asset ? asset.naturalHeight : asset.height;

function readyImage(asset: PlayerLayerAsset | undefined) {
  if (!asset) return false;
  if ("complete" in asset && !asset.complete) return false;
  return assetWidth(asset) > 0 && assetHeight(asset) > 0;
}

function playerBodyCache(assets: PlayerAppearanceAssets) {
  let cache = playerBodyCaches.get(assets);
  if (!cache) {
    cache = new Map();
    playerBodyCaches.set(assets, cache);
  }
  return cache;
}

function cachedPlayerBody(
  assets: PlayerAppearanceAssets,
  key: string,
  draw: (context: CanvasRenderingContext2D) => void,
  resolution = 1,
) {
  const cache = playerBodyCache(assets);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = PLAYER_BODY_WIDTH * resolution;
  canvas.height = PLAYER_BODY_HEIGHT * resolution;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = resolution > 1;
  context.imageSmoothingQuality = "high";
  context.scale(resolution, resolution);
  draw(context);
  cache.set(key, canvas);
  while (cache.size > PLAYER_BODY_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return canvas;
}

/**
 * How often a body-part sprite that failed to load is asked for again. A part
 * that fails once used to stay broken for the life of the page: the body was
 * drawn without it, and a plain reload could be handed the same failed answer
 * from the browser's cache, so only closing the browser brought the character
 * back. The query string makes every retry a fresh request; the delays grow so
 * a real outage is not hammered, and the last one repeats until it works.
 */
export const PLAYER_PART_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 30_000] as const;

function image(source: string, settled: () => void) {
  const asset = new Image();
  let retry = 0;
  asset.addEventListener("load", settled, { once: true });
  asset.addEventListener("error", () => {
    const delay = PLAYER_PART_RETRY_DELAYS_MS[Math.min(retry, PLAYER_PART_RETRY_DELAYS_MS.length - 1)];
    retry += 1;
    // The first failure still counts the asset as settled so the world is not
    // held back for one sprite; the retries bring the part in when they can.
    if (retry === 1) settled();
    globalThis.setTimeout(() => { asset.src = `${source}?asset-retry=${retry}`; }, delay);
  });
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
    basicFrontLeg: image("assets/wildstat/player-parts/basic-leg-front.webp", markAssetSettled),
    basicBackLeg: image("assets/wildstat/player-parts/basic-leg-back.webp", markAssetSettled),
    equipment,
  };
}

/**
 * The bare legs, in the player's own skin tone.
 *
 * The art is one neutral pair, so without this a dark-skinned character walked
 * around on pale feet the moment they had no boots — which is now the default,
 * since Trailblazer Boots are gone. Multiply keeps the shading in the artwork
 * and takes its colour from the tone; the second draw restores the alpha the
 * fill would otherwise have squared off.
 *
 * Cached per image and tone: this runs inside the body composite, which is
 * itself cached, but a tone change must not repaint on every frame.
 */
const tintedLegs = new Map<string, HTMLCanvasElement>();
export function skinTonedLeg(leg: HTMLImageElement, tone: string): PlayerLayerAsset {
  if (typeof document === "undefined" || !leg.complete || !leg.naturalWidth) return leg;
  const key = `${leg.src}|${tone}`;
  const cached = tintedLegs.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = leg.naturalWidth;
  canvas.height = leg.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return leg;
  context.drawImage(leg, 0, 0);
  context.globalCompositeOperation = "multiply";
  context.fillStyle = tone;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(leg, 0, 0);
  if (tintedLegs.size > 32) tintedLegs.clear();
  tintedLegs.set(key, canvas);
  return canvas;
}

export function skinToneColor(value: number | undefined) {
  return PLAYER_SKIN_TONES[Math.max(0, Math.min(PLAYER_SKIN_TONES.length - 1, Math.floor(value ?? DEFAULT_SKIN_TONE)))] ?? PLAYER_SKIN_TONES[DEFAULT_SKIN_TONE];
}

/** Builds every idle/walk body composite while the loading screen is still visible. */
export function warmPlayerAppearanceCache(assets: PlayerAppearanceAssets, options: PlayerAppearanceWarmupOptions) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return;

  for (let idleFrame = 0; idleFrame < 4; idleFrame += 1) {
    drawStartingPlayer(context, assets, {
      ...options,
      x: 0,
      y: 0,
      facing: 0,
      moving: false,
      gameTime: idleFrame / 2,
      alpha: 0,
    });
    for (let walkFrame = 1; walkFrame <= 3; walkFrame += 1) {
      let tenth = idleFrame * 5;
      while (tenth % 3 !== walkFrame - 1) tenth += 1;
      drawStartingPlayer(context, assets, {
        ...options,
        x: 0,
        y: 0,
        facing: 0,
        moving: true,
        gameTime: tenth / 10,
        alpha: 0,
      });
    }
  }
}

/** Aligns the artwork's downward firing axis with the combat direction. */
export function bowHeldRotationRadians(options: {
  combatFacing?: number | null;
  facingLeft: boolean;
  heldInLeftHand: boolean;
}) {
  // The current bow art natively points down. Preserve that exact pose until
  // a combat target supplies an aim direction.
  if (options.combatFacing === null || options.combatFacing === undefined) return 0;
  // Left-hand art is already mirrored on its Y axis below. Reversing the
  // rotation too would double-flip the pose and point the bow upward.
  const localAim = options.facingLeft ? Math.PI - options.combatFacing : options.combatFacing;
  return localAim - BOW_SOURCE_DOWN_ANGLE_DEGREES * DEGREES_TO_RADIANS;
}

/** Keeps the bow artwork centered on the actor until aiming begins. */
export function bowHeldAnchorX(_heldInLeftHand: boolean, _facingLeft: boolean) {
  return 0;
}

/** Mirrors the bow art itself when the bow changes hands. */
export function bowHeldAlignment(heldInLeftHand: boolean) {
  return {
    x: 0,
    y: 0,
    // Swap the bow's face without inverting its vertical aim. A Y-axis flip
    // turns the source-down sprite upward after rotation.
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


export function drawStartingPlayer(
  ctx: CanvasRenderingContext2D,
  assets: PlayerAppearanceAssets,
  options: { x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; gameTime: number; throwClock?: number; skinTone?: number; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string; alpha?: number; scale?: number; smooth?: boolean; alignment?: PlayerLayerAlignment; helmetOpacity?: number; presentationOverrides?: Record<string, WorldSpritePresentation>; onLayerBounds?: (layer: PlayerLayer, bounds: LayerBounds) => void },
) {
  const scale = options.scale ?? PLAYER_WORLD_SCALE;
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
  const heldPresentation = options.presentationOverrides?.[heldItem] ?? itemPresentation(heldItem)?.world;
  const heldSpritePresentation = heldPresentation?.kind === "SPRITE" && heldPresentation.layer === "HAND"
    ? heldPresentation
    : undefined;
  const swordHeld = heldSpritePresentation?.handAction === "SWING";
  const bowHeld = heldSpritePresentation?.handAction === "BOW";
  // Keep the grip attached to the same hand in local character space.
  // The actor transform mirrors it when turning; a second facing-dependent
  // offset here would make the weapon slide sideways across the hand.
  let heldX = bowHeld
    ? bowHeldAnchorX(heldInLeftHand, facingLeft)
    : heldInLeftHand ? 30 : -11;
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
    } else if (!swordHeld && attackElapsed >= .12 && attackElapsed < .20) {
      heldVisible = false;
    } else if (!swordHeld && attackElapsed >= .20 && attackElapsed < .42) {
      const reload = (attackElapsed - .20) / .22;
      heldX += 14 * (1 - reload);
      heldY -= Math.sin(reload * Math.PI) * 5;
    }
  } else if (!swordHeld && attackElapsed > 0 && attackElapsed < .12) {
    const windup = attackElapsed / .12;
    heldX -= 6 * (1 - (1 - windup) * (1 - windup));
    heldY += 2 * windup;
  } else if (!swordHeld && attackElapsed >= .12 && attackElapsed < .20) {
    const release = (attackElapsed - .12) / .08;
    heldX += 4 * (1 - release);
  } else if (!swordHeld && attackElapsed >= .20 && attackElapsed < .42) {
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
  // Boots are artwork of their own; bare legs take the character's skin tone.
  const skin = skinToneColor(options.skinTone);
  const backLeg = feetAssets?.backLeg ?? skinTonedLeg(assets.basicBackLeg, skin);
  const frontLeg = feetAssets?.frontLeg ?? skinTonedLeg(assets.basicFrontLeg, skin);
  const headItem = options.headItem ?? "";
  const drawLayer = (target: CanvasRenderingContext2D, asset: PlayerLayerAsset, x: number, y: number, width = assetWidth(asset), height = assetHeight(asset), layer?: PlayerLayer, report = false) => {
    if (!readyImage(asset)) return;
    if (!layer) { target.drawImage(asset, x, y, width, height); return; }
    drawAlignedPlayerLayer(target, layer, { x, y, width, height }, options.alignment?.[layer] ?? (layer === "weapon" ? defaultWeaponAlignment(heldSpritePresentation) : undefined),
      () => {
        if (layer === "helmet") target.globalAlpha *= options.helmetOpacity ?? 1;
        target.drawImage(asset, x, y, width, height);
      }, report ? options.onLayerBounds : undefined);
  };
  const drawEquippedSprite = (target: CanvasRenderingContext2D, itemId: string | undefined, layer: WorldSpritePresentation["layer"], gaitY = 0, report = false) => {
    if (!itemId) return;
    const presentation = options.presentationOverrides?.[itemId] ?? itemPresentation(itemId)?.world;
    const asset = assets.equipment[itemId]?.sprite;
    if (!asset || presentation?.kind !== "SPRITE" || presentation.layer !== layer) return;
    const width = presentation.width ?? asset.naturalWidth;
    const height = presentation.height ?? asset.naturalHeight;
    const y = presentation.top ?? (presentation.bottom ?? height) - height + gaitY;
    drawLayer(target, asset, 90 - width / 2, y, width, height, layer === "HEAD" ? "helmet" : "chest", report);
  };
  const bodyAssetsReady = readyImage(backLeg) && readyImage(frontLeg) && [
    { itemId: options.chestItem, layer: "CHEST" as const },
    { itemId: headItem, layer: "HEAD" as const },
  ].every(({ itemId, layer }) => {
    if (!itemId) return true;
    const presentation = options.presentationOverrides?.[itemId] ?? itemPresentation(itemId)?.world;
    if (presentation?.kind !== "SPRITE" || presentation.layer !== layer) return true;
    return readyImage(assets.equipment[itemId]?.sprite);
  });
  const drawBody = (target: CanvasRenderingContext2D, report = false) => {
    const backSize = { width: assetWidth(backLeg), height: assetHeight(backLeg) };
    const frontSize = { width: assetWidth(frontLeg), height: assetHeight(frontLeg) };
    drawLayer(target, backLeg, 90 - backSize.width / 2 - 8 + gait.back.x, 171 - backSize.height + gait.back.y, backSize.width, backSize.height, "backLeg", report);
    drawLayer(target, frontLeg, 90 - frontSize.width / 2 + 8 + gait.front.x, 171 - frontSize.height + gait.front.y, frontSize.width, frontSize.height, "frontLeg", report);
    const body = { x: 90 - 41.4675 / 2, y: 157 - 45.315, width: 41.4675, height: 45.315 };
    drawAlignedPlayerLayer(target, "body", body, options.alignment?.body, () => {
      target.translate(body.x, body.y);
      drawEgg(target, body.width, body.height, 0, "#000");
      drawEgg(target, body.width, body.height, 3, skinToneColor(options.skinTone));
    }, report ? options.onLayerBounds : undefined);
    drawEquippedSprite(target, options.chestItem, "CHEST", 0, report);
    const head = { ...EXPANSION_HEAD_FRAME, y: EXPANSION_HEAD_FRAME.y + gait.head };
    drawAlignedPlayerLayer(target, "head", head, options.alignment?.head ?? DEFAULT_HEAD_ALIGNMENT, () => {
      target.translate(head.x, head.y);
      drawPlayerHead(target, head.width, head.height, skinToneColor(options.skinTone));
      drawPlayerEyes(target, head.width, head.height, options.alignment?.eyes, report ? options.onLayerBounds : undefined);
    }, report ? options.onLayerBounds : undefined);
    drawEquippedSprite(target, headItem, "HEAD", gait.head, report);
  };

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  if (options.smooth) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
  // World renderers already align the actor anchor to a physical pixel. Keep
  // that fractional CSS coordinate intact at non-integer zoom and DPR.
  ctx.translate(options.x, options.y + 29);
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
    if (swordHeld && readyImage(asset)) {
      const alignment = options.alignment?.weapon ?? defaultWeaponAlignment(heldSpritePresentation) ?? { x: 0, y: 0, scale: 1 };
      const pose = swordSwingPose(options.throwClock ?? 0);
      const aim = options.combatFacing == null ? 0 : (facingLeft ? Math.PI - options.combatFacing : options.combatFacing);
      const angle = (alignment.angle ?? -28) + aim / DEGREES_TO_RADIANS + pose.angle + 28;
      const pivotX = -width / 2 + width * (alignment.pivotX ?? .5);
      const pivotY = -height / 2 + height * (alignment.pivotY ?? .5);
      drawSwordTrail(ctx, pivotX + alignment.x, pivotY + alignment.y,
        width * (1 - (alignment.pivotX ?? .5)) * alignment.scale, angle * DEGREES_TO_RADIANS, pose.trail);
      drawAlignedPlayerLayer(ctx, "weapon", { x: -width / 2, y: -height / 2, width, height },
        { ...alignment, angle }, () => ctx.drawImage(asset, -width / 2, -height / 2, width, height), options.onLayerBounds);
    } else {
      drawLayer(ctx, asset, -width / 2, -height / 2, width, height, "weapon", true);
    }
    ctx.restore();
  };
  const bodyResolution = options.smooth ? 2 : 1;
  const bodyCacheKey = [
    bodyResolution,
    options.alignment ? JSON.stringify(options.alignment) : "{}",
    options.presentationOverrides ? JSON.stringify(options.presentationOverrides) : "",
    options.helmetOpacity ?? 1,
    skinToneColor(options.skinTone),
    headItem,
    options.chestItem ?? "",
    options.feetItem ?? "",
    walkFrame,
    idleFrame,
  ].join("|");
  const bodyCanvas = bodyAssetsReady
    ? cachedPlayerBody(assets, bodyCacheKey, drawBody, bodyResolution)
    : null;
  if (bodyCanvas) ctx.drawImage(bodyCanvas, 0, 0, PLAYER_BODY_WIDTH, PLAYER_BODY_HEIGHT);
  else drawBody(ctx);
  if (options.onLayerBounds) {
    ctx.save(); ctx.globalAlpha = 0; drawBody(ctx, true); ctx.restore();
  }
  // Keep weapons readable above armor from every facing and hand position.
  drawHeldItem();
  ctx.restore();
}
