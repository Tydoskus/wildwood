import { ATTACK_RANGE_ZOOM_REFERENCE, MIN_CAMERA_ZOOM, WORLD } from "../constants";
import { clamp } from "../math";

export type Camera = { x: number; y: number; zoom: number };

type CameraPlayer = { x: number; y: number; attackRange: number };
type Viewport = { width: number; height: number };

const BASE_CAMERA_ZOOM = .85;
export const MOBILE_CAMERA_ZOOM_MULTIPLIER = .93;
// Keep the player slightly below center on phones so more of the gameplay
// space above them remains visible around the mobile controls.
export const MOBILE_CAMERA_VERTICAL_FOCUS_OFFSET = .1;
// Representative phone gameplay canvas after the fixed bottom toolbar is
// removed from a 390×844 home-screen viewport.
export const MOBILE_CAMERA_REFERENCE_VIEWPORT = { width: 390, height: 780 } as const;
const MOBILE_CAMERA_MAX_SHORT_SIDE = 600;
const MOBILE_CAMERA_MAX_AREA = 450_000;
const MAX_CAMERA_ZOOM = 2;

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

function isPhoneViewport(viewport: Viewport) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return Math.min(width, height) <= MOBILE_CAMERA_MAX_SHORT_SIDE
    && width * height <= MOBILE_CAMERA_MAX_AREA;
}

/**
 * Uses a common phone viewport as the world-area anchor. Phones retain a
 * predictable 7% zoom-out, while larger screens scale from the largest square
 * that fits their viewport. Extra width or height reveals more map instead of
 * zooming beyond the equivalent square framing.
 */
export function targetCameraZoom(attackRange: number, viewport: Viewport) {
  const rangeIncrease = attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
  const attackRangeZoom = (1 - rangeIncrease * .5) * BASE_CAMERA_ZOOM;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const squareViewportArea = Math.min(width, height) ** 2;
  const referenceArea = MOBILE_CAMERA_REFERENCE_VIEWPORT.width * MOBILE_CAMERA_REFERENCE_VIEWPORT.height;
  const viewportMultiplier = isPhoneViewport(viewport)
    ? MOBILE_CAMERA_ZOOM_MULTIPLIER
    : MOBILE_CAMERA_ZOOM_MULTIPLIER * Math.sqrt(squareViewportArea / referenceArea);
  return clamp(attackRangeZoom * viewportMultiplier, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
}

function targetPosition(
  camera: Camera,
  player: CameraPlayer,
  viewport: Viewport,
  duelCenter: { x: number; y: number } | null,
) {
  const visibleW = viewport.width / camera.zoom;
  const visibleH = viewport.height / camera.zoom;
  const verticalFocus = .5 + (
    !duelCenter && isPhoneViewport(viewport)
      ? MOBILE_CAMERA_VERTICAL_FOCUS_OFFSET
      : 0
  );
  return {
    x: duelCenter
      ? duelCenter.x - visibleW / 2
      : clamp(player.x - visibleW / 2, 0, Math.max(0, WORLD.w - visibleW)),
    y: duelCenter
      ? duelCenter.y - visibleH / 2
      : clamp(player.y - visibleH * verticalFocus, 0, Math.max(0, WORLD.h - visibleH)),
  };
}

export function updateCamera(
  camera: Camera,
  player: CameraPlayer,
  viewport: Viewport,
  duelCenter: { x: number; y: number } | null,
  dt: number,
) {
  const zoomFollow = 1 - Math.pow(.0008, dt);
  camera.zoom += (targetCameraZoom(player.attackRange, viewport) - camera.zoom) * zoomFollow;
  const target = targetPosition(camera, player, viewport, duelCenter);
  const follow = 1 - Math.pow(.00006, dt);
  camera.x += (target.x - camera.x) * follow;
  camera.y += (target.y - camera.y) * follow;
}

export function snapCameraToPlayer(camera: Camera, player: CameraPlayer, viewport: Viewport) {
  camera.zoom = targetCameraZoom(player.attackRange, viewport);
  const target = targetPosition(camera, player, viewport, null);
  camera.x = target.x;
  camera.y = target.y;
}
