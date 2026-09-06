import { playerPowerForStats, type PlayerPowerStats } from "./player-power";

// One-time v8 conversion: September 6's 20-run campaign simulation exits
// Duskfall Orchard at 2,830,802,426 median effective power. The live cohort
// audit preserves all five stat leaderboards with this protected early tier.
export const ENDGAME_RESCALE_PROTECTED_POWER = 100_000;
export const ENDGAME_RESCALE_EXCESS_FACTOR = 0.12132864932953798;

/** Saved progression conversion only; future rewards are never compressed. */
export function rescaleEndgameProgress<T extends PlayerPowerStats>(progress: T): T {
  const power = playerPowerForStats(progress);
  if (power <= ENDGAME_RESCALE_PROTECTED_POWER) return progress;
  const target = ENDGAME_RESCALE_PROTECTED_POWER
    + (power - ENDGAME_RESCALE_PROTECTED_POWER) * ENDGAME_RESCALE_EXCESS_FACTOR;
  const factor = target / power;
  return {
    ...progress,
    damage: Math.fround(Math.max(1, progress.damage * factor)),
    maxHp: Math.fround(Math.max(1, progress.maxHp * factor)),
    armor: Math.fround(progress.armor * factor),
    regen: Math.fround(progress.regen * factor),
  };
}

export type RescaleRankingStats = Pick<PlayerPowerStats, "damage" | "maxHp" | "armor" | "regen"> & { power: number };

export function rescaleRankingStats(stats: PlayerPowerStats): RescaleRankingStats {
  return {
    power: playerPowerForStats(stats),
    damage: Math.fround(stats.damage), maxHp: Math.fround(stats.maxHp),
    armor: Math.fround(stats.armor), regen: Math.fround(stats.regen),
  };
}

/** Includes ties and stored f32 rounding, before any transaction writes. */
export function rescaleRankingConflict(plans: readonly { before: RescaleRankingStats; after: RescaleRankingStats }[]) {
  for (const key of ["power", "damage", "maxHp", "armor", "regen"] as const) {
    if (plans.some((plan) => !Number.isFinite(plan.before[key]) || !Number.isFinite(plan.after[key]))) return key;
    const ordered = [...plans].sort((a, b) => a.before[key] - b.before[key]);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1], current = ordered[index];
      if (Math.sign(previous.before[key] - current.before[key]) !== Math.sign(previous.after[key] - current.after[key])) return key;
    }
  }
  return null;
}
