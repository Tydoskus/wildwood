import { itemDefinition } from "./items";
import { bowSkillChanceRangeTenths } from "./bow-skills";
import { chanceWithLuck } from "./luck-research";
import { SWORD_REACH } from "./campaign-equipment";

/** Each sword copy rolls these independently, just as a bow rolls its three skills. */
export const SWORD_SKILL_IDS = ["whirlwind", "deflect", "shockwave"] as const;
export type SwordSkillId = typeof SWORD_SKILL_IDS[number];
export type SwordSkillRoll = Record<SwordSkillId, number>;
export const SWORD_SKILL_LABELS: Record<SwordSkillId, string> = {
  whirlwind: "Whirlwind", deflect: "Deflect", shockwave: "Shockwave",
};
export const NO_SWORD_SKILLS: SwordSkillRoll = Object.freeze({ whirlwind: 0, deflect: 0, shockwave: 0 });
export const SWORD_SKILL_APPEAR_CHANCE = 1 / 3;

export const WHIRLWIND_RADIUS = 110;
/** Whirlwind's radius for a sword reaching `reach`: range added past the sword's own reach widens the spin as much. */
export const whirlwindRadius = (reach: number) => WHIRLWIND_RADIUS + Math.max(0, (Number.isFinite(reach) ? reach : SWORD_REACH) - SWORD_REACH);
export const WHIRLWIND_TICKS = 3;
export const WHIRLWIND_TICK_SECONDS = .2;
export const WHIRLWIND_SECONDS = WHIRLWIND_TICKS * WHIRLWIND_TICK_SECONDS;
export const WHIRLWIND_MAX_TARGETS = 6;
export const WHIRLWIND_DAMAGE_SHARE = .45;
export const SHOCKWAVE_RANGE = 260;
export const SHOCKWAVE_SPEED = 520;
export const SHOCKWAVE_RADIUS = 20;
export const SHOCKWAVE_MAX_TARGETS = 4;
export const SHOCKWAVE_DAMAGE_SHARE = .8;
export const DEFLECT_RETURN_SPEED = 600;

export function swordSkillTier(itemId: unknown): number | null {
  const weapon = itemDefinition(itemId)?.weapon;
  const tier = weapon?.tier;
  return weapon?.mode === "MELEE" && !weapon.dagger && Number.isInteger(tier) && tier! >= 1 && tier! <= 15 ? tier! : null;
}
export const isSkillSword = (itemId: unknown) => swordSkillTier(itemId) !== null;

/** Stored percentages: 2.4 means a 2.4% trigger chance. The tier ranges match bows. */
export function rollSwordSkills(itemId: unknown, random: () => number, skillLuckRank = 0): SwordSkillRoll | null {
  const tier = swordSkillTier(itemId);
  if (tier === null) return null;
  const { min, max } = bowSkillChanceRangeTenths(tier);
  const roll = { ...NO_SWORD_SKILLS };
  const appearChance = chanceWithLuck(SWORD_SKILL_APPEAR_CHANCE, "skillLuck", skillLuckRank);
  for (const skill of SWORD_SKILL_IDS) {
    const appears = random() < appearChance;
    const tenths = min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
    if (appears) roll[skill] = tenths / 10;
  }
  return roll;
}

export function swordSkillChance(roll: Partial<SwordSkillRoll> | null | undefined, skill: SwordSkillId) {
  const percent = Number(roll?.[skill] ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
}

export function swordSkillLines(roll: Partial<SwordSkillRoll> | null | undefined) {
  return SWORD_SKILL_IDS.filter(skill => swordSkillChance(roll, skill) > 0)
    .map(skill => `${SWORD_SKILL_LABELS[skill]} ${(swordSkillChance(roll, skill) * 100).toFixed(1)}%`);
}

/**
 * Generous kill bound: every spin tick or wave hit may find another enemy. Deflect is bounded separately.
 * Blade Storm's extra ticks and Cleave's extra enemies (mastery-techniques.ts) count as whole swings.
 */
export function swordSkillReachMultiplier(roll: Partial<SwordSkillRoll> | null | undefined, extraTicks = 0, cleave = 0) {
  return 1 + cleave + swordSkillChance(roll, "whirlwind") * (WHIRLWIND_TICKS + extraTicks) * WHIRLWIND_MAX_TARGETS
    + swordSkillChance(roll, "shockwave") * SHOCKWAVE_MAX_TARGETS;
}

export function swordSkillBossDamageMultiplier(roll: Partial<SwordSkillRoll> | null | undefined) {
  return 1 + swordSkillChance(roll, "whirlwind") * WHIRLWIND_TICKS * WHIRLWIND_DAMAGE_SHARE
    + swordSkillChance(roll, "shockwave") * SHOCKWAVE_DAMAGE_SHARE;
}

/** Expected extra damage: a spin finds two enemies, a wave two, and a deflection returns one hit. */
export function swordSkillScore(roll: Partial<SwordSkillRoll> | null | undefined) {
  return Math.round(100e6 * (
    swordSkillChance(roll, "whirlwind") * WHIRLWIND_TICKS * WHIRLWIND_DAMAGE_SHARE * 2
    + swordSkillChance(roll, "shockwave") * SHOCKWAVE_DAMAGE_SHARE * 2
    + swordSkillChance(roll, "deflect")
  )) / 1e6;
}
