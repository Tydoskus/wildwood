// The server harness first: it swaps the host-only SDK in before any server module loads.
import { scenarioWorld } from "./harness/server";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CAMPAIGN_GATEWAYS, campaignLanding, endlessEntryPortal, exitPortalFor, portalArrival, portalExitPoint, portalUsePoint, PORTAL_EXIT_SPREAD } from "../../shared/map-gateways";
import { generateMap } from "../../shared/procedural-maps";
import { HOME_BENCH_POSITION } from "../../shared/home";
import { TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_DOORS, TOWN_FEET_OFFSET, TOWN_SMITH_POSITION } from "../../shared/town";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../shared/map-editor-overrides";
import { PLAYER_BASE_REGEN, PLAYER_SPAWN, WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";
import { ENEMY_TYPES } from "../../src/game/enemies";
import { mapVisualTheme, savedMapDesign } from "../../src/game/map-design";
import { generatedBossArt, generatedMapContent } from "../../src/game/procedural-maps";
import { createGameBootstrap } from "../../src/game/runtime/game-bootstrap";
import { BOSSES, BOSS_KINDS, bossForMap } from "../../src/game/runtime/boss/boss-registry";
import { regularEnemyAggroRadius } from "../../src/game/runtime/enemies/enemy-simulation";
import { createEnemyLifecycle } from "../../src/game/runtime/enemies/enemy-lifecycle";
import { MAP_ASSET_GROUPS } from "../../src/game/runtime/render/map-asset-groups";
import { parseHexColorOrNull } from "../../src/game/runtime/render/webgl-static-world-layer";
import { createSpawnSites, createWorldLayout, gatewayDecorReach, mapSpawnCamps, type MapId, type SpawnSite } from "../../src/game/world";
import type { EnemyState } from "../../src/game/runtime/types";

/**
 * Every map a player can reach, campaign and Endless, checked from the real
 * map data the client builds: a player arriving or standing in a portal wakes
 * nothing, every portal has a way back, the boss stands alone in its arena,
 * the roads join up and every camp is whole.
 */
const MAPS = CAMPAIGN_MAPS.map(map => map.id as MapId);
const { mapConfig } = createGameBootstrap();
/** Past an elite's 300 aggro with room to spare. */
const ARRIVAL_CLEARANCE = 450;
/** Standing in a portal wakes nothing: its use point keeps this far past every enemy's aggro. */
const PORTAL_AGGRO_MARGIN = 75;
/** No enemy spawns within 900 of a boss; its widest aggro is 775. */
const BOSS_ARENA = 900;
const BOSS_CLEARANCE = BOSS_ARENA + 775;
const EDGE = 150;
/** A portal takes a player within this of its use point (map-controller.ts). */
const PORTAL_TRIGGER = 48;
/** Points across a portal's landing circle: its middle and three rings round it. */
const landingCircle = (exit: { x: number; y: number }) => {
  const middle = portalExitPoint(exit);
  return [middle, ...[1, 2, 3].flatMap(ring => Array.from({ length: 24 }, (_, i) => ({
    x: middle.x + Math.cos(i / 24 * Math.PI * 2) * PORTAL_EXIT_SPREAD * ring / 3,
    y: middle.y + Math.sin(i / 24 * Math.PI * 2) * PORTAL_EXIT_SPREAD * ring / 3 })))];
};
/** Out of `exit` from spots across the way in: every draw inside the circle, and travellers spread over it. */
function expectSpreadLandings(exit: { x: number; y: number }, wayIn: { x: number; y: number }) {
  const middle = portalExitPoint(exit);
  const landings = Array.from({ length: 40 }, (_, i) => portalArrival(exit, { x: wayIn.x - 20 + i % 8 * 5.3, y: wayIn.y - 20 + Math.floor(i / 8) * 9.7 }));
  for (const landing of landings) expect(distance(landing, middle)).toBeLessThanOrEqual(PORTAL_EXIT_SPREAD + 1e-9);
  expect(Math.max(...landings.map(a => Math.max(...landings.map(b => distance(a, b)))))).toBeGreaterThan(PORTAL_EXIT_SPREAD);
}
/** Cloudspire's sky roads have never joined up as shipped: held as they are, so a change either way shows. */
const ROADS_APART = new Set<string>(["cloudspire"]);

const aggroOf = (site: SpawnSite) => regularEnemyAggroRadius({ type: site.type, definition: site.definition ?? ENEMY_TYPES[site.type],
  aggroRadius: (site.definition ?? ENEMY_TYPES[site.type]).aggro ?? 0 } as never);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const portalsOf = (mapId: string) => {
  const config = mapConfig[mapId as MapId] as { portal?: { destination: string } | null; secondaryPortal?: { destination: string } | null };
  return [config.portal, config.secondaryPortal].filter(Boolean) as (typeof CAMPAIGN_GATEWAYS)[string]["portals"];
};
/** Every road joins every other. */
function roadsConnected(mapId: MapId) {
  const { paths } = createWorldLayout(campaignLanding(mapId) ?? { x: 580, y: 770 }, mapId);
  const reachable = new Set([0]);
  for (let pass = 0; pass < paths.length; pass++) paths.forEach((a, i) => {
    if ([...reachable].some(j => { const b = paths[j]; return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y; })) reachable.add(i);
  });
  return paths.length > 0 && reachable.size === paths.length;
}

describe("every campaign map is playable", () => {
  it.each(MAPS.map((mapId, index) => [mapId, index] as const))("%s: portals both ways, safe landings, one boss in a clear arena, whole camps", (mapId, index) => {
    const previous = MAPS[index - 1], next = MAPS[index + 1] ?? "endless_1";
    // Portals: back to the map before, on to the next (Endless after the last), and the next leads back here.
    const destinations = portalsOf(mapId).map(portal => portal.destination);
    expect(destinations).toEqual(previous ? [previous, next] : [next]);
    expect(portalsOf(next).map(portal => portal.destination)).toContain(mapId);

    // One boss, this map's, with its art loading with the map.
    const kinds = BOSS_KINDS.filter(kind => BOSSES[kind].mapId === mapId);
    expect(kinds).toEqual([CAMPAIGN_MAPS[index].bossKind]);
    expect(bossForMap(mapId)?.kind).toBe(kinds[0]);
    expect(MAP_ASSET_GROUPS[mapId].art).toContain(BOSSES[kinds[0]].assetGroup);
    const boss = MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.boss ?? savedMapDesign(mapId)?.gameplay.boss ?? BOSSES[kinds[0]].spawn;

    // Landing and portals: inside the map, off the boss's arena, clear of standing decor and of every enemy's aggro.
    const arrival = mapConfig[mapId].arrival;
    expect(arrival).toEqual(campaignLanding(mapId));
    const spots = [...portalsOf(mapId).map(portal => ({ x: portal.x, y: portal.y - portal.height / 2 })), arrival];
    for (const spot of spots) {
      expect(distance(spot, boss)).toBeGreaterThan(BOSS_CLEARANCE);
      expect(spot.x).toBeGreaterThan(EDGE); expect(spot.x).toBeLessThan(WORLD_WIDTH - EDGE);
      expect(spot.y).toBeGreaterThan(EDGE); expect(spot.y).toBeLessThan(WORLD_HEIGHT - EDGE);
    }
    const standing = createWorldLayout(arrival, mapId).decor.filter(item => !["grass", "petal", "cherryPetal", "desertGrass", "snowTuft", "shell"].includes(item.type));
    for (const item of standing) for (const spot of spots) expect(distance(item, spot), `${item.type} at ${item.x},${item.y}`).toBeGreaterThanOrEqual(gatewayDecorReach(item));
    const sites = createSpawnSites({ x: 0, y: 0 }, mapId);
    // Out of each portal (the way back for travellers from where it leads; the Town's from the first): the whole
    // landing circle inside the map, off the arena, clear of standing decor, every enemy's aggro and every portal.
    expect(exitPortalFor(mapId, portalsOf(mapId), "town", true)).toBe(index === 0 ? null : portalsOf(mapId)[0]);
    for (const exit of portalsOf(mapId)) {
      expectSpreadLandings(exit, portalUsePoint(portalsOf(exit.destination).find(portal => portal.destination === mapId)!));
      for (const point of landingCircle(exit)) {
        const where = `landing out of the ${exit.destination} portal at ${Math.round(point.x)},${Math.round(point.y)}`;
        expect(distance(point, boss), where).toBeGreaterThan(BOSS_CLEARANCE);
        expect(point.x).toBeGreaterThan(EDGE); expect(point.x).toBeLessThan(WORLD_WIDTH - EDGE);
        expect(point.y).toBeGreaterThan(EDGE); expect(point.y).toBeLessThan(WORLD_HEIGHT - EDGE);
        for (const item of standing) expect(distance(item, point), `${where}: ${item.type} at ${item.x},${item.y}`).toBeGreaterThanOrEqual(gatewayDecorReach(item));
        for (const site of sites) expect(distance(site, point), `${where}: ${site.type}`).toBeGreaterThanOrEqual(aggroOf(site) + PORTAL_AGGRO_MARGIN);
        for (const portal of portalsOf(mapId)) expect(distance(point, portalUsePoint(portal)), where).toBeGreaterThan(PORTAL_TRIGGER);
      }
    }
    for (const site of sites) {
      const label = `${site.campName} ${site.type} at ${Math.round(site.x)},${Math.round(site.y)}`;
      expect(distance(site, arrival), label).toBeGreaterThanOrEqual(Math.max(ARRIVAL_CLEARANCE, aggroOf(site) + PORTAL_AGGRO_MARGIN));
      for (const use of portalsOf(mapId).map(portalUsePoint)) expect(distance(site, use), label).toBeGreaterThanOrEqual(aggroOf(site) + PORTAL_AGGRO_MARGIN);
      expect(distance(site, boss), label).toBeGreaterThan(BOSS_ARENA);
      expect(site.x).toBeGreaterThanOrEqual(45); expect(site.x).toBeLessThanOrEqual(WORLD_WIDTH - 45);
      expect(site.y).toBeGreaterThanOrEqual(45); expect(site.y).toBeLessThanOrEqual(WORLD_HEIGHT - 45);
    }

    // Camps: every enemy in its own region, one reward stat a camp, camps apart, art loaded, the same layout every time.
    const camps = mapSpawnCamps(mapId);
    expect(sites).toHaveLength(camps.reduce((sum, camp) => sum + camp.count, 0));
    for (const camp of camps) {
      const mates = sites.filter(site => site.campName === camp.name);
      expect(mates.every(site => distance(site, camp) <= camp.radius * 2.2 + .001), camp.name).toBe(true);
      expect(new Set(mates.map(site => ENEMY_TYPES[site.type].reward.type)).size, camp.name).toBe(1);
    }
    for (const [i, a] of sites.entries()) for (const b of sites.slice(i + 1)) {
      expect(distance(a, b)).toBeGreaterThanOrEqual(a.campName === b.campName ? 70 : 160);
    }
    for (const site of sites) expect(MAP_ASSET_GROUPS[mapId].enemies as readonly string[]).toContain(site.type);
    expect(createSpawnSites({ x: 0, y: 0 }, mapId)).toEqual(sites);
    // The Forest's enemies fight one by one; every later map has exactly one camp that comes as a group.
    const grouped = new Set(sites.filter(site => site.groupAggro).map(site => site.campName));
    expect(grouped.size).toBe(index === 0 ? 0 : 1);

    expect(roadsConnected(mapId), "roads").toBe(!ROADS_APART.has(mapId));
    expect(parseHexColorOrNull(mapVisualTheme(mapId).ground)).not.toBeNull();
  });

  it("starts a new character on the Forest by its easiest enemies, clear of them, with passive recovery", () => {
    const bootstrap = createGameBootstrap();
    expect(bootstrap.startSpawn).toEqual(PLAYER_SPAWN);
    expect(mapConfig.tutorial_forest.arrival).toEqual(PLAYER_SPAWN);
    const sites = createSpawnSites({ x: 0, y: 0 }, "tutorial_forest").sort((a, b) => distance(a, PLAYER_SPAWN) - distance(b, PLAYER_SPAWN));
    expect(distance(sites[0], PLAYER_SPAWN)).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
    expect(new Set(sites.slice(0, 6).map(site => site.type))).toEqual(new Set(["Spitter", "Bramble"]));
    expect(bootstrap.player.regen).toBe(PLAYER_BASE_REGEN);
    expect(PLAYER_BASE_REGEN).toBeGreaterThan(0);
  });
});

describe("every Endless map is playable", () => {
  it.each([1, 2, 3, 10, 40, 100, 235, 300])("endless_%i: portals both ways, safe landing, one species, clear arena and roads", (n) => {
    const id = `endless_${n}` as const;
    const content = generatedMapContent(id);
    const { arrival, boss } = content.map;
    expect(portalsOf(id).map(portal => portal.destination)).toEqual([n === 1 ? MAPS[MAPS.length - 1] : `endless_${n - 1}`, `endless_${n + 1}`]);
    expect(mapConfig[id].arrival).toEqual(arrival);
    for (const site of content.sites) {
      expect(distance(site, arrival)).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
      expect(distance(site, boss)).toBeGreaterThan(BOSS_ARENA);
    }
    // Out of either portal: the whole landing circle clear of the arena, the rocks, every enemy's aggro and both portals.
    for (const exit of portalsOf(id)) {
      expectSpreadLandings(exit, portalUsePoint(portalsOf(exit.destination).find(portal => portal.destination === id)!));
      for (const point of landingCircle(exit)) {
        expect(distance(point, boss)).toBeGreaterThan(BOSS_ARENA);
        for (const rock of content.decor.filter(item => item.type === "rock")) expect(distance(rock, point)).toBeGreaterThanOrEqual(gatewayDecorReach(rock));
        for (const site of content.sites) expect(distance(site, point)).toBeGreaterThanOrEqual(aggroOf(site) + PORTAL_AGGRO_MARGIN);
        for (const portal of portalsOf(id)) expect(distance(point, portalUsePoint(portal))).toBeGreaterThan(PORTAL_TRIGGER);
      }
    }
    // One species, the boss's, on four reward stats; the art for it loads with the map.
    expect(new Set(content.sites.map(site => site.type))).toEqual(new Set([generatedBossArt(id)]));
    expect(new Set(content.sites.map(site => site.definition!.reward.type)).size).toBe(4);
    expect(MAP_ASSET_GROUPS[id].enemies).toEqual(content.kinds);
    // Rocks and grass only, off where enemies stand and off the arena.
    for (const item of content.decor) {
      expect(["rock", "grass"]).toContain(item.type);
      expect(content.sites.every(site => distance(item, site) > 200)).toBe(true);
      expect(distance(item, boss)).toBeGreaterThan(750);
    }
    // Spawned enemies carry the map's own scaled stats and rewards.
    const enemies: EnemyState[] = [];
    const lifecycle = createEnemyLifecycle(enemies, content.sites, () => {});
    content.sites.forEach(lifecycle.spawnFromSite);
    enemies.forEach((enemy, i) => { expect(enemy.maxHp).toBe(content.sites[i].definition!.hp); expect(enemy.reward).toEqual(content.sites[i].definition!.reward); });
    expect(roadsConnected(id as MapId)).toBe(true);
    expect(parseHexColorOrNull(mapVisualTheme(id).ground)).not.toBeNull();
  });
});

describe("the server's travel rules", () => {
  const gate = (mapId: string, destination: string) => CAMPAIGN_GATEWAYS[mapId].portals.find(portal => portal.destination === destination)!;
  const walkInto = (portal: Parameters<typeof portalUsePoint>[0]) => { const use = portalUsePoint(portal); return { x: use.x, y: use.y }; };

  it("a portal takes a player only to a map they have opened, only from beside it, and out of the portal back", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const toDesert = gate("tutorial_forest", "beginner_desert");
    // Not open yet: refused even standing in the portal.
    expect(ann.refusal("changeMap", { mapId: "beginner_desert", ...walkInto(toDesert) })).not.toBeNull();
    ann.patch("playerProgress", { desertUnlocked: true, bossRewardClaims: 1 });
    // Open, but from across the map: refused.
    expect(ann.refusal("changeMap", { mapId: "beginner_desert", x: 1_400, y: 1_400 })).not.toBeNull();
    expect(ann.row("player")!.mapId).toBe("tutorial_forest");
    // From beside it: across, out in front of the Desert's portal back home, at the point the client draws too.
    expect(ann.refusal("changeMap", { mapId: "beginner_desert", ...walkInto(toDesert) })).toBeNull();
    expect(ann.row("player")).toMatchObject({ mapId: "beginner_desert", ...portalArrival(gate("beginner_desert", "tutorial_forest"), walkInto(toDesert)) });
    // Bob, through a step to the side, lands elsewhere in the same circle.
    const bob = world.join("Bob");
    bob.patch("playerProgress", { desertUnlocked: true, bossRewardClaims: 1 });
    const bobIn = { x: walkInto(toDesert).x + 12, y: walkInto(toDesert).y + 5 };
    bob.patch("player", { mapId: "tutorial_forest", ...bobIn });
    expect(bob.refusal("changeMap", { mapId: "beginner_desert", ...bobIn })).toBeNull();
    expect(bob.row("player")).toMatchObject({ mapId: "beginner_desert", ...portalArrival(gate("beginner_desert", "tutorial_forest"), bobIn) });
    expect(bob.row("player")).not.toMatchObject({ x: ann.row("player")!.x, y: ann.row("player")!.y });
    // A map two along is not connected to this one.
    ann.patch("playerProgress", { snowlandsUnlocked: true, lavaUnlocked: true, bossRewardClaims: 7 });
    expect(ann.refusal("changeMap", { mapId: "advanced_lava_wastes", ...walkInto(gate("beginner_desert", "intermediate_snowlands")) })).not.toBeNull();
    // And home again.
    expect(ann.refusal("changeMap", { mapId: "tutorial_forest", ...walkInto(gate("beginner_desert", "tutorial_forest")) })).toBeNull();
    expect(ann.row("player")!.mapId).toBe("tutorial_forest");
  });

  it("Base takes a living player to the Town and Fight brings them back, but never to a map their run has not opened", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    ann.patch("playerProgress", { desertUnlocked: true, bossRewardClaims: 1 });
    ann.patch("player", { mapId: "beginner_desert", x: 1_000, y: 1_200 });
    expect(ann.refusal("changeMap", { mapId: "town", x: 1_000, y: 1_200 })).toBeNull();
    expect(ann.row("player")!.mapId).toBe("town");
    // Fight: back where she left.
    expect(ann.refusal("changeMap", { mapId: "town", x: 0, y: 0 })).toBeNull();
    expect(ann.row("player")).toMatchObject({ mapId: "beginner_desert", x: 1_000, y: 1_200 });
    // Base again; her run is reset meanwhile, so Fight lands on the Forest instead.
    ann.call("changeMap", { mapId: "town", x: 1_000, y: 1_200 });
    ann.patch("playerProgress", { desertUnlocked: false, bossRewardClaims: 0 });
    ann.call("changeMap", { mapId: "town", x: 0, y: 0 });
    expect(ann.row("player")!.mapId).toBe("tutorial_forest");
    // The dead go nowhere.
    ann.patch("player", { hp: 0 });
    expect(ann.refusal("changeMap", { mapId: "town", x: 1_000, y: 1_200 })).not.toBeNull();
    expect(ann.row("player")!.mapId).toBe("tutorial_forest");
  });

  it("Endless opens after the whole campaign's last boss, and each stage after the boss before it", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const into = walkInto(endlessEntryPortal("endless_1"));
    ann.patch("playerProgress", { ionCitadelUnlocked: true, bossRewardClaims: 0 });
    ann.patch("player", { mapId: "ion_citadel", ...into });
    expect(ann.refusal("changeMap", { mapId: "endless_1", ...into })).not.toBeNull();
    ann.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    expect(ann.refusal("changeMap", { mapId: "endless_1", ...into })).toBeNull();
    const stage = generateMap("endless_1");
    expect(ann.row("player")).toMatchObject({ mapId: "endless_1", ...portalArrival(stage.portals.find(portal => portal.destination === "ion_citadel")!, into) });
    // The next stage waits on this stage's boss.
    const onward = stage.portals.find(portal => portal.destination === "endless_2")!;
    expect(ann.refusal("changeMap", { mapId: "endless_2", ...walkInto(onward) })).not.toBeNull();
    world.setup(ctx => { (ctx.db as any).proceduralProgress.insert({ identity: ann.identity, completed: 1 }); });
    expect(ann.refusal("changeMap", { mapId: "endless_2", ...walkInto(onward) })).toBeNull();
    expect(ann.row("player")!.mapId).toBe("endless_2");
  });
});

describe("the Town on the server", () => {
  /** A movement packet: the player stopped here. */
  const stopAt = (ann: ReturnType<ReturnType<typeof scenarioWorld>["join"]>, x: number, y: number) => {
    const sequence = (ann.row("playerMotion")?.lastInputSequence ?? 0) + 1;
    ann.call("updateMovementState", { x, y, vx: 0, vy: 0, simulationTick: sequence, motionEpoch: 0, sequence });
  };

  it("a door lets a player in once they could have walked to it, and back out; a door too far, or a well, puts them on the square", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    ann.call("changeMap", { mapId: "town", x: 1_000, y: 1_000 });
    const door = TOWN_DOORS[2];
    stopAt(ann, TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
    // Just stopped on the square, far from it: refused, still on the square.
    expect(ann.refusal("useTownDoor", { door: 2 })).not.toBeNull();
    expect(ann.row("player")).toMatchObject({ x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
    // Time enough to have walked there at base speed: in, then out by the room's doorway.
    world.advance(Math.hypot(door.x - TOWN_ARRIVAL.x, door.enter - TOWN_FEET_OFFSET - TOWN_ARRIVAL.y) / 200 * 1000);
    expect(ann.refusal("useTownDoor", { door: 2 })).toBeNull();
    expect(ann.row("player")).toMatchObject({ x: door.inside.x, y: door.inside.y });
    // Another house's door from inside this room is out of reach.
    expect(ann.refusal("useTownDoor", { door: 0 })).not.toBeNull();
    expect(ann.refusal("useTownDoor", { door: 2 })).toBeNull();
    expect(ann.row("player")).toMatchObject({ x: door.outside.x, y: door.outside.y });
    // Down the well: back on the square.
    ann.call("fallIntoWell", {});
    expect(ann.row("player")).toMatchObject({ x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
    // Off the Town there are no doors.
    ann.call("changeMap", { mapId: "town", x: 0, y: 0 });
    expect(ann.refusal("useTownDoor", { door: 0 })).not.toBeNull();
  });

  it("a Slot Upgrade starts at the smithy's bench or at the Smith, where the player stands, and not at Home's old bench", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const start = () => ann.refusal("startItemUpgrade", { slot: 1, itemId: "HAND" });
    ann.patch("player", { mapId: "town", x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y });
    expect(start()).not.toBeNull();
    ann.patch("player", { mapId: "town", x: TOWN_SMITH_POSITION.x + 400, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
    expect(start()).not.toBeNull();
    ann.patch("player", { mapId: "town", x: TOWN_BENCH_POSITION.x, y: TOWN_BENCH_POSITION.y });
    expect(start()).toBeNull();
    expect(ann.row("activeItemUpgrade")).toMatchObject({ itemId: "HAND", targetLevel: 1 });
  });
});
