import { describe, expect, it, vi } from "vitest";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { reducerParameters } from "../../tests/helpers/spacetime-module";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("Crystal Hollows reducer behavior (in-memory, not native host integration)", () => {
  it("appends a default-false unlock and excludes it from the save wire arguments", () => {
    const columns = server.default.schemaType.tables.playerProgress.columns;
    expect(columns.crystalHollowsUnlocked.columnMetadata.defaultValue).toBe(false);
    expect(columns.bossRewardClaims.columnMetadata.defaultValue).toBe(0);
    const names = Object.keys(columns);
    expect(names.indexOf("crystalHollowsUnlocked")).toBeGreaterThan(names.indexOf("moonfenUnlocked"));
    expect(names.indexOf("bossRewardClaims")).toBeGreaterThan(names.indexOf("crystalHollowsUnlocked"));
    expect(reducerParameters.get(server.savePlayerProgress)).not.toHaveProperty("crystalHollowsUnlocked");
    expect(Object.keys(reducerParameters.get(server.damagePrismshellFromPosition)!).sort()).toEqual(["hits", "x", "y"]);
  });

  it("cannot grant or revoke the unlock through a player save", () => {
    const f = crystalFixture();
    const save = (forged: boolean) => f.run(server.savePlayerProgress, {
      ...f.db.playerProgress.identity.find(f.ctx.sender), enemyKills: 0, crystalHollowsUnlocked: forged,
    });
    save(true);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(false);
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.prismshell });
    save(false);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).bossRewardClaims).toBe(BOSS_REWARD_CLAIM_BITS.prismshell);
    f.patch("playerProgress", { crystalHollowsUnlocked: true });
    save(false);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).crystalHollowsUnlocked).toBe(true);
  });

  it("rejects locked travel without moving the player, then accepts an earned unlock", () => {
    const f = crystalFixture();
    f.patch("player", { mapId: "moonfen" });
    const travel = () => f.run(server.changeMap, { mapId: "crystal_hollows", x: 580, y: 617 });
    expect(travel).toThrow("Defeat Miremaw");
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("moonfen");
    f.patch("playerProgress", { crystalHollowsUnlocked: true });
    travel();
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  });
});
