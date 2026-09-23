import { itemDisplayName } from "../../shared/items";
import { setInventoryItemQuantity, type InventoryState } from "../game/inventory";
import { applyPlayerMaxHealthMultiplierBonus } from "../game/runtime/player-health";
import type { PlayerState } from "../game/runtime/types";

/** Apply the immediate local presentation of a server-confirmed slot tier. */
export function createItemUpgradeFeedback(options: {
  inventory: InventoryState;
  player: PlayerState;
  healthMultiplierBonus: () => number;
  renderInventory: () => void;
  saveProgress: (immediate: boolean) => void;
  showMessage: (message: string, color: string) => void;
}) {
  return ({ itemId, level }: { itemId: string; level: number }) => {
    setInventoryItemQuantity(options.inventory, itemId, 1);
    applyPlayerMaxHealthMultiplierBonus(options.player, options.healthMultiplierBonus());
    options.renderInventory();
    options.saveProgress(true);
    options.showMessage(`${itemDisplayName(itemId, level)} COMPLETE`, "#72ef58");
  };
}
