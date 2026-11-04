import { itemDefinition } from "./items";
import { bowSkillChanceRangeTenths } from "./bow-skills";
import { chanceWithLuck } from "./luck-research";

// ---- Daggers: every number to tune is in this block. ----
/** A dagger strikes this much faster than the player's interval, as a bow shoots faster (bow-skills.ts). */
export const DAGGER_ATTACK_SPEED_BONUS = .2;
// Backstab: a chance a strike lands from behind, more likely to crit and harder when it does.
export const BACKSTAB_CRIT_CHANCE = .1;
export const BACKSTAB_CRIT_DAMAGE = .1;
// Poison: a chance a strike poisons its target, dealing that strike's damage again over a few seconds.
export const DAGGER_POISON_SHARE = 1;
export const DAGGER_POISON_SECONDS = 3;
// Dodge: a chance to slip an enemy's hit entirely.
/** How much each skill's chance counts in a roll's score, the number duplicates and power compare. */
export const DAGGER_SKILL_SCORE_WEIGHTS = { backstab: 1, poison: 1, dodge: 0 } as const;
// ---- End of the tuning block. ----

/** Each dagger copy rolls these independently, as a bow, a sword and a staff roll theirs. */
export const DAGGER_SKILL_IDS = ["backstab", "poison", "dodge"] as const;
export type DaggerSkillId = typeof DAGGER_SKILL_IDS[number];
export type DaggerSkillRoll = Record<DaggerSkillId, number>;
export const DAGGER_SKILL_LABELS: Record<DaggerSkillId, string> = { backstab: "Backstab", poison: "Poison", dodge: "Dodge" };
export const NO_DAGGER_SKILLS: DaggerSkillRoll = Object.freeze({ backstab: 0, poison: 0, dodge: 0 });
export const DAGGER_SKILL_APPEAR_CHANCE = 1 / 3;

export const isDagger = (itemId: unknown) => itemDefinition(itemId)?.weapon?.dagger === true;

export function daggerSkillTier(itemId: unknown): number | null {
  const weapon = itemDefinition(itemId)?.weapon;
  const tier = weapon?.tier;
  return weapon?.dagger === true && Number.isInteger(tier) && tier! >= 1 && tier! <= 15 ? tier! : null;
}
export const isSkillDagger = (itemId: unknown) => daggerSkillTier(itemId) !== null;

/** Stored percentages: 2.4 means a 2.4% chance. The tier ranges match bows. */
export function rollDaggerSkills(itemId: unknown, random: () => number, skillLuckRank = 0): DaggerSkillRoll | null {
  const tier = daggerSkillTier(itemId);
  if (tier === null) return null;
  const { min, max } = bowSkillChanceRangeTenths(tier);
  const roll = { ...NO_DAGGER_SKILLS };
  const appearChance = chanceWithLuck(DAGGER_SKILL_APPEAR_CHANCE, "skillLuck", skillLuckRank);
  for (const skill of DAGGER_SKILL_IDS) {
    const appears = random() < appearChance;
    const tenths = min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
    if (appears) roll[skill] = tenths / 10;
  }
  return roll;
}

export function daggerSkillChance(roll: Partial<DaggerSkillRoll> | null | undefined, skill: DaggerSkillId) {
  const percent = Number(roll?.[skill] ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
}

export function daggerSkillLines(roll: Partial<DaggerSkillRoll> | null | undefined) {
  return DAGGER_SKILL_IDS.filter(skill => daggerSkillChance(roll, skill) > 0)
    .map(skill => `${DAGGER_SKILL_LABELS[skill]} ${(daggerSkillChance(roll, skill) * 100).toFixed(1)}%`);
}

/** Only the dagger skills of a weapon's whole roll, every one present. */
export const daggerSkillsOf = (roll: Partial<DaggerSkillRoll> | null | undefined): DaggerSkillRoll =>
  ({ backstab: roll?.backstab ?? 0, poison: roll?.poison ?? 0, dodge: roll?.dodge ?? 0 });

export function daggerSkillScore(roll: Partial<DaggerSkillRoll> | null | undefined) {
  return Math.round(100e6 * DAGGER_SKILL_IDS.reduce((score, skill) => score + daggerSkillChance(roll, skill) * DAGGER_SKILL_SCORE_WEIGHTS[skill], 0)) / 1e6;
}

/** Damage a strike can come to against its hit alone, for the kill bound: Poison deals it again, Backstab crits harder. */
export function daggerSkillDamageMultiplier(roll: Partial<DaggerSkillRoll> | null | undefined) {
  return 1 + daggerSkillChance(roll, "poison") * DAGGER_POISON_SHARE + daggerSkillChance(roll, "backstab") * BACKSTAB_CRIT_DAMAGE;
}
