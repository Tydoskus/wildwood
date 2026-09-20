import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// map_shard_route is the row each client subscribes to for its map database.
// It must follow membership and shard readiness exactly, and change for
// nothing else, because that is what made the per-user view it replaced cost
// a re-evaluation per seated player on every occupancy tick.
function root() {
  const f = crystalFixture();
  f.seed("shardRuntime", { id: 0, role: "root", enabled: true, mapId: "", shardId: 0n });
  f.seed("mapShard", { id: 1n, mapId: "crystal_hollows", databaseName: "shard-1", state: "ready", occupants: 0 });
  f.seed("mapShard", { id: 2n, mapId: "clockwork_ruins", databaseName: "", state: "starting", occupants: 0 });
  return f;
}
const route = (f: ReturnType<typeof crystalFixture>) => f.db.mapShardRoute.identity.find(f.ctx.sender);
// Shard readiness is reported by the coordinator: the module itself, with no client connection.
const operator = (f: ReturnType<typeof crystalFixture>) => ({ ...f.ctx, connectionId: null, databaseIdentity: f.ctx.sender }) as any;
const view = (f: ReturnType<typeof crystalFixture>) => (server.myMapShardRoute as any)(f.ctx);

it("seats a player with a route, follows readiness, and drops it on release", () => {
  const f = root();
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  expect(route(f)).toBeFalsy();
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  expect(route(f)).toMatchObject({ databaseName: "shard-1", mapId: "crystal_hollows", ready: false });
  expect(view(f)).toEqual(route(f));
  const member = f.db.mapShardMember.identity.find(f.ctx.sender);
  f.transaction(() => server.shardMemberReady(operator(f), { identity: f.ctx.sender, generation: member.generation, shardId: 1n }));
  expect(route(f)?.ready).toBe(true);
  f.run(server.changeMap, { mapId: "home_exterior", x: 100, y: 100 });
  expect(route(f)).toBeFalsy();
  expect(view(f)).toBeUndefined();
});

it("refreshes every seated route when a starting shard becomes ready", () => {
  const f = root();
  f.patch("player", { mapId: "clockwork_ruins" });
  f.seed("mapShardMember", { identity: f.ctx.sender, mapId: "clockwork_ruins", shardId: 2n, generation: 5n, ready: true });
  f.seed("mapShardMember", { identity: identity("2"), mapId: "clockwork_ruins", shardId: 2n, generation: 6n, ready: false });
  f.seed("mapShardRoute", { identity: f.ctx.sender, databaseName: "", mapId: "clockwork_ruins", generation: 5n, ready: false });
  f.seed("mapShardRoute", { identity: identity("2"), databaseName: "", mapId: "clockwork_ruins", generation: 6n, ready: false });
  f.db.mapShard.id.update({ ...f.db.mapShard.id.find(2n), databaseName: "shard-2" });
  f.transaction(() => server.shardReady(operator(f), { shardId: 2n }));
  expect(route(f)).toMatchObject({ databaseName: "shard-2", ready: true });
  expect(f.db.mapShardRoute.identity.find(identity("2"))).toMatchObject({ databaseName: "shard-2", ready: false });
});
