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

export function enforceLatestVersion(version: string, onUpdateDetected?: UpdateDetected) {
  clearLoadedVersionQuery(version);
  if (versionCheckInFlight || reloadScheduled) return;
  versionCheckInFlight = true;
  // This request must bypass HTTP cache so a freshly deployed version is
  // detected, but it is intentionally infrequent (boot plus two-minute poll).
  fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((release) => {
      // CDN edges can briefly return an older version.json than the bundled
      // client. Only a strictly newer release is an update.
      if (!isNewerGameVersion(release?.version, version)) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("v") === release.version || url.searchParams.has("code") || url.searchParams.has("error")) return;
      reloadScheduled = true;
      // A short handoff makes an automatic reload understandable instead of
      // looking like a failed sign-in or a stalled connection.
      onUpdateDetected?.(release.version);
      url.searchParams.set("v", release.version);
      window.setTimeout(() => window.location.replace(url.toString()), 700);
    })
    .catch(() => {})
    .finally(() => { versionCheckInFlight = false; });
}
