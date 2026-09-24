import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import type { DevConsole, DevPlayerCard } from "../../shared/dev-console";
import type { ModerationHistoryPage } from "../../shared/moderation-history";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const developer = new Identity(DEVELOPER_IDENTITY);
const rude = identity("2"), spammer = identity("3"), reporter = identity("4");

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
  for (const [who, name] of [[rude, "Rude"], [spammer, "Spammer"], [reporter, "Reporter"]] as const) {
    f.seed("playerProfile", { identity: who, displayName: name });
  }
  const procedure = { ...f.ctx, withTx: (callback: (ctx: unknown) => unknown) => f.transaction(() => callback(f.ctx)) };
  const read = <T>(entry: unknown, args: Record<string, unknown> = {}) => JSON.parse((entry as any)(procedure, args)) as T;
  return { ...f, read };
}

describe("developer console", () => {
  it("lists who is muted and banned now, soonest to end first, with who did it and the headline counts", () => {
    const f = fixture();
    f.run(server.devSetChatMute, { identity: rude, minutes: 120 });
    f.run(server.devSetChatMute, { identity: spammer, minutes: 30 });
    f.run(server.devSuspendPlayerAccount, { identity: spammer, expectedDisplayName: "Spammer", untilMicros: 0n, reason: "Link spam" });
    f.run(server.devSuspendPlayerAccount, { identity: rude, expectedDisplayName: "Rude",
      untilMicros: f.ctx.timestamp.microsSinceUnixEpoch + 3_600_000_000n, reason: "Cooling off" });
    f.seed("playerReport", { id: 1n, reporter, reporterName: "Reporter", target: rude, targetName: "Rude", reason: "harassment",
      note: "x", status: "pending", reportedAt: f.ctx.timestamp });
    f.seed("bugReport", { id: 1n, reporter, reporterName: "Reporter", message: "bug", protocolVersion: 1, reportedAt: f.ctx.timestamp });
    const console = f.read<DevConsole>(server.getDevConsole);
    expect(console.overview).toEqual({ pendingReports: 1, openBugs: 1, muted: 2, banned: 2 });
    expect(console.muted.map(row => [row.displayName, row.source, row.muteCount])).toEqual([["Spammer", "developer", 1], ["Rude", "developer", 1]]);
    expect(console.banned.map(row => [row.displayName, row.permanent, row.reason, row.by])).toEqual([
      ["Rude", false, "Cooling off", "Ryan"], ["Spammer", true, "Link spam", "Ryan"],
    ]);
  });

  it("builds a player card with names, standing, reports, history and their chat across channels", () => {
    const f = fixture();
    const at = (seconds: number) => new Timestamp(BigInt(seconds) * 1_000_000n);
    f.seed("chatMessage", { id: 1n, sender: rude, senderName: "Rude", message: "world line", sentAt: at(1) });
    f.seed("socialMessage", { id: 2n, channel: "dm", conversation: "c", sender: rude, recipient: reporter, recipientName: "Reporter",
      senderName: "Rude", message: "dm line", sentAt: at(2) });
    f.seed("chatMessageReport", { id: 1n, reporter, reporterName: "Reporter", accused: rude, senderName: "OldRude", messageId: 1n,
      message: "world line", messageModerated: false, sentAt: at(1), reason: "harassment", status: "pending", reportedAt: at(3) });
    f.seed("playerPrestige", { identity: rude, level: 4, perkPoints: 0, peakPower: 0, prestigedAt: at(1) });
    const card = f.read<DevPlayerCard>(server.getDevPlayerCard, { identity: rude });
    expect(card.summary.displayName).toBe("Rude");
    expect(card.pastNames).toEqual(["OldRude"]);
    expect(card).toMatchObject({ prestigeLevel: 4, reportsAgainst: 1, reportsFiled: 0 });
    expect(card.recentChat.map(line => [line.where, line.text])).toEqual([["DM with Reporter", "dm line"], ["World chat", "world line"]]);
  });

  it("warns by letter, logs it, and does not count it as a chat strike", () => {
    const f = fixture();
    f.run(server.devWarnPlayer, { identity: rude, message: "Please keep chat friendly." });
    const [letter] = [...f.db.playerMail.identity.filter(rude)];
    expect(letter).toMatchObject({ title: "Warning from the developer", body: "Warning from the developer: Please keep chat friendly." });
    expect(f.db.playerChatMute.identity.find(rude)).toBeNull();
    expect([...f.db.moderationAction.iter()].at(-1)).toMatchObject({ action: "Warning sent", reason: "Please keep chat friendly.", actorType: "developer" });
    expect(() => f.run(server.devWarnPlayer, { identity: rude, message: "  " })).toThrow("Write the warning");
  });

  it("resets an allowed display name through the moderation rename and logs the reason", () => {
    const f = fixture();
    expect(() => f.run(server.devResetDisplayName, { identity: rude, expectedDisplayName: "Other", reason: "" })).toThrow("name changed");
    f.run(server.devResetDisplayName, { identity: rude, expectedDisplayName: "Rude", reason: "Impersonation" });
    expect(f.db.playerProfile.identity.find(rude).displayName).not.toBe("Rude");
    expect([...f.db.moderationAction.iter()].at(-1)).toMatchObject({ action: "Name changed", before: "Rude", reason: "Impersonation", actorType: "developer" });
  });

  it("filters the moderation log by action type, player and text", () => {
    const f = fixture();
    f.run(server.devSetChatMute, { identity: rude, minutes: 60 });
    f.run(server.devWarnPlayer, { identity: spammer, message: "No links" });
    f.run(server.devSuspendPlayerAccount, { identity: spammer, expectedDisplayName: "Spammer", untilMicros: 0n, reason: "Links again" });
    const search = (text: string, category: string) =>
      f.read<ModerationHistoryPage>(server.getModerationLog, { text, category, fromMs: 0, toMs: 0, beforeId: 0n }).entries.map(entry => entry.action);
    expect(search("", "mute")).toEqual(["Chat muted"]);
    expect(search("spammer", "")).toEqual(["Account permanently suspended", "Warning sent"]);
    expect(search("links again", "")).toEqual(["Account permanently suspended"]);
    expect(search("", "automatic")).toEqual([]);
  });
});
