import type { EquipmentAppearance } from "../inventory";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";

type CharacterPreviewSceneOptions = {
  width: number;
  height: number;
  skinTone: number;
  appearance: EquipmentAppearance | null;
  scale: number;
  now?: number;
};

/** Shared animated grass portrait used by the inventory and profile paper dolls. */
export function drawCharacterPreviewScene(
  ctx: CanvasRenderingContext2D,
  playerAppearanceAssets: PlayerAppearanceAssets,
  options: CharacterPreviewSceneOptions,
) {
  const { width, height, skinTone, appearance, scale } = options;
  const now = options.now ?? performance.now();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#31945b";
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 18; index += 1) {
    const random = (seed: number) => {
      const value = Math.sin(seed * 12.9898) * 43758.5453;
      return value - Math.floor(value);
    };
    const x = 8 + random(index + 1) * Math.max(1, width - 16);
    const y = height + 7 - ((now * .025 + random(index + 29) * (height + 18)) % (height + 18));
    ctx.fillStyle = index % 2 ? "#237b49" : "#267f4c";
    ctx.fillRect(Math.floor(x - 1), Math.floor(y - 5), 2, 7);
    ctx.fillRect(Math.floor(x - 5), Math.floor(y - 2), 2, 5);
    ctx.fillRect(Math.floor(x + 3), Math.floor(y - 3), 2, 6);
    if (index % 4 > 1) ctx.fillRect(Math.floor(x + 6), Math.floor(y), 2, 3);
  }

  ctx.imageSmoothingEnabled = false;
  drawStartingPlayer(ctx, playerAppearanceAssets, {
    x: width / 2,
    y: height / 2 + 4,
    facing: 0,
    moving: true,
    gameTime: now / 1_000,
    skinTone,
    headItem: appearance?.headItem,
    chestItem: appearance?.chestItem,
    feetItem: appearance?.feetItem,
    rightHandItem: appearance?.rightHandItem,
    leftHandItem: appearance?.leftHandItem,
    scale,
  });

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * .25,
    width / 2,
    height / 2,
    Math.max(width, height) * .72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.33)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
