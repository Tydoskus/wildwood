import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN } from "../../shared/home";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("single player home travel", () => {
  it("uses the root for home movement while enemy maps use shards", () => {
    const f = crystalFixture();
    Object.assign(f.ctx, { databaseIdentity: identity("c") });
    f.seed("shardRuntime", { id: 0, role: "root", enabled: true });
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 1200, y: 1800 });
    expect(f.db.mapShardMember.identity.find(f.ctx.sender)).toBeNull();
    f.run(server.prepareWorldActionPosition, { x: 380, y: 414 });
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 380, y: 414 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "crystal_hollows", x: 1200, y: 1800 });
    expect(f.db.mapShardMember.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
    // A second visit must not borrow the old home's analytical motion.
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 2200, y: 2800 });
    expect(f.db.mapShardMember.identity.find(f.ctx.sender)).toBeNull();
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 500, y: 700 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "crystal_hollows", x: 2200, y: 2800 });
  });
  it("starts upgrades at the home bench, but rejects the former snowlands bench", () => {
    const f = crystalFixture();
    f.patch("playerProgress", { inventoryJson: '["starter_bow"]' });
    f.patch("player", { mapId: "intermediate_snowlands", x: 800, y: 710 });
    expect(() => f.run(server.startItemUpgrade, { slot: 1, itemId: "starter_bow" })).toThrow("Touch the Upgrade Bench first");
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 800, y: 710 });
    f.run(server.prepareWorldActionPosition, { x: 380, y: 414 });
    f.run(server.startItemUpgrade, { slot: 1, itemId: "starter_bow" });
    expect(f.db.activeItemUpgrade.identity.find(f.ctx.sender)).toMatchObject({ itemId: "starter_bow", targetLevel: 1 });
  });
  it("persists the exact departure point and restores it after home movement", () => {
    const f = crystalFixture();
    f.patch("player", { facing: Math.PI });
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 1234.5, y: 2345.25 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: HOME_EXTERIOR_MAP_ID, ...HOME_EXTERIOR_SPAWN });
    expect(f.db.playerLastLocation.identity.find(f.ctx.sender).mapId).toBe(HOME_EXTERIOR_MAP_ID);
    expect(f.db.playerMotionIdentity.identity.find(f.ctx.sender).isVisible).toBe(false);
    f.patch("player", { x: 380, y: 414 });
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 380, y: 414 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "crystal_hollows", x: 1234.5, y: 2345.25, facing: Math.PI });
  });
  it("updates the return point on each visit and rejects invalid positions", () => {
    const f = crystalFixture();
    expect(() => f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: NaN, y: 2345 })).toThrow("Invalid teleport position");
    for (const x of [1100, 2200]) {
      f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x, y: 2000 });
      f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 500, y: 700 });
      expect(f.db.player.identity.find(f.ctx.sender).x).toBe(x);
    }
  });
  it("keeps return locations separate for different players and prevents home duels", () => {
    const f = crystalFixture();
    const other = identity("b");
    f.seed("homeReturnLocation", { identity: other, mapId: "tutorial_forest", x: 300, y: 400, facing: 0 });
    f.run(server.changeMap, { mapId: HOME_EXTERIOR_MAP_ID, x: 1500, y: 1800 });
    expect(f.db.homeReturnLocation.identity.find(other).x).toBe(300);
    expect(() => f.run(server.requestDuel, { opponent: other })).toThrow("Home is single player");
  });
});
