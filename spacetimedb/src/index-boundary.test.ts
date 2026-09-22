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
// 7_005: keeping supporter memberships current needs a schedule the server owns,
// so the patreon_sweep_schedule table and the sweep_patreon_memberships
// procedure had to join the schema surface. Both bodies live in patreon.ts,
// including the row that seeds the schedule; the raise is the declarations alone.
// 6_623: map sharding was deleted outright (2026-09-21). Its 13 reducers, two
// procedures, one view, 17 tables and every shard-only branch left with it, so
// the schema-surface counts above are that much smaller too.
// 6_650: offline progress added one table registration, the my_offline_progress
// view, the acknowledge_offline_summary and simulate_time_away reducers, and
// the port object naming the four entry-module helpers the payout reads. Every
// body — the window stamp, the grant, the developer backdate — lives in
// offline-progress.ts, and the model itself in shared/offline-progress.ts.
// 6_666: the offline-progress opt-out added its table registration, the
// caller-scoped view that lets a client read its own setting, and the reducer
// that writes it. The row, its default and the write live in
// offline-preference.ts; the raise is the schema surface alone.
// 6_679: the account's own legal-consent view. Acceptance already lived on the
// server, but the client decided whether to ask from a token-scoped cache, so
// the same account was asked its age again on every new device. Reading it
// needs a caller-scoped view; the raise is that declaration alone.
// 6_725: the privacy erasure reducer. It is one declaration plus the argument
// validation and audit that must happen in the same transaction as the sweep;
// the table list, the row budget and the sweep itself live in
// account-erasure.ts.
const MAX_LINES = 6_725;
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
