import { afterEach, expect, it } from "vitest";
import { CAMERA_ZOOM_LEVELS, canZoomCamera, cameraZoomPreference, resetCameraZoomPreference, stepCameraZoom } from "./camera-zoom-preference";
import { drawScreenSpaceAt } from "./render-space";

afterEach(resetCameraZoomPreference);

it("offers 13 levels from 70% to 130% in 5% steps, starting at 100%", () => {
  expect(CAMERA_ZOOM_LEVELS).toHaveLength(13);
  expect(CAMERA_ZOOM_LEVELS[0]).toBe(.7);
  expect(CAMERA_ZOOM_LEVELS.at(-1)).toBe(1.3);
  expect(cameraZoomPreference()).toBe(1);
});

it("steps one level at a time and stops at either end", () => {
  expect(stepCameraZoom(1)).toBe(1.05);
  for (let i = 0; i < 20; i++) stepCameraZoom(1);
  expect(cameraZoomPreference()).toBe(1.3);
  expect(canZoomCamera(1)).toBe(false);
  for (let i = 0; i < 20; i++) stepCameraZoom(-1);
  expect(cameraZoomPreference()).toBe(.7);
  expect(canZoomCamera(-1)).toBe(false);
});

it("scales floating labels with the player's zoom", () => {
  const scales: number[] = [];
  const ctx = { save() {}, restore() {}, translate() {}, scale: (x: number) => { scales.push(x); } } as unknown as CanvasRenderingContext2D;
  drawScreenSpaceAt(ctx, 2, 0, 0, () => {});
  stepCameraZoom(1); stepCameraZoom(1);
  drawScreenSpaceAt(ctx, 2, 0, 0, () => {});
  expect(scales[0]).toBeCloseTo(.5);
  expect(scales[1]).toBeCloseTo(1.1 / 2);
});

it("starts at 100% when nothing is saved, not at the 70% end", async () => {
  const store = new Map<string, string>();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;
  try {
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("./camera-zoom-preference");
    expect(fresh.cameraZoomPreference()).toBe(1);
  } finally { globalThis.localStorage = previous; }
});
