import { describe, expect, it } from "vitest";
import { generatedMapContent, generatedBossArt } from "./procedural-maps";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import { MAP_ASSET_GROUPS } from "./runtime/map-asset-groups";
import { createEnemyLifecycle } from "./runtime/enemy-lifecycle";
import { createSpawnSites, createWorldLayout } from "./world";
import type { EnemyState } from "./runtime/types";
import { mapGuideZones } from "../ui/map-guide-controller";

describe("generated campaign runtime adapters", () => {
  it("exposes lazy maps and both portals without replacing the authored campaign", () => {
    const { mapConfig } = createGameBootstrap();
    expect(mapConfig.ion_citadel.secondaryPortal?.destination).toBe(
      "endless_1",
    );
    expect("endless_235" in mapConfig).toBe(true);
    expect(mapConfig.endless_235.name).toBe("Endless - 235");
    expect(mapConfig.endless_235.secondaryPortal?.destination).toBe(
      "endless_236",
    );
    expect(mapConfig.tutorial_forest.name).toBe("Tutorial Forest - 1");
  });
  it("uses only rocks and grass, keeping decorations clear of paths and encounters", () => {
    for (let n = 1; n <= 40; n++) {
      const content = generatedMapContent(`endless_${n}`);
      expect(content.decor.length).toBeGreaterThan(0);
      for (const d of content.decor) {
        expect(["rock", "grass"]).toContain(d.type);
        // Clear of where enemies stand, not of whole regions: those cover half the map.
        expect(
          content.sites.every(
            (site) => Math.hypot(d.x - site.x, d.y - site.y) > 200,
          ),
        ).toBe(true);
        expect(
          Math.hypot(d.x - content.map.boss.x, d.y - content.map.boss.y),
        ).toBeGreaterThan(750);
      }
    }
  });
  it("spawns scaled combat stats independently from sprites and shows their actual stat rewards", () => {
    const sites = createSpawnSites({ x: 0, y: 0 }, "endless_4");
    const enemies: EnemyState[] = [];
    const lifecycle = createEnemyLifecycle(enemies, sites, () => {});
    sites.forEach(lifecycle.spawnFromSite);
    expect(enemies).toHaveLength(48);
    for (let i = 0; i < sites.length; i++) {
      expect(enemies[i].maxHp).toBe(sites[i].definition!.hp);
      expect(enemies[i].reward).toEqual(sites[i].definition!.reward);
    }
    expect(
      new Set(mapGuideZones(sites).flatMap((z) => z.rewards.map((r) => r.type)))
        .size,
    ).toBe(6);
    expect(new Set(sites.map(site => site.type)).size).toBe(1);
    expect(enemies.some(enemy => enemy.reward.type === "speed") && enemies.some(enemy => enemy.reward.type === "crit")).toBe(true);
    const assets = MAP_ASSET_GROUPS.endless_4;
    expect(assets.enemies).toHaveLength(1);
    expect(sites.every((s) => assets.enemies.includes(s.type))).toBe(true);
    expect(assets.enemies).toContain(generatedBossArt("endless_4"));
    expect(assets.art).toEqual([]);
    expect(
      createWorldLayout({ x: 580, y: 770 }, "endless_4").paths.length,
    ).toBeGreaterThan(0);
  });
});

it("keeps generated palettes compatible with the WebGL backdrop", async () => {
  const { parseHexColorOrNull } =
    await import("./runtime/webgl-static-world-layer");
  const { mapVisualTheme } = await import("./map-design");
  for (const n of [1, 2, 10, 50, 1000]) {
    const theme = mapVisualTheme(`endless_${n}`);
    expect(parseHexColorOrNull(theme.ground)).not.toBeNull();
    expect(theme.decorColors.rock).toHaveLength(2);
  }
});

it('uses exactly one species including the boss across generated maps', () => {
  for (let n = 1; n <= 100; n++) {
    const id = `endless_${n}` as const;
    const content = generatedMapContent(id);
    expect(new Set(content.sites.map(site => site.type))).toEqual(new Set([generatedBossArt(id)]));
    // Six camps, one a reward stat (0.901.47): attack speed and crit damage included.
    expect(new Set(content.sites.map(site => site.definition!.reward.type)).size).toBe(6);
    expect(MAP_ASSET_GROUPS[id].enemies).toEqual(content.kinds);
  }
});
