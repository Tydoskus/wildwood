import { expect, it, vi } from "vitest";
import { ScheduleAt } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ensureMapFrameSchedule, ensureMotionDetailFrameSchedule } from "./presence-runtime";
import { decodePlayerMotionFrame } from "../../shared/player-motion-frame";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("reads shared motion targets and missing IDs once per publication, then refreshes the next frame", () => {
  const f = crystalFixture();
  for (let i = 1; i <= 4; i++) {
    f.seed("playerMotion", { identity: identity(String(i)), networkId: i, mapId: "water_reach", isVisible: true, x: 100 * i, y: 100 });
    if (i < 4) f.seed("playerMotionInterest", { identity: identity(String(i)), networkIds: [4, 99] });
  }
  const reads = vi.spyOn(f.db.playerMotion.networkId, "find");
  f.run(server.publishMotionDetailFrames);
  expect(reads.mock.calls.map(([id]) => id)).toEqual([4, 99]);
  for (const frame of f.db.playerMotionDetailFrame.iter()) {
    expect(decodePlayerMotionFrame(frame.payload, frame.playerCount)).toMatchObject([{ networkId: 4, x: 400 }]);
  }
  const target = [...f.db.playerMotion.iter()].find(row => row.networkId === 4)!;
  f.db.playerMotion.networkId.update({ ...target, isVisible: false });
  reads.mockClear();
  const before = f.db.playerMotionDetailFrame.count();
  f.run(server.publishMotionDetailFrames);
  expect(reads.mock.calls.map(([id]) => id)).toEqual([4, 99]);
  expect(f.db.playerMotionDetailFrame.count()).toBe(before);
});

it("stops a stale publisher without scanning or broadcasting private homes", () => {
  const f = crystalFixture();
  f.seed("playerMotionMapState", { mapId: "home_exterior", playerCount: 9, visibleCount: 0 });
  const scan = vi.spyOn(f.db.playerMotion, "iter");
  f.run(server.publishMapFrames);
  expect([...f.db.playerMapFrame.iter()]).toHaveLength(0);
  expect([...f.db.mapFrameSchedule.iter()]).toHaveLength(0);
  expect(scan).not.toHaveBeenCalled();
});

it("keeps sampling only when at least two players have multiplayer enabled", () => {
  const f = crystalFixture();
  f.seed("playerMotionMapState", { mapId: "home_exterior", playerCount: 20, visibleCount: 0 });
  f.seed("playerMotionMapState", { mapId: "water_reach", playerCount: 3, visibleCount: 2 });
  f.seed("playerMotion", { networkId: 1, identity: f.ctx.sender, mapId: "water_reach", isVisible: true, x: 100, y: 100 });
  f.seed("playerMotion", { networkId: 2, identity: identity("2"), mapId: "water_reach", isVisible: true, x: 200, y: 100 });
  const scan = vi.spyOn(f.db.playerMotion, "iter");
  f.run(server.publishMapFrames);
  expect([...f.db.playerMapFrame.iter()].map((row: any) => [row.mapId, row.playerCount])).toEqual([["water_reach", 2]]);
  expect([...f.db.mapFrameSchedule.iter()]).toHaveLength(1);
  expect(scan).toHaveBeenCalledTimes(1);
});

it.each([0, 1])("publishes a final clearing frame before stopping at visible count %i, even with hidden players present", visibleCount => {
  const f = crystalFixture();
  f.seed("playerMotionMapState", { mapId: "water_reach", playerCount: 20, visibleCount });
  if (visibleCount) f.seed("playerMotion", { networkId: 1, identity: f.ctx.sender, mapId: "water_reach", isVisible: true });
  f.run(server.publishMapFrames);
  expect([...f.db.playerMapFrame.iter()].map((row: any) => row.playerCount)).toEqual([visibleCount]);
  expect([...f.db.mapFrameSchedule.iter()]).toHaveLength(0);
});

it.each([["mapFrameSchedule", ensureMapFrameSchedule], ["motionDetailFrameSchedule", ensureMotionDetailFrameSchedule]] as const)(
  "replaces a %s row a publish left long past due, so the loop cannot stay dead", (table, ensure) => {
    // Production, 2026-09-29: the minimap loop's row sat 52 minutes past due
    // after a publish, and every ensure saw a row and armed nothing.
    const f = crystalFixture();
    const now = f.ctx.timestamp.microsSinceUnixEpoch;
    f.seed("playerMotionMapState", { mapId: "water_reach", playerCount: 2, visibleCount: 2 });
    f.seed("playerMotionInterest", { identity: f.ctx.sender, networkIds: [2] });
    f.seed(table, { scheduledId: 7n, scheduledAt: ScheduleAt.time(now - 3_122_000_000n) });
    f.run(ctx => ensure(ctx));
    const rows = [...(f.db as any)[table].iter()];
    expect(rows).toHaveLength(1);
    expect(rows[0].scheduledId).not.toBe(7n);
    expect(rows[0].scheduledAt.value.microsSinceUnixEpoch > now).toBe(true);
    // A healthy row, due a moment from now, is left as it is.
    f.run(ctx => ensure(ctx));
    expect([...(f.db as any)[table].iter()].map((row: any) => row.scheduledId)).toEqual([rows[0].scheduledId]);
  });
