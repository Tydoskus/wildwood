import { isCosmeticOnlyItem, itemDefinition, type EquipmentSlot } from "../../shared/items";
import { EQUIP_BEST_SLOTS, beatsEquipped, equipSlotScore, equippedInSlot } from "../../shared/equip-best";
import { moveInventoryItem, type InventoryState } from "./inventory";

/**
 * Equipment bonuses are additive, so each slot can be scored independently.
 * What "better" means (the per-slot score and the tie rule) lives in
 * shared/equip-best.ts, which the server's auto equip uses too.
 */
export function bestEquipmentMoves(inventory: InventoryState, power: (candidate: InventoryState) => number, canEquip: (itemId: string) => boolean = () => true) {
  const planned = { ...inventory };
  const moves: { itemId: string; destination: EquipmentSlot }[] = [];
  for (const [slot, , destination] of EQUIP_BEST_SLOTS) {
    const current = equippedInSlot(planned, slot);
    let best = current;
    let bestScore = equipSlotScore(slot, planned, power);
    for (const itemId of inventory.itemIds) {
      if (!canEquip(itemId) || isCosmeticOnlyItem(itemId) || itemDefinition(itemId)?.slot !== slot) continue;
      const candidate = { ...planned };
      moveInventoryItem(candidate, itemId, destination);
      const candidateScore = equipSlotScore(slot, candidate, power);
      if (beatsEquipped(candidateScore, bestScore, best)) {
        best = itemId;
        bestScore = candidateScore;
      }
    }
    if (best && best !== current && moveInventoryItem(planned, best, destination)) moves.push({ itemId: best, destination });
  }
  return moves;
}

/** Apply Equip Best while leaving protected equipment in its slot. */
export function equipBestUnlocked(inventory: InventoryState, power: (candidate: InventoryState) => number,
  canEquip: (itemId: string) => boolean, locked: (itemId: string) => boolean) {
  const moves = bestEquipmentMoves(inventory, power, canEquip).filter(({ destination }) => {
    const slot = EQUIP_BEST_SLOTS.find(row => row[2] === destination)![0];
    return !locked(equippedInSlot(inventory, slot));
  });
  for (const { itemId, destination } of moves) moveInventoryItem(inventory, itemId, destination);
  return moves.length > 0;
}
