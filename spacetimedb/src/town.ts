import { SenderError, t } from "spacetimedb/server";
import type { default as spacetimedbType } from "./index";
import { isTownMap, townDoorDestination, TOWN_ARRIVAL, TOWN_MAP_ID } from "../../shared/town";

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
    const destination = townDoorDestination(door, moving.x, moving.y);
    if (!destination) throw new SenderError("That door is too far away.");
    deps.transitionPlayerMap(ctx, moving, TOWN_MAP_ID, destination);
  });
  return { fallIntoWell, useTownDoor };
}

// index.ts has no lines to spare, so what it needs from the shared module comes through here.
export { isTownMap, TOWN_ARRIVAL, TOWN_BENCH_POSITION, TOWN_MAP_ID, TOWN_SOUL_PORTAL, TOWN_TRAVEL_PORTAL } from "../../shared/town";
