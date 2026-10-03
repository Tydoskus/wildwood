// End-to-end smoke test against a running SpacetimeDB with this module
// published: a new guest connects, registers the protocol, accepts the terms,
// enters the world, reports one kill, and must then receive its own player and
// progress rows with the kill counted.
// Unit tests run the reducers against an in-memory stand-in; this is the one
// check that goes through the real host, wire format and visibility rules.
//
//   npx tsx scripts/smoke-server.mts <ws-uri> <database>
import { DbConnection } from "../src/module_bindings/index.ts";
import { PROTOCOL_VERSION } from "../shared/rules.ts";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../shared/legal.ts";
import { enemyDefeatDefinition } from "../shared/enemy-defeats.ts";
import { ENEMY_TYPES } from "../shared/enemy-definitions.ts";

const [uri = "ws://127.0.0.1:3000", database = "wildstat-smoke"] = process.argv.slice(2);
const fail = (message: string) => { console.error(`Smoke test failed: ${message}`); process.exit(1); };
setTimeout(() => fail("timed out after 60 s"), 60_000).unref();

DbConnection.builder().withUri(uri).withDatabaseName(database)
  .onConnectError((_connection, error) => fail(`could not connect: ${error}`))
  .onConnect((connection, identity) => {
    void (async () => {
      const step = async (name: string, call: () => Promise<unknown>) => {
        try { await call(); } catch (error) { fail(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
        console.log(`ok  ${name}`);
      };
      await step("register protocol", () => connection.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION }));
      await step("accept terms", () => connection.reducers.acceptTerms({ termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT }));
      await step("enter world", () => connection.reducers.enterWorldWithTutorial({ tabId: "smoke-test", forceTakeover: false }));
      await step("begin adventure", () => connection.reducers.beginAdventure({}));
      const me = `0x${identity.toHexString().replace(/^0x/, "")}`;
      connection.subscriptionBuilder()
        .onError((context) => fail(`subscription: ${context.event?.message ?? "rejected"}`))
        .onApplied(() => void (async () => {
          const mine = <T extends { identity: { toHexString(): string } }>(rows: Iterable<T>) =>
            [...rows].find(row => row.identity.toHexString() === identity.toHexString());
          const player = mine(connection.db.player.iter());
          if (!player) fail("no player row after entering the world");
          if (!mine(connection.db.playerProgress.iter())) fail("no progress row after entering the world");
          console.log(`ok  own player and progress rows arrived (on ${player!.mapId})`);
          const enemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition(player!.mapId, kind));
          if (!enemy) fail(`no enemy to report on ${player!.mapId}`);
          await step(`report a ${enemy} kill`, () => connection.reducers.reportEnemyDefeats({
            streamId: "smoke-test-stream-0001", sequence: 1n, mapId: player!.mapId, simulatedMillis: 30_000, enemies: [{ enemy: enemy!, count: 1 }],
          }));
          const kills = mine(connection.db.playerLifetime.iter())?.enemyKills ?? 0n;
          if (kills !== 1n) fail(`lifetime kills read ${kills} after one accepted kill`);
          console.log("ok  the kill was counted");
          connection.disconnect();
          process.exit(0);
        })())
        .subscribe([
          `SELECT * FROM player WHERE identity = ${me}`,
          `SELECT * FROM player_progress WHERE identity = ${me}`,
          `SELECT * FROM player_lifetime WHERE identity = ${me}`,
        ]);
    })();
  })
  .build();
