import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import {
  CAMPAIGN_GATEWAYS, endlessEntryPortal, GATEWAY_ARRIVAL_DROP, GATEWAY_POINT_NUDGES, GATEWAY_PORTAL_SPACING, gatewayPoint,
  LEGACY_CORNER_GATEWAYS, MAP_MIDDLE, middleGateways, portalUsePoint, type MapGatewayPortal,
} from "../../shared/map-gateways";
import { SOUL_ARRIVAL, SOUL_TOWN_PORTAL } from "../../shared/soul-dimension";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../shared/map-editor-overrides";
import { PLAYER_SPAWN, TUTORIAL_FOREST_MAP_ID, WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";
import { ENEMY_TYPES } from "./enemies";
import { BOSSES } from "./runtime/boss-registry";
import { regularEnemyAggroRadius } from "./runtime/enemy-simulation";
import { createSpawnSites, createWorldLayout, gatewayDecorReach, type MapId } from "./world";

/**
 * Every campaign map's portals stand in its middle (0.901.15), or at the
 * nearest spot clear of its enemies where they reach the middle. A camp, boss
 * or layout change that crowds them fails here, on the map it crowds.
 */
const MAPS = CAMPAIGN_MAPS.map(map => map.id as MapId);
const LAST_MAP = MAPS[MAPS.length - 1];
/** world.test.ts's arrival clearance: past an elite's 300 aggro with room to spare. */
const ARRIVAL_ENEMY_CLEARANCE = 450;
/** Standing in a portal wakes nothing: its use point keeps this far past every enemy's aggro. */
const PORTAL_AGGRO_MARGIN = 75;
/** Past the boss's arena (no enemy spawns within 900 of it) and its widest aggro (775). */
const BOSS_CLEARANCE = 900 + 775;
/** A portal's gate fits inside the map with a player's width to spare either side. */
const EDGE_CLEARANCE = 150;

const aggroOf = (type: keyof typeof ENEMY_TYPES) =>
  regularEnemyAggroRadius({ type, definition: ENEMY_TYPES[type], aggroRadius: ENEMY_TYPES[type].aggro ?? 0 } as never);
const portalsOf = (mapId: MapId): MapGatewayPortal[] =>
  [...CAMPAIGN_GATEWAYS[mapId].portals, ...(mapId === LAST_MAP ? [endlessEntryPortal("endless_1")] : [])];
const bossOf = (mapId: MapId) => {
  const boss = Object.values(BOSSES).find(entry => entry.mapId === mapId);
  return MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.boss ?? boss?.spawn;
};
/** Do these gateways clear every enemy on the map by the rules above? */
function clearOfEnemies(mapId: MapId, gateways: { arrival: { x: number; y: number }; portals: MapGatewayPortal[] }, aggro = aggroOf) {
  const sites = createSpawnSites({ x: 0, y: 0 }, mapId);
  return sites.every(site => Math.hypot(site.x - gateways.arrival.x, site.y - gateways.arrival.y) >= Math.max(ARRIVAL_ENEMY_CLEARANCE, aggro(site.type) + PORTAL_AGGRO_MARGIN)
    && gateways.portals.map(portalUsePoint).every(use => Math.hypot(site.x - use.x, site.y - use.y) >= aggro(site.type) + PORTAL_AGGRO_MARGIN));
}

describe("campaign portals stand in the middle of their maps (0.901.15)", () => {
  it.each(MAPS)("lays %s's portals out side by side, back on the left, the arrival just below between them", (mapId) => {
    const index = MAPS.indexOf(mapId);
    const point = gatewayPoint(mapId);
    const expected = middleGateways(point, MAPS[index - 1] ?? null, MAPS[index + 1] ?? (mapId === LAST_MAP ? "endless_1" : null));
    // The map editor's forest and desert too: shared/map-designs.json holds the same layout.
    expect({ arrival: CAMPAIGN_GATEWAYS[mapId].arrival, portals: portalsOf(mapId) }).toEqual(expected);
    if (expected.portals.length === 2) {
      expect(expected.portals[1].x - expected.portals[0].x).toBe(GATEWAY_PORTAL_SPACING);
      expect(expected.portals.map(portal => portal.destination)[0]).toBe(MAPS[index - 1]);
    }
    expect(expected.arrival).toEqual({ x: point.x, y: point.y + GATEWAY_ARRIVAL_DROP });
  });

  it.each(MAPS)("keeps %s's portals and arrival clear of every enemy's aggro", (mapId) => {
    const sites = createSpawnSites({ x: 0, y: 0 }, mapId);
    const { arrival } = CAMPAIGN_GATEWAYS[mapId];
    for (const site of sites) {
      const label = `${mapId}: ${site.campName} ${site.type} at ${Math.round(site.x)},${Math.round(site.y)}`;
      expect(Math.hypot(site.x - arrival.x, site.y - arrival.y), label).toBeGreaterThanOrEqual(Math.max(ARRIVAL_ENEMY_CLEARANCE, aggroOf(site.type) + PORTAL_AGGRO_MARGIN));
      for (const use of portalsOf(mapId).map(portalUsePoint)) {
        expect(Math.hypot(site.x - use.x, site.y - use.y), `${label}, portal to ${use.destination}`).toBeGreaterThanOrEqual(aggroOf(site.type) + PORTAL_AGGRO_MARGIN);
      }
    }
  });

  it.each(MAPS)("keeps %s's portals off its boss's arena, inside the map and clear of standing decor", (mapId) => {
    const boss = bossOf(mapId);
    expect(boss, `${mapId} has a boss`).toBeTruthy();
    const { arrival } = CAMPAIGN_GATEWAYS[mapId];
    const spots = [...portalsOf(mapId).map(portal => ({ x: portal.x, y: portal.y - portal.height / 2 })), arrival];
    for (const spot of spots) {
      expect(Math.hypot(spot.x - boss!.x, spot.y - boss!.y)).toBeGreaterThan(BOSS_CLEARANCE);
      expect(spot.x).toBeGreaterThan(EDGE_CLEARANCE); expect(spot.x).toBeLessThan(WORLD_WIDTH - EDGE_CLEARANCE);
      expect(spot.y).toBeGreaterThan(EDGE_CLEARANCE); expect(spot.y).toBeLessThan(WORLD_HEIGHT - EDGE_CLEARANCE);
    }
    // Trees, rocks, lava pools, coral and the rest are lifted from around the portals (world.ts clearOfGateways).
    const standing = createWorldLayout(arrival, mapId).decor.filter(item => !["grass", "petal", "cherryPetal", "desertGrass", "snowTuft", "shell"].includes(item.type));
    for (const item of standing) for (const spot of spots) {
      expect(Math.hypot(item.x - spot.x, item.y - spot.y), `${mapId}: ${item.type} at ${item.x},${item.y}`).toBeGreaterThanOrEqual(gatewayDecorReach(item));
    }
  });

  it("nudges only maps whose middle is crowded, and each to a spot near it", () => {
    for (const mapId of MAPS) {
      const index = MAPS.indexOf(mapId);
      const atMiddle = middleGateways(MAP_MIDDLE, MAPS[index - 1] ?? null, MAPS[index + 1] ?? (mapId === LAST_MAP ? "endless_1" : null));
      expect(clearOfEnemies(mapId, atMiddle), mapId).toBe(!(mapId in GATEWAY_POINT_NUDGES));
    }
    for (const nudge of Object.values(GATEWAY_POINT_NUDGES)) expect(Math.hypot(nudge.x - MAP_MIDDLE.x, nudge.y - MAP_MIDDLE.y)).toBeLessThan(500);
  });

  it("starts new characters where they always did, clear of every forest enemy", () => {
    expect(PLAYER_SPAWN).toEqual({ x: 1025, y: 850 });
    expect(createSpawnSites({ x: 0, y: 0 }, TUTORIAL_FOREST_MAP_ID).every(site => Math.hypot(site.x - PLAYER_SPAWN.x, site.y - PLAYER_SPAWN.y) >= ARRIVAL_ENEMY_CLEARANCE)).toBe(true);
  });

  it("lands Soul Dimension travellers by the forest's portal, clear of a soul enemy of any species", () => {
    expect(SOUL_ARRIVAL).toEqual(CAMPAIGN_GATEWAYS[TUTORIAL_FOREST_MAP_ID].arrival);
    expect({ x: SOUL_TOWN_PORTAL.x, y: SOUL_TOWN_PORTAL.y }).toEqual({ x: CAMPAIGN_GATEWAYS[TUTORIAL_FOREST_MAP_ID].portals[0].x, y: CAMPAIGN_GATEWAYS[TUTORIAL_FOREST_MAP_ID].portals[0].y });
    // Soul enemies stand where the forest's do, and may be any forest species, a 300-aggro elite included.
    expect(clearOfEnemies(TUTORIAL_FOREST_MAP_ID, { arrival: SOUL_ARRIVAL, portals: [{ ...SOUL_TOWN_PORTAL }] }, () => 300)).toBe(true);
  });

  it("keeps the old corner portals (still taken by older tabs) well apart from the new ones, so the server never mistakes one for the other", () => {
    for (const mapId of MAPS) {
      const legacy = LEGACY_CORNER_GATEWAYS[mapId];
      expect(legacy.portals.map(portal => portal.destination).sort()).toEqual(CAMPAIGN_GATEWAYS[mapId].portals.map(portal => portal.destination).sort());
      for (const old of legacy.portals.map(portalUsePoint)) for (const now of portalsOf(mapId).map(portalUsePoint)) {
        expect(Math.hypot(old.x - now.x, old.y - now.y)).toBeGreaterThan(125 * 2);
      }
    }
  });
});
