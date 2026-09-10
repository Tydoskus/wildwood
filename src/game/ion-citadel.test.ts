import { describe, expect, it } from "vitest";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import { createWorldLayout, createSpawnSites, mapSpawnCamps } from "./world";
import { ENEMY_TYPES } from "./enemies";
import { mapVisualTheme } from "./map-design";
import { MAP_ASSET_GROUPS } from "./runtime/map-asset-groups";
import { GRAVEBLOOM_MAX_HP, AEGIS_PRIME_MAX_HP } from "../../shared/rules";
import { BOSS_DAMAGE_REFERENCE } from "./boss-damage";

describe("Ion Citadel", () => {
  it("extends the campaign with a return portal and the next combat tier", () => {
    const { mapConfig } = createGameBootstrap();
    expect(mapConfig.verdant_catacombs.secondaryPortal.destination).toBe("ion_citadel");
    expect(mapConfig.ion_citadel.portal.destination).toBe("verdant_catacombs");
    expect(AEGIS_PRIME_MAX_HP / GRAVEBLOOM_MAX_HP).toBeCloseTo(3);
    expect(BOSS_DAMAGE_REFERENCE.aegisPrime).toBeGreaterThan(BOSS_DAMAGE_REFERENCE.gravebloom);
    expect(ENEMY_TYPES["Ion Patrol"].hp / ENEMY_TYPES["Mossbound Stalker"].hp).toBeCloseTo(3);
  });
  it("has connected roads, five complete camps and a clear boss arena", () => {
    const map = "ion_citadel";
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
    expect(mapVisualTheme(map).ground).toBe("#102832");
  });
});

it("reuses the original reserved shield sentry for every citadel camp role", async () => {
  const { readFile } = await import('node:fs/promises');
  const { ENEMY_SPRITE_LAYOUTS } = await import('./enemy-sprite-layouts.mjs');
  const { enemySpriteAssetSources } = await import('./enemies');
  const [reserved, promoted] = await Promise.all([
    readFile(new URL('../../art-source/reserved/neon-sentries/guardian.svg', import.meta.url), 'utf8'),
    readFile(new URL('../../public/assets/wildstat/enemies/ion-guardian/guardian.svg', import.meta.url), 'utf8'),
  ]);
  expect(promoted).toBe(reserved);
  for (const kind of new Set(mapSpawnCamps('ion_citadel').flatMap(c => c.types))) {
    expect(enemySpriteAssetSources(ENEMY_SPRITE_LAYOUTS[kind])).toEqual(['assets/wildstat/enemies/ion-guardian/guardian.svg']);
  }
});
