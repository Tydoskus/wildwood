import type { SpawnSite } from "../world";

export const REGULAR_ENEMY_RESPAWN_SECONDS = 30;
export const REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS = 15;
export const REWARDED_RESPAWN_BOOST_DURATION_MS = 30 * 60 * 1_000;

export type RegularEnemyRespawnBoost = {
  activate: () => boolean;
  isActive: () => boolean;
  activeUntilMs: () => number;
  remainingMs: () => number;
  respawnSeconds: () => number;
  schedule: (site: SpawnSite) => void;
};

/**
 * Owns regular-enemy respawn timing. Boss respawns remain server-owned and
 * never pass through this service.
 */
export function createRegularEnemyRespawnBoost(
  spawnSites: SpawnSite[],
  getGameTime: () => number,
  getNowMs: () => number = Date.now,
  initialActiveUntilMs = 0,
  respawnSpeedMultiplier = 1,
): RegularEnemyRespawnBoost {
  let activeUntilMs = Number.isFinite(initialActiveUntilMs) ? Math.max(0, initialActiveUntilMs) : 0;
  const speedMultiplier = Number.isFinite(respawnSpeedMultiplier)
    ? Math.max(1, respawnSpeedMultiplier)
    : 1;
  const regularRespawnSeconds = REGULAR_ENEMY_RESPAWN_SECONDS / speedMultiplier;
  const rewardedRespawnSeconds = REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS / speedMultiplier;

  function remainingMs() {
    return Math.max(0, activeUntilMs - getNowMs());
  }

  function isActive() {
    return remainingMs() > 0;
  }

  function respawnSeconds() {
    return isActive() ? rewardedRespawnSeconds : regularRespawnSeconds;
  }

  function schedule(site: SpawnSite) {
    site.alive = false;
    site.respawnAt = getGameTime() + respawnSeconds();
  }

  function activate() {
    if (isActive()) return false;
    activeUntilMs = getNowMs() + REWARDED_RESPAWN_BOOST_DURATION_MS;
    const gameTime = getGameTime();

    // Existing 30-second timers become 15-second timers measured from the
    // original defeat. Never lengthen an already-shorter timer.
    for (const site of spawnSites) {
      if (site.alive || site.respawnAt <= 0) continue;
      const defeatedAt = site.respawnAt - regularRespawnSeconds;
      const boostedRespawnAt = Math.max(
        gameTime,
        defeatedAt + rewardedRespawnSeconds,
      );
      site.respawnAt = Math.min(site.respawnAt, boostedRespawnAt);
    }
    return true;
  }

  return { activate, isActive, activeUntilMs: () => activeUntilMs, remainingMs, respawnSeconds, schedule };
}
