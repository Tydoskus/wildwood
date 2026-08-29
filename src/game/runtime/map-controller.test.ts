import { describe, expect, it, vi } from "vitest";
import { prepareMapTransition } from "./map-controller";

describe("map asset transition gate", () => {
  it("starts destination art immediately and waits for it before arrival", async () => {
    let finishAssets!: () => void;
    const assetsReady = new Promise<void>((resolve) => { finishAssets = resolve; });
    const events: string[] = [];
    const transition = prepareMapTransition(
      async () => { events.push("server"); return true; },
      () => { events.push("assets"); return assetsReady; },
    );
    let arrived = false;
    void transition.then(() => { arrived = true; });

    await Promise.resolve();
    expect(events).toEqual(["assets", "server"]);
    expect(arrived).toBe(false);

    finishAssets();
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
