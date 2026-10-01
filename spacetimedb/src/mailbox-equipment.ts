import { table, t, SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { gearForHighestMap, GEAR_MAIL_ID, GEAR_MAIL_LEVEL } from "../../shared/mailbox-equipment";
import { readPlayerProgress } from "./wide-stats";

export const mailboxEquipment = table({ name: "mailbox_equipment", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), letterId: t.string(),
  itemIdsJson: t.string(), mapId: t.string(), upgradeLevel: t.u8(), createdAt: t.timestamp(),
});
export const equipmentMailKey = (id: string, identity: Identity) => `${id}:${identity.toHexString()}`;

/** Freeze recipients' own current map on delivery; retries never upgrade their gift's tier. */
export function deliverEquipmentMail(ctx: ModuleReducerCtx, recipients: Identity[]) {
  if (recipients.length > 100) throw new SenderError("Send at most 100 gifts at a time.");
  for (const identity of recipients) {
    const key = equipmentMailKey(GEAR_MAIL_ID, identity);
    if (ctx.db.mailboxEquipment.key.find(key)) continue;
    const progress = readPlayerProgress(ctx, identity);
    if (!progress || ctx.db.virtualPlayer.identity.find(identity)) continue;
    const gift = gearForHighestMap(progress);
    ctx.db.mailboxEquipment.insert({ key, identity, letterId: GEAR_MAIL_ID, itemIdsJson: JSON.stringify(gift.itemIds),
      mapId: gift.mapId, upgradeLevel: GEAR_MAIL_LEVEL, createdAt: ctx.timestamp });
  }
}

export function equipmentForMail(ctx: ModuleReducerCtx | ModuleViewCtx, id: string) {
  return ctx.db.mailboxEquipment.key.find(equipmentMailKey(id, ctx.sender));
}
export function mergeEquipmentMail(ctx: ModuleReducerCtx, guest: Identity, account: Identity) {
  for (const row of ctx.db.mailboxEquipment.identity.filter(guest)) {
    const key = equipmentMailKey(row.letterId, account);
    if (!ctx.db.mailboxEquipment.key.find(key)) ctx.db.mailboxEquipment.insert({ ...row, key, identity: account });
    ctx.db.mailboxEquipment.key.delete(row.key);
  }
}
export function removeEquipmentMail(ctx: ModuleReducerCtx, identity: Identity) {
  for (const row of ctx.db.mailboxEquipment.identity.filter(identity)) ctx.db.mailboxEquipment.key.delete(row.key);
}
