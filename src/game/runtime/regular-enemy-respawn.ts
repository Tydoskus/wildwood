import type { SpawnSite } from "../world";

export { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../../shared/rules";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../../shared/rules";
import { enemyRespawnSecondsWithResearch } from "../../../shared/utility-research";

export type RegularEnemyRespawn = {
  respawnSeconds: () => number;
  schedule: (site: SpawnSite) => void;
};

/**
 * Owns regular-enemy respawn timing. Boss respawns remain server-owned and
 * never pass through this service.
 *
 * The clock is the map's tuned respawn after research, and nothing else. Until
 * 0.807 a rewarded ad could halve it for thirty minutes; the ad pays Gems now
 * and the plain respawn is what the halved one used to be.
 */
export function createRegularEnemyRespawn(
  getGameTime: () => number,
  respawnSpeedMultiplier = 1,
  baseRespawnSeconds = () => REGULAR_ENEMY_RESPAWN_SECONDS,
  enemyRespawnRank: () => number = () => 0,
): RegularEnemyRespawn {
  const speedMultiplier = Number.isFinite(respawnSpeedMultiplier)
    ? Math.max(1, respawnSpeedMultiplier)
    : 1;

  function respawnSeconds() {
    return enemyRespawnSecondsWithResearch(baseRespawnSeconds() / speedMultiplier, enemyRespawnRank());
  }

  function schedule(site: SpawnSite) {
    site.alive = false;
    site.respawnAt = getGameTime() + respawnSeconds();
  }

  return { respawnSeconds, schedule };
}
