import { residentDrawable } from "./runtime/resident-image";

/**
 * The sky finishes for cosmetic equipment: an existing piece of gear whose
 * silhouette is filled with a drifting nebula and starfield, so it reads as
 * made of space. Galaxy is deep violet; Diamond Galaxy is the Patreon Diamond
 * frame's icy cyan with diamond sparkles. They are one finish with two palettes.
 *
 * Canvas 2D has no shaders, so the "shader" is four seamless tiles painted
 * once per palette (a nebula and three star layers), scrolled at different
 * speeds and composited per piece: tiles, then the art's own shading blended
 * over them for its form, then the art's alpha as the mask, then the art's own
 * black outline drawn back on top, so no sky shows through it. Every player
 * wearing a piece shares one frame canvas, repainted at most thirty times a
 * second with a handful of drawImage/fillRect calls and no per-pixel work; the
 * per-pixel passes (the shading and the outline) run once per piece.
 */
export type SkyFinish = "GALAXY" | "DIAMOND_GALAXY";

type SkyPalette = {
  /** The nebula's seed, then the far, near and nearest star layers'. */
  seed: number;
  starSeeds: readonly [number, number, number];
  /** The nebula's empty sky, under its clouds. */
  base: string;
  /** Large soft clouds, then smaller hotter ones over them, then bright knots. */
  body: readonly string[];
  clouds: readonly string[];
  knots: readonly string[];
  /** Dark lanes that give the clouds structure, and how dark. */
  dust: string;
  dustAlpha: number;
  dustStars: readonly string[];
  stars: readonly string[];
  /** Share of near stars drawn with a glint, the glint's shape, and the largest star. */
  glints: number;
  sparkle: "CROSS" | "DIAMOND";
  starSize: number;
  twinkleRate: number;
  /** The shine: a soft band of light a little inside the outline (never against it, where it read as a pale line). */
  shine: readonly [number, number, number];
  shineStrength: number;
  /** The CSS custom property icons read the tile from, and what they show before it is painted. */
  cssVariable: string;
  cssFallback: string;
};

const PALETTES: Record<SkyFinish, SkyPalette> = {
  GALAXY: {
    seed: 0x9a1a, starSeeds: [0x51a7, 0x2b0c, 0x7e11], base: "#03040f",
    body: ["34,44,150", "70,30,150", "20,60,150"],
    clouds: ["206,58,196", "140,52,220", "40,160,232", "236,96,170", "88,96,255"],
    knots: ["255,200,250", "190,230,255"],
    dust: "2,2,10", dustAlpha: .55,
    dustStars: ["220,228,255", "255,220,250"],
    stars: ["255,255,255", "205,218,255", "255,224,250", "180,236,255"],
    glints: .35, sparkle: "CROSS", starSize: 1.5, twinkleRate: 1.9,
    shine: [168, 178, 255], shineStrength: .16,
    cssVariable: "--galaxy-art-texture",
    cssFallback: "radial-gradient(circle at 35% 35%, #6a3cc8, #1c2276 45%, #050619 80%)",
  },
  // The Patreon Diamond frame's colours (avatar-frames/patreon_diamond.webp and
  // its glow in game.css): ice blue #90d8ff, pale #c0f0ff, glow #d8f2ff, halo
  // #7ecbff, over the frame's deep #1860a8 facets, with a touch of prism.
  DIAMOND_GALAXY: {
    seed: 0xd1a3, starSeeds: [0x3c55, 0x6e29, 0x1fb4], base: "#0b2442",
    body: ["40,110,190", "60,140,210", "24,80,160"],
    clouds: ["144,216,255", "120,192,240", "192,240,255", "160,250,240", "216,242,255", "176,196,255"],
    knots: ["240,252,255", "200,245,255"],
    dust: "6,24,52", dustAlpha: .45,
    dustStars: ["225,245,255", "190,235,255"],
    stars: ["255,255,255", "216,242,255", "170,230,255", "235,250,255"],
    glints: .7, sparkle: "DIAMOND", starSize: 1.9, twinkleRate: 2.6,
    shine: [216, 246, 255], shineStrength: .34,
    cssVariable: "--diamond-galaxy-art-texture",
    cssFallback: "radial-gradient(circle at 35% 35%, #d8f2ff, #7ecbff 40%, #1860a8 80%)",
  },
};

/** Frame canvases are this many times the drawn size, enough for a phone's DPR at preview scale. */
const RESOLUTION = 2;
const FRAME_MS = 1_000 / 30;
const TILE = 256;
/** Below this luminance an art pixel is outline, kept dark so the piece's shape still reads. */
const OUTLINE_LUMINANCE = .2;
/** At or below this an art pixel is the black line itself, drawn back over the sky whole. */
const LINE_LUMINANCE = .15;
/**
 * A pixel touching the line and darker than this is its soft edge, drawn back
 * in part so the edge fades to black rather than to sky. Only next to the line:
 * dark leather boots are fill this dark, and must keep their sky.
 */
const LINE_EDGE_LUMINANCE = .42;
/** The shine band, in frame pixels in from the edge of the plate: dark until SHINE_GAP, brightest at SHINE_PEAK, gone by SHINE_END. */
const SHINE_GAP = 2;
const SHINE_PEAK = 7;
const SHINE_END = 16;

type Layer = { velocityX: number; velocityY: number; twinkle?: number };
// Out-canvas pixels per second: the clouds crawl, the stars pass over them at
// their own speeds and directions, so the sky has depth instead of sliding as one sheet.
const LAYERS: readonly Layer[] = [
  { velocityX: 3.2, velocityY: 1.4 },
  { velocityX: 6.5, velocityY: -2.2 },
  { velocityX: -4.4, velocityY: 3.6, twinkle: 0 },
  { velocityX: 9, velocityY: 1.2, twinkle: Math.PI },
];

type Textures = readonly HTMLCanvasElement[];
type Piece = {
  frame: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  patterns: CanvasPattern[];
  shade: HTMLCanvasElement | null;
  outline: HTMLCanvasElement | null;
  shine: HTMLCanvasElement | null;
  phase: number;
  painted: number;
};

const textures = new Map<SkyFinish, Textures | null>();
const artTexturesApplied = new Set<SkyFinish>();
let pieceCount = 0;
const pieces = new WeakMap<object, Map<SkyFinish, Piece | false>>();
let reducedMotion: MediaQueryList | null | undefined;

export function skyFinishCssVariable(finish: SkyFinish) { return PALETTES[finish].cssVariable; }
export function skyFinishCssFallback(finish: SkyFinish) { return PALETTES[finish].cssFallback; }

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

const pick = <T,>(random: () => number, values: readonly T[]) => values[Math.floor(random() * values.length)];

function paintNebula(context: CanvasRenderingContext2D, palette: SkyPalette) {
  const random = seededRandom(palette.seed);
  context.fillStyle = palette.base;
  context.fillRect(0, 0, TILE, TILE);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 18; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 50 + random() * 70;
    wrapped((cx, cy) => glow(context, cx, cy, radius, pick(random, palette.body), .12 + random() * .1), x, y);
  }
  for (let index = 0; index < 46; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 10 + random() * 40;
    const rgb = pick(random, palette.clouds), alpha = .1 + random() * .22;
    wrapped((cx, cy) => glow(context, cx, cy, radius, rgb, alpha), x, y);
  }
  // Bright knots where the clouds are densest.
  for (let index = 0; index < 9; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 6 + random() * 12;
    wrapped((cx, cy) => glow(context, cx, cy, radius, pick(random, palette.knots), .3), x, y);
  }
  // Dust lanes give the clouds contrast so they read as structure, not fog.
  context.globalCompositeOperation = "source-over";
  for (let index = 0; index < 16; index += 1) {
    const x = random() * TILE, y = random() * TILE, radius = 12 + random() * 36;
    wrapped((cx, cy) => glow(context, cx, cy, radius, palette.dust, palette.dustAlpha), x, y);
  }
  // A fine field of distant stars that moves with the clouds.
  for (let index = 0; index < 320; index += 1) {
    context.fillStyle = `rgba(${random() < .7 ? palette.dustStars[0] : palette.dustStars[1]},${.18 + random() * .5})`;
    context.fillRect(Math.floor(random() * TILE), Math.floor(random() * TILE), 1, 1);
  }
}

/** A four-point sparkle: concave spikes, like light off a cut stone. */
function sparkle(context: CanvasRenderingContext2D, x: number, y: number, length: number) {
  context.beginPath();
  context.moveTo(x, y - length);
  context.quadraticCurveTo(x, y, x + length, y);
  context.quadraticCurveTo(x, y, x, y + length);
  context.quadraticCurveTo(x, y, x - length, y);
  context.quadraticCurveTo(x, y, x, y - length);
  context.fill();
}

function paintStars(context: CanvasRenderingContext2D, palette: SkyPalette, seed: number, count: number, size: number, glints: number) {
  const random = seededRandom(seed);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < count; index += 1) {
    const x = random() * TILE, y = random() * TILE;
    const radius = .7 + random() ** 3 * size, rgb = pick(random, palette.stars);
    const glinted = random() < glints;
    wrapped((cx, cy) => {
      if (cx < -24 || cy < -24 || cx > TILE + 24 || cy > TILE + 24) return;
      glow(context, cx, cy, radius * 4, rgb, .45);
      context.fillStyle = `rgba(${rgb},1)`;
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
      if (!glinted) return;
      if (palette.sparkle === "DIAMOND") {
        context.fillStyle = `rgba(${rgb},.9)`;
        sparkle(context, cx, cy, radius * 6);
        context.save();
        context.translate(cx, cy); context.rotate(Math.PI / 4);
        context.fillStyle = `rgba(${rgb},.5)`;
        sparkle(context, 0, 0, radius * 2.8);
        context.restore();
        return;
      }
      context.fillStyle = `rgba(${rgb},.55)`;
      context.fillRect(cx - radius * 6, cy - .5, radius * 12, 1);
      context.fillRect(cx - .5, cy - radius * 6, 1, radius * 12);
    }, x, y);
  }
}

function skyTextures(finish: SkyFinish): Textures | null {
  const known = textures.get(finish);
  if (known !== undefined) return known;
  const palette = PALETTES[finish];
  const nebula = canvas(TILE, TILE), far = canvas(TILE, TILE), nearA = canvas(TILE, TILE), nearB = canvas(TILE, TILE);
  if (!nebula || !far || !nearA || !nearB) { textures.set(finish, null); return null; }
  paintNebula(nebula.context, palette);
  const [farSeed, nearSeed, nearestSeed] = palette.starSeeds;
  paintStars(far.context, palette, farSeed, 46, .6, 0);
  paintStars(nearA.context, palette, nearSeed, 16, palette.starSize - .1, palette.glints);
  paintStars(nearB.context, palette, nearestSeed, 14, palette.starSize + .1, palette.glints);
  const painted = [nebula.element, far.element, nearA.element, nearB.element];
  textures.set(finish, painted);
  return painted;
}

function prefersReducedMotion() {
  if (reducedMotion === undefined) {
    reducedMotion = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reducedMotion?.matches === true;
}

/**
 * How much of each art pixel is the black line, 0 to 1: all of it at or below
 * LINE_LUMINANCE, part of it for the soft edge touching the line, none for the
 * plate. Shared by the canvas finish and the icons' outline image.
 */
function lineWeights(data: Uint8ClampedArray, luminances: Float32Array, width: number, height: number) {
  const count = width * height, weights = new Float32Array(count);
  const isLine = (index: number) => data[index * 4 + 3] >= 128 && luminances[index] <= LINE_LUMINANCE;
  for (let index = 0; index < count; index += 1) {
    const luminance = luminances[index];
    if (!data[index * 4 + 3] || luminance >= LINE_EDGE_LUMINANCE) continue;
    if (luminance <= LINE_LUMINANCE) { weights[index] = 1; continue; }
    const x = index % width;
    const touches = (x > 0 && isLine(index - 1)) || (x < width - 1 && isLine(index + 1))
      || (index >= width && isLine(index - width)) || (index + width < count && isLine(index + width));
    if (touches) weights[index] = (LINE_EDGE_LUMINANCE - luminance) / (LINE_EDGE_LUMINANCE - LINE_LUMINANCE);
  }
  return weights;
}

/**
 * The piece's shading and outline, worked out once from its pixels. Shading
 * maps the art's light and dark faces either side of the neutral grey an
 * overlay blend leaves untouched, so plates still look like plates. The
 * outline is the art's own dark pixels, drawn over the finished sky: an
 * overlay only dims a bright star, so without it stars showed through the line.
 */
function pieceDetail(source: CanvasImageSource, width: number, height: number, palette: SkyPalette) {
  const scratch = canvas(width, height), shade = canvas(width, height), outline = canvas(width, height), shine = canvas(width, height);
  if (!scratch || !shade || !outline || !shine) return { shade: null, outline: null, shine: null };
  scratch.context.imageSmoothingEnabled = true;
  scratch.context.imageSmoothingQuality = "high";
  scratch.context.drawImage(source, 0, 0, width, height);
  let pixels: ImageData;
  try { pixels = scratch.context.getImageData(0, 0, width, height); } catch { return { shade: null, outline: null, shine: null }; }
  const data = pixels.data, count = width * height;
  const shadePixels = shade.context.createImageData(width, height), outlinePixels = outline.context.createImageData(width, height);
  const luminances = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4, alpha = data[offset + 3];
    if (!alpha) continue;
    const luminance = (data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114) / 255;
    const value = luminance >= OUTLINE_LUMINANCE
      ? .36 + .36 * Math.min(1, (luminance - OUTLINE_LUMINANCE) / (1 - OUTLINE_LUMINANCE))
      : luminance * .4;
    shadePixels.data[offset] = shadePixels.data[offset + 1] = shadePixels.data[offset + 2] = Math.round(value * 255);
    shadePixels.data[offset + 3] = alpha;
    luminances[index] = luminance;
  }
  const weights = lineWeights(data, luminances, width, height);
  for (let index = 0; index < count; index += 1) {
    const weight = weights[index];
    if (!weight) continue;
    // Solid by its weight, not by the art's alpha: it covers the sky before the art's shape
    // cuts the piece, so a soft outer edge fades from black to clear, never through sky.
    const offset = index * 4;
    outlinePixels.data[offset] = data[offset];
    outlinePixels.data[offset + 1] = data[offset + 1];
    outlinePixels.data[offset + 2] = data[offset + 2];
    outlinePixels.data[offset + 3] = Math.round(255 * weight);
  }
  // Distance in from the plate's edge (the line or the outside), out to SHINE_END.
  const distance = new Uint8Array(count), queue: number[] = [];
  const plate = (index: number) => data[index * 4 + 3] >= 128 && luminances[index] > LINE_EDGE_LUMINANCE;
  for (let index = 0; index < count; index += 1) {
    if (!plate(index)) continue;
    const x = index % width, y = (index - x) / width;
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !plate(index - 1) || !plate(index + 1) || !plate(index - width) || !plate(index + width);
    distance[index] = edge ? 1 : 255;
    if (edge) queue.push(index);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head], next = distance[index] + 1;
    if (next > SHINE_END) continue;
    const x = index % width;
    for (const neighbour of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
      if (neighbour < 0 || neighbour >= count || distance[neighbour] !== 255) continue;
      distance[neighbour] = next;
      queue.push(neighbour);
    }
  }
  const shinePixels = shine.context.createImageData(width, height), [red, green, blue] = palette.shine;
  for (let index = 0; index < count; index += 1) {
    const steps = distance[index];
    if (!steps || steps === 255 || steps <= SHINE_GAP) continue;
    const reach = steps < SHINE_PEAK ? (steps - SHINE_GAP) / (SHINE_PEAK - SHINE_GAP) : (SHINE_END - steps) / (SHINE_END - SHINE_PEAK);
    if (reach <= 0) continue;
    const offset = index * 4;
    shinePixels.data[offset] = red; shinePixels.data[offset + 1] = green; shinePixels.data[offset + 2] = blue;
    shinePixels.data[offset + 3] = Math.round(255 * palette.shineStrength * reach * reach);
  }
  shade.context.putImageData(shadePixels, 0, 0);
  outline.context.putImageData(outlinePixels, 0, 0);
  shine.context.putImageData(shinePixels, 0, 0);
  return { shade: shade.element, outline: outline.element, shine: shine.element };
}

function sourceSize(sprite: CanvasImageSource) {
  if (typeof HTMLImageElement !== "undefined" && sprite instanceof HTMLImageElement) {
    return sprite.complete ? { width: sprite.naturalWidth, height: sprite.naturalHeight } : { width: 0, height: 0 };
  }
  const sized = sprite as { width?: number; height?: number };
  return { width: Number(sized.width) || 0, height: Number(sized.height) || 0 };
}

function createPiece(sprite: CanvasImageSource, width: number, height: number, finish: SkyFinish): Piece | false {
  const tiles = skyTextures(finish);
  const frame = canvas(width * RESOLUTION, height * RESOLUTION);
  if (!tiles || !frame) return false;
  const patterns = tiles.map(tile => frame.context.createPattern(tile, "repeat"));
  if (patterns.some(pattern => !pattern)) return false;
  const { shade, outline, shine } = pieceDetail(residentDrawable(sprite), frame.element.width, frame.element.height, PALETTES[finish]);
  // Each piece starts somewhere else in the sky, so a helmet and armour worn
  // together do not show the same clouds side by side.
  return { frame: frame.element, context: frame.context, patterns: patterns as CanvasPattern[], shade, outline, shine, phase: (pieceCount++ * 97) % TILE, painted: Number.NaN };
}

function paintPiece(piece: Piece, sprite: CanvasImageSource, seconds: number, palette: SkyPalette) {
  const { context, frame } = piece, width = frame.width, height = frame.height;
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  LAYERS.forEach((layer, index) => {
    if (index === 1) context.globalCompositeOperation = "lighter";
    context.globalAlpha = layer.twinkle === undefined ? 1 : .3 + .7 * (.5 + .5 * Math.sin(seconds * palette.twinkleRate + layer.twinkle));
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
  if (piece.shine) {
    context.globalCompositeOperation = "lighter";
    context.drawImage(piece.shine, 0, 0);
  }
  // The line goes on before the art's shape cuts the piece (see pieceDetail), so no sky edges it.
  context.globalCompositeOperation = "source-over";
  if (piece.outline) context.drawImage(piece.outline, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(residentDrawable(sprite), 0, 0, width, height);
  context.globalCompositeOperation = "source-over";
}

/**
 * The sky-filled copy of `sprite` for this moment, Galaxy unless `finish` says
 * otherwise. `drawn` is the size the caller draws it at, in character space
 * (the art's own size by default); it is fixed by the first call for each
 * sprite and finish. Null where it cannot be painted (no canvas, art not
 * loaded); callers then draw the plain art.
 */
export function galaxyFinishFrame(
  sprite: CanvasImageSource,
  drawn?: { width: number; height: number },
  nowMs = typeof performance === "undefined" ? 0 : performance.now(),
  finish: SkyFinish = "GALAXY",
) {
  const natural = sourceSize(sprite);
  if (!natural.width || !natural.height || typeof document === "undefined") return null;
  let byFinish = pieces.get(sprite);
  if (!byFinish) pieces.set(sprite, byFinish = new Map());
  let piece = byFinish.get(finish);
  if (piece === undefined) {
    const { width, height } = drawn?.width && drawn.height ? drawn : natural;
    byFinish.set(finish, piece = createPiece(sprite, width, height, finish));
  }
  if (!piece) return null;
  // Reduced motion holds one still frame of the same sky.
  const moment = prefersReducedMotion() ? 0 : Math.floor(nowMs / FRAME_MS);
  if (moment !== piece.painted) {
    paintPiece(piece, sprite, moment * FRAME_MS / 1_000, PALETTES[finish]);
    piece.painted = moment;
  }
  return piece.frame;
}

/**
 * Inventory and inspection icons are HTML, not canvas: they mask the same sky
 * with CSS (`.has-galaxy-finish` in game.css). This hands that rule the
 * palette's tile, once, as a custom property on the document.
 */
const iconOutlines = new Map<string, string>();
/**
 * An icon's outline, the same line weights as the canvas finish (lineWeights),
 * as an image laid over its sky: the CSS filters it replaced only darkened the
 * sky by a thin line's coverage, so at slot size the line vanished and sky
 * showed past it. Made once per art when it loads, handed over as a custom
 * property on the document as the sky tile is; until then the icon has none.
 * Returns the property's name.
 */
export function galaxyIconOutlineVariable(source: string) {
  const known = iconOutlines.get(source);
  if (known) return known;
  const name = `--galaxy-outline-${iconOutlines.size + 1}`;
  iconOutlines.set(source, name);
  if (typeof document === "undefined" || typeof Image === "undefined") return name;
  const image = new Image();
  image.onload = () => {
    const width = image.naturalWidth, height = image.naturalHeight, art = canvas(width, height), out = canvas(width, height);
    if (!art || !out || !width || !height) return;
    art.context.drawImage(image, 0, 0);
    let pixels: ImageData;
    try { pixels = art.context.getImageData(0, 0, width, height); } catch { return; }
    const data = pixels.data, count = width * height, luminances = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      luminances[index] = (data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114) / 255;
    }
    const weights = lineWeights(data, luminances, width, height), line = out.context.createImageData(width, height);
    for (let index = 0; index < count; index += 1) {
      if (!weights[index]) continue;
      const offset = index * 4;
      line.data[offset] = data[offset]; line.data[offset + 1] = data[offset + 1]; line.data[offset + 2] = data[offset + 2];
      line.data[offset + 3] = Math.round(255 * weights[index]);
    }
    out.context.putImageData(line, 0, 0);
    try { document.documentElement.style.setProperty(name, `url(${out.element.toDataURL("image/png")})`); } catch {}
  };
  image.src = source;
  return name;
}

export function applyGalaxyArtTexture(finish: SkyFinish = "GALAXY") {
  if (artTexturesApplied.has(finish) || typeof document === "undefined") return;
  artTexturesApplied.add(finish);
  const tiles = skyTextures(finish), tile = canvas(TILE, TILE);
  if (!tiles || !tile) return;
  tile.context.drawImage(tiles[0], 0, 0);
  tile.context.globalCompositeOperation = "lighter";
  for (const layer of tiles.slice(1)) tile.context.drawImage(layer, 0, 0);
  try {
    document.documentElement.style.setProperty(PALETTES[finish].cssVariable, `url(${tile.element.toDataURL("image/jpeg", .9)})`);
  } catch {}
}
