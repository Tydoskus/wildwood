#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createReleaseApi, mapLimit } from "./releases/rollout.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const database = process.env.WILDSTAT_ROOT_DATABASE ?? "wildwood-coop";
const host = process.env.WILDSTAT_RELEASE_HOST ?? "https://maincloud.spacetimedb.com";
const spacetimeBin = process.env.WILDSTAT_SPACETIME_BIN ?? "spacetime";
const preflightOnly = process.argv.includes("--preflight");
// Every player is disconnected and reconnects. One reconnect covers any number
// of schema changes, so batch schema debt into a single flagged release.
const allowClientBreak = process.argv.includes("--allow-client-break");

function fail(message) {
  throw new Error(message);
}

function readOperatorToken() {
  if (process.env.WILDSTAT_SHARD_OPERATOR_TOKEN) return process.env.WILDSTAT_SHARD_OPERATOR_TOKEN;
  const result = spawnSync(spacetimeBin, [
    "sql", database,
    "SELECT token FROM shard_coordinator_connection WHERE id = 0",
    "--server", "maincloud", "--format", "json",
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  if (result.error) fail(`Could not run ${spacetimeBin}: ${result.error.message}`);
  if (result.status !== 0) fail("Could not read the deployment credential. Log in with the SpacetimeDB CLI first.");
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    fail("The SpacetimeDB CLI did not return a readable deployment credential.");
  }
  const token = payload.flatMap(section => section.rows ?? [])[0]?.[0];
  if (typeof token !== "string" || token.length < 10) fail("No shard operator credential was found in the root database.");
  return token;
}

async function loadProgram(path, label) {
  const program = await readFile(resolve(root, path), "utf8");
  if (!program.trim()) fail(`${label} build is empty: ${path}`);
  return program;
}

async function main() {
  const token = readOperatorToken();
  const programs = {
    root: await loadProgram("spacetimedb/dist/bundle.js", "Root server"),
    maps: await loadProgram("spacetimedb-map/dist/bundle.js", "Map server"),
  };
  const api = createReleaseApi({ host, database, token, allowClientBreak });
  const maps = (await api.sql("SELECT database_name FROM map_shard WHERE state = 'ready'")).map(row => row[0]);

  console.log(`Checking root server and ${maps.length} ready map server${maps.length === 1 ? "" : "s"}...`);
  await api.preflight(database, programs.root);
  // Check every map before giving up on any: one shed upload out of a hundred
  // used to discard the eighty-eight good answers that came before it.
  const unchecked = [];
  await mapLimit(maps, 3, async name => {
    try {
      await api.preflight(name, programs.maps);
      console.log(`  compatible: ${name}`);
    } catch (error) {
      unchecked.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (unchecked.length) {
    fail(`${unchecked.length} of ${maps.length} map servers could not be checked. Nothing was published.\n  ${unchecked.join("\n  ")}`);
  }
  console.log(allowClientBreak
    ? "Preflight passed. A client break is ALLOWED: publishing disconnects every player, who then reconnects."
    : "Preflight passed: no manual migration, client break, or data deletion is required.");
  if (preflightOnly) return;

  console.log("Publishing root server...");
  await api.publish(database, programs.root);
  console.log("Root server published.");
  console.log("Staging map server for new shards...");
  await api.stageMapProgram(programs.maps);
  const currentMaps = (await api.sql("SELECT database_name FROM map_shard WHERE state = 'ready'")).map(row => row[0]);
  console.log(`Publishing ${currentMaps.length} ready map server${currentMaps.length === 1 ? "" : "s"}...`);
  await mapLimit(currentMaps, 3, async name => {
    await api.publish(name, programs.maps);
    console.log(`  published: ${name}`);
  });

  const release = {
    database,
    host,
    root: database,
    maps: currentMaps,
    publishedAt: new Date().toISOString(),
  };
  const outputDir = resolve(root, "local-data/releases");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "latest-server-release.json"), `${JSON.stringify(release, null, 2)}\n`);
  console.log(`Server publish complete. Saved ${resolve(outputDir, "latest-server-release.json")}.`);
}

main().catch(error => {
  console.error(`Server publish stopped: ${error.message}`);
  process.exitCode = 1;
});
