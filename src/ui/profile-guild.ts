import type { GuildSnapshot } from "../../shared/guilds";
import { createGuildEmblem } from "../game/guild-emblems";

export type KnownGuild = { id: string; name: string; emblem?: number };
type HubPages = { loadGuild: (afterId?: string) => Promise<GuildSnapshot> };

const PAGES_PER_SEARCH = 5;
const RESCAN_AFTER_MS = 5 * 60_000;

/**
 * A guild's id and badge by name. A player's guild tag is their guild's name, and no table
 * maps one to the other, so this reads the guild hub's directory pages, at most a few per search.
 */
export function createGuildLookup(api: () => HubPages | undefined, now = () => Date.now()) {
  const known = new Map<string, KnownGuild>();
  const key = (name: string) => name.trim().toLowerCase();
  const remember = (guild: { id: string; name: string; emblem?: number } | null | undefined) => {
    if (guild) known.set(key(guild.name), { id: guild.id, name: guild.name, emblem: guild.emblem });
  };
  let nextPage: string | null = "0", finishedAt = -Infinity;
  let search: Promise<void> = Promise.resolve();

  async function readPages(name: string) {
    const hub = api();
    if (!hub) return;
    if (nextPage === null && now() - finishedAt > RESCAN_AFTER_MS) nextPage = "0";
    for (let pages = 0; nextPage !== null && pages < PAGES_PER_SEARCH && !known.has(key(name)); pages++) {
      const snapshot = await hub.loadGuild(nextPage);
      remember(snapshot.guild);
      snapshot.directory.forEach(remember);
      snapshot.standings.forEach(remember);
      nextPage = snapshot.nextPage;
      if (nextPage === null) finishedAt = now();
    }
  }

  return {
    remember,
    async find(name: string): Promise<KnownGuild | undefined> {
      if (!name) return undefined;
      if (!known.has(key(name))) {
        search = search.then(() => readPages(name)).catch(() => {});
        await search;
      }
      return known.get(key(name));
    },
  };
}

/**
 * The profile's guild row: badge and name. `guild` undefined while the lookup runs (no badge yet),
 * null when it found nothing (the badge the name gives), and the row opens the guild only once its id is known.
 */
export function renderProfileGuild(button: HTMLButtonElement, name: string, guild?: KnownGuild | null) {
  button.hidden = !name;
  button.disabled = !guild;
  button.dataset.guildId = guild?.id ?? "";
  if (!name) { button.replaceChildren(); return; }
  button.setAttribute("aria-label", guild ? `Guild ${name}. View guild` : `Guild ${name}`);
  const label = button.ownerDocument.createElement("span");
  label.className = "player-profile-guild-name";
  label.textContent = name;
  const emblem = guild === undefined
    ? Object.assign(button.ownerDocument.createElement("span"), { className: "player-profile-guild-emblem" })
    : createGuildEmblem(button.ownerDocument, name, "player-profile-guild-emblem", guild?.emblem);
  button.replaceChildren(emblem, label);
}
