import { expect, it, vi } from "vitest";
import { autoEquipMessage, createAutoEquipFeedback } from "./auto-equip-feedback";
import { serverLoadoutChanges, withServerLoadout } from "../coop/services/server-loadout";
import type { ServerEquip } from "../coop/services/progression-service";
import type { PlayerProgress, ProgressSave } from "../coop/services/progress";
import type { InventoryState } from "../game/inventory";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import type { PlayerState } from "../game/runtime/types";

const loadout = (rightHand: string, extra: Record<string, string> = {}) => ({
  equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: rightHand, equippedLeftHand: "", ...extra,
});
const progress = (rightHand: string, extra: Record<string, unknown> = {}) => ({ ...loadout(rightHand), ...extra }) as unknown as PlayerProgress;
const save = (rightHand: string, extra: Record<string, string> = {}) => loadout(rightHand, extra) as unknown as ProgressSave;

it("takes a slot the server changed while the local save still held the old gear", () => {
  expect(serverLoadoutChanges(progress("iron_bow"), progress("crystal_bow"), null))
    .toEqual([{ field: "equippedRightHand", itemId: "crystal_bow", previous: "iron_bow" }]);
  expect(serverLoadoutChanges(progress("iron_bow"), progress("crystal_bow"), save("iron_bow")))
    .toEqual([{ field: "equippedRightHand", itemId: "crystal_bow", previous: "iron_bow" }]);
  // The echo of this tab's own save, and a slot the player changed since: theirs, not the server's.
  expect(serverLoadoutChanges(progress("iron_bow"), progress("snow_bow"), save("snow_bow"))).toEqual([]);
  expect(serverLoadoutChanges(progress("iron_bow"), progress("crystal_bow"), save("snow_bow"))).toEqual([]);
  // Nothing to compare with before the first row.
  expect(serverLoadoutChanges(null, progress("crystal_bow"), null)).toEqual([]);
  const changes = serverLoadoutChanges(progress("iron_bow"), progress("crystal_bow"), save("iron_bow"));
  expect(withServerLoadout(save("iron_bow", { equippedHead: "wood_full_helm" }), changes))
    .toMatchObject({ equippedRightHand: "crystal_bow", equippedHead: "wood_full_helm" });
});

it("names the upgrade, the weapon first, and says nothing for a prestige swap or an emptied slot", () => {
  const unlocked = Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true]));
  expect(autoEquipMessage([
    { field: "equippedHead", itemId: "crystal_helmet", previous: "" },
    { field: "equippedRightHand", itemId: "crystal_bow", previous: "iron_bow" },
  ], unlocked)).toBe("Equipped Crystalwing Bow (upgrade)");
  expect(autoEquipMessage([{ field: "equippedRightHand", itemId: "", previous: "iron_bow" }], unlocked)).toBeNull();
  // After a prestige the crystal bow is locked again; swapping it out is no upgrade.
  expect(autoEquipMessage([{ field: "equippedRightHand", itemId: "starter_bow", previous: "crystal_bow" }], {})).toBeNull();
});

it("puts the server's gear in the local bag and says so, silently on a reconnect", () => {
  let listener: ((equip: ServerEquip) => void) | null = null;
  const inventory = { itemIds: ["iron_bow", "crystal_bow"], ...loadout("iron_bow") } as unknown as InventoryState;
  const player = { maxHp: 100, hp: 100, baseMaxHp: 100 } as unknown as PlayerState;
  const renderInventory = vi.fn();
  const messages: string[] = [];
  createAutoEquipFeedback({
    coop: { setOnServerEquip: callback => { listener = callback; } },
    inventory, player, healthMultiplierBonus: () => 0, renderInventory, showMessage: message => messages.push(message),
  });
  const unlocked = Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true])) as unknown as PlayerProgress;
  listener!({ changes: [{ field: "equippedRightHand", itemId: "crystal_bow", previous: "iron_bow" }], progress: unlocked, live: true });
  expect(inventory.equippedRightHand).toBe("crystal_bow");
  expect(renderInventory).toHaveBeenCalledOnce();
  expect(messages).toEqual(["Equipped Crystalwing Bow (upgrade)"]);
  // Already in hand: nothing to do.
  listener!({ changes: [{ field: "equippedRightHand", itemId: "crystal_bow", previous: "iron_bow" }], progress: unlocked, live: true });
  expect(renderInventory).toHaveBeenCalledOnce();
  listener!({ changes: [{ field: "equippedRightHand", itemId: "iron_bow", previous: "crystal_bow" }], progress: unlocked, live: false });
  expect(inventory.equippedRightHand).toBe("iron_bow");
  expect(messages).toHaveLength(1);
});
