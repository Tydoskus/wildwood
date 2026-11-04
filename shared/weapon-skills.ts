import { BOW_SKILL_IDS, NO_BOW_SKILLS, bowSkillLines, bowSkillScore, isSkillBow, rollBowSkills, type BowSkillRoll } from "./bow-skills";
import { NO_SWORD_SKILLS, SWORD_SKILL_IDS, isSkillSword, rollSwordSkills, swordSkillLines, swordSkillScore, type SwordSkillRoll } from "./sword-skills";
import { STAFF_SKILL_IDS, isSkillStaff, rollStaffSkills, staffSkillLines, staffSkillScore, type StaffSkillRoll } from "./staff-skills";
import { DAGGER_SKILL_IDS, daggerSkillLines, daggerSkillScore, daggerSkillsOf, isSkillDagger, rollDaggerSkills, type DaggerSkillRoll } from "./dagger-skills";
import { WEAPON_STAT_IDS, hasWeaponStats, rollWeaponStats, weaponStatLines, type WeaponStatRoll } from "./weapon-stat-rolls";

/** Kept copies and offers carry any kind of weapon's roll: its skills, and a graded weapon's attack speed and crit damage. */
export type WeaponSkillRoll = Partial<BowSkillRoll & SwordSkillRoll & StaffSkillRoll & DaggerSkillRoll & WeaponStatRoll>;
export const isSkillWeapon = (itemId: unknown) => isSkillBow(itemId) || isSkillSword(itemId) || isSkillStaff(itemId) || isSkillDagger(itemId);
/** Skills first, then the stats, so a skill roll draws as it always has. */
export const rollWeaponSkills = (itemId: unknown, random: () => number, skillLuckRank = 0): WeaponSkillRoll => ({
  ...(rollBowSkills(itemId, random, skillLuckRank) ?? rollSwordSkills(itemId, random, skillLuckRank)
    ?? rollStaffSkills(itemId, random, skillLuckRank) ?? rollDaggerSkills(itemId, random, skillLuckRank) ?? NO_BOW_SKILLS),
  ...rollWeaponStats(itemId, random),
});
export const weaponSkillScore = (itemId: unknown, roll: WeaponSkillRoll | null | undefined) =>
  isSkillSword(itemId) ? swordSkillScore(roll) : isSkillStaff(itemId) ? staffSkillScore(roll) : isSkillDagger(itemId) ? daggerSkillScore(roll)
    : isSkillBow(itemId) ? bowSkillScore(roll) : 0;
export const weaponSkillLines = (itemId: unknown, roll: WeaponSkillRoll | null | undefined) =>
  isSkillSword(itemId) ? swordSkillLines(roll) : isSkillStaff(itemId) ? staffSkillLines(roll) : isSkillDagger(itemId) ? daggerSkillLines(roll)
    : isSkillBow(itemId) ? bowSkillLines(roll) : [];
/** A copy's whole roll in one list, for rows that show no item stats: its skills, then its speed and crit. */
export const weaponRollLines = (itemId: unknown, roll: WeaponSkillRoll | null | undefined) =>
  [...weaponSkillLines(itemId, roll), ...(hasWeaponStats(itemId) ? weaponStatLines(roll) : [])];
/** A player_weapon_stat row's roll: its speed and crit, and a dagger's skills. */
export const weaponStatRollOf = (row: { itemId: string; attackSpeed: number; critDamage: number } & Partial<DaggerSkillRoll>): WeaponSkillRoll =>
  ({ attackSpeed: row.attackSpeed, critDamage: row.critDamage, ...(isSkillDagger(row.itemId) ? daggerSkillsOf(row) : {}) });
/** The rolled speed and crit as an item level's part, for itemStats and power. */
export const weaponStatLevel = (roll: WeaponSkillRoll | null | undefined) =>
  ({ ...(Number.isFinite(roll?.attackSpeed) ? { attackSpeed: roll!.attackSpeed } : {}), ...(Number.isFinite(roll?.critDamage) ? { critDamage: roll!.critDamage } : {}) });

/**
 * The stable columns on copy and offer rows; the other weapon kind stays zero. Staff and dagger rolls are not columns
 * there: a staff's live in their own table (spacetimedb/src/staff-skills.ts), a dagger's beside its speed and crit
 * (spacetimedb/src/weapon-stat-roll.ts), so these rows never changed shape for them.
 */
export const weaponSkillColumns = (roll: WeaponSkillRoll) => {
  const {
    meteor: _meteor, chain: _chain, frostNova: _frostNova, backstab: _backstab, poison: _poison, dodge: _dodge,
    attackSpeed: _speed, critDamage: _crit, ...columns
  } = roll;
  return { ...NO_BOW_SKILLS, ...NO_SWORD_SKILLS, ...columns };
};
/** A copy or offer row's own skill columns: a bow's or a sword's, none for a dagger (weapon-stat-roll.ts keeps its). */
export function weaponSkillRollOf(row: WeaponSkillRoll & { itemId: string }): WeaponSkillRoll {
  if (isSkillStaff(row.itemId)) return { meteor: row.meteor ?? 0, chain: row.chain ?? 0, frostNova: row.frostNova ?? 0 };
  if (isSkillDagger(row.itemId)) return {};
  return isSkillSword(row.itemId)
    ? { whirlwind: row.whirlwind ?? 0, deflect: row.deflect ?? 0, shockwave: row.shockwave ?? 0 }
    : { arrowStorm: row.arrowStorm ?? 0, ricochet: row.ricochet ?? 0, piercingShot: row.piercingShot ?? 0 };
}

/** The skills a weapon can carry, in their display order. */
export const weaponSkillIds = (itemId: unknown): readonly (keyof WeaponSkillRoll)[] =>
  isSkillSword(itemId) ? SWORD_SKILL_IDS : isSkillStaff(itemId) ? STAFF_SKILL_IDS : isSkillDagger(itemId) ? DAGGER_SKILL_IDS
    : isSkillBow(itemId) ? BOW_SKILL_IDS : [];

/**
 * A duplicate's roll merged into the held one: each skill keeps the higher of the two, so a skill never goes
 * down and any better skill on a drop is taken. Null when nothing would change.
 */
export function mergeSkillRolls(itemId: unknown, current: WeaponSkillRoll | null | undefined, next: WeaponSkillRoll | null | undefined): WeaponSkillRoll | null {
  const skills = [...weaponSkillIds(itemId), ...(hasWeaponStats(itemId) ? WEAPON_STAT_IDS : [])];
  const value = (roll: WeaponSkillRoll | null | undefined, skill: keyof WeaponSkillRoll) => Number(roll?.[skill] ?? 0) || 0;
  const merged = Object.fromEntries(skills.map(skill => [skill, Math.max(value(current, skill), value(next, skill))])) as WeaponSkillRoll;
  return skills.some(skill => value(merged, skill) !== value(current, skill)) ? merged : null;
}
