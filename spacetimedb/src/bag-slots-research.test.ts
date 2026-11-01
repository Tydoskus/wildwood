import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { createEmptyResearchRanks } from "../../shared/research";
import { BASE_INVENTORY_SLOT_CAPACITY } from "../../shared/gems";
import { bagCapacityFor } from "./bag-capacity";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const research = (f: any, ranks: Record<string, number>) =>
  f.seed("playerResearch", { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), ...ranks });
const span = (active: any) => active.completesAt.microsSinceUnixEpoch - active.startedAt.microsSinceUnixEpoch;

it("adds a bag slot for each Bag Slots rank, on top of every slot bought", () => {
  const f = crystalFixture();
  expect(bagCapacityFor(f.ctx, f.ctx.sender)).toBe(BASE_INVENTORY_SLOT_CAPACITY);
  f.seed("playerInventoryCapacity", { identity: f.ctx.sender, slotsUnlocked: 44, updatedAt: f.ctx.timestamp });
  research(f, { inventorySlots: 3 });
  expect(bagCapacityFor(f.ctx, f.ctx.sender)).toBe(BASE_INVENTORY_SLOT_CAPACITY + 44 + 3);
});

it("researches Bag Slots behind Crit Cap, each level taking 40% longer", () => {
  const f = crystalFixture();
  f.standAtResearch();
  research(f, { utilityAttackRange: 1, critCap: 1 });
  f.run(server.startResearch, { researchId: "inventorySlots" });
  const first = f.db.activeResearch.identity.find(f.ctx.sender);
  expect(span(first)).toBe(180_000_000n);
  f.ctx.timestamp = first.completesAt;
  f.run(server.completeResearch, { schedule: [...f.db.researchCompletionSchedule.iter()][0] });
  expect(f.db.playerResearch.identity.find(f.ctx.sender).inventorySlots).toBe(1);
  f.run(server.startResearch, { researchId: "inventorySlots" });
  expect(span(f.db.activeResearch.identity.find(f.ctx.sender))).toBe(252_000_000n);
});

it("opens Bag Slots from Enemy Respawn's second band as well", () => {
  const f = crystalFixture();
  f.standAtResearch();
  research(f, { utilityAttackRange: 1, enemyRespawn: 6 });
  expect(() => f.run(server.startResearch, { researchId: "inventorySlots" })).not.toThrow();
});

it("refuses Bag Slots before Crit Cap or Enemy Respawn's second band", () => {
  const f = crystalFixture();
  f.standAtResearch();
  research(f, { utilityAttackRange: 1, enemyRespawn: 5 });
  expect(() => f.run(server.startResearch, { researchId: "inventorySlots" })).toThrow("Research prerequisites not met.");
});
