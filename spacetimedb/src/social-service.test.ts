import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { mergeSocialAccount, removeSocialAccount } from "./social-service";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
function fixture() {
  const f = crystalFixture(), basePlayer = f.db.player.identity.find(f.ctx.sender), connection = f.ctx.connectionId!;
  function actor(digit: string) {
    const who = identity(digit); f.ctx.sender = who; f.ctx.connectionId = connection;
    if (!f.db.playerProgress.identity.find(who)) f.progress(who);
    if (!f.db.playerProfile.identity.find(who)) f.seed("playerProfile", { identity: who, displayName: `Player ${digit}`, skinTone: 3 });
    f.db.playerProfile.identity.update({ ...f.db.playerProfile.identity.find(who), displayName: `Player ${digit}` });
    if (!f.db.player.identity.find(who)) f.seed("player", { ...basePlayer, identity: who });
    if (!f.db.playerController.identity.find(who)) f.seed("playerController", { identity: who, connectionId: connection });
    f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(connection), identity: who });
  }
  for (const digit of ["1", "2", "3", "4"]) actor(digit);
  const friend = (a = "1", b = "2") => { actor(a); f.run(server.friendAction, { action: "request", target: `Player ${b}` }); const row = [...f.db.socialRequest.sender.filter(identity(a))][0]; actor(b); f.run(server.friendAction, { action: "accept", target: String(row.id) }); };
  const send = (channel: string, target: string, message = "Hello", replyToMessageId = 0n) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 3_000_000n); f.run(server.sendSocialMessage, { channel, target, message, replyToMessageId }); };
  const visible = () => (server.mySocialMessages as any)(f.ctx);
  const snapshot = () => JSON.parse((server.mySocialHub as any)(f.ctx)[0].snapshot);
  actor("1"); return { ...f, actor, friend, send, visible, snapshot };
}
describe("private social interactions", () => {
  it("requires recipient consent, persists reciprocal friends, and prevents third party request mutation", () => {
    const f = fixture(); f.run(server.friendAction, { action: "request", target: "Player 2" });
    expect(f.snapshot().outgoingRequests).toHaveLength(1);
    f.actor("3"); expect(() => f.run(server.friendAction, { action: "accept", target: "1" })).toThrow("not yours");
    f.actor("2"); expect(f.snapshot().incomingRequests).toHaveLength(1);
    f.run(server.friendAction, { action: "accept", target: "1" });
    expect(f.snapshot().friends[0].identity).toBe(identity("1").toHexString());
    f.actor("1"); expect(f.snapshot().friends).toHaveLength(1);
    f.run(server.friendAction, { action: "remove", target: identity("2").toHexString() });
    f.actor("2"); expect(f.snapshot().friends).toHaveLength(0);
  });
  it("confines DMs to participants, checks friendship, and revokes blocked content", () => {
    const f = fixture(); expect(() => f.send("dm", "Player 2")).toThrow("friend");
    f.friend(); f.actor("1"); f.send("dm", "Player 2", "Private hello");
    expect(f.visible()[0].message).toBe("Private hello");
    f.actor("3"); expect(f.visible()).toHaveLength(0);
    expect(() => f.run(server.reportSocialMessage, { messageId: 1n, reason: "harassment" })).toThrow();
    f.actor("2"); expect(f.visible()).toHaveLength(1);
    f.run(server.reportSocialMessage, { messageId: 1n, reason: "harassment" });
    expect([...f.db.playerReport.iter()][0]).toMatchObject({ note: "[Private message #1] Private hello", status: "pending" });
    expect(() => f.run(server.reportSocialMessage, { messageId: 1n, reason: "harassment" })).toThrow("already reported");
    f.run(server.setPlayerBlocked, { target: identity("1"), blocked: true }); expect(f.visible()).toHaveLength(0);
    f.actor("1"); expect(f.visible()).toHaveLength(0); expect(() => f.send("dm", "Player 2")).toThrow("unavailable");
  });
  it("scopes guild invitations to leaders and invitees, then revokes chat on leaving", () => {
    const f = fixture(); f.run(server.createGuild, { name: "Rose" });
    f.run(server.guildInviteAction, { action: "invite", target: "Player 2", invitationId: 0n });
    f.actor("3"); expect(() => f.run(server.guildInviteAction, { action: "accept", target: "", invitationId: 1n })).toThrow("not yours");
    f.actor("2"); expect(f.snapshot().guildInvitations).toHaveLength(1);
    f.run(server.guildInviteAction, { action: "accept", target: "", invitationId: 1n });
    expect(() => f.run(server.guildInviteAction, { action: "invite", target: "Player 3", invitationId: 0n })).toThrow("leader");
    f.send("guild", "", "Guild hello"); f.actor("1"); expect(f.visible()).toHaveLength(1);
    f.actor("3"); expect(f.visible()).toHaveLength(0);
    f.actor("2"); f.run(server.leaveGuild); expect(f.visible()).toHaveLength(0);
    f.actor("1"); f.run(server.leaveGuild); expect(f.db.socialMessage.count()).toBe(0n);
  });
  it("bounds retained messages and rejects cross-conversation reply snapshots", () => {
    const f = fixture(); f.friend(); f.actor("1");
    for (let n = 0; n < 105; n++) f.send("dm", "Player 2", `Message ${n}`);
    expect(f.visible()).toHaveLength(100); expect(f.visible()[0].message).toBe("Message 5");
    f.run(server.createGuild, { name: "Rose" }); expect(() => f.send("guild", "", "Reply", 105n)).toThrow("conversation");
  });
  it("erases quoted content on deletion and carries relationships/messages through linking", () => {
    const f = fixture(); f.friend(); f.actor("1"); f.send("dm", "Player 2", "Original");
    f.actor("2"); f.send("dm", "Player 1", "Reply", 1n);
    f.transaction(() => mergeSocialAccount(f.ctx as any, identity("1") as any, identity("3") as any));
    f.actor("3"); expect(f.snapshot().friends).toHaveLength(1); expect(f.visible()).toHaveLength(2);
    f.actor("1"); expect(f.visible()).toHaveLength(0);
    f.transaction(() => removeSocialAccount(f.ctx as any, identity("3") as any));
    f.actor("2"); expect(f.visible()).toHaveLength(0); expect(f.snapshot().friends).toHaveLength(0);
  });
  it("does not expose blocked authors through quoted guild replies", () => {
    const f = fixture(); f.run(server.createGuild, { name: "Rose" });
    f.actor("2"); f.run(server.joinGuild, { guildId: 1n });
    f.actor("3"); f.run(server.joinGuild, { guildId: 1n });
    f.actor("1"); f.send("guild", "", "Hidden original");
    f.actor("2"); f.send("guild", "", "Visible reply", 1n);
    f.actor("3"); f.run(server.setPlayerBlocked, { target: identity("1"), blocked: true });
    expect(f.visible()).toHaveLength(1); expect(f.visible()[0].replyToMessage).toBe("");
    f.transaction(() => removeSocialAccount(f.ctx as any, identity("1") as any));
    expect(f.visible()[0].replyToMessage).toBe("");
  });
});
