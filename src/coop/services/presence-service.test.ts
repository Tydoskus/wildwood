import { describe, expect, it } from "vitest";
import { bossTargetsFromMapSamples, createPresenceService } from "./presence-service";

describe("boss presence targets", () => {
  it("uses the live local position when the solo map snapshot has gone idle", () => {
    const targets = bossTargetsFromMapSamples([
      { networkId: 4, x: 500, y: 700 },
      { networkId: 9, x: 900, y: 1_100 },
    ], 4, { x: 4_220, y: 4_080 });

    expect(targets).toEqual([
      { id: "network:4", x: 4_220, y: 4_080 },
      { id: "network:9", x: 900, y: 1_100 },
    ]);
  });
});


it("preserves the global online total through map handoffs and resets it on account disconnect", () => {
  const presence = createPresenceService({ changes: { notify() {} } } as any);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 21 });
  presence.clearSession(true);
  presence.beginSession(false);
  expect(presence.api.onlinePlayerCount()).toBe(21);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 22 });
  expect(presence.api.onlinePlayerCount()).toBe(22);
  presence.clearSession();
  expect(presence.api.onlinePlayerCount()).toBe(0);
});
