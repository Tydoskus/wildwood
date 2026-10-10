import { MAP_IDS } from "../shared/rules";
import { ENEMY_TYPES } from "../src/game/enemies";
import { mapVisualTheme, savedMapDesign, storedDraftMapDesigns, type SavedMapDesign } from "../src/game/map-design";
import {
  createWorldLayout,
  mapSpawnCamps,
  type MapId,
} from "../src/game/world";
import { createGameBootstrap } from "../src/game/runtime/game-bootstrap";
import { bossStateForMap } from "../src/game/runtime/boss-registry";

const bootstrap = createGameBootstrap();
/** Where each campaign map's world boss stands, as the game places it. */
function bossPosition(id: MapId) {
  const boss = bossStateForMap(bootstrap.bosses, id);
  if (!boss) throw new Error(`${id} has no world boss`);
  return { x: boss.x, y: boss.y };
}

const maps = (MAP_IDS as MapId[]).map((id): SavedMapDesign => {
  const config = bootstrap.mapConfig[id];
  const layout = createWorldLayout(config.arrival, id);
  const saved = savedMapDesign(id);
  return {
    id,
    name: config.name,
    templateId: saved?.templateId ?? id,
    status: "live",
    updatedAt: saved?.updatedAt ?? "",
    theme: mapVisualTheme(id),
    paths: layout.paths,
    decor: layout.decor,
    // keepClear is worked out from the map's gateways at runtime (world.ts), never saved.
    spawnCamps: mapSpawnCamps(id).map(({ keepClear: _keepClear, ...camp }) => ({ ...camp, types: [...camp.types] })),
    gameplay: {
      arrival: { ...config.arrival },
      boss: bossPosition(id),
      ...(id === "tutorial_forest" ? { bootsPickup: { x: bootstrap.bootsPickup.x, y: bootstrap.bootsPickup.y } } : {}),
      portals: [config.portal, config.secondaryPortal].filter((portal) => portal !== undefined).map((portal) => ({ ...portal })),
    },
    gameplayEdited: saved?.gameplayEdited,
  };
});

process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  world: { width: 4800, height: 4800 },
  maps,
  drafts: Object.values(storedDraftMapDesigns()),
  enemyKinds: Object.entries(ENEMY_TYPES).map(([id, definition]) => ({ id, reward: definition.reward.type })),
}));
