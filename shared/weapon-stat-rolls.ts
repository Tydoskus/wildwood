import { ATTACK_SPEED_START, attacksPerSecondForRating, critDamageForLevels, ratingForLevels } from "./stat-rating";
import { canonicalItemId, itemDefinition, type WeaponStatId } from "./items";

/**
 * A graded weapon's attack speed and crit damage: each copy rolls both, anywhere in its grade's range of rating
 * levels (gear-grades.ts GRADE_ROLL_RANGE). Reforge draws again and each keeps the higher, as weapon skills do.
 */
export const WEAPON_STAT_IDS: readonly WeaponStatId[] = ["attackSpeed", "critDamage"];
export type WeaponStatRoll = Record<WeaponStatId, number>;

export const weaponRollRange = (itemId: unknown) => itemDefinition(canonicalItemId(itemId))?.weapon?.rollRange ?? null;
export const hasWeaponStats = (itemId: unknown) => weaponRollRange(itemId) !== null;

/** Both stats, one draw each in a fixed order, to a hundredth of a level. Null for a weapon without a grade. */
export function rollWeaponStats(itemId: unknown, random: () => number): WeaponStatRoll | null {
  const range = weaponRollRange(itemId);
  if (!range) return null;
  const draw = () => Math.round((range.min + (range.max - range.min) * random()) * 100) / 100;
  return { attackSpeed: draw(), critDamage: draw() };
}

/** What the rolled levels give from nothing, before slot tier and refine: "Attack Speed +0.21/s", "Crit Damage ×1.45". */
export function weaponStatLines(roll: Partial<WeaponStatRoll> | null | undefined): string[] {
  const lines: string[] = [];
  const speed = Number(roll?.attackSpeed ?? 0), crit = Number(roll?.critDamage ?? 0);
  if (speed > 0) lines.push(`Attack Speed +${(attacksPerSecondForRating(ratingForLevels(speed)) - ATTACK_SPEED_START).toFixed(2)}/s`);
  if (crit > 0) lines.push(`Crit Damage ×${critDamageForLevels(crit).toFixed(2)}`);
  return lines;
}
