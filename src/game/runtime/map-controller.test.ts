import { describe, expect, it, vi } from "vitest";
import { prepareMapTransition } from "./map-controller";

describe("map asset transition gate", () => {
  it("starts destination art and cloud cover immediately, then waits for both before arrival", async () => {
    let finishAssets!: () => void;
    let finishCover!: () => void;
    const assetsReady = new Promise<void>((resolve) => { finishAssets = resolve; });
    const coverReady = new Promise<void>((resolve) => { finishCover = resolve; });
    const events: string[] = [];
    const transition = prepareMapTransition(
      async () => { events.push("server"); return true; },
      () => { events.push("assets"); return assetsReady; },
      () => { events.push("clouds"); return coverReady; },
    );
    let arrived = false;
    void transition.then(() => { arrived = true; });

    await Promise.resolve();
    expect(events).toEqual(["assets", "clouds", "server"]);
    expect(arrived).toBe(false);

    finishAssets();
    await Promise.resolve();
    expect(arrived).toBe(false);

    finishCover();
    await expect(transition).resolves.toBe(true);
  });

  it("does not hold a rejected server move open for destination art", async () => {
    const neverReady = new Promise<void>(() => {});
    await expect(prepareMapTransition(
      () => false,
      vi.fn(() => neverReady),
    )).resolves.toBe(false);
  });
});
