import { createCanvasPrimitives } from "../canvas";
import { requiredCanvasContext } from "./dom";

export function gameplayBottomInset(toolbarHeight: number) {
  return Number.isFinite(toolbarHeight) ? Math.max(0, toolbarHeight) : 0;
}

export function createCanvasRuntime({
  canvas,
  bottomInset,
  transparent = false,
  getActorShadowSprite,
}: {
  canvas: HTMLCanvasElement;
  bottomInset?: () => number;
  transparent?: boolean;
  getActorShadowSprite: () => HTMLImageElement | null;
}) {
  const ctx = requiredCanvasContext(canvas, { alpha: transparent });
  const primitives = createCanvasPrimitives(ctx);
  let dpr = 1;
  let width = innerWidth;
  let height = innerHeight;

  function resize() {
    width = innerWidth;
    const reservedBottom = Math.max(0, Math.round(bottomInset?.() ?? 0));
    height = Math.max(1, innerHeight - reservedBottom);
    dpr = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.bottom = `${reservedBottom}px`;
    document.documentElement.style.setProperty("--gameplay-bottom-inset", `${reservedBottom}px`);
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
  window.visualViewport?.addEventListener("resize", resize);
  resize();

  return {
    ctx,
    ...primitives,
    resize,
    dpr: () => dpr,
    viewport: () => ({ width, height }),
    renderViewport: () => ({ width, height, dpr }),
    drawActorShadow,
  };
}
