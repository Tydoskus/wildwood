import { HOME_EXTERIOR_MAP_ID, HOME_WORLD_HEIGHT, HOME_WORLD_WIDTH } from "./home";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./rules";
import { inSoulInteriors, SOUL_MAP_ID, SOUL_WORLD_SIZE } from "./soul-dimension";
import { GUILD_HALL_INDOORS_LEFT, GUILD_HALL_WORLD, isGuildHallMap } from "./guild-hall";

export type WorldBounds = { width: number; height: number };
const CAMPAIGN_BOUNDS: WorldBounds = Object.freeze({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
const HOME_BOUNDS: WorldBounds = Object.freeze({ width: HOME_WORLD_WIDTH, height: HOME_WORLD_HEIGHT });
const SOUL_BOUNDS: WorldBounds = Object.freeze({ width: SOUL_WORLD_SIZE, height: SOUL_WORLD_SIZE });

/**
 * How big a map's world is, for the server's movement clamp and anything that
 * samples positions. Home, the Soul Dimension and guild halls have their own sizes; every
 * campaign and Endless map shares the classic 4800 square.
 */
export function worldBoundsFor(mapId: string | null | undefined): WorldBounds {
  if (mapId === HOME_EXTERIOR_MAP_ID) return HOME_BOUNDS;
  if (mapId === SOUL_MAP_ID) return SOUL_BOUNDS;
  if (isGuildHallMap(mapId)) return GUILD_HALL_WORLD;
  return CAMPAIGN_BOUNDS;
}
/** Whether a map's positions need the wide (u32) motion format. */
export const wideMotionMap = (mapId: string | null | undefined) => mapId === SOUL_MAP_ID;

/**
 * Whether a point is indoors: behind a door, in the rooms a map keeps far from
 * its open ground (the Soul village's houses, a guild hall's great hall). Maps
 * without doors are all outdoors. Someone on the other side of a door went
 * through it, so they are not walked across the dark between.
 */
export function indoors(mapId: string | null | undefined, x: number, y: number) {
  if (mapId === SOUL_MAP_ID) return inSoulInteriors(x, y);
  if (isGuildHallMap(mapId)) return x >= GUILD_HALL_INDOORS_LEFT;
  return false;
}
