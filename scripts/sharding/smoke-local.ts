/** Real admission/isolation smoke test. Cloud runs require an isolated validation database. */
import assert from "node:assert/strict";
import { DbConnection, tables } from "../../src/module_bindings";
import { PROTOCOL_VERSION } from "../../shared/rules";
import { TERMS_VERSION, AGE_BAND_ADULT } from "../../shared/legal";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../shared/map-editor-overrides";
const host = process.env.WILDSTAT_SHARD_HOST ?? "ws://127.0.0.1:3107";
const database = process.env.WILDSTAT_ROOT_DATABASE ?? "wildstat-shard-root-test";
const cloudValidation = host === "wss://maincloud.spacetimedb.com" && /^wildstat-shard-validation-\d+$/.test(database);
if (!cloudValidation && !/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Smoke tests require an isolated test database");
const connections: DbConnection[] = [];
async function waitFor<T>(read: () => T | null | false | undefined, timeout = 90_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for shard state");
}
function connect(name: string, token?: string) {
  return new Promise<{ conn: DbConnection; token: string }>((resolve, reject) => {
    const conn = DbConnection.builder().withUri(host).withDatabaseName(name).withToken(token)
      .onConnect((conn, _identity, token) => resolve({ conn, token }))
      .onConnectError((_ctx, error) => reject(error)).build();
    connections.push(conn);
  });
}
function subscribe(conn: DbConnection, queries: any[]) {
  return new Promise<void>((resolve, reject) => conn.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event)).subscribe(queries));
}
try {
  const players = [];
  for (let n = 0; n < 11; n++) {
    const player = await connect(database);
    await player.conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
    await player.conn.reducers.acceptTerms({ termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
    await player.conn.reducers.enterWorld({ tabId: `shard-smoke-${n}` });
    await subscribe(player.conn, [tables.myMapShardRoute]);
    players.push(player);
  }
  const routes = await Promise.all(players.map(player => waitFor(() => [...player.conn.db.myMapShardRoute.iter()].find(row => row.ready))));
  const occupancy = new Map<string, number>();
  for (const route of routes) occupancy.set(route.databaseName, (occupancy.get(route.databaseName) ?? 0) + 1);
  assert.deepEqual([...occupancy.values()].sort((a, b) => b - a), [10, 1]);
  const regions: DbConnection[] = [];
  for (const [n, player] of players.entries()) {
    const joined = await connect(routes[n].databaseName, player.token);
    await joined.conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
    await joined.conn.reducers.enterWorld({ tabId: `shard-smoke-${n}` });
    await subscribe(joined.conn, [tables.player, tables.dragonBoss]);
    regions.push(joined.conn);
  }
  assert.equal(regions[0].db.player.count(), 10n);
  assert.equal(regions[10].db.player.count(), 1n);
  await regions[0].reducers.updateMovementState({ x: 500, y: 500, vx: 0, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1 });
  await assert.rejects(players[0].conn.reducers.updateMovementState({ x: 500, y: 500, vx: 0, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1 }));
  const ownIdentity = players[0].conn.identity!;
  await subscribe(players[0].conn, [tables.playerProgress.where(row => row.identity.eq(ownIdentity))]);
  const progress = players[0].conn.db.playerProgress.identity.find(ownIdentity)!;
  // Supply valid arguments so the rejection proves the regional capability
  // boundary, rather than a client-side serialization failure.
  await assert.rejects(regions[0].reducers.savePlayerProgress({ ...progress, enemyKills: 0 }));
  const otherHp = [...regions[10].db.dragonBoss.iter()][0].hp;
  const ownHp = [...regions[0].db.dragonBoss.iter()][0].hp;
  const bossPosition = MAP_EDITOR_GAMEPLAY_OVERRIDES.tutorial_forest?.boss ?? { x: 4040, y: 4240 };
  await regions[0].reducers.damageDragonFromPosition({ hits: 1, ...bossPosition });
  await waitFor(() => [...regions[0].db.dragonBoss.iter()][0].hp < ownHp, 10_000);
  assert.equal([...regions[10].db.dragonBoss.iter()][0].hp, otherHp);
  regions[0].disconnect();
  const rejoined = await connect(routes[0].databaseName, players[0].token);
  await rejoined.conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
  for (let retry = 0; ; retry++) {
    try { await rejoined.conn.reducers.enterWorld({ tabId: "shard-smoke-0" }); break; }
    catch (error) { if (retry >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.equal([...players[0].conn.db.myMapShardRoute.iter()][0].generation, routes[0].generation);
  console.log("PASS: 11 accounts route to separate 10/1 databases; movement stays regional; account saves are unavailable in map databases.");
} finally {
  for (const conn of connections) conn.disconnect();
}
