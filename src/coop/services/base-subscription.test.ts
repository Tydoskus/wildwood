import { describe, expect, it, vi } from "vitest";
import type { DbConnection } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import { startBaseSubscription, type BaseSubscriptionHandlers } from "./base-subscription";

vi.mock("../../module_bindings", () => ({ tables: new Proxy({}, {
  get: (_target, name) => ({ name, where: () => ({ name }) }),
}) }));

function fixture() {
  const requests: { queries: { name: string }[]; applied: () => void }[] = [];
  const rows: Record<string, unknown[]> = {};
  const handled: string[] = [];
  const handlers = new Proxy({}, { get: (_target, name) => () => handled.push(String(name)) }) as BaseSubscriptionHandlers;
  const connection = {
    db: new Proxy({}, { get: (_target, name) => ({
      iter: () => rows[String(name)] ?? [],
      onInsert() {}, onUpdate() {}, onDelete() {},
    }) }),
    subscriptionBuilder() {
      let applied = () => {};
      const builder = {
        onApplied(fn: () => void) { applied = fn; return builder; },
        onError() { return builder; },
        subscribe(queries: { name: string }[]) {
          requests.push({ queries, applied });
          return { unsubscribeThen(fn: () => void) { fn(); }, unsubscribe() {}, isActive: () => true, isEnded: () => false };
        },
      };
      return builder;
    },
  } as unknown as DbConnection;
  const ready = vi.fn();
  const subscription = startBaseSubscription({
    connection, identity: {} as Identity, includeDeveloperTables: false,
    onLoading() {}, isCurrent: () => true, isPresenceSubscriptionTransitioning: () => false,
    batch: fn => fn(), handlers, onHydrated: ready, onError: error => { throw error; }, afterHydrated() {},
  });
  return { requests, rows, handled, ready, subscription };
}

describe("account and gameplay query scopes", () => {
  it("loads only the saved character/account on the sign-in screen", () => {
    const f = fixture();
    f.subscription.refresh(false, "tutorial_forest");
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].queries.map(q => q.name)).toEqual(["playerProfile", "playerProgress", "playerAccountStatus"]);
  });

  it("subscribes to only the map's boss and seeds private history before its results", () => {
    const f = fixture();
    f.subscription.refresh(true, "beginner_desert");
    expect(f.requests[0].queries.some(q => /Boss/.test(q.name))).toBe(false);
    expect(f.requests[0].queries.some(q => q.name === "spiderResult")).toBe(true);
    expect(f.requests[1].queries.map(q => q.name)).toEqual(["spiderBoss"]);
    f.rows.spiderResult = [{}];
    f.requests[1].applied();
    expect(f.handled).not.toContain("spiderResult");
    f.rows.myCutsceneHistory = [{}];
    f.requests[0].applied();
    expect(f.handled.indexOf("cutsceneHistory")).toBeLessThan(f.handled.indexOf("spiderResult"));
    expect(f.ready).toHaveBeenCalledOnce();
    f.subscription.refresh(true, "water_reach");
    expect(f.requests[2].queries.map(q => q.name)).toEqual(["tidewyrmBoss"]);
  });
});
