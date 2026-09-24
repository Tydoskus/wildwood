import { itemDefinition } from "./items";

/**
 * Random bow skills.
 *
 * Every ranged bow may carry up to three skills. Each one independently
 * appears on a bow one time in three; a skill that appears gets a trigger
 * chance rolled in its bow tier's range. The roll belongs to the player and the
 * bow id, not to a copy: inventory stores ids, so every copy of the same bow
 * shares one roll. The server rolls once, keeps the row and never re-rolls it.
 *
 * Chances are stored and passed around as percentages (2.4 means 2.4%), which
 * is what a player reads and what a `spacetime sql` line sets. Zero means the
 * skill did not appear on that bow.
 */
export const BOW_SKILL_IDS = ["arrowStorm", "ricochet", "piercingShot"] as const;
export type BowSkillId = typeof BOW_SKILL_IDS[number];
export type BowSkillRoll = Record<BowSkillId, number>;

export const BOW_SKILL_LABELS: Record<BowSkillId, string> = {
  arrowStorm: "Arrow Storm",
  ricochet: "Ricochet",
  piercingShot: "Piercing Shot",
};

/** Chance each skill independently appears on a bow. */
export const BOW_SKILL_APPEAR_CHANCE = 1 / 3;
/** Trigger-chance range, in percent, at the first and the last bow tier. */
export const BOW_SKILL_MIN_TIER = 1;
export const BOW_SKILL_MAX_TIER = 15;
export const BOW_SKILL_TIER_ONE_RANGE = { min: 1, max: 3 } as const;
export const BOW_SKILL_TOP_TIER_RANGE = { min: 7, max: 15 } as const;

// Arrow Storm: a burst of extra arrows rains on and around what the arrow hit.
export const ARROW_STORM_ARROWS = 5;
export const ARROW_STORM_RADIUS = 90;
export const ARROW_STORM_DAMAGE_SHARE = .5;
// Ricochet: the arrow bounces on to the nearest enemies it has not hit yet.
export const RICOCHET_MAX_BOUNCES = 2;
export const RICOCHET_RADIUS = 140;
export const RICOCHET_DAMAGE_SHARE = .6;
// Piercing Shot: the arrow carries on through the enemies in its line at full
// damage. Capped so the server can bound what one arrow can reach.
export const PIERCING_SHOT_MAX_EXTRA_TARGETS = 4;

// In a duel there is only one opponent. Arrow Storm's arrows all hit them;
// Ricochet comes back off them once more at its usual share; Piercing Shot
// goes through their armor instead of through a crowd.
export const DUEL_RICOCHET_REHITS = 1;

export const NO_BOW_SKILLS: BowSkillRoll = Object.freeze({ arrowStorm: 0, ricochet: 0, piercingShot: 0 });

/** The tier a bow's skills roll at, or null for anything that is not a stat-bearing ranged bow. */
export function bowSkillTier(itemId: unknown): number | null {
  const weapon = itemDefinition(itemId)?.weapon;
  if (!weapon || weapon.mode !== "RANGED" || weapon.projectile !== "ARROW") return null;
  const tier = weapon.tier;
  return Number.isInteger(tier) && tier! >= BOW_SKILL_MIN_TIER && tier! <= BOW_SKILL_MAX_TIER ? tier! : null;
}

export function isSkillBow(itemId: unknown) {
  return bowSkillTier(itemId) !== null;
}

/**
 * The percentage range a skill's trigger chance rolls in at a tier, in tenths
 * of a percent so the ends are exact: 1-3% at tier 1, 7-15% at tier 15, and a
 * straight line between.
 */
export function bowSkillChanceRangeTenths(tier: number) {
  const step = (Math.min(BOW_SKILL_MAX_TIER, Math.max(BOW_SKILL_MIN_TIER, Math.floor(tier))) - BOW_SKILL_MIN_TIER)
    / (BOW_SKILL_MAX_TIER - BOW_SKILL_MIN_TIER);
  const at = (low: number, high: number) => Math.round((low + (high - low) * step) * 10);
  return {
    min: at(BOW_SKILL_TIER_ONE_RANGE.min, BOW_SKILL_TOP_TIER_RANGE.min),
    max: at(BOW_SKILL_TIER_ONE_RANGE.max, BOW_SKILL_TOP_TIER_RANGE.max),
  };
}

/**
 * Rolls a bow's skills. `random` returns a float in [0, 1), like ctx.random.
 * Each skill takes two draws, appearance then chance, in a fixed order, so the
 * same sequence always gives the same bow.
 */
export function rollBowSkills(itemId: unknown, random: () => number): BowSkillRoll | null {
  const tier = bowSkillTier(itemId);
  if (tier === null) return null;
  const { min, max } = bowSkillChanceRangeTenths(tier);
  const roll = { ...NO_BOW_SKILLS };
  for (const skill of BOW_SKILL_IDS) {
    const appears = random() < BOW_SKILL_APPEAR_CHANCE;
    const tenths = min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
    if (appears) roll[skill] = tenths / 10;
  }
  return roll;
}

/** A stored percentage as a chance in [0, 1]. Anything malformed is no skill. */
export function bowSkillChance(roll: Partial<BowSkillRoll> | null | undefined, skill: BowSkillId) {
  const percent = Number(roll?.[skill] ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
}

export function hasBowSkills(roll: Partial<BowSkillRoll> | null | undefined) {
  return BOW_SKILL_IDS.some(skill => bowSkillChance(roll, skill) > 0);
}

/** The lines an item window shows, in title case: "Arrow Storm 2.4%". */
export function bowSkillLines(roll: Partial<BowSkillRoll> | null | undefined): string[] {
  return BOW_SKILL_IDS.filter(skill => bowSkillChance(roll, skill) > 0)
    .map(skill => `${BOW_SKILL_LABELS[skill]} ${(Math.round(bowSkillChance(roll, skill) * 1000) / 10).toFixed(1)}%`);
}

/**
 * How many more enemies one arrow can strike, on average, than an arrow with
 * no skills. Every extra strike deals at most a full arrow's damage, so a kill
 * still takes at least as many strikes as it would from whole arrows; the
 * server's kill bound can therefore count them as extra arrows. It assumes
 * every storm arrow, bounce and pierce finds a fresh enemy, which is generous.
 */
export function bowSkillReachMultiplier(roll: Partial<BowSkillRoll> | null | undefined) {
  return 1
    + bowSkillChance(roll, "arrowStorm") * ARROW_STORM_ARROWS
    + bowSkillChance(roll, "ricochet") * RICOCHET_MAX_BOUNCES
    + bowSkillChance(roll, "piercingShot") * PIERCING_SHOT_MAX_EXTRA_TARGETS;
}

/**
 * Damage against a lone boss, relative to the arrow alone. Only Arrow Storm
 * adds any: a boss is one target, so there is nothing to bounce to or pierce.
 */
export function bowSkillBossDamageMultiplier(roll: Partial<BowSkillRoll> | null | undefined) {
  return 1 + bowSkillChance(roll, "arrowStorm") * ARROW_STORM_ARROWS * ARROW_STORM_DAMAGE_SHARE;
}

export type ArrowSkillProcs = { arrowStorm: boolean; ricochet: boolean; piercingShot: boolean };

/** Each fired arrow rolls every skill on its bow, independently. */
export function rollArrowSkillProcs(roll: Partial<BowSkillRoll> | null | undefined, random: () => number): ArrowSkillProcs {
  return {
    arrowStorm: random() < bowSkillChance(roll, "arrowStorm"),
    ricochet: random() < bowSkillChance(roll, "ricochet"),
    piercingShot: random() < bowSkillChance(roll, "piercingShot"),
  };
}
