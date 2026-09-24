#!/usr/bin/env node
// Guards the client's generated table bindings against the failure that
// stranded 0.797 tabs on 2026-09-23: a column added to a table the client
// reads, with PROTOCOL_VERSION unchanged. Old bundles passed registerProtocol,
// then could not decode the subscription snapshot and retried for hours.
//
//   node scripts/subscribed-schema.mjs            check (part of check:release)
//   node scripts/subscribed-schema.mjs --stamp    record the current columns
//
// A changed column list on an existing table needs a PROTOCOL_VERSION bump
// (old clients are then turned away at registerProtocol and reload). New or
// removed tables are safe and only need a restamp.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const bindings = resolve(root, "src/module_bindings");
const stampPath = resolve(root, "config/subscribed-schema.json");

async function protocolVersion() {
  const rules = await readFile(resolve(root, "shared/rules.ts"), "utf8");
  const match = rules.match(/export const PROTOCOL_VERSION = (\d+);/);
  if (!match) throw new Error("PROTOCOL_VERSION not found in shared/rules.ts");
  return Number(match[1]);
}

export async function currentTables() {
  const tables = {};
  for (const file of (await readdir(bindings)).filter(name => name.endsWith("_table.ts")).sort()) {
    const source = await readFile(resolve(bindings, file), "utf8");
    const body = source.match(/__t\.row\(\{([\s\S]*?)\n\}\);/);
    if (!body) throw new Error(`Unrecognised binding layout: src/module_bindings/${file}`);
    tables[file.replace(/_table\.ts$/, "")] = [...body[1].matchAll(/^\s+([A-Za-z0-9_]+):/gm)].map(match => match[1]);
  }
  return tables;
}

export function changedTables(stamped, current) {
  return Object.keys(current).filter(name => name in stamped && stamped[name].join(",") !== current[name].join(","));
}

async function main() {
  const stamp = process.argv.includes("--stamp");
  const protocol = await protocolVersion();
  const tables = await currentTables();
  let previous = null;
  try { previous = JSON.parse(await readFile(stampPath, "utf8")); } catch {}
  const changed = previous ? changedTables(previous.tables, tables) : [];
  const unversioned = previous && previous.protocolVersion === protocol ? changed : [];
  if (unversioned.length) {
    throw new Error(`Columns changed on ${unversioned.join(", ")} without a PROTOCOL_VERSION bump (still ${protocol}). `
      + "Clients running the previous bundle cannot decode these tables and retry forever. Bump PROTOCOL_VERSION in "
      + "shared/rules.ts, then run: node scripts/subscribed-schema.mjs --stamp");
  }
  if (stamp) {
    await writeFile(stampPath, `${JSON.stringify({ protocolVersion: protocol, tables }, null, 2)}\n`);
    console.log(`Stamped ${Object.keys(tables).length} tables at protocol ${protocol}.`);
    return;
  }
  if (!previous) throw new Error("config/subscribed-schema.json is missing. Run: node scripts/subscribed-schema.mjs --stamp");
  const added = Object.keys(tables).filter(name => !(name in previous.tables));
  const removed = Object.keys(previous.tables).filter(name => !(name in tables));
  if (changed.length || added.length || removed.length || previous.protocolVersion !== protocol) {
    throw new Error(`Table bindings differ from config/subscribed-schema.json (${[...added.map(n => `+${n}`), ...removed.map(n => `-${n}`), ...changed].join(", ") || `protocol ${previous.protocolVersion} → ${protocol}`}). `
      + "These are safe; record them with: node scripts/subscribed-schema.mjs --stamp");
  }
  console.log(`Table bindings match protocol ${protocol}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
