import { describe, expect, it } from "vitest";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  createSpawnSites,
  createWorldLayout,
} from "./world";

describe("Advanced Lava Wastes", () => {
  it("builds a deterministic lava environment from distinct decor layers", () => {
    const first = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);

    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(5);
    expect(first.decor.some((item) => item.type === "lavaPool")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaRock")).toBe(true);
    expect(first.decor.some((item) => item.type === "charredTree")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaEmber")).toBe(true);
  });

  it("spawns only lava-tier enemies", () => {
    const sites = createSpawnSites({ x: 4050, y: 4050 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const lavaKinds = new Set(["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]);

    expect(sites).toHaveLength(30);
    expect(sites.every((site) => lavaKinds.has(site.type))).toBe(true);
  });

  it("connects Snowlands and Lava Wastes in both directions", () => {
    const config = createGameBootstrap().mapConfig;

    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].secondaryPortal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].portal.destination).toBe(INTERMEDIATE_SNOWLANDS_MAP_ID);
  });
});
