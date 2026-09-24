import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import type { GameReducerContext } from "./index";
import { recordModerationAction } from "./moderation-history";

/** Called only after the report reducer or dev_review_report verifies the
 * authenticated developer (or, for dev_review_report, the database owner).
 * Keep the original evidence in the private report; redact displayed copies. */
export function moderateReportedMessage(ctx: GameReducerContext, channel: "public" | "social", id: bigint,
  reason: string, reportTable: string, reportId: string) {
  const original = channel === "public" ? ctx.db.chatMessage.id.find(id) : ctx.db.socialMessage.id.find(id);
  if (!original) return;
  recordModerationAction(ctx, {
    targetIdentity: original.sender.toHexString(), targetName: original.senderName,
    channel: channel === "public" ? "world" : "channel" in original ? original.channel : "social", messageId: id,
    action: original.moderated ? "Report reviewed" : "Message removed", reason,
    actorType: "developer", reportTable, reportId, before: original.message, after: MODERATED_CHAT_MESSAGE,
  });
  const clearedReply = { replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "" };
  if (channel === "public") {
    const message = ctx.db.chatMessage.id.find(id);
    if (!message) return;
    ctx.db.chatMessage.id.update({ ...message, ...clearedReply, message: MODERATED_CHAT_MESSAGE,
      moderated: true, replayId: 0n, guildReplayKey: "" });
    // Public history has bounded retention; scrub stored quotes as well.
    for (const reply of ctx.db.chatMessage.iter()) if (reply.replyToMessageId === id) {
      ctx.db.chatMessage.id.update({ ...reply, replyToMessage: MODERATED_CHAT_MESSAGE });
    }
  } else {
    const message = ctx.db.socialMessage.id.find(id);
    if (!message) return;
    ctx.db.socialMessage.id.update({ ...message, ...clearedReply, message: MODERATED_CHAT_MESSAGE, moderated: true });
    for (const reply of ctx.db.socialMessage.conversation.filter(message.conversation)) if (reply.replyToMessageId === id) {
      ctx.db.socialMessage.id.update({ ...reply, replyToMessage: MODERATED_CHAT_MESSAGE });
    }
  }
}
