import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { publishRebalanceMail, mergeMailboxReceipts, publishMailboxLetter } from "./mailbox";
import { REBALANCE_MAIL_ID } from "../../shared/mailbox";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  f.seed("playerLifetime", { identity: f.ctx.sender, joinedAt: new Timestamp(1n), playedMicros: 0n, sessionStartedAt: new Timestamp(0n), enemyKills: 0n, deathCount: 0n });
  f.transaction(() => publishRebalanceMail(f.ctx as never));
  return f;
}
describe("mailbox", () => {
  it("delivers one shared letter without crediting or writing per-player state until opened", () => {
    const f = fixture();
    f.transaction(() => publishRebalanceMail(f.ctx as never));
    expect(f.db.mailboxLetter.count()).toBe(1n);
    expect(f.db.mailboxReceipt.count()).toBe(0n);
    expect(server.myMailboxV2(f.ctx as never)[0]).toMatchObject({ gems: 75n, read: false, claimed: false });
    f.run(server.readMailboxLetter, { id: REBALANCE_MAIL_ID });
    expect(server.myMailboxV2(f.ctx as never)[0]).toMatchObject({ read: true, claimed: false });
    expect(f.db.gemTransaction.count()).toBe(0n);
  });
  it("credits 75 gems once across repeated claims and keeps the claimed letter", () => {
    const f = fixture();
    f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID });
    f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID });
    expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(75n);
    expect(f.db.gemTransaction.count()).toBe(1n);
    expect(server.myMailboxV2(f.ctx as never)[0]).toMatchObject({ read: true, claimed: true });
  });
  it("excludes new/virtual identities and rejects forged campaigns and non-developer delivery", () => {
    const f = fixture();
    expect(() => f.run(server.claimMailboxGift, { id: "made-up" })).toThrow(/unavailable/);
    expect(() => f.run(server.devPublishMailboxLetter, { id: "forged", title: "x", body: "x", gems: 999n })).toThrow(/Developer/);
    f.patch("playerLifetime", { joinedAt: new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 1n) });
    expect(server.myMailboxV2(f.ctx as never)).toEqual([]);
    expect(() => f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID })).toThrow(/unavailable/);
    f.patch("playerLifetime", { joinedAt: new Timestamp(1n) });
    f.seed("virtualPlayer", { identity: f.ctx.sender });
    expect(server.myMailboxV2(f.ctx as never)).toEqual([]);
  });
  it("preserves a claimed guest receipt when registering so it cannot pay again", () => {
    const f = fixture(), account = identity("2");
    f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID });
    f.transaction(() => mergeMailboxReceipts(f.ctx as never, f.ctx.sender, account));
    f.seed("playerLifetime", { identity: account, joinedAt: new Timestamp(1n) });
    expect(server.myMailboxV2({ ...f.ctx, sender: account } as never)[0].claimed).toBe(true);
    expect([...f.db.mailboxReceipt.identity.filter(f.ctx.sender)]).toEqual([]);
    expect([...f.db.mailboxReceipt.identity.filter(account)]).toHaveLength(1);
  });
  it("edits wording without resetting claims, reward, dates or eligibility", () => {
    const f = fixture();
    f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID });
    const before = f.db.mailboxLetter.id.find(REBALANCE_MAIL_ID);
    f.transaction(() => publishMailboxLetter(f.ctx as never, { ...before, title: "Quick update", body: "Thanks everyone -- here's what changed." }));
    expect(f.db.mailboxLetter.id.find(REBALANCE_MAIL_ID)).toMatchObject({ ...before, title: "Quick update", body: "Thanks everyone -- here's what changed." });
    f.run(server.claimMailboxGift, { id: REBALANCE_MAIL_ID });
    expect(f.db.playerGemWallet.identity.find(f.ctx.sender).balance).toBe(75n);
    expect(f.db.gemTransaction.count()).toBe(1n);
    expect(server.myMailboxV2(f.ctx as never)[0].claimed).toBe(true);
  });
  it("rejects changing an already-published gift amount", () => {
    const f = fixture(), letter = f.db.mailboxLetter.id.find(REBALANCE_MAIL_ID);
    expect(() => f.transaction(() => publishMailboxLetter(f.ctx as never, { ...letter, gems: 500n }))).toThrow(/already in use/);
  });
});
