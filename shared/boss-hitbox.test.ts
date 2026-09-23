import { describe, expect, it } from "vitest";
import {
  bossSurfaceDistance,
  bossVerticalRadius,
  KOI_SHOGUN_HITBOX_OFFSET_Y,
  KOI_SHOGUN_RADIUS,
  KOI_SHOGUN_VERTICAL_RADIUS,
  MIREMAW_HITBOX_OFFSET_Y,
  MIREMAW_RADIUS,
  MIREMAW_VERTICAL_RADIUS,
  TEMPEST_KIRIN_HITBOX_OFFSET_Y,
  TEMPEST_KIRIN_RADIUS,
  TEMPEST_KIRIN_VERTICAL_RADIUS,
} from "./boss-hitbox";

describe("boss hitbox", () => {
  it("is the circle it always was when a boss carries nothing extra", () => {
    // Every boss that already plays correctly must come out bit for bit the
    // same, which is the whole reason the extras are optional.
    for (const [dx, dy, radius] of [[0, 0, 170], [300, 0, 170], [120, 160, 125], [-40, 90, 150]]) {
      expect(bossSurfaceDistance(dx, dy, radius)).toBeCloseTo(Math.hypot(dx, dy) - radius, 9);
    }
    expect(bossVerticalRadius(170, undefined)).toBe(170);
    expect(bossVerticalRadius(170, 0)).toBe(170);
  });

  it("uses the saved Miremaw width and height", () => {
    const radius = MIREMAW_RADIUS;
    expect(bossSurfaceDistance(radius, MIREMAW_HITBOX_OFFSET_Y, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y))
      .toBeCloseTo(0, 9);
    // The top of the body, wherever the tuner last put it. Deriving it keeps
    // this about the geometry rather than about one saved number.
    const bodyTop = MIREMAW_HITBOX_OFFSET_Y - MIREMAW_VERTICAL_RADIUS;
    const above = bossSurfaceDistance(0, bodyTop, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y);
    expect(above).toBeCloseTo(0, 6);
    // A point above the tuned body stays outside its hitbox.
    expect(bossSurfaceDistance(0, bodyTop - 40, radius)).toBeLessThan(0);
    expect(bossSurfaceDistance(0, bodyTop - 40, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y)).toBeGreaterThan(0);
  });

  it("uses the saved body shapes for Koi Shogun and Tempest Kirin", () => {
    // Each was a circle as tall as it was wide, reaching into the banners and
    // the mane above a body a player can actually aim at.
    for (const [radius, vertical, offset] of [
      [KOI_SHOGUN_RADIUS, KOI_SHOGUN_VERTICAL_RADIUS, KOI_SHOGUN_HITBOX_OFFSET_Y],
      [TEMPEST_KIRIN_RADIUS, TEMPEST_KIRIN_VERTICAL_RADIUS, TEMPEST_KIRIN_HITBOX_OFFSET_Y],
    ]) {
      expect(bossSurfaceDistance(radius, offset, radius, vertical, offset)).toBeCloseTo(0, 9);
      // The top of the body, not the top of the sprite.
      expect(bossSurfaceDistance(0, offset - vertical, radius, vertical, offset)).toBeCloseTo(0, 9);
      expect(bossSurfaceDistance(0, offset - vertical - 1, radius, vertical, offset)).toBeGreaterThan(0);
    }
  });

  it("measures from the body's middle, not the anchor", () => {
    const radius = MIREMAW_RADIUS;
    const inside = bossSurfaceDistance(0, MIREMAW_HITBOX_OFFSET_Y, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y);
    expect(inside).toBeCloseTo(-radius, 9);
  });
});
