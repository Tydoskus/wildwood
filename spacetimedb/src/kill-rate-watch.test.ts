import { describe, expect, it, vi } from "vitest";
import { killRateWatch, KILL_RATE_WATCH_PER_SECOND } from "./enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const at = (seconds: number) => BigInt(Math.round(seconds * 1e6));

/** Reports every `every` seconds paying `rate` kills a second; returns when each episode began. */
function run(rate: number, seconds: number, every = 30, start: { tokens: number; updatedAtMicros: bigint } | null = null, from = 0) {
  let row = start;
  const episodes: number[] = [];
  for (let t = from + every; t <= from + seconds; t += every) {
    const watch = killRateWatch(row, at(t), rate * every, every);
    if (watch.episodeStarted) episodes.push(t);
    row = { tokens: watch.tokens, updatedAtMicros: at(t) };
  }
  return { episodes, row: row! };
}

describe("kill-rate watch", () => {
  it("never writes down the fastest honest farming anyone has done, however long it lasts", () => {
    for (const rate of [1.1, 1.65, 2.0, KILL_RATE_WATCH_PER_SECOND - .01]) expect(run(rate, 8 * 3600).episodes).toEqual([]);
  });

  it("writes down three kills a second after about fifteen minutes, once", () => {
    const { episodes } = run(3, 3600);
    expect(episodes).toHaveLength(1);
    // Each 30-second report adds 90 and drains 66: 720 over after thirty of them.
    expect(episodes[0]).toBe(900);
  });

  it("does not count a backlog delivered after an outage against the outage's own time", () => {
    // Honest play at 1.6/s, ten minutes unable to report, then the whole backlog at once.
    let { row } = run(1.6, 600);
    const watch = killRateWatch(row, at(1_200), 1.6 * 600, 600);
    expect(watch.episodeStarted).toBe(false);
    row = { tokens: watch.tokens, updatedAtMicros: at(1_200) };
    expect(run(1.6, 3600, 30, row, 1_200).episodes).toEqual([]);
    // The same backlog as ten batches sealed together, arriving a tenth of a
    // second apart, each carrying its share of the outage's game time.
    let batched = run(1.6, 600).row;
    const first = killRateWatch(batched, at(1_200), 96, 60);
    batched = { tokens: first.tokens, updatedAtMicros: at(1_200) };
    for (let i = 1; i < 10; i++) {
      const next = killRateWatch(batched, at(1_200 + i / 10), 96, 60);
      expect(next.episodeStarted).toBe(false);
      batched = { tokens: next.tokens, updatedAtMicros: at(1_200 + i / 10) };
    }
    expect(batched.tokens).toBe(0);
  });

  it("ends an episode once the rate falls back, so a relapse is written down again", () => {
    const first = run(3, 1800);
    expect(first.episodes).toHaveLength(1);
    expect(first.row.tokens).toBeLessThan(0);
    const calm = run(1, 1800, 30, first.row, 1800);
    expect(calm.episodes).toEqual([]);
    expect(calm.row.tokens).toBeGreaterThanOrEqual(0);
    expect(run(3, 1800, 30, calm.row, 3600).episodes).toHaveLength(1);
  });

  it("does not start another episode while one is under way, even in bursts", () => {
    const { row } = run(3, 1200);
    const burst = killRateWatch(row, at(1_230), 500);
    expect(burst.episodeStarted).toBe(false);
    expect(burst.tokens).toBeLessThan(0);
  });
});

it("writes down a client that claims no game time as soon as its paid kills pass the line", () => {
  // Reports claiming nothing, a second apart: only the real second drains them.
  let row: { tokens: number; updatedAtMicros: bigint } | null = null, flaggedAt = 0;
  for (let t = 1; t <= 120 && !flaggedAt; t++) {
    const watch = killRateWatch(row, at(t), 30, 0);
    if (watch.episodeStarted) flaggedAt = t;
    row = { tokens: watch.tokens, updatedAtMicros: at(t) };
  }
  expect(flaggedAt).toBeGreaterThan(0);
  expect(flaggedAt).toBeLessThan(60);
});
