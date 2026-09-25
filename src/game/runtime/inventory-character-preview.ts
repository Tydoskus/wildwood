import { createCanvasPrimitives } from "../canvas";
import { itemPresentation } from "../item-presentation";
import { EXPANSION_HEAD_FRAME } from "../player-head-template";
import { drawPlayerPowerLabel } from "./player-power-label";
import { residentImage } from "./resident-image";
import { formatCompactNumber } from "../../ui/number-format";
import { canvasRenderPixelRatio } from "./render-budget";
import { equipmentAppearance, type InventoryState } from "../inventory";
import type { PlayerAppearanceAssets } from "../player-appearance";
import { drawCharacterPreviewScene } from "./character-preview-scene";
import { requiredCanvasContext } from "./dom";

type InventoryCharacterPreviewOptions = {
  visible: boolean;
  inventory: InventoryState;
  skinTone: number;
  power: number;
};

/** Shared animated paper-doll preview used by the inventory loadout. */
export function createInventoryCharacterPreview(
  canvas: HTMLCanvasElement,
  playerAppearanceAssets: PlayerAppearanceAssets,
) {
  const ctx = requiredCanvasContext(canvas);
  const { outlinedWorldText } = createCanvasPrimitives(ctx);
  const powerImage = new Image();
  powerImage.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp";
  const powerIcon = residentImage(powerImage);
  let renderedPower = "";

  function resize() {
    const pixelRatio = canvasRenderPixelRatio(window.devicePixelRatio || 1);
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

  function draw({ visible, inventory, skinTone, power }: InventoryCharacterPreviewOptions) {
    if (!visible) return;
    const nextPower = formatCompactNumber(power);
    if (nextPower !== renderedPower) {
      renderedPower = nextPower;
      canvas.setAttribute("aria-label", `Power ${nextPower}`);
    }
    resize();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const widthScale = Math.max(.5, (width - 12) / 180);
    const scale = Math.min(.72, widthScale);
    const appearance = equipmentAppearance(inventory);
    const characterOffsetY = Math.max(0, Math.min(24, height / 2 - 39));
    drawCharacterPreviewScene(ctx, playerAppearanceAssets, {
      width,
      height,
      skinTone,
      appearance,
      scale,
      characterOffsetY,
    });
    // Use the same character-space anchor as drawStartingPlayer; leave a small
    // gap above the equipped helmet, including taller headwear.
    const head = itemPresentation(appearance.headItem)?.world;
    const headAsset = playerAppearanceAssets.equipment[appearance.headItem]?.sprite;
    const headHeight = head?.kind === "SPRITE" ? head.height ?? headAsset?.naturalHeight ?? 0 : 0;
    const headTop = head?.kind === "SPRITE"
      ? Math.min(EXPANSION_HEAD_FRAME.y, head.top ?? (head.bottom ?? headHeight) - headHeight)
      : EXPANSION_HEAD_FRAME.y;
    const labelBottom = height / 2 + 4 + characterOffsetY + 29 + (headTop - 171) * scale - 6;
    drawPlayerPowerLabel(ctx, outlinedWorldText, powerIcon(), nextPower, width / 2, Math.max(20, labelBottom));
  }

  return { draw, resize };
}
