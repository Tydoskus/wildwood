/** Generated atlas: measured 300px square frames keep adjacent shields out. */
import { GUILD_EMBLEMS as EMBLEMS } from "../../shared/guilds";
const COLUMNS = [9, 322, 635, 948];
const ROWS = [10, 312, 613, 913];

export function guildEmblemIndex(name: string) {
  const normalized = name.trim().toLowerCase();
  const match = EMBLEMS.findIndex(theme => normalized.includes(theme));
  if (match >= 0) return match;
  // A stable default until guild emblem customization is added.
  let hash = 0;
  for (const letter of normalized) hash = (hash * 31 + letter.codePointAt(0)!) >>> 0;
  return hash % EMBLEMS.length;
}

export function createGuildEmblem(doc: Document, name: string, className = 'guild-mark', chosen?: number) {
  const element = doc.createElement('span');
  element.className = `${className} guild-emblem`;
  element.setAttribute('aria-hidden', 'true');
  const index = chosen !== undefined && Number.isInteger(chosen) && chosen >= 0 && chosen < EMBLEMS.length ? chosen : guildEmblemIndex(name);
  element.style.backgroundPosition = `${COLUMNS[index % 4] / 954 * 100}% ${ROWS[Math.floor(index / 4)] / 954 * 100}%`;
  return element;
}
