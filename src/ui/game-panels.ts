import type { LeaderboardBoard } from "../../shared/leaderboard-window";
import { isProceduralMap, proceduralMapId } from "../../shared/procedural-maps";
import type { ResearchId, ResearchRanks } from "../../shared/research";
import { isDeveloperIdentity } from "../app/developer";
import type { InventoryState } from "../game/inventory";
import { allPlayerPartsSettled } from "../game/player-appearance";
import { bossForMap } from "../game/runtime/boss/boss-registry";
import type { createProceduralBossController } from "../game/runtime/boss/procedural-boss-controller";
import type { CoopAccess } from "../game/runtime/coop-access";
import type { createGameBootstrap, createGameBootstrapAssets } from "../game/runtime/game-bootstrap";
import type { createMapController } from "../game/runtime/map-controller";
import type { createPerformanceMonitor } from "../game/runtime/performance-monitor";
import type { createCanvasRuntime } from "../game/runtime/render/canvas-runtime";
import type { createPlayerIdentityRenderer } from "../game/runtime/render/player-identity-renderer";
import type { createRewardDisplay } from "../game/runtime/reward-display";
import type { RewardLabelContext } from "../game/runtime/reward-labels";
import type { EnemyState, PlayerState } from "../game/runtime/types";
import type { MapId } from "../game/world";
import type { LeaderboardEntry } from "../wildstat-coop";
import type { createGameElements } from "./game-elements";
import { createDevPanel, createLeaderboardPanel, createTechTreePanel } from "./game-ui-runtime";
import { createGuildPanel } from "./guild-panel";
import type { createTravelController } from "./travel-controller";
import type { createItemInspectionController } from "./item-inspection-controller";
import { createMapGuideController } from "./map-guide-controller";
import { createPanelCoordinator } from "./panel-coordinator";
import type { createPrestigeExpansionRuntime } from "./prestige-expansion-runtime";
import { createProgressCompletionNotices } from "./progress-completion-notices";
import { guildQuestStandingFrom } from "./quest-board-controller";

type GameElements = ReturnType<typeof createGameElements>;
type BootstrapAssets = ReturnType<typeof createGameBootstrapAssets>;
type MapController = ReturnType<typeof createMapController>;
type Closable = { close: () => void };
type ProfileOpener = { open: (identity: string, name: string) => unknown; close: () => void };

export type GamePanelsDeps = {
  coop: CoopAccess;
  e: GameElements;
  itemInspection: ReturnType<typeof createItemInspectionController>;
  minimizeChat: () => void;
  mapGuide: () => Closable | undefined;
  slotUpgrades: () => Closable | undefined;
  researchRanks: () => ResearchRanks;
  showProgressCompletion: Parameters<typeof createProgressCompletionNotices>[2];
  profileWindow: ProfileOpener;
  closeIconPicker: () => void;
  clearInput: () => void;
  lowPerformanceMode: () => boolean;
  openGuildHall: () => void;
  assets: BootstrapAssets["assets"];
  playerAppearanceAssets: BootstrapAssets["playerAppearanceAssets"];
  leaderboardPodiumPreview: BootstrapAssets["leaderboardPodiumPreview"];
  paintProfileIconCanvas: ReturnType<typeof createPlayerIdentityRenderer>["paintProfileIconCanvas"];
  previewPrestigeUnlock: () => void;
  stopAutoFarm: (reason: string) => void;
  teleportToMap: MapController["teleportToMap"];
  /** What the developer panel's performance readout counts. */
  metrics: {
    performance: ReturnType<typeof createPerformanceMonitor>;
    enemies: readonly EnemyState[];
    projectiles: readonly unknown[];
    enemyShots: readonly unknown[];
    particles: readonly unknown[];
    canvasRuntime: ReturnType<typeof createCanvasRuntime>;
    canvas: HTMLCanvasElement;
  };
  showMessage: (text: string, color?: string) => void;
};

/**
 * Tech Research, the guild, the leaderboard and the developer panel, with the coordinator
 * that closes the others when one opens, and the notices for finished research and upgrades.
 */
export function createGamePanels(deps: GamePanelsDeps) {
  const { coop, e, showMessage } = deps;
  const client = coop.client;

  const panels = createPanelCoordinator({
    guild: () => guildPanel,
    mapGuide: deps.mapGuide,
    slotUpgrades: deps.slotUpgrades,
    techTree: () => techTree,
    devPanel: () => devPanel,
    closeLeaderboard,
    itemInspection: deps.itemInspection,
    minimizeMaximizedChat: deps.minimizeChat,
    settingsPanel: e.settingsPanel, inventoryPanel: e.inventoryPanel, settingsBtn: e.settingsBtn, inventoryBtn: e.inventoryBtn,
  });

  const progressNotices = createProgressCompletionNotices(e.inventoryBtn, () => client, deps.showProgressCompletion);
  const techTree = createTechTreePanel({
    e,
    researchRanks: deps.researchRanks,
    activeResearch: () => client?.activeResearch?.() ?? null,
    startResearch: async (id: ResearchId) => client?.startResearch?.(id),
    gemBalance: coop.gemBalance,
    speedUpResearch: async () => client?.speedUpResearchWithGems?.(),
    pausedResearch: () => client?.pausedResearch?.() ?? [],
    pauseResearch: async () => client?.pauseResearch?.(),
    ...progressNotices.researchHooks,
    showMessage,
    beforeOpen: () => panels.closeAllExcept("techTree"),
  });

  const openProfile = (identity: string, name: string) => { void deps.profileWindow.open(identity, name); };
  const guildPanel = createGuildPanel({
    onOpenPlayer: openProfile,
    lowPerformanceMode: deps.lowPerformanceMode, questStanding: () => guildQuestStandingFrom(client), openHall: deps.openGuildHall,
    replayAssets: {
      player: deps.playerAppearanceAssets, prepare: () => deps.assets.ensureMapAssets("home_exterior"),
      trees: deps.assets.treeSpritesheet, treeBounds: deps.assets.treeSpriteBounds,
    },
    api: () => client?.guild,
    sessionKey: () => `${coop.identity()}:${client?.sessionGeneration?.() ?? 0}:${client?.isConnected?.() ?? false}`,
    beforeOpen: () => {
      deps.clearInput();
      deps.profileWindow.close();
      deps.closeIconPicker();
      panels.closeAllExcept("guild");
    },
    onClose: () => { deps.clearInput(); },
  });

  const notConnected = () => new Error("Not connected. Try again.");
  const leaderboard = createLeaderboardPanel({ e, options: {
    loadPage: async (board: LeaderboardBoard, startRank = 0, count = 100) => {
      if (!client) throw notConnected();
      return client.loadLeaderboardPage(board, startRank, count);
    },
    localIdentity: () => coop.localIdentity() || "",
    isDeveloper: isDeveloperIdentity,
    paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => deps.paintProfileIconCanvas(canvas, coop.profileIcon(identity), identity),
    // Podium characters wear anyone's gear: wait until every piece has loaded.
    podiumAssetsReady: () => allPlayerPartsSettled(deps.playerAppearanceAssets),
    drawPodiumCharacter: (canvas: HTMLCanvasElement, entry: LeaderboardEntry, rank: 1 | 2 | 3) => deps.leaderboardPodiumPreview.draw(canvas, entry, rank),
    openProfile,
    loadPlayers: () => client?.social?.loadPlayerDirectory(),
    findPlayer: (board: LeaderboardBoard, identity: string) => client ? client.findLeaderboardSpot(board, identity) : Promise.reject(notConnected()),
    beforeOpen: () => panels.closeAllExcept("leaderboard"),
  } });

  function closeLeaderboard() {
    leaderboard.close();
  }

  // A developer teleport leaves the settings window it was started from.
  function closeAfterTeleport() {
    e.settingsPanel.hidden = true;
    e.settingsBtn.setAttribute("aria-expanded", "false");
    devPanel.close();
  }

  const { metrics } = deps;
  const devPanel = createDevPanel({
    coop: client,
    simulateTimeAway: async (seconds: number) => Boolean(await client?.simulateTimeAway?.(seconds)),
    offlineWindowRank: () => client?.research?.()?.offlineWindow ?? 0,
    previewPrestigeUnlock: deps.previewPrestigeUnlock,
    teleportPlayer: async (query: string) => {
      if (!client?.isDeveloper?.()) throw new Error("Developer access required.");
      const target = await client.findTeleportPlayer(query);
      deps.stopAutoFarm("Autofarm stopped for teleport");
      let failure = "Teleport unavailable. Try again.";
      const changed = await deps.teleportToMap(target.mapId as MapId, async () => {
        try { return await client.devTeleportToPlayer(target.identity, target.mapId); }
        catch (error) { failure = error instanceof Error ? error.message : failure; return false; }
      });
      if (!changed) throw new Error(failure);
      closeAfterTeleport();
    },
    teleportEndless: async (number: number) => {
      if (!client?.canTeleportEndless?.()) return false;
      deps.stopAutoFarm("Autofarm stopped for teleport");
      const changed = await deps.teleportToMap(proceduralMapId(number), async () => {
        const result = await client.devTeleportEndless(number);
        if (!result.ok && result.error) showMessage(result.error, "#ffbc91");
        return result.ok;
      });
      if (changed) closeAfterTeleport();
      return changed;
    },
    getMetrics: () => ({
      performance: metrics.performance.snapshot(),
      enemies: metrics.enemies.length,
      projectiles: metrics.projectiles.length + metrics.enemyShots.length,
      particles: metrics.particles.length,
      remotePlayers: client?.remotePlayerCount?.() ?? 0,
      dpr: metrics.canvasRuntime.dpr(),
      canvasWidth: metrics.canvas.width,
      canvasHeight: metrics.canvas.height,
      subscriptions: client?.subscriptionCount?.() ?? 0,
    }),
    closeCompetingWindows: () => panels.closeAllExcept("devPanel"),
    showMessage,
  });

  return { panels, progressNotices, techTree, guildPanel, leaderboard, closeLeaderboard, devPanel };
}

export type MapGuidePanelDeps = {
  coop: CoopAccess;
  e: GameElements;
  currentMapId: () => MapId;
  mapName: (mapId: MapId) => string;
  inventory: InventoryState;
  world: Pick<ReturnType<typeof createGameBootstrap>, "paths" | "enemies" | "spawnSites" | "bosses">;
  player: PlayerState;
  rewardDisplay: ReturnType<typeof createRewardDisplay>;
  rewardContext: () => RewardLabelContext;
  mapController: MapController;
  proceduralBoss: ReturnType<typeof createProceduralBossController>;
  profileWindow: ProfileOpener;
  closeCompetingWindows: () => void;
  clearInput: () => void;
  power: () => number;
  prestigeExpanded: ReturnType<typeof createPrestigeExpansionRuntime>["unlocked"];
  preferTravel: ReturnType<typeof createTravelController>["prefer"];
  villageGround: () => HTMLImageElement | undefined;
};

/** The map guide behind the minimap: the map's zones, drops and Enemy Index, its boss and portals, and travel. */
export function createMapGuidePanel(deps: MapGuidePanelDeps) {
  const { coop, e, inventory, player, mapController } = deps;
  const { paths, enemies, spawnSites, bosses } = deps.world;
  return createMapGuideController({
    trigger: e.minimapButton,
    overlay: e.mapGuideEl,
    title: e.mapGuideTitle,
    canvas: e.mapGuideCanvas,
    zoneLabels: e.mapGuideZoneLabels,
    dropItems: e.mapGuideDropItems,
    back: e.mapGuideBack,
  }, {
    currentMapId: deps.currentMapId,
    mapName: deps.mapName,
    collected: itemId => Boolean(coop.client?.collectedItems?.().has(itemId)) || inventory.itemIds.includes(itemId),
    paths, enemies, rewardAmount: deps.rewardDisplay.displayedAmount, rewardContext: deps.rewardContext,
    mapUnlocked: mapId => mapController.portalIsUnlocked({ destination: mapId } as never),
    mapBalance: mapId => coop.client?.mapIndexBalance?.(mapId) ?? Promise.resolve(null),
    spawnSites,
    player,
    boss: () => {
      const currentMapId = deps.currentMapId();
      if (isProceduralMap(currentMapId)) {
        const target = deps.proceduralBoss.boss();
        return target ? { x: target.x, y: target.y, name: target.campName, dead: target.dead } : null;
      }
      const mapBoss = bossForMap(currentMapId);
      return mapBoss && { x: bosses[mapBoss.kind].x, y: bosses[mapBoss.kind].y, name: mapBoss.name, dead: bosses[mapBoss.kind].dead };
    },
    portals: () => {
      const portals = [mapController.activePortal()];
      const secondary = mapController.secondaryPortal();
      if (secondary) portals.push(secondary);
      return portals.filter((portal): portal is NonNullable<typeof portal> => portal !== null)
        .map(portal => ({ x: portal.x, y: portal.y, destination: portal.destination, unlocked: mapController.portalIsUnlocked(portal) }));
    },
    villageGround: deps.villageGround,
    beforeOpen: () => {
      deps.profileWindow.close();
      deps.closeCompetingWindows();
    },
    clearPlayerInput: deps.clearInput, power: deps.power, progress: coop.client, prestigeExpanded: deps.prestigeExpanded,
    travel: {
      prefer: deps.preferTravel,
      // From the Town through its portal at once; from anywhere else straight there, with the portal's checks.
      travel: mapId => deps.currentMapId() === "town" ? mapController.travelFromHome(mapId, true)
        : mapController.teleportToMap(mapId, async () => Boolean(await coop.client?.travelToMap?.(mapId))),
    },
  });
}
