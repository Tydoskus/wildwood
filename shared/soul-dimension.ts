/**
 * The Soul Dimension: one shared open world, reached from home after a first
 * prestige, whose enemies pay permanent soul stats instead of run stats.
 *
 * - Soul stats never reset: prestige rebuilds player_progress and leaves them.
 *   They add to the run's own stats wherever combat reads them, challenges too.
 * - Tiers decide which soul enemies spawn. Tier N needs 5^(N+1) kills of every
 *   reward type (damage, health, armor, regen and speed enemies) from the
 *   campaign and Endless; each tier adds the next soul stat to the mix.
 * - The world is too big to lay out: it is cut into chunks, and each chunk's
 *   camps and props come from its coordinates alone, so every client builds
 *   the same world around wherever it stands.
 * - Soul enemies are each player's own, built at that player's strength when
 *   they spawn, and pay a flat reward that never grows.
 */
import { armorDamageReduction } from "./combat";
import { MIN_ATTACK_INTERVAL } from "./rules";

export const SOUL_MAP_ID = "soul_dimension";
export type SoulMapId = typeof SOUL_MAP_ID;
export const isSoulMap = (mapId: unknown): mapId is SoulMapId => mapId === SOUL_MAP_ID;

/** Wide enough that nobody walks across it: over an hour edge to edge. */
export const SOUL_WORLD_SIZE = 1_000_000;
export const SOUL_CENTER = Object.freeze({ x: SOUL_WORLD_SIZE / 2, y: SOUL_WORLD_SIZE / 2 });
/** Where a traveller lands: the village square, east of the fountain. */
export const SOUL_ARRIVAL = Object.freeze({ x: SOUL_CENTER.x + 120, y: SOUL_CENTER.y + 110 });
/**
 * The village's own ground (ForestVillage's demo village, centred on its
 * fountain): no camps and no wild props inside it. Offsets from the centre.
 */
export const SOUL_VILLAGE_BOUNDS = Object.freeze({ left: -2_560, right: 2_120, top: -1_420, bottom: 2_030 });
/** The portal home, on the square's open cobbles west of the fountain, off the road south. */
export const SOUL_HOME_GATE = Object.freeze({ x: SOUL_CENTER.x - 150, y: SOUL_CENTER.y + 115 });

// ---- Soul stats and tiers ----

export type SoulStatId = "damage" | "health" | "armor" | "regen" | "attackSpeed" | "critDamage";
/** Tier order: each tier adds the next of these to the soul enemies that spawn. */
export const SOUL_STAT_ORDER: readonly SoulStatId[] = ["damage", "health", "armor", "regen", "attackSpeed", "critDamage"];
export const SOUL_STAT_DETAILS: Readonly<Record<SoulStatId, { label: string; short: string; reward: number; color: string }>> = {
  damage: { label: "Damage", short: "Dmg", reward: .1, color: "#ff8a7a" },
  health: { label: "Health", short: "HP", reward: 1, color: "#7ee08a" },
  armor: { label: "Armor", short: "Armor", reward: 1, color: "#9cc3ff" },
  regen: { label: "Regen", short: "Regen", reward: .1, color: "#7fe8d8" },
  // Attacks a second, on top of the run's; the attack speed cap still holds.
  attackSpeed: { label: "Attack Speed", short: "Atk Spd", reward: .001, color: "#ffd36e" },
  // A share of a critical hit's multiplier: .002 is +0.2% critical damage.
  critDamage: { label: "Crit Damage", short: "Crit Dmg", reward: .002, color: "#e7a6ff" },
};
export const SOUL_TIER_COUNT = SOUL_STAT_ORDER.length;

/** The campaign and Endless reward types every tier asks kills of. */
export const SOUL_TIER_KILL_TYPES = ["damage", "health", "armor", "regen", "speed"] as const;
export type SoulTierKillType = typeof SOUL_TIER_KILL_TYPES[number];
export type RewardKillCounts = Record<SoulTierKillType, number>;
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
 * from. Attack speed adds attacks a second and stops at the usual cap, but
 * never slows an interval a challenge already set below it.
 */
export function withSoulStats<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(
  progress: T, soul: Partial<SoulStats> | null | undefined,
): T {
  if (!soul) return progress;
  const clean = cleanSoulStats(soul);
  if (!clean.damage && !clean.maxHp && !clean.armor && !clean.regen && !clean.attackSpeed) return progress;
  const interval = progress.attackRate > 0 ? progress.attackRate : 1;
  const faster = clean.attackSpeed > 0 ? Math.max(MIN_ATTACK_INTERVAL, 1 / (1 / interval + clean.attackSpeed)) : interval;
  return {
    ...progress,
    damage: progress.damage + clean.damage,
    maxHp: progress.maxHp + clean.maxHp,
    armor: progress.armor + clean.armor,
    regen: progress.regen + clean.regen,
    attackRate: Math.min(interval, faster),
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
/** How many of one soul enemy a player can have standing near them at once. */
export const SOUL_POPULATION = 30;

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

// ---- The world, chunk by chunk ----

export const SOUL_CHUNK_SIZE = 1_600;
/** Chunks loaded around the player each way: a 5×5 window, 8,000 units across. */
export const SOUL_CHUNK_RADIUS = 2;
const SOUL_WORLD_SEED = 0x50f1d1;

export function soulRandom(...parts: number[]) {
  let h = SOUL_WORLD_SEED >>> 0;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x9e3779b1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  let state = h || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const soulChunkOf = (value: number) => Math.floor(value / SOUL_CHUNK_SIZE);
const SOUL_CHUNK_LIMIT = Math.ceil(SOUL_WORLD_SIZE / SOUL_CHUNK_SIZE) - 1;
export const soulChunkInWorld = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx <= SOUL_CHUNK_LIMIT && cy <= SOUL_CHUNK_LIMIT;
export const inSoulVillage = (x: number, y: number, margin = 0) =>
  x > SOUL_CENTER.x + SOUL_VILLAGE_BOUNDS.left - margin && x < SOUL_CENTER.x + SOUL_VILLAGE_BOUNDS.right + margin
  && y > SOUL_CENTER.y + SOUL_VILLAGE_BOUNDS.top - margin && y < SOUL_CENTER.y + SOUL_VILLAGE_BOUNDS.bottom + margin;

export type SoulCamp = {
  /** Stable across clients: chunk and index. */
  key: string;
  x: number;
  y: number;
  radius: number;
  count: number;
  /** Which unlocked soul stat the camp is: unlocked[floor(roll × unlocked.length)]. */
  roll: number;
};
/** A chunk's camps. The stat each one is depends on the player's tier, so that is left to `roll`. */
export function soulChunkCamps(cx: number, cy: number): SoulCamp[] {
  if (!soulChunkInWorld(cx, cy)) return [];
  const random = soulRandom(cx, cy, 1);
  const roll = random();
  const count = roll < .2 ? 0 : roll < .72 ? 1 : 2;
  const camps: SoulCamp[] = [];
  for (let index = 0; index < count; index++) {
    const x = cx * SOUL_CHUNK_SIZE + 260 + random() * (SOUL_CHUNK_SIZE - 520);
    const y = cy * SOUL_CHUNK_SIZE + 260 + random() * (SOUL_CHUNK_SIZE - 520);
    const size = 3 + Math.floor(random() * 3);
    const statRoll = random();
    if (inSoulVillage(x, y, 420)) continue;
    if (camps.some(camp => Math.hypot(camp.x - x, camp.y - y) < 520)) continue;
    camps.push({ key: `${cx}:${cy}:${index}`, x: Math.round(x), y: Math.round(y), radius: 150, count: size, roll: statRoll });
  }
  return camps;
}

export type SoulPropKind = "tree" | "smallTree" | "birch" | "bush" | "grass" | "flower" | "mushroom" | "stone" | "stoneSmall" | "log" | "stump";
export type SoulProp = { kind: SoulPropKind; x: number; y: number; s: number; flip: boolean; variant: number };
/** ForestVillage's own countryside: mostly grass, trees in loose groves, the odd stone, log and mushroom ring. */
const WILD_PROPS: readonly [SoulPropKind, number][] = [
  ["grass", 26], ["tree", 9], ["bush", 7], ["flower", 5], ["smallTree", 4], ["mushroom", 3], ["stoneSmall", 3], ["birch", 2],
  ["stone", 1.5], ["stump", 1], ["log", .8],
];
const WILD_WEIGHT = WILD_PROPS.reduce((sum, [, weight]) => sum + weight, 0);
/** A chunk's scattered props, clear of its camps and of the village. */
export function soulChunkProps(cx: number, cy: number): SoulProp[] {
  if (!soulChunkInWorld(cx, cy)) return [];
  const random = soulRandom(cx, cy, 2);
  const camps = soulChunkCamps(cx, cy);
  const props: SoulProp[] = [];
  const total = 40 + Math.floor(random() * 20);
  for (let index = 0; index < total; index++) {
    const x = cx * SOUL_CHUNK_SIZE + random() * SOUL_CHUNK_SIZE;
    const y = cy * SOUL_CHUNK_SIZE + random() * SOUL_CHUNK_SIZE;
    let pick = random() * WILD_WEIGHT, kind: SoulPropKind = "grass";
    for (const [candidate, weight] of WILD_PROPS) { if ((pick -= weight) <= 0) { kind = candidate; break; } }
    const s = .9 + random() * .2;
    const flip = random() < .5;
    const variant = Math.floor(random() * 1_000);
    if (inSoulVillage(x, y, 60)) continue;
    if (kind !== "grass" && camps.some(camp => Math.hypot(camp.x - x, camp.y - y) < camp.radius + 110)) continue;
    props.push({ kind, x: Math.round(x), y: Math.round(y), s, flip, variant });
  }
  return props;
}
/** Every chunk in the window around a point, nearest ring first. */
export function soulWindowChunks(x: number, y: number, radius = SOUL_CHUNK_RADIUS) {
  const ccx = soulChunkOf(x), ccy = soulChunkOf(y);
  const chunks: { cx: number; cy: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (soulChunkInWorld(ccx + dx, ccy + dy)) chunks.push({ cx: ccx + dx, cy: ccy + dy });
  }
  return chunks.sort((a, b) => Math.max(Math.abs(a.cx - ccx), Math.abs(a.cy - ccy)) - Math.max(Math.abs(b.cx - ccx), Math.abs(b.cy - ccy)));
}

/** Who may use the portal: the world must be open (or the player the developer) and they must have prestiged. */
export function soulDimensionAccess(options: { open: boolean; developer: boolean; prestigeLevel: number }) {
  if (!options.open && !options.developer) return "closed" as const;
  if (!(options.prestigeLevel >= 1)) return "locked" as const;
  return "open" as const;
}
