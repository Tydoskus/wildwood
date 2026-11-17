import { COOK_FIRES } from "../../shared/cooking";
import { describe, expect, it, vi } from "vitest";
vi.mock("../app/developer", () => ({ isDeveloperIdentity: () => false }));
import { HOME_BENCH_POSITION, HOME_QUEST_BOARD_POSITION, HOME_RESEARCH_POSITION } from "../../shared/home";
import { MINING_TRACK, miningTrackDistanceSquared } from "../../shared/mining";
import { TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_CARD_SELLER_POSITION, TOWN_CARD_SELLER_REACH, TOWN_CARD_SELLER_SERVER_REACH, TOWN_CARD_SELLER_STALL, TOWN_CENTER, TOWN_DOORS, TOWN_EAST_BRIDGE, TOWN_EAST_BRIDGE_APPROACHES, TOWN_EAST_FENCE_GAP, TOWN_EAST_FENCE_GAP_OUTSIDE, TOWN_FEET_OFFSET, TOWN_OX_POSITION, TOWN_QUEST_BOARD_POSITION, TOWN_RESEARCH_POSITION, TOWN_SCHOOL_POSITIONS, TOWN_SCHOOL_REACH, TOWN_SMITH_POSITION, TOWN_SMITH_REACH, TOWN_SMITH_SERVER_REACH, TOWN_TRAVEL_PORTAL, inTownVillage, townRoomAt } from "../../shared/town";
import { TOWN_VILLAGE_DECOR } from "./town-village";
import { TOWN_FURNISHED_INTERIOR, TOWN_HILLS_SIGNPOST, TOWN_SCHOOL_SIGNPOSTS, TOWN_SIGNPOST, townWindowDecor } from "./town-world";
import { SCHOOL_DETAILS, WEAPON_SCHOOLS } from "../../shared/weapon-mastery";
import { SLOT_UPGRADES_POSITION } from "./world";
import { pushOutOf, TOWN_SOLIDS } from "./runtime/town/town-runtime";
import { createHomeStationTouchHandler } from "../ui/game-ui-runtime";
import { playerTouchesSlotUpgrades } from "../ui/slot-upgrades-controller";
import { MAP_ASSET_GROUPS } from "./runtime/render/map-asset-groups";
import { soulFrame } from "./runtime/soul/soul-prop-renderer";

// Several tests walk a whole route through the Town step by step: seconds each, more on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const STATIONS = [
  { label: "Slot Upgrades", at: TOWN_BENCH_POSITION, door: 6 },
  { label: "Tech Research", at: TOWN_RESEARCH_POSITION, door: 1 },
  { label: "Quest Board", at: TOWN_QUEST_BOARD_POSITION, door: 5 },
] as const;
/** Where a player stands to use each station: on the floor in front of it. */
const SPOTS = { "Slot Upgrades": { dx: 0, dy: -35 }, "Tech Research": { dx: 0, dy: -25 }, "Quest Board": { dx: 0, dy: -14 } } as const;

/** The stations and people drawn in the decor window around a point, by label. */
const stationLabels = (at: { x: number; y: number }) => townWindowDecor(at.x, at.y).flatMap(item => (item.type === "station" ? [item.label] : []));

const FEET_RADIUS = 12;
/** Whether a player standing here is clear of every wall and piece of furniture (as the Town furnishes its rooms). */
function standable(x: number, y: number) {
  const feet = { x, y: y + TOWN_FEET_OFFSET, r: FEET_RADIUS };
  return TOWN_SOLIDS.every(solid => {
    const probe = { ...feet };
    pushOutOf(probe, solid);
    return Math.hypot(probe.x - feet.x, probe.y - feet.y) < .01;
  });
}
/** Walks a coarse grid from the room's doorway: can a player get from it to the spot? */
function reachable(door: number, to: { x: number; y: number }) {
  const { room, inside } = TOWN_DOORS[door];
  const step = 6, key = (x: number, y: number) => `${x},${y}`;
  const start = { x: inside.x, y: inside.y }, seen = new Set([key(start.x, start.y)]), queue = [start];
  while (queue.length) {
    const at = queue.shift()!;
    if (Math.hypot(at.x - to.x, at.y - to.y) <= step) return true;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const x = at.x + dx, y = at.y + dy;
      if (seen.has(key(x, y)) || x < room.left || x > room.right || y < room.top - TOWN_FEET_OFFSET || y > room.bottom) continue;
      seen.add(key(x, y));
      if (standable(x, y)) queue.push({ x, y });
    }
  }
  return false;
}

describe("Home's stations in the Town's buildings", () => {
  it("stands each station in its room, drawn with the room's furniture", () => {
    for (const { label, at, door } of STATIONS) {
      expect(townRoomAt(at.x, at.y)).toBe(TOWN_DOORS[door]);
      const decor = townWindowDecor(at.x, at.y);
      expect(decor).toContainEqual(expect.objectContaining({ type: "station", x: at.x, y: at.y, label }));
    }
    // Out in the village, the rooms' stations are not in the window: only the Smith and the market's sellers, outdoors.
    expect(stationLabels(TOWN_ARRIVAL)).toEqual([...COOK_FIRES.map(() => "Cooking Fire"), "Smith", "Card Seller", "Weapon Seller", "Armor Seller", "Trade Chrysanthemum"]);
  });
  it("takes the place of one piece of furniture each, and overlaps no other", () => {
    const decor = townWindowDecor(TOWN_BENCH_POSITION.x, TOWN_BENCH_POSITION.y);
    const interior = decor.filter(item => item.type === "soulProp");
    expect(TOWN_FURNISHED_INTERIOR.length - interior.length).toBe(6); // three props and their three shadows
    for (const { at } of STATIONS) {
      // No remaining standing furniture within the station's footprint (about 180 wide, against the back wall).
      const crowding = interior.filter(item => item.type === "soulProp" && !item.shadow && Math.abs(item.x - at.x) < 90 && item.y > at.y - 40 && item.y < at.y + 20);
      expect(crowding).toEqual([]);
    }
  });
  it("lets a player walk in from the door and open each station from in front of it", () => {
    const openResearch = vi.fn(), openBoard = vi.fn(), updateSlotUpgrades = vi.fn();
    const player = { x: 0, y: 0 };
    let inTown = true;
    const touch = createHomeStationTouchHandler(() => inTown, player, openResearch, updateSlotUpgrades, openBoard);
    for (const { label, at, door } of STATIONS) {
      const spot = { x: at.x + SPOTS[label].dx, y: at.y + SPOTS[label].dy };
      expect(standable(spot.x, spot.y)).toBe(true);
      expect(reachable(door, spot)).toBe(true);
      Object.assign(player, spot);
      touch();
      if (label === "Slot Upgrades") {
        expect(playerTouchesSlotUpgrades(player, SLOT_UPGRADES_POSITION)).toBe(true);
        // Inside the server's reach check (75 from the station's point).
        expect(Math.hypot(player.x - TOWN_BENCH_POSITION.x, player.y - TOWN_BENCH_POSITION.y)).toBeLessThan(75);
      }
      player.x = TOWN_DOORS[door].inside.x; player.y = TOWN_DOORS[door].inside.y; touch();
    }
    expect(openResearch).toHaveBeenCalledOnce();
    expect(openBoard).toHaveBeenCalledOnce();
    // The furniture each station replaced keeps its collider, as the station's: no walking through the workbench.
    expect(standable(TOWN_BENCH_POSITION.x, TOWN_BENCH_POSITION.y - 25 - TOWN_FEET_OFFSET)).toBe(false);
    expect(reachable(6, { x: TOWN_BENCH_POSITION.x, y: TOWN_BENCH_POSITION.y - 25 - TOWN_FEET_OFFSET })).toBe(false);
    expect(SLOT_UPGRADES_POSITION).toBe(TOWN_BENCH_POSITION);
    // Home's old spots open nothing, in the Town or anywhere else.
    for (const at of [HOME_RESEARCH_POSITION, HOME_QUEST_BOARD_POSITION]) { player.x = at.x; player.y = at.y - 30; touch(); }
    inTown = false;
    player.x = TOWN_RESEARCH_POSITION.x; player.y = TOWN_RESEARCH_POSITION.y - 25; touch();
    expect(openResearch).toHaveBeenCalledOnce();
    expect(openBoard).toHaveBeenCalledOnce();
    expect(playerTouchesSlotUpgrades({ x: HOME_BENCH_POSITION.x, y: HOME_BENCH_POSITION.y - 36 }, SLOT_UPGRADES_POSITION)).toBe(false);
  });
  it("loads the workbench sprite with the Town's art", () => {
    expect(MAP_ASSET_GROUPS.town.art).toContain("snowDecor");
  });
});

describe("Ox in the bottom-right house", () => {
  it("stands in door 8's room, the village's furthest south-east, on open floor a player can walk to", () => {
    const southEast = [...TOWN_DOORS].sort((a, b) => (b.x + b.y) - (a.x + a.y))[0];
    expect(southEast.index).toBe(8);
    expect(townRoomAt(TOWN_OX_POSITION.x, TOWN_OX_POSITION.y)).toBe(TOWN_DOORS[8]);
    expect(townWindowDecor(TOWN_OX_POSITION.x, TOWN_OX_POSITION.y)).toContainEqual(expect.objectContaining({ type: "station", label: "Ox" }));
    // His feet are on the floor itself, clear of the furniture.
    expect(standable(TOWN_OX_POSITION.x, TOWN_OX_POSITION.y - TOWN_FEET_OFFSET)).toBe(true);
    expect(reachable(8, { x: TOWN_OX_POSITION.x, y: TOWN_OX_POSITION.y - TOWN_FEET_OFFSET })).toBe(true);
  });
  it("opens his shop once as a player walks up, and again only after they step away", () => {
    const openOx = vi.fn(), player = { x: TOWN_DOORS[8].inside.x, y: TOWN_DOORS[8].inside.y };
    let inTown = true;
    const touch = createHomeStationTouchHandler(() => inTown, player, vi.fn(), vi.fn(), vi.fn(), openOx);
    touch();
    expect(openOx).not.toHaveBeenCalled();
    Object.assign(player, { x: TOWN_OX_POSITION.x + 40, y: TOWN_OX_POSITION.y - TOWN_FEET_OFFSET });
    touch(); touch();
    expect(openOx).toHaveBeenCalledOnce();
    Object.assign(player, TOWN_DOORS[8].inside); touch();
    Object.assign(player, { x: TOWN_OX_POSITION.x - 40, y: TOWN_OX_POSITION.y - TOWN_FEET_OFFSET }); touch();
    expect(openOx).toHaveBeenCalledTimes(2);
    inTown = false;
    Object.assign(player, TOWN_DOORS[8].inside); touch();
    Object.assign(player, { x: TOWN_OX_POSITION.x, y: TOWN_OX_POSITION.y - TOWN_FEET_OFFSET }); touch();
    expect(openOx).toHaveBeenCalledTimes(2);
  });
});

describe("the Weapon Mastery schools' buildings", () => {
  it("stands each school in its building's room, its sign on the back wall, the room's furniture all kept", () => {
    for (const school of WEAPON_SCHOOLS) {
      const at = TOWN_SCHOOL_POSITIONS[school], { door, building } = SCHOOL_DETAILS[school];
      expect(at.door).toBe(door);
      expect(townRoomAt(at.x, at.y)).toBe(TOWN_DOORS[door]);
      expect(townWindowDecor(at.x, at.y)).toContainEqual(expect.objectContaining({ type: "station", x: at.x, y: at.y, label: building }));
      // Against the back wall, out of the way of the doorway.
      expect(at.y - TOWN_DOORS[door].room.top).toBeLessThan(80);
    }
    const interior = townWindowDecor(TOWN_BENCH_POSITION.x, TOWN_BENCH_POSITION.y).filter(item => item.type === "soulProp");
    expect(TOWN_FURNISHED_INTERIOR.length - interior.length).toBe(6);
  });
  it("hangs each school's sign on clear wall halfway between two windows, over its spot", () => {
    // The rooms' back-wall windows (village-interiors.webp), every 200 from 100 in, each about 42 wide.
    for (const school of WEAPON_SCHOOLS) {
      const at = TOWN_SCHOOL_POSITIONS[school], { room } = TOWN_DOORS[at.door], x = at.x - room.left;
      expect((x - 100) % 200, school).toBe(100);
      expect(x > 100 && x < room.right - room.left - 100, school).toBe(true);
    }
  });
  it("furnishes each school's room with its own pieces, the pack's furniture moved aside to make room", () => {
    const inRoom = (door: number) => TOWN_FURNISHED_INTERIOR.filter(item => item.type === "soulProp" && townRoomAt(item.x, item.y) === TOWN_DOORS[door]);
    const frames = (door: number) => inRoom(door).map(item => item.type === "soulProp" ? item.frame : "");
    expect(frames(SCHOOL_DETAILS.archery.door)).toEqual(expect.arrayContaining(["103", "104", "105"]));
    expect(frames(SCHOOL_DETAILS.swordplay.door)).toContain("267");
    expect(frames(SCHOOL_DETAILS.sorcery.door)).toEqual(expect.arrayContaining(["RuneStone_01", "46"]));
    // Every frame drawn is in its sheet.
    for (const item of TOWN_FURNISHED_INTERIOR) if (item.type === "soulProp") expect(soulFrame(item.frame, item.sheet === "village" ? "village" : undefined), item.frame).toBeTruthy();
    // Nothing standing on the floor under a school's sign: its spot is open floor.
    for (const school of WEAPON_SCHOOLS) {
      const at = TOWN_SCHOOL_POSITIONS[school];
      expect(standable(at.x, at.y - TOWN_FEET_OFFSET), school).toBe(true);
    }
  });
  it("lets a player walk in from the door to each school's spot, on open floor", () => {
    for (const school of WEAPON_SCHOOLS) {
      const at = TOWN_SCHOOL_POSITIONS[school], stand = { x: at.x, y: at.y - TOWN_FEET_OFFSET };
      expect(standable(stand.x, stand.y), school).toBe(true);
      expect(reachable(at.door, stand), school).toBe(true);
      // The doorway is well out of reach, so coming in opens nothing.
      const inside = TOWN_DOORS[at.door].inside;
      expect(Math.hypot(inside.x - at.x, inside.y + TOWN_FEET_OFFSET - at.y)).toBeGreaterThan(TOWN_SCHOOL_REACH * 2);
    }
  });
  it("opens a school's window once as a player walks up, and again only after they step away", () => {
    const openSchool = vi.fn(), at = TOWN_SCHOOL_POSITIONS.swordplay, inside = TOWN_DOORS[at.door].inside;
    const player = { x: inside.x, y: inside.y };
    let inTown = true;
    const touch = createHomeStationTouchHandler(() => inTown, player, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), openSchool);
    touch();
    expect(openSchool).not.toHaveBeenCalled();
    Object.assign(player, { x: at.x + 20, y: at.y - TOWN_FEET_OFFSET + 20 });
    touch(); touch();
    expect(openSchool).toHaveBeenCalledOnce();
    expect(openSchool).toHaveBeenCalledWith("swordplay");
    Object.assign(player, inside); touch();
    Object.assign(player, { x: at.x, y: at.y - TOWN_FEET_OFFSET }); touch();
    expect(openSchool).toHaveBeenCalledTimes(2);
    // Each building opens its own school.
    for (const school of ["archery", "sorcery"] as const) {
      Object.assign(player, TOWN_DOORS[TOWN_SCHOOL_POSITIONS[school].door].inside); touch();
      Object.assign(player, { x: TOWN_SCHOOL_POSITIONS[school].x, y: TOWN_SCHOOL_POSITIONS[school].y - TOWN_FEET_OFFSET }); touch();
    }
    expect(openSchool.mock.calls.map(([school]) => school)).toEqual(["swordplay", "swordplay", "archery", "sorcery"]);
    inTown = false;
    Object.assign(player, inside); touch();
    Object.assign(player, { x: at.x, y: at.y - TOWN_FEET_OFFSET }); touch();
    expect(openSchool).toHaveBeenCalledTimes(4);
  });
  it("names each building from the square with a signpost by its door, on open ground, pointing at it", () => {
    const decor = townWindowDecor(TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
    WEAPON_SCHOOLS.forEach((school, index) => {
      const sign = TOWN_SCHOOL_SIGNPOSTS[index], door = TOWN_DOORS[SCHOOL_DETAILS[school].door];
      expect(decor).toContain(sign);
      expect(sign).toMatchObject({ type: "soulProp", signpost: SCHOOL_DETAILS[school].building });
      expect(inTownVillage(sign.x, sign.y)).toBe(true);
      expect(standable(sign.x, sign.y - TOWN_FEET_OFFSET), school).toBe(true);
      // Beside the door, not in front of it, its plank pointing towards it.
      expect(Math.hypot(sign.x - door.x, sign.y - door.y)).toBeLessThan(200);
      expect(Math.abs(sign.x - door.x)).toBeGreaterThan(door.half);
      expect(sign.type === "soulProp" && Boolean(sign.flip)).toBe(door.x > sign.x);
    });
  });
});

/** Walks a coarse grid across the village from one spot: can a player get within `reach` of another? */
function walkable(from: { x: number; y: number }, to: { x: number; y: number }, reach: number) {
  const step = 8, key = (x: number, y: number) => `${x},${y}`;
  const box = { left: Math.min(from.x, to.x) - 200, right: Math.max(from.x, to.x) + 200, top: Math.min(from.y, to.y) - 200, bottom: Math.max(from.y, to.y) + 200 };
  const start = { x: Math.round(from.x), y: Math.round(from.y) }, seen = new Set([key(start.x, start.y)]), queue = [start];
  while (queue.length) {
    const at = queue.shift()!;
    if (Math.hypot(at.x - to.x, at.y - to.y) <= reach) return true;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const x = at.x + dx, y = at.y + dy;
      if (seen.has(key(x, y)) || x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      seen.add(key(x, y));
      if (standable(x, y)) queue.push({ x, y });
    }
  }
  return false;
}

describe("the Smith at the forge house", () => {
  // Where a player stands when he is in reach: his own spot, the way the player's position is measured.
  const stand = { x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET };
  it("works outdoors in the village, right of the Slot Upgrades station's building, drawn with the village", () => {
    expect(inTownVillage(TOWN_SMITH_POSITION.x, TOWN_SMITH_POSITION.y)).toBe(true);
    expect(townRoomAt(TOWN_SMITH_POSITION.x, TOWN_SMITH_POSITION.y)).toBeNull();
    // The forge house is the next building right of door 6, a little further down the square.
    expect(TOWN_SMITH_POSITION.x - TOWN_DOORS[6].x).toBeGreaterThan(100);
    expect(TOWN_SMITH_POSITION.x - TOWN_DOORS[6].x).toBeLessThan(260);
    expect(townWindowDecor(TOWN_SMITH_POSITION.x, TOWN_SMITH_POSITION.y)).toContainEqual(expect.objectContaining({ type: "station", label: "Smith" }));
    expect(stationLabels(TOWN_BENCH_POSITION)).not.toContain("Smith");
  });
  it("stands on open ground a player can walk to from where everyone lands", () => {
    expect(standable(stand.x, stand.y)).toBe(true);
    expect(walkable(TOWN_ARRIVAL, stand, TOWN_SMITH_REACH * .8)).toBe(true);
  });
  it("opens his window once as a player walks up, again only after they step away, and the server agrees they are in reach", () => {
    const openSmith = vi.fn(), player = { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y };
    let inTown = true;
    const touch = createHomeStationTouchHandler(() => inTown, player, vi.fn(), vi.fn(), vi.fn(), vi.fn(), openSmith);
    touch();
    expect(openSmith).not.toHaveBeenCalled();
    // In from the road on his left, as the yard is entered.
    Object.assign(player, { x: stand.x - 50, y: stand.y });
    touch(); touch();
    expect(openSmith).toHaveBeenCalledOnce();
    expect(Math.hypot(player.x - stand.x, player.y - stand.y)).toBeLessThanOrEqual(TOWN_SMITH_SERVER_REACH);
    Object.assign(player, TOWN_ARRIVAL); touch();
    Object.assign(player, { x: stand.x - 40, y: stand.y }); touch();
    expect(openSmith).toHaveBeenCalledTimes(2);
    inTown = false;
    Object.assign(player, TOWN_ARRIVAL); touch();
    Object.assign(player, stand); touch();
    expect(openSmith).toHaveBeenCalledTimes(2);
  });
});

describe("the Card Seller at the market stall", () => {
  const stand = { x: TOWN_CARD_SELLER_POSITION.x, y: TOWN_CARD_SELLER_POSITION.y - TOWN_FEET_OFFSET };
  it("keeps one of the square's own stalls, its name drawn over it", () => {
    const stall = TOWN_VILLAGE_DECOR.find(item => item.type === "soulProp" && item.x === TOWN_CARD_SELLER_STALL.x && Math.abs(item.y - TOWN_CARD_SELLER_STALL.y) < 1);
    expect(stall).toBeTruthy();
    expect(inTownVillage(TOWN_CARD_SELLER_STALL.x, TOWN_CARD_SELLER_STALL.y)).toBe(true);
    expect(townRoomAt(TOWN_CARD_SELLER_STALL.x, TOWN_CARD_SELLER_STALL.y)).toBeNull();
    expect(townWindowDecor(TOWN_ARRIVAL.x, TOWN_ARRIVAL.y)).toContainEqual(expect.objectContaining({ type: "station", label: "Card Seller", x: TOWN_CARD_SELLER_STALL.x }));
  });
  it("is served from open ground in front of the counter, a walk from where everyone lands", () => {
    expect(standable(stand.x, stand.y)).toBe(true);
    expect(walkable(TOWN_ARRIVAL, stand, TOWN_CARD_SELLER_REACH * .8)).toBe(true);
    // Far from the Smith, so walking up to one never opens the other.
    expect(Math.hypot(TOWN_CARD_SELLER_POSITION.x - TOWN_SMITH_POSITION.x, TOWN_CARD_SELLER_POSITION.y - TOWN_SMITH_POSITION.y)).toBeGreaterThan(TOWN_SMITH_REACH + TOWN_CARD_SELLER_REACH);
  });
  it("opens the window once as a player walks up, again only after they step away, and the server agrees they are in reach", () => {
    const openSeller = vi.fn(), openSmith = vi.fn(), player = { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y };
    let inTown = true;
    const touch = createHomeStationTouchHandler(() => inTown, player, vi.fn(), vi.fn(), vi.fn(), vi.fn(), openSmith, openSeller);
    touch();
    expect(openSeller).not.toHaveBeenCalled();
    // In from the square on the lane's right.
    Object.assign(player, { x: stand.x + 50, y: stand.y });
    touch(); touch();
    expect(openSeller).toHaveBeenCalledOnce();
    expect(Math.hypot(player.x - stand.x, player.y - stand.y)).toBeLessThanOrEqual(TOWN_CARD_SELLER_SERVER_REACH);
    Object.assign(player, TOWN_ARRIVAL); touch();
    Object.assign(player, stand); touch();
    expect(openSeller).toHaveBeenCalledTimes(2);
    inTown = false;
    Object.assign(player, TOWN_ARRIVAL); touch();
    Object.assign(player, stand); touch();
    expect(openSeller).toHaveBeenCalledTimes(2);
    expect(openSmith).not.toHaveBeenCalled();
  });
});

describe("the way out east, to the Copper Hills", () => {
  const gapMiddle = (TOWN_EAST_FENCE_GAP.top + TOWN_EAST_FENCE_GAP.bottom) / 2;
  const within = (area: { left: number; right: number; top: number; bottom: number }, x: number, y: number) =>
    x > area.left && x < area.right && y > area.top && y < area.bottom;

  it("goes through a gap in the fence east of the Inn, with nothing standing in it or just outside it", () => {
    // From where everyone lands, out through the gap and on east.
    expect(walkable(TOWN_ARRIVAL, { x: TOWN_EAST_FENCE_GAP.right + 140, y: gapMiddle - TOWN_FEET_OFFSET }, 10)).toBe(true);
    // Open all the way across, fence line and all.
    for (let x = TOWN_EAST_FENCE_GAP.left - 40; x <= TOWN_EAST_FENCE_GAP.right + 60; x += 10) expect(standable(x, gapMiddle - TOWN_FEET_OFFSET), `at ${x}`).toBe(true);
    // The tall tree that stood in the way out, hiding whoever walked through, is gone with its shadow.
    const standingThere = TOWN_VILLAGE_DECOR.filter(item => item.type === "soulProp" && !item.ground
      && (within(TOWN_EAST_FENCE_GAP, item.x, item.y) || within(TOWN_EAST_FENCE_GAP_OUTSIDE, item.x, item.y)));
    expect(standingThere).toEqual([]);
  });

  it("keeps the village's own bridges to their decks, off the rails", () => {
    const west = { x: TOWN_CENTER.x - 1_912, y: TOWN_CENTER.y + 226 - TOWN_FEET_OFFSET };
    for (let x = west.x - 130; x <= west.x + 130; x += 10) expect(standable(x, west.y), `west deck at ${x}`).toBe(true);
    for (const dx of [-140, -115, 0, 115, 140]) for (const dy of [-58, 58]) expect(standable(west.x + dx, west.y + dy), `west rail ${dx},${dy}`).toBe(false);
    const south = { x: TOWN_CENTER.x - 606, y: TOWN_CENTER.y + 1_224.5 - TOWN_FEET_OFFSET };
    for (let dy = -100; dy <= 100; dy += 10) {
      expect(standable(south.x, south.y + dy), `south deck at ${dy}`).toBe(true);
      for (const dx of [-65, 64]) expect(standable(south.x + dx, south.y + dy), `south rail ${dx},${dy}`).toBe(false);
    }
  });

  it("crosses the river on a bridge north-east of the gap, with the miners' track over its deck", () => {
    const deckY = TOWN_EAST_BRIDGE.y - TOWN_FEET_OFFSET;
    // From just outside the gap to the far bank, within 200 of the two: not the long way round the river's head.
    expect(walkable({ x: TOWN_EAST_FENCE_GAP.right + 40, y: gapMiddle - TOWN_FEET_OFFSET }, { x: TOWN_EAST_BRIDGE.x + 220, y: deckY }, 10)).toBe(true);
    // Open from bank to bank between its railings, with the river on either side of it.
    for (let x = TOWN_EAST_BRIDGE.x - 130; x <= TOWN_EAST_BRIDGE.x + 130; x += 10) expect(standable(x, deckY), `deck at ${x}`).toBe(true);
    for (const dy of [-37, 36, -60, 60, -120, 120]) expect(standable(TOWN_EAST_BRIDGE.x + 20, deckY + dy), `off the deck by ${dy}`).toBe(false);
    // The track crosses on the deck.
    const crossing = MINING_TRACK.filter(point => Math.abs(point.x - TOWN_EAST_BRIDGE.x) <= TOWN_EAST_BRIDGE.halfWidth && Math.abs(point.y - TOWN_EAST_BRIDGE.y) < 300);
    expect(crossing.length).toBeGreaterThan(5);
    for (const point of crossing) expect(Math.abs(point.y - TOWN_EAST_BRIDGE.y), `${point.x},${point.y}`).toBeLessThanOrEqual(2);
    // The deck is drawn with the village, and the trees that hid the way up to it and off it are gone, shadows and all.
    expect(TOWN_VILLAGE_DECOR.filter(item => item.type === "soulProp" && item.ground && Math.abs(item.y - TOWN_EAST_BRIDGE.y) < 1 && Math.abs(item.x - TOWN_EAST_BRIDGE.x) < 80))
      .toHaveLength(2);
    const approaches = TOWN_VILLAGE_DECOR.filter(item => item.type === "soulProp" && !item.ground
      && TOWN_EAST_BRIDGE_APPROACHES.some(area => within(area, item.x, item.y)));
    expect(approaches).toEqual([]);
    // Nothing of the village's grows on the track.
    const onTrack = TOWN_VILLAGE_DECOR.filter(item => item.type === "soulProp" && item.ground && !(Math.abs(item.y - TOWN_EAST_BRIDGE.y) < 1)
      && miningTrackDistanceSquared(item.x, item.y, 60) < 54 ** 2);
    expect(onTrack).toEqual([]);
  });

  it("is signed just outside the gap, below its south post, pointing east, on open ground", () => {
    expect(townWindowDecor(TOWN_ARRIVAL.x, TOWN_ARRIVAL.y)).toContain(TOWN_HILLS_SIGNPOST);
    expect(TOWN_HILLS_SIGNPOST).toMatchObject({ type: "soulProp", signpost: "Copper Hills", flip: true });
    // Outside the fence, beside the gap's south end: seen from the square through the gap, and in passing.
    expect(TOWN_HILLS_SIGNPOST.x).toBeGreaterThan(TOWN_EAST_FENCE_GAP.right);
    expect(TOWN_HILLS_SIGNPOST.x - TOWN_EAST_FENCE_GAP.right).toBeLessThan(80);
    expect(TOWN_HILLS_SIGNPOST.y).toBeGreaterThan(TOWN_EAST_FENCE_GAP.bottom);
    expect(TOWN_HILLS_SIGNPOST.y - TOWN_EAST_FENCE_GAP.bottom).toBeLessThan(100);
    expect(within(TOWN_EAST_FENCE_GAP_OUTSIDE, TOWN_HILLS_SIGNPOST.x, TOWN_HILLS_SIGNPOST.y)).toBe(true);
    // Its post stands on open ground, out of the way of whoever walks through the gap.
    expect(standable(TOWN_HILLS_SIGNPOST.x, TOWN_HILLS_SIGNPOST.y - TOWN_FEET_OFFSET)).toBe(true);
    expect(TOWN_HILLS_SIGNPOST.y - gapMiddle).toBeGreaterThan(120);
  });
});

describe("the Town square's signpost", () => {
  it("stands near where everyone lands, clear of the fountain and the doors, pointing at the travel portal", () => {
    const decor = townWindowDecor(TOWN_ARRIVAL.x, TOWN_ARRIVAL.y);
    expect(decor).toContain(TOWN_SIGNPOST);
    expect(TOWN_SIGNPOST).toMatchObject({ type: "soulProp", signpost: "Travel" });
    // In sight on landing, but far enough off that the arriving player's own name label does not cover its plank.
    const fromArrival = Math.hypot(TOWN_SIGNPOST.x - TOWN_ARRIVAL.x, TOWN_SIGNPOST.y - TOWN_ARRIVAL.y);
    expect(fromArrival).toBeGreaterThan(180);
    expect(fromArrival).toBeLessThan(300);
    expect(Math.hypot(TOWN_SIGNPOST.x - TOWN_CENTER.x, TOWN_SIGNPOST.y - TOWN_CENTER.y)).toBeGreaterThan(150);
    for (const door of TOWN_DOORS) expect(Math.hypot(TOWN_SIGNPOST.x - door.x, TOWN_SIGNPOST.y - door.y)).toBeGreaterThan(150);
    expect(standable(TOWN_SIGNPOST.x, TOWN_SIGNPOST.y - TOWN_FEET_OFFSET)).toBe(true);
    // Its plank points left and up: the portal is up and to the left of it.
    expect(TOWN_TRAVEL_PORTAL.x).toBeLessThan(TOWN_SIGNPOST.x);
    expect(TOWN_TRAVEL_PORTAL.y).toBeLessThan(TOWN_SIGNPOST.y);
  });
});
