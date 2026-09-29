/**
 * Read-only: why players with the eye on cannot see each other.
 *
 * Other players reach a client through three things the server keeps:
 * - player_motion_identity rows (map, visible), which the map subscription reads;
 * - motion detail frames, published to anyone with a player_motion_interest row
 *   while motion_detail_frame_schedule is armed;
 * - minimap frames, published while map_frame_schedule is armed, which it only
 *   is while player_motion_map_state counts two visible players on a map.
 * This prints each of them, and where the stored counts disagree with the
 * rows they count.
 *
 *   npm run diagnose:multiplayer
 *   npm run diagnose:multiplayer -- tutorial_forest
 *
 * Nothing here writes.
 */
import { execFileSync } from "node:child_process";

type Row = Record<string, any>;
// Overridable only to try the script against a local database.
const DATABASE = process.env.DIAGNOSE_DATABASE || "wildwood-coop";
const SERVER = process.env.DIAGNOSE_SERVER || "maincloud";
const focus = process.argv[2] ?? "tutorial_forest";

function sql(query: string): Row[] {
  const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", [
    "sql", DATABASE, "--server", SERVER, "--format", "json", query,
  ], { encoding: "utf8", timeout: 120_000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const table = JSON.parse(output)[0];
  if (!table?.rows) return [];
  return table.rows.map((row: any[]) => Object.fromEntries(table.schema.elements
    .map((element: any, index: number) => [element.name?.some ?? element.name, row[index]])));
}
const unwrap = (value: any) => Array.isArray(value) ? value[0] : value;
const hex = (identity: any) => String(unwrap(identity)).replace(/^0x/i, "").toLowerCase();
/** A ScheduleAt arrives as [variant, [micros]]; a plain timestamp as [micros]. */
const micros = (value: any) => Number(Array.isArray(value) && Array.isArray(value[1]) ? value[1][0] : unwrap(value));
const truthy = (value: any) => value === true || value === "true";

const names = new Map(sql("SELECT identity, display_name FROM player_profile").map(row => [hex(row.identity), String(row.display_name)]));
const name = (identity: string) => names.get(identity) || identity.slice(0, 10);

console.log(`Checked at ${new Date().toISOString()}\n`);
const state = sql("SELECT map_id, player_count, visible_count FROM player_motion_map_state");
const identities = sql("SELECT identity, map_id, is_visible, network_id FROM player_motion_identity");
const actual = new Map<string, { players: number; visible: number }>();
for (const row of identities) {
  const counts = actual.get(row.map_id) ?? { players: 0, visible: 0 };
  counts.players++; if (truthy(row.is_visible)) counts.visible++;
  actual.set(row.map_id, counts);
}
console.log("Map counts the frame loops read (stored) against the rows they count (actual):");
for (const mapId of new Set([...state.map(row => row.map_id), ...actual.keys()])) {
  const stored = state.find(row => row.map_id === mapId), real = actual.get(mapId) ?? { players: 0, visible: 0 };
  const drift = !stored || Number(stored.player_count) !== real.players || Number(stored.visible_count) !== real.visible;
  console.log(`  ${String(mapId).padEnd(24)} stored ${stored?.player_count ?? "-"}/${stored?.visible_count ?? "-"} visible   actual ${real.players}/${real.visible} visible${drift ? "   <-- DRIFT" : ""}`);
}

const players = new Map(sql("SELECT identity, map_id, is_visible FROM player").map(row => [hex(row.identity), row]));
const motion = new Map(sql("SELECT identity, map_id, is_visible, network_id FROM player_motion").map(row => [hex(row.identity), row]));
const preference = new Map(sql("SELECT identity, enabled FROM player_multiplayer_preference").map(row => [hex(row.identity), truthy(row.enabled)]));
const interest = new Map(sql("SELECT identity, network_ids FROM player_motion_interest").map(row => [hex(row.identity), row.network_ids]));
// The eye only makes a player visible once the tutorial is done (steps 1-5
// are in it), and a developer only with developer presence on. Hidden
// players also receive no motion frames, so they see nobody either.
const tutorial = new Map(sql("SELECT identity, step FROM player_onboarding").map(row => [hex(row.identity), Number(row.step)]));
const devPresence = new Map(sql("SELECT identity, visible FROM developer_presence_preference").map(row => [hex(row.identity), truthy(row.visible)]));
console.log(`\nPlayers on ${focus} (eye = stored preference; player / motion / identity = the visible flag each row holds):`);
const here = [...players].filter(([, row]) => row.map_id === focus);
if (!here.length) console.log("  nobody");
for (const [identity, row] of here) {
  const ident = identities.find(entry => hex(entry.identity) === identity);
  const wants = interest.get(identity);
  console.log(`  ${name(identity).padEnd(20)} eye ${preference.get(identity) ? "on " : "off"}  player ${truthy(row.is_visible) ? "Y" : "n"}  motion ${truthy(motion.get(identity)?.is_visible) ? "Y" : "n"}`
    + `  identity ${ident ? (truthy(ident.is_visible) ? "Y" : "n") : "-"}  motion map ${motion.get(identity)?.map_id ?? "-"}  watching ${Array.isArray(wants) ? wants.length : 0}`
    + (tutorial.has(identity) && tutorial.get(identity)! >= 1 && tutorial.get(identity)! <= 5 ? `  IN TUTORIAL (step ${tutorial.get(identity)}): hidden` : "")
    + (devPresence.has(identity) && !devPresence.get(identity) ? "  DEVELOPER PRESENCE OFF: hidden" : ""));
}

const now = Date.now() * 1000;
for (const table of ["motion_detail_frame_schedule", "map_frame_schedule"]) {
  const rows = sql(`SELECT * FROM ${table}`);
  const due = rows.map(row => micros(row.scheduled_at));
  console.log(`\n${table}: ${rows.length ? due.map(at => `${((at - now) / 1e6).toFixed(1)}s ${at < now - 5e6 ? "(PAST: stuck)" : "ahead"}`).join(", ") : "empty (idle; armed again when two visible players share a map)"}`);
}
console.log(`\nWatching (player_motion_interest rows): ${interest.size}. Eye on (stored): ${[...preference.values()].filter(Boolean).length}.`);
