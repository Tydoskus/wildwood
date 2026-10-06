import { GUILD_EMBLEMS as EMBLEMS } from "../../shared/guilds";

/**
 * Generated atlases of 16 badges each, 1254px square: measured 300px square
 * frames keep adjacent shields out. A sheet's class picks its image (guild.css).
 */
const COLUMNS = [9, 322, 635, 948];
const ROWS = [10, 312, 613, 913];
/** Later sheets are fitted to the first's frames (scripts/art/fit-guild-emblem-sheet.mjs). */
const SHEETS = ["", "guild-emblem--sheet-2"];
const PER_SHEET = 16;

/**
 * The badge a guild that never chose one shows, from its name. It reads the
 * first sheet only, as it did before the second, so no guild's look changes.
 */
export function guildEmblemIndex(name: string) {
  const normalized = name.trim().toLowerCase();
  const match = EMBLEMS.slice(0, PER_SHEET).findIndex(theme => normalized.includes(theme));
  if (match >= 0) return match;
  let hash = 0;
  for (const letter of normalized) hash = (hash * 31 + letter.codePointAt(0)!) >>> 0;
  return hash % PER_SHEET;
}

export function createGuildEmblem(doc: Document, name: string, className = 'guild-mark', chosen?: number) {
  const element = doc.createElement('span');
  element.className = `${className} guild-emblem`;
  element.setAttribute('aria-hidden', 'true');
  const index = chosen !== undefined && Number.isInteger(chosen) && chosen >= 0 && chosen < EMBLEMS.length ? chosen : guildEmblemIndex(name);
  const sheet = SHEETS[Math.floor(index / PER_SHEET)], cell = index % PER_SHEET;
  if (sheet) element.classList.add(sheet);
  element.style.backgroundPosition = `${COLUMNS[cell % 4] / 954 * 100}% ${ROWS[Math.floor(cell / 4)] / 954 * 100}%`;
  return element;
}
