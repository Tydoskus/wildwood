import { describe, expect, it, vi } from "vitest";
import { createPageWakeTracker } from "./page-wake-tracker";

describe("page wake tracker", () => {
  it("recovers a long pagehide even when visibilitychange was missed", () => {
    let now = 1_000;
    const onLongWake = vi.fn();
    const onResume = vi.fn();
    const tracker = createPageWakeTracker({
      longWakeMs: 10_000,
      nowMs: () => now,
      onLongWake,
      onResume,
    });

    tracker.hide();
    now += 15_000;
    tracker.show();

    expect(onLongWake).toHaveBeenCalledWith(15_000);
    expect(onResume).toHaveBeenCalledWith(false, 15_000);
  });

  it("consumes each hidden interval once while allowing persisted pageshow to force recovery", () => {
    let now = 5_000;
    const onResume = vi.fn();
    const tracker = createPageWakeTracker({
      longWakeMs: 10_000,
      nowMs: () => now,
      onLongWake: vi.fn(),
      onResume,
    });

    tracker.hide();
    now += 2_000;
    tracker.show();
    tracker.show();
    tracker.show(true);

    expect(onResume.mock.calls).toEqual([
      [false, 2_000],
      [true, 0],
    ]);
  });
});
