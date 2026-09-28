/**
 * Set in this tab's sessionStorage while a refresh request is at SpacetimeAuth.
 *
 * The provider replaces the refresh token as it answers. A page that navigates
 * away before the answer arrives loses the new one and keeps only the spent
 * one, and presenting a spent refresh token makes SpacetimeAuth revoke the
 * whole sign-in: the player is sent back to it, often to type their email.
 * Reloads the game starts by itself wait for the flag to clear (up to a cap),
 * and the next page in a tab left with it set knows a renewal was cut off.
 * sessionStorage is shared by every bundle on the page and survives a reload of
 * the same tab, which a module variable does not.
 */
export const ACCOUNT_RENEWAL_FLAG = "wildstat:account-renewal-started-at";
/** How long a reload waits for a renewal; the request itself is abandoned after two minutes. */
export const ACCOUNT_RENEWAL_WAIT_MS = 20_000;
/** A flag older than the request limit is a leftover, not a request still running. */
const ACCOUNT_RENEWAL_STALE_MS = 120_000;

type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const tabStorage = (): TabStorage | undefined => { try { return globalThis.sessionStorage; } catch { return undefined; } };

export function markAccountRenewal(inFlight: boolean, storage = tabStorage(), now = Date.now()) {
  try {
    if (inFlight) storage?.setItem(ACCOUNT_RENEWAL_FLAG, String(now));
    else storage?.removeItem(ACCOUNT_RENEWAL_FLAG);
  } catch { /* Storage may be unavailable; the reload guard then just does not wait. */ }
}

/** When the renewal still running in this tab started, or null. */
export function accountRenewalStartedAt(storage = tabStorage(), now = Date.now()) {
  let started = Number.NaN;
  try { started = Number(storage?.getItem(ACCOUNT_RENEWAL_FLAG) ?? Number.NaN); } catch {}
  return Number.isFinite(started) && now - started >= 0 && now - started < ACCOUNT_RENEWAL_STALE_MS ? started : null;
}

/** Navigates now when no renewal is running in this tab, and otherwise once it settles (or the wait runs out). */
export function afterAccountRenewal(navigate: () => void, storage = tabStorage()) {
  if (accountRenewalStartedAt(storage) === null) navigate();
  else void whenAccountRenewalSettled(ACCOUNT_RENEWAL_WAIT_MS, storage).then(navigate);
}

/** Resolves once no renewal is running in this tab, or after `maxMs`. Call before any reload the game starts. */
export async function whenAccountRenewalSettled(maxMs = ACCOUNT_RENEWAL_WAIT_MS, storage = tabStorage(),
  now = () => Date.now(), sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  const deadline = now() + maxMs;
  while (accountRenewalStartedAt(storage, now()) !== null && now() < deadline) await sleep(100);
}
