import { equipmentForMail, mergeEquipmentMail, removeEquipmentMail } from "./mailbox-equipment";
import { GEAR_MAIL_ID } from "../../shared/mailbox-equipment";
import { table, t, SenderError } from "spacetimedb/server";
import type { Identity, Timestamp } from "spacetimedb";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { REBALANCE_MAIL_ID, REBALANCE_MAIL_GEMS, REBALANCE_MAIL_TITLE, REBALANCE_MAIL_BODY,
  SLOT_UPGRADE_MAIL_ID, SLOT_UPGRADE_MAIL_GEMS, SLOT_UPGRADE_MAIL_TITLE, SLOT_UPGRADE_MAIL_BODY } from "../../shared/mailbox";

// One shared letter; per-account state is written only on read or claim.
export const mailboxLetter = table({ name: "mailbox_letter", public: false }, {
  id: t.string().primaryKey(), title: t.string(), body: t.string(), gems: t.u64(),
  createdAt: t.timestamp(), eligibleBefore: t.timestamp(),
});
export const mailboxReceipt = table({ name: "mailbox_receipt", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), letterId: t.string(),
  read: t.bool(), claimed: t.bool(), updatedAt: t.timestamp(),
});
// The join date copied out of player_lifetime, which every kill report
// rewrites. my_mailbox_v2 needs only this date, and a view re-runs whenever a
// table it read changes, so reading the lifetime row re-ran it on every kill.
export const playerJoinDate = table({ name: "player_join_date", public: false }, {
  identity: t.identity().primaryKey(), joinedAt: t.timestamp(),
});
export function syncPlayerJoinDate(ctx: ModuleReducerCtx, identity: Identity, joinedAt: Timestamp) {
  const current = ctx.db.playerJoinDate.identity.find(identity);
  if (current?.joinedAt.microsSinceUnixEpoch === joinedAt.microsSinceUnixEpoch) return;
  const next = { identity, joinedAt };
  if (current) ctx.db.playerJoinDate.identity.update(next); else ctx.db.playerJoinDate.insert(next);
}
export function removePlayerJoinDate(ctx: ModuleReducerCtx, identity: Identity) {
  if (ctx.db.playerJoinDate.identity.find(identity)) ctx.db.playerJoinDate.identity.delete(identity);
}
export const mailboxEntry = t.row("MailboxEntry", {
  id: t.string().primaryKey(), title: t.string(), body: t.string(), gems: t.u64(),
  createdAt: t.timestamp(), read: t.bool(), claimed: t.bool(),
});
// Keep v1 intact so installed 0.734 clients remain compatible during rollout.
export const mailboxEntryV2 = t.row("MailboxEntryV2", {
  id: t.string().primaryKey(), title: t.string(), body: t.string(), gems: t.u64(),
  createdAt: t.timestamp(), read: t.bool(), claimed: t.bool(), itemIds: t.array(t.string()), upgradeLevel: t.u8(),
});
export function mailboxForPlayerV2(ctx: ModuleViewCtx) {
  return mailboxForPlayer(ctx).map(row => {
    const reward = equipmentForMail(ctx, row.id);
    return { ...row, itemIds: reward ? JSON.parse(reward.itemIdsJson) as string[] : [], upgradeLevel: reward?.upgradeLevel ?? 0 };
  });
}
const receiptKey = (id: string, identity: Identity) => `${id}:${identity.toHexString()}`;

function eligible(ctx: ModuleViewCtx | ModuleReducerCtx, before: bigint) {
  // The lifetime fallback covers only the moments before the backfill runs.
  const joinedAt = (ctx.db.playerJoinDate.identity.find(ctx.sender) ?? ctx.db.playerLifetime.identity.find(ctx.sender))?.joinedAt;
  return Boolean(joinedAt && joinedAt.microsSinceUnixEpoch <= before
    && !ctx.db.virtualPlayer.identity.find(ctx.sender));
}

export function mailboxForPlayer(ctx: ModuleViewCtx) {
  const receipts = new Map([...ctx.db.mailboxReceipt.identity.filter(ctx.sender)].map(row => [row.letterId, row]));
  return [...ctx.db.mailboxLetter.iter()].filter(row => row.id === GEAR_MAIL_ID ? Boolean(equipmentForMail(ctx, row.id)) : eligible(ctx, row.eligibleBefore.microsSinceUnixEpoch))
    .map(row => ({ id: row.id, title: row.title, body: row.body, gems: row.gems, createdAt: row.createdAt,
      read: receipts.get(row.id)?.read ?? false, claimed: receipts.get(row.id)?.claimed ?? false }));
}

/** Campaign identity, eligibility and reward are immutable; copy can be corrected safely. */
export function publishMailboxLetter(ctx: ModuleReducerCtx, letter: { id: string; title: string; body: string; gems: bigint }) {
  if (!/^[a-z0-9-]{1,80}$/.test(letter.id) || !letter.title.trim() || letter.title.length > 100
    || !letter.body.trim() || letter.body.length > 6000 || letter.gems > 10_000n || letter.gems < 0n) {
    throw new SenderError("Invalid mailbox letter.");
  }
  const existing = ctx.db.mailboxLetter.id.find(letter.id);
  if (existing) {
    if (existing.gems !== letter.gems) {
      throw new SenderError("That mail ID is already in use. Published rewards cannot be changed.");
    }
    if (existing.title !== letter.title || existing.body !== letter.body) {
      ctx.db.mailboxLetter.id.update({ ...existing, title: letter.title, body: letter.body });
    }
    return;
  }
  if ([...ctx.db.mailboxLetter.iter()].length >= 100) throw new SenderError("Mailbox campaign limit reached.");
  ctx.db.mailboxLetter.insert({ ...letter, createdAt: ctx.timestamp, eligibleBefore: ctx.timestamp });
}

export function publishRebalanceMail(ctx: ModuleReducerCtx) {
  publishMailboxLetter(ctx, { id: REBALANCE_MAIL_ID, title: REBALANCE_MAIL_TITLE, body: REBALANCE_MAIL_BODY, gems: REBALANCE_MAIL_GEMS });
}

export function publishSlotUpgradeMail(ctx: ModuleReducerCtx) {
  publishMailboxLetter(ctx, { id: SLOT_UPGRADE_MAIL_ID, title: SLOT_UPGRADE_MAIL_TITLE, body: SLOT_UPGRADE_MAIL_BODY, gems: SLOT_UPGRADE_MAIL_GEMS });
}

export function updateMailboxReceipt(ctx: ModuleReducerCtx, id: string, claim: boolean, credit: (amount: bigint, reference: string, title: string) => void, grantEquipment?: (items: string[], level: number) => void) {
  const letter = ctx.db.mailboxLetter.id.find(id);
  const gear = equipmentForMail(ctx, id);
  if (!letter || (id === GEAR_MAIL_ID ? !gear : !eligible(ctx, letter.eligibleBefore.microsSinceUnixEpoch))) throw new SenderError("Mail unavailable.");
  const key = receiptKey(id, ctx.sender);
  const previous = ctx.db.mailboxReceipt.key.find(key);
  if (claim && letter.gems > 0n && !previous?.claimed) credit(letter.gems, `mailbox:${key}`, letter.title);
  if (claim && gear && !previous?.claimed) {
    if (!grantEquipment) throw new SenderError("Gear claim unavailable.");
    grantEquipment(JSON.parse(gear.itemIdsJson), gear.upgradeLevel);
  }
  const claimed = Boolean(previous?.claimed || claim && (letter.gems > 0n || gear));
  if (previous?.read && previous.claimed === claimed) return;
  const next = { key, identity: ctx.sender, letterId: id, read: true, claimed, updatedAt: ctx.timestamp };
  if (previous) ctx.db.mailboxReceipt.key.update(next);
  else ctx.db.mailboxReceipt.insert(next);
}

export function mergeMailboxReceipts(ctx: ModuleReducerCtx, guest: Identity, account: Identity) {
  mergeEquipmentMail(ctx, guest, account);
  for (const row of ctx.db.mailboxReceipt.identity.filter(guest)) {
    const key = receiptKey(row.letterId, account);
    const previous = ctx.db.mailboxReceipt.key.find(key);
    const next = { ...row, key, identity: account, read: row.read || Boolean(previous?.read), claimed: row.claimed || Boolean(previous?.claimed) };
    if (previous) ctx.db.mailboxReceipt.key.update(next);
    else ctx.db.mailboxReceipt.insert(next);
    ctx.db.mailboxReceipt.key.delete(row.key);
  }
}

export function removeMailboxReceipts(ctx: ModuleReducerCtx, identity: Identity) {
  removeEquipmentMail(ctx, identity);
  for (const row of ctx.db.mailboxReceipt.identity.filter(identity)) ctx.db.mailboxReceipt.key.delete(row.key);
}
