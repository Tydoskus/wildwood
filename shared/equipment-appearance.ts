export type EquipmentAppearanceInput = {
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  cosmeticHead?: string;
  cosmeticChest?: string;
  cosmeticFeet?: string;
  cosmeticRightHand?: string;
  cosmeticLeftHand?: string;
};

export type EquipmentAppearance = {
  headItem: string;
  chestItem: string;
  feetItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

/** Reserved cosmetic value meaning the matching stat equipment stays equipped but is not drawn. */
export const HIDDEN_COSMETIC_ITEM_ID = "__hidden_cosmetic__";

export function isHiddenCosmeticItem(itemId: unknown) {
  return itemId === HIDDEN_COSMETIC_ITEM_ID;
}

function resolvedSlotAppearance(cosmeticItem: string | undefined, equippedItem: string) {
  if (isHiddenCosmeticItem(cosmeticItem)) return "";
  return cosmeticItem || equippedItem;
}

/** Cosmetics override appearance only; one cosmetic hand replaces both regular hands. */
export function resolveEquipmentAppearance(equipment: EquipmentAppearanceInput): EquipmentAppearance {
  const cosmeticRightHand = equipment.cosmeticRightHand || "";
  const cosmeticLeftHand = cosmeticRightHand ? "" : equipment.cosmeticLeftHand || "";
  const hasCosmeticHand = Boolean(cosmeticRightHand || cosmeticLeftHand);
  return {
    headItem: resolvedSlotAppearance(equipment.cosmeticHead, equipment.equippedHead),
    chestItem: resolvedSlotAppearance(equipment.cosmeticChest, equipment.equippedChest),
    feetItem: resolvedSlotAppearance(equipment.cosmeticFeet, equipment.equippedFeet),
    rightHandItem: hasCosmeticHand ? resolvedSlotAppearance(cosmeticRightHand, "") : equipment.equippedRightHand,
    leftHandItem: hasCosmeticHand ? resolvedSlotAppearance(cosmeticLeftHand, "") : equipment.equippedLeftHand,
  };
}
