import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_BENCH_POSITION, HOME_TRAVEL_PORTAL } from "../../shared/home";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../../shared/legal";
import { TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_DOORS, TOWN_TRAVEL_PORTAL, TOWN_WALK_AREA, TOWN_WORLD } from "../../shared/town";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const portalSpot = (portal: { x: number; y: number; height: number }) => ({ x: portal.x, y: portal.y - portal.height * .32 });
const me = (f: ReturnType<typeof crystalFixture>) => f.db.player.identity.find(f.ctx.sender);

it("fits inside its world, rooms and all", () => {
  expect(TOWN_WALK_AREA.left).toBeGreaterThan(0);
  expect(TOWN_WALK_AREA.top).toBeGreaterThan(0);
  for (const door of TOWN_DOORS) {
    expect(door.room.right).toBeLessThan(TOWN_WORLD.width);
    expect(door.room.bottom).toBeLessThan(TOWN_WORLD.height);
  }
});

it("is reached from Home's pad, and its travel portal reaches the maps", () => {
  const f = crystalFixture();
  const pad = portalSpot(HOME_TRAVEL_PORTAL);
  f.patch("player", { mapId: "home_exterior", ...pad });
  f.run(server.changeMap, { mapId: "town", ...pad });
  expect(me(f)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  const travel = portalSpot(TOWN_TRAVEL_PORTAL);
  expect(() => f.run(server.changeMap, { mapId: "tutorial_forest", ...TOWN_ARRIVAL })).toThrow(/closer/);
  f.patch("player", travel);
  f.run(server.changeMap, { mapId: "tutorial_forest", ...travel });
  expect(me(f).mapId).toBe("tutorial_forest");
});

// A player fighting on Crystal Hollows has opened it.
const opened = () => { const f = crystalFixture(); f.patch("playerProgress", { crystalHollowsUnlocked: true }); return f; };

it("is where Base goes from any map, keeping that spot for Fight, which takes the player back", () => {
  const f = opened();
  f.run(server.changeMap, { mapId: "town", x: 4050, y: 4060 });
  expect(me(f)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender)).toMatchObject({ mapId: "crystal_hollows", x: 4050, y: 4060 });
  expect(f.db.playerLastLocation.identity.find(f.ctx.sender)?.mapId).toBe("town");
  // Fight: the same request from inside the Town (a room too) goes back, and never keeps the Town.
  f.patch("player", { x: TOWN_DOORS[3].inside.x, y: TOWN_DOORS[3].inside.y });
  f.run(server.changeMap, { mapId: "town", x: TOWN_DOORS[3].inside.x, y: TOWN_DOORS[3].inside.y });
  expect(me(f)).toMatchObject({ mapId: "crystal_hollows", x: 4050, y: 4060 });
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
});

it("never Fights a player back to a map their run has not opened", () => {
  const f = crystalFixture();
  f.run(server.changeMap, { mapId: "town", x: 4050, y: 4060 });
  f.run(server.changeMap, { mapId: "town", ...TOWN_ARRIVAL });
  expect(me(f).mapId).toBe("tutorial_forest");
});

it("answers Home's retired request as the Town's, and refuses Base to the dead", () => {
  const f = opened();
  f.run(server.changeMap, { mapId: "home_exterior", x: 4050, y: 4050 });
  expect(me(f)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  f.run(server.changeMap, { mapId: "home_exterior", ...TOWN_ARRIVAL });
  expect(me(f).mapId).toBe("crystal_hollows");
  f.patch("player", { hp: 0 });
  expect(() => f.run(server.changeMap, { mapId: "town", x: 4050, y: 4050 })).toThrow(/Respawn/);
});

it("keeps the Upgrade Bench in the Town's smithy, not at Home's old spot", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "home_exterior", x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y });
  expect(() => f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" })).toThrow(/Upgrade Bench/);
  f.patch("player", { mapId: "town", x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y });
  expect(() => f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" })).toThrow(/Upgrade Bench/);
  f.patch("player", { mapId: "town", x: TOWN_BENCH_POSITION.x, y: TOWN_BENCH_POSITION.y });
  f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  expect(f.db.activeItemUpgrade.identity.find(f.ctx.sender)).toBeTruthy();
});

it("brings a player saved at Home into the Town's square, online or not", () => {
  const f = crystalFixture();
  f.run(server.acceptTerms, { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
  f.patch("player", { mapId: "home_exterior", x: 500, y: 600 });
  f.run(server.enterWorldWithTutorial, { forceTakeover: true, tabId: "home-player-row" });
  expect(me(f)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  const g = crystalFixture();
  g.run(server.acceptTerms, { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
  g.db.player.identity.delete(g.ctx.sender);
  g.seed("playerLastLocation", { identity: g.ctx.sender, mapId: "home_exterior", x: 500, y: 600, facing: 1 });
  g.run(server.enterWorldWithTutorial, { forceTakeover: true, tabId: "home-saved-location" });
  expect(me(g)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
});

it("takes a player through a door into its room, and back out the room's doorway", () => {
  const f = crystalFixture();
  const door = TOWN_DOORS[2];
  f.patch("player", { mapId: "town", x: door.outside.x, y: door.outside.y });
  f.run(server.useTownDoor, { door: 2 });
  expect([me(f).x, me(f).y]).toEqual([door.inside.x, door.inside.y]);
  f.run(server.useTownDoor, { door: 2 });
  expect([me(f).x, me(f).y]).toEqual([door.outside.x, door.outside.y]);
});

it("refuses a door the player is nowhere near, another house's door from inside a room, and doors off the Town", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  expect(() => f.run(server.useTownDoor, { door: 0 })).toThrow(/too far/);
  f.patch("player", { x: TOWN_DOORS[1].inside.x, y: TOWN_DOORS[1].inside.y });
  expect(() => f.run(server.useTownDoor, { door: 0 })).toThrow(/too far/);
  expect(() => f.run(server.useTownDoor, { door: 99 })).toThrow(/too far/);
  f.patch("player", { mapId: "crystal_hollows" });
  expect(() => f.run(server.useTownDoor, { door: 0 })).toThrow(/no door/);
  expect(() => f.run(server.fallIntoWell, {})).toThrow(/no well/);
});

it("puts a well's faller back on the square", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "town", x: TOWN_ARRIVAL.x + 300, y: TOWN_ARRIVAL.y + 300 });
  f.run(server.fallIntoWell, {});
  expect([me(f).x, me(f).y]).toEqual([TOWN_ARRIVAL.x, TOWN_ARRIVAL.y]);
});
