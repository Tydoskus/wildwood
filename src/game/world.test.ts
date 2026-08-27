import { describe, expect, it } from "vitest";
import { GLOOMROOT_MAX_HP, MAGMALISK_MAX_HP, TIDEWYRM_MAX_HP } from "../../shared/rules";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  createSpawnSites,
  createWorldLayout,
} from "./world";

describe("Advanced Lava Lake", () => {
  it("builds a deterministic lava environment without overlapping rocks or ember dots", () => {
    const first = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);

    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(5);
    expect(first.decor.some((item) => item.type === "lavaPool")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaRock")).toBe(true);
    expect(first.decor.some((item) => item.type === "charredTree")).toBe(true);
    const rocks = first.decor.filter((item) => item.type === "lavaRock");
    expect(rocks).toHaveLength(72 * 7);
    let minimumGap = Number.POSITIVE_INFINITY;
    for (let left = 0; left < rocks.length; left += 1) {
      for (let right = left + 1; right < rocks.length; right += 1) {
        minimumGap = Math.min(
          minimumGap,
          Math.hypot(rocks[left].x - rocks[right].x, rocks[left].y - rocks[right].y) - 75 * (rocks[left].s + rocks[right].s),
        );
      }
    }
    expect(minimumGap).toBeGreaterThanOrEqual(0);
    expect(first.decor
      .filter((item) => item.type === "charredTree")
      .every((item) => item.variant === 0 || item.variant === 1)).toBe(true);
  });

  it("connects Magmalisk's Lava Lake portal to scaled Night Forest camps", () => {
    const config = createGameBootstrap().mapConfig;
    const sites = createSpawnSites({ x: 4050, y: 4050 }, INFERNAL_DEPTHS_MAP_ID);
    const layout = createWorldLayout({ x: 580, y: 770 }, INFERNAL_DEPTHS_MAP_ID);
    const infernalKinds = new Set(["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"]);

    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].secondaryPortal.destination).toBe(INFERNAL_DEPTHS_MAP_ID);
    expect(config[INFERNAL_DEPTHS_MAP_ID].portal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[INFERNAL_DEPTHS_MAP_ID].name).toBe("Night Forest");
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => infernalKinds.has(site.type))).toBe(true);
    expect(layout.decor.filter((item) => item.type === "tree")).toHaveLength(166);
    expect(layout.decor.some((item) => item.type === "charredTree" || item.type === "lavaPool" || item.type === "lavaRock" || item.type === "grass" || item.type === "petal")).toBe(false);
  });

  it("spawns only lava-tier enemies", () => {
    const sites = createSpawnSites({ x: 4050, y: 4050 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const lavaKinds = new Set(["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]);

    expect(sites).toHaveLength(30);
    expect(sites.every((site) => lavaKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900 - .001)).toBe(true);
  });

  it("uses Title Case map names and connects Snowlands with Lava Lake", () => {
    const config = createGameBootstrap().mapConfig;

    expect(config[TUTORIAL_FOREST_MAP_ID].name).toBe("Tutorial Forest");
    expect(config[BEGINNER_DESERT_MAP_ID].name).toBe("Beginner Desert");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].name).toBe("Intermediate Snowlands");
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].name).toBe("Advanced Lava Lake");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].secondaryPortal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].portal.destination).toBe(INTERMEDIATE_SNOWLANDS_MAP_ID);
    expect(createGameBootstrap().magmaliskBoss).toMatchObject({ x: 4050, y: 4050, r: 165, maxHp: MAGMALISK_MAX_HP });
  });

  it("connects Gloomroot's Night Forest gate to deterministic Water Reach camps", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites(bootstrap.gloomrootBoss, WATER_REACH_MAP_ID);
    const first = createWorldLayout(bootstrap.mapConfig[WATER_REACH_MAP_ID].arrival, WATER_REACH_MAP_ID);
    const second = createWorldLayout(bootstrap.mapConfig[WATER_REACH_MAP_ID].arrival, WATER_REACH_MAP_ID);
    const waterKinds = new Set(["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"]);

    expect(bootstrap.mapConfig[INFERNAL_DEPTHS_MAP_ID].secondaryPortal.destination).toBe(WATER_REACH_MAP_ID);
    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].portal.destination).toBe(INFERNAL_DEPTHS_MAP_ID);
    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].name).toBe("Water Reach");
    expect(bootstrap.gloomrootBoss).toMatchObject({ x: 4050, y: 4050, r: 175, maxHp: GLOOMROOT_MAX_HP });
    expect(bootstrap.tidewyrmBoss).toMatchObject({ x: 4050, y: 4050, r: 175, maxHp: TIDEWYRM_MAX_HP });
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => waterKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(first).toEqual(second);
    expect(first.decor.some((item) => item.type === "coral")).toBe(true);
    expect(first.decor.some((item) => item.type === "shell")).toBe(true);
    expect(first.decor
      .filter((item) => item.type === "coral" || item.type === "shell")
      .every((item) => Math.hypot(item.x - 4050, item.y - 4050) >= 680)).toBe(true);
    expect(first.paths.some((path) => 4050 >= path.x && 4050 <= path.x + path.w && 4050 >= path.y && 4050 <= path.y + path.h)).toBe(true);
  });

  it("connects Water Reach to a deterministic Samurai Garden", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites({ x: 4050, y: 4050 }, SAMURAI_GARDEN_MAP_ID);
    const first = createWorldLayout({ x: 580, y: 770 }, SAMURAI_GARDEN_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, SAMURAI_GARDEN_MAP_ID);
    const samuraiKinds = new Set(["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"]);

    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].secondaryPortal.destination).toBe(SAMURAI_GARDEN_MAP_ID);
    expect(bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].portal.destination).toBe(WATER_REACH_MAP_ID);
    expect(bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].name).toBe("Samurai Garden");
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => samuraiKinds.has(site.type))).toBe(true);
    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(10);
    expect(first.decor.filter((item) => item.type === "tree")).toHaveLength(148);
    expect(first.decor.some((item) => item.type === "cherryPetal")).toBe(true);
  });
});

describe("Intermediate Snowlands", () => {
  it("places one labeled upgrade bench beside the portal approach", () => {
    const layout = createWorldLayout({ x: 580, y: 770 }, INTERMEDIATE_SNOWLANDS_MAP_ID);
    const benches = layout.decor.filter((item) => item.type === "upgradeBench");

    expect(benches).toEqual([
      { type: "upgradeBench", x: 800, y: 710, s: 1, label: "Upgrade Bench" },
    ]);
  });
});
