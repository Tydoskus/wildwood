/**
 * The Soul Dimension: a dark mirror of Tutorial Forest, reached from the
 * Town's bottom road after a first prestige, whose enemies pay permanent soul
 * stats instead of run stats.
 *
 * - Soul stats never reset: prestige rebuilds player_progress and leaves them.
 *   They add to the run's own stats wherever combat reads them, challenges too.
 * - Tiers decide which soul enemies spawn. Tier N needs 5^(N+1) kills of every
 *   reward type (damage, health, armor, regen and speed enemies) from the
 *   campaign and Endless; each tier adds the next soul stat to the mix.
 * - The forest's own camps hold them, each camp one soul stat: which one
 *   depends on the player's tier and a roll fixed per camp, the same on every
 *   client.
 * - Soul enemies are each player's own, built at that player's strength when
 *   they spawn, and pay a flat reward that never grows.
 */
import { armorDamageReduction } from "./combat";
import { MIN_ATTACK_INTERVAL, TUTORIAL_FOREST_MAP_ID } from "./rules";
import { CAMPAIGN_GATEWAYS } from "./map-gateways";
import designs from "./map-designs.json";
import { TOWN_MAP_ID } from "./town";

export const SOUL_MAP_ID = "soul_dimension";
export type SoulMapId = typeof SOUL_MAP_ID;
export const isSoulMap = (mapId: unknown): mapId is SoulMapId => mapId === SOUL_MAP_ID;

const forestGateways = CAMPAIGN_GATEWAYS[TUTORIAL_FOREST_MAP_ID];
/** Where a traveller lands: where Tutorial Forest's travellers do. */
export const SOUL_ARRIVAL = Object.freeze({ ...forestGateways.arrival });
/** The way back to the Town, where the forest's portal on stands. */
export const SOUL_TOWN_PORTAL = Object.freeze({ ...forestGateways.portals[0], destination: TOWN_MAP_ID, label: "Town" });

// ---- Soul stats and tiers ----

export type SoulStatId = "damage" | "health" | "armor" | "regen" | "attackSpeed" | "critDamage";
/** Tier order: each tier adds the next of these to the soul enemies that spawn. */
export const SOUL_STAT_ORDER: readonly SoulStatId[] = ["damage", "health", "armor", "regen", "attackSpeed", "critDamage"];
export const SOUL_STAT_DETAILS: Readonly<Record<SoulStatId, { label: string; short: string; reward: number; color: string }>> = {
  damage: { label: "Damage", short: "Dmg", reward: 1, color: "#ff8a7a" },
  health: { label: "Health", short: "HP", reward: 1, color: "#7ee08a" },
  armor: { label: "Armor", short: "Armor", reward: 1, color: "#9cc3ff" },
  regen: { label: "Regen", short: "Regen", reward: .1, color: "#7fe8d8" },
  // Attacks a second, on top of the run's; the attack speed cap still holds.
  attackSpeed: { label: "Attack Speed", short: "Atk Spd", reward: .001, color: "#ffd36e" },
  // A share of a critical hit's multiplier: .002 is +0.2% critical damage.
  critDamage: { label: "Crit Damage", short: "Crit Dmg", reward: .002, color: "#e7a6ff" },
};
export const SOUL_TIER_COUNT = SOUL_STAT_ORDER.length;

/** The campaign and Endless reward types whose kills are counted (player_reward_kills has a column for each). */
export const SOUL_REWARD_KILL_TYPES = ["damage", "health", "armor", "regen", "speed"] as const;
export type RewardKillType = typeof SOUL_REWARD_KILL_TYPES[number];
export type RewardKillCounts = Record<RewardKillType, number>;
/**
 * The reward types every tier asks kills of. Not attack speed: few maps have attack speed enemies, so asking
 * for them held tiers back; these four are on every map, so farming anywhere fills them all.
 */
export const SOUL_TIER_KILL_TYPES = ["damage", "health", "armor", "regen"] as const satisfies readonly RewardKillType[];
export type SoulTierKillType = typeof SOUL_TIER_KILL_TYPES[number];
export const EMPTY_REWARD_KILLS: Readonly<RewardKillCounts> = Object.freeze({ damage: 0, health: 0, armor: 0, regen: 0, speed: 0 });

/** Kills of every reward type tier `tier` (1-based) needs: 25, 125, 625… */
export function soulTierKillsNeeded(tier: number) {
  return Math.pow(5, Math.max(1, Math.floor(tier)) + 1);
}
/** The highest tier these kills reach, 0 before the first. */
export function soulTier(kills: Partial<RewardKillCounts> | null | undefined) {
  const fewest = Math.min(...SOUL_TIER_KILL_TYPES.map(type => Math.max(0, Number(kills?.[type] ?? 0) || 0)));
  let tier = 0;
  while (tier < SOUL_TIER_COUNT && fewest >= soulTierKillsNeeded(tier + 1)) tier++;
  return tier;
}
/** The soul enemies a tier spawns, in tier order. */
export function soulStatsUnlocked(tier: number): readonly SoulStatId[] {
  return SOUL_STAT_ORDER.slice(0, Math.max(0, Math.min(SOUL_TIER_COUNT, Math.floor(tier))));
}

export type SoulStats = { damage: number; maxHp: number; armor: number; regen: number; attackSpeed: number; critDamage: number };
export const EMPTY_SOUL_STATS: Readonly<SoulStats> = Object.freeze({ damage: 0, maxHp: 0, armor: 0, regen: 0, attackSpeed: 0, critDamage: 0 });
const SOUL_STAT_FIELD: Readonly<Record<SoulStatId, keyof SoulStats>> = {
  damage: "damage", health: "maxHp", armor: "armor", regen: "regen", attackSpeed: "attackSpeed", critDamage: "critDamage",
};
export const soulStatField = (stat: SoulStatId) => SOUL_STAT_FIELD[stat];
export function soulStatValue(soul: Partial<SoulStats> | null | undefined, stat: SoulStatId) {
  const value = Number(soul?.[SOUL_STAT_FIELD[stat]] ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
/** Soul stats after `count` kills of one soul enemy. Flat: the reward never grows. */
export function addSoulKills(soul: Partial<SoulStats> | null | undefined, stat: SoulStatId, count: number): SoulStats {
  const next = { ...EMPTY_SOUL_STATS, ...cleanSoulStats(soul) };
  const field = SOUL_STAT_FIELD[stat];
  next[field] += SOUL_STAT_DETAILS[stat].reward * Math.max(0, Math.floor(count));
  return next;
}
export function cleanSoulStats(soul: Partial<SoulStats> | null | undefined): SoulStats {
  const clean = { ...EMPTY_SOUL_STATS };
  for (const key of Object.keys(clean) as (keyof SoulStats)[]) {
    const value = Number(soul?.[key] ?? 0);
    clean[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return clean;
}

/**
 * A run's base stats with the soul's added: what every combat read starts
 * from. Attack speed adds attacks a second and stops at the player's cap,
 * `minInterval`: the usual one, or the higher one Reflect Only wins earn
 * (challengeMinimumInterval). Capping at the usual one wasted soul attack
 * speed on every Reflect winner, while the profile still listed all of it.
 */
export function withSoulStats<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(
  progress: T, soul: Partial<SoulStats> | null | undefined, minInterval = MIN_ATTACK_INTERVAL,
): T {
  if (!soul) return progress;
  const clean = cleanSoulStats(soul);
  if (!clean.damage && !clean.maxHp && !clean.armor && !clean.regen && !clean.attackSpeed) return progress;
  const interval = progress.attackRate > 0 ? progress.attackRate : 1;
  const faster = clean.attackSpeed > 0 ? Math.max(minInterval, 1 / (1 / interval + clean.attackSpeed)) : interval;
  return {
    ...progress,
    damage: progress.damage + clean.damage,
    maxHp: progress.maxHp + clean.maxHp,
    armor: progress.armor + clean.armor,
    regen: progress.regen + clean.regen,
    attackRate: Math.min(interval, faster),
  };
}

/**
 * withSoulStats undone: the run's own stats back from what a player plays with, so a save never stores the
 * soul's share as the run's (it would be added again on top: every save would add the soul stats once more).
 * Attack speed at the cap cannot be undone exactly; then the run's saved interval, `savedAttackRate`, stands.
 */
export function withoutSoulStats<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(
  progress: T, soul: Partial<SoulStats> | null | undefined, savedAttackRate: number, minInterval = MIN_ATTACK_INTERVAL,
): T {
  if (!soul) return progress;
  const clean = cleanSoulStats(soul);
  if (!clean.damage && !clean.maxHp && !clean.armor && !clean.regen && !clean.attackSpeed) return progress;
  let attackRate = progress.attackRate;
  if (clean.attackSpeed > 0) {
    const slower = 1 / progress.attackRate - clean.attackSpeed;
    attackRate = progress.attackRate > minInterval + 1e-9 && slower > 0 ? 1 / slower : savedAttackRate;
  }
  return {
    ...progress,
    damage: Math.max(0, progress.damage - clean.damage),
    maxHp: Math.max(1, progress.maxHp - clean.maxHp),
    armor: Math.max(0, progress.armor - clean.armor),
    regen: Math.max(0, progress.regen - clean.regen),
    attackRate,
  };
}

// ---- Soul enemies on the wire ----

/** The enemy id a soul kill is reported as. */
export const soulEnemyId = (stat: SoulStatId) => `soul:${stat}`;
export function soulStatFromEnemyId(enemy: string): SoulStatId | null {
  if (!enemy.startsWith("soul:")) return null;
  const stat = enemy.slice(5) as SoulStatId;
  return SOUL_STAT_ORDER.includes(stat) ? stat : null;
}
/** The reward type a soul kill carries through the kill report: run stats ignore it. */
export const soulRewardType = (stat: SoulStatId) => `soul:${stat}`;
export type SoulCamp = { key: string; x: number; y: number; radius: number; count: number; roll: number };
type DesignCamp = { name: string; x: number; y: number; radius: number; count: number };
const forestDesign = (designs.maps as unknown as Record<string, { status: string; spawnCamps: DesignCamp[] }>)[TUTORIAL_FOREST_MAP_ID];
/**
 * Tutorial Forest's camps, as the Soul Dimension holds them: its live map design's, each with a roll fixed by
 * its place in the list. The stat each camp is depends on the player's tier, so that is left to `roll`.
 */
export const SOUL_CAMPS: readonly SoulCamp[] = (forestDesign?.status === "live" ? forestDesign.spawnCamps : []).map((camp, index) => Object.freeze({
  key: `forest:${index}`, x: camp.x, y: camp.y, radius: camp.radius, count: camp.count,
  // A golden-ratio step spreads the camps across the stats a tier has unlocked.
  roll: (index * .618_034 + .31) % 1,
}));
/** How many of one soul enemy a player can have standing at once: every camp, should all of them be that stat. */
export const SOUL_POPULATION = Math.max(1, SOUL_CAMPS.reduce((sum, camp) => sum + camp.count, 0));

// ---- Soul enemy strength ----

/** About how long a soul enemy lasts against the player's own weapon. */
export const SOUL_SECONDS_TO_KILL = 2.5;
export const SOUL_ENEMY_ATTACKS_PER_SECOND = .8;
/** What one soul enemy takes from a player each second, after their armor, as a share of max health. */
export const SOUL_ENEMY_HEALTH_SHARE = 1 / 60;
/** And how much of the player's regen each one cancels on top. */
export const SOUL_ENEMY_REGEN_SHARE = .5;

export type SoulStrength = { dps: number; maxHp: number; armor: number; regen: number };
/** A soul enemy built for this player as they are now: a fair fight, never a free kill. */
export function soulEnemyStats(strength: SoulStrength) {
  const finite = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;
  const dps = finite(strength.dps, 1), maxHp = finite(strength.maxHp, 100);
  const regen = finite(strength.regen, 0), armor = finite(strength.armor, 0);
  const takenPerSecond = maxHp * SOUL_ENEMY_HEALTH_SHARE + regen * SOUL_ENEMY_REGEN_SHARE;
  const perHitAfterArmor = takenPerSecond / SOUL_ENEMY_ATTACKS_PER_SECOND;
  const reduction = Math.min(.999, armorDamageReduction(armor));
  return {
    hp: Math.max(1, dps * SOUL_SECONDS_TO_KILL),
    damage: Math.max(1, perHitAfterArmor / (1 - reduction)),
    attackSpeed: SOUL_ENEMY_ATTACKS_PER_SECOND,
  };
}
/**
 * The health the kill bound assumes a soul enemy had. The server's damage
 * figure is a ceiling (it counts every hit as a critical), so half of what
 * that ceiling would build keeps the bound on the paying side.
 */
export function soulEnemyBoundHp(boundDps: number) {
  return Math.max(1, (Number.isFinite(boundDps) ? boundDps : 0) * SOUL_SECONDS_TO_KILL * .5);
}

/** Who may use the portal: the world must be open (or the player the developer) and they must have prestiged. */
export function soulDimensionAccess(options: { open: boolean; developer: boolean; prestigeLevel: number }) {
  if (!options.open && !options.developer) return "closed" as const;
  if (!(options.prestigeLevel >= 1)) return "locked" as const;
  return "open" as const;
}
