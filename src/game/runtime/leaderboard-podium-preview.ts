import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import { requiredCanvasContext } from "./dom";

export type LeaderboardPodiumAppearance = {
  skinTone: number;
  headItem: string;
  chestItem: string;
  feetItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

export function createLeaderboardPodiumPreview(playerAppearanceAssets: PlayerAppearanceAssets) {
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  function contextFor(canvas: HTMLCanvasElement) {
    const existing = contexts.get(canvas);
    if (existing) return existing;
    const context = requiredCanvasContext(canvas);
    contexts.set(canvas, context);
    return context;
  }

  function draw(canvas: HTMLCanvasElement, appearance: LeaderboardPodiumAppearance, rank: 1 | 2 | 3) {
    const ctx = contextFor(canvas);
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const now = performance.now() / 1_000;
    const widthScale = Math.max(.42, (width - 8) / 180);
    const scale = Math.min(rank === 1 ? .62 : .57, widthScale + (rank === 1 ? .035 : 0));
    const groundY = height - 1;

    drawStartingPlayer(ctx, playerAppearanceAssets, {
      x: width / 2,
      y: groundY - 29,
      facing: rank === 2 ? Math.PI : 0,
      moving: false,
      gameTime: now + rank * .37,
      skinTone: appearance.skinTone,
      headItem: appearance.headItem,
      chestItem: appearance.chestItem,
      feetItem: appearance.feetItem,
      rightHandItem: appearance.rightHandItem,
      leftHandItem: appearance.leftHandItem,
      scale,
    });
  }

  return { draw };
}
