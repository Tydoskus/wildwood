import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { createEmptyResearchRanks } from "../../shared/research";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const later = (f: any, micros: bigint) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + micros); };

it("pauses research with its time left, frees the slot, and resumes from there", () => {
  const f = crystalFixture();
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks() });
  f.run(server.startResearch, { researchId: "foraging" });
  const started = f.db.activeResearch.identity.find(f.ctx.sender);
  const duration = BigInt(started.completesAt.microsSinceUnixEpoch) - BigInt(started.startedAt.microsSinceUnixEpoch);
  later(f, 5_000_000n);
  f.run(server.pauseResearch);
  expect(f.db.activeResearch.identity.find(f.ctx.sender)).toBeFalsy();
  expect([...f.db.researchCompletionSchedule.iter()]).toHaveLength(0);
  const paused = f.db.pausedResearch.key.find(`${f.ctx.sender.toHexString()}:foraging`);
  expect(paused).toMatchObject({ researchId: "foraging", targetRank: 1, remainingMicros: duration - 5_000_000n });

  // The slot is free for something else while foraging waits.
  f.run(server.startResearch, { researchId: "researchSpeed" });
  f.run(server.pauseResearch);
  later(f, 3_600_000_000n);

  f.run(server.startResearch, { researchId: "foraging" });
  const resumed = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(BigInt(resumed.completesAt.microsSinceUnixEpoch) - BigInt(f.ctx.timestamp.microsSinceUnixEpoch)).toBe(duration - 5_000_000n);
  expect(BigInt(resumed.completesAt.microsSinceUnixEpoch) - BigInt(resumed.startedAt.microsSinceUnixEpoch)).toBe(duration);
  expect(f.db.pausedResearch.key.find(`${f.ctx.sender.toHexString()}:foraging`)).toBeFalsy();
  expect(f.db.pausedResearch.key.find(`${f.ctx.sender.toHexString()}:researchSpeed`)).toBeTruthy();

  // Maintenance leaves the resumed timer alone, and it completes on time.
  f.run(server.runMaintenanceSweep);
  expect(f.db.activeResearch.identity.find(f.ctx.sender).completesAt.microsSinceUnixEpoch).toBe(resumed.completesAt.microsSinceUnixEpoch);
  const scheduled = [...f.db.researchCompletionSchedule.iter()][0];
  f.ctx.timestamp = resumed.completesAt;
  f.run(server.completeResearch, { schedule: scheduled });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).foraging).toBe(1);
});

it("refuses to pause with nothing running", () => {
  const f = crystalFixture();
  expect(() => f.run(server.pauseResearch)).toThrow("No research is active.");
});
