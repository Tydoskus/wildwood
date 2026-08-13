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

    const pan = cutscene.update(1.8);
    expect(pan.active).toBe(true);
    expect(pan.showDestination).toBe(false);
    expect(pan.blackoutOpacity).toBeGreaterThan(0);
    expect(pan.blackoutOpacity).toBeLessThan(1);
    expect(pan.portalIntensity).toBe(0);
    expect(pan.camera.x).toBeGreaterThan(20);

    const reveal = cutscene.update(2.1);
    expect(reveal.showDestination).toBe(true);
    expect(reveal.blackoutOpacity).toBe(1);
    expect(reveal.portalIntensity).toBeGreaterThan(0);

    const holdFrame = cutscene.update(2);
    expect(holdFrame.returning).toBe(false);

    const returnFrame = cutscene.update(.8);
    expect(returnFrame.returning).toBe(true);
    expect(returnFrame.blackoutOpacity).toBeLessThan(1);

    const end = cutscene.update(4);
    expect(end.finished).toBe(true);
    expect(cutscene.active).toBe(false);
  });

  it("centers an edge portal instead of clamping the cinematic to world bounds", () => {
    const cutscene = createPortalCutscene();
    const viewport = { width: 400, height: 300 };
    const focus = { x: 20, y: 40 };
    cutscene.begin({ x: 0, y: 0, zoom: .9 }, focus, viewport);

    const frame = cutscene.update(3.6);
    expect((focus.x - frame.camera.x) * frame.camera.zoom).toBeCloseTo(viewport.width / 2);
    expect((focus.y - frame.camera.y) * frame.camera.zoom).toBeCloseTo(viewport.height / 2);
  });
});
