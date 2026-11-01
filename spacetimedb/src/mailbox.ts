import { equipmentForMail, mergeEquipmentMail, removeEquipmentMail, removeEquipmentMailFor } from "./mailbox-equipment";
import { mergePersonalMail, personalMailFor, readPersonalMail, removePersonalMail, removePersonalMailSentBy } from "./dev-review-mail";
import { GEAR_MAIL_ID } from "../../shared/mailbox-equipment";
import { table, t, SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { REBALANCE_MAIL_ID, REBALANCE_MAIL_GEMS, REBALANCE_MAIL_TITLE, REBALANCE_MAIL_BODY,
  SLOT_UPGRADE_MAIL_ID, SLOT_UPGRADE_MAIL_GEMS, SLOT_UPGRADE_MAIL_TITLE, SLOT_UPGRADE_MAIL_BODY,
  GEAR_OVERHAUL_MAIL_ID, GEAR_OVERHAUL_MAIL_GEMS, GEAR_OVERHAUL_MAIL_TITLE, GEAR_OVERHAUL_MAIL_BODY } from "../../shared/mailbox";

// One shared letter; per-account state is written only on read or claim.
export const mailboxLetter = table({ name: "mailbox_letter", public: false }, {
  id: t.string().primaryKey(), title: t.string(), body: t.string(), gems: t.u64(),
  createdAt: t.timestamp(), eligibleBefore: t.timestamp(),
});
export const mailboxReceipt = table({ name: "mailbox_receipt", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), letterId: t.string(),
  read: t.bool(), claimed: t.bool(), updatedAt: t.timestamp(),
});
// Keep v1 intact so older installed clients stay compatible.
export const mailboxEntryV2 = t.row("MailboxEntryV2", {
  id: t.string().primaryKey(), title: t.string(), body: t.string(), gems: t.u64(),
  createdAt: t.timestamp(), read: t.bool(), claimed: t.bool(), itemIds: t.array(t.string()), upgradeLevel: t.u8(),
});
export function mailboxForPlayerV2(ctx: ModuleViewCtx) {
  const gear = new Map<string, ReturnType<typeof equipmentForMail>>();
  return mailboxForPlayer(ctx, gear).map(row => {
    const reward = gear.has(row.id) ? gear.get(row.id) : equipmentForMail(ctx, row.id);
    return { ...row, itemIds: reward ? JSON.parse(reward.itemIdsJson) as string[] : [], upgradeLevel: reward?.upgradeLevel ?? 0 };
  });
}
const receiptKey = (id: string, identity: Identity) => `${id}:${identity.toHexString()}`;

function eligible(ctx: ModuleViewCtx | ModuleReducerCtx, before: bigint) {
  return eligibleFor(ctx)(before);
}

/** eligible() for every letter of one view, reading the join date and the virtual-player row once. */
function eligibleFor(ctx: ModuleViewCtx | ModuleReducerCtx) {
  let joined: { at?: bigint } | undefined, virtual: boolean | undefined;
  return (before: bigint) => {
    // The lifetime fallback covers only the moments before the backfill runs.
    joined ??= { at: (ctx.db.playerJoinDate.identity.find(ctx.sender) ?? ctx.db.playerLifetime.identity.find(ctx.sender))?.joinedAt?.microsSinceUnixEpoch };
    return joined.at !== undefined && joined.at <= before && !(virtual ??= Boolean(ctx.db.virtualPlayer.identity.find(ctx.sender)));
  };
}

/** `gear` keeps the gear letter's reward row when given, so the V2 view does not read it twice. */
export function mailboxForPlayer(ctx: ModuleViewCtx, gear?: Map<string, ReturnType<typeof equipmentForMail>>) {
  const receipts = new Map([...ctx.db.mailboxReceipt.identity.filter(ctx.sender)].map(row => [row.letterId, row]));
  const eligibleNow = eligibleFor(ctx);
  const gearFor = (id: string) => { const reward = equipmentForMail(ctx, id); gear?.set(id, reward); return reward; };
  return [...ctx.db.mailboxLetter.iter()].filter(row => row.id === GEAR_MAIL_ID ? Boolean(gearFor(row.id)) : eligibleNow(row.eligibleBefore.microsSinceUnixEpoch))
    .map(row => ({ id: row.id, title: row.title, body: row.body, gems: row.gems, createdAt: row.createdAt,
      read: receipts.get(row.id)?.read ?? false, claimed: receipts.get(row.id)?.claimed ?? false }))
    .concat(personalMailFor(ctx));
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

export function publishGearOverhaulMail(ctx: ModuleReducerCtx) {
  publishMailboxLetter(ctx, { id: GEAR_OVERHAUL_MAIL_ID, title: GEAR_OVERHAUL_MAIL_TITLE, body: GEAR_OVERHAUL_MAIL_BODY, gems: GEAR_OVERHAUL_MAIL_GEMS });
}

export function publishSlotUpgradeMail(ctx: ModuleReducerCtx) {
  publishMailboxLetter(ctx, { id: SLOT_UPGRADE_MAIL_ID, title: SLOT_UPGRADE_MAIL_TITLE, body: SLOT_UPGRADE_MAIL_BODY, gems: SLOT_UPGRADE_MAIL_GEMS });
}

export function updateMailboxReceipt(ctx: ModuleReducerCtx, id: string, claim: boolean, credit: (amount: bigint, reference: string, title: string) => void, grantEquipment?: (items: string[], level: number) => void) {
  // A personal letter carries no reward: reading or "claiming" it only marks it read.
  if (readPersonalMail(ctx, id)) return;
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

/** How long a letter stays in the mailbox: a week from when it was sent. */
export const MAIL_LIFETIME_MICROS = 7n * 24n * 60n * 60n * 1_000_000n;

/**
 * Takes every letter a week old out of the mailbox, read or not, claimed or
 * not: a shared
 * letter with everyone's receipts and the gear it held for them, and each
 * personal letter. A reward left unclaimed goes with it. Gems already paid
 * stay paid, and a letter id used again cannot pay twice: the gem ledger's
 * reference stops that, not the receipt (gem-wallet.ts). The maintenance
 * sweep runs this in its hourly turn, so a letter leaves within the hour after
 * its week.
 */
export function clearExpiredMail(ctx: ModuleReducerCtx) {
  const cutoff = ctx.timestamp.microsSinceUnixEpoch - MAIL_LIFETIME_MICROS;
  const expired = new Set([...ctx.db.mailboxLetter.iter()].filter(letter => letter.createdAt.microsSinceUnixEpoch <= cutoff).map(letter => letter.id));
  if (expired.size) {
    for (const id of expired) ctx.db.mailboxLetter.id.delete(id);
    for (const receipt of [...ctx.db.mailboxReceipt.iter()]) if (expired.has(receipt.letterId)) ctx.db.mailboxReceipt.key.delete(receipt.key);
    removeEquipmentMailFor(ctx, expired);
  }
  removePersonalMailSentBy(ctx, cutoff);
}

export function mergeMailboxReceipts(ctx: ModuleReducerCtx, guest: Identity, account: Identity) {
  mergeEquipmentMail(ctx, guest, account);
  mergePersonalMail(ctx, guest, account);
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
  removePersonalMail(ctx, identity);
  for (const row of ctx.db.mailboxReceipt.identity.filter(identity)) ctx.db.mailboxReceipt.key.delete(row.key);
}
