import { expect, it, vi } from "vitest";
import { Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { finishAnalyticsSession, readAnalyticsDashboard, recordAnalyticsMilestone, recordAnalyticsSessionStart } from "./analytics";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("rolls up active players, sessions, retention, and milestones by UTC day", () => {
  const f = crystalFixture();
  f.ctx.timestamp = new Timestamp(0n);
  f.run(server.registerClientVersion, { clientVersion: "0.755" });
  recordAnalyticsSessionStart(f.ctx, "tutorial_forest");
  const session = f.db.playerSession.connectionId.find(f.ctx.connectionId)!;
  f.db.playerSession.connectionId.update({ ...session, analyticsStartedAtMicros: 2_000_000n });
  recordAnalyticsMilestone(f.ctx, "kill");
  f.ctx.timestamp = new Timestamp(5_000_000n);
  finishAnalyticsSession(f.ctx, f.db.playerSession.connectionId.find(f.ctx.connectionId), "tutorial_forest");

  f.ctx.timestamp = new Timestamp(86_400_000_000n);
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), enteredWorld: true, analyticsStartedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
  recordAnalyticsSessionStart(f.ctx, "crystal_hollows");
  recordAnalyticsMilestone(f.ctx, "boss");
  const result = JSON.parse(readAnalyticsDashboard(f.ctx, "0", "1"));

  expect(result.days).toMatchObject([
    { dayKey: "0", dau: 1, newPlayers: 1, returningPlayers: 0, sessions: 1 },
    { dayKey: "1", dau: 1, newPlayers: 0, returningPlayers: 1, sessions: 1 },
  ]);
  expect(result.days[0].averageSessionSeconds).toBe(3);
  expect(result.retention[0]).toMatchObject({ cohortDayKey: "0", size: 1, d1: 1, d1Rate: 100 });
  expect(result.milestones.firstKill["0"]).toBe(1);
  expect(result.milestones.firstBoss["1"]).toBe(1);
  expect(result.activity).toEqual(expect.arrayContaining([
    expect.objectContaining({ mapId: "tutorial_forest", releaseVersion: "0.755", players: 1 }),
    expect.objectContaining({ mapId: "crystal_hollows", releaseVersion: "0.755", players: 1 }),
  ]));
});
