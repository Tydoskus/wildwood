import { MAX_BATCH_QUADS, SPRITE_VERTEX_FLOATS, STENCIL, type SpriteRecording, type SpriteSource } from "./sprite-recorder";
import { canvasVersion } from "./frozen-canvas";

/** A texture not drawn for this many frames is released. */
const TEXTURE_IDLE_FRAMES = 180;
/** Texture memory kept past one frame: phones and tablets close a page that holds too much. */
const touchDevice = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const TEXTURE_BUDGET_BYTES = (touchDevice ? 96 : 384) * 1024 * 1024;

const VERTEX_SHADER = `
precision highp float;
attribute vec4 a_position_uv;
attribute vec4 a_tint;
uniform vec2 u_resolution;
varying vec2 v_uv;
varying vec4 v_tint;

void main() {
  vec2 clip = a_position_uv.xy / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_position_uv.zw;
  v_tint = a_tint;
}
`;

// A radial batch's uv is the point's offset from the gradient's centre in outer radii, and its texture is the
// gradient's colour ramp, drawn by a 2D context so its colours blend exactly as the canvas blends them.
// A ring batch's uv is the same offset; its edges are antialiased over one device pixel (u_feather) as a canvas's are.
// A linear batch reads its ramp at u, a linear gradient's position along its line.
// highp: on phone and tablet GPUs mediump is 16-bit, too coarse to address one pixel of a large sprite sheet.
const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_texture;
uniform float u_straight;
uniform float u_radial;
uniform float u_inner;
uniform float u_feather;
varying vec2 v_uv;
varying vec4 v_tint;

void main() {
  vec4 texel;
  if (u_radial > 2.5) {
    texel = texture2D(u_texture, vec2((clamp(v_uv.x, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5));
  } else if (u_radial > 1.5) {
    float d = length(v_uv);
    float coverage = clamp((1.0 - d) / u_feather + 0.5, 0.0, 1.0);
    if (u_inner > 0.0) coverage *= clamp((d - u_inner) / u_feather + 0.5, 0.0, 1.0);
    texel = vec4(coverage);
  } else if (u_radial > 0.5) {
    float t = clamp((length(v_uv) - u_inner) / (1.0 - u_inner), 0.0, 1.0);
    texel = texture2D(u_texture, vec2((t * 255.0 + 0.5) / 256.0, 0.5));
  } else {
    texel = texture2D(u_texture, v_uv);
    // Straight-alpha texels are premultiplied here, so every texture blends the same way.
    texel.rgb *= mix(1.0, texel.a, u_straight);
  }
  gl_FragColor = texel * v_tint;
}
`;

type SpriteTexture = { texture: WebGLTexture; smooth: boolean; straight: boolean; usedAt: number; version: number; bytes: number };

function isImageBitmap(source: SpriteSource): source is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
}

/**
 * Draws a sprite recording (sprite-recorder.ts) onto the WebGL world layer, one draw call per run of quads
 * that share a texture, filter, blend and kind. Textures are uploaded premultiplied, once per source.
 */
export function createWebGLSpritePass(
  gl: WebGLRenderingContext,
  compile: (vertex: string, fragment: string) => WebGLProgram | null,
  useAttributes: (...slots: number[]) => void,
) {
  const program = compile(VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return null;
  const positionUv = gl.getAttribLocation(program, "a_position_uv");
  const tint = gl.getAttribLocation(program, "a_tint");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const sampler = gl.getUniformLocation(program, "u_texture");
  const straight = gl.getUniformLocation(program, "u_straight");
  const radial = gl.getUniformLocation(program, "u_radial");
  const inner = gl.getUniformLocation(program, "u_inner");
  const feather = gl.getUniformLocation(program, "u_feather");
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (positionUv < 0 || tint < 0 || !resolution || !sampler || !straight || !radial || !inner || !feather || !vertexBuffer || !indexBuffer) {
    gl.deleteProgram(program);
    return null;
  }
  const indices = new Uint16Array(MAX_BATCH_QUADS * 6);
  for (let quad = 0, vertex = 0; quad < MAX_BATCH_QUADS; quad += 1, vertex += 4) {
    indices.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3], quad * 6);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.useProgram(program);
  gl.uniform1i(sampler, 0);

  const textures = new Map<SpriteSource, SpriteTexture>();
  let textureBytes = 0;
  // What the textures cost, for the developer readout (window.__worldSprites.textures).
  const stats = { uploads: 0, uploadedBytes: 0, evictions: 0, bytes: () => textureBytes, count: () => textures.size, budget: TEXTURE_BUDGET_BYTES };
  let white: WebGLTexture | null = null;
  let frame = 0;
  /** The largest texture uploaded this frame, in bytes. */
  let largestUpload = 0;
  // Whether this browser uploads an ImageBitmap with its colour already multiplied by its alpha (Chrome does);
  // measured once on a half-transparent pixel, and assumed until then.
  let bitmapsPremultiplied = true;
  probeBitmapAlpha();

  function probeBitmapAlpha() {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return;
    const source = document.createElement("canvas");
    source.width = source.height = 1;
    const paint = source.getContext("2d");
    if (!paint) return;
    paint.fillStyle = "rgba(255, 0, 0, .5)";
    paint.fillRect(0, 0, 1, 1);
    createImageBitmap(source).then(bitmap => {
      if (gl.isContextLost()) { bitmap.close(); return; }
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          const pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (pixel[3] > 0) bitmapsPremultiplied = pixel[0] < 192;
        }
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        bitmap.close();
      }
      for (const [key, entry] of textures) if (isImageBitmap(key)) entry.straight = !bitmapsPremultiplied;
    }, () => {});
  }

  function setFilter(smooth: boolean) {
    const filter = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** The one-pixel white texture solid quads are drawn with, made the first time one is. */
  function bindWhite() {
    if (!white) {
      white = gl.createTexture();
      if (!white) throw new Error("Could not create the world sprites' white texture");
      gl.bindTexture(gl.TEXTURE_2D, white);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      setFilter(false);
      largestUpload = Math.max(largestUpload, 4);
    } else gl.bindTexture(gl.TEXTURE_2D, white);
  }

  /** Binds a source's texture with the filter asked for, uploading it the first time. */
  function bindSource(source: SpriteSource, smooth: boolean) {
    let entry = textures.get(source);
    // A shared canvas that says it changed (canvas-atlas.ts pages, the minimap) is uploaded again.
    if (entry && entry.version !== canvasVersion(source)) {
      forget(source, entry);
      entry = undefined;
    }
    if (!entry) {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Could not create a world sprite texture");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setFilter(smooth);
      // An ImageBitmap ignores the unpack flags and arrives as the browser keeps it (see probeBitmapAlpha).
      const bitmap = isImageBitmap(source);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !bitmap);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        stats.uploads += 1;
      } finally {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }
      const [width, height] = source instanceof HTMLImageElement ? [source.naturalWidth, source.naturalHeight] : [source.width, source.height];
      entry = { texture, smooth, straight: bitmap && !bitmapsPremultiplied, usedAt: frame, version: canvasVersion(source), bytes: width * height * 4 };
      largestUpload = Math.max(largestUpload, entry.bytes);
      textures.set(source, entry);
      textureBytes += entry.bytes;
      stats.uploadedBytes += entry.bytes;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      if (entry.smooth !== smooth) { setFilter(smooth); entry.smooth = smooth; }
    }
    entry.usedAt = frame;
    return entry;
  }

  function forget(source: SpriteSource, entry: SpriteTexture) {
    gl.deleteTexture(entry.texture);
    textures.delete(source);
    textureBytes -= entry.bytes;
  }

  /** Releases textures idle this long, then the longest idle ones (never this frame's) while over budget. */
  function release(idleFrames: number) {
    for (const [source, entry] of textures) if (frame - entry.usedAt >= idleFrames) forget(source, entry);
    if (textureBytes <= TEXTURE_BUDGET_BYTES) return;
    const idle = [...textures].filter(([, entry]) => entry.usedAt < frame).sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [source, entry] of idle) {
      if (textureBytes <= TEXTURE_BUDGET_BYTES) break;
      forget(source, entry);
      stats.evictions += 1;
    }
  }

  /**
   * The stencil state for a step of a path (sprite-recorder.ts STENCIL). The low seven bits count the fill; the top
   * bit marks pixels its soft edge has drawn, so overlapping edges draw once.
   */
  function useStencil(step: number) {
    if (!step) {
      gl.disable(gl.STENCIL_TEST);
      gl.colorMask(true, true, true, true);
      return;
    }
    gl.enable(gl.STENCIL_TEST);
    if (step === STENCIL.nonzero || step === STENCIL.evenodd || step === STENCIL.union) {
      gl.colorMask(false, false, false, false);
      gl.stencilMask(0x7f);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      if (step === STENCIL.evenodd) gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      // Any piece marks a pixel, whichever way it winds; one mark is all a union needs.
      else if (step === STENCIL.union) {
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      } else {
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      }
      return;
    }
    gl.colorMask(true, true, true, true);
    if (step === STENCIL.edge) {
      gl.stencilMask(0x80);
      gl.stencilFunc(gl.EQUAL, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    } else {
      gl.stencilMask(0xff);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
      gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
    }
  }

  /** Draws the recording; returns the largest texture it uploaded in bytes (0 for none), for the layer's allocation check. */
  function draw(recording: SpriteRecording, backingWidth: number, backingHeight: number) {
    frame += 1;
    largestUpload = 0;
    if (!recording.quads) return 0;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, recording.vertices.subarray(0, recording.quads * SPRITE_VERTEX_FLOATS * 4), gl.STREAM_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    useAttributes(positionUv, tint);
    const stride = SPRITE_VERTEX_FLOATS * 4;
    gl.uniform2f(resolution, backingWidth, backingHeight);
    // Paths mark the stencil buffer; it starts each frame clear.
    if (recording.batches.some(batch => batch.stencil)) {
      gl.stencilMask(0xff);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }
    let stencilNow = 0;
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    let blend = "";
    let straightNow = -1, radialNow = -1, innerNow = -1, featherNow = -1;
    let scissorNow: readonly number[] | null = null;
    for (const batch of recording.batches) {
      if (batch.blend !== blend) {
        blend = batch.blend;
        if (blend === "add") gl.blendFunc(gl.ONE, gl.ONE);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      let straightBatch = 0;
      if (batch.source) straightBatch = bindSource(batch.source, batch.smooth).straight ? 1 : 0;
      else bindWhite();
      const radialBatch = batch.linear ? 3 : batch.ring ? 2 : batch.radial === null ? 0 : 1;
      const innerBatch = batch.ring ? batch.ring[0] : batch.radial;
      if (straightBatch !== straightNow) { gl.uniform1f(straight, straightBatch); straightNow = straightBatch; }
      if (radialBatch !== radialNow) { gl.uniform1f(radial, radialBatch); radialNow = radialBatch; }
      if (innerBatch !== null && innerBatch !== innerNow) { gl.uniform1f(inner, innerBatch); innerNow = innerBatch; }
      if (batch.ring && batch.ring[1] !== featherNow) { gl.uniform1f(feather, batch.ring[1]); featherNow = batch.ring[1]; }
      if (batch.scissor !== scissorNow) {
        scissorNow = batch.scissor;
        if (!scissorNow) gl.disable(gl.SCISSOR_TEST);
        else {
          // The scissor counts rows from the bottom.
          const [left, top, right, bottom] = scissorNow;
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(left, backingHeight - bottom, right - left, bottom - top);
        }
      }
      if (batch.stencil !== stencilNow) { useStencil(batch.stencil); stencilNow = batch.stencil; }
      // Each batch's vertices are read from its own first quad, so the 16-bit index never runs out.
      const offset = batch.first * 4 * stride;
      gl.vertexAttribPointer(positionUv, 4, gl.FLOAT, false, stride, offset);
      gl.vertexAttribPointer(tint, 4, gl.FLOAT, false, stride, offset + 16);
      gl.drawElements(gl.TRIANGLES, batch.count * 6, gl.UNSIGNED_SHORT, 0);
    }
    if (stencilNow) useStencil(0);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    if (frame % 30 === 0 || textureBytes > TEXTURE_BUDGET_BYTES) release(TEXTURE_IDLE_FRAMES);
    return largestUpload;
  }

  return {
    slots: [positionUv, tint],
    draw,
    stats,
    /** Forgets every uploaded texture (the layer's tiles were dropped, or its context went). */
    clear() {
      for (const entry of textures.values()) gl.deleteTexture(entry.texture);
      textures.clear();
      textureBytes = 0;
      if (white) gl.deleteTexture(white);
      white = null;
    },
    textureCount: () => textures.size,
  };
}

export type WebGLSpritePass = NonNullable<ReturnType<typeof createWebGLSpritePass>>;
