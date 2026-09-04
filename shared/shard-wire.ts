import { Identity, Timestamp } from "spacetimedb";
/** Explicit wire encoding preserves SDK values and u64s in trusted server snapshots. */
export function encodeShardSnapshot(value: unknown): string {
  function encode(input: any): any {
    // The root and map bundles can include different SDK module instances.
    // Runtime values must survive that boundary as well as ordinary instanceof.
    if (input instanceof Identity || (typeof input?.toHexString === "function" && /^[0-9a-f]{64}$/.test(input.toHexString()))) return { $identity: input.toHexString() };
    if (input instanceof Timestamp || typeof input?.microsSinceUnixEpoch === "bigint") return { $timestamp: String(input.microsSinceUnixEpoch) };
    if (typeof input === "bigint") return { $bigint: String(input) };
    if (Array.isArray(input)) return input.map(encode);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, encode(v)]));
    return input;
  }
  return JSON.stringify(encode(value));
}
export function decodeShardSnapshot(value: string): any {
  return JSON.parse(value, (_key, entry) => {
    if (entry && typeof entry === "object") {
      if ("$identity" in entry) return new Identity(entry.$identity);
      if ("$timestamp" in entry) return new Timestamp(BigInt(entry.$timestamp));
      if ("$bigint" in entry) return BigInt(entry.$bigint);
    }
    return entry;
  });
}
