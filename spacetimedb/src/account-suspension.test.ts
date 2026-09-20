import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { PERMANENT_SUSPENSION_MICROS } from "./defeat-session";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function ownerFixture() {
  const f = crystalFixture(), target = f.ctx.sender;
  f.patch("playerProfile", { displayName: "Target" });
  // Owner-only: the module pins the owner to a fixed identity (DATABASE_OWNER_IDENTITY_HEX).
  f.ctx.sender = Identity.fromString("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  return { f, target };
}

it("suspends for at most seven days unless zero asks for permanent", () => {
  const { f, target } = ownerFixture();
  const now = f.ctx.timestamp.microsSinceUnixEpoch;
  expect(() => f.run(server.devSuspendPlayerAccount, { identity: target, expectedDisplayName: "Target", untilMicros: now + 8n * 86_400_000_000n, reason: "too long" }))
    .toThrow("at most seven days");
  f.run(server.devSuspendPlayerAccount, { identity: target, expectedDisplayName: "Target", untilMicros: 0n, reason: "Repeated kill-report exploitation" });
  const row = f.db.defeatSessionRestriction.identity.find(target);
  expect(row?.blockedUntilMicros).toBe(PERMANENT_SUSPENSION_MICROS);
  expect([...f.db.moderationAction.iter()].at(-1)?.action).toBe("Account permanently suspended");
});
