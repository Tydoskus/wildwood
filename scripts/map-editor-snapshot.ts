import { MAP_IDS } from "../shared/rules";
import { ENEMY_TYPES } from "../src/game/enemies";
import { mapVisualTheme, savedMapDesign, storedDraftMapDesigns, type SavedMapDesign } from "../src/game/map-design";
import {
  createWorldLayout,
  mapSpawnCamps,
  type MapId,
} from "../src/game/world";
import { createGameBootstrap } from "../src/game/runtime/game-bootstrap";

const bootstrap = createGameBootstrap();
const bossByMap: Record<MapId, { x: number; y: number }> = {
  tutorial_forest: bootstrap.boss,
  beginner_desert: bootstrap.spiderBoss,
  intermediate_snowlands: bootstrap.frostclawBoss,
  advanced_lava_wastes: bootstrap.magmaliskBoss,
  infernal_depths: bootstrap.gloomrootBoss,
  water_reach: bootstrap.tidewyrmBoss,
  samurai_garden: bootstrap.koiShogunBoss,
  cloudspire: bootstrap.tempestKirinBoss,
  moonfen: bootstrap.miremawBoss,
};

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
    spawnCamps: mapSpawnCamps(id).map((camp) => ({ ...camp, types: [...camp.types] })),
    gameplay: {
      arrival: { ...config.arrival },
      boss: { x: bossByMap[id].x, y: bossByMap[id].y },
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
