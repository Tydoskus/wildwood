import { table, t } from "spacetimedb/server";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";
import { chatPage, CHAT_PAGE_SIZE } from "../../shared/chat-page";

export const publicChatCursor = table({ name: "public_chat_cursor", public: false }, {
  id: t.u8().primaryKey(), firstId: t.u64(), lastId: t.u64(),
});
type ReadContext = Pick<ModuleViewCtx, "db">;

export function updatePublicChatCursor(ctx: Pick<ModuleReducerCtx, "db">, insertedId?: bigint) {
  const current = ctx.db.publicChatCursor.id.find(0);
  if (current && insertedId !== undefined) {
    ctx.db.publicChatCursor.id.update({ ...current, firstId: current.firstId || insertedId, lastId: insertedId });
    return;
  }
  // Bootstrap existing history once; cleanup also reconciles its oldest ID.
  let firstId = 0n, lastId = current?.lastId ?? 0n;
  for (const row of ctx.db.chatMessage.iter()) {
    if (!firstId || row.id < firstId) firstId = row.id;
    if (row.id > lastId) lastId = row.id;
  }
  const row = { id: 0, firstId, lastId };
  if (current) ctx.db.publicChatCursor.id.update(row);
  else ctx.db.publicChatCursor.insert(row);
}

/**
 * Identifiers are dense while nothing has been deleted, so walking back from
 * the newest reads one row per message returned. Erasing an account punches
 * holes in that range, and without a ceiling a single erased spammer would
 * turn every page into one lookup per identifier they ever used. Past the
 * budget the scan below is the cheaper read: it is bounded by retention
 * rather than by the identifier range.
 */
const PROBE_BUDGET = CHAT_PAGE_SIZE * 20;

function scanPublicChatPage(ctx: ReadContext, beforeId: bigint) {
  return chatPage([...ctx.db.chatMessage.iter()].filter(row => row.senderName.length > 0), beforeId);
}

/** Read just a page plus one row instead of sorting the entire day's chat. */
export function readPublicChatPage(ctx: ReadContext, beforeId = 0n) {
  const cursor = ctx.db.publicChatCursor.id.find(0);
  // Old databases remain readable before their first post-update message.
  if (!cursor) return scanPublicChatPage(ctx, beforeId);
  const messages = [];
  if (cursor.firstId) {
    let id = beforeId > 0n && beforeId <= cursor.lastId ? beforeId - 1n : cursor.lastId;
    let probes = 0;
    for (; id >= cursor.firstId && messages.length <= CHAT_PAGE_SIZE; id--) {
      if (++probes > PROBE_BUDGET) return scanPublicChatPage(ctx, beforeId);
      const row = ctx.db.chatMessage.id.find(id);
      if (row?.senderName) messages.push(row);
    }
  }
  return { messages: messages.slice(0, CHAT_PAGE_SIZE).reverse(), hasMore: messages.length > CHAT_PAGE_SIZE };
}
