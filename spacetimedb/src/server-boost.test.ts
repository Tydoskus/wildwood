import { describe, expect, it, vi } from "vitest";
import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import { PROTOCOL_VERSION } from "../../shared/rules";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { progressOf } from "../../tests/helpers/progress";
import { SERVER_BOOST_DURATION_MS, SERVER_BOOST_COOLDOWN_MS } from "../../shared/server-boost";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { goldFor } from "./gold";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const nowMs = (f: any) => Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n);
const advance = (f: any, ms: number) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(ms) * 1000n); };
const start = (f: any) => f.run(server.startServerBoost);
const endsAt = (f: any) => f.db.serverBoost.id.find(0)?.endsAtMs;

/** Puts `who` in the world on a connection of their own and makes them the caller. */
function seat(f: any, who: Identity, connection: bigint) {
  const connectionId = new ConnectionId(connection);
  f.seed("playerSession", { connectionId, identity: who, enteredWorld: true, protocolVersion: PROTOCOL_VERSION, connectedAt: f.ctx.timestamp, tabId: "test" });
  f.seed("playerController", { identity: who, connectionId });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: who });
  f.ctx.sender = who; f.ctx.connectionId = connectionId;
}

function supporter(tier = "silver") {
  const f = crystalFixture();
  f.seed("patreonLink", { identity: f.ctx.sender, userId: "1", accessToken: "a", refreshToken: "r", tier, frame: tier,
    validUntilMs: nowMs(f) + 30 * SERVER_BOOST_COOLDOWN_MS, checkedAtMs: nowMs(f), attemptedAtMs: nowMs(f) });
  return f;
}

describe("server boost", () => {
  it("is a supporter perk: a non-supporter or lapsed membership cannot start it", () => {
    const f = crystalFixture();
    expect(() => start(f)).toThrow();
    const lapsed = supporter();
    lapsed.db.patreonLink.identity.update({ ...lapsed.db.patreonLink.identity.find(lapsed.ctx.sender), validUntilMs: nowMs(lapsed) - 1 });
    expect(() => start(lapsed)).toThrow();
    expect(endsAt(f)).toBeUndefined();
    expect(endsAt(lapsed)).toBeUndefined();
  });

  it("runs 15 minutes, announces once in chat, and waits a day per account", () => {
    const f = supporter("diamond");
    start(f);
    expect(endsAt(f)).toBe(nowMs(f) + SERVER_BOOST_DURATION_MS);
    const [announced] = [...f.db.chatMessage.iter()];
    expect([...f.db.chatMessage.iter()]).toHaveLength(1);
    expect(f.db.chatAnnouncement.messageId.find(announced.id)?.kind).toBe("server-boost");
    // The same words typed by a player are an ordinary message: only the server marks an announcement.
    advance(f, 60_000);
    f.run(server.sendChatMessage, { message: announced.message });
    const typed = [...f.db.chatMessage.iter()].find((row: any) => row.id !== announced.id);
    expect(typed?.message).toBe(announced.message);
    expect(f.db.chatAnnouncement.messageId.find(typed.id)).toBeFalsy();
    advance(f, SERVER_BOOST_COOLDOWN_MS - 60_001);
    expect(() => start(f)).toThrow();
    advance(f, 1);
    start(f);
    expect(endsAt(f)).toBe(nowMs(f) + SERVER_BOOST_DURATION_MS);
  });

  it("extends a running boost by 15 minutes for every supporter who starts one, with no cap", () => {
    const f = supporter();
    start(f);
    const first = endsAt(f);
    // Other supporters add theirs: each one is time, never a bigger multiplier.
    for (const digit of ["2", "3", "4", "5", "6", "7", "8", "9"]) {
      const other = identity(digit);
      f.seed("patreonLink", { identity: other, userId: digit, accessToken: "a", refreshToken: "r", tier: "gold", frame: "gold",
        validUntilMs: nowMs(f) + SERVER_BOOST_COOLDOWN_MS, checkedAtMs: nowMs(f), attemptedAtMs: nowMs(f) });
      seat(f, other, BigInt(10 + Number(digit)));
      start(f);
    }
    expect(endsAt(f)).toBe(first + 8 * SERVER_BOOST_DURATION_MS);
  });

  it("lets a developer start it without a membership or the daily wait", () => {
    const f = crystalFixture();
    const dev = Identity.fromString(DEVELOPER_IDENTITY);
    seat(f, dev, 2n);
    start(f);
    start(f);
    expect(endsAt(f)).toBe(nowMs(f) + 2 * SERVER_BOOST_DURATION_MS);
  });

  it("doubles a kill report's stat rewards and gold, with the same kills accepted", () => {
    const paid = (boosted: boolean) => {
      const f: any = supporter();
      f.patch("playerProgress", { damage: 1e12 });
      fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
      f.ctx.random = Object.assign(() => 0.01, { integerInRange: f.ctx.random.integerInRange });
      if (boosted) start(f);
      const before = progressOf(f).damage;
      reportEnemy(f, "Shard Hopper", 3);
      return { damage: progressOf(f).damage - before, gold: Number(goldFor(f.ctx, f.ctx.sender)),
        kills: f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills };
    };
    const plain = paid(false), boosted = paid(true);
    expect(boosted.kills).toBe(plain.kills);
    expect(plain.damage).toBeGreaterThan(0);
    expect(boosted.damage / plain.damage).toBeCloseTo(2, 6);
    expect(plain.gold).toBeGreaterThan(0);
    expect(boosted.gold).toBe(plain.gold * 2);
  });

  it("stops paying double once the boost has ended", () => {
    const f = supporter();
    f.patch("playerProgress", { damage: 1e12 });
    start(f);
    advance(f, SERVER_BOOST_DURATION_MS + 60_000);
    fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
    const before = progressOf(f).damage;
    reportEnemy(f, "Shard Hopper", 1);
    const once = progressOf(f).damage - before;
    const g = supporter();
    g.patch("playerProgress", { damage: 1e12 });
    advance(g, SERVER_BOOST_DURATION_MS + 60_000);
    fillDefeatBudget(g, "crystal_hollows", "Shard Hopper");
    const plainBefore = progressOf(g).damage;
    reportEnemy(g, "Shard Hopper", 1);
    expect(once).toBeCloseTo(progressOf(g).damage - plainBefore, 6);
  });
});
