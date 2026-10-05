import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function farmer() {
  const f = crystalFixture();
  f.patch("player", { isVisible: true, x: 1200, y: 900 });
  f.seed("playerMotion", { networkId: 7, identity: f.ctx.sender, mapId: "crystal_hollows", x: 1200, y: 900, isVisible: true,
    moving: false, vx: 0, vy: 0, lastInputAt: f.ctx.timestamp, lastInputSequence: 1 });
  f.seed("playerMotionIdentity", { networkId: 7, identity: f.ctx.sender, mapId: "crystal_hollows", isVisible: true, displayName: "Test Player" });
  return f;
}
const puppet = (f: ReturnType<typeof farmer>) => f.db.playerAutoFarmPuppet.identity.find(f.ctx.sender);
const later = (f: ReturnType<typeof farmer>, micros: bigint) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + micros); };

it("holds an autofarmer's plan for their map, anchored where the server last placed them", () => {
  const f = farmer();
  f.run(server.setAutoFarmPuppet, { group: "stat:damage", camp: "" });
  expect(puppet(f)).toMatchObject({ mapId: "crystal_hollows", group: "stat:damage", camp: "", x: 1200, y: 900 });
  const first = puppet(f).startedAt.microsSinceUnixEpoch;
  // The same plan again within five seconds changes nothing; after, it re-anchors.
  later(f, 1_000_000n);
  f.run(server.setAutoFarmPuppet, { group: "stat:damage", camp: "" });
  expect(puppet(f).startedAt.microsSinceUnixEpoch).toBe(first);
  later(f, 5_000_000n);
  f.run(server.setAutoFarmPuppet, { group: "stat:damage", camp: "" });
  expect(puppet(f).startedAt.microsSinceUnixEpoch).toBeGreaterThan(first);
  // A new group is sent at once; an empty one ends the puppet.
  f.run(server.setAutoFarmPuppet, { group: "stat:health", camp: "Health Camp" });
  expect(puppet(f)).toMatchObject({ group: "stat:health", camp: "Health Camp" });
  f.run(server.setAutoFarmPuppet, { group: "", camp: "" });
  expect(puppet(f)).toBeFalsy();
});

it("never holds a puppet for a player others cannot see", () => {
  const f = farmer();
  f.db.playerMotion.networkId.update({ ...f.db.playerMotion.identity.find(f.ctx.sender), isVisible: false });
  f.run(server.setAutoFarmPuppet, { group: "stat:damage", camp: "" });
  expect(puppet(f)).toBeFalsy();
  expect(() => f.run(server.setAutoFarmPuppet, { group: "x".repeat(40), camp: "" })).not.toThrow();
});

it("refuses a group name past its limit", () => {
  const f = farmer();
  expect(() => f.run(server.setAutoFarmPuppet, { group: "x".repeat(40), camp: "" })).toThrow(/too long/);
});

it("goes with the eye: turning multiplayer off clears the puppet", () => {
  const f = farmer();
  f.run(server.setAutoFarmPuppet, { group: "stat:damage", camp: "" });
  expect(puppet(f)).toBeTruthy();
  f.run(server.setMultiplayerEnabled, { enabled: false });
  expect(puppet(f)).toBeFalsy();
});
