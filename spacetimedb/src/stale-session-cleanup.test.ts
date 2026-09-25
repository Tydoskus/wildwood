import { ConnectionId } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture(protocol: number, recent = false) {
  const f = crystalFixture(), identity = f.ctx.sender;
  const now = new Timestamp(3n * 86_400_000_000n);
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), protocolVersion: protocol, enteredWorld: true });
  f.db.player.identity.update({ ...f.db.player.identity.find(identity), protocolVersion: protocol, lastInputAt: recent ? now : f.ctx.timestamp });
  const lifetime = { identity, joinedAt: f.ctx.timestamp, playedMicros: 123000000n, sessionStartedAt: f.ctx.timestamp, enemyKills: 15n, deathCount: 1n };
  if (f.db.playerLifetime.identity.find(identity)) f.db.playerLifetime.identity.update(lifetime); else f.seed("playerLifetime", lifetime);
  f.ctx.timestamp = now;
  f.ctx.sender = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  return { ...f, identity };
}
it("cleans an abandoned obsolete session without banking idle days or touching progress", () => {
  const f = fixture(104), before = { ...f.db.playerProgress.identity.find(f.identity) };
  f.run(server.devCleanupStaleSessions, {});
  expect(f.db.player.identity.find(f.identity)).toBeNull();
  expect(f.db.playerSession.count()).toBe(0n);
  expect(f.db.playerController.identity.find(f.identity)).toBeNull();
  expect(f.db.playerLifetime.identity.find(f.identity)).toMatchObject({ playedMicros: 123000000n, enemyKills: 15n });
  expect(f.db.playerProgress.identity.find(f.identity)).toEqual(before);
  f.run(server.devCleanupStaleSessions, {});
  expect(f.db.playerLifetime.identity.find(f.identity).playedMicros).toBe(123000000n);
});
it.each([[107, false], [104, true]])("preserves supported or recently active sessions (%s, %s)", (protocol, recent) => {
  const f = fixture(Number(protocol), Boolean(recent));
  f.run(server.devCleanupStaleSessions, {});
  expect(f.db.player.identity.find(f.identity)).toBeTruthy();
  expect(f.db.playerSession.count()).toBe(1n);
});
it("rejects normal players", () => {
  const f = crystalFixture();
  expect(() => f.run(server.devCleanupStaleSessions, {})).toThrow();
});

it("keeps a current session and its presence when another tab is obsolete", () => {
  const f = fixture(104);
  const old = f.db.playerSession.connectionId.find(f.ctx.connectionId);
  const current = { ...old, connectionId: new ConnectionId(999n), protocolVersion: 107 };
  f.seed("playerSession", current);
  f.run(server.devCleanupStaleSessions, {});
  expect(f.db.playerSession.count()).toBe(1n);
  expect(f.db.player.identity.find(f.identity)).toBeTruthy();
  expect(f.db.playerController.identity.find(f.identity).connectionId).toEqual(current.connectionId);
  expect(f.db.playerLifetime.identity.find(f.identity).sessionStartedAt).not.toEqual(f.ctx.timestamp);
});
