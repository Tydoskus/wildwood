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
// 6_729: the leaderboard's Dragon gate and the prestige it now ranks by. Both
// are reads inside refreshLeaderboard, which is the schema-facing snapshot
// builder; the ordering itself lives in leaderboard-pages.ts.
// 6_748: slot upgrade tiers. The table's comment, the key/tier helpers and the
// start reducer's slot handling are the schema surface; the tier track, the
// sweep and the migration live in their own modules.
// 6_756: splitting the item-drop sweep out of the upgrade wipe so a prestige
// can keep slot tiers while still taking the gear, and the comment that says
// why the old line destroyed something it was never written to destroy.
// 6_764: reconciling a running upgrade against its slot rather than against an
// item id it no longer holds, which is what was cancelling every upgrade, and
// the note recording it. Both are guards on the same rekeyed table.
// 6_769: record_enemy_defeats writes the public player row only when the
// compact power a player sees would change, and the note saying why. It was
// broadcasting to everyone on the map on nearly every kill report.
// 6_780: the third paid upgrade slot adds a private unlock table, an
// identity-scoped view and a reducer declaration. The separate table keeps
// the live bench row unchanged so older clients remain connected.
// 6_786: account-wide music and sound-effect volumes add one table
// registration, the caller-scoped my_audio_settings view and the
// set_audio_settings reducer declaration. Validation, the write-on-change
// rule, the guest merge and removal live in audio-settings.ts; the raise is
// the schema surface alone.
// 6_796: random bow skills add the player_bow_skill import, the caller-scoped
// my_bow_skills view, and one roll call on each path that hands out an item
// without passing publishItemDrop (a claimed gift, claimed mail gear) plus the
// world-entry safety net and its note. The table, the roll, the backfill, the
// guest merge, removal and the duel fields live in bow-skills.ts.
// 6_784: duplicate equipment adds two table registrations, the
// my_equipment_copies and my_equipment_offers views, three reducer
// declarations and the factory instance; publish_item_drop and the
// destroy_equipment body moved out to equipment-copies.ts with the tables, the
// offer lifecycle, the guest merge and removal, which more than paid for them.
// 6_794: the loot filter adds one import, the caller-scoped my_ignored_drops
// view and the set_ignored_drops reducer declaration with its note; the table
// registers on the duplicate-equipment line beside the tables it acts on.
// Validation, the offer clearing, the guest merge and removal live in
// ignored-drops.ts; filtering the rolled loot wraps the existing roll call, so
// it costs no line. The raise is the schema surface alone.
// 6_787: Auto keep best and auto equip add the player_loot_setting
// registration, the my_loot_settings view, the set_loot_settings reducer, the
// auto equip factory and its three call sites (loot, boss rewards, prestige).
// save_player_progress's loadout rules and the saved-hand helpers moved out to
// loadout.ts, where auto equip checks the same rules, which paid for all of it.
// 6_795: per-prestige leaderboards add the get_prestige_leaderboard_page
// procedure declaration, its return type and its note. The three tables
// register through the existing leaderboardPageTables spread, and the ranking,
// the guest merge and the read live in leaderboard-pages.ts; the raise is the
// declaration alone.
const MAX_LINES = 6_795;
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
