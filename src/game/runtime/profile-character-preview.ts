import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import { requiredCanvasContext } from "./dom";

type ProfilePreviewProgress = {
  equippedHead?: string;
  equippedChest?: string;
  equippedFeet?: string;
} | null;

type DrawProfileCharacterPreviewOptions = {
  visible: boolean;
  progress: ProfilePreviewProgress;
  skinTone: number;
};

export function createProfileCharacterPreview(
  canvas: HTMLCanvasElement,
  playerAppearanceAssets: PlayerAppearanceAssets,
) {
  const ctx = requiredCanvasContext(canvas);

  function resize() {
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return false;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return true;
  }

  function draw({ visible, progress, skinTone }: DrawProfileCharacterPreviewOptions) {
    if (!visible) return;
    resize();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const now = performance.now();
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
      y: 47,
      facing: 0,
      moving: true,
      gameTime: now / 1000,
      skinTone,
      headItem: progress?.equippedHead,
      chestItem: progress?.equippedChest,
      feetItem: progress?.equippedFeet,
      scale: .6,
    });
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .25, width / 2, height / 2, Math.max(width, height) * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.33)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  return { draw, resize };
}
