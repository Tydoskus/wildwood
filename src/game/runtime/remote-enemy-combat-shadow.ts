import {
  deterministicRemoteCritical,
  REGULAR_ENEMY_AGGRO_EDGE_TOLERANCE,
  regularEnemyAggroRetainRadius,
  regularEnemyAmbientPose,
  REGULAR_ENEMY_TICK_MS,
  selectRegularEnemyAggroTarget,
  type RegularEnemyAggroCandidate,
  type RegularEnemyAmbientPose,
} from "../../../shared/regular-enemy-simulation";
import { damageAfterArmor } from "../combat";
import { clamp } from "../math";
import { WORLD } from "../constants";
import { absoluteAttackTimestamps, attackAnimationClockAt } from "../attack-timeline";
import type { EnemyDefinition } from "../enemies";
import type {
  RemoteCombatStats,
  RemotePlayer,
  RemoteRegularEnemyCombatVisual,
} from "../../wildstat-coop";
import {
  remoteBossAttackFrame,
  type RemoteBossSimulationTarget,
} from "../../coop/services/remote-boss-attack";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "./regular-enemy-respawn";
import { separateEnemyCrowd } from "./enemy-crowd-separation";
import { rangedEnemyAttackRange, rangedEnemyPreferredDistance } from "./ranged-enemy-range";
import type { EnemyState } from "./types";

const PROJECTILE_RADIUS = 6;
const PROJECTILE_SPREAD_RADIANS = .13;
const GHOST_OPPONENT_DEATH_HOLD_MS = 850;
const REMOTE_BOSS_STATS_INTEREST_RADIUS = 1_400;
export const REMOTE_GHOST_DEATH_ANIMATION_MS = 620;
export const REMOTE_GHOST_TARGET_MISSING_GRACE_MS = 2_000;

type FighterState = {
  hp: number;
  maxHp: number;
  regen: number;
  lastUpdatedAtMs: number;
  lastHurtAtMs: number;
};

type ShadowState = {
  siteId: number;
  targetId: string;
  engagementTick: number;
  ghost: EnemyState;
  base: EnemyDefinition;
  stats: RemoteCombatStats;
  enemyHp: number;
  lastPlayerHitIndex: number;
  lastEnemyHitIndex: number;
  defeatedAtMs: number;
  opponentDefeatedAtMs: number;
  lastTargetX: number;
  lastTargetY: number;
  targetMissingSinceMs: number | null;
  retainRadius: number;
};

type VisualSelection = {
  distanceSquared: number;
  visual: RemoteRegularEnemyCombatVisual;
};

type PlayerAttackSelection = {
  distanceSquared: number;
  siteId: number;
};

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function latestCompletedAttackIndex(elapsedSeconds: number, firstHitSeconds: number, intervalSeconds: number) {
  if (elapsedSeconds < firstHitSeconds) return -1;
  return Math.floor((elapsedSeconds - firstHitSeconds) / intervalSeconds);
}

/** Mirrors the local projectile fan so missed outer shots do not become free damage. */
export function remoteProjectileHitSlots(projectileCount: number, distance: number, enemyRadius: number) {
  const count = Number.isInteger(projectileCount) ? Math.max(1, Math.min(20, projectileCount)) : 1;
  const travelDistance = Math.max(0, finitePositive(distance, 0) - 20);
  const hitRadius = Math.max(0, enemyRadius) + PROJECTILE_RADIUS;
  const slots: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const angleOffset = (index - (count - 1) / 2) * PROJECTILE_SPREAD_RADIANS;
    if (Math.abs(Math.sin(angleOffset) * travelDistance) <= hitRadius) slots.push(index);
  }
  return slots;
}

function moveToward(ghost: EnemyState, targetX: number, targetY: number, speed: number, dt: number, stopDistance = 0) {
  const dx = targetX - ghost.x;
  const dy = targetY - ghost.y;
  const distance = Math.hypot(dx, dy) || 1;
  const step = Math.min(Math.max(0, distance - stopDistance), Math.max(0, speed) * dt);
  if (step > 0) {
    ghost.x += dx / distance * step;
    ghost.y += dy / distance * step;
  }
  if (Math.abs(dx) > .5) ghost.facingX = dx < 0 ? -1 : 1;
  return distance;
}

function moveGhost(
  ghost: EnemyState,
  base: EnemyDefinition,
  targetX: number,
  targetY: number,
  targetAttackRange: number,
  dt: number,
) {
  const dx = targetX - ghost.x;
  const dy = targetY - ghost.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (!base.ranged) {
    moveToward(ghost, targetX, targetY, ghost.speed, dt, ghost.r + 16);
  } else {
    const preferredDistance = rangedEnemyPreferredDistance(targetAttackRange, ghost.r + 21);
    if (distance > preferredDistance + 5) {
      moveToward(ghost, targetX, targetY, ghost.speed, dt, preferredDistance);
    } else if (distance < preferredDistance - 20) {
      const retreat = Math.min(ghost.speed * dt, preferredDistance - distance);
      ghost.x -= dx / distance * retreat;
      ghost.y -= dy / distance * retreat;
      if (Math.abs(dx) > .5) ghost.facingX = dx < 0 ? -1 : 1;
    } else if (Math.abs(dx) > .5) {
      ghost.facingX = dx < 0 ? -1 : 1;
    }
  }
  ghost.x = clamp(ghost.x, ghost.r, WORLD.w - ghost.r);
  ghost.y = clamp(ghost.y, ghost.r, WORLD.h - ghost.r);
}

function createGhost(source: EnemyState, ambient: RegularEnemyAmbientPose, targetId: string, engagementTick: number): EnemyState {
  return {
    ...source,
    x: ambient.x,
    y: ambient.y,
    vx: 0,
    vy: 0,
    hp: source.maxHp,
    engaged: true,
    leashing: false,
    aggroTargetId: targetId,
    aggroStartedAtTick: engagementTick,
    combatTargetX: undefined,
    combatTargetY: undefined,
    remoteCombatHp: source.maxHp,
    remoteCombatGhost: true,
    remoteCombatDeathProgress: 0,
    facingX: ambient.facingX,
    attackClock: 0,
    hurt: 0,
    dead: false,
    phase: ambient.phase,
  };
}

export function createRemoteEnemyCombatShadows(options: {
  spawnDamageNumber: (x: number, y: number, amount: number, critical?: boolean) => void;
  spawnBurst?: (x: number, y: number, color: string, count?: number, speed?: number) => void;
}) {
  const shadows = new Map<number, ShadowState>();
  const fighters = new Map<string, FighterState>();
  const suppressedUntilMs = new Map<number, number>();
  const visuals = new Map<string, VisualSelection>();
  const playerAttackTargets = new Map<string, PlayerAttackSelection>();
  const renderBuffer: RemotePlayer[] = [];
  const ghostBuffer: EnemyState[] = [];
  const activeGhostCrowd: EnemyState[] = [];
  let currentMapId = "";
  let serverNowMs = 0;
  let frameDt = 0;
  let targets: RemotePlayer[] = [];
  let targetById = new Map<string, RemotePlayer>();
  const targetStats = new Map<string, RemoteCombatStats | null | undefined>();
  let statsForCurrentFrame: (identity: string) => RemoteCombatStats | null | undefined = () => null;
  let bossTarget: RemoteBossSimulationTarget | null = null;

  function clearState() {
    shadows.clear();
    fighters.clear();
    suppressedUntilMs.clear();
    visuals.clear();
    playerAttackTargets.clear();
    renderBuffer.length = 0;
    ghostBuffer.length = 0;
    activeGhostCrowd.length = 0;
    targetStats.clear();
    bossTarget = null;
  }

  function combatStatsFor(
    identity: string,
    statsFor: (identity: string) => RemoteCombatStats | null | undefined,
  ) {
    if (targetStats.has(identity)) return targetStats.get(identity);
    const stats = statsFor(identity);
    targetStats.set(identity, stats);
    return stats;
  }

  function fighterFor(targetId: string, stats: RemoteCombatStats) {
    let fighter = fighters.get(targetId);
    if (!fighter) {
      fighter = {
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        regen: stats.regen,
        lastUpdatedAtMs: serverNowMs,
        lastHurtAtMs: Number.NEGATIVE_INFINITY,
      };
      fighters.set(targetId, fighter);
      return fighter;
    }
    const previousMaxHp = fighter.maxHp;
    fighter.maxHp = stats.maxHp;
    fighter.regen = stats.regen;
    if (previousMaxHp > 0 && previousMaxHp !== stats.maxHp) {
      fighter.hp = Math.min(stats.maxHp, fighter.hp / previousMaxHp * stats.maxHp);
    }
    return fighter;
  }

  function hasShadowForTarget(targetId: string) {
    for (const shadow of shadows.values()) {
      if (shadow.targetId === targetId) return true;
    }
    return false;
  }

  function fighterForNewEngagement(targetId: string, stats: RemoteCombatStats) {
    const fighter = fighterFor(targetId, stats);
    const alreadyFighting = hasShadowForTarget(targetId);
    if (fighter.hp <= 0 && !alreadyFighting) {
      fighter.hp = fighter.maxHp;
      fighter.lastUpdatedAtMs = serverNowMs;
      fighter.lastHurtAtMs = Number.NEGATIVE_INFINITY;
    }
    return fighter;
  }

  function updateFighters() {
    for (const [targetId, fighter] of fighters) {
      const stillFighting = hasShadowForTarget(targetId);
      if (!targetById.has(targetId) && !stillFighting) {
        fighters.delete(targetId);
        continue;
      }
      const elapsedSeconds = Math.max(0, Math.min(1, (serverNowMs - fighter.lastUpdatedAtMs) / 1_000));
      fighter.lastUpdatedAtMs = serverNowMs;
      if (fighter.hp > 0 && fighter.regen > 0) {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + fighter.regen * elapsedSeconds);
      }
    }
  }

  function playerAttackFrame(shadow: ShadowState, distance: number) {
    if (shadow.defeatedAtMs || shadow.opponentDefeatedAtMs) {
      return { throwClock: 0, projectileProgress: 0, critical: false, hits: 0 };
    }
    const interval = shadow.stats.attackInterval;
    const engagementSeconds = shadow.engagementTick * REGULAR_ENEMY_TICK_MS / 1_000;
    const nowSeconds = serverNowMs / 1_000;
    const elapsed = nowSeconds - engagementSeconds;
    if (elapsed < 0) return { throwClock: 0, projectileProgress: 0, critical: false, hits: 0 };
    const attackIndex = Math.floor(elapsed / interval);
    const attackStartedAt = engagementSeconds + attackIndex * interval;
    const timestamps = absoluteAttackTimestamps(attackStartedAt, interval);
    const projectileTravel = Math.max(0, distance - 20 - shadow.ghost.r * .72) / shadow.stats.projectileSpeed;
    const projectileProgress = (nowSeconds - timestamps.releaseAtSeconds) / Math.max(.001, projectileTravel);
    const hitSlots = remoteProjectileHitSlots(shadow.stats.projectileCount, distance, shadow.ghost.r);
    return {
      throwClock: attackAnimationClockAt(timestamps, nowSeconds),
      projectileProgress: Math.max(0, Math.min(1, projectileProgress)),
      critical: hitSlots.some((slot) => deterministicRemoteCritical(
        currentMapId,
        shadow.siteId,
        shadow.targetId,
        shadow.engagementTick,
        attackIndex,
        shadow.stats.criticalChance,
        slot,
      )),
      hits: hitSlots.length,
    };
  }

  function applyPlayerHits(shadow: ShadowState, distance: number, selected: boolean) {
    if (shadow.defeatedAtMs || shadow.opponentDefeatedAtMs) return;
    const engagementSeconds = shadow.engagementTick * REGULAR_ENEMY_TICK_MS / 1_000;
    const elapsedSeconds = Math.max(0, serverNowMs / 1_000 - engagementSeconds);
    const timestamps = absoluteAttackTimestamps(engagementSeconds, shadow.stats.attackInterval);
    const flightSeconds = Math.max(0, distance - 20 - shadow.ghost.r * .72) / shadow.stats.projectileSpeed;
    const firstHitSeconds = timestamps.releaseAtSeconds - engagementSeconds + flightSeconds;
    const latest = latestCompletedAttackIndex(elapsedSeconds, firstHitSeconds, shadow.stats.attackInterval);
    if (latest <= shadow.lastPlayerHitIndex) return;

    const first = Math.max(shadow.lastPlayerHitIndex + 1, latest - 7);
    shadow.lastPlayerHitIndex = latest;
    if (!selected || distance > shadow.stats.attackRange) return;
    const hitSlots = remoteProjectileHitSlots(shadow.stats.projectileCount, distance, shadow.ghost.r);
    for (let attackIndex = first; attackIndex <= latest && shadow.enemyHp > 0; attackIndex += 1) {
      let normalDamage = 0;
      let criticalDamage = 0;
      for (const slot of hitSlots) {
        const critical = deterministicRemoteCritical(
          currentMapId,
          shadow.siteId,
          shadow.targetId,
          shadow.engagementTick,
          attackIndex,
          shadow.stats.criticalChance,
          slot,
        );
        const damage = shadow.stats.damage * (critical ? shadow.stats.criticalDamageMultiplier : 1);
        if (critical) criticalDamage += damage;
        else normalDamage += damage;
      }
      const totalDamage = normalDamage + criticalDamage;
      if (totalDamage <= 0) continue;
      shadow.enemyHp = Math.max(0, shadow.enemyHp - totalDamage);
      shadow.ghost.hp = shadow.enemyHp;
      shadow.ghost.remoteCombatHp = shadow.enemyHp;
      shadow.ghost.hurt = .12;
      if (normalDamage > 0) options.spawnDamageNumber(shadow.ghost.x, shadow.ghost.y, normalDamage, false);
      if (criticalDamage > 0) options.spawnDamageNumber(shadow.ghost.x, shadow.ghost.y, criticalDamage, true);
      if (shadow.enemyHp <= 0) {
        shadow.defeatedAtMs = serverNowMs;
        shadow.ghost.remoteCombatDeathProgress = 0;
        options.spawnBurst?.(shadow.ghost.x, shadow.ghost.y, "#9eeeff", 12, 90);
      }
    }
  }

  function selectPlayerAttackTargets() {
    playerAttackTargets.clear();
    for (const shadow of shadows.values()) {
      if (shadow.defeatedAtMs || shadow.opponentDefeatedAtMs) continue;
      const target = targetById.get(shadow.targetId);
      if (!target) continue;
      const targetX = target.simulationX ?? target.x;
      const targetY = target.simulationY ?? target.y;
      const dx = shadow.ghost.x - targetX;
      const dy = shadow.ghost.y - targetY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > shadow.stats.attackRange * shadow.stats.attackRange) continue;
      const selected = playerAttackTargets.get(shadow.targetId);
      if (
        !selected ||
        distanceSquared < selected.distanceSquared ||
        (distanceSquared === selected.distanceSquared && shadow.siteId < selected.siteId)
      ) {
        playerAttackTargets.set(shadow.targetId, { distanceSquared, siteId: shadow.siteId });
      }
    }
  }

  function applyEnemyHits(shadow: ShadowState, target: RemotePlayer, fighter: FighterState, distance: number) {
    if (shadow.defeatedAtMs || shadow.opponentDefeatedAtMs) return;
    const inRange = shadow.base.ranged
      ? distance <= rangedEnemyAttackRange(shadow.stats.attackRange)
      : distance <= shadow.ghost.r + 21;
    if (!inRange) return;
    const interval = 1 / Math.max(.01, shadow.base.attackSpeed);
    const elapsedSeconds = Math.max(0, serverNowMs / 1_000 - shadow.engagementTick * REGULAR_ENEMY_TICK_MS / 1_000);
    const latest = latestCompletedAttackIndex(elapsedSeconds, interval, interval);
    if (latest <= shadow.lastEnemyHitIndex) return;
    const first = Math.max(shadow.lastEnemyHitIndex + 1, latest - 7);
    shadow.lastEnemyHitIndex = latest;
    for (let index = first; index <= latest && fighter.hp > 0; index += 1) {
      const hitAtMs = shadow.engagementTick * REGULAR_ENEMY_TICK_MS + (index + 1) * interval * 1_000;
      if (hitAtMs - fighter.lastHurtAtMs < 100) continue;
      fighter.lastHurtAtMs = hitAtMs;
      const damage = damageAfterArmor(shadow.ghost.damage, shadow.stats.armor);
      fighter.hp = Math.max(0, fighter.hp - damage);
      options.spawnDamageNumber(target.x, target.y, damage, false);
    }
    if (fighter.hp <= 0) shadow.opponentDefeatedAtMs = serverNowMs;
  }

  function selectVisual(shadow: ShadowState, target: RemotePlayer, fighter: FighterState, distanceSquared: number, distance: number) {
    const attack = playerAttackFrame(shadow, distance);
    const visual: RemoteRegularEnemyCombatVisual = {
      enemySiteId: shadow.siteId,
      targetX: shadow.ghost.x,
      targetY: shadow.ghost.y,
      targetRadius: shadow.ghost.r,
      hits: attack.hits,
      projectileProgress: attack.projectileProgress,
      throwClock: attack.throwClock,
      critical: attack.critical,
      hp: fighter.hp,
      maxHp: fighter.maxHp,
    };
    const selected = visuals.get(target.id);
    if (!selected || distanceSquared < selected.distanceSquared) {
      visuals.set(target.id, { distanceSquared, visual });
    }
  }

  function advanceShadow(shadow: ShadowState) {
    const ghost = shadow.ghost;
    ghost.hurt = Math.max(0, ghost.hurt - frameDt);
    ghost.phase = regularEnemyAmbientPose(currentMapId, ghost.siteId, ghost.homeX, ghost.homeY, serverNowMs).phase;

    if (shadow.defeatedAtMs) {
      const progress = (serverNowMs - shadow.defeatedAtMs) / REMOTE_GHOST_DEATH_ANIMATION_MS;
      ghost.remoteCombatDeathProgress = clamp(progress, 0, 1);
      if (progress >= 1) {
        shadows.delete(shadow.siteId);
        suppressedUntilMs.set(shadow.siteId, shadow.defeatedAtMs + REGULAR_ENEMY_RESPAWN_SECONDS * 1_000);
      }
      return;
    }
    if (shadow.opponentDefeatedAtMs && serverNowMs - shadow.opponentDefeatedAtMs >= GHOST_OPPONENT_DEATH_HOLD_MS) {
      shadows.delete(shadow.siteId);
      suppressedUntilMs.set(shadow.siteId, serverNowMs + 3_000);
      return;
    }

    const target = targetById.get(shadow.targetId);
    if (target) {
      shadow.lastTargetX = target.simulationX ?? target.x;
      shadow.lastTargetY = target.simulationY ?? target.y;
      shadow.targetMissingSinceMs = null;
    } else {
      shadow.targetMissingSinceMs ??= serverNowMs;
      if (serverNowMs - shadow.targetMissingSinceMs >= REMOTE_GHOST_TARGET_MISSING_GRACE_MS) {
        shadows.delete(shadow.siteId);
        return;
      }
    }

    const targetX = shadow.lastTargetX;
    const targetY = shadow.lastTargetY;
    moveGhost(ghost, shadow.base, targetX, targetY, shadow.stats.attackRange, frameDt);
    ghost.combatTargetX = targetX;
    ghost.combatTargetY = targetY;
    const dx = ghost.x - targetX;
    const dy = ghost.y - targetY;
    const distanceSquared = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSquared);
    if (distance > shadow.retainRadius) {
      shadows.delete(shadow.siteId);
      return;
    }

    const selectedForPlayerAttack = target
      ? playerAttackTargets.get(target.id)?.siteId === shadow.siteId
      : false;
    // Always advance the attack cursor so an untargeted or temporarily hidden
    // ghost cannot receive a burst of old shots when it becomes the target.
    applyPlayerHits(shadow, distance, selectedForPlayerAttack);
    if (!target) return;
    const fighter = fighterFor(target.id, shadow.stats);
    applyEnemyHits(shadow, target, fighter, distance);
  }

  function finishFrame() {
    activeGhostCrowd.length = 0;
    for (const shadow of shadows.values()) {
      if (!shadow.defeatedAtMs) activeGhostCrowd.push(shadow.ghost);
    }
    separateEnemyCrowd(
      activeGhostCrowd,
      (left, right) => left.aggroTargetId === right.aggroTargetId,
    );

    visuals.clear();
    for (const shadow of shadows.values()) {
      if (shadow.defeatedAtMs) continue;
      const target = targetById.get(shadow.targetId);
      const fighter = fighters.get(shadow.targetId);
      if (!target || !fighter) continue;
      const targetX = target.simulationX ?? target.x;
      const targetY = target.simulationY ?? target.y;
      const dx = shadow.ghost.x - targetX;
      const dy = shadow.ghost.y - targetY;
      const distanceSquared = dx * dx + dy * dy;
      selectVisual(shadow, target, fighter, distanceSquared, Math.sqrt(distanceSquared));
    }
  }

  function beginFrame(
    mapId: string,
    nowMs: number,
    dt: number,
    remotePlayers: readonly RemotePlayer[],
    statsFor: (identity: string) => RemoteCombatStats | null | undefined,
    currentBoss: RemoteBossSimulationTarget | null,
  ) {
    if (currentMapId !== mapId) {
      clearState();
      currentMapId = mapId;
    }
    serverNowMs = Math.max(0, Number.isFinite(nowMs) ? nowMs : Date.now());
    frameDt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    targets = [...remotePlayers];
    targetById = new Map(targets.map((target) => [target.id, target]));
    statsForCurrentFrame = statsFor;
    bossTarget = currentBoss?.alive ? currentBoss : null;
    targetStats.clear();
    visuals.clear();
    updateFighters();
    selectPlayerAttackTargets();
    for (const shadow of [...shadows.values()]) advanceShadow(shadow);
    for (const [siteId, untilMs] of suppressedUntilMs) {
      if (untilMs <= serverNowMs) suppressedUntilMs.delete(siteId);
    }
  }

  function observeEnemySite(options: {
    enemy: EnemyState;
    base: EnemyDefinition;
    ambient: RegularEnemyAmbientPose;
    acquireRadius: number;
    engagementTick: number;
    statsFor: (identity: string) => RemoteCombatStats | null | undefined;
  }) {
    const { enemy, base, ambient } = options;
    if (shadows.has(enemy.siteId) || (suppressedUntilMs.get(enemy.siteId) ?? 0) > serverNowMs) return;
    const candidates: RegularEnemyAggroCandidate[] = targets
      .filter((target) => target.id && Number.isFinite(target.simulationX ?? target.x) && Number.isFinite(target.simulationY ?? target.y))
      .map((target) => {
        const stats = combatStatsFor(target.id, options.statsFor);
        return {
          id: target.id,
          x: target.simulationX ?? target.x,
          y: target.simulationY ?? target.y,
          radius: 17,
          local: false,
          // A real player auto-attacks at this edge, even before the enemy's
          // smaller proximity aggro triggers. The grid tolerance prevents a
          // true edge hit from rounding outward on another client.
          acquireRadius: stats
            ? Math.max(options.acquireRadius, stats.attackRange + REGULAR_ENEMY_AGGRO_EDGE_TOLERANCE)
            : options.acquireRadius,
        };
      });
    const target = selectRegularEnemyAggroTarget({
      enemyX: ambient.x,
      enemyY: ambient.y,
      acquireRadius: options.acquireRadius,
      retainRadius: enemy.type === "Dune Archer" ? Math.max(900, enemy.leashRange) : enemy.leashRange,
      candidates,
    });
    if (!target) return;
    const remote = targetById.get(target.id);
    const stats = combatStatsFor(target.id, options.statsFor);
    if (!remote || !stats) return;
    const authoredLeash = enemy.type === "Dune Archer" ? Math.max(900, enemy.leashRange) : enemy.leashRange;
    const retainRadius = regularEnemyAggroRetainRadius(
      target.acquireRadius ?? options.acquireRadius,
      authoredLeash,
    );
    const ghost = createGhost(enemy, ambient, target.id, options.engagementTick);
    const shadow: ShadowState = {
      siteId: enemy.siteId,
      targetId: target.id,
      engagementTick: options.engagementTick,
      ghost,
      base,
      stats,
      enemyHp: enemy.maxHp,
      lastPlayerHitIndex: -1,
      lastEnemyHitIndex: -1,
      defeatedAtMs: 0,
      opponentDefeatedAtMs: 0,
      lastTargetX: remote.simulationX ?? remote.x,
      lastTargetY: remote.simulationY ?? remote.y,
      targetMissingSinceMs: null,
      retainRadius,
    };
    fighterForNewEngagement(target.id, stats);
    shadows.set(enemy.siteId, shadow);
    advanceShadow(shadow);
  }

  function ghostEnemies() {
    ghostBuffer.length = 0;
    for (const shadow of shadows.values()) ghostBuffer.push(shadow.ghost);
    return ghostBuffer;
  }

  function renderPlayers(players: readonly RemotePlayer[]) {
    renderBuffer.length = 0;
    for (const player of players) {
      const regularEnemyCombat = visuals.get(player.id)?.visual;
      const bossDistance = bossTarget
        ? Math.hypot(
          (player.simulationX ?? player.x) - bossTarget.x,
          (player.simulationY ?? player.y) - bossTarget.y,
        )
        : Number.POSITIVE_INFINITY;
      const shouldEvaluateBoss = Boolean(
        bossTarget &&
        targetById.has(player.id) &&
        bossDistance <= bossTarget.radius + REMOTE_BOSS_STATS_INTEREST_RADIUS,
      );
      const stats = shouldEvaluateBoss
        ? combatStatsFor(player.id, statsForCurrentFrame)
        : null;
      const bossAttack = bossTarget && stats
        ? remoteBossAttackFrame({
          boss: bossTarget,
          playerId: player.id,
          playerX: player.simulationX ?? player.x,
          playerY: player.simulationY ?? player.y,
          attackInterval: stats.attackInterval,
          attackRange: stats.attackRange,
          projectileCount: stats.projectileCount,
          serverNowMs,
        })
        : null;
      if (bossAttack) {
        renderBuffer.push({
          ...player,
          facing: bossAttack.facing,
          throwClock: bossAttack.throwClock,
          bossAttack: bossAttack.visual,
          regularEnemyCombat,
        });
        continue;
      }
      if (!regularEnemyCombat) {
        renderBuffer.push(player);
        continue;
      }
      renderBuffer.push({
        ...player,
        facing: Math.atan2(regularEnemyCombat.targetY - player.y, regularEnemyCombat.targetX - player.x),
        throwClock: regularEnemyCombat.throwClock,
        regularEnemyCombat,
      });
    }
    return renderBuffer;
  }

  function clear() {
    clearState();
    currentMapId = "";
    targets = [];
    targetById.clear();
  }

  return { beginFrame, observeEnemySite, finishFrame, ghostEnemies, renderPlayers, clear };
}
