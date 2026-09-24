import { bowSkillScore, type BowSkillRoll } from "./bow-skills";
import { BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS, isCosmeticOnlyItem, itemDefinition, type EquipmentSlot, type ItemSlot } from "./items";
import {
  effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch,
} from "./player-power";

/**
 * Which of two pieces of gear is better in a slot.
 *
 * One rule, shared by the inventory's Equip best button and by the server's
 * auto equip (a new drop, or gear a newly reached map makes usable), so the
 * two never disagree about what "better" means. Equipment bonuses are
 * additive, so each slot is scored on its own: the player's power with the
 * candidate in that slot. Boots add no power; only Black Boots' speed counts.
 * A bow's skills count too, multiplied into its damage (see
 * equipComparisonPower), so of two copies of one bow the better roll wins.
 */
export type EquipLoadout = {
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  equippedRightHand: string;
  equippedLeftHand: string;
};

type LoadoutField = keyof EquipLoadout;

/** The slots Equip best fills, the field each is saved in, and where a move puts the item. */
export const EQUIP_BEST_SLOTS: readonly (readonly [ItemSlot, LoadoutField, EquipmentSlot])[] = [
  ["HAND", "equippedRightHand", "RIGHT_HAND"],
  ["HEAD", "equippedHead", "HEAD"],
  ["CHEST", "equippedChest", "CHEST"],
  ["FEET", "equippedFeet", "FEET"],
];

const LOADOUT_FIELDS: readonly LoadoutField[] = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"];

export type BowSkillsOf = (itemId: string) => Partial<BowSkillRoll> | null | undefined;

/**
 * Power for comparing gear, not for showing: the same stats as the player's
 * power, unrounded, with the weapon's damage raised by its skill score, so a
 * bow with Skills +7.5% counts as 7.5% more damage. Without `bowSkills` it is
 * exactly the displayed power before rounding.
 */
export function equipComparisonPower(
  progress: PlayerPowerProgress,
  research?: PlayerPowerResearch | null,
  itemUpgradeLevel?: (itemId: string) => number,
  bowSkills?: BowSkillsOf,
) {
  const stats = effectivePlayerPowerStats(progress, research, itemUpgradeLevel);
  const weapon = progress.equippedRightHand || progress.equippedLeftHand || "";
  const skills = weapon && bowSkills ? bowSkillScore(bowSkills(weapon)) : 0;
  return unroundedPlayerPower({ ...stats, damage: stats.damage * (1 + skills / 100) });
}

/** What occupies a slot. A weapon may still sit in the legacy left hand. */
export function equippedInSlot(loadout: EquipLoadout, slot: ItemSlot) {
  if (slot === "HAND") return loadout.equippedRightHand || loadout.equippedLeftHand;
  const field = EQUIP_BEST_SLOTS.find(([candidate]) => candidate === slot)![1];
  return loadout[field];
}

/** How good a loadout is for one slot's comparison. */
export function equipSlotScore<T extends EquipLoadout>(slot: ItemSlot, loadout: T, power: (candidate: T) => number) {
  if (slot === "FEET") return loadout.equippedFeet === BLACK_BOOTS ? BLACK_BOOTS_SPEED_BONUS : 0;
  return power(loadout);
}

/** Keep an equipped item on ties, but fill an empty slot even at zero power. */
export function beatsEquipped(candidateScore: number, currentScore: number, currentItem: string) {
  return candidateScore > currentScore || (!currentItem && candidateScore === currentScore);
}

/**
 * The loadout with an item in its slot, the way the inventory moves it: out
 * of any other slot it was in, and a weapon into the right hand with the left
 * hand cleared.
 */
export function withItemEquipped<T extends EquipLoadout>(loadout: T, itemId: string): T {
  const slot = itemDefinition(itemId)?.slot;
  if (!slot) return loadout;
  const next = { ...loadout };
  for (const field of LOADOUT_FIELDS) if (next[field] === itemId) next[field] = "";
  if (slot === "HAND") {
    next.equippedLeftHand = "";
    next.equippedRightHand = itemId;
    return next;
  }
  next[EQUIP_BEST_SLOTS.find(([candidate]) => candidate === slot)![1]] = itemId;
  return next;
}

/** Whether putting this item on would beat what is in its slot now. Cosmetic looks never do. */
export function isEquipUpgrade<T extends EquipLoadout>(loadout: T, itemId: string, power: (candidate: T) => number) {
  const slot = itemDefinition(itemId)?.slot;
  if (!slot || isCosmeticOnlyItem(itemId)) return false;
  const current = equippedInSlot(loadout, slot);
  if (current === itemId) return false;
  const candidate = withItemEquipped(loadout, itemId);
  return beatsEquipped(equipSlotScore(slot, candidate, power), equipSlotScore(slot, loadout, power), current);
}
