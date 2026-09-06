import { isDeveloperIdentity } from "./developer";

type NameTag = { guildTag: string; showDevTag: boolean };
let revision = 0;
let provider: { prefix: (identity?: string) => string; revision: () => number } | null = null;
// Networking and rendering are separate browser bundles. Bind to the co-op API
// so both read the same live tags rather than maintaining isolated module caches.
export function bindPlayerNameTags(source: NonNullable<typeof provider>) { provider = source; }
export const playerNameTagsRevision = () => provider ? provider.revision() : revision;
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
export function playerNamePrefix(identity?: string, developer = isDeveloperIdentity(identity)) {
  if (provider) return provider.prefix(identity);
  const tag = tags.get(key(identity));
  return `${developer && tag?.showDevTag !== false ? "[dev]" : ""}${tag?.guildTag ? `[${tag.guildTag}]` : ""}`;
}
export function appendPlayerNameTags(element: HTMLElement, identity?: string, developer = isDeveloperIdentity(identity)) {
  const prefix = playerNamePrefix(identity, developer);
  if (!prefix) return;
  const badge = document.createElement("span");
  badge.className = "player-name-tags";
  if (prefix.startsWith("[dev]")) {
    const dev = document.createElement("span"); dev.className = "dev-badge"; dev.textContent = "[dev]";
    badge.append(dev, document.createTextNode(prefix.slice(5)));
  } else badge.textContent = prefix;
  element.append(badge);
}
