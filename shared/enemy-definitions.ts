import { ENEMY_TOP_CHASE_SPEED } from "./rules";
import { ENEMY_BASE_VALUES } from "./enemy-base-values";

export type RewardType = "damage" | "health" | "speed" | "armor" | "regen";

export type EnemyDefinition = {
  hp: number;
  speed: number;
  damage: number;
  attackSpeed: number; // Attacks per second.
  r: number;
  color: string;
  outline: string;
  reward: { type: RewardType; amount: number };
  aggro?: number;
  ranged?: boolean;
  elite?: boolean;
};

/** Default movement speed; active chases follow the player's speed separately. */
export const CHASE_SPEED_RAMP_PER_MAP = 5;
export function campaignMeleeChaseSpeed(mapIndex: number): number {
  return mapIndex < 3 ? 205 : Math.min(ENEMY_TOP_CHASE_SPEED, 230 + (mapIndex - 3) * CHASE_SPEED_RAMP_PER_MAP);
}
export type EnemyKind = keyof typeof ENEMY_BASE_VALUES;
// Mutable runtime definitions: installing a map snapshot must not alter the baked source.
export const ENEMY_TYPES: Record<EnemyKind, EnemyDefinition> = JSON.parse(JSON.stringify(ENEMY_BASE_VALUES));
