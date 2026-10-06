import { createGuildEmblem } from "./guild-emblems";

type Badges = { name: string; emblem: number }[];

/**
 * Guild crests beside the guilds in a guild battle shared to chat ("[OAKS]
 * defeated [ELMS]"). The message names the guilds; their badges come from the
 * server once per battle (get_guild_battle_badges) and are kept for the
 * session, so a chat redraw never asks again. Until they arrive the line
 * reads as plain text; a guild that never chose a badge shows the one its
 * name gives it, as everywhere else.
 */
export function createChatGuildCrests(load: () => ((reportKey: string) => Promise<Badges>) | undefined) {
  const badges = new Map<string, Promise<Badges | null>>();
  function badgesFor(reportKey: string) {
    let pending = badges.get(reportKey);
    if (!pending) {
      const fetch = load();
      if (!fetch) return Promise.resolve(null);
      // A failed lookup is not kept: the next redraw may try again.
      pending = fetch(reportKey).catch(() => { badges.delete(reportKey); return null; });
      badges.set(reportKey, pending);
    }
    return pending;
  }
  return function decorate(body: HTMLElement, reportKey: string) {
    const text = body.textContent ?? "";
    if (!/\[[^\]]+\]/.test(text)) return;
    void badgesFor(reportKey).then(found => {
      if (!found || !body.isConnected || body.textContent !== text) return;
      const doc = body.ownerDocument;
      const parts: (string | Node)[] = [];
      let last = 0;
      for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
        const name = match[1];
        const badge = found.find(entry => entry.name === name);
        parts.push(text.slice(last, match.index));
        if (badge) parts.push(createGuildEmblem(doc, name, "chat-guild-crest", badge.emblem >= 0 ? badge.emblem : undefined));
        parts.push(match[0]);
        last = match.index + match[0].length;
      }
      parts.push(text.slice(last));
      body.replaceChildren(...parts);
    });
  };
}
