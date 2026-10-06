import { afterEach, beforeEach, expect, it, vi } from "vitest";

const clock = vi.hoisted(() => ({ now: 10_000 }));
vi.mock("../../app/trusted-clock", async importOriginal => ({
  ...(await importOriginal<typeof import("../../app/trusted-clock")>()),
  monotonicNowMs: () => clock.now,
  wallClockNowMs: () => 1.7e12 + clock.now,
}));
import { createPresenceHarness } from "../../../tests/helpers/presence-harness";

beforeEach(() => {
  clock.now = 10_000;
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Two minutes of play: one other player beside us, the server's map frame every second. */
async function twoMinutes(harness: ReturnType<typeof createPresenceHarness>, detail: boolean) {
  await harness.arrive("other", 7);
  for (let second = 0; second < 120; second++) await harness.second([{ networkId: 7, x: 2_050, y: 2_000 }], detail ? [7] : []);
}

it("asks for others' movement once, and resubscribes nothing, while the server sends it", async () => {
  const harness = createPresenceHarness(clock);
  await harness.enter();
  await twoMinutes(harness, true);
  expect(harness.counts.subscribe).toMatchObject({ mapPlayers: 1, markers: 1 });
  expect(harness.counts.interest.filter(ids => ids.length)).toEqual([[7]]);
});

it("waits, rather than resubscribing every 1.5 seconds, while the server hides us and so sends no movement", async () => {
  const harness = createPresenceHarness(clock);
  await harness.enter(false);
  await twoMinutes(harness, false);
  expect(harness.counts.subscribe.markers).toBe(1);
});

it("waits while another tab has the account, or the tab waits for a deploy", async () => {
  for (const flag of ["worldEntryBlocked", "protocolBlocked", "sessionConflict"] as const) {
    const harness = createPresenceHarness(clock);
    await harness.enter();
    harness.flags[flag] = true;
    await twoMinutes(harness, false);
    expect(harness.counts.subscribe.markers, flag).toBe(1);
  }
});

it("asks again for movement that never comes later and later, not every 1.5 seconds", async () => {
  const harness = createPresenceHarness(clock);
  await harness.enter();
  await twoMinutes(harness, false);
  // 1.5, 3, 6, 12, 24, then every 30 s: a handful in two minutes where the flat 1.5 s made about 80.
  expect(harness.counts.subscribe.markers).toBeGreaterThan(2);
  expect(harness.counts.subscribe.markers).toBeLessThanOrEqual(9);
});

it("goes back to asking promptly once movement arrives again", async () => {
  const harness = createPresenceHarness(clock);
  await harness.enter();
  await twoMinutes(harness, false);
  for (let second = 0; second < 5; second++) await harness.second([{ networkId: 7, x: 2_050, y: 2_000 }], [7]);
  const before = harness.counts.subscribe.markers;
  await harness.arrive("third", 9);
  for (let second = 0; second < 4; second++) await harness.second([{ networkId: 7, x: 2_050, y: 2_000 }, { networkId: 9, x: 2_060, y: 2_000 }], [7]);
  expect(harness.counts.subscribe.markers - before).toBeGreaterThanOrEqual(1);
});

it("retries a failing map subscription later and later, not every second", async () => {
  const harness = createPresenceHarness(clock);
  harness.failSubscriptions(kind => kind === "mapPlayers");
  await harness.enter();
  for (let second = 0; second < 120; second++) await harness.second([]);
  // 1, 2, 4, 8, 16, then every 30 s.
  expect(harness.counts.subscribe.mapPlayers).toBeGreaterThan(3);
  expect(harness.counts.subscribe.mapPlayers).toBeLessThanOrEqual(10);
});
