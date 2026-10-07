import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { COMPATIBLE_PROTOCOL_VERSIONS, PROTOCOL_VERSION } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("requires flat-stat combat clients so boss validation uses matching DPS", () => {
  expect(COMPATIBLE_PROTOCOL_VERSIONS).toContain(PROTOCOL_VERSION);
  // 109: the Town replaced Home; a 108 tab cannot draw where it would arrive.
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(108);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(106);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(104);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(105);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(103);
});
it.each([undefined, 104, 105, 106])("allows a saved opponent with live protocol %s", protocol => {
  const f = crystalFixture(), opponent = identity("b");
  f.progress(opponent);
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  if (protocol !== undefined) f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent, protocolVersion: protocol, isVisible: false });
  const before = f.db.player.identity.find(opponent);
  f.run(server.requestDuel, { opponent });
  expect([...f.db.duel.iter()]).toHaveLength(1);
  expect(f.db.player.identity.find(opponent)).toEqual(before);
});
it("still prevents an older challenger from starting an unreadable duel", () => {
  const f = crystalFixture();
  f.patch("player", { protocolVersion: 104 });
  expect(() => f.run(server.requestDuel, { opponent: identity("b") })).toThrow("Update your app");
  expect([...f.db.duel.iter()]).toHaveLength(0);
});

it("records disconnect time after hidden autofarming without movement heartbeats", () => {
  const f = crystalFixture();
  const start = f.ctx.timestamp;
  f.seed("playerLifetime", { identity: f.ctx.sender, joinedAt: start, sessionStartedAt: start, playedMicros: 0n });
  f.patch("player", { isVisible: false, lastInputAt: start });
  f.ctx.timestamp = new Timestamp(start.microsSinceUnixEpoch + 600_000_000n);
  f.run(server.onDisconnect);
  expect(f.db.player.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)).toMatchObject({ sessionStartedAt: f.ctx.timestamp, playedMicros: 600_000_000n });
});
