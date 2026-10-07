export const HOME_EXTERIOR_MAP_ID = "home_exterior";
export const HOME_WORLD_WIDTH = 1_200;
export const HOME_WORLD_HEIGHT = 1_500;
// Preserve the original courtyard proportions while centering it in the larger lawn.
export const HOME_ART_OFFSET = { x: (HOME_WORLD_WIDTH - 1_000) / 2, y: (HOME_WORLD_HEIGHT - 1_000) / 2 };
export const HOME_EXTERIOR_SPAWN = { x: 500 + HOME_ART_OFFSET.x, y: 700 + HOME_ART_OFFSET.y };
export const HOME_BENCH_POSITION = { x: 380 + HOME_ART_OFFSET.x, y: 450 + HOME_ART_OFFSET.y };
export const HOME_RESEARCH_POSITION = { x: 620 + HOME_ART_OFFSET.x, y: 450 + HOME_ART_OFFSET.y };
/** The Daily Quest board, on the lawn beside the entrance path, the first thing seen on arrival. */
export const HOME_QUEST_BOARD_POSITION = { x: 685 + HOME_ART_OFFSET.x, y: 765 + HOME_ART_OFFSET.y };

// The arch art is square, so the pad is too (it was drawn 130 wide, squeezed). Close to the
// workshop banners, centered over their shared courtyard. It leads to the Town, whose
// travel portal picks the map (tabs from before the Town still pick from here: the server
// accepts any map the player has unlocked from beside it). The toolbar teleport stays the
// round trip back to the exact spot you left.
export const HOME_TRAVEL_PORTAL = { x: HOME_WORLD_WIDTH / 2, y: 490,
  width: 150, height: 150, depth: 490, destination: "town" as const, label: "Town" };
