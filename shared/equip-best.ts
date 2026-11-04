import { weaponSkillScore, type WeaponSkillRoll } from "./weapon-skills";
import {
  BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS, STARTER_STONE, equipmentDamageMultiplierBonus, isCosmeticOnlyItem, itemDefinition,
  type EquipmentSlot, type ItemSlot,
  type ItemLevel,
} from "./items";
import {
  effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch,
} from "./player-power";
import { bootStyleOf, gradeOf } from "./grade-equipment";
import { gradeIndex, type BootStyle } from "./gear-grades";
import type { AttackCapArg } from "./stat-rating";

/**
 * Which of two pieces of gear is better in a slot.
 *
 * One rule, shared by the inventory's Equip best button and by the server's
 * auto equip (gear new in the bag), so the
 * two never disagree about what "better" means. Equipment bonuses are
 * additive, so each slot is scored on its own: the player's power with the
 * candidate in that slot. Boots go by their own score (bootsScore), not power.
 * A weapon's skills count too, multiplied into its damage (see
 * equipComparisonPower), so of two copies of one weapon the better roll wins.
 * Active cards do not: they stay on whatever is worn.
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

export type WeaponSkillsOf = (itemId: string) => WeaponSkillRoll | null | undefined;

/**
 * Power for comparing gear, not for showing: the same stats as the player's
 * power, unrounded, with the weapon's damage raised by its skill score, so a
 * bow with Skills +7.5% counts as 7.5% more damage. Without `weaponSkills` it is
 * exactly the displayed power before rounding.
 */
export function equipComparisonPower(
  progress: PlayerPowerProgress,
  research?: PlayerPowerResearch | null,
  itemUpgradeLevel?: (itemId: string) => ItemLevel,
  weaponSkills?: WeaponSkillsOf,
  /** The attack cap in play: Quick Draw tops the weapon's attack speed curve (stat-rating.ts attackIntervalWithGear). */
  attackCap?: AttackCapArg,
) {
  const stats = effectivePlayerPowerStats(progress, research, itemUpgradeLevel, undefined, attackCap);
  const weapon = progress.equippedRightHand || progress.equippedLeftHand || "";
  const skills = weapon && weaponSkills ? weaponSkillScore(weapon, weaponSkills(weapon)) : 0;
  return unroundedPlayerPower({ ...stats, damage: stats.damage * (1 + skills / 100) });
}

/** What occupies a slot. Older saves may hold a weapon in the left hand. */
export function equippedInSlot(loadout: EquipLoadout, slot: ItemSlot) {
  if (slot === "HAND") return loadout.equippedRightHand || loadout.equippedLeftHand;
  const field = EQUIP_BEST_SLOTS.find(([candidate]) => candidate === slot)![1];
  return loadout[field];
}

/** How good a loadout is for one slot's comparison. */
export function equipSlotScore<T extends EquipLoadout>(slot: ItemSlot, loadout: T, power: (candidate: T) => number) {
  if (slot === "FEET") return bootsScore(loadout);
  return power(loadout);
}

const STYLE_WEAPON: Readonly<Record<BootStyle, WeaponKind>> = { ranger: "RANGED", warrior: "MELEE", mystic: "MAGIC" };

/**
 * Boots' score: graded boots above Black Boots' speed, the style of the weapon in hand above the others, then the
 * higher grade. Their stats differ in kind (speed, armor, skill chance), so power cannot rank them.
 */
export function bootsScore(loadout: EquipLoadout) {
  const feet = loadout.equippedFeet, style = bootStyleOf(feet), grade = gradeOf(feet);
  if (!style || !grade) return feet === BLACK_BOOTS ? BLACK_BOOTS_SPEED_BONUS : 0;
  const matches = STYLE_WEAPON[style] === weaponKind(equippedInSlot(loadout, "HAND"));
  return 100 + (matches ? 100 : 0) + gradeIndex(grade);
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

export type WeaponKind = "RANGED" | "MELEE" | "MAGIC";

/**
 * How a weapon fights: a sword strikes up close, a staff casts bursting bolts,
 * a bow or the stone shoots from range. Nothing in the hand reads as ranged,
 * as the stone it falls back to.
 */
export function weaponKind(itemId: string | undefined): WeaponKind {
  const weapon = itemDefinition(itemId)?.weapon;
  return weapon?.mode === "MELEE" ? "MELEE" : weapon?.projectile === "BOLT" ? "MAGIC" : "RANGED";
}

/**
 * What an empty hand means: the strongest weapon of the kind the hand held
 * (weaponKind) that the player owns, by the item's own damage bonus. The
 * starter stone, which every player owns, is ranged, so a ranged hand always
 * has one; a sword or staff hand with none of its kind takes the strongest
 * ranged one. Never "". A blank hand is a normal saved state (older saves),
 * and a player with no weapon cannot attack, so the server's reading of a
 * saved hand and the client's bag both fill it from here.
 */
export function fallbackWeapon(itemIds: readonly string[], kind: WeaponKind = "RANGED") {
  const strongest = (wanted: WeaponKind) => {
    let best = wanted === "RANGED" ? STARTER_STONE : "";
    let bestBonus = best ? equipmentDamageMultiplierBonus(best, "", "") : -Infinity;
    for (const itemId of itemIds) {
      if (itemDefinition(itemId)?.slot !== "HAND" || isCosmeticOnlyItem(itemId)) continue;
      if (weaponKind(itemId) !== wanted) continue;
      const bonus = equipmentDamageMultiplierBonus(itemId, "", "");
      if (bonus > bestBonus) {
        best = itemId;
        bestBonus = bonus;
      }
    }
    return best;
  };
  return (kind !== "RANGED" && strongest(kind)) || strongest("RANGED");
}

/**
 * Whether putting this item on would beat what is in its slot now. Cosmetic
 * looks never do, and a weapon only ever replaces one of its own kind: swords
 * hit harder than bows but only up close, so power alone would trade every
 * archer's bow for a sword (or a staff). `kind` is the hand's kind, by default what it
 * holds; a caller with an empty hand can pass the kind it should keep.
 */
export function isEquipUpgrade<T extends EquipLoadout>(loadout: T, itemId: string, power: (candidate: T) => number,
  kind: WeaponKind = weaponKind(equippedInSlot(loadout, "HAND"))) {
  const slot = itemDefinition(itemId)?.slot;
  if (!slot || isCosmeticOnlyItem(itemId)) return false;
  if (slot === "HAND" && weaponKind(itemId) !== kind) return false;
  const current = equippedInSlot(loadout, slot);
  if (current === itemId) return false;
  const candidate = withItemEquipped(loadout, itemId);
  return beatsEquipped(equipSlotScore(slot, candidate, power), equipSlotScore(slot, loadout, power), current);
}
