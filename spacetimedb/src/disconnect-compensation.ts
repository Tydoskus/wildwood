import { SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";
import { readPlayerProgress } from "./wide-stats";

export const DISCONNECT_GIFT_CAMPAIGN = "disconnect-compensation:2026-09-14";
export const DISCONNECT_GIFT_AMOUNT = 20n;

export const AUTOFARM_TEST_GIFT_CAMPAIGN = "autofarm-popup-test:2026-09-17";
export function deliverAutofarmTestGift(ctx: ModuleReducerCtx, recipients: Identity[], credit: Credit) {
  deliverGemGift(ctx, recipients, credit, AUTOFARM_TEST_GIFT_CAMPAIGN, "autofarm_test_gift",
    "15 gems from the developer. Thanks for helping test WildStat!", 15n);
}

type Credit = (input: { identity: Identity; delta: bigint; kind: string; note: string; externalReference: string }) => void;

/** Credit immediately; the legacy notice is displayed in the mailbox as already received.
 * The ledger reference survives dismissal and makes retries safe. */
export function deliverDisconnectCompensation(ctx: ModuleReducerCtx, recipients: Identity[], credit: Credit) {
  deliverGemGift(ctx, recipients, credit, DISCONNECT_GIFT_CAMPAIGN, "disconnect_compensation",
    "20 gems from the developer. Sorry for the disconnect issues, and thanks for sticking with us!");
}

export const COMBAT_UPDATE_GIFT_CAMPAIGN = "combat-update:0.695";
export function deliverCombatUpdateGift(ctx: ModuleReducerCtx, recipients: Identity[], credit: Credit) {
  deliverGemGift(ctx, recipients, credit, COMBAT_UPDATE_GIFT_CAMPAIGN, "combat_update_gift",
    "20 gems from the developer for the combat changes. Thanks for testing WildStat!");
}

function deliverGemGift(ctx: ModuleReducerCtx, recipients: Identity[], credit: Credit, campaign: string, kind: string, note: string, amount = DISCONNECT_GIFT_AMOUNT) {
  if (recipients.length > 100) throw new SenderError("Send at most 100 gifts at a time.");
  for (const identity of recipients) {
    if (!readPlayerProgress(ctx, identity) || ctx.db.virtualPlayer.identity.find(identity)) continue;
    const externalReference = `${campaign}:${identity.toHexString()}`;
    if (ctx.db.gemTransaction.externalReference.find(externalReference)) continue;
    credit({ identity, delta: amount, kind, note, externalReference });
    const previous = ctx.db.balanceApologyNotice.identity.find(identity);
    if (previous) ctx.db.balanceApologyNotice.identity.update({ ...previous, amount: previous.amount + amount });
    else ctx.db.balanceApologyNotice.insert({ identity, amount, createdAt: ctx.timestamp });
  }
}


export const OUTAGE_GIFT_CAMPAIGN = "outage-compensation:0.709:2026-09-15";
export const OUTAGE_GIFT_MESSAGE = "Sorry I temporarily crashed the game during the update. I've added 10 gems to everyone's existing character, guests included. Thanks for sticking with me!";
export function deliverOutageCompensation(ctx: ModuleReducerCtx, recipients: Identity[], credit: Credit) {
  deliverGemGift(ctx, recipients, credit, OUTAGE_GIFT_CAMPAIGN, "outage_compensation",
    "10 gems from the developer. Sorry for temporarily crashing the game during the update!", 10n);
}

/** A zero-value ledger event records the campaign announcement without charging
 * or crediting the operator. Retry-safe even after public chat retention ends. */
export function announceOutageCompensation(ctx: ModuleReducerCtx, announce: (message: string) => void) {
  const externalReference = `${OUTAGE_GIFT_CAMPAIGN}:announcement`;
  if (ctx.db.gemTransaction.externalReference.find(externalReference)) return;
  announce(OUTAGE_GIFT_MESSAGE);
  ctx.db.gemTransaction.insert({ id: 0n, identity: ctx.sender, delta: 0n,
    balanceAfter: ctx.db.playerGemWallet.identity.find(ctx.sender)?.balance ?? 0n,
    kind: "outage_announcement", note: OUTAGE_GIFT_MESSAGE, externalReference, createdAt: ctx.timestamp });
}
