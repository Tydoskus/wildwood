import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
} from "./world";

/** Portal swirls and marker colors communicate the map they lead to. */
export const PORTAL_SWIRL_SOURCES: Record<MapId, string> = {
  [TUTORIAL_FOREST_MAP_ID]: "assets/wildwood/portal-swirl-spritesheet-green.png",
  [BEGINNER_DESERT_MAP_ID]: "assets/wildwood/portal-swirl-spritesheet-gold.png",
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: "assets/wildwood/portal-swirl-spritesheet.png",
  [ADVANCED_LAVA_WASTES_MAP_ID]: "assets/wildwood/portal-swirl-spritesheet-red.png",
  [INFERNAL_DEPTHS_MAP_ID]: "assets/wildwood/portal-swirl-spritesheet-black.png",
};

const PORTAL_DESTINATION_COLORS: Record<MapId, string> = {
  [TUTORIAL_FOREST_MAP_ID]: "#61e87c",
  [BEGINNER_DESERT_MAP_ID]: "#ffd34d",
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: "#8deeff",
  [ADVANCED_LAVA_WASTES_MAP_ID]: "#ff6258",
  [INFERNAL_DEPTHS_MAP_ID]: "#625a70",
};

export function portalDestinationColor(destination: MapId) {
  return PORTAL_DESTINATION_COLORS[destination];
}

/** Keeps Night Forest's black portal label readable without changing its map marker. */
export function portalDestinationTextColor(destination: MapId) {
  return destination === INFERNAL_DEPTHS_MAP_ID ? "#ffffff" : portalDestinationColor(destination);
}

/** Draws the shared pixel-arch marker used by both map sizes. */
export function drawPortalMapMarker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  destination: MapId,
  unlocked: boolean,
  scale = 1,
) {
  const color = portalDestinationColor(destination);
  const unit = Math.max(1, Math.round(scale));
  context.fillStyle = "#132433";
  context.fillRect(x - 4 * unit, y - 5 * unit, 9 * unit, 8 * unit);
  context.fillStyle = unlocked ? color : "#89949b";
  context.fillRect(x - 3 * unit, y - 5 * unit, 7 * unit, 2 * unit);
  context.fillRect(x - 4 * unit, y - 3 * unit, 2 * unit, 6 * unit);
  context.fillRect(x + 3 * unit, y - 3 * unit, 2 * unit, 6 * unit);
  context.fillStyle = unlocked ? color : "#3f4a50";
  context.fillRect(x - 2 * unit, y - 3 * unit, 5 * unit, 6 * unit);
  if (!unlocked) return;
  context.fillStyle = "#efffff";
  context.fillRect(x, y - 2 * unit, unit, 4 * unit);
}
