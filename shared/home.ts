export const HOME_EXTERIOR_MAP_ID = "home_exterior";
export const HOME_WORLD_WIDTH = 1_200;
export const HOME_WORLD_HEIGHT = 1_500;
// Preserve the original courtyard proportions while centering it in the larger lawn.
export const HOME_ART_OFFSET = { x: (HOME_WORLD_WIDTH - 1_000) / 2, y: (HOME_WORLD_HEIGHT - 1_000) / 2 };
export const HOME_EXTERIOR_SPAWN = { x: 500 + HOME_ART_OFFSET.x, y: 700 + HOME_ART_OFFSET.y };
export const HOME_BENCH_POSITION = { x: 380 + HOME_ART_OFFSET.x, y: 450 + HOME_ART_OFFSET.y };
export const HOME_RESEARCH_POSITION = { x: 620 + HOME_ART_OFFSET.x, y: 450 + HOME_ART_OFFSET.y };

// Close to the workshop banners, centered over their shared courtyard. Walking
// in opens a destination picker; the server accepts any map the player has
// unlocked from beside it. The toolbar teleport stays the round trip back to
// the exact spot you left, so this pad is an extra way out, not the only one.
export const HOME_TRAVEL_PORTAL = { x: HOME_WORLD_WIDTH / 2, y: 490,
  width: 130, height: 150, depth: 490, destination: "tutorial_forest" as const, label: "Travel" };
