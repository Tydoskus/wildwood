import { table, t, SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";
import { ALPHA_TESTER_GIFT_CAMPAIGN, ALPHA_TESTER_GIFT_ITEM, ALPHA_TESTER_REGISTRATION_START, ALPHA_TESTER_REGISTRATION_END } from "../../shared/item-gifts";
import { readPlayerProgress } from "./wide-stats";

export const playerItemGift = table({ name: "player_item_gift", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), campaign: t.string(),
  itemId: t.string(), claimed: t.bool(), createdAt: t.timestamp(),
});
type Ctx = ModuleReducerCtx;

/** Keep claimed rows as receipts so retrying delivery or claiming never duplicates a gift. */
export function deliverAlphaTesterGifts(ctx: Ctx, recipients: Identity[]) {
  if (recipients.length > 100) throw new SenderError("Send at most 100 gifts at a time.");
  for (const identity of recipients) {
    const audit = ctx.db.playerAccessAudit.identity.find(identity);
    if (!audit || !["account", "guest"].includes(audit.accountType)
      || ctx.db.virtualPlayer.identity.find(identity) || !readPlayerProgress(ctx, identity)
      || audit.firstSeenAt.microsSinceUnixEpoch < ALPHA_TESTER_REGISTRATION_START
      || audit.firstSeenAt.microsSinceUnixEpoch >= ALPHA_TESTER_REGISTRATION_END) {
      throw new SenderError("Recipient did not start on September 13.");
    }
    const key = `${ALPHA_TESTER_GIFT_CAMPAIGN}:${identity.toHexString()}`;
    if (!ctx.db.playerItemGift.key.find(key)) ctx.db.playerItemGift.insert({ key, identity,
      campaign: ALPHA_TESTER_GIFT_CAMPAIGN, itemId: ALPHA_TESTER_GIFT_ITEM, claimed: false, createdAt: ctx.timestamp });
  }
}

export function claimItemGift(ctx: Ctx, key: string, grant: (itemId: string) => void) {
  const gift = ctx.db.playerItemGift.key.find(key);
  if (!gift || !gift.identity.equals(ctx.sender)) throw new SenderError("Gift unavailable.");
  if (gift.claimed) return;
  grant(gift.itemId);
  ctx.db.playerItemGift.key.update({ ...gift, claimed: true });
}

export function removeItemGifts(ctx: Ctx, identity: Identity) {
  for (const row of ctx.db.playerItemGift.identity.filter(identity)) ctx.db.playerItemGift.key.delete(row.key);
}

export function mergeItemGifts(ctx: Ctx, guest: Identity, account: Identity) {
  for (const gift of ctx.db.playerItemGift.identity.filter(guest)) {
    const key = `${gift.campaign}:${account.toHexString()}`;
    const previous = ctx.db.playerItemGift.key.find(key);
    const merged = { ...gift, key, identity: account, claimed: gift.claimed || Boolean(previous?.claimed) };
    if (previous) ctx.db.playerItemGift.key.update(merged);
    else ctx.db.playerItemGift.insert(merged);
    ctx.db.playerItemGift.key.delete(gift.key);
  }
}
