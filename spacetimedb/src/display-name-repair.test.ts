import { expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { isPublicDisplayNameAllowed } from "./chat-moderation";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");

it("repairs an offline name and public presentation without changing the save", () => {
  const f = crystalFixture(), target = f.ctx.sender;
  const name = "A naked little boy";
  f.patch("playerProfile", { displayName: name });
  // The board only carries players who have beaten the Dragon, and the repair
  // has to reach their row there.
  f.patch("playerProgress", { desertUnlocked: true });
  f.db.player.identity.delete(target);
  f.seed("leaderboardEntry", { identity: target, displayName: name });
  f.seed("guildMember", { identity: target, guildId: 1n, name });
  f.seed("chatMessage", { id: 1n, sender: target, senderName: name, message: "Hello", sentAt: f.ctx.timestamp });
  f.seed("playerNameCooldown", { identity: target });
  const before = f.db.playerProgress.identity.find(target);
  const args = { identity: target, expectedDisplayName: name };
  expect(() => f.run(server.devRepairDisplayName, args)).toThrow("Database owner required");
  f.ctx.sender = owner;
  expect(() => f.run(server.devRepairDisplayName, { ...args, expectedDisplayName: "Old name" })).toThrow("name changed");
  f.run(server.devRepairDisplayName, args);
  const repaired = f.db.playerProfile.identity.find(target).displayName;
  expect(repaired).not.toBe(name);
  expect(isPublicDisplayNameAllowed(repaired)).toBe(true);
  expect(f.db.leaderboardEntry.identity.find(target).displayName).toBe(repaired);
  expect(f.db.guildMember.identity.find(target).name).toBe(repaired);
  expect(f.db.chatMessage.id.find(1n)).toMatchObject({ senderName: repaired, message: "Hello" });
  expect(f.db.playerNameCooldown.identity.find(target)).toBeNull();
  expect(f.db.playerProgress.identity.find(target)).toEqual(before);
  expect(f.db.player.identity.find(target)).toBeNull();
  expect([...f.db.moderationAction.iter()][0]).toMatchObject({ action: "Name changed", actorType: "owner",
    actorIdentity: owner.toHexString(), before: name, after: repaired, rule: "content-filter-v5" });
  f.run(server.devRepairDisplayName, { ...args, expectedDisplayName: repaired });
  expect(f.db.playerProfile.identity.find(target).displayName).toBe(repaired);
  expect(f.db.moderationAction.count()).toBe(1n);
});

it.each(["CHALLENGER_WIN", "OPPONENT_WIN", "DRAW"])("repairs completed duel history after an earlier rename: %s", outcome => {
  const f = crystalFixture(), target = f.ctx.sender;
  const other = identity("2");
  const oldName = "A naked little boy", newName = "Quiet Wolf 596";
  f.patch("playerProfile", { displayName: newName });
  for (const challenger of [true, false]) {
    const id = challenger ? 1n : 2n;
    const challengerName = challenger ? oldName : "Opponent";
    const opponentName = challenger ? "Opponent" : oldName;
    f.seed("duelReplay", { id, challengerIdentity: (challenger ? target : other).toHexString(),
      opponentIdentity: (challenger ? other : target).toHexString(), challengerName, opponentName,
      winnerName: outcome === "DRAW" ? "DRAW" : outcome === "CHALLENGER_WIN" ? challengerName : opponentName,
      challengerDamageDealt: 123, opponentFinalHp: 7 });
    f.seed("chatMessage", { id, sender: challenger ? target : other, senderName: challengerName,
      replayId: id, message: "Old announcement", sentAt: f.ctx.timestamp });
  }
  f.seed("chatMessage", { id: 3n, sender: other, senderName: "Opponent", message: "Nice duel",
    replyToMessageId: 1n, replyToSenderName: oldName, replyToMessage: "Old announcement" });
  f.seed("chatMessage", { id: 4n, sender: other, senderName: "Opponent", message: "Message moderated.",
    replayId: 1n, moderated: true });
  f.seed("chatMessage", { id: 5n, sender: other, senderName: "Opponent", message: oldName });
  f.ctx.sender = owner;
  f.run(server.devRepairDisplayName, { identity: target, expectedDisplayName: newName });
  for (const id of [1n, 2n]) {
    const replay = f.db.duelReplay.id.find(id);
    expect(id === 1n ? replay.challengerName : replay.opponentName).toBe(newName);
    expect(replay.winnerName).toBe(outcome === "DRAW" ? "DRAW"
      : outcome === "CHALLENGER_WIN" ? replay.challengerName : replay.opponentName);
    expect(replay).toMatchObject({ challengerDamageDealt: 123, opponentFinalHp: 7 });
    const announcement = f.db.chatMessage.id.find(id).message;
    expect(announcement).toContain(newName);
    expect(announcement).not.toContain(oldName);
    expect(announcement).toContain(outcome === "DRAW" ? "drew" : outcome === "CHALLENGER_WIN" ? "beat" : "lost to");
  }
  expect(f.db.chatMessage.id.find(3n)).toMatchObject({ replyToSenderName: newName,
    replyToMessage: f.db.chatMessage.id.find(1n).message });
  expect(f.db.chatMessage.id.find(4n).message).toBe("Message moderated.");
  expect(f.db.chatMessage.id.find(5n).message).toBe(oldName);
});
