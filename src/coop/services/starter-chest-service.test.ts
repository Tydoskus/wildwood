import { expect, it, vi } from "vitest";
import { createStarterChestRows } from "./starter-chest-service";

function fakeConnection() {
  const handlers: Array<() => void> = [];
  const applied: Array<() => void> = [];
  const rows: any[] = [];
  const claimStarterWeapon = vi.fn(async (_args: { kind: string }) => undefined);
  const connection = {
    isActive: true,
    db: { myStarterWeapon: {
      iter: () => rows[Symbol.iterator](),
      onInsert: (handler: () => void) => handlers.push(handler),
      onUpdate: (handler: () => void) => handlers.push(handler),
      onDelete: (handler: () => void) => handlers.push(handler),
    } },
    reducers: { claimStarterWeapon },
    subscriptionBuilder: () => ({ onApplied(callback: () => void) { applied.push(callback); return this; }, onError() { return this; }, subscribe: vi.fn() }),
  };
  return { connection: connection as never, rows, claimStarterWeapon, settle: () => applied.forEach(callback => callback()), fire: () => handlers.forEach(handler => handler()) };
}

it("waits only once the row is read and missing, and stops when the chest is opened", async () => {
  const fake = fakeConnection(), notify = vi.fn(), service = createStarterChestRows(notify);
  service.watch(fake.connection, () => true);
  // Not read yet: a veteran's chest never flashes up.
  expect(service.api.starterChestWaiting()).toBe(false);
  fake.settle();
  expect(service.api.starterChestWaiting()).toBe(true);
  expect(await service.api.claimStarterWeapon("bow")).toEqual({ ok: true });
  expect(fake.claimStarterWeapon).toHaveBeenCalledWith({ kind: "bow" });
  fake.rows.push({ kind: "bow" });
  fake.fire();
  expect(service.api.starterChestWaiting()).toBe(false);
  expect(notify).toHaveBeenCalledTimes(2);
});

it("says why a pick failed", async () => {
  const fake = fakeConnection(), service = createStarterChestRows(vi.fn());
  fake.claimStarterWeapon.mockRejectedValueOnce(new Error("Walk up to the Starter Chest first."));
  expect(await service.api.claimStarterWeapon("sword")).toEqual({ ok: false, error: "Not Connected" });
  service.watch(fake.connection, () => true);
  expect(await service.api.claimStarterWeapon("sword")).toEqual({ ok: false, error: "Walk up to the Starter Chest first." });
});
