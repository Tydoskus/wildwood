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
  let completed = 0,
    throws = false,
    blocked = false;
  const prepare = vi.fn(async () => {}),
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
      myEndlessTravelAccess: { iter: () => [] },
    },
    reducers: { prepareProceduralBoss: prepare },
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
    prepare,
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
  it("uses a single account view across repeated reads", () => {
    const h = harness();
    h.api.proceduralMapState();
    expect(h.api.proceduralMapState().ready).toBe(false);
    h.subscriptions[0].applied();
    expect(h.api.proceduralMapState().ready).toBe(true);
    expect(h.subscriptions).toHaveLength(1);
  });
  it("waits for unlock hydration without creating shared bosses", () => {
    const h = harness();
    h.api.proceduralMapState();
    expect(h.prepare).not.toHaveBeenCalled();
    h.subscriptions[0].applied();
    h.api.proceduralMapState();
    h.api.proceduralMapState();
    expect(h.prepare).not.toHaveBeenCalled();
    h.disconnect();
    expect(h.api.proceduralMapState().ready).toBe(false);
  });
  it("unsubscribes an abandoned pending connection when its late response arrives", () => {
    const h = harness();
    h.api.proceduralMapState();
    h.disconnect();
    h.api.proceduralMapState();
    h.subscriptions[0].applied();
    expect(h.subscriptions[0].ended).toBe(true);
    expect(h.api.proceduralMapState().ready).toBe(false);
  });
  it("backs off and recovers from synchronous and asynchronous subscription failures", () => {
    vi.useFakeTimers();
    const h = harness();
    h.setThrows(true);
    expect(() => h.api.proceduralMapState()).not.toThrow();
    h.setThrows(false);
    h.api.proceduralMapState();
    expect(h.subscriptions).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    h.api.proceduralMapState();
    h.subscriptions[0].fail();
    vi.advanceTimersByTime(3000);
    h.api.proceduralMapState();
    h.subscriptions[1].applied();
    expect(h.api.proceduralMapState().ready).toBe(true);
    expect(h.failure).toHaveBeenCalledTimes(2);
  });
  it("uses saved unlocks", () => {
    const h = harness();
    expect(h.api.proceduralMapUnlocked("endless_2")).toBe(false);
    h.setCompleted(1);
    expect(h.api.proceduralMapUnlocked("endless_2")).toBe(true);
    h.api.proceduralMapState();
    h.subscriptions[0].applied();
    h.setBlocked(true);
    expect(h.api.proceduralMapState().ready).toBe(false);
  });
  it("never sends a boss preparation reducer", () => {
    const h = harness();
    h.api.proceduralMapState(); h.subscriptions[0].applied();
    for (let call = 0; call < 40; call++) h.api.proceduralMapState();
    expect(h.subscriptions).toHaveLength(1);
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
