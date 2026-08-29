import { describe, expect, it } from "vitest";
import {
  createCamera,
  MOBILE_CAMERA_REFERENCE_VIEWPORT,
  MOBILE_CAMERA_ZOOM_MULTIPLIER,
  snapCameraToPlayer,
  targetCameraZoom,
  updateCamera,
} from "./camera";

describe("runtime camera", () => {
  const player = { x: 900, y: 700, attackRange: 180 };
  const viewport = { width: 1200, height: 800 };

  it("snaps to the player within world bounds", () => {
    const camera = createCamera();
    snapCameraToPlayer(camera, player, viewport);

    expect(camera.zoom).toBeLessThanOrEqual(2);
    expect(camera.x).toBeGreaterThanOrEqual(0);
    expect(camera.y).toBeGreaterThanOrEqual(0);
  });

  it("centers the duel arena when dueling", () => {
    const camera = createCamera();
    updateCamera(camera, player, viewport, { x: 6000, y: 6000 }, 1);

    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeGreaterThan(0);
  });

  it("zooms phone gameplay out by exactly seven percent", () => {
    const legacyReferenceZoom = .85;
    const zoom = targetCameraZoom(155, MOBILE_CAMERA_REFERENCE_VIEWPORT);

    expect(zoom / legacyReferenceZoom).toBeCloseTo(MOBILE_CAMERA_ZOOM_MULTIPLIER, 10);
  });

  it("matches desktop and reference-phone visible world area", () => {
    const phone = MOBILE_CAMERA_REFERENCE_VIEWPORT;
    const desktop = { width: 1440, height: 900 };
    const phoneZoom = targetCameraZoom(155, phone);
    const desktopZoom = targetCameraZoom(155, desktop);
    const phoneWorldArea = phone.width * phone.height / phoneZoom ** 2;
    const desktopWorldArea = desktop.width * desktop.height / desktopZoom ** 2;

    expect(desktopZoom).toBeGreaterThan(1);
    expect(desktopWorldArea).toBeCloseTo(phoneWorldArea, 8);
  });

  it("does not zoom smaller phones out by more than requested", () => {
    expect(targetCameraZoom(155, { width: 375, height: 667 }))
      .toBeCloseTo(targetCameraZoom(155, MOBILE_CAMERA_REFERENCE_VIEWPORT), 10);
  });
});
