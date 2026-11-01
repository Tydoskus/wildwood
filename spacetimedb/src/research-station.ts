import { TOWN_RESEARCH_POSITION } from "../../shared/town";
import { withinStationReach } from "./door-reach";
import { isTownMap } from "./town";

/** Where a player stands to read Tech Research: the client opens it 36 above the station (src/ui/game-ui-runtime.ts). */
export const RESEARCH_STAND = { x: TOWN_RESEARCH_POSITION.x, y: TOWN_RESEARCH_POSITION.y - 36 };
/** The client opens it within 42.5; the server allows more for lag, as at the schools. */
export const RESEARCH_SERVER_REACH = 85;

/** Whether the player stands at Tech Research in the Town, where research starts. */
export function standsAtResearch(ctx: any, player: Parameters<typeof withinStationReach>[1]) {
  return isTownMap(player.mapId) && withinStationReach(ctx, player, RESEARCH_STAND, RESEARCH_SERVER_REACH);
}
