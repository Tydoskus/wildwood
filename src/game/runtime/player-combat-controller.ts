import { PLAYER_KNOCKBACK_FORCE } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel } from "../enemies";
import { circlesOverlap, distanceSquared } from "../math";
import type { Particle } from "./combat-effects";
import type { BossTarget, DragonBossState, EnemyShot, EnemyState, PlayerState, Projectile, RuntimeReward, SpiderBossState } from "./types";
import type { SpawnSite } from "../world";

const PLAYER_THROW_SECONDS = .42;
const PLAYER_THROW_WINDUP_SECONDS = .12;
const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
const DRAGON_HIT_BATCH_DELAY = .1;
const SPIDER_HIT_BATCH_DELAY = .1;
const DEATH_PARTICLE_COLOR = "#e53935";

type AttackTarget = { x: number; y: number; isBoss?: boolean };

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
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  particles: Particle[];
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  isTutorialMap: () => boolean;
  isDesertMap: () => boolean;
  engageEnemy: (enemy: EnemyState) => void;
  researchDamageMultiplier: () => number;
  researchCriticalChance: () => number;
  researchRewardMultiplier: () => number;
  minAttackInterval: number;
  effectiveArmor: () => number;
  isDueling: () => boolean;
  getGameTime: () => number;
  incrementKills: () => void;
  damageDragon: (hits: number) => void;
  damageSpider: (hits: number) => void;
  syncBossAttackPosition: () => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  spawnDamageNumber: (x: number, y: number, amount: number) => void;
  logPickup: (text: string, color: string) => void;
  saveProgress: () => void;
  setHitFlash: () => void;
  addScreenShake: (amount: number) => void;
  recordDeath: () => void;
  endGame: () => void;
}): PlayerCombatController {
  const {
    player, enemies, spawnSites, projectiles, enemyShots, particles, boss, spiderBoss,
    isTutorialMap, isDesertMap, engageEnemy, researchDamageMultiplier, researchCriticalChance,
    researchRewardMultiplier, minAttackInterval, effectiveArmor, isDueling, getGameTime,
    incrementKills, damageDragon, damageSpider, syncBossAttackPosition, spawnBurst,
    spawnDamageNumber, logPickup, saveProgress, setHitFlash, addScreenShake, recordDeath, endGame,
  } = options;
  let pendingPlayerThrow: AttackTarget | null = null;
  let pendingDragonHits = 0;
  let dragonHitBatchTimer = 0;
  let pendingSpiderHits = 0;
  let spiderHitBatchTimer = 0;

  function fireAt(target: AttackTarget) {
    if (pendingPlayerThrow) return;
    player.facing = Math.atan2(target.y - player.y, target.x - player.x);
    player.throwClock = PLAYER_THROW_SECONDS;
    pendingPlayerThrow = target;
  }

  function launchPlayerStone(target: AttackTarget) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    if (target.isBoss) syncBossAttackPosition();
    for (let index = 0; index < player.projectileCount; index++) {
      const angle = baseAngle + (index - (player.projectileCount - 1) / 2) * .13;
      const projectileLifeBonus = 1.25;
      projectiles.push({
        x: player.x + Math.cos(angle) * 20,
        y: player.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * player.projectileSpeed,
        vy: Math.sin(angle) * player.projectileSpeed,
        r: 6,
        damage: player.damage * researchDamageMultiplier() * (Math.random() < researchCriticalChance() ? 2 : 1),
        hitLife: player.attackRange / player.projectileSpeed * projectileLifeBonus,
        life: (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / player.projectileSpeed * projectileLifeBonus,
        trail: 0,
      });
    }
    spawnBurst(player.x + dx / distance * 17, player.y + dy / distance * 17, "#ffe36b", 4, 38);
  }

  function advanceThrow(dt: number) {
    const previousThrowClock = player.throwClock;
    player.throwClock = Math.max(0, player.throwClock - dt);
    if (!pendingPlayerThrow || previousThrowClock <= PLAYER_THROW_SECONDS - PLAYER_THROW_WINDUP_SECONDS || player.throwClock > PLAYER_THROW_SECONDS - PLAYER_THROW_WINDUP_SECONDS) return;
    const target = pendingPlayerThrow;
    pendingPlayerThrow = null;
    launchPlayerStone(target);
  }

  function attackNearest(dt: number) {
    player.attackClock -= dt;
    if (player.attackClock > 0) return;
    let target: EnemyState | BossTarget | null = null;
    let best = player.attackRange * player.attackRange;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const distance = distanceSquared(player, enemy);
      if (distance < best) { best = distance; target = enemy; }
    }
    const mapBoss = isTutorialMap() ? boss : isDesertMap() ? spiderBoss : null;
    if (mapBoss && !mapBoss.dead) {
      const edgeDistance = Math.max(0, Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y) - mapBoss.r);
      if (edgeDistance * edgeDistance < best) { best = edgeDistance * edgeDistance; target = mapBoss; }
    }
    if (target) { fireAt(target); player.attackClock = player.attackRate; }
    else player.attackClock = Math.min(player.attackClock, .08);
  }

  function applyReward(reward: RuntimeReward, x: number, y: number) {
    const enhanced = { ...reward, amount: reward.amount * researchRewardMultiplier() };
    switch (enhanced.type) {
      case "damage": player.damage += enhanced.amount; break;
      case "health": player.maxHp += enhanced.amount; player.hp = Math.min(player.maxHp, player.hp + enhanced.amount); break;
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
    if (site) { site.alive = false; site.respawnAt = getGameTime() + 30; }
    const base = ENEMY_TYPES[enemy.type];
    applyReward(enemy.reward, enemy.x, enemy.y);
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
    if (player.hp <= 0) { player.hp = 0; breakEnemyLeashes(); recordDeath(); endGame(); }
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
    const mapBoss = isTutorialMap() ? boss : isDesertMap() ? spiderBoss : null;
    for (let index = mapBoss ? -1 : 0; index < enemies.length; index++) {
      const target = index < 0 ? mapBoss! : enemies[index];
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

  function updateProjectiles(dt: number) {
    advanceThrow(dt);
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
        spawnDamageNumber(target.x, target.y, projectile.damage);
        target.hurt = .12;
        projectile.life = 0;
        if (target.isBoss) {
          if ("bossKind" in target && target.bossKind === "spider") { pendingSpiderHits += 1; spiderHitBatchTimer = SPIDER_HIT_BATCH_DELAY; }
          else { pendingDragonHits += 1; dragonHitBatchTimer = DRAGON_HIT_BATCH_DELAY; }
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
        particles.push({ x: projectile.x, y: projectile.y, vx: 0, vy: 0, life: .16, maxLife: .16, size: 3, color: "#ffd957" });
      }
    }
    for (let index = projectiles.length - 1; index >= 0; index--) if (projectiles[index].life <= 0) projectiles.splice(index, 1);
    if (isTutorialMap() && pendingDragonHits > 0) {
      dragonHitBatchTimer -= dt;
      if (dragonHitBatchTimer <= 0) { damageDragon(pendingDragonHits); pendingDragonHits = 0; dragonHitBatchTimer = 0; }
    }
    if (isDesertMap() && pendingSpiderHits > 0) {
      spiderHitBatchTimer -= dt;
      if (spiderHitBatchTimer <= 0) { damageSpider(pendingSpiderHits); pendingSpiderHits = 0; spiderHitBatchTimer = 0; }
    }
    for (const shot of enemyShots) {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (circlesOverlap(shot, player)) { damagePlayer(shot.damage); shot.life = 0; }
    }
    for (let index = enemyShots.length - 1; index >= 0; index--) if (enemyShots[index].life <= 0) enemyShots.splice(index, 1);
  }

  return {
    attackNearest,
    updateProjectiles,
    damagePlayer,
    clearPendingBossHits: () => { pendingDragonHits = 0; dragonHitBatchTimer = 0; pendingSpiderHits = 0; spiderHitBatchTimer = 0; },
    clearPendingThrow: () => { pendingPlayerThrow = null; },
  };
}
