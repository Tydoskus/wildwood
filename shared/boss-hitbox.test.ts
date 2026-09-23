import { describe, expect, it } from "vitest";
import {
  bossSurfaceDistance,
  bossVerticalRadius,
  KOI_SHOGUN_HITBOX_OFFSET_Y,
  KOI_SHOGUN_VERTICAL_RADIUS,
  MIREMAW_HITBOX_OFFSET_Y,
  MIREMAW_RADIUS_REFERENCE,
  MIREMAW_VERTICAL_RADIUS,
  TEMPEST_KIRIN_HITBOX_OFFSET_Y,
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

  it("keeps the width it had while pulling the top down to Miremaw's head", () => {
    const radius = MIREMAW_RADIUS_REFERENCE;
    // Straight out to the side is unchanged: the complaint was height only.
    expect(bossSurfaceDistance(radius, MIREMAW_HITBOX_OFFSET_Y, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y))
      .toBeCloseTo(0, 9);
    // The top of the body, wherever the tuner last put it. Deriving it keeps
    // this about the geometry rather than about one saved number.
    const bodyTop = MIREMAW_HITBOX_OFFSET_Y - MIREMAW_VERTICAL_RADIUS;
    const above = bossSurfaceDistance(0, bodyTop, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y);
    expect(above).toBeCloseTo(0, 6);
    // Level with the anchor and well short of the body: inside the old circle,
    // outside the ellipse.
    expect(bossSurfaceDistance(0, bodyTop - 40, radius)).toBeLessThan(0);
    expect(bossSurfaceDistance(0, bodyTop - 40, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y)).toBeGreaterThan(0);
  });

  it("narrows the two bosses that share Miremaw's fault, and nothing else", () => {
    // Each was a circle as tall as it was wide, reaching into the banners and
    // the mane above a body a player can actually aim at.
    for (const [radius, vertical, offset] of [
      [175, KOI_SHOGUN_VERTICAL_RADIUS, KOI_SHOGUN_HITBOX_OFFSET_Y],
      [180, TEMPEST_KIRIN_VERTICAL_RADIUS, TEMPEST_KIRIN_HITBOX_OFFSET_Y],
    ]) {
      expect(vertical).toBeLessThan(radius);
      // Unchanged across: the width was never the complaint.
      expect(bossSurfaceDistance(radius, offset, radius, vertical, offset)).toBeCloseTo(0, 9);
      // The top of the body, not the top of the sprite.
      expect(bossSurfaceDistance(0, offset - vertical, radius, vertical, offset)).toBeCloseTo(0, 9);
      expect(bossSurfaceDistance(0, -radius, radius, vertical, offset)).toBeGreaterThan(0);
    }
  });

  it("measures from the body's middle, not the anchor", () => {
    const radius = MIREMAW_RADIUS_REFERENCE;
    const inside = bossSurfaceDistance(0, MIREMAW_HITBOX_OFFSET_Y, radius, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y);
    expect(inside).toBeCloseTo(-radius, 9);
  });
});
