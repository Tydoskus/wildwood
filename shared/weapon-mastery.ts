import { weaponKind, type WeaponKind } from "./equip-best";

/**
 * Weapon Mastery: each weapon type is a school with its own level, earned by fighting with it. Prestige keeps it;
 * Reset Save clears it. Levels will unlock gear grades and school techniques.
 */
export const WEAPON_SCHOOLS = ["archery", "swordplay", "sorcery"] as const;
export type WeaponSchool = typeof WEAPON_SCHOOLS[number];

export const WEAPON_SCHOOL_NAMES: Readonly<Record<WeaponSchool, string>> = { archery: "Archery", swordplay: "Swordplay", sorcery: "Sorcery" };

const SCHOOL_BY_KIND: Readonly<Record<WeaponKind, WeaponSchool>> = { RANGED: "archery", MELEE: "swordplay", MAGIC: "sorcery" };

/** The school a weapon trains: bows and the starter stone Archery, swords Swordplay, staffs Sorcery. */
export const weaponSchool = (itemId: string | undefined): WeaponSchool => SCHOOL_BY_KIND[weaponKind(itemId)];

export const isWeaponSchool = (value: unknown): value is WeaponSchool => (WEAPON_SCHOOLS as readonly unknown[]).includes(value);

/** Points a kill gives the school of the weapon in hand; a boss's first clear in a run gives more. */
export const MASTERY_POINTS_PER_KILL = 1;
export const MASTERY_POINTS_PER_BOSS = 50;

export const MASTERY_MAX_LEVEL = 50;
/** Level 1 costs this many points; each level after costs MASTERY_LEVEL_GROWTH times the last. */
export const MASTERY_FIRST_LEVEL_POINTS = 70;
export const MASTERY_LEVEL_GROWTH = 1.178;

/** Total points to reach `level` (0 at level 0): about 1,630 for 10, 53,191 for 30 and 1.42 million for 50. */
export function masteryPointsForLevel(level: number) {
  const clamped = Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 0)));
  let total = 0;
  for (let next = 0; next < clamped; next++) total += Math.round(MASTERY_FIRST_LEVEL_POINTS * MASTERY_LEVEL_GROWTH ** next);
  return total;
}

const LEVEL_TOTALS = Array.from({ length: MASTERY_MAX_LEVEL + 1 }, (_, level) => masteryPointsForLevel(level));

/** The level `points` reach, 0 to MASTERY_MAX_LEVEL. */
export function masteryLevel(points: number | bigint) {
  const value = Math.max(0, Number(points) || 0);
  let level = 0;
  while (level < MASTERY_MAX_LEVEL && value >= LEVEL_TOTALS[level + 1]) level++;
  return level;
}

/** Where `points` stand: the level, the points into it and the points it takes (0 at the top level). */
export function masteryProgress(points: number | bigint) {
  const value = Math.max(0, Number(points) || 0), level = masteryLevel(value);
  if (level >= MASTERY_MAX_LEVEL) return { level, into: 0, needed: 0 };
  return { level, into: value - LEVEL_TOTALS[level], needed: LEVEL_TOTALS[level + 1] - LEVEL_TOTALS[level] };
}

/** The points one accepted kill report earns: every kill, plus a boss cleared for the first time this run. */
export const masteryPointsForReport = (kills: number, firstBossClear: boolean) =>
  Math.max(0, Math.floor(Number.isFinite(kills) ? kills : 0)) * MASTERY_POINTS_PER_KILL + (firstBossClear ? MASTERY_POINTS_PER_BOSS : 0);

/** Each school's Town building. */
export type SchoolBuilding = "Archery Range" | "Sword Hall" | "Mage Tower";

/** A technique: a passive that fires on its own once its school reaches `level`. None moves the player. */
export type MasteryTechnique = { id: string; level: number; name: string; text: string };

/**
 * What each school teaches: its Town building, the passive that grows a little every level, and a technique every
 * ten levels. Skill Proficiency (every school) raises the weapon's own skill chances by 1% of themselves a level.
 */
export const SCHOOL_DETAILS: Readonly<Record<WeaponSchool, {
  building: SchoolBuilding; door: number; passive: string; passivePerLevel: string; techniques: readonly MasteryTechnique[];
}>> = {
  archery: {
    building: "Archery Range", door: 2,
    passive: "Range", passivePerLevel: "+0.4 attack range a level, +10 more at level 50",
    techniques: [
      { id: "steadyAim", level: 10, name: "Steady Aim", text: "Every 6th arrow is a critical hit." },
      { id: "volley", level: 20, name: "Volley", text: "Split Shot arrows deal 15% more." },
      { id: "huntersMark", level: 30, name: "Hunter's Mark", text: "After a critical hit your target takes 8% more from your arrows for 4s." },
      { id: "tailwind", level: 40, name: "Tailwind", text: "6% move speed for 3s after a kill." },
      { id: "rainOfArrows", level: 50, name: "Rain of Arrows", text: "Arrow Storm fires one extra wave." },
    ],
  },
  swordplay: {
    building: "Sword Hall", door: 3,
    passive: "Guard", passivePerLevel: "0.2% less damage taken a level",
    techniques: [
      { id: "cleave", level: 10, name: "Cleave", text: "Each swing also hits one more enemy for 30%." },
      { id: "parry", level: 20, name: "Parry", text: "Deflect returns 20% more damage." },
      { id: "bloodlust", level: 30, name: "Bloodlust", text: "Each swing that lands heals 0.5% of max health." },
      { id: "momentum", level: 40, name: "Momentum", text: "+2% attack speed per hit in a row, up to +10%. A miss starts over." },
      { id: "bladeStorm", level: 50, name: "Blade Storm", text: "Whirlwind spins one extra tick." },
    ],
  },
  sorcery: {
    building: "Mage Tower", door: 4,
    passive: "Blast", passivePerLevel: "+0.5% bolt blast size a level",
    techniques: [
      { id: "focus", level: 10, name: "Focus", text: "Every 6th bolt is a critical hit." },
      { id: "overcharge", level: 20, name: "Overcharge", text: "Chain Lightning jumps deal 15% more." },
      { id: "hex", level: 30, name: "Hex", text: "After a critical hit your target takes 8% more from your bolts for 4s." },
      { id: "manaShield", level: 40, name: "Mana Shield", text: "Take 5% less damage while above half health." },
      { id: "meteorShower", level: 50, name: "Meteor Shower", text: "Meteor falls one extra time." },
    ],
  },
};

/** The techniques a school knows at `level`. */
export const techniquesAt = (school: WeaponSchool, level: number) => SCHOOL_DETAILS[school].techniques.filter(t => level >= t.level);

/** Each school's passive a level: Archery's attack range, Swordplay's share of damage taken away, Sorcery's bolt blast size. */
export const ARCHERY_RANGE_PER_LEVEL = 0.4;
/** Archery's extra range on reaching the top level, on top of every level's. */
export const ARCHERY_MAX_LEVEL_RANGE = 10;
export const SWORDPLAY_GUARD_PER_LEVEL = 0.002;
export const SORCERY_BLAST_PER_LEVEL = 0.005;
const PASSIVE_PER_LEVEL: Readonly<Record<WeaponSchool, number>> = {
  archery: ARCHERY_RANGE_PER_LEVEL, swordplay: SWORDPLAY_GUARD_PER_LEVEL, sorcery: SORCERY_BLAST_PER_LEVEL,
};
const clampLevel = (level: number) => Math.max(0, Math.min(MASTERY_MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 0)));
/** A school's passive at `level`: attack range for Archery, fractions (0.02 is 2%) for Swordplay and Sorcery. */
export const schoolPassiveValue = (school: WeaponSchool, level: number) => PASSIVE_PER_LEVEL[school] * clampLevel(level)
  + (school === "archery" && clampLevel(level) === MASTERY_MAX_LEVEL ? ARCHERY_MAX_LEVEL_RANGE : 0);

/** Skill Proficiency: the weapon's own skill chances, 1% of themselves more a level. */
export const SKILL_PROFICIENCY_PER_LEVEL = 0.01;
export const skillProficiency = (level: number) => SKILL_PROFICIENCY_PER_LEVEL * clampLevel(level);

/** The Mastery combat uses: the right hand's school (the one that trains), at level 0 unless that school's weapon is in use. */
export type MasteryInPlay = { school: WeaponSchool; level: number };
export type MasteryPoints = Partial<Record<WeaponSchool, bigint | number>>;
const NO_MASTERY_POINTS: MasteryPoints = Object.freeze({});
/** Mastery counts for nothing during Reflect Only or an Aggro run, which play without bonuses. */
export const masteryPointsInPlay = (points: MasteryPoints | null | undefined, challengeActive: boolean): MasteryPoints =>
  challengeActive || !points ? NO_MASTERY_POINTS : points;
export function masteryInPlay(points: MasteryPoints | null | undefined, rightHand: string | undefined, weaponInUse = rightHand): MasteryInPlay {
  const school = weaponSchool(rightHand);
  return { school, level: weaponSchool(weaponInUse) === school ? masteryLevel(points?.[school] ?? 0) : 0 };
}

/**
 * A skill roll (stored percentages) with Skill Proficiency: each chance times 1 + skillProficiency(level), and times
 * `gearFactor` (Magic armor's, armor-class-perks.ts armorSkillChanceFactor).
 */
export function rollWithProficiency<T extends object>(roll: T, level: number, gearFactor?: number): T;
export function rollWithProficiency<T extends object>(roll: T | null | undefined, level: number, gearFactor?: number): T | null | undefined;
export function rollWithProficiency<T extends object>(roll: T | null | undefined, level: number, gearFactor = 1) {
  const factor = (1 + skillProficiency(level)) * gearFactor;
  if (!roll || factor === 1) return roll;
  return Object.fromEntries(Object.entries(roll).map(([skill, percent]) => [skill, typeof percent === "number" ? percent * factor : percent])) as T;
}

/** Archery's extra attack range while a bow or the stone is in hand. */
export const masteryAttackRange = (mastery: MasteryInPlay | null | undefined) =>
  mastery?.school === "archery" ? schoolPassiveValue("archery", mastery.level) : 0;
/** The share of a hit Swordplay's Guard lets through while a sword is in hand. */
export const masteryDamageTaken = (mastery: MasteryInPlay | null | undefined) =>
  mastery?.school === "swordplay" ? 1 - schoolPassiveValue("swordplay", mastery.level) : 1;
/** Sorcery's bolt blast size, as a factor, while a staff is in hand. */
export const masteryBlastScale = (mastery: MasteryInPlay | null | undefined) =>
  mastery?.school === "sorcery" ? 1 + schoolPassiveValue("sorcery", mastery.level) : 1;

/** Duel skill fields (challengerArrowStorm, opponentMeteor ...) with each side's Skill Proficiency and Magic armor factor. */
export function duelSkillsWithProficiency<T extends Record<string, number>>(fields: T, challengerLevel: number, opponentLevel: number,
  challengerGear = 1, opponentGear = 1): T {
  const challenger = (1 + skillProficiency(challengerLevel)) * challengerGear, opponent = (1 + skillProficiency(opponentLevel)) * opponentGear;
  return Object.fromEntries(Object.entries(fields).map(([field, percent]) =>
    [field, percent * (field.startsWith("challenger") ? challenger : field.startsWith("opponent") ? opponent : 1)])) as T;
}
