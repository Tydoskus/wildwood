import { expect, it, vi } from "vitest";
import { ERASURE_TARGETS, eraseIdentityRows, linkedIdentities } from "./account-erasure";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("covers every table that holds an identity, and nothing twice", () => {
  // The list is generated from the schema. If a table is added with a
  // t.identity() column and not listed, erasure silently leaves data behind.
  const names = ERASURE_TARGETS.map(target => target.table);
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain("playerProgress");
  expect(names).toContain("socialMessage");
  expect(names).toContain("chatMessage");
  expect(names).toContain("accountDeletionRequest");
  // The two event tables are deliver-and-drop, so there is nothing to erase.
  expect(names).not.toContain("bossHitResult");
  expect(names).not.toContain("playerMotionDetailFrame");
  for (const target of ERASURE_TARGETS) {
    expect(target.columns.length, target.table).toBeGreaterThan(0);
    if (target.mode === "index") expect(target.index, target.table).toBeTruthy();
    if (target.mode !== "scan") expect(target.pk, target.table).toBeTruthy();
  }
});

it("removes the account's rows and leaves everyone else's alone", () => {
  const f = crystalFixture();
  const other = Identity.fromString("c2".padEnd(64, "7"));
  f.progress(other, { damage: 5 });
  f.seed("playerLegalConsent", { identity: f.ctx.sender, termsVersion: "v1", ageBand: 2, acceptedAt: f.ctx.timestamp });
  f.seed("playerLegalConsent", { identity: other, termsVersion: "v1", ageBand: 2, acceptedAt: f.ctx.timestamp });
  f.seed("accountDeletionRequest", { identity: f.ctx.sender, requestedAt: f.ctx.timestamp, status: "pending" });

  const result = eraseIdentityRows(f.ctx, [f.ctx.sender]);

  expect(result.complete).toBe(true);
  expect(result.deleted).toBeGreaterThan(0);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerLegalConsent.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.accountDeletionRequest.identity.find(f.ctx.sender)).toBeNull();
  // The other player is untouched.
  expect(f.db.playerProgress.identity.find(other)).not.toBeNull();
  expect(f.db.playerLegalConsent.identity.find(other)).not.toBeNull();
});

it("is safe to run again once an account is clean", () => {
  const f = crystalFixture();
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  const second = eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(second.deleted).toBe(0);
  expect(second.complete).toBe(true);
});

it("stops at its row budget and says what is left", () => {
  const f = crystalFixture();
  f.seed("playerLegalConsent", { identity: f.ctx.sender, termsVersion: "v1", ageBand: 2, acceptedAt: f.ctx.timestamp });
  const first = eraseIdentityRows(f.ctx, [f.ctx.sender], 1);
  expect(first.deleted).toBe(1);
  expect(first.complete).toBe(false);
  expect(first.remaining.length).toBeGreaterThan(0);
  // Running it out finishes the job.
  let guard = 0;
  while (!eraseIdentityRows(f.ctx, [f.ctx.sender], 1).complete && guard++ < 200);
  expect(guard).toBeLessThan(200);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toBeNull();
});

it("takes the guest half of an account with it", () => {
  const f = crystalFixture();
  const guest = Identity.fromString("c2".padEnd(64, "9"));
  f.progress(guest, { damage: 3 });
  f.seed("analyticsConversion", { id: 1n, guestIdentity: guest, accountIdentity: f.ctx.sender, dayKey: "2026-09-22" });

  const identities = linkedIdentities(f.ctx, f.ctx.sender);
  expect(identities).toHaveLength(2);
  eraseIdentityRows(f.ctx, identities);

  // Erasing only the identity that asked would have left this behind.
  expect(f.db.playerProgress.identity.find(guest)).toBeNull();
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toBeNull();
});
