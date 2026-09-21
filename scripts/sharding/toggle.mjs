#!/usr/bin/env node
// Turn map sharding on or off on the root database, and nothing else.
//
// scripts/sharding/configure.ts also flips this flag, but only after staging
// the shard program, reconfiguring the coordinator and republishing every
// shard with BreakClients. Flipping the switch on its own is one reducer call
// the server already knows how to unwind: off releases every seated player
// back to the root at their last position, on seats them again. Both are
// reversible in seconds and need no publish.
import { spawnSync } from "node:child_process";

const database = process.env.WILDSTAT_ROOT_DATABASE ?? "wildwood-coop";
const host = process.env.WILDSTAT_RELEASE_HOST ?? "https://maincloud.spacetimedb.com";
const spacetimeBin = process.env.WILDSTAT_SPACETIME_BIN ?? "spacetime";
const wanted = process.argv.includes("--on") ? true : process.argv.includes("--off") ? false : null;
const dryRun = process.argv.includes("--dry-run");
if (wanted === null) {
  console.error("Usage: node scripts/sharding/toggle.mjs --on | --off [--dry-run]");
  process.exit(2);
}

function readOperatorToken() {
  if (process.env.WILDSTAT_SHARD_OPERATOR_TOKEN) return process.env.WILDSTAT_SHARD_OPERATOR_TOKEN;
  const result = spawnSync(spacetimeBin, [
    "sql", database, "SELECT token FROM shard_coordinator_connection WHERE id = 0", "--server", "maincloud", "--format", "json",
  ], { encoding: "utf8", timeout: 120_000 });
  if (result.error) throw new Error(`Could not run ${spacetimeBin}: ${result.error.message}`);
  if (result.status !== 0) throw new Error("Could not read the deployment credential. Log in with the SpacetimeDB CLI first.");
  const token = JSON.parse(result.stdout).flatMap(section => section.rows ?? [])[0]?.[0];
  if (typeof token !== "string" || token.length < 10) throw new Error("No shard operator credential was found in the root database.");
  return token;
}

const args = ["root", wanted, "", 0];
console.log(`${dryRun ? "Would call" : "Calling"} configure_sharding ${JSON.stringify(args)} on ${database} at ${host}`);
if (!dryRun) {
  const token = readOperatorToken();
  const response = await fetch(`${host}/v1/database/${encodeURIComponent(database)}/call/configure_sharding`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`configure_sharding failed (${response.status}): ${await response.text()}`);
  console.log(`Map sharding is now ${wanted ? "ON: players are being seated on shards" : "OFF: every player is back on the root at their last position"}.`);
}
