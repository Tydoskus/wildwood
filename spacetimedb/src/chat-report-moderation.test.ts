import { describe, expect, it, vi } from "vitest";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const developer = new Identity("c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13");
function fixture(dev = true, authenticated = true) {
  const f = crystalFixture();
  const old = f.ctx.sender, who = dev ? developer : old;
  if (dev) for (const table of ["player", "playerProgress", "playerProfile", "playerController"]) {
    f.seed(table, { ...f.db[table].identity.find(old), identity: who });
  }
  f.ctx.sender = who;
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: who });
  if (authenticated) f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  const base = { sender: identity("2"), senderName: "Someone", message: "Original message", sentAt: f.ctx.timestamp };
  f.seed("chatMessage", { ...base, id: 1n, replayId: 9n, guildReplayKey: "1:2", replyToMessage: "Old quote", replyToMessageId: 99n });
  f.seed("chatMessage", { ...base, id: 2n, message: "Reply", replyToMessageId: 1n, replyToMessage: base.message });
  f.seed("socialMessage", { ...base, id: 1n, channel: "dm", conversation: "test-dm", recipient: who });
  f.seed("socialMessage", { ...base, id: 2n, channel: "dm", conversation: "test-dm", recipient: who, message: "Reply", replyToMessageId: 1n, replyToMessage: base.message });
  return f;
}
describe("developer report moderation", () => {
  it.each(["public", "social"] as const)("redacts %s messages and quotes while retaining private report evidence", channel => {
    const f = fixture(), table = channel === "public" ? "chatMessage" : "socialMessage";
    const reducer = channel === "public" ? server.reportChatMessage : server.reportSocialMessage;
    f.run(reducer, { messageId: 1n, reason: "harassment" });
    expect(f.db[table].id.find(1n)).toMatchObject({ message: MODERATED_CHAT_MESSAGE, moderated: true, replyToMessageId: 0n, replyToMessage: "" });
    expect(f.db[table].id.find(2n)).toMatchObject({ message: "Reply", replyToMessage: MODERATED_CHAT_MESSAGE });
    if (channel === "public") expect(f.db.chatMessage.id.find(1n)).toMatchObject({ replayId: 0n, guildReplayKey: "" });
    const reports = channel === "public" ? f.db.chatMessageReport : f.db.socialReport;
    expect([...reports.iter()][0].message).toBe("Original message");
    const action = [...f.db.moderationAction.iter()][0];
    expect(action).toMatchObject({ action: "Message removed", reason: "harassment", actorType: "developer",
      actorIdentity: developer.toHexString(), before: "Original message", after: MODERATED_CHAT_MESSAGE,
      messageId: "1", reportTable: channel === "public" ? "chat_message_report" : "social_report" });
    expect(action.reportId).toBeTruthy();
    expect([...(channel === "public" ? f.db.chatMessageReport : f.db.playerReport).iter()][0].status).toBe("resolved");
    expect(() => f.run(reducer, { messageId: 1n, reason: "harassment" })).toThrow("already reported");
  });
  it.each(["public", "social"] as const)("restores a developer-reported %s message and its quotes", channel => {
    const f = fixture(), table = channel === "public" ? "chatMessage" : "socialMessage";
    f.run(channel === "public" ? server.reportChatMessage : server.reportSocialMessage, { messageId: 1n, reason: "harassment" });
    const report = [...(channel === "public" ? f.db.chatMessageReport : f.db.playerReport).iter()][0];
    f.run(server.devReviewReport, { reportKey: `${channel === "public" ? "chat" : "player"}:${report.id}`, decision: "restored", note: "Mistake", mailReporter: false });
    expect(f.db[table].id.find(1n)).toMatchObject({ message: "Original message", moderated: false });
    expect(f.db[table].id.find(2n).replyToMessage).toBe("Original message");
    expect([...f.db.moderationAction.iter()].some(row => row.action === "Message restored")).toBe(true);
    expect((channel === "public" ? f.db.chatMessageReport : f.db.playerReport).id.find(report.id).status).toBe("dismissed");
  });
  it.each([[false, true], [true, false]])("requires both the developer identity and authentication (%s, %s)", (dev, authenticated) => {
    const f = fixture(dev, authenticated);
    f.run(server.reportChatMessage, { messageId: 1n, reason: "harassment" });
    f.run(server.reportSocialMessage, { messageId: 1n, reason: "harassment" });
    expect(f.db.chatMessage.id.find(1n).message).toBe("Original message");
    expect(f.db.socialMessage.id.find(1n).message).toBe("Original message");
    expect(f.db.moderationAction.count()).toBe(0n);
  });
  it("does not give developers access to report other people's private conversations", () => {
    const f = fixture();
    f.db.socialMessage.id.update({ ...f.db.socialMessage.id.find(1n), recipient: identity("3") });
    expect(() => f.run(server.reportSocialMessage, { messageId: 1n, reason: "harassment" })).toThrow("unavailable");
    expect(f.db.socialMessage.id.find(1n).message).toBe("Original message");
    expect(f.db.socialReport.count()).toBe(0n);
  });
});
