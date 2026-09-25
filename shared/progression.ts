import { armorDamageReduction } from "./combat";

/** Fixed authoring references, never adjusted to the player in the encounter. */
export const MAP_STAT_GROWTH = 3;
export const MAP_TARGET_SECONDS = 52 * 60;
export const BOSS_TARGET_SECONDS = 90;
// Calibrated to the playtested Desert's efficient farming time and 3x growth. Changing the pacing target
// changes real payouts, not only a diagnostic line in the lab.
export const REGULAR_REWARD_CYCLE_SCALE = .6 * (52 * 60 / MAP_TARGET_SECONDS) * ((MAP_STAT_GROWTH - 1) / 2);
// Desert, Snowlands, Lava, Infernal, Water, Samurai, Cloudspire, Moonfen,
// Crystal Hollows, Clockwork Ruins, Duskfall Orchard, Neon Bastion, Verdant Catacombs, Ion Citadel. Match Desert's farming
// time with authored camp density; CAMPAIGN_REWARD_PACING below applies the current duration target.
// Snowlands gets a modest catch-up bonus, still below Lava's per-role payouts.
// Indexed by desert-relative tier: 0 Desert, 1 Snowlands, 2 Lava, and so on.
// Tiers 2 to 6 carry what the live balance panel was multiplying on top of
// them, so the panel now reads 1 everywhere and these are the only numbers.
export const CAMPAIGN_ENEMY_REWARD_MULTIPLIERS: readonly number[] = [1.0, 1.25, 3.0, 1.95, 1.1985, 0.972, 0.831, 0.417, 0.362, 0.332, 0.301, 0.275, 0.253, 0.232];
/**
 * Indexed by campaign map: 1 Desert, 2 Snowlands, ... 12 Neon Bastion. Desert's
 * fights are deliberately short, and the rest are the panel's own health
 * multipliers folded in, so a fresh configuration starts at 1.
 */
export const CAMPAIGN_ENEMY_HEALTH_SCALE: readonly number[] = [
  1, .1, .26, 1, 1, 1, .5, 1, 1, 1, 1, 1, .7, 1, 1,
];
export function campaignEnemyHealthScale(mapIndex: number) {
  return CAMPAIGN_ENEMY_HEALTH_SCALE[mapIndex] ?? 1;
}
/** The first boss anyone meets, fought without a built stat line behind it. */
export const TUTORIAL_BOSS_HEALTH_SCALE = 2;
// Calibrated with flat equipment and balanced research for about 128 active
// solo hours through Ion. Forest/Desert remain unchanged; later maps carry the
// extra time. These affect regular AND boss payouts, preventing a boss-farm bypass.
export const CAMPAIGN_REWARD_PACING: readonly number[] = [1, 0.77, 0.72512, 0.49685, 0.52062, 0.48213, 0.46865, 0.50464, 0.48081, 0.46749, 0.45866, 0.43642, 0.4238, 0.43495];
export function campaignRewardPacing(mapIndex: number) {
  return CAMPAIGN_REWARD_PACING[mapIndex] ?? 1;
}
// Ease the first full campaign tier after the specially shortened Desert fights.
export const SNOWLANDS_TUNING = { enemyHealth: .65, enemyDamage: .85, bossHealth: .75, bossDamage: .85 } as const;
export function campaignEnemyRewardMultiplier(mapIndex: number) {
  return (CAMPAIGN_ENEMY_REWARD_MULTIPLIERS[mapIndex] ?? 1.16) * campaignRewardPacing(mapIndex);
}
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
  Bramble: { hp: 42, damage: 14, reward: { type: "health", amount: 7 } },
  Needle: { hp: 90, damage: 24, reward: { type: "speed", amount: .05 } },
  Mossback: { hp: 180, damage: 29, reward: { type: "armor", amount: 1 } },
  Spitter: { hp: 24, damage: 20, reward: { type: "damage", amount: 1 } },
  Brood: { hp: 220, damage: 56, reward: { type: "regen", amount: 1 } },
  Cindermaw: { hp: 360, damage: 86, reward: { type: "damage", amount: 3 } },
  "King Slime": { hp: 500, damage: 143, reward: { type: "health", amount: 15 } },
  "Dread Warden": { hp: 500, damage: 275, reward: { type: "damage", amount: 7 } },
};

export const CURRENT_ROLE_LANES = {
  raider: "Cindermaw", archer: "Bramble", guardian: "Mossback",
  reaper: "Dread Warden", oracle: "Brood",
} as const satisfies Record<string, ForestProgressionLane>;

// A Desert entrant after the tutorial. Growth changes the size of the numbers;
// encounter seconds and percentage rewards determine the experience.
export const DESERT_REFERENCE = { damage: 2400, maxHp: 4000, armor: 275, regen: 60, attackInterval: 1 / 2.6 };
export const ENCOUNTER_PROFILES: Record<ForestProgressionLane, { seconds: number; hitShare: number; rewardShare: number; stat: RewardStat }> = {
  Bramble: { seconds: 7, hitShare: .06, rewardShare: .0075, stat: "health" },
  Needle: { seconds: 6, hitShare: .06, rewardShare: .02, stat: "speed" },
  Mossback: { seconds: 10, hitShare: .07, rewardShare: 2 / 165, stat: "armor" },
  Spitter: { seconds: 4, hitShare: .12, rewardShare: .025, stat: "damage" },
  Brood: { seconds: 9, hitShare: .08, rewardShare: .09, stat: "regen" },
  // Eight seconds put regular damage sites at 2.25x worse reward per point of
  // health than the elite beside them, so they were never worth clearing.
  Cindermaw: { seconds: 5, hitShare: .08, rewardShare: .05 / 12, stat: "damage" },
  "King Slime": { seconds: 14, hitShare: .11, rewardShare: .015, stat: "health" },
  "Dread Warden": { seconds: 13, hitShare: .12, rewardShare: 11 / 720, stat: "damage" },
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
/** Existing health and armor rewards tripled, regeneration doubled.
 * Includes the earlier regular-enemy health (2x) and armor (3x) boosts. */
export const REGULAR_REWARD_STAT_SCALE: Partial<Record<RewardStat, number>> = { armor: 9, health: 6, regen: 2 };
export function regularRewardStatScale(stat: RewardStat) {
  return REGULAR_REWARD_STAT_SCALE[stat] ?? 1;
}

export function laneRewardValue(lane: ForestProgressionLane, mapIndex: number) {
  const base = FOREST_LANE_BASES[lane].reward;
  return { ...base, amount: base.amount * (base.type === "speed" ? 1 : rewardMultiplierForMaps(mapIndex)) * regularRewardStatScale(base.type) };
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
  return { type: profile.stat, amount: base * profile.rewardShare * REGULAR_REWARD_CYCLE_SCALE * density * campaignEnemyRewardMultiplier(mapIndex) * regularRewardStatScale(profile.stat) };
}
export const DESERT_LANE_BASES = Object.fromEntries(Object.keys(ENCOUNTER_PROFILES).map(key => {
  const lane = key as ForestProgressionLane;
  return [lane, { ...desertLaneCombatValue(lane, 0), reward: desertLaneRewardValue(lane, 0) }];
})) as Record<ForestProgressionLane, ForestLaneBase>;

export const BOSS_BASE_MAX_HP = 35_000;
export const BOSS_BASE_HEAVY_HIT = 480;
export const DRAGON_REWARD_DAMAGE = 20;
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
  damage: { amount: 50, unlockMapIndex: 0 }, health: { amount: 1500, unlockMapIndex: 0 },
  speed: { amount: 0, unlockMapIndex: 0 }, armor: { amount: 28.125, unlockMapIndex: 1 },
  regen: { amount: 15, unlockMapIndex: 2 },
};
export function bossRewardValue(stat: RewardStat, mapIndex: number) {
  const base = BOSS_REWARD_TRACK_BASES[stat];
  return mapIndex < base.unlockMapIndex ? 0 : base.amount * rewardMultiplierForMaps(mapIndex) * campaignRewardPacing(mapIndex);
}
