import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_TRAVEL_PORTAL } from "../../shared/home";
import { TOWN_ARRIVAL, TOWN_DOORS, TOWN_TRAVEL_PORTAL, TOWN_WALK_AREA, TOWN_WORLD } from "../../shared/town";
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

it("does not keep the Town as where Home's Fight returns to", () => {
  const f = crystalFixture();
  f.run(server.changeMap, { mapId: "home_exterior", x: 4050, y: 4050 });
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  f.patch("player", { mapId: "town", ...TOWN_ARRIVAL });
  f.run(server.changeMap, { mapId: "home_exterior", ...TOWN_ARRIVAL });
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
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
