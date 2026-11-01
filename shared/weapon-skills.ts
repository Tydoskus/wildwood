import { BOW_SKILL_IDS, NO_BOW_SKILLS, bowSkillLines, bowSkillScore, isSkillBow, rollBowSkills, type BowSkillRoll } from "./bow-skills";
import { NO_SWORD_SKILLS, SWORD_SKILL_IDS, isSkillSword, rollSwordSkills, swordSkillLines, swordSkillScore, type SwordSkillRoll } from "./sword-skills";
import { STAFF_SKILL_IDS, isSkillStaff, rollStaffSkills, staffSkillLines, staffSkillScore, type StaffSkillRoll } from "./staff-skills";
import { DAGGER_SKILL_IDS, daggerSkillLines, type DaggerSkillRoll, daggerSkillScore, isSkillDagger, NO_DAGGER_SKILLS, rollDaggerSkills } from "./dagger-skills"

/** Kept copies and offers carry any kind of weapon's roll. */
export type WeaponSkillRoll = Partial<BowSkillRoll & SwordSkillRoll & StaffSkillRoll & DaggerSkillRoll>;
export const isSkillWeapon = (itemId: unknown) => isSkillBow(itemId) || isSkillSword(itemId) || isSkillStaff(itemId) || isSkillDagger(itemId);
export const rollWeaponSkills = (itemId: unknown, random: () => number, skillLuckRank = 0): WeaponSkillRoll =>
  rollBowSkills(itemId, random, skillLuckRank) ?? rollSwordSkills(itemId, random, skillLuckRank)
  ?? rollDaggerSkills(itemId, random, skillLuckRank) ?? rollStaffSkills(itemId, random, skillLuckRank) ?? NO_BOW_SKILLS;
export const weaponSkillScore = (itemId: unknown, roll: WeaponSkillRoll | null | undefined) =>
  isSkillSword(itemId) ? swordSkillScore(roll) : isSkillStaff(itemId) ? staffSkillScore(roll) : isSkillBow(itemId) ? bowSkillScore(roll) : isSkillDagger(itemId) ? daggerSkillScore(roll) : 0;
export const weaponSkillLines = (itemId: unknown, roll: WeaponSkillRoll | null | undefined) =>
  isSkillSword(itemId) ? swordSkillLines(roll) : isSkillStaff(itemId) ? staffSkillLines(roll) : isSkillBow(itemId) ? bowSkillLines(roll) : isSkillDagger(itemId) ? daggerSkillLines(roll) : [];

/**
 * The stable columns on copy and offer rows; the other weapon kind stays zero. Staff rolls are not columns there:
 * they live in their own table (spacetimedb/src/staff-skills.ts), so these rows never changed shape for them.
 */
export const weaponSkillColumns = (roll: WeaponSkillRoll) => {
  const { meteor: _meteor, chain: _chain, frostNova: _frostNova, ...columns } = roll;
  return { ...NO_BOW_SKILLS, ...NO_SWORD_SKILLS, ...NO_DAGGER_SKILLS, ...columns };
};
export function weaponSkillRollOf(row: WeaponSkillRoll & { itemId: string }): WeaponSkillRoll {
  if (isSkillStaff(row.itemId)) return { meteor: row.meteor ?? 0, chain: row.chain ?? 0, frostNova: row.frostNova ?? 0 };
  return isSkillSword(row.itemId)
    ? { whirlwind: row.whirlwind ?? 0, deflect: row.deflect ?? 0, shockwave: row.shockwave ?? 0 } :
    isSkillDagger(row.itemId) ? { backstab: row.backstab ?? 0, poison: row.poison ?? 0, dodge: row.dodge ?? 0 }
      : { arrowStorm: row.arrowStorm ?? 0, ricochet: row.ricochet ?? 0, piercingShot: row.piercingShot ?? 0 };
}

/** The skills a weapon can carry, in their display order. */
export const weaponSkillIds = (itemId: unknown): readonly (keyof WeaponSkillRoll)[] =>
  isSkillSword(itemId) ? SWORD_SKILL_IDS : isSkillStaff(itemId) ? STAFF_SKILL_IDS : isSkillBow(itemId) ? BOW_SKILL_IDS : isSkillDagger(itemId) ? DAGGER_SKILL_IDS : [];

/**
 * A duplicate's roll merged into the held one: each skill keeps the higher of the two, so a skill never goes
 * down and any better skill on a drop is taken. Null when nothing would change.
 */
export function mergeSkillRolls(itemId: unknown, current: WeaponSkillRoll | null | undefined, next: WeaponSkillRoll | null | undefined): WeaponSkillRoll | null {
  const skills = weaponSkillIds(itemId);
  const value = (roll: WeaponSkillRoll | null | undefined, skill: keyof WeaponSkillRoll) => Number(roll?.[skill] ?? 0) || 0;
  const merged = Object.fromEntries(skills.map(skill => [skill, Math.max(value(current, skill), value(next, skill))])) as WeaponSkillRoll;
  return skills.some(skill => value(merged, skill) !== value(current, skill)) ? merged : null;
}
