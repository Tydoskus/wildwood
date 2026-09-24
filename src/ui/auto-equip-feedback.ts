import { equipmentMapRequirement, type CampaignAccess } from "../../shared/equipment-access";
import { itemDisplayName } from "../../shared/items";
import type { InventoryState } from "../game/inventory";
import { applyPlayerMaxHealthMultiplierBonus } from "../game/runtime/player-health";
import type { PlayerState } from "../game/runtime/types";
import type { ServerEquip } from "../coop/services/progression-service";
import type { ServerLoadoutChange } from "../coop/services/server-loadout";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

/** What the feedback needs from the coop session; an older API simply never calls it. */
export type ServerEquipPort = {
  setOnServerEquip?: (callback: ((equip: ServerEquip) => void) | null) => void;
};

/**
 * The toast for gear the server put on by itself, or null when there is
 * nothing to boast about: a slot emptied, or locked gear swapped for usable
 * gear after a prestige, is not an upgrade. The weapon is named first.
 */
export function autoEquipMessage(changes: readonly ServerLoadoutChange[], progress: CampaignAccess) {
  const upgrades = changes.filter(({ itemId, previous }) => itemId && !(previous && equipmentMapRequirement(previous, progress)));
  const shown = upgrades.find(({ field }) => field === "equippedRightHand" || field === "equippedLeftHand") ?? upgrades[0];
  return shown ? `Equipped ${itemInspectionButtonLabel(itemDisplayName(shown.itemId))} (upgrade)` : null;
}

/**
 * Auto equip happens on the server (a better drop, gear a new map unlocked,
 * prestige). The coop session reports each slot it changed; this puts the
 * same gear in the local bag, whose loadout every save sends, refreshes what
 * the gear changes locally and says what went on.
 */
export function createAutoEquipFeedback(options: {
  coop: ServerEquipPort | null | undefined;
  inventory: InventoryState;
  player: PlayerState;
  healthMultiplierBonus: () => number;
  renderInventory: () => void;
  showMessage: (message: string, color: string) => void;
}) {
  options.coop?.setOnServerEquip?.(({ changes, progress, live }) => {
    let changed = false;
    for (const { field, itemId } of changes) {
      if (options.inventory[field] === itemId) continue;
      options.inventory[field] = itemId;
      changed = true;
    }
    if (!changed) return;
    applyPlayerMaxHealthMultiplierBonus(options.player, options.healthMultiplierBonus());
    options.renderInventory();
    const message = live ? autoEquipMessage(changes, progress) : null;
    if (message) options.showMessage(message, "#72ef58");
  });
}
