import { expect, it, vi } from "vitest";
import { createEquipmentCopies } from "./equipment-copies";

const at = (ms: number) => ({ microsSinceUnixEpoch: BigInt(ms) * 1000n });

function fakeConnection() {
  const handlers: Array<() => void> = [];
  const applied: Array<() => void> = [];
  const copies: unknown[] = [];
  const offers: unknown[] = [];
  const ignored: unknown[] = [];
  const lootSettings: unknown[] = [];
  const view = (rows: unknown[]) => ({
    iter: () => rows[Symbol.iterator](),
    onInsert: (handler: () => void) => handlers.push(handler),
    onUpdate: (handler: () => void) => handlers.push(handler),
    onDelete: (handler: () => void) => handlers.push(handler),
  });
  const reducers = {
    resolveEquipmentOffer: vi.fn(async () => {}),
    destroyEquipmentCopy: vi.fn(async () => {}),
    selectEquipmentCopy: vi.fn(async () => { throw new Error("That copy is not in your inventory."); }),
    setIgnoredDrops: vi.fn(async () => {}),
    setLootSettings: vi.fn(async () => {}),
  };
  const connection = {
    isActive: true,
    db: { myEquipmentLocks: view([]), myEquipmentCopies: view(copies), myEquipmentOffers: view(offers), myIgnoredDrops: view(ignored), myLootSettings: view(lootSettings) },
    reducers,
    subscriptionBuilder: () => ({ onApplied(callback: () => void) { applied.push(callback); return this; }, subscribe: vi.fn() }),
  };
  return {
    connection: connection as never, copies, offers, ignored, lootSettings, reducers,
    settle: () => applied.forEach(callback => callback()), fire: () => handlers.forEach(handler => handler()),
  };
}

it("serves kept copies and waiting offers oldest first, with their rolls and times", () => {
  const notify = vi.fn();
  const service = createEquipmentCopies(notify);
  const conn = fakeConnection();
  service.watch(conn.connection, () => true);
  conn.copies.push({ id: 7n, itemId: "iron_bow", arrowStorm: 0, ricochet: 3, piercingShot: 0 },
    { id: 2n, itemId: "samurai_hat", arrowStorm: 0, ricochet: 0, piercingShot: 0 });
  conn.offers.push({ id: 4n, itemId: "iron_bow", arrowStorm: 1.2, ricochet: 0, piercingShot: 0, createdAt: at(1_000), expiresAt: at(301_000) });
  expect(service.api.equipmentCopies()).toEqual([]);
  conn.settle();
  expect(service.api.equipmentCopies().map(copy => copy.id)).toEqual([2n, 7n]);
  expect(service.api.equipmentCopies()[1].roll).toEqual({ arrowStorm: 0, ricochet: 3, piercingShot: 0 });
  expect(service.api.equipmentOffers()).toEqual([{ id: 4n, itemId: "iron_bow",
    roll: { arrowStorm: 1.2, ricochet: 0, piercingShot: 0 }, createdAtMs: 1_000, expiresAtMs: 301_000 }]);
  conn.offers.length = 0;
  conn.fire();
  expect(service.api.equipmentOffers()).toEqual([]);
  expect(notify).toHaveBeenCalled();
});

it("sends answers to the server and reports its refusals", async () => {
  const service = createEquipmentCopies(() => {});
  expect(await service.api.resolveEquipmentOffer(1n, true)).toEqual({ ok: false, error: "NOT CONNECTED" });
  const conn = fakeConnection();
  service.watch(conn.connection, () => true);
  expect(await service.api.resolveEquipmentOffer(4n, false)).toEqual({ ok: true });
  expect(conn.reducers.resolveEquipmentOffer).toHaveBeenCalledWith({ id: 4n, keep: false });
  expect(await service.api.destroyEquipmentCopy("iron_bow", 0n)).toEqual({ ok: true });
  expect(conn.reducers.destroyEquipmentCopy).toHaveBeenCalledWith({ itemId: "iron_bow", copyId: 0n });
  expect(await service.api.selectEquipmentCopy(9n)).toEqual({ ok: false, error: "That copy is not in your inventory." });
});

it("forgets a replaced connection's rows", () => {
  const service = createEquipmentCopies(() => {});
  let current = true;
  const first = fakeConnection();
  first.copies.push({ id: 1n, itemId: "iron_bow", arrowStorm: 0, ricochet: 0, piercingShot: 0 });
  service.watch(first.connection, () => current);
  first.settle();
  current = false;
  service.watch(fakeConnection().connection, () => true);
  first.fire();
  expect(service.api.equipmentCopies()).toEqual([]);
});

it("serves the items marked ignored and sends changes to the server", async () => {
  const service = createEquipmentCopies(() => {});
  expect(await service.api.setIgnoredDrops(["iron_bow"], true)).toEqual({ ok: false, error: "NOT CONNECTED" });
  const conn = fakeConnection();
  service.watch(conn.connection, () => true);
  conn.ignored.push({ key: "a:iron_bow", itemId: "iron_bow" }, { key: "a:samurai_hat", itemId: "samurai_hat" });
  expect([...service.api.ignoredDrops()]).toEqual([]);
  conn.settle();
  expect([...service.api.ignoredDrops()].sort()).toEqual(["iron_bow", "samurai_hat"]);
  conn.ignored.splice(0, 1);
  conn.fire();
  expect([...service.api.ignoredDrops()]).toEqual(["samurai_hat"]);
  expect(await service.api.setIgnoredDrops(["iron_bow", "samurai_hat"], false)).toEqual({ ok: true });
  expect(conn.reducers.setIgnoredDrops).toHaveBeenCalledWith({ itemIds: ["iron_bow", "samurai_hat"], ignored: false });
  conn.reducers.setIgnoredDrops.mockRejectedValueOnce(new Error("That item cannot be ignored."));
  expect(await service.api.setIgnoredDrops(["stone"], true)).toEqual({ ok: false, error: "That item cannot be ignored." });
});

it("serves the loot settings, both on without a row, and sends changes to the server", async () => {
  const service = createEquipmentCopies(() => {});
  expect(service.api.lootSettings()).toEqual({ autoKeepBest: true, autoEquipBest: true });
  expect(await service.api.setLootSettings({ autoKeepBest: false, autoEquipBest: true })).toEqual({ ok: false, error: "NOT CONNECTED" });
  const conn = fakeConnection();
  service.watch(conn.connection, () => true);
  conn.settle();
  expect(service.api.lootSettings()).toEqual({ autoKeepBest: true, autoEquipBest: true });
  conn.lootSettings.push({ autoKeepBest: false, autoEquipBest: true });
  conn.fire();
  expect(service.api.lootSettings()).toEqual({ autoKeepBest: false, autoEquipBest: true });
  expect(await service.api.setLootSettings({ autoKeepBest: true, autoEquipBest: false })).toEqual({ ok: true });
  expect(conn.reducers.setLootSettings).toHaveBeenCalledWith({ autoKeepBest: true, autoEquipBest: false });
  conn.reducers.setLootSettings.mockRejectedValueOnce(new Error("Choose on or off."));
  expect(await service.api.setLootSettings({ autoKeepBest: true, autoEquipBest: true })).toEqual({ ok: false, error: "Choose on or off." });
});

it("remembers for a moment which items this tab changed the copies of", async () => {
  let now = 1_000;
  const service = createEquipmentCopies(() => {}, () => now);
  const conn = fakeConnection();
  service.watch(conn.connection, () => true);
  conn.copies.push({ id: 7n, itemId: "iron_bow", arrowStorm: 0, ricochet: 3, piercingShot: 0 });
  conn.offers.push({ id: 4n, itemId: "crystal_bow", arrowStorm: 1, ricochet: 0, piercingShot: 0, createdAt: at(0), expiresAt: at(300_000) });
  conn.settle();
  expect(service.changedLocally("iron_bow")).toBe(false);
  await service.api.selectEquipmentCopy(7n);
  await service.api.resolveEquipmentOffer(4n, true);
  expect(service.changedLocally("iron_bow")).toBe(true);
  expect(service.changedLocally("crystal_bow")).toBe(true);
  now += 10_000;
  expect(service.changedLocally("iron_bow")).toBe(false);
});
