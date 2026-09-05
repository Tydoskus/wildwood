import type { EnemySpriteAnimationLayout } from "../enemy-sprite-layouts.mjs";

declare const atlas: Pick<EnemySpriteAnimationLayout,
  "frameWidth" | "frameHeight" | "anchorX" | "anchorY" | "pages" | "animations"
> & { bounds: { left: number; top: number; right: number; bottom: number } };
export default atlas;
