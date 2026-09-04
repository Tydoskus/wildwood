import { advanceDuelCombat, duelOutcome, initialDuelCombatState, type DuelCombat } from "../../shared/duel-combat";
import type { BalanceSimulationResult } from "./simulator";

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
/** Player-facing units, with no claim that a leaderboard point measures fun. */
export function campaignExperience(result: BalanceSimulationResult) {
  return result.maps.map(map => {
    const enemies = result.enemyMetrics[map.mapId] ?? [];
    const build = map.exitEffectiveStatsMedian;
    const duel: DuelCombat | null = build ? {
      combatVersion: 1, challengerMaxHp: build.maxHp, opponentMaxHp: build.maxHp,
      challengerDamage: build.damage, opponentDamage: build.damage,
      challengerArmor: build.armor, opponentArmor: build.armor,
      challengerRegen: build.regen, opponentRegen: build.regen,
      challengerAttackRate: build.attackRate, opponentAttackRate: build.attackRate,
    } : null;
    const mirror = duel ? advanceDuelCombat(duel, initialDuelCombatState(duel), 0, 30_000_000) : null;
    return {
      mapId: map.mapId, name: map.name, completedPercent: map.completedPercent,
      mapSeconds: map.completedPercent >= 50 ? map.durationMedianSeconds : null,
      ordinaryFightSeconds: median(enemies.filter(enemy => !enemy.elite).map(enemy => enemy.timeToKillSeconds)),
      regularHitsSurvived: median(enemies.map(enemy => enemy.hitsToDefeatPlayer)),
      unsafeStationaryEncounters: enemies.filter(enemy => enemy.survivalSeconds !== null && enemy.survivalSeconds < enemy.timeToKillSeconds).map(enemy => enemy.enemy),
      bossSeconds: map.bossFightMedianSeconds,
      bossGrowthPercent: map.bossRewardGrowthSharePercent,
      longestImprovementGapSeconds: map.momentum?.longestGainGapSeconds ?? null,
      mirrorDuelSeconds: mirror ? mirror.resolvedMicros / 1_000_000 : null,
      mirrorDuelHealthPercent: mirror && duel ? mirror.challengerHp / duel.challengerMaxHp * 100 : null,
      mirrorDuelOutcome: mirror && duel ? duelOutcome(duel, mirror) : null,
    };
  });
}
