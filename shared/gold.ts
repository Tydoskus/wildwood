/**
 * Gold: a coin some kills drop, kept through prestige and cleared by Reset Save. It changes hands only at the Trade
 * Chrysanthemum (exchange.ts), and gems never buy it. The server rolls it; these are the rules, with the random
 * number given so tests can pin it.
 */
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { isProceduralMap } from "./procedural-maps";

export const GOLD_DROP_CHANCE = 0.1;
/** Each campaign map's coins are this much more than the map before; Endless pays as the last campaign map. */
export const GOLD_MAP_GROWTH = 1.25;
export const GOLD_PER_DROP = { min: 1, max: 3 } as const;
export const GOLD_PER_BOSS = { min: 2, max: 4 } as const;
/** Offline farming pays half: a gold every 10 kills, against 0.2 a kill on average in play. */
export const OFFLINE_KILLS_PER_GOLD = 10;

/** What a kill's coins are multiplied by on a map: stronger monsters drop more (Town, the soul and anywhere else: 1). */
export function mapGoldFactor(mapId: string) {
  const index = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
  if (index >= 0) return GOLD_MAP_GROWTH ** index;
  return isProceduralMap(mapId) ? GOLD_MAP_GROWTH ** (CAMPAIGN_MAPS.length - 1) : 1;
}

/** The chance a kill drops gold, raised by `multiplier` (Treasure cards, Gold Luck) and never past certain. */
export const goldDropChance = (multiplier = 1) =>
  Math.min(1, GOLD_DROP_CHANCE * Math.max(1, Number.isFinite(multiplier) ? multiplier : 1));

/** Gold from `kills` regular kills: one roll each, a 10% chance of 1 to 3 times the map's `factor`, the chance raised by `multiplier`. */
export function rollKillGold(kills: number, random: () => number, multiplier = 1, factor = 1) {
  const count = Math.max(0, Math.floor(Number.isFinite(kills) ? kills : 0));
  const span = GOLD_PER_DROP.max - GOLD_PER_DROP.min + 1;
  const chance = goldDropChance(multiplier);
  let gold = 0;
  for (let kill = 0; kill < count; kill++) {
    const roll = random();
    // The winning roll is spread evenly over the chance, so it also picks the amount.
    if (roll < chance) gold += GOLD_PER_DROP.min + Math.min(span - 1, Math.floor(roll / chance * span));
  }
  return Math.round(gold * factor);
}

/** Gold for a boss's first clear in a run: 2 to 4. */
export function rollBossGold(random: () => number) {
  const span = GOLD_PER_BOSS.max - GOLD_PER_BOSS.min + 1;
  return GOLD_PER_BOSS.min + Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
}

/** Gold for offline kills, at the fixed half rate, times the map's factor. */
export const offlineGold = (kills: number, factor = 1) => Math.floor(Math.max(0, Number.isFinite(kills) ? kills : 0) / OFFLINE_KILLS_PER_GOLD * factor);
