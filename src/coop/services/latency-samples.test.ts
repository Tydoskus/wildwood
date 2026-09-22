import { describe, expect, it } from "vitest";
import { createLatencySamples, LATENCY_WINDOW } from "./latency-samples";

describe("connection latency", () => {
  it("reports nothing until a round trip has completed", () => {
    const latency = createLatencySamples();
    expect(latency.value()).toBeNull();
    latency.record(40);
    expect(latency.value()).toBe(40);
  });

  it("ignores a single slow reducer instead of reporting it as the ping", () => {
    // This is the bug: a kill report behind a queue took 800ms and the reading
    // followed it, then decayed over seconds while the network was fine.
    const latency = createLatencySamples();
    for (const sample of [38, 41, 44, 39, 42]) latency.record(sample);
    const before = latency.value()!;
    latency.record(31_715);
    // The median shifts by one position at most, so a 31-second outlier moves
    // the reading by a couple of milliseconds instead of owning it.
    expect(Math.abs(latency.value()! - before)).toBeLessThan(5);
    expect(latency.value()).toBeLessThan(60);
  });

  it("follows a connection that has genuinely got slower", () => {
    const latency = createLatencySamples();
    for (let i = 0; i < LATENCY_WINDOW; i += 1) latency.record(40);
    expect(latency.value()).toBe(40);
    // Most of the window has to agree before the reading moves, which at one
    // sample a second is a few seconds rather than instantly.
    for (let i = 0; i < Math.ceil(LATENCY_WINDOW / 2); i += 1) latency.record(400);
    expect(latency.value()).toBe(400);
  });

  it("keeps only the most recent window, and forgets everything on a reset", () => {
    const latency = createLatencySamples(3);
    for (const sample of [10, 20, 30, 40, 50]) latency.record(sample);
    expect(latency.size).toBe(3);
    expect(latency.value()).toBe(40);
    latency.reset();
    expect(latency.value()).toBeNull();
  });

  it("refuses a nonsense sample rather than ranking it", () => {
    const latency = createLatencySamples();
    latency.record(Number.NaN);
    latency.record(-5);
    expect(latency.value()).toBeNull();
  });
});
