import type { Identity } from "spacetimedb";
import { itemDefinition, STARTER_STONE } from "../../shared/items";
import { CAMPAIGN_UNLOCK_FIELDS, equipmentMapRequirement, withoutLockedEquipment } from "../../shared/equipment-access";
import {
  EQUIP_BEST_SLOTS, equipComparisonPower, equippedInSlot, isEquipUpgrade, withItemEquipped, type EquipLoadout,
} from "../../shared/equip-best";
import { bowSkillRollFor } from "./bow-skills";
import { allowedLoadout } from "./loadout";
import { lootSettingsFor } from "./loot-settings";

type Ctx = any;

const LOADOUT_FIELDS = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;

export const sameLoadout = (a: EquipLoadout, b: EquipLoadout) => LOADOUT_FIELDS.every(field => a[field] === b[field]);

/** Whether anything could have become newly equippable: the bag (forest counts included) or a map unlock changed. */
const gainedGearOrMaps = (before: any, after: any) => before.inventoryJson !== after.inventoryJson
  || before.bowCount !== after.bowCount || before.woodenArmorCount !== after.woodenArmorCount
  || CAMPAIGN_UNLOCK_FIELDS.some(field => !before[field] && after[field]);

/**
 * Auto equip upgrades: gear goes on by itself when it beats what is in its
 * slot, by the same measure as the inventory's Equip best (shared/equip-best.ts,
 * bow skills included), and only when the player could have put it on by
 * hand: owned, unlocked by their maps (equipmentMapRequirement) and allowed by
 * save_player_progress's own loadout rules (loadout.ts).
 *
 * It happens when new gear arrives from loot, first copies only (duplicates
 * are Auto keep best's), and when reaching a map unlocks the tier of gear the
 * player already holds. It is the player's autoEquipBest setting, on unless
 * they turned it off in the Loot Filter window. Prestige also re-equips, with
 * the setting on or off, because gear it locks away would otherwise leave an
 * empty hand.
 *
 * The client sees the new loadout in its player_progress row and takes it
 * into its own bag, so its next save does not put the old gear back.
 */
export function createAutoEquip(deps: {
  inventoryForProgress: (progress: any) => string[];
  itemUpgradeLevelFor: (ctx: Ctx, identity: Identity, itemId: string) => number;
  writeProgressAndPresentation: (ctx: Ctx, progress: any) => void;
}) {
  /** The comparison Equip best makes, for this player's stats, research, slot tiers and bow rolls. */
  function comparisonPower(ctx: Ctx, identity: Identity) {
    const research = ctx.db.playerResearch.identity.find(identity);
    return (candidate: any) => equipComparisonPower(candidate, research,
      itemId => deps.itemUpgradeLevelFor(ctx, identity, itemId),
      itemId => bowSkillRollFor(ctx, identity, itemId));
  }

  /**
   * The progress with `itemId` on, when that is an upgrade the player may use;
   * otherwise the progress unchanged. Gear the player's maps lock away counts
   * as an empty slot, which is also how their power sees it.
   */
  function withUpgrade(ctx: Ctx, progress: any, itemId: string, inventory: readonly string[]) {
    if (!inventory.includes(itemId) || equipmentMapRequirement(itemId, progress)) return progress;
    const current = { ...progress, ...withoutLockedEquipment(progress, progress) };
    if (!isEquipUpgrade(current, itemId, comparisonPower(ctx, progress.identity))) return progress;
    const allowed = allowedLoadout(withItemEquipped(current, itemId), inventory);
    if (!Object.values(allowed).includes(itemId)) return progress;
    return { ...progress, ...allowed };
  }

  /**
   * After loot or a boss reward has been written: gear that is new in the bag
   * since `before`, or that a map reached since `before` has made usable, goes
   * on where it beats the slot. Written with the player row's power and
   * looks, so everyone sees the new gear. It runs on every kill report, so
   * when neither the bag nor the maps changed it stops after one row read.
   */
  function equipNewUpgrades(ctx: Ctx, identity: Identity, before: any) {
    if (!before) return;
    const progress = ctx.db.playerProgress.identity.find(identity);
    if (!progress || !gainedGearOrMaps(before, progress) || !lootSettingsFor(ctx, identity).autoEquipBest) return;
    const had = new Set(deps.inventoryForProgress(before));
    const inventory = deps.inventoryForProgress(progress);
    const candidates = new Set(inventory.filter(itemId => !had.has(itemId)
      || (equipmentMapRequirement(itemId, before) && !equipmentMapRequirement(itemId, progress))));
    let next = progress;
    for (const itemId of candidates) next = withUpgrade(ctx, next, itemId, inventory);
    if (!sameLoadout(next, progress)) deps.writeProgressAndPresentation(ctx, next);
  }

  /**
   * Prestige keeps the bag but not the maps: `fresh` is the reset progress,
   * `previous` the run being traded in. The bag, the forest counts and the
   * loadout carry over, and gear above tier 1 is locked again until its map
   * is reached. Every slot holding locked gear gets the best gear the player
   * can use instead, and a hand left empty falls back to the starter stone,
   * which every player owns. Slots holding usable gear, or an armour slot the
   * player left empty, stay as they were.
   */
  function keepBagThroughPrestige(ctx: Ctx, fresh: any, previous: any) {
    return equipUsable(ctx, {
      ...fresh,
      inventoryJson: previous.inventoryJson,
      bowCount: previous.bowCount ?? 0,
      woodenArmorCount: previous.woodenArmorCount ?? 0,
      equippedHead: previous.equippedHead,
      equippedChest: previous.equippedChest,
      equippedFeet: previous.equippedFeet,
      equippedRightHand: previous.equippedRightHand,
      equippedLeftHand: previous.equippedLeftHand,
    });
  }

  function equipUsable(ctx: Ctx, progress: any) {
    const inventory = deps.inventoryForProgress(progress);
    // Decided up front: filling one slot clears locked gear from the others.
    const refill = EQUIP_BEST_SLOTS.filter(([slot]) => {
      const current = equippedInSlot(progress, slot);
      return current ? Boolean(equipmentMapRequirement(current, progress)) : slot === "HAND";
    });
    let next = { ...progress };
    for (const [slot, field] of refill) {
      if (slot === "HAND") next = { ...next, equippedRightHand: "", equippedLeftHand: "" };
      else next = { ...next, [field]: "" };
      for (const itemId of inventory) if (itemDefinition(itemId)?.slot === slot) next = withUpgrade(ctx, next, itemId, inventory);
      if (slot === "HAND" && !equippedInSlot(next, "HAND")) next = { ...next, equippedRightHand: STARTER_STONE };
    }
    return next;
  }

  return { equipNewUpgrades, keepBagThroughPrestige };
}
