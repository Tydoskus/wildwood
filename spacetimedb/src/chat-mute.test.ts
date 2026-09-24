import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Identity, Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { createTestGuild } from "../../tests/helpers/guild-creation";
import { eraseIdentityRows } from "./account-erasure";
import {
  CHAT_MUTE_FIRST_MS,
  CHAT_MUTE_REPEAT_MS,
  CHAT_MUTE_REPEAT_WINDOW_MS,
  CHAT_MUTE_STRIKE_WINDOW_MS,
  chatMuteRefusal,
  formatChatMuteRemaining,
} from "../../shared/chat-mute";
import { ATTACK_BALANCE_VERSION, BOSS_REWARD_CLAIM_BITS, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const START = 20_000 * DAY_MS;
const FILTERED = "send nudes";

let clock = START;
const at = (f: Fixture, ms: number) => { clock = ms; f.ctx.timestamp = new Timestamp(BigInt(ms) * 1000n); };
/** Past the three-second chat cooldown, so each send is a separate attempt. */
const later = (f: Fixture, ms = 3_000) => at(f, clock + ms);
const row = (f: Fixture, who = f.ctx.sender) => f.db.playerChatMute.identity.find(who);
const mutedUntilMs = (f: Fixture, who = f.ctx.sender) => Number((row(f, who)?.mutedUntilMicros ?? 0n) / 1000n);
const world = (f: Fixture, message = FILTERED) => { later(f); f.run(server.sendChatMessage, { message }); };
const social = (f: Fixture, channel: "guild" | "dm", message = FILTERED, replyToMessageId = 0n) => {
  later(f);
  f.run(server.sendSocialMessage, { channel, target: channel === "dm" ? "Player 2" : "", message, replyToMessageId });
};
const muteLogs = (f: Fixture) => [...f.db.moderationAction.iter()].filter(entry => entry.action.startsWith("Chat mute"));

function fixture() {
  const f = crystalFixture();
  at(f, START);
  f.seed("playerProfile", { identity: identity("2"), displayName: "Player 2", skinTone: 3 });
  return f;
}

it("does not mute on two strikes, mutes for an hour on the third within a day, and logs it", () => {
  const f = fixture();
  world(f); world(f);
  expect(row(f).strikeAtMicros).toHaveLength(2);
  expect(mutedUntilMs(f)).toBe(0);
  world(f, "Hello");
  expect(muteLogs(f)).toHaveLength(0);

  world(f);
  const mutedAt = clock;
  expect(mutedUntilMs(f)).toBe(mutedAt + CHAT_MUTE_FIRST_MS);
  expect(row(f)).toMatchObject({ strikeAtMicros: [], muteCount: 1, lastMuteAtMicros: BigInt(mutedAt) * 1000n });
  const [log] = muteLogs(f);
  expect(log).toMatchObject({ action: "Chat muted", actorType: "automatic", actorIdentity: "", rule: "auto-chat-mute",
    channel: "world", targetIdentity: f.ctx.sender.toHexString(), targetName: "Test Player" });
  expect(log.reason).toContain("3 filtered messages");
  expect(log.reason).toContain("1h");
  // The third message itself is stored as moderated text, like any filtered one.
  expect([...f.db.chatMessage.iter()].filter(message => message.moderated)).toHaveLength(3);
});

it("counts strikes across world, guild and private messages", () => {
  const f = fixture();
  createTestGuild(f, "Rose");
  world(f); social(f, "guild"); social(f, "dm");
  expect(mutedUntilMs(f)).toBe(clock + CHAT_MUTE_FIRST_MS);
  expect(muteLogs(f)[0].channel).toBe("dm");
});

it("lets strikes older than a day fall away", () => {
  const f = fixture();
  world(f);
  const first = clock;
  at(f, first + HOUR_MS);
  world(f);
  at(f, first + CHAT_MUTE_STRIKE_WINDOW_MS);
  world(f);
  expect(mutedUntilMs(f)).toBe(0);
  expect(row(f).strikeAtMicros).toHaveLength(2);
  world(f);
  expect(mutedUntilMs(f)).toBe(clock + CHAT_MUTE_FIRST_MS);
});

it("makes a mute within seven days of the last one 24 hours, and goes back to an hour after seven clear days", () => {
  const f = fixture();
  const strikeOut = () => { world(f); world(f); world(f); };
  strikeOut();
  const firstMute = clock;
  expect(mutedUntilMs(f) - firstMute).toBe(CHAT_MUTE_FIRST_MS);

  // Strikes reset when a mute starts: after it ends, it takes three new ones.
  at(f, firstMute + 2 * DAY_MS);
  world(f); world(f);
  expect(mutedUntilMs(f)).toBe(firstMute + CHAT_MUTE_FIRST_MS);
  world(f);
  const secondMute = clock;
  expect(mutedUntilMs(f) - secondMute).toBe(CHAT_MUTE_REPEAT_MS);
  expect(muteLogs(f)[1].reason).toContain("24h");

  // Any further mute inside the window is 24 hours as well.
  at(f, secondMute + CHAT_MUTE_REPEAT_MS);
  strikeOut();
  const thirdMute = clock;
  expect(mutedUntilMs(f) - thirdMute).toBe(CHAT_MUTE_REPEAT_MS);

  at(f, thirdMute + CHAT_MUTE_REPEAT_WINDOW_MS);
  strikeOut();
  expect(mutedUntilMs(f) - clock).toBe(CHAT_MUTE_FIRST_MS);
  expect(row(f).muteCount).toBe(4);
});

it("refuses every send path while muted, before the cooldown, inserting nothing", () => {
  const f = fixture();
  createTestGuild(f, "Rose");
  world(f, "Hello");
  const replyTo = [...f.db.chatMessage.iter()][0].id;
  social(f, "guild", "Guild hello");
  const guildReplyTo = [...f.db.socialMessage.iter()][0].id;
  world(f); world(f); world(f);
  const mutedAt = clock;
  const counts = () => ({ world: f.db.chatMessage.count(), social: f.db.socialMessage.count(), actions: f.db.moderationAction.count() });
  const before = counts();
  const cooldown = f.db.chatCooldown.identity.find(f.ctx.sender);

  // One second after the third strike: still inside the three-second cooldown,
  // so this is the mute refusing, not the cooldown.
  at(f, mutedAt + 1_000);
  const refusal = chatMuteRefusal(CHAT_MUTE_FIRST_MS - 1_000);
  expect(refusal).toBe("Chat muted for 59:59 — repeated filtered messages.");
  expect(() => f.run(server.sendChatMessage, { message: "Hello" })).toThrow(refusal);
  expect(() => f.run(server.sendChatReply, { message: "Hello", replyToMessageId: replyTo })).toThrow(refusal);
  expect(() => f.run(server.sendSocialMessage, { channel: "guild", target: "", message: "Hi", replyToMessageId: 0n })).toThrow(refusal);
  expect(() => f.run(server.sendSocialMessage, { channel: "guild", target: "", message: "Hi", replyToMessageId: guildReplyTo })).toThrow(refusal);
  expect(() => f.run(server.sendSocialMessage, { channel: "dm", target: "Player 2", message: "Hi", replyToMessageId: 0n })).toThrow(refusal);
  expect(counts()).toEqual(before);
  expect(f.db.chatCooldown.identity.find(f.ctx.sender)).toEqual(cooldown);
  expect(row(f).strikeAtMicros).toEqual([]);
});

it("refuses adding or removing a reaction while muted, and still lets the player read them", () => {
  const f = fixture();
  f.seed("chatMessage", { id: 900n, sender: identity("2"), senderName: "Player 2", message: "Nice", sentAt: f.ctx.timestamp });
  later(f);
  f.run(server.setChatMessageReaction, { channel: "public", messageId: 900n, reaction: "heart", active: true });
  world(f); world(f); world(f);
  const reactions = () => [...f.db.chatReaction.iter()].map(({ reaction, active }) => ({ reaction, active }));
  const before = reactions();
  expect(before).toEqual([{ reaction: "heart", active: true }]);
  later(f);
  const refusal = /^Chat muted for \d+:\d\d — repeated filtered messages\.$/;
  expect(() => f.run(server.setChatMessageReaction, { channel: "public", messageId: 900n, reaction: "like", active: true })).toThrow(refusal);
  expect(() => f.run(server.setChatMessageReaction, { channel: "public", messageId: 900n, reaction: "heart", active: false })).toThrow(refusal);
  expect(reactions()).toEqual(before);
  expect(f.db.chatReactionSummary.key.find("public:900")?.countsJson).toBe(JSON.stringify({ heart: 1 }));
  // Reading is untouched: the public feed and the reaction state still serve a muted player.
  expect((server.latestChatMessagesWithReactions as any)(f.ctx).some((message: any) => message.id === 900n)).toBe(true);
});

it("still takes /bug reports while muted", () => {
  const f = fixture();
  world(f); world(f); world(f);
  later(f);
  f.run(server.sendChatMessage, { message: "/bug the map froze" });
  expect([...f.db.bugReport.iter()]).toMatchObject([{ message: "the map froze", reporter: f.ctx.sender }]);
});

it("ends on time", () => {
  const f = fixture();
  world(f); world(f); world(f);
  const until = mutedUntilMs(f);
  at(f, until - 1);
  expect(() => f.run(server.sendChatMessage, { message: "Hello" })).toThrow("Chat muted for 0:01");
  at(f, until);
  f.run(server.sendChatMessage, { message: "Hello" });
  expect([...f.db.chatMessage.iter()].at(-1)).toMatchObject({ message: "Hello", moderated: false });
});

it("refuses a player, lets the database owner set and lift a mute, and logs both", () => {
  const f = fixture();
  const target = f.ctx.sender;
  const player = { sender: target, connectionId: f.ctx.connectionId };
  expect(() => f.run(server.devSetChatMute, { identity: target, minutes: 90 })).toThrow("Developer access required.");
  expect(row(f, target)).toBeNull();

  f.ctx.sender = owner; f.ctx.connectionId = null;
  expect(() => f.run(server.devSetChatMute, { identity: identity("9"), minutes: 90 })).toThrow("Player not found.");
  expect(() => f.run(server.devSetChatMute, { identity: target, minutes: 30 * 24 * 60 + 1 })).toThrow("Choose 0 to 43200 minutes.");
  f.run(server.devSetChatMute, { identity: target, minutes: 90 });
  expect(mutedUntilMs(f, target)).toBe(clock + 90 * 60_000);
  expect(row(f, target).muteCount).toBe(1);

  Object.assign(f.ctx, player);
  later(f);
  expect(() => f.run(server.sendChatMessage, { message: "Hello" })).toThrow(`Chat muted for ${formatChatMuteRemaining(90 * 60_000 - 3_000)}`);

  f.ctx.sender = owner; f.ctx.connectionId = null;
  f.run(server.devSetChatMute, { identity: target, minutes: 0 });
  Object.assign(f.ctx, player);
  f.run(server.sendChatMessage, { message: "Hello" });

  const logs = muteLogs(f);
  expect(logs.map(entry => entry.action)).toEqual(["Chat muted", "Chat mute lifted"]);
  expect(logs[0]).toMatchObject({ actorType: "owner", actorIdentity: owner.toHexString(), rule: "owner-chat-mute", channel: "account" });
  expect(logs[0].before).toContain("Not muted");
  expect(logs[0].after).toContain("Muted for 1:30:00");
  expect(logs[1].after).toContain("Not muted");

  // A lift with nothing to lift writes nothing.
  f.ctx.sender = owner; f.ctx.connectionId = null;
  f.run(server.devSetChatMute, { identity: target, minutes: 0 });
  expect(muteLogs(f)).toHaveLength(2);
});

function linkGuest(f: Fixture, guest: Identity) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "mute-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "mute-link" });
}
const micros = (ms: number) => BigInt(ms) * 1000n;
const seedMute = (f: Fixture, who: Identity, values: { strikes?: number[]; until?: number; last?: number; count?: number }) =>
  f.seed("playerChatMute", { identity: who, strikeAtMicros: (values.strikes ?? []).map(micros),
    mutedUntilMicros: micros(values.until ?? 0), lastMuteAtMicros: micros(values.last ?? 0), muteCount: values.count ?? 0 });

it("keeps the later mute and the higher count when a guest links, and removes the guest row", () => {
  const f = fixture();
  const guest = identity("4");
  seedMute(f, guest, { until: START + 20 * HOUR_MS, last: START - 4 * HOUR_MS, count: 2, strikes: [START - HOUR_MS] });
  seedMute(f, f.ctx.sender, { until: START + HOUR_MS, last: START, count: 1, strikes: [START - 2 * HOUR_MS] });
  linkGuest(f, guest);
  expect(row(f, guest)).toBeNull();
  expect(row(f)).toMatchObject({ mutedUntilMicros: micros(START + 20 * HOUR_MS), lastMuteAtMicros: micros(START), muteCount: 2,
    strikeAtMicros: [micros(START - 2 * HOUR_MS), micros(START - HOUR_MS)] });

  // A guest with a mute and an account without a row: the mute moves across.
  const clean = fixture();
  seedMute(clean, guest, { until: START + HOUR_MS, last: START, count: 1 });
  linkGuest(clean, guest);
  expect(mutedUntilMs(clean)).toBe(START + HOUR_MS);
  expect(row(clean, guest)).toBeNull();
});

it("is erased with the account and leaves other accounts alone", () => {
  const f = fixture();
  world(f);
  seedMute(f, identity("3"), { count: 1 });
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(row(f)).toBeNull();
  expect(row(f, identity("3"))).not.toBeNull();
});

it("is removed wherever a player's or simulated client's rows are removed, and merged on link", () => {
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeChatMute(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeChatMute(ctx, identity)");
  expect(section("function claimGuestAccountFor", "function removeIdentityPresence")).toContain("mergeChatMute(ctx, link.guest, ctx.sender)");
});

it("survives a prestige and a progress reset", () => {
  const f = fixture();
  world(f); world(f); world(f);
  const muted = row(f);
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
  f.run(server.prestigeAccount, {});
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 1 });
  expect(row(f)).toEqual(muted);
  f.run(server.resetPlayerProgress, {});
  expect(row(f)).toEqual(muted);
  later(f);
  expect(() => f.run(server.sendChatMessage, { message: "Hello" })).toThrow("Chat muted for");
});
