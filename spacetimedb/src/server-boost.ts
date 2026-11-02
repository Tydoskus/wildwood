// Server Boost (shared/server-boost.ts): a Patreon supporter starts 2x kill
// stat rewards, gold, wood and ore for everyone online, once a day per account.
import { t, SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { extendedServerBoostEnd, formatServerBoostWait, serverBoostCooldownMs, withBoostSupporter } from "../../shared/server-boost";
import { serverBoostTables } from "./server-boost-tables";
import { patreonStatus } from "./patreon";
import { insertChatMessage } from "./chat-runtime";
import { markChatAnnouncement } from "./chat-announcement";
import { requireControllingPlayer } from "./session-guards";

type Ctx = any;
const nowMs = (ctx: Ctx) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);

/** Patreon supporters (any tier) and developers. */
const maySupport = (ctx: Ctx, identity: Identity) => patreonStatus(ctx, identity).tier !== "none";

/** Starts the boost, or adds 15 minutes to the one running. */
export function triggerServerBoost(ctx: Ctx) {
  requireControllingPlayer(ctx);
  if (!maySupport(ctx, ctx.sender)) throw new SenderError("Server Boost is a Patreon supporter perk.");
  const now = nowMs(ctx), developer = isDeveloperIdentity(ctx.sender.toHexString());
  const trigger = ctx.db.serverBoostTrigger.identity.find(ctx.sender);
  const wait = developer ? 0 : serverBoostCooldownMs(trigger?.lastTriggeredAtMs, now);
  if (wait > 0) throw new SenderError(`Your next Server Boost is ready in ${formatServerBoostWait(wait)}.`);
  const current = ctx.db.serverBoost.id.find(0);
  const endsAtMs = extendedServerBoostEnd(current?.endsAtMs, now);
  const profile = ctx.db.playerProfile.identity.find(ctx.sender);
  const name = profile?.displayName || "A supporter";
  const extending = Boolean(current && current.endsAtMs > now);
  const supporterName = extending ? withBoostSupporter(current.supporterName, name) : name;
  const row = { id: 0, endsAtMs, supporterName, startedAtMs: extending ? current.startedAtMs : now };
  if (current) ctx.db.serverBoost.id.update(row); else ctx.db.serverBoost.insert(row);
  const stamp = { identity: ctx.sender, lastTriggeredAtMs: now };
  if (trigger) ctx.db.serverBoostTrigger.identity.update(stamp); else ctx.db.serverBoostTrigger.insert(stamp);
  // Marked in chat_announcement, which no chat reducer writes, so the client draws it as a banner and typed text never is.
  const announced = insertChatMessage(ctx, ctx.sender, name, extending
    ? "Extended a Server Boost by 15 min"
    : "Started a Server Boost: 2x Rewards for 15 min");
  markChatAnnouncement(ctx, announced.id, "server-boost");
}

/** The caller's own cooldown row, for the Shop. */
export function registerServerBoost(spacetimedb: any) {
  const myServerBoostTrigger = spacetimedb.view({ name: "my_server_boost_trigger", public: true },
    t.array(serverBoostTables.serverBoostTrigger.rowType),
    (ctx: any) => { const row = ctx.db.serverBoostTrigger.identity.find(ctx.sender); return row ? [row] : []; });
  return { myServerBoostTrigger };
}
