import { describe, expect, it, vi } from "vitest";
import { announcePatreonSupport } from "./patreon-announcement";
import { validSupporterNames } from "../../shared/patreon-ticker";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { beginPatreonLink, patreonCallback, patreonStatus, refreshPatreon, patreonLinksDueRefresh, PATREON_SWEEP_BATCH } from "./patreon";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  const now = Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n);
  f.seed("patreonConfig", { id: 0, clientId: "client", clientSecret: "secret", campaignId: "10", silverTierId: "20", goldTierId: "30", redirectUri: "https://maincloud.spacetimedb.com/v1/database/test/route/patreon/callback" });
  f.seed("patreonLink", { identity: f.ctx.sender, userId: "1", accessToken: "access", refreshToken: "refresh", tier: "silver", frame: "silver", validUntilMs: now + 60_000, checkedAtMs: now, attemptedAtMs: now });
  f.seed("patreonOwner", { userId: "1", identity: f.ctx.sender });
  const http = { fetch: vi.fn() };
  const ctx = { ...f.ctx, http, withTx: (fn: (tx: any) => unknown) => f.transaction(() => fn(f.ctx)) } as any;
  return { ...f, now, ctx, http };
}
it("prevents a Silver supporter selecting Gold and hides expired frames", () => {
  const f = fixture();
  expect(() => f.run(server.setAvatarFrame, { frame: "gold" })).toThrow("active supporter");
  f.run(server.setAvatarFrame, { frame: "none" });
  expect(patreonStatus(f.ctx, f.ctx.sender).frame).toBe("none");
  const row = f.db.patreonLink.identity.find(f.ctx.sender);
  f.db.patreonLink.identity.update({ ...row, frame: "silver", validUntilMs: f.now - 1 });
  expect(patreonStatus(f.ctx, f.ctx.sender).frame).toBe("none");
});

function membership(tier = "30", status = "active_patron") {
  return { data: { type: "user", id: "1", relationships: { memberships: { data: [{ type: "member", id: "member" }] } } },
    included: [{ type: "member", id: "member", attributes: { patron_status: status, last_charge_status: "Paid" },
      relationships: { campaign: { data: { id: "10" } }, currently_entitled_tiers: { data: [{ id: tier }] } } }] };
}
const reply = (data: unknown) => ({ status: 200, text: () => JSON.stringify(data) });
const callbackUri = `https://example.com?state=${"a".repeat(64)}&code=code`;
it.each([
  ["none", "none", "20", "silver"],
  ["none", "none", "30", "gold"],
  ["silver", "silver", "30", "gold"],
  ["silver", "none", "30", "gold"],
  ["gold", "gold", "20", "silver"],
  ["gold", "none", "30", "none"],
  ["gold", "silver", "30", "silver"],
])("automatically equips changed membership %s/%s → %s while respecting unchanged preferences", (tier, frame, purchasedTier, expected) => {
  const f = fixture();
  f.db.patreonLink.identity.update({ ...f.db.patreonLink.identity.find(f.ctx.sender), tier, frame, attemptedAtMs: f.now - 60_001 });
  f.http.fetch.mockReturnValueOnce(reply(membership(purchasedTier)));
  expect(JSON.parse(refreshPatreon(f.ctx)).frame).toBe(expected);
});
function prepareCallback(f: ReturnType<typeof fixture>, target = f.ctx.sender) {
  f.seed("patreonPending", { state: "a".repeat(64), identity: target, expiresAtMs: f.now + 60_000 });
  f.http.fetch.mockReturnValueOnce(reply({ access_token: "new-access", refresh_token: "new-refresh" })).mockReturnValueOnce(reply(membership()));
}
it("links the verified tier once and never trusts callback parameters for entitlement", () => {
  const f = fixture();
  f.run(server.disconnectPatreon);
  prepareCallback(f);
  expect(patreonCallback(f.ctx, callbackUri).status).toBe(200);
  expect(patreonStatus(f.ctx, f.ctx.sender)).toMatchObject({ tier: "gold", frame: "gold", linked: true });
  expect(patreonCallback(f.ctx, callbackUri).status).toBe(400);
  expect(f.http.fetch).toHaveBeenCalledTimes(2);
  const messages = [...f.db.chatMessage.iter()];
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ senderName: "Test Player", message: "Became a Gold supporter on Patreon. Thank you for supporting WildStat! ♥" });
  expect(f.db.publicChatCursor.id.find(0).lastId).toBe(messages[0].id);
});
it("thanks existing supporters on verification once, including after unlinking and relinking", () => {
  const f = fixture();
  function check(tier: string, status = "active_patron") {
    f.db.patreonLink.identity.update({ ...f.db.patreonLink.identity.find(f.ctx.sender), attemptedAtMs: f.now - 60_001 });
    f.http.fetch.mockReturnValueOnce(reply(membership(tier, status)));
    refreshPatreon(f.ctx);
  }
  check("20"); check("20");
  expect([...f.db.chatMessage.iter()]).toHaveLength(1);
  check("30"); check("30"); check("20"); check("30");
  expect([...f.db.chatMessage.iter()]).toHaveLength(2);
  check("30", "former_patron");
  expect([...f.db.chatMessage.iter()]).toHaveLength(2);
  f.run(server.disconnectPatreon);
  prepareCallback(f);
  expect(patreonCallback(f.ctx, callbackUri).status).toBe(200);
  expect([...f.db.chatMessage.iter()]).toHaveLength(2);
});
it("does not let a second character claim an already-linked Patreon", () => {
  const f = fixture(), other = identity("2");
  prepareCallback(f, other);
  expect(patreonCallback(f.ctx, callbackUri).status).toBe(400);
  expect(f.db.patreonLink.identity.find(other)).toBeNull();
  expect(f.db.patreonOwner.userId.find("1").identity.equals(f.ctx.sender)).toBe(true);
});
it("does not resurrect the connection if disconnected during verification", () => {
  const f = fixture();
  prepareCallback(f);
  f.http.fetch.mockReset().mockReturnValueOnce(reply({ access_token: "new-access", refresh_token: "new-refresh" })).mockImplementationOnce(() => {
    f.run(server.disconnectPatreon);
    return reply(membership());
  });
  expect(patreonCallback(f.ctx, callbackUri).status).toBe(400);
  expect(f.db.patreonLink.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.patreonOwner.userId.find("1")).toBeNull();
});
it("removes a frame when Patreon reports a former member and preserves rotated credentials on an outage", () => {
  const f = fixture();
  f.db.patreonLink.identity.update({ ...f.db.patreonLink.identity.find(f.ctx.sender), attemptedAtMs: f.now - 60_001 });
  f.http.fetch.mockReturnValueOnce(reply(membership("20", "former_patron")));
  expect(JSON.parse(refreshPatreon(f.ctx))).toMatchObject({ linked: true, tier: "none", frame: "none" });
  const before = f.db.patreonLink.identity.find(f.ctx.sender);
  f.db.patreonLink.identity.update({ ...before, attemptedAtMs: f.now - 60_001 });
  f.http.fetch.mockReturnValueOnce({ status: 401 }).mockReturnValueOnce(reply({ access_token: "rotated-access", refresh_token: "rotated-refresh" })).mockReturnValueOnce({ status: 503 });
  refreshPatreon(f.ctx);
  expect(f.db.patreonLink.identity.find(f.ctx.sender)).toMatchObject({ accessToken: "rotated-access", refreshToken: "rotated-refresh", validUntilMs: before.validUntilMs });
});
it("validates and throttles secure browser-generated link states", () => {
  const f = fixture();
  expect(() => beginPatreonLink(f.ctx, "weak")).toThrow("Invalid Patreon request");
  const url = new URL(beginPatreonLink(f.ctx, "a".repeat(64)));
  expect(url.searchParams.get("scope")).toBe("identity identity.memberships");
  expect(url.searchParams.get("state")).toBe("a".repeat(64));
  expect(() => beginPatreonLink(f.ctx, "b".repeat(64))).toThrow("Wait a minute");
});
it("does not extend access on network errors and throttles repeated refresh calls", () => {
  const f = fixture();
  f.db.patreonLink.identity.update({ ...f.db.patreonLink.identity.find(f.ctx.sender), attemptedAtMs: f.now - 900_001 });
  f.http.fetch.mockImplementation(() => { throw new Error("offline"); });
  refreshPatreon(f.ctx);
  expect(f.db.patreonLink.identity.find(f.ctx.sender).validUntilMs).toBe(f.now + 60_000);
  const calls = f.http.fetch.mock.calls.length;
  refreshPatreon(f.ctx);
  expect(f.http.fetch).toHaveBeenCalledTimes(calls);
});
it("disconnect removes credentials, claim, and pending link only for the caller", () => {
  const f = fixture();
  f.seed("patreonPending", { state: "a".repeat(64), identity: f.ctx.sender, expiresAtMs: f.now + 60_000 });
  f.run(server.disconnectPatreon);
  expect(f.db.patreonLink.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.patreonOwner.userId.find("1")).toBeNull();
  expect(f.db.patreonPending.state.find("a".repeat(64))).toBeNull();
});
it("rejects forged/expired OAuth callbacks without contacting Patreon", () => {
  const f = fixture();
  expect(patreonCallback(f.ctx, "https://example.com?state=forged&code=x").status).toBe(400);
  f.seed("patreonPending", { state: "a".repeat(64), identity: identity("2"), expiresAtMs: f.now - 1 });
  expect(patreonCallback(f.ctx, `https://example.com?state=${"a".repeat(64)}&code=x`).status).toBe(400);
  expect(f.http.fetch).not.toHaveBeenCalled();
});

it("builds login and callback responses in the server runtime without URL globals", () => {
  const f = fixture();
  vi.stubGlobal("URL", undefined);
  vi.stubGlobal("URLSearchParams", undefined);
  try {
    expect(beginPatreonLink(f.ctx, "f".repeat(64))).toContain("scope=identity+identity.memberships");
    expect(patreonCallback(f.ctx, "/patreon/callback?state=%XX").status).toBe(400);
    f.http.fetch.mockReturnValueOnce(reply({ access_token: "new", refresh_token: "next" })).mockReturnValueOnce(reply(membership()));
    expect(patreonCallback(f.ctx, `/patreon/callback?state=${"f".repeat(64)}&code=valid%2Bcode`).status).toBe(200);
    expect(f.http.fetch.mock.calls[0][1].body).toContain("code=valid%2Bcode");
  } finally { vi.unstubAllGlobals(); }
});

it("streams only real memberships, uses current names, expires leases and removes unlinked supporters", () => {
  const f = fixture();
  const rows = () => server.patreonTickerSupporters(f.ctx);
  const profile = f.db.playerProfile.identity.find(f.ctx.sender);
  f.db.playerProfile.identity.update({ ...profile, displayName: "Current Name" });
  expect(validSupporterNames(rows(), f.now)).toEqual(["Current Name"]);
  expect(Object.keys(rows()[0]).sort()).toEqual(["identity", "name", "validUntilMs"]);
  expect(validSupporterNames(rows(), f.now + 60_000)).toEqual([]);
  const link = f.db.patreonLink.identity.find(f.ctx.sender);
  f.db.patreonLink.identity.update({ ...link, tier: "none" });
  expect(rows()).toEqual([]);
  f.db.patreonLink.identity.update(link);
  f.run(server.disconnectPatreon);
  f.seed("patreonPreview", { identity: f.ctx.sender, frame: "gold" });
  expect(rows()).toEqual([]);
});

describe("keeping memberships current without the player", () => {
  const link = (over = {}) => ({ userId: "1", tier: "gold", attemptedAtMs: 0, validUntilMs: 0, ...over });
  const now = 1_000 * 60 * 60 * 24 * 400;

  it("picks up a lease about to lapse, soonest first", () => {
    const soon = link({ validUntilMs: now + 60_000 });
    const later = link({ validUntilMs: now + 2 * 60 * 60 * 1000 });
    const due = patreonLinksDueRefresh([later, soon], now);
    expect(due).toEqual([soon, later]);
  });

  it("leaves a lease with weeks to run alone, so the sweep stays cheap", () => {
    expect(patreonLinksDueRefresh([link({ validUntilMs: now + 20 * 24 * 60 * 60 * 1000 })], now)).toEqual([]);
  });

  it("does not ask Patreon about the same account twice in an hour", () => {
    const justTried = link({ validUntilMs: now + 60_000, attemptedAtMs: now - 60_000 });
    expect(patreonLinksDueRefresh([justTried], now)).toEqual([]);
    expect(patreonLinksDueRefresh([{ ...justTried, attemptedAtMs: now - 2 * 60 * 60 * 1000 }], now)).toHaveLength(1);
  });

  it("skips a row that was never linked, and caps the batch", () => {
    expect(patreonLinksDueRefresh([link({ userId: "", validUntilMs: now })], now)).toEqual([]);
    const many = Array.from({ length: PATREON_SWEEP_BATCH + 4 }, (_, i) => link({ validUntilMs: now + i }));
    expect(patreonLinksDueRefresh(many, now)).toHaveLength(PATREON_SWEEP_BATCH);
  });

  it("re-checks an expired lease, which is how a stale supporter recovers", () => {
    expect(patreonLinksDueRefresh([link({ validUntilMs: now - 60 * 60 * 1000 })], now)).toHaveLength(1);
  });
});

describe("who the sweep spends its batch on", () => {
  const link = (over = {}) => ({ userId: "1", tier: "gold", attemptedAtMs: 0, validUntilMs: 0, ...over });
  const now = 1_000 * 60 * 60 * 24 * 400;

  it("re-checks a paying supporter before a link that grants nothing", () => {
    // The live sweep took the five oldest leases and eleven of sixteen lapsed
    // links held no membership, so supporters queued behind people with no frame.
    const freeloader = link({ tier: "none", validUntilMs: now - 10 * 60 * 60 * 1000 });
    const supporter = link({ tier: "silver", validUntilMs: now - 60_000 });
    expect(patreonLinksDueRefresh([freeloader, supporter], now)).toEqual([supporter, freeloader]);
  });

  it("fills the batch with supporters first, then the rest", () => {
    const none = Array.from({ length: 8 }, (_, i) => link({ tier: "none", validUntilMs: now - 90_000_000 - i }));
    const paying = Array.from({ length: 3 }, (_, i) => link({ tier: "gold", validUntilMs: now - i }));
    const due = patreonLinksDueRefresh([...none, ...paying], now);
    expect(due).toHaveLength(PATREON_SWEEP_BATCH);
    expect(due.slice(0, 3).every(l => l.tier === "gold")).toBe(true);
    expect(due.slice(3).every(l => l.tier === "none")).toBe(true);
  });

  it("still sweeps unpaid links, so a new subscription is noticed while away", () => {
    const only = link({ tier: "none", validUntilMs: now - 60_000 });
    expect(patreonLinksDueRefresh([only], now)).toEqual([only]);
  });

  it("orders supporters among themselves by who lapses soonest", () => {
    const soon = link({ tier: "gold", validUntilMs: now - 100 });
    const sooner = link({ tier: "silver", validUntilMs: now - 100_000 });
    expect(patreonLinksDueRefresh([soon, sooner], now)).toEqual([sooner, soon]);
  });
});

describe("how often the sweep asks Patreon", () => {
  const link = (over = {}) => ({ userId: "1", tier: "gold", attemptedAtMs: 0, validUntilMs: 0, ...over });
  const now = 1_000 * 60 * 60 * 24 * 400;

  it("keeps the lead under the floor lease, or every link is due forever", async () => {
    const { PATREON_SWEEP_LEAD_MS } = await import("./patreon");
    // A linked account with no membership gets the floor lease and nothing
    // longer, so a lead at or above it means the sweep never goes idle.
    expect(PATREON_SWEEP_LEAD_MS).toBeLessThan(6 * 60 * 60 * 1000);
  });

  it("leaves a fresh lease alone rather than re-asking every tick", () => {
    const fresh = link({ tier: "none", validUntilMs: now + 6 * 60 * 60 * 1000 });
    expect(patreonLinksDueRefresh([fresh], now)).toEqual([]);
  });

  it("picks a lease up once it is genuinely close to lapsing", () => {
    const nearly = link({ tier: "none", validUntilMs: now + 60 * 60 * 1000 });
    expect(patreonLinksDueRefresh([nearly], now)).toHaveLength(1);
  });
});

it("thanks a supporter by their real tier, once on the way up and never on the way down", () => {
  const f = fixture();
  const messages = () => [...f.db.chatMessage.iter()].map((row: any) => row.message);
  const thank = (tier: "silver" | "gold" | "diamond") => announcePatreonSupport(f.ctx as never, f.ctx.sender, "patreon-user-9", tier);
  thank("gold"); thank("gold");
  expect(messages()).toEqual(["Became a Gold supporter on Patreon. Thank you for supporting WildStat! ♥"]);
  thank("diamond"); thank("diamond");
  expect(messages()).toHaveLength(2);
  expect(messages()[1]).toBe("Became a Diamond supporter on Patreon. Thank you for supporting WildStat! ♥");
  thank("gold"); thank("silver"); thank("diamond");
  expect(messages()).toHaveLength(2);
});

it("thanks someone who joins straight at Diamond as Diamond, and stays quiet if they later drop a tier", () => {
  const f = fixture();
  const messages = () => [...f.db.chatMessage.iter()].map((row: any) => row.message);
  announcePatreonSupport(f.ctx as never, f.ctx.sender, "patreon-user-10", "diamond");
  expect(messages()).toEqual(["Became a Diamond supporter on Patreon. Thank you for supporting WildStat! ♥"]);
  announcePatreonSupport(f.ctx as never, f.ctx.sender, "patreon-user-10", "gold");
  announcePatreonSupport(f.ctx as never, f.ctx.sender, "patreon-user-10", "silver");
  expect(messages()).toHaveLength(1);
});
