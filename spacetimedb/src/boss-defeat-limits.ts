export const BOSS_REWARD_WINDOW_SECONDS = 60;

/**
 * An optimistic combat bound, not proof that combat actually took place.
 * `regenPerSecond` is what the boss heals a second: a map curve's boss gate
 * heals more than a build below it deals, and that build cannot win at all.
 */
export function bossDefeatLimits(hp: number, dps: number, attackInterval: number, respawnSeconds: number, regenPerSecond = 0) {
  if (![hp, dps, attackInterval, respawnSeconds, regenPerSecond].every(Number.isFinite)
    || hp <= 0 || dps <= 0 || attackInterval <= 0 || respawnSeconds <= 0 || regenPerSecond < 0) return null;
  if (dps <= regenPerSecond) return null;
  dps -= regenPerSecond;
  // The first volley may already be in flight when a window begins. Allow one
  // attack interval, but never invent extra DPS or a free slow-boss victory.
  const fightSeconds = Math.max(0, hp / dps - attackInterval);
  const cycleSeconds = fightSeconds + respawnSeconds;
  return {
    cycleSeconds,
    capacitySeconds: Math.max(BOSS_REWARD_WINDOW_SECONDS + respawnSeconds, cycleSeconds),
    // A long fight can cross a five-minute boundary, but still has to earn its
    // full time cost. Keeping one slot here does not grant that time credit.
    windowKills: Math.max(1, Math.floor((BOSS_REWARD_WINDOW_SECONDS + respawnSeconds) / cycleSeconds + 1e-9)),
  };
}
