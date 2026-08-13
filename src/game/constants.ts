import { DEFAULT_ATTACK_RANGE, WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";

export const TAU = Math.PI * 2;
export const WORLD = { w: WORLD_WIDTH, h: WORLD_HEIGHT };
export const BOSS_ENEMY_SAFE_DISTANCE = 900;
export const BOSS_AGGRO_RANGE = 1150;
export const BOSS_CONE_RANGE = 760;
export const BOSS_CONE_HALF_ANGLE = 0.42;
export const BOSS_RAIN_RANGE = 135;
export const BASE_PROJECTILE_SPEED = 390;
export const MAX_PROJECTILE_SPEED = BASE_PROJECTILE_SPEED * 7;
export const PLAYER_KNOCKBACK_FORCE = 90;
export const BASE_ATTACK_RANGE = DEFAULT_ATTACK_RANGE;
export const ATTACK_RANGE_ZOOM_REFERENCE = 155;
export const MIN_CAMERA_ZOOM = 0.5;
export const ENEMY_SPEED_MULTIPLIER = 3;
export const ELITE_SPEED_MULTIPLIER = 2;
export const MELEE_ENEMY_SPEED_MULTIPLIER = 2;
export const REGULAR_ENEMY_AGGRO_PADDING = 15;
export const ENEMY_HIT_MIN_MOVE_SPEED = 1;
export const ENEMY_HIT_SPEED_RECOVERY_SECONDS = 3;
export const RANGED_PROJECTILE_SPEED = 165 * 3;
export const PLAYER_SPRITE_X_OFFSETS = [
  // Calibrated from the flat 4×4 player sheet's alpha bounds so walk frames
  // keep the character's visual center fixed.
  [0, 14, 28, 41],
  [0, 16, 28, 34],
  [0, 16, 27, 40],
  [0, 14, 28, 41],
];
export const PLAYER_SPRITE_CENTER_X_SHIFT = -6;
// Display-space vertical nudges by facing row: down, left, right, up.
export const PLAYER_SPRITE_Y_OFFSETS = [-6, 2, 2, 4];
