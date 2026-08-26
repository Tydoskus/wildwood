export type StaticWorldTileFrame = {
  key: string;
  source: HTMLCanvasElement | ImageBitmap;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StaticWorldLayerFrame = {
  backgroundColor: string;
  width: number;
  height: number;
  dpr: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  tiles: StaticWorldTileFrame[];
};

export type StaticWorldLayer = {
  prepare: () => boolean;
  active: () => boolean;
  hide: () => void;
  invalidate: () => void;
  render: (frame: StaticWorldLayerFrame) => boolean;
  renderer: "webgl";
};

type TileTexture = {
  source: HTMLCanvasElement | ImageBitmap;
  texture: WebGLTexture;
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

export function webGLWorldRequested(search: string) {
  return new URLSearchParams(search).get("renderer") !== "canvas";
}

export function parseHexColor(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function createWebGLStaticWorldLayer(overlayCanvas: HTMLCanvasElement): StaticWorldLayer | null {
  if (!webGLWorldRequested(window.location.search)) return null;
  let layer: StaticWorldLayer | null | undefined;
  const prepare = () => {
    if (layer === undefined) layer = initializeWebGLStaticWorldLayer(overlayCanvas);
    return Boolean(layer?.active());
  };
  return {
    prepare,
    active: () => Boolean(layer?.active()),
    hide: () => layer?.hide(),
    invalidate: () => layer?.invalidate(),
    render: (frame) => layer?.render(frame) ?? false,
    renderer: "webgl",
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("Wildwood WebGL shader failed:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
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
  console.warn("Wildwood WebGL program failed:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

/**
 * Draws only the baked world tiles beneath the existing Canvas2D game layer.
 * Dynamic actors and UI keep their established Canvas rendering. Any setup,
 * upload, or context failure immediately returns rendering to Canvas2D.
 */
function initializeWebGLStaticWorldLayer(overlayCanvas: HTMLCanvasElement): StaticWorldLayer | null {
  const canvas = document.createElement("canvas");
  canvas.id = "gameGpu";
  canvas.setAttribute("aria-hidden", "true");
  overlayCanvas.before(canvas);

  const context = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: "high-performance",
  });
  if (!context) {
    canvas.remove();
    document.documentElement.dataset.worldRenderer = "canvas2d";
    return null;
  }
  const gl: WebGLRenderingContext = context;
  const program = createProgram(gl);
  if (!program) {
    canvas.remove();
    document.documentElement.dataset.worldRenderer = "canvas2d";
    return null;
  }

  const position = gl.getAttribLocation(program, "a_position");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const rect = gl.getUniformLocation(program, "u_rect");
  const sampler = gl.getUniformLocation(program, "u_texture");
  const buffer = gl.createBuffer();
  if (position < 0 || !resolution || !rect || !sampler || !buffer) {
    if (buffer) gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
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
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  // The quad maps v=0 to screen-top, matching WebGL's upper-left first pixel
  // transfer. ImageBitmap uploads ignore this flag, so leaving it off also
  // keeps worker-built tiles and Canvas placeholders oriented identically.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

  const textures = new Map<string, TileTexture>();
  let enabled = true;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;

  function destroyTexture(tile: TileTexture) {
    gl.deleteTexture(tile.texture);
  }

  function clearTextures() {
    for (const tile of textures.values()) destroyTexture(tile);
    textures.clear();
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
      return texture;
    } catch {
      gl.deleteTexture(texture);
      return null;
    }
  }

  function render(frame: StaticWorldLayerFrame) {
    if (!enabled) return false;
    try {
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
      gl.uniform2f(resolution, frame.width, frame.height);
      gl.activeTexture(gl.TEXTURE0);

      const retainedKeys = new Set<string>();
      for (const tile of frame.tiles) {
        retainedKeys.add(tile.key);
        let rendered = textures.get(tile.key);
        if (!rendered || rendered.source !== tile.source) {
          if (rendered) destroyTexture(rendered);
          const texture = textureFor(tile.source);
          if (!texture) throw new Error(`Could not upload static tile ${tile.key}`);
          rendered = { source: tile.source, texture };
          textures.set(tile.key, rendered);
        }
        const left = tile.left * frame.zoom + frame.offsetX;
        const top = tile.top * frame.zoom + frame.offsetY;
        const width = tile.width * frame.zoom;
        const height = tile.height * frame.zoom;
        if (left + width <= 0 || top + height <= 0 || left >= frame.width || top >= frame.height) continue;
        gl.bindTexture(gl.TEXTURE_2D, rendered.texture);
        gl.uniform4f(rect, left, top, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      for (const [key, tile] of textures) {
        if (retainedKeys.has(key)) continue;
        destroyTexture(tile);
        textures.delete(key);
      }
      return true;
    } catch (error) {
      console.warn("Wildwood WebGL world failed; returning to Canvas2D.", error);
      disable();
      return false;
    }
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    disable();
  });
  document.body.classList.add("has-webgl-world");
  document.documentElement.dataset.worldRenderer = "webgl";

  return {
    prepare: () => enabled,
    active: () => enabled,
    hide: () => { canvas.hidden = true; },
    invalidate: clearTextures,
    render,
    renderer: "webgl",
  };
}
