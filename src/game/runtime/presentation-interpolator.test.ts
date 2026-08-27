import { describe, expect, it } from "vitest";
import { createPresentationInterpolator } from "./presentation-interpolator";

describe("fixed-step presentation interpolation", () => {
  it("renders between the previous and current transform without changing simulation state", () => {
    const actor = { x: 10, y: 20 };
    const camera = { x: 0, y: 4, zoom: 1 };
    const presentation = createPresentationInterpolator({ singletons: [actor, camera], collections: [] });
    presentation.capture();
    actor.x = 14;
    actor.y = 26;
    camera.x = 2;
    camera.zoom = .8;

    presentation.render(.5, () => {
      expect(actor).toEqual({ x: 12, y: 23 });
      expect(camera.x).toBe(1);
      expect(camera.zoom).toBeCloseTo(.9);
    });

    expect(actor).toEqual({ x: 14, y: 26 });
    expect(camera).toEqual({ x: 2, y: 4, zoom: .8 });
  });

  it("does not interpolate teleports or newly spawned collection members", () => {
    const actor = { x: 0, y: 0 };
    const particles = [{ x: 2, y: 2 }];
    const presentation = createPresentationInterpolator({
      singletons: [actor],
      collections: [particles],
      teleportDistance: 20,
    });
    presentation.capture();
    actor.x = 100;
    particles.push({ x: 8, y: 8 });

    presentation.render(.25, () => {
      expect(actor.x).toBe(100);
      expect(particles[1]).toEqual({ x: 8, y: 8 });
    });
  });

  it("does not interpolate a pooled collection member from a stale capture", () => {
    const pooled = { x: 4, y: 6 };
    const particles = [pooled];
    const presentation = createPresentationInterpolator({ singletons: [], collections: [particles] });

    presentation.capture();
    particles.pop();
    presentation.capture();
    pooled.x = 40;
    pooled.y = 60;
    particles.push(pooled);

    presentation.render(.25, () => {
      expect(pooled).toEqual({ x: 40, y: 60 });
    });
  });

  it("restores transforms when drawing throws", () => {
    const actor = { x: 0, y: 0 };
    const presentation = createPresentationInterpolator({ singletons: [actor], collections: [] });
    presentation.capture();
    actor.x = 10;

    expect(() => presentation.render(.5, () => { throw new Error("draw failed"); })).toThrow("draw failed");
    expect(actor.x).toBe(10);
  });
});
