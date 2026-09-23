import { STARTER_BOW, WOODEN_ARMOR } from "../../../shared/items";
import type { ProgressSave } from "./progress";

/** Remove confirmed destruction from both server snapshots and queued local saves. */
export function withoutDestroyedEquipment<T extends Omit<ProgressSave, "enemyKills">>(progress: T, itemId: string, keepCosmetic = false): T {
  const next = { ...progress };
  let items: unknown = [];
  try { items = JSON.parse(progress.inventoryJson); } catch {}
  next.inventoryJson = JSON.stringify(Array.isArray(items) ? items.filter((id) => id !== itemId) : []);
  for (const field of ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
    "cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand"] as const) {
    if (keepCosmetic && field.startsWith("cosmetic")) continue;
    if (next[field] === itemId) next[field] = "";
  }
  if (itemId === STARTER_BOW && "bowCount" in next) next.bowCount = 0;
  if (itemId === WOODEN_ARMOR && "woodenArmorCount" in next) next.woodenArmorCount = 0;
  return next;
}
