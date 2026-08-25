import { clamp } from "../math";

export const PLAYER_DEATH_FALL_DURATION_MS = 850;
export const PLAYER_DEATH_REMOTE_HOLD_MS = 4_250;

export type PlayerDeathAnimationState = {
  id: string;
  x: number;
  y: number;
  facing: number;
  startedAtMs: number;
};

export type PlayerDeathPose = {
  active: boolean;
  direction: -1 | 1;
  bodyRotation: number;
  bodyGroundOffsetY: number;
  bodyScaleY: number;
  helmetOffsetX: number;
  helmetOffsetY: number;
  helmetRotation: number;
  weaponOffsetX: number;
  weaponOffsetY: number;
  weaponRotation: number;
};

function animationDirection(identity: string): -1 | 1 {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? -1 : 1;
}

function smoothStep(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function withoutNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

/** Returns a deterministic pose so every client sees the same low-cost fall. */
export function playerDeathPose(startedAtMs: number, nowMs: number, identity: string): PlayerDeathPose {
  const ageMs = Math.max(0, nowMs - startedAtMs);
  const direction = animationDirection(identity);
  const fall = smoothStep(clamp(ageMs / PLAYER_DEATH_FALL_DURATION_MS, 0, 1));
  const equipmentProgress = clamp((ageMs - 70) / (PLAYER_DEATH_FALL_DURATION_MS - 70), 0, 1);
  const equipmentEase = easeOutCubic(equipmentProgress);
  const helmetArc = Math.sin(equipmentProgress * Math.PI) * 18;
  const weaponArc = Math.sin(equipmentProgress * Math.PI) * 13;

  return {
    active: ageMs <= PLAYER_DEATH_REMOTE_HOLD_MS,
    direction,
    bodyRotation: withoutNegativeZero(direction * Math.PI / 2 * fall),
    bodyGroundOffsetY: 6 * fall,
    bodyScaleY: 1 - .18 * fall,
    helmetOffsetX: withoutNegativeZero(direction * 74 * equipmentEase),
    helmetOffsetY: 46 * equipmentEase - helmetArc,
    helmetRotation: withoutNegativeZero(direction * Math.PI * 2 * equipmentEase),
    weaponOffsetX: withoutNegativeZero(-direction * 48 * equipmentEase),
    weaponOffsetY: 16 * equipmentEase - weaponArc,
    weaponRotation: withoutNegativeZero(-direction * Math.PI * 1.35 * equipmentEase),
  };
}
