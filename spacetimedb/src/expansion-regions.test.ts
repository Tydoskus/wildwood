import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { reducerParameters } from "../../tests/helpers/spacetime-module";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const regions = [
  { map: "clockwork_ruins", unlock: "clockworkRuinsUnlocked" },
  { map: "duskfall_orchard", unlock: "duskfallOrchardUnlocked" },
  { map: "neon_bastion", unlock: "neonBastionUnlocked" },
  { map: "verdant_catacombs", unlock: "verdantCatacombsUnlocked" },
  { map: "ion_citadel", unlock: "ionCitadelUnlocked" },
] as const;

describe.each(regions)("$map unlock", region => {
  it("appends a server-owned unlock after the existing ledger", () => {
    const columns = server.default.schemaType.tables.playerProgress.columns;
    expect(columns[region.unlock].columnMetadata.defaultValue).toBe(false);
    expect(Object.keys(columns).indexOf(region.unlock)).toBeGreaterThan(Object.keys(columns).indexOf("bossRewardClaims"));
    expect(reducerParameters.get(server.savePlayerProgress)).not.toHaveProperty(region.unlock);
  });

});

it("preserves an older Prismshell victory when installing the new gate", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 24 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.prismshell });
  // Maintenance runs additive module migrations before its ordinary work.
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).clockworkRuinsUnlocked).toBe(true);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).duskfallOrchardUnlocked).toBe(false);
});

it("enforces the complete portal chain and survives repeated forward/return trips", () => {
  const f = crystalFixture();
  const travel = (mapId: string, x: number) => f.run(server.changeMap, { mapId, x, y: 617 });
  expect(() => travel("clockwork_ruins", 580)).toThrow("Prismshell");
  f.patch("playerProgress", { crystalHollowsUnlocked: true, clockworkRuinsUnlocked: true });
  travel("clockwork_ruins", 580);
  expect(() => travel("duskfall_orchard", 580)).toThrow("Ironhorn");
  f.patch("playerProgress", { duskfallOrchardUnlocked: true });
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const [mapId, x] of [["duskfall_orchard", 580], ["clockwork_ruins", 360], ["crystal_hollows", 360], ["clockwork_ruins", 580]] as const) {
      travel(mapId, x);
      expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId, x: 580, y: 770 });
      expect(f.db.playerMotion.identity.find(f.ctx.sender).mapId).toBe(mapId);
    }
  }
  f.run(server.onDisconnect);
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender).mapId).toBe("clockwork_ruins");
});

it("preserves old Dreadreaper clears and gates Neon Bastion behind its own unlock", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 27 });
  f.patch("playerProgress", { duskfallOrchardUnlocked: true, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.dreadreaper });
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).neonBastionUnlocked).toBe(true);
  expect(BOSS_REWARD_CLAIM_BITS.voltwarden).not.toBe(BOSS_REWARD_CLAIM_BITS.dreadreaper);
  f.patch("player", { mapId: "duskfall_orchard" });
  f.run(server.changeMap, { mapId: "neon_bastion", x: 580, y: 617 });
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("neon_bastion");
  f.run(server.changeMap, { mapId: "duskfall_orchard", x: 360, y: 617 });
  f.patch("playerProgress", { neonBastionUnlocked: false });
  expect(() => f.run(server.changeMap, { mapId: "neon_bastion", x: 580, y: 617 })).toThrow("Dreadreaper");
});


it("backfills only Voltwarden victories and supports catacombs return travel", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 28 });
  f.patch("playerProgress", { neonBastionUnlocked: true, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.dreadreaper });
  f.patch("player", { mapId: "neon_bastion" });
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).verdantCatacombsUnlocked).toBe(false);
  expect(() => f.run(server.changeMap, { mapId: "verdant_catacombs", x: 580, y: 617 })).toThrow("Voltwarden");
  f.db.moduleMigrationState.id.update({ id: 0, version: 28 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.voltwarden });
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).verdantCatacombsUnlocked).toBe(true);
  for (let repeat = 0; repeat < 3; repeat++) {
    f.run(server.changeMap, { mapId: "verdant_catacombs", x: 580, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("verdant_catacombs");
    f.run(server.changeMap, { mapId: "neon_bastion", x: 360, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("neon_bastion");
  }
});

it("requires Gravebloom for Ion Citadel and preserves the gate across return trips", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 29 });
  f.patch("playerProgress", { verdantCatacombsUnlocked: true, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.voltwarden });
  f.patch("player", { mapId: "verdant_catacombs" });
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).ionCitadelUnlocked).toBe(false);
  expect(() => f.run(server.changeMap, { mapId: "ion_citadel", x: 580, y: 617 })).toThrow("Gravebloom");
  f.db.moduleMigrationState.id.update({ id: 0, version: 29 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.gravebloom });
  f.run(server.runMaintenance, {});
  expect(f.db.playerProgress.identity.find(f.ctx.sender).ionCitadelUnlocked).toBe(true);
  for (let repeat = 0; repeat < 3; repeat++) {
    f.run(server.changeMap, { mapId: "ion_citadel", x: 580, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("ion_citadel");
    f.run(server.changeMap, { mapId: "verdant_catacombs", x: 360, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("verdant_catacombs");
  }
  f.run(server.changeMap, { mapId: "ion_citadel", x: 580, y: 617 });
  f.run(server.onDisconnect);
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender).mapId).toBe("ion_citadel");
});
