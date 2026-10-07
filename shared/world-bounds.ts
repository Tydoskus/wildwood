import { HOME_EXTERIOR_MAP_ID, HOME_WORLD_HEIGHT, HOME_WORLD_WIDTH } from "./home";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./rules";
import { inTownInteriors, TOWN_MAP_ID, TOWN_WORLD } from "./town";
import { GUILD_HALL_INDOORS_LEFT, GUILD_HALL_WORLD, isGuildHallMap } from "./guild-hall";

export type WorldBounds = { width: number; height: number };
const CAMPAIGN_BOUNDS: WorldBounds = Object.freeze({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
const HOME_BOUNDS: WorldBounds = Object.freeze({ width: HOME_WORLD_WIDTH, height: HOME_WORLD_HEIGHT });

/**
 * How big a map's world is, for the server's movement clamp and anything that
 * samples positions. Home, the Town and guild halls have their own sizes; every
 * campaign and Endless map, and the Soul Dimension, share the classic 4800 square.
 */
export function worldBoundsFor(mapId: string | null | undefined): WorldBounds {
  if (mapId === HOME_EXTERIOR_MAP_ID) return HOME_BOUNDS;
  if (mapId === TOWN_MAP_ID) return TOWN_WORLD;
  if (isGuildHallMap(mapId)) return GUILD_HALL_WORLD;
  return CAMPAIGN_BOUNDS;
}
/** Whether a map's positions need the wide (u32) motion format: only the Town's run past 6,553. */
export const wideMotionMap = (mapId: string | null | undefined) => mapId === TOWN_MAP_ID;

/**
 * Whether a point is indoors: behind a door, in the rooms a map keeps far from
 * its open ground (the Town's houses, a guild hall's great hall). Maps
 * without doors are all outdoors. Someone on the other side of a door went
 * through it, so they are not walked across the dark between.
 */
export function indoors(mapId: string | null | undefined, x: number, y: number) {
  if (mapId === TOWN_MAP_ID) return inTownInteriors(x, y);
  if (isGuildHallMap(mapId)) return x >= GUILD_HALL_INDOORS_LEFT;
  return false;
}
