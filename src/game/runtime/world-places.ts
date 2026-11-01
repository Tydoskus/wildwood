import type { createGameRuntimeHud } from "../../ui/game-ui-runtime";
import { createTravelController } from "../../ui/travel-controller";
import { createQuestBoardRuntime } from "../../ui/quest-board-controller";
import { createQuestTrackerSetting } from "../../ui/quest-tracker";
import type { MapId, SpawnSite } from "../world";
import type { CoopAccess } from "./coop-access";
import type { createGameBootstrap } from "./game-bootstrap";
import { createGuildHall } from "./guild-hall/guild-hall";
import type { createMapController } from "./map-controller";
import type { PlayerCombatController } from "./player-combat-controller";
import type { createPlayerInputController } from "./player-input-controller";
import type { Camera } from "./render/camera";
import type { createResearchController } from "./research-controller";
import { createSoulDimension } from "./soul/soul-dimension";

type RuntimeHud = ReturnType<typeof createGameRuntimeHud>;
type FadeToWorld = (action: () => void | Promise<void>, durationMs?: number) => void;

export type WorldPlacesDeps = {
  coop: CoopAccess;
  world: ReturnType<typeof createGameBootstrap>;
  currentMapId: () => MapId;
  spawnFromSite: (site: SpawnSite) => void;
  mapController: ReturnType<typeof createMapController>;
  playerInput: Pick<ReturnType<typeof createPlayerInputController>, "clear">;
  playerCombat: PlayerCombatController;
  research: Pick<ReturnType<typeof createResearchController>, "effectiveArmor" | "criticalDamageMultiplier">;
  regenerationPerSecond: () => number;
  autoFarm: { stop: (reason?: string) => void };
  logPickup: (text: string, color: string, value?: number) => void;
  showMessage: (text: string, color?: string) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  camera: Camera;
  /** Systems created after these places, read once the player is in one. */
  later: {
    invalidateDepthOrder: () => void;
    fadeToWorld: FadeToWorld;
    showQuestProgress: RuntimeHud["showQuestProgress"];
    showProgressCompletion: RuntimeHud["showProgressCompletion"];
  };
};

/**
 * Places beyond the campaign maps: the Weekly Quests board, the Town's travel
 * picker, the Soul Dimension and guild halls.
 */
export function createWorldPlaces(deps: WorldPlacesDeps) {
  const { coop, world, mapController, playerCombat, later, currentMapId } = deps;
  const { player, mapConfig } = world;
  const source = () => coop.client;
  const atHome = () => currentMapId() === "town";
  const clearInput = deps.playerInput.clear;

  const questTracker = createQuestTrackerSetting(localStorage);
  const quests = createQuestBoardRuntime({
    source, atHome, tracker: questTracker, pause: () => {}, clearInput,
    mapName: id => mapConfig[id as MapId]?.name ?? id,
    showProgress: (enemy, count, target) => later.showQuestProgress(enemy, count, target),
  });
  const travel = createTravelController({
    source, travel: mapController.travelFromHome, departure: mapController.homeDeparture, atHome, pause: () => {}, clearInput,
    mapName: id => mapConfig[id].name, guildHall: () => guildHall.hallMap(),
  });
  const soulDimension = createSoulDimension({
    source, player, inventory: world.inventory, enemies: world.enemies, spawnSites: world.spawnSites, decor: world.decor,
    currentMapId, spawnFromSite: deps.spawnFromSite, invalidateDepthOrder: later.invalidateDepthOrder, townMap: mapConfig.town,
    strength: () => ({
      dps: playerCombat.expectedDps(), maxHp: player.maxHp, armor: deps.research.effectiveArmor(), regen: deps.regenerationPerSecond(),
    }),
    fullDps: () => playerCombat.expectedFullDps(), logPickup: deps.logPickup,
    damagePlayer: (damage, enemy) => playerCombat.damagePlayer(damage, enemy),
    message: deps.showMessage, burst: deps.spawnBurst, sendToTown: () => mapController.teleportHome(),
    researchCritMultiplier: deps.research.criticalDamageMultiplier,
    levelUp: (level, multiplier) => later.showProgressCompletion("Soul Level", `Lv ${level} · Rewards ${multiplier}×`, "✦", "#d9b8ff"),
    attackCap: coop.attackCap, travel: mapController.travelFromHome, clearInput, fadeToWorld: later.fadeToWorld,
  });
  const guildHall = createGuildHall({
    source, player, decor: world.decor, currentMapId, invalidateDepthOrder: later.invalidateDepthOrder, clearInput,
    fadeToWorld: later.fadeToWorld, camera: deps.camera,
    travel: mapId => {
      deps.autoFarm.stop("Autofarm stopped for the Guild Hall");
      return mapController.teleportToMap(mapId, async () => Boolean(await coop.client?.changeMap?.(mapId, player.x, player.y)));
    },
  });

  return { questTracker, quests, travel, soulDimension, guildHall };
}
