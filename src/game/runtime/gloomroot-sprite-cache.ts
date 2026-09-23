import { bossSheetFrameGeometry, drawBossSheetFrame, type BossSheetFrameOptions } from "./boss-frame-crop";

const TAU = Math.PI * 2;

/** Gloomroot's glow. Canvas filter lengths are device pixels, so bakes happen at the device scale. */
export const GLOOMROOT_SPRITE_FILTER = "brightness(1.22) contrast(1.08) drop-shadow(0 0 12px rgba(88,238,240,.72))";

/** Room for the 12px drop-shadow blur (about 3 standard deviations) around the art, in device pixels. */
const FRAME_PADDING_PX = 32;
const AURA_PADDING_PX = 1;
const AURA_CENTER_Y = 55;
const AURA_RADIUS = 205;
/**
 * The camera eases its zoom, so a scale change arrives as a run of slightly
 * different scales. A stale bake is drawn resized until this long has passed,
 * then re-baked at the current scale.
 */
export const GLOOMROOT_REBAKE_INTERVAL_MS = 250;

type Bake = { canvas: HTMLCanvasElement; scale: number; bakedAt: number; x: number; y: number; width: number; height: number };

type CacheDependencies = {
  createCanvas: () => HTMLCanvasElement;
  now: () => number;
};

/** The soft moon-sap aura, centred on the origin the caller translated to. */
export function paintGloomrootAura(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  const aura = ctx.createRadialGradient(x, y + 45, 22, x, y + AURA_CENTER_Y, AURA_RADIUS);
  aura.addColorStop(0, "rgba(92,247,244,.3)");
  aura.addColorStop(.55, "rgba(35,154,173,.13)");
  aura.addColorStop(1, "rgba(14,45,65,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y + AURA_CENTER_Y, AURA_RADIUS, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Canvas units to device pixels under the context's current transform, or null when it cannot be read. */
function deviceScale(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.getTransform !== "function") return null;
  const matrix = ctx.getTransform();
  const scale = Math.hypot(matrix.a, matrix.b);
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * Gloomroot is a large sprite drawn through a brightness, contrast and
 * drop-shadow filter, over a radial-gradient aura. Both were rebuilt every
 * frame. This draws each once into an offscreen canvas at the device scale,
 * with the same filter string and gradient, and then only copies it.
 */
export function createGloomrootSpriteCache(dependencies: CacheDependencies = {
  createCanvas: () => document.createElement("canvas"),
  now: () => performance.now(),
}) {
  const frames = new Map<number, Bake>();
  let aura: Bake | null = null;
  let sheetSource: CanvasImageSource | null = null;
  let sheetWidth = 0;
  let sheetHeight = 0;

  function usable(bake: Bake, scale: number, now: number) {
    return Math.abs(bake.scale / scale - 1) < 1e-3 || now - bake.bakedAt < GLOOMROOT_REBAKE_INTERVAL_MS;
  }

  function bake(
    box: { x: number; y: number; width: number; height: number },
    scale: number,
    paddingPx: number,
    reuse: HTMLCanvasElement | undefined,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ): Bake | null {
    const canvas = reuse ?? dependencies.createCanvas();
    const width = Math.ceil(box.width * scale) + paddingPx * 2;
    const height = Math.ceil(box.height * scale) + paddingPx * 2;
    // Resizing also clears the canvas and resets its context state.
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(scale, 0, 0, scale, paddingPx - box.x * scale, paddingPx - box.y * scale);
    paint(ctx);
    return {
      canvas, scale, bakedAt: dependencies.now(),
      x: box.x - paddingPx / scale, y: box.y - paddingPx / scale, width: width / scale, height: height / scale,
    };
  }

  function reset() {
    frames.clear();
    aura = null;
    sheetSource = null;
    sheetWidth = 0;
    sheetHeight = 0;
  }

  return {
    reset,

    /** Draws the aura around (x, y). Returns false when the caller must paint it live. */
    drawAura(ctx: CanvasRenderingContext2D, x: number, y: number) {
      const scale = deviceScale(ctx);
      if (!scale) return false;
      if (!aura || !usable(aura, scale, dependencies.now())) {
        const box = { x: -AURA_RADIUS, y: AURA_CENTER_Y - AURA_RADIUS, width: AURA_RADIUS * 2, height: AURA_RADIUS * 2 };
        aura = bake(box, scale, AURA_PADDING_PX, aura?.canvas, bakeContext => paintGloomrootAura(bakeContext, 0, 0));
        if (!aura) return false;
      }
      ctx.drawImage(aura.canvas, x + aura.x, y + aura.y, aura.width, aura.height);
      return true;
    },

    /**
     * Draws one filtered sheet frame at the origin, scaled by `pulse` about it,
     * as the renderer's translate-then-scale did. Call it after translating to
     * the boss and before applying the pulse. Returns false when the caller
     * must draw it live.
     */
    drawFrame(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource & { width: number; height: number }, options: BossSheetFrameOptions, pulse = 1) {
      const scale = deviceScale(ctx);
      if (!scale) return false;
      if (sheet !== sheetSource || sheet.width !== sheetWidth || sheet.height !== sheetHeight) {
        frames.clear();
        sheetSource = sheet;
        sheetWidth = sheet.width;
        sheetHeight = sheet.height;
      }
      const geometry = bossSheetFrameGeometry(options);
      if (!geometry) return true;
      // Baked without the bloom pulse, which changes every frame; the pulse is
      // at most 1.8%, applied when the bake is drawn.
      let frame = frames.get(options.frame);
      if (!frame || !usable(frame, scale, dependencies.now())) {
        const baked = bake(geometry, scale, FRAME_PADDING_PX, frame?.canvas, bakeContext => {
          bakeContext.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
          bakeContext.imageSmoothingQuality = ctx.imageSmoothingQuality;
          bakeContext.filter = GLOOMROOT_SPRITE_FILTER;
          drawBossSheetFrame(bakeContext, sheet, options);
        });
        if (!baked) return false;
        frame = baked;
        frames.set(options.frame, frame);
      }
      ctx.drawImage(frame.canvas, frame.x * pulse, frame.y * pulse, frame.width * pulse, frame.height * pulse);
      return true;
    },
  };
}
