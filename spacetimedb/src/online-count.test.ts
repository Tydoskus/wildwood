import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// world_status is one public row every client subscribes to. Refreshing it on
// each connect and disconnect broadcast to every player on every one of them,
// which a mass reload after a version bump turned into players-squared. It is
// refreshed by the one-minute maintenance tick and nowhere else.

it("leaves the online count alone when a player disconnects", () => {
  const f = crystalFixture();
  f.run(server.runMaintenance, {});
  const before = f.db.worldStatus.id.find(0)?.onlinePlayers;
  expect(before).toBeGreaterThan(0);
  f.run(server.onDisconnect);
  expect(f.db.player.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.worldStatus.id.find(0)?.onlinePlayers).toBe(before);
});

it("catches the count up on the next maintenance tick", () => {
  const f = crystalFixture();
  f.run(server.runMaintenance, {});
  const before = f.db.worldStatus.id.find(0)!.onlinePlayers;
  f.run(server.onDisconnect);
  f.run(server.runMaintenance, {});
  expect(f.db.worldStatus.id.find(0)!.onlinePlayers).toBe(before - 1);
});
