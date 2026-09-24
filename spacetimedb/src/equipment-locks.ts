import { canonicalItemId } from "../../shared/items";
import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";
export const playerEquipmentLock = table({ name: "player_equipment_lock", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), itemId: t.string(), copyId: t.u64().default(0n),
});
export const equipmentLockKey = (identity: Identity, itemId: string, copyId = 0n) => `${identity.toHexString()}:${itemId}${copyId ? `:${copyId}` : ""}`;
export function equipmentLocked(ctx: Pick<ModuleReducerCtx, "db">, identity: Identity, itemId: string, copyId = 0n) {
  return Boolean(itemId && ctx.db.playerEquipmentLock.key.find(equipmentLockKey(identity, itemId, copyId)));
}
export function mergeEquipmentLocks(ctx: Pick<ModuleReducerCtx, "db">, guest: Identity, account: Identity) {
  removeEquipmentLocks(ctx, account);
  for (const row of [...ctx.db.playerEquipmentLock.identity.filter(guest)]) {
    const key = equipmentLockKey(account, row.itemId, row.copyId);
    if (!ctx.db.playerEquipmentLock.key.find(key)) ctx.db.playerEquipmentLock.insert({ ...row, key, identity: account });
    ctx.db.playerEquipmentLock.key.delete(row.key);
  }
}
export function removeEquipmentLocks(ctx: Pick<ModuleReducerCtx, "db">, identity: Identity) {
  for (const row of [...ctx.db.playerEquipmentLock.identity.filter(identity)]) ctx.db.playerEquipmentLock.key.delete(row.key);
}

/** Locks travel with the physical copy when its backing row changes. */
export function moveEquipmentLock(ctx: Pick<ModuleReducerCtx, "db">, identity: Identity, itemId: string, from: bigint, to: bigint) {
  const row = ctx.db.playerEquipmentLock.key.find(equipmentLockKey(identity, itemId, from));
  if (!row) return;
  ctx.db.playerEquipmentLock.key.delete(row.key);
  ctx.db.playerEquipmentLock.insert({ ...row, key: equipmentLockKey(identity, itemId, to), copyId: to });
}

export function setEquipmentLock(ctx: ModuleReducerCtx, args: { itemId: string; copyId: bigint; locked: boolean }, inventoryForProgress: (progress: any) => string[]) {
  const itemId = canonicalItemId(args.itemId);
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!itemId || !progress || !inventoryForProgress(progress).includes(itemId)) throw new SenderError("Item not owned.");
  const copyId = args.copyId;
  if (copyId !== 0n) {
    const copy = ctx.db.playerEquipmentCopy.id.find(copyId);
    if (!copy || copy.itemId !== itemId || copy.identity.toHexString() !== ctx.sender.toHexString()) throw new SenderError("Item not owned.");
  }
  const key = equipmentLockKey(ctx.sender, itemId, copyId);
  if (args.locked) {
    if (!ctx.db.playerEquipmentLock.key.find(key)) ctx.db.playerEquipmentLock.insert({ key, identity: ctx.sender, itemId, copyId });
  } else ctx.db.playerEquipmentLock.key.delete(key);
}

export function assertEquipmentUnlocked(ctx: ModuleReducerCtx, base: any, progress: any) {
  for (const field of ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const) {
    if (base[field] !== progress[field] && equipmentLocked(ctx, ctx.sender, base[field])) throw new SenderError("Unlock equipped gear before replacing it.");
  }
}
