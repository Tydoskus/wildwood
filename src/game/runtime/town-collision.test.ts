import { expect, it, vi } from "vitest";
vi.mock("../../app/developer", () => ({ isDeveloperIdentity: () => false }));
import { pushOutOf } from "./town-runtime";

/** A twelve-sided "fountain" of radius 100 around the origin, as the pack's polygon colliders are. */
function round(radius = 100, sides = 12) {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < sides; i++) { xs.push(Math.cos(i / sides * Math.PI * 2) * radius); ys.push(Math.sin(i / sides * Math.PI * 2) * radius); }
  return { xs, ys, left: -radius, top: -radius, right: radius, bottom: radius };
}

it("slides round a round collider instead of stopping at its square corners", () => {
  const solid = round();
  // Where a bounding box would have a corner, a round fountain has open ground.
  const corner = { x: 85, y: 85, r: 12 };
  pushOutOf(corner, solid);
  expect(corner).toEqual({ x: 85, y: 85, r: 12 });
  const touching = { x: 105, y: 0, r: 12 };
  pushOutOf(touching, solid);
  expect(touching.x).toBeGreaterThanOrEqual(111.9);
  expect(touching.y).toBeCloseTo(0);
});

it("puts a circle that ended up inside back out through the nearest edge", () => {
  const inside = { x: 0, y: 90, r: 12 };
  pushOutOf(inside, round());
  expect(Math.hypot(inside.x, inside.y)).toBeGreaterThan(100);
  expect(inside.y).toBeGreaterThan(0);
});
