import { installOfflineProgressSetting } from "./ui/offline-progress-setting";
import { rewardLabelContextFrom } from "./game/runtime/reward-labels";
import { runtimeMapBalance } from "../shared/map-balance-runtime";
import { installStatTracker } from "./ui/stat-tracker";
import { installGraphicsReport } from "./app/graphics-report";
import { installQuestTracker } from "./ui/quest-tracker";
import { createStatTrackerSource } from "./ui/stat-tracker-source";
import { refreshMapBalanceEnemies } from "./game/runtime/enemies/map-balance-enemies";
import { createMapBalanceLoader } from "./game/runtime/map-balance-loader";
import { createDiamondLookDrawer } from "./game/runtime/diamond-look-preview";
import { installAccountDeletion } from "./ui/account-deletion-controller";
import { MAP_IDS as CAMPAIGN_MAP_IDS } from "../shared/rules";
import { weaponAttackRange } from "./game/weapon-combat";
import { createPlayerVisibilityToggle } from "./ui/player-visibility-toggle";
import { createFullscreenMovementGate } from "./ui/fullscreen-movement";
import { installGameTicker } from "./ui/game-ticker";
import { createPersonalBosses } from "./game/runtime/boss/personal-bosses";
import { createLocalCorpses } from "./game/runtime/enemies/local-corpses";
import { ONBOARDING_MAP_ID, ONBOARDING_WORLD } from "../shared/onboarding";
import { createPlayerStatsRuntime } from "./game/runtime/player-stats-runtime";
import { isProceduralMap } from "../shared/procedural-maps";
import { createPrestigeExpansionRuntime } from "./ui/prestige-expansion-runtime";
import { createProceduralBossController } from "./game/runtime/boss/procedural-boss-controller";
import { bindPlayerNameTags } from "./app/player-name-tags";
import { bindAvatarFrames } from "./app/avatar-frames";
import { isSoulMap } from "../shared/soul-dimension";
import { worldBoundsFor } from "../shared/world-bounds";
import { paintTownTeleportButton } from "./ui/town-teleport-button";
import { isDeveloperIdentity } from "./app/developer";
import { WORLD } from "./game/constants";
import { equipmentAppearance, patreonLooks } from "./game/inventory";
import { createMapMusicController } from "./game/runtime/audio";
import { createCamera } from "./game/runtime/render/camera";
import { createCombatEffects } from "./game/runtime/combat-effects";
import { createEnemyLifecycle } from "./game/runtime/enemies/enemy-lifecycle";
import { createEnemySimulation } from "./game/runtime/enemies/enemy-simulation";
import { claimCoopClient } from "./game/runtime/coop-session-controller";
import { createProgressController } from "./game/runtime/progress-controller";
import { createCoopAccess } from "./game/runtime/coop-access";
import { createTownRuntimes } from "./game/runtime/town-runtimes";
import { createCoopSessionWiring } from "./game/runtime/coop-session-wiring";
import { createPlayerCombat } from "./game/runtime/player-combat-wiring";
import { createAutoFarm } from "./game/runtime/auto-farm/auto-farm-wiring";
import { createInventoryRuntime } from "./ui/inventory-runtime";
import { createDisplayedPower } from "./game/runtime/displayed-power";
import { createPlayerIdentityRendering } from "./game/runtime/render/player-identity-wiring";
import { createDuelPlayback, createDuelSession } from "./game/runtime/duel/duel-wiring";
import { createLocalPlayer } from "./game/runtime/player-controller-wiring";
import { createGameSession } from "./game/runtime/game-session-wiring";
import { createGameActions } from "./ui/game-actions-wiring";
import { createWorldPlaces } from "./game/runtime/world-places";
import { createMapAssetLoading } from "./game/runtime/render/map-asset-loading";
import { createWorldFrameRenderer, createWorldRendering, watchMinimapBounds } from "./game/runtime/render/world-render-wiring";
import { createProfileRuntime } from "./ui/profile-runtime";
import { createGamePanels, createMapGuidePanel } from "./ui/game-panels";
import { createGiftsAndMail, createHudRuntime } from "./ui/hud-runtime";
import { createReconnectOverlay, type FarmConnection } from "./ui/reconnect-overlay";
import { createOnboardingRuntime } from "./ui/onboarding-runtime";
import { beginNewPlayer, createStartupCoordination, createStartupScreen, type StartupCoordinator } from "./ui/startup-runtime";
import { createPerformanceMonitor } from "./game/runtime/performance-monitor";
import { createPresentationInterpolator } from "./game/runtime/render/presentation-interpolator";
import { createGameBootstrap, createGameBootstrapAssets, startGameRuntime } from "./game/runtime/game-bootstrap";
import { scheduleBackgroundTask } from "./game/runtime/scheduler";
import { displayedPlayerPowerProgress } from "./game/runtime/render/player-identity-renderer";
import type { PlayerDeathAnimationState } from "./game/runtime/player-death-animation";
import { createCanvasRuntime, gameplayBottomInset } from "./game/runtime/render/canvas-runtime";
import { APP_SHELL_STORAGE_KEYS, GAME_VERSION, MUSIC_VOLUME_KEY, SFX_VOLUME_KEY } from "./game/runtime/game-settings";
import { createBossController } from "./game/runtime/boss/boss-controller";
import { BOSSES, BOSS_KINDS } from "./game/runtime/boss/boss-registry";
import { createMapController } from "./game/runtime/map-controller";
import { createPlayerInputController } from "./game/runtime/player-input-controller";
import { createAutoFarmPanel } from "./ui/auto-farm-panel";
import { applyPlayerMaxHealthMultiplierBonus } from "./game/runtime/player-health";
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from "./game/runtime/enemies/regular-enemy-respawn";
import { createRespawnMemory } from "./game/runtime/respawn-memory";
import { createBossFightMemory } from "./game/runtime/boss/boss-fight-memory";
import { createResearchController } from "./game/runtime/research-controller";
import { createWebGLStaticWorldLayer } from "./game/runtime/render/webgl-static-world-layer";
import { PLAYER_SKIN_TONES, PLAYER_SKIN_TONE_NAMES, warmPlayerAppearanceCache } from "./game/player-appearance";
import type { DuelScene } from "./game/runtime/types";
import {
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
} from "./game/world";
import { createChatRuntimeController } from "./ui/chat-runtime-controller";
import { campaignMapUnlocked } from "../shared/equipment-access";
import { createAppShellController } from "./ui/app-shell-controller";
import { createDeathScreenController } from "./ui/death-screen-controller";
import { createGameElements } from "./ui/game-elements";
import { bindGameInteractionListeners } from "./ui/game-interaction-bindings";
import { createDuplicateLoginRuntime, createGameOverlays, createPrestigeUnlockRuntime } from "./ui/game-ui-runtime";
import { refreshWalletCounters } from "./ui/gold-counter";
import { createRewardDisplay } from "./game/runtime/reward-display";
import { onwardCue } from "./game/runtime/onward-cue";
import { bossPortalCutscenes } from "./game/runtime/boss/boss-portal-cutscenes";
import { MAX_PLAYER_STAT, PLAYER_SPAWN } from "../shared/rules";

(() => {
  "use strict";

  // Set only by Run Wildstat Local.command. Release builds do not receive it.
  const localTestMultiplier = import.meta.env.VITE_LOCAL_TESTING === "1" ? 3 : 1;

  // Architecture boundary: keep this file as composition root. New systems
  // belong in src/game, src/ui, or src/app and are only wired here.

  const gameElements = createGameElements({ names: PLAYER_SKIN_TONE_NAMES, colors: PLAYER_SKIN_TONES });
  const {
    canvas, gameOverEl, deathCountdownEl, hpText, playerHudProfileIcon, playerHudProfileGear,
    minimapButton, toolbar, settingsBtn, settingsPanel, inventoryPanel, inventoryCharacterCanvas,
    joystickEl, stickEl, duelResultEl, watchDuelReplayBtn, cutsceneOverlayEl,
    playerProfileEl, playerProfileIcon, profileCharacterCanvas, closeProfileIconPickerBtn,
  } = gameElements;
  const staticWorldLayer = createWebGLStaticWorldLayer(canvas);
  const canvasRuntime = createCanvasRuntime({
    canvas,
    transparent: Boolean(staticWorldLayer),
    bottomInset: () => gameplayBottomInset(toolbar.getBoundingClientRect().height,
      document.body.matches(".is-cutscene, .is-replaying, .is-onboarding")),
    getActorShadowSprite: () => bootstrapAssets.actorShadowSprite,
  });
  const { coop, gameBridge } = claimCoopClient(() => session?.simulatedSeconds() ?? 0);
  const coopAccess = createCoopAccess(coop);
  if (coop) bindPlayerNameTags({
    prefix: identity => coop.playerNamePrefix(identity), revision: () => coop.playerNameTagsRevision(),
    guildTag: identity => coop.playerGuildTag(identity),
    prestigeLevel: identity => (identity && coop.prestigeLevelFor?.(identity)) || 0,
  });
  if (coop) bindAvatarFrames(coop.applyAvatarFrame);
  const gameplayReadyTelemetry = coop?.beginStartupTelemetryStage?.("gameplay-ready");
  let gameplayReadyRecorded = false;
  function recordGameplayReady() {
    if (gameplayReadyRecorded) return;
    gameplayReadyRecorded = true;
    gameplayReadyTelemetry?.finish();
  }
  function refreshGemCounter() {
    refreshWalletCounters(gameElements, coopAccess.gemBalance(), coop?.gold?.() ?? 0n);
  }
  refreshGemCounter();
  const overlays = createGameOverlays({
    e: gameElements, coop, version: GAME_VERSION,
    applyProfileIcon: (element: HTMLElement, index: number, identity?: string) => applyProfileIcon(element, index, identity), showMessage,
    afterIconSet: () => {
      applyProfileIcon(playerHudProfileIcon, coopAccess.profileIcon(), coopAccess.localIdentity());
      if (profileWindow.identity() === coopAccess.localIdentity()) {
        applyProfileIcon(playerProfileIcon, coopAccess.profileIcon(), coopAccess.localIdentity());
      }
    },
  });

  // Created once everything it starts exists; until then a startup step has nothing to advance.
  let startupCoordinator: StartupCoordinator | undefined;
  const localCorpses = createLocalCorpses();
  let localPlayerDeath: PlayerDeathAnimationState | null = null;

  const deathScreen = createDeathScreenController({
    screen: gameOverEl,
    countdown: deathCountdownEl,
    onRespawn: () => { startGame(false, false); void soulDimension.afterRespawn(); },
  });

  const mapMusic = createMapMusicController(MUSIC_VOLUME_KEY, SFX_VOLUME_KEY);

  function syncMapMusic() {
    mapMusic.syncMap(currentMapId);
  }

  const camera = createCamera();
  const effects = createCombatEffects();
  const performanceMonitor = createPerformanceMonitor();
  const { particles, damageNumbers, spawnBurst, spawnDamageNumber } = effects;
  const bootstrap = createGameBootstrap();
  const {
    bosses, bossHazards, bootsPickup, enemies, enemyShots, inventory, mapConfig: MAP_CONFIG, player, projectiles, projectileStore, spawnSites,
  } = bootstrap;
  const presentation = createPresentationInterpolator({
    singletons: [camera, player, ...BOSS_KINDS.map((kind) => bosses[kind])],
    collections: [enemies, projectiles, enemyShots, ...BOSS_KINDS.map((kind) => bossHazards[kind]), particles, damageNumbers],
  });
  // The live player's final stats (shared/player-stats.ts): max health's bonus, regen and move speed are read from here.
  const playerStats = createPlayerStatsRuntime({ player, inventory, source: () => coop, soul: () => soulDimension.inPlay(),
    tailwind: () => playerCombat?.tailwind() ?? 0, isDueling: () => isDueling() });
  const { healthMultiplierBonus, regenerationPerSecond } = playerStats;
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const respawnMemory = createRespawnMemory(localStorage, coopAccess.identity);
  const bossFightMemory = createBossFightMemory(localStorage, coopAccess.identity);
  window.addEventListener("pagehide", bossFightMemory.flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) bossFightMemory.flush(); });
  const enemyRespawnKey = (site: typeof spawnSites[number]) => `enemy:${currentMapId}:${site.id}:${site.type}:${site.campName}`;
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, spawnBurst, {
    remaining: site => respawnMemory.remaining(enemyRespawnKey(site)),
    gameTime: () => session?.gameTime() ?? 0,
  });
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;
  const mapBalance = createMapBalanceLoader({
    identity: coopAccess.identity,
    mapId: () => coopAccess.localState()?.mapId ?? "",
    fetch: mapId => coop!.getMapBalance(mapId),
    changed: snapshot => {
      if (snapshot.mapId === currentMapId) refreshMapBalanceEnemies(snapshot, spawnSites, enemies);
      startup.refreshLoading(); finishStartup();
    },
  });
  function mapBalanceReady() {
    if (mapBalance.ready(currentMapId)) return true;
    void mapBalance.ensure(currentMapId).catch(() => {});
    return false;
  }
  let onboarding: ReturnType<typeof createOnboardingRuntime> | undefined;
  const inTutorial = () => currentMapId === ONBOARDING_MAP_ID;

  function setCurrentMap(mapId: MapId) {
    currentMapId = mapId;
    WORLD.w = mapId === ONBOARDING_MAP_ID ? ONBOARDING_WORLD.width : worldBoundsFor(mapId).width;
    WORLD.h = mapId === ONBOARDING_MAP_ID ? ONBOARDING_WORLD.height : worldBoundsFor(mapId).height;
    void mapAssets.prepare(mapId).catch(() => {});
    mapAssets.preloadAdjacent(mapId);
    // The button always leaves the current map, so it names the destination: Town, or Fight in the Town.
    paintTownTeleportButton(gameElements.townButton, mapId);
  }

  function mapNameForPresence(mapId: string | undefined) {
    return mapId && mapId in MAP_CONFIG ? MAP_CONFIG[mapId as MapId].name : "";
  }

  function startupMapAssetsReady() {
    const serverMapId = coopAccess.localState()?.mapId;
    if (!serverMapId) return false;
    const mapId = serverMapId in MAP_CONFIG ? serverMapId as MapId : currentMapId;
    void mapAssets.prepare(mapId).catch(() => {});
    return assets.mapAssetsReady(mapId) && mapBalance.ready(mapId);
  }

  let totalKills = 0;
  let heldDuelScene: DuelScene | null = null;
  let renderedDuelScene: DuelScene | null = null;
  let session: ReturnType<typeof createGameSession>;
  const gameplayPauseReasons = new Set<string>();

  function applyGameplayPauseState() {
    if (!session?.isRunning()) return;
    const shouldPause = gameplayPauseReasons.size > 0;
    if (session.isPaused() === shouldPause) return;
    session.setPaused(shouldPause);
    if (!shouldPause) session.refreshFrameClock();
  }

  // Only states the game can't be played through pause it; menus and windows never do.
  function setGameplayPause(reason: string, active: boolean) {
    if (active) gameplayPauseReasons.add(reason);
    else gameplayPauseReasons.delete(reason);
    applyGameplayPauseState();
  }

  const regularEnemyRespawn = createRegularEnemyRespawn(
    () => session.gameTime(),
    localTestMultiplier,
    () => runtimeMapBalance(currentMapId)?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS,
    () => coop?.researchInPlay?.()?.enemyRespawn ?? 0, () => coop?.activeCardStats?.().respawn ?? 0,
  );

  const duelSession = createDuelSession({
    coop: coopAccess, camera, player, profileElement: playerProfileEl, renderedDuelScene: () => renderedDuelScene,
    later: {
      duelRuntime: () => duelRuntime, playerController: () => playerController, session: () => session,
      showDuelResult: replay => runtimeHud.showDuelResult(replay), showDuelResultUnavailable: () => runtimeHud.showDuelResultUnavailable(),
      selfProfileTapEnabled: () => appShell.selfProfileTapEnabled(), publicPlayerName: (identity, name) => publicPlayerName(identity, name),
      openProfile: (identity, name) => { void profileWindow.open(identity, name); },
    },
  });
  const { isDueling, isArenaScene, fadeToWorld, leaveDuelResult, openPlayerAtScreenPoint } = duelSession;

  const appShell = createAppShellController({
    mapMusic,
    storageKeys: APP_SHELL_STORAGE_KEYS,
    accountAudio: coop?.accountAudio,
    connected: coopAccess.connected,
    latencyMs: () => coop?.latencyMs?.(),
    accountState: coopAccess.accountState,
    signIn: () => { void coop?.signIn?.(); },
    signOut: () => { coop?.signOut?.(); },
    canPlayMusic: () => !gameplayPauseReasons.has("rewarded-ad"),
    onLowPerformanceChanged: () => { session.resetFrameSchedule(); },
    onGpuChanged: () => { staticWorldLayer?.rebuild?.(); },
    onWebGLChanged: on => { staticWorldLayer?.setWanted?.(on); },
    showMessage,
  });

  installAccountDeletion(document, {
    identity: coopAccess.identity,
    request: async () => await coop?.requestAccountDeletion?.() ?? { ok: false, error: "Connect to your character first." },
  });

  const startupScreen = createStartupScreen({
    coop: coopAccess, progressLoaded: () => progress.isLoaded(), playerSpriteReady: () => playerSpriteReady(),
    worldArtReady: () => assets.worldArtReady(), currentMapReady: startupMapAssetsReady, finishStartup,
    showUpdateNotice: showCurrentUpdateNotice, startGame, coordinator: () => startupCoordinator, showMessage,
  });
  const { startup } = startupScreen;

  let progress: ReturnType<typeof createProgressController>;
  const equipmentMoveSpeed = () => progress.movementSpeedForEquipment(false) * localTestMultiplier;
  const powerForEquipment = createDisplayedPower({
    coop: coopAccess, player, research: () => research, soulCritDamage: () => soulDimension.critDamage(),
  });
  const { itemInspection: itemInspectionController, inventoryController } = createInventoryRuntime({
    coop: coopAccess, e: gameElements, inventory, player, healthMultiplierBonus, equipmentMoveSpeed, applyEquipmentStats,
    powerForEquipment, isDueling, saveProgress, showMessage,
  });
  const renderInventory = inventoryController.render;
  const playerInput = createPlayerInputController({
    canvas,
    joystick: joystickEl,
    stick: stickEl,
    running: () => session.isRunning(),
    onTapPlayer: (x, y) => !inTutorial() ? openPlayerAtScreenPoint(x, y) : false,
    onEscape: () => inTutorial() && playerProfileEl.hidden ? true : handleInputEscape(),
    desktop: {
      canMove: () => Boolean(session?.isRunning()) && !session.isPaused() && player.hp > 0 && !isArenaScene()
        && !mapController.isMapTransitioning() && !mapController.isCutsceneActive() && !onboarding?.blocksInput(),
      player: () => player, speed: () => playerStats.moveSpeed(),
      view: () => ({ ...camera, ...canvasRuntime.viewport() }),
      bounds: () => ({ width: WORLD.w, height: WORLD.h, inset: player.r }),
    },
  });
  const fullscreenMovement = createFullscreenMovementGate(visible => coop?.setRemotePlayersVisible(visible));
  const playerVisibility = createPlayerVisibilityToggle({
    button: gameElements.playerVisibilityToggle,
    setVisible: visible => { coop?.setMultiplayerEnabled(visible); fullscreenMovement.setWanted(visible); },
    setReceiving: on => fullscreenMovement.setWanted(on), setShown: shown => coop?.setPresenceShown?.(shown), storage: localStorage,
  });
  let farmConnection: FarmConnection = "recovering";
  const { autoFarm, farmUnlocked, farmUnavailable } = createAutoFarm({
    coop: coopAccess, world: bootstrap, currentMapId: () => currentMapId, isArenaScene, moveSpeed: () => playerStats.moveSpeed(),
    connection: () => farmConnection,
    later: {
      session: () => session, mapController: () => mapController, proceduralBoss: () => proceduralBoss,
      playerCombat: () => playerCombat, research: () => research, soulCritDamage: () => soulDimension.critDamage(),
      rewardContext: () => rewardLabelContext(),
    },
  });
  let playerCombat: ReturnType<typeof createPlayerCombat>;
  const personalBosses = createPersonalBosses({
    respawns: respawnMemory,
    fights: bossFightMemory,
    ready: () => mapBalance.ready(currentMapId) && Boolean(session?.isRunning() && coop?.isConnected?.())
      && !mapController.isMapTransitioning(),
    mapId: () => currentMapId, identity: () => coopAccess.localIdentity() ?? "local-player",
    bossRespawnRank: () => coop?.researchInPlay?.()?.bossRespawn ?? 0,
    alive: () => player.hp > 0,
    defeated: mapId => {
      // Early bosses retain their saved cinematic/result flow. Later campaign and Endless
      // reveals wait for the server unlock, independent of subscription snapshot timing.
      const laterReveal = CAMPAIGN_MAP_IDS.indexOf(mapId) >= 6 || mapId.startsWith("endless_");
      if (laterReveal && !coop?.prestige?.()?.level) mapController.queuePortalReveal(mapId as MapId);
      gameBridge?.recordRegularEnemyDefeat(mapId, "boss");
    },
  });
  const proceduralBoss = createProceduralBossController({
    mapId: () => currentMapId, state: mapId => ({ ...coop?.proceduralMapState(), boss: personalBosses.proceduralState(mapId) }),
    enemies, player, spawn: spawnFromSite,
    damagePlayer: (damage, source) => playerCombat.damagePlayer(damage, source),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss), burst: spawnBurst, shot: projectileStore.spawnEnemyShot,
  });
  const enemySimulation = createEnemySimulation(
    enemies,
    projectileStore.spawnEnemyShot,
    player,
    () => ({ ...canvasRuntime.viewport(), zoom: camera.zoom }),
    engageEnemy,
    (amount, source) => playerCombat.damagePlayer(amount, source),   // the source is who Reflect answers
    {
      currentMapId: () => currentMapId,
      serverNowMs: coopAccess.serverNowMs,
      localIdentity: coopAccess.localIdentity,
      remotePlayers: () => (inTutorial() ? [] : coopAccess.remotePlayers())
        .filter((remote) => !coop?.remotePlayerDeath?.(remote.id)),
      remoteCombatStats: (identity) => coop?.remoteCombatStats?.(identity),
      playerMovementSpeed: () => playerStats.moveSpeed(),
      playerAttackRange: () => weaponAttackRange(inventory.equippedRightHand || inventory.equippedLeftHand, player.attackRange),
      spawnDamageNumber, remoteGhostsEnabled: appShell.remoteGhostsEnabled,
      spawnBurst,
      pullAggro: enemy => autoFarm.pulls(enemy) || autoFarm.forced(enemy),
    },
  );
  const research = createResearchController({
    prestigeLevel: () => coop?.prestigeStatGainInPlay?.() === false ? 0 : coopAccess.prestigeLevel(),
    guildQuestBonus: () => coop?.weeklyQuests?.()?.bonus ?? 1,
    serverBoost: () => coop?.serverBoostMultiplier?.() ?? 1,
    prestigePerks: () => coop?.prestigePerks?.(), cards: () => coop?.activeCardStats?.(), equippedFeet: () => inventory.equippedFeet,
    equippedWeapon: () => inventory.equippedRightHand || inventory.equippedLeftHand,
    itemLevel: coopAccess.itemLevel,
    player,
    getRanks: () => coop?.researchInPlay?.(),
    isDueling,
    maxPlayerStat: MAX_PLAYER_STAT,
    saveProgress,
    healthMultiplierBonus,
  });
  const { ranks: researchRanks, rewardMultiplier: researchRewardMultiplier, applyVitality: applyVitalityResearch } = research;
  const rewardDisplay = createRewardDisplay(researchRewardMultiplier, researchRanks, appShell.showBaseStatRewards,
    () => inventory, coopAccess.itemLevel, () => coop?.activeCardIds?.() ?? []);
  progress = createProgressController({
    player,
    inventory,
    bootsPickup,
    legacyStorageKey: LEGACY_SAVE_KEY,
    getSavedProgress: () => soulDimension.withSoul(coop?.savedProgress?.() ?? null),
    saveRemoteProgress: (saved, immediate) => { coop?.saveProgress?.(soulDimension.withoutSoul(saved, coop?.savedProgress?.()?.attackRate ?? saved.attackRate), immediate); },
    localIdentity: () => coop?.localIdentity?.() ?? "",
    lifetimeEnemyKills: (identity) => coop?.playerProfile?.(identity)?.lifetime.enemyKills,
    isDeveloper: isDeveloperIdentity, lentLooks: () => isDeveloperIdentity(coop?.localIdentity?.()) ? patreonLooks(true) : coop?.supporterTierKnown?.() ? patreonLooks(coop?.supporterTier?.() === "diamond") : null,
    getTotalKills: () => totalKills,
    setTotalKills: (kills) => { totalKills = kills; },
    researchVitalityRank: () => researchRanks().vitality,
    healthMultiplierBonus, cardRange: () => coop?.activeCardStats?.().range ?? 0, weaponMastery: () => coop?.weaponMasteryInPlay?.(),
    setAppliedVitalityRank: research.setAppliedVitalityRank,
    renderInventory,
    onLoaded: finishStartup,
  });

  playerCombat = createPlayerCombat({
    coop: coopAccess, world: bootstrap, effects, mapMusic, research, rewardDisplay, healthMultiplierBonus, isDueling,
    currentMapId: () => currentMapId, inTutorial, nowSeconds: () => session?.gameTime() ?? 0, engageEnemy, personalBosses,
    scheduleEnemyRespawn: site => {
      regularEnemyRespawn.schedule(site);
      respawnMemory.remember(enemyRespawnKey(site), (site.respawnAt - session.gameTime()) * 1000);
    },
    gameBridge, autoFarm, incrementKills: () => { totalKills += 1; }, logPickup, saveProgress, endGame,
    later: { soul: () => soulDimension, onboarding: () => onboarding, quests: () => quests },
  });

  const playerIdentityRenderer = createPlayerIdentityRendering({
    coop: coopAccess, canvasRuntime, camera, onProfileIconsLoaded: () => { if (leaderboard.isOpen()) leaderboard.render(); },
  });
  const { publicPlayerName, renderDomPlayerName, applyProfileIcon, paintProfileIconCanvas, updateSpeechBubbles } = playerIdentityRenderer;
  const playerPower: typeof playerIdentityRenderer.playerPower = () => powerForEquipment(inventory);

  let playerController: ReturnType<typeof createLocalPlayer>;
  const mapController = createMapController({
    openTravel: portal => isSoulMap(portal.destination) ? soulDimension.openWindow() : travel.open(),
    closeTravel: () => { travel.close(); soulDimension.closeWindow(); },
    onTravelStarted: () => autoFarm.travelStarted(), travelWanted: destination => autoFarm.headingTo(destination),
    onTravelRefused: destination => autoFarm.travelRefused(destination),
    markPortalCutsceneSeen: (cutscene) => coop?.markPortalCutsceneSeen?.(cutscene),
    mapConfig: MAP_CONFIG,
    getCurrentMapId: () => currentMapId,
    setCurrentMapId: setCurrentMap,
    prepareMapAssets: (mapId) => mapAssets.prepare(mapId),
    instantTravelReady: (mapId) => !inTutorial() && assets.mapAssetsReady(mapId),
    player,
    camera,
    viewport: canvasRuntime.viewport,
    keys: playerInput.keys,
    stopTouchMove: playerInput.stopTouchMove,
    cutsceneOverlay: cutsceneOverlayEl,
    resizeViewport: canvasRuntime.resize,
    isDueling,
    running: () => session.isRunning(),
    localMapState: () => inTutorial() ? null : coopAccess.localState(),
    changeMap: async (mapId, x, y) => {
      const changed = await coop?.changeMap?.(mapId, x, y);
      if (changed) { mapBalance.reset(); void mapBalance.ensure(mapId).catch(() => {}); }
      return changed;
    },
    syncStoppedPosition: () => { if (!inTutorial()) coop?.correctMovementPosition?.(player.x, player.y, true); },
    resetPresentationState: presentation.reset,
    fadeToWorld,
    mapUnlocked: (mapId) => isProceduralMap(mapId)
      ? Boolean(coop?.proceduralMapUnlocked(mapId))
      : !CAMPAIGN_MAP_IDS.includes(mapId) || campaignMapUnlocked(CAMPAIGN_MAP_IDS.indexOf(mapId), coopAccess.savedProgress() ?? {}),
    syncMapMusic,
    rebuildWorld: () => playerController.rebuildWorld(),
    spawnFromSite,
    enemies,
    spawnSites,
    clearTransientCombat: () => { projectileStore.clear(); effects.clear(); enemySimulation.clearRemoteCombat(); },
    bosses,
    bossHazards,
    onCutsceneFinished: () => bossController.onPortalCutsceneFinished(),
    onServerMove: (from, to) => onwardCue(coop?.activeCardStats?.().onward, from, to, showMessage),
  });
  const { questTracker, quests, travel, soulDimension, guildHall } = createWorldPlaces({
    coop: coopAccess, world: bootstrap, currentMapId: () => currentMapId, spawnFromSite, mapController, playerInput, playerCombat,
    research, regenerationPerSecond, autoFarm, logPickup, showMessage, spawnBurst, camera,
    later: {
      invalidateDepthOrder: () => worldRenderRuntime.invalidateDepthOrder(), fadeToWorld: (action, ms) => session.fadeToWorld(action, ms),
      showQuestProgress: (enemy, count, target) => runtimeHud.showQuestProgress(enemy, count, target),
      showProgressCompletion: (kind, detail, icon, color) => runtimeHud.showProgressCompletion(kind, detail, icon, color),
    },
  });

  const bossController = createBossController({
    bosses,
    hazards: bossHazards,
    player,
    sharedBoss: (kind) => personalBosses.state(BOSSES[kind].mapId),
    bossResult: (kind) => personalBosses.result(BOSSES[kind].mapId),
    localIdentity: coopAccess.localIdentity,
    serverNowMs: coopAccess.serverNowMs,
    bossTargets: () => player.hp > 0 ? [{ id: coopAccess.localIdentity() ?? "local-player", x: player.x, y: player.y }] : [],
    running: () => session.isRunning(),
    currentMapId: () => currentMapId,
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    portalCutscenes: bossPortalCutscenes((cutscene) => coop?.hasSeenPortalCutscene?.(cutscene) ?? true, mapController),
    spawnBurst,
    damagePlayer: (amount) => playerCombat.damagePlayerFromBoss(amount),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss),
  });

  const markPlayerSpriteReady = () => {
    startup.refreshLoading();
    finishStartup();
  };
  const bootstrapAssets = createGameBootstrapAssets({
    profileCharacterCanvas,
    inventoryCharacterCanvas,
    onWorldArtReady: () => {
      startup.refreshLoading();
      finishStartup();
    },
    onPlayerAppearanceAssetReady: markPlayerSpriteReady,
    localOutfit: () => Object.values(equipmentAppearance(inventory)),
  });
  const playerSpriteReady = bootstrapAssets.localPlayerArtReady;
  const { assets, inventoryCharacterPreview, leaderboardPodiumPreview, playerAppearanceAssets, profileCharacterPreview } = bootstrapAssets;
  const mapAssets = createMapAssetLoading({
    coop: coopAccess, assets, mapBalance, mapConfig: MAP_CONFIG, performanceMonitor,
    running: () => Boolean(session?.isRunning()), lowPerformanceMode: () => appShell.lowPerformanceMode(),
    gameplayBusy: () => mapController.isMapTransitioning() || mapController.isCutsceneActive() || isDueling()
      || gameplayPauseReasons.has("rewarded-ad"),
  });
  const minimapBounds = watchMinimapBounds(canvas, minimapButton, canvasRuntime);
  const rewardLabelContext = rewardLabelContextFrom({ coop: () => coop, player, soul: soulDimension, critParts: research.criticalDamageParts });
  const worldRenderRuntime = createWorldRendering({
    coop: coopAccess, canvasRuntime, staticWorldLayer, camera, minimapBounds, world: bootstrap,
    currentMapId: () => currentMapId, gameTime: () => session.gameTime(), localDeath: () => localPlayerDeath, localCorpses,
    isArenaScene, remoteEnemies: enemySimulation.remoteCombatGhosts, mapController, proceduralBoss, bootstrapAssets,
    stationStatus: {
      slotUpgrades: () => slotUpgrades.worldStatus() ?? null, research: () => techTree.worldStatus() ?? null, questBoard: quests.worldStatus,
    },
    rewardDisplay, rewardContext: rewardLabelContext, bossHitboxesVisible: () => devPanel.bossHitboxesVisible(),
    identityRenderer: playerIdentityRenderer, playerPower, lowPerformanceMode: appShell.lowPerformanceMode,
  });
  const duelRuntime = createDuelPlayback({
    coop: coopAccess, e: gameElements, effects, prepareArena: assets.ensureDuelAssets, resizeViewport: canvasRuntime.resize, showMessage,
    session: () => session, playerController: () => playerController,
  });
  playerController = createLocalPlayer({
    coop: coopAccess, world: bootstrap, effects, enemySimulation, currentMapId: () => currentMapId, inTutorial, localTestMultiplier,
    invalidateStaticWorld: worldRenderRuntime.invalidateStaticWorld, spawnFromSite, playerCombat, bossController, mapController,
    playerInput, playerVisibility, autoFarm, playerStats, canvasRuntime, camera, duelSession, duelRuntime,
    setHeldDuelScene: scene => { heldDuelScene = scene; },
    onResetUI: () => {
      session.resetGameTime();
      runtimeHud.clearTransientUi();
      updateHud(true);
    },
    inputBlocked: () => Boolean(onboarding?.blocksInput()),
  });

  function saveProgress(immediate = false) {
    if (inTutorial()) return;
    progress.save(immediate);
  }

  /** Movement speed and max health follow what is equipped. */
  function applyEquipmentStats() {
    player.speed = equipmentMoveSpeed();
    applyPlayerMaxHealthMultiplierBonus(player, healthMultiplierBonus());
  }

  function loadProgress() {
    if (inTutorial()) return;
    progress.load();
  }

  async function runPrestige(reset = coop?.prestigeAccount) {
    const result = await reset?.();
    if (result?.ok) loadProgress();
    return result;
  }

  function finishStartup() {
    startupCoordinator?.finishStartup();
  }

  function updateProtocolGate(accountState = coopAccess.accountState()) {
    startupCoordinator?.updateProtocolGate(accountState);
  }

  function showMessage(text: string, color = "#fff") {
    runtimeHud.showMessage(text, color);
  }

  function logPickup(text: string, color: string, value?: number) {
    runtimeHud.logPickup(text, color, appShell.showBaseStatRewards() ? "base" : "total", value);
  }

  let offlineProgressSummary: ReturnType<typeof createCoopSessionWiring>["offlineProgressSummary"] | undefined;
  let offlineProgressSetting: { refresh: () => void } | undefined;
  const expansionNotice = createPrestigeExpansionRuntime({
    coop, mapName: () => MAP_CONFIG[currentMapId].name, mapLabel: gameElements.minimapMapNameEl,
  });
  const prestigeUnlock = createPrestigeUnlockRuntime({
    coop, expanded: expansionNotice.unlocked, showMessage, runPrestige, playing: () => session?.hasStarted() && !inTutorial(),
    blocked: () => session.isPaused(), pause: () => {},
  });
  const duplicateLogin = createDuplicateLoginRuntime({
    coop, started: () => session?.hasStarted(), pause: (paused: boolean) => setGameplayPause("duplicate-login", paused),
  });
  function updateHud(force = false) {
    // These polls share the HUD's 100 ms gate and, like its drawing, rest in a hidden tab.
    if (!runtimeHud.updateHud(force)) return;
    expansionNotice.tick();
    offlineProgressSummary?.showPending();
    prestigeUnlock.poll();
    duplicateLogin.poll();
    offlineProgressSetting?.refresh();
  }

  const profile = createProfileRuntime({
    coop: coopAccess, e: gameElements, inventory, isDueling, soulInPlay: () => soulDimension.inPlay(),
    mapName: mapNameForPresence, powerForEquipment, profileCharacterPreview, inventoryCharacterPreview,
    applyProfileIcon, renderName: renderDomPlayerName, expansionNotice, runPrestige, openIconPicker: openProfileIconPicker,
    chat: () => chatRuntime, guildPanel: () => guildPanel, clearInput: playerInput.clear,
    itemInspection: itemInspectionController, destructionActions: inventoryController.destructionActions, showMessage,
  });
  const { playerSafety, profileWindow } = profile;

  const { panels, progressNotices, techTree, guildPanel, leaderboard, devPanel } = createGamePanels({
    coop: coopAccess, e: gameElements, itemInspection: itemInspectionController, minimizeChat: () => chatRuntime.minimize(),
    mapGuide: () => mapGuide, slotUpgrades: () => slotUpgrades, researchRanks,
    showProgressCompletion: (kind, detail, icon, color) => runtimeHud.showProgressCompletion(kind, detail, icon, color),
    profileWindow, closeIconPicker: closeProfileIconPicker, clearInput: playerInput.clear,
    lowPerformanceMode: appShell.lowPerformanceMode, openGuildHall: () => guildHall.openWindow(),
    assets, playerAppearanceAssets, leaderboardPodiumPreview,
    paintProfileIconCanvas, previewPrestigeUnlock: prestigeUnlock.preview,
    stopAutoFarm: reason => autoFarm.stop(reason), teleportToMap: mapController.teleportToMap,
    metrics: { performance: performanceMonitor, enemies, projectiles, enemyShots, particles, canvasRuntime, canvas },
    showMessage,
  });

  const town = createTownRuntimes({
    coop: coopAccess, e: gameElements, player, inventory, currentMapId: () => currentMapId, inTutorial,
    isMapTransitioning: () => mapController.isMapTransitioning(), teleportHome: () => mapController.teleportHome(),
    teleportToMap: mapController.teleportToMap,
    clearInput: playerInput.clear, renderInventory, showMessage, techTree, quests,
    beforeUpgradesOpen: () => panels.closeAllExcept("slotUpgrades"), onUpgradeFinished: progressNotices.onUpgradeFinished,
    applyEquipmentStats, saveProgress, itemInspection: itemInspectionController,
  });
  const { smith, cardSeller, gearSellers, slotUpgrades } = town;

  const mapGuide = createMapGuidePanel({
    coop: coopAccess, e: gameElements, currentMapId: () => currentMapId, mapName: mapId => MAP_CONFIG[mapId].name, inventory,
    world: bootstrap, player, rewardDisplay, rewardContext: rewardLabelContext, mapController, proceduralBoss, profileWindow,
    closeCompetingWindows: () => panels.closeAllExcept("mapGuide"), clearInput: playerInput.clear, power: () => playerPower(player),
    prestigeExpanded: expansionNotice.unlocked, preferTravel: travel.prefer, villageGround: () => assets.townVillageGround,
  });

  const { runtimeHud, rewardedRespawnAd } = createHudRuntime({
    coop: coopAccess, e: gameElements, player, duelSession, applyProfileIcon, playerPower, playerShield: () => playerCombat?.cardShield(),
    setDeveloperAccess: devPanel.setDeveloperAccess, applyVitalityResearch, techTree, appShell,
    updateProfileDuelButton: profileWindow.updateDuelButton, mapMusic, setGameplayPause, inTown: () => currentMapId === "town", showMessage,
    goToResearch: town.goToResearch,
  });

  function showCurrentUpdateNotice() {
    overlays.showUpdateNotice();
  }

  function openProfileIconPicker() {
    overlays.openIconPicker();
  }

  function closeProfileIconPicker() {
    overlays.closeIconPicker();
  }

  function updateDuelControls() {
    runtimeHud.updateDuelControls();
  }

  const renderController = createWorldFrameRenderer(worldRenderRuntime, {
    coop: coopAccess, world: bootstrap, effects, currentMapId: () => currentMapId, inTutorial, enemySimulation, localCorpses,
    localDeath: () => localPlayerDeath, isDueling, isArenaScene, duelAssetsReady: assets.duelAssetsReady, duelRuntime, playerController,
    heldDuelScene: () => heldDuelScene, setRenderedDuelScene: scene => { renderedDuelScene = scene; },
    setDuelCountdown: countdown => runtimeHud.setDuelCountdown(countdown), settingsPanel, inventoryPanel, leaderboard, profileWindow,
    inventoryCharacterPreview, powerForEquipment, updateSpeechBubbles, mapController, attackRangeVisible: () => appShell.attackRangeVisible(),
  });

  session = createGameSession({
    coop: coopAccess, world: bootstrap, camera, canvasRuntime, e: gameElements, currentMapId: () => currentMapId, setCurrentMap, inTutorial,
    mapBalanceReady, appShell, playerInput, autoFarm, duelSession, duelRuntime, profileWindow, hideStartScreen: () => startup.hideStart(),
    deathScreen, bossFightMemory, recordLocalDeath, clearLocalDeath: () => { localPlayerDeath = null; }, playerController,
    hasSavedProgress: () => progress.hasSavedProgress(), mapController, syncMapMusic, bossController, stations: town,
    places: [soulDimension, guildHall], enemySystems: [personalBosses, proceduralBoss, enemySimulation], playerCombat, updateRespawns,
    effects, updateHud, runtimeHud, presentation,
    beforeRender: () => {
      progressNotices.poll(techTree, slotUpgrades);
      slotUpgrades.tick();
      guildPanel.tick();
    },
    guildPanel, assets, renderWorld: () => renderController.render(), performanceMonitor, devPanel,
    later: {
      chatInteracting: () => chatRuntime.isInteracting(), refreshReconnectOverlay: () => reconnectOverlay.refresh(),
      onboarding: () => onboarding,
    },
  });

  installGraphicsReport({
    canvas: () => canvas, snapshot: performanceMonitor.snapshot, playing: () => session.isRunning(), fullRate: () => session.fullFrameRate(),
  });
  installStatTracker({ storage: localStorage, read: createStatTrackerSource({ coop: () => coop, player, inventory,
    hasStarted: session.hasStarted, isLoadedFor: progress.isLoadedFor, inTutorial, researchRanks, kills: () => totalKills,
    displayedProgress: displayedPlayerPowerProgress, attackCap: coopAccess.attackCap,
    critParts: () => ({ ...research.criticalDamageParts(), soul: soulDimension.critDamage(), rating: player.critRating }),
    criticalChance: research.criticalChance }) });
  installQuestTracker({ storage: localStorage, enabled: questTracker.enabled, set: questTracker.set, ensure: () => quests.refresh(),
    view: () => quests.trackerView(currentMapId),
    hiddenHere: () => !session.hasStarted() || inTutorial() || document.body.matches(".is-cutscene, .is-replaying, .is-dueling") });
  const giftsAndMail = createGiftsAndMail({
    coop: coopAccess, e: gameElements, playing: () => session.hasStarted() && !inTutorial(), guildPanel: () => guildPanel, showMessage,
  });

  const reconnectOverlay = createReconnectOverlay({
    coop: coopAccess, e: gameElements, hasStarted: () => session.hasStarted(),
    setFarmConnection: connection => { farmConnection = connection; }, refreshAutoFarm: () => autoFarm.refresh(), setGameplayPause,
  });

  onboarding = createOnboardingRuntime({
    coop: coopAccess, player, enemies, spawnSites, spawnFromSite, mapController, session, resizeCanvas: canvasRuntime.resize,
    playerController, resetPresentation: presentation.reset, projectileStore, playerCombat, playerInput, autoFarm,
    profileWindow, profileElement: playerProfileEl, itemInspection: itemInspectionController, waitForNameSave: profile.waitForNameSave,
    isDueling, clearLocalDeath: () => { localPlayerDeath = null; }, setCurrentMap, loadProgress, finishStartup, startGame, logPickup, showMessage,
  });

  startupCoordinator = createStartupCoordination({
    coop: coopAccess, version: GAME_VERSION, updateScreen: reconnectOverlay, canvas, screen: startupScreen, session, progress,
    playerSpriteReady, worldArtReady: assets.worldArtReady, setGameplayPause,
    saveBeforeUpdate: () => { saveProgress(true); coop?.syncMovementState?.(player.x, player.y, 0, 0, "keyboard", true); },
    suspendPlayerVisibility: () => playerVisibility.suspend(),
    showNewPlayerIntro: () => beginNewPlayer({ recordGameplayReady, settings: appShell, onboarding, startGame, intro: startup }),
    startGame: () => startGame(false),
  });
  finishStartup();
  startupCoordinator.startVersionPolling();

  let staticWorldPrepared = false;
  function startGame(markIntro = true, restoreServerPosition = true) {
    if (onboarding?.isActive()) return;
    if (onboarding?.required()) {
      onboarding.start(() => {
        // The one automatic switch-on: a new player leaves their first fight
        // and sees the others doing the same. Everyone else taps the eye.
        playerVisibility.enableForTutorial();
        canvasRuntime.resize();
        setCurrentMap(TUTORIAL_FOREST_MAP_ID);
        loadProgress();
        const saved = coop?.savedProgress?.();
        if (saved) { player.damage = Math.max(player.damage, saved.damage); player.regen = Math.max(player.regen, saved.regen); }
        startGame(markIntro, restoreServerPosition);
      });
      return;
    }
    const firstStart = !session.hasStarted();
    const appearance = equipmentAppearance(inventory);
    warmPlayerAppearanceCache(playerAppearanceAssets, {
      skinTone: coopAccess.skinTone(coopAccess.localIdentity()),
      headItem: appearance.headItem,
      chestItem: appearance.chestItem,
      feetItem: appearance.feetItem,
      rightHandItem: appearance.rightHandItem,
      leftHandItem: appearance.leftHandItem,
    });
    const finishStart = () => {
      if (firstStart) performanceMonitor.reset();
      session.start(markIntro, restoreServerPosition);
      recordGameplayReady();
      finishStartup();
      giftsAndMail.refresh();
      applyGameplayPauseState();
    };
    // The tutorial starts the session itself, so its end is not a first start: the layer waits for its own first.
    const shouldWarmStaticWorld = !staticWorldPrepared && Boolean(staticWorldLayer?.prepare());
    staticWorldPrepared ||= Boolean(staticWorldLayer);
    finishStart();
    if (shouldWarmStaticWorld) {
      scheduleBackgroundTask(() => { void worldRenderRuntime.warmStaticWorld().catch(() => {}); });
    }
    mapAssets.preloadAdjacent(currentMapId);
  }

  /** The local player's death animation, and the corpse others see outside the tutorial and duels. */
  function recordLocalDeath() {
    const death = { id: coopAccess.localIdentity() ?? "local-player", x: player.x, y: player.y, facing: player.facing, startedAtMs: performance.now() };
    localPlayerDeath = death;
    if (!inTutorial() && !isDueling()) localCorpses.add(coopAccess.identity(), currentMapId, {
      ...equipmentAppearance(inventory), id: death.id, name: "", power: 0,
      x: player.x, y: player.y, speed: player.speed, facing: player.facing, moving: false,
    }, death, coopAccess.skinTone());
    mapMusic.playDeathSound();
  }

  function endGame() {
    if (onboarding?.died()) {
      recordLocalDeath();
      return;
    }
    mapAssets.cancelPreload();
    session.end();
    giftsAndMail.refresh();
  }

  bindGameInteractionListeners({
    hpText,
    watchDuelReplay: watchDuelReplayBtn,
    playerHudProfile: playerHudProfileIcon,
    playerHudProfileGear, onOpenSettings: () => settingsBtn.click(),
    playerProfileIcon,
    closeProfileIconPicker: closeProfileIconPickerBtn,
    onOpenOwnProfile: () => {
      const identity = coopAccess.localIdentity();
      if (identity) void profileWindow.open(identity, coopAccess.localDisplayName() || "PLAYER");
    },
    replayId: () => BigInt(duelResultEl.dataset.replayId || "0"),
    onWatchReplay: (replayId) => { void duelRuntime.openReplay(replayId); },
    canOpenProfileIconPicker: () => profileWindow.identity() === coopAccess.localIdentity(),
    openProfileIconPicker: profileWindow.openNameEditor,
    closeIconPicker: closeProfileIconPicker,
  });

  const chatRuntime = createChatRuntimeController({
    getCoop: () => coop,
    showMessage,
    onOpenPlayer: (identity, name) => { void profileWindow.open(identity, name); },
    openReplay: (replayId) => { void duelRuntime.openReplay(replayId); },
    onLayoutChange: canvasRuntime.resize,
  });
  chatRuntime.init();
  installGameTicker(gameElements.chatPanel, localStorage, () => coop?.patreonSupporterNames?.() ?? []);
  offlineProgressSetting = installOfflineProgressSetting(document, () => coop);

  createAutoFarmPanel({
    farm: autoFarm, mapName: () => MAP_CONFIG[currentMapId].name, aggro: () => coop?.aggroChallenge?.(), identity: coopAccess.localIdentity,
    rewardMultiplier: researchRewardMultiplier, soulRewardMultiplier: () => soulDimension.rewardMultiplier(),
    showBaseStatRewards: appShell.showBaseStatRewards,
    rewardAmount: rewardDisplay.displayedAmount,
    visible: () => (farmUnlocked() || Boolean(coop?.aggroChallenge?.()?.active)) && currentMapId !== "home_exterior" && !guildHall.guildId()
      && Boolean(session?.isRunning()) && player.hp > 0 && !isDueling()
      && !mapController.isMapTransitioning() && !mapController.isCutsceneActive(),
    unavailable: farmUnavailable,
    setPaused: () => {},
    clearInput: () => { playerInput.clear(); player.moving = false; coop?.correctMovementPosition?.(player.x, player.y, true); },
  });

  const handleInputEscape = createGameActions({
    coop: coopAccess, e: gameElements, inventory, inventoryController, itemInspection: itemInspectionController, renderInventory,
    logPickup, showMessage, clearInput: playerInput.clear, minimizeChat: chatRuntime.minimize, openSupporter: openProfileIconPicker,
    drawDiamondLook: createDiamondLookDrawer(playerAppearanceAssets),
    closeIconPicker: closeProfileIconPicker, leaveDuelResult, closeDuelReplay: duelRuntime.closeReplayWindow,
    windows: {
      profile: profileWindow, guild: guildPanel, mapGuide, slotUpgrades, leaderboard, devPanel, techTree, rewardedRespawnAd,
    },
    setGameplayPause, clearProgressState: progress.resetState, setTotalKills: kills => { totalKills = kills; }, bootsPickup,
    resetGame: async () => {
      respawnMemory.clear();
      bossFightMemory.clear();
      gameplayPauseReasons.clear();
      mapController.loadMap(TUTORIAL_FOREST_MAP_ID, PLAYER_SPAWN.x, PLAYER_SPAWN.y);
      playerController.reset(false, false);
      session.setHasStarted(false);
      await mapAssets.prepare(TUTORIAL_FOREST_MAP_ID);
    },
    session, restartStartup: () => { startupCoordinator?.restart(); }, hideGameOver: deathScreen.hide,
  });

  offlineProgressSummary = createCoopSessionWiring({
    coop: coopAccess, player, inventory, renderInventory, saveProgress, healthMultiplierBonus, showMessage,
    windows: { playerSafety, profileWindow, inventory: inventoryController, smith, cardSeller, gearSellers }, leaderboard, runtimeHud, slotUpgrades,
    inTutorial, isRunning: session.isRunning, moveSpeed: () => playerStats.moveSpeed(), playerInput,
    reconcileMap: () => { if (!inTutorial()) mapController.reconcileMapFromServer(); },
    syncLifetimeKills: progress.syncLifetimeKills, refreshGemCounter, refreshGiftsAndMail: giftsAndMail.refresh,
    refreshDevPanel: devPanel.refresh, loadProgress, resetMovementSync: playerController.resetMovementSync,
    syncBossState: () => bossController.forMap(currentMapId)?.sync(), finishStartup, updateProtocolGate, refreshChat: chatRuntime.requestRefresh,
    updateDuelControls, refreshAppStatus: appShell.refreshStatus, refreshReconnectOverlay: reconnectOverlay.refresh,
  }).offlineProgressSummary;
  reconnectOverlay.refresh();
  updateDuelControls();
  appShell.refreshSettings();
  appShell.refreshFullscreen();
  appShell.refreshStatus();
  updateProtocolGate();

  fullscreenMovement.watchWindows(document);
  startGameRuntime({
    loadProgress,
    rebuildWorld: playerController.rebuildWorld,
    camera,
    player,
    viewport: canvasRuntime.viewport,
    render: () => presentation.render(1, renderController.render),
    loop: session.loop,
  });
})();
