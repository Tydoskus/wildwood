type UnreadMessage = { id: bigint; sender: string; sentAtMs: number };
export type ChatUnreadCounts = { guild: number; private: number; conversations: Map<string, number> };

/** Only newly arriving messages from this session count; hydrated history is quiet. */
export function createChatUnreadTracker(startedAtMs = Date.now()) {
  let initialized = false;
  let seen = new Set<bigint>();
  const unread = new Map<bigint, string>();
  return {
    reset(now = Date.now()) {
      startedAtMs = now;
      initialized = false;
      seen.clear();
      unread.clear();
    },
    refresh(localIdentity: string, guild: UnreadMessage[], conversations: Map<string, UnreadMessage[]>, readConversation: string | null): ChatUnreadCounts {
      const current = new Set<bigint>();
      const collect = (key: string, rows: UnreadMessage[]) => {
        for (const row of rows) {
          current.add(row.id);
          if (initialized && !seen.has(row.id) && row.sender !== localIdentity && row.sentAtMs >= startedAtMs) unread.set(row.id, key);
          if (readConversation === key) unread.delete(row.id);
        }
      };
      collect("guild", guild);
      for (const [identity, rows] of conversations) collect(`private:${identity}`, rows);
      for (const id of unread.keys()) if (!current.has(id)) unread.delete(id);
      initialized = true;
      seen = current;
      const counts: ChatUnreadCounts = { guild: 0, private: 0, conversations: new Map() };
      for (const key of unread.values()) {
        if (key === "guild") counts.guild++;
        else {
          counts.private++;
          const identity = key.slice("private:".length);
          counts.conversations.set(identity, (counts.conversations.get(identity) ?? 0) + 1);
        }
      }
      return counts;
    },
  };
}
