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

/** Cosmetics override appearance only; one cosmetic hand replaces both regular hands. */
export function resolveEquipmentAppearance(equipment: EquipmentAppearanceInput): EquipmentAppearance {
  const cosmeticRightHand = equipment.cosmeticRightHand || "";
  const cosmeticLeftHand = cosmeticRightHand ? "" : equipment.cosmeticLeftHand || "";
  const hasCosmeticHand = Boolean(cosmeticRightHand || cosmeticLeftHand);
  return {
    headItem: equipment.cosmeticHead || equipment.equippedHead,
    chestItem: equipment.cosmeticChest || equipment.equippedChest,
    feetItem: equipment.cosmeticFeet || equipment.equippedFeet,
    rightHandItem: hasCosmeticHand ? cosmeticRightHand : equipment.equippedRightHand,
    leftHandItem: hasCosmeticHand ? cosmeticLeftHand : equipment.equippedLeftHand,
  };
}
