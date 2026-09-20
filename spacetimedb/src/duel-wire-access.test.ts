import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { syncDuelWireAccess } from "./duel-wire-access";
import { COMPATIBLE_PROTOCOL_VERSIONS } from "../../shared/rules";
import { DUEL_COMBAT_VERSION } from "../../shared/duel-combat";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("requires flat-stat combat clients so boss validation uses matching DPS", () => {
  expect(COMPATIBLE_PROTOCOL_VERSIONS).toContain(106);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(104);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(105);
  expect(COMPATIBLE_PROTOCOL_VERSIONS).not.toContain(103);
});
it("grants all recorded duel formats only to current clients and revokes on old-client registration", () => {
  const f = crystalFixture();
  syncDuelWireAccess(f.ctx, 104);
  expect([...f.db.duelWireAccess.iter()]).toHaveLength(0);
  syncDuelWireAccess(f.ctx, 106);
  // Through the current version, not a frozen list: a duel written at a version
  // nobody was granted never reached either duellist.
  const granted = [...Array(DUEL_COMBAT_VERSION + 1).keys()];
  expect([...f.db.duelWireAccess.iter()].map((r: any) => r.combatVersion)).toEqual(granted);
  syncDuelWireAccess(f.ctx, 106);
  expect([...f.db.duelWireAccess.iter()]).toHaveLength(granted.length);
  syncDuelWireAccess(f.ctx, 104);
  expect([...f.db.duelWireAccess.iter()]).toHaveLength(0);
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
