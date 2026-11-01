import { equipmentLocked } from "./equipment-locks";
import type { Identity } from "spacetimedb";
import { itemDefinition, type ItemLevel } from "../../shared/items";
import {
  EQUIP_BEST_SLOTS, equipComparisonPower, equippedInSlot, isEquipUpgrade, withItemEquipped,
  type EquipLoadout,
} from "../../shared/equip-best";
import { weaponSkillRollFor } from "./weapon-skills";
import { allowedLoadout } from "./loadout";
import { lootSettingsFor } from "./loot-settings";
import { readPlayerProgress } from "./wide-stats";

type Ctx = any;

const LOADOUT_FIELDS = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;

export const sameLoadout = (a: EquipLoadout, b: EquipLoadout) => LOADOUT_FIELDS.every(field => a[field] === b[field]);

const slotField = (itemId: string) => EQUIP_BEST_SLOTS.find(([slot]) => slot === itemDefinition(itemId)?.slot)![1];

/** Whether anything could have become newly equippable: the bag, forest counts included, changed. */
const gainedGear = (before: any, after: any) => before.inventoryJson !== after.inventoryJson
  || before.bowCount !== after.bowCount || before.woodenArmorCount !== after.woodenArmorCount;

/**
 * Auto equip upgrades: gear goes on by itself when it beats what is in its
 * slot, by the same measure as the inventory's Equip best (shared/equip-best.ts,
 * bow skills included), and only when the player could have put it on by
 * hand: owned and allowed by save_player_progress's own loadout rules
 * (loadout.ts). A weapon only
 * replaces one of its own kind (shared/equip-best.ts): a sword never goes
 * into an archer's hand, however hard it hits.
 *
 * It happens when new gear arrives in the bag, first copies only (duplicates
 * are Auto keep best's). It is the player's autoEquipBest setting, on unless
 * they turned it off in the Loot Filter window. Hands the player emptied
 * themselves stay empty: players fight unarmed on purpose (Reflect
 * challenges), so a new weapon never fills them.
 *
 * The client sees the new loadout in its player_progress row and takes it
 * into its own bag, so its next save does not put the old gear back.
 */
export function createAutoEquip(deps: {
  inventoryForProgress: (progress: any) => string[];
  /** The slot tier and refine of an item (progress-helpers itemLevelFor), so Equip best prefers a refined item. */
  itemUpgradeLevelFor: (ctx: Ctx, identity: Identity, itemId: string) => ItemLevel;
  writeProgressAndPresentation: (ctx: Ctx, progress: any) => void;
}) {
  /** The comparison Equip best makes, for this player's stats, research, slot tiers, refines and bow rolls (not cards). */
  function comparisonPower(ctx: Ctx, identity: Identity) {
    const research = ctx.db.playerResearch.identity.find(identity);
    return (candidate: any) => equipComparisonPower(candidate, research,
      itemId => deps.itemUpgradeLevelFor(ctx, identity, itemId),
      itemId => weaponSkillRollFor(ctx, identity, itemId));
  }

  /** The progress with `itemId` on, when that is an upgrade the player may use; otherwise the progress unchanged. */
  function withUpgrade(ctx: Ctx, progress: any, itemId: string, inventory: readonly string[]) {
    if (!inventory.includes(itemId)) return progress;
    const slot = itemDefinition(itemId)?.slot;
    // Empty hands are a choice (unarmed Reflect runs): a new weapon never fills them.
    if (slot === "HAND" && !progress.equippedRightHand && !progress.equippedLeftHand) return progress;
    if (slot && equipmentLocked(ctx, progress.identity, equippedInSlot(progress, slot))) return progress;
    if (!isEquipUpgrade(progress, itemId, comparisonPower(ctx, progress.identity))) return progress;
    const allowed = allowedLoadout(withItemEquipped(progress, itemId), inventory);
    if (!Object.values(allowed).includes(itemId)) return progress;
    // Only the item's own slot is written.
    return itemDefinition(itemId)?.slot === "HAND"
      ? { ...progress, equippedRightHand: allowed.equippedRightHand, equippedLeftHand: allowed.equippedLeftHand }
      : { ...progress, [slotField(itemId)]: itemId };
  }

  /**
   * After loot or a purchase has been written: gear that is new in the bag
   * since `before` goes on where it beats the slot. Written with the player
   * row's power and looks, so everyone sees the new gear. It runs on every
   * kill report, so when the bag did not change it stops after one row read.
   */
  function equipNewUpgrades(ctx: Ctx, identity: Identity, before: any, written?: any) {
    if (!before) return;
    // The row the report last wrote, when the caller has it: its bag and counts are stored as given.
    if (written && !gainedGear(before, written)) return;
    const progress = readPlayerProgress(ctx, identity);
    if (!progress || !gainedGear(before, progress) || !lootSettingsFor(ctx, identity).autoEquipBest) return;
    const had = new Set(deps.inventoryForProgress(before));
    const inventory = deps.inventoryForProgress(progress);
    let next = progress;
    for (const itemId of inventory) if (!had.has(itemId)) next = withUpgrade(ctx, next, itemId, inventory);
    if (!sameLoadout(next, progress)) deps.writeProgressAndPresentation(ctx, next);
  }

  /**
   * Prestige keeps the bag but not the maps: `fresh` is the reset progress,
   * `previous` the run being traded in. The bag, the forest counts and the
   * loadout carry over as they were; gear never locks behind a map.
   */
  function keepBagThroughPrestige(_ctx: Ctx, fresh: any, previous: any) {
    return {
      ...fresh,
      inventoryJson: previous.inventoryJson,
      bowCount: previous.bowCount ?? 0,
      woodenArmorCount: previous.woodenArmorCount ?? 0,
      equippedHead: previous.equippedHead,
      equippedChest: previous.equippedChest,
      equippedFeet: previous.equippedFeet,
      equippedRightHand: previous.equippedRightHand,
      equippedLeftHand: previous.equippedLeftHand,
    };
  }

  return { equipNewUpgrades, keepBagThroughPrestige };
}
