import { createWebGLSpritePass } from "./webgl-sprite-pass";
import { worldSpritesWanted } from "./world-sprites-wanted";
import { webGLWorldWanted, worldPowerPreference } from "./gpu-power-preference";
import type { SpriteRecording } from "./sprite-recorder";

export type StaticWorldTileFrame = {
  key: string;
  source: HTMLCanvasElement | ImageBitmap;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StaticWorldSpriteSource = HTMLImageElement | HTMLCanvasElement;

export type StaticWorldSpriteFrame = {
  source: StaticWorldSpriteSource;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation?: number;
};

export type StaticWorldColorQuadFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  color: readonly [number, number, number];
  opacity: number;
};

export type StaticWorldLayerFrame = {
  backgroundColor: string;
  width: number;
  height: number;
  dpr: number;
  zoom: number;
  tiles: StaticWorldTileFrame[];
  sprites?: readonly StaticWorldSpriteFrame[];
  colorQuads?: readonly StaticWorldColorQuadFrame[];
};

/** Drawn right after the ground's tiles, under everything else; false when it could not draw, so the canvas does. */
export type StaticWorldGroundOverlay = (gl: WebGLRenderingContext, frame: StaticWorldLayerFrame) => boolean;

export type StaticWorldLayer = {
  /** Sets what is drawn over the ground's tiles each frame; kept across a lost context's rebuild. */
  setGroundOverlay?: (overlay: StaticWorldGroundOverlay | null) => void;
  prepare: () => boolean;
  active: () => boolean;
  hide: () => void;
  invalidate: () => void;
  render: (frame: StaticWorldLayerFrame) => boolean;
  /** Draws recorded world sprites over this frame's render(); false when it could not, so the canvas does. */
  drawSprites?: (recording: SpriteRecording) => boolean;
  /** Whether drawSprites can draw paths, which needs a stencil buffer. */
  spritePaths?: () => boolean;
  renderer: "webgl";
  /** Rebuilds a layer whose GPU context was lost, on a fresh canvas; true when WebGL is drawing again. */
  recover?: () => boolean;
  /** Makes the layer again on a fresh context (the Dedicated GPU setting changed); true when WebGL is drawing. */
  rebuild?: () => boolean;
  /** The WebGL Drawing setting: off hands the whole world to the 2D canvas, on makes the layer again. */
  setWanted?: (on: boolean) => void;
};
type WebGLWorldLayer = StaticWorldLayer & { lost: () => boolean; destroy: () => void; overlay: { draw: StaticWorldGroundOverlay | null } };

/**
 * Sent on window when the world layer's GPU context is lost ("lost") or comes
 * back ("restored"), so the renderer redraws every ground tile: a phone that
 * backgrounds the game can drop both, and nothing redrew them, leaving most
 * of the screen black on return.
 */
export const STATIC_WORLD_LAYER_RESET_EVENT = "wildstat:static-world-layer-reset";

type TileTexture = {
  source: HTMLCanvasElement | ImageBitmap;
  texture: WebGLTexture;
};

type SpriteGroup = {
  source: StaticWorldSpriteSource;
  sprites: StaticWorldSpriteFrame[];
};

const VERTEX_SHADER = `
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform vec4 u_rect;
varying vec2 v_texture_position;

void main() {
  vec2 position = u_rect.xy + a_position * u_rect.zw;
  vec2 clip = position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_texture_position = a_position;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texture_position;

void main() {
  gl_FragColor = texture2D(u_texture, v_texture_position);
}
`;

const SPRITE_VERTEX_SHADER = `
attribute vec2 a_screen_position;
attribute vec2 a_texture_position;
uniform vec2 u_resolution;
varying vec2 v_texture_position;

void main() {
  vec2 clip = a_screen_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_texture_position = a_texture_position;
}
`;

const COLOR_VERTEX_SHADER = `
attribute vec2 a_screen_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;

void main() {
  vec2 clip = a_screen_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}
`;

const COLOR_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

export function webGLSpriteBatchVertices(
  sprites: readonly Pick<StaticWorldSpriteFrame, "left" | "top" | "width" | "height" | "rotation">[],
  zoom: number,
  target?: Float32Array,
) {
  const requiredLength = sprites.length * 6 * 4;
  if (target && target.length < requiredLength) throw new RangeError("Sprite vertex buffer is too small");
  const vertices = target ? target.subarray(0, requiredLength) : new Float32Array(requiredLength);
  let cursor = 0;
  const vertex = (x: number, y: number, u: number, v: number) => {
    vertices[cursor++] = x;
    vertices[cursor++] = y;
    vertices[cursor++] = u;
    vertices[cursor++] = v;
  };
  for (const sprite of sprites) {
    const left = sprite.left * zoom;
    const top = sprite.top * zoom;
    const right = left + sprite.width * zoom;
    const bottom = top + sprite.height * zoom;
    const rotation = sprite.rotation ?? 0;
    if (rotation === 0) {
      vertex(left, top, 0, 0);
      vertex(right, top, 1, 0);
      vertex(left, bottom, 0, 1);
      vertex(left, bottom, 0, 1);
      vertex(right, top, 1, 0);
      vertex(right, bottom, 1, 1);
      continue;
    }
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const halfWidth = (right - left) / 2;
    const halfHeight = (bottom - top) / 2;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const leftCosine = -halfWidth * cosine;
    const rightCosine = halfWidth * cosine;
    const topSine = -halfHeight * sine;
    const bottomSine = halfHeight * sine;
    const leftSine = -halfWidth * sine;
    const rightSine = halfWidth * sine;
    const topCosine = -halfHeight * cosine;
    const bottomCosine = halfHeight * cosine;
    const topLeftX = centerX + leftCosine - topSine;
    const topLeftY = centerY + leftSine + topCosine;
    const topRightX = centerX + rightCosine - topSine;
    const topRightY = centerY + rightSine + topCosine;
    const bottomLeftX = centerX + leftCosine - bottomSine;
    const bottomLeftY = centerY + leftSine + bottomCosine;
    const bottomRightX = centerX + rightCosine - bottomSine;
    const bottomRightY = centerY + rightSine + bottomCosine;
    vertex(topLeftX, topLeftY, 0, 0);
    vertex(topRightX, topRightY, 1, 0);
    vertex(bottomLeftX, bottomLeftY, 0, 1);
    vertex(bottomLeftX, bottomLeftY, 0, 1);
    vertex(topRightX, topRightY, 1, 0);
    vertex(bottomRightX, bottomRightY, 1, 1);
  }
  return vertices;
}

/** A sprite texture this big (512 × 512) or bigger is checked for an allocation error once uploaded. */
const LARGE_UPLOAD_BYTES = 1024 * 1024;
const COLOR_QUAD_FLOATS_PER_VERTEX = 6;
const COLOR_QUAD_VERTICES = 6;
const COLOR_QUAD_FLOATS = COLOR_QUAD_FLOATS_PER_VERTEX * COLOR_QUAD_VERTICES;

export function writeWebGLColorQuadVertices(
  quads: readonly StaticWorldColorQuadFrame[],
  vertices: Float32Array,
  zoom: number,
) {
  const requiredLength = quads.length * COLOR_QUAD_FLOATS;
  if (vertices.length < requiredLength) throw new RangeError("WebGL color quad vertex buffer is too small");
  let cursor = 0;
  const vertex = (x: number, y: number, red: number, green: number, blue: number, opacity: number) => {
    vertices[cursor++] = x;
    vertices[cursor++] = y;
    vertices[cursor++] = red;
    vertices[cursor++] = green;
    vertices[cursor++] = blue;
    vertices[cursor++] = opacity;
  };
  for (const quad of quads) {
    const left = quad.left * zoom;
    const top = quad.top * zoom;
    const right = left + quad.width * zoom;
    const bottom = top + quad.height * zoom;
    const [red, green, blue] = quad.color;
    const opacity = Math.max(0, Math.min(1, quad.opacity));
    vertex(left, top, red, green, blue, opacity);
    vertex(right, top, red, green, blue, opacity);
    vertex(left, bottom, red, green, blue, opacity);
    vertex(left, bottom, red, green, blue, opacity);
    vertex(right, top, red, green, blue, opacity);
    vertex(right, bottom, red, green, blue, opacity);
  }
  return cursor;
}

export function webGLWorldRequested(search: string) {
  return new URLSearchParams(search).get("renderer") !== "canvas";
}

export function parseHexColorOrNull(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split("").map((character) => character + character).join("")
    : match[1];
  const value = Number.parseInt(hex, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function parseHexColor(color: string): [number, number, number] {
  return parseHexColorOrNull(color) ?? [0, 0, 0];
}

export function createWebGLStaticWorldLayer(overlayCanvas: HTMLCanvasElement): StaticWorldLayer | null {
  if (!webGLWorldRequested(window.location.search)) return null;
  let layer: WebGLWorldLayer | null | undefined;
  let prepared = false, wanted = webGLWorldWanted();
  const overlay: WebGLWorldLayer["overlay"] = { draw: null };
  const prepare = () => {
    prepared = true;
    if (!wanted) return false;
    if (layer === undefined) layer = initializeWebGLStaticWorldLayer(overlayCanvas, overlay);
    return Boolean(layer?.active());
  };
  /** Draws every ground tile again, on whichever of WebGL and the canvas now draws them. */
  const redraw = () => window.dispatchEvent(new CustomEvent(STATIC_WORLD_LAYER_RESET_EVENT, { detail: "lost" }));
  return {
    setGroundOverlay: (draw) => { overlay.draw = draw; },
    prepare,
    active: () => Boolean(layer?.active()),
    hide: () => layer?.hide(),
    invalidate: () => layer?.invalidate(),
    render: (frame) => layer?.render(frame) ?? false,
    drawSprites: (recording) => layer?.drawSprites?.(recording) ?? false,
    spritePaths: () => layer?.spritePaths?.() ?? false,
    renderer: "webgl",
    recover() {
      // Only a lost context is rebuilt; a layer that turned itself off for an upload failure stays off.
      if (!prepared || !layer?.lost()) return false;
      layer.destroy();
      layer = undefined;
      return prepare();
    },
    rebuild() {
      if (!prepared) return false;
      layer?.destroy();
      layer = undefined;
      const drawing = prepare();
      redraw();
      return drawing;
    },
    setWanted(on) {
      if (on === wanted) return;
      wanted = on;
      layer?.destroy();
      layer = undefined;
      if (prepared) prepare();
      redraw();
    },
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("WildStat WebGL shader failed:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl: WebGLRenderingContext, vertexSource = VERTEX_SHADER, fragmentSource = FRAGMENT_SHADER) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  console.warn("WildStat WebGL program failed:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

/**
 * Draws baked world tiles, explicitly non-layered decor, and compatible
 * projectile and particle underlays beneath the existing Canvas2D game layer.
 * Dynamic actors and UI keep their established Canvas rendering. Any setup,
 * upload, or context failure immediately returns the whole world layer to
 * Canvas2D.
 */
function initializeWebGLStaticWorldLayer(overlayCanvas: HTMLCanvasElement, overlay: WebGLWorldLayer["overlay"] = { draw: null }): WebGLWorldLayer | null {
  const canvas = document.createElement("canvas");
  canvas.id = "gameGpu";
  canvas.setAttribute("aria-hidden", "true");
  overlayCanvas.before(canvas);

  const context = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    // World sprites draw paths through it (webgl-sprite-pass.ts); other browsers keep the context they had.
    stencil: typeof window !== "undefined" && worldSpritesWanted(window.location.search, navigator),
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: worldPowerPreference(),
  });
  if (!context) {
    canvas.remove();
    document.documentElement.dataset.worldRenderer = "canvas2d";
    return null;
  }
  const gl: WebGLRenderingContext = context;
  const program = createProgram(gl);
  const spriteProgram = createProgram(gl, SPRITE_VERTEX_SHADER);
  const colorProgram = createProgram(gl, COLOR_VERTEX_SHADER, COLOR_FRAGMENT_SHADER);
  if (!program || !spriteProgram || !colorProgram) {
    if (program) gl.deleteProgram(program);
    if (spriteProgram) gl.deleteProgram(spriteProgram);
    if (colorProgram) gl.deleteProgram(colorProgram);
    canvas.remove();
    document.documentElement.dataset.worldRenderer = "canvas2d";
    return null;
  }

  const position = gl.getAttribLocation(program, "a_position");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const rect = gl.getUniformLocation(program, "u_rect");
  const sampler = gl.getUniformLocation(program, "u_texture");
  const buffer = gl.createBuffer();
  const spritePosition = gl.getAttribLocation(spriteProgram, "a_screen_position");
  const spriteTexturePosition = gl.getAttribLocation(spriteProgram, "a_texture_position");
  const spriteResolution = gl.getUniformLocation(spriteProgram, "u_resolution");
  const spriteSampler = gl.getUniformLocation(spriteProgram, "u_texture");
  const spriteBuffer = gl.createBuffer();
  const colorPosition = gl.getAttribLocation(colorProgram, "a_screen_position");
  const colorValue = gl.getAttribLocation(colorProgram, "a_color");
  const colorResolution = gl.getUniformLocation(colorProgram, "u_resolution");
  const colorBuffer = gl.createBuffer();
  if (position < 0 || !resolution || !rect || !sampler || !buffer || spritePosition < 0 || spriteTexturePosition < 0 || !spriteResolution || !spriteSampler || !spriteBuffer || colorPosition < 0 || colorValue < 0 || !colorResolution || !colorBuffer) {
    if (buffer) gl.deleteBuffer(buffer);
    if (spriteBuffer) gl.deleteBuffer(spriteBuffer);
    if (colorBuffer) gl.deleteBuffer(colorBuffer);
    gl.deleteProgram(program);
    gl.deleteProgram(spriteProgram);
    gl.deleteProgram(colorProgram);
    canvas.remove();
    document.documentElement.dataset.worldRenderer = "canvas2d";
    return null;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(sampler, 0);
  gl.useProgram(spriteProgram);
  gl.uniform1i(spriteSampler, 0);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  // The quad maps v=0 to screen-top, matching WebGL's upper-left first pixel
  // transfer. ImageBitmap uploads ignore this flag, so leaving it off also
  // keeps worker-built tiles and Canvas placeholders oriented identically.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

  const textures = new Map<string, TileTexture>();
  const spriteTextures = new Map<StaticWorldSpriteSource, WebGLTexture>();
  const activeSpriteGroups = new Map<StaticWorldSpriteSource, SpriteGroup>();
  const spriteGroupPool: SpriteGroup[] = [];
  let colorVertexData = new Float32Array(0);
  let spriteVertexData = new Float32Array(0);
  let enabled = true;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;
  let uploadedTexture = false;
  const enabledAttributes = new Set([position]);
  // The world sprites (sprite-recorder.ts), drawn over everything else on this layer.
  const spritePass = createWebGLSpritePass(gl, (vertex, fragment) => createProgram(gl, vertex, fragment), (...slots) => useAttributes(...slots));
  const attributeSlots = [...new Set([position, spritePosition, spriteTexturePosition, colorPosition, colorValue, ...(spritePass?.slots ?? [])])];
  if (spritePass) (window as unknown as { __worldSpriteTextures?: unknown }).__worldSpriteTextures = spritePass.stats;
  const spritePaths = Boolean(spritePass) && (gl.getContextAttributes()?.stencil ?? false) && gl.getParameter(gl.STENCIL_BITS) >= 8;

  function useAttributes(...slots: number[]) {
    for (const slot of attributeSlots) {
      const needed = slots.includes(slot);
      if (needed === enabledAttributes.has(slot)) continue;
      if (needed) { gl.enableVertexAttribArray(slot); enabledAttributes.add(slot); }
      else { gl.disableVertexAttribArray(slot); enabledAttributes.delete(slot); }
    }
  }

  function destroyTexture(tile: TileTexture) {
    gl.deleteTexture(tile.texture);
  }

  function clearTextures() {
    for (const tile of textures.values()) destroyTexture(tile);
    textures.clear();
    for (const texture of spriteTextures.values()) gl.deleteTexture(texture);
    spriteTextures.clear();
    activeSpriteGroups.clear();
    spriteGroupPool.length = 0;
    spritePass?.clear();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    try { clearTextures(); } catch { textures.clear(); }
    canvas.hidden = true;
    document.body.classList.remove("has-webgl-world");
    document.documentElement.dataset.worldRenderer = "canvas2d";
  }

  function textureFor(source: HTMLCanvasElement | ImageBitmap) {
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      uploadedTexture = true;
      return texture;
    } catch {
      gl.deleteTexture(texture);
      return null;
    }
  }

  function spriteTextureFor(source: StaticWorldSpriteSource) {
    const cached = spriteTextures.get(source);
    if (cached) return cached;
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      uploadedTexture = true;
      spriteTextures.set(source, texture);
      return texture;
    } catch {
      gl.deleteTexture(texture);
      return null;
    }
  }

  function drawSpriteBatches(frame: StaticWorldLayerFrame) {
    if (!frame.sprites?.length) return;
    activeSpriteGroups.clear();
    let groupCount = 0;
    for (const sprite of frame.sprites) {
      let group = activeSpriteGroups.get(sprite.source);
      if (!group) {
        group = spriteGroupPool[groupCount] ?? { source: sprite.source, sprites: [] };
        group.source = sprite.source;
        group.sprites.length = 0;
        spriteGroupPool[groupCount] = group;
        activeSpriteGroups.set(sprite.source, group);
        groupCount += 1;
      }
      group.sprites.push(sprite);
    }
    gl.useProgram(spriteProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
    useAttributes(spritePosition, spriteTexturePosition);
    gl.vertexAttribPointer(spritePosition, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(spriteTexturePosition, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(spriteResolution, frame.width, frame.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (let index = 0; index < groupCount; index += 1) {
      const group = spriteGroupPool[index];
      const texture = spriteTextureFor(group.source);
      if (!texture) throw new Error("Could not upload a static world sprite texture");
      const requiredLength = group.sprites.length * 24;
      if (spriteVertexData.length < requiredLength) {
        let capacity = Math.max(24, spriteVertexData.length);
        while (capacity < requiredLength) capacity *= 2;
        spriteVertexData = new Float32Array(capacity);
      }
      const vertices = webGLSpriteBatchVertices(group.sprites, frame.zoom, spriteVertexData);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
    }
    gl.disable(gl.BLEND);
  }

  function drawColorQuads(frame: StaticWorldLayerFrame) {
    if (!frame.colorQuads?.length) return;
    const requiredLength = frame.colorQuads.length * COLOR_QUAD_FLOATS;
    if (colorVertexData.length < requiredLength) {
      let capacity = Math.max(COLOR_QUAD_FLOATS, colorVertexData.length);
      while (capacity < requiredLength) capacity *= 2;
      colorVertexData = new Float32Array(capacity);
    }
    const floatCount = writeWebGLColorQuadVertices(
      frame.colorQuads,
      colorVertexData,
      frame.zoom,
    );
    gl.useProgram(colorProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    useAttributes(colorPosition, colorValue);
    gl.vertexAttribPointer(colorPosition, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(colorValue, 4, gl.FLOAT, false, 24, 8);
    gl.uniform2f(colorResolution, frame.width, frame.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bufferData(gl.ARRAY_BUFFER, colorVertexData.subarray(0, floatCount), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, floatCount / COLOR_QUAD_FLOATS_PER_VERTEX);
    gl.disable(gl.BLEND);
  }

  let lost = false;
  const reset = (detail: "lost" | "restored") => window.dispatchEvent(new CustomEvent(STATIC_WORLD_LAYER_RESET_EVENT, { detail }));
  function loseContext() {
    if (lost) return;
    lost = true;
    disable();
    reset("lost");
  }

  function render(frame: StaticWorldLayerFrame) {
    if (!enabled) return false;
    // A lost context draws nothing without saying so, and its lost event can
    // arrive frames later: hand this frame to Canvas2D now instead.
    if (gl.isContextLost()) { loseContext(); return false; }
    try {
      uploadedTexture = false;
      const backingWidth = Math.max(1, Math.round(frame.width * frame.dpr));
      const backingHeight = Math.max(1, Math.round(frame.height * frame.dpr));
      if (frame.width !== lastWidth || frame.height !== lastHeight || frame.dpr !== lastDpr) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        canvas.style.width = `${frame.width}px`;
        canvas.style.height = `${frame.height}px`;
        gl.viewport(0, 0, backingWidth, backingHeight);
        lastWidth = frame.width;
        lastHeight = frame.height;
        lastDpr = frame.dpr;
      }

      canvas.hidden = false;
      const [red, green, blue] = parseHexColor(frame.backgroundColor);
      gl.clearColor(red, green, blue, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // Sprite batches may reuse this attribute slot with a different buffer;
      // restore the static quad binding at the start of every frame.
      useAttributes(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(resolution, frame.width, frame.height);
      gl.activeTexture(gl.TEXTURE0);

      const retainedKeys = new Set<string>();
      for (const tile of frame.tiles) {
        const left = tile.left * frame.zoom;
        const top = tile.top * frame.zoom;
        if (left + tile.width * frame.zoom <= 0 || top + tile.height * frame.zoom <= 0
          || left >= frame.width || top >= frame.height) continue;
        retainedKeys.add(tile.key);
      }
      // Release tiles left behind before uploading the next camera view, so
      // walking does not temporarily keep two views' GPU allocations alive.
      for (const [key, tile] of textures) {
        if (retainedKeys.has(key)) continue;
        destroyTexture(tile);
        textures.delete(key);
      }
      for (const tile of frame.tiles) {
        const left = tile.left * frame.zoom;
        const top = tile.top * frame.zoom;
        const width = tile.width * frame.zoom;
        const height = tile.height * frame.zoom;
        // Callers may include a preload ring for smooth movement. Keep those
        // sources warm, but do not allocate GPU textures until a tile actually
        // intersects the viewport.
        if (!retainedKeys.has(tile.key)) continue;
        let rendered = textures.get(tile.key);
        if (!rendered || rendered.source !== tile.source) {
          if (rendered) destroyTexture(rendered);
          const texture = textureFor(tile.source);
          if (!texture) throw new Error(`Could not upload static tile ${tile.key}`);
          rendered = { source: tile.source, texture };
          textures.set(tile.key, rendered);
        }
        gl.bindTexture(gl.TEXTURE_2D, rendered.texture);
        gl.uniform4f(rect, left, top, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      overlay.draw?.(gl, frame);
      drawSpriteBatches(frame);
      drawColorQuads(frame);
      // WebGL allocation errors set an error flag instead of throwing. Check
      // once after an upload frame (never every ordinary animation frame),
      // then use the existing same-frame Canvas fallback on failure.
      if (uploadedTexture) {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`World texture upload failed (WebGL 0x${error.toString(16)})`);
      }
      renderedFrame = frame;
      return true;
    } catch (error) {
      console.warn("WildStat WebGL world failed; returning to Canvas2D.", error);
      disable();
      return false;
    }
  }

  let renderedFrame: StaticWorldLayerFrame | null = null;
  function drawSprites(recording: SpriteRecording) {
    if (!enabled || !spritePass || !renderedFrame || gl.isContextLost()) return false;
    try {
      const backingWidth = Math.max(1, Math.round(renderedFrame.width * renderedFrame.dpr));
      const largestUpload = spritePass.draw(recording, backingWidth, Math.max(1, Math.round(renderedFrame.height * renderedFrame.dpr)));
      // getError waits for the GPU, so only a large upload (an atlas page) is checked; an error from a small one
      // stays flagged until then, and a context that runs out of memory is lost.
      if (largestUpload >= LARGE_UPLOAD_BYTES) {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`World sprites failed (WebGL 0x${error.toString(16)})`);
      }
      return true;
    } catch (error) {
      console.warn("WildStat WebGL world sprites failed; returning to Canvas2D.", error);
      disable();
      return false;
    } finally {
      renderedFrame = null;
    }
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    loseContext();
  });
  canvas.addEventListener("webglcontextrestored", () => reset("restored"));
  document.body.classList.add("has-webgl-world");
  document.documentElement.dataset.worldRenderer = "webgl";

  return {
    prepare: () => enabled,
    active: () => enabled,
    hide: () => { canvas.hidden = true; },
    invalidate: () => { if (!lost) clearTextures(); },
    render,
    drawSprites,
    spritePaths: () => spritePaths,
    renderer: "webgl",
    lost: () => lost,
    // Hands the world back to the 2D canvas before it goes, as a failure does.
    destroy: () => { disable(); canvas.remove(); },
    overlay,
  };
}
