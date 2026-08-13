import { describe, expect, it } from "vitest";
import { createCamera, snapCameraToPlayer, updateCamera } from "./camera";

describe("runtime camera", () => {
  const player = { x: 900, y: 700, attackRange: 180 };
  const viewport = { width: 1200, height: 800 };

  it("snaps to the player within world bounds", () => {
    const camera = createCamera();
    snapCameraToPlayer(camera, player, viewport);

    expect(camera.zoom).toBeLessThanOrEqual(1);
    expect(camera.x).toBeGreaterThanOrEqual(0);
    expect(camera.y).toBeGreaterThanOrEqual(0);
  });

  it("centers the duel arena when dueling", () => {
    const camera = createCamera();
    updateCamera(camera, player, viewport, { x: 6000, y: 6000 }, 1);

    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeGreaterThan(0);
  });
});
