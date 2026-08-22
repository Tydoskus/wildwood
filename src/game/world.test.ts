import { describe, expect, it } from "vitest";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  createSpawnSites,
  createWorldLayout,
} from "./world";

describe("Advanced Lava Lake", () => {
  it("builds a deterministic lava environment from distinct decor layers", () => {
    const first = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);

    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(5);
    expect(first.decor.some((item) => item.type === "lavaPool")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaRock")).toBe(true);
    expect(first.decor.some((item) => item.type === "charredTree")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaEmber")).toBe(true);
    expect(first.decor
      .filter((item) => item.type === "charredTree")
      .every((item) => item.variant === 0 || item.variant === 1)).toBe(true);
  });

  it("spawns only lava-tier enemies", () => {
    const sites = createSpawnSites({ x: 4050, y: 4050 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const lavaKinds = new Set(["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]);

    expect(sites).toHaveLength(30);
    expect(sites.every((site) => lavaKinds.has(site.type))).toBe(true);
  });

  it("uses Title Case map names and connects Snowlands with Lava Lake", () => {
    const config = createGameBootstrap().mapConfig;

    expect(config[TUTORIAL_FOREST_MAP_ID].name).toBe("Tutorial Forest");
    expect(config[BEGINNER_DESERT_MAP_ID].name).toBe("Beginner Desert");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].name).toBe("Intermediate Snowlands");
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].name).toBe("Advanced Lava Lake");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].secondaryPortal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].portal.destination).toBe(INTERMEDIATE_SNOWLANDS_MAP_ID);
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
