import { BASIC_PAPER_HAT, canonicalItemId, itemDefinition, itemFitsEquipmentSlot } from "../../shared/items";
import type { EquipLoadout } from "../../shared/equip-best";

/**
 * What save_player_progress will actually put on from a requested loadout,
 * given what the player owns. It runs after that reducer has refused
 * equipment the player's maps do not unlock yet (equipmentMapRequirement);
 * auto equip checks the same two rules through the same functions, so
 * nothing goes on automatically that the player could not put on by hand.
 *
 * A head item that is not owned falls back to the paper hat (an empty head
 * stays empty). Chest and feet must be owned. A hand must be owned and fit
 * the hand, and the right hand wins: the left is only kept when the right
 * is empty.
 */
export function allowedLoadout(requested: EquipLoadout, inventory: readonly string[]): EquipLoadout {
  const equippedHead = requested.equippedHead === ""
    ? ""
    : inventory.includes(requested.equippedHead) ? requested.equippedHead : BASIC_PAPER_HAT;
  const equippedChest = inventory.includes(requested.equippedChest) ? requested.equippedChest : "";
  const equippedFeet = inventory.includes(requested.equippedFeet) ? requested.equippedFeet : "";
  const requestedRightHand = canonicalItemId(requested.equippedRightHand);
  const requestedLeftHand = canonicalItemId(requested.equippedLeftHand);
  const equippedRightHand = requestedRightHand && inventory.includes(requestedRightHand) && itemFitsEquipmentSlot(requestedRightHand, "RIGHT_HAND")
    ? requestedRightHand
    : "";
  const equippedLeftHand = !equippedRightHand && requestedLeftHand && inventory.includes(requestedLeftHand) && itemFitsEquipmentSlot(requestedLeftHand, "LEFT_HAND")
    ? requestedLeftHand
    : "";
  return { equippedHead, equippedChest, equippedFeet, equippedRightHand, equippedLeftHand };
}

// The saved-hand helpers behind index.ts's equippedRightHandForProgress and
// equippedLeftHandForProgress, which decide what a saved loadout shows.

export function savedInventoryHasHandItem(progress: any) {
  try {
    const itemIds = JSON.parse(progress.inventoryJson ?? "[]");
    return Array.isArray(itemIds) && itemIds.some((itemId) => itemDefinition(itemId)?.slot === "HAND");
  } catch {
    return false;
  }
}

export function canonicalSavedHand(progress: any, field: "equippedRightHand" | "equippedLeftHand") {
  const itemId = canonicalItemId(progress[field]);
  return itemId && itemFitsEquipmentSlot(itemId, field === "equippedRightHand" ? "RIGHT_HAND" : "LEFT_HAND")
    ? itemId
    : "";
}
