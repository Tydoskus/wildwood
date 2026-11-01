import { isWeaponItem } from "../../shared/items";
import { equipBestInventory } from "../game/equip-best";
import { lookRefine } from "../game/local-item-refines";
import { moveCosmeticInventoryItem, moveInventoryItem, toggleCosmeticEquipmentVisibility, type InventoryState } from "../game/inventory";
import type { CoopAccess } from "../game/runtime/coop-access";
import type { createGameBootstrap } from "../game/runtime/game-bootstrap";
import { createInventoryCommerceActions } from "../game/runtime/inventory-commerce";
import type { PlayerState } from "../game/runtime/types";
import { createBuildActions } from "./build-actions";
import { cardsPort } from "./cards-tab";
import type { createGameElements } from "./game-elements";
import { createInventoryController } from "./inventory-controller";
import { createHudArrowChip } from "./hud-arrow-chip";
import { createItemInspectionController } from "./item-inspection-controller";

export type InventoryRuntimeDeps = {
  coop: CoopAccess;
  e: ReturnType<typeof createGameElements>;
  inventory: ReturnType<typeof createGameBootstrap>["inventory"];
  player: PlayerState;
  healthMultiplierBonus: () => number;
  /** Move speed with the equipped items, as an equip sets it. */
  equipmentMoveSpeed: () => number;
  /** Reapplies speed and max health after the equipped items changed. */
  applyEquipmentStats: () => void;
  /** Displayed power, or with `compare` the unrounded figure Equip Best ranks gear by. */
  powerForEquipment: (equipment: InventoryState, compare?: boolean) => number;
  isDueling: () => boolean;
  saveProgress: (immediate?: boolean) => void;
  showMessage: (text: string, color?: string) => void;
};

/** The bag: item inspection, equipping and moving items, cosmetics, builds, and selling or destroying items. */
export function createInventoryRuntime(deps: InventoryRuntimeDeps) {
  const { coop, e, inventory, player, saveProgress, showMessage } = deps;
  const client = coop.client;

  const itemInspection = createItemInspectionController({
    panel: e.itemInspectionPanel,
    title: e.itemInspectionTitle,
    content: e.itemInspectionContent,
    back: e.itemInspectionBack,
    weaponSkills: coop.weaponSkills,
  });
  const inventoryCommerce = createInventoryCommerceActions({
    inventory, player, coop: () => client, healthMultiplierBonus: deps.healthMultiplierBonus, movementSpeed: deps.equipmentMoveSpeed,
  });
  const inventoryController = createInventoryController({
    inventory,
    itemInspection,
    equipBest: () => {
      if (!equipBestInventory(inventory, candidate => deps.powerForEquipment(candidate, true))) return false;
      deps.applyEquipmentStats();
      saveProgress(true);
      showMessage("BEST EQUIPMENT EQUIPPED", "#72ef58");
      return true;
    },
    upgradeLevel: itemId => client?.itemUpgradeLevel?.(itemId) ?? 0,
    refineLevel: (itemId, copyId) => client?.itemRefine?.(itemId, copyId) ?? 0,
    lookRefine: lookRefine(itemId => client?.itemRefine?.(itemId) ?? 0, itemId => client?.cosmeticRefine?.(itemId) ?? 0),
    ores: () => client?.ores?.() ?? {},
    nockedArrow: () => client?.nockedArrow?.() ?? null,
    nockArrow: async arrowId => client?.nockArrow?.(arrowId),
    cards: cardsPort(() => client),
    slotTier: slot => client?.slotUpgradeTier?.(slot) ?? 0,
    inventorySlotsUnlocked: () => client?.inventorySlotsUnlocked?.() ?? 0,
    researchBagSlots: () => client?.research?.().inventorySlots ?? 0,
    toolLevels: () => client?.toolLevels?.() ?? {},
    gemBalance: coop.gemBalance,
    builds: createBuildActions({
      coop: () => client, inventory,
      blocked: () => deps.isDueling() ? "Finish Your Duel First" : null,
      afterGearChange: () => { deps.applyEquipmentStats(); saveProgress(true); },
    }),
    unlockInventorySlot: async () => client?.unlockInventorySlot?.(),
    ...inventoryCommerce,
    showMessage,
    move: (itemId, destination) => {
      if (!moveInventoryItem(inventory, itemId, destination)) return false;
      deps.applyEquipmentStats();
      const hasWeapon = isWeaponItem(inventory.equippedRightHand || inventory.equippedLeftHand);
      saveProgress(true);
      showMessage(hasWeapon ? "EQUIPMENT UPDATED · WEAPON READY" : "EQUIPMENT UPDATED", "#72ef58");
      return true;
    },
    moveCosmetic: (itemId, destination) => {
      if (!moveCosmeticInventoryItem(inventory, itemId, destination)) return false;
      saveProgress(true);
      showMessage("COSMETIC UPDATED · STATS UNCHANGED", "#f0c66b");
      return true;
    },
    toggleCosmeticVisibility: destination => {
      const change = toggleCosmeticEquipmentVisibility(inventory, destination);
      if (!change) return false;
      saveProgress(true);
      showMessage(
        change === "HIDDEN"
          ? "COSMETIC UPDATED · WEARING NOTHING · STATS UNCHANGED"
          : "COSMETIC UPDATED · EQUIPMENT VISIBLE · STATS UNCHANGED",
        "#f0c66b",
      );
      return true;
    },
  });

  // The nocked arrow chip: a few reads, written only on change, so a light poll beats wiring every notify.
  const refreshArrowChip = createHudArrowChip({
    weapon: () => inventory.equippedRightHand || inventory.equippedLeftHand,
    nocked: () => client?.nockedArrow?.() ?? null,
    held: arrowId => client?.ores?.()[arrowId] ?? 0,
    open: inventoryController.inspectOre,
  });
  if (typeof window !== "undefined") window.setInterval(() => { if (!document.hidden) refreshArrowChip(); }, 500);

  return { itemInspection, inventoryController };
}
