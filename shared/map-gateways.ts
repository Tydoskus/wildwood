import { CAMPAIGN_MAPS } from "./campaign-registry";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "./map-editor-overrides";
import { TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, WORLD_HEIGHT, WORLD_WIDTH } from "./rules";

/**
 * Where each campaign map's portals stand and where a player arriving lands.
 * The client draws these and the server checks portal use against them, so
 * they live here once; they used to be copied by hand into both, with the
 * server's use point worked out from the client's numbers.
 */
export type MapGatewayPortal = { x: number; y: number; width: number; height: number; depth: number; destination: string };
export type MapGateways = { arrival: { x: number; y: number }; portals: MapGatewayPortal[] };

const PORTAL_SIZE = 198;
const portalAt = (x: number, y: number, destination: string): MapGatewayPortal =>
  ({ x, y, width: PORTAL_SIZE, height: PORTAL_SIZE, depth: y, destination });

/** The spot a player has to stand near to use a portal: its art's base is y, the gate's middle a third of its height up. */
export function portalUsePoint(portal: MapGatewayPortal) {
  return { x: portal.x, y: portal.y - portal.height * .32, destination: portal.destination };
}

/** Back and on stand this far apart, half of it either side of the map's gateway point. */
export const GATEWAY_PORTAL_SPACING = 220;
/** A player arriving lands this far below the portals' feet, between them. */
export const GATEWAY_ARRIVAL_DROP = 90;

/**
 * Where a campaign map's portals stand: the middle of the map (they stood in
 * its top-left corner until 0.901.15). Where enemies reach the middle they
 * stand at the nearest spot clear of them instead. map-gateways.test.ts holds
 * every map's portals and arrival clear of its enemies, boss and decor.
 */
export const MAP_MIDDLE: Readonly<{ x: number; y: number }> = Object.freeze({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
export const GATEWAY_POINT_NUDGES: Readonly<Record<string, { x: number; y: number }>> = {
  // Mossfall Ruins' region covers the middle and Glass Thicket's Needles spawn 300 from it. Clear
  // of a 300-aggro elite at every forest spawn too: the Soul Dimension fills them with its own.
  // The forest's portal comes from the map editor (shared/map-designs.json), laid out on this point.
  [TUTORIAL_FOREST_MAP_ID]: { x: 2240, y: 2810 },
  // A Whiteout Reaper (an elite, 340 aggro) spawns 220 from the middle.
  intermediate_snowlands: { x: 2300, y: 2190 },
};
export function gatewayPoint(mapId: string) {
  return { ...(GATEWAY_POINT_NUDGES[mapId] ?? MAP_MIDDLE) };
}

/**
 * The layout around a gateway point: back to the previous map on the left,
 * on to the next on the right, the arrival just below between them, so a
 * player who arrives stands by both. The forest has only the way on, so it
 * stands on the point itself.
 */
export function middleGateways(point: { x: number; y: number }, back: string | null, next: string | null): MapGateways {
  const half = back !== null && next !== null ? GATEWAY_PORTAL_SPACING / 2 : 0;
  return {
    arrival: { x: point.x, y: point.y + GATEWAY_ARRIVAL_DROP },
    portals: [...(back !== null ? [portalAt(point.x - half, point.y, back)] : []), ...(next !== null ? [portalAt(point.x + half, point.y, next)] : [])],
  };
}

const LAST_CAMPAIGN_MAP = CAMPAIGN_MAPS[CAMPAIGN_MAPS.length - 1];

/** A map editor layout wins (the forest's and the desert's, laid out the same way). */
function campaignGateways(index: number): MapGateways {
  const map = CAMPAIGN_MAPS[index], previous = CAMPAIGN_MAPS[index - 1], next = CAMPAIGN_MAPS[index + 1];
  const edit = MAP_EDITOR_GAMEPLAY_OVERRIDES[map.id];
  if (edit?.portals.length) return { arrival: { ...edit.arrival }, portals: edit.portals.map(portal => ({ ...portal })) };
  // The last map's right-hand place is its way into Endless (endlessEntryPortal), added by the client and server.
  const laidOut = middleGateways(gatewayPoint(map.id), previous?.id ?? null, next?.id ?? (map === LAST_CAMPAIGN_MAP ? "" : null));
  return { ...laidOut, portals: laidOut.portals.filter(portal => portal.destination) };
}

export const CAMPAIGN_GATEWAYS: Readonly<Record<string, MapGateways>> =
  Object.fromEntries(CAMPAIGN_MAPS.map((map, index) => [map.id, campaignGateways(index)]));

/** The last campaign map's portal into Endless (`destination`, its first map): where a next portal would stand. */
export function endlessEntryPortal(destination: string): MapGatewayPortal {
  return middleGateways(gatewayPoint(LAST_CAMPAIGN_MAP.id), CAMPAIGN_MAPS[CAMPAIGN_MAPS.length - 2].id, destination).portals[1];
}

/**
 * LEGACY: where the portals stood until 0.901.15, in each map's top-left
 * corner (the forest's and the desert's where the map editor had them).
 * Tabs on 0.901.14 and older still draw them there and walk into them, so
 * the server still takes portal use here, and lands such a tab at the old
 * arrival, where the tab puts itself.
 * Remove after a release or two (0.901.17 or later, once no older tab is
 * left): this table, LEGACY_ENDLESS_ENTRY_PORTAL, legacyPortalUsePoints and
 * their use in change_map (spacetimedb/src/index.ts).
 */
export const LEGACY_CORNER_GATEWAYS: Readonly<Record<string, MapGateways>> = Object.fromEntries(CAMPAIGN_MAPS.map((map, index) => {
  const previous = CAMPAIGN_MAPS[index - 1], next = CAMPAIGN_MAPS[index + 1];
  if (map.id === TUTORIAL_FOREST_MAP_ID) return [map.id, { arrival: { x: 1025, y: 850 }, portals: [portalAt(875, 850, next.id)] }];
  if (map.id === BEGINNER_DESERT_MAP_ID) return [map.id, { arrival: { x: 625, y: 800 }, portals: [portalAt(500, 725, previous.id), portalAt(750, 725, next.id)] }];
  return [map.id, {
    arrival: { x: 580, y: 770 },
    portals: [...(previous ? [portalAt(360, 680, previous.id)] : []), ...(next ? [portalAt(580, 680, next.id)] : [])],
  }];
}));
/** LEGACY (see LEGACY_CORNER_GATEWAYS): the last campaign map's old way into Endless. */
export const LEGACY_ENDLESS_ENTRY_PORTAL: Readonly<MapGatewayPortal> = Object.freeze(portalAt(580, 680, ""));

/**
 * LEGACY (see LEGACY_CORNER_GATEWAYS): the old portals' use points on a
 * campaign map, each with the arrival an old tab puts itself at on the far
 * side (null where that did not move: Endless).
 */
export function legacyPortalUsePoints(mapId: string, endlessDestination: string) {
  const portals = [...(LEGACY_CORNER_GATEWAYS[mapId]?.portals ?? []),
    ...(mapId === LAST_CAMPAIGN_MAP.id ? [{ ...LEGACY_ENDLESS_ENTRY_PORTAL, destination: endlessDestination }] : [])];
  return portals.map(portal => ({ ...portalUsePoint(portal), legacyArrival: LEGACY_CORNER_GATEWAYS[portal.destination]?.arrival ?? null }));
}

/** The spots on a campaign map that stand clear of decor: each portal's gate (the Endless one too) and the arrival. */
export function gatewayClearings(mapId: string): { x: number; y: number }[] {
  const gateways = CAMPAIGN_GATEWAYS[mapId];
  if (!gateways) return [];
  const portals = [...gateways.portals, ...(mapId === LAST_CAMPAIGN_MAP.id ? [endlessEntryPortal("")] : [])];
  return [...portals.map(portal => ({ x: portal.x, y: portal.y - portal.height / 2 })), { ...gateways.arrival }];
}
