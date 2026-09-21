import { TERMS_VERSION } from "../../shared/legal";

type ConsentContext = { db: any; sender: any; timestamp: any };

/**
 * A virtual player is the developer's own load-test bot: a fresh identity that
 * enters the world like a player and so meets the same Terms gate a player
 * does. It has no one to accept them, and the developer who owns the run
 * already has, so the bot enters under that consent. Without this every bot
 * has failed at enter_world since the gate shipped in 0.577.
 */
export function grantVirtualPlayerConsent(ctx: ConsentContext, owner: any) {
  if (ctx.db.playerLegalConsent.identity.find(ctx.sender)) return;
  const consent = ctx.db.playerLegalConsent.identity.find(owner);
  if (consent?.termsVersion !== TERMS_VERSION) return;
  ctx.db.playerLegalConsent.insert({ identity: ctx.sender, termsVersion: consent.termsVersion, ageBand: consent.ageBand, acceptedAt: ctx.timestamp });
}

/** Erasing a bot erases the consent it was lent; only real players keep one. */
export function revokeVirtualPlayerConsent(ctx: { db: any }, identity: any) {
  if (ctx.db.playerLegalConsent.identity.find(identity)) ctx.db.playerLegalConsent.identity.delete(identity);
}
