import { armorDamageReduction } from "./combat";

/** Fixed authoring references, never adjusted to the player in the encounter. */
export const MAP_STAT_GROWTH = 3;
export const MAP_TARGET_SECONDS = 25 * 60;
export const BOSS_TARGET_SECONDS = 90;
// Calibrated at 25 active minutes and 3x growth. Changing the pacing target
// changes real payouts, not only a diagnostic line in the lab.
export const REGULAR_REWARD_CYCLE_SCALE = .6 * (25 * 60 / MAP_TARGET_SECONDS) * ((MAP_STAT_GROWTH - 1) / 2);
export type DamageCampRoster = { raider: number; reaper: number };
export function damageCampRosterForMap(mapIndex: number): DamageCampRoster {
  return { raider: 6, reaper: mapIndex < 2 ? 1 : 7 };
}
export type RewardStat = "damage" | "health" | "speed" | "armor" | "regen";
export type ForestProgressionLane = "Bramble" | "Needle" | "Mossback" | "Spitter" | "Brood" | "Cindermaw" | "King Slime" | "Dread Warden";
export type ForestLaneBase = { hp: number; damage: number; reward: { type: RewardStat; amount: number } };

// Preserve the tutorial's cheap fragile attackers, useful defensive camps,
// and larger elite breakthroughs. Forest has no dependency on campaign roots.
export const FOREST_LANE_BASES: Record<ForestProgressionLane, ForestLaneBase> = {
  Bramble: { hp: 42, damage: 14, reward: { type: "health", amount: 27 } },
  Needle: { hp: 90, damage: 24, reward: { type: "speed", amount: .05 } },
  Mossback: { hp: 180, damage: 29, reward: { type: "armor", amount: 5 } },
  Spitter: { hp: 24, damage: 48, reward: { type: "damage", amount: 1 } },
  Brood: { hp: 220, damage: 56, reward: { type: "regen", amount: 1.7 } },
  Cindermaw: { hp: 360, damage: 86, reward: { type: "damage", amount: 9 } },
  "King Slime": { hp: 500, damage: 143, reward: { type: "health", amount: 50 } },
  "Dread Warden": { hp: 500, damage: 275, reward: { type: "damage", amount: 27 } },
};

export const CURRENT_ROLE_LANES = {
  raider: "Cindermaw", archer: "Bramble", guardian: "Mossback",
  reaper: "Dread Warden", oracle: "Brood",
} as const satisfies Record<string, ForestProgressionLane>;

// A Desert entrant after the tutorial. Growth changes the size of the numbers;
// encounter seconds and percentage rewards determine the experience.
export const DESERT_REFERENCE = { damage: 400, maxHp: 4000, armor: 75, regen: 60, attackInterval: 1 };
export const ENCOUNTER_PROFILES: Record<ForestProgressionLane, { seconds: number; hitShare: number; rewardShare: number; stat: RewardStat }> = {
  Bramble: { seconds: 7, hitShare: .06, rewardShare: .075, stat: "health" },
  Needle: { seconds: 6, hitShare: .06, rewardShare: .02, stat: "speed" },
  Mossback: { seconds: 10, hitShare: .07, rewardShare: .08, stat: "armor" },
  Spitter: { seconds: 4, hitShare: .12, rewardShare: .025, stat: "damage" },
  Brood: { seconds: 9, hitShare: .08, rewardShare: .09, stat: "regen" },
  Cindermaw: { seconds: 8, hitShare: .08, rewardShare: .05, stat: "damage" },
  "King Slime": { seconds: 14, hitShare: .11, rewardShare: .15, stat: "health" },
  "Dread Warden": { seconds: 13, hitShare: .12, rewardShare: .085, stat: "damage" },
};
function tier(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 60) throw new RangeError("Map index must be an integer from 0 to 60");
  return index;
}
export function referenceBuildForMap(mapIndex: number) {
  const scale = MAP_STAT_GROWTH ** tier(mapIndex);
  return { damage: DESERT_REFERENCE.damage * scale, maxHp: DESERT_REFERENCE.maxHp * scale,
    armor: DESERT_REFERENCE.armor * scale, regen: DESERT_REFERENCE.regen * scale,
    attackInterval: DESERT_REFERENCE.attackInterval };
}
export function combatMultiplierForMap(mapIndex: number) { return MAP_STAT_GROWTH ** tier(mapIndex); }
export function rewardMultiplierForMaps(mapCount: number) { return combatMultiplierForMap(mapCount); }
export function laneCombatValue(lane: ForestProgressionLane, mapIndex: number) {
  const base = FOREST_LANE_BASES[lane];
  const scale = combatMultiplierForMap(mapIndex);
  return { hp: base.hp * scale, damage: base.damage * scale };
}
export function laneRewardValue(lane: ForestProgressionLane, mapIndex: number) {
  const base = FOREST_LANE_BASES[lane].reward;
  return { ...base, amount: base.amount * (base.type === "speed" ? 1 : rewardMultiplierForMaps(mapIndex)) };
}
export function desertLaneCombatValue(lane: ForestProgressionLane, mapIndex: number) {
  const build = referenceBuildForMap(mapIndex);
  const profile = ENCOUNTER_PROFILES[lane];
  return { hp: build.damage / build.attackInterval * profile.seconds,
    damage: build.maxHp * profile.hitShare / (1 - armorDamageReduction(build.armor)) };
}
export function desertLaneRewardValue(lane: ForestProgressionLane, mapIndex: number, roster = damageCampRosterForMap(mapIndex)) {
  const build = referenceBuildForMap(mapIndex);
  const profile = ENCOUNTER_PROFILES[lane];
  const base = profile.stat === "health" ? build.maxHp : profile.stat === "speed" ? 1 : build[profile.stat];
  // Early maps have six raiders and one reaper; later maps have six and
  // seven. Keep the damage budget per clear stable when adding elite sites.
  const damageBudget = 6 * ENCOUNTER_PROFILES.Cindermaw.rewardShare + ENCOUNTER_PROFILES["Dread Warden"].rewardShare;
  if (![roster.raider, roster.reaper].every(value => Number.isInteger(value) && value >= 0) || roster.raider + roster.reaper === 0) {
    throw new RangeError("A damage roster needs nonnegative counts and at least one source");
  }
  const damageSitesBudget = roster.raider * ENCOUNTER_PROFILES.Cindermaw.rewardShare + roster.reaper * ENCOUNTER_PROFILES["Dread Warden"].rewardShare;
  const density = profile.stat === "damage" ? damageBudget / damageSitesBudget : 1;
  return { type: profile.stat, amount: base * profile.rewardShare * REGULAR_REWARD_CYCLE_SCALE * density };
}
export const DESERT_LANE_BASES = Object.fromEntries(Object.keys(ENCOUNTER_PROFILES).map(key => {
  const lane = key as ForestProgressionLane;
  return [lane, { ...desertLaneCombatValue(lane, 0), reward: desertLaneRewardValue(lane, 0) }];
})) as Record<ForestProgressionLane, ForestLaneBase>;

export const BOSS_BASE_MAX_HP = 35_000;
export const BOSS_BASE_HEAVY_HIT = 240;
export const DRAGON_REWARD_DAMAGE = 80;
export function desertBossHealthAt(mapIndex: number) {
  const build = referenceBuildForMap(mapIndex);
  // A boss tests the build earned during the map; its reward is a smaller
  // capstone, not the stat injection needed to make regular enemies obsolete.
  return build.damage / build.attackInterval * MAP_STAT_GROWTH * BOSS_TARGET_SECONDS;
}
export function bossHeavyHitAt(mapIndex: number) {
  const build = referenceBuildForMap(mapIndex);
  return build.maxHp * MAP_STAT_GROWTH * .25 /
    (1 - armorDamageReduction(build.armor * MAP_STAT_GROWTH));
}
export const DESERT_BOSS_BASE_MAX_HP = desertBossHealthAt(0);
export const DESERT_BOSS_BASE_HEAVY_HIT = bossHeavyHitAt(0);
export const BOSS_REWARD_TRACK_BASES: Record<RewardStat, { amount: number; unlockMapIndex: number }> = {
  damage: { amount: 50, unlockMapIndex: 0 }, health: { amount: 500, unlockMapIndex: 0 },
  speed: { amount: 0, unlockMapIndex: 0 }, armor: { amount: 9.375, unlockMapIndex: 1 },
  regen: { amount: 7.5, unlockMapIndex: 2 },
};
export function bossRewardValue(stat: RewardStat, mapIndex: number) {
  const base = BOSS_REWARD_TRACK_BASES[stat];
  return mapIndex < base.unlockMapIndex ? 0 : base.amount * rewardMultiplierForMaps(mapIndex);
}
