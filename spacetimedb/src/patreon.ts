import { SenderError, SyncResponse, type InferSchema, type ReducerCtx, type ProcedureCtx, type HandlerContext } from "spacetimedb/server";
import { TimeDuration, type Identity } from "spacetimedb";
import type database from "./index";
import { allowedAvatarFrame, PATREON_PAGE, type AvatarFrame, type PatreonStatus } from "../../shared/avatar-frames";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { encodePatreonForm, patreonCallbackParams } from "./patreon-url";
import { verifyPatreonIdentity } from "./patreon-verification";
import { announcePatreonSupport } from "./patreon-announcement";

type Schema = InferSchema<typeof database>;
type Tx = ReducerCtx<Schema>;
type Context = ProcedureCtx<Schema> | HandlerContext<Schema>;
type Config = NonNullable<ReturnType<Tx["db"]["patreonConfig"]["id"]["find"]>>;
const LEASE_MS = 6 * 60 * 60 * 1000;
const REFRESH_MS = 60 * 1000;
const nowMs = (ctx: { timestamp: { microsSinceUnixEpoch: bigint } }) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
const frameTier = (value: string): AvatarFrame => value === "gold" || value === "silver" ? value : "none";

export function patreonStatus(ctx: Tx, identity: Identity): PatreonStatus {
  const row = ctx.db.patreonLink.identity.find(identity);
  if (isDeveloperIdentity(identity.toHexString())) {
    const chosen = ctx.db.patreonPreview.identity.find(identity)?.frame ?? "gold";
    return { configured: Boolean(ctx.db.patreonConfig.id.find(0)), linked: Boolean(row?.userId),
      tier: "gold", frame: allowedAvatarFrame("gold", chosen) ? chosen : "gold", validUntilMs: nowMs(ctx) + LEASE_MS, preview: true };
  }
  const tier = row && row.validUntilMs > nowMs(ctx) ? frameTier(row.tier) : "none";
  return { configured: Boolean(ctx.db.patreonConfig.id.find(0)), linked: Boolean(row?.userId), tier,
    frame: row && allowedAvatarFrame(tier, row.frame) ? row.frame : "none", validUntilMs: row?.validUntilMs ?? 0 };
}

export function beginPatreonLink(ctx: Tx, state: string) {
  const config = ctx.db.patreonConfig.id.find(0);
  if (!config) throw new SenderError("Patreon linking is not ready yet.");
  if (!/^[a-f0-9]{64}$/.test(state)) throw new SenderError("Invalid Patreon request.");
  const existing = ctx.db.patreonPending.identity.find(ctx.sender);
  const now = nowMs(ctx);
  if (existing && existing.expiresAtMs - 9 * 60_000 > now) throw new SenderError("Wait a minute before linking again.");
  if (existing) ctx.db.patreonPending.state.delete(existing.state);
  // Supplied by browser crypto.getRandomValues, not the module's timestamp-seeded RNG.
  ctx.db.patreonPending.insert({ state, identity: ctx.sender, expiresAtMs: now + 10 * 60_000 });
  const query = encodePatreonForm({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: "identity identity.memberships", state });
  return `https://www.patreon.com/oauth2/authorize?${query}`;
}

function tokenRequest(ctx: Context, config: Config, grant: Record<string, string>) {
  const response = ctx.http.fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: encodePatreonForm({ client_id: config.clientId, client_secret: config.clientSecret, ...grant }).toString(),
    timeout: new TimeDuration(10_000_000n),
  });
  if (response.status < 200 || response.status >= 300) throw new Error("Patreon token exchange failed");
  const data = JSON.parse(response.text()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token || !data.refresh_token) throw new Error("Patreon token response incomplete");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

function membershipRequest(ctx: Context, config: Config, accessToken: string) {
  const query = encodePatreonForm({ include: "memberships.currently_entitled_tiers,memberships.campaign",
    "fields[member]": "patron_status,last_charge_status,is_free_trial,next_charge_date,last_charge_date" });
  const response = ctx.http.fetch(`https://www.patreon.com/api/oauth2/v2/identity?${query}`, {
    headers: { authorization: `Bearer ${accessToken}` }, timeout: new TimeDuration(10_000_000n),
  });
  if (response.status < 200 || response.status >= 300) throw new Error("Patreon membership check failed");
  return verifyPatreonIdentity(JSON.parse(response.text()), config, nowMs(ctx));
}

function saveMembership(ctx: Tx, identity: Identity, tokens: { accessToken: string; refreshToken: string }, membership: { userId: string; tier: AvatarFrame; paidThroughMs: number }) {
  const owner = ctx.db.patreonOwner.userId.find(membership.userId);
  if (owner && !owner.identity.equals(identity)) throw new SenderError("This Patreon is already linked to another WildStat character.");
  const previous = ctx.db.patreonLink.identity.find(identity);
  if (previous?.userId && previous.userId !== membership.userId) ctx.db.patreonOwner.userId.delete(previous.userId);
  if (!owner) ctx.db.patreonOwner.insert({ userId: membership.userId, identity });
  const now = nowMs(ctx);
  // A new purchase or tier change equips its matching frame automatically.
  // Routine renewals keep an intentional selection (including None).
  const frame = previous?.userId === membership.userId && previous.tier === membership.tier && allowedAvatarFrame(membership.tier, previous.frame)
    ? previous.frame : membership.tier;
  // The lease is how long a supporter keeps their frame and their place on the
  // ticker without us asking Patreon again. Six hours meant a supporter who had
  // not played today simply vanished from both; the month they paid for is the
  // honest window. The short lease stays as the floor when Patreon tells us
  // nothing about dates.
  const { paidThroughMs, ...saved } = membership;
  const validUntilMs = Math.max(now + LEASE_MS, paidThroughMs);
  const row = { identity, ...tokens, ...saved, frame, validUntilMs, checkedAtMs: now, attemptedAtMs: now };
  if (previous) ctx.db.patreonLink.identity.update(row); else ctx.db.patreonLink.insert(row);
  announcePatreonSupport(ctx, identity, membership.userId, membership.tier);
}

export function refreshPatreon(ctx: ProcedureCtx<Schema>) {
  const input = ctx.withTx(tx => {
    const config = tx.db.patreonConfig.id.find(0), link = tx.db.patreonLink.identity.find(tx.sender);
    if (!config || !link || nowMs(tx) - link.attemptedAtMs < REFRESH_MS) return null;
    tx.db.patreonLink.identity.update({ ...link, attemptedAtMs: nowMs(tx) });
    return { config, link };
  });
  if (input) {
    let tokens = { accessToken: input.link.accessToken, refreshToken: input.link.refreshToken };
    try {
      let membership;
      try { membership = membershipRequest(ctx, input.config, tokens.accessToken); }
      catch {
        tokens = tokenRequest(ctx, input.config, { grant_type: "refresh_token", refresh_token: tokens.refreshToken });
        // Persist rotated credentials before a second network call can fail.
        ctx.withTx(tx => {
          const current = tx.db.patreonLink.identity.find(ctx.sender);
          if (current?.refreshToken === input.link.refreshToken) tx.db.patreonLink.identity.update({ ...current, ...tokens });
        });
        membership = membershipRequest(ctx, input.config, tokens.accessToken);
      }
      ctx.withTx(tx => {
        const current = tx.db.patreonLink.identity.find(ctx.sender);
        if (current?.userId === input.link.userId && (current.refreshToken === input.link.refreshToken || current.refreshToken === tokens.refreshToken)) {
          if (membership.userId !== current.userId) throw new SenderError("Patreon identity changed. Link again.");
          saveMembership(tx, ctx.sender, tokens, membership);
        }
      });
    } catch { /* Keep the last successful lease, never extend it on an API failure. */ }
  }
  return ctx.withTx(tx => JSON.stringify(patreonStatus(tx, ctx.sender)));
}

export function unlinkPatreon(ctx: Tx, identity = ctx.sender) {
  const link = ctx.db.patreonLink.identity.find(identity);
  if (link) { ctx.db.patreonOwner.userId.delete(link.userId); ctx.db.patreonLink.identity.delete(identity); }
  const pending = ctx.db.patreonPending.identity.find(identity);
  if (pending) ctx.db.patreonPending.state.delete(pending.state);
}

export function patreonCallback(ctx: HandlerContext<Schema>, uri: string) {
  const params = patreonCallbackParams(uri);
  const state = params.get("state") ?? "", code = params.get("code") ?? "";
  let message = "This link expired. Return to WildStat and try Connect Patreon again.";
  let ok = false;
  let needsMembership = false;
  if (/^[a-f0-9]{64}$/.test(state) && code.length > 0 && code.length < 4096) {
    const input = ctx.withTx(tx => {
      const pending = tx.db.patreonPending.state.find(state), config = tx.db.patreonConfig.id.find(0);
      if (!pending || !config || pending.expiresAtMs <= nowMs(tx)) return null;
      tx.db.patreonPending.state.update({ ...pending, expiresAtMs: 0 }); // Claim before network I/O; unlink can still cancel it.
      return { pending, config };
    });
    if (input) try {
      const tokens = tokenRequest(ctx, input.config, { grant_type: "authorization_code", code, redirect_uri: input.config.redirectUri });
      const membership = membershipRequest(ctx, input.config, tokens.accessToken);
      ctx.withTx(tx => {
        if (!tx.db.patreonPending.state.find(state)) throw new SenderError("Link cancelled.");
        saveMembership(tx, input.pending.identity, tokens, membership);
        tx.db.patreonPending.state.delete(state);
      });
      ok = true;
      needsMembership = membership.tier === "none";
      message = membership.tier === "none" ? "Patreon connected. An active paid Silver or Gold membership automatically applies its frame. Return to WildStat." : "Your supporter frame is applied. Return to WildStat. Thank you!";
    } catch { message = "Couldn't link Patreon. It may already belong to another character. Return to WildStat and try again."; }
  }
  return new SyncResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WildStat Patreon</title><style>body{margin:0;background:#111;color:#fff;font:18px/1.5 system-ui;text-align:center;min-height:100vh;display:grid;place-items:center}main{max-width:440px;padding:28px}h1{font-size:28px}a{display:block;padding:14px 20px;border-radius:8px;background:#f0c75e;color:#171717;font-weight:700;text-decoration:none}p{color:#ddd}</style><body><main><h1>${ok ? "Patreon connected" : "Link not completed"}</h1><p>${message}</p>${needsMembership ? `<a href="${PATREON_PAGE}" rel="noreferrer">Continue to memberships</a><p>Choose Silver or Gold, then return to the game. Your frame applies automatically.</p>` : '<p>You can close this tab and return to the game.</p>'}</main></body></html>`, {
    status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" },
  });
}
