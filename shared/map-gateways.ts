import { CAMPAIGN_MAPS } from "./campaign-registry";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "./map-editor-overrides";
import { TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID } from "./rules";

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

/** Back to the previous map on the left, on to the next on the right; the forest has only the way on. A map editor layout wins. */
function campaignGateways(index: number): MapGateways {
  const map = CAMPAIGN_MAPS[index], previous = CAMPAIGN_MAPS[index - 1], next = CAMPAIGN_MAPS[index + 1];
  const edit = MAP_EDITOR_GAMEPLAY_OVERRIDES[map.id];
  if (edit?.portals.length) return { arrival: { ...edit.arrival }, portals: edit.portals.map(portal => ({ ...portal })) };
  if (map.id === TUTORIAL_FOREST_MAP_ID) return { arrival: { x: 190, y: 540 }, portals: next ? [portalAt(190, 448, next.id)] : [] };
  return {
    arrival: edit?.arrival ? { ...edit.arrival } : map.id === BEGINNER_DESERT_MAP_ID ? { x: 360, y: 770 } : { x: 580, y: 770 },
    portals: [...(previous ? [portalAt(360, 680, previous.id)] : []), ...(next ? [portalAt(580, 680, next.id)] : [])],
  };
}

export const CAMPAIGN_GATEWAYS: Readonly<Record<string, MapGateways>> =
  Object.fromEntries(CAMPAIGN_MAPS.map((map, index) => [map.id, campaignGateways(index)]));
