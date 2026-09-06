import { describe, expect, it, vi } from "vitest";
import { createRenderController, snapToDevicePixel } from "./render-controller";

function arena(ready: boolean, replay: boolean) {
  const scene = { countdown: 3, hitMultiplier: 1 };
  const ctx = new Proxy({} as any, { get: (target, key) => target[key] ??= vi.fn() });
  const options = new Proxy({
    ctx, camera: { x: 0, y: 0, zoom: 1 }, player: { x: 5000, y: 5000, attackRange: 200 },
    viewport: () => ({ width: 900, height: 700, dpr: 1 }), remotePlayers: () => [],
    duelAssetsReady: () => ready, isReplayActive: () => replay,
    replayScene: () => replay ? scene : null, heldScene: () => null,
    duelResultHeld: () => false, liveScene: () => scene, isDueling: () => !replay,
  } as any, { get: (target, key) => target[key] ??= vi.fn() });
  return { ctx, options, render: createRenderController(options).render, scene };
}
it("holds live arena rendering until its art has settled", () => {
  const f = arena(false, false); f.render();
  expect(f.options.drawDuelArena).not.toHaveBeenCalled();
  expect(f.options.drawDuelScene).not.toHaveBeenCalled();
  expect(f.ctx.fillText).toHaveBeenCalledWith("LOADING ARENA…", 450, 350);
  expect(f.options.setRenderedDuelScene).toHaveBeenCalledWith(null);
});
it.each([true, false])("keeps arena lighting independent of exploration coordinates (replay=%s)", replay => {
  const f = arena(true, replay); f.render();
  expect(f.options.drawDuelScene).toHaveBeenCalledWith(f.scene);
  expect(f.ctx.createRadialGradient).not.toHaveBeenCalled();
});

describe("snapToDevicePixel", () => {
  it("keeps shake transforms on physical pixel boundaries", () => {
    expect(snapToDevicePixel(1.26, 2)).toBe(1.5);
    expect(snapToDevicePixel(-1.26, 2)).toBe(-1.5);
    expect(snapToDevicePixel(.2, 3)).toBeCloseTo(1 / 3);
  });

  it("falls back safely for invalid pixel ratios", () => {
    expect(snapToDevicePixel(1.6, Number.NaN)).toBe(2);
    expect(snapToDevicePixel(1.6, 0)).toBe(2);
  });
});
