import { tables, type DbConnection } from "../../module_bindings";
import { chatAnnouncementKind, type ChatAnnouncementKind } from "../../../shared/chat-announcement";
import { watchTables } from "./table-watch";

/**
 * Which public chat messages the server marked as its own announcements (Server Boost, Patreon thanks), from the
 * chat_announcement table. Its own subscription, so a server without the table leaves the rest of the rows alone.
 */
export function createChatAnnouncementRows(notify: () => void) {
  let kinds = new Map<bigint, ChatAnnouncementKind>();
  let revision = 0;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    kinds = new Map(); revision++;
    const read = () => {
      const next = new Map<bigint, ChatAnnouncementKind>();
      for (const row of connection.db.chatAnnouncement.iter()) {
        const kind = chatAnnouncementKind(row.kind);
        if (kind) next.set(row.messageId, kind);
      }
      kinds = next; revision++;
      notify();
    };
    watchTables(connection, {
      what: "chat announcement", isCurrent, listen: [connection.db.chatAnnouncement], changes: ["insert", "delete"],
      queries: [tables.chatAnnouncement], read,
    });
  }

  return {
    watch,
    api: {
      /** The announcement a public chat message is, or null for a player's own words. */
      chatAnnouncement: (messageId: bigint): ChatAnnouncementKind | null => kinds.get(messageId) ?? null,
      chatAnnouncementRevision: () => revision,
    },
  };
}
