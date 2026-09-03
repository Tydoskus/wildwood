import { describe, expect, it, vi } from "vitest";
import {
  adjacentMapDestinations,
  backgroundMapPreloadAvailability,
  createAdjacentMapAssetPreloader,
} from "./map-asset-preloader";

type TestMapId = "back" | "middle" | "forward";

const mapConfig = {
  back: { portal: { destination: "middle" } },
  middle: {
    portal: { destination: "back" },
    secondaryPortal: { destination: "forward" },
  },
  forward: { portal: { destination: "middle" } },
} satisfies Record<TestMapId, {
  portal: { destination: TestMapId };
  secondaryPortal?: { destination: TestMapId };
}>;

function controlledScheduler() {
  const tasks: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
  return {
    tasks,
    schedule: (callback: () => void, delayMs: number) => {
      const task = { callback, delayMs, cancelled: false };
      tasks.push(task);
      return () => { task.cancelled = true; };
    },
    runNext: () => {
      const index = tasks.findIndex((task) => !task.cancelled);
      if (index < 0) throw new Error("No scheduled preload task");
      const [task] = tasks.splice(index, 1);
      task.callback();
      return task;
    },
  };
}

describe("adjacent map asset preloading", () => {
  it("prioritizes the forward portal and deduplicates destinations", () => {
    expect(adjacentMapDestinations(mapConfig, "middle")).toEqual(["forward", "back"]);
    expect(adjacentMapDestinations({
      ...mapConfig,
      middle: {
        portal: { destination: "forward" },
        secondaryPortal: { destination: "forward" },
      },
    }, "middle")).toEqual(["forward"]);
  });

  it("loads adjacent maps sequentially and reuses already-ready maps", async () => {
    const scheduler = controlledScheduler();
    let finishForward!: () => void;
    const forwardLoad = new Promise<void>((resolve) => { finishForward = resolve; });
    const prepareMapAssets = vi.fn((mapId: TestMapId) => mapId === "forward" ? forwardLoad : Promise.resolve());
    const preloader = createAdjacentMapAssetPreloader({
      mapConfig,
      mapAssetsReady: (mapId) => mapId === "back",
      prepareMapAssets,
      availability: () => "ready",
      schedule: scheduler.schedule,
      initialDelayMs: 25,
      betweenMapsDelayMs: 10,
    });

    preloader.queueFrom("middle");
    expect(scheduler.tasks).toHaveLength(1);
    expect(scheduler.tasks[0].delayMs).toBe(25);
    scheduler.runNext();
    expect(prepareMapAssets).toHaveBeenCalledWith("forward");
    expect(prepareMapAssets).toHaveBeenCalledTimes(1);

    finishForward();
    await forwardLoad;
    await Promise.resolve();

    expect(scheduler.tasks.filter((task) => !task.cancelled)).toHaveLength(1);
    scheduler.runNext();
    await Promise.resolve();
    expect(prepareMapAssets).toHaveBeenCalledTimes(1);
  });

  it("waits for spare frame capacity and abandons superseded routes", () => {
    const scheduler = controlledScheduler();
    let availability: "wait" | "ready" = "wait";
    const prepareMapAssets = vi.fn(() => Promise.resolve());
    const preloader = createAdjacentMapAssetPreloader({
      mapConfig,
      mapAssetsReady: () => false,
      prepareMapAssets,
      availability: () => availability,
      schedule: scheduler.schedule,
      initialDelayMs: 0,
      retryDelayMs: 50,
    });

    preloader.queueFrom("middle");
    scheduler.runNext();
    expect(prepareMapAssets).not.toHaveBeenCalled();
    expect(scheduler.tasks.at(-1)?.delayMs).toBe(50);

    preloader.queueFrom("forward");
    availability = "ready";
    scheduler.runNext();
    expect(prepareMapAssets).toHaveBeenCalledWith("middle");
  });
});

describe("background map preload availability", () => {
  const readyState = {
    running: true,
    lowPerformanceMode: false,
    documentHidden: false,
    gameplayBusy: false,
    workFps: 60,
    saveData: false,
    effectiveConnectionType: "4g",
  };

  it("allows preloading only with foreground performance headroom", () => {
    expect(backgroundMapPreloadAvailability(readyState)).toBe("ready");
    expect(backgroundMapPreloadAvailability({ ...readyState, workFps: 49 })).toBe("wait");
    expect(backgroundMapPreloadAvailability({ ...readyState, documentHidden: true })).toBe("wait");
    expect(backgroundMapPreloadAvailability({ ...readyState, gameplayBusy: true })).toBe("wait");
    expect(backgroundMapPreloadAvailability({ ...readyState, lowPerformanceMode: true })).toBe("wait");
  });

  it("disables speculative downloads for data saving and slow connections", () => {
    expect(backgroundMapPreloadAvailability({ ...readyState, saveData: true })).toBe("disabled");
    expect(backgroundMapPreloadAvailability({ ...readyState, effectiveConnectionType: "2g" })).toBe("disabled");
    expect(backgroundMapPreloadAvailability({ ...readyState, effectiveConnectionType: "slow-2g" })).toBe("disabled");
  });
});
