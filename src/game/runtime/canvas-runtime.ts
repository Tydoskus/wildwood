import { createCanvasPrimitives } from "../canvas";
import { requiredCanvasContext } from "./dom";

export function gameplayBottomInset(toolbarHeight: number) {
  return Number.isFinite(toolbarHeight) ? Math.max(0, toolbarHeight) : 0;
}

export function canvasViewportMetrics(
  viewportWidth: number,
  viewportHeight: number,
  reservedBottom: number,
  pixelRatio: number,
) {
  const width = Math.max(1, Math.round(Number.isFinite(viewportWidth) ? viewportWidth : 1));
  const bottom = Math.max(0, Math.round(Number.isFinite(reservedBottom) ? reservedBottom : 0));
  const height = Math.max(1, Math.round(Number.isFinite(viewportHeight) ? viewportHeight : 1) - bottom);
  const dpr = Math.min(Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1), 3);
  return {
    width,
    height,
    reservedBottom: bottom,
    dpr,
    backingWidth: Math.round(width * dpr),
    backingHeight: Math.round(height * dpr),
  };
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
  let initialized = false;
  let resizeFrame = 0;

  function resize() {
    const metrics = canvasViewportMetrics(innerWidth, innerHeight, bottomInset?.() ?? 0, devicePixelRatio || 1);
    const backingChanged = canvas.width !== metrics.backingWidth || canvas.height !== metrics.backingHeight;
    const transformChanged = !initialized || dpr !== metrics.dpr;
    width = metrics.width;
    height = metrics.height;
    dpr = metrics.dpr;
    if (canvas.width !== metrics.backingWidth) canvas.width = metrics.backingWidth;
    if (canvas.height !== metrics.backingHeight) canvas.height = metrics.backingHeight;
    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;
    const cssBottom = `${metrics.reservedBottom}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
    if (canvas.style.bottom !== cssBottom) canvas.style.bottom = cssBottom;
    if (document.documentElement.style.getPropertyValue("--gameplay-bottom-inset") !== cssBottom) {
      document.documentElement.style.setProperty("--gameplay-bottom-inset", cssBottom);
    }
    if (backingChanged || transformChanged) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    initialized = true;
  }

  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  }

  function drawActorShadow(x: number, y: number, shadowWidth: number, alpha = .38) {
    const shadowHeight = Math.max(8, Math.round(shadowWidth * 33 / 86));
    const sprite = getActorShadowSprite();
    ctx.save();
    ctx.globalAlpha = alpha;
    if (sprite?.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, x - shadowWidth / 2, y - shadowHeight / 2, Math.round(shadowWidth), shadowHeight);
    } else {
      ctx.fillStyle = "#102719";
      ctx.beginPath();
      ctx.ellipse(x, y, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  window.addEventListener("resize", scheduleResize);
  window.visualViewport?.addEventListener("resize", scheduleResize);
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
