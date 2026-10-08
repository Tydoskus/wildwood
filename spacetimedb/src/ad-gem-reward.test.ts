import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { eraseIdentityRows } from "./account-erasure";
import { AD_GEM_COOLDOWN_MS, AD_GEM_DAILY_LIMIT, AD_GEM_REWARD, utcDayKey } from "../../shared/ad-gem-reward";
import { ATTACK_BALANCE_VERSION, PROTOCOL_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** A working day's midday, so a morning of claims stays inside one UTC day. */
const NOON = 20_000 * DAY_MS + 12 * 60 * MINUTE_MS;

const at = (f: Fixture, ms: number) => { f.ctx.timestamp = new Timestamp(BigInt(ms) * 1000n); };
const balance = (f: Fixture, who = f.ctx.sender) => f.db.playerGemWallet.identity.find(who)?.balance ?? 0n;
const row = (f: Fixture, who = f.ctx.sender) => f.db.playerAdReward.identity.find(who);
const claim = (f: Fixture) => f.run(server.claimAdGems);

it("pays 10 Gems, refuses inside thirty minutes, and pays again after", () => {
  const f = crystalFixture();
  at(f, NOON);
  claim(f);
  expect(balance(f)).toBe(BigInt(AD_GEM_REWARD));
  expect(row(f)).toMatchObject({ dayKey: utcDayKey(NOON), claimsToday: 1 });
  expect(row(f).lastClaimAt).toEqual(f.ctx.timestamp);
  const ledger = [...f.db.gemTransaction.iter()].filter(tx => tx.kind === "ad_reward");
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({ delta: 10n, balanceAfter: 10n });

  at(f, NOON + 17 * MINUTE_MS + 26_000);
  expect(() => claim(f)).toThrow("Next ad in 12:34");
  expect(balance(f)).toBe(10n);
  at(f, NOON + AD_GEM_COOLDOWN_MS - 1);
  expect(() => claim(f)).toThrow("Next ad in 0:01");

  at(f, NOON + AD_GEM_COOLDOWN_MS);
  claim(f);
  expect(balance(f)).toBe(20n);
  expect(row(f)).toMatchObject({ claimsToday: 2 });
});

it("pays four a day thirty minutes apart, refuses the fifth, and pays again after the UTC reset", () => {
  const f = crystalFixture();
  for (let index = 0; index < AD_GEM_DAILY_LIMIT; index += 1) {
    at(f, NOON + index * AD_GEM_COOLDOWN_MS);
    claim(f);
  }
  expect(balance(f)).toBe(40n);
  expect(row(f)).toMatchObject({ claimsToday: 4 });

  // Two hours after the fourth: the cooldown is long over, the day is not.
  const fifth = NOON + 3 * AD_GEM_COOLDOWN_MS + 2 * 60 * MINUTE_MS;
  at(f, fifth);
  expect(() => claim(f)).toThrow("No more ads today · resets in 8:30:00");
  expect(balance(f)).toBe(40n);

  // 00:00 UTC, the daily Gem bonus's boundary.
  const midnight = (Math.floor(NOON / DAY_MS) + 1) * DAY_MS;
  at(f, midnight - 1);
  expect(() => claim(f)).toThrow(/^No more ads today · resets in 0:01$/);
  at(f, midnight);
  claim(f);
  expect(balance(f)).toBe(50n);
  expect(row(f)).toMatchObject({ dayKey: utcDayKey(midnight), claimsToday: 1 });
});

it("keeps the thirty minutes across midnight: a new day brings claims, not an early one", () => {
  const f = crystalFixture();
  const midnight = (Math.floor(NOON / DAY_MS) + 1) * DAY_MS;
  at(f, midnight - 10 * MINUTE_MS);
  claim(f);
  at(f, midnight + 5 * MINUTE_MS);
  expect(() => claim(f)).toThrow("Next ad in 15:00");
  at(f, midnight + 20 * MINUTE_MS);
  claim(f);
  expect(row(f)).toMatchObject({ dayKey: utcDayKey(midnight), claimsToday: 1 });
});

it("keeps each account's claims to itself", () => {
  const f = crystalFixture();
  const first = f.ctx.sender;
  const second = identity("3");
  f.progress(second);
  f.seed("player", { identity: second, mapId: "crystal_hollows", x: 4050, y: 4050, hp: 100, maxHp: 100, speed: 180, protocolVersion: PROTOCOL_VERSION, lastInputAt: f.ctx.timestamp });
  f.seed("playerSession", { connectionId: new ConnectionId(2n), identity: second, enteredWorld: true, protocolVersion: PROTOCOL_VERSION, connectedAt: f.ctx.timestamp, tabId: "second" });
  f.seed("playerController", { identity: second, connectionId: new ConnectionId(2n) });

  at(f, NOON);
  claim(f);
  f.ctx.sender = second;
  f.ctx.connectionId = new ConnectionId(2n);
  claim(f);
  expect(balance(f, first)).toBe(10n);
  expect(balance(f, second)).toBe(10n);
  expect(row(f, first)).toMatchObject({ claimsToday: 1 });
  expect(row(f, second)).toMatchObject({ claimsToday: 1 });
  at(f, NOON + MINUTE_MS);
  expect(() => claim(f)).toThrow("Next ad in 29:00");
});

it("needs the controlling tab", () => {
  const f = crystalFixture();
  at(f, NOON);
  // Another tab of the same account holds control.
  f.patch("playerController", { connectionId: new ConnectionId(9n) });
  expect(() => claim(f)).toThrow("active in another tab");
  expect(row(f)).toBeNull();
  expect(balance(f)).toBe(0n);
});

function linkGuest(f: Fixture, guest: ReturnType<typeof identity>) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "ad-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "ad-link" });
}

const seedClaim = (f: Fixture, who: ReturnType<typeof identity>, lastClaimMs: number, claimsToday: number, dayMs = lastClaimMs) =>
  f.seed("playerAdReward", { identity: who, lastClaimAt: new Timestamp(BigInt(lastClaimMs) * 1000n), dayKey: utcDayKey(dayMs), claimsToday });

it("cannot reset the cooldown or the day by linking a guest", () => {
  const f = crystalFixture();
  const guest = identity("2");
  // The guest claimed three today, the last a minute ago; the account one, hours ago.
  seedClaim(f, guest, NOON - MINUTE_MS, 3);
  seedClaim(f, f.ctx.sender, NOON - 5 * 60 * MINUTE_MS, 1);
  at(f, NOON);
  linkGuest(f, guest);
  expect(row(f, guest)).toBeNull();
  expect(row(f)).toMatchObject({ dayKey: utcDayKey(NOON), claimsToday: 3 });
  expect(row(f).lastClaimAt).toEqual(new Timestamp(BigInt(NOON - MINUTE_MS) * 1000n));
  expect(() => claim(f)).toThrow("Next ad in 29:00");
  at(f, NOON + 29 * MINUTE_MS);
  claim(f);
  at(f, NOON + 59 * MINUTE_MS);
  // Three plus this one is four: the day is spent, whichever side did the claiming.
  expect(() => claim(f)).toThrow(/^No more ads today/);
});

it("takes the later day's count when the two sides last claimed on different days", () => {
  const f = crystalFixture();
  const guest = identity("2");
  seedClaim(f, guest, NOON - DAY_MS, 4);
  seedClaim(f, f.ctx.sender, NOON - 2 * 60 * MINUTE_MS, 2);
  at(f, NOON);
  linkGuest(f, guest);
  expect(row(f)).toMatchObject({ dayKey: utcDayKey(NOON), claimsToday: 2 });
});

it("moves a guest's claims to an account that has none, and invents nothing for a guest without", () => {
  const f = crystalFixture();
  const guest = identity("2");
  seedClaim(f, guest, NOON - MINUTE_MS, 2);
  at(f, NOON);
  linkGuest(f, guest);
  expect(row(f)).toMatchObject({ claimsToday: 2 });
  expect(row(f, guest)).toBeNull();

  const clean = crystalFixture();
  linkGuest(clean, identity("2"));
  expect([...clean.db.playerAdReward.iter()]).toHaveLength(0);
});

it("is erased with the account and leaves other accounts alone", () => {
  const f = crystalFixture();
  const other = identity("3");
  at(f, NOON);
  claim(f);
  seedClaim(f, other, NOON, 1);
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(row(f)).toBeNull();
  expect(row(f, other)).not.toBeNull();
});

it("is removed wherever a player's or simulated client's rows are removed", () => {
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeAdGemReward(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeAdGemReward(ctx, identity)");
  expect(section("function claimGuestAccountFor", "function removeIdentityPresence")).toContain("mergeAdGemReward(ctx, link.guest, ctx.sender)");
});
