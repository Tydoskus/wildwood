export type EnemySpriteLayerLayout = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  aimPivot?: { x: number; y: number };
  aimOffsetRadians?: number;
};

export type EnemySpriteLayout =
  | { src: string; size: number }
  | { size: number; height: number; layers: EnemySpriteLayerLayout[] };

export const ENEMY_BOW_AIM_OFFSET_RADIANS: number;
export const ENEMY_SPRITE_LAYOUTS: Record<string, EnemySpriteLayout>;
