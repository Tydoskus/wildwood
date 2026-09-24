import { describe, expect, it, vi } from "vitest";
import type { DbConnection } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import { startBaseSubscription, type BaseSubscriptionHandlers } from "./base-subscription";

vi.mock("../../module_bindings", () => ({ tables: new Proxy({}, {
  get: (_target, name) => ({ name, where: () => ({ name, filtered: true }) }),
}) }));

function fixture() {
  const requests: { queries: { name: string; filtered?: boolean }[]; applied: () => void }[] = [];
  const rows: Record<string, unknown[]> = {};
  const handled: string[] = [];
  const bound = new Set<string>();
  const handlers = new Proxy({}, { get: (_target, name) => () => handled.push(String(name)) }) as BaseSubscriptionHandlers;
  const connection = {
    db: new Proxy({}, { get: (_target, name) => ({
      iter: () => rows[String(name)] ?? [],
      onInsert() { bound.add(String(name)); }, onUpdate() {}, onDelete() {},
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
  return { requests, rows, handled, bound, ready, subscription };
}

/** Every world table the connection binds handlers to. It must not pull them
 * for anyone but us: the per-map rows are the presence service's. */
const WORLD_BOUND_TABLES = ["player", "playerMotionIdentity", "playerMotionDetailFrame", "playerMapFrame", "playerDeathFrame"];
const PER_MAP_TABLES = ["playerMotionDetailFrame", "playerMapFrame", "playerDeathFrame"];

describe("account and gameplay query scopes", () => {
  it("loads only the saved character/account on the sign-in screen", () => {
    const f = fixture();
    f.subscription.refresh(false);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].queries.map(q => q.name)).toEqual(["playerProfile", "playerProgress", "playerAccountStatus"]);
  });

  it("hydrates private history without shared boss subscriptions", () => {
    const f = fixture();
    f.subscription.refresh(true);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].queries.some(q => /Boss|Result/.test(q.name))).toBe(false);
    f.rows.myCutsceneHistory = [{}]; f.requests[0].applied();
    expect(f.handled).toContain("cutsceneHistory");
    expect(f.ready).toHaveBeenCalledOnce();
    f.subscription.refresh(true);
    expect(f.requests).toHaveLength(1);
  });
});

describe("world state on the root connection", () => {
  it("binds a handler to every world table, so the map subscription's rows reach the game", () => {
    const f = fixture();
    f.subscription.refresh(true);
    for (const table of WORLD_BOUND_TABLES) expect(f.bound.has(table), table).toBe(true);
  });

  it("takes only our own player rows and leaves the per-map tables to the map subscription", () => {
    const f = fixture();
    f.subscription.refresh(true);
    const game = f.requests[0].queries;
    // An unfiltered player or motion-identity query here would grow with every
    // player online, not the ones on our map.
    for (const name of ["player", "playerMotionIdentity"]) {
      const queries = game.filter(q => q.name === name);
      expect(queries.length, name).toBeGreaterThan(0);
      expect(queries.every(q => q.filtered), name).toBe(true);
    }
    expect(game.filter(q => PER_MAP_TABLES.includes(q.name))).toEqual([]);
    // A map change swaps the presence service's queries, not this set.
    f.subscription.refresh(true);
    expect(f.requests).toHaveLength(1);
  });

  it("carries the windows that open away from their own map", () => {
    const f = fixture();
    f.subscription.refresh(true);
    const game = f.requests[0].queries;
    // Prestige asks for cleared Endless stages and opens from anywhere, so
    // reading that count must not depend on standing on an Endless map.
    for (const name of ["proceduralProgress", "playerPrestige"]) {
      expect(game.some(q => q.name === name), name).toBe(true);
    }
  });
});
