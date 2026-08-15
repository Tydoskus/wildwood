import { recentReleaseNotes } from "./app/changelog";
import { isDeveloperIdentity } from "./app/developer";
import {
  BASE_ATTACK_RANGE,
  BASE_PROJECTILE_SPEED,
} from "./game/constants";
import { clamp, distanceSquared, rand } from "./game/math";
import { damageAfterArmor, formatArmorReduction } from "./game/combat";
import { moveInventoryItem, TRAILBLAZER_BOOTS } from "./game/inventory";
import { createMapMusicController } from "./game/runtime/audio";
import { createCamera } from "./game/runtime/camera";
import { createCombatEffects } from "./game/runtime/combat-effects";
import { requiredElement } from "./game/runtime/dom";
import { createEnemyLifecycle } from "./game/runtime/enemy-lifecycle";
import { createEnemySimulation } from "./game/runtime/enemy-simulation";
import { createCoopSessionController } from "./game/runtime/coop-session-controller";
import { createProgressController } from "./game/runtime/progress-controller";
import { createGameSessionController } from "./game/runtime/game-session-controller";
import { createPerformanceMonitor } from "./game/runtime/performance-monitor";
import { createGameBootstrap, createGameBootstrapAssets, startGameRuntime } from "./game/runtime/game-bootstrap";
import { createPlayerIdentityRenderer } from "./game/runtime/player-identity-renderer";
import { createDuelRuntime } from "./game/runtime/duel-runtime";
import { createDuelSessionController } from "./game/runtime/duel-session-controller";
import { createCanvasRuntime } from "./game/runtime/canvas-runtime";
import { ANTI_ALIASING_ENABLED_KEY, ATTACK_RANGE_VISIBLE_KEY, DRAGON_PORTAL_CUTSCENE_SEEN_KEY, ENEMY_DEATH_PARTICLE_COLOR, ENEMY_TEXT_CULL_MIN_DISTANCE, GAME_VERSION, LATENCY_VISIBLE_KEY, LOW_PERFORMANCE_MODE_KEY, MUSIC_VOLUME_KEY, NETWORK_NEAR_SCREEN_MARGIN_RATIO, SEEN_VERSION_KEY, SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY, WORLD_HEALTH_BAR_HEIGHT, WORLD_HEALTH_BAR_SCALE } from "./game/runtime/game-settings";
import { createWorldProgressionController } from "./game/runtime/world-progression-controller";
import { BOSS_HP_LOSS_FLASH_DURATION, createBossController, SPIDER_WEB_RANGE } from "./game/runtime/boss-controller";
import { createMapController } from "./game/runtime/map-controller";
import { createPlayerCombatController, type PlayerCombatController } from "./game/runtime/player-combat-controller";
import { createPlayerInputController } from "./game/runtime/player-input-controller";
import { createPlayerController, type PlayerController } from "./game/runtime/player-controller";
import { createResearchController } from "./game/runtime/research-controller";
import { createWorldRenderRuntime } from "./game/runtime/world-render-runtime";
import { DEFAULT_SKIN_TONE, PLAYER_SKIN_TONES, PLAYER_SKIN_TONE_NAMES } from "./game/player-appearance";
import type { DuelScene } from "./game/runtime/types";
import {
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
} from "./game/world";
import {
  DUEL_COMBAT_Y,
} from "./game/duel";
import { createChatRuntimeController } from "./ui/chat-runtime-controller";
import { createInventoryController } from "./ui/inventory-controller";
import { createLeaderboardController } from "./ui/leaderboard-controller";
import { createProfileWindowController } from "./ui/profile-window-controller";
import { formatPlayedTime, profilePresenceText, renderProfileStats } from "./ui/profile";
import { createTechTreeController } from "./ui/tech-tree-controller";
import { createAppShellController } from "./ui/app-shell-controller";
import { createStartupController } from "./ui/startup-controller";
import { createStartupCoordinator } from "./ui/startup-coordinator";
import { createGameElements } from "./ui/game-elements";
import { bindGameInteractionListeners } from "./ui/game-interaction-bindings";
import { createDevPanel, createGameActionsRuntime, createGameOverlays, createGameRuntimeHud, createLeaderboardPanel, createTechTreePanel } from "./ui/game-ui-runtime";
import { formatCompactNumber } from "./ui/number-format";
import type { LeaderboardEntry, wildwoodCoop } from "./wildwood-coop";
import {
  BOOTS_SPEED_BONUS,
  DEFAULT_ATTACK_INTERVAL as STARTING_ATTACK_INTERVAL,
  MAX_ARMOR,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP as BASE_PLAYER_HP,
  PLAYER_SPEED as BASE_PLAYER_SPEED,
} from "../shared/rules";

(() => {
  "use strict";

  // Architecture boundary: keep this file as composition root. New systems
  // belong in src/game, src/ui, or src/app and are only wired here.

  type PlayerProfile = NonNullable<ReturnType<typeof wildwoodCoop.playerProfile>>;

  const gameElements = createGameElements({ names: PLAYER_SKIN_TONE_NAMES, colors: PLAYER_SKIN_TONES });
  const {
    canvas, textCanvas, hpFill, hpText, playerNameEl, playerPowerEl, playerHudProfileIcon, coopStatusEl, messageEl, pickupLog,
    settingsBtn, inventoryBtn, settingsPanel, closeSettingsBtn, inventoryPanel, closeInventoryBtn, resetProgressBtn, bootUpgradeEl, bootUpgradeClose, joystickEl, stickEl,
    techTreeBtn, techTreeNotice, techTreeOverlay, closeTechTreeBtn, techTreeActive, techTreeCanvas, techTreeMap, techTreeDetail, techTreeDetailContent, closeTechTreeDetailBtn,
    duelControls, duelStatusEl, duelRequestBtn, duelAcceptBtn, duelCountdownEl, duelResultEl, duelResultTitle, duelResultStats, watchDuelReplayBtn, closeDuelResultBtn, duelReplayEl, duelReplayTitle, closeDuelReplayBtn, sceneFadeEl, cutsceneOverlayEl,
    dragonResultEl, dragonResultTitle, dragonResultTotal, dragonResultContributors, closeDragonResultBtn, dragonWorldNoticeEl, dragonWorldNoticeDetailEl,
    playerProfileEl, playerProfileNameEl, playerProfilePresenceEl, playerProfilePowerEl, playerProfileIcon, editPlayerNameBtn, profileCharacterPreviewEl, profileCharacterCanvas, profileLeaderboardStatsEl, previousPlayerSpriteBtn, nextPlayerSpriteBtn, profileSkinToneEdit, profileSkinToneControl,
    playerProfileLoadingEl, profileOverviewTab, profileStatsTab, profileRankingTab, profileOverviewPanel, profileStatsPanel, profileRankingPanel, profileJoinedEl, profileTimePlayedEl, profileKillsEl, profileOnlineEl, profileStatGrid, closePlayerProfileBtn, editPlayerSaveBtn, profileDuelBtn, profileNameEditorEl, profileNameEditorForm, profileNameInput, savePlayerNameBtn, profileEditPanel, profileEditName, profileEditMaxHp, profileEditDamage, profileEditAttackRate, profileEditArmor, profileEditRegen, profileEditSpeed, profileEditAttackRange, profileEditProjectileSpeed, profileEditProjectileCount, cancelPlayerSaveEditBtn, savePlayerSaveEditBtn,
    leaderboardBtn, leaderboardEl, leaderboardPowerTab, leaderboardDamageTab, leaderboardHealthTab, leaderboardArmorTab, leaderboardRegenTab, leaderboardTimeTab, leaderboardValueHeading, leaderboardRowsEl, leaderboardEmptyEl, closeLeaderboardBtn,
    triggerDragonCutsceneBtn, triggerSnowlandsCutsceneBtn, updateNoticeEl, updateNoticeTitleEl, updateNoticeItemsEl, closeUpdateNoticeBtn, signinVersionEl, profileIconPickerEl, profileIconChoices, closeProfileIconPickerBtn, gameUpdateGateEl, reconnectOverlayEl,
  } = gameElements;
  let actorShadowSprite!: HTMLImageElement;
  const canvasRuntime = createCanvasRuntime({ canvas, textCanvas, getActorShadowSprite: () => actorShadowSprite });
  const { ctx, textCtx, outlinedWorldText, fillWorldText, pixelCircle, roundRect, drawActorShadow } = canvasRuntime;

  const coop = window.wildwoodCoop || null;
  const overlays = createGameOverlays({ e: gameElements, coop, version: GAME_VERSION, seenVersionKey: SEEN_VERSION_KEY, applyProfileIcon: (element: HTMLElement, index: number) => applyProfileIcon(element, index), showMessage, afterIconSet: () => { applyProfileIcon(playerHudProfileIcon, coop?.profileIcon?.() ?? 0); if (profileWindow.identity() === coop?.localIdentity?.()) applyProfileIcon(playerProfileIcon, coop?.profileIcon?.() ?? 0); } });

  let startupCoordinator!: ReturnType<typeof createStartupCoordinator>;

  function showGameUpdating() {
    startupCoordinator.showGameUpdating();
  }

  const mapMusic = createMapMusicController(MUSIC_VOLUME_KEY, BEGINNER_DESERT_MAP_ID);

  function syncMapMusic() {
    mapMusic.syncMap(currentMapId);
  }

  const camera = createCamera();
  const effects = createCombatEffects();
  const performanceMonitor = createPerformanceMonitor();
  const { particles, damageNumbers, spawnBurst, spawnDamageNumber } = effects;
  const bootstrap = createGameBootstrap();
  const {
    boss,
    bossRain,
    bootsPickup,
    decor,
    enemies,
    enemyShots,
    inventory,
    mapConfig: MAP_CONFIG,
    paths,
    player,
    projectiles,
    spawnSites,
    spiderBoss,
    spiderVenom,
    startSpawn: START_SPAWN,
  } = bootstrap;
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, spawnBurst);
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;

  let totalKills = 0;
  let flash = 0;
  let screenShake = 0;
  let runtimeHud!: ReturnType<typeof createGameRuntimeHud>;
  let heldDuelScene: DuelScene | null = null;
  let renderedDuelScene: DuelScene | null = null;
  let session: ReturnType<typeof createGameSessionController>;
  let duelRuntime!: ReturnType<typeof createDuelRuntime>;
  const duelSession = createDuelSessionController({
    activeDuel: () => duelRuntime.activeDuel(),
    isDueling: () => duelRuntime.isDueling(),
    isReplayActive: () => duelRuntime.isReplayActive(),
    isDuelResultHeld: () => playerController.isDuelResultHeld(),
    showDuelResult: (replay) => runtimeHud.showDuelResult(replay),
    showDuelResultUnavailable: () => runtimeHud.showDuelResultUnavailable(),
    fadeToWorld: (onBlack) => session.fadeToWorld(onBlack),
    leaveDuelResult: () => session.leaveDuelResult(),
    isRunning: () => session.isRunning(),
    isProfileOpen: () => !playerProfileEl.hidden,
    camera: () => camera,
    player: () => player,
    renderedDuelScene: () => renderedDuelScene,
    localIdentity: () => coop?.localIdentity?.(),
    localDisplayName: () => coop?.localDisplayName?.(),
    remotePlayers: () => coop?.remotePlayers?.() ?? [],
    playerDisplayName: (identity) => coop?.playerDisplayName?.(identity),
    publicPlayerName: (identity, name) => publicPlayerName(identity, name),
    openProfile: (identity, name) => { void profileWindow.open(identity, name); },
  });
  const { activeDuel, isDueling, isArenaScene, showDuelResult, showDuelResultUnavailable, fadeToWorld, leaveDuelResult, openPlayerAtScreenPoint, duelOpponentName } = duelSession;


  let newPlayerIntroShown = false;
  let pageLoadComplete = document.readyState === "complete";
  let guestContinuationChosen = false;

  const appShell = createAppShellController({
    mapMusic,
    storageKeys: {
      antiAliasing: ANTI_ALIASING_ENABLED_KEY,
      attackRange: ATTACK_RANGE_VISIBLE_KEY,
      lowPerformance: LOW_PERFORMANCE_MODE_KEY,
      latency: LATENCY_VISIBLE_KEY,
      musicVolume: MUSIC_VOLUME_KEY,
    },
    connected: () => Boolean(coop?.isConnected?.()),
    latencyMs: () => coop?.latencyMs?.(),
    accountState: () => coop?.accountState?.(),
    signIn: () => { void coop?.signIn?.(); },
    signOut: () => { coop?.signOut?.(); },
    canPlayMusic: () => session?.hasStarted() || session?.isRunning() || false,
    onScreenShakeDisabled: () => { screenShake = 0; },
    onLowPerformanceChanged: () => { session.resetFrameSchedule(); },
    showMessage,
  });

  const startup = createStartupController({
    accountState: () => coop?.accountState?.(),
    connected: () => Boolean(coop?.isConnected?.()),
    knownCharacter: () => coop?.knownCharacter?.() ?? "",
    defaultPlayerName: () => coop?.localDisplayName?.() ?? "WANDERER",
    isSignInScreenReady,
    getLoadingStages: () => [
      ["LOADING CONNECTION", Boolean(coop?.isConnected?.()), 12],
      ["LOADING PLAYER PROFILE", Boolean(coop?.localState?.()), 35],
      ["LOADING SAVED PROGRESS", progress.isLoaded(), 60],
      ["LOADING PLAYER APPEARANCE", playerSpriteReady, 78],
      ["LOADING WORLD ART", assets.worldArtReady(), 90],
      ["LOADING PAGE ART", pageLoadComplete, 97],
      ["STARTING WILDWOOD", true, 100],
    ],
    onLoadingComplete: finishStartup,
    onShowAccountChoice: showCurrentUpdateNotice,
    onShowConnecting: () => {
      dragonResultEl.hidden = true;
      dragonWorldNoticeEl.hidden = true;
    },
    onContinueGuest: () => {
      guestContinuationChosen = true;
      coop?.continueAsGuest?.();
      finishStartup();
    },
    onBeginAdventure: (name) => {
      if (name !== (coop?.localDisplayName?.() || "")) coop?.setDisplayName?.(name);
      startGame(true);
    },
    signIn: () => coop?.signIn?.(),
    takeOverSession: () => coop?.takeOverSession?.(),
    showMessage,
  });

  if (!pageLoadComplete) {
    window.addEventListener("load", () => {
      pageLoadComplete = true;
      startup.refreshLoading();
      finishStartup();
      const account = coop?.accountState?.();
      if (!session.hasStarted() && account?.sessionConflict) startup.showSessionConflict();
      else if (!session.hasStarted() && account?.returningFromSignIn) startup.showSigningIn();
      else if (!session.hasStarted() && !account?.signedIn && !account?.authInProgress) startup.showAccountChoice();
    }, { once: true });
  }

  let progress: ReturnType<typeof createProgressController>;
  const inventoryController = createInventoryController({
    inventory,
    move: (itemId, destination) => {
      if (!moveInventoryItem(inventory, itemId, destination)) return;
      player.speed = inventory.equippedFeet === TRAILBLAZER_BOOTS ? BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS : BASE_PLAYER_SPEED;
      const hasWeapon = Boolean(inventory.equippedRightHand || inventory.equippedLeftHand);
      saveProgress(true);
      showMessage(hasWeapon ? "WEAPON EQUIPPED" : "WEAPON UNEQUIPPED", hasWeapon ? "#72ef58" : "#ff9b91");
    },
  });
  const renderInventory = inventoryController.render;
  const worldProgression = createWorldProgressionController({
    player,
    bootsPickup,
    basePlayerSpeed: BASE_PLAYER_SPEED,
    bootsSpeedBonus: BOOTS_SPEED_BONUS,
    collectBoots: () => {
      inventory.itemIds = [...new Set([...inventory.itemIds, TRAILBLAZER_BOOTS])];
      inventory.equippedFeet = TRAILBLAZER_BOOTS;
      inventory.selectedItemId = TRAILBLAZER_BOOTS;
    },
    saveProgress: () => saveProgress(),
    renderInventory,
    pause: () => session.pause(),
    resume: () => session.setPaused(false),
    bootUpgrade: bootUpgradeEl,
    bootUpgradeClose,
    dragonCutsceneSeenKey: DRAGON_PORTAL_CUTSCENE_SEEN_KEY,
    snowlandsCutsceneSeenKey: SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY,
  });
  let inputEscapeHandler = () => false;
  const playerInput = createPlayerInputController({
    canvas,
    joystick: joystickEl,
    stick: stickEl,
    running: () => session.isRunning(),
    onTapPlayer: openPlayerAtScreenPoint,
    onEscape: () => inputEscapeHandler(),
  });
  let playerCombat: PlayerCombatController;
  const enemySimulation = createEnemySimulation(
    enemies,
    enemyShots,
    player,
    () => ({ ...canvasRuntime.viewport(), zoom: camera.zoom }),
    engageEnemy,
    (amount) => playerCombat.damagePlayer(amount),
  );
  const research = createResearchController({
    player,
    getRanks: () => coop?.research?.(),
    isDueling,
    maxPlayerStat: MAX_PLAYER_STAT,
    saveProgress,
  });
  const {
    ranks: researchRanks,
    damageMultiplier: researchDamageMultiplier,
    rewardMultiplier: researchRewardMultiplier,
    movementSpeedMultiplier: researchMovementSpeedMultiplier,
    effectiveArmor,
    criticalChance: researchCriticalChance,
    applyVitality: applyVitalityResearch,
  } = research;
  progress = createProgressController({
    player,
    inventory,
    bootsPickup,
    legacyStorageKey: LEGACY_SAVE_KEY,
    getSavedProgress: () => coop?.savedProgress?.() ?? null,
    saveRemoteProgress: (saved, immediate) => { coop?.saveProgress?.(saved, immediate); },
    localIdentity: () => coop?.localIdentity?.() ?? "",
    lifetimeEnemyKills: (identity) => coop?.playerProfile?.(identity)?.lifetime.enemyKills,
    isDeveloper: isDeveloperIdentity,
    getTotalKills: () => totalKills,
    setTotalKills: (kills) => { totalKills = kills; },
    researchVitalityRank: () => researchRanks().vitality,
    setAppliedVitalityRank: research.setAppliedVitalityRank,
    renderInventory,
    onLoaded: finishStartup,
  });

  playerCombat = createPlayerCombatController({
    player, enemies, spawnSites, projectiles, enemyShots, particles, boss, spiderBoss,
    isTutorialMap: () => currentMapId === TUTORIAL_FOREST_MAP_ID,
    isDesertMap: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    engageEnemy,
    researchDamageMultiplier,
    researchCriticalChance,
    researchRewardMultiplier,
    minAttackInterval: MIN_ATTACK_INTERVAL,
    effectiveArmor,
    isDueling,
    getGameTime: () => session.gameTime(),
    incrementKills: () => { totalKills += 1; },
    damageDragon: (hits) => coop?.damageDragon?.(hits),
    damageSpider: (hits) => coop?.damageSpider?.(hits),
    syncBossAttackPosition: () => coop?.syncPosition?.(player.x, player.y, player.facing, player.moving, true),
    spawnBurst,
    spawnDamageNumber,
    logPickup,
    saveProgress,
    setHitFlash: () => { flash = .22; },
    addScreenShake: (amount) => { screenShake = Math.max(screenShake, amount); },
    recordDeath: () => { void coop?.recordPlayerDeath?.(); },
    endGame,
  });

  const profileIconSheet = new Image();
  profileIconSheet.addEventListener("load", () => {
    if (leaderboard.isOpen()) leaderboard.render();
  });
  profileIconSheet.src = "assets/wildwood/profile-portraits-grid-v2.png";
  const playerIdentityRenderer = createPlayerIdentityRenderer({
    ctx,
    camera,
    viewport: canvasRuntime.viewport,
    profileIconSheet,
    antiAliasingEnabled: () => appShell.antiAliasingEnabled(),
    isDeveloper: isDeveloperIdentity,
    isGuest: (identity) => coop?.isGuest?.(identity) ?? false,
    profileIcon: (identity) => coop?.profileIcon?.(identity) ?? 0,
    chatRevision: () => coop?.chatRevision?.() ?? -1,
    chatMessages: () => coop?.chatMessages?.() ?? [],
    outlinedText: outlinedWorldText,
    fillText: fillWorldText,
    roundRect,
    healthBarHeight: WORLD_HEALTH_BAR_HEIGHT,
  });
  const {
    publicPlayerName,
    renderDomPlayerName,
    applyProfileIcon,
    paintProfileIconCanvas,
    updateSpeechBubbles,
    drawSpeechBubble,
    drawActorStatus,
    playerPower,
  } = playerIdentityRenderer;

  let playerController: PlayerController;
  const mapController = createMapController({
    mapConfig: MAP_CONFIG,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    desertMapId: BEGINNER_DESERT_MAP_ID,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    dragonCutsceneSeenKey: DRAGON_PORTAL_CUTSCENE_SEEN_KEY,
    snowlandsCutsceneSeenKey: SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY,
    getCurrentMapId: () => currentMapId,
    setCurrentMapId: (mapId) => { currentMapId = mapId; },
    player,
    camera,
    viewport: canvasRuntime.viewport,
    keys: playerInput.keys,
    stopTouchMove: playerInput.stopTouchMove,
    cutsceneOverlay: cutsceneOverlayEl,
    isDueling,
    running: () => session.isRunning(),
    localMapState: () => coop?.localState?.(),
    changeMap: (mapId) => coop?.changeMap?.(mapId),
    syncPosition: () => coop?.syncPosition?.(player.x, player.y, player.facing, false, true),
    fadeToWorld,
    mapUnlocked: (mapId) => mapId === BEGINNER_DESERT_MAP_ID
      ? Boolean(coop?.savedProgress?.()?.desertUnlocked)
      : mapId === INTERMEDIATE_SNOWLANDS_MAP_ID
        ? Boolean(coop?.savedProgress?.()?.snowlandsUnlocked)
        : true,
    syncMapMusic,
    rebuildWorld: () => playerController.rebuildWorld(),
    spawnFromSite,
    enemies,
    spawnSites,
    projectiles,
    enemyShots,
    particles,
    damageNumbers,
    bossRain,
    spiderVenom,
    boss,
    spiderBoss,
    clearPendingBossHits: () => playerCombat.clearPendingBossHits(),
    showMapMessage: (mapId) => showMessage(MAP_CONFIG[mapId].name, "#ffe769"),
    onCutsceneFinished: (wasPreview) => bossController.onPortalCutsceneFinished(wasPreview),
  });
  const { activePortal, secondaryPortal, portalIsUnlocked, startDragonPortalCutscene, startSnowlandsPortalCutscene } = mapController;

  const bossController = createBossController({
    boss,
    spiderBoss,
    bossRain,
    spiderVenom,
    player,
    getDragonBoss: () => coop?.dragonBoss?.(),
    getSpiderBoss: () => coop?.spiderBoss?.(),
    getDragonResult: () => coop?.dragonResult?.(),
    getSpiderResult: () => coop?.spiderResult?.(),
    localIdentity: () => coop?.localIdentity?.(),
    running: () => session.isRunning(),
    currentMapIsDesert: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    hasSeenDragonPortalCutscene: worldProgression.hasSeenDragonPortalCutscene,
    hasSeenSnowlandsPortalCutscene: worldProgression.hasSeenSnowlandsPortalCutscene,
    startDragonPortalCutscene,
    startSnowlandsPortalCutscene,
    elements: {
      result: dragonResultEl,
      resultTitle: dragonResultTitle,
      resultTotal: dragonResultTotal,
      resultContributors: dragonResultContributors,
      worldNotice: dragonWorldNoticeEl,
      worldNoticeDetail: dragonWorldNoticeDetailEl,
    },
    renderPlayerName: renderDomPlayerName,
    spawnBurst,
    damagePlayer: (amount) => playerCombat.damagePlayer(amount),
    logPickup,
    showMessage,
    saveProgress,
  });

  let playerSpriteReady = false;
  let settledPlayerSprites = 0;
  const markPlayerSpriteReady = () => {
    settledPlayerSprites += 1;
    if (settledPlayerSprites < 8) return;
    playerSpriteReady = true;
    startup.refreshLoading();
    finishStartup();
  };
  const bootstrapAssets = createGameBootstrapAssets({
    profileCharacterCanvas,
    onWorldArtReady: () => {
      startup.refreshLoading();
      finishStartup();
    },
    onPlayerAppearanceAssetReady: markPlayerSpriteReady,
  });
  const { assets, playerAppearanceAssets, profileCharacterPreview } = bootstrapAssets;
  const ENEMY_SPRITES = bootstrapAssets.enemySprites;
  actorShadowSprite = bootstrapAssets.actorShadowSprite;
  const worldRenderRuntime = createWorldRenderRuntime({
    ctx,
    camera,
    viewport: canvasRuntime.renderViewport,
    currentMapId: () => currentMapId,
    gameTime: () => session.gameTime(),
    isArenaScene,
    mapName: (mapId) => MAP_CONFIG[mapId].name,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    desertMapId: BEGINNER_DESERT_MAP_ID,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    paths,
    decor,
    enemies,
    player,
    boss,
    spiderBoss,
    bossRain,
    spiderVenom,
    activePortal,
    cutscenePortal: () => mapController.cutscenePortal(),
    secondaryPortal,
    portalIsUnlocked,
    portalRevealIntensity: () => mapController.portalRevealIntensity(),
    portalDestinationOpacity: () => mapController.portalDestinationOpacity(),
    assets,
    actorShadowSprite,
    drawShadow: drawActorShadow,
    pixelCircle,
    outlinedText: outlinedWorldText,
    fillText: fillWorldText,
    roundRect,
    bossHpLossFlashDuration: BOSS_HP_LOSS_FLASH_DURATION,
    spiderWebRange: SPIDER_WEB_RANGE,
    playerAppearanceAssets,
    skinTone: (identity) => coop?.skinTone?.(identity),
    equippedItems: () => ({ head: inventory.equippedHead, chest: inventory.equippedChest, feet: inventory.equippedFeet, rightHand: inventory.equippedRightHand, leftHand: inventory.equippedLeftHand }),
    equipmentForIdentity: (identity) => {
      if (identity === coop?.localIdentity?.()) return { headItem: inventory.equippedHead, chestItem: inventory.equippedChest, feetItem: inventory.equippedFeet, rightHandItem: inventory.equippedRightHand, leftHandItem: inventory.equippedLeftHand };
      const remote = coop?.remotePlayers?.().find((player) => player.id === identity);
      return remote ? { headItem: remote.headItem, chestItem: remote.chestItem, feetItem: remote.feetItem } : {};
    },
    enemySprites: ENEMY_SPRITES,
    rewardMultiplier: researchRewardMultiplier,
    enemyTextVisible: (enemy) => {
      const { width, height } = canvasRuntime.viewport();
      const screenRadius = Math.hypot(width, height) / (2 * camera.zoom);
      const cullDistance = Math.max(ENEMY_TEXT_CULL_MIN_DISTANCE, screenRadius + 80);
      return distanceSquared(player, enemy) <= cullDistance * cullDistance;
    },
    drawStatus: drawActorStatus,
    drawSpeechBubble,
    publicPlayerName,
    playerPower,
    worldHealthBarHeight: WORLD_HEALTH_BAR_HEIGHT,
  });
  const { invalidateStaticWorld } = worldRenderRuntime;
  duelRuntime = createDuelRuntime({
    activeDuel: () => coop && typeof coop.localDuel === "function" ? coop.localDuel() : null,
    localIdentity: () => coop?.localIdentity?.(),
    localDisplayName: () => coop?.localDisplayName?.(),
    remotePlayers: () => coop?.remotePlayers?.() ?? [],
    playerDisplayName: (identity) => coop?.playerDisplayName?.(identity),
    pulseDuel: () => coop?.pulseDuel?.(),
    spawnDamageNumber,
    loadReplay: async (replayId) => coop?.loadDuelReplay
      ? await coop.loadDuelReplay(replayId)
      : coop?.duelReplay?.(replayId),
    clearDamageNumbers: () => { damageNumbers.length = 0; },
    showMessage,
    fadeToWorld: (onBlack) => session.fadeToWorld(onBlack),
    isDuelResultHeld: () => playerController.isDuelResultHeld(),
    now: () => performance.now(),
    nowMs: () => Date.now(),
    replayTitle: duelReplayTitle,
    duelResult: duelResultEl,
    duelReplay: duelReplayEl,
    duelCountdown: duelCountdownEl,
  });
  playerController = createPlayerController({
    player, boss, enemies, spawnSites, decor, paths, projectiles, enemyShots, particles, damageNumbers,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    getCurrentMapId: () => currentMapId,
    mapSpawn: (mapId) => mapId === TUTORIAL_FOREST_MAP_ID ? START_SPAWN : MAP_CONFIG[mapId].arrival,
    initialStats: { maxHp: BASE_PLAYER_HP, damage: 4, attackRate: STARTING_ATTACK_INTERVAL, projectileSpeed: BASE_PROJECTILE_SPEED, projectileCount: 1, attackRange: BASE_ATTACK_RANGE, armor: 0, regen: 0, speed: BASE_PLAYER_SPEED },
    invalidateStaticWorld,
    spawnFromSite,
    clearPlayerCombat: () => { playerCombat.clearPendingThrow(); playerCombat.clearPendingBossHits(); },
    resetBosses: () => { bossController.resetBoss(); bossController.resetSpiderBoss(); },
    onResetUI: () => {
      session.resetGameTime();
      flash = 0;
      screenShake = 0;
      runtimeHud.clearTransientUi();
      showMessage(MAP_CONFIG[currentMapId].name, "#ffe769");
      updateHud(true);
    },
    movement: playerInput.movement,
    isMapTransitioning: () => mapController.isMapTransitioning(),
    resolvePortalCollision: () => mapController.resolvePortalCollision(),
    resolveDragonCollision: () => bossController.resolveDragonCollision(),
    resolveSpiderCollision: () => bossController.resolveSpiderCollision(),
    applyDragonConePush: (dt) => bossController.applyDragonConePush(dt),
    isTutorialMap: () => currentMapId === TUTORIAL_FOREST_MAP_ID,
    isDesertMap: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    viewport: () => ({ ...canvasRuntime.viewport(), zoom: camera.zoom }),
    cameraPosition: () => camera,
    isConnected: () => Boolean(coop?.isConnected?.()),
    syncSpeed: (speed) => { if (coop) coop.syncSpeed(speed); },
    movementSpeedMultiplier: researchMovementSpeedMultiplier,
    syncPosition: (x, y, facing, moving, force, highFrequency) => coop?.syncPosition?.(x, y, facing, moving, force, highFrequency),
    syncHp: (hp) => coop?.syncHp?.(hp),
    hasRemotePlayerInArea: (left, top, right, bottom) => coop?.hasRemotePlayerInArea?.(left, top, right, bottom) ?? false,
    autoAttack: (dt) => playerCombat.attackNearest(dt),
    isAutoAttackEnabled: () => Boolean(inventory.equippedRightHand || inventory.equippedLeftHand),
    activeDuel,
    isDueling,
    localIdentity: () => coop?.localIdentity?.(),
    localState: () => coop?.localState?.(),
    syncLiveDuelDamage: (duel) => duelRuntime.syncLiveDamageNumbers(duel),
    liveDuelScene: () => duelRuntime.liveScene(),
    setHeldDuelScene: (scene) => { heldDuelScene = scene; },
    pulseDuel: () => { coop?.pulseDuel?.(); },
    resetLiveDuelPresentation: () => duelRuntime.resetLivePresentation(),
    loadDuelReplay: async (id) => coop?.loadDuelReplay?.(id) ?? null,
    showDuelResult,
    showDuelResultUnavailable,
  });
  const renderController = worldRenderRuntime.createFrameRenderer({
    textCtx,
    textCanvas,
    bootsPickup,
    remotePlayers: () => coop?.remotePlayers?.() ?? [],
    isDueling,
    isArenaScene,
    isReplayActive: () => duelRuntime.isReplayActive(),
    replayScene: () => duelRuntime.replayScene(),
    liveScene: () => duelRuntime.liveScene(),
    heldScene: () => heldDuelScene,
    duelResultHeld: () => playerController.isDuelResultHeld(),
    setRenderedDuelScene: (scene) => { renderedDuelScene = scene; },
    setDuelCountdown: (countdown) => runtimeHud?.setDuelCountdown(countdown),
    drawProfileCharacterPreview: () => profileWindow.drawPreview(),
    updateSpeechBubbles,
    localIdentity: () => coop?.localIdentity?.(),
    localDisplayName: () => coop?.localDisplayName?.(),
    drawParticles: effects.drawParticles,
    drawDamageNumbers: (context, activeCamera, outlined) => effects.drawDamageNumbers(context, activeCamera, outlined),
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    portalBlackoutOpacity: () => mapController.portalBlackoutOpacity(),
    screenShake: () => screenShake,
    screenShakeEnabled: () => appShell.screenShakeEnabled(),
    attackRangeVisible: () => appShell.attackRangeVisible(),
    flash: () => flash,
    projectiles,
    enemyShots,
  });

  function saveProgress(immediate = false) {
    progress.save(immediate);
  }

  function loadProgress() {
    progress.load();
  }

  function finishStartup() {
    startupCoordinator?.finishStartup();
  }

  function updateProtocolGate(accountState = coop?.accountState?.()) {
    startupCoordinator.updateProtocolGate(accountState);
  }

  function isSignInScreenReady() {
    return startupCoordinator.isSignInScreenReady();
  }

  function showMessage(text: string, color = "#fff") {
    runtimeHud.showMessage(text, color);
  }

  function logPickup(text: string, color: string) {
    runtimeHud.logPickup(text, color);
  }

  let observedCoopSessionGeneration = 0;

  function updateHud(force = false) {
    runtimeHud.updateHud(force);
  }

  const profileWindow = createProfileWindowController({
    window: playerProfileEl, name: playerProfileNameEl, presence: playerProfilePresenceEl, power: playerProfilePowerEl, icon: playerProfileIcon, loading: playerProfileLoadingEl,
    overviewTab: profileOverviewTab, statsTab: profileStatsTab, rankingTab: profileRankingTab, overviewPanel: profileOverviewPanel, statsPanel: profileStatsPanel, rankingPanel: profileRankingPanel, leaderboardStats: profileLeaderboardStatsEl,
    joined: profileJoinedEl, timePlayed: profileTimePlayedEl, kills: profileKillsEl, online: profileOnlineEl, statGrid: profileStatGrid,
    close: closePlayerProfileBtn, editName: editPlayerNameBtn, nameEditor: profileNameEditorEl, nameForm: profileNameEditorForm, nameInput: profileNameInput, saveName: savePlayerNameBtn,
    skinEdit: profileSkinToneEdit, skinChoices: profileSkinToneControl, preview: profileCharacterPreviewEl, previousSprite: previousPlayerSpriteBtn, nextSprite: nextPlayerSpriteBtn,
    duel: profileDuelBtn, developerEdit: profileEditPanel, developerEditButton: editPlayerSaveBtn,
    editNameInput: profileEditName, editMaxHp: profileEditMaxHp, editDamage: profileEditDamage, editAttackRate: profileEditAttackRate, editArmor: profileEditArmor, editRegen: profileEditRegen, editSpeed: profileEditSpeed, editAttackRange: profileEditAttackRange, editProjectileSpeed: profileEditProjectileSpeed, editProjectileCount: profileEditProjectileCount,
    cancelDeveloperEdit: cancelPlayerSaveEditBtn, saveDeveloperEdit: savePlayerSaveEditBtn,
  }, {
    localIdentity: () => coop?.localIdentity?.(), localDisplayName: () => coop?.localDisplayName?.(), profileIcon: (identity) => coop?.profileIcon?.(identity) ?? 0, paintIcon: applyProfileIcon,
    renderName: renderDomPlayerName,
    isOnline: (identity) => identity === coop?.localIdentity?.()
      ? Boolean(coop?.isConnected?.()) && (!isDeveloperIdentity(identity) || coop?.developerPresenceVisible?.() === true)
      : Boolean(coop?.activePlayerMap?.(identity)) || coop?.remotePlayers?.().some((other) => other.id === identity) === true,
    presenceText: (profile, online) => {
      const mapName = profile.mapId === BEGINNER_DESERT_MAP_ID ? "BEGINNER DESERT" : profile.mapId === INTERMEDIATE_SNOWLANDS_MAP_ID ? "INTERMEDIATE SNOWLANDS" : profile.mapId === TUTORIAL_FOREST_MAP_ID ? "TUTORIAL FOREST" : "";
      return online && mapName ? `ONLINE - ${mapName}` : profilePresenceText(online, profile.lifetime.sessionStartedAtMs);
    },
    renderCharacter: (identity, progress, visible) => profileCharacterPreview.draw({ visible, progress, skinTone: coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE }),
    skinTone: (identity) => coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE, setSkinTone: async (value) => coop?.setSkinTone?.(value),
    renderStats: (profile, element) => renderProfileStats(profile, element, formatArmorReduction, MIN_ATTACK_INTERVAL, profile.research),
    renderRankings: () => undefined, entries: () => coop?.leaderboardEntries?.() ?? [], formatPower: (progress) => formatCompactNumber(playerPower(progress)), formatPlayedTime,
    profile: (identity) => coop?.playerProfile?.(identity), loadProfile: async (identity) => coop?.loadPlayerProfile?.(identity), releaseProfile: () => { coop?.releasePlayerProfile?.(); },
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), isDueling, duelCooldownMs: () => coop?.duelCooldownRemainingMs?.() ?? 0, requestDuel: async (identity) => coop?.requestDuel?.(identity),
    isNameTaken: (name) => coop?.isDisplayNameTaken?.(name) ?? false, setDisplayName: async (name) => coop?.setDisplayName?.(name), updateSave: async (identity, save) => coop?.updatePlayerSave?.(identity, save), showMessage,
  });
  new ResizeObserver(() => { if (profileCharacterPreview.resize()) profileWindow.drawPreview(); }).observe(profileCharacterCanvas);

  const techTree = createTechTreePanel({ e: gameElements, researchRanks, activeResearch: () => coop?.activeResearch?.() ?? null, startResearch: async (id: "warcraft" | "foraging" | "prosperity" | "vitality" | "precision" | "criticalChance") => coop?.startResearch?.(id), claimResearch: async () => coop?.claimResearch?.(), showMessage, beforeOpen: () => { settingsPanel.hidden = true; inventoryPanel.hidden = true; closeLeaderboard(); devPanel.close(); } });

  const leaderboard = createLeaderboardPanel({ e: gameElements, options: {
    entries: () => coop?.leaderboardEntries?.() ?? [],
    localIdentity: () => coop?.localIdentity?.() || "",
    isDeveloper: isDeveloperIdentity,
    paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => paintProfileIconCanvas(canvas, coop?.profileIcon?.(identity) ?? 0),
    openProfile: (identity: string, name: string) => { void profileWindow.open(identity, name); },
    beforeOpen: () => {
      devPanel.close();
      techTree.close();
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
    },
  } });

  function closeLeaderboard() {
    leaderboard.close();
  }

  const devPanel = createDevPanel({
    coop,
    getMetrics: () => ({
      performance: performanceMonitor.snapshot(),
      enemies: enemies.length,
      projectiles: projectiles.length + enemyShots.length,
      particles: particles.length,
      remotePlayers: coop?.remotePlayerCount?.() ?? 0,
      dpr: canvasRuntime.dpr(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      subscriptions: coop?.subscriptionCount?.() ?? 0,
    }),
    closeCompetingWindows: () => {
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      closeLeaderboard();
      techTree.close();
    },
    showMessage,
  });

  runtimeHud = createGameRuntimeHud({
    e: gameElements, coop, player, activeDuel, duelOpponentName, applyProfileIcon, playerPower,
    setDeveloperAccess: devPanel.setDeveloperAccess, applyVitalityResearch, updateTechNotice: techTree.updateNotice,
    tickTechTree: techTree.tick, refreshAppStatus: appShell.refreshStatus, updateProfileDuelButton: profileWindow.updateDuelButton,
  });

  function closeUpdateNotice() {
    overlays.closeUpdateNotice();
  }

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

  session = createGameSessionController({
    player, camera, viewport: canvasRuntime.viewport,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID, desertMapId: BEGINNER_DESERT_MAP_ID,
    getMapId: () => currentMapId, setMapId: (mapId) => { currentMapId = mapId as MapId; },
    serverMapId: () => coop?.localState?.()?.mapId,
    serverPlayerState: () => coop?.localState?.() ?? undefined,
    connected: () => Boolean(coop?.isConnected?.()),
    accountInConflict: () => Boolean(coop?.accountState?.().sessionConflict),
    lowPerformanceMode: appShell.lowPerformanceMode, ensureMusicPlaying: appShell.ensureMusicPlaying,
    hideStart: startup.hideStart, hideGameOver: startup.hideGameOver, showGameOver: startup.showGameOver,
    beginAdventure: () => { coop?.beginAdventure?.(); },
    syncPosition: () => { coop?.syncPosition?.(player.x, player.y, player.facing, false, true); },
    resetPlayer: (preserveStats) => {
      worldProgression.hideBootUpgrade();
      playerController.reset(preserveStats, progress.hasSavedProgress());
    },
    mapMusicSync: syncMapMusic,
    isDueling, activeDuel,
    syncDragon: bossController.syncDragonState, syncSpider: bossController.syncSpiderState,
    cutsceneActive: mapController.isCutsceneActive, updateCutscene: mapController.updatePortalCutscene,
    updatePlayer: playerController.update, updatePortal: mapController.updatePortal, updateBootPickup: worldProgression.updateBootPickup,
    updateEnemies: enemySimulation.update, updateDragon: bossController.updateBoss, updateSpider: bossController.updateSpiderBoss,
    updateProjectiles: playerCombat.updateProjectiles, updateRespawns,
    clearDuelCombat: () => { projectiles.length = 0; playerCombat.clearPendingBossHits(); enemyShots.length = 0; },
    updateEffects: effects.update, updateHud: () => updateHud(),
    updateVisuals: (dt) => { flash = Math.max(0, flash - dt); screenShake *= Math.pow(.01, dt); },
    updateMessage: runtimeHud.updateMessage,
    render: () => renderController.render(), recordPerformance: performanceMonitor.record,
    renderPerformancePanel: devPanel.renderPerformance, performancePanelVisible: devPanel.isPerformanceVisible,
    fadeElement: sceneFadeEl,
    onLeaveDuelResult: () => { duelResultEl.hidden = true; playerController.finishDuelResult(); },
  });

  startupCoordinator = createStartupCoordinator({
    version: GAME_VERSION,
    gameUpdateGate: gameUpdateGateEl,
    accountState: () => coop?.accountState?.(),
    pageLoadComplete: () => pageLoadComplete,
    playerSpriteReady: () => playerSpriteReady,
    worldArtReady: assets.worldArtReady,
    guestContinuationChosen: () => guestContinuationChosen,
    newPlayerIntroShown: () => newPlayerIntroShown,
    setNewPlayerIntroShown: () => { newPlayerIntroShown = true; },
    refreshLoading: startup.refreshLoading,
    showSessionConflict: startup.showSessionConflict,
    showAccountChoice: startup.showAccountChoice,
    showNewPlayerIntro: startup.showNewPlayerIntro,
    isLoadingSequenceComplete: startup.isLoadingSequenceComplete,
    hasStarted: session.hasStarted,
    isRunning: session.isRunning,
    connected: () => Boolean(coop?.isConnected?.()),
    progressLoaded: progress.isLoaded,
    hasLocalState: () => Boolean(coop?.localState?.()),
    localProfileReady: () => Boolean(coop?.localProfileReady?.()),
    startupKind: progress.startupKind,
    beginAdventure: () => { coop?.beginAdventure?.(); },
    startGame: () => startGame(false),
  });
  finishStartup();
  startupCoordinator.startVersionPolling();

  function startGame(markIntro = true, restoreServerPosition = true) {
    session.start(markIntro, restoreServerPosition);
  }

  function endGame() {
    screenShake = 0;
    flash = 0;
    session.end();
  }

  bindGameInteractionListeners({
    triggerDragonCutscene: triggerDragonCutsceneBtn,
    triggerSnowlandsCutscene: triggerSnowlandsCutsceneBtn,
    hpText,
    watchDuelReplay: watchDuelReplayBtn,
    playerHudProfile: playerHudProfileIcon,
    playerProfileIcon,
    closeProfileIconPicker: closeProfileIconPickerBtn,
    onDragonCutscene: () => {
      if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
      if (currentMapId !== TUTORIAL_FOREST_MAP_ID) {
        showMessage("DRAGON CUTSCENE: TUTORIAL FOREST ONLY", "#ff9b91");
        return;
      }
      if (mapController.isCutsceneActive()) return;
      devPanel.close();
      startDragonPortalCutscene(true);
    },
    onSnowlandsCutscene: () => {
      if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
      if (currentMapId !== BEGINNER_DESERT_MAP_ID) {
        showMessage("SNOWLANDS CUTSCENE: BEGINNER DESERT ONLY", "#ff9b91");
        return;
      }
      if (mapController.isCutsceneActive()) return;
      devPanel.close();
      startSnowlandsPortalCutscene(true);
    },
    onOpenOwnProfile: () => {
      const identity = coop?.localIdentity?.();
      if (identity) void profileWindow.open(identity, coop?.localDisplayName?.() || "PLAYER");
    },
    replayId: () => BigInt(duelResultEl.dataset.replayId || "0"),
    onWatchReplay: (replayId) => { void duelRuntime.openReplay(replayId); },
    canOpenProfileIconPicker: () => profileWindow.identity() === coop?.localIdentity?.(),
    openProfileIconPicker,
    closeIconPicker: closeProfileIconPicker,
  });

  const chatRuntime = createChatRuntimeController({
    getCoop: () => coop,
    showMessage,
    onOpenPlayer: (identity, name) => { void profileWindow.open(identity, name); },
    openReplay: (replayId) => { void duelRuntime.openReplay(replayId); },
  });
  chatRuntime.init();

  inputEscapeHandler = createGameActionsRuntime({
    e: gameElements, inventory, renderInventory, logPickup, leaveDuelResult, closeUpdateNotice,
    closeCompetingWindows: () => { closeLeaderboard(); devPanel.close(); techTree.close(); },
    closeDuelReplay: duelRuntime.closeReplayWindow, closeBootUpgrade: worldProgression.closeBootUpgrade,
    resetServerProgress: () => coop?.resetProgress?.(),
    clearProgressState: () => { progress.resetState(); newPlayerIntroShown = false; },
    setTotalKills: (value: number) => { totalKills = value; },
    setBootsCollected: (collected: boolean) => { bootsPickup.collected = collected; },
    clearPlayerInput: playerInput.clear,
    resetGame: () => { session.setPaused(false); playerController.reset(false, progress.hasSavedProgress()); session.setHasStarted(false); },
    stopGame: session.stop, startConnecting: startup.showConnecting, hideGameOver: startup.hideGameOver,
    refreshFrameClock: session.refreshFrameClock, closeProfileIconPicker, inventoryController,
    leaderboard, closeLeaderboard, devPanel, profileWindow,
  }).handleInputEscape;

  const coopSession = createCoopSessionController({
    coop,
    syncLifetimeKills: progress.syncLifetimeKills,
    refreshOpenProfile: () => {
      const identity = profileWindow.identity();
      if (!identity) return;
      const profile = coop?.playerProfile?.(identity);
      if (profile) profileWindow.render(profile);
    },
    refreshLeaderboard: () => { if (leaderboard.isOpen()) leaderboard.render(); },
    refreshDevPanel: devPanel.refresh,
    loadProgress,
    observedSessionGeneration: () => observedCoopSessionGeneration,
    setObservedSessionGeneration: (generation) => { observedCoopSessionGeneration = generation; },
    resetMovementSync: playerController.resetMovementSync,
    running: session.isRunning,
    syncPlayerState: () => {
      coop?.syncSpeed?.(player.speed * researchMovementSpeedMultiplier());
      coop?.syncPosition?.(player.x, player.y, player.facing, player.moving, true);
    },
    reconcileMap: mapController.reconcileMapFromServer,
    syncBossState: () => {
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) bossController.syncDragonState();
    },
    finishStartup,
    clearSignInPending: startup.clearSignInPending,
    updateProtocolGate,
    showSessionConflict: startup.showSessionConflict,
    shouldShowSigningIn: (account) => !session.hasStarted() && !account?.signedIn && Boolean(
      account?.returningFromSignIn || account?.authInProgress || startup.isSignInPending(),
    ),
    showSigningIn: startup.showSigningIn,
    shouldShowLoading: (account) => !session.hasStarted()
      && account?.signedIn === true
      && progress.startupKind() !== "new",
    showLoading: startup.showLoading,
    shouldShowAccountChoice: (account) => !session.hasStarted() && !account?.signedIn && !account?.authInProgress,
    showAccountChoice: startup.showAccountChoice,
    refreshChat: chatRuntime.refresh,
    updateDuelControls,
    refreshAppStatus: appShell.refreshStatus,
    refreshReconnectOverlay: () => { reconnectOverlayEl.hidden = !coop?.isReconnectingAfterWake?.(); },
  });
  if (coop?.setOnChange) coop.setOnChange(coopSession.onChange);
  reconnectOverlayEl.hidden = !coop?.isReconnectingAfterWake?.();
  updateDuelControls();
  appShell.refreshSettings();
  appShell.refreshFullscreen();
  appShell.refreshStatus();
  updateProtocolGate();

  startGameRuntime({
    restartButton: requiredElement<HTMLButtonElement>("restartBtn"),
    startGame,
    accountState: () => coop?.accountState?.(),
    showSigningIn: startup.showSigningIn,
    showAccountChoice: startup.showAccountChoice,
    showConnecting: startup.showConnecting,
    loadProgress,
    rebuildWorld: playerController.rebuildWorld,
    camera,
    player,
    viewport: canvasRuntime.viewport,
    render: renderController.render,
    loop: session.loop,
  });
})();
