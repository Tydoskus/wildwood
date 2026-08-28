import {
  BASE_ATTACK_RANGE,
  ENEMY_HIT_MIN_MOVE_SPEED,
  ENEMY_HIT_SPEED_RECOVERY_SECONDS,
  REGULAR_ENEMY_AGGRO_PADDING,
  RANGED_PROJECTILE_SPEED,
  WORLD,
} from "../constants";
import { ENEMY_TYPES } from "../enemies";
import { circlesOverlap, clamp } from "../math";
import {
  deterministicRegularEnemyAttackInterval,
  regularEnemyAmbientPose,
  regularEnemySimulationTick,
  selectRegularEnemyAggroTarget,
  type RegularEnemyAggroCandidate,
} from "../../../shared/regular-enemy-simulation";
import type { RemoteCombatStats, RemotePlayer } from "../../wildwood-coop";
import { createRemoteEnemyCombatShadows } from "./remote-enemy-combat-shadow";
import type { EnemyState, PlayerState, Position } from "./types";

const FULL_SIMULATION_MARGIN = 220;
const RANGED_PREFERRED_DISTANCE = 235;
const RANGED_APPROACH_DEAD_BAND = 25;
const RANGED_RETREAT_DEAD_BAND = 35;
export const LOCAL_REGULAR_ENEMY_TARGET_ID = "local-player";

type Viewport = { width: number; height: number; zoom: number };
type DamagePlayer = (amount: number) => boolean;
type EngageEnemy = (enemy: EnemyState, targetId?: string | null, startedAtTick?: number) => void;

export type EnemySimulationSharedOptions = {
  currentMapId?: () => string;
  serverNowMs?: () => number;
  localIdentity?: () => string | undefined;
  localAggroPosition?: () => Position | null | undefined;
  remotePlayers?: () => readonly RemotePlayer[];
  remoteCombatStats?: (identity: string) => RemoteCombatStats | null | undefined;
  spawnDamageNumber?: (x: number, y: number, amount: number, critical?: boolean) => void;
  spawnBurst?: (x: number, y: number, color: string, count?: number, speed?: number) => void;
};

export type EnemySimulation = {
  update: (dt: number) => void;
  renderRemotePlayers: (players: readonly RemotePlayer[]) => RemotePlayer[];
  remoteCombatGhosts: () => EnemyState[];
  clearRemoteCombat: () => void;
};

/** Owns deterministic regular-enemy movement, aggro, and local combat. */
export function createEnemySimulation(
  enemies: EnemyState[],
  spawnEnemyShot: (x: number, y: number, vx: number, vy: number, radius: number, damage: number, life: number) => void,
  player: PlayerState,
  getViewport: () => Viewport,
  engageEnemy: EngageEnemy,
  damagePlayer: DamagePlayer,
  shared: EnemySimulationSharedOptions = {},
): EnemySimulation {
  const attackSequences = new WeakMap<EnemyState, number>();
  const remoteCombat = createRemoteEnemyCombatShadows({
    spawnDamageNumber: shared.spawnDamageNumber ?? (() => {}),
    spawnBurst: shared.spawnBurst,
  });

  function currentServerNowMs() {
    const serverNow = shared.serverNowMs?.();
    return Number.isFinite(serverNow) ? Number(serverNow) : Date.now();
  }

  function localTargetId() {
    return shared.localIdentity?.() || LOCAL_REGULAR_ENEMY_TARGET_ID;
  }

  function regularAggroRadius(enemy: EnemyState) {
    const base = ENEMY_TYPES[enemy.type];
    return base.elite
      ? enemy.aggroRadius
      : Math.max(0, BASE_ATTACK_RANGE - REGULAR_ENEMY_AGGRO_PADDING);
  }

  function moveToward(enemy: EnemyState, targetX: number, targetY: number, speed: number, dt: number, stopDistance = 0) {
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const available = Math.max(0, distance - stopDistance);
    const step = Math.min(available, Math.max(0, speed) * dt);
    if (step <= 0) return distance;
    enemy.x += dx / distance * step;
    enemy.y += dy / distance * step;
    if (Math.abs(dx) > .5) enemy.facingX = dx < 0 ? -1 : 1;
    return distance - step;
  }

  function moveEngagedEnemy(
    enemy: EnemyState,
    target: RegularEnemyAggroCandidate,
    currentMoveSpeed: number,
    dt: number,
    ranged: boolean,
  ) {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (ranged) {
      if (distance > RANGED_PREFERRED_DISTANCE + RANGED_APPROACH_DEAD_BAND) {
        moveToward(enemy, target.x, target.y, currentMoveSpeed, dt, RANGED_PREFERRED_DISTANCE);
      } else if (distance < RANGED_PREFERRED_DISTANCE - RANGED_RETREAT_DEAD_BAND) {
        const retreatDistance = Math.min(currentMoveSpeed * dt, RANGED_PREFERRED_DISTANCE - distance);
        enemy.x -= dx / distance * retreatDistance;
        enemy.y -= dy / distance * retreatDistance;
        if (Math.abs(dx) > .5) enemy.facingX = dx < 0 ? -1 : 1;
      } else if (Math.abs(dx) > .5) {
        enemy.facingX = dx < 0 ? -1 : 1;
      }
      return distance;
    }
    return moveToward(enemy, target.x, target.y, currentMoveSpeed, dt, enemy.r + target.radius - 1);
  }

  function beginLeashing(enemy: EnemyState) {
    enemy.engaged = false;
    enemy.leashing = true;
    enemy.aggroTargetId = null;
    enemy.aggroStartedAtTick = 0;
    enemy.combatTargetX = undefined;
    enemy.combatTargetY = undefined;
    enemy.attackClock = Math.max(enemy.attackClock, .5);
  }

  function update(dt: number) {
    const mapId = shared.currentMapId?.() ?? "tutorial_forest";
    const serverNowMs = currentServerNowMs();
    const serverTick = regularEnemySimulationTick(serverNowMs);
    const viewport = getViewport();
    const fullSimulationRadius = Math.max(
      player.attackRange + FULL_SIMULATION_MARGIN,
      Math.hypot(viewport.width, viewport.height) / (2 * viewport.zoom) + FULL_SIMULATION_MARGIN,
    );
    const fullSimulationRadiusSq = fullSimulationRadius * fullSimulationRadius;
    const id = localTargetId();
    const localPose = shared.localAggroPosition?.() ?? player;
    const localCandidate: RegularEnemyAggroCandidate = {
      id,
      x: Number.isFinite(localPose.x) ? localPose.x : player.x,
      y: Number.isFinite(localPose.y) ? localPose.y : player.y,
      radius: player.r,
      local: true,
    };
    const remotePlayers = [...(shared.remotePlayers?.() ?? [])];
    remoteCombat.beginFrame(mapId, serverNowMs, dt, remotePlayers);

    for (const enemy of enemies) {
      enemy.combatTargetX = undefined;
      enemy.combatTargetY = undefined;
      if (enemy.dead) continue;

      const base = ENEMY_TYPES[enemy.type];
      const ambient = regularEnemyAmbientPose(mapId, enemy.siteId, enemy.homeX, enemy.homeY, serverNowMs);
      enemy.phase = ambient.phase;
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      enemy.attackClock -= dt;
      enemy.moveSpeedRecovery = Math.min(ENEMY_HIT_SPEED_RECOVERY_SECONDS, enemy.moveSpeedRecovery + dt);
      const moveSpeedProgress = enemy.moveSpeedRecovery / ENEMY_HIT_SPEED_RECOVERY_SECONDS;
      const currentMoveSpeed = ENEMY_HIT_MIN_MOVE_SPEED + (enemy.speed - ENEMY_HIT_MIN_MOVE_SPEED) * moveSpeedProgress;
      const localDx = player.x - enemy.x;
      const localDy = player.y - enemy.y;
      const fullRate = enemy.engaged || localDx * localDx + localDy * localDy <= fullSimulationRadiusSq;

      if (fullRate) {
        remoteCombat.observeEnemySite({
          enemy,
          base,
          ambient,
          acquireRadius: regularAggroRadius(enemy),
          engagementTick: serverTick,
          statsFor: shared.remoteCombatStats ?? (() => null),
        });
      }

      if (!enemy.engaged && !enemy.leashing) {
        enemy.x = ambient.x;
        enemy.y = ambient.y;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.facingX = ambient.facingX;
        if (enemy.hp < enemy.maxHp) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .16 * dt);
      }

      if (enemy.leashing) {
        const homeDistance = moveToward(enemy, enemy.homeX, enemy.homeY, currentMoveSpeed, dt);
        if (homeDistance < 10) {
          enemy.leashing = false;
          enemy.x = ambient.x;
          enemy.y = ambient.y;
          enemy.facingX = ambient.facingX;
        }
      }

      if (!enemy.leashing) {
        const selected = selectRegularEnemyAggroTarget({
          enemyX: enemy.x,
          enemyY: enemy.y,
          acquireRadius: regularAggroRadius(enemy),
          retainRadius: enemy.type === "Dune Archer" ? Math.max(900, enemy.leashRange) : enemy.leashRange,
          currentTargetId: enemy.engaged ? enemy.aggroTargetId : null,
          candidates: [localCandidate],
        });
        if (!enemy.engaged && selected) engageEnemy(enemy, selected.id, serverTick);
        else if (enemy.engaged && selected && selected.id !== enemy.aggroTargetId) engageEnemy(enemy, selected.id, serverTick);
      }

      if (enemy.engaged && !enemy.aggroTargetId) {
        enemy.aggroTargetId = id;
        enemy.aggroStartedAtTick = serverTick;
      }

      if (enemy.engaged) {
        const target = enemy.aggroTargetId === id ? localCandidate : undefined;
        if (!target) {
          beginLeashing(enemy);
        } else {
          const targetDx = target.x - enemy.x;
          const targetDy = target.y - enemy.y;
          const targetDistance = Math.hypot(targetDx, targetDy) || 1;
          const leashRange = enemy.type === "Dune Archer" ? Math.max(900, enemy.leashRange) : enemy.leashRange;
          if (targetDistance > leashRange) {
            beginLeashing(enemy);
          } else {
            enemy.combatTargetX = target.x;
            enemy.combatTargetY = target.y;
            moveEngagedEnemy(enemy, target, currentMoveSpeed, dt, Boolean(base.ranged));
            if (enemy.vx || enemy.vy) {
              enemy.x += enemy.vx * dt;
              enemy.y += enemy.vy * dt;
              enemy.vx *= Math.pow(.002, dt);
              enemy.vy *= Math.pow(.002, dt);
            }

            const actualDx = player.x - enemy.x;
            const actualDy = player.y - enemy.y;
            const actualDistance = Math.hypot(actualDx, actualDy) || 1;
            if (base.ranged && enemy.attackClock <= 0 && actualDistance < 390) {
              spawnEnemyShot(
                enemy.x,
                enemy.y,
                actualDx / actualDistance * RANGED_PROJECTILE_SPEED,
                actualDy / actualDistance * RANGED_PROJECTILE_SPEED,
                6,
                enemy.damage,
                4,
              );
              const attackIndex = attackSequences.get(enemy) ?? 0;
              attackSequences.set(enemy, attackIndex + 1);
              enemy.attackClock = deterministicRegularEnemyAttackInterval(
                mapId,
                enemy.siteId,
                attackIndex,
                1 / Math.max(.01, base.attackSpeed),
              );
            } else if (!base.ranged && enemy.attackClock <= 0 && circlesOverlap(player, enemy)) {
              if (damagePlayer(enemy.damage)) {
                enemy.attackClock = 1 / Math.max(.01, base.attackSpeed);
                enemy.moveSpeedRecovery = 0;
                enemy.vx = 0;
                enemy.vy = 0;
              }
            }
          }
        }
      }

      enemy.x = clamp(enemy.x, enemy.r, WORLD.w - enemy.r);
      enemy.y = clamp(enemy.y, enemy.r, WORLD.h - enemy.r);
    }

    for (let index = enemies.length - 1; index >= 0; index--) {
      if (enemies[index].dead) enemies.splice(index, 1);
    }
  }

  return {
    update,
    renderRemotePlayers: remoteCombat.renderPlayers,
    remoteCombatGhosts: remoteCombat.ghostEnemies,
    clearRemoteCombat: remoteCombat.clear,
  };
}
