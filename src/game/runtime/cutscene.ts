import { clamp } from "../math";
import type { Camera } from "./camera";

export type PortalCutsceneFrame = {
  active: boolean;
  finished: boolean;
  returning: boolean;
  camera: Camera;
  blackoutOpacity: number;
  portalIntensity: number;
  showDestination: boolean;
  destinationOpacity: number;
};

type CutsceneViewport = { width: number; height: number };

const PAN_SECONDS = 3.6;
const FLICKER_SECONDS = 1.25;
const HOLD_SECONDS = 1.8;
const RETURN_SECONDS = 3.6;

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function createPortalCutscene() {
  let elapsed = 0;
  let start: Camera | null = null;
  let target: Camera | null = null;

  function begin(camera: Camera, focus: { x: number; y: number }, viewport: CutsceneViewport) {
    const zoom = Math.max(.82, Math.min(1, camera.zoom));
    start = { ...camera };
    target = {
      zoom,
      // A cinematic can look beyond the playable world. Clamping here pins
      // edge portals away from the screen center, which breaks the reveal.
      x: focus.x - viewport.width / zoom / 2,
      y: focus.y - viewport.height / zoom / 2,
    };
    elapsed = 0;
  }

  function update(dt: number): PortalCutsceneFrame {
    if (!start || !target) return {
      active: false,
      finished: false,
      returning: false,
      camera: { x: 0, y: 0, zoom: 1 },
      blackoutOpacity: 0,
      portalIntensity: 0,
      showDestination: false,
      destinationOpacity: 0,
    };
    elapsed += dt;
    const pan = clamp(elapsed / PAN_SECONDS, 0, 1);
    const panCamera = {
      x: start.x + (target.x - start.x) * easeOutCubic(pan),
      y: start.y + (target.y - start.y) * easeOutCubic(pan),
      zoom: start.zoom + (target.zoom - start.zoom) * easeOutCubic(pan),
    };
    const revealElapsed = Math.max(0, elapsed - PAN_SECONDS);
    const returnStart = PAN_SECONDS + FLICKER_SECONDS + HOLD_SECONDS;
    const returnProgress = clamp((elapsed - returnStart) / RETURN_SECONDS, 0, 1);
    const returning = returnProgress > 0;
    const returnEase = easeOutCubic(returnProgress);
    const camera = returning
      ? {
          x: target.x + (start.x - target.x) * returnEase,
          y: target.y + (start.y - target.y) * returnEase,
          zoom: target.zoom + (start.zoom - target.zoom) * returnEase,
        }
      : panCamera;
    const flicker = elapsed >= PAN_SECONDS && revealElapsed < FLICKER_SECONDS;
    const portalIntensity = elapsed < PAN_SECONDS
      ? 0
      : flicker
        ? .22 + (Math.sin(revealElapsed * 38) > -.15 ? .78 : 0)
        : 1;
    const finished = returnProgress === 1;
    const destinationOpacity = clamp((revealElapsed - FLICKER_SECONDS) / .5, 0, 1);
    if (finished) {
      start = null;
      target = null;
    }
    return {
      active: true,
      finished,
      returning,
      camera,
      blackoutOpacity: returning ? 1 - returnEase : easeOutCubic(pan),
      portalIntensity,
      showDestination: destinationOpacity > 0,
      destinationOpacity,
    };
  }

  return { begin, update, get active() { return start !== null; } };
}
