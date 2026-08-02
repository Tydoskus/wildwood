export function enforceLatestVersion(version: string) {
  fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((release) => {
      if (!release?.version || release.version === version) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("v") === release.version) return;
      url.searchParams.set("v", release.version);
      window.location.replace(url.toString());
    })
    .catch(() => {});
}
