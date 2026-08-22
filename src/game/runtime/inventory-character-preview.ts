import type { InventoryState } from "../inventory";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import { requiredCanvasContext } from "./dom";

type InventoryCharacterPreviewOptions = {
  visible: boolean;
  inventory: Pick<InventoryState, "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand">;
  skinTone: number;
};

/** Grass-backed paper-doll preview used by the inventory loadout. */
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
    ctx.clearRect(0, 0, width, height);

    const grass = ctx.createRadialGradient(width / 2, height * .42, 6, width / 2, height * .48, Math.max(width, height) * .72);
    grass.addColorStop(0, "#49b86d");
    grass.addColorStop(1, "#2f8e54");
    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(22, 101, 54, .34)";
    for (let index = 0; index < 11; index += 1) {
      const x = 10 + ((index * 47) % Math.max(1, width - 20));
      const y = 12 + ((index * 31) % Math.max(1, height - 24));
      ctx.fillRect(Math.round(x), Math.round(y), 2, 5);
      ctx.fillRect(Math.round(x - 2), Math.round(y + 2), 2, 3);
      ctx.fillRect(Math.round(x + 2), Math.round(y + 1), 2, 4);
    }

    const widthScale = Math.max(.5, (width - 12) / 180);
    const scale = Math.min(.72, widthScale);
    drawStartingPlayer(ctx, playerAppearanceAssets, {
      x: width / 2,
      y: height / 2 + 4,
      facing: 0,
      moving: false,
      gameTime: performance.now() / 1_000,
      skinTone,
      headItem: inventory.equippedHead,
      chestItem: inventory.equippedChest,
      feetItem: inventory.equippedFeet,
      rightHandItem: inventory.equippedRightHand,
      leftHandItem: inventory.equippedLeftHand,
      scale,
    });
  }

  return { draw, resize };
}
