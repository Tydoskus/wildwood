import { afterEach, describe, expect, it, vi } from "vitest";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";
import { inspectSpacetimeIdToken } from "../security/oidc-id-token";
vi.mock("../security/oidc-id-token", async importOriginal => {
  const actual = await importOriginal<typeof import("../security/oidc-id-token")>();
  return { ...actual, verifySpacetimeIdToken: vi.fn(async (token: string) => actual.inspectSpacetimeIdToken(token)) };
});
import { AccountRenewalRequired, createAccountTokenRenewal } from "./account-token-renewal";
function token(exp: number, sub = "player-a") {
  const encode = (v: unknown) => btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "RS256", kid: "test" })}.${encode({ iss: SPACETIME_AUTH_ISSUER, aud: SPACETIME_AUTH_CLIENT_ID, sub, iat: 100, exp })}.c2ln`;
}
const expired = () => token(Date.now() / 1000 - 60);
const fresh = () => token(Date.now() / 1000 + 3600);
function setup() {
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } as Storage;
  const renewal = createAccountTokenRenewal(storage, "account");
  const old = expired();
  storage.setItem("account", old);
  storage.setItem("account:refresh", JSON.stringify({ subject: "player-a", token: "refresh-original" }));
  return { renewal, storage, old };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("account credential renewal", () => {
  it("renews an expired login once for simultaneous map/account reconnects and rotates the grant", async () => {
    const s = setup(); const updated = fresh();
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: true, json: async () => ({ id_token: updated, refresh_token: "refresh-rotated" }) }));
    vi.stubGlobal("fetch", fetch);
    expect(await Promise.all([s.renewal.resolve(s.old), s.renewal.resolve(s.old)])).toEqual([updated, updated]);
    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch.mock.calls[0][1].body as URLSearchParams).get("grant_type")).toBe("refresh_token");
    expect(s.storage.getItem("account:refresh")).toContain("refresh-rotated");
    expect(await s.renewal.resolve(s.old)).toBe(updated);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("uses a newer token for the same account without refreshing an old root token again", async () => {
    const s = setup(); const updated = fresh(); s.storage.setItem("account", updated);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await s.renewal.resolve(s.old, true)).toBe(updated); expect(fetch).not.toHaveBeenCalled();
  });
  it("forces one renewal when a still-valid token is rejected by the server", async () => {
    const s = setup(); const before = fresh(); s.storage.setItem("account", before);
    const updated = token(Date.now() / 1000 + 7200);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id_token: updated }) })));
    expect(await s.renewal.resolve(before, true)).toBe(updated);
    expect(s.storage.getItem("account:refresh")).toContain("refresh-original");
  });
  it("retains credentials after an outage so the next attempt can recover", async () => {
    const s = setup(); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "temporarily_unavailable" }) })));
    await expect(s.renewal.resolve(s.old)).rejects.toThrow("temporarily unavailable");
    expect(s.storage.getItem("account")).toBe(s.old); expect(s.storage.getItem("account:refresh")).toContain("refresh-original");
  });
  it("does not silently change identity when another tab changes accounts", async () => {
    const s = setup(); s.storage.setItem("account", token(Date.now() / 1000 + 3600, "player-b"));
    await expect(s.renewal.resolve(s.old)).rejects.toThrow("Account changed");
  });
  it("rejects refreshed tokens for a different subject", async () => {
    const s = setup(); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id_token: token(Date.now() / 1000 + 3600, "player-b") }) })));
    await expect(s.renewal.resolve(s.old)).rejects.toThrow("Account changed"); expect(s.storage.getItem("account")).toBe(s.old);
  });
  it("does not restore credentials if the player signs out during renewal", async () => {
    const s = setup(); let finish!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const result = s.renewal.resolve(s.old);
    s.storage.removeItem("account"); s.renewal.clear();
    finish({ ok: true, json: async () => ({ id_token: fresh(), refresh_token: "new" }) });
    await expect(result).rejects.toThrow("Account changed"); expect(s.storage.getItem("account")).toBeNull();
  });
  it("requires one new sign-in for legacy sessions or revoked grants, preserving the identity", async () => {
    const s = setup(); s.renewal.clear();
    await expect(s.renewal.resolve(s.old)).rejects.toBeInstanceOf(AccountRenewalRequired);
    expect(s.renewal.stored()).toBe(s.old);
    s.storage.setItem("account:refresh", JSON.stringify({ subject: "player-a", token: "revoked" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) })));
    await expect(s.renewal.resolve(s.old)).rejects.toBeInstanceOf(AccountRenewalRequired);
    expect(s.storage.getItem("account:refresh")).toBeNull(); expect(s.renewal.stored()).toBe(s.old);
  });
  it("keeps the rotated grant when the answer arrives after the connection stopped waiting", async () => {
    vi.useFakeTimers({ now: Date.now() });
    const s = setup(); const updated = fresh(); let answer!: (v: unknown) => void;
    const fetch = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const first = s.renewal.resolve(s.old);
    const timedOut = expect(first).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15_000); await timedOut;
    // A retry joins the request in flight rather than spending the old grant again.
    const retry = s.renewal.resolve(s.old);
    answer({ ok: true, json: async () => ({ id_token: updated, refresh_token: "refresh-rotated" }) });
    expect(await retry).toBe(updated);
    expect(fetch).toHaveBeenCalledOnce();
    expect(s.storage.getItem("account:refresh")).toContain("refresh-rotated");
    vi.useRealTimers();
  });
  it("names why renewal needs a new sign-in", async () => {
    const s = setup(); s.renewal.clear();
    await expect(s.renewal.resolve(s.old)).rejects.toMatchObject({ reason: "no-grant" });
    s.storage.setItem("account:refresh", JSON.stringify({ subject: "player-a", token: "spent" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) })));
    await expect(s.renewal.resolve(s.old)).rejects.toMatchObject({ reason: "grant-rejected" });
  });
  it("never permits expired tokens through the normal ID token validator", () => {
    expect(() => inspectSpacetimeIdToken(expired())).toThrow();
  });
});
