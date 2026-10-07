import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_BENCH_POSITION, HOME_TRAVEL_PORTAL } from "../../shared/home";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../../shared/legal";
import { TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_CENTER, TOWN_DOORS, TOWN_FEET_OFFSET, TOWN_SOUL_PORTAL, TOWN_TRAVEL_PORTAL, TOWN_WALK_AREA, TOWN_WORLD } from "../../shared/town";
import { DOOR_POSITION_TOLERANCE } from "./door-reach";
import { MOVEMENT_POSITION_PACKET_TOLERANCE } from "./presence-runtime";
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

// Movement packets are sparse: with multiplayer off, a walk to a door sends nothing, so the server still has the
// player where they last stopped (0.900.0–0.900.2 refused hundreds of honest trips an hour from that).
const moveTo = (f: ReturnType<typeof crystalFixture>, x: number, y: number) => {
  const sequence = (f.db.playerMotion.identity.find(f.ctx.sender)?.lastInputSequence ?? 0) + 1;
  f.run(server.updateMovementState, { x, y, vx: 0, vy: 0, simulationTick: sequence, motionEpoch: 0, sequence });
};
const wait = (f: ReturnType<typeof crystalFixture>, seconds: number) => {
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(Math.round(seconds * 1_000_000)));
};

it("lets a player through a door they could have walked to since their last movement packet, and no further", () => {
  const f = crystalFixture();
  const door = TOWN_DOORS[2];
  f.patch("player", { mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  moveTo(f, TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
  const walk = Math.hypot(door.x - TOWN_ARRIVAL.x, door.enter - TOWN_FEET_OFFSET - TOWN_ARRIVAL.y);
  expect(walk).toBeGreaterThan(400);
  // Just stopped on the square: the door is too far to have reached.
  expect(() => f.run(server.useTownDoor, { door: 2 })).toThrow(/too far/);
  // Long enough later to have walked there (base speed, with the slack a packet gets), it opens.
  wait(f, walk / 200);
  f.run(server.useTownDoor, { door: 2 });
  expect([me(f).x, me(f).y]).toEqual([door.inside.x, door.inside.y]);
  // And straight back out from the room's doorway, where the trip put them.
  f.run(server.useTownDoor, { door: 2 });
  expect([me(f).x, me(f).y]).toEqual([door.outside.x, door.outside.y]);
  expect(DOOR_POSITION_TOLERANCE).toBe(MOVEMENT_POSITION_PACKET_TOLERANCE);
});

it("takes the halt a client sends at the door as where the player is, as the client now does before every trip", () => {
  const f = crystalFixture();
  const door = TOWN_DOORS[4];
  f.patch("player", { mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  moveTo(f, TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
  wait(f, 30);
  moveTo(f, door.x, door.enter - TOWN_FEET_OFFSET - 10);
  f.run(server.useTownDoor, { door: 4 });
  expect([me(f).x, me(f).y]).toEqual([door.inside.x, door.inside.y]);
});

it("still sends a tab from before 0.900.2 on from where its Town portals used to stand, but not from just anywhere", () => {
  const f = crystalFixture();
  const old = { x: TOWN_CENTER.x - 1_225, y: TOWN_CENTER.y - 1_215 - TOWN_TRAVEL_PORTAL.height * .32 };
  f.patch("player", { mapId: "town", ...old });
  f.run(server.changeMap, { mapId: "tutorial_forest", ...old });
  expect(me(f).mapId).toBe("tutorial_forest");
  const g = crystalFixture();
  const between = { x: old.x + 300, y: old.y + 300 };
  g.patch("player", { mapId: "town", ...between });
  expect(() => g.run(server.changeMap, { mapId: "tutorial_forest", ...between })).toThrow(/closer/);
  // The Soul Dimension's old spot is taken too, by the same rule (its own gate decides who may go in).
  const oldSoul = { x: TOWN_CENTER.x - 610, y: TOWN_CENTER.y + 1_880 - TOWN_SOUL_PORTAL.height * .32 };
  const h = crystalFixture();
  h.patch("player", { mapId: "town", ...oldSoul });
  expect(() => h.run(server.changeMap, { mapId: "soul_dimension", ...oldSoul })).not.toThrow(/closer/);
});

it("lets a player use the bench they walked up to after coming in, though the server last heard of them at the doorway", () => {
  const f = crystalFixture();
  const smithy = TOWN_DOORS[TOWN_BENCH_POSITION.door];
  // Standing on the square, just heard of: the bench in the smithy is far out of reach.
  f.patch("player", { mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  moveTo(f, TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
  expect(() => f.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" })).toThrow(/Upgrade Bench/);
  // In through the smithy's door: the server's position is its doorway, the player walks on to the bench.
  const g = crystalFixture();
  g.patch("player", { mapId: "town", x: smithy.outside.x, y: smithy.outside.y });
  moveTo(g, smithy.outside.x, smithy.outside.y);
  g.run(server.useTownDoor, { door: TOWN_BENCH_POSITION.door });
  expect([me(g).x, me(g).y]).toEqual([smithy.inside.x, smithy.inside.y]);
  wait(g, 1);
  g.run(server.startItemUpgrade, { slot: 1, itemId: "HAND" });
  expect(g.db.activeItemUpgrade.identity.find(g.ctx.sender)).toBeTruthy();
});
