import { createSpriteRecorder, SpriteRecorderUnsupported } from "./sprite-recorder";
import type { SwitchableContext } from "./switchable-context";
import type { StaticWorldLayer } from "./webgl-static-world-layer";
import { worldSpritesWanted } from "./world-sprites-wanted";

/** Frames drawn on the canvas after one the recorder could not draw, before it tries again. */
const RETRY_AFTER_FRAMES = 120;

export type WorldSpriteCapture = {
  /** Starts sending the world's drawing to the WebGL layer; false when this frame draws it on the canvas. */
  begin: () => boolean;
  /** Draws what was recorded; false when it could not, and the world must be drawn on the canvas. */
  commit: () => boolean;
  /** Stops recording after a throw; true when the throw was the recorder's, so the canvas can draw the world. */
  abort: (error: unknown) => boolean;
  /** Whether this frame's world is going to the WebGL layer rather than the canvas. */
  recording: () => boolean;
};

/**
 * The world part of a frame (decor, actors, bosses, portals) recorded as sprites and drawn by the WebGL world
 * layer in one ordered pass. Anything the recorder cannot draw sends the frame, and the next few, to the canvas.
 */
export function createWorldSpriteCapture(context: SwitchableContext | undefined, layer: () => StaticWorldLayer | null | undefined) {
  if (!context?.canSwitch || typeof document === "undefined") return null;
  if (!worldSpritesWanted(window.location.search, navigator)) return null;
  const probe = document.createElement("canvas").getContext("2d");
  const recorder = createSpriteRecorder(() => probe);
  const stats = { recorded: 0, canvas: 0, lastUnsupported: "", shapes: recorder.rasterStats };
  (window as unknown as { __worldSprites?: typeof stats }).__worldSprites = stats;
  let waitFrames = 0;
  let recording = false;

  function fallBack(operation: string) {
    waitFrames = RETRY_AFTER_FRAMES;
    stats.lastUnsupported = operation;
  }

  const capture: WorldSpriteCapture = {
    begin() {
      if (waitFrames > 0) { waitFrames -= 1; stats.canvas += 1; return false; }
      if (!layer()?.drawSprites || !layer()?.active()) { stats.canvas += 1; return false; }
      // From the facade, which keeps a font as it was set (see switchable-context.ts).
      recorder.begin(context.context, layer()?.spritePaths?.() ?? false);
      context.use(recorder.context);
      recording = true;
      return true;
    },
    commit() {
      if (!recording) return false;
      recording = false;
      context.reset();
      const failure = recorder.failure();
      if (failure) { fallBack(failure.operation); stats.canvas += 1; return false; }
      const drawn = layer()?.drawSprites?.(recorder.finish()) ?? false;
      if (drawn) stats.recorded += 1;
      else { stats.canvas += 1; fallBack("WebGL"); }
      return drawn;
    },
    recording: () => recording,
    abort(error) {
      recording = false;
      context.reset();
      if (!(error instanceof SpriteRecorderUnsupported)) return false;
      fallBack(error.operation);
      stats.canvas += 1;
      return true;
    },
  };
  return capture;
}
