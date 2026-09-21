import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { TERMS_VERSION } from "../../shared/legal";
import { grantVirtualPlayerConsent, revokeVirtualPlayerConsent } from "./virtual-player-consent";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("lends a bot the owner's current consent, once, and takes it back on erase", () => {
  const f = crystalFixture();
  const owner = f.ctx.sender;
  const bot = { ...f.ctx, sender: (f as any).identity ? (f as any).identity("77") : { toHexString: () => "77", isEqual: (o: any) => o?.toHexString?.() === "77" } };
  f.db.playerLegalConsent.insert({ identity: owner, termsVersion: TERMS_VERSION, ageBand: 2, acceptedAt: f.ctx.timestamp });
  grantVirtualPlayerConsent(bot, owner);
  const lent = f.db.playerLegalConsent.identity.find(bot.sender);
  expect(lent).toMatchObject({ termsVersion: TERMS_VERSION, ageBand: 2 });
  grantVirtualPlayerConsent({ ...bot, timestamp: { microsSinceUnixEpoch: 999n } }, owner);
  expect(f.db.playerLegalConsent.identity.find(bot.sender)).toEqual(lent);
  revokeVirtualPlayerConsent(bot, bot.sender);
  expect(f.db.playerLegalConsent.identity.find(bot.sender)).toBeNull();
  expect(f.db.playerLegalConsent.identity.find(owner)).toBeDefined();
});
it("lends nothing when the owner's consent is missing or stale", () => {
  const f = crystalFixture();
  const bot = { ...f.ctx, sender: { toHexString: () => "78", isEqual: (o: any) => o?.toHexString?.() === "78" } };
  grantVirtualPlayerConsent(bot, f.ctx.sender);
  expect(f.db.playerLegalConsent.identity.find(bot.sender)).toBeNull();
  f.db.playerLegalConsent.insert({ identity: f.ctx.sender, termsVersion: "2001-01-01", ageBand: 2, acceptedAt: f.ctx.timestamp });
  grantVirtualPlayerConsent(bot, f.ctx.sender);
  expect(f.db.playerLegalConsent.identity.find(bot.sender)).toBeNull();
});
