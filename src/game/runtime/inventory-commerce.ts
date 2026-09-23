import type { InventoryState } from "../inventory";
import { setInventoryItemQuantity } from "../inventory";
import { applyPlayerMaxHealthMultiplierBonus } from "./player-health";

type Result = { ok: boolean; error?: string } | undefined;

/** Apply confirmed server ownership changes to the visible local loadout. */
export function createInventoryCommerceActions(options: {
  inventory: InventoryState;
  player: { speed: number; baseMaxHp: number; maxHp: number; hp: number };
  coop: () => { destroyEquipment?: (itemId: string) => Promise<Result>; convertItemToCosmetic?: (itemId: string) => Promise<Result> } | null;
  healthMultiplierBonus: () => number;
  movementSpeed: () => number;
}) {
  const refreshStats = () => {
    options.player.speed = options.movementSpeed();
    applyPlayerMaxHealthMultiplierBonus(options.player, options.healthMultiplierBonus());
  };
  return {
    async destroyEquipment(itemId: string) {
      const result = await options.coop()?.destroyEquipment?.(itemId);
      if (result?.ok) {
        setInventoryItemQuantity(options.inventory, itemId, 0);
        refreshStats();
      }
      return result;
    },
    async convertItemToCosmetic(itemId: string) {
      const result = await options.coop()?.convertItemToCosmetic?.(itemId);
      if (result?.ok) {
        options.inventory.cosmeticItemIds = [...new Set([...(options.inventory.cosmeticItemIds ?? []), itemId])];
      }
      return result;
    },
  };
}
