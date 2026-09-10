import { describe, expect, it } from "vitest";
import { MOONFEN_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID, TUTORIAL_FOREST_MAP_ID, WATER_REACH_MAP_ID, type MapId, type WorldDecor } from "../world";
import { createDepthWorldRenderer } from "./depth-world-renderer";
import type { Camera } from "./camera";
import type { DragonBossState, EnemyState, FrostclawBossState, GloomrootBossState, KoiShogunBossState, MagmaliskBossState, MiremawBossState, PrismshellBossState, IronhornBossState, DreadreaperBossState, VoltwardenBossState, GravebloomBossState, AegisPrimeBossState, PlayerState, SpiderBossState, TempestKirinBossState, TidewyrmBossState } from "./types";

function renderer(
  decor: WorldDecor[],
  calls: string[],
  mapId: MapId = TUTORIAL_FOREST_MAP_ID,
  tidewyrmDead = true,
  remoteEnemies: EnemyState[] = [],
  enemyOpacities: number[] = [],
  cameraPosition = { x: 0, y: 0 },
) {
  return createDepthWorldRenderer({
    camera: { ...cameraPosition, zoom: 1 } as Camera,
    viewport: () => ({ width: 500, height: 500 }),
    decor,
    enemies: [],
    remoteEnemies: () => remoteEnemies,
    player: { y: 170 } as PlayerState,
    boss: { dead: true, x: 120, y: 0 } as DragonBossState,
    spiderBoss: { dead: true, x: 120, y: 0 } as SpiderBossState,
    frostclawBoss: { dead: true, x: 120, y: 0 } as FrostclawBossState,
    magmaliskBoss: { dead: true, x: 120, y: 0 } as MagmaliskBossState,
    gloomrootBoss: { dead: true, x: 120, y: 0 } as GloomrootBossState,
    tidewyrmBoss: { dead: tidewyrmDead, x: 120, y: 120 } as TidewyrmBossState,
    koiShogunBoss: { dead: true, x: 120, y: 120 } as KoiShogunBossState,
    tempestKirinBoss: { dead: true, x: 120, y: 120 } as TempestKirinBossState,
    miremawBoss: { dead: mapId !== MOONFEN_MAP_ID, x: 120, y: 120 } as MiremawBossState,
    prismshellBoss: { dead: mapId !== CRYSTAL_HOLLOWS_MAP_ID, x: 120, y: 120 } as PrismshellBossState, ironhornBoss: { dead: mapId !== "clockwork_ruins", x: 120, y: 120 } as IronhornBossState, dreadreaperBoss: { dead: mapId !== "duskfall_orchard", x: 120, y: 120 } as DreadreaperBossState, voltwardenBoss: { dead: mapId !== "neon_bastion", x: 120, y: 120 } as VoltwardenBossState,
    gravebloomBoss: { dead: mapId !== "verdant_catacombs", x: 120, y: 120 } as GravebloomBossState, aegisPrimeBoss: { dead: mapId !== "ion_citadel", x: 120, y: 120 } as AegisPrimeBossState,
    bootsPickup: { y: 0, r: 0, collected: true },
    currentMapId: () => mapId,
    activePortal: () => mapId === "home_exterior" ? null : ({ depth: 0 }),
    secondaryPortal: () => null,
    drawTree: (tree) => calls.push(`tree:${tree.y}`),
    drawCactus: (cactus) => calls.push(`cactus:${cactus.y}`),
    drawSnowPine: (tree) => calls.push(`pine:${tree.y}`),
    drawUpgradeBench: (bench) => calls.push(`bench:${bench.y}`),
    drawCharredTree: (tree) => calls.push(`charred-tree:${tree.y}`),
    drawEnemy: (_enemy, opacity = 1) => { calls.push("enemy"); enemyOpacities.push(opacity); },
    drawBoss: () => calls.push("boss"),
    drawSpiderBoss: () => calls.push("spider"),
    drawFrostclawBoss: () => calls.push("frostclaw"),
    drawMagmaliskBoss: () => calls.push("magmalisk"),
    drawGloomrootBoss: () => calls.push("gloomroot"),
    drawTidewyrmBoss: () => calls.push("tidewyrm"),
    drawKoiShogunBoss: () => calls.push("koi-shogun"),
    drawTempestKirinBoss: () => calls.push("tempest-kirin"),
    drawMiremawBoss: () => calls.push("miremaw"),
    drawPrismshellBoss: () => calls.push("prismshell"), drawIronhornBoss: () => calls.push("ironhorn"), drawDreadreaperBoss: () => calls.push("dreadreaper"), drawVoltwardenBoss: () => calls.push("voltwarden"), drawGravebloomBoss: () => calls.push("gravebloom"), drawAegisPrimeBoss: () => calls.push("aegisPrime"),
    drawBootPickup: () => calls.push("boots"),
    drawPortal: () => calls.push("portal"),
    drawSecondaryPortal: () => calls.push("secondary"),
    drawRemotePlayer: (player) => calls.push(`remote:${player.y}`),
    drawPlayer: () => calls.push("player"),
  });
}

describe("depth world renderer", () => {
  it("merges pre-sorted static decor with dynamic actors", () => {
    const calls: string[] = [];
    const depth = renderer([
      { type: "tree", x: 100, y: 300, s: 1, variant: 0 },
      { type: "cactus", x: 100, y: 100, s: 1, variant: 0 },
      { type: "upgradeBench", x: 100, y: 220, s: 1, label: "Upgrade Bench" },
    ], calls);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["cactus:100", "player", "bench:220", "tree:300"]);
  });

  it("pre-culls offscreen static decor and remote players", () => {
    const calls: string[] = [];
    const depth = renderer([
      { type: "cactus", x: 2_000, y: 100, s: 1, variant: 0 },
    ], calls);

    depth.drawDepthSortedWorld([{
      id: "remote",
      x: 2_000,
      y: 100,
    } as never], false);

    expect(calls).toEqual(["player"]);
  });

  it("rebuilds static order after invalidation", () => {
    const calls: string[] = [];
    const decor: WorldDecor[] = [{ type: "tree", x: 100, y: 300, s: 1, variant: 0 }];
    const depth = renderer(decor, calls);
    depth.drawDepthSortedWorld([], false);
    calls.length = 0;
    decor.splice(0, 1, { type: "cactus", x: 100, y: 100, s: 1, variant: 0 });
    depth.invalidateDepthOrder();

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["cactus:100", "player"]);
  });

  it("leaves Lava rocks out of actor depth layering", () => {
    const calls: string[] = [];
    const depth = renderer([{ type: "lavaRock", x: 100, y: 100, s: 1, variant: 0 }], calls);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["player"]);
  });

  it("queues Tidewyrm in Water Reach depth order", () => {
    const calls: string[] = [];
    const depth = renderer([], calls, WATER_REACH_MAP_ID, false);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["player", "tidewyrm"]);
  });

  it("queues Miremaw in Moonfen depth order", () => {
    const calls: string[] = [];
    const depth = renderer([], calls, MOONFEN_MAP_ID);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["player", "miremaw"]);
  });
  it("queues Prismshell in CrystalHollows depth order", () => {
    const calls: string[] = [];
    const depth = renderer([], calls, CRYSTAL_HOLLOWS_MAP_ID);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["player", "prismshell"]);
  });

  it("depth-sorts remote combat copies at translucent opacity", () => {
    const calls: string[] = [];
    const opacities: number[] = [];
    const ghost = {
      x: 100,
      y: 100,
      r: 14,
      dead: false,
      remoteCombatGhost: true,
    } as EnemyState;
    const depth = renderer([], calls, TUTORIAL_FOREST_MAP_ID, true, [ghost], opacities);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["enemy", "player"]);
    expect(opacities).toEqual([.46]);
  });
});


it.each([["clockwork_ruins", "ironhorn"], ["duskfall_orchard", "dreadreaper"], ["neon_bastion", "voltwarden"]] as const)("draws only the boss belonging to %s", (mapId, boss) => {
  const calls: string[] = [];
  renderer([], calls, mapId).drawDepthSortedWorld([], false);
  expect(calls).toEqual(["player", boss]);
});


it("renders a map without portals without queuing a placeholder portal", () => {
  const calls: string[] = [];
  renderer([], calls, "home_exterior").drawDepthSortedWorld([], true);
  expect(calls).toEqual(["player"]);
});


it.each([MOONFEN_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID, "clockwork_ruins", "duskfall_orchard", "neon_bastion"] as const)(
  "skips off-screen boss rendering on %s while keeping partial sprites visible", (mapId) => {
    const far: string[] = [];
    renderer([], far, mapId, true, [], [], { x: 3000, y: 3000 }).drawDepthSortedWorld([]);
    expect(far.some((call) => ["miremaw", "prismshell", "ironhorn", "dreadreaper", "voltwarden"].includes(call))).toBe(false);
    const edge: string[] = [];
    renderer([], edge, mapId, true, [], [], { x: 650, y: 120 }).drawDepthSortedWorld([]);
    expect(edge.some((call) => ["miremaw", "prismshell", "ironhorn", "dreadreaper", "voltwarden"].includes(call))).toBe(true);
  },
);
