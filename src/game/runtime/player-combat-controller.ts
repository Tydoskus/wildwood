import { PLAYER_KNOCKBACK_FORCE, WORLD } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel } from "../enemies";
import { circlesOverlap, distanceSquared } from "../math";
import type { ProjectileStore } from "./projectile-store";
import { createSpatialGrid } from "./spatial-grid";
import type { BossTarget, DragonBossState, EnemyState, FrostclawBossState, GloomrootBossState, KoiShogunBossState, MagmaliskBossState, MiremawBossState, PlayerState, RuntimeReward, SpiderBossState, TempestKirinBossState, TidewyrmBossState } from "./types";
import type { SpawnSite } from "../world";
import { equipmentDamageMultiplier, itemDefinition, weaponAttackInterval } from "../../../shared/items";
import { addPlayerBaseMaxHealth } from "./player-health";
import {
  absoluteAttackTimestamps,
  ATTACK_ANIMATION_SECONDS,
  attackAnimationClockAt,
  attackAnimationFinished,
  attackReleaseReached,
  type AbsoluteAttackTimestamps,
} from "../attack-timeline";
import {
  bossPlayerAttackCycle,
  type BossSimulationKind,
} from "../../../shared/boss-simulation";

const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
const DRAGON_HIT_BATCH_DELAY = .1;
const SPIDER_HIT_BATCH_DELAY = .1;
const FROSTCLAW_HIT_BATCH_DELAY = .1;
const MAGMALISK_HIT_BATCH_DELAY = .1;
const GLOOMROOT_HIT_BATCH_DELAY = .1;
const TIDEWYRM_HIT_BATCH_DELAY = .1;
const KOI_SHOGUN_HIT_BATCH_DELAY = .1;
const TEMPEST_KIRIN_HIT_BATCH_DELAY = .1;
const MIREMAW_HIT_BATCH_DELAY = .1;
const DEATH_PARTICLE_COLOR = "#e53935";
const TARGET_GRID_CELL_SIZE = 160;
const IDLE_TARGET_RECHECK_SECONDS = .08;
const MAX_SCHEDULE_LATE_SECONDS = .05;

type AttackTarget = { x: number; y: number; isBoss?: boolean };
type PendingPlayerAttack = {
  target: AttackTarget;
  timestamps: AbsoluteAttackTimestamps;
  projectileReleased: boolean;
};

/** Compatibility helpers, now derived from the same absolute phase record. */
export function playerAttackAnimationSpeed(attackInterval: number) {
  const timestamps = absoluteAttackTimestamps(0, attackInterval);
  return ATTACK_ANIMATION_SECONDS / (timestamps.animationEndsAtSeconds - timestamps.startedAtSeconds);
}

export function playerAttackWindupSeconds(attackInterval: number) {
  const timestamps = absoluteAttackTimestamps(0, attackInterval);
  return timestamps.releaseAtSeconds - timestamps.startedAtSeconds;
}

export function projectileSimulationSeconds(
  spawnedAtSeconds: number | undefined,
  nowSeconds: number,
  simulationStepSeconds: number,
) {
  const stepSeconds = Math.max(0, simulationStepSeconds);
  if (spawnedAtSeconds === undefined) return stepSeconds;
  return Math.max(0, nowSeconds - Math.max(nowSeconds - stepSeconds, spawnedAtSeconds));
}

/**
 * No target may shorten a future cooldown, but it must never disarm an attack
 * whose timestamp has already arrived. This preserves instant reacquisition.
 */
export function attackReadyAtWithoutTarget(nextAttackAtSeconds: number, nowSeconds: number) {
  return Math.min(nextAttackAtSeconds, nowSeconds + IDLE_TARGET_RECHECK_SECONDS);
}

export type PlayerCombatController = {
  attackNearest: () => void;
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
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  koiShogunBoss: KoiShogunBossState;
  tempestKirinBoss: TempestKirinBossState;
  miremawBoss: MiremawBossState;
  nowSeconds: () => number;
  serverNowMs?: () => number;
  localIdentity?: () => string | undefined;
  isTutorialMap: () => boolean;
  isDesertMap: () => boolean;
  isSnowMap: () => boolean;
  isLavaMap: () => boolean;
  isInfernalMap: () => boolean;
  isWaterMap: () => boolean;
  isSamuraiMap: () => boolean;
  isCloudspireMap: () => boolean;
  isMoonfenMap: () => boolean;
  engageEnemy: (enemy: EnemyState) => void;
  researchDamageMultiplier: () => number;
  researchAttackSpeedMultiplier?: () => number;
  researchCriticalChance: () => number;
  researchCriticalDamageMultiplier: () => number;
  researchRewardMultiplier: () => number;
  equippedWeapon: () => string;
  equippedWeaponUpgradeLevel?: () => number;
  equippedHead: () => string;
  equippedHeadUpgradeLevel?: () => number;
  equippedChest: () => string;
  equippedChestUpgradeLevel?: () => number;
  healthMultiplier: () => number;
  minAttackInterval: number;
  effectiveArmor: () => number;
  isDueling: () => boolean;
  scheduleEnemyRespawn: (site: SpawnSite) => void;
  incrementKills: () => void;
  recordForestEnemyDefeat: () => void;
  recordDesertEnemyDefeat: () => void;
  recordSnowEnemyDefeat: () => void;
  recordLavaEnemyDefeat: () => void;
  damageDragon: (hits: number) => void;
  damageSpider: (hits: number) => void;
  damageFrostclaw: (hits: number) => void;
  damageMagmalisk: (hits: number) => void;
  damageGloomroot: (hits: number) => void;
  damageTidewyrm: (hits: number) => void;
  damageKoiShogun: (hits: number) => void;
  damageTempestKirin: (hits: number) => void;
  damageMiremaw: (hits: number) => void;
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
    player, enemies, spawnSites, projectileStore, boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss, tempestKirinBoss, miremawBoss,
    isTutorialMap, isDesertMap, isSnowMap, isLavaMap, isInfernalMap, isWaterMap, isSamuraiMap, isCloudspireMap, isMoonfenMap, engageEnemy, researchDamageMultiplier, researchCriticalChance, researchCriticalDamageMultiplier,
    researchRewardMultiplier, minAttackInterval, effectiveArmor, isDueling, scheduleEnemyRespawn,
    incrementKills, recordForestEnemyDefeat, recordDesertEnemyDefeat, recordSnowEnemyDefeat, recordLavaEnemyDefeat, damageDragon, damageSpider, damageFrostclaw, damageMagmalisk, damageGloomroot, damageTidewyrm, damageKoiShogun, damageTempestKirin, damageMiremaw, spawnBurst, spawnParticle,
    spawnDamageNumber, logPickup, saveProgress, setHitFlash, addScreenShake, recordDeath, endGame,
  } = options;
  const { projectiles, enemyShots } = projectileStore;
  const targetGrid = createSpatialGrid<EnemyState>(TARGET_GRID_CELL_SIZE, WORLD.w, WORLD.h);
  const targetCandidates: EnemyState[] = [];
  let maxEnemyRadius = 0;
  let pendingPlayerAttack: PendingPlayerAttack | null = null;
  let nextAttackAtSeconds = 0;
  let lastBossAttackCycleKey = "";
  let pendingDragonHits = 0;
  let dragonHitBatchTimer = 0;
  let pendingSpiderHits = 0;
  let spiderHitBatchTimer = 0;
  let pendingFrostclawHits = 0;
  let frostclawHitBatchTimer = 0;
  let pendingMagmaliskHits = 0;
  let magmaliskHitBatchTimer = 0;
  let pendingGloomrootHits = 0;
  let gloomrootHitBatchTimer = 0;
  let pendingTidewyrmHits = 0;
  let tidewyrmHitBatchTimer = 0;
  let pendingKoiShogunHits = 0;
  let koiShogunHitBatchTimer = 0;
  let pendingTempestKirinHits = 0;
  let tempestKirinHitBatchTimer = 0;
  let pendingMiremawHits = 0;
  let miremawHitBatchTimer = 0;

  function activeMapBoss(): BossTarget | null {
    if (isTutorialMap()) return boss;
    if (isDesertMap()) return spiderBoss;
    if (isSnowMap()) return frostclawBoss;
    if (isLavaMap()) return magmaliskBoss;
    if (isInfernalMap()) return gloomrootBoss;
    if (isWaterMap()) return tidewyrmBoss;
    if (isSamuraiMap()) return koiShogunBoss;
    if (isCloudspireMap()) return tempestKirinBoss;
    if (isMoonfenMap()) return miremawBoss;
    return null;
  }

  function fireAt(
    target: AttackTarget,
    attackInterval: number,
    nowSeconds: number,
    scheduledAtSeconds?: number,
  ) {
    if (pendingPlayerAttack) return false;
    const scheduledAt = scheduledAtSeconds ?? (
      nextAttackAtSeconds > 0 && nowSeconds - nextAttackAtSeconds <= MAX_SCHEDULE_LATE_SECONDS
        ? nextAttackAtSeconds
        : nowSeconds
    );
    const timestamps = absoluteAttackTimestamps(scheduledAt, attackInterval);
    player.facing = Math.atan2(target.y - player.y, target.x - player.x);
    player.throwClock = attackAnimationClockAt(timestamps, nowSeconds);
    pendingPlayerAttack = { target, timestamps, projectileReleased: false };
    nextAttackAtSeconds = timestamps.nextAttackAtSeconds;
    player.attackClock = Math.max(0, nextAttackAtSeconds - nowSeconds);
    return true;
  }

  function bossKindFor(target: BossTarget): BossSimulationKind {
    return "bossKind" in target ? target.bossKind : "dragon";
  }

  /**
   * Starts the real local throw from the same absolute slot observers render.
   * Returning true means the shared boss cadence handled this frame, even when
   * the current slot is already idle or another throw is still finishing.
   */
  function fireAtSharedBossCycle(
    target: BossTarget,
    attackInterval: number,
    localNowSeconds: number,
  ) {
    const identity = options.localIdentity?.();
    if (!options.serverNowMs || !identity || target.encounter === null) return false;
    if (pendingPlayerAttack) return true;
    const serverNowMs = options.serverNowMs();
    const cycle = bossPlayerAttackCycle({
      kind: bossKindFor(target),
      encounter: target.encounter,
      playerId: identity,
      attackInterval,
      serverNowMs,
    });
    const cycleKey = `${bossKindFor(target)}:${target.encounter}:${cycle.attackIndex}`;
    if (lastBossAttackCycleKey === cycleKey) return true;
    const serverTimestamps = absoluteAttackTimestamps(cycle.startedAtMs / 1_000, attackInterval);
    const safeServerNowSeconds = (Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs) : 0) / 1_000;
    if (attackAnimationFinished(serverTimestamps, safeServerNowSeconds)) {
      lastBossAttackCycleKey = cycleKey;
      return true;
    }
    const localStartedAtSeconds = localNowSeconds - (safeServerNowSeconds - cycle.startedAtMs / 1_000);
    if (fireAt(target, attackInterval, localNowSeconds, localStartedAtSeconds)) {
      lastBossAttackCycleKey = cycleKey;
    }
    return true;
  }

  function launchPlayerStone(target: AttackTarget, releasedAtSeconds: number) {
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
      projectile.damage = player.damage * equipmentDamageMultiplier(
        weaponItem,
        options.equippedHead(),
        options.equippedChest(),
        researchDamageMultiplier(),
        options.equippedWeaponUpgradeLevel?.() ?? 0,
        options.equippedHeadUpgradeLevel?.() ?? 0,
        options.equippedChestUpgradeLevel?.() ?? 0,
      ) * (critical ? researchCriticalDamageMultiplier() : 1);
      projectile.critical = critical;
      projectile.hitLife = player.attackRange / player.projectileSpeed * projectileLifeBonus;
      projectile.life = (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / player.projectileSpeed * projectileLifeBonus;
      projectile.trail = 0;
      projectile.spawnedAtSeconds = releasedAtSeconds;
    }
    const projectileKind = itemDefinition(weaponItem)?.weapon?.projectile;
    if (projectileKind === "ARROW" || projectileKind === "ROCK") options.playBowAttackSound?.();
    spawnBurst(player.x + dx / distance * 17, player.y + dy / distance * 17, "#ffe36b", 4, 38);
  }

  function syncAttackTimeline(nowSeconds: number) {
    player.attackClock = Math.max(0, nextAttackAtSeconds - nowSeconds);
    if (!pendingPlayerAttack) {
      player.throwClock = 0;
      return;
    }
    const attack = pendingPlayerAttack;
    player.throwClock = attackAnimationClockAt(attack.timestamps, nowSeconds);
    if (!attack.projectileReleased && attackReleaseReached(attack.timestamps, nowSeconds)) {
      attack.projectileReleased = true;
      launchPlayerStone(attack.target, attack.timestamps.releaseAtSeconds);
    }
    if (!attackAnimationFinished(attack.timestamps, nowSeconds)) return;
    if (pendingPlayerAttack === attack) pendingPlayerAttack = null;
    player.throwClock = 0;
  }

  function attackNearest() {
    const nowSeconds = options.nowSeconds();
    syncAttackTimeline(nowSeconds);
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
    const mapBoss = activeMapBoss();
    if (mapBoss && !mapBoss.dead) {
      const edgeDistance = Math.max(0, Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y) - mapBoss.r);
      if (edgeDistance * edgeDistance < best) { best = edgeDistance * edgeDistance; target = mapBoss; }
    }
    player.combatFacing = target ? Math.atan2(target.y - player.y, target.x - player.x) : null;
    if (player.combatFacing !== null) player.facing = player.combatFacing;
    if (!target) {
      nextAttackAtSeconds = attackReadyAtWithoutTarget(nextAttackAtSeconds, nowSeconds);
      player.attackClock = Math.max(0, nextAttackAtSeconds - nowSeconds);
      return;
    }
    const attackInterval = weaponAttackInterval(options.equippedWeapon(), player.attackRate, options.researchAttackSpeedMultiplier?.() ?? 1, options.equippedWeaponUpgradeLevel?.() ?? 0);
    if (target.isBoss && fireAtSharedBossCycle(target, attackInterval, nowSeconds)) return;
    if (nowSeconds < nextAttackAtSeconds) return;
    fireAt(target, attackInterval, nowSeconds);
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
    if (isDesertMap() && !base.elite) recordDesertEnemyDefeat();
    if (isSnowMap()) recordSnowEnemyDefeat();
    if (isLavaMap() || isInfernalMap()) recordLavaEnemyDefeat();
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
    if (player.hp <= 0) {
      player.hp = 0;
      player.moving = false;
      player.combatFacing = null;
      breakEnemyLeashes();
      endGame();
      recordDeath();
    }
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
    const mapBoss = activeMapBoss();
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
    const nowSeconds = options.nowSeconds();
    syncAttackTimeline(nowSeconds);
    if (projectiles.length > 0) rebuildTargetGrid();
    for (const projectile of projectiles) {
      const projectileStepSeconds = projectileSimulationSeconds(projectile.spawnedAtSeconds, nowSeconds, dt);
      if (projectileStepSeconds <= 0) continue;
      const travelTime = Math.min(projectileStepSeconds, projectile.life);
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.vx * travelTime;
      const endY = startY + projectile.vy * travelTime;
      const hitTravelTime = Math.min(travelTime, Math.max(0, projectile.hitLife ?? projectile.life));
      const hit = hitTravelTime > 0 ? raycastProjectile(startX, startY, startX + projectile.vx * hitTravelTime, startY + projectile.vy * hitTravelTime, projectile.r) : null;
      projectile.life -= projectileStepSeconds;
      if (projectile.hitLife !== undefined) projectile.hitLife -= projectileStepSeconds;
      projectile.trail -= projectileStepSeconds;
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
          } else if ("bossKind" in target && target.bossKind === "magmalisk") {
            pendingMagmaliskHits += 1;
            magmaliskHitBatchTimer = MAGMALISK_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "gloomroot") {
            pendingGloomrootHits += 1;
            gloomrootHitBatchTimer = GLOOMROOT_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "tidewyrm") {
            pendingTidewyrmHits += 1;
            tidewyrmHitBatchTimer = TIDEWYRM_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "koiShogun") {
            pendingKoiShogunHits += 1;
            koiShogunHitBatchTimer = KOI_SHOGUN_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "tempestKirin") {
            pendingTempestKirinHits += 1;
            tempestKirinHitBatchTimer = TEMPEST_KIRIN_HIT_BATCH_DELAY;
          } else if ("bossKind" in target && target.bossKind === "miremaw") {
            pendingMiremawHits += 1;
            miremawHitBatchTimer = MIREMAW_HIT_BATCH_DELAY;
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
    if (isLavaMap() && pendingMagmaliskHits > 0) {
      magmaliskHitBatchTimer -= dt;
      if (magmaliskHitBatchTimer <= 0) { damageMagmalisk(pendingMagmaliskHits); pendingMagmaliskHits = 0; magmaliskHitBatchTimer = 0; }
    }
    if (isInfernalMap() && pendingGloomrootHits > 0) {
      gloomrootHitBatchTimer -= dt;
      if (gloomrootHitBatchTimer <= 0) { damageGloomroot(pendingGloomrootHits); pendingGloomrootHits = 0; gloomrootHitBatchTimer = 0; }
    }
    if (isWaterMap() && pendingTidewyrmHits > 0) {
      tidewyrmHitBatchTimer -= dt;
      if (tidewyrmHitBatchTimer <= 0) { damageTidewyrm(pendingTidewyrmHits); pendingTidewyrmHits = 0; tidewyrmHitBatchTimer = 0; }
    }
    if (isSamuraiMap() && pendingKoiShogunHits > 0) {
      koiShogunHitBatchTimer -= dt;
      if (koiShogunHitBatchTimer <= 0) { damageKoiShogun(pendingKoiShogunHits); pendingKoiShogunHits = 0; koiShogunHitBatchTimer = 0; }
    }
    if (isCloudspireMap() && pendingTempestKirinHits > 0) {
      tempestKirinHitBatchTimer -= dt;
      if (tempestKirinHitBatchTimer <= 0) { damageTempestKirin(pendingTempestKirinHits); pendingTempestKirinHits = 0; tempestKirinHitBatchTimer = 0; }
    }
    if (isMoonfenMap() && pendingMiremawHits > 0) {
      miremawHitBatchTimer -= dt;
      if (miremawHitBatchTimer <= 0) { damageMiremaw(pendingMiremawHits); pendingMiremawHits = 0; miremawHitBatchTimer = 0; }
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
      pendingMagmaliskHits = 0;
      magmaliskHitBatchTimer = 0;
      pendingGloomrootHits = 0;
      gloomrootHitBatchTimer = 0;
      pendingTidewyrmHits = 0;
      tidewyrmHitBatchTimer = 0;
      pendingKoiShogunHits = 0;
      koiShogunHitBatchTimer = 0;
      pendingTempestKirinHits = 0;
      tempestKirinHitBatchTimer = 0;
      pendingMiremawHits = 0;
      miremawHitBatchTimer = 0;
    },
    clearPendingThrow: () => {
      pendingPlayerAttack = null;
      nextAttackAtSeconds = 0;
      lastBossAttackCycleKey = "";
      player.attackClock = 0;
      player.throwClock = 0;
      player.combatFacing = null;
    },
  };
}
