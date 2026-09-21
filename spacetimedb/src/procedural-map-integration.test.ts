// Pre-cutover shared boss regression coverage. Current personal combat is tested separately.
vi.mock("../../shared/personal-bosses", async (original) => ({ ...await original<typeof import("../../shared/personal-bosses")>(), PERSONAL_BOSS_COMBAT: false }));
import { describe, expect, it, vi } from "vitest";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { generateMap } from "../../shared/procedural-maps";
import {
  crystalFixture,
  server,
  identity,
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
  it("ignores a queued hit from another map and saves a boss clear before the next portal", () => {
    const f = fixture();
    f.run(server.changeMap, { mapId: "endless_1", x: 580, y: 617 });
    f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
    const boss = f.db.proceduralInstanceBoss.key.find("endless_1:root");
    f.run(server.hitProceduralBoss, {
      mapId: "endless_2",
      bossKey: boss.key,
      encounter: boss.encounter,
      hits: 1,
      x: 4050,
      y: 4050,
    });
    expect(f.db.proceduralInstanceBoss.key.find("endless_1:root").hp).toBe(
      boss.hp,
    );
    f.run(server.hitProceduralBoss, {
      mapId: "endless_1",
      bossKey: boss.key,
      encounter: boss.encounter,
      hits: 1,
      x: 4050,
      y: 4050,
    });
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(
      1,
    );
    expect(
      f.db.playerProgress.identity.find(f.ctx.sender).regen,
    ).toBeGreaterThan(0);
    f.run(server.changeMap, { mapId: "endless_2", x: 580, y: 617 });
    expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("endless_2");
  });
  it("shares one boss between every player on a generated map", () => {
    const f = fixture();
    const view = (sender = f.ctx.sender) =>
      server.myProceduralBoss({
        db: f.db,
        sender,
      } as unknown as import("./index").GameViewContext);
    f.patch("player", { mapId: "endless_1" });
    f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
    const boss = view()!;
    expect(boss.key).toBe("endless_1:root");
    f.patch("playerProgress", { damage: boss.maxHp / 4 });
    f.run(server.hitProceduralBoss, {
      mapId: "endless_1",
      bossKey: boss.key,
      encounter: boss.encounter,
      hits: 1,
      x: 4050,
      y: 4050,
    });
    const damaged = view()!;
    expect(damaged.hp).toBeLessThan(boss.hp);
    f.seed("player", {
      ...f.db.player.identity.find(f.ctx.sender),
      identity: identity("2"),
    });
    expect(view(identity("2"))).toEqual(damaged);
  });
  it("retains the deployed layouts and adopts a legacy local fight exactly once", () => {
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
    const f = fixture();
    f.patch("player", { mapId: "endless_1" });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 2 });
    f.seed("proceduralBoss", {
      mapId: "endless_1",
      encounter: 7n,
      hp: 50,
      maxHp: 100,
      respawnAtMicros: 0n,
    });
    f.seed("proceduralContribution", {
      key: "old-contribution",
      mapId: "endless_1",
      identity: f.ctx.sender,
      encounter: 7n,
      damage: 50,
      windowAt: 1n,
      hits: 1,
    });
    f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
    f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
    expect(
      f.db.proceduralInstanceBoss.key.find("endless_1:root"),
    ).toMatchObject({ encounter: 7n, hp: 50 });
    expect([...f.db.proceduralInstanceContribution.iter()]).toHaveLength(1);
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(
      2,
    );
    expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(1e30);
    f.run(server.hitProceduralBoss, {
      mapId: "endless_1",
      bossKey: "endless_1:root",
      encounter: 7n,
      hits: 1,
      x: 4050,
      y: 4050,
    });
    f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
    expect(f.db.proceduralInstanceBoss.key.find("endless_1:root").hp).toBe(0);
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(
      2,
    );
  });
});

it("shares the attack budget between cached clients and the new batch endpoint", () => {
  const f = fixture();
  f.run(server.changeMap, { mapId: "endless_1", x: 580, y: 617 });
  f.patch("playerProgress", { damage: 10, attackRate: 1, projectileCount: 1 });
  f.run(server.prepareProceduralBoss, { mapId: "endless_1" });
  const boss = f.db.proceduralInstanceBoss.key.find("endless_1:root");
  f.db.proceduralInstanceBoss.key.update({ ...boss, hp: 10000, maxHp: 10000 });
  const action = { mapId: "endless_1", bossKey: boss.key, encounter: boss.encounter, hits: 100, x: 4050, y: 4050 };
  f.run(server.hitProceduralBossBatch, action);
  const hp = f.db.proceduralInstanceBoss.key.find(boss.key).hp;
  expect(hp).toBeLessThan(10000);
  f.run(server.hitProceduralBoss, action);
  f.run(server.hitProceduralBossBatch, action);
  expect(f.db.proceduralInstanceBoss.key.find(boss.key).hp).toBe(hp);
});
