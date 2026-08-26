import { clamp } from "../math";

export type PresentationTransform = {
  x: number;
  y: number;
  zoom?: number;
};

type TransformSnapshot = {
  x: number;
  y: number;
  zoom?: number;
};

const DEFAULT_TELEPORT_DISTANCE = 160;

/**
 * Smooths fixed-step simulation transforms at the display's native refresh
 * rate. Simulation objects are only changed for the synchronous render call
 * and are always restored before gameplay continues.
 */
export function createPresentationInterpolator(options: {
  singletons: readonly PresentationTransform[];
  collections: readonly (readonly PresentationTransform[])[];
  teleportDistance?: number;
}) {
  const teleportDistance = Math.max(0, options.teleportDistance ?? DEFAULT_TELEPORT_DISTANCE);
  const teleportDistanceSquared = teleportDistance * teleportDistance;
  let previous = new WeakMap<PresentationTransform, TransformSnapshot>();
  const restoreTransforms: PresentationTransform[] = [];
  const restoreX: number[] = [];
  const restoreY: number[] = [];
  const restoreZoom: Array<number | undefined> = [];

  function captureTransform(transform: PresentationTransform) {
    if (!Number.isFinite(transform.x) || !Number.isFinite(transform.y)) return;
    const snapshot = previous.get(transform);
    if (snapshot) {
      snapshot.x = transform.x;
      snapshot.y = transform.y;
      snapshot.zoom = Number.isFinite(transform.zoom) ? transform.zoom : undefined;
      return;
    }
    previous.set(transform, {
      x: transform.x,
      y: transform.y,
      zoom: Number.isFinite(transform.zoom) ? transform.zoom : undefined,
    });
  }

  /** Capture current state immediately before each fixed simulation step. */
  function capture() {
    for (const transform of options.singletons) captureTransform(transform);
    for (const collection of options.collections) {
      for (const transform of collection) captureTransform(transform);
    }
  }

  /** Forget stale pre-transition state and anchor presentation to simulation. */
  function reset() {
    previous = new WeakMap<PresentationTransform, TransformSnapshot>();
    capture();
  }

  function render(alpha: number, draw: () => void) {
    const amount = clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    let restoreCount = 0;

    function interpolateTransform(transform: PresentationTransform) {
      const before = previous.get(transform);
      if (!before || !Number.isFinite(transform.x) || !Number.isFinite(transform.y)) return;
      const currentX = transform.x;
      const currentY = transform.y;
      const currentZoom = transform.zoom;
      const dx = currentX - before.x;
      const dy = currentY - before.y;
      // Respawns, portals, and pooled particles must never streak across the map.
      if (dx * dx + dy * dy > teleportDistanceSquared) return;
      restoreTransforms[restoreCount] = transform;
      restoreX[restoreCount] = currentX;
      restoreY[restoreCount] = currentY;
      restoreZoom[restoreCount] = currentZoom;
      restoreCount += 1;
      transform.x = before.x + dx * amount;
      transform.y = before.y + dy * amount;
      if (before.zoom !== undefined && typeof currentZoom === "number" && Number.isFinite(currentZoom)) {
        transform.zoom = before.zoom + (currentZoom - before.zoom) * amount;
      }
    }

    for (const transform of options.singletons) interpolateTransform(transform);
    for (const collection of options.collections) {
      for (const transform of collection) interpolateTransform(transform);
    }

    try {
      draw();
    } finally {
      for (let index = restoreCount - 1; index >= 0; index -= 1) {
        const transform = restoreTransforms[index];
        transform.x = restoreX[index];
        transform.y = restoreY[index];
        if (restoreZoom[index] !== undefined) transform.zoom = restoreZoom[index];
      }
      restoreTransforms.length = 0;
      restoreX.length = 0;
      restoreY.length = 0;
      restoreZoom.length = 0;
    }
  }

  reset();
  return { capture, render, reset };
}
