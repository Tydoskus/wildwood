import { effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch, type PlayerPowerStats } from '../../../shared/player-power';
import { addAttackSpeedRating, attackCapInterval, type AttackCapArg } from '../../../shared/stat-rating';
import type { FarmEvaluation, FarmReward } from './auto-farm-plan';
import { isProceduralMap, proceduralMapNumber } from '../../../shared/procedural-maps';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../shared/rules';
import { recommendedBossPower, recommendedMapPower } from './auto-farm-power';

/**
 * Prices a kill's reward against the player's live build, for autofarm to
 * choose by: the power the game shows. Effective stats come from the same
 * calculation as the profile and leaderboard.
 */
export function createFarmEvaluator(deps: {
  base: () => PlayerPowerStats;
  equipment: () => Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  research: () => PlayerPowerResearch | null | undefined;
  upgradeLevel: (itemId: string) => number;
  rewardMultiplier: () => number;
  /** The attack speed cap (stat-rating.ts AttackCap). */
  minAttackInterval: () => AttackCapArg;
  criticalChance: () => number;
  /** The crit multiplier, with this much more crit rating when asked (a crit reward's worth). */
  criticalMultiplier: (extraRating?: number) => number;
}) {
  function build(reward?: FarmReward) {
    const stats = { ...deps.base() };
    if (reward) {
      // A soul kill's reward is flat: research and prestige never grow it.
      const amount = reward.amount * (reward.flat ? 1 : deps.rewardMultiplier());
      // As applyReward does it (player-combat-controller.ts).
      if (reward.type === 'damage') stats.damage += amount;
      else if (reward.type === 'health') stats.maxHp += amount;
      else if (reward.type === 'armor') stats.armor += amount;
      else if (reward.type === 'regen') stats.regen += amount;
      else if (reward.type === 'speed') stats.attackRate = addAttackSpeedRating(stats.attackRate, amount, deps.minAttackInterval());
      // Crit damage is not in power: priced as the damage that would raise the average hit as much.
      else if (reward.type === 'crit') {
        const chance = Math.min(1, Math.max(0, deps.criticalChance()));
        const now = 1 + chance * (Math.max(1, deps.criticalMultiplier()) - 1);
        stats.damage *= (1 + chance * (Math.max(1, deps.criticalMultiplier(amount)) - 1)) / now;
      }
    }
    return effectivePlayerPowerStats({ ...stats, ...deps.equipment() }, deps.research(), deps.upgradeLevel);
  }
  return {
    evaluate: (reward?: FarmReward): FarmEvaluation => { const stats = build(reward); return { power: unroundedPlayerPower(stats), stats }; },
    /** Damage per second against a regular enemy, with crits: for how long a kill takes. */
    dps() {
      const stats = build();
      const chance = Math.min(1, Math.max(0, deps.criticalChance()));
      return stats.damage * (1 + chance * (Math.max(1, deps.criticalMultiplier()) - 1)) / Math.max(attackCapInterval(deps.minAttackInterval()), stats.attackRate);
    },
  };
}

type FarmPortal = { x: number; y: number; height: number; destination: string };
type LiveBoss = { x: number; y: number; r: number; hp: number; maxHp: number; dead?: boolean; isBoss?: boolean; ry?: number; hitboxOffsetY?: number };

/** How deep a map is: the campaign in order, then Endless. Forward is a higher rank. */
export function farmMapRank(mapId: string) {
  return isProceduralMap(mapId) ? 1_000 + (proceduralMapNumber(mapId) ?? 0) : CAMPAIGN_MAP_IDS.indexOf(mapId as never);
}

/**
 * Everything autofarm's planning reads from the live game, as controller
 * options: the build and its power, this map's standing boss, and the
 * unlocked portals.
 */
export function createAutoFarmProgress(deps: Parameters<typeof createFarmEvaluator>[0] & {
  mapId: () => string;
  mapBoss: () => LiveBoss | null | undefined;
  portals: () => readonly (FarmPortal | null | undefined)[];
  portalUnlocked: (portal: FarmPortal) => boolean;
  reflectOnly: () => boolean;
}) {
  const evaluator = createFarmEvaluator(deps);
  const ranked = (direction: 1 | -1) => {
    const here = farmMapRank(deps.mapId());
    return deps.portals().find((portal): portal is FarmPortal => Boolean(portal) && Math.sign(farmMapRank(portal!.destination) - here) === direction && deps.portalUnlocked(portal!)) ?? null;
  };
  const point = (portal: FarmPortal | null) => portal ? { x: portal.x, y: portal.y - portal.height * .32, destination: portal.destination } : null;
  return {
    evaluate: evaluator.evaluate,
    power: () => evaluator.evaluate().power,
    farmDps: () => evaluator.dps(),
    mapBoss: () => { const boss = deps.mapBoss(); return boss && !boss.dead ? boss : null; },
    /** The unlocked portal forward; whether to take it is the controller's call. */
    nextPortal: () => point(ranked(1)),
    /** The portal back to the previous map, for a farm that keeps dying here. */
    previousPortal: () => point(ranked(-1)),
    /**
     * Whether beating this map's boss opens anything: a way forward that is
     * still locked. Bosses pay no stats, so once the next map is open a fight
     * is time not spent farming (players watched autofarm kill one boss three times).
     */
    bossUnlocksNext: () => {
      const here = farmMapRank(deps.mapId());
      return deps.portals().some(portal => Boolean(portal) && farmMapRank(portal!.destination) > here && !deps.portalUnlocked(portal!));
    },
    reflectOnly: deps.reflectOnly,
    /** A map's recommended power (auto-farm-power.ts), and this map's boss's. */
    mapPower: recommendedMapPower,
    bossPower: () => recommendedBossPower(deps.mapId()),
  };
}
