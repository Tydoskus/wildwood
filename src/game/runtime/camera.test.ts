import { ONBOARDING_WORLD } from "../../../shared/onboarding";
import { MIN_CAMERA_ZOOM, WORLD } from "../constants";
import { attackRangeWithResearch } from "../../../shared/utility-research";
import { HOME_WORLD_WIDTH, HOME_WORLD_HEIGHT } from "../../../shared/home";
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

  it("centers Home when a desktop viewport is wider than the lawn", () => {
    const original = { ...WORLD };
    try {
      WORLD.w = HOME_WORLD_WIDTH;
      WORLD.h = HOME_WORLD_HEIGHT;
      const wideViewport = { width: 2560, height: 900 };
      const camera = createCamera();
      snapCameraToPlayer(camera, { ...player, x: 600, y: 950 }, wideViewport);
      expect(wideViewport.width / camera.zoom).toBeGreaterThan(WORLD.w);
      expect((WORLD.w / 2 - camera.x) * camera.zoom).toBeCloseTo(wideViewport.width / 2);
    } finally {
      Object.assign(WORLD, original);
    }
  });

  it.each([{ width: 1920, height: 1080 }, { width: 3440, height: 1440 }, { width: 5120, height: 1440 }])("fills desktop tutorial framing with grass at $width × $height", viewport => {
    const original = { ...WORLD };
    try {
      WORLD.w = ONBOARDING_WORLD.width; WORLD.h = ONBOARDING_WORLD.height;
      const camera = createCamera();
      snapCameraToPlayer(camera, { ...player, ...ONBOARDING_WORLD.spawn }, viewport);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x + viewport.width / camera.zoom).toBeLessThanOrEqual(WORLD.w);
      expect(camera.y + viewport.height / camera.zoom).toBeLessThanOrEqual(WORLD.h);
      expect((ONBOARDING_WORLD.spawn.x - camera.x) * camera.zoom).toBeCloseTo(viewport.width / 2);
    } finally { Object.assign(WORLD, original); }
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

  describe("attack-range research", () => {
    // The pre-research curve: (1 - (range / 155 - 1) * .5) * .85.
    const legacyZoom = (range: number) => (1 - (range / 155 - 1) * .5) * .85;
    const phone = MOBILE_CAMERA_REFERENCE_VIEWPORT;
    const desktop = { width: 1920, height: 1080 };

    it("keeps the unresearched zoom exactly where it was", () => {
      expect(targetCameraZoom(attackRangeWithResearch(0), phone))
        .toBeCloseTo(legacyZoom(200) * MOBILE_CAMERA_ZOOM_MULTIPLIER, 12);
    });

    it("extends the reach without moving the camera at any rank", () => {
      for (const viewport of [phone, desktop]) {
        const base = targetCameraZoom(attackRangeWithResearch(0), viewport);
        for (let rank = 1; rank <= 5; rank++) expect(targetCameraZoom(attackRangeWithResearch(rank), viewport)).toBe(base);
      }
      expect(targetCameraZoom(attackRangeWithResearch(5), phone)).toBeGreaterThan(MIN_CAMERA_ZOOM);
    });
  });
});
