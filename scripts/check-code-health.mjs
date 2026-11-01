#!/usr/bin/env node
/**
 * Code-health ratchets: size budgets for the three composition roots and the
 * import-cycle checks for shared/ and spacetimedb/src. They hold structure, not
 * behaviour, so they run here (npm run check:code-health, and inside
 * npm run check:release) instead of in the unit suite.
 *
 * Lower the numbers as extractions land. Never satisfy them by packing code onto
 * longer lines, minifying or deleting useful comments: extract a named module
 * instead. Each raise is recorded in its commit message. History from before
 * this script is in `git log -p` on src/main-boundary.test.ts,
 * src/coop/wildstat-coop-boundary.test.ts and spacetimedb/src/index-boundary.test.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sharedModuleState } from "./shared-bundle-state.mjs";

const root = resolve(import.meta.dirname, "..");
const failures = [];
let checks = 0;

function check(name, ok, detail) {
  checks++;
  if (!ok) failures.push(`${name}\n    ${detail}`);
}

function measureSource(path) {
  const source = readFileSync(join(root, path), "utf8");
  const lines = source.split(/\r?\n/);
  return {
    source,
    lines: lines.length - Number(source.endsWith("\n")),
    linesOver160: lines.filter(line => line.length > 160).length,
    linesOver300: lines.filter(line => line.length > 300).length,
    bytes: Buffer.byteLength(source, "utf8"),
  };
}

function atMost(name, actual, limit, unit) {
  check(name, actual <= limit, `expected ${actual} ${unit} to be at most ${limit}`);
}

function below(name, actual, limit, unit) {
  check(name, actual < limit, `expected ${actual} ${unit} to be below ${limit}`);
}

// src/main.ts has no exports. src/main-boot.test.ts runs its composition, but
// nothing else can see its wiring, so these ratchets hold its size down.
{
  const MAX_LINES = 940;
  const MAX_LINES_OVER_160 = 2;
  const MAX_LINES_OVER_300 = 0;
  const MAX_BYTES = 51_502;
  const main = measureSource("src/main.ts");
  const at = "game composition boundary (src/main.ts)";
  // Intentional agent-context budget, as for wildstat-coop.ts: extract focused modules when this grows.
  below(`${at}: keeps the composition root below 1,000 lines`, main.lines, 1_000, "lines");
  atMost(`${at}: never grows past its last recorded size`, main.lines, MAX_LINES, "lines");
  atMost(`${at}: adds no long lines, so the line ratchet cannot be dodged by packing`, main.linesOver160, MAX_LINES_OVER_160, "lines over 160 characters");
  atMost(`${at}: adds no long lines, so the line ratchet cannot be dodged by packing`, main.linesOver300, MAX_LINES_OVER_300, "lines over 300 characters");
  atMost(`${at}: never grows past its byte budget`, main.bytes, MAX_BYTES, "bytes");

  // A callback that takes fewer arguments still type-checks, so dropping the
  // attacker here would leave Reflect dead against every melee enemy.
  // Goes once scenario COMBAT-12 covers Reflect in a running game.
  check("game composition wiring (src/main.ts): hands the enemy that struck to the player's damage, so Reflect can answer it",
    /\(amount, source\) => playerCombat\.damagePlayer\(amount, source\)/.test(main.source),
    "expected src/main.ts to contain (amount, source) => playerCombat.damagePlayer(amount, source)");
}

// Lower the long-line and byte numbers as extractions land; never raise them.
{
  const MAX_LINES_OVER_160 = 14;
  const MAX_LINES_OVER_300 = 0;
  const MAX_BYTES = 44_510;
  const coop = measureSource("src/wildstat-coop.ts");
  const at = "wildstat coop composition boundary (src/wildstat-coop.ts)";
  // Intentional agent-context budget: extract focused modules when this grows.
  below(`${at}: keeps the browser-facing facade below 1,000 lines`, coop.lines, 1_000, "lines");
  atMost(`${at}: adds no long lines, so the line limit cannot be dodged by packing`, coop.linesOver160, MAX_LINES_OVER_160, "lines over 160 characters");
  atMost(`${at}: adds no long lines, so the line limit cannot be dodged by packing`, coop.linesOver300, MAX_LINES_OVER_300, "lines over 300 characters");
  atMost(`${at}: never grows past its byte budget`, coop.bytes, MAX_BYTES, "bytes");
}

// spacetimedb/src/index.ts is the module entry: every reducer, procedure, view
// and table declaration has to live here, because they are the published
// schema and the test fixtures address them by name. Nothing else has to.
//
// What must remain is the schema surface: 173 reducers, 25 procedures, 27
// views and 89 tables, the schema registration and the imports. Written as
// thin declarations that is roughly 3,500 lines, which is the target below.
// Everything between here and there is a body that belongs in a module.
//
// Raising MAX_LINES means a declaration genuinely had to be added to the schema
// surface, and the raise is that declaration alone. Growth without an
// extraction first is the drift this guard stops.
{
  const MAX_LINES = 4_625;
  const TARGET_LINES = 3_500;
  const index = measureSource("spacetimedb/src/index.ts");
  const at = "server module boundary (spacetimedb/src/index.ts)";
  atMost(`${at}: never grows past its last recorded size`, index.lines, MAX_LINES, "lines");
  // Fails once index.ts is down to its declarations, as a prompt to replace
  // this ratchet with a strict check at the measured floor.
  check(`${at}: records how far the entry module still is from its schema-surface floor`,
    MAX_LINES > TARGET_LINES, `expected MAX_LINES ${MAX_LINES} to be greater than TARGET_LINES ${TARGET_LINES}`);
}

// Runtime imports between sibling .ts files. Type-only imports are erased, so
// they cannot loop. A cycle can leave a module half-initialised at load (the
// server build warns on them).
// shared/ matches statements at the start of a line; spacetimedb/src at any word boundary.
const IMPORT_PATTERNS = {
  "shared": /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"](\.\/[^'"]+)['"]/g,
  "spacetimedb/src": /\b(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?["'](\.\/[^"']+)["']/g,
};

function runtimeImports(dir, files, name, pattern) {
  const known = new Set(files);
  const source = readFileSync(join(dir, name), "utf8");
  const found = new Set();
  for (const match of source.matchAll(pattern)) {
    if (match[1]) continue;
    const target = match[2].slice(2).replace(/\.js$/, "");
    for (const candidate of [target, `${target}.ts`]) if (known.has(candidate)) found.add(candidate);
  }
  return found;
}

function importCycles(relativeDir) {
  const dir = join(root, relativeDir);
  const files = readdirSync(dir).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"));
  const edges = new Map(files.map(name => [name, runtimeImports(dir, files, name, IMPORT_PATTERNS[relativeDir])]));
  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (name) => {
    state.set(name, "open");
    stack.push(name);
    for (const next of edges.get(name) ?? []) {
      if (state.get(next) === "open") cycles.push([...stack.slice(stack.indexOf(next)), next].join(" -> "));
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const name of files) if (!state.has(name)) visit(name);
  return { edges, cycles };
}

for (const dir of ["shared", "spacetimedb/src"]) {
  const { edges, cycles } = importCycles(dir);
  if (dir === "spacetimedb/src") {
    // Proves the import reader still sees this module's imports.
    check("server import graph: reads the module's imports", edges.get("player-power.ts")?.has("player-join-date.ts"),
      "expected player-power.ts to import player-join-date.ts");
  }
  check(`${dir}: imports one another without cycles`, cycles.length === 0,
    `found ${cycles.length} import cycle(s):\n    ${cycles.join("\n    ")}`);
}

// coop-client.js and game.js each get their own copy of a module both import,
// so state one bundle writes is invisible to the other (refine looks and chat
// portraits broke this way). Shared state goes on the page (globalThis, as in
// after-entry.ts) or through the co-op API; anything else is listed here.
{
  const ALLOWED = {
    "shared/campaign-combat.ts": "per-bundle cache of authored map data",
    "shared/compact-number.ts": "notation set and read by the game only; the coop build drops it",
    "shared/enemy-defeats.ts": "per-bundle caches keyed by map",
    "shared/item-tier.ts": "filled once at load from constants",
    "shared/map-balance-runtime.ts": "installed and read by the game only; the coop build drops it",
    "shared/procedural-maps.ts": "per-bundle cache keyed by level",
    "shared/regular-enemy-simulation.ts": "scratch buffer",
    "shared/rules.ts": "BOSS_RULES installed and read by the game only",
    "src/app/changelog.ts": "per-bundle cache of the sorted release notes",
    "src/app/after-entry.ts": "flag on the page; the held queue is per bundle by design",
    "src/app/avatar-frames.ts": "the game binds to coop.applyAvatarFrame; the cache lives in coop",
    "src/app/player-name-tags.ts": "the game binds to the coop provider; tags live in coop",
    "src/app/version.ts": "coop checks only when game.js failed to load",
    "src/coop/services/connection-diagnostic-runtime.ts": "collector stored on the page",
    "src/ui/card-found-setting.ts": "game only; the coop build drops it",
    "src/ui/chat-timestamp-setting.ts": "game only; the coop build drops it",
    "src/ui/damage-number-setting.ts": "game only; the coop build drops it",
    "src/ui/enemy-hp-setting.ts": "game only; the coop build drops it",
    "src/ui/name-plate-setting.ts": "game only; the coop build drops it",
    "src/ui/release-notes-unread.ts": "read mark and indicators stored on the page",
    "src/ui/stat-popup-setting.ts": "game only; the coop build drops it",
  };
  const shared = sharedModuleState(root, ["src/main.ts", "src/wildstat-coop.ts"]);
  const stateful = shared.filter(module => module.state.length > 0);
  const at = "client bundles (src/main.ts, src/wildstat-coop.ts)";
  // Proves the import reader still follows both graphs.
  check(`${at}: finds the modules both bundles import`, shared.some(module => module.path === "src/app/after-entry.ts"),
    "expected src/app/after-entry.ts to be reachable from both entries");
  const unlisted = stateful.filter(module => !ALLOWED[module.path]);
  check(`${at}: keep no module state that one bundle could write and the other miss`, unlisted.length === 0,
    `put it on the page or behind the co-op API, or allow it in ALLOWED with a reason:\n    ${
      unlisted.map(module => `${module.path}: ${module.state.join(", ")}`).join("\n    ")}`);
  const stale = Object.keys(ALLOWED).filter(path => !stateful.some(module => module.path === path));
  check(`${at}: allow only modules that still share state`, stale.length === 0,
    `remove from ALLOWED:\n    ${stale.join("\n    ")}`);
}

if (failures.length) {
  console.error(`Code health: ${failures.length} of ${checks} checks failed.\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}
console.log(`Code health: all ${checks} checks pass.`);
