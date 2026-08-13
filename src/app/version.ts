let versionCheckInFlight = false;
let reloadScheduled = false;

type UpdateDetected = (latestVersion: string) => void;

export function enforceLatestVersion(version: string, onUpdateDetected?: UpdateDetected) {
  if (versionCheckInFlight || reloadScheduled) return;
  versionCheckInFlight = true;
  fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((release) => {
      if (!release?.version || release.version === version) return;
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
