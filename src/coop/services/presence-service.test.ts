import { describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
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

it("continues the restored input sequence after each regional reconnect", () => {
  const identity = new Identity("1".repeat(64));
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), hydrationReady: () => false,
    localDbIdentity: () => identity, worldEntryReady: () => false, sessionConflict: () => false,
    developer: { api: { developerPresenceVisible: () => true }, observePresence() {} },
    reducers: { connection: () => null },
    changes: { notify() {}, batch: (fn: () => void) => fn() },
  } as any);
  for (const lastInputSequence of [500, 1_000, 1_500]) {
    presence.beginSession(false);
    presence.tables.upsertPlayer({
      identity, mapId: "tutorial_forest", x: 100, y: 100, speed: 180,
      facing: 0, moving: false, motionEpoch: 1, lastInputSequence, isVisible: true, controllerTabId: "same-tab",
    });
    expect(presence.reserveStoppedMotion().sequence).toBe(lastInputSequence + 1);
  }
});

it("survives pending/disconnected marker cleanup and discards a late subscription application", () => {
  const subscriptions: any[] = [];
  const identity = new Identity("1".repeat(64));
  const connection = {
    isActive: true,
    subscriptionBuilder() {
      const handle: any = {
        active: false,
        isActive: () => handle.active, isEnded: () => false,
        unsubscribe: vi.fn(() => { throw new Error("Connection closed during handoff"); }),
        onApplied(fn: () => void) { handle.applied = fn; return handle; },
        onError() { return handle; },
        subscribe() { subscriptions.push(handle); return handle; },
      };
      return handle;
    },
  };
  const presence = createPresenceService({
    localIdentity: () => identity.toHexString(), localDbIdentity: () => identity,
    reducers: { connection: () => connection }, hydrationReady: () => true,
    changes: { notify() {} },
  } as any);
  presence.tables.upsertWorldStatus({ id: 0, onlinePlayers: 2 });
  presence.activateSubscriptions();
  expect(subscriptions).toHaveLength(2);
  expect(() => presence.clearSession(true)).not.toThrow();
  expect(presence.api.onlinePlayerCount()).toBe(2);
  const staleMarkers = subscriptions[1];
  staleMarkers.active = true;
  expect(() => staleMarkers.applied()).not.toThrow();
  expect(staleMarkers.unsubscribe).toHaveBeenCalledOnce();
  expect(() => presence.activateSubscriptions()).not.toThrow();
  expect(subscriptions).toHaveLength(4);
  for (const subscription of subscriptions) subscription.active = true;
  expect(() => presence.clearSession()).not.toThrow();
});
