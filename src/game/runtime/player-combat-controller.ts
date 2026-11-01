import { SOUL_STAT_DETAILS, soulEnemyId, type SoulStatId } from "../../../shared/soul-dimension";
import { addAttackSpeedRating, attackCapInterval, cleanRating, type AttackCapArg } from "../../../shared/stat-rating";
import { compareAutoFarmTargets, farmGroupMatches, type AutoFarmGroup, type AutoFarmPriority } from './auto-farm/auto-farm-priority';
import { isMeleeWeapon, weaponAttackRange, segmentCircleHit, segmentEllipseHit } from "../weapon-combat";
import { isProceduralMap } from "../../../shared/procedural-maps";
import { bossSurfaceDistance, bossVerticalRadius } from "../../../shared/boss-hitbox";
import { isEnemyAttackingPlayer } from "./enemies/enemy-threat";
import { ENEMY_HP_LOSS_FLASH_SECONDS, PLAYER_KNOCKBACK_FORCE, WORLD } from "../constants";
import { damageAfterArmor } from "../combat";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel } from "../enemies";
import { circlesOverlap } from "../math";
import type { ProjectileStore } from "./projectile-store";
import { createSpatialGrid } from "./spatial-grid";
import type { BossTarget, EnemyState, PlayerState, Projectile, RuntimeReward } from "./types";
import { bossStateForMap, type BossStates } from "./boss/boss-registry";
import type { SpawnSite } from "../world";
import { equipmentDamage, itemDefinition, type ItemLevel } from "../../../shared/items";
import { gearMoveSpeedFactor, procChance, skillChanceFactor } from "../../../shared/player-stats";
import { worldReflectDamage } from "../../../shared/prestige-perks";
import { createMarbleBag } from "../../../shared/marble-bag";
import { ARROW_STORM_DAMAGE_SHARE, ARROW_STORM_RADIUS, ARROW_STORM_SCORE_WEIGHT, RICOCHET_DAMAGE_SHARE, bowSkillChance, hasBowSkills, rollArrowSkillProcs, type BowSkillRoll } from "../../../shared/bow-skills";
import { ARROW_STORM_FLIGHT_SECONDS, ARROW_STORM_STAGGER_SECONDS } from "./combat-effects";
import { arrowPassesThrough, isSkillSecondaryTarget, rainArrowStorm, ricochetChain } from "./bow-skill-procs";
import { swordSkillBossDamageMultiplier } from "../../../shared/sword-skills";
import type { WeaponSkillRoll } from "../../../shared/weapon-skills";
import { createSwordSkillRuntime, type SwordSkillEffects } from "./sword-skill-runtime";
import { createStaffSkillRuntime, type StaffSkillEffects } from "./staff-skill-runtime";
import {
  STAFF_BOLT_DAMAGE_FACTOR, STAFF_BOLT_SPEED_FACTOR, STAFF_SPLASH_RADIUS, isStaff, rollBoltSkillProcs, staffSkillBossDamageMultiplier,
  weaponAttackInterval, weaponHitFactor,
} from "../../../shared/staff-skills";
import { masteryBlastScale, masteryInPlay, rollWithProficiency, type MasteryInPlay, type MasteryPoints } from "../../../shared/weapon-mastery";
import { createMasteryTechniqueRuntime } from "./mastery-technique-runtime";
import { staffBoltColor } from "../staff-look";
import { createCardCombat } from "./card-combat";
import { NO_CARDS, cardStatGainFactor, cardValue, type CardTotals } from "../../../shared/card-effects";
import { bowSkillsWithCards } from "../../../shared/card-bounds";
import { isBow, isSkillBow } from "../../../shared/bow-skills";
import { ARROW_KINDS, PIERCING_ARROW_EXTRA_TARGETS, arrowHitMultiplier, type ArrowId } from "../../../shared/arrows";
import { addPlayerBaseMaxHealth, healPlayer } from "./player-health";
import {
  absoluteAttackTimestamps,
  attackAnimationClockAt,
  attackAnimationFinished,
  attackReleaseReached,
  type AbsoluteAttackTimestamps,
} from "../attack-timeline";
import type { DamageSource } from "./dps-meter";

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
  expectedDps: () => number;
  /** Whether the build gains from enemies around it: Reflect hits them back, Second Wind heals on their deaths. */
  feedsOnAdds: () => boolean;
  expectedBossDps: () => number;
  expectedFullDps: () => number;
  attackNearest: (enemyType?: AutoFarmGroup | null, campName?: string | null, priority?: AutoFarmPriority) => void;
  updateProjectiles: (dt: number) => void;
  /** `source` is who dealt it, which Reflect answers. */
  damagePlayer: (amount: number, source?: EnemyState | BossTarget | null) => boolean;
  /** A hit from this map's boss, which Reflect answers at the boss. */
  damagePlayerFromBoss: (amount: number) => boolean;
  /** A boss attack's hit on the regular enemies inside it; its kills pay nothing. */
  damageEnemiesFromBoss: (attack: object, amount: number, inside: (x: number, y: number, r: number) => boolean) => void;
  /** Pushes map enemies out of a boss's body. */
  pushEnemiesFromBoss: (boss: { x: number; y: number; r: number; ry?: number; hitboxOffsetY?: number }) => void;
  clearPendingThrow: () => void;
  /** The card shield in play and its most (card-combat.ts), for the health bar. */
  cardShield: () => { amount: number; max: number };
  /** Tailwind's move speed share after a kill (mastery-techniques.ts), 0 otherwise. */
  tailwind: () => number;
  /** What move speed is multiplied by beyond research: Tailwind and the armor classes worn (armor-class-perks.ts). */
  moveSpeedFactor: () => number;
};

/** Owns player attacks, projectile hits, enemy rewards, and incoming damage. */
export function createPlayerCombatController(options: {
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  projectileStore: ProjectileStore;
  /** Every world boss; the current map's is the one that can be targeted. */
  bosses: BossStates;
  nowSeconds: () => number;
  localIdentity?: () => string | undefined;
  engageEnemy: (enemy: EnemyState) => void;
  researchDamageMultiplier: () => number;
  researchCriticalChance: () => number;
  researchCriticalDamageMultiplier: () => number;
  researchRewardMultiplier: () => number;
  /** What a kill's reward shows as (popups, labels, autofarm): reward-display.ts displayedAmount, which honours the base-rewards setting. */
  displayRewardAmount?: (type: RuntimeReward["type"], baseAmount: number) => number;
  /** Chance for a hit to land a second time, from the Double Strike perk. */
  prestigeDoubleStrike?: () => number;
  /** Chance for a swing to also reach a second enemy, from the Split Shot perk. */
  prestigeSplitShot?: () => number;
  /** Chance for a hit taken to be thrown back at its enemy, from the Reflect perk. */
  prestigeReflect?: () => number;
  prestigeBossSlayer?: () => number;
  prestigeSecondWind?: () => number;
  /** The equipped bow's skill roll (Arrow Storm, Ricochet, Piercing Shot), if it has one. */
  bowSkills?: () => Partial<BowSkillRoll> | null | undefined;
  /** The equipped weapon copy's native skill roll. */
  weaponSkills?: () => WeaponSkillRoll | null | undefined;
  /** Weapon Mastery points in play (coop weaponMasteryInPlay): none during Reflect Only or an Aggro run. */
  weaponMastery?: () => MasteryPoints | null | undefined;
  /** The right hand, whose school Mastery applies; the weapon in use when not given. */
  equippedRightHand?: () => string;
  /** Random source for weapon skill procs; tests inject a fixed sequence. */
  random?: () => number;
  /** The cards in the worn weapon, helmet and armor (card-effects.ts); none without. */
  cards?: () => CardTotals | null | undefined;
  equippedWeapon: () => string;
  /** The worn weapon's slot tier and refine (coop itemLevel). */
  equippedWeaponUpgradeLevel?: () => ItemLevel;
  equippedHead: () => string;
  equippedHeadUpgradeLevel?: () => ItemLevel;
  equippedChest: () => string;
  equippedChestUpgradeLevel?: () => ItemLevel;
  /** The worn boots and their refine: Ranger Boots' move speed, Mystic Boots' skill chance. */
  equippedFeet?: () => string;
  equippedFeetUpgradeLevel?: () => ItemLevel;
  healthMultiplierBonus: () => number;
  /** The attack speed cap: Reflect Only wins and Quick Draw (stat-rating.ts AttackCap). */
  minAttackInterval: AttackCapArg | (() => AttackCapArg);
  effectiveArmor: () => number;
  isDueling: () => boolean;
  scheduleEnemyRespawn: (site: SpawnSite) => void;
  recordRegularEnemyDefeat: (mapId: string, enemy: string) => void;
  incrementKills: () => void;
  hitPersonalBoss?: (damage: number, x: number, y: number, critical: boolean, reflected?: boolean) => void;
  hitGeneratedBoss?: (enemy: EnemyState, damage: number, critical: boolean, reflected?: boolean) => boolean;
  /** The Reflect Only prestige challenge: only reflected hits deal damage. */
  reflectOnly?: () => boolean;
  /** The crafted arrow a bow shoots now (nocked and held), and one fired: spent from the stack (arrow-service.ts). */
  arrowInPlay?: () => ArrowId | null;
  onArrowShot?: (arrowId: ArrowId) => void;
  /** Every hit the player lands, after its multipliers: the DPS readout. */
  onDamageDealt?: (amount: number, source: DamageSource, target: EnemyState | BossTarget) => void;
  onCombatTick?: () => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  spawnParticle: (x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, color: string) => void;
  spawnDamageNumber: (x: number, y: number, amount: number, critical?: boolean, damageTaken?: boolean, reflected?: boolean) => void;
  /** Weapon skill visuals; combat still works without them (tests, tools). */
  skillEffects?: SwordSkillEffects & StaffSkillEffects & {
    spawnArcingArrow: (fromX: number, fromY: number, toX: number, toY: number, index: number, color: string) => void;
    spawnSkillStreak: (x: number, y: number, toX: number, toY: number, color: string, width?: number, life?: number, jagged?: boolean) => void;
    spawnSkillRing: (x: number, y: number, color: string, radius?: number, life?: number) => void;
  };
  currentMapId: () => string;
  onEnemyDefeated?: (enemy: EnemyState) => boolean;
  /** The Soul Dimension: the soul stat an enemy pays (its kill pays no run stats), and what to do with one. */
  soulStatOf?: (enemy: EnemyState) => SoulStatId | null;
  onSoulKill?: (stat: SoulStatId) => void;
  /** What each soul kill pays now, the Soul Level's doubling: 1 at level 1. */
  soulRewardMultiplier?: () => number;
  onCombat?: () => void;
  /**
   * Whether to keep the target until it dies or leaves range (autofarm while it
   * circles: moving changes which enemy is nearest, and a target given up on
   * part-way heals back, on a regen camp, or is never finished).
   */
  keepTarget?: () => boolean;
  playBowAttackSound?: () => void;
  playSwordAttackSound?: (attackInterval?: number) => void;
  /** `value` is the shown amount unrounded, so a popup that sums several kills adds what was paid, not what the text rounded it to. */
  logPickup: (text: string, color: string, value?: number) => void;
  saveProgress: () => void;
  recordDeath: () => void;
  endGame: () => void;
}): PlayerCombatController {
  const {
    player, enemies, spawnSites, projectileStore, bosses,
    engageEnemy, researchDamageMultiplier, researchCriticalChance, researchCriticalDamageMultiplier,
    researchRewardMultiplier, minAttackInterval, effectiveArmor, isDueling, scheduleEnemyRespawn,
    incrementKills, recordRegularEnemyDefeat, spawnBurst, spawnParticle,
    spawnDamageNumber, logPickup, saveProgress, recordDeath, endGame,
  } = options;
  const { projectiles, enemyShots } = projectileStore;
  const attackCap = () => typeof minAttackInterval === "function" ? minAttackInterval() : minAttackInterval;
  const random = options.random ?? Math.random;
  const wornCards = () => options.cards?.() ?? NO_CARDS;
  // Card chances add to the perks of the same name (card-effects.ts).
  const doubleStrikeChance = () => procChance(options.prestigeDoubleStrike?.() ?? 0, wornCards(), "doubleStrike");
  const splitShotChance = () => procChance(options.prestigeSplitShot?.() ?? 0, wornCards(), "splitShot");
  const reflectChanceInPlay = () => procChance(options.prestigeReflect?.() ?? 0, wornCards(), "reflect");
  const bossSlayer = () => (options.prestigeBossSlayer?.() ?? 0) + Math.max(0, cardValue(wornCards(), "bossSlayer")) / 100;
  // Mastery read again only when the points or the hands change (it is read for every arrow).
  let masteryKept: { points: MasteryPoints | null | undefined; right: string; weapon: string; value: MasteryInPlay } | null = null;
  const mastery = (): MasteryInPlay => {
    const points = options.weaponMastery?.(), weapon = options.equippedWeapon(), right = options.equippedRightHand?.() ?? weapon;
    if (!masteryKept || masteryKept.points !== points || masteryKept.right !== right || masteryKept.weapon !== weapon) {
      masteryKept = { points, right, weapon, value: masteryInPlay(points, right, weapon) };
    }
    return masteryKept.value;
  };
  const techniques = createMasteryTechniqueRuntime({ mastery, player, enemies, nowSeconds: options.nowSeconds });
  const weaponSkills = (): WeaponSkillRoll | null | undefined => {
    const roll = options.weaponSkills?.() ?? options.bowSkills?.();
    // Bow skill cards add to a bow's own roll; Skill Proficiency and Magic armor raise the whole chance.
    const carded = wornCards() !== NO_CARDS && isSkillBow(options.equippedWeapon()) ? { ...roll, ...bowSkillsWithCards(roll, wornCards()) } : roll;
    return rollWithProficiency(carded, mastery().level,
      skillChanceFactor(options.equippedHead(), options.equippedChest(), options.equippedFeet?.(), options.equippedFeetUpgradeLevel?.() ?? 0));
  };
  const swordSkills = createSwordSkillRuntime({
    player, enemies, currentMapId: options.currentMapId, equippedWeapon: options.equippedWeapon,
    activeBoss: activeMapBoss, roll: weaponSkills, nowSeconds: options.nowSeconds, random,
    isDueling, onCombat: options.onCombat, effects: options.skillEffects, hit: applyPlayerHit,
    extraWhirlwindTicks: techniques.whirlwindTicks, deflectReturn: techniques.deflectReturn, reach: () => attackRange(),
  });
  const staffSkills = createStaffSkillRuntime({
    player, enemies, currentMapId: options.currentMapId, equippedWeapon: options.equippedWeapon,
    activeBoss: activeMapBoss, roll: weaponSkills, nowSeconds: options.nowSeconds, random, isDueling,
    boltColor: () => staffBoltColor(options.equippedWeapon()), effects: options.skillEffects,
    blastRadius: () => STAFF_SPLASH_RADIUS * masteryBlastScale(mastery()),
    chainScale: techniques.chainScale, extraMeteorFalls: techniques.meteorFalls,
    hit: (target, damage, critical, angle, source) => applyPlayerHit(target, damage, critical, angle, source),
  });
  const cardCombat = createCardCombat({
    cards: wornCards, player, enemies, random, mapId: options.currentMapId, isDueling, spawnBurst, spawnParticle,
    strike: (target, damage, source, reflected) => applyPlayerHit(target, damage, false, 0, source, reflected === true, true),
    streak: (fromX, fromY, toX, toY, color) => options.skillEffects
      ? options.skillEffects.spawnSkillStreak(fromX, fromY, toX, toY, color, 3, .28, true) : streak(fromX, fromY, toX, toY, color),
  });
  // Reflect draws from a marble bag, so its rate corrects itself instead of
  // running dry for a hundred hits at 6%. Only hits it could answer draw.
  const reflectBag = createMarbleBag(random);
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
      if (target) applyPlayerHit(target, hit.damage, hit.critical, Math.PI / 2, 'bow-storm');
    }
  }
  const targetGrid = createSpatialGrid<EnemyState>(TARGET_GRID_CELL_SIZE, WORLD.w, WORLD.h);
  const targetCandidates: EnemyState[] = [];
  let retainedTarget: EnemyState | BossTarget | null = null;
  let nextTargetSearchAt = 0;
  let searchedEnemyCount = -1;
  let searchedEnemyType: AutoFarmGroup | null = null;
  let searchedPriority: AutoFarmPriority = 'closest';
  let searchedCampName: string | null = null;
  let searchedRange = 0;
  let searchedBoss: BossTarget | null = null;
  let searchedBossAlive = false;
  let maxEnemyRadius = 0;
  let pendingPlayerAttack: PendingPlayerAttack | null = null;
  let nextAttackAtSeconds = 0;

  function activeMapBoss(): BossTarget | null {
    return bossStateForMap(bosses, options.currentMapId());
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

  const attackRange = () => weaponAttackRange(options.equippedWeapon(), player.attackRange);
  const targetDistance = (target: EnemyState | BossTarget) => {
    const dx = player.x - target.x, dy = player.y - target.y;
    // A boss is an ellipse when it carries one; everything else is a circle.
    // Prediction has to agree with the server or a shot the client counts is rejected.
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
    if (Math.random() >= splitShotChance()) return null;
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
    // Every swing swishes, a miss included, as every arrow twangs.
    options.playSwordAttackSound?.(player.attackRate);
    rebuildTargetGrid();
    const angle = Math.atan2(targetAimY(target) - player.y, target.x - player.x);
    const hit = raycastProjectile(player.x, player.y, player.x + Math.cos(angle) * attackRange(), player.y + Math.sin(angle) * attackRange(), 0);
    if (!hit) { techniques.swingMissed(); return; }
    const critical = (!hit.enemy.isBoss || Boolean(options.hitPersonalBoss)) && Math.random() < researchCriticalChance();
    // Double Strike lands the same blow twice rather than hitting harder, so a
    // second kill can come out of one swing.
    const damage = weaponDamage(critical);
    const strikes = Math.random() < doubleStrikeChance() ? 2 : 1;
    for (let strike = 0; strike < strikes; strike++) applyPlayerHit(hit.enemy, damage, critical, angle, 'sword-hit');
    swordSkills.swing(hit.enemy, damage, critical, angle);
    // Cleave, Bloodlust and Momentum (mastery-techniques.ts).
    for (const cleaved of techniques.cleaveTargets(hit.enemy, attackRange())) {
      applyPlayerHit(cleaved, damage * techniques.cleaveShare, critical, Math.atan2(cleaved.y - player.y, cleaved.x - player.x), 'sword-cleave');
    }
    techniques.swingLanded();
    const second = splitShotTarget(hit.enemy);
    if (second) applyPlayerHit(second, weaponDamage(critical), critical, Math.atan2(second.y - player.y, second.x - player.x), 'sword-split-shot');
  }

  function launchPlayerStone(target: AttackTarget, releasedAtSeconds: number) {
    const dx = target.x - player.x;
    const dy = targetAimY(target) - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const weaponItem = options.equippedWeapon();
    const bowSkills = weaponSkills();
    const skilled = hasBowSkills(bowSkills);
    // A staff casts slower, heavier bolts that burst where they land (staff-skill-runtime.ts).
    const staff = isStaff(weaponItem);
    const speed = player.projectileSpeed * (staff ? STAFF_BOLT_SPEED_FACTOR : 1);
    const fire = (angle: number, splitShot = false) => {
      const projectileLifeBonus = 1.25;
      // Personal bosses use the same crit roll as ordinary enemies. Only the
      // shared-boss path waits for server-confirmed critical damage.
      // Steady Aim and Focus make every sixth arrow or bolt a critical.
      const forced = techniques.shotCrits();
      const critical = (!target.isBoss || Boolean(options.hitPersonalBoss)) && (forced || Math.random() < researchCriticalChance());
      const projectile = projectileStore.acquirePlayerProjectile();
      projectile.x = player.x + Math.cos(angle) * 20;
      projectile.y = player.y + Math.sin(angle) * 20;
      projectile.originX = projectile.x;
      projectile.originY = projectile.y;
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
      projectile.r = 6;
      // Each arrow rolls its own second hit, landing as one heavier impact.
      // Volley raises a Split Shot arrow.
      projectile.damage = weaponDamage(critical) * (staff ? STAFF_BOLT_DAMAGE_FACTOR : 1) * (Math.random() < doubleStrikeChance() ? 2 : 1)
        * (splitShot ? techniques.splitShotFactor() : 1);
      // A nocked arrow is spent a shot; Steel hits harder, Star's criticals harder (arrows.ts).
      const ammo = !staff && isBow(weaponItem) ? options.arrowInPlay?.() ?? null : null;
      projectile.ammo = ammo;
      if (ammo) { options.onArrowShot?.(ammo); projectile.damage *= arrowHitMultiplier(ammo, critical); }
      projectile.critical = critical;
      projectile.hitLife = player.attackRange / speed * projectileLifeBonus;
      projectile.life = (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / speed * projectileLifeBonus;
      projectile.trail = 0;
      projectile.spawnedAtSeconds = releasedAtSeconds;
      // Every arrow, the Split Shot one included, rolls each bow skill itself.
      projectile.skills = skilled ? rollArrowSkillProcs(bowSkills, random) : null;
      projectile.bolt = staff ? rollBoltSkillProcs(weaponSkills(), random) : null;
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
    if (second) fire(Math.atan2(second.y - player.y, second.x - player.x), true);
    const projectileKind = itemDefinition(weaponItem)?.weapon?.projectile;
    if (projectileKind === "ARROW" || projectileKind === "ROCK") options.playBowAttackSound?.();
    if (staff) {
      // The cast whooshes; Meteor rolls once a cast, on what was aimed at. The staff's own glow marks the release.
      options.playSwordAttackSound?.(weaponAttackInterval(weaponItem, player.attackRate));
      if (!target.isBoss || options.hitPersonalBoss) staffSkills.cast({ x: target.x, y: targetAimY(target) }, weaponDamage(false) * STAFF_BOLT_DAMAGE_FACTOR, false);
      return;
    }
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

  function targetIsEligible(target: EnemyState | BossTarget, enemyType: AutoFarmGroup | null, campName: string | null, mapBoss: BossTarget | null) {
    if (target.dead) return false;
    // Farming, the boss is shot only while nothing it farms is in range (findAttackTarget looks again each search).
    if (target.isBoss) return target === mapBoss && targetDistance(target) < attackRange();
    if (targetDistance(target) >= attackRange()) return false;
    if (!enemyType) return true;
    // An Endless boss, like a campaign one, is shot while farming once nothing farmed is in range.
    if (target.generatedBoss) return !target.remoteCombatGhost;
    return !target.remoteCombatGhost &&
      (isEnemyAttackingPlayer(target, options.localIdentity?.()) ||
        (farmGroupMatches(target, enemyType) && (!campName || target.campName === campName)));
  }

  function findAttackTarget(enemyType: AutoFarmGroup | null, campName: string | null, mapBoss: BossTarget | null, priority: AutoFarmPriority) {
    // The caller decides when the Target choice applies (autofarm, an Aggro run); otherwise it passes Closest.
    const ranked = priority !== 'closest';
    let target: EnemyState | BossTarget | null = null;
    let best = attackRange() * attackRange();
    // A direct scan avoids rebuilding the projectile grid just to choose one target.
    let defending = false;
    let retainedDistance = Infinity;
    let retainedThreat = false;
    for (const enemy of enemies) {
      if (enemy.dead || (enemyType && enemy.generatedBoss)) continue;
      const threat = Boolean(enemyType && isEnemyAttackingPlayer(enemy, options.localIdentity?.()));
      if (enemyType && ((!threat && (!farmGroupMatches(enemy, enemyType) || Boolean(campName && enemy.campName !== campName))) || enemy.remoteCombatGhost)) continue;
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
    // While farming, a boss in range is fair game once nothing of the farmed
    // group (or attacking) is. A ranked Target weighs it among the farmed group too.
    if ((!enemyType || !target || ranked) && mapBoss && !mapBoss.dead) {
      // Its real hitbox, as every other range check uses.
      const edgeDistance = targetDistance(mapBoss);
      if (mapBoss === retainedTarget && edgeDistance < attackRange()) retainedDistance = edgeDistance * edgeDistance;
      const edge = edgeDistance * edgeDistance;
      // Among a crowd (an Aggro run's chasing groups) a ranked Target weighs the boss like any enemy:
      // Strongest takes it, Lowest HP finishes the wounded first.
      const bossBetter = ranked && target ? edge < attackRange() * attackRange() && compareAutoFarmTargets(priority, mapBoss, edge, target as EnemyState, best) < 0 : edge < best;
      if (bossBetter) { best = edge; target = mapBoss; }
    }
    // An Endless boss is an enemy with generatedBoss set, which the farming
    // scan above skips: with autofarm on, a player who walked up to it and
    // stood still never fired. It gets the campaign boss's rule.
    if (enemyType && (!target || ranked)) for (const enemy of enemies) {
      if (!enemy.generatedBoss || enemy.dead || enemy.remoteCombatGhost) continue;
      const distance = targetDistance(enemy) ** 2;
      // Ranked, it is weighed against what the scan chose, as the campaign boss is; otherwise the nearest wins.
      if (ranked && target) {
        if (distance >= attackRange() * attackRange() || compareAutoFarmTargets(priority, enemy, distance, target as EnemyState, best) >= 0) continue;
      } else if (distance >= best) continue;
      if (enemy === retainedTarget) retainedDistance = distance;
      best = distance; target = enemy;
    }
    // Nearest keeps a target within a small distance margin; a ranked
    // priority keeps its target until it dies or leaves range, so two wounded
    // enemies are never alternated between.
    // Strongest goes by max health, which never changes: a tougher one (the boss coming into range) takes over.
    const outranked = priority === 'strongest' && target && retainedTarget && target.maxHp > retainedTarget.maxHp;
    if (target && retainedTarget && !outranked && retainedThreat === defending && Number.isFinite(retainedDistance) &&
        (ranked || options.keepTarget?.() || Math.sqrt(retainedDistance) <= Math.sqrt(best) + TARGET_SWITCH_DISTANCE)) target = retainedTarget;
    return target;
  }

  function attackNearest(enemyType: AutoFarmGroup | null = null, campName: string | null = null, priority: AutoFarmPriority = 'closest') {
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
    const attackInterval = weaponAttackInterval(options.equippedWeapon(), player.attackRate);
    if (nowSeconds < nextAttackAtSeconds) return;
    // Momentum swings faster after hits in a row.
    fireAt(target, attackInterval / techniques.attackSpeed(), nowSeconds);
  }

  function applyReward(reward: RuntimeReward, x: number, y: number) {
    // Bounty cards add to the stat gain of their reward's type, as the server pays it.
    const enhanced = { ...reward, amount: reward.amount * researchRewardMultiplier() * cardStatGainFactor(wornCards(), reward.type) };
    switch (enhanced.type) {
      case "damage": player.damage += enhanced.amount; break;
      case "health": addPlayerBaseMaxHealth(player, enhanced.amount, options.healthMultiplierBonus()); break;
      // Attack speed and crit damage are ratings (shared/stat-rating.ts).
      case "speed": player.attackRate = addAttackSpeedRating(player.attackRate, enhanced.amount, attackCap()); break;
      case "crit": player.critRating = cleanRating((player.critRating ?? 0) + enhanced.amount); break;
      case "armor": player.armor += enhanced.amount; break;
      case "regen": player.regen += enhanced.amount; break;
    }
    const data = REWARD_DATA[enhanced.type];
    const shown = options.displayRewardAmount?.(reward.type, reward.amount) ?? enhanced.amount;
    logPickup(rewardLabel({ ...enhanced, amount: shown }), data.color, shown);
    spawnBurst(x, y, DEATH_PARTICLE_COLOR, 16, 110);
    saveProgress();
  }

  /**
   * A soul enemy's reward: flat (no research or prestige multiplier, only the Soul Level's), straight
   * onto the player like a run stat so the fight feels it now; the server's
   * soul row is what keeps it.
   */
  function applySoulReward(stat: SoulStatId, x: number, y: number) {
    const amount = SOUL_STAT_DETAILS[stat].reward * Math.max(1, options.soulRewardMultiplier?.() ?? 1);
    switch (stat) {
      case "damage": player.damage += amount; break;
      case "health": addPlayerBaseMaxHealth(player, amount, options.healthMultiplierBonus()); break;
      case "armor": player.armor += amount; break;
      case "regen": player.regen += amount; break;
      // The soul's attack speed is attacks a second added flat (withSoulStats): a kill adds its 0.001 a second, to the cap.
      // Its crit damage is the Soul Dimension runtime's to count.
      case "attackSpeed": player.attackRate = Math.min(player.attackRate, Math.max(attackCapInterval(attackCap()), 1 / (1 / player.attackRate + amount))); break;
      case "critDamage": break;
    }
    options.onSoulKill?.(stat);
    spawnBurst(x, y, SOUL_STAT_DETAILS[stat].color, 16, 110);
  }

  function killEnemy(enemy: EnemyState) {
    if (enemy.dead) return;
    enemy.dead = true;
    if (options.onEnemyDefeated?.(enemy)) {
      spawnBurst(enemy.x, enemy.y, DEATH_PARTICLE_COLOR, 12, 90);
      return;
    }
    incrementKills();
    techniques.kill();
    // Regular enemy kills only; bosses and duel opponents do not trigger healing. Second Wind cards add to the perk.
    healPlayer(player, player.maxHp * ((options.prestigeSecondWind?.() ?? 0) + cardCombat.secondWind()), "second-wind");
    cardCombat.onKill();
    const site = spawnSites[enemy.siteId];
    if (site) scheduleEnemyRespawn(site);
    const base = enemy.definition ?? ENEMY_TYPES[enemy.type];
    const soulStat = options.soulStatOf?.(enemy) ?? null;
    if (soulStat) applySoulReward(soulStat, enemy.x, enemy.y);
    else applyReward(enemy.reward, enemy.x, enemy.y);
    const mapId = options.currentMapId();
    recordRegularEnemyDefeat(mapId, soulStat ? soulEnemyId(soulStat) : isProceduralMap(mapId) ? `site:${enemy.siteId}` : enemy.type);
    spawnBurst(enemy.x, enemy.y, DEATH_PARTICLE_COLOR, base.elite ? 28 : 12, base.elite ? 150 : 90);
  }

  const bossAttackHits = new WeakMap<object, WeakSet<EnemyState>>();
  /**
   * A boss attack landing on regular enemies: each one in its area takes the
   * hit once per attack. One it kills simply dies and respawns as usual: no
   * reward, kill, heal or quest progress, and nothing reported to the server.
   */
  function damageEnemiesFromBoss(attack: object, amount: number, inside: (x: number, y: number, r: number) => boolean) {
    let hit = bossAttackHits.get(attack);
    for (const enemy of enemies) {
      if (enemy.dead || enemy.generatedBoss || enemy.remoteCombatGhost || hit?.has(enemy) || !inside(enemy.x, enemy.y, enemy.r)) continue;
      if (!hit) bossAttackHits.set(attack, hit = new WeakSet());
      hit.add(enemy);
      enemy.hpLossFlashFrom = enemy.hp;
      enemy.hpLossFlashTimer = ENEMY_HP_LOSS_FLASH_SECONDS;
      enemy.hurt = .12;
      enemy.hp -= amount;
      spawnDamageNumber(enemy.x, enemy.y, amount, false, false);
      if (enemy.hp > 0) continue;
      enemy.dead = true;
      const site = spawnSites[enemy.siteId];
      if (site) scheduleEnemyRespawn(site);
      spawnBurst(enemy.x, enemy.y, DEATH_PARTICLE_COLOR, 12, 90);
    }
  }

  /**
   * Map enemies (elites too) cannot stand inside a boss's body: each one in it
   * is pushed to its edge, as the player is. Bosses and other players' ghosts
   * are left alone.
   */
  function pushEnemiesFromBoss(boss: { x: number; y: number; r: number; ry?: number; hitboxOffsetY?: number }) {
    const centreY = boss.y + (boss.hitboxOffsetY ?? 0), vertical = bossVerticalRadius(boss.r, boss.ry);
    for (const enemy of enemies) {
      if (enemy.dead || enemy.generatedBoss || enemy.remoteCombatGhost) continue;
      const dx = enemy.x - boss.x, dy = enemy.y - centreY;
      const scaled = Math.hypot(dx / (boss.r + enemy.r), dy / (vertical + enemy.r));
      if (scaled >= 1) continue;
      enemy.x = boss.x + (scaled > .001 ? dx / scaled : boss.r + enemy.r);
      enemy.y = centreY + (scaled > .001 ? dy / scaled : 0);
    }
  }

  function breakEnemyLeashes() {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      enemy.engaged = false;
      enemy.leashing = true;
      enemy.attackClock = Math.max(enemy.attackClock, .5);
    }
  }

  function damagePlayer(amount: number, source?: EnemyState | BossTarget | null) {
    if (isDueling() || player.hurtClock > 0) return false;
    // Cards: a dodge spends the attack and lands nothing; guards lower the hit, and a shield takes what armor lets through.
    const guarded = cardCombat.incoming(amount, source);
    if (guarded === null) return true;
    // Swordplay's Guard and Mana Shield lower it as the cards do; Reflect still answers the hit as it arrived.
    const throughArmor = damageAfterArmor(guarded * techniques.damageTaken(), effectiveArmor());
    const dealt = cardCombat.absorb(throughArmor);
    if (dealt > 0) options.onCombat?.();
    player.hp -= dealt;
    // Reflect throws the hit back at whoever dealt it, bosses included, as it
    // arrived (before armor, which spares only the player), but never more
    // than half the player's max health; a Reflect Only run has no cap.
    // The server's bounds allow it. A hit the shield soaks still landed, so it reflects as well.
    const reflectChance = reflectChanceInPlay();
    if (source && !source.dead && throughArmor > 0 && reflectChance > 0 && reflectBag.draw(reflectChance)) {
      const reflected = worldReflectDamage(amount, player.maxHp, options.reflectOnly?.() === true);
      // Some enemies throw a Reflect back: it lands on the player through armor, and does not bounce again.
      if (!source.isBoss && random() < (source.reflectsReflect ?? 0)) {
        const back = damageAfterArmor(reflected, effectiveArmor());
        player.hp -= back;
        spawnDamageNumber(player.x, player.y - 18, back, false, true);
        spawnBurst(source.x, source.y, "#c9d4ff", 10, 140);
      } else {
        applyPlayerHit(source, reflected, false, Math.atan2(source.y - player.y, source.x - player.x), 'reflect', true);
        cardCombat.afterReflect(source, reflected);
      }
    }
    cardCombat.afterHurt(source);
    spawnDamageNumber(player.x, player.y, dealt, false, true);
    player.hurtClock = .1;
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

  /** `fromCard` is card damage (burn, splash, chain lightning): no crit, slayer or card of its own. */
  function applyPlayerHit(target: EnemyState | BossTarget, damage: number, critical: boolean, angle: number, source: DamageSource, reflected = false, fromCard = false) {
    if (!reflected && options.reflectOnly?.()) return;
    const weaponHit = !reflected && !fromCard;
    // The share of this hit that Iaido's forced critical added, for the DPS breakdown.
    let iaidoShare = 0;
    if (weaponHit) {
      // Iaido lands a first hit as a critical; the slayer and conditional cards multiply the rest.
      if (cardCombat.firstHitCrit(target) && !critical) {
        const criticalMultiplier = researchCriticalDamageMultiplier();
        damage *= criticalMultiplier; critical = true; iaidoShare = 1 - 1 / criticalMultiplier;
      }
      // Hunter's Mark and Hex raise hits on a target a critical marked.
      damage *= cardCombat.hitMultiplier(target) * techniques.hitFactor(target, critical);
    }
    if ((target.isBoss || target.generatedBoss) && weaponHit) damage *= 1 + bossSlayer();
    options.onDamageDealt?.(damage * (1 - iaidoShare), source, target);
    if (iaidoShare > 0) options.onDamageDealt?.(damage * iaidoShare, "card-koi", target);
    // A reflected hit shows blue, so the player can see Reflect fire.
    if (!target.isBoss && !target.generatedBoss) spawnDamageNumber(target.x, target.y, damage, critical, false, reflected);
    target.hurt = .12;
    if (target.isBoss && options.hitPersonalBoss) {
      options.hitPersonalBoss(damage, target.x, target.y + (target.hitboxOffsetY ?? 0), critical === true, reflected);
    } else if (target.isBoss) {
      // No personal-boss handler is wired up (never happens in production,
      // where main.ts always supplies hitPersonalBoss for boss targets).
    } else if (options.hitGeneratedBoss?.(target, damage, critical, reflected)) {
      // The generated-boss controller owns its health and defeat handling.
    } else {
      engageEnemy(target);
      // Only this hit's health lights up, so fast hits never flash the whole empty bar.
      target.hpLossFlashFrom = target.hp;
      target.hpLossFlashTimer = ENEMY_HP_LOSS_FLASH_SECONDS;
      target.hp -= damage;
      if (player.knockback > 0) {
        const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
        target.vx += Math.cos(angle) * force;
        target.vy += Math.sin(angle) * force;
      }
      if (target.hp <= 0) killEnemy(target);
      // Any hit can leave it under Reap's threshold, not only a weapon's.
      else cardCombat.reap(target);
    }
    if (weaponHit) cardCombat.afterHit(target, damage, angle);
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
    if (projectile.bolt) {
      // A bolt stops where it bursts (its life is spent), so it bursts once.
      staffSkills.burst(target, x, y, projectile.damage, critical, Math.atan2(projectile.vy, projectile.vx), projectile.bolt);
      return;
    }
    // No spark on a hit: hits are too many to draw sparks for. Deaths keep their burst.
    applyPlayerHit(target, projectile.damage, critical, Math.atan2(projectile.vy, projectile.vx), 'bow-hit');
    // Fire, Venom and Frost arrows on every hit, the arrow's own and any it pierces.
    const effect = projectile.ammo ? ARROW_KINDS[projectile.ammo].effect : null;
    if (effect === "burn" || effect === "poison" || effect === "chill") cardCombat.arrowHit(target, projectile.damage, effect);
    const procs = projectile.skills;
    if (!procs?.arrowStorm && !procs?.ricochet) return;
    projectile.skills = procs.piercingShot ? PIERCE_ONLY : null;
    if (procs.arrowStorm) {
      // The volley leaves the shooter square to the line of fire, left and
      // right in turn, and curves in on each landing point: a teardrop.
      let volley = 0;
      const firedAt = options.nowSeconds();
      // Rain of Arrows sends further waves after the first, on the same stagger.
      for (let wave = 0; wave <= techniques.stormWaves(); wave++) {
        rainArrowStorm({ x, y }, target, enemies as Array<EnemyState | BossTarget>, random, (struck, landX, landY) => {
          const index = volley++;
          if (options.skillEffects) options.skillEffects.spawnArcingArrow(player.x, player.y, landX, landY, index, "#ffd957");
          else spawnParticle(landX, landY - 70, 0, 420, .16, .16, 3, "#ffd957");
          if (struck) stormHits.push({ target: struck, damage: projectile.damage * ARROW_STORM_DAMAGE_SHARE, critical, x: landX, y: landY,
            landAt: firedAt + index * ARROW_STORM_STAGGER_SECONDS + ARROW_STORM_FLIGHT_SECONDS });
        });
      }
    }
    if (procs.ricochet) {
      let from: { x: number; y: number } = target;
      for (const next of ricochetChain(target, enemies)) {
        if (options.skillEffects) {
          options.skillEffects.spawnSkillStreak(from.x, from.y, next.x, next.y, "#8fe3ff", 4, .32, true);
          options.skillEffects.spawnSkillRing(next.x, next.y, "#8fe3ff", 20, .26);
        } else streak(from.x, from.y, next.x, next.y, "#8fe3ff");
        applyPlayerHit(next, projectile.damage * RICOCHET_DAMAGE_SHARE, critical, Math.atan2(next.y - from.y, next.x - from.x), 'bow-ricochet');
        from = next;
      }
    }
  }

  function updateProjectiles(dt: number) {
    options.onCombatTick?.();
    const nowSeconds = options.nowSeconds();
    if (stormHits.length) landStormHits(nowSeconds);
    syncAttackTimeline(nowSeconds);
    swordSkills.update();
    staffSkills.update();
    cardCombat.update(dt);
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
      while (hit && (arrowPassesThrough(projectile.skills, hit.enemy, projectile.pierced?.size ?? 0)
        || projectile.ammo === "piercing_arrow" && !hit.enemy.isBoss && !hit.enemy.generatedBoss && (projectile.pierced?.size ?? 0) < PIERCING_ARROW_EXTRA_TARGETS)) {
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
        hit = raycastProjectile(startX, startY, hitEndX, hitEndY, projectile.r, projectile.pierced);
      }
      if (hit) {
        projectile.x = startX + (endX - startX) * hit.t;
        projectile.y = startY + (endY - startY) * hit.t;
        projectile.life = 0;
        arrowImpact(projectile, hit.enemy, projectile.x, projectile.y);
      } else { projectile.x = endX; projectile.y = endY; }
      // A bolt's tail is part of its sprite; arrows leave a few sparks.
      if (projectile.trail <= 0 && !projectile.bolt) {
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
      if (!circlesOverlap(shot, player)) continue;
      // A shot that lands inside the hurt window waits on the player for it to
      // pass, as a melee swing does, so each shot of a volley is rolled for Reflect.
      if (swordSkills.deflect(shot) || damagePlayer(shot.damage, shot.source) || isDueling() || player.hp <= 0) shot.life = 0;
      else { shot.x = player.x; shot.y = player.y; shot.vx = 0; shot.vy = 0; }
    }
    projectileStore.compactEnemyShots();
  }

  /** Weapon damage a second as the player stands, criticals averaged in: what Soul Dimension enemies are built against. */
  function expectedDps() {
    const chance = Math.max(0, Math.min(1, researchCriticalChance())), weapon = options.equippedWeapon();
    const projectiles = isMeleeWeapon(weapon) ? 1 : Math.max(1, player.projectileCount ?? 1);
    // A staff's slower, heavier casts and a bow's quicker shots, against one target (a staff's bursts reach more, which this leaves out).
    return weaponDamage(false) * weaponHitFactor(weapon) * (1 + chance * (researchCriticalDamageMultiplier() - 1)) * projectiles
      / Math.max(.05, weaponAttackInterval(weapon, player.attackRate));
  }

  /** expectedDps with Double Strike and Arrow Storm in, against one enemy: what the Soul Defense Force is built against. */
  function expectedFullDps() {
    const double = 1 + Math.max(0, doubleStrikeChance());
    return expectedDps() * (isMeleeWeapon(options.equippedWeapon())
      ? double + swordSkillBossDamageMultiplier(weaponSkills()) - 1
      : isStaff(options.equippedWeapon()) ? double * staffSkillBossDamageMultiplier(weaponSkills())
      : double * (1 + bowSkillChance(weaponSkills(), "arrowStorm") * ARROW_STORM_SCORE_WEIGHT));
  }

  return {
    expectedDps,
    feedsOnAdds: () => reflectChanceInPlay() > 0 || (options.prestigeSecondWind?.() ?? 0) + cardCombat.secondWind() > 0,
    expectedFullDps,
    /** The same against a boss, Boss Slayer included: how long a boss fight would take. */
    expectedBossDps: () => expectedDps() * (1 + bossSlayer()),
    cardShield: () => cardCombat.shield(),
    tailwind: techniques.tailwind,
    moveSpeedFactor: () => (1 + techniques.tailwind())
      * gearMoveSpeedFactor(options.equippedHead(), options.equippedChest(), options.equippedFeet?.(), options.equippedFeetUpgradeLevel?.() ?? 0),
    attackNearest,
    updateProjectiles,
    damagePlayer,
    damagePlayerFromBoss: (amount: number) => damagePlayer(amount, activeMapBoss()),
    damageEnemiesFromBoss,
    pushEnemiesFromBoss,
    clearPendingThrow: () => {
      swordSkills.clear();
      staffSkills.clear();
      techniques.clear();
      stormHits.length = 0;
      retainedTarget = null;
      nextTargetSearchAt = 0;
      searchedEnemyCount = -1;
      pendingPlayerAttack = null;
      nextAttackAtSeconds = 0;
      player.attackClock = 0;
      player.throwClock = 0;
      player.combatFacing = null;
    },
  };
}
