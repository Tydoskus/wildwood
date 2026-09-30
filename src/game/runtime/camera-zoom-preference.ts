/**
 * The player's own camera zoom, on top of the framing the camera picks for
 * the screen and attack range: 12 steps of 5%, from 30% out to 30% in, with
 * 100% in the middle. Floating labels scale with it (render-space.ts), so
 * they keep their size next to the world.
 */
export const CAMERA_ZOOM_STEP = .05;
export const CAMERA_ZOOM_LEVELS: readonly number[] = Object.freeze(
  Array.from({ length: 13 }, (_, index) => Math.round((.7 + index * CAMERA_ZOOM_STEP) * 100) / 100),
);
const DEFAULT_INDEX = CAMERA_ZOOM_LEVELS.indexOf(1);
const STORAGE_KEY = "wildstat.cameraZoomStep";

let index = DEFAULT_INDEX;
try {
  const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
  if (Number.isInteger(stored) && stored >= 0 && stored < CAMERA_ZOOM_LEVELS.length) index = stored;
} catch { /* Private windows and blocked storage keep 100%. */ }

/** 1 is the camera's own framing; above zooms in, below zooms out. */
export function cameraZoomPreference() {
  return CAMERA_ZOOM_LEVELS[index];
}

/** Moves one step in (+1) or out (-1), stopping at either end. Returns the new level. */
export function stepCameraZoom(direction: 1 | -1) {
  index = Math.max(0, Math.min(CAMERA_ZOOM_LEVELS.length - 1, index + direction));
  try { globalThis.localStorage?.setItem(STORAGE_KEY, String(index)); } catch { /* Not remembered, still applied. */ }
  return CAMERA_ZOOM_LEVELS[index];
}

export function canZoomCamera(direction: 1 | -1) {
  return direction > 0 ? index < CAMERA_ZOOM_LEVELS.length - 1 : index > 0;
}

/** Tests only: back to 100%. */
export function resetCameraZoomPreference() {
  index = DEFAULT_INDEX;
}
