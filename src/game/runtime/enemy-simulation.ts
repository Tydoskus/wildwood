import { enemyChaseSpeed } from "../../../shared/rules";
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
  regularEnemyAggroRetainRadius,
  regularEnemySimulationTick,
  selectRegularEnemyAggroTarget,
  type RegularEnemyAggroCandidate,
} from "../../../shared/regular-enemy-simulation";
import type { RemoteCombatStats, RemotePlayer } from "../../wildstat-coop";
import { separateEnemyCrowd } from "./enemy-crowd-separation";
import { createRemoteEnemyCombatShadows } from "./remote-enemy-combat-shadow";
import { rangedEnemyAttackRange, rangedEnemyHoldBand } from "./ranged-enemy-range";
import type { EnemyState, PlayerState } from "./types";

const FULL_SIMULATION_MARGIN = 220;
export const LOCAL_REGULAR_ENEMY_TARGET_ID = "local-player";

function recoverySpeed(enemy: EnemyState, chaseSpeed: number) {
  const minimum = Math.min(chaseSpeed, ENEMY_HIT_MIN_MOVE_SPEED);
  return minimum + (chaseSpeed - minimum) * enemy.moveSpeedRecovery / ENEMY_HIT_SPEED_RECOVERY_SECONDS;
}

type Viewport = { width: number; height: number; zoom: number };
type DamagePlayer = (amount: number) => boolean;
type EngageEnemy = (enemy: EnemyState, targetId?: string | null, startedAtTick?: number) => void;

export type EnemySimulationSharedOptions = {
  currentMapId?: () => string;
  serverNowMs?: () => number;
  localIdentity?: () => string | undefined;
  remotePlayers?: () => readonly RemotePlayer[];
  /** The player's actual movement speed, including equipment bonuses. */
  playerMovementSpeed?: () => number;
  remoteCombatStats?: (identity: string) => RemoteCombatStats | null | undefined;
  spawnDamageNumber?: (x: number, y: number, amount: number, critical?: boolean, damageTaken?: boolean) => void;
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
  const activeCrowd: EnemyState[] = [];
  const remoteCombat = createRemoteEnemyCombatShadows({
    spawnDamageNumber: shared.spawnDamageNumber ?? (() => {}),
    spawnBurst: shared.spawnBurst,
  });

  /** Chase speed tracks the player in front of the enemy, a step ahead of them. */
  function chaseSpeedFor(enemy: EnemyState) {
    return enemyChaseSpeed(enemy.speed, shared.playerMovementSpeed?.() ?? Number.NaN);
  }

  function currentServerNowMs() {
    const serverNow = shared.serverNowMs?.();
    return Number.isFinite(serverNow) ? Number(serverNow) : Date.now();
  }

  function localTargetId() {
    return shared.localIdentity?.() || LOCAL_REGULAR_ENEMY_TARGET_ID;
  }

  function regularAggroRadius(enemy: EnemyState) {
    const base = (enemy.definition ?? ENEMY_TYPES[enemy.type]);
    return base.elite
      ? enemy.aggroRadius
      : Math.max(0, BASE_ATTACK_RANGE - REGULAR_ENEMY_AGGRO_PADDING);
  }

  function regularRetainRadius(enemy: EnemyState) {
    const authoredLeash = enemy.leashRange;
    const base = regularEnemyAggroRetainRadius(regularAggroRadius(enemy), authoredLeash);
    // A runner opens a temporary gap while a newly alerted enemy accelerates.
    // Keep that gap inside the leash so the enemy gets to reach chase speed.
    const playerSpeed = shared.playerMovementSpeed?.() ?? 0;
    const rampGap = Number.isFinite(playerSpeed)
      ? Math.max(0, playerSpeed - ENEMY_HIT_MIN_MOVE_SPEED) * ENEMY_HIT_SPEED_RECOVERY_SECONDS / 2
      : 0;
    return base + rampGap;
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
    let direction = 1;
    if (ranged) {
      const band = rangedEnemyHoldBand(player.attackRange, player.r + enemy.r + 4);
      let rangedMove = 0;
      if (distance > band.approachAbove) {
        rangedMove = 1;
      } else if (distance < band.retreatBelow) {
        rangedMove = -1;
      }
      direction = rangedMove;
    }
    // Exponential easing makes authored speed the actual cruising speed at
    // both low and high frame rates, instead of acceleration/damping overshoot.
    const blend = 1 - Math.exp(-6 * dt);
    enemy.vx += (dx / distance * currentMoveSpeed * direction - enemy.vx) * blend;
    enemy.vy += (dy / distance * currentMoveSpeed * direction - enemy.vy) * blend;
    if (Math.abs(dx) > .5) enemy.facingX = dx < 0 ? -1 : 1;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    return distance;
  }

  function keepOutsidePlayer(enemy: EnemyState) {
    const collisionX = enemy.x - player.x;
    const collisionY = enemy.y - player.y;
    const minimumDistance = player.r + enemy.r;
    const collisionDistanceSquared = collisionX * collisionX + collisionY * collisionY;
    if (collisionDistanceSquared >= minimumDistance * minimumDistance) return;
    const collisionDistance = Math.sqrt(collisionDistanceSquared);
    const normalX = collisionDistance > .001 ? collisionX / collisionDistance : (enemy.facingX || 1);
    const normalY = collisionDistance > .001 ? collisionY / collisionDistance : 0;
    enemy.x = clamp(player.x + normalX * minimumDistance, enemy.r, WORLD.w - enemy.r);
    enemy.y = clamp(player.y + normalY * minimumDistance, enemy.r, WORLD.h - enemy.r);
    const inwardSpeed = enemy.vx * normalX + enemy.vy * normalY;
    if (inwardSpeed < 0) {
      enemy.vx -= inwardSpeed * normalX;
      enemy.vy -= inwardSpeed * normalY;
    }
  }

  function beginLeashing(enemy: EnemyState) {
    enemy.engaged = false;
    enemy.leashing = true;
    enemy.aggroTargetId = null;
    enemy.aggroStartedAtTick = 0;
    enemy.combatTargetX = undefined;
    enemy.combatTargetY = undefined;
    enemy.attackClock = Math.max(enemy.attackClock, .5);
    enemy.vx = 0;
    enemy.vy = 0;
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
    // Local fights use the live character, never the last network movement
    // sample. Multiplayer-off/idle modes intentionally leave that sample stale.
    const localCandidate: RegularEnemyAggroCandidate = {
      id,
      x: player.x,
      y: player.y,
      radius: player.r,
      local: true,
    };
    const remotePlayers = [...(shared.remotePlayers?.() ?? [])];
    remoteCombat.beginFrame(mapId, serverNowMs, dt, remotePlayers);
    activeCrowd.length = 0;

    for (const enemy of enemies) {
      enemy.combatTargetX = undefined;
      enemy.combatTargetY = undefined;
      if (enemy.dead || enemy.generatedBoss) continue;

      const base = (enemy.definition ?? ENEMY_TYPES[enemy.type]);
      const ambient = regularEnemyAmbientPose(mapId, enemy.siteId, enemy.homeX, enemy.homeY, serverNowMs);
      enemy.phase = ambient.phase;
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      if (enemy.hpLossFlashTimer) enemy.hpLossFlashTimer = Math.max(0, enemy.hpLossFlashTimer - dt);
      enemy.attackClock -= dt;
      if (enemy.attackAnimationElapsed !== undefined) enemy.attackAnimationElapsed += dt;
      enemy.moveSpeedRecovery = Math.min(ENEMY_HIT_SPEED_RECOVERY_SECONDS, enemy.moveSpeedRecovery + dt);
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
        const homeDistance = moveToward(enemy, enemy.homeX, enemy.homeY, recoverySpeed(enemy, chaseSpeedFor(enemy)), dt);
        if (homeDistance < 10) {
          enemy.leashing = false;
          enemy.x = ambient.x;
          enemy.y = ambient.y;
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.facingX = ambient.facingX;
        }
      }

      if (!enemy.leashing) {
        const selected = selectRegularEnemyAggroTarget({
          enemyX: enemy.x,
          enemyY: enemy.y,
          acquireRadius: regularAggroRadius(enemy),
          retainRadius: regularRetainRadius(enemy),
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
        // Seeded consensus determines when aggro starts. From this point on,
        // the authoritative local fight follows the actual local player with
        // the original responsive velocity-based movement.
        const target: RegularEnemyAggroCandidate | undefined = enemy.aggroTargetId === id ? {
          id,
          x: player.x,
          y: player.y,
          radius: player.r,
          local: true,
        } : undefined;
        if (!target) {
          beginLeashing(enemy);
        } else {
          const targetDx = target.x - enemy.x;
          const targetDy = target.y - enemy.y;
          const targetDistance = Math.hypot(targetDx, targetDy) || 1;
          const leashRange = regularRetainRadius(enemy);
          if (targetDistance > leashRange) {
            beginLeashing(enemy);
          } else {
            enemy.combatTargetX = target.x;
            enemy.combatTargetY = target.y;
            moveEngagedEnemy(enemy, target, recoverySpeed(enemy, chaseSpeedFor(enemy)), dt, Boolean(base.ranged));

            const actualDx = player.x - enemy.x;
            const actualDy = player.y - enemy.y;
            const actualDistance = Math.hypot(actualDx, actualDy) || 1;
            if (
              base.ranged &&
              enemy.attackClock <= 0 &&
              actualDistance <= rangedEnemyAttackRange(player.attackRange)
            ) {
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
              enemy.attackAnimationElapsed = 0;
              attackSequences.set(enemy, attackIndex + 1);
              enemy.attackClock = deterministicRegularEnemyAttackInterval(
                mapId,
                enemy.siteId,
                attackIndex,
                1 / Math.max(.01, base.attackSpeed),
              );
            } else if (!base.ranged && enemy.attackClock <= 0 && circlesOverlap(player, enemy)) {
              if (damagePlayer(enemy.damage)) {
                enemy.attackAnimationElapsed = 0;
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
      if (enemy.engaged) keepOutsidePlayer(enemy);
      if (enemy.engaged || enemy.leashing) activeCrowd.push(enemy);
    }

    separateEnemyCrowd(activeCrowd);
    remoteCombat.finishFrame();
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
