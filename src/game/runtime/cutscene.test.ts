import { describe, expect, it } from "vitest";
import { createPortalCutscene } from "./cutscene";

describe("portal cutscene", () => {
  it("pans before revealing, then finishes", () => {
    const cutscene = createPortalCutscene();
    cutscene.begin(
      { x: 20, y: 40, zoom: .9 },
      { x: 800, y: 600 },
      { width: 400, height: 300 },
    );

    const pan = cutscene.update(1);
    expect(pan.active).toBe(true);
    expect(pan.showDestination).toBe(false);
    expect(pan.portalIntensity).toBe(0);
    expect(pan.camera.x).toBeGreaterThan(20);

    const reveal = cutscene.update(1.1);
    expect(reveal.showDestination).toBe(true);
    expect(reveal.portalIntensity).toBeGreaterThan(0);

    const end = cutscene.update(4);
    expect(end.finished).toBe(true);
    expect(cutscene.active).toBe(false);
  });
});
