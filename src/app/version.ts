let versionCheckInFlight = false;
let reloadScheduled = false;

type UpdateDetected = (latestVersion: string) => void;

// The version query is only a one-time cache-busting navigation fallback for
// hosts such as GitHub Pages. Once that build is running, keep the URL clean.
export function clearLoadedVersionQuery(version: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.has("code") || url.searchParams.has("error") || url.searchParams.get("v") !== version) return;
  url.searchParams.delete("v");
  window.history.replaceState(window.history.state, "", url.toString());
}

export function isNewerGameVersion(candidate: unknown, current: string) {
  if (typeof candidate !== "string" || !/^\d+(?:\.\d+)*$/.test(candidate) || !/^\d+(?:\.\d+)*$/.test(current)) return false;
  const candidateParts = candidate.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const next = candidateParts[index] ?? 0;
    const existing = currentParts[index] ?? 0;
    if (next !== existing) return next > existing;
  }
  return false;
}

export function enforceLatestVersion(version: string, onUpdateDetected?: UpdateDetected, handoff?: {
  canReload: () => boolean; beforeReload: (version: string) => Promise<boolean>;
}) {
  clearLoadedVersionQuery(version);
  if (versionCheckInFlight || reloadScheduled) return;
  versionCheckInFlight = true;
  // This request must bypass HTTP cache so a freshly deployed version is
  // detected, but it is intentionally infrequent (boot plus two-minute poll).
  fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then(async (release) => {
      // CDN edges can briefly return an older version.json than the bundled
      // client. Only a strictly newer release is an update.
      if (!isNewerGameVersion(release?.version, version)) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("v") === release.version || url.searchParams.has("code") || url.searchParams.has("error")) return;
      if (handoff && (!handoff.canReload() || !await handoff.beforeReload(release.version) || !handoff.canReload())) return;
      reloadScheduled = true;
      // The active game has acknowledged pending rewards/loadout before we
      // navigate. Keep the existing session-preserving update presentation.
      onUpdateDetected?.(release.version);
      url.searchParams.set("v", release.version);
      window.setTimeout(() => window.location.replace(url.toString()), 700);
    })
    .catch(() => {})
    .finally(() => { versionCheckInFlight = false; });
}

/**
 * How long a session the server has refused may wait for a newer build before
 * it concludes it is the one that is stale.
 */
export const STALE_SESSION_RELOAD_AFTER_MS = 30_000;
/** A second automatic reload inside this window would be a loop, not a recovery. */
export const STALE_SESSION_RELOAD_COOLDOWN_MS = 120_000;
const STALE_SESSION_RELOAD_KEY = "wildstat-stale-session-reload-at";

/**
 * The server refuses a session that began before its last publish and tells the
 * client to refresh. The client used to refresh only for a build newer than its
 * own, which is right when the build is old and wrong when the build is already
 * current: a tab that loaded the new client shortly before the server publish
 * was refused like any other, then waited for a newer version that did not
 * exist, for ever. Once the refusal has outlasted the grace a newer deploy would
 * need, the build is current and only the session is stale, so reload it once.
 */
export function shouldReloadStaleSession(blockedForMs: number, lastReloadAtMs: number, nowMs: number) {
  return blockedForMs >= STALE_SESSION_RELOAD_AFTER_MS
    && (!Number.isFinite(lastReloadAtMs) || nowMs - lastReloadAtMs >= STALE_SESSION_RELOAD_COOLDOWN_MS);
}

export function reloadStaleSession(blockedForMs: number, storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  reload: () => boolean | void = () => window.location.reload(), nowMs = Date.now()) {
  if (reloadScheduled) return false;
  let last = Number.NaN;
  try { last = Number(storage.getItem(STALE_SESSION_RELOAD_KEY) ?? Number.NaN); } catch {}
  if (!shouldReloadStaleSession(blockedForMs, last, nowMs)) return false;
  if (reload() === false) return false;
  try { storage.setItem(STALE_SESSION_RELOAD_KEY, String(nowMs)); } catch {}
  reloadScheduled = true;
  return true;
}
