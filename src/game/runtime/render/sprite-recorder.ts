import { fillOutlines, flattenPath, signedArea, strokeOutlines, type Outline, type Subpath } from "./path-geometry";
import {
  createVectorRasterCache, type Effects, type GradientRecord, type LineStyle, type Matrix, type PaintStyle, type PathCommand, type VectorOp,
} from "./vector-raster-cache";

/**
 * Stands in for the game's 2D context while the world is drawn, and turns what it draws into textured quads for
 * the WebGL world layer, in the order they were drawn. Images become quads of their own texture. Shapes, live text
 * and clipped groups are drawn once by a real 2D context into cached canvases (vector-raster-cache.ts) and become
 * quads of those. What it cannot reproduce (reading pixels back, clearing, other blend modes) throws
 * SpriteRecorderUnsupported, and the frame is drawn on the 2D canvas instead.
 */

export type SpriteSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;
export type SpriteBlend = "normal" | "add";
/**
 * Consecutive quads drawn with one texture, filter, blend and clip. A null source is a solid colour. `radial` is null for
 * an image, or a radial gradient's inner radius as a share of its outer one: the source is then its colour ramp.
 * `ring` is a solid circle or ring the shader draws: its inner radius as a share of its outer one, and one device
 * pixel in the same units. `linear` batches sample their colour ramp at u. `scissor` is a clip rectangle in device
 * pixels (left, top, right, bottom), or null. `stencil` is the step of a path it draws (STENCIL), or 0.
 */
export type SpriteBatch = {
  source: SpriteSource | null; smooth: boolean; blend: SpriteBlend; radial: number | null; ring: readonly [number, number] | null;
  linear: boolean; scissor: readonly number[] | null; stencil: number; first: number; count: number;
};

/**
 * A path is drawn in three steps (NanoVG's method): its triangles mark where it is in the stencil buffer under its
 * fill rule (a stroke's pieces by their union), a soft edge is drawn where it is not, then one rectangle covers it
 * and clears the marks.
 */
export const STENCIL = { nonzero: 1, evenodd: 2, union: 3, edge: 4, cover: 5 } as const;
/** Path quads a frame may hold; past it a path is rastered instead. */
const MAX_PATH_QUADS = 40_000;

/** Floats per vertex: device x, y, texture u, v, and a premultiplied colour multiplier r, g, b, a. */
export const SPRITE_VERTEX_FLOATS = 8;
const QUAD_FLOATS = SPRITE_VERTEX_FLOATS * 4;
/** The most quads one batch holds: their vertex numbers must fit the WebGL pass's 16-bit index. */
export const MAX_BATCH_QUADS = 16_384;
/** The most quads one frame records. */
const MAX_RECORDED_QUADS = 65_536;

export class SpriteRecorderUnsupported extends Error {
  constructor(readonly operation: string) { super(`World sprite recorder cannot draw ${operation}`); }
}

type State = {
  a: number; b: number; c: number; d: number; e: number; f: number;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  globalCompositeOperation: GlobalCompositeOperation;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  filter: string;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  lineDashOffset: number;
  lineDash: number[];
  imageSmoothingQuality: ImageSmoothingQuality;
  letterSpacing: string;
  /** A rectangle clip the GPU's scissor test applies, in device pixels: left, top, right, bottom. */
  scissor: readonly number[] | null;
};

const COPIED_PROPERTIES = [
  "globalAlpha", "imageSmoothingEnabled", "globalCompositeOperation", "fillStyle", "strokeStyle", "filter", "shadowBlur",
  "shadowColor", "shadowOffsetX", "shadowOffsetY", "font", "textAlign", "textBaseline", "direction", "lineWidth", "lineCap",
  "lineJoin", "miterLimit", "lineDashOffset", "imageSmoothingQuality", "letterSpacing",
] as const;

/** Calls only a real 2D context can make. */
const UNSUPPORTED_METHODS = ["clearRect", "putImageData", "getImageData", "isPointInPath", "isPointInStroke", "drawFocusIfNeeded", "reset"] as const;

const colorCache = new Map<string, readonly [number, number, number, number] | null>();
let colorProbe: CanvasRenderingContext2D | null | undefined;

/** A CSS colour as straight r, g, b, a in 0..1, or null for anything that is not one solid colour. */
export function parseSolidColor(style: string): readonly [number, number, number, number] | null {
  const cached = colorCache.get(style);
  if (cached !== undefined) return cached;
  let parsed: readonly [number, number, number, number] | null = null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(style);
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map(digit => digit + digit).join("") : hex[1];
    const value = (index: number) => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255;
    parsed = [value(0), value(1), value(2), digits.length === 8 ? value(3) : 1];
  } else {
    // The browser normalises any other colour to #rrggbb or rgba(...).
    if (colorProbe === undefined) colorProbe = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (colorProbe) {
      colorProbe.fillStyle = "#000";
      colorProbe.fillStyle = style;
      const normal = colorProbe.fillStyle;
      const rgba = /^rgba?\(([^)]+)\)$/.exec(normal);
      if (normal.startsWith("#")) parsed = parseSolidColor(normal);
      else if (rgba) {
        const parts = rgba[1].split(",").map(part => Number.parseFloat(part));
        parsed = [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
      }
    }
  }
  if (colorCache.size > 256) colorCache.clear();
  colorCache.set(style, parsed);
  return parsed;
}

const isWhole = (value: number) => Math.abs(value - Math.round(value)) < 1e-6;

const ramps = new Map<string, HTMLCanvasElement>();
/** A gradient's colours along 256 pixels, drawn by a 2D context so they blend exactly as the canvas blends them. */
function rampFor(stops: readonly [number, string][]) {
  const key = stops.map(([at, color]) => `${at}:${color}`).join("|");
  let ramp = ramps.get(key);
  if (ramp) return ramp;
  ramp = document.createElement("canvas");
  ramp.width = 256;
  ramp.height = 1;
  const paint = ramp.getContext("2d");
  if (paint) {
    const gradient = paint.createLinearGradient(0, 0, 256, 0);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 256, 1);
  }
  if (ramps.size >= 64) ramps.clear();
  ramps.set(key, ramp);
  return ramp;
}

/** A radial gradient with both circles on one centre, the outer bigger: what the WebGL shader draws itself. */
function concentric(style: PaintStyle): (GradientRecord & { kind: "radial" }) | null {
  if (typeof style === "string" || style.kind !== "radial" || !style.stops.length) return null;
  const [x0, y0, r0, x1, y1, r1] = style.args;
  return x0 === x1 && y0 === y1 && r1 > 0 && r0 >= 0 && r0 < r1 ? style as GradientRecord & { kind: "radial" } : null;
}

export type SpriteRecording = { vertices: Float32Array; quads: number; batches: readonly SpriteBatch[] };

/** Gradients made while recording: real ones, so they work anywhere, with their stops noted for the raster cache. */
const gradientRecords = new WeakMap<CanvasGradient, GradientRecord>();

/** A path's paint: a solid colour, or a gradient's ramp read at a uv worked out from each device point, written to out[at] and out[at + 1]. */
type PathPaint = {
  source: SpriteSource | null; color: readonly number[]; radial: number | null; linear: boolean; uv: (x: number, y: number, out: number[], at: number) => void;
};
const NO_UV = (_x: number, _y: number, out: number[], at: number) => { out[at] = 0; out[at + 1] = 0; };
/** A path's soft edge quad fades out across the edge; its cover quad does not. */
const EDGE_FADES = [1, 0, 1, 0] as const, COVER_FADES = [1, 1, 1, 1] as const;

export function createSpriteRecorder(measure: () => CanvasRenderingContext2D | null) {
  const rasters = createVectorRasterCache();
  /** Whether the layer has a stencil buffer to draw paths with; without one they are rastered. */
  let gpuPaths = false;
  /** The step of the path being pushed, and whether its paint reads a linear ramp: part of each quad's batch. */
  let pathStep = 0, pathLinear = false, pathQuads = 0;
  let vertices = new Float32Array(QUAD_FLOATS * 256);
  let quads = 0;
  const batches: SpriteBatch[] = [];
  let batchCount = 0;
  let canvas: HTMLCanvasElement | null = null;
  let state = blankState();
  const stack: State[] = [];
  const pool: State[] = [];
  /** The current path, in the order its commands came, each with the transform it came under. Not part of save(). */
  let path: PathCommand[] = [];
  /** A clip and everything drawn under it, rastered together when the save it was made in is restored. */
  let group: { ops: VectorOp[]; depth: number; scissor: readonly number[] | null } | null = null;
  // Scratch reused by every quad and path instead of new arrays: a quad's uvs, a path's inset offsets and edges.
  const quadUv = [0, 0, 0, 0, 0, 0, 0, 0];
  let insets = new Float64Array(256), edges = new Float64Array(256);
  const insetStarts: number[] = [];

  function blankState(): State {
    return {
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, globalAlpha: 1, imageSmoothingEnabled: false, globalCompositeOperation: "source-over",
      fillStyle: "#000", strokeStyle: "#000", filter: "none", shadowBlur: 0, shadowColor: "rgba(0, 0, 0, 0)", shadowOffsetX: 0,
      shadowOffsetY: 0, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", direction: "inherit", lineWidth: 1,
      lineCap: "butt", lineJoin: "miter", miterLimit: 10, lineDashOffset: 0, lineDash: [], imageSmoothingQuality: "low", letterSpacing: "0px",
      scissor: null,
    };
  }

  const defaults = blankState();

  /** Every field of State, one by one: save() runs hundreds of times a frame. */
  function copyState(into: State, from: State) {
    into.a = from.a; into.b = from.b; into.c = from.c; into.d = from.d; into.e = from.e; into.f = from.f;
    into.globalAlpha = from.globalAlpha; into.imageSmoothingEnabled = from.imageSmoothingEnabled;
    into.globalCompositeOperation = from.globalCompositeOperation; into.fillStyle = from.fillStyle; into.strokeStyle = from.strokeStyle;
    into.filter = from.filter; into.shadowBlur = from.shadowBlur; into.shadowColor = from.shadowColor;
    into.shadowOffsetX = from.shadowOffsetX; into.shadowOffsetY = from.shadowOffsetY;
    into.font = from.font; into.textAlign = from.textAlign; into.textBaseline = from.textBaseline; into.direction = from.direction;
    into.lineWidth = from.lineWidth; into.lineCap = from.lineCap; into.lineJoin = from.lineJoin; into.miterLimit = from.miterLimit;
    into.lineDashOffset = from.lineDashOffset; into.lineDash = from.lineDash; into.imageSmoothingQuality = from.imageSmoothingQuality;
    into.letterSpacing = from.letterSpacing; into.scissor = from.scissor;
    return into;
  }

  // Kept even when a drawing function catches the throw itself, so a partly recorded frame is never drawn.
  let failure: SpriteRecorderUnsupported | null = null;
  function unsupported(operation: string): never {
    throw failure ??= new SpriteRecorderUnsupported(operation);
  }

  // Commands under one transform share its matrix, which is never changed once made.
  let lastMatrix: Matrix = [1, 0, 0, 1, 0, 0];
  function matrix(): Matrix {
    const m = lastMatrix;
    if (m[0] !== state.a || m[1] !== state.b || m[2] !== state.c || m[3] !== state.d || m[4] !== state.e || m[5] !== state.f) {
      lastMatrix = [state.a, state.b, state.c, state.d, state.e, state.f];
    }
    return lastMatrix;
  }

  function blendNow(): SpriteBlend {
    const operation = state.globalCompositeOperation;
    if (operation === "source-over") return "normal";
    if (operation === "lighter") return "add";
    return unsupported(`globalCompositeOperation ${operation}`);
  }

  function effects(): Effects {
    return { filter: state.filter, shadowBlur: state.shadowBlur, shadowColor: state.shadowColor, shadowX: state.shadowOffsetX, shadowY: state.shadowOffsetY };
  }

  function hasEffects() {
    if (state.filter !== "none" && state.filter !== "") return true;
    if (state.shadowBlur > 0 || state.shadowOffsetX !== 0 || state.shadowOffsetY !== 0) {
      const shadow = parseSolidColor(state.shadowColor);
      return !shadow || shadow[3] > 0;
    }
    return false;
  }

  function line(): LineStyle {
    return { width: state.lineWidth, cap: state.lineCap, join: state.lineJoin, miter: state.miterLimit, dash: state.lineDash, dashOffset: state.lineDashOffset };
  }

  function paintStyle(style: string | CanvasGradient | CanvasPattern): PaintStyle {
    if (typeof style === "string") return style;
    const record = gradientRecords.get(style as CanvasGradient);
    return record ? { ...record, stops: [...record.stops] } : unsupported("a pattern or foreign gradient");
  }

  /** One vertex at `at`: its premultiplied colour times `fade` (a path's soft edge fades out per corner). */
  function vertex(at: number, x: number, y: number, u: number, v: number, r: number, g: number, b: number, alpha: number, fade: number) {
    vertices[at] = x; vertices[at + 1] = y; vertices[at + 2] = u; vertices[at + 3] = v;
    vertices[at + 4] = r * fade; vertices[at + 5] = g * fade; vertices[at + 6] = b * fade; vertices[at + 7] = alpha * fade;
  }

  /** Adds one quad in device pixels (the transform already applied to its corners). */
  function pushCorners(source: SpriteSource | null, smooth: boolean, blend: SpriteBlend,
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
    u0: number, v0: number, u1: number, v1: number, r: number, g: number, b: number, alpha: number,
    radial: number | null = null, uv?: readonly number[], ring: readonly [number, number] | null = null, fades?: readonly number[]) {
    if (quads >= MAX_RECORDED_QUADS) unsupported("more sprites than one frame holds");
    const scissor = state.scissor, stencil = pathStep, linear = pathLinear;
    let batch = batchCount > 0 ? batches[batchCount - 1] : undefined;
    if (!batch || batch.source !== source || batch.blend !== blend || batch.radial !== radial || (source !== null && batch.smooth !== smooth)
      || batch.scissor !== scissor || batch.ring?.[0] !== ring?.[0] || batch.ring?.[1] !== ring?.[1] || batch.stencil !== stencil
      || batch.linear !== linear || batch.count >= MAX_BATCH_QUADS) {
      batch = batches[batchCount] ?? (batches[batchCount] = { source, smooth, blend, radial, ring, linear, scissor, stencil, first: quads, count: 0 });
      batch.source = source; batch.smooth = smooth; batch.blend = blend; batch.radial = radial; batch.ring = ring; batch.linear = linear;
      batch.scissor = scissor; batch.stencil = stencil; batch.first = quads; batch.count = 0;
      batchCount += 1;
    }
    if ((quads + 1) * QUAD_FLOATS > vertices.length) {
      const grown = new Float32Array(vertices.length * 2);
      grown.set(vertices);
      vertices = grown;
    }
    // Premultiplied: textures are premultiplied, so the colour scales with the alpha.
    const pr = r * alpha, pg = g * alpha, pb = b * alpha;
    const at = quads * QUAD_FLOATS;
    if (uv) {
      vertex(at, x0, y0, uv[0], uv[1], pr, pg, pb, alpha, fades ? fades[0] : 1);
      vertex(at + 8, x1, y1, uv[2], uv[3], pr, pg, pb, alpha, fades ? fades[1] : 1);
      vertex(at + 16, x2, y2, uv[4], uv[5], pr, pg, pb, alpha, fades ? fades[2] : 1);
      vertex(at + 24, x3, y3, uv[6], uv[7], pr, pg, pb, alpha, fades ? fades[3] : 1);
    } else {
      vertex(at, x0, y0, u0, v0, pr, pg, pb, alpha, fades ? fades[0] : 1);
      vertex(at + 8, x1, y1, u1, v0, pr, pg, pb, alpha, fades ? fades[1] : 1);
      vertex(at + 16, x2, y2, u0, v1, pr, pg, pb, alpha, fades ? fades[2] : 1);
      vertex(at + 24, x3, y3, u1, v1, pr, pg, pb, alpha, fades ? fades[3] : 1);
    }
    quads += 1;
    batch.count += 1;
  }

  /** A quad for a rectangle in the current user space. */
  function pushQuad(source: SpriteSource | null, smooth: boolean, x: number, y: number, w: number, h: number,
    u0: number, v0: number, u1: number, v1: number, r: number, g: number, b: number, alpha: number) {
    const { a, b: mb, c, d, e, f } = state;
    const right = x + w, bottom = y + h;
    pushCorners(source, smooth, blendNow(), a * x + c * y + e, mb * x + d * y + f, a * right + c * y + e, mb * right + d * y + f,
      a * x + c * bottom + e, mb * x + d * bottom + f, a * right + c * bottom + e, mb * right + d * bottom + f, u0, v0, u1, v1, r, g, b, alpha);
  }

  /** A rectangle in user space filled with a concentric radial gradient, drawn by the shader: no raster at all. */
  function pushRadial(gradient: GradientRecord & { kind: "radial" }, x: number, y: number, w: number, h: number) {
    const alpha = state.globalAlpha;
    if (!(alpha > 0)) return;
    const [cx, cy, r0, , , r1] = gradient.args;
    const { a, b: mb, c, d, e, f } = state;
    const right = x + w, bottom = y + h, uv = quadUv;
    uv[0] = uv[4] = (x - cx) / r1; uv[2] = uv[6] = (right - cx) / r1;
    uv[1] = uv[3] = (y - cy) / r1; uv[5] = uv[7] = (bottom - cy) / r1;
    pushCorners(rampFor(gradient.stops), true, blendNow(), a * x + c * y + e, mb * x + d * y + f, a * right + c * y + e, mb * right + d * y + f,
      a * x + c * bottom + e, mb * x + d * bottom + f, a * right + c * bottom + e, mb * right + d * bottom + f, 0, 0, 1, 1, 1, 1, 1, alpha, r0 / r1, uv);
  }

  /** A path that is one whole circle under the current transform, filled with a gradient fading out on its own edge. */
  function radialCircle(style: PaintStyle) {
    const gradient = concentric(style);
    if (!gradient || path.length !== 1 || hasEffects() || group) return null;
    const [arc] = path;
    const [cx, cy, radius, start, end] = arc.args;
    const current = matrix();
    const lastStop = gradient.stops[gradient.stops.length - 1][1];
    const fadesOut = parseSolidColor(lastStop)?.[3] === 0;
    if (arc.name !== "arc" || !fadesOut || Math.abs(end - start) < Math.PI * 2 - 1e-6) return null;
    if (arc.m.some((value, index) => value !== current[index])) return null;
    if (gradient.args[0] !== cx || gradient.args[1] !== cy || Math.abs(gradient.args[5] - radius) > 1e-6) return null;
    return { gradient, cx, cy, radius };
  }

  /**
   * A path that is one whole circle, round under the transform it was made in (any rotation, one scale, mirrored
   * or not): what the shader draws at any size, so a ring that grows each frame needs no new raster.
   */
  function roundCircle() {
    if (path.length !== 1 || group || hasEffects()) return null;
    const [shape] = path;
    let cx: number, cy: number, radius: number, start: number, end: number;
    if (shape.name === "arc") [cx, cy, radius, start, end] = shape.args;
    else if (shape.name === "ellipse" && shape.args[2] === shape.args[3]) [cx, cy, radius, , , start, end] = shape.args;
    else return null;
    if (!(radius > 0) || Math.abs(end - start) < Math.PI * 2 - 1e-6) return null;
    const [a, b, c, d] = shape.m;
    const scale = Math.hypot(a, b);
    if (!(scale > 0) || Math.abs(Math.hypot(c, d) - scale) > scale * 1e-6 || Math.abs(a * c + b * d) > scale * scale * 1e-6) return null;
    return { cx, cy, radius, m: shape.m, scale };
  }

  /** A solid circle (inner 0) or ring between two radii around a round circle's centre, drawn by the shader. */
  function pushRing(circle: NonNullable<ReturnType<typeof roundCircle>>, inner: number, outer: number, color: readonly number[]) {
    const alpha = color[3] * state.globalAlpha;
    if (!(alpha > 0) || !(outer > 0)) return;
    const { cx, cy, m: [a, b, c, d, e, f] } = circle;
    // One device pixel past the edge, for its antialiased fringe.
    const reach = outer + 1 / circle.scale;
    const px = (ux: number, uy: number) => a * ux + c * uy + e, py = (ux: number, uy: number) => b * ux + d * uy + f;
    const x0 = cx - reach, y0 = cy - reach, x1 = cx + reach, y1 = cy + reach, edge = reach / outer;
    pushCorners(null, false, blendNow(), px(x0, y0), py(x0, y0), px(x1, y0), py(x1, y0), px(x0, y1), py(x0, y1), px(x1, y1), py(x1, y1),
      0, 0, 1, 1, color[0], color[1], color[2], alpha, null, [-edge, -edge, edge, -edge, -edge, edge, edge, edge],
      [Math.max(0, inner) / outer, 1 / (outer * circle.scale)]);
  }

  /** The paint of a style for a path drawn now; null for one only a raster can draw (a pattern, a conic or offset radial gradient). */
  function pathPaint(style: string | CanvasGradient | CanvasPattern): PathPaint | null {
    if (typeof style === "string") {
      const color = parseSolidColor(style);
      return color ? { source: null, color, radial: null, linear: false, uv: NO_UV } : null;
    }
    const record = gradientRecords.get(style as CanvasGradient);
    if (!record || !record.stops.length) return null;
    // A gradient lies in the user space of the transform it is painted under.
    const { a, b, c, d, e, f } = state;
    const determinant = a * d - b * c;
    if (!determinant) return null;
    const user = (x: number, y: number) => [(d * (x - e) - c * (y - f)) / determinant, (-b * (x - e) + a * (y - f)) / determinant];
    const ramp = rampFor(record.stops);
    if (record.kind === "linear") {
      const [x0, y0, x1, y1] = record.args;
      const vx = x1 - x0, vy = y1 - y0, length = vx * vx + vy * vy;
      if (!length) return null;
      return { source: ramp, color: [1, 1, 1, 1], radial: null, linear: true, uv: (x, y, out, at) => {
        const [ux, uy] = user(x, y);
        out[at] = ((ux - x0) * vx + (uy - y0) * vy) / length; out[at + 1] = 0;
      } };
    }
    const gradient = concentric(record);
    if (!gradient) return null;
    const [cx, cy, r0, , , r1] = gradient.args;
    return { source: ramp, color: [1, 1, 1, 1], radial: r0 / r1, linear: false, uv: (x, y, out, at) => {
      const [ux, uy] = user(x, y);
      out[at] = (ux - cx) / r1; out[at + 1] = (uy - cy) / r1;
    } };
  }

  /** A path the GPU draws in this frame's stencil steps, or false when it must be rastered. */
  function pathOnGpu(subpaths: Subpath[] | null, outlinesOf: (subpaths: Subpath[]) => Outline[], rule: CanvasFillRule | "union", paint: PathPaint | null, fade = 1) {
    if (!gpuPaths || !paint || !subpaths || group || hasEffects()) return false;
    const outlines = outlinesOf(subpaths);
    const alpha = state.globalAlpha * paint.color[3] * fade;
    if (!outlines.length || !(alpha > 0)) return true;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, cost = 1;
    for (const { points } of outlines) {
      cost += points.length * 1.5;
      for (let index = 0; index < points.length; index += 2) {
        left = Math.min(left, points[index]); right = Math.max(right, points[index]);
        top = Math.min(top, points[index + 1]); bottom = Math.max(bottom, points[index + 1]);
      }
    }
    if (right < -1 || bottom < -1 || left > (canvas ? canvas.width : Infinity) + 1 || top > (canvas ? canvas.height : Infinity) + 1) return true;
    if (pathQuads + cost > MAX_PATH_QUADS) return false;
    pathQuads += cost;
    const blend = blendNow();
    pathLinear = paint.linear;
    const [r, g, b] = paint.color;
    const quad = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fades: readonly number[]) => {
      const uv = quadUv;
      paint.uv(x0, y0, uv, 0); paint.uv(x1, y1, uv, 2); paint.uv(x2, y2, uv, 4); paint.uv(x3, y3, uv, 6);
      pushCorners(paint.source, true, blend, x0, y0, x1, y1, x2, y2, x3, y3, 0, 0, 1, 1, r, g, b, alpha, paint.radial, uv, null, fades);
    };
    // Each outline's edge is pulled in half a pixel for the fill, and fades across the true edge from there to half
    // a pixel out: the coverage a canvas gives an edge. Edges inside a stroke stay put and get no fade.
    // The offsets of all outlines go one after another in insets, from insetStarts[which].
    let total = 0;
    insetStarts.length = 0;
    for (const { points } of outlines) { insetStarts.push(total); total += points.length; }
    if (insets.length < total) insets = new Float64Array(total * 2);
    outlines.forEach(({ points, inner }, which) => {
      const count = points.length / 2, sign = signedArea(points) >= 0 ? 1 : -1, start = insetStarts[which];
      // Each edge's direction (dx, dy) and outward normal (nx, ny).
      if (edges.length < count * 4) edges = new Float64Array(count * 8);
      for (let index = 0; index < count; index += 1) {
        const next = (index + 1) % count;
        const x = points[next * 2] - points[index * 2], y = points[next * 2 + 1] - points[index * 2 + 1], length = Math.hypot(x, y) || 1;
        edges[index * 4] = x / length; edges[index * 4 + 1] = y / length;
        edges[index * 4 + 2] = -y / length * sign; edges[index * 4 + 3] = x / length * sign;
      }
      for (let index = 0; index < count; index += 1) {
        const previous = (index - 1 + count) % count;
        const before = !inner?.[previous], after = !inner?.[index];
        const p = previous * 4, i = index * 4;
        let ox = 0, oy = 0;
        if (before && after) {
          // Mitred, so the fade keeps its width round a corner; a very sharp one is held to two pixels.
          const scale = .5 / Math.max(.25, 1 + edges[p + 2] * edges[i + 2] + edges[p + 3] * edges[i + 3]);
          ox = (edges[p + 2] + edges[i + 2]) * scale; oy = (edges[p + 3] + edges[i + 3]) * scale;
        } else if (before || after) {
          // Along the inside edge, so it stays on its line.
          const ex = before ? edges[i] : -edges[p], ey = before ? edges[i + 1] : -edges[p + 1];
          const fx = before ? edges[p + 2] : edges[i + 2], fy = before ? edges[p + 3] : edges[i + 3];
          const along = ex * fx + ey * fy;
          if (Math.abs(along) > .2) { ox = ex * .5 / along; oy = ey * .5 / along; } else { ox = fx * .5; oy = fy * .5; }
        }
        insets[start + index * 2] = ox; insets[start + index * 2 + 1] = oy;
      }
    });
    try {
      // Mark: a fan from each pulled-in outline's first point, counted by the fill rule.
      pathStep = STENCIL[rule];
      outlines.forEach(({ points }, which) => {
        const o = insetStarts[which];
        const x0 = points[0] + insets[o], y0 = points[1] + insets[o + 1];
        for (let index = 2; index + 3 < points.length; index += 2) {
          const x1 = points[index] + insets[o + index], y1 = points[index + 1] + insets[o + index + 1];
          const x2 = points[index + 2] + insets[o + index + 2], y2 = points[index + 3] + insets[o + index + 3];
          pushCorners(null, false, blend, x0, y0, x1, y1, x2, y2, x2, y2, 0, 0, 0, 0, 1, 1, 1, 1);
        }
      });
      // Edge: the fade, drawn once per pixel where the fill is not.
      pathStep = STENCIL.edge;
      outlines.forEach(({ points, inner }, which) => {
        const o = insetStarts[which], count = points.length / 2;
        for (let index = 0; index < count; index += 1) {
          if (inner?.[index]) continue;
          const a = index * 2, z = ((index + 1) % count) * 2;
          quad(points[a] + insets[o + a], points[a + 1] + insets[o + a + 1], points[a] - insets[o + a], points[a + 1] - insets[o + a + 1],
            points[z] + insets[o + z], points[z + 1] + insets[o + z + 1], points[z] - insets[o + z], points[z + 1] - insets[o + z + 1], EDGE_FADES);
        }
      });
      // Cover: one rectangle over all of it, painting where it is marked and clearing every mark.
      pathStep = STENCIL.cover;
      left -= 2; top -= 2; right += 2; bottom += 2;
      quad(left, top, right, top, left, bottom, right, bottom, COVER_FADES);
    } finally {
      pathStep = 0;
      pathLinear = false;
    }
    return true;
  }

  /**
   * A stroke of `commands` the GPU draws, or false when it must be rastered. A canvas shapes a stroke in the user
   * space it is drawn in (a squashed transform squashes the line too), so it is built there and then placed.
   */
  function strokeOnGpu(commands: readonly PathCommand[]) {
    const { a, b, c, d, e, f } = state;
    const determinant = a * d - b * c;
    if (!gpuPaths || !(state.lineWidth > 0) || !determinant) return false;
    // The transform's largest and smallest stretch.
    const p = a * a + b * b, q = a * c + b * d, r = c * c + d * d;
    const spread = Math.sqrt((p - r) * (p - r) + 4 * q * q);
    const most = Math.sqrt((p + r + spread) / 2), least = Math.sqrt(Math.max(0, (p + r - spread) / 2));
    // A line thinner than a pixel is drawn one pixel wide and fainter, as a canvas shows it.
    const thinnest = state.lineWidth * least;
    const style = { halfWidth: Math.max(state.lineWidth, 1 / least) / 2, cap: state.lineCap, join: state.lineJoin, miterLimit: state.miterLimit,
      dash: state.lineDash, dashOffset: state.lineDashOffset, pixels: most };
    const toUser = (points: number[]) => points.map((_, index) => {
      const x = points[index - index % 2] - e, y = points[index - index % 2 + 1] - f;
      return index % 2 ? (-b * x + a * y) / determinant : (d * x - c * y) / determinant;
    });
    const toDevice = (outline: Outline): Outline => ({ ...outline, points: outline.points.map((_, index) => {
      const x = outline.points[index - index % 2], y = outline.points[index - index % 2 + 1];
      return index % 2 ? b * x + d * y + f : a * x + c * y + e;
    }) });
    return pathOnGpu(flattenPath(commands, state.lineDash.length ? .02 : undefined),
      subpaths => strokeOutlines(subpaths.map(subpath => ({ ...subpath, points: toUser(subpath.points) })), style).map(toDevice),
      "union", pathPaint(state.strokeStyle), Math.min(1, thinnest));
  }

  /** Draws a vector op: into the open clip group, or rastered on its own as one quad. */
  function drawVector(op: VectorOp) {
    if (group) {
      if (op.type !== "clip" && op.composite !== "source-over") unsupported(`${op.composite} under a clip`);
      group.ops.push(op);
      return;
    }
    const alpha = op.type === "clip" ? 1 : op.alpha;
    if (!(alpha > 0)) return;
    const blend = blendNow();
    pushRaster([op], blend, alpha);
  }

  function pushRaster(ops: VectorOp[], blend: SpriteBlend, alpha: number) {
    const target = canvas ?? { width: 0, height: 0 };
    const raster = rasters.raster(ops, target.width, target.height);
    if (raster === "too-big") unsupported("a shape too big to cache");
    if (!raster) return;
    const { left, top, width, height } = raster;
    pushCorners(raster.canvas, false, blend, left, top, left + width, top, left, top + height, left + width, top + height, 0, 0, 1, 1, 1, 1, 1, alpha);
  }

  function closeGroup() {
    if (!group) return;
    const { ops, scissor } = group;
    group = null;
    if (ops.length <= 1) return;
    // Under the rectangle clip it was opened in, which the restore that closes it may have dropped.
    const current = state.scissor;
    state.scissor = scissor;
    pushRaster(ops, "normal", 1);
    state.scissor = current;
  }

  function addPath(name: string, args: number[]) {
    for (const value of args) if (!Number.isFinite(value)) return;
    path.push({ name, args, m: matrix() });
  }

  // Named arguments, not a rest array: hundreds of images a frame.
  function drawImage(source: CanvasImageSource, a1: number, a2: number, a3?: number, a4?: number, a5?: number, a6?: number, a7?: number, a8?: number) {
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) unsupported("drawImage of a video");
    if (typeof SVGImageElement !== "undefined" && source instanceof SVGImageElement) unsupported("drawImage of an SVG image");
    if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) unsupported("drawImage of a video frame");
    const sprite = source as SpriteSource;
    const image = typeof HTMLImageElement !== "undefined" && sprite instanceof HTMLImageElement;
    const width = image ? (sprite.complete ? sprite.naturalWidth : 0) : sprite.width;
    const height = image ? (sprite.complete ? sprite.naturalHeight : 0) : sprite.height;
    if (!(width > 0) || !(height > 0)) return;
    const count = arguments.length - 1;
    if (count !== 2 && count !== 4 && count !== 8) throw new TypeError("drawImage takes 3, 5 or 9 arguments");
    if (group || hasEffects()) {
      drawVector({ type: "image", source, args: [a1, a2, a3, a4, a5, a6, a7, a8].slice(0, count) as number[], smooth: state.imageSmoothingEnabled,
        quality: state.imageSmoothingQuality, m: matrix(), alpha: state.globalAlpha, composite: state.globalCompositeOperation, effects: effects() });
      return;
    }
    let sx = 0, sy = 0, sw = width, sh = height, dx: number, dy: number, dw: number, dh: number;
    if (count === 2) dx = a1, dy = a2, dw = width, dh = height;
    else if (count === 4) dx = a1, dy = a2, dw = a3!, dh = a4!;
    else sx = a1, sy = a2, sw = a3!, sh = a4!, dx = a5!, dy = a6!, dw = a7!, dh = a8!;
    if (!sw || !sh || !dw || !dh || !Number.isFinite(dx + dy + dw + dh + sx + sy + sw + sh)) return;
    // Like the 2D context, a source rectangle running off the image draws only the part on it.
    if (sw < 0) { sx += sw; sw = -sw; }
    if (sh < 0) { sy += sh; sh = -sh; }
    const left = Math.max(0, sx), top = Math.max(0, sy), right = Math.min(width, sx + sw), bottom = Math.min(height, sy + sh);
    if (right <= left || bottom <= top) return;
    if (left !== sx || top !== sy || right !== sx + sw || bottom !== sy + sh) {
      const scaleX = dw / sw, scaleY = dh / sh;
      dx += (left - sx) * scaleX; dy += (top - sy) * scaleY;
      dw = (right - left) * scaleX; dh = (bottom - top) * scaleY;
      sx = left; sy = top; sw = right - left; sh = bottom - top;
    }
    const alpha = state.globalAlpha;
    if (!(alpha > 0)) return;
    pushQuad(sprite, state.imageSmoothingEnabled, dx, dy, dw, dh, sx / width, sy / height, (sx + sw) / width, (sy + sh) / height, 1, 1, 1, alpha);
  }

  function fillRect(x: number, y: number, w: number, h: number) {
    if (!w || !h || !Number.isFinite(x + y + w + h)) return;
    const style = state.fillStyle;
    const color = typeof style === "string" ? parseSolidColor(style) : null;
    const { a, b, c, d, e, f } = state;
    // A solid rectangle on whole device pixels is one quad; anything else is drawn as the 2D context would, with its edges.
    if (color && !group && !hasEffects() && b === 0 && c === 0
      && isWhole(a * x + e) && isWhole(d * y + f) && isWhole(a * (x + w) + e) && isWhole(d * (y + h) + f)) {
      const alpha = color[3] * state.globalAlpha;
      if (alpha > 0) pushQuad(null, false, x, y, w, h, 0, 0, 1, 1, color[0], color[1], color[2], alpha);
      return;
    }
    const paint = paintStyle(style);
    const gradient = concentric(paint);
    if (gradient && !group && !hasEffects()) { pushRadial(gradient, x, y, w, h); return; }
    const rect = [{ name: "rect", args: [x, y, w, h], m: matrix() }];
    if (pathOnGpu(flattenPath(rect), fillOutlines, "nonzero", pathPaint(style))) return;
    drawVector({ type: "fill", path: [{ name: "rect", args: [x, y, w, h], m: matrix() }], rule: "nonzero", style: paint,
      m: matrix(), alpha: state.globalAlpha, composite: state.globalCompositeOperation, effects: effects() });
  }

  function setTransform(a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
    if (a === undefined) { state.a = 1; state.b = 0; state.c = 0; state.d = 1; state.e = 0; state.f = 0; return; }
    if (typeof a === "object") {
      state.a = a.a ?? a.m11 ?? 1; state.b = a.b ?? a.m12 ?? 0; state.c = a.c ?? a.m21 ?? 0;
      state.d = a.d ?? a.m22 ?? 1; state.e = a.e ?? a.m41 ?? 0; state.f = a.f ?? a.m42 ?? 0;
      return;
    }
    state.a = a; state.b = b!; state.c = c!; state.d = d!; state.e = e!; state.f = f!;
  }

  function transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const s = state;
    const na = s.a * a + s.c * b, nb = s.b * a + s.d * b;
    const nc = s.a * c + s.c * d, nd = s.b * c + s.d * d;
    const ne = s.a * e + s.c * f + s.e, nf = s.b * e + s.d * f + s.f;
    s.a = na; s.b = nb; s.c = nc; s.d = nd; s.e = ne; s.f = nf;
  }

  function fillRule(value: unknown): CanvasFillRule {
    if (typeof value === "object" && value !== null) unsupported("a Path2D");
    return value === "evenodd" ? "evenodd" : "nonzero";
  }

  function text(stroke: boolean, value: string, x: number, y: number, maxWidth?: number) {
    if (!Number.isFinite(x + y)) return;
    drawVector({ type: "text", stroke, text: String(value), x, y, maxWidth, style: paintStyle(stroke ? state.strokeStyle : state.fillStyle), line: line(),
      textStyle: { font: state.font, align: state.textAlign, baseline: state.textBaseline, direction: state.direction, letterSpacing: state.letterSpacing },
      m: matrix(), alpha: state.globalAlpha, composite: state.globalCompositeOperation, effects: effects() });
  }

  function gradient(kind: GradientRecord["kind"], args: number[]) {
    const probe = measure();
    if (!probe) return unsupported("a gradient");
    const made = kind === "linear" ? probe.createLinearGradient(args[0], args[1], args[2], args[3])
      : kind === "radial" ? probe.createRadialGradient(args[0], args[1], args[2], args[3], args[4], args[5])
        : probe.createConicGradient(args[0], args[1], args[2]);
    const record: GradientRecord = { kind, args, stops: [] };
    gradientRecords.set(made, record);
    const addColorStop = made.addColorStop.bind(made);
    made.addColorStop = (offset: number, color: string) => { addColorStop(offset, color); record.stops.push([offset, color]); };
    return made;
  }

  const context: Record<string, unknown> = {
    get canvas() { return canvas; },
    save() { stack.push(copyState(pool.pop() ?? blankState(), state)); },
    restore() {
      const saved = stack.pop();
      if (!saved) return;
      pool.push(state);
      state = saved;
      if (group && stack.length < group.depth) closeGroup();
    },
    translate(x: number, y: number) { state.e += state.a * x + state.c * y; state.f += state.b * x + state.d * y; },
    scale(x: number, y: number) { state.a *= x; state.b *= x; state.c *= y; state.d *= y; },
    rotate(angle: number) { const cos = Math.cos(angle), sin = Math.sin(angle); transform(cos, sin, -sin, cos, 0, 0); },
    transform,
    setTransform,
    resetTransform() { setTransform(); },
    // A plain a–f object, not a DOMMatrix: callers only read those and hand it back to setTransform.
    getTransform() { return { a: state.a, b: state.b, c: state.c, d: state.d, e: state.e, f: state.f }; },
    drawImage,
    fillRect,
    strokeRect(x: number, y: number, w: number, h: number) {
      if (!Number.isFinite(x + y + w + h)) return;
      if (strokeOnGpu([{ name: "rect", args: [x, y, w, h], m: matrix() }])) return;
      drawVector({ type: "stroke", path: [{ name: "rect", args: [x, y, w, h], m: matrix() }], style: paintStyle(state.strokeStyle), line: line(),
        m: matrix(), alpha: state.globalAlpha, composite: state.globalCompositeOperation, effects: effects() });
    },
    beginPath() { path = []; },
    closePath() { path.push({ name: "closePath", args: [], m: matrix() }); },
    moveTo: (x: number, y: number) => addPath("moveTo", [x, y]),
    lineTo: (x: number, y: number) => addPath("lineTo", [x, y]),
    quadraticCurveTo: (...args: number[]) => addPath("quadraticCurveTo", args),
    bezierCurveTo: (...args: number[]) => addPath("bezierCurveTo", args),
    arcTo: (...args: number[]) => addPath("arcTo", args),
    rect: (...args: number[]) => addPath("rect", args),
    arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false) { addPath("arc", [x, y, radius, start, end, counterclockwise ? 1 : 0]); },
    ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, counterclockwise = false) {
      addPath("ellipse", [x, y, rx, ry, rotation, start, end, counterclockwise ? 1 : 0]);
    },
    roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0) {
      const list = typeof radii === "number" ? [radii] : Array.isArray(radii) && radii.every(value => typeof value === "number") ? radii : unsupported("roundRect radii");
      addPath(`roundRect${list.length}`, [x, y, w, h, ...list]);
    },
    fill(rule?: unknown) {
      const glow = radialCircle(paintStyle(state.fillStyle));
      if (glow) { pushRadial(glow.gradient, glow.cx - glow.radius, glow.cy - glow.radius, glow.radius * 2, glow.radius * 2); return; }
      const circle = roundCircle();
      const color = circle && typeof state.fillStyle === "string" ? parseSolidColor(state.fillStyle) : null;
      if (circle && color) { pushRing(circle, 0, circle.radius, color); return; }
      if (pathOnGpu(flattenPath(path), fillOutlines, fillRule(rule), pathPaint(state.fillStyle))) return;
      drawVector({ type: "fill", path: [...path], rule: fillRule(rule), style: paintStyle(state.fillStyle), m: matrix(), alpha: state.globalAlpha,
        composite: state.globalCompositeOperation, effects: effects() });
    },
    stroke(pathArgument?: unknown) {
      if (pathArgument !== undefined) unsupported("a Path2D");
      // The line's width is in the transform it is stroked in, so only one that matches the circle's.
      const circle = roundCircle(), now = matrix();
      const color = circle && typeof state.strokeStyle === "string" && !state.lineDash.length && state.lineWidth > 0
        && circle.m.every((value, index) => value === now[index]) ? parseSolidColor(state.strokeStyle) : null;
      if (circle && color) { pushRing(circle, circle.radius - state.lineWidth / 2, circle.radius + state.lineWidth / 2, color); return; }
      if (strokeOnGpu(path)) return;
      drawVector({ type: "stroke", path: [...path], style: paintStyle(state.strokeStyle), line: line(), m: matrix(), alpha: state.globalAlpha,
        composite: state.globalCompositeOperation, effects: effects() });
    },
    clip(rule?: unknown) {
      const op: VectorOp = { type: "clip", path: [...path], rule: fillRule(rule) };
      if (group) unsupported("a clip inside a clip");
      // A rectangle on the screen's axes is the GPU's scissor test: what is drawn under it stays quads.
      const [shape] = path;
      if (path.length === 1 && shape.name === "rect" && shape.m[1] === 0 && shape.m[2] === 0) {
        const [a, , , d, e, f] = shape.m, [x, y, w, h] = shape.args;
        const xs = [a * x + e, a * (x + w) + e], ys = [d * y + f, d * (y + h) + f];
        const outer = state.scissor ?? [-Infinity, -Infinity, Infinity, Infinity];
        const left = Math.max(outer[0], Math.round(Math.min(...xs))), top = Math.max(outer[1], Math.round(Math.min(...ys)));
        state.scissor = [left, top, Math.max(left, Math.min(outer[2], Math.round(Math.max(...xs)))), Math.max(top, Math.min(outer[3], Math.round(Math.max(...ys))))];
        return;
      }
      group = { ops: [op], depth: stack.length, scissor: state.scissor };
    },
    fillText: (value: string, x: number, y: number, maxWidth?: number) => text(false, value, x, y, maxWidth),
    strokeText: (value: string, x: number, y: number, maxWidth?: number) => text(true, value, x, y, maxWidth),
    setLineDash(segments: number[]) { state.lineDash = [...segments]; },
    getLineDash() { return [...state.lineDash]; },
    measureText(value: string) {
      const probe = measure();
      if (!probe) return unsupported("measureText");
      probe.font = state.font; probe.direction = state.direction; probe.letterSpacing = state.letterSpacing;
      return probe.measureText(value);
    },
    createLinearGradient: (...args: number[]) => gradient("linear", args),
    createRadialGradient: (...args: number[]) => gradient("radial", args),
    createConicGradient: (...args: number[]) => gradient("conic", args),
    createPattern(image: CanvasImageSource, repetition: string | null) { return measure()?.createPattern(image, repetition) ?? unsupported("createPattern"); },
    getContextAttributes() { return { alpha: true, desynchronized: false, colorSpace: "srgb", willReadFrequently: false }; },
    isContextLost() { return false; },
  };
  for (const name of UNSUPPORTED_METHODS) context[name] = () => unsupported(name);
  for (const name of COPIED_PROPERTIES) {
    Object.defineProperty(context, name, {
      get: () => state[name],
      set: (value: never) => {
        // Like the 2D context, values it would reject leave the property as it was.
        if (name === "globalAlpha" && !(Number(value) >= 0 && Number(value) <= 1)) return;
        (state as Record<string, unknown>)[name] = value;
      },
      enumerable: true,
    });
  }

  return {
    context: context as unknown as CanvasRenderingContext2D,
    /** Starts a recording that continues from `from`'s transform and drawing state; `stencil` when the layer can draw paths. */
    begin(from: CanvasRenderingContext2D, stencil = false) {
      quads = 0; batchCount = 0; stack.length = 0; failure = null; path = []; group = null;
      gpuPaths = stencil; pathQuads = 0;
      canvas = from.canvas;
      const current = from.getTransform();
      setTransform(current.a, current.b, current.c, current.d, current.e, current.f);
      // A property the browser lacks (WebKit has no filter) keeps its default: undefined read as a filter on every draw.
      for (const name of COPIED_PROPERTIES) (state as Record<string, unknown>)[name] = from[name] ?? defaults[name];
      state.lineDash = from.getLineDash();
      state.scissor = null;
    },
    /** The first call it could not record this frame, if any. */
    failure: () => failure,
    finish(): SpriteRecording {
      closeGroup();
      return { vertices, quads, batches: batches.slice(0, batchCount) };
    },
    rasterStats: rasters.stats,
  };
}

export type SpriteRecorder = ReturnType<typeof createSpriteRecorder>;
