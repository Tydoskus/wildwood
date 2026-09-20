import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// spacetimedb/src/index.ts is the module entry: every reducer, procedure, view
// and table declaration has to live here, because they are the published
// schema and the test fixtures address them by name. Nothing else has to. On
// 2026-09-20 the file was 11,576 lines; five extractions moved the shared-boss
// combat, guest claiming and identity removal, one-time migrations, presence
// and motion sync, and duels into their own modules, leaving 6,846.
//
// What must remain is the schema surface: 173 reducers, 25 procedures, 27
// views and 89 tables, the schema registration and the imports. Written as
// thin declarations that is roughly 3,500 lines, which is the target below.
// Everything between here and there is a body that belongs in a module.
//
// Lower MAX_LINES as extractions land. Raising it means a declaration genuinely
// had to be added to the schema surface, and the raise is that declaration
// alone. Growth without an extraction first is the drift this guard stops.
// Do not satisfy it by minifying or removing useful comments/whitespace.
// 6_877: kill gems added two tables, one reducer declaration, the factory
// instance and a three-line call inside recordEnemyDefeats; the kill-claim
// review table added its registration line. Bodies live in kill-gems.ts and
// enemy-defeats.ts; the raise is the schema surface alone.
// 6_879: duel replay sharing added one reducer declaration and its separator.
const MAX_LINES = 6_914;
const TARGET_LINES = 3_500;

describe("server module boundary", () => {
  it("never grows past its last recorded size", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const lineCount = source.split(/\r?\n/).length - Number(source.endsWith("\n"));

    expect(lineCount).toBeLessThanOrEqual(MAX_LINES);
  });

  it("records how far the entry module still is from its schema-surface floor", () => {
    // Fails once index.ts is down to its declarations, as a prompt to replace
    // this ratchet with a strict assertion at the measured floor.
    expect(MAX_LINES).toBeGreaterThan(TARGET_LINES);
  });
});
