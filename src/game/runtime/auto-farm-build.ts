import { damageAfterArmor } from '../../../shared/combat';
import { bossHitsToDefeat, bossRegenFractionFor } from '../../../shared/boss-regeneration';
import { effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch, type PlayerPowerStats } from '../../../shared/player-power';
import type { FarmEvaluation, FarmReward } from './auto-farm-plan';
import { runtimeMapBalance } from '../../../shared/map-balance-runtime';
import { isProceduralMap, proceduralMapNumber } from '../../../shared/procedural-maps';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../shared/rules';

export type FarmBoss = { hp: number; strongestHit: number; regenFraction?: number; mapId: string };

/**
 * Prices a kill's reward against the player's live build, for autofarm to
 * choose by: the power the game shows, and the two boss numbers the balance
 * simulator gates on (fight time with crits and boss regen, and the hardest
 * hit after armor as a share of max health). Effective stats come from the
 * same calculation as the profile and leaderboard.
 */
export function createFarmEvaluator(deps: {
  base: () => PlayerPowerStats;
  equipment: () => Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  research: () => PlayerPowerResearch | null | undefined;
  upgradeLevel: (itemId: string) => number;
  rewardMultiplier: () => number;
  minAttackInterval: () => number;
  criticalChance: () => number;
  criticalMultiplier: () => number;
  boss: () => FarmBoss | null;
}) {
  function build(reward?: FarmReward) {
    const stats = { ...deps.base() };
    if (reward) {
      const amount = reward.amount * deps.rewardMultiplier();
      // As applyReward does it (player-combat-controller.ts).
      if (reward.type === 'damage') stats.damage += amount;
      else if (reward.type === 'health') stats.maxHp += amount;
      else if (reward.type === 'armor') stats.armor += amount;
      else if (reward.type === 'regen') stats.regen += amount;
      else if (reward.type === 'speed') stats.attackRate = 1 / Math.min(1 / deps.minAttackInterval(), 1 / stats.attackRate + amount);
    }
    return effectivePlayerPowerStats({ ...stats, ...deps.equipment() }, deps.research(), deps.upgradeLevel);
  }
  const interval = (stats: PlayerPowerStats) => Math.max(deps.minAttackInterval(), stats.attackRate);
  const averageHit = (stats: PlayerPowerStats) => {
    const chance = Math.min(1, Math.max(0, deps.criticalChance()));
    return stats.damage * (1 + chance * (Math.max(1, deps.criticalMultiplier()) - 1));
  };
  return {
    evaluate(reward?: FarmReward): FarmEvaluation {
      const stats = build(reward);
      const boss = deps.boss();
      if (!boss) return { power: unroundedPlayerPower(stats), fightSeconds: null, hitShare: null };
      const step = interval(stats);
      const hits = bossHitsToDefeat(boss.hp, averageHit(stats), step, boss.regenFraction ?? bossRegenFractionFor(boss.mapId));
      return {
        power: unroundedPlayerPower(stats),
        fightSeconds: Number.isFinite(hits) ? hits * step : Number.POSITIVE_INFINITY,
        hitShare: damageAfterArmor(boss.strongestHit, stats.armor) / Math.max(1, stats.maxHp),
      };
    },
    /** Damage per second against a regular enemy, crits included. */
    dps() {
      const stats = build();
      return averageHit(stats) / interval(stats);
    },
  };
}

type FarmPortal = { x: number; y: number; height: number; destination: string };
type LiveBoss = { x: number; y: number; r: number; dead?: boolean };

/** How deep a map is: the campaign in order, then Endless. Forward is a higher rank. */
export function farmMapRank(mapId: string) {
  return isProceduralMap(mapId) ? 1_000 + (proceduralMapNumber(mapId) ?? 0) : CAMPAIGN_MAP_IDS.indexOf(mapId as never);
}

/**
 * Everything autofarm's planning reads from the live game, as controller
 * options: the build evaluator, kill speed, this map's standing boss (with its
 * balance), and the unlocked portal forward.
 */
export function createAutoFarmProgress(deps: Omit<Parameters<typeof createFarmEvaluator>[0], 'boss'> & {
  mapId: () => string;
  mapBoss: () => LiveBoss | null | undefined;
  portals: () => readonly (FarmPortal | null | undefined)[];
  portalUnlocked: (portal: FarmPortal) => boolean;
}) {
  const evaluator = createFarmEvaluator({ ...deps, boss: () => {
    const boss = runtimeMapBalance(deps.mapId())?.boss;
    return boss ? { hp: boss.hp, strongestHit: Math.max(boss.damage, ...Object.values(boss.attacks)), regenFraction: boss.regenFraction, mapId: deps.mapId() } : null;
  } });
  return {
    evaluate: (reward?: FarmReward) => evaluator.evaluate(reward),
    farmDps: () => evaluator.dps(),
    mapBoss: () => { const boss = deps.mapBoss(); return boss && !boss.dead ? boss : null; },
    nextPortal: () => {
      const here = farmMapRank(deps.mapId());
      const forward = deps.portals().find((portal): portal is FarmPortal => Boolean(portal) && farmMapRank(portal!.destination) > here && deps.portalUnlocked(portal!));
      return forward ? { x: forward.x, y: forward.y - forward.height * .32, destination: forward.destination } : null;
    },
  };
}
