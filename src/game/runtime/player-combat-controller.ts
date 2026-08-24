import { PLAYER_KNOCKBACK_FORCE, WORLD } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel } from "../enemies";
import { circlesOverlap, distanceSquared } from "../math";
import type { ProjectileStore } from "./projectile-store";
import { createSpatialGrid } from "./spatial-grid";
import type { BossTarget, DragonBossState, EnemyState, FrostclawBossState, PlayerState, RuntimeReward, SpiderBossState } from "./types";
import type { SpawnSite } from "../world";
import { itemDefinition, weaponAttackInterval, weaponDamageMultiplier } from "../../../shared/items";
import { addPlayerBaseMaxHealth } from "./player-health";

const PLAYER_THROW_SECONDS = .42;
const PLAYER_THROW_WINDUP_SECONDS = .12;
const PLAYER_THROW_RELEASE_PROGRESS = PLAYER_THROW_WINDUP_SECONDS / PLAYER_THROW_SECONDS;
const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
const DRAGON_HIT_BATCH_DELAY = .1;
const SPIDER_HIT_BATCH_DELAY = .1;
const FROSTCLAW_HIT_BATCH_DELAY = .1;
const DEATH_PARTICLE_COLOR = "#e53935";
const TARGET_GRID_CELL_SIZE = 160;

type AttackTarget = { x: number; y: number; isBoss?: boolean };
type PendingPlayerThrow = { target: AttackTarget; delay: number };

export function playerAttackAnimationSpeed(attackInterval: number) {
  return Math.max(1, PLAYER_THROW_SECONDS / Math.max(.001, attackInterval));
}

export function playerAttackWindupSeconds(attackInterval: number) {
  return Math.min(
    PLAYER_THROW_WINDUP_SECONDS,
    Math.max(.001, attackInterval) * PLAYER_THROW_RELEASE_PROGRESS,
  );
}

export type PlayerCombatController = {
  attackNearest: (dt: number) => void;
  updateProjectiles: (dt: number) => void;
  damagePlayer: (amount: number) => boolean;
  clearPendingBossHits: () => void;
  clearPendingThrow: () => void;
};

/** Owns player attacks, projectile hits, enemy rewards, and incoming damage. */
export function createPlayerCombatController(options: {
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  projectileStore: ProjectileStore;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  isTutorialMap: () => boolean;
  isDesertMap: () => boolean;
  isSnowMap: () => boolean;
  engageEnemy: (enemy: EnemyState) => void;
  researchDamageMultiplier: () => number;
  researchAttackSpeedMultiplier?: () => number;
  researchCriticalChance: () => number;
  researchCriticalDamageMultiplier: () => number;
  researchRewardMultiplier: () => number;
  equippedWeapon: () => string;
  equippedWeaponUpgradeLevel?: () => number;
  healthMultiplier: () => number;
  minAttackInterval: number;
  effectiveArmor: () => number;
  isDueling: () => boolean;
  scheduleEnemyRespawn: (site: SpawnSite) => void;
  incrementKills: () => void;
  recordForestEnemyDefeat: () => void;
  damageDragon: (hits: number) => void;
  damageSpider: (hits: number) => void;
  damageFrostclaw: (hits: number) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  spawnParticle: (x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, color: string) => void;
  spawnDamageNumber: (x: number, y: number, amount: number, critical?: boolean) => void;
  playBowAttackSound?: () => void;
  logPickup: (text: string, color: string) => void;
  saveProgress: () => void;
  setHitFlash: () => void;
  addScreenShake: (amount: number) => void;
  recordDeath: () => void;
  endGame: () => void;
}): PlayerCombatController {
  const {
    player, enemies, spawnSites, projectileStore, boss, spiderBoss, frostclawBoss,
    isTutorialMap, isDesertMap, isSnowMap, engageEnemy, researchDamageMultiplier, researchCriticalChance, researchCriticalDamageMultiplier,
    researchRewardMultiplier, minAttackInterval, effectiveArmor, isDueling, scheduleEnemyRespawn,
    incrementKills, recordForestEnemyDefeat, damageDragon, damageSpider, damageFrostclaw, spawnBurst, spawnParticle,
    spawnDamageNumber, logPickup, saveProgress, setHitFlash, addScreenShake, recordDeath, endGame,
  } = options;
  const { projectiles, enemyShots } = projectileStore;
  const targetGrid = createSpatialGrid<EnemyState>(TARGET_GRID_CELL_SIZE, WORLD.w, WORLD.h);
  const targetCandidates: EnemyState[] = [];
  let maxEnemyRadius = 0;
  let pendingPlayerThrow: PendingPlayerThrow | null = null;
  let playerThrowAnimationSpeed = 1;
  let pendingDragonHits = 0;
  let dragonHitBatchTimer = 0;
  let pendingSpiderHits = 0;
  let spiderHitBatchTimer = 0;
  let pendingFrostclawHits = 0;
  let frostclawHitBatchTimer = 0;

  function fireAt(target: AttackTarget, attackInterval: number) {
    if (pendingPlayerThrow) return false;
    player.facing = Math.atan2(target.y - player.y, target.x - player.x);
    player.throwClock = PLAYER_THROW_SECONDS;
    playerThrowAnimationSpeed = playerAttackAnimationSpeed(attackInterval);
    pendingPlayerThrow = { target, delay: playerAttackWindupSeconds(attackInterval) };
    return true;
  }

  function launchPlayerStone(target: AttackTarget) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const weaponItem = options.equippedWeapon();
    for (let index = 0; index < player.projectileCount; index++) {
      const angle = baseAngle + (index - (player.projectileCount - 1) / 2) * .13;
      const projectileLifeBonus = 1.25;
      // Shared bosses validate aggregate hits on the server and do not accept
      // client-authored crit rolls. Keep boss numbers honest; regular enemies
      // remain client-simulated and use the full critical system.
      const critical = !target.isBoss && Math.random() < researchCriticalChance();
      const projectile = projectileStore.acquirePlayerProjectile();
      projectile.x = player.x + Math.cos(angle) * 20;
      projectile.y = player.y + Math.sin(angle) * 20;
      projectile.vx = Math.cos(angle) * player.projectileSpeed;
      projectile.vy = Math.sin(angle) * player.projectileSpeed;
      projectile.r = 6;
      projectile.damage = player.damage * weaponDamageMultiplier(weaponItem, researchDamageMultiplier(), options.equippedWeaponUpgradeLevel?.() ?? 0) * (critical ? researchCriticalDamageMultiplier() : 1);
      projectile.critical = critical;
      projectile.hitLife = player.attackRange / player.projectileSpeed * projectileLifeBonus;
      projectile.life = (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / player.projectileSpeed * projectileLifeBonus;
      projectile.trail = 0;
    }
    if (itemDefinition(weaponItem)?.weapon?.projectile === "ARROW") options.playBowAttackSound?.();
    spawnBurst(player.x + dx / distance * 17, player.y + dy / distance * 17, "#ffe36b", 4, 38);
  }

  function advanceThrow(dt: number) {
    player.throwClock = Math.max(0, player.throwClock - dt * playerThrowAnimationSpeed);
    if (!pendingPlayerThrow) return;
    pendingPlayerThrow.delay -= dt;
    if (pendingPlayerThrow.delay > 0) return;
    const target = pendingPlayerThrow.target;
    pendingPlayerThrow = null;
    launchPlayerStone(target);
  }

  function attackNearest(dt: number) {
    player.attackClock -= dt;
    let target: EnemyState | BossTarget | null = null;
    let best = player.attackRange * player.attackRange;
    rebuildTargetGrid();
    targetGrid.queryBounds(
      player.x - player.attackRange,
      player.y - player.attackRange,
      player.x + player.attackRange,
      player.y + player.attackRange,
      targetCandidates,
    );
    for (const enemy of targetCandidates) {
      const distance = distanceSquared(player, enemy);
      if (distance < best) { best = distance; target = enemy; }
    }
    const mapBoss = isTutorialMap() ? boss : isDesertMap() ? spiderBoss : isSnowMap() ? frostclawBoss : null;
    if (mapBoss && !mapBoss.dead) {
      const edgeDistance = Math.max(0, Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y) - mapBoss.r);
      if (edgeDistance * edgeDistance < best) { best = edgeDistance * edgeDistance; target = mapBoss; }
    }
    player.combatFacing = target ? Math.atan2(target.y - player.y, target.x - player.x) : null;
    if (player.combatFacing !== null) player.facing = player.combatFacing;
    if (player.attackClock > 0) return;
    if (target) {
      const attackInterval = weaponAttackInterval(options.equippedWeapon(), player.attackRate, options.researchAttackSpeedMultiplier?.() ?? 1, options.equippedWeaponUpgradeLevel?.() ?? 0);
      if (fireAt(target, attackInterval)) player.attackClock += attackInterval;
    } else player.attackClock = Math.min(player.attackClock, .08);
  }

  function applyReward(reward: RuntimeReward, x: number, y: number) {
    const enhanced = { ...reward, amount: reward.amount * researchRewardMultiplier() };
    switch (enhanced.type) {
      case "damage": player.damage += enhanced.amount; break;
      case "health": addPlayerBaseMaxHealth(player, enhanced.amount, options.healthMultiplier()); break;
      case "speed": player.attackRate = 1 / Math.min(1 / minAttackInterval, 1 / player.attackRate + enhanced.amount); break;
      case "armor": player.armor += enhanced.amount; break;
      case "regen": player.regen += enhanced.amount; break;
    }
    const data = REWARD_DATA[enhanced.type];
    logPickup(rewardLabel(enhanced), data.color);
    spawnBurst(x, y, DEATH_PARTICLE_COLOR, 16, 110);
    saveProgress();
  }

  function killEnemy(enemy: EnemyState) {
    if (enemy.dead) return;
    enemy.dead = true;
    incrementKills();
    const site = spawnSites[enemy.siteId];
    if (site) scheduleEnemyRespawn(site);
    const base = ENEMY_TYPES[enemy.type];
    applyReward(enemy.reward, enemy.x, enemy.y);
    if (isTutorialMap()) recordForestEnemyDefeat();
    spawnBurst(enemy.x, enemy.y, DEATH_PARTICLE_COLOR, base.elite ? 28 : 12, base.elite ? 150 : 90);
  }

  function breakEnemyLeashes() {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      enemy.engaged = false;
      enemy.leashing = true;
      enemy.attackClock = Math.max(enemy.attackClock, .5);
    }
  }

  function damagePlayer(amount: number) {
    if (isDueling() || player.hurtClock > 0) return false;
    const dealt = damageAfterArmor(amount, effectiveArmor());
    player.hp -= dealt;
    spawnDamageNumber(player.x, player.y, dealt);
    player.hurtClock = .1;
    setHitFlash();
    addScreenShake(7);
    spawnBurst(player.x, player.y, "#ff5f55", 13, 115);
    if (player.hp <= 0) { player.hp = 0; player.combatFacing = null; breakEnemyLeashes(); recordDeath(); endGame(); }
    return true;
  }

  function raycastProjectile(startX: number, startY: number, endX: number, endY: number, radius: number) {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return null;
    const invLength = 1 / Math.sqrt(lengthSq);
    let closest: EnemyState | BossTarget | null = null;
    let closestT = Infinity;
    const mapBoss = isTutorialMap() ? boss : isDesertMap() ? spiderBoss : isSnowMap() ? frostclawBoss : null;
    const padding = radius + maxEnemyRadius;
    targetGrid.queryBounds(
      Math.min(startX, endX) - padding,
      Math.min(startY, endY) - padding,
      Math.max(startX, endX) + padding,
      Math.max(startY, endY) + padding,
      targetCandidates,
    );
    if (mapBoss && !mapBoss.dead) targetCandidates.push(mapBoss as unknown as EnemyState);
    for (const target of targetCandidates as Array<EnemyState | BossTarget>) {
      if (target.dead) continue;
      const ex = target.x - startX;
      const ey = target.y - startY;
      const hitRadius = radius + target.r;
      const hitRadiusSq = hitRadius * hitRadius;
      const startDistanceSq = ex * ex + ey * ey;
      let t = 0;
      if (startDistanceSq > hitRadiusSq) {
        const projectedT = (ex * dx + ey * dy) / lengthSq;
        if (projectedT < 0 || projectedT > 1) continue;
        const nearestX = startX + dx * projectedT;
        const nearestY = startY + dy * projectedT;
        const nearestDistanceX = target.x - nearestX;
        const nearestDistanceY = target.y - nearestY;
        const nearestDistanceSq = nearestDistanceX * nearestDistanceX + nearestDistanceY * nearestDistanceY;
        if (nearestDistanceSq > hitRadiusSq) continue;
        t = projectedT - Math.sqrt(hitRadiusSq - nearestDistanceSq) * invLength;
        if (t < 0 || t > 1) continue;
      }
      if (t < closestT) { closestT = t; closest = target; }
    }
    return closest ? { enemy: closest, t: closestT } : null;
  }

  function rebuildTargetGrid() {
    targetGrid.clear();
    maxEnemyRadius = 0;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      targetGrid.insert(enemy);
      maxEnemyRadius = Math.max(maxEnemyRadius, enemy.r);
    }
  }

  function updateProjectiles(dt: number) {
    advanceThrow(dt);
    if (projectiles.length > 0) rebuildTargetGrid();
    for (const projectile of projectiles) {
      const travelTime = Math.min(dt, projectile.life);
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.vx * travelTime;
      const endY = startY + projectile.vy * travelTime;
      const hitTravelTime = Math.min(travelTime, Math.max(0, projectile.hitLife ?? projectile.life));
      const hit = hitTravelTime > 0 ? raycastProjectile(startX, startY, startX + projectile.vx * hitTravelTime, startY + projectile.vy * hitTravelTime, projectile.r) : null;
      projectile.life -= dt;
      if (projectile.hitLife !== undefined) projectile.hitLife -= dt;
      projectile.trail -= dt;
      if (hit) {
        projectile.x = startX + (endX - startX) * hit.t;
        projectile.y = startY + (endY - startY) * hit.t;
        const target = hit.enemy;
        spawnDamageNumber(target.x, target.y, projectile.damage, projectile.critical);
        target.hurt = .12;
        projectile.life = 0;
        if (target.isBoss) {
          if ("bossKind" in target && target.bossKind === "spider") {
            pendingSpiderHits += 1;
            spiderHitBatchTimer = SPIDER_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "frostclaw") {
            pendingFrostclawHits += 1;
            frostclawHitBatchTimer = FROSTCLAW_HIT_BATCH_DELAY;
          } else {
            pendingDragonHits += 1;
            dragonHitBatchTimer = DRAGON_HIT_BATCH_DELAY;
          }
        } else {
          engageEnemy(target);
          target.hp -= projectile.damage;
          if (player.knockback > 0) {
            const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
            const angle = Math.atan2(projectile.vy, projectile.vx);
            target.vx += Math.cos(angle) * force;
            target.vy += Math.sin(angle) * force;
          }
          if (target.hp <= 0) killEnemy(target);
        }
        spawnBurst(projectile.x, projectile.y, "#fff0a1", 5, 52);
      } else { projectile.x = endX; projectile.y = endY; }
      if (projectile.trail <= 0) {
        projectile.trail = .035;
        spawnParticle(projectile.x, projectile.y, 0, 0, .16, .16, 3, "#ffd957");
      }
    }
    projectileStore.compactPlayerProjectiles();
    if (isTutorialMap() && pendingDragonHits > 0) {
      dragonHitBatchTimer -= dt;
      if (dragonHitBatchTimer <= 0) { damageDragon(pendingDragonHits); pendingDragonHits = 0; dragonHitBatchTimer = 0; }
    }
    if (isDesertMap() && pendingSpiderHits > 0) {
      spiderHitBatchTimer -= dt;
      if (spiderHitBatchTimer <= 0) { damageSpider(pendingSpiderHits); pendingSpiderHits = 0; spiderHitBatchTimer = 0; }
    }
    if (isSnowMap() && pendingFrostclawHits > 0) {
      frostclawHitBatchTimer -= dt;
      if (frostclawHitBatchTimer <= 0) { damageFrostclaw(pendingFrostclawHits); pendingFrostclawHits = 0; frostclawHitBatchTimer = 0; }
    }
    for (const shot of enemyShots) {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (circlesOverlap(shot, player)) { damagePlayer(shot.damage); shot.life = 0; }
    }
    projectileStore.compactEnemyShots();
  }

  return {
    attackNearest,
    updateProjectiles,
    damagePlayer,
    clearPendingBossHits: () => {
      pendingDragonHits = 0;
      dragonHitBatchTimer = 0;
      pendingSpiderHits = 0;
      spiderHitBatchTimer = 0;
      pendingFrostclawHits = 0;
      frostclawHitBatchTimer = 0;
    },
    clearPendingThrow: () => { pendingPlayerThrow = null; playerThrowAnimationSpeed = 1; player.throwClock = 0; player.combatFacing = null; },
  };
}
