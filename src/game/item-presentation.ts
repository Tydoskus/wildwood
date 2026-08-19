import {
  BASIC_PAPER_HAT,
  LEGENDARY_WHITE_GOLD_ARMOR,
  STARTER_BOW,
  STARTER_STONE,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
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
  handAction?: "THROW" | "BOW";
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
};

const PLAYER_PARTS = "assets/wildwood/player-parts";

/** Client-only art registry. New equipment gets one catalog entry and assets. */
export const ITEM_PRESENTATIONS: Partial<Record<ItemId, ItemPresentation>> = {
  [BASIC_PAPER_HAT]: {
    inventory: { source: `${PLAYER_PARTS}/basic-paper-hat.png`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/basic-paper-hat.png`, layer: "HEAD", bottom: 144 },
  },
  [SUPERIOR_GOLDEN_HELMET]: {
    inventory: { source: `${PLAYER_PARTS}/superior-golden-helmet.png`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/superior-golden-helmet.png`, layer: "HEAD", bottom: 144 },
  },
  [LEGENDARY_WHITE_GOLD_ARMOR]: {
    inventory: { source: `${PLAYER_PARTS}/legendary-white-gold-armor.png`, equippedWidth: 30, equippedHeight: 27 },
    world: { kind: "SPRITE", source: `${PLAYER_PARTS}/legendary-white-gold-armor.png`, layer: "CHEST", bottom: 168 },
  },
  [WOODEN_ARMOR]: {
    inventory: { source: WOODEN_ARMOR_ASSET_SOURCE, equippedWidth: 34, equippedHeight: 31 },
    world: { kind: "SPRITE", source: WOODEN_ARMOR_ASSET_SOURCE, layer: "CHEST", width: 76, height: 68, top: 100 },
  },
  [TRAILBLAZER_BOOTS]: {
    inventory: { fallback: "BOOTS" },
    world: {
      kind: "LEGS",
      frontSource: `${PLAYER_PARTS}/boots-leg-front.png`,
      backSource: `${PLAYER_PARTS}/boots-leg-back.png`,
    },
  },
  [STARTER_STONE]: {
    inventory: { source: `${PLAYER_PARTS}/stone.png`, equippedWidth: 26, equippedHeight: 26 },
    world: {
      kind: "SPRITE",
      source: `${PLAYER_PARTS}/stone.png`,
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
      width: 92,
      height: 50,
      top: 102,
      handAction: "BOW",
    },
    projectile: "ARROW",
  },
};

export function itemPresentation(itemId: string | undefined) {
  return ITEM_PRESENTATIONS[itemId as ItemId];
}

export function itemArtMarkup(itemId: string, hidden = true) {
  const presentation = itemPresentation(itemId)?.inventory;
  const aria = hidden ? ' aria-hidden="true"' : "";
  if (presentation?.source) {
    const style = [
      `background-image: url(${presentation.source})`,
      presentation.equippedWidth ? `--equipped-art-width: ${presentation.equippedWidth}px` : "",
      presentation.equippedHeight ? `--equipped-art-height: ${presentation.equippedHeight}px` : "",
    ].filter(Boolean).join("; ");
    return `<span class="inventory-item-art" style="${style}"${aria}></span>`;
  }
  return '<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>';
}

export function projectileKindForWeapon(itemId: string | undefined) {
  return itemPresentation(itemId)?.projectile;
}
