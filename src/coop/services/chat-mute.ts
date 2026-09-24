import { tables, type DbConnection } from "../../module_bindings";
import type { ChatMuteRecord } from "../../../shared/chat-mute";

const millis = (micros: bigint) => Number(micros / 1000n);

/**
 * This account's automatic chat mute, from the caller-scoped my_chat_mute
 * view. The server refuses muted sends and reactions on its own; the client
 * only reads the row to show the countdown and the strike notice. Reading
 * chat is never affected.
 */
export function createChatMute(notify: () => void) {
  let record: ChatMuteRecord | null = null;

  /** Follows the view's row on a new connection, from its own small subscription. */
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    record = null;
    const read = () => {
      if (!isCurrent()) return;
      const [row] = [...connection.db.myChatMute.iter()];
      record = row ? {
        strikeAtMs: row.strikeAtMicros.map(millis),
        mutedUntilMs: millis(row.mutedUntilMicros),
        lastMuteAtMs: millis(row.lastMuteAtMicros),
        muteCount: row.muteCount,
      } : null;
      notify();
    };
    connection.db.myChatMute.onInsert(read);
    connection.db.myChatMute.onUpdate(read);
    connection.db.myChatMute.onDelete(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.myChatMute]);
  }

  return {
    watch,
    api: {
      /** The strikes and mute as the server has them, or null when there are none. */
      chatMute: (): ChatMuteRecord | null => record,
    },
  };
}
