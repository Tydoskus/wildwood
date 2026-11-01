import { itemDefinition } from "./items";
import { BOW_ATTACK_SPEED_BONUS, bowSkillChanceRangeTenths, isBow } from "./bow-skills";
import { chanceWithLuck } from "./luck-research";

// ---- Wizard staffs: every number to tune is in this block. ----
/** A staff's damage a second on one target, as a share of its tier's bow. */
export const STAFF_SINGLE_TARGET_SHARE = .75;
/** Casts take this much longer than a bow's shots. */
export const STAFF_CAST_INTERVAL_FACTOR = 1.35;
/** One bolt's hit against one arrow's, so the slower casts land at STAFF_SINGLE_TARGET_SHARE. */
export const STAFF_BOLT_DAMAGE_FACTOR = STAFF_SINGLE_TARGET_SHARE * STAFF_CAST_INTERVAL_FACTOR;
/** A bolt bursts on impact: every enemy this close to it takes the full hit. */
export const STAFF_SPLASH_RADIUS = 70;
/** The most enemies one burst can hit, the struck one included. The kill bound counts every one. */
export const STAFF_SPLASH_MAX_TARGETS = 8;
/** Bolts fly a little slower than arrows; their range stays the bow's. */
export const STAFF_BOLT_SPEED_FACTOR = .8;
// Meteor: a chance on each cast to call a big blast down on the target, after a short warning.
export const METEOR_RADIUS = 130;
export const METEOR_DAMAGE_SHARE = 2;
export const METEOR_MAX_TARGETS = 10;
export const METEOR_DELAY_SECONDS = .55;
// Chain: a chance the bolt's hit jumps on to enemies the burst missed.
export const CHAIN_MAX_JUMPS = 3;
export const CHAIN_RANGE = 150;
export const CHAIN_DAMAGE_SHARE = .6;
// Frost Nova: a chance to slow regular enemies near the impact. Bosses are not slowed.
export const FROST_NOVA_RADIUS = 110;
export const FROST_NOVA_SLOW = .4;
export const FROST_NOVA_SECONDS = 2.5;
// ---- End of the tuning block. ----

/** Each staff copy rolls these independently, just as a bow and a sword roll theirs. */
export const STAFF_SKILL_IDS = ["meteor", "chain", "frostNova"] as const;
export type StaffSkillId = typeof STAFF_SKILL_IDS[number];
export type StaffSkillRoll = Record<StaffSkillId, number>;
export const STAFF_SKILL_LABELS: Record<StaffSkillId, string> = { meteor: "Meteor", chain: "Chain", frostNova: "Frost Nova" };
export const NO_STAFF_SKILLS: StaffSkillRoll = Object.freeze({ meteor: 0, chain: 0, frostNova: 0 });
export const STAFF_SKILL_APPEAR_CHANCE = 1 / 3;

/** A staff casts bolts; the starter staff included. */
export const isStaff = (itemId: unknown) => itemDefinition(itemId)?.weapon?.projectile === "BOLT";

export function staffSkillTier(itemId: unknown): number | null {
  const weapon = itemDefinition(itemId)?.weapon;
  const tier = weapon?.tier;
  return weapon?.projectile === "BOLT" && Number.isInteger(tier) && tier! >= 1 && tier! <= 15 ? tier! : null;
}
export const isSkillStaff = (itemId: unknown) => staffSkillTier(itemId) !== null;

/** Stored percentages: 2.4 means a 2.4% trigger chance. The tier ranges match bows. */
export function rollStaffSkills(itemId: unknown, random: () => number, skillLuckRank = 0): StaffSkillRoll | null {
  const tier = staffSkillTier(itemId);
  if (tier === null) return null;
  const { min, max } = bowSkillChanceRangeTenths(tier);
  const roll = { ...NO_STAFF_SKILLS };
  const appearChance = chanceWithLuck(STAFF_SKILL_APPEAR_CHANCE, "skillLuck", skillLuckRank);
  for (const skill of STAFF_SKILL_IDS) {
    const appears = random() < appearChance;
    const tenths = min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
    if (appears) roll[skill] = tenths / 10;
  }
  return roll;
}

export function staffSkillChance(roll: Partial<StaffSkillRoll> | null | undefined, skill: StaffSkillId) {
  const percent = Number(roll?.[skill] ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
}

export function staffSkillLines(roll: Partial<StaffSkillRoll> | null | undefined) {
  return STAFF_SKILL_IDS.filter(skill => staffSkillChance(roll, skill) > 0)
    .map(skill => `${STAFF_SKILL_LABELS[skill]} ${(staffSkillChance(roll, skill) * 100).toFixed(1)}%`);
}

/** Each fired bolt rolls Chain and Frost Nova itself; Meteor rolls once per cast. */
export type BoltSkillProcs = { chain: boolean; frostNova: boolean };
export function rollBoltSkillProcs(roll: Partial<StaffSkillRoll> | null | undefined, random: () => number): BoltSkillProcs {
  return { chain: random() < staffSkillChance(roll, "chain"), frostNova: random() < staffSkillChance(roll, "frostNova") };
}

/**
 * Generous kill bound per cast: the burst can reach STAFF_SPLASH_MAX_TARGETS, every chain jump another enemy, and
 * a meteor every target in its radius, counted once per bolt's worth of its damage.
 */
export function staffSkillReachMultiplier(roll: Partial<StaffSkillRoll> | null | undefined, extraMeteorFalls = 0) {
  // Overcharge's jumps stay under a bolt's damage, so each still counts as one; Meteor Shower adds whole falls.
  return STAFF_SPLASH_MAX_TARGETS + staffSkillChance(roll, "chain") * CHAIN_MAX_JUMPS
    + staffSkillChance(roll, "meteor") * METEOR_MAX_TARGETS * Math.ceil(METEOR_DAMAGE_SHARE) * (1 + extraMeteorFalls);
}

/** Damage against a lone boss, relative to the bolt alone: only a meteor adds any. */
export function staffSkillBossDamageMultiplier(roll: Partial<StaffSkillRoll> | null | undefined) {
  return 1 + staffSkillChance(roll, "meteor") * METEOR_DAMAGE_SHARE;
}

/** Expected extra damage per bolt, in percent: a meteor finds two enemies, a chain its three jumps, a nova spares a hit. */
export function staffSkillScore(roll: Partial<StaffSkillRoll> | null | undefined) {
  return Math.round(100e6 * (
    staffSkillChance(roll, "meteor") * METEOR_DAMAGE_SHARE * 2
    + staffSkillChance(roll, "chain") * CHAIN_MAX_JUMPS * CHAIN_DAMAGE_SHARE
    + staffSkillChance(roll, "frostNova")
  )) / 1e6;
}

/** Damage a second a staff deals against what its hit and interval alone would: the slower, heavier casts. */
export const STAFF_DPS_FACTOR = STAFF_BOLT_DAMAGE_FACTOR / STAFF_CAST_INTERVAL_FACTOR;
/** A weapon's attack interval from the player's: a staff casts slower, a bow shoots faster (bow-skills.ts). */
export const weaponAttackInterval = (itemId: unknown, attackInterval: number) =>
  isStaff(itemId) ? attackInterval * STAFF_CAST_INTERVAL_FACTOR : isBow(itemId) ? attackInterval / (1 + BOW_ATTACK_SPEED_BONUS) : attackInterval;
/** A weapon's hit from the player's damage: a bolt's is STAFF_BOLT_DAMAGE_FACTOR of an arrow's. */
export const weaponHitFactor = (itemId: unknown) => isStaff(itemId) ? STAFF_BOLT_DAMAGE_FACTOR : 1;
