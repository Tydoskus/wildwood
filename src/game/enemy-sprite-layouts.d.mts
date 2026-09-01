export type EnemySpriteLayerLayout = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint?: string;
  aimPivot?: { x: number; y: number };
  aimOffsetRadians?: number;
};

export type EnemySpriteLayout = {
  size: number;
  height: number;
  layers: EnemySpriteLayerLayout[];
};

export const ENEMY_BOW_AIM_OFFSET_RADIANS: number;
export const REGULAR_ENEMY_SPRITE_SIZE: number;
export const ELITE_ENEMY_SPRITE_SIZE: number;
export const MAP_ENEMY_FAMILY_TINTS: {
  tutorial_forest: null;
  beginner_desert: string;
  intermediate_snowlands: string;
  advanced_lava_wastes: string;
  infernal_depths: string;
  water_reach: string;
  samurai_garden: string;
  cloudspire: string;
};
export const ENEMY_SPRITE_LAYOUTS: Record<string, EnemySpriteLayout>;
