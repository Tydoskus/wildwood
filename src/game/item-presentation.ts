import {
  BASIC_PAPER_HAT,
  LEGENDARY_WHITE_GOLD_ARMOR,
  STARTER_BOW,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  type ItemId,
  type ProjectileKind,
} from "../../shared/items";
import { STARTER_BOW_ASSET_SOURCE } from "./starter-bow-asset";

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
  [TRAILBLAZER_BOOTS]: {
    inventory: { fallback: "BOOTS" },
    world: {
      kind: "LEGS",
      frontSource: `${PLAYER_PARTS}/boots-leg-front.png`,
      backSource: `${PLAYER_PARTS}/boots-leg-back.png`,
    },
  },
  [STARTER_BOW]: {
    inventory: { source: STARTER_BOW_ASSET_SOURCE, equippedWidth: 36, equippedHeight: 28 },
    world: {
      kind: "SPRITE",
      source: STARTER_BOW_ASSET_SOURCE,
      layer: "HAND",
      width: 65,
      height: 36,
      top: 108,
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
      `--item-art: url(&quot;${presentation.source}&quot;)`,
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
