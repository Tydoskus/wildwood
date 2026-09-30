/**
 * How far this device's clock is from SpacetimeAuth's.
 *
 * A login is checked against the clock before it is used: not issued in the
 * future, not about to expire. With a PC clock a few minutes behind, every
 * fresh login read as issued in the future and was refused before the game
 * connected, on every attempt and in every window, while guest play (which
 * never goes through these checks) worked. That was Pearl.
 *
 * A login SpacetimeAuth has just issued carries its own "now" (iat), so the
 * difference from the device clock at arrival is the device's error. Later
 * checks use the corrected time. This only decides when the browser thinks a
 * login is still good; the game server checks every login against its own
 * clock regardless.
 */
const STORAGE_KEY = "wildstat.tokenClockOffsetMs";
/** Network time and the checks' own 60 s allowance cover this much; not worth correcting. */
const IGNORED_DRIFT_MS = 60_000;
/** A clock this far off is something else (a replayed token); trust the device instead. */
const MAX_OFFSET_MS = 7 * 86_400_000;

function readStored() {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && Math.abs(stored) <= MAX_OFFSET_MS ? stored : 0;
  } catch {
    return 0;
  }
}

let offsetMs = readStored();

/** The device clock corrected to SpacetimeAuth's, for login time checks. */
export function tokenClockNowMs(localNowMs = Date.now()) {
  return localNowMs + offsetMs;
}

/** Milliseconds to add to the device clock: positive when it runs behind. */
export function tokenClockOffsetMs() {
  return offsetMs;
}

/** From a login SpacetimeAuth just issued: its iat is SpacetimeAuth's "now". */
export function learnTokenClock(issuedAtSeconds: number, localNowMs = Date.now()) {
  const measured = issuedAtSeconds * 1_000 - localNowMs;
  offsetMs = Math.abs(measured) > IGNORED_DRIFT_MS && Math.abs(measured) <= MAX_OFFSET_MS ? Math.round(measured) : 0;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, String(offsetMs)); } catch { /* remembered for this page only */ }
  return offsetMs;
}
