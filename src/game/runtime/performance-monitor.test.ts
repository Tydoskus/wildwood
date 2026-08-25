import { describe, expect, it } from "vitest";
import { createPerformanceMonitor } from "./performance-monitor";

describe("performance monitor", () => {
  it("reports the average of the slowest one percent of its rolling frame sample", () => {
    const monitor = createPerformanceMonitor();
    for (let frame = 0; frame < 118; frame += 1) monitor.record(1_000 / 60, 0, 0, 1);
    monitor.record(1_000 / 30, 0, 0, 1);
    monitor.record(1_000 / 20, 0, 0, 1);

    const snapshot = monitor.snapshot();
    expect(snapshot.fps).toBe(59);
    expect(snapshot.onePercentLowFps).toBe(24);
    expect(snapshot.workFps).toBe(1_000);
  });

  it("matches average FPS when every sampled frame is equally smooth", () => {
    const monitor = createPerformanceMonitor();
    for (let frame = 0; frame < 120; frame += 1) monitor.record(1_000 / 60, 0, 0, .5);

    expect(monitor.snapshot()).toMatchObject({ fps: 60, onePercentLowFps: 60, workFps: 2_000 });
  });
});
