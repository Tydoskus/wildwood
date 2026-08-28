const PRODUCTION_SPACETIMEDB_HOST = "wss://maincloud.spacetimedb.com";

function normalizedHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function isLocalNetworkHostname(hostname: string) {
  const host = normalizedHostname(hostname);
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  if (!host.includes(".") && !host.includes(":")) return true;
  if (host.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = /^172\.(\d+)\./.exec(host);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

/** LAN browsers must connect back to the computer serving the page, not their own localhost. */
export function defaultRealtimeHost(hostname: string) {
  if (!isLocalNetworkHostname(hostname)) return PRODUCTION_SPACETIMEDB_HOST;
  const host = normalizedHostname(hostname);
  const address = host.includes(":") ? `[${host}]` : host;
  return `ws://${address}:3000`;
}
