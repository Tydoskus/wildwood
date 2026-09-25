import type { DuelCombatModifiers } from "../../shared/duel-combat";
import type { DuelWeapons } from "../../shared/duel-approach";
import { isMeleeWeapon } from "./weapon-combat";
import { PLAYER_PROJECTILE_SPEED } from "../../shared/rules";
import {
  absoluteAttackTimestamps,
  attackAnimationClockAt,
} from "./attack-timeline";
import { advanceDuelCombat, initialDuelCombatState } from "../../shared/duel-combat";

export const DUEL_ARENA = { x: 6000, y: 6000, r: 430 } as const;
export const DUEL_COMBAT_Y = DUEL_ARENA.y - 60;
export const DUEL_REPLAY_COUNTDOWN_SECONDS = 3;
export const DUEL_SHOT_LIFETIME = 0.38;
export const DUEL_SHOT_SPEED = PLAYER_PROJECTILE_SPEED;
export const DUEL_SPACE_BACKGROUND_SOURCE = "assets/wildstat/duel-space-background-v1.webp";
export const DUEL_PLATFORM_ART_SOURCE = "assets/wildstat/duel-floating-platform-v1.webp";

type ReplayCombatantFields = DuelCombatModifiers & DuelWeapons & {
  combatVersion?: number;
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
    if (isMeleeWeapon(weaponItem)) return;
    const interval = Math.max(.001, Math.round(attackRate * 1_000_000) / 1_000_000);
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
export function duelAttackAnimationClock(attackRate: number, attackCount: number, elapsed: number, weaponItem?: string, attackDelay = 0) {
  elapsed -= attackDelay;
  const interval = Math.max(.001, Math.round(attackRate * 1_000_000) / 1_000_000);
  if (isMeleeWeapon(weaponItem)) {
    // Melee contacts on the authoritative hit, with its windup before it.
    const windup = Math.min(.42, interval) * .12 / .42;
    const nextImpact = (Math.floor(Math.max(0, elapsed) / interval) + 1) * interval;
    const impact = nextImpact - elapsed <= windup ? nextImpact : Math.floor(attackCount) * interval;
    if (impact <= 0) return 0;
    return attackAnimationClockAt(absoluteAttackTimestamps(impact - windup, interval), elapsed);
  }
  if (attackCount <= 0) return 0;
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
  const state = advanceDuelCombat(duel, initialDuelCombatState(duel), 0,
    Math.max(0, seconds) * 1_000_000, limits);
  return { resolvedSeconds: state.resolvedMicros / 1_000_000,
    challengerDamageDealt: state.challengerDamageDealt, opponentDamageDealt: state.opponentDamageDealt, challengerHp: state.challengerHp, opponentHp: state.opponentHp,
    challengerAttacks: state.challengerAttacks, opponentAttacks: state.opponentAttacks };
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
