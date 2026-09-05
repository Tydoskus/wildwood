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
  family: string;
  size: number;
  height: number;
  layers: EnemySpriteLayerLayout[];
  animation?: EnemySpriteAnimationLayout;
};

export type EnemySpriteMotion = {
  loop: boolean;
  durationMs: number;
  frameDurationMs: number;
  frames: { page: number; x: number; y: number; w: number; h: number }[];
};
export type EnemySpriteAnimationLayout = {
  /** Authored horizontal facing; omitted means right. Applies only to atlas art. */
  sourceFacingX?: -1 | 1;
  /** Captured shadow replaces the renderer's default ground shadow. */
  hasBakedShadow?: boolean;
  frameWidth: number;
  frameHeight: number;
  anchorX: number;
  anchorY: number;
  pages: { src: string; width: number; height: number }[];
  animations: Record<"idle" | "walk" | "attack", EnemySpriteMotion>;
  x: number;
  y: number;
  w: number;
  h: number;
  top: number;
  bottom: number;
};

export const ENEMY_BOW_AIM_OFFSET_RADIANS: number;
export const REGULAR_ENEMY_SPRITE_SIZE: number;
export const ELITE_ENEMY_SPRITE_SIZE: number;
export const MAP_ENEMY_FAMILIES: {
  tutorial_forest: string;
  beginner_desert: string;
  intermediate_snowlands: string;
  advanced_lava_wastes: string;
  infernal_depths: string;
  water_reach: string;
  samurai_garden: string;
  cloudspire: string;
  moonfen: string;
  crystal_hollows: string;
clockwork_ruins: string;
duskfall_orchard: string;
};
export const ENEMY_SPRITE_LAYOUTS: Record<string, EnemySpriteLayout>;
