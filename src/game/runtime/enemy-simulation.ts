import {
  ENEMY_HIT_MIN_MOVE_SPEED,
  ENEMY_HIT_SPEED_RECOVERY_SECONDS,
  REGULAR_ENEMY_AGGRO_PADDING,
  RANGED_PROJECTILE_SPEED,
  TAU,
  WORLD,
} from "../constants";
import { ENEMY_TYPES } from "../enemies";
import { circlesOverlap, clamp, rand } from "../math";
import type { EnemyShot, EnemyState, PlayerState } from "./types";

const WANDER_RADIUS = 72;
const WANDER_SPEED_RATIO = .28;
const IDLE_UPDATE_INTERVAL = 1 / 12;
const FULL_SIMULATION_MARGIN = 220;

type Viewport = { width: number; height: number; zoom: number };
type DamagePlayer = (amount: number) => boolean;
type EngageEnemy = (enemy: EnemyState) => void;

export type EnemySimulation = {
  update: (dt: number) => void;
};

/**
 * Owns regular-enemy movement, combat, collision, and simulation LOD.
 * Keep enemy behavior here rather than growing the application entry point.
 */
export function createEnemySimulation(
  enemies: EnemyState[],
  enemyShots: EnemyShot[],
  player: PlayerState,
  getViewport: () => Viewport,
  engageEnemy: EngageEnemy,
  damagePlayer: DamagePlayer,
): EnemySimulation {
  const fullRateEnemies: EnemyState[] = [];

  function update(dt: number) {
    const viewport = getViewport();
    const fullSimulationRadius = Math.max(
      player.attackRange + FULL_SIMULATION_MARGIN,
      Math.hypot(viewport.width, viewport.height) / (2 * viewport.zoom) + FULL_SIMULATION_MARGIN,
    );
    const fullSimulationRadiusSq = fullSimulationRadius * fullSimulationRadius;
    fullRateEnemies.length = 0;

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const toPlayerX = player.x - enemy.x;
      const toPlayerY = player.y - enemy.y;
      const fullRate = enemy.engaged || toPlayerX * toPlayerX + toPlayerY * toPlayerY <= fullSimulationRadiusSq;
      if (!fullRate) {
        enemy.idleUpdateElapsed += dt;
        if (enemy.idleUpdateElapsed < IDLE_UPDATE_INTERVAL) continue;
      }
      const simulationDt = fullRate ? dt : enemy.idleUpdateElapsed;
      enemy.idleUpdateElapsed = 0;
      fullRateEnemies.push(enemy);
      const base = ENEMY_TYPES[enemy.type];
      enemy.hurt = Math.max(0, enemy.hurt - simulationDt);
      enemy.attackClock -= simulationDt;
      enemy.moveSpeedRecovery = Math.min(ENEMY_HIT_SPEED_RECOVERY_SECONDS, enemy.moveSpeedRecovery + simulationDt);
      enemy.phase += simulationDt * 3;
      const moveSpeedProgress = enemy.moveSpeedRecovery / ENEMY_HIT_SPEED_RECOVERY_SECONDS;
      const currentMoveSpeed = ENEMY_HIT_MIN_MOVE_SPEED + (enemy.speed - ENEMY_HIT_MIN_MOVE_SPEED) * moveSpeedProgress;

      const playerDistance = Math.hypot(toPlayerX, toPlayerY) || 1;
      const homeDistance = Math.hypot(enemy.x - enemy.homeX, enemy.y - enemy.homeY);

      if (enemy.leashing && homeDistance < 10) enemy.leashing = false;
      const aggroRadius = base.elite
        ? enemy.aggroRadius
        : Math.max(0, player.attackRange - REGULAR_ENEMY_AGGRO_PADDING);
      if (!enemy.leashing && playerDistance < aggroRadius) engageEnemy(enemy);

      const leashRange = enemy.type === "Dune Archer" ? Math.max(900, enemy.leashRange) : enemy.leashRange;
      if (enemy.engaged && playerDistance > leashRange) {
        enemy.engaged = false;
        enemy.leashing = true;
        enemy.attackClock = Math.max(enemy.attackClock, .5);
      }

      let targetX = enemy.x;
      let targetY = enemy.y;
      let targetDistance = 1;
      let moveMode = 0;
      let moveSpeedRatio = 1;

      if (enemy.engaged) {
        targetX = player.x;
        targetY = player.y;
        targetDistance = playerDistance;
        moveMode = 1;
        if (Math.abs(toPlayerX) > .5) enemy.facingX = toPlayerX < 0 ? -1 : 1;
      } else {
        moveSpeedRatio = WANDER_SPEED_RATIO;
        if (enemy.leashing || homeDistance > WANDER_RADIUS) {
          enemy.wandering = false;
          targetX = enemy.homeX;
          targetY = enemy.homeY;
          moveMode = 1;
          if (enemy.leashing) moveSpeedRatio = 1;
        } else if (enemy.wandering) {
          targetX = enemy.wanderTargetX;
          targetY = enemy.wanderTargetY;
          if (Math.hypot(targetX - enemy.x, targetY - enemy.y) < 8) {
            enemy.wandering = false;
            enemy.wanderWait = rand(2.2, 5.2);
            targetX = enemy.x;
            targetY = enemy.y;
          } else {
            moveMode = 1;
          }
        } else {
          enemy.wanderWait -= simulationDt;
          if (enemy.wanderWait <= 0) {
            const angle = Math.random() * TAU;
            const distance = rand(22, WANDER_RADIUS);
            enemy.wanderTargetX = enemy.homeX + Math.cos(angle) * distance;
            enemy.wanderTargetY = enemy.homeY + Math.sin(angle) * distance;
            enemy.wandering = true;
            targetX = enemy.wanderTargetX;
            targetY = enemy.wanderTargetY;
            moveMode = 1;
          }
        }

        targetDistance = Math.hypot(targetX - enemy.x, targetY - enemy.y) || 1;
        if (moveMode && Math.abs(targetX - enemy.x) > .5) enemy.facingX = targetX < enemy.x ? -1 : 1;

        if (homeDistance < 12 && enemy.hp < enemy.maxHp) {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .16 * simulationDt);
        }
      }

      const dx = (targetX - enemy.x) / targetDistance;
      const dy = (targetY - enemy.y) / targetDistance;

      if (base.ranged && enemy.engaged) {
        const preferred = 235;
        let rangedMove = 0;
        if (playerDistance > preferred + 25) rangedMove = 1;
        if (playerDistance < preferred - 35) rangedMove = -1;

        enemy.vx += (toPlayerX / playerDistance) * currentMoveSpeed * rangedMove * simulationDt * 6;
        enemy.vy += (toPlayerY / playerDistance) * currentMoveSpeed * rangedMove * simulationDt * 6;

        if (enemy.attackClock <= 0 && playerDistance < 390) {
          enemyShots.push({
            x: enemy.x,
            y: enemy.y,
            vx: toPlayerX / playerDistance * RANGED_PROJECTILE_SPEED,
            vy: toPlayerY / playerDistance * RANGED_PROJECTILE_SPEED,
            r: 6,
            damage: enemy.damage,
            life: 4,
          });
          const rangedAttackInterval = 1 / Math.max(.01, base.attackSpeed);
          enemy.attackClock = rand(rangedAttackInterval * .83, rangedAttackInterval * 1.17);
        }
      } else if (moveMode) {
        enemy.vx += dx * currentMoveSpeed * moveSpeedRatio * simulationDt * 7;
        enemy.vy += dy * currentMoveSpeed * moveSpeedRatio * simulationDt * 7;
      }

      enemy.vx *= Math.pow(.002, simulationDt);
      enemy.vy *= Math.pow(.002, simulationDt);
      enemy.x = clamp(enemy.x + enemy.vx * simulationDt, enemy.r, WORLD.w - enemy.r);
      enemy.y = clamp(enemy.y + enemy.vy * simulationDt, enemy.r, WORLD.h - enemy.r);

      if (enemy.engaged && enemy.attackClock <= 0 && circlesOverlap(player, enemy)) {
        if (damagePlayer(enemy.damage)) {
          enemy.attackClock = 1 / Math.max(.01, base.attackSpeed);
          enemy.moveSpeedRecovery = 0;
          enemy.vx = 0;
          enemy.vy = 0;
        }
      }

      keepOutsidePlayer(enemy, player);
    }

    separateCrowd(fullRateEnemies);
    for (let index = enemies.length - 1; index >= 0; index--) {
      if (enemies[index].dead) enemies.splice(index, 1);
    }
  }

  return { update };
}

function keepOutsidePlayer(enemy: EnemyState, player: PlayerState) {
  const collisionX = enemy.x - player.x;
  const collisionY = enemy.y - player.y;
  const minimumDistance = player.r + enemy.r;
  const collisionDistanceSq = collisionX * collisionX + collisionY * collisionY;
  if (collisionDistanceSq >= minimumDistance * minimumDistance) return;

  const collisionDistance = Math.sqrt(collisionDistanceSq);
  const nx = collisionDistance > .001 ? collisionX / collisionDistance : (enemy.facingX || 1);
  const ny = collisionDistance > .001 ? collisionY / collisionDistance : 0;
  enemy.x = clamp(player.x + nx * minimumDistance, enemy.r, WORLD.w - enemy.r);
  enemy.y = clamp(player.y + ny * minimumDistance, enemy.r, WORLD.h - enemy.r);
  const inwardSpeed = enemy.vx * nx + enemy.vy * ny;
  if (inwardSpeed < 0) {
    enemy.vx -= inwardSpeed * nx;
    enemy.vy -= inwardSpeed * ny;
  }
}

function separateCrowd(enemies: EnemyState[]) {
  // Only full-rate (nearby or engaged) enemies reach this O(n²) pass.
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minimumDistance = (a.r + b.r) * .72;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= 0 || distanceSquared >= minimumDistance * minimumDistance) continue;

      const distance = Math.sqrt(distanceSquared);
      const push = (minimumDistance - distance) * .5;
      const nx = dx / distance;
      const ny = dy / distance;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}
