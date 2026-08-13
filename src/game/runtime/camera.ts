import { ATTACK_RANGE_ZOOM_REFERENCE, MIN_CAMERA_ZOOM, WORLD } from "../constants";
import { clamp } from "../math";

export type Camera = { x: number; y: number; zoom: number };

type CameraPlayer = { x: number; y: number; attackRange: number };
type Viewport = { width: number; height: number };

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

function targetZoom(attackRange: number) {
  const rangeIncrease = attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
  return clamp((1 - rangeIncrease * .5) * .85, MIN_CAMERA_ZOOM, 1);
}

function targetPosition(
  camera: Camera,
  player: CameraPlayer,
  viewport: Viewport,
  duelCenter: { x: number; y: number } | null,
) {
  const visibleW = viewport.width / camera.zoom;
  const visibleH = viewport.height / camera.zoom;
  return {
    x: duelCenter
      ? duelCenter.x - visibleW / 2
      : clamp(player.x - visibleW / 2, 0, Math.max(0, WORLD.w - visibleW)),
    y: duelCenter
      ? duelCenter.y - visibleH / 2
      : clamp(player.y - visibleH / 2, 0, Math.max(0, WORLD.h - visibleH)),
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
  camera.zoom += (targetZoom(player.attackRange) - camera.zoom) * zoomFollow;
  const target = targetPosition(camera, player, viewport, duelCenter);
  const follow = 1 - Math.pow(.00006, dt);
  camera.x += (target.x - camera.x) * follow;
  camera.y += (target.y - camera.y) * follow;
}

export function snapCameraToPlayer(camera: Camera, player: CameraPlayer, viewport: Viewport) {
  camera.zoom = targetZoom(player.attackRange);
  const target = targetPosition(camera, player, viewport, null);
  camera.x = target.x;
  camera.y = target.y;
}
