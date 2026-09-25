import { compareAutoFarmTargets, type AutoFarmPriority } from './auto-farm-priority';
import { isMeleeWeapon, weaponAttackRange, segmentCircleHit, segmentEllipseHit } from "../weapon-combat";
import { isProceduralMap } from "../../../shared/procedural-maps";
import { bossSurfaceDistance, bossVerticalRadius } from "../../../shared/boss-hitbox";
import { isEnemyAttackingPlayer } from "./enemy-threat";
import { ENEMY_HP_LOSS_FLASH_SECONDS, PLAYER_KNOCKBACK_FORCE, WORLD } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel, type EnemyKind } from "../enemies";
import { circlesOverlap } from "../math";
import type { ProjectileStore } from "./projectile-store";
import { createSpatialGrid } from "./spatial-grid";
import type { BossTarget, DragonBossState, EnemyState, FrostclawBossState, GloomrootBossState, KoiShogunBossState, MagmaliskBossState, MiremawBossState, PrismshellBossState, IronhornBossState, DreadreaperBossState, VoltwardenBossState, GravebloomBossState, AegisPrimeBossState, PlayerState, Projectile, RuntimeReward, SpiderBossState, TempestKirinBossState, TidewyrmBossState } from "./types";
import type { SpawnSite } from "../world";
import { equipmentDamage, itemDefinition } from "../../../shared/items";
import { RIPOSTE_REFLECT_SHARE } from "../../../shared/prestige-perks";
import { ARROW_STORM_DAMAGE_SHARE, ARROW_STORM_RADIUS, RICOCHET_DAMAGE_SHARE, hasBowSkills, rollArrowSkillProcs, type BowSkillRoll } from "../../../shared/bow-skills";
import { ARROW_STORM_FLIGHT_SECONDS, ARROW_STORM_STAGGER_SECONDS } from "./combat-effects";
import { arrowPassesThrough, isSkillSecondaryTarget, rainArrowStorm, ricochetChain } from "./bow-skill-procs";
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
// A Piercing Shot arrow reaches twice as far as a plain one, and once past
// that it keeps flying (hitting nothing more) until it is well off screen.
const PIERCING_SHOT_RANGE_MULTIPLIER = 2;
const PIERCING_SHOT_FLIGHT_DISTANCE = 1_600;
const DEATH_PARTICLE_COLOR = "#e53935";
const TARGET_GRID_CELL_SIZE = 160;
// Collision settling must not flip aim between equally close enemies every frame.
const TARGET_SWITCH_DISTANCE = 12;
const TARGET_SEARCH_INTERVAL_SECONDS = .08;
const FACING_HORIZONTAL_DEAD_ZONE = 3;
const IDLE_TARGET_RECHECK_SECONDS = .08;
const MAX_SCHEDULE_LATE_SECONDS = .05;
const PIERCE_ONLY = Object.freeze({ arrowStorm: false, ricochet: false, piercingShot: true });

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
  attackNearest: (enemyType?: EnemyKind | null, campName?: string | null, priority?: AutoFarmPriority) => void;
  updateProjectiles: (dt: number) => void;
  damagePlayer: (amount: number, source?: EnemyState) => boolean;
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
  displayRewardAmount?: (type: RuntimeReward["type"], baseAmount: number) => number;
  /** Chance for a hit to land a second time, from the Double Strike perk. */
  prestigeDoubleStrike?: () => number;
  /** Chance for a swing to also reach a second enemy, from the Split Shot perk. */
  prestigeSplitShot?: () => number;
  /** Chance for a hit taken to be thrown back at its enemy, from the Reflect perk. */
  prestigeReflect?: () => number;
  /** The equipped bow's skill roll (Arrow Storm, Ricochet, Piercing Shot), if it has one. */
  bowSkills?: () => Partial<BowSkillRoll> | null | undefined;
  /** Random source for bow skill procs; tests inject a fixed sequence. */
  random?: () => number;
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
  /** Bow skill visuals; combat still works without them (tests, tools). */
  skillEffects?: {
    spawnArcingArrow: (fromX: number, fromY: number, toX: number, toY: number, index: number, color: string) => void;
    spawnSkillStreak: (x: number, y: number, toX: number, toY: number, color: string, width?: number, life?: number, jagged?: boolean) => void;
    spawnSkillRing: (x: number, y: number, color: string, radius?: number, life?: number) => void;
  };
  currentMapId?: () => string;
  onEnemyDefeated?: (enemy: EnemyState) => boolean;
  onCombat?: () => void;
  playBowAttackSound?: () => void;
  logPickup: (text: string, color: string, baseText?: string) => void;
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
  const random = options.random ?? Math.random;
  /** Arrow Storm hits wait for their arrow to land, so a target does not vanish first. */
  const stormHits: { target: EnemyState | BossTarget; damage: number; critical: boolean; landAt: number; x: number; y: number }[] = [];

  function landStormHits(nowSeconds: number) {
    for (let index = stormHits.length - 1; index >= 0; index--) {
      const hit = stormHits[index];
      if (hit.landAt > nowSeconds) continue;
      stormHits.splice(index, 1);
      // A target the volley already finished passes the arrow to the nearest live one.
      // An enemy no longer in this map's list (a map change mid-volley) is never hit.
      const present = hit.target.isBoss || enemies.includes(hit.target as EnemyState);
      let target: EnemyState | BossTarget | null = hit.target.dead || !present ? null : hit.target;
      if (!target && present && !hit.target.isBoss) {
        let nearest = ARROW_STORM_RADIUS;
        for (const enemy of enemies) {
          if (!isSkillSecondaryTarget(enemy)) continue;
          const distance = Math.hypot(enemy.x - hit.x, enemy.y - hit.y) - enemy.r;
          if (distance <= nearest) { nearest = distance; target = enemy; }
        }
      }
      spawnBurst(hit.x, hit.y, "#ffe9a6", 3, 40);
      if (target) applyPlayerHit(target, hit.damage, hit.critical, Math.PI / 2);
    }
  }
  const targetGrid = createSpatialGrid<EnemyState>(TARGET_GRID_CELL_SIZE, WORLD.w, WORLD.h);
  const targetCandidates: EnemyState[] = [];
  let retainedTarget: EnemyState | BossTarget | null = null;
  let nextTargetSearchAt = 0;
  let searchedEnemyCount = -1;
  let searchedEnemyType: EnemyKind | null = null;
  let searchedPriority: AutoFarmPriority = 'closest';
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

  const targetAimY = (target: AttackTarget) =>
    target.y + (target.isBoss ? (target as BossTarget).hitboxOffsetY ?? 0 : 0);

  function faceTarget(target: AttackTarget) {
    const dx = target.x - player.x;
    // Keep the body/held-weapon mirror stable when aiming almost vertically.
    if (Math.abs(dx) > FACING_HORIZONTAL_DEAD_ZONE) player.facing = Math.atan2(targetAimY(target) - player.y, dx);
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
    const angle = Math.atan2(targetAimY(target) - player.y, target.x - player.x);
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
    const dy = targetAimY(target) - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const weaponItem = options.equippedWeapon();
    const bowSkills = options.bowSkills?.();
    const skilled = hasBowSkills(bowSkills);
    const fire = (angle: number) => {
      const projectileLifeBonus = 1.25;
      // Personal bosses use the same crit roll as ordinary enemies. Only the
      // legacy shared-boss path waits for server-confirmed critical damage.
      const critical = (!target.isBoss || Boolean(options.hitPersonalBoss)) && Math.random() < researchCriticalChance();
      const projectile = projectileStore.acquirePlayerProjectile();
      projectile.x = player.x + Math.cos(angle) * 20;
      projectile.y = player.y + Math.sin(angle) * 20;
      projectile.originX = projectile.x;
      projectile.originY = projectile.y;
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
      // Every arrow, the Split Shot one included, rolls each bow skill itself.
      projectile.skills = skilled ? rollArrowSkillProcs(bowSkills, random) : null;
      projectile.pierced = null;
      if (projectile.skills?.piercingShot) {
        projectile.hitLife *= PIERCING_SHOT_RANGE_MULTIPLIER;
        projectile.life = Math.max(projectile.life, PIERCING_SHOT_FLIGHT_DISTANCE / player.projectileSpeed);
      }
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

  function findAttackTarget(enemyType: EnemyKind | null, campName: string | null, mapBoss: BossTarget | null, priority: AutoFarmPriority) {
    // Priority only applies to an Autofarm target type; manual play aims at the nearest.
    const ranked = enemyType !== null && priority !== 'closest';
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
      const better = ranked && target && !target.isBoss
        ? compareAutoFarmTargets(priority, enemy, distance, target as EnemyState, targetDistance(target as EnemyState) ** 2) < 0
        : distance < best;
      if ((threat && !defending) || (threat === defending && (!target || better))) {
        best = distance; target = enemy; defending = threat;
      }
    }
    if (!enemyType && mapBoss && !mapBoss.dead) {
      const edgeDistance = Math.max(0, Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y) - mapBoss.r);
      if (mapBoss === retainedTarget && edgeDistance < attackRange()) retainedDistance = edgeDistance * edgeDistance;
      if (edgeDistance * edgeDistance < best) { best = edgeDistance * edgeDistance; target = mapBoss; }
    }
    // Nearest keeps a target within a small distance margin; a ranked
    // priority keeps its target until it dies or leaves range, so two wounded
    // enemies are never alternated between.
    if (target && retainedTarget && retainedThreat === defending && Number.isFinite(retainedDistance) &&
        (ranked || Math.sqrt(retainedDistance) <= Math.sqrt(best) + TARGET_SWITCH_DISTANCE)) target = retainedTarget;
    return target;
  }

  function attackNearest(enemyType: EnemyKind | null = null, campName: string | null = null, priority: AutoFarmPriority = 'closest') {
    const nowSeconds = options.nowSeconds();
    syncAttackTimeline(nowSeconds);
    const mapBoss = activeMapBoss();
    const bossAlive = Boolean(mapBoss && !mapBoss.dead);
    // The current target and aim update every frame; only acquisition is throttled.
    if (nowSeconds >= nextTargetSearchAt || enemies.length !== searchedEnemyCount ||
        enemyType !== searchedEnemyType || campName !== searchedCampName || attackRange() !== searchedRange || priority !== searchedPriority ||
        mapBoss !== searchedBoss || bossAlive !== searchedBossAlive ||
        (retainedTarget && !targetIsEligible(retainedTarget, enemyType, campName, mapBoss))) {
      if (priority !== searchedPriority) retainedTarget = null;
      retainedTarget = findAttackTarget(enemyType, campName, mapBoss, priority);
      searchedPriority = priority;
      nextTargetSearchAt = nowSeconds + TARGET_SEARCH_INTERVAL_SECONDS;
      searchedEnemyCount = enemies.length;
      searchedEnemyType = enemyType;
      searchedCampName = campName;
      searchedRange = attackRange();
      searchedBoss = mapBoss;
      searchedBossAlive = bossAlive;
    }
    const target = retainedTarget;
    player.combatFacing = target ? Math.atan2(targetAimY(target) - player.y, target.x - player.x) : null;
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
    logPickup(rewardLabel({ ...enhanced, amount: options.displayRewardAmount?.(reward.type, reward.amount) ?? enhanced.amount }), data.color, rewardLabel(reward));
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

  function damagePlayer(amount: number, source?: EnemyState | null) {
    if (isDueling() || player.hurtClock > 0) return false;
    const dealt = damageAfterArmor(amount, effectiveArmor());
    if (dealt > 0) options.onCombat?.();
    player.hp -= dealt;
    // Reflect throws half of what landed back at the enemy that dealt it. Bosses
    // are left out: the server bounds a boss kill by the player's own damage.
    if (source && !source.dead && !source.isBoss && !source.generatedBoss && dealt > 0
      && Math.random() < (options.prestigeReflect?.() ?? 0)) {
      applyPlayerHit(source, dealt * RIPOSTE_REFLECT_SHARE, false, Math.atan2(source.y - player.y, source.x - player.x));
    }
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

  function raycastProjectile(startX: number, startY: number, endX: number, endY: number, radius: number, exclude?: ReadonlySet<object> | null) {
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
      if (target.dead || exclude?.has(target)) continue;
      const ex = target.x - startX;
      const t = target.isBoss
        ? segmentEllipseHit(ex, target.y + (target.hitboxOffsetY ?? 0) - startY, dx, dy,
          target.r + radius, bossVerticalRadius(target.r, target.ry) + radius)
        : segmentCircleHit(ex, target.y - startY, dx, dy, radius + target.r);
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
      options.hitPersonalBoss(damage, target.x, target.y + (target.hitboxOffsetY ?? 0), critical === true);
    } else if (target.isBoss) {
      // No personal-boss handler is wired up (never happens in production,
      // where main.ts always supplies hitPersonalBoss for boss targets).
    } else if (options.hitGeneratedBoss?.(target, damage, critical)) {
      // The generated-boss controller owns its health and defeat handling.
    } else {
      engageEnemy(target);
      // Hits in quick succession grow one chunk from the health before the first.
      if (!((target.hpLossFlashTimer ?? 0) > 0)) target.hpLossFlashFrom = target.hp;
      target.hpLossFlashTimer = ENEMY_HP_LOSS_FLASH_SECONDS;
      target.hp -= damage;
      if (player.knockback > 0) {
        const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
        target.vx += Math.cos(angle) * force;
        target.vy += Math.sin(angle) * force;
      }
      if (target.hp <= 0) killEnemy(target);
    }
  }

  /** A few motionless sparks along a line, so a bounce reads as a streak. */
  function streak(fromX: number, fromY: number, toX: number, toY: number, color: string) {
    for (let step = 1; step <= 5; step++) {
      spawnParticle(fromX + (toX - fromX) * step / 5, fromY + (toY - fromY) * step / 5, 0, 0, .18, .18, 3, color);
    }
  }

  /**
   * An arrow striking something: its own hit, then the Arrow Storm and
   * Ricochet it rolled, which fire once, at its first impact. A Piercing Shot
   * arrow keeps flying, so only that flag survives the first impact.
   */
  function arrowImpact(projectile: Projectile, target: EnemyState | BossTarget, x: number, y: number) {
    const critical = projectile.critical === true;
    applyPlayerHit(target, projectile.damage, critical, Math.atan2(projectile.vy, projectile.vx));
    spawnBurst(x, y, "#fff0a1", 5, 52);
    const procs = projectile.skills;
    if (!procs?.arrowStorm && !procs?.ricochet) return;
    projectile.skills = procs.piercingShot ? PIERCE_ONLY : null;
    if (procs.arrowStorm) {
      // The volley leaves the shooter square to the line of fire, left and
      // right in turn, and curves in on each landing point: a teardrop.
      let volley = 0;
      const firedAt = options.nowSeconds();
      rainArrowStorm({ x, y }, target, enemies as Array<EnemyState | BossTarget>, random, (struck, landX, landY) => {
        const index = volley++;
        if (options.skillEffects) options.skillEffects.spawnArcingArrow(player.x, player.y, landX, landY, index, "#ffd957");
        else spawnParticle(landX, landY - 70, 0, 420, .16, .16, 3, "#ffd957");
        if (struck) stormHits.push({ target: struck, damage: projectile.damage * ARROW_STORM_DAMAGE_SHARE, critical, x: landX, y: landY,
          landAt: firedAt + index * ARROW_STORM_STAGGER_SECONDS + ARROW_STORM_FLIGHT_SECONDS });
      });
    }
    if (procs.ricochet) {
      let from: { x: number; y: number } = target;
      for (const next of ricochetChain(target, enemies)) {
        if (options.skillEffects) {
          options.skillEffects.spawnSkillStreak(from.x, from.y, next.x, next.y, "#8fe3ff", 4, .32, true);
          options.skillEffects.spawnSkillRing(next.x, next.y, "#8fe3ff", 20, .26);
        } else streak(from.x, from.y, next.x, next.y, "#8fe3ff");
        spawnBurst(next.x, next.y, "#8fe3ff", 4, 50);
        applyPlayerHit(next, projectile.damage * RICOCHET_DAMAGE_SHARE, critical, Math.atan2(next.y - from.y, next.x - from.x));
        from = next;
      }
    }
  }

  function updateProjectiles(dt: number) {
    const nowSeconds = options.nowSeconds();
    if (stormHits.length) landStormHits(nowSeconds);
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
      const hitEndX = startX + projectile.vx * hitTravelTime, hitEndY = startY + projectile.vy * hitTravelTime;
      let hit = hitTravelTime > 0 ? raycastProjectile(startX, startY, hitEndX, hitEndY, projectile.r, projectile.pierced) : null;
      projectile.life -= projectileStepSeconds;
      if (projectile.hitLife !== undefined) projectile.hitLife -= projectileStepSeconds;
      projectile.trail -= projectileStepSeconds;
      // Piercing Shot carries the arrow on through regular enemies in its line.
      while (hit && arrowPassesThrough(projectile.skills, hit.enemy, projectile.pierced?.size ?? 0)) {
        const pierceX = startX + (endX - startX) * hit.t, pierceY = startY + (endY - startY) * hit.t;
        arrowImpact(projectile, hit.enemy, pierceX, pierceY);
        (projectile.pierced ??= new Set()).add(hit.enemy);
        // A golden beam from the bow through every enemy it has passed and on
        // along the line of flight, off screen.
        const beamFromX = projectile.originX ?? startX, beamFromY = projectile.originY ?? startY;
        const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
        options.skillEffects?.spawnSkillStreak(beamFromX, beamFromY, beamFromX + projectile.vx / speed * PIERCING_SHOT_FLIGHT_DISTANCE,
          beamFromY + projectile.vy / speed * PIERCING_SHOT_FLIGHT_DISTANCE, "#ffc94d", 5, .3);
        options.skillEffects?.spawnSkillRing(hit.enemy.x, hit.enemy.y, "#ffe08a", 22, .24);
        spawnBurst(hit.enemy.x, hit.enemy.y, "#ffe08a", 6, 70);
        hit = raycastProjectile(startX, startY, hitEndX, hitEndY, projectile.r, projectile.pierced);
      }
      if (hit) {
        projectile.x = startX + (endX - startX) * hit.t;
        projectile.y = startY + (endY - startY) * hit.t;
        projectile.life = 0;
        arrowImpact(projectile, hit.enemy, projectile.x, projectile.y);
      } else { projectile.x = endX; projectile.y = endY; }
      if (projectile.trail <= 0) {
        projectile.trail = .035;
        const piercing = Boolean(projectile.skills?.piercingShot);
        spawnParticle(projectile.x, projectile.y, 0, 0, piercing ? .24 : .16, piercing ? .24 : .16, piercing ? 4 : 3, piercing ? "#ffc94d" : "#ffd957");
      }
    }
    projectileStore.compactPlayerProjectiles();
    for (const shot of enemyShots) {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (circlesOverlap(shot, player)) { damagePlayer(shot.damage, shot.source); shot.life = 0; }
    }
    projectileStore.compactEnemyShots();
  }

  return {
    attackNearest,
    updateProjectiles,
    damagePlayer,
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
