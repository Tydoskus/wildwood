import { PLAYER_PROJECTILE_SPEED } from "../../shared/rules";
import {
  absoluteAttackTimestamps,
  attackAnimationClockAt,
} from "./attack-timeline";
import { damageAfterArmor } from "./combat";

export const DUEL_ARENA = { x: 6000, y: 6000, r: 430 } as const;
export const DUEL_COMBAT_Y = DUEL_ARENA.y - 60;
export const DUEL_REPLAY_COUNTDOWN_SECONDS = 3;
export const DUEL_SHOT_LIFETIME = 0.38;
export const DUEL_SHOT_SPEED = PLAYER_PROJECTILE_SPEED;

function loadDuelImage(source: string, onSettled?: () => void) {
  const image = new Image();
  if (onSettled) {
    image.addEventListener("load", onSettled, { once: true });
    image.addEventListener("error", onSettled, { once: true });
  }
  image.src = source;
  return image;
}

export function loadDuelSpaceBackground(onSettled?: () => void) {
  return loadDuelImage("assets/wildstat/duel-space-background-v1.png", onSettled);
}

export function loadDuelPlatformArt(onSettled?: () => void) {
  return loadDuelImage("assets/wildstat/duel-floating-platform-v1.png", onSettled);
}

type ReplayCombatantFields = {
  durationSeconds: number;
  challengerMaxHp: number;
  opponentMaxHp: number;
  challengerAttackRate: number;
  opponentAttackRate: number;
  challengerAttacks: number;
  opponentAttacks: number;
  challengerRegen: number;
  opponentRegen: number;
  challengerDamage: number;
  opponentDamage: number;
  challengerArmor: number;
  opponentArmor: number;
  challengerFinalHp: number;
  opponentFinalHp: number;
};

type DuelShotTimelineFields = {
  challengerAttackRate: number;
  opponentAttackRate: number;
  challengerAttacks: number;
  opponentAttacks: number;
};

type DuelTimelineFields = Omit<ReplayCombatantFields, "durationSeconds" | "challengerFinalHp" | "opponentFinalHp">;

type DuelTimelineLimits = {
  challengerAttacks?: number;
  opponentAttacks?: number;
};

/**
 * Reconstructs every projectile visible at this exact server-timed moment.
 * Used by both live duels and their replays so the same attacks appear.
 */
export function duelShotsAt(
  duel: DuelShotTimelineFields,
  elapsed: number,
  options: {
    shotLifetime: number;
    shotSpeed: number;
    challengerFromX: number;
    opponentFromX: number;
    y: number;
    challengerWeaponItem?: string;
    opponentWeaponItem?: string;
  },
) {
  const shots: Array<{ x: number; y: number; color: string; weaponItem: string; angle: number }> = [];
  const addShots = (attackRate: number, attackCount: number, fromX: number, toX: number, color: string, weaponItem = "") => {
    const interval = Math.max(.001, attackRate);
    const limit = Math.max(0, Math.floor(attackCount));
    const distance = Math.abs(toX - fromX);
    const visibleLifetime = Math.min(options.shotLifetime, distance / Math.max(1, options.shotSpeed));
    const firstVisibleAttack = Math.max(1, Math.ceil((elapsed - visibleLifetime) / interval));
    const lastVisibleAttack = Math.min(limit, Math.floor((elapsed + .00001) / interval));
    const direction = Math.sign(toX - fromX);
    for (let attack = firstVisibleAttack; attack <= lastVisibleAttack; attack++) {
      const age = elapsed - attack * interval;
      if (age < 0 || age >= visibleLifetime) continue;
      shots.push({
        x: fromX + direction * options.shotSpeed * age,
        y: options.y,
        color,
        weaponItem,
        angle: direction < 0 ? Math.PI : 0,
      });
    }
  };
  addShots(duel.challengerAttackRate, duel.challengerAttacks, options.challengerFromX, options.opponentFromX, "#ffe36b", options.challengerWeaponItem);
  addShots(duel.opponentAttackRate, duel.opponentAttacks, options.opponentFromX, options.challengerFromX, "#ff8aa8", options.opponentWeaponItem);
  return shots;
}

/** Scales the complete weapon motion into the current attack interval. */
export function duelAttackAnimationClock(attackRate: number, attackCount: number, elapsed: number) {
  if (attackCount <= 0) return 0;
  const interval = Math.max(.001, attackRate);
  const lastAttackAt = Math.max(1, Math.floor(attackCount)) * interval;
  return attackAnimationClockAt(absoluteAttackTimestamps(lastAttackAt, interval), elapsed);
}

/**
 * Frozen duel simulation used to predict live projectiles between server
 * snapshots. The server remains authoritative for every stored result.
 */
export function duelTimelineState(
  duel: DuelTimelineFields,
  seconds: number,
  limits: DuelTimelineLimits = {},
) {
  const elapsed = Math.max(0, seconds);
  let time = 0;
  let challengerHp = duel.challengerMaxHp;
  let opponentHp = duel.opponentMaxHp;
  let challengerAttacks = 0;
  let opponentAttacks = 0;
  const challengerRate = Math.max(0.001, duel.challengerAttackRate);
  const opponentRate = Math.max(0.001, duel.opponentAttackRate);
  const challengerLimit = Number.isFinite(limits.challengerAttacks)
    ? Math.max(0, Math.floor(limits.challengerAttacks!))
    : Infinity;
  const opponentLimit = Number.isFinite(limits.opponentAttacks)
    ? Math.max(0, Math.floor(limits.opponentAttacks!))
    : Infinity;

  while (time < elapsed && challengerHp > 0 && opponentHp > 0) {
    const nextChallengerAttack = challengerAttacks < challengerLimit
      ? (challengerAttacks + 1) * challengerRate
      : Infinity;
    const nextOpponentAttack = opponentAttacks < opponentLimit
      ? (opponentAttacks + 1) * opponentRate
      : Infinity;
    const nextEvent = Math.min(elapsed, nextChallengerAttack, nextOpponentAttack);
    const delta = nextEvent - time;
    challengerHp = Math.min(duel.challengerMaxHp, challengerHp + duel.challengerRegen * delta);
    opponentHp = Math.min(duel.opponentMaxHp, opponentHp + duel.opponentRegen * delta);
    time = nextEvent;
    const challengerHits = nextChallengerAttack <= time + 0.00001 && challengerAttacks < challengerLimit;
    const opponentHits = nextOpponentAttack <= time + 0.00001 && opponentAttacks < opponentLimit;
    const challengerDamage = challengerHits ? damageAfterArmor(duel.challengerDamage, duel.opponentArmor) : 0;
    const opponentDamage = opponentHits ? damageAfterArmor(duel.opponentDamage, duel.challengerArmor) : 0;
    opponentHp = Math.max(0, opponentHp - challengerDamage);
    challengerHp = Math.max(0, challengerHp - opponentDamage);
    if (challengerHits) challengerAttacks += 1;
    if (opponentHits) opponentAttacks += 1;
    if (!challengerHits && !opponentHits) break;
  }

  return { challengerHp, opponentHp, challengerAttacks, opponentAttacks };
}

export function replayState(replay: ReplayCombatantFields, seconds: number) {
  const elapsed = Math.min(replay.durationSeconds, seconds);
  const state = duelTimelineState(replay, elapsed, {
    challengerAttacks: replay.challengerAttacks,
    opponentAttacks: replay.opponentAttacks,
  });

  if (elapsed >= replay.durationSeconds) {
    state.challengerHp = replay.challengerFinalHp;
    state.opponentHp = replay.opponentFinalHp;
  }
  return state;
}
