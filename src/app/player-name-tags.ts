import { setPrestigeBadgeLevel } from "../ui/prestige-badge";
import { isDeveloperIdentity } from "./developer";

type NameTag = { guildTag: string; showDevTag: boolean };
let revision = 0;
let provider: { prefix: (identity?: string) => string; revision: () => number; prestigeLevel: (identity?: string) => number;
  guildTag?: (identity?: string) => string } | null = null;
// Networking and rendering are separate browser bundles. Bind to the co-op API
// so both read the same live tags rather than maintaining isolated module caches.
export function bindPlayerNameTags(source: NonNullable<typeof provider>) { provider = source; }
// Settings > Show Guild Tags, per device. Read where names are drawn, never in the networking bundle.
let guildTagsShown = false, settingRevision = 0;
export const guildTagsVisible = () => guildTagsShown;
export function setGuildTagsVisible(next: boolean) { if (guildTagsShown !== next) { guildTagsShown = next; settingRevision++; } }
export const playerNameTagsRevision = () => (provider ? provider.revision() : revision) + settingRevision;
/** Zero means no badge. Only the local player resolves until prestige level
 *  travels on a public table; everyone else reads as unprestiged. */
export const playerPrestigeLevel = (identity?: string) => provider?.prestigeLevel(identity) ?? 0;
const tags = new Map<string, NameTag>();
const key = (identity?: string) => identity?.replace(/^0x/i, "").toLowerCase() ?? "";
export function updatePlayerNameTag(identity: string, tag: NameTag) {
  const previous = tags.get(key(identity));
  if (previous?.guildTag === tag.guildTag && previous.showDevTag === tag.showDevTag) return;
  tags.set(key(identity), { guildTag: tag.guildTag, showDevTag: tag.showDevTag }); revision++;
}
export function removePlayerNameTag(identity: string) { if (tags.delete(key(identity))) revision++; }
export function clearPlayerNameTags() { if (tags.size) { tags.clear(); revision++; } }
export function developerNameTagVisible(identity?: string) { return isDeveloperIdentity(identity) && tags.get(key(identity))?.showDevTag !== false; }
/** The player's guild name, which is their tag ("" without a guild), whether or not tags are shown. */
export function playerGuildTag(identity?: string) {
  return provider ? provider.guildTag?.(identity) ?? "" : tags.get(key(identity))?.guildTag ?? "";
}
/** Both tags, always: what the networking bundle hands the game bundle. */
export function fullPlayerNamePrefix(identity?: string, developer = isDeveloperIdentity(identity)) {
  if (provider) return provider.prefix(identity);
  const tag = tags.get(key(identity));
  return `${developer && tag?.showDevTag !== false ? "[dev]" : ""}${tag?.guildTag ? `[${tag.guildTag}]` : ""}`;
}
/** The tags as drawn: the guild tag only while Show Guild Tags is on. */
export function playerNamePrefix(identity?: string, developer = isDeveloperIdentity(identity)) {
  const full = fullPlayerNamePrefix(identity, developer);
  if (guildTagsShown) return full;
  const guild = playerGuildTag(identity);
  return guild && full.endsWith(`[${guild}]`) ? full.slice(0, -guild.length - 2) : full;
}
export function appendPlayerNameTags(element: HTMLElement, identity?: string, developer = isDeveloperIdentity(identity), showGuildTag = true) {
  const fullPrefix = playerNamePrefix(identity, developer);
  const prefix = showGuildTag ? fullPrefix : fullPrefix.startsWith("[dev]") ? "[dev]" : "";
  if (!prefix) return;
  const badge = element.ownerDocument.createElement("span");
  badge.className = "player-name-tags";
  if (prefix.startsWith("[dev]")) {
    const dev = element.ownerDocument.createElement("span"); dev.className = "dev-badge"; dev.textContent = "[dev]";
    badge.append(dev, element.ownerDocument.createTextNode(prefix.slice(5)));
  } else badge.textContent = prefix;
  element.append(badge);
}

/**
 * Reads after the name and before the gender icon. The level is the digit
 * inside the shield, so the badge says which prestige rather than just that
 * there was one.
 */
export function appendPrestigeBadge(element: HTMLElement, identity?: string, level = playerPrestigeLevel(identity)) {
  if (level <= 0) return null;
  const badge = element.ownerDocument.createElement("span");
  badge.className = "player-prestige-badge";
  setPrestigeBadgeLevel(badge, level);
  badge.setAttribute("aria-label", `Prestige ${level}`);
  element.append(badge);
  return badge;
}
