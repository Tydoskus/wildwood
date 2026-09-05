import { describe, expect, it } from "vitest";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import { createWorldLayout, createSpawnSites, mapSpawnCamps, type MapId } from "./world";
import { ENEMY_TYPES } from "./enemies";
import { mapVisualTheme } from "./map-design";
import { MAP_ENEMY_FAMILIES } from "./enemy-sprite-layouts.mjs";
import { MAP_ASSET_GROUPS } from "./runtime/map-asset-groups";
import { IRONHORN_MAX_HP, DREADREAPER_MAX_HP, PRISMSHELL_MAX_HP } from "../../shared/rules";

describe("Clockwork Ruins and Duskfall Orchard", () => {
  it("extends the portal chain in both directions and scales each boss one full tier", () => {
    const { mapConfig } = createGameBootstrap();
    expect(mapConfig.crystal_hollows.secondaryPortal.destination).toBe("clockwork_ruins");
    expect(mapConfig.clockwork_ruins.portal.destination).toBe("crystal_hollows");
    expect(mapConfig.clockwork_ruins.secondaryPortal.destination).toBe("duskfall_orchard");
    expect(mapConfig.duskfall_orchard.portal.destination).toBe("clockwork_ruins");
    expect(IRONHORN_MAX_HP / PRISMSHELL_MAX_HP).toBeCloseTo(3);
    expect(DREADREAPER_MAX_HP / IRONHORN_MAX_HP).toBeCloseTo(3);
  });
  it.each([
    ["clockwork_ruins", "raptor-mechanic", "gear"],
    ["duskfall_orchard", "pumpkin-orange", "pumpkin"],
  ] as const)("gives %s connected, clear routes and its own exported family", (mapId, family, decorType) => {
    const map = mapId as MapId;
    const { paths, decor } = createWorldLayout({ x: 580, y: 770 }, map);
    const reachable = new Set([0]);
    for (let pass = 0; pass < paths.length; pass++) paths.forEach((a, i) => {
      if (paths.some((b, j) => reachable.has(j) && a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y)) reachable.add(i);
    });
    expect(reachable.size).toBe(paths.length);
    expect(decor.some(item => item.type === decorType)).toBe(true);
    expect(mapVisualTheme(map).ground).not.toBe(mapVisualTheme("crystal_hollows").ground);
    expect(MAP_ENEMY_FAMILIES[map as keyof typeof MAP_ENEMY_FAMILIES]).toBe(family);
    const camps = mapSpawnCamps(map);
    expect(camps).toHaveLength(5);
    expect(new Set(camps.map(camp => ENEMY_TYPES[camp.types[0]].reward.type)).size).toBe(4);
    const sites = createSpawnSites({ x: 4050, y: 4050 }, map);
    expect(sites).toHaveLength(30);
    for (const site of sites) expect(MAP_ASSET_GROUPS[map].enemies as readonly string[]).toContain(site.type);
    for (const item of decor) expect(Math.hypot(item.x - 4050, item.y - 4050)).toBeGreaterThan(680);
  });
});
