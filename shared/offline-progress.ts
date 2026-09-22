import { armorDamageReduction, damageAfterArmor } from "./combat";
import { enemyDefeatDefinition } from "./enemy-defeats";
import { ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import type { MapBalanceSnapshot } from "./map-balance-types";
import { generateMap, generatedEnemyStats, isProceduralMap, proceduralMapId } from "./procedural-maps";
import { MAP_IDS, MIN_ATTACK_INTERVAL, REGULAR_ENEMY_RESPAWN_SECONDS } from "./rules";
import { CAMPAIGN_UNLOCK_FIELDS, type CampaignAccess } from "./equipment-access";
import type { PlayerPowerStats } from "./player-power";

/** The most farming one absence is worth, however long the player was gone. */
export const OFFLINE_WINDOW_SECONDS = 30 * 60;
/**
 * Below this there is nothing to report: a reconnect, a tab reload, or a
 * dropped socket should not open a summary for four seconds of loot.
 */
export const OFFLINE_MINIMUM_SECONDS = 60;
/** Walking to the next live enemy. Farming is not a queue of touching mobs. */
export const OFFLINE_APPROACH_SECONDS = 2.5;
/**
 * The share of a camp's swings that actually land on a player who is playing
 * properly: kiting at bow range, pulling one target at a time, stepping out of
 * a wind-up. Multiplying raw camp damage by a number this small is the whole
 * difference between a survivability check and a death sentence.
 *
 * It is calibrated, not guessed. The reference build for a map is what the
 * curve expects a player to be carrying when they farm it, so that build has
 * to clear the check on its own map with room to spare; at .25 it does, by
 * about a third, while the build one tier below it does not. See the
 * simulate-offline-farming tests, which pin both ends.
 */
export const OFFLINE_INCOMING_PRESSURE = .25;
/**
 * Endless lanes carry health, damage and rewards but no authored attack speed.
 * One swing a second is the campaign median and the harsher assumption, so it
 * is what survivability is judged against.
 */
export const OFFLINE_DEFAULT_ATTACKS_PER_SECOND = 1;
/**
 * How many rungs the fallback will walk before giving up on the ladder.
 *
 * This runs inside world entry, and each generated rung costs a map
 * generation, so an account sitting on Endless 300 must not turn a login into
 * three hundred of them. Nobody unlocks more than a few rungs past what they
 * can hold, so eight candidates covers every honest account; the campaign
 * floor is appended separately so the search always has somewhere to land.
 */
export const OFFLINE_MAP_SEARCH_LIMIT = 8;

export type OfflineEnemy = {
  /** The species key for campaign maps, or the reward lane for endless ones. */
  enemy: string;
  hp: number;
  damage: number;
  attacksPerSecond: number;
  population: number;
  reward: { type: string; amount: number };
};

export type OfflineReward = { type: string; amount: number; count: number };

export type OfflineFarmOutcome = {
  mapId: string;
  survivable: boolean;
  /** Seconds of this map the player can take before dying; Infinity if never. */
  secondsToDie: number;
  killsPerSecond: number;
  kills: number;
  rewards: OfflineReward[];
};

/**
 * Every regular enemy a map can hold, collapsed to one row per reward lane.
 *
 * Offline farming never touches a boss: bosses are server-owned encounters
 * with their own budgets, and granting one away from the keyboard would hand
 * out map unlocks nobody fought for.
 */
export function offlineEnemyRoster(mapId: string, balance?: MapBalanceSnapshot): OfflineEnemy[] {
  if (isProceduralMap(mapId)) {
    const map = generateMap(mapId);
    const byLane = new Map<string, OfflineEnemy>();
    for (const camp of map.camps) {
      for (let site = 0; site < camp.count; site += 1) {
        // Mirrors the reward lane that enemyDefeatDefinition resolves per site.
        const lane = camp.stat === "damage" && site >= 6 ? "Dread Warden" : camp.lane;
        const stats = balance?.lanes[lane] ?? generatedEnemyStats(map, lane);
        const existing = byLane.get(lane);
        if (existing) { existing.population += 1; continue; }
        byLane.set(lane, {
          enemy: lane,
          hp: stats.hp,
          damage: stats.damage,
          attacksPerSecond: OFFLINE_DEFAULT_ATTACKS_PER_SECOND,
          population: 1,
          reward: { ...stats.reward },
        });
      }
    }
    return [...byLane.values()];
  }
  const roster: OfflineEnemy[] = [];
  for (const enemy of Object.keys(ENEMY_TYPES)) {
    const definition = enemyDefeatDefinition(mapId, enemy, balance);
    if (!definition || !definition.population) continue;
    const authored = balance?.enemies[enemy] ?? ENEMY_TYPES[enemy as EnemyKind];
    roster.push({
      enemy,
      hp: definition.hp,
      damage: authored.damage,
      attacksPerSecond: authored.attackSpeed,
      population: definition.population,
      reward: { ...definition.reward },
    });
  }
  return roster;
}

/** Largest-remainder split, so the reported kills add up to the total exactly. */
function distributeKills(roster: readonly OfflineEnemy[], kills: number, totalPopulation: number) {
  const exact = roster.map((entry) => kills * entry.population / totalPopulation);
  const counts = exact.map((value) => Math.floor(value));
  let remaining = kills - counts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    counts[index] += 1;
    remaining -= 1;
  }
  return counts;
}

/**
 * What one map yields over an unattended window, and whether the player would
 * still be standing at the end of it.
 *
 * The throughput is closed-form rather than stepped: kills are bounded from
 * above by how fast the player's damage clears an average enemy, and from
 * above again by how fast the map can put enemies back. Whichever bound is
 * lower is the real rate. Survival is the same shape — incoming damage while
 * in contact, less regeneration, against the health pool.
 */
export function simulateOfflineFarming(
  mapId: string,
  stats: PlayerPowerStats,
  windowSeconds: number,
  options: { balance?: MapBalanceSnapshot; respawnSeconds?: number } = {},
): OfflineFarmOutcome {
  const empty: OfflineFarmOutcome = {
    mapId, survivable: false, secondsToDie: 0, killsPerSecond: 0, kills: 0, rewards: [],
  };
  const seconds = Number.isFinite(windowSeconds) ? Math.max(0, windowSeconds) : 0;
  const roster = offlineEnemyRoster(mapId, options.balance);
  const totalPopulation = roster.reduce((sum, entry) => sum + entry.population, 0);
  if (!roster.length || !totalPopulation || !seconds) return empty;

  const dps = stats.damage / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
  if (!(dps > 0)) return empty;

  const meanFightSeconds = roster.reduce((sum, entry) => sum + entry.population * entry.hp / dps, 0) / totalPopulation;
  const cycleSeconds = meanFightSeconds + OFFLINE_APPROACH_SECONDS;
  if (!Number.isFinite(cycleSeconds) || cycleSeconds <= 0) return empty;

  const respawnSeconds = Math.max(1e-6, options.respawnSeconds ?? options.balance?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS);
  const killsPerSecond = Math.min(1 / cycleSeconds, totalPopulation / respawnSeconds);

  const meanIncomingPerSecond = roster.reduce((sum, entry) =>
    sum + entry.population * damageAfterArmor(entry.damage, stats.armor) * entry.attacksPerSecond, 0) / totalPopulation;
  const contactShare = meanFightSeconds / cycleSeconds;
  const sustainedIncoming = meanIncomingPerSecond * OFFLINE_INCOMING_PRESSURE * contactShare - stats.regen;
  const secondsToDie = sustainedIncoming <= 0 ? Infinity : stats.maxHp / sustainedIncoming;
  const survivable = secondsToDie >= seconds;
  if (!survivable) return { ...empty, secondsToDie, killsPerSecond };

  const kills = Math.floor(killsPerSecond * seconds);
  if (!kills) return { mapId, survivable, secondsToDie, killsPerSecond, kills: 0, rewards: [] };
  const counts = distributeKills(roster, kills, totalPopulation);
  const rewards: OfflineReward[] = [];
  roster.forEach((entry, index) => {
    if (!counts[index]) return;
    rewards.push({ type: entry.reward.type, amount: entry.reward.amount, count: counts[index] });
  });
  return { mapId, survivable, secondsToDie, killsPerSecond, kills, rewards };
}

/**
 * The maps an account may farm unattended, hardest first. Only ground already
 * earned is listed, so a fallback can never reach past the campaign rung the
 * player actually unlocked.
 */
export function offlineFarmableMaps(
  progress: CampaignAccess,
  endless: { completed: number; unlocked: boolean },
  limit = OFFLINE_MAP_SEARCH_LIMIT,
): string[] {
  const campaign = MAP_IDS.filter((_mapId, index) => index === 0 || progress[CAMPAIGN_UNLOCK_FIELDS[index - 1]]);
  const ladder = [...campaign];
  if (endless.unlocked) {
    const highest = Math.max(0, Math.floor(endless.completed)) + 1;
    // Only the rungs the search can actually reach are worth building.
    for (let number = Math.max(1, highest - limit + 1); number <= highest; number += 1) ladder.push(proceduralMapId(number));
  }
  const candidates = ladder.reverse().slice(0, Math.max(1, limit));
  // The first campaign map is the floor: always reachable, always survivable
  // for anyone who has left it, so the search can never come back empty-handed.
  return candidates.includes(MAP_IDS[0]) ? candidates : [...candidates, MAP_IDS[0]];
}

/**
 * Farm the hardest map the player can actually survive for the whole window.
 *
 * Stepping down is the point: an account that out-levelled a map still earns
 * there, and one that unlocked ground it cannot hold earns on the ground it
 * can. The search walks the ladder in order rather than jumping, because a
 * single rung down is usually the honest answer.
 */
export function resolveOfflineFarming(
  orderedMapIds: readonly string[],
  stats: PlayerPowerStats,
  windowSeconds: number,
  options: { balanceFor?: (mapId: string) => MapBalanceSnapshot | undefined; respawnSeconds?: number } = {},
): OfflineFarmOutcome | null {
  let best: OfflineFarmOutcome | null = null;
  for (const mapId of orderedMapIds) {
    const outcome = simulateOfflineFarming(mapId, stats, windowSeconds, {
      balance: options.balanceFor?.(mapId),
      respawnSeconds: options.respawnSeconds,
    });
    if (outcome.survivable && outcome.kills > 0) return outcome;
    // Remember how far they got, so a player who survives nowhere still learns
    // which map turned them back instead of seeing an empty summary.
    if (!best) best = outcome;
  }
  return best;
}

/** Armor's share of the incoming hit, for the summary's own explanation. */
export function offlineDamageReduction(armor: number) {
  return armorDamageReduction(armor);
}
