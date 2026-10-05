import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ensureRepeatingSchedule, requireScheduler } from "./presence-runtime";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("lets only the scheduler run a scheduled reducer: a client calling it by name is refused", () => {
  const f = crystalFixture();
  const database = identity("9");
  Object.assign(f.ctx, { databaseIdentity: database });
  expect(() => f.run(server.publishMapFrames, { schedule: { scheduledId: 1n, scheduledAt: { tag: "Time", value: f.ctx.timestamp } } })).toThrow("Scheduler required");
  expect(() => requireScheduler({ sender: database, databaseIdentity: database })).not.toThrow();
  expect(f.db.mapFrameSchedule.count()).toBe(0n);
});

it("arms a missing repeating schedule once, and leaves a present one alone", () => {
  const f = crystalFixture();
  ensureRepeatingSchedule(f.db.startupTelemetryCleanupSchedule, 1_000n);
  ensureRepeatingSchedule(f.db.startupTelemetryCleanupSchedule, 1_000n);
  expect(f.db.startupTelemetryCleanupSchedule.count()).toBe(1n);
});

it("tells anyone a player is online, but where only while they show themselves", () => {
  const f = crystalFixture();
  const presence = () => JSON.parse((server.getPlayerPresence as any)({ withTx: (run: (ctx: unknown) => unknown) => f.transaction(() => run(f.ctx)) }, { identity: f.ctx.sender }));
  f.patch("player", { isVisible: true });
  expect(presence()).toMatchObject({ online: true, mapId: "crystal_hollows" });
  f.patch("player", { isVisible: false });
  expect(presence()).toMatchObject({ online: true, mapId: "" });
});
