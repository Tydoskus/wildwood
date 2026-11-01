import { itemDefinition } from "./items";
import { chanceWithLuck } from "./luck-research";

export const DAGGER_SKILL_IDS = ["backstab", "poison", "dodge"] as const;
export type DaggerSkillId = typeof DAGGER_SKILL_IDS[number];
export type DaggerSkillRoll = Record<DaggerSkillId, number>;

export const DAGGER_SKILL_LABELS: Record<DaggerSkillId, string> = {
  backstab: "Backstab",
  poison: "Poison",
  dodge: "Dodge",
};

export const DAGGER_ATTACK_SPEED_BONUS = 0.20;
export const DAGGER_POISON_DURATION = 3;

export const DAGGER_SKILL_APPEAR_CHANCE = 1 / 3;
export const DAGGER_SKILL_MIN_TIER = 1;
export const DAGGER_SKILL_MAX_TIER = 15;
export const DAGGER_SKILL_TIER_ONE_RANGE = { min: 1, max: 3 } as const;
export const DAGGER_SKILL_TOP_TIER_RANGE = { min: 7, max: 15 } as const;

export const NO_DAGGER_SKILLS: DaggerSkillRoll = Object.freeze({ backstab: 0, poison: 0, dodge: 0 });

export function daggerSkillTier(itemId: unknown): number | null {
  const weapon = itemDefinition(itemId)?.weapon;
  if (!weapon || weapon.mode !== "MELEE") return null;
  const tier = weapon.tier;
  return Number.isInteger(tier) && tier! >= DAGGER_SKILL_MIN_TIER && tier! <= DAGGER_SKILL_MAX_TIER ? tier! : null;
}

export function isSkillDagger(itemId: unknown) {
  return daggerSkillTier(itemId) !== null;
}

export function daggerSkillChanceRangeTenths(tier: number) {
  const step = (Math.min(DAGGER_SKILL_MAX_TIER, Math.max(DAGGER_SKILL_MIN_TIER, Math.floor(tier))) - DAGGER_SKILL_MIN_TIER)
    / (DAGGER_SKILL_MAX_TIER - DAGGER_SKILL_MIN_TIER);
  const at = (low: number, high: number) => Math.round((low + (high - low) * step) * 10);
  return {
    min: at(DAGGER_SKILL_TIER_ONE_RANGE.min, DAGGER_SKILL_TOP_TIER_RANGE.min),
    max: at(DAGGER_SKILL_TIER_ONE_RANGE.max, DAGGER_SKILL_TOP_TIER_RANGE.max),
  };
}

export function rollDaggerSkills(itemId: unknown, random: () => number, skillLuckRank = 0): DaggerSkillRoll | null {
  const tier = daggerSkillTier(itemId);
  if (tier === null) return null;
  const { min, max } = daggerSkillChanceRangeTenths(tier);
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

export function hasDaggerSkills(roll: Partial<DaggerSkillRoll> | null | undefined) {
  return DAGGER_SKILL_IDS.some(skill => daggerSkillChance(roll, skill) > 0);
}

export function daggerSkillLines(roll: Partial<DaggerSkillRoll> | null | undefined): string[] {
  return DAGGER_SKILL_IDS.filter(skill => daggerSkillChance(roll, skill) > 0)
    .map(skill => `${DAGGER_SKILL_LABELS[skill]} ${(Math.round(daggerSkillChance(roll, skill) * 1000) / 10).toFixed(1)}%`);
}

export const BACKSTAB_SCORE_WEIGHT = 1;
export const POISON_SCORE_WEIGHT = 1;
export const DODGE_WEIGHT = 0;

export function daggerSkillScore(roll: Partial<DaggerSkillRoll> | null | undefined) {
  const score = daggerSkillChance(roll, "backstab") * 100 * BACKSTAB_SCORE_WEIGHT
    + daggerSkillChance(roll, "poison") * 100 * POISON_SCORE_WEIGHT
    + daggerSkillChance(roll, "dodge") * 100 * DODGE_WEIGHT;
  return Math.round(score * 1e6) / 1e6;
}

export function formatDaggerSkillScore(score: number) {
  const tenths = Math.round((Number.isFinite(score) ? Math.max(0, score) : 0) * 10);
  return `+${(tenths / 10).toFixed(1)}%`;
}
