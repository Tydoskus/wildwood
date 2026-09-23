import { expect, it, vi } from "vitest";
import { ScheduleAt, Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { createEmptyResearchRanks, researchDurationMs, type ResearchId, type ResearchRanks } from "../../shared/research";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function startWithRanks(researchId: ResearchId, ranks: Partial<ResearchRanks> = {}) {
  const f = crystalFixture();
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), ...ranks });
  return () => f.run(server.startResearch, { researchId });
}

it("enforces Utility row unlocks in the research reducer", () => {
  expect(startWithRanks("slotUpgradeSpeed")).toThrow("Research prerequisites not met.");
  expect(startWithRanks("slotUpgradeSpeed", { researchSpeed: 1 })).not.toThrow();
  expect(startWithRanks("enemyRespawn", { researchSpeed: 1 })).not.toThrow();
  expect(startWithRanks("bossRespawn", { researchSpeed: 1 })).toThrow("Research prerequisites not met.");
  expect(startWithRanks("bossRespawn", { researchSpeed: 1, slotUpgradeSpeed: 1 })).not.toThrow();
  expect(startWithRanks("bossRespawn", { researchSpeed: 1, enemyRespawn: 1 })).not.toThrow();
  expect(startWithRanks("offlineWindow", { researchSpeed: 1, enemyRespawn: 1 })).toThrow("Research prerequisites not met.");
  expect(startWithRanks("offlineWindow", { bossRespawn: 1 })).not.toThrow();
  expect(startWithRanks("utilityMoveSpeed", { bossRespawn: 1 })).not.toThrow();
  expect(startWithRanks("utilityAttackRange", { bossRespawn: 1 })).toThrow("Research prerequisites not met.");
  expect(startWithRanks("utilityAttackRange", { offlineWindow: 1 })).not.toThrow();
  expect(startWithRanks("utilityAttackRange", { utilityMoveSpeed: 1 })).not.toThrow();
});

it("persists utility ranks and speeds up the next research timer", () => {
  const f = crystalFixture();
  f.run(server.startResearch, { researchId: "researchSpeed" });
  const first = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(first.completesAt.microsSinceUnixEpoch - first.startedAt.microsSinceUnixEpoch).toBe(45_000_000n);
  const scheduled = [...f.db.researchCompletionSchedule.iter()][0];
  f.ctx.timestamp = first.completesAt;
  f.run(server.completeResearch, { schedule: scheduled });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).researchSpeed).toBe(1);

  f.run(server.startResearch, { researchId: "foraging" });
  const next = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(next.completesAt.microsSinceUnixEpoch - next.startedAt.microsSinceUnixEpoch)
    .toBe(BigInt(researchDurationMs("foraging", 0, 1)) * 1_000n);
});

it("adds attack range when research completes and preserves it through a normal save", () => {
  const f = crystalFixture();
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0,
    ...createEmptyResearchRanks(), utilityMoveSpeed: 1 });
  f.run(server.startResearch, { researchId: "utilityAttackRange" });
  const active = f.db.activeResearch.identity.find(f.ctx.sender);
  const scheduled = [...f.db.researchCompletionSchedule.iter()][0];
  f.ctx.timestamp = active.completesAt;
  f.run(server.completeResearch, { schedule: scheduled });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).utilityAttackRange).toBe(1);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRange).toBe(210);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...progress, attackRange: 200 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRange).toBe(210);
});

it("shortens research already in progress when the speed rank rises", () => {
  const f = crystalFixture();
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks() });
  f.run(server.startResearch, { researchId: "foraging" });
  const before = f.db.activeResearch.identity.find(f.ctx.sender);
  f.patch("playerResearch", { researchSpeed: 1 });
  f.run(server.runMaintenanceSweep);
  const after = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(after.completesAt.microsSinceUnixEpoch).toBe(
    before.startedAt.microsSinceUnixEpoch + BigInt(researchDurationMs("foraging", 0, 1)) * 1_000n,
  );
  expect([...f.db.researchCompletionSchedule.iter()][0].completesAtMicros).toBe(after.completesAt.microsSinceUnixEpoch);
});

it("keeps existing Power research and its completion schedule through the new-tree migration", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 39 });
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), foraging: 2 });
  const completesAt = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 60_000_000n);
  f.seed("activeResearch", { identity: f.ctx.sender, researchId: "foraging", targetRank: 3,
    startedAt: f.ctx.timestamp, completesAt });
  const schedule = f.seed("researchCompletionSchedule", { scheduledId: 0n,
    scheduledAt: ScheduleAt.time(completesAt.microsSinceUnixEpoch), identity: f.ctx.sender,
    researchId: "foraging", targetRank: 3, completesAtMicros: completesAt.microsSinceUnixEpoch });
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  expect(f.db.activeResearch.identity.find(f.ctx.sender)).toMatchObject({ researchId: "foraging", targetRank: 3, completesAt });
  expect(f.db.researchCompletionSchedule.scheduledId.find(schedule.scheduledId)).toBeTruthy();
  expect(f.db.playerResearch.identity.find(f.ctx.sender)).toMatchObject({ foraging: 2, researchSpeed: 0 });
  f.ctx.timestamp = new Timestamp(completesAt.microsSinceUnixEpoch + 1n);
  f.run(server.completeResearch, { schedule: f.db.researchCompletionSchedule.scheduledId.find(schedule.scheduledId) });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).foraging).toBe(3);
  expect(f.db.activeResearch.identity.find(f.ctx.sender)).toBeNull();
});
