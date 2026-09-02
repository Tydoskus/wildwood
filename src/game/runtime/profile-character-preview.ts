import type { PlayerAppearanceAssets } from "../player-appearance";
import { BASIC_PAPER_HAT, equipmentAppearance } from "../inventory";
import { drawCharacterPreviewScene } from "./character-preview-scene";
import { requiredCanvasContext } from "./dom";

type ProfilePreviewProgress = {
  equippedHead?: string;
  equippedChest?: string;
  equippedFeet?: string;
  equippedRightHand?: string;
  equippedLeftHand?: string;
  cosmeticHead?: string;
  cosmeticChest?: string;
  cosmeticFeet?: string;
  cosmeticRightHand?: string;
  cosmeticLeftHand?: string;
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
    const appearance = progress ? equipmentAppearance({
      equippedHead: progress.equippedHead ?? BASIC_PAPER_HAT,
      equippedChest: progress.equippedChest ?? "",
      equippedFeet: progress.equippedFeet ?? "",
      equippedRightHand: progress.equippedRightHand ?? "",
      equippedLeftHand: progress.equippedLeftHand ?? "",
      cosmeticHead: progress.cosmeticHead ?? "",
      cosmeticChest: progress.cosmeticChest ?? "",
      cosmeticFeet: progress.cosmeticFeet ?? "",
      cosmeticRightHand: progress.cosmeticRightHand ?? "",
      cosmeticLeftHand: progress.cosmeticLeftHand ?? "",
    }) : null;
    const widthScale = Math.max(.5, (width - 12) / 180);
    drawCharacterPreviewScene(ctx, playerAppearanceAssets, {
      width,
      height,
      skinTone,
      appearance,
      scale: Math.min(.72, widthScale),
    });
  }

  return { draw, resize };
}
