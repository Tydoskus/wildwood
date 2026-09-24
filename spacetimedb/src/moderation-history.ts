import { table, t } from "spacetimedb/server";
import type { ModuleReducerCtx } from "./index";
import type { ModerationHistoryPage } from "../../shared/moderation-history";

const moderationAction = table({ name: "moderation_action", public: false }, {
  id: t.u64().primaryKey(),
  targetIdentity: t.string(), targetName: t.string(), channel: t.string(), messageId: t.string(),
  action: t.string(), reason: t.string(),
  actorType: t.string(), actorIdentity: t.string(), actorName: t.string(), rule: t.string(),
  reportTable: t.string(), reportId: t.string(), before: t.string(), after: t.string(), recordedAt: t.timestamp(),
});
const moderationHead = table({ name: "moderation_head", public: false }, { id: t.u8().primaryKey(), lastId: t.u64() });
export const moderationTables = { moderationAction, moderationHead };

type Action = {
  targetIdentity: string; targetName: string; channel: string; messageId?: bigint;
  action: string; reason: string; actorType: "automatic" | "developer" | "owner"; rule?: string;
  reportTable?: string; reportId?: string; before: string; after: string;
};

/** Written in the same transaction as the action. There is no edit/delete API. */
export function recordModerationAction(ctx: ModuleReducerCtx, action: Action) {
  const head = ctx.db.moderationHead.id.find(0);
  const id = (head?.lastId ?? 0n) + 1n;
  const automatic = action.actorType === "automatic";
  ctx.db.moderationAction.insert({ ...action, id,
    messageId: action.messageId?.toString() ?? "", rule: action.rule ?? "",
    reportTable: action.reportTable ?? "", reportId: action.reportId ?? "",
    actorIdentity: automatic ? "" : ctx.sender.toHexString(),
    actorName: automatic ? "Automatic" : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "Database owner",
    recordedAt: ctx.timestamp,
  });
  if (head) ctx.db.moderationHead.id.update({ id: 0, lastId: id });
  else ctx.db.moderationHead.insert({ id: 0, lastId: id });
  return id;
}

/** How far back one player's history looks. The table has no target index, so this bounds the walk. */
const PLAYER_HISTORY_SCAN = 5_000n;

/** One player's newest 50 actions, walking back from the head by primary key. */
export function readPlayerModerationHistory(ctx: Pick<ModuleReducerCtx, "db">, targetIdentity: string): ModerationHistoryPage {
  const target = targetIdentity.replace(/^0x/i, "").toLowerCase();
  const head = ctx.db.moderationHead.id.find(0)?.lastId ?? 0n;
  const floor = head > PLAYER_HISTORY_SCAN ? head - PLAYER_HISTORY_SCAN : 0n;
  const entries: ModerationHistoryPage["entries"] = [];
  for (let id = head; id > floor && entries.length < 50; id--) {
    const row = ctx.db.moderationAction.id.find(id);
    if (!row || row.targetIdentity.replace(/^0x/i, "").toLowerCase() !== target) continue;
    const { recordedAt, ...entry } = row;
    entries.push({ ...entry, id: id.toString(), recordedAtMs: Number(recordedAt.microsSinceUnixEpoch / 1000n) });
  }
  return { entries, beforeId: "0", hasMore: false };
}

/** Fixed 50 indexed reads; history size never changes the work for a page. */
export function readModerationHistory(ctx: Pick<ModuleReducerCtx, "db">, beforeId: bigint): ModerationHistoryPage {
  const end = (ctx.db.moderationHead.id.find(0)?.lastId ?? 0n) + 1n;
  const before = beforeId > 0n && beforeId < end ? beforeId : end;
  const start = before > 50n ? before - 50n : 1n;
  const entries: ModerationHistoryPage["entries"] = [];
  for (let id = before - 1n; id >= start; id--) {
    const row = ctx.db.moderationAction.id.find(id);
    if (!row) continue;
    const { recordedAt, ...entry } = row;
    entries.push({ ...entry, id: id.toString(), recordedAtMs: Number(recordedAt.microsSinceUnixEpoch / 1000n) });
  }
  return { entries, beforeId: start.toString(), hasMore: start > 1n };
}
