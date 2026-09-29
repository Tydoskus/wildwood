import { table, t } from "spacetimedb/server";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import type { GameReducerContext } from "./index";

/**
 * The email SpacetimeAuth vouched for on each account's last sign-in, so the
 * developer can see which login owns a character. SpacetimeAuth keeps a Google
 * login and an email-link login as separate users even for the same address,
 * and each gets its own character; searching an address shows both.
 *
 * Private: only the developer-gated player lookup reads it, and account erasure
 * deletes it. `loginId` is the SpacetimeAuth user ID (the token's `sub`), to find
 * the row in the SpacetimeAuth dashboard. `named` says the token carried a
 * display name, which Google logins do and email-link logins do not.
 */
export const accountEmail = table({ name: "account_email", public: false }, {
  identity: t.identity().primaryKey(),
  email: t.string().index("btree"),
  emailVerified: t.bool(),
  loginId: t.string(),
  named: t.bool(),
  seenAt: t.timestamp(),
});

const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : "";
}

/** On connect. Writes only when something changed, so a reconnect costs a lookup. */
export function recordAccountEmail(ctx: Pick<GameReducerContext, "db" | "sender" | "senderAuth" | "timestamp">) {
  const jwt = ctx.senderAuth?.jwt;
  if (jwt?.issuer !== SPACETIME_AUTH_ISSUER || !jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID)) return;
  const claims = (jwt.fullPayload ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(claims.email);
  if (!email) return;
  const next = {
    identity: ctx.sender,
    email,
    emailVerified: claims.email_verified === true,
    loginId: typeof claims.sub === "string" ? claims.sub.slice(0, 128) : "",
    named: typeof claims.name === "string" && claims.name.trim().length > 0,
    seenAt: ctx.timestamp,
  };
  const prior = ctx.db.accountEmail.identity.find(ctx.sender);
  if (prior && prior.email === next.email && prior.emailVerified === next.emailVerified
    && prior.loginId === next.loginId && prior.named === next.named) return;
  if (prior) ctx.db.accountEmail.identity.update(next);
  else ctx.db.accountEmail.insert(next);
}
