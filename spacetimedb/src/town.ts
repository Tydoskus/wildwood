import { SenderError, t } from "spacetimedb/server";
import type { default as spacetimedbType } from "./index";
import { isTownMap, townDoorDestination, townDoorSides, TOWN_ARRIVAL, TOWN_CENTER, TOWN_MAP_ID, TOWN_SOUL_PORTAL, TOWN_TRAVEL_PORTAL } from "../../shared/town";
import { doorDestinationFor } from "./door-reach";

/**
 * The Town on the server (shared/town.ts has the rules): its wells and doors,
 * each of which only ever moves a player somewhere the Town already has them
 * standing near.
 */
type TownDeps = {
  requireControllingPlayer: (ctx: any) => any;
  playerWithMotion: (ctx: any, player: any) => any;
  transitionPlayerMap: (ctx: any, current: any, mapId: string, arrival: { x: number; y: number }) => void;
};

export function registerTown(spacetimedb: typeof spacetimedbType, deps: TownDeps) {
  /** Walking into one of the village's wells: a splash, and back on the square. It only ever moves a player to the arrival. */
  const fallIntoWell = spacetimedb.reducer({}, ctx => {
    const player = deps.requireControllingPlayer(ctx);
    if (!isTownMap(player.mapId)) throw new SenderError("There is no well here.");
    deps.transitionPlayerMap(ctx, deps.playerWithMotion(ctx, player), TOWN_MAP_ID, TOWN_ARRIVAL);
  });
  /**
   * Going through a house door: into its room from just outside it, or back out from inside the room.
   * It only ever moves a player between a door and its own room, and only when they are at one of the two.
   */
  const useTownDoor = spacetimedb.reducer({ door: t.u32() }, (ctx, { door }) => {
    const player = deps.requireControllingPlayer(ctx);
    if (!isTownMap(player.mapId)) throw new SenderError("There is no door here.");
    const moving = deps.playerWithMotion(ctx, player);
    const destination = doorDestinationFor(ctx, moving, (x, y) => townDoorDestination(door, x, y), townDoorSides(door));
    if (!destination) throw new SenderError("That door is too far away.");
    deps.transitionPlayerMap(ctx, moving, TOWN_MAP_ID, destination);
  });
  return { fallIntoWell, useTownDoor };
}

/**
 * Where the Town's portals were before 0.900.2 moved them to the ends of their roads. A tab loaded before then
 * still draws them there and sends its position from there; change_map takes those spots too until such tabs
 * are gone (remove once every client is past 0.900.2).
 */
const TOWN_PORTALS_BEFORE_0_900_2 = Object.freeze({
  travel: { x: TOWN_CENTER.x - 1_225, y: TOWN_CENTER.y - 1_215, height: TOWN_TRAVEL_PORTAL.height },
  soul: { x: TOWN_CENTER.x - 610, y: TOWN_CENTER.y + 1_880, height: TOWN_SOUL_PORTAL.height },
});
/** The spots change_map accepts a Town portal from (its middle, as the client's trigger measures it), each with where it leads. */
export function townPortalUsePoints(mapId: string) {
  const usePoint = (portal: { x: number; y: number; height: number }, destination: string) => ({ x: portal.x, y: portal.y - portal.height * .32, destination });
  const soul = TOWN_SOUL_PORTAL.destination;
  return [
    usePoint(TOWN_TRAVEL_PORTAL, mapId), usePoint(TOWN_SOUL_PORTAL, soul),
    usePoint(TOWN_PORTALS_BEFORE_0_900_2.travel, mapId), usePoint(TOWN_PORTALS_BEFORE_0_900_2.soul, soul),
  ];
}

// index.ts has no lines to spare, so what it needs from the shared module comes through here.
export { isTownMap, TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_MAP_ID } from "../../shared/town";
