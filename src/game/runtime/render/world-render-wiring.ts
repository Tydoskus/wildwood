import { weaponAttackRange } from "../../weapon-combat";
import { equipmentAppearance } from "../../inventory";
import { distanceSquared } from "../../math";
import { INFERNAL_DEPTHS_MAP_ID, type MapId } from "../../world";
import { BOSS_HP_LOSS_FLASH_DURATION, SPIDER_WEB_RANGE } from "../boss/boss-controller";
import type { createProceduralBossController } from "../boss/procedural-boss-controller";
import type { createCombatEffects } from "../combat-effects";
import type { CoopAccess } from "../coop-access";
import type { createEnemySimulation } from "../enemies/enemy-simulation";
import type { createLocalCorpses } from "../enemies/local-corpses";
import type { createGameBootstrap, createGameBootstrapAssets } from "../game-bootstrap";
import { ENEMY_TEXT_CULL_MIN_DISTANCE, WORLD_HEALTH_BAR_HEIGHT } from "../game-settings";
import type { createMapController } from "../map-controller";
import type { PlayerController } from "../player-controller";
import type { PlayerDeathAnimationState } from "../player-death-animation";
import type { createRewardDisplay } from "../reward-display";
import type { RewardLabelContext } from "../reward-labels";
import type { DuelScene } from "../types";
import type { createDuelRuntime } from "../duel/duel-runtime";
import type { createCamera } from "./camera";
import type { createCanvasRuntime } from "./canvas-runtime";
import type { createPlayerIdentityRenderer } from "./player-identity-renderer";
import { createWorldRenderRuntime, type WorldRenderRuntimeOptions } from "./world-render-runtime";

type CanvasRuntime = ReturnType<typeof createCanvasRuntime>;
type GameBootstrap = ReturnType<typeof createGameBootstrap>;
type BootstrapAssets = ReturnType<typeof createGameBootstrapAssets>;
type MapController = ReturnType<typeof createMapController>;
type MinimapBounds = { left: number; top: number; width: number; height: number };

/**
 * Keeps the minimap button's box in canvas pixels, so the map texture lines up under it.
 * Returns the latest box, or null while the canvas has no size.
 */
export function watchMinimapBounds(canvas: HTMLCanvasElement, minimapButton: HTMLElement, canvasRuntime: CanvasRuntime) {
  let cachedBounds: MinimapBounds | null = null;
  let refreshFrame = 0;
  const refresh = () => {
    refreshFrame = 0;
    const minimap = minimapButton.getBoundingClientRect();
    const surface = canvas.getBoundingClientRect();
    if (surface.width <= 0 || surface.height <= 0) {
      cachedBounds = null;
      return;
    }
    const view = canvasRuntime.renderViewport();
    const scaleX = view.width / surface.width;
    const scaleY = view.height / surface.height;
    // Match the map texture to the button's inner box. The DOM rect includes
    // the 2px frame, which lets the canvas layer bleed past that frame on
    // fractional/mobile scaling and makes it appear shifted to the right.
    cachedBounds = {
      left: (minimap.left - surface.left + minimapButton.clientLeft) * scaleX,
      top: (minimap.top - surface.top + minimapButton.clientTop) * scaleY,
      width: minimapButton.clientWidth * scaleX,
      height: minimapButton.clientHeight * scaleY,
    };
  };
  const scheduleRefresh = () => {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(refresh);
  };
  window.addEventListener("resize", scheduleRefresh);
  window.visualViewport?.addEventListener("resize", scheduleRefresh);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleRefresh);
    observer.observe(canvas);
    observer.observe(minimapButton);
  }
  refresh();
  return () => cachedBounds;
}

export type WorldRenderingDeps = {
  coop: CoopAccess;
  canvasRuntime: CanvasRuntime;
  staticWorldLayer: WorldRenderRuntimeOptions["staticWorldLayer"];
  camera: ReturnType<typeof createCamera>;
  minimapBounds: () => MinimapBounds | null;
  world: GameBootstrap;
  currentMapId: () => MapId;
  gameTime: () => number;
  localDeath: () => PlayerDeathAnimationState | null;
  localCorpses: ReturnType<typeof createLocalCorpses>;
  isArenaScene: () => boolean;
  remoteEnemies: WorldRenderRuntimeOptions["remoteEnemies"];
  mapController: MapController;
  proceduralBoss: ReturnType<typeof createProceduralBossController>;
  bootstrapAssets: BootstrapAssets;
  /** The Town stations' timers drawn over them in the world; those created later are read when drawn. */
  stationStatus: {
    slotUpgrades: WorldRenderRuntimeOptions["slotUpgradesStatus"];
    research: NonNullable<WorldRenderRuntimeOptions["researchStatus"]>;
    questBoard: NonNullable<WorldRenderRuntimeOptions["questBoardStatus"]>;
  };
  rewardDisplay: ReturnType<typeof createRewardDisplay>;
  rewardContext: () => RewardLabelContext;
  bossHitboxesVisible: () => boolean;
  identityRenderer: ReturnType<typeof createPlayerIdentityRenderer>;
  playerPower: WorldRenderRuntimeOptions["playerPower"];
  lowPerformanceMode: () => boolean;
};

/** The world renderer: ground, decor, actors, bosses and portals, drawn from the live game state. */
export function createWorldRendering(deps: WorldRenderingDeps) {
  const { coop, canvasRuntime, camera, mapController, currentMapId } = deps;
  const { paths, decor, enemies, player, bosses, bossHazards, inventory, mapConfig } = deps.world;
  const { assets, actorShadowSprite, playerAppearanceAssets, enemySprites } = deps.bootstrapAssets;
  const { drawActorStatus, drawPlayerIdentity, drawSpeechBubble, drawAbovePlate, publicPlayerName } = deps.identityRenderer;
  return createWorldRenderRuntime({
    drawMapHazards: () => deps.proceduralBoss.draw(canvasRuntime.ctx, camera),
    ctx: canvasRuntime.ctx,
    worldContext: canvasRuntime.worldContext,
    staticWorldLayer: deps.staticWorldLayer,
    camera,
    viewport: canvasRuntime.renderViewport,
    minimapBounds: deps.minimapBounds,
    devicePixelRatio: canvasRuntime.dpr,
    currentMapId,
    gameTime: deps.gameTime,
    nowMs: () => performance.now(),
    localDeath: deps.localDeath,
    remoteDeath: identity => deps.localCorpses.death(identity, currentMapId(), performance.now())
      ?? coop.client?.remotePlayerDeath?.(identity) ?? null,
    isArenaScene: deps.isArenaScene,
    mapName: mapId => mapConfig[mapId].name,
    infernalMapId: INFERNAL_DEPTHS_MAP_ID,
    paths,
    decor,
    enemies,
    remoteEnemies: deps.remoteEnemies,
    player,
    bosses,
    bossHazards,
    activePortal: mapController.activePortal,
    cutscenePortal: () => mapController.cutscenePortal(),
    secondaryPortal: mapController.secondaryPortal,
    portalIsUnlocked: mapController.portalIsUnlocked,
    portalRevealIntensity: () => mapController.portalRevealIntensity(),
    portalDestinationOpacity: () => mapController.portalDestinationOpacity(),
    assets,
    actorShadowSprite,
    slotUpgradesStatus: deps.stationStatus.slotUpgrades,
    researchStatus: deps.stationStatus.research,
    questBoardStatus: deps.stationStatus.questBoard,
    drawShadow: canvasRuntime.drawActorShadow,
    pixelCircle: canvasRuntime.pixelCircle,
    outlinedText: canvasRuntime.outlinedWorldText,
    outlinedSegments: canvasRuntime.outlinedWorldSegments,
    fillText: canvasRuntime.fillWorldText,
    bossHpLossFlashDuration: BOSS_HP_LOSS_FLASH_DURATION,
    spiderWebRange: SPIDER_WEB_RANGE,
    playerAppearanceAssets,
    skinTone: identity => coop.client?.skinTone?.(identity),
    equippedItems: () => {
      const appearance = equipmentAppearance(inventory);
      return {
        head: appearance.headItem, chest: appearance.chestItem, feet: appearance.feetItem,
        rightHand: appearance.rightHandItem, leftHand: appearance.leftHandItem,
        weapon: inventory.equippedRightHand || inventory.equippedLeftHand,
      };
    },
    equipmentForIdentity: identity => {
      if (coop.isLocal(identity)) return equipmentAppearance(inventory);
      const remote = coop.client?.remotePlayers?.().find(other => other.id === identity);
      return remote ? {
        headItem: remote.headItem, chestItem: remote.chestItem, feetItem: remote.feetItem,
        rightHandItem: remote.rightHandItem, leftHandItem: remote.leftHandItem,
      } : {};
    },
    enemySprites,
    rewardMultiplier: deps.rewardDisplay.displayedMultiplier,
    rewardAmount: deps.rewardDisplay.displayedAmount, rewardContext: deps.rewardContext,
    showBossHitboxes: deps.bossHitboxesVisible,
    enemyTextVisible: enemy => {
      const { width, height } = canvasRuntime.viewport();
      const screenRadius = Math.hypot(width, height) / (2 * camera.zoom);
      const cullDistance = Math.max(ENEMY_TEXT_CULL_MIN_DISTANCE, screenRadius + 80);
      return distanceSquared(player, enemy) <= cullDistance * cullDistance;
    },
    drawStatus: drawActorStatus,
    drawIdentity: drawPlayerIdentity,
    drawSpeechBubble,
    drawAbovePlate,
    publicPlayerName,
    playerPower: deps.playerPower,
    worldHealthBarHeight: WORLD_HEALTH_BAR_HEIGHT, lowPerformanceMode: deps.lowPerformanceMode,
  });
}

export type WorldFrameRendererDeps = {
  coop: CoopAccess;
  world: GameBootstrap;
  effects: ReturnType<typeof createCombatEffects>;
  currentMapId: () => MapId;
  inTutorial: () => boolean;
  enemySimulation: ReturnType<typeof createEnemySimulation>;
  localCorpses: ReturnType<typeof createLocalCorpses>;
  localDeath: () => PlayerDeathAnimationState | null;
  isDueling: () => boolean;
  isArenaScene: () => boolean;
  duelAssetsReady: () => boolean;
  duelRuntime: ReturnType<typeof createDuelRuntime>;
  playerController: Pick<PlayerController, "isDuelResultHeld">;
  heldDuelScene: () => DuelScene | null;
  setRenderedDuelScene: (scene: DuelScene | null) => void;
  setDuelCountdown: (countdown: number) => void;
  settingsPanel: HTMLElement;
  inventoryPanel: HTMLElement;
  leaderboard: { isOpen: () => boolean; drawPodium: () => void };
  profileWindow: { drawPreview: () => void };
  inventoryCharacterPreview: BootstrapAssets["inventoryCharacterPreview"];
  powerForEquipment: (equipment: GameBootstrap["inventory"]) => number;
  updateSpeechBubbles: () => void;
  mapController: MapController;
  attackRangeVisible: () => boolean;
};

/** Each frame's drawing: the world or a duel scene, other players and corpses, and the windows' character previews. */
export function createWorldFrameRenderer(worldRendering: ReturnType<typeof createWorldRendering>, deps: WorldFrameRendererDeps) {
  const { coop, effects, currentMapId, duelRuntime, mapController } = deps;
  const { bootsPickup, inventory, player, projectiles, enemyShots } = deps.world;
  const client = coop.client;
  return worldRendering.createFrameRenderer({
    bootsPickup,
    remotePlayers: () => deps.inTutorial() || coop.localState()?.mapId !== currentMapId() ? [] : [
      ...deps.enemySimulation.renderRemotePlayers(coop.remotePlayers())
        .filter(other => !client?.remotePlayerDeath?.(other.id)),
      ...(client?.remotePlayerCorpses?.() ?? []),
      ...deps.localCorpses.players(coop.identity(), currentMapId(), performance.now(), deps.localDeath()),
    ],
    mapPlayerMarkers: () => deps.inTutorial() ? [] : client?.mapPlayerMarkers?.() ?? [],
    isDueling: deps.isDueling,
    isArenaScene: deps.isArenaScene,
    duelAssetsReady: deps.duelAssetsReady,
    isReplayActive: () => duelRuntime.isReplayActive(),
    replayScene: () => duelRuntime.replayScene(),
    liveScene: () => duelRuntime.liveScene(),
    heldScene: deps.heldDuelScene,
    duelResultHeld: () => deps.playerController.isDuelResultHeld(),
    setRenderedDuelScene: deps.setRenderedDuelScene,
    setDuelCountdown: deps.setDuelCountdown,
    worldOccluded: () => !deps.settingsPanel.hidden || !deps.inventoryPanel.hidden || deps.leaderboard.isOpen(),
    drawProfileCharacterPreview: () => {
      if (!deps.settingsPanel.hidden) return;
      deps.profileWindow.drawPreview();
      deps.leaderboard.drawPodium();
      if (!deps.inventoryPanel.hidden) deps.inventoryCharacterPreview.draw({
        visible: true,
        inventory,
        power: deps.powerForEquipment(inventory),
        skinTone: coop.skinTone(),
      });
    },
    updateSpeechBubbles: deps.updateSpeechBubbles,
    localIdentity: coop.localIdentity,
    localDisplayName: coop.localDisplayName,
    drawParticles: effects.drawParticles,
    drawDamageNumbers: (context, activeCamera, outlined, devicePixelRatio) => effects.drawDamageNumbers(context, activeCamera, outlined, devicePixelRatio),
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    portalBlackoutOpacity: () => mapController.portalBlackoutOpacity(),
    attackRangeVisible: deps.attackRangeVisible,
    weaponAttackRange: () => weaponAttackRange(inventory.equippedRightHand || inventory.equippedLeftHand, player.attackRange),
    projectiles,
    enemyShots,
    particles: effects.particles,
  });
}
