import { bossPlayerAttackCycle, type BossSimulationKind } from "../../../shared/boss-simulation";
import {
  absoluteAttackTimestamps,
  attackAnimationClockAt,
  attackAnimationFinished,
} from "../../game/attack-timeline";

const PROJECTILE_FLIGHT_SECONDS = .18;
const BOSS_HIT_RANGE_TOLERANCE = 60;

export type RemoteBossSimulationTarget = {
  kind: BossSimulationKind;
  encounter: bigint;
  alive: boolean;
  x: number;
  y: number;
  radius: number;
};

export type RemoteBossAttackVisual = {
  targetX: number;
  targetY: number;
  targetRadius: number;
  hits: number;
  projectileProgress: number;
};

export type RemoteBossAttackFrameOptions = {
  boss: RemoteBossSimulationTarget;
  playerId: string;
  playerX: number;
  playerY: number;
  attackInterval: number;
  attackRange: number;
  projectileCount: number;
  serverNowMs: number;
};

function safeAttackInterval(attackInterval: number) {
  return Math.max(.05, Number.isFinite(attackInterval) ? attackInterval : 1);
}

/** Absolute seeded cadence; joining late cannot reset or advance another player's animation. */
export function remoteBossAttackStartedAtMs(options: Pick<
  RemoteBossAttackFrameOptions,
  "boss" | "playerId" | "attackInterval" | "serverNowMs"
>) {
  return bossPlayerAttackCycle({
    kind: options.boss.kind,
    encounter: options.boss.encounter,
    playerId: options.playerId,
    attackInterval: safeAttackInterval(options.attackInterval),
    serverNowMs: options.serverNowMs,
  }).startedAtMs;
}

/**
 * Reconstructs a nearby player's boss throw from shared boss state, server time,
 * saved combat stats, and motion. It is presentation-only; authoritative boss
 * damage still comes from validated reducers.
 */
export function remoteBossAttackFrame(options: RemoteBossAttackFrameOptions) {
  if (!options.boss.alive) return null;
  const playerX = Number.isFinite(options.playerX) ? options.playerX : 0;
  const playerY = Number.isFinite(options.playerY) ? options.playerY : 0;
  const bossX = Number.isFinite(options.boss.x) ? options.boss.x : 0;
  const bossY = Number.isFinite(options.boss.y) ? options.boss.y : 0;
  const attackRange = Math.max(0, Number.isFinite(options.attackRange) ? options.attackRange : 0);
  const targetRadius = Math.max(0, Number.isFinite(options.boss.radius) ? options.boss.radius : 0);
  const distance = Math.hypot(playerX - bossX, playerY - bossY);
  if (distance - targetRadius > attackRange + BOSS_HIT_RANGE_TOLERANCE) return null;

  const intervalSeconds = safeAttackInterval(options.attackInterval);
  const startedAtMs = remoteBossAttackStartedAtMs(options);
  const timestamps = absoluteAttackTimestamps(startedAtMs / 1_000, intervalSeconds);
  const nowSeconds = (Number.isFinite(options.serverNowMs) ? Math.max(0, options.serverNowMs) : 0) / 1_000;
  if (attackAnimationFinished(timestamps, nowSeconds)) return null;
  const projectileProgress = (nowSeconds - timestamps.releaseAtSeconds) / PROJECTILE_FLIGHT_SECONDS;
  const projectileCount = Number.isFinite(options.projectileCount)
    ? Math.floor(options.projectileCount)
    : 1;
  const visual: RemoteBossAttackVisual = {
    targetX: bossX,
    targetY: bossY,
    targetRadius,
    hits: Math.max(1, Math.min(20, projectileCount)),
    projectileProgress: Math.max(0, Math.min(1, projectileProgress)),
  };
  return {
    facing: Math.atan2(bossY - playerY, bossX - playerX),
    throwClock: attackAnimationClockAt(timestamps, nowSeconds),
    visual,
  };
}
