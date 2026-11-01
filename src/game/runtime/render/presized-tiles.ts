type TileSource = HTMLCanvasElement | ImageBitmap;
type Presized = { canvas: HTMLCanvasElement; width: number; height: number };

/**
 * Ground tiles the 2D canvas draws, each copied once at the device pixels it covers: a software canvas
 * (Firefox) then copies a tile instead of re-sampling it every frame. A copy is only used where the tile
 * lands on whole device pixels, so it draws the same pixels as the scaled draw would.
 * Kept up to a pixel budget, a few screens' worth; the least recently drawn go first.
 * Only for tiles drawn at one pixel per world unit times the canvas scale (the world's ground tiles).
 */
export function createPresizedTiles(screensKept = 5) {
  const kept = new Map<string, Presized>();
  const keys = new WeakMap<TileSource, number>();
  let nextKey = 0, pixels = 0;
  const sourceKey = (source: TileSource) => {
    let key = keys.get(source);
    if (key === undefined) keys.set(source, key = nextKey++);
    return key;
  };
  return function drawTile(ctx: CanvasRenderingContext2D, source: TileSource, left: number, top: number, width: number, height: number) {
    const t = typeof document === "undefined" || typeof ctx.getTransform !== "function" ? null : ctx.getTransform();
    const x = t ? t.a * left + t.e : 0, y = t ? t.d * top + t.f : 0, w = t ? t.a * width : 0, h = t ? t.d * height : 0;
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    const whole = Math.abs(x - rx) < .01 && Math.abs(y - ry) < .01 && Math.abs(w - rw) < .01 && Math.abs(h - rh) < .01;
    // One copy per tile, at the size a whole tile covers; a tile drawn a pixel wider or narrower (snapping) draws as before.
    const fits = t !== null && rw === Math.round(t.a * source.width) && rh === Math.round(t.d * source.height);
    if (!t || t.b || t.c || !whole || !fits || source.width < 64 || rw <= 0 || rh <= 0 || (rw === source.width && rh === source.height)) {
      ctx.drawImage(source, left, top, width, height);
      return;
    }
    const key = `${sourceKey(source)}|${rw}x${rh}|${ctx.imageSmoothingEnabled ? ctx.imageSmoothingQuality : "off"}`;
    let entry = kept.get(key);
    if (entry) kept.delete(key);
    else {
      const canvas = document.createElement("canvas");
      canvas.width = rw; canvas.height = rh;
      // Ground tiles are painted solid (the ground colour first), so the copy can be opaque: a straight copy to draw.
      const copy = canvas.getContext("2d", { alpha: false });
      if (!copy) { ctx.drawImage(source, left, top, width, height); return; }
      copy.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      copy.imageSmoothingQuality = ctx.imageSmoothingQuality;
      copy.drawImage(source, 0, 0, rw, rh);
      entry = { canvas, width: rw, height: rh };
      pixels += rw * rh;
    }
    kept.set(key, entry);
    const budget = screensKept * ctx.canvas.width * ctx.canvas.height;
    for (const [oldKey, old] of kept) {
      if (pixels <= budget || old === entry) break;
      kept.delete(oldKey);
      pixels -= old.width * old.height;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(entry.canvas, rx, ry);
    ctx.restore();
  };
}
