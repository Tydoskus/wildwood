import { CAMPAIGN_ITEM_PRESENTATIONS } from "./campaign-item-presentation";
import { applyGalaxyArtTexture } from "./galaxy-finish";
import type { WeaponCategory } from "./equipment-alignment";
import type { LayerAdjustment } from "./player-layer-alignment";
import {
  BASIC_PAPER_HAT, WOODEN_SWORD,
  BLACK_BOOTS,
  DARK_METAL_HELMET,
  SAMURAI_HAT,
  WATER_ARMOR,
  SKY_BOW,
  SAMURAI_BOW,
  CLOUDSPIRE_BOW,
  CLOUDSPIRE_ARMOR,
  MOONFEN_ARMOR,
  CLOUDSPIRE_HELMET,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  FROST_ARMOR,
  FROST_BOW,
  GALAXY_ARMOR,
  GALAXY_BOOTS,
  GALAXY_BOW,
  GALAXY_HELMET,
  IRON_BOW,
  LEGENDARY_WHITE_GOLD_ARMOR,
  LAVA_BOW,
  MAGMA_ARMOR,
  NIGHT_BOW,
  SNOW_BOW,
  STARTER_BOW,
  STARTER_STONE,
  SUPERIOR_GOLDEN_HELMET,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
  type ItemId,
  type ProjectileKind,
} from "../../shared/items";
import { STARTER_BOW_ASSET_SOURCE } from "./starter-bow-asset";
import { WOODEN_ARMOR_ASSET_SOURCE } from "./wooden-armor-asset";

type InventoryArt = {
  source?: string;
  equippedWidth?: number;
  equippedHeight?: number;
  fallback?: "BOOTS";
};

export type WorldSpritePresentation = {
  kind: "SPRITE";
  source: string;
  layer: "HEAD" | "CHEST" | "HAND";
  width?: number;
  height?: number;
  bottom?: number;
  top?: number;
  handAction?: "THROW" | "BOW" | "SWING";
  weaponCategory?: WeaponCategory;
  alignment?: LayerAdjustment;
};

export type WorldLegPresentation = {
  kind: "LEGS";
  frontSource: string;
  backSource: string;
};

export type ItemPresentation = {
  inventory: InventoryArt;
  world?: WorldSpritePresentation | WorldLegPresentation;
  projectile?: ProjectileKind;
  /** Paints the art with a live finish instead of drawing it as is (galaxy-finish.ts). */
  finish?: "GALAXY";
};

const PLAYER_PARTS = "assets/wildstat/player-parts";

/** The Galaxy set borrows the Ion Sovereign art, the endgame set, and the game's boot legs as its silhouettes. */
const galaxyFinish = (base: ItemPresentation): ItemPresentation => ({ ...base, finish: "GALAXY" });
/** The icon's sky before galaxy-finish.ts has painted the real one, or where it cannot. */
const GALAXY_ART_FALLBACK = "radial-gradient(circle at 35% 35%, #6a3cc8, #1c2276 45%, #050619 80%)";

/** Client-only art registry. New equipment gets one catalog entry and assets. */
export const ITEM_PRESENTATIONS: Partial<Record<ItemId, ItemPresentation>> = {
  ...CAMPAIGN_ITEM_PRESENTATIONS,
  [GALAXY_HELMET]: galaxyFinish(CAMPAIGN_ITEM_PRESENTATIONS.ion_helmet),
  [GALAXY_ARMOR]: galaxyFinish(CAMPAIGN_ITEM_PRESENTATIONS.ion_armor),
  [GALAXY_BOW]: galaxyFinish(CAMPAIGN_ITEM_PRESENTATIONS.ion_bow),
  // The boots are the game's own boot legs, so they sit and walk like every other pair.
  [GALAXY_BOOTS]: galaxyFinish({
    inventory: { source: `${PLAYER_PARTS}/boots-leg-front.webp`, equippedWidth: 26, equippedHeight: 25 },
    world: { kind: "LEGS", frontSource: `${PLAYER_PARTS}/boots-leg-front.webp`, backSource: `${PLAYER_PARTS}/boots-leg-back.webp` },
  }),
  [WOODEN_SWORD]: {
    inventory: { source: `${PLAYER_PARTS}/wooden-sword.webp`, equippedWidth: 32, equippedHeight: 28 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/wooden-sword.webp`, layer: "HAND", top: 116, handAction: "SWING", weaponCategory: "SWORD" },
  },
  [BASIC_PAPER_HAT]: {
    inventory: { source: `${PLAYER_PARTS}/basic-paper-hat.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/basic-paper-hat.webp`, layer: "HEAD", bottom: 144 },
  },
  [SUPERIOR_GOLDEN_HELMET]: {
    inventory: { source: `${PLAYER_PARTS}/superior-golden-helmet.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/superior-golden-helmet.webp`, layer: "HEAD", bottom: 144 },
  },
  [WOOD_FULL_HELM]: {
    inventory: { source: `${PLAYER_PARTS}/wood-full-helm.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/wood-full-helm.webp`, layer: "HEAD", bottom: 144 },
  },
  [FIRE_METAL_HELMET]: {
    inventory: { source: `${PLAYER_PARTS}/fire-metal-helmet.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/fire-metal-helmet.webp`, layer: "HEAD", bottom: 144 },
  },
  [DARK_METAL_HELMET]: {
    inventory: { source: `${PLAYER_PARTS}/dark-metal-helmet.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/dark-metal-helmet.webp`, layer: "HEAD", bottom: 144 },
  },
  [SAMURAI_HAT]: {
    inventory: { source: `${PLAYER_PARTS}/samurai-hat.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/samurai-hat.webp`, layer: "HEAD", bottom: 144 },
  },
  [LEGENDARY_WHITE_GOLD_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/legendary-white-gold-armor.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/legendary-white-gold-armor.webp`, layer: "CHEST", bottom: 168 },
  },
  [WOODEN_ARMOR]: {
    inventory: { source: WOODEN_ARMOR_ASSET_SOURCE, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: WOODEN_ARMOR_ASSET_SOURCE, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [FROST_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/frost-armor.webp`, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/frost-armor.webp`, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [CLOUDSPIRE_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/cloudspire-armor.webp`, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/cloudspire-armor.webp`, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [MOONFEN_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/moonfen-armor.webp`, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/moonfen-armor.webp`, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [CLOUDSPIRE_HELMET]: {
    inventory: { source: `${PLAYER_PARTS}/cloudspire-helmet.webp`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/cloudspire-helmet.webp`, layer: "HEAD", bottom: 144 },
  },
  [CLOUDSPIRE_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/cloudspire-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE", source: `${PLAYER_PARTS}/cloudspire-bow.webp`, layer: "HAND",
      width: 115, height: 63, top: 106, handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [SAMURAI_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/samurai-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE", source: `${PLAYER_PARTS}/samurai-bow.webp`, layer: "HAND",
      width: 115, height: 63, top: 106, handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [SKY_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/sky-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE", source: `${PLAYER_PARTS}/sky-bow.webp`, layer: "HAND",
      width: 115, height: 63, top: 106, handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [WATER_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/water-armor.webp`, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/water-armor.webp`, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [MAGMA_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/magma-armor.webp`, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/magma-armor.webp`, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [BLACK_BOOTS]: {
    inventory: { fallback: "BOOTS" },
    world: {
      kind: "LEGS",
      frontSource: `${PLAYER_PARTS}/black-boots-leg-front.svg`,
      backSource: `${PLAYER_PARTS}/black-boots-leg-back.svg`,
    },
  },
  [STARTER_STONE]: {
    inventory: { source: `${PLAYER_PARTS}/stone.webp`, equippedWidth: 26, equippedHeight: 26 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/stone.webp`,
      layer: "HAND",
      top: 116,
      handAction: "THROW",
    },
    projectile: "ROCK",
  },
  [STARTER_BOW]: {
    inventory: { source: STARTER_BOW_ASSET_SOURCE, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: STARTER_BOW_ASSET_SOURCE,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [IRON_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/iron-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/iron-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [SNOW_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/snow-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/snow-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [FROST_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/frost-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/frost-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [LAVA_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/lava-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/lava-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [NIGHT_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/night-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/night-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
  [FIRE_METAL_BOW]: {
    inventory: { source: `${PLAYER_PARTS}/fire-metal-bow.webp`, equippedWidth: 44, equippedHeight: 34 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/fire-metal-bow.webp`,
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
};

export function itemPresentation(itemId: string | undefined) {
  return ITEM_PRESENTATIONS[itemId as ItemId];
}

export function itemHasGalaxyFinish(itemId: string | undefined) {
  return itemPresentation(itemId)?.finish === "GALAXY";
}

/** Whether a look wears any galaxy piece, so a picture of it has to keep moving. */
export function appearanceHasGalaxyFinish(look: { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string } | null | undefined) {
  return Boolean(look && [look.headItem, look.chestItem, look.feetItem, look.rightHandItem, look.leftHandItem].some(itemHasGalaxyFinish));
}

/** UI-only rotation shared by bag, loadout, and inspection; world grips stay unchanged. */
export function itemInventoryRotation(itemId: string) {
  const world = itemPresentation(itemId)?.world;
  return world?.kind === "SPRITE" && world.handAction === "BOW" ? -45 : 0;
}

export function itemArtMarkup(itemId: string, hidden = true) {
  const presentation = itemPresentation(itemId)?.inventory;
  const aria = hidden ? ' aria-hidden="true"' : "";
  if (presentation?.source && itemHasGalaxyFinish(itemId)) {
    const style = [
      galaxyArtStyle(presentation.source),
      `--item-art-rotation: ${itemInventoryRotation(itemId)}deg`,
      presentation.equippedWidth ? `--equipped-art-width: ${presentation.equippedWidth}px` : "",
      presentation.equippedHeight ? `--equipped-art-height: ${presentation.equippedHeight}px` : "",
    ].filter(Boolean).join("; ");
    return `<span class="inventory-item-art has-galaxy-finish" style="${style}"${aria}></span>`;
  }
  if (presentation?.source) {
    const style = [
      `background-image: url(${presentation.source})`,
      `--item-art-rotation: ${itemInventoryRotation(itemId)}deg`,
      presentation.equippedWidth ? `--equipped-art-width: ${presentation.equippedWidth}px` : "",
      presentation.equippedHeight ? `--equipped-art-height: ${presentation.equippedHeight}px` : "",
    ].filter(Boolean).join("; ");
    return `<span class="inventory-item-art" style="${style}"${aria}></span>`;
  }
  return `<span class="boot-pixel-icon"${itemId === BLACK_BOOTS ? ' style="filter: grayscale(1) brightness(.45)"' : ""} aria-hidden="true"><i></i><i></i></span>`;
}

/**
 * The inline half of a galaxy icon: the art masks the shared sky and is
 * blended back over it (`.has-galaxy-finish` in game.css draws the rest). The
 * url stays inline: one inside a custom property would resolve against the
 * stylesheet's folder instead of the page.
 */
export function galaxyArtStyle(source: string) {
  applyGalaxyArtTexture();
  return [
    `background-image: url(${source}), var(--galaxy-art-texture, ${GALAXY_ART_FALLBACK})`,
    `-webkit-mask-image: url(${source})`,
    `mask-image: url(${source})`,
  ].join("; ");
}

/**
 * An item's art as an element for places that show a plain image: an <img>,
 * or for a galaxy piece a masked span whose sky moves. `className` goes on it
 * either way, so the place's own sizing applies to both.
 */
export function itemArtImage(itemId: string, className = "") {
  const source = itemPresentation(itemId)?.inventory.source ?? "";
  if (itemHasGalaxyFinish(itemId) && source) {
    const span = document.createElement("span");
    span.className = `${className} item-art-image has-galaxy-finish`.trim();
    span.setAttribute("style", galaxyArtStyle(source));
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  const image = document.createElement("img");
  if (className) image.className = className;
  image.src = source;
  image.alt = "";
  image.draggable = false;
  return image;
}

export function projectileKindForWeapon(itemId: string | undefined) {
  return itemPresentation(itemId)?.projectile;
}
