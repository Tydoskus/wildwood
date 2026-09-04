import { expect, it } from "vitest";
import { Identity, Timestamp } from "spacetimedb";
import { decodeShardSnapshot, encodeShardSnapshot } from "./shard-wire";
it("preserves identities and timestamps from different SDK module instances", () => {
  const value = { identity: { toHexString: () => "1".repeat(64) }, timestamp: { microsSinceUnixEpoch: 9_007_199_254_740_993n }, generation: 9_007_199_254_740_999n };
  const decoded = decodeShardSnapshot(encodeShardSnapshot(value));
  expect(decoded.identity).toBeInstanceOf(Identity);
  expect(decoded.identity.toHexString()).toBe("1".repeat(64));
  expect(decoded.timestamp).toBeInstanceOf(Timestamp);
  expect(decoded.timestamp.microsSinceUnixEpoch).toBe(value.timestamp.microsSinceUnixEpoch);
  expect(decoded.generation).toBe(value.generation);
});
