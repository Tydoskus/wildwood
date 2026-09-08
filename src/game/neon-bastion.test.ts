import { describe, expect, it } from "vitest";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import { createWorldLayout, createSpawnSites, mapSpawnCamps } from "./world";
import { ENEMY_TYPES } from "./enemies";
import { mapVisualTheme } from "./map-design";
import { MAP_ASSET_GROUPS } from "./runtime/map-asset-groups";
import { DREADREAPER_MAX_HP, VOLTWARDEN_MAX_HP } from "../../shared/rules";
import { BOSS_DAMAGE_REFERENCE } from "./boss-damage";

describe("Neon Bastion", () => {
  it("extends the campaign with a return portal and the next combat tier", () => {
    const { mapConfig } = createGameBootstrap();
    expect(mapConfig.duskfall_orchard.secondaryPortal.destination).toBe("neon_bastion");
    expect(mapConfig.neon_bastion.portal.destination).toBe("duskfall_orchard");
    expect(VOLTWARDEN_MAX_HP / DREADREAPER_MAX_HP).toBeCloseTo(3);
    expect(BOSS_DAMAGE_REFERENCE.voltwarden).toBeGreaterThan(BOSS_DAMAGE_REFERENCE.dreadreaper);
    expect(ENEMY_TYPES["Circuit Prowler"].hp / ENEMY_TYPES["Gourd Prowler"].hp).toBeCloseTo(3);
  });
  it("has connected roads, five complete camps and a clear boss arena", () => {
    const map = "neon_bastion";
    const { paths, decor } = createWorldLayout({ x: 580, y: 770 }, map);
    const reachable = new Set([0]);
    for (let pass = 0; pass < paths.length; pass++) paths.forEach((a, i) => {
      if (paths.some((b, j) => reachable.has(j) && a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y)) reachable.add(i);
    });
    expect(reachable.size).toBe(paths.length);
    expect(mapSpawnCamps(map)).toHaveLength(5);
    const sites = createSpawnSites({ x: 4050, y: 4050 }, map);
    expect(sites).toHaveLength(30);
    expect(new Set(sites.map(site => ENEMY_TYPES[site.type].reward.type)).size).toBe(4);
    for (const site of sites) expect(MAP_ASSET_GROUPS[map].enemies as readonly string[]).toContain(site.type);
    expect(decor.length).toBeGreaterThan(50);
    for (const item of decor) expect(Math.hypot(item.x - 4050, item.y - 4050)).toBeGreaterThan(680);
    expect(mapVisualTheme(map).ground).toBe("#101528");
  });
});
