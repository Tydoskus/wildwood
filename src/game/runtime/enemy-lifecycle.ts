import { TAU, ENEMY_HIT_SPEED_RECOVERY_SECONDS } from "../constants";
import { ENEMY_TYPES } from "../enemies";
import { regularEnemySeededUnit } from "../../../shared/regular-enemy-simulation";
import type { SpawnSite } from "../world";
import type { EnemyState } from "./types";

type SpawnBurst = (x: number, y: number, color: string, count?: number, speed?: number) => void;

export function createEnemyLifecycle(
  enemies: EnemyState[],
  spawnSites: SpawnSite[],
  spawnBurst: SpawnBurst,
) {
  function spawnFromSite(site: SpawnSite) {
    const base = ENEMY_TYPES[site.type];
    const maxHp = base.hp;
    enemies.push({
      type: site.type,
      siteId: site.id,
      campName: site.campName,
      x: site.x,
      y: site.y,
      homeX: site.x,
      homeY: site.y,
      vx: 0,
      vy: 0,
      r: base.r,
      hp: maxHp,
      maxHp,
      speed: base.speed,
      damage: base.damage,
      reward: base.reward,
      aggroRadius: base.aggro ?? 0,
      leashRange: site.leashRange,
      engaged: false,
      leashing: false,
      aggroTargetId: null,
      aggroStartedAtTick: 0,
      facingX: regularEnemySeededUnit("spawn-facing", site.campName, site.id, site.type) < .5 ? -1 : 1,
      wandering: false,
      wanderTargetX: site.x,
      wanderTargetY: site.y,
      wanderWait: 1 + regularEnemySeededUnit("spawn-wait", site.campName, site.id, site.type) * 3,
      attackClock: base.ranged ? .2 + regularEnemySeededUnit("spawn-attack", site.campName, site.id, site.type) : 0,
      moveSpeedRecovery: ENEMY_HIT_SPEED_RECOVERY_SECONDS,
      hurt: 0,
      dead: false,
      phase: regularEnemySeededUnit("spawn-phase", site.campName, site.id, site.type) * TAU,
      idleUpdateElapsed: 0,
    });
    site.alive = true;
    site.respawnAt = 0;
  }

  function engageEnemy(enemy: EnemyState, targetId: string | null = null, startedAtTick = 0) {
    const group = enemy.type === "Dune Archer"
      ? enemies.filter((candidate) => !candidate.dead && candidate.type === "Dune Archer")
      : [enemy];
    for (const candidate of group) {
      candidate.engaged = true;
      candidate.leashing = false;
      candidate.wandering = false;
      candidate.aggroTargetId = targetId;
      candidate.aggroStartedAtTick = startedAtTick;
    }
  }

  function updateRespawns(gameTime: number) {
    for (const site of spawnSites) {
      if (!site.alive && site.respawnAt > 0 && gameTime >= site.respawnAt) {
        spawnFromSite(site);
        spawnBurst(site.x, site.y, "#76d978", 8, 55);
      }
    }
  }

  return { spawnFromSite, engageEnemy, updateRespawns };
}
