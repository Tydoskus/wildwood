import { GRADE_ITEM_DEFINITIONS, GRADE_WEAPON_KINDS, gradeItemId, type GradeWeaponKind, type GradeWeaponId } from "./grade-equipment";
import { PLAYER_SPAWN, TUTORIAL_FOREST_MAP_ID } from "./rules";
import { formatPercentMultiplier } from "./compact-number";
import type { WeaponSchool } from "./weapon-mastery";

/**
 * The Starter Chest: a new player's first weapon, picked once from a chest beside the forest spawn. One Crude
 * piece of each school; the stone stays the fallback until the pick.
 */
export const STARTER_CHEST_MAP_ID = TUTORIAL_FOREST_MAP_ID;
/** The chest's foot, on the grass just north of the path, a few steps from where new players arrive. */
export const STARTER_CHEST_POSITION = Object.freeze({ x: PLAYER_SPAWN.x + 110, y: PLAYER_SPAWN.y - 40 });
/** Feet against the chest's foot: the window opens within this. */
export const STARTER_CHEST_REACH = 50;
/** The server's allowance around the same spot: a position arrives a little late. */
export const STARTER_CHEST_SERVER_REACH = 100;

export type StarterWeaponKind = GradeWeaponKind;
export const STARTER_WEAPON_KINDS: readonly StarterWeaponKind[] = GRADE_WEAPON_KINDS;
export const isStarterWeaponKind = (kind: unknown): kind is StarterWeaponKind =>
  typeof kind === "string" && (STARTER_WEAPON_KINDS as readonly string[]).includes(kind);
/** The Crude piece of a kind. */
export const starterWeaponId = (kind: StarterWeaponKind): GradeWeaponId => gradeItemId(kind, "crude");

/** The Crude Sword's own damage bonus in percent, read from the item so the chest never says more than it gives. */
const crudeSwordBonusPercent = () => Math.round((GRADE_ITEM_DEFINITIONS[gradeItemId("sword", "crude")].weapon?.damageMultiplierBonus ?? 0) * 10_000) / 100;

/** The three picks as the window shows them, in this order. */
export const STARTER_WEAPON_CHOICES: readonly { kind: StarterWeaponKind; name: string; school: WeaponSchool; text: string }[] = [
  { kind: "bow", name: "Crude Bow", school: "archery", text: "Shoots from range" },
  { kind: "sword", name: "Crude Sword", school: "swordplay", text: `Fights up close · Damage ${formatPercentMultiplier(crudeSwordBonusPercent())}` },
  { kind: "staff", name: "Crude Staff", school: "sorcery", text: "Bursting bolts" },
  { kind: "dagger", name: "Crude Dagger", school: "swordplay", text: "Strikes fast up close" },
];
