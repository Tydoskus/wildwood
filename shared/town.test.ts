import { expect, it } from "vitest";
import {
  inTownInteriors, inTownVillage, TOWN_ARRIVAL, TOWN_CENTER, TOWN_DOORS, TOWN_INTERIOR_MARGIN, TOWN_SOUL_PORTAL, TOWN_TRAVEL_PORTAL, TOWN_WALK_AREA,
  TOWN_WORLD, townChunkInWorld, townChunkOf, townChunkProps, townWindowChunks,
} from "./town";

it("builds the same countryside on every client, and none in the village or round its rooms", () => {
  for (const { cx, cy } of townWindowChunks(TOWN_CENTER.x, TOWN_CENTER.y)) {
    expect(townChunkProps(cx, cy)).toEqual(townChunkProps(cx, cy));
    for (const prop of townChunkProps(cx, cy)) {
      expect(inTownVillage(prop.x, prop.y)).toBe(false);
      expect(inTownInteriors(prop.x, prop.y, TOWN_INTERIOR_MARGIN)).toBe(false);
    }
  }
  // Out past what anyone inside the walls could see, nothing.
  expect(townChunkInWorld(townChunkOf(TOWN_WORLD.width - 10), townChunkOf(TOWN_CENTER.y))).toBe(false);
});

it("has its portals on the village's roads, inside the walls, and its rooms far from them", () => {
  for (const portal of [TOWN_TRAVEL_PORTAL, TOWN_SOUL_PORTAL, TOWN_ARRIVAL]) {
    expect(portal.x).toBeGreaterThan(TOWN_WALK_AREA.left);
    expect(portal.x).toBeLessThan(TOWN_WALK_AREA.right);
    expect(portal.y).toBeGreaterThan(TOWN_WALK_AREA.top);
    expect(portal.y).toBeLessThan(TOWN_WALK_AREA.bottom);
  }
  expect(TOWN_TRAVEL_PORTAL.y).toBeLessThan(TOWN_CENTER.y);
  expect(TOWN_SOUL_PORTAL.y).toBeGreaterThan(TOWN_CENTER.y);
  for (const door of TOWN_DOORS) expect(door.room.top - TOWN_WALK_AREA.bottom).toBeGreaterThan(3_000);
});
