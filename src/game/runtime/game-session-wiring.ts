import { ONBOARDING_MAP_ID } from "../../../shared/onboarding";
import type { createAppShellController } from "../../ui/app-shell-controller";
import type { createGameElements } from "../../ui/game-elements";
import type { createGameRuntimeHud } from "../../ui/game-ui-runtime";
import type { MapId } from "../world";
import type { createAutoFarmController } from "./auto-farm/auto-farm-controller";
import type { createBossController } from "./boss/boss-controller";
import type { createCombatEffects } from "./combat-effects";
import type { CoopAccess } from "./coop-access";
import type { createDuelRuntime } from "./duel/duel-runtime";
import type { createDuelSessionController } from "./duel/duel-session-controller";
import type { createGameBootstrap, createGameBootstrapAssets } from "./game-bootstrap";
import { createGameSessionController } from "./game-session-controller";
import type { createMapController } from "./map-controller";
import type { createPerformanceMonitor } from "./performance-monitor";
import type { PlayerCombatController } from "./player-combat-controller";
import type { PlayerController } from "./player-controller";
import type { createPlayerInputController } from "./player-input-controller";
import type { createCamera } from "./render/camera";
import type { createCanvasRuntime } from "./render/canvas-runtime";
import type { createPresentationInterpolator } from "./render/presentation-interpolator";

type Updatable = { update: (dt: number) => void };
type GameElements = ReturnType<typeof createGameElements>;

export type GameSessionWiringDeps = {
  coop: CoopAccess;
  world: ReturnType<typeof createGameBootstrap>;
  camera: ReturnType<typeof createCamera>;
  canvasRuntime: Pick<ReturnType<typeof createCanvasRuntime>, "viewport">;
  e: Pick<GameElements, "sceneFadeEl" | "duelResultEl">;
  currentMapId: () => MapId;
  setCurrentMap: (mapId: MapId) => void;
  inTutorial: () => boolean;
  mapBalanceReady: () => boolean;
  appShell: ReturnType<typeof createAppShellController>;
  playerInput: Pick<ReturnType<typeof createPlayerInputController>, "movement">;
  autoFarm: ReturnType<typeof createAutoFarmController>;
  duelSession: Pick<ReturnType<typeof createDuelSessionController>, "isDueling" | "activeDuel" | "isArenaScene">;
  duelRuntime: Pick<ReturnType<typeof createDuelRuntime>, "isReplayActive">;
  profileWindow: { isOpen: () => boolean; drawPreview: () => void };
  hideStartScreen: () => void;
  deathScreen: { show: () => void; hide: () => void };
  bossFightMemory: { flush: () => void };
  /** The local player's death animation and corpse, and clearing it again. */
  recordLocalDeath: () => void;
  clearLocalDeath: () => void;
  playerController: PlayerController;
  hasSavedProgress: () => boolean;
  mapController: ReturnType<typeof createMapController>;
  syncMapMusic: () => void;
  bossController: ReturnType<typeof createBossController>;
  /** Each step's systems, in the order they update. */
  stations: { update: () => void };
  places: Updatable[];
  enemySystems: Updatable[];
  playerCombat: Pick<PlayerCombatController, "updateProjectiles">;
  updateRespawns: (gameTime: number) => void;
  effects: Pick<ReturnType<typeof createCombatEffects>, "update">;
  updateHud: () => void;
  runtimeHud: Pick<ReturnType<typeof createGameRuntimeHud>, "updateMessage">;
  presentation: ReturnType<typeof createPresentationInterpolator>;
  /** Drawn each frame before the world: timers, notices and the guild window. */
  beforeRender: () => void;
  guildPanel: { isOpen: () => boolean };
  assets: Pick<ReturnType<typeof createGameBootstrapAssets>["assets"], "ensureDuelAssets">;
  renderWorld: () => void;
  performanceMonitor: ReturnType<typeof createPerformanceMonitor>;
  devPanel: { renderPerformance: () => void; isPerformanceVisible: () => boolean };
  /** Systems created after the session, read once it runs. */
  later: {
    chatInteracting: () => boolean;
    refreshReconnectOverlay: () => void;
    onboarding: () => Updatable | undefined;
  };
};

/**
 * The game session: starting, pausing and ending play, and each fixed step's
 * update order, from the player through enemies and bosses to the HUD.
 */
export function createGameSession(deps: GameSessionWiringDeps) {
  const { coop, world, mapController, bossController, duelSession, appShell, presentation, later, currentMapId, inTutorial } = deps;
  const { player, mapConfig, projectileStore } = world;
  const client = coop.client;
  return createGameSessionController({
    player, camera: deps.camera, viewport: deps.canvasRuntime.viewport,
    validMapIds: Object.keys(mapConfig) as MapId[],
    getMapId: currentMapId, setMapId: mapId => { deps.setCurrentMap(mapId as MapId); },
    serverMapId: () => inTutorial() ? ONBOARDING_MAP_ID : coop.localState()?.mapId,
    serverPlayerState: () => inTutorial() ? undefined : coop.localState() ?? undefined,
    connected: coop.connected,
    accountInConflict: () => Boolean(client?.sessionConflict?.()),
    lowPerformanceMode: appShell.lowPerformanceMode,
    idleThrottle: appShell.idleThrottle,
    presentationInputActive: () => deps.playerInput.movement().source !== "none", autoFarmActive: () => deps.autoFarm.state().active,
    presentationUiActive: () => later.chatInteracting() || deps.profileWindow.isOpen(),
    isReplayActive: () => deps.duelRuntime.isReplayActive(),
    ensureMusicPlaying: appShell.ensureMusicPlaying,
    // A quiet server sends no change after Play to refresh autofarm's connection state.
    hideStart: () => { deps.hideStartScreen(); setTimeout(later.refreshReconnectOverlay, 0); },
    hideGameOver: () => { deps.clearLocalDeath(); deps.deathScreen.hide(); },
    showGameOver: () => {
      deps.bossFightMemory.flush();
      deps.autoFarm.defeated();
      deps.recordLocalDeath();
      deps.deathScreen.show();
    },
    beginAdventure: () => { client?.beginAdventure?.(); },
    syncStoppedPosition: () => { if (!inTutorial()) client?.correctMovementPosition?.(player.x, player.y, true); },
    resetPlayer: preserveStats => {
      deps.playerController.reset(preserveStats, deps.hasSavedProgress());
    },
    resolvePortalCollision: mapController.resolvePortalCollision,
    mapMusicSync: deps.syncMapMusic,
    isDueling: duelSession.isDueling, activeDuel: duelSession.activeDuel,
    syncBoss: () => bossController.forMap(currentMapId())?.sync(),
    cutsceneActive: mapController.isCutsceneActive, updateCutscene: mapController.updatePortalCutscene,
    worldCombatReady: () => !mapController.isMapTransitioning()
      && (inTutorial() || deps.mapBalanceReady() && coop.connected() && coop.localState()?.mapId === currentMapId()),
    updatePlayer: dt => {
      if (!mapController.isMapTransitioning() && !(inTutorial() && player.hp <= 0)) deps.playerController.update(dt);
    },
    updateStations: () => deps.stations.update(),
    updatePortal: dt => { mapController.updatePortal(dt); for (const place of deps.places) place.update(dt); },
    updateEnemies: dt => { for (const system of deps.enemySystems) system.update(dt); },
    updateBoss: dt => bossController.forMap(currentMapId())?.update(dt),
    updateProjectiles: deps.playerCombat.updateProjectiles, updateRespawns: time => { if (!inTutorial()) deps.updateRespawns(time); },
    clearDuelCombat: () => { projectileStore.clear(); },
    updateEffects: deps.effects.update, updateHud: () => deps.updateHud(),
    updateVisuals: dt => {
      later.onboarding()?.update(dt);
    },
    updateMessage: deps.runtimeHud.updateMessage,
    capturePresentationState: presentation.capture,
    resetPresentationState: presentation.reset,
    render: interpolationAlpha => presentation.render(interpolationAlpha, () => {
      deps.beforeRender();
      if (duelSession.activeDuel() || duelSession.isArenaScene()) void deps.assets.ensureDuelAssets();
      if (!deps.guildPanel.isOpen()) deps.renderWorld();
      else deps.profileWindow.drawPreview();
    }), recordPerformance: deps.performanceMonitor.record,
    renderPerformancePanel: deps.devPanel.renderPerformance, performancePanelVisible: deps.devPanel.isPerformanceVisible,
    renderFpsDisplay: () => {
      const performance = deps.performanceMonitor.snapshot();
      appShell.renderFps(performance.fps, performance.workMs);
    },
    fpsDisplayVisible: appShell.fpsVisible,
    fadeElement: deps.e.sceneFadeEl,
    onLeaveDuelResult: () => { deps.e.duelResultEl.hidden = true; deps.playerController.finishDuelResult(); },
  });
}
