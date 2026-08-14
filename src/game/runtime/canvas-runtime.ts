import { createCanvasPrimitives } from "../canvas";
import { requiredCanvasContext } from "./dom";

export function createCanvasRuntime({
  canvas,
  textCanvas,
  getActorShadowSprite,
}: {
  canvas: HTMLCanvasElement;
  textCanvas: HTMLCanvasElement;
  getActorShadowSprite: () => HTMLImageElement | null;
}) {
  const ctx = requiredCanvasContext(canvas, { alpha: false });
  const textCtx = requiredCanvasContext(textCanvas);
  const primitives = createCanvasPrimitives(ctx, textCtx);
  let dpr = 1;
  let width = innerWidth;
  let height = innerHeight;

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    textCanvas.width = Math.round(width * dpr);
    textCanvas.height = Math.round(height * dpr);
    textCanvas.style.width = `${width}px`;
    textCanvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function drawActorShadow(x: number, y: number, shadowWidth: number, alpha = .38) {
    const shadowHeight = Math.max(8, Math.round(shadowWidth * 33 / 86));
    const sprite = getActorShadowSprite();
    ctx.save();
    ctx.globalAlpha = alpha;
    if (sprite?.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, Math.round(x - shadowWidth / 2), Math.round(y - shadowHeight / 2), Math.round(shadowWidth), shadowHeight);
    } else {
      ctx.fillStyle = "#102719";
      ctx.beginPath();
      ctx.ellipse(x, y, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    ctx,
    textCtx,
    ...primitives,
    resize,
    dpr: () => dpr,
    viewport: () => ({ width, height }),
    renderViewport: () => ({ width, height, dpr }),
    drawActorShadow,
  };
}
