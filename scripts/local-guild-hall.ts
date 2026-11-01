/**
 * Local testing only: puts a local player in a guild with a hall at the levels asked for, so the hall can be
 * looked at without playing up to a guild. Writes only to the local server's database, never maincloud.
 *
 *   npm run local:guild-hall                  every upgrade at its top level
 *   npm run local:guild-hall -- 1             every upgrade at level 1 (0 for a bare hall)
 *   npm run local:guild-hall -- '{"hearth":1,"size":2}'
 *   npm run local:guild-hall -- max --player 0xc200...   a player other than the one online
 *
 * A player already in a guild keeps it; only its hall's levels change. Reload the game afterwards.
 */
import { execFileSync } from "node:child_process";
import { GUILD_HALL_PARTS } from "../shared/guild-hall";

type Row = Record<string, any>;

const DATABASE = process.env.WILDSTAT_LOCAL_DB || "wildwood-balance-local";
const TEST_GUILD_ID = 900_001;
const args = process.argv.slice(2);
const playerAt = args.indexOf("--player");
const wanted = args.find((arg, index) => !arg.startsWith("--") && !(playerAt >= 0 && index === playerAt + 1)) ?? "max";

function sql(query: string): Row[] {
  const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", ["sql", "--server", "local", DATABASE, "--format", "json", query], { encoding: "utf8" });
  const table = JSON.parse(output || "[]")[0];
  return (table?.rows ?? []).map((row: any[]) => Object.fromEntries(table.schema.elements.map((element: any, index: number) => [element.name?.some ?? element.name, row[index]])));
}
// An identity comes back as a one-item list holding its hex.
const hex = (value: unknown) => String(Array.isArray(value) ? value[0] : value);

/** The levels asked for, each kept within its part's range. */
function levelsFor(choice: string): Record<string, number> {
  const all = (level: number) => Object.fromEntries(GUILD_HALL_PARTS.map(part => [part.id, Math.min(level, part.levels.length - 1)]));
  if (choice === "max") return all(99);
  if (/^\d+$/.test(choice)) return all(Number(choice));
  const picked = JSON.parse(choice);
  return Object.fromEntries(GUILD_HALL_PARTS.map(part => [part.id, Math.max(0, Math.min(part.levels.length - 1, Number(picked[part.id] ?? 0)))]));
}

const online = sql("SELECT identity FROM player").map(row => hex(row.identity));
const player = playerAt >= 0 ? args[playerAt + 1] : online.length === 1 ? online[0] : null;
if (!player) {
  console.error(online.length ? `More than one player is online; pick one with --player:\n${online.join("\n")}` : "Nobody is in the local game. Open http://127.0.0.1:8000 first.");
  process.exit(1);
}
const levels = levelsFor(wanted);
const seat = sql(`SELECT guild_id FROM guild_member WHERE identity = ${player}`)[0];
let guildId = seat?.guild_id;
if (guildId === undefined) {
  guildId = TEST_GUILD_ID;
  if (!sql(`SELECT id FROM guild WHERE id = ${guildId}`).length) {
    sql(`INSERT INTO guild (id, directory_id, name_key, name, leader, members, champions, week, score, wins, battles, attack_day, attacks, opponents, emblem) VALUES (${guildId}, ${guildId}, 'test hall', 'Test Hall', ${player}, 1, 0, 0, 0, 0, 0, 0, 0, '[]', 3)`);
  }
  const name = sql(`SELECT display_name FROM player_profile WHERE identity = ${player}`)[0]?.display_name ?? "Tester";
  sql(`INSERT INTO guild_member (identity, guild_id, name, joined_at, eligible_at, champion, fighter, power, vice_president) VALUES (${player}, ${guildId}, '${String(name).replace(/'/g, "''")}', ${Date.now() * 1000}, 0, false, '', 0, false)`);
  console.log(`Made ${player} President of Test Hall.`);
}
const json = JSON.stringify(levels).replace(/'/g, "''");
if (sql(`SELECT guild_id FROM guild_hall WHERE guild_id = ${guildId}`).length) sql(`UPDATE guild_hall SET levels = '${json}', fund = 5000 WHERE guild_id = ${guildId}`);
else sql(`INSERT INTO guild_hall (guild_id, fund, spent, levels) VALUES (${guildId}, 5000, 0, '${json}')`);
console.log(`Guild ${guildId}'s hall: ${GUILD_HALL_PARTS.map(part => `${part.name} ${part.levels[levels[part.id]]}`).join(", ")}. Reload the game.`);
