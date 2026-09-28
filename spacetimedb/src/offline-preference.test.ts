import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { offlineProgressEnabled } from "./offline-preference";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("treats an account with no preference row as opted in", () => {
  const f = crystalFixture();
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(true);
});

it("records an opt-out and takes it back, without touching other accounts", () => {
  const f = crystalFixture();
  f.run(server.setOfflineProgressEnabled, { enabled: false });
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(false);
  // Writing the same value again is a no-op rather than a second row.
  f.run(server.setOfflineProgressEnabled, { enabled: false });
  expect([...f.db.playerOfflinePreference.iter()]).toHaveLength(1);
  f.run(server.setOfflineProgressEnabled, { enabled: true });
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(true);
});

function linkGuest(f: ReturnType<typeof crystalFixture>, guest: ReturnType<typeof identity>) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "offline-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "offline-link" });
}

it("keeps a guest's opt-out when the guest signs up, instead of turning offline progress back on", () => {
  const f = crystalFixture();
  const guest = identity("2");
  f.seed("playerOfflinePreference", { identity: guest, enabled: false });
  linkGuest(f, guest);
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(false);
  expect(f.db.playerOfflinePreference.identity.find(guest)).toBeNull();
});

it("keeps the account's own choice when a guest links into it", () => {
  const f = crystalFixture();
  const guest = identity("2");
  f.seed("playerOfflinePreference", { identity: guest, enabled: false });
  f.seed("playerOfflinePreference", { identity: f.ctx.sender, enabled: true });
  linkGuest(f, guest);
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(true);
  expect([...f.db.playerOfflinePreference.iter()]).toHaveLength(1);
});
