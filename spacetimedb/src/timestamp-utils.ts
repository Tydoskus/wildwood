import type { Timestamp } from "spacetimedb";

export function earlierTimestamp(first: Timestamp, second: Timestamp) {
  return first.microsSinceUnixEpoch <= second.microsSinceUnixEpoch ? first : second;
}
