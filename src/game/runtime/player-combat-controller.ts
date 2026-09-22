import { isMeleeWeapon, weaponAttackRange, segmentCircleHit } from "../weapon-combat";
import { isProceduralMap } from "../../../shared/procedural-maps";
import { bossSurfaceDistance } from "../../../shared/boss-hitbox";
import { isEnemyAttackingPlayer } from "./enemy-threat";
import { PLAYER_KNOCKBACK_FORCE, WORLD } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel, type EnemyKind } from "../enemies";
import { circlesOverlap } from "../math";
import type { ProjectileStore } from "./projectile-store";
import { createSpatialGrid } from "./spatial-grid";
import type { BossTarget, DragonBossState, EnemyState, FrostclawBossState, GloomrootBossState, KoiShogunBossState, MagmaliskBossState, MiremawBossState, PrismshellBossState, IronhornBossState, DreadreaperBossState, VoltwardenBossState, GravebloomBossState, AegisPrimeBossState, PlayerState, RuntimeReward, SpiderBossState, TempestKirinBossState, TidewyrmBossState } from "./types";
import type { SpawnSite } from "../world";
import { equipmentDamage, itemDefinition } from "../../../shared/items";
import { addPlayerBaseMaxHealth } from "./player-health";
import {
  absoluteAttackTimestamps,
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
const DEATH_PARTICLE_COLOR = "#e53935";
const TARGET_GRID_CELL_SIZE = 160;
// Collision settling must not flip aim between equally close enemies every frame.
const TARGET_SWITCH_DISTANCE = 12;
const TARGET_SEARCH_INTERVAL_SECONDS = .08;
const FACING_HORIZONTAL_DEAD_ZONE = 3;
const IDLE_TARGET_RECHECK_SECONDS = .08;
const MAX_SCHEDULE_LATE_SECONDS = .05;

type AttackTarget = { x: number; y: number; isBoss?: boolean };
type PendingPlayerAttack = {
  target: AttackTarget;
  timestamps: AbsoluteAttackTimestamps;
  projectileReleased: boolean;
  weaponItem: string;
};

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
  attackNearest: (enemyType?: EnemyKind | null, campName?: string | null) => void;
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
  prismshellBoss: PrismshellBossState;
  ironhornBoss: IronhornBossState;
  dreadreaperBoss: DreadreaperBossState;
  voltwardenBoss: VoltwardenBossState;
  gravebloomBoss: GravebloomBossState;
  aegisPrimeBoss: AegisPrimeBossState;
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
  isCrystalHollowsMap: () => boolean;
  isClockworkRuinsMap: () => boolean;
  isDuskfallOrchardMap: () => boolean;
  isNeonBastionMap: () => boolean;
  isVerdantCatacombsMap: () => boolean;
  isIonCitadelMap: () => boolean;
  engageEnemy: (enemy: EnemyState) => void;
  researchDamageMultiplier: () => number;
  researchCriticalChance: () => number;
  researchCriticalDamageMultiplier: () => number;
  researchRewardMultiplier: () => number;
  /** Chance for a hit to land a second time, from the Double Strike perk. */
  prestigeDoubleStrike?: () => number;
  /** Chance for a swing to also reach a second enemy, from the Split Shot perk. */
  prestigeSplitShot?: () => number;
  equippedWeapon: () => string;
  equippedWeaponUpgradeLevel?: () => number;
  equippedHead: () => string;
  equippedHeadUpgradeLevel?: () => number;
  equippedChest: () => string;
  equippedChestUpgradeLevel?: () => number;
  healthMultiplierBonus: () => number;
  minAttackInterval: number;
  effectiveArmor: () => number;
  isDueling: () => boolean;
  scheduleEnemyRespawn: (site: SpawnSite) => void;
  recordRegularEnemyDefeat: (mapId: string, enemy: string) => void;
  incrementKills: () => void;
  hitPersonalBoss?: (damage: number, x: number, y: number, critical: boolean) => void;
  hitGeneratedBoss?: (enemy: EnemyState, damage: number, critical: boolean) => boolean;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  spawnParticle: (x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, color: string) => void;
  spawnDamageNumber: (x: number, y: number, amount: number, critical?: boolean, damageTaken?: boolean) => void;
  drainBossHitResults?: () => { mapId: string; x: number; y: number; damage: number; critical: boolean }[];
  currentMapId?: () => string;
  onEnemyDefeated?: (enemy: EnemyState) => boolean;
  onCombat?: () => void;
  playBowAttackSound?: () => void;
  logPickup: (text: string, color: string) => void;
  saveProgress: () => void;
  setHitFlash: () => void;
  addScreenShake: (amount: number) => void;
  recordDeath: () => void;
  endGame: () => void;
}): PlayerCombatController {
  const {
    player, enemies, spawnSites, projectileStore, boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss, tempestKirinBoss, miremawBoss, prismshellBoss, ironhornBoss, dreadreaperBoss, voltwardenBoss, gravebloomBoss, aegisPrimeBoss,
    isTutorialMap, isDesertMap, isSnowMap, isLavaMap, isInfernalMap, isWaterMap, isSamuraiMap, isCloudspireMap, isMoonfenMap, isCrystalHollowsMap, isClockworkRuinsMap, isDuskfallOrchardMap, isNeonBastionMap, isVerdantCatacombsMap, isIonCitadelMap, engageEnemy, researchDamageMultiplier, researchCriticalChance, researchCriticalDamageMultiplier,
    researchRewardMultiplier, minAttackInterval, effectiveArmor, isDueling, scheduleEnemyRespawn,
    incrementKills, recordRegularEnemyDefeat, spawnBurst, spawnParticle,
    spawnDamageNumber, logPickup, saveProgress, setHitFlash, addScreenShake, recordDeath, endGame,
  } = options;
  const { projectiles, enemyShots } = projectileStore;
  const targetGrid = createSpatialGrid<EnemyState>(TARGET_GRID_CELL_SIZE, WORLD.w, WORLD.h);
  const targetCandidates: EnemyState[] = [];
  let retainedTarget: EnemyState | BossTarget | null = null;
  let nextTargetSearchAt = 0;
  let searchedEnemyCount = -1;
  let searchedEnemyType: EnemyKind | null = null;
  let searchedCampName: string | null = null;
  let searchedRange = 0;
  let searchedBoss: BossTarget | null = null;
  let searchedBossAlive = false;
  let maxEnemyRadius = 0;
  let pendingPlayerAttack: PendingPlayerAttack | null = null;
  let nextAttackAtSeconds = 0;
  let lastBossAttackCycleKey = "";

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
    if (isClockworkRuinsMap()) return ironhornBoss; else if (isIonCitadelMap()) return aegisPrimeBoss; else if (isVerdantCatacombsMap()) return gravebloomBoss; else if (isNeonBastionMap()) return voltwardenBoss; else if (isDuskfallOrchardMap()) return dreadreaperBoss; else if (isCrystalHollowsMap()) return prismshellBoss;
    return null;
  }

  function faceTarget(target: AttackTarget) {
    const dx = target.x - player.x;
    // Keep the body/held-weapon mirror stable when aiming almost vertically.
    if (Math.abs(dx) > FACING_HORIZONTAL_DEAD_ZONE) player.facing = Math.atan2(target.y - player.y, dx);
  }

  function fireAt(
    target: AttackTarget,
    attackInterval: number,
    nowSeconds: number,
    scheduledAtSeconds?: number,
  ) {
    if (pendingPlayerAttack) return false;
    options.onCombat?.();
    const scheduledAt = scheduledAtSeconds ?? (
      nextAttackAtSeconds > 0 && nowSeconds - nextAttackAtSeconds <= MAX_SCHEDULE_LATE_SECONDS
        ? nextAttackAtSeconds
        : nowSeconds
    );
    const timestamps = absoluteAttackTimestamps(scheduledAt, attackInterval);
    faceTarget(target);
    player.throwClock = attackAnimationClockAt(timestamps, nowSeconds);
    pendingPlayerAttack = { target, timestamps, projectileReleased: false, weaponItem: options.equippedWeapon() };
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

  const attackRange = () => weaponAttackRange(options.equippedWeapon(), player.attackRange);
  const targetDistance = (target: EnemyState | BossTarget) => {
    const dx = player.x - target.x, dy = player.y - target.y;
    // A boss is an ellipse when it carries one; everything else is the circle
    // this always was. Prediction has to agree with the server or a shot the
    // client counts is rejected.
    if (target.isBoss) {
      const boss = target as BossTarget & { ry?: number; hitboxOffsetY?: number };
      return Math.max(0, bossSurfaceDistance(dx, dy, boss.r, boss.ry, boss.hitboxOffsetY));
    }
    return Math.max(0, Math.hypot(dx, dy) - (isMeleeWeapon(options.equippedWeapon()) ? target.r : 0));
  };
  function weaponDamage(critical: boolean) {
    return equipmentDamage(player.damage, options.equippedWeapon(), options.equippedHead(), options.equippedChest(),
      researchDamageMultiplier(), options.equippedWeaponUpgradeLevel?.() ?? 0,
      options.equippedHeadUpgradeLevel?.() ?? 0, options.equippedChestUpgradeLevel?.() ?? 0) *
      (critical ? researchCriticalDamageMultiplier() : 1);
  }
  /** The nearest other enemy a Split Shot could also reach. Bosses stand alone. */
  function splitShotTarget(primary: EnemyState | BossTarget | null) {
    if (Math.random() >= (options.prestigeSplitShot?.() ?? 0)) return null;
    const reach = attackRange();
    let best: EnemyState | null = null, bestDistance = Infinity;
    for (const enemy of enemies) {
      if (enemy === primary || enemy.dead) continue;
      const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y) - enemy.r;
      if (distance <= reach && distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
  }

  function strikeMelee(target: AttackTarget) {
    rebuildTargetGrid();
    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    const hit = raycastProjectile(player.x, player.y, player.x + Math.cos(angle) * attackRange(), player.y + Math.sin(angle) * attackRange(), 0);
    if (!hit) return;
    const critical = (!hit.enemy.isBoss || Boolean(options.hitPersonalBoss)) && Math.random() < researchCriticalChance();
    // Double Strike lands the same blow twice rather than hitting harder, so a
    // second kill can come out of one swing.
    const strikes = Math.random() < (options.prestigeDoubleStrike?.() ?? 0) ? 2 : 1;
    for (let strike = 0; strike < strikes; strike++) applyPlayerHit(hit.enemy, weaponDamage(critical), critical, angle);
    spawnBurst(player.x + Math.cos(angle) * attackRange() * hit.t, player.y + Math.sin(angle) * attackRange() * hit.t, "#f3f7ff", 6, 55);
    const second = splitShotTarget(hit.enemy);
    if (second) applyPlayerHit(second, weaponDamage(critical), critical, Math.atan2(second.y - player.y, second.x - player.x));
  }

  function launchPlayerStone(target: AttackTarget, releasedAtSeconds: number) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const weaponItem = options.equippedWeapon();
    const fire = (angle: number) => {
      const projectileLifeBonus = 1.25;
      // Personal bosses use the same crit roll as ordinary enemies. Only the
      // legacy shared-boss path waits for server-confirmed critical damage.
      const critical = (!target.isBoss || Boolean(options.hitPersonalBoss)) && Math.random() < researchCriticalChance();
      const projectile = projectileStore.acquirePlayerProjectile();
      projectile.x = player.x + Math.cos(angle) * 20;
      projectile.y = player.y + Math.sin(angle) * 20;
      projectile.vx = Math.cos(angle) * player.projectileSpeed;
      projectile.vy = Math.sin(angle) * player.projectileSpeed;
      projectile.r = 6;
      // Each arrow rolls its own second hit, landing as one heavier impact.
      projectile.damage = weaponDamage(critical) * (Math.random() < (options.prestigeDoubleStrike?.() ?? 0) ? 2 : 1);
      projectile.critical = critical;
      projectile.hitLife = player.attackRange / player.projectileSpeed * projectileLifeBonus;
      projectile.life = (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / player.projectileSpeed * projectileLifeBonus;
      projectile.trail = 0;
      projectile.spawnedAtSeconds = releasedAtSeconds;
    };
    for (let index = 0; index < player.projectileCount; index++) {
      fire(baseAngle + (index - (player.projectileCount - 1) / 2) * .13);
    }
    // Split Shot sends one more arrow at whoever else is in range.
    const second = splitShotTarget(target.isBoss ? null : target as EnemyState);
    if (second) fire(Math.atan2(second.y - player.y, second.x - player.x));
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
    if (attack.weaponItem !== options.equippedWeapon()) { pendingPlayerAttack = null; player.throwClock = 0; return; }
    player.throwClock = attackAnimationClockAt(attack.timestamps, nowSeconds);
    if (!attack.projectileReleased && attackReleaseReached(attack.timestamps, nowSeconds)) {
      attack.projectileReleased = true;
      if (isMeleeWeapon(attack.weaponItem)) strikeMelee(attack.target);
      else launchPlayerStone(attack.target, attack.timestamps.releaseAtSeconds);
    }
    if (!attackAnimationFinished(attack.timestamps, nowSeconds)) return;
    if (pendingPlayerAttack === attack) pendingPlayerAttack = null;
    player.throwClock = 0;
  }

  function targetIsEligible(target: EnemyState | BossTarget, enemyType: EnemyKind | null, campName: string | null, mapBoss: BossTarget | null) {
    if (target.dead) return false;
    if (target.isBoss) return !enemyType && target === mapBoss &&
      targetDistance(target) < attackRange();
    if (targetDistance(target) >= attackRange()) return false;
    if (!enemyType) return true;
    return !target.generatedBoss && !target.remoteCombatGhost &&
      (isEnemyAttackingPlayer(target, options.localIdentity?.()) ||
        (target.type === enemyType && (!campName || target.campName === campName)));
  }

  function findAttackTarget(enemyType: EnemyKind | null, campName: string | null, mapBoss: BossTarget | null) {
    let target: EnemyState | BossTarget | null = null;
    let best = attackRange() * attackRange();
    // A direct scan avoids rebuilding the projectile grid just to choose one target.
    let defending = false;
    let retainedDistance = Infinity;
    let retainedThreat = false;
    for (const enemy of enemies) {
      if (enemy.dead || (enemyType && enemy.generatedBoss)) continue;
      const threat = Boolean(enemyType && isEnemyAttackingPlayer(enemy, options.localIdentity?.()));
      if (enemyType && ((!threat && (enemy.type !== enemyType || Boolean(campName && enemy.campName !== campName))) || enemy.remoteCombatGhost)) continue;
      const distance = targetDistance(enemy) ** 2;
      if (distance >= attackRange() * attackRange()) continue;
      if (enemy === retainedTarget) { retainedDistance = distance; retainedThreat = threat; }
      if ((threat && !defending) || (threat === defending && distance < best)) {
        best = distance; target = enemy; defending = threat;
      }
    }
    if (!enemyType && mapBoss && !mapBoss.dead) {
      const edgeDistance = Math.max(0, Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y) - mapBoss.r);
      if (mapBoss === retainedTarget && edgeDistance < attackRange()) retainedDistance = edgeDistance * edgeDistance;
      if (edgeDistance * edgeDistance < best) { best = edgeDistance * edgeDistance; target = mapBoss; }
    }
    if (target && retainedTarget && retainedThreat === defending &&
        Math.sqrt(retainedDistance) <= Math.sqrt(best) + TARGET_SWITCH_DISTANCE) target = retainedTarget;
    return target;
  }

  function attackNearest(enemyType: EnemyKind | null = null, campName: string | null = null) {
    const nowSeconds = options.nowSeconds();
    syncAttackTimeline(nowSeconds);
    const mapBoss = activeMapBoss();
    const bossAlive = Boolean(mapBoss && !mapBoss.dead);
    // The current target and aim update every frame; only acquisition is throttled.
    if (nowSeconds >= nextTargetSearchAt || enemies.length !== searchedEnemyCount ||
        enemyType !== searchedEnemyType || campName !== searchedCampName || attackRange() !== searchedRange ||
        mapBoss !== searchedBoss || bossAlive !== searchedBossAlive ||
        (retainedTarget && !targetIsEligible(retainedTarget, enemyType, campName, mapBoss))) {
      retainedTarget = findAttackTarget(enemyType, campName, mapBoss);
      nextTargetSearchAt = nowSeconds + TARGET_SEARCH_INTERVAL_SECONDS;
      searchedEnemyCount = enemies.length;
      searchedEnemyType = enemyType;
      searchedCampName = campName;
      searchedRange = attackRange();
      searchedBoss = mapBoss;
      searchedBossAlive = bossAlive;
    }
    const target = retainedTarget;
    player.combatFacing = target ? Math.atan2(target.y - player.y, target.x - player.x) : null;
    if (target) faceTarget(target);
    if (!target) {
      nextAttackAtSeconds = attackReadyAtWithoutTarget(nextAttackAtSeconds, nowSeconds);
      player.attackClock = Math.max(0, nextAttackAtSeconds - nowSeconds);
      return;
    }
    const attackInterval = player.attackRate;
    if (target.isBoss && fireAtSharedBossCycle(target, attackInterval, nowSeconds)) return;
    if (nowSeconds < nextAttackAtSeconds) return;
    fireAt(target, attackInterval, nowSeconds);
  }

  function applyReward(reward: RuntimeReward, x: number, y: number) {
    const enhanced = { ...reward, amount: reward.amount * researchRewardMultiplier() };
    switch (enhanced.type) {
      case "damage": player.damage += enhanced.amount; break;
      case "health": addPlayerBaseMaxHealth(player, enhanced.amount, options.healthMultiplierBonus()); break;
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
    if (options.onEnemyDefeated?.(enemy)) {
      spawnBurst(enemy.x, enemy.y, DEATH_PARTICLE_COLOR, 12, 90);
      return;
    }
    incrementKills();
    const site = spawnSites[enemy.siteId];
    if (site) scheduleEnemyRespawn(site);
    const base = enemy.definition ?? ENEMY_TYPES[enemy.type];
    applyReward(enemy.reward, enemy.x, enemy.y);
    const mapId = options.currentMapId?.() ?? (isTutorialMap() ? "tutorial_forest" : isDesertMap() ? "beginner_desert" : isSnowMap() ? "intermediate_snowlands" : isLavaMap() ? "advanced_lava_wastes" : isInfernalMap() ? "infernal_depths" : "");
    recordRegularEnemyDefeat(mapId, isProceduralMap(mapId) ? `site:${enemy.siteId}` : enemy.type);
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
    if (dealt > 0) options.onCombat?.();
    player.hp -= dealt;
    spawnDamageNumber(player.x, player.y, dealt, false, true);
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
      const t = segmentCircleHit(ex, ey, dx, dy, radius + target.r);
      if (t === null) continue;
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

  function applyPlayerHit(target: EnemyState | BossTarget, damage: number, critical: boolean, angle: number) {
    if (!target.isBoss && !target.generatedBoss) spawnDamageNumber(target.x, target.y, damage, critical);
    target.hurt = .12;
    if (target.isBoss && options.hitPersonalBoss) {
      options.hitPersonalBoss(damage, target.x, target.y, critical === true);
    } else if (target.isBoss) {
      // No personal-boss handler is wired up (never happens in production,
      // where main.ts always supplies hitPersonalBoss for boss targets).
    } else if (options.hitGeneratedBoss?.(target, damage, critical)) {
      // The generated-boss controller owns its health and defeat handling.
    } else {
      engageEnemy(target);
      target.hp -= damage;
      if (player.knockback > 0) {
        const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
        target.vx += Math.cos(angle) * force;
        target.vy += Math.sin(angle) * force;
      }
      if (target.hp <= 0) killEnemy(target);
    }
  }

  function updateProjectiles(dt: number) {
    for (const hit of options.drainBossHitResults?.() ?? []) {
      if (hit.mapId === options.currentMapId?.()) spawnDamageNumber(hit.x, hit.y, hit.damage, hit.critical);
    }
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
        projectile.life = 0;
        applyPlayerHit(target, projectile.damage, projectile.critical === true, Math.atan2(projectile.vy, projectile.vx));
        spawnBurst(projectile.x, projectile.y, "#fff0a1", 5, 52);
      } else { projectile.x = endX; projectile.y = endY; }
      if (projectile.trail <= 0) {
        projectile.trail = .035;
        spawnParticle(projectile.x, projectile.y, 0, 0, .16, .16, 3, "#ffd957");
      }
    }
    projectileStore.compactPlayerProjectiles();
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
    // No shared-boss hit batching remains to clear; personal bosses apply
    // damage immediately via options.hitPersonalBoss. Kept as a no-op so
    // callers (e.g. map transitions) don't need to know that.
    clearPendingBossHits: () => {},
    clearPendingThrow: () => {
      retainedTarget = null;
      nextTargetSearchAt = 0;
      searchedEnemyCount = -1;
      pendingPlayerAttack = null;
      nextAttackAtSeconds = 0;
      lastBossAttackCycleKey = "";
      player.attackClock = 0;
      player.throwClock = 0;
      player.combatFacing = null;
    },
  };
}
