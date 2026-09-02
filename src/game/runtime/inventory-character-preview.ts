import { equipmentAppearance, type InventoryState } from "../inventory";
import type { PlayerAppearanceAssets } from "../player-appearance";
import { drawCharacterPreviewScene } from "./character-preview-scene";
import { requiredCanvasContext } from "./dom";

type InventoryCharacterPreviewOptions = {
  visible: boolean;
  inventory: InventoryState;
  skinTone: number;
};

/** Shared animated paper-doll preview used by the inventory loadout. */
export function createInventoryCharacterPreview(
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

  function draw({ visible, inventory, skinTone }: InventoryCharacterPreviewOptions) {
    if (!visible) return;
    resize();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const widthScale = Math.max(.5, (width - 12) / 180);
    const scale = Math.min(.72, widthScale);
    drawCharacterPreviewScene(ctx, playerAppearanceAssets, {
      width,
      height,
      skinTone,
      appearance: equipmentAppearance(inventory),
      scale,
    });
  }

  return { draw, resize };
}
