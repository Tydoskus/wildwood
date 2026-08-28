export const HOME_EXTERIOR_MAP_ID = "home_exterior";
export const HOME_INTERIOR_MAP_ID = "home_interior";

export const HOME_MAP_IDS = [HOME_EXTERIOR_MAP_ID, HOME_INTERIOR_MAP_ID] as const;
export type HomeMapId = typeof HOME_MAP_IDS[number];
export type HomeRoom = "exterior" | "interior";

export type WorldBounds = { width: number; height: number };
export type WorldPoint = { x: number; y: number };

export const HOME_WORLD_BOUNDS: Record<HomeMapId, WorldBounds> = {
  [HOME_EXTERIOR_MAP_ID]: { width: 2_400, height: 1_800 },
  [HOME_INTERIOR_MAP_ID]: { width: 1_600, height: 1_200 },
};

// Teleporting home always starts outside. Door travel uses separate arrivals
// so a player never lands inside the same trigger that initiated the move.
export const HOME_EXTERIOR_SPAWN: WorldPoint = { x: 1_200, y: 900 };
export const HOME_EXTERIOR_DOOR: WorldPoint = { x: 1_200, y: 748 };
export const HOME_EXTERIOR_DOOR_ARRIVAL: WorldPoint = { x: 1_200, y: 870 };
export const HOME_INTERIOR_SPAWN: WorldPoint = { x: 800, y: 930 };
export const HOME_INTERIOR_EXIT: WorldPoint = { x: 800, y: 1_045 };
export const HOME_DOOR_USE_RANGE = 86;

const HOME_ROUTE_PATTERN = /^home:([0-9a-f]{64}):(exterior|interior)$/;

export type HomeRoute = {
  ownerIdentity: string;
  room: HomeRoom;
  mapId: HomeMapId;
};

export function isHomeMapId(mapId: string): mapId is HomeMapId {
  return mapId === HOME_EXTERIOR_MAP_ID || mapId === HOME_INTERIOR_MAP_ID;
}

export function homeMapIdForRoom(room: HomeRoom): HomeMapId {
  return room === "exterior" ? HOME_EXTERIOR_MAP_ID : HOME_INTERIOR_MAP_ID;
}

export function homeRoomForMapId(mapId: HomeMapId): HomeRoom {
  return mapId === HOME_EXTERIOR_MAP_ID ? "exterior" : "interior";
}

export function homeNetworkMapId(ownerIdentity: string, room: HomeRoom): string {
  const normalizedOwner = ownerIdentity.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedOwner)) throw new Error("Invalid home owner identity.");
  return `home:${normalizedOwner}:${room}`;
}

export function parseHomeNetworkMapId(networkMapId: string): HomeRoute | null {
  const match = HOME_ROUTE_PATTERN.exec(networkMapId);
  if (!match) return null;
  const room = match[2] as HomeRoom;
  return {
    ownerIdentity: match[1],
    room,
    mapId: homeMapIdForRoom(room),
  };
}

export function clientMapIdForNetworkMapId(networkMapId: string): string {
  return parseHomeNetworkMapId(networkMapId)?.mapId ?? networkMapId;
}

export function homeBoundsForNetworkMapId(networkMapId: string): WorldBounds | null {
  const route = parseHomeNetworkMapId(networkMapId);
  return route ? HOME_WORLD_BOUNDS[route.mapId] : null;
}
