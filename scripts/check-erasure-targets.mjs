#!/usr/bin/env node
/**
 * Erasure is only as complete as its table list, and that list goes stale the
 * moment a table gains an identity column. This regenerates it from the
 * module's published schema and fails if the committed list disagrees.
 *
 * Reads the schema through `spacetime describe`, which needs a logged-in CLI.
 * Pass --server to point at something other than maincloud.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const database = process.env.WILDSTAT_ROOT_DATABASE ?? "wildwood-coop";
const serverIndex = process.argv.indexOf("--server");
const server = serverIndex > 0 ? process.argv[serverIndex + 1] : "maincloud";

const spacetimeBin = process.env.WILDSTAT_SPACETIME_BIN ?? "spacetime";
// The schema runs to several megabytes, well past spawnSync's default buffer.
const described = spawnSync(spacetimeBin, ["describe", database, "--server", server, "--json"],
  { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
if (described.error || described.status !== 0) {
  console.error(`Could not read the schema for ${database}: ${described.error?.message ?? described.stderr}`);
  console.error("Log in with the SpacetimeDB CLI first.");
  process.exit(2);
}

const schema = JSON.parse(described.stdout);
const typespace = schema.sections.find(section => section.Typespace).Typespace.types;
const tables = schema.sections.find(section => section.Tables).Tables.tables ?? schema.sections.find(section => section.Tables).Tables;
const views = new Set((schema.sections.find(section => section.Views)?.Views?.views ?? []).map(view => view.source_name));

const isIdentity = (type) => {
  const elements = type?.Product?.elements;
  return Array.isArray(elements) && elements.length === 1 && elements[0]?.name?.some === "__identity__";
};

const expected = [];
for (const table of tables) {
  // Event tables are delivered and dropped; nothing of a player survives in them.
  if (table.is_event || views.has(table.source_name)) continue;
  const product = typespace[table.product_type_ref]?.Product?.elements ?? [];
  const names = product.map(element => element.name?.some ?? "");
  const columns = product.map((element, index) => isIdentity(element.algebraic_type) ? names[index] : null).filter(Boolean);
  if (!columns.length) continue;
  expected.push(table.source_name);
}
expected.sort();

const source = readFileSync(resolve(root, "spacetimedb/src/account-erasure.ts"), "utf8");
const listed = [...source.matchAll(/\{ table: "(\w+)"/g)].map(match => match[1]).sort();

const missing = expected.filter(name => !listed.includes(name));
const extra = listed.filter(name => !expected.includes(name));

if (missing.length || extra.length) {
  if (missing.length) console.error(`Not erased, but holds an identity: ${missing.join(", ")}`);
  if (extra.length) console.error(`Listed for erasure but no longer in the schema: ${extra.join(", ")}`);
  console.error("Regenerate ERASURE_TARGETS in spacetimedb/src/account-erasure.ts.");
  process.exit(1);
}
console.log(`Erasure covers every one of the ${expected.length} tables that hold a player identity.`);
