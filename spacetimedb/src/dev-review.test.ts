import { readFileSync } from "node:fs";
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

describe("reported private messages", () => {
  it("shows the reported DM text, who it was sent to, when, and the messages around it", () => {
    const f = fixture();
    const at = (seconds: number) => new Timestamp(BigInt(seconds) * 1_000_000n);
    f.db.socialMessage.id.update({ ...f.db.socialMessage.id.find(7n), recipientName: "Alice", sentAt: at(3) });
    f.seed("socialMessage", { id: 5n, channel: "dm", conversation: "c", sender: reporterA, recipient: accused, senderName: "Alice", message: "hi", sentAt: at(2) });
    f.seed("socialMessage", { id: 6n, channel: "dm", conversation: "other", sender: reporterB, recipient: accused, senderName: "Else", message: "not this thread", sentAt: at(2) });
    f.seed("socialMessage", { id: 8n, channel: "dm", conversation: "c", sender: reporterA, recipient: accused, senderName: "Alice", message: "stop", sentAt: at(4) });
    const entry = f.queue().reports.find(row => row.key === "player:1")!;
    expect(entry).toMatchObject({ channel: "dm", text: "dm text", where: "DM with Alice", sentAtMs: 3_000 });
    expect(entry.context.map(line => [line.senderName, line.text, line.reported])).toEqual([
      ["Alice", "hi", false], ["Rude", "dm text", true], ["Alice", "stop", false],
    ]);
  });

  it("names the guild for a guild message", () => {
    const f = fixture();
    f.seed("guild", { id: 3n, directoryId: 0n, nameKey: "wolves", name: "Wolves", leader: accused, members: 2, champions: 0,
      week: 0, score: 0, wins: 0, battles: 0, attackDay: 0, attacks: 0, opponents: "" });
    f.db.socialMessage.id.update({ ...f.db.socialMessage.id.find(7n), channel: "guild", guildId: 3n });
    expect(f.queue().reports.find(row => row.key === "player:1")).toMatchObject({ where: "Guild: Wolves" });
  });

  it("falls back to the moderation log's original when the stored copy was already redacted", () => {
    const f = fixture();
    // Remove it once through the chat report, then a later DM report arrives with only the redacted copy.
    f.run(server.devReviewReport, { reportKey: "player:1", decision: "removed", note: "" });
    f.db.socialReport.key.update({ ...f.db.socialReport.key.find(`${reporterA.toHexString()}:7`), message: MODERATED_CHAT_MESSAGE });
    expect(f.queue().reports.find(row => row.key === "player:1")?.text).toBe("dm text");
    f.db.chatMessageReport.id.update({ ...f.db.chatMessageReport.id.find(3n), message: MODERATED_CHAT_MESSAGE, messageModerated: true });
    f.run(server.devReviewReport, { reportKey: "chat:3", decision: "removed", note: "" });
    expect(f.queue().reports.find(row => row.key === "chat:3")?.text).toBe("fine words");
  });

  it("serves the text only through the developer-gated read, never a public table or view", () => {
    const f = fixture();
    signInAs(f, reporterB);
    expect(() => f.queue()).toThrow("Developer access required");
    const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    expect(read("./dev-review.ts")).toMatch(/table\(\{ name: "dev_report_review", public: false \}/);
    expect(read("./social-tables.ts")).toMatch(/socialReport = table\(\{ name: "social_report", public: false \}/);
    expect(read("./social-tables.ts")).toMatch(/socialMessage = table\(\{ name: "social_message", public: false \}/);
  });
});

/** Hands the signed-in, controlling game session to a player who is not the developer. */
function signInAs(f: ReturnType<typeof fixture>, who: Identity) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  f.seed("player", { ...f.db.player.identity.find(developer), identity: who });
  f.seed("playerController", { ...f.db.playerController.identity.find(developer), identity: who });
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: who });
  f.ctx.sender = who;
}

describe("letters to the reporter", () => {
  const letters = (f: ReturnType<typeof fixture>, who: Identity) => [...f.db.playerMail.identity.filter(who)];
  const withReporters = () => {
    const f = fixture();
    f.seed("playerProfile", { identity: reporterA, displayName: "R1" });
    f.seed("playerProfile", { identity: reporterB, displayName: "R2" });
    return f;
  };

  it("sends each bug decision its own wording, with the developer's note in the same letter", () => {
    for (const [decision, opening] of [
      ["resolved", "it's been fixed."], ["wont_fix", "won't be changing this."], ["duplicate", "already reported and is being tracked."],
    ]) {
      const f = withReporters();
      f.run(server.devReviewBug, { id: 1n, decision, note: "thanks!", mailReporter: true });
      const [letter] = letters(f, reporterA);
      expect(letter.title).toBe("About your bug report");
      expect(letter.body).toContain(opening);
      expect(letter.body).toContain("You reported: “the door is stuck”");
      expect(letter.body).toContain("Note from the developer: thanks!");
      expect([...f.db.devReportReview.iter()].at(-1)?.mailed).toBe(true);
    }
  });

  it("tells a player reporter only that action was or was not taken", () => {
    const f = withReporters();
    f.run(server.devReviewReport, { reportKey: "chat:1", decision: "banned", note: "", mailReporter: true });
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "dismissed", note: "", mailReporter: true });
    const toA = letters(f, reporterA), toB = letters(f, reporterB);
    expect(toA.map(row => row.body)).toEqual(["Thanks for your report — we reviewed it and took action."]);
    // chat:2 (same message, reporter B) and player:2 (dismissed) each get one letter.
    expect(toB.map(row => row.body).sort()).toEqual([
      "Thanks for your report — we reviewed it and didn't find a rule break.",
      "Thanks for your report — we reviewed it and took action.",
    ]);
    for (const row of [...toA, ...toB]) expect(row.body).not.toMatch(/Rude|ban|mute|harassment|bad words/i);
    expect(letters(f, accused)).toEqual([]);
  });

  it("sends one letter per report however often it is decided, none when unticked, and none for a delete", () => {
    const f = withReporters();
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "dismissed", note: "", mailReporter: false });
    expect(letters(f, reporterB)).toEqual([]);
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "reopened", note: "", mailReporter: true });
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "banned", note: "", mailReporter: true });
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "reopened", note: "", mailReporter: true });
    f.run(server.devReviewReport, { reportKey: "player:2", decision: "dismissed", note: "", mailReporter: true });
    expect(letters(f, reporterB)).toHaveLength(1);
    expect([...f.db.devReportReview.reportKey.filter("player:2")].map(row => row.mailed)).toEqual([false, false, true, false, false]);
    f.run(server.devDeleteBugReport, { id: 1n });
    expect(letters(f, reporterA)).toEqual([]);
  });

  it("skips a reporter whose account is gone, and shows the letter only in its owner's mailbox", () => {
    const f = fixture();
    f.run(server.devReviewBug, { id: 1n, decision: "resolved", note: "", mailReporter: true });
    expect(f.db.playerMail.count()).toBe(0n);
    expect([...f.db.devReportReview.iter()].at(-1)?.mailed).toBe(false);
    f.seed("playerProfile", { identity: reporterA, displayName: "R1" });
    f.seed("bugReport", { id: 2n, reporter: reporterA, reporterName: "R1", message: "x", protocolVersion: 90, reportedAt: f.ctx.timestamp });
    f.run(server.devReviewBug, { id: 2n, decision: "resolved", note: "", mailReporter: true });
    const inbox = (who: Identity) => (server.myMailboxV2 as any)({ db: f.db, sender: who }) as { id: string; read: boolean }[];
    expect(inbox(reporterA).filter(row => row.id === "dev-reply-bug-2")).toHaveLength(1);
    expect(inbox(reporterB).some(row => row.id.startsWith("dev-reply"))).toBe(false);
    signInAs(f, reporterA);
    f.run(server.readMailboxLetter, { id: "dev-reply-bug-2" });
    expect(inbox(reporterA).find(row => row.id === "dev-reply-bug-2")?.read).toBe(true);
  });

  it("refuses a signed-in player who is not the developer", () => {
    const f = withReporters();
    signInAs(f, reporterB);
    expect(() => f.run(server.devReviewBug, { id: 1n, decision: "resolved", note: "", mailReporter: true })).toThrow("Developer access required");
    expect(() => f.run(server.devReviewReport, { reportKey: "chat:1", decision: "dismissed", note: "", mailReporter: true })).toThrow("Developer access required");
    expect(f.db.playerMail.count()).toBe(0n);
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
