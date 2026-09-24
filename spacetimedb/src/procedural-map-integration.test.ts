import { describe, expect, it, vi } from "vitest";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { generateMap } from "../../shared/procedural-maps";
import {
  crystalFixture,
  server,
} from "../../tests/helpers/crystal-hollows-fixture";
vi.mock(
  "spacetimedb/server",
  () => import("../../tests/helpers/spacetime-module"),
);

function fixture() {
  const f = crystalFixture();
  f.patch("player", { mapId: "ion_citadel", x: 580, y: 617 });
  f.patch("playerProgress", {
    ionCitadelUnlocked: true,
    bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime,
    damage: 1e30,
    attackRange: 600,
  });
  return f;
}
describe("production generated map reducers", () => {
  it("gates the first portal, allows reverse travel, and requires the next boss clear", () => {
    const f = fixture();
    f.patch("playerProgress", { bossRewardClaims: 0 });
    expect(() =>
      f.run(server.changeMap, { mapId: "endless_1", x: 580, y: 617 }),
    ).toThrow(/previous map/);
    f.patch("playerProgress", {
      bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime,
    });
    f.run(server.changeMap, { mapId: "endless_1", x: 580, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({
      mapId: "endless_1",
      ...generateMap("endless_1").arrival,
    });
    expect(() =>
      f.run(server.changeMap, { mapId: "endless_2", x: 580, y: 617 }),
    ).toThrow(/previous map/);
    expect(() =>
      f.run(server.changeMap, { mapId: "ion_citadel", x: 50, y: 50 }),
    ).toThrow(/closer/);
    f.run(server.changeMap, { mapId: "ion_citadel", x: 360, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("ion_citadel");
  });
  it("retains the deployed layouts", () => {
    const tables = server.default.schemaType.tables;
    expect(Object.keys(tables.proceduralBoss.columns)).toEqual([
      "mapId",
      "encounter",
      "hp",
      "maxHp",
      "respawnAtMicros",
    ]);
    expect(
      tables.proceduralBoss.columns.mapId.columnMetadata.isPrimaryKey,
    ).toBe(true);
    expect(Object.keys(tables.proceduralContribution.columns)).toEqual([
      "key",
      "mapId",
      "identity",
      "encounter",
      "damage",
      "windowAt",
      "hits",
    ]);
  });
});
