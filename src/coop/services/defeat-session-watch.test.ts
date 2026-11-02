import { expect, it, vi } from "vitest";
import { watchDefeatSession } from "./defeat-session-watch";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";

function fixture(authTime?: number) {
  let inserted: any, updated: any, hydrated: any;
  const now = Math.floor(Date.now() / 1000);
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const token = authTime === undefined ? null : `${part({ alg: "RS256", kid: "test" })}.${part({
    iss: SPACETIME_AUTH_ISSUER, aud: SPACETIME_AUTH_CLIENT_ID, sub: "test", iat: now, exp: now + 3600, auth_time: authTime,
  })}.c2ln`;
  const rows: any[] = [];
  const connection = { db: { myDefeatSessionRestriction: {
    onInsert: (fn: any) => { inserted = fn; }, onUpdate: (fn: any) => { updated = fn; }, iter: () => rows,
  } }, subscriptionBuilder: () => ({ onApplied(fn: any) { hydrated = fn; return this; }, onError() { return this; }, subscribe: vi.fn() }) };
  const reject = vi.fn(); let current = true;
  watchDefeatSession(connection as any, token, () => current, reject);
  return { reject, rows, inserted: (row: any) => inserted(null, row), updated: (row: any) => updated(null, null, row),
    hydrate: () => hydrated(), stale: () => { current = false; } };
}
it("disconnects on insert/update and restores the restriction on initial hydration", () => {
  const f = fixture(1), row = { requireSignIn: true, revokedAtMicros: 10_000_000n, blockedUntilMicros: 0n };
  f.inserted(row); f.updated(row); f.rows.push(row); f.hydrate();
  expect(f.reject).toHaveBeenCalledTimes(3);
  expect(f.reject).toHaveBeenLastCalledWith("DEFEAT_SESSION_REAUTH");
  f.stale(); f.inserted(row); expect(f.reject).toHaveBeenCalledTimes(3);
});
it("ignores an old revocation after fresh authentication and expired guest restrictions", () => {
  const f = fixture(11);
  f.inserted({ requireSignIn: true, revokedAtMicros: 10_000_000n, blockedUntilMicros: 0n });
  f.inserted({ requireSignIn: false, revokedAtMicros: 10_000_000n, blockedUntilMicros: 40_000_000n });
  expect(f.reject).not.toHaveBeenCalled();
});
it("passes the guest deadline through without discarding their identity", () => {
  const f = fixture(), until = BigInt(Date.now() + 30_000) * 1000n;
  f.inserted({ requireSignIn: false, revokedAtMicros: 10_000_000n, blockedUntilMicros: until });
  expect(f.reject).toHaveBeenCalledWith(`DEFEAT_SESSION_COOLDOWN:${until / 1000n}`);
});
