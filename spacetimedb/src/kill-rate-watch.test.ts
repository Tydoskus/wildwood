import { describe, expect, it, vi } from "vitest";
import { killRateWatch, killRateWatchFlagged, killRateWatchLine, KILL_RATE_WATCH_PER_SECOND } from "./enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const at = (seconds: number) => BigInt(Math.round(seconds * 1e6));

/** Reports every `every` seconds paying `rate` kills a second; returns when each episode began. */
function run(rate: number, seconds: number, every = 30, start: { tokens: number; updatedAtMicros: bigint } | null = null, from = 0, line = KILL_RATE_WATCH_PER_SECOND) {
  let row = start;
  const episodes: number[] = [];
  for (let t = from + every; t <= from + seconds; t += every) {
    const watch = killRateWatch(row, at(t), rate * every, every, line);
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
    // Nothing over the line, and the outage's unused time is still credit.
    expect(batched.tokens).toBeLessThanOrEqual(0);
  });

  it("ends an episode once the rate falls back, so a relapse is written down again", () => {
    const first = run(3, 1800);
    expect(first.episodes).toHaveLength(1);
    expect(killRateWatchFlagged(first.row.tokens)).toBe(true);
    const calm = run(1, 1800, 30, first.row, 1800);
    expect(calm.episodes).toEqual([]);
    expect(killRateWatchFlagged(calm.row.tokens)).toBe(false);
    expect(run(3, 1800, 30, calm.row, 3600).episodes).toHaveLength(1);
  });

  it("does not start another episode while one is under way, even in bursts", () => {
    const { row } = run(3, 1200);
    const burst = killRateWatch(row, at(1_230), 500);
    expect(burst.episodeStarted).toBe(false);
    expect(killRateWatchFlagged(burst.tokens)).toBe(true);
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

describe("kill-rate watch line", () => {
  it("follows the map's respawn, and never drops below 2.2/s", () => {
    expect(killRateWatchLine("crystal_hollows", 10)).toBe(KILL_RATE_WATCH_PER_SECOND);
    expect(killRateWatchLine("crystal_hollows", 7.5)).toBeCloseTo(2.2, 9);
    expect(killRateWatchLine("endless_4", 10)).toBe(KILL_RATE_WATCH_PER_SECOND);
    expect(killRateWatchLine("endless_4", 7.5)).toBeCloseTo(20 / 7.5, 9);
    // A balance change to a 5 s respawn moves the line with it.
    expect(killRateWatchLine("endless_4", 5)).toBeCloseTo(4, 9);
  });

  it("leaves the best honest Endless shuttle alone: damage camp and its nearest six, 19 sites at 7.5 s", () => {
    const line = killRateWatchLine("endless_203", 7.5);
    for (const rate of [2.3, 2.5, 19 / 7.5]) expect(run(rate, 4 * 3600, 30, null, 0, line).episodes).toEqual([]);
  });

  it("leaves auto-farm alone when a balance change shortens the Endless respawn to 5 s", () => {
    expect(run(13 / 5.47, 4 * 3600, 30, null, 0, killRateWatchLine("endless_4", 5)).episodes).toEqual([]);
  });

  it("still writes down a client paid the researched Endless wall within ten minutes", () => {
    const { episodes } = run(31 / 7.5, 3600, 30, null, 0, killRateWatchLine("endless_4", 7.5));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toBeLessThanOrEqual(600);
  });

  it("keeps a stall's time for the backlog sent behind it", () => {
    // Two kills a second, a twelve-minute stall with play going on, then the
    // backlog as a report carrying the stall and fourteen more a tenth of a
    // second apart that claim no game time of their own.
    let { row } = run(2, 1800);
    const first = killRateWatch(row, at(1800 + 720), 100, 0);
    row = { tokens: first.tokens, updatedAtMicros: at(1800 + 720) };
    for (let i = 1; i < 15; i++) {
      const next = killRateWatch(row, at(1800 + 720 + i / 10), 100, 0);
      expect(next.episodeStarted).toBe(false);
      row = { tokens: next.tokens, updatedAtMicros: at(1800 + 720 + i / 10) };
    }
    expect(run(2, 3600, 30, row, 2520).episodes).toEqual([]);
  });
});
