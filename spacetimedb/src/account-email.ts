import { table, t } from "spacetimedb/server";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import type { GameReducerContext } from "./index";

/**
 * The email SpacetimeAuth vouched for on each account's last sign-in, so the
 * developer can see which login owns a character. One address can end up as
 * two SpacetimeAuth users, each with its own character; searching an address
 * shows both.
 *
 * Private: only the developer-gated player lookup reads it, and account erasure
 * deletes it. `loginId` is the SpacetimeAuth user ID (the token's `sub`), to find
 * the row in the SpacetimeAuth dashboard. `named` says the token carried a
 * display name. That comes from the SpacetimeAuth user (Google fills it in when
 * the user is created), not from how they signed in this time, so it is not
 * shown as a login method.
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
  // Once per new or changed login: the trace to find a split account by in the logs.
  const other = otherCharacterForLogin(ctx);
  if (other) console.log(`duplicate login: ${ctx.sender.toHexString()} shares its email with ${other}`);
}

/**
 * The character this login's email already has on another login, when this
 * login's own character is new: "" otherwise. SpacetimeAuth can make a second
 * user for an address (a Google sign-in on an email-link account), and the new
 * login opens an empty character; the client warns before the player invests
 * in it. Only the caller's own address is looked up, both addresses must be
 * verified, and all it reveals is that character's name.
 *
 * Addresses are recorded on sign-in, so an older login is found once it has
 * signed in since account_email existed.
 */
export function otherCharacterForLogin(ctx: Pick<GameReducerContext, "db" | "sender">) {
  const mine = ctx.db.accountEmail.identity.find(ctx.sender);
  if (!mine?.emailVerified) return "";
  if (ctx.db.analyticsPlayer.identity.find(ctx.sender)?.firstKillDayKey) return "";
  for (const row of ctx.db.accountEmail.email.filter(mine.email) as Iterable<any>) {
    if (row.identity.isEqual(ctx.sender) || !row.emailVerified) continue;
    if (!ctx.db.analyticsPlayer.identity.find(row.identity)?.firstKillDayKey) continue;
    const name = ctx.db.playerProfile.identity.find(row.identity)?.displayName;
    if (name) return name;
  }
  return "";
}
