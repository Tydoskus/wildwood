import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTER_BOW } from "../../shared/items";
import { compactNumberChanged, formatCompactNumber } from "../../shared/compact-number";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

/** A forest farmer, as in prestige.test.ts: Spitters pay damage. */
function farmer() {
  const f = crystalFixture();
  f.patch("player", { mapId: "tutorial_forest" });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  return f;
}
const report = (f: ReturnType<typeof crystalFixture>, sequence: bigint, count: number) =>
  f.run(server.recordEnemyDefeats, { streamId: "power-broadcast-stream", sequence, mapId: "tutorial_forest", enemies: [{ enemy: "Spitter", count }] });

it("tells a visible change from one under the last displayed digit", () => {
  expect(compactNumberChanged(515_000_000, 515_400_000)).toBe(false); // both "515m"
  expect(compactNumberChanged(515_000_000, 516_000_000)).toBe(true);
  expect(compactNumberChanged(841, 842)).toBe(true);                   // under 1,000 every unit shows
  expect(formatCompactNumber(515_400_000)).toBe("515m");
});

it("leaves the public player row alone when the plate would read the same", () => {
  // The player row and the motion identity it syncs are broadcast to everyone
  // on the map. At a large power one kill moves the stats but not the three
  // digits the plate shows, so neither row may be written.
  const f = farmer();
  f.patch("playerProgress", { damage: 1e12, maxHp: 1e12 });
  report(f, 1n, 10);                       // lands the exact figure once
  const synced = f.db.player.identity.find(f.ctx.sender)!;
  const damageBefore = f.db.playerProgress.identity.find(f.ctx.sender)!.damage;
  report(f, 2n, 1);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)!.damage).toBeGreaterThan(damageBefore);
  expect(f.db.player.identity.find(f.ctx.sender)!.powerLevel).toBe(synced.powerLevel);
});

it("still writes the row, exactly, once the plate would change", () => {
  const f = farmer();
  // Seed a stale figure far from the real one so the plate must change.
  f.patch("player", { powerLevel: 1, power: 1 });
  report(f, 1n, 10);
  const after = f.db.player.identity.find(f.ctx.sender);
  expect(after?.powerLevel).toBeGreaterThan(1);
  expect(formatCompactNumber(after!.powerLevel)).not.toBe("1");
});
