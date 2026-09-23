import { canDestroyEquipment, canonicalItemId, isCosmeticOnlyItem } from "./items";

export const COSMETIC_CONVERSION_GEM_COST = 10n;

export function canConvertToCosmetic(itemId: unknown) {
  const id = canonicalItemId(itemId);
  return Boolean(id && canDestroyEquipment(id) && !isCosmeticOnlyItem(id));
}

/** Account-owned looks are unique and independent of equipment inventory. */
export function cosmeticUnlocks(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed)
    ? [...new Set(parsed.map(canonicalItemId).filter(canConvertToCosmetic))] as string[]
    : [];
}
