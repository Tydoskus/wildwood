import { residentDrawable } from "./runtime/resident-image";

/**
 * The Galaxy cosmetic finish: an existing piece of gear whose silhouette is
 * filled with a drifting nebula and starfield, so it reads as made of space.
 *
 * Canvas 2D has no shaders, so the "shader" is three seamless tiles painted
 * once (a nebula and two star layers), scrolled at different speeds and
 * composited per piece: tiles, then the art's own shading blended over them
 * for its outline and form, then the art's alpha as the mask, then a faint
 * rim just inside the outline. Every player wearing a piece shares one frame
 * canvas, repainted at most thirty times a second with a handful of
 * drawImage/fillRect calls and no per-pixel work; the per-pixel passes (the
 * shading and the rim) run once per piece.
 */

/** Frame canvases are this many times the art's natural size, enough for a phone's DPR at preview scale. */
const RESOLUTION = 2;
const FRAME_MS = 1_000 / 30;
const TILE = 256;
/** Below this luminance an art pixel is outline, kept dark so the piece's shape still reads. */
const OUTLINE_LUMINANCE = .2;
const RIM_PIXELS = 4;

type Layer = { velocityX: number; velocityY: number; twinkle?: number };
// Out-canvas pixels per second: the clouds crawl, the stars pass over them at
// their own speeds and directions, so the sky has depth instead of sliding as one sheet.
const LAYERS: readonly Layer[] = [
  { velocityX: 3.2, velocityY: 1.4 },
  { velocityX: 6.5, velocityY: -2.2 },
  { velocityX: -4.4, velocityY: 3.6, twinkle: 0 },
  { velocityX: 9, velocityY: 1.2, twinkle: Math.PI },
];
const TWINKLE_RATE = 1.9;

type Textures = readonly HTMLCanvasElement[];
type Piece = {
  frame: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  patterns: CanvasPattern[];
  shade: HTMLCanvasElement | null;
  rim: HTMLCanvasElement | null;
  phase: number;
  painted: number;
};

let textures: Textures | null | undefined;
let artTextureApplied = false;
let pieceCount = 0;
const pieces = new WeakMap<object, Piece | false>();
let reducedMotion: MediaQueryList | null | undefined;

function canvas(width: number, height: number) {
  if (typeof document === "undefined") return null;
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  const context = element.getContext("2d");
  return context ? { element, context } : null;
}

/** Seeded so every client paints the same sky. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Draws at every wrapped copy so the tile repeats without a seam. */
function wrapped(draw: (x: number, y: number) => void, x: number, y: number) {
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) draw(x + dx, y + dy);
}

function glow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
  gradient.addColorStop(.45, `rgba(${rgb},${alpha * .4})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function paintNebula(context: CanvasRenderingContext2D) {
  const random = seededRandom(0x9a1a);
  context.fillStyle = "#03040f";
  context.fillRect(0, 0, TILE, TILE);
  context.globalCompositeOperation = "lighter";
  // A deep blue-violet body first, then smaller, hotter clouds over it.
  const body = ["34,44,150", "70,30,150", "20,60,150"];
  for (let index = 0; index < 18; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 50 + random() * 70;
    wrapped((cx, cy) => glow(context, cx, cy, radius, body[Math.floor(random() * body.length)], .12 + random() * .1), x, y);
  }
  const clouds = ["206,58,196", "140,52,220", "40,160,232", "236,96,170", "88,96,255"];
  for (let index = 0; index < 46; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 10 + random() * 40;
    const rgb = clouds[Math.floor(random() * clouds.length)], alpha = .1 + random() * .22;
    wrapped((cx, cy) => glow(context, cx, cy, radius, rgb, alpha), x, y);
  }
  // Bright knots where the clouds are densest.
  for (let index = 0; index < 9; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 6 + random() * 12;
    const rgb = random() < .5 ? "255,200,250" : "190,230,255";
    wrapped((cx, cy) => glow(context, cx, cy, radius, rgb, .3), x, y);
  }
  // Dust lanes give the clouds contrast so they read as structure, not fog.
  context.globalCompositeOperation = "source-over";
  for (let index = 0; index < 16; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 12 + random() * 36;
    wrapped((cx, cy) => glow(context, cx, cy, radius, "2,2,10", .55), x, y);
  }
  // A fine field of distant stars that moves with the clouds.
  for (let index = 0; index < 320; index += 1) {
    context.fillStyle = `rgba(${random() < .7 ? "220,228,255" : "255,220,250"},${.18 + random() * .5})`;
    context.fillRect(Math.floor(random() * TILE), Math.floor(random() * TILE), 1, 1);
  }
}

function paintStars(context: CanvasRenderingContext2D, seed: number, count: number, size: number, glints: number) {
  const random = seededRandom(seed);
  const colors = ["255,255,255", "205,218,255", "255,224,250", "180,236,255"];
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < count; index += 1) {
    const x = random() * TILE, y = random() * TILE;
    const radius = .7 + random() ** 3 * size, rgb = colors[Math.floor(random() * colors.length)];
    const glinted = random() < glints;
    wrapped((cx, cy) => {
      if (cx < -24 || cy < -24 || cx > TILE + 24 || cy > TILE + 24) return;
      glow(context, cx, cy, radius * 4, rgb, .45);
      context.fillStyle = `rgba(${rgb},1)`;
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
      if (!glinted) return;
      context.fillStyle = `rgba(${rgb},.55)`;
      context.fillRect(cx - radius * 6, cy - .5, radius * 12, 1);
      context.fillRect(cx - .5, cy - radius * 6, 1, radius * 12);
    }, x, y);
  }
}

function galaxyTextures(): Textures | null {
  if (textures !== undefined) return textures;
  const nebula = canvas(TILE, TILE), far = canvas(TILE, TILE), nearA = canvas(TILE, TILE), nearB = canvas(TILE, TILE);
  if (!nebula || !far || !nearA || !nearB) return textures = null;
  paintNebula(nebula.context);
  paintStars(far.context, 0x51a7, 46, .6, 0);
  paintStars(nearA.context, 0x2b0c, 16, 1.4, .35);
  paintStars(nearB.context, 0x7e11, 14, 1.6, .35);
  return textures = [nebula.element, far.element, nearA.element, nearB.element];
}

function prefersReducedMotion() {
  if (reducedMotion === undefined) {
    reducedMotion = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reducedMotion?.matches === true;
}

/**
 * The piece's shading and rim, worked out once from its pixels. Shading keeps
 * the outline near black and maps the art's light and dark faces either side
 * of the neutral grey an overlay blend leaves untouched, so plates still look
 * like plates. The rim is a soft violet band just inside the outline.
 */
function pieceDetail(source: CanvasImageSource, width: number, height: number) {
  const scratch = canvas(width, height), shade = canvas(width, height), rim = canvas(width, height);
  if (!scratch || !shade || !rim) return { shade: null, rim: null };
  scratch.context.imageSmoothingEnabled = true;
  scratch.context.imageSmoothingQuality = "high";
  scratch.context.drawImage(source, 0, 0, width, height);
  let pixels: ImageData;
  try { pixels = scratch.context.getImageData(0, 0, width, height); } catch { return { shade: null, rim: null }; }
  const data = pixels.data, count = width * height;
  const shadePixels = shade.context.createImageData(width, height), rimPixels = rim.context.createImageData(width, height);
  // Distance in pixels from the edge of the lit surface, out to RIM_PIXELS.
  const distance = new Uint8Array(count);
  const queue: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4, alpha = data[offset + 3];
    if (!alpha) continue;
    const luminance = (data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114) / 255;
    const surface = luminance >= OUTLINE_LUMINANCE;
    const value = surface
      ? .36 + .36 * Math.min(1, (luminance - OUTLINE_LUMINANCE) / (1 - OUTLINE_LUMINANCE))
      : luminance * .4;
    shadePixels.data[offset] = shadePixels.data[offset + 1] = shadePixels.data[offset + 2] = Math.round(value * 255);
    shadePixels.data[offset + 3] = alpha;
    if (surface && alpha >= 128) distance[index] = 255;
  }
  for (let index = 0; index < count; index += 1) {
    if (distance[index] !== 255) continue;
    const x = index % width, y = (index - x) / width;
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
      distance[index - 1] === 0 || distance[index + 1] === 0 || distance[index - width] === 0 || distance[index + width] === 0;
    if (edge) { distance[index] = 1; queue.push(index); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head], next = distance[index] + 1;
    if (next > RIM_PIXELS) continue;
    const x = index % width;
    for (const neighbour of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
      if (neighbour < 0 || neighbour >= count || distance[neighbour] !== 255) continue;
      distance[neighbour] = next;
      queue.push(neighbour);
    }
  }
  for (let index = 0; index < count; index += 1) {
    const steps = distance[index];
    if (!steps || steps === 255) continue;
    const offset = index * 4, strength = (1 - (steps - 1) / RIM_PIXELS) ** 2;
    rimPixels.data[offset] = 168; rimPixels.data[offset + 1] = 178; rimPixels.data[offset + 2] = 255;
    rimPixels.data[offset + 3] = Math.round(strength * .5 * data[offset + 3]);
  }
  shade.context.putImageData(shadePixels, 0, 0);
  rim.context.putImageData(rimPixels, 0, 0);
  return { shade: shade.element, rim: rim.element };
}

function sourceSize(sprite: CanvasImageSource) {
  if (typeof HTMLImageElement !== "undefined" && sprite instanceof HTMLImageElement) {
    return sprite.complete ? { width: sprite.naturalWidth, height: sprite.naturalHeight } : { width: 0, height: 0 };
  }
  const sized = sprite as { width?: number; height?: number };
  return { width: Number(sized.width) || 0, height: Number(sized.height) || 0 };
}

function createPiece(sprite: CanvasImageSource, width: number, height: number): Piece | false {
  const tiles = galaxyTextures();
  const frame = canvas(width * RESOLUTION, height * RESOLUTION);
  if (!tiles || !frame) return false;
  const patterns = tiles.map(tile => frame.context.createPattern(tile, "repeat"));
  if (patterns.some(pattern => !pattern)) return false;
  const { shade, rim } = pieceDetail(residentDrawable(sprite), frame.element.width, frame.element.height);
  // Each piece starts somewhere else in the sky, so a helmet and armour worn
  // together do not show the same clouds side by side.
  return { frame: frame.element, context: frame.context, patterns: patterns as CanvasPattern[], shade, rim, phase: (pieceCount++ * 97) % TILE, painted: Number.NaN };
}

function paintPiece(piece: Piece, sprite: CanvasImageSource, seconds: number) {
  const { context, frame } = piece, width = frame.width, height = frame.height;
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  LAYERS.forEach((layer, index) => {
    if (index === 1) context.globalCompositeOperation = "lighter";
    context.globalAlpha = layer.twinkle === undefined ? 1 : .3 + .7 * (.5 + .5 * Math.sin(seconds * TWINKLE_RATE + layer.twinkle));
    const offsetX = ((seconds * layer.velocityX + piece.phase * (index + 1)) % TILE + TILE) % TILE;
    const offsetY = ((seconds * layer.velocityY + piece.phase * (index + 2)) % TILE + TILE) % TILE;
    // The pattern is anchored to the transform, so shifting the transform scrolls it.
    context.save();
    context.translate(-offsetX, -offsetY);
    context.fillStyle = piece.patterns[index];
    context.fillRect(offsetX, offsetY, width, height);
    context.restore();
  });
  context.globalAlpha = 1;
  if (piece.shade) {
    context.globalCompositeOperation = "overlay";
    context.drawImage(piece.shade, 0, 0);
  }
  context.globalCompositeOperation = "destination-in";
  context.drawImage(residentDrawable(sprite), 0, 0, width, height);
  if (piece.rim) {
    context.globalCompositeOperation = "lighter";
    context.drawImage(piece.rim, 0, 0);
  }
  context.globalCompositeOperation = "source-over";
}

/**
 * The galaxy-filled copy of `sprite` for this moment. `drawn` is the size the
 * caller draws it at, in character space (the art's own size by default); it
 * is fixed by the first call for each sprite. Null where it cannot be painted
 * (no canvas, art not loaded); callers then draw the plain art.
 */
export function galaxyFinishFrame(
  sprite: CanvasImageSource,
  drawn?: { width: number; height: number },
  nowMs = typeof performance === "undefined" ? 0 : performance.now(),
) {
  const natural = sourceSize(sprite);
  if (!natural.width || !natural.height || typeof document === "undefined") return null;
  let piece = pieces.get(sprite);
  if (piece === undefined) {
    const { width, height } = drawn?.width && drawn.height ? drawn : natural;
    pieces.set(sprite, piece = createPiece(sprite, width, height));
  }
  if (!piece) return null;
  // Reduced motion holds one still frame of the same sky.
  const moment = prefersReducedMotion() ? 0 : Math.floor(nowMs / FRAME_MS);
  if (moment !== piece.painted) {
    paintPiece(piece, sprite, moment * FRAME_MS / 1_000);
    piece.painted = moment;
  }
  return piece.frame;
}

/**
 * Inventory and inspection icons are HTML, not canvas: they mask the same sky
 * with CSS (`.has-galaxy-finish` in game.css). This hands that rule the tile,
 * once, as a custom property on the document.
 */
export function applyGalaxyArtTexture() {
  if (artTextureApplied || typeof document === "undefined") return;
  artTextureApplied = true;
  const tiles = galaxyTextures(), tile = canvas(TILE, TILE);
  if (!tiles || !tile) return;
  tile.context.drawImage(tiles[0], 0, 0);
  tile.context.globalCompositeOperation = "lighter";
  for (const layer of tiles.slice(1)) tile.context.drawImage(layer, 0, 0);
  try {
    document.documentElement.style.setProperty("--galaxy-art-texture", `url(${tile.element.toDataURL("image/jpeg", .9)})`);
  } catch {}
}
