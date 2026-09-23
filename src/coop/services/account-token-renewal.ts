import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";
import { inspectSpacetimeIdToken, verifySpacetimeIdToken } from "../security/oidc-id-token";

export class AccountRenewalRequired extends Error {
  /** no-grant: nothing to refresh with. grant-rejected: the provider refused it. */
  constructor(readonly reason: "no-grant" | "grant-rejected") { super("Account sign-in renewal required"); }
}

/** How long a connection waits for renewal before retrying. The request itself
 * runs on: the provider replaces the refresh token as it answers, so dropping
 * that answer leaves only a spent token, and presenting a spent token revokes
 * the whole sign-in. */
const RENEWAL_WAIT_MS = 15_000;
const RENEWAL_REQUEST_LIMIT_MS = 120_000;

/** Keeps refresh credentials tied to the original account, including across tabs.
 * Expired claims are read only for account matching, never accepted for a socket. */
export function createAccountTokenRenewal(storage: Storage, key: string) {
  const refreshKey = `${key}:refresh`;
  let pending: Promise<string> | null = null;
  function stored() {
    try {
      const token = storage.getItem(key);
      if (token) { inspectSpacetimeIdToken(token, { allowExpired: true }); return token; }
    } catch {
      try { storage.removeItem(key); clear(); } catch {}
    }
    return null;
  }
  function clear() { storage.removeItem(refreshKey); }
  function save(token: string, refresh: unknown, originalNonce?: string) {
    const claims = inspectSpacetimeIdToken(token);
    // Write the refresh grant before exposing the new ID token to other tabs.
    if (typeof refresh === "string" && refresh) storage.setItem(refreshKey, JSON.stringify({ subject: claims.sub, token: refresh, nonce: claims.nonce ?? originalNonce }));
    else clear();
    storage.setItem(key, token);
  }
  async function resolve(original: string, force = false): Promise<string> {
    const subject = inspectSpacetimeIdToken(original, { allowExpired: true }).sub;
    const latest = stored();
    if (!latest || inspectSpacetimeIdToken(latest, { allowExpired: true }).sub !== subject) throw new Error("Account changed during connection");
    try {
      inspectSpacetimeIdToken(latest);
      if (!force || latest !== original) return latest;
    } catch {}
    if (pending) return waitFor(pending);
    const renew = async () => {
      // Web Locks serialize refresh-token rotation across same-origin tabs.
      const before = stored();
      if (!before || inspectSpacetimeIdToken(before, { allowExpired: true }).sub !== subject) throw new Error("Account changed during renewal");
      if (before !== latest) { inspectSpacetimeIdToken(before); return before; }
      let grant: { subject?: string; token?: string; nonce?: string } = {};
      try { grant = JSON.parse(storage.getItem(refreshKey) || "{}"); } catch {}
      if (grant.subject !== subject || !grant.token) throw new AccountRenewalRequired("no-grant");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RENEWAL_REQUEST_LIMIT_MS);
      try {
        const response = await fetch(`${SPACETIME_AUTH_ISSUER}/token`, {
          method: "POST", signal: controller.signal, credentials: "omit",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: SPACETIME_AUTH_CLIENT_ID, refresh_token: grant.token }),
        });
        const result = await response.json();
        if (!response.ok) {
          if (result.error === "invalid_grant") {
            if (storage.getItem(key) === before) clear();
            throw new AccountRenewalRequired("grant-rejected");
          }
          throw new Error(`Account renewal temporarily unavailable (HTTP ${response.status})`);
        }
        if (typeof result.id_token !== "string") throw new Error("Account renewal returned no ID token");
        const claims = await verifySpacetimeIdToken(result.id_token, {});
        const previousClaims = inspectSpacetimeIdToken(before, { allowExpired: true });
        const expectedNonce = grant.nonce ?? previousClaims.nonce;
        if (claims.sub !== subject || (claims.nonce !== undefined && claims.nonce !== expectedNonce)) throw new Error("Account changed during renewal");
        if (storage.getItem(key) !== before) throw new Error("Account changed during renewal");
        save(result.id_token, result.refresh_token ?? grant.token, expectedNonce);
        return result.id_token;
      } finally { clearTimeout(timeout); }
    };
    pending = (globalThis.navigator?.locks
      ? navigator.locks.request(`wildstat:${key}:renew`, renew)
      : renew()).finally(() => { pending = null; });
    return waitFor(pending);
  }
  function waitFor(request: Promise<string>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Account renewal timed out")), RENEWAL_WAIT_MS);
    });
    return Promise.race([request, deadline]).finally(() => clearTimeout(timer));
  }
  return { stored, save, clear, resolve };
}
