import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import type { DevPlayerSummary, DevReviewQueue } from "../../shared/dev-review";
import { PERMANENT_SUSPENSION_MICROS } from "./defeat-session";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const developer = new Identity(DEVELOPER_IDENTITY);
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
const accused = identity("2"), reporterA = identity("3"), reporterB = identity("4");

/** The developer, signed in and controlling a game session, plus a small report backlog. */
function fixture() {
  const f = crystalFixture();
  const old = f.ctx.sender;
  for (const table of ["player", "playerProgress", "playerProfile", "playerController"]) {
    f.seed(table, { ...f.db[table].identity.find(old), identity: developer });
  }
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: developer });
  f.patch("playerProfile", { displayName: "Ryan" }, developer);
  f.ctx.sender = developer;
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.seed("playerProfile", { identity: accused, displayName: "Rude" });
  const at = (seconds: number) => new Timestamp(BigInt(seconds) * 1_000_000n);
  f.seed("chatMessage", { id: 1n, sender: accused, senderName: "Rude", message: "bad words", sentAt: at(1) });
  f.seed("chatMessage", { id: 2n, sender: accused, senderName: "Rude", message: "fine words", sentAt: at(2) });
  const chatReport = (id: bigint, reporter: Identity, messageId: bigint, seconds: number) => f.seed("chatMessageReport", {
    id, reporter, reporterName: `R${id}`, accused, senderName: "Rude", messageId, message: messageId === 1n ? "bad words" : "fine words",
    messageModerated: false, sentAt: at(1), reason: "harassment", status: "pending", reportedAt: at(seconds),
  });
  chatReport(1n, reporterA, 1n, 5);
  chatReport(2n, reporterB, 1n, 3);
  chatReport(3n, reporterA, 2n, 4);
  f.seed("socialMessage", { id: 7n, channel: "dm", conversation: "c", sender: accused, recipient: reporterA, senderName: "Rude", message: "dm text", sentAt: at(1) });
  f.seed("socialReport", { key: `${reporterA.toHexString()}:7`, reporter: reporterA, accused, messageId: 7n, message: "dm text", reason: "harassment", reportedAt: at(6) });
  f.seed("playerReport", { id: 1n, reporter: reporterA, reporterName: "R1", target: accused, targetName: "Rude", reason: "harassment",
    note: "[Private message #7] dm text", status: "pending", reportedAt: at(6) });
  f.seed("playerReport", { id: 2n, reporter: reporterB, reporterName: "R2", target: accused, targetName: "Rude", reason: "cheating",
    note: "speed hacking", status: "pending", reportedAt: at(2) });
  f.seed("bugReport", { id: 1n, reporter: reporterA, reporterName: "R1", message: "the door is stuck", protocolVersion: 90, reportedAt: at(1) });
  const procedure = { ...f.ctx, withTx: (callback: (ctx: unknown) => unknown) => f.transaction(() => callback(f.ctx)) };
  const queue = () => JSON.parse(server.getDevReviewQueue(procedure as any, {}) as string) as DevReviewQueue;
  const players = (query: string) => JSON.parse(server.devFindPlayers(procedure as any, { query }) as string) as DevPlayerSummary[];
  return { ...f, queue, players, procedure };
}

describe("developer review queue", () => {
  it("lists every open report oldest first, with its channel and whether the message can still be removed", () => {
    const f = fixture();
    const queue = f.queue();
    expect(queue.openReports).toBe(5);
    expect(queue.reports.map(entry => entry.key)).toEqual(["player:2", "chat:2", "chat:3", "chat:1", "player:1"]);
    expect(queue.reports.find(entry => entry.key === "player:1")).toMatchObject({ channel: "dm", text: "dm text", canRemoveMessage: true });
    expect(queue.reports.find(entry => entry.key === "player:2")).toMatchObject({ channel: "profile", text: "speed hacking", canRemoveMessage: false });
    expect(queue.bugs).toMatchObject([{ id: "1", status: "open", protocolVersion: 90, message: "the door is stuck" }]);
  });

  it("removes a reported message, closes every pending report about it, and records who decided", () => {
    const f = fixture();
    f.run(server.devReviewReport, { reportKey: "chat:1", decision: "removed", note: "slur" });
    expect(f.db.chatMessage.id.find(1n)).toMatchObject({ message: MODERATED_CHAT_MESSAGE, moderated: true });
    expect(f.db.chatMessageReport.id.find(1n).status).toBe("resolved");
    expect(f.db.chatMessageReport.id.find(2n).status).toBe("resolved");
    expect(f.db.chatMessageReport.id.find(3n).status).toBe("pending");
    const queue = f.queue();
    expect(queue.openReports).toBe(3);
    expect(queue.reports.find(entry => entry.key === "chat:1")?.decisions).toMatchObject([{ decision: "removed", note: "slur", reviewerName: "Ryan" }]);
    expect(queue.reports.find(entry => entry.key === "chat:2")?.decisions[0].note).toContain("Same message as chat:1");
    expect([...f.db.moderationAction.iter()][0]).toMatchObject({ action: "Message removed", actorType: "developer", reportId: "1" });
  });

  it("removes a private message through its player report and keeps the evidence", () => {
    const f = fixture();
    f.run(server.devReviewReport, { reportKey: "player:1", decision: "removed", note: "" });
    expect(f.db.socialMessage.id.find(7n)).toMatchObject({ message: MODERATED_CHAT_MESSAGE, moderated: true });
    expect(f.db.socialReport.key.find(`${reporterA.toHexString()}:7`).message).toBe("dm text");
    expect(f.db.playerReport.id.find(1n).status).toBe("resolved");
  });

  it("dismisses, reopens and refuses removal where there is no message", () => {
    const f = fixture();
    expect(() => f.run(server.devReviewReport, { reportKey: "player:2", decision: "removed", note: "" })).toThrow("no message");
    expect(() => f.run(server.devReviewReport, { reportKey: "chat:1", decision: "explode", note: "" })).toThrow("valid report decision");
    expect(() => f.run(server.devReviewReport, { reportKey: "chat:99", decision: "dismissed", note: "" })).toThrow("Report not found");
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "dismissed", note: "no evidence" });
    expect(f.db.playerReport.id.find(2n).status).toBe("dismissed");
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "reopened", note: "" });
    expect(f.db.playerReport.id.find(2n).status).toBe("pending");
    expect(f.queue().reports.find(entry => entry.key === "player:2")?.decisions.map(row => row.decision)).toEqual(["dismissed", "reopened"]);
  });

  it("tracks bug decisions without touching the bug row, and logs a spam delete", () => {
    const f = fixture();
    f.run(server.devReviewBug, { id: 1n, decision: "duplicate", note: "same as #0" });
    expect(f.queue()).toMatchObject({ openBugs: 0, bugs: [{ status: "duplicate" }] });
    f.run(server.devReviewBug, { id: 1n, decision: "reopened", note: "" });
    expect(f.queue().bugs[0].status).toBe("open");
    expect(() => f.run(server.devReviewBug, { id: 1n, decision: "deleted", note: "" })).toThrow("valid bug decision");
    f.run(server.devDeleteBugReport, { id: 1n });
    expect(f.db.bugReport.count()).toBe(0n);
    expect([...f.db.devReportReview.iter()].map(row => row.decision)).toEqual(["duplicate", "reopened", "deleted"]);
  });
});

describe("developer mute and ban", () => {
  it("lets the signed-in developer mute, ban and lift a ban, and shows it on the player card", () => {
    const f = fixture();
    f.run(server.devSetChatMute, { identity: accused, minutes: 60 });
    const now = Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n);
    expect(f.players("rude")).toMatchObject([{ displayName: "Rude", chatMutedUntilMs: now + 3_600_000, suspendedUntilMs: 0 }]);
    f.run(server.devSuspendPlayerAccount, { identity: accused, expectedDisplayName: "Rude", untilMicros: 0n, reason: "Repeated slurs" });
    expect(f.players(accused.toHexString())[0]).toMatchObject({ permanentlySuspended: true });
    expect(f.db.defeatSessionRestriction.identity.find(accused).blockedUntilMicros).toBe(PERMANENT_SUSPENSION_MICROS);
    f.run(server.devLiftPlayerSuspension, { identity: accused, reason: "Appeal accepted" });
    expect(f.db.defeatSessionRestriction.identity.find(accused)).toBeNull();
    expect(() => f.run(server.devLiftPlayerSuspension, { identity: accused, reason: "" })).toThrow("not suspended");
    const history = JSON.parse(server.getPlayerModerationHistory(f.procedure as any, { identity: accused }) as string);
    expect(history.entries.map((entry: any) => entry.action)).toEqual(["Suspension lifted", "Account permanently suspended", "Chat muted"]);
    expect(history.entries.every((entry: any) => entry.actorType === "developer")).toBe(true);
  });

  it("refuses to mute or ban the developer or the database owner", () => {
    const f = fixture();
    for (const target of [developer, owner]) {
      expect(() => f.run(server.devSetChatMute, { identity: target, minutes: 60 })).toThrow("Protected identity");
      expect(() => f.run(server.devSuspendPlayerAccount, { identity: target, expectedDisplayName: "Ryan", untilMicros: 0n, reason: "x" }))
        .toThrow("Protected identity");
    }
  });

  it("needs the developer's signed-in account, not just the identity", () => {
    const f = fixture();
    f.ctx.senderAuth = {};
    expect(() => f.run(server.devSetChatMute, { identity: accused, minutes: 60 })).toThrow("Developer access required");
    expect(() => f.run(server.devReviewReport, { reportKey: "chat:1", decision: "dismissed", note: "" })).toThrow("Developer access required");
    expect(() => f.queue()).toThrow("Developer access required");
  });
});
