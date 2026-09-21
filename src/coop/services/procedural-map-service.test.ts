import { afterEach, describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { ReducerPort } from "../ports";
import { BOSS_REWARD_CLAIM_BITS } from "../../../shared/rules";
import { createProceduralMapService } from "./procedural-map-service";

function harness() {
  const subscriptions: Array<{
    applied: () => void;
    fail: () => void;
    pending: boolean;
    ended: boolean;
  }> = [];
  const bosses = new Map<string, any>();
  let completed = 0,
    throws = false,
    blocked = false;
  const prepare = vi.fn(async () => {}),
    hit = vi.fn(async () => {}),
    failure = vi.fn();
  const conn = {
    isActive: true,
    identity: Identity.fromString("1".padStart(64, "0")),
    db: {
      proceduralProgress: { identity: { find: () => ({ completed }) } },
      playerProgress: {
        identity: {
          find: () => ({ bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime }),
        },
      },
      myProceduralBoss: { iter: () => bosses.values() },
      myEndlessTravelAccess: { iter: () => [] },
    },
    reducers: { prepareProceduralBoss: prepare, hitProceduralBossBatch: hit },
    subscriptionBuilder: () => {
      let applied = () => {},
        error = (_ctx: any) => {};
      const builder = {
        onApplied: (cb: () => void) => {
          applied = cb;
          return builder;
        },
        onError: (cb: (ctx: any) => void) => {
          error = cb;
          return builder;
        },
        subscribe: () => {
          if (throws) throw new Error("closed transport");
          const record = {
            applied: () => {
              record.pending = false;
              applied();
            },
            fail: () => {
              record.ended = true;
              error({ event: new Error("subscription failed") });
            },
            pending: true,
            ended: false,
          };
          subscriptions.push(record);
          return {
            isActive: () => !record.pending && !record.ended,
            isEnded: () => record.ended,
            unsubscribe: () => {
              if (record.pending) throw new Error("pending unsubscribe");
              record.ended = true;
            },
          };
        },
      };
      return builder;
    },
  } as unknown as DbConnection;
  let current: DbConnection | null = conn;
  const port = {
    connection: () => current,
    protocolBlocked: () => blocked,
    worldEntryBlocked: () => false,
    handleFailure: failure,
    sendReducer: (
      _label: string,
      callback: (c: DbConnection) => Promise<void>,
    ) => {
      if (current) void callback(current);
    },
  } as unknown as ReducerPort;
  return {
    api: createProceduralMapService(port),
    subscriptions,
    bosses,
    prepare,
    hit,
    failure,
    conn,
    setCompleted: (value: number) => (completed = value),
    setThrows: (value: boolean) => (throws = value),
    setBlocked: (value: boolean) => (blocked = value),
    disconnect: () => {
      current = null;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("generated map subscription lifecycle", () => {
  it("uses a single account view during map changes and ignores stale map rows", () => {
    const h = harness();
    h.api.proceduralMapState("endless_1");
    expect(h.api.proceduralMapState("endless_2").ready).toBe(false);
    h.subscriptions[0].applied();
    h.bosses.set("boss", { mapId: "endless_1", hp: 100, respawnAtMicros: 0n });
    expect(h.api.proceduralMapState("endless_2").boss).toBeNull();
    h.bosses.set("boss", { mapId: "endless_2", hp: 100, respawnAtMicros: 0n });
    expect(h.api.proceduralMapState("endless_2").boss?.mapId).toBe("endless_2");
    expect(h.subscriptions).toHaveLength(1);
  });
  it("waits for unlock hydration without creating shared bosses", () => {
    const h = harness();
    h.api.proceduralMapState("endless_1");
    expect(h.prepare).not.toHaveBeenCalled();
    h.subscriptions[0].applied();
    h.api.proceduralMapState("endless_1");
    h.api.proceduralMapState("endless_1");
    expect(h.prepare).not.toHaveBeenCalled();
    h.disconnect();
    expect(h.api.proceduralMapState("endless_1").ready).toBe(false);
  });
  it("unsubscribes an abandoned pending connection when its late response arrives", () => {
    const h = harness();
    h.api.proceduralMapState("endless_1");
    h.disconnect();
    h.api.proceduralMapState("endless_1");
    h.subscriptions[0].applied();
    expect(h.subscriptions[0].ended).toBe(true);
    expect(h.api.proceduralMapState("endless_1").ready).toBe(false);
  });
  it("backs off and recovers from synchronous and asynchronous subscription failures", () => {
    vi.useFakeTimers();
    const h = harness();
    h.setThrows(true);
    expect(() => h.api.proceduralMapState("endless_1")).not.toThrow();
    h.setThrows(false);
    h.api.proceduralMapState("endless_1");
    expect(h.subscriptions).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    h.api.proceduralMapState("endless_1");
    h.subscriptions[0].fail();
    vi.advanceTimersByTime(3000);
    h.api.proceduralMapState("endless_1");
    h.subscriptions[1].applied();
    expect(h.api.proceduralMapState("ion_citadel").ready).toBe(true);
    expect(h.failure).toHaveBeenCalledTimes(2);
  });
  it("uses saved unlocks and binds hits to the current instance and encounter", () => {
    const h = harness();
    expect(h.api.proceduralMapUnlocked("endless_2")).toBe(false);
    h.setCompleted(1);
    expect(h.api.proceduralMapUnlocked("endless_2")).toBe(true);
    h.api.proceduralMapState("endless_2");
    h.subscriptions[0].applied();
    h.bosses.set("boss", {
      key: "endless_2:root",
      mapId: "endless_2",
      encounter: 3n,
      hp: 100,
    });
    h.api.hitProceduralBoss("endless_2", "endless_2:stale", 3n, 1, 4050, 4050);
    expect(h.hit).not.toHaveBeenCalled();
    h.api.hitProceduralBoss("endless_2", "endless_2:root", 3n, 1, 4050, 4050);
    expect(h.hit).toHaveBeenCalledExactlyOnceWith({
      mapId: "endless_2",
      bossKey: "endless_2:root",
      encounter: 3n,
      hits: 1,
      x: 4050,
      y: 4050,
    });
    h.setBlocked(true);
    expect(h.api.proceduralMapState("endless_2").boss).toBeNull();
  });
  it("keeps map changes free of boss preparation reducers", () => {
    const h = harness();
    h.api.proceduralMapState("endless_1"); h.subscriptions[0].applied();
    for (let map = 1; map <= 40; map++) h.api.proceduralMapState(`endless_${map}`);
    expect(h.subscriptions).toHaveLength(1);
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
