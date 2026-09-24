/**
 * Read-only: which names would the current display-name filter reject?
 *
 * Reads one name per line on stdin and prints each flagged name with its
 * reason, tab-separated. Nothing here touches a database. Feed it an export:
 *
 *   spacetime sql wildwood-coop --server maincloud \
 *     "SELECT display_name FROM player_profile" > names.txt
 *   npx tsx scripts/scan-display-names.ts < names.txt
 *
 * A header line such as "display_name" or table borders from the SQL output
 * are harmless: they are checked like any other line and are not flagged.
 * Surrounding double quotes are stripped. Pass --guild to use the guild-name
 * rules (display-name rules plus the four-letter profanity list), e.g. with
 * "SELECT name FROM guild".
 */
import { readFileSync } from "node:fs";
import { displayNameModerationReason, guildNameModerationReason } from "../spacetimedb/src/chat-moderation";

const check = process.argv.includes("--guild") ? guildNameModerationReason : displayNameModerationReason;
const names = readFileSync(0, "utf8").split(/\r?\n/)
  .map(line => line.trim().replace(/^"(.*)"$/, "$1"))
  .filter(Boolean);

let flagged = 0;
for (const name of names) {
  const reason = check(name);
  if (!reason) continue;
  flagged += 1;
  console.log(`${name}\t${reason}`);
}
console.error(`${flagged} of ${names.length} names flagged.`);
