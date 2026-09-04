import { describe, expect, it } from "vitest";
import {
  createCamera,
  MOBILE_CAMERA_REFERENCE_VIEWPORT,
  MOBILE_CAMERA_VERTICAL_FOCUS_OFFSET,
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

  it("places the player below center on phone gameplay", () => {
    const camera = createCamera();
    const phonePlayer = { x: 2_400, y: 2_400, attackRange: 155 };

    snapCameraToPlayer(camera, phonePlayer, MOBILE_CAMERA_REFERENCE_VIEWPORT);

    const playerScreenY = (phonePlayer.y - camera.y) * camera.zoom;
    expect(playerScreenY / MOBILE_CAMERA_REFERENCE_VIEWPORT.height)
      .toBeCloseTo(.5 + MOBILE_CAMERA_VERTICAL_FOCUS_OFFSET, 10);
  });

  it("keeps desktop gameplay centered on the player", () => {
    const camera = createCamera();

    snapCameraToPlayer(camera, player, viewport);

    const playerScreenY = (player.y - camera.y) * camera.zoom;
    expect(playerScreenY / viewport.height).toBeCloseTo(.5, 10);
  });

  it("matches square desktop and reference-phone visible world area", () => {
    const phone = MOBILE_CAMERA_REFERENCE_VIEWPORT;
    const desktop = { width: 900, height: 900 };
    const phoneZoom = targetCameraZoom(155, phone);
    const desktopZoom = targetCameraZoom(155, desktop);
    const phoneWorldArea = phone.width * phone.height / phoneZoom ** 2;
    const desktopWorldArea = desktop.width * desktop.height / desktopZoom ** 2;

    expect(desktopZoom).toBeGreaterThan(1);
    expect(desktopWorldArea).toBeCloseTo(phoneWorldArea, 8);
  });

  it("does not zoom in when a square viewport is stretched wider", () => {
    const square = { width: 900, height: 900 };
    const widescreen = { width: 1_600, height: 900 };

    expect(targetCameraZoom(155, widescreen))
      .toBeCloseTo(targetCameraZoom(155, square), 10);
  });

  it("makes square viewports the most zoomed in for a fixed pixel diagonal", () => {
    const square = { width: 1_000, height: 1_000 };
    const stretched = { width: 1_300, height: Math.sqrt(2_000_000 - 1_300 ** 2) };

    expect(Math.hypot(square.width, square.height))
      .toBeCloseTo(Math.hypot(stretched.width, stretched.height), 8);
    expect(targetCameraZoom(155, square))
      .toBeGreaterThan(targetCameraZoom(155, stretched));
  });

  it("does not hide more map when a large desktop reaches the zoom cap", () => {
    const phone = MOBILE_CAMERA_REFERENCE_VIEWPORT;
    const desktop = { width: 2560, height: 1440 };
    const phoneWorldArea = phone.width * phone.height
      / targetCameraZoom(155, phone) ** 2;
    const desktopWorldArea = desktop.width * desktop.height
      / targetCameraZoom(155, desktop) ** 2;

    expect(desktopWorldArea).toBeGreaterThanOrEqual(phoneWorldArea);
  });

  it("does not zoom smaller phones out by more than requested", () => {
    expect(targetCameraZoom(155, { width: 375, height: 667 }))
      .toBeCloseTo(targetCameraZoom(155, MOBILE_CAMERA_REFERENCE_VIEWPORT), 10);
  });
});
