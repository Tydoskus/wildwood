import { recentReleaseNotes } from "./app/changelog";
import { isDeveloperIdentity } from "./app/developer";
import {
  BASE_ATTACK_RANGE,
  BASE_PROJECTILE_SPEED,
} from "./game/constants";
import { clamp, distanceSquared, rand } from "./game/math";
import { damageAfterArmor, formatArmorReduction } from "./game/combat";
import { DARK_METAL_HELMET, equipmentAppearance, FIRE_METAL_BOW, FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, IRON_BOW, moveCosmeticInventoryItem, moveInventoryItem, setInventoryItemQuantity, STARTER_BOW, toggleCosmeticEquipmentVisibility, TRAILBLAZER_BOOTS } from "./game/inventory";
import { itemPresentation } from "./game/item-presentation";
import { createMapMusicController } from "./game/runtime/audio";
import { createCamera } from "./game/runtime/camera";
import { createCombatEffects } from "./game/runtime/combat-effects";
import { createEnemyLifecycle } from "./game/runtime/enemy-lifecycle";
import { createEnemySimulation } from "./game/runtime/enemy-simulation";
import { createCoopSessionController } from "./game/runtime/coop-session-controller";
import { createProgressController } from "./game/runtime/progress-controller";
import { createGameSessionController } from "./game/runtime/game-session-controller";
import { createPerformanceMonitor } from "./game/runtime/performance-monitor";
import { createPresentationInterpolator } from "./game/runtime/presentation-interpolator";
import { createGameBootstrap, createGameBootstrapAssets, startGameRuntime } from "./game/runtime/game-bootstrap";
import { createPlayerIdentityRenderer } from "./game/runtime/player-identity-renderer";
import type { PlayerDeathAnimationState } from "./game/runtime/player-death-animation";
import { createDuelRuntime } from "./game/runtime/duel-runtime";
import { createDuelSessionController } from "./game/runtime/duel-session-controller";
import { createCanvasRuntime, gameplayBottomInset } from "./game/runtime/canvas-runtime";
import { ANTI_ALIASING_ENABLED_KEY, ATTACK_RANGE_VISIBLE_KEY, DRAGON_PORTAL_CUTSCENE_SEEN_KEY, ENEMY_DEATH_PARTICLE_COLOR, ENEMY_TEXT_CULL_MIN_DISTANCE, FPS_VISIBLE_KEY, GAME_VERSION, INFERNAL_PORTAL_CUTSCENE_SEEN_KEY, LATENCY_VISIBLE_KEY, LAVA_PORTAL_CUTSCENE_SEEN_KEY, LOW_PERFORMANCE_MODE_KEY, MUSIC_VOLUME_KEY, NETWORK_NEAR_SCREEN_MARGIN_RATIO, REWARDED_RESPAWN_BOOST_EXPIRES_KEY, SEEN_VERSION_KEY, SFX_VOLUME_KEY, SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY, WORLD_HEALTH_BAR_HEIGHT } from "./game/runtime/game-settings";
import { createWorldProgressionController } from "./game/runtime/world-progression-controller";
import { BOSS_HP_LOSS_FLASH_DURATION, createBossController, SPIDER_WEB_RANGE } from "./game/runtime/boss-controller";
import { createMapController } from "./game/runtime/map-controller";
import { createPlayerCombatController, type PlayerCombatController } from "./game/runtime/player-combat-controller";
import { createPlayerInputController } from "./game/runtime/player-input-controller";
import { createPlayerController, type PlayerController } from "./game/runtime/player-controller";
import { applyPlayerMaxHealthMultiplier } from "./game/runtime/player-health";
import { createRegularEnemyRespawnBoost } from "./game/runtime/regular-enemy-respawn";
import { createResearchController } from "./game/runtime/research-controller";
import { createWorldRenderRuntime } from "./game/runtime/world-render-runtime";
import { createWebGLStaticWorldLayer } from "./game/runtime/webgl-static-world-layer";
import { DEFAULT_SKIN_TONE, PLAYER_SKIN_TONES, PLAYER_SKIN_TONE_NAMES, warmPlayerAppearanceCache } from "./game/player-appearance";
import type { DuelScene } from "./game/runtime/types";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  UPGRADE_BENCH_POSITION,
  type MapId,
} from "./game/world";
import {
  DUEL_COMBAT_Y,
} from "./game/duel";
import { createChatRuntimeController } from "./ui/chat-runtime-controller";
import { createInventoryController } from "./ui/inventory-controller";
import { createItemInspectionController } from "./ui/item-inspection-controller";
import { createUpgradeBenchController } from "./ui/upgrade-bench-controller";
import { createLeaderboardController } from "./ui/leaderboard-controller";
import { createProfileWindowController } from "./ui/profile-window-controller";
import { formatPlayedTime, profilePower, profilePresenceText, renderProfileStats } from "./ui/profile";
import { createTechTreeController } from "./ui/tech-tree-controller";
import { createAppShellController } from "./ui/app-shell-controller";
import { createStartupController } from "./ui/startup-controller";
import { createDeathScreenController } from "./ui/death-screen-controller";
import { createDailyGemBonusController } from "./ui/daily-gem-bonus-controller";
import { createMapGuideController } from "./ui/map-guide-controller";
import { createStartupCoordinator } from "./ui/startup-coordinator";
import { createRewardedRespawnAdController } from "./ui/rewarded-respawn-ad-controller";
import { createGameElements } from "./ui/game-elements";
import { bindGameInteractionListeners } from "./ui/game-interaction-bindings";
import { createDevPanel, createGameActionsRuntime, createGameOverlays, createGameRuntimeHud, createLeaderboardPanel, createTechTreePanel } from "./ui/game-ui-runtime";
import { formatCompactNumber, formatGemAmount } from "./ui/number-format";
import { playerGenderIconPath } from "./ui/player-gender";
import type { LeaderboardEntry, wildwoodCoop } from "./wildwood-coop";
import type { ResearchId } from "../shared/research";
import { PLAYER_GENDER_FEMALE, PLAYER_GENDER_MALE } from "../shared/player-gender";
import { effectivePlayerPower } from "../shared/player-power";
import { equipmentMaxHealthMultiplier, equipmentRegenerationMultiplier, isWeaponItem, itemDisplayName, itemStats } from "../shared/items";
import {
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
    canvas, gameOverEl, deathCountdownEl, hpFill, hpText, playerNameEl, playerPowerEl, playerHudProfileIcon, hudGemWallet, hudGemBalance, dailyGemBonusEl, dailyGemClaimBtn, chatPanel, coopStatusEl, messageEl, pickupLog,
    minimapButton, enemyRespawnAdBtn, enemyRespawnAdStatus, enemyRespawnBoostStatus, enemyRespawnBoostTimer, browserRewardedAd, browserRewardedAdTimer,
    toolbar, settingsBtn, inventoryBtn, settingsPanel, closeSettingsBtn, inventoryPanel, closeInventoryBtn, inventoryCharacterCanvas, itemInspectionPanel, itemInspectionTitle, itemInspectionContent, closeItemInspectionBtn, itemInspectionBack, resetProgressBtn, bootUpgradeEl, bootUpgradeClose, joystickEl, stickEl,
    techTreeBtn, techTreeNotice, techTreeOverlay, closeTechTreeBtn, techTreeActive, techTreeCanvas, techTreeMap, techTreeDetail, techTreeDetailContent, closeTechTreeDetailBtn,
    duelControls, duelStatusEl, duelRequestBtn, duelAcceptBtn, duelCountdownEl, duelResultEl, duelResultTitle, duelResultStats, watchDuelReplayBtn, closeDuelResultBtn, duelReplayEl, duelReplayTitle, closeDuelReplayBtn, sceneFadeEl, cutsceneOverlayEl,
    dragonResultEl, dragonResultTitle, dragonResultTotal, dragonResultContributors, closeDragonResultBtn, dragonWorldNoticeEl, dragonWorldNoticeDetailEl,
    playerProfileEl, playerProfileNameEl, playerProfileGuestLabel, playerProfilePresenceEl, playerProfilePowerEl, playerProfileIcon, editPlayerNameBtn, profileCharacterPreviewEl, profileCharacterCanvas, previousPlayerSpriteBtn, nextPlayerSpriteBtn, profileSkinToneEdit, profileSkinToneControl,
    playerProfileLoadingEl, profileOverviewTab, profileStatsTab, profileOverviewPanel, profileStatsPanel, profileJoinedEl, profileTimePlayedEl, profileKillsEl, profileOnlineEl, profileStatGrid, closePlayerProfileBtn, editPlayerSaveBtn, profileDuelBtn, profileNameEditorEl, profileNameEditorForm, profileNameInput, savePlayerNameBtn, profileEditPanel, profileEditName, profileEditMaxHp, profileEditDamage, profileEditAttackRate, profileEditArmor, profileEditRegen, profileEditSpeed, profileEditAttackRange, profileEditProjectileSpeed, profileEditProjectileCount, cancelPlayerSaveEditBtn, savePlayerSaveEditBtn,
    leaderboardBtn, leaderboardEl, leaderboardPowerTab, leaderboardDamageTab, leaderboardHealthTab, leaderboardArmorTab, leaderboardRegenTab, leaderboardTimeTab, leaderboardValueHeading, leaderboardPodiumEl, leaderboardRowsEl, leaderboardLoadingEl, leaderboardEmptyEl, closeLeaderboardBtn,
    mapGuideEl, mapGuideTitle, mapGuideCanvas, mapGuideZoneLabels, mapGuideDropItems, mapGuideBack,
    triggerDragonCutsceneBtn, triggerSnowlandsCutsceneBtn, triggerLavaCutsceneBtn, updateNoticeEl, updateNoticeTitleEl, updateNoticeItemsEl, closeUpdateNoticeBtn, signinVersionEl, profileIconPickerEl, profileIconChoices, closeProfileIconPickerBtn, gameUpdateGateEl, reconnectOverlayEl,
  } = gameElements;
  let actorShadowSprite!: HTMLImageElement;
  const staticWorldLayer = createWebGLStaticWorldLayer(canvas);
  const canvasRuntime = createCanvasRuntime({
    canvas,
    transparent: Boolean(staticWorldLayer),
    bottomInset: () => document.body.classList.contains("is-cutscene")
      ? 0
      : gameplayBottomInset(toolbar.getBoundingClientRect().height),
    getActorShadowSprite: () => actorShadowSprite,
  });
  const { ctx, outlinedWorldText, fillWorldText, pixelCircle, roundRect, drawActorShadow } = canvasRuntime;
  const coop = window.wildwoodCoop || null;
  function refreshGemCounter() {
    const balance = formatGemAmount(coop?.gemBalance?.() ?? 0n);
    hudGemBalance.textContent = balance;
    hudGemWallet.setAttribute("aria-label", `${balance} Gems`);
  }
  refreshGemCounter();
  const overlays = createGameOverlays({ e: gameElements, coop, version: GAME_VERSION, seenVersionKey: SEEN_VERSION_KEY, applyProfileIcon: (element: HTMLElement, index: number) => applyProfileIcon(element, index), showMessage, afterIconSet: () => { applyProfileIcon(playerHudProfileIcon, coop?.profileIcon?.() ?? 0); if (profileWindow.identity() === coop?.localIdentity?.()) applyProfileIcon(playerProfileIcon, coop?.profileIcon?.() ?? 0); } });

  let startupCoordinator!: ReturnType<typeof createStartupCoordinator>;
  let localPlayerDeath: PlayerDeathAnimationState | null = null;

  const deathScreen = createDeathScreenController({
    screen: gameOverEl,
    countdown: deathCountdownEl,
    onRespawn: () => startGame(false, false),
  });

  const mapMusic = createMapMusicController(MUSIC_VOLUME_KEY, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, SFX_VOLUME_KEY);

  function syncMapMusic() {
    mapMusic.syncMap(currentMapId);
  }

  const camera = createCamera();
  const effects = createCombatEffects();
  const performanceMonitor = createPerformanceMonitor();
  const { particles, damageNumbers, spawnParticle, spawnBurst, spawnDamageNumber } = effects;
  const bootstrap = createGameBootstrap();
  const {
    boss,
    bossRain,
    bootsPickup,
    decor,
    enemies,
    enemyShots,
    frostclawBoss,
    frostclawIcefalls,
    inventory,
    magmaliskBoss,
    magmaliskEruptions,
    mapConfig: MAP_CONFIG,
    paths,
    player,
    projectiles,
    projectileStore,
    spawnSites,
    spiderBoss,
    spiderVenom,
    startSpawn: START_SPAWN,
  } = bootstrap;
  const presentation = createPresentationInterpolator({
    singletons: [camera, player, boss, spiderBoss, frostclawBoss, magmaliskBoss],
    collections: [enemies, projectiles, enemyShots, bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, particles, damageNumbers],
  });
  const healthMultiplier = () => equipmentMaxHealthMultiplier(
    inventory.equippedHead,
    inventory.equippedChest,
    1,
    coop?.itemUpgradeLevel?.(inventory.equippedHead) ?? 0,
    coop?.itemUpgradeLevel?.(inventory.equippedChest) ?? 0,
  );
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, spawnBurst);
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;

  function mapNameForPresence(mapId: string | undefined) {
    return mapId && mapId in MAP_CONFIG ? MAP_CONFIG[mapId as MapId].name : "";
  }

  let totalKills = 0;
  let flash = 0;
  let screenShake = 0;
  let runtimeHud!: ReturnType<typeof createGameRuntimeHud>;
  let heldDuelScene: DuelScene | null = null;
  let renderedDuelScene: DuelScene | null = null;
  let session: ReturnType<typeof createGameSessionController>;
  let duelRuntime!: ReturnType<typeof createDuelRuntime>;
  const gameplayPauseReasons = new Set<string>();

  function applyGameplayPauseState() {
    if (!session?.isRunning()) return;
    const shouldPause = gameplayPauseReasons.size > 0;
    if (session.isPaused() === shouldPause) return;
    session.setPaused(shouldPause);
    if (!shouldPause) session.refreshFrameClock();
  }

  function setGameplayPause(reason: string, active: boolean) {
    if (active) gameplayPauseReasons.add(reason);
    else gameplayPauseReasons.delete(reason);
    applyGameplayPauseState();
  }

  function readRespawnBoostExpiry() {
    try {
      const expiresAt = Number(localStorage.getItem(REWARDED_RESPAWN_BOOST_EXPIRES_KEY));
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return expiresAt;
      localStorage.removeItem(REWARDED_RESPAWN_BOOST_EXPIRES_KEY);
    } catch {}
    return 0;
  }

  const regularEnemyRespawnBoost = createRegularEnemyRespawnBoost(
    spawnSites,
    () => session.gameTime(),
    Date.now,
    readRespawnBoostExpiry(),
  );

  function activateRewardedRespawnBoost() {
    const activated = regularEnemyRespawnBoost.activate();
    if (!activated) return false;
    try { localStorage.setItem(REWARDED_RESPAWN_BOOST_EXPIRES_KEY, String(regularEnemyRespawnBoost.activeUntilMs())); } catch {}
    return true;
  }

  function clearExpiredRespawnBoost() {
    try { localStorage.removeItem(REWARDED_RESPAWN_BOOST_EXPIRES_KEY); } catch {}
  }

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
      fps: FPS_VISIBLE_KEY,
      lowPerformance: LOW_PERFORMANCE_MODE_KEY,
      latency: LATENCY_VISIBLE_KEY,
      musicVolume: MUSIC_VOLUME_KEY,
      sfxVolume: SFX_VOLUME_KEY,
    },
    connected: () => Boolean(coop?.isConnected?.()),
    latencyMs: () => coop?.latencyMs?.(),
    accountState: () => coop?.accountState?.(),
    signIn: () => { void coop?.signIn?.(); },
    signOut: () => { coop?.signOut?.(); },
    canPlayMusic: () => !gameplayPauseReasons.has("rewarded-ad"),
    onScreenShakeDisabled: () => { screenShake = 0; },
    onLowPerformanceChanged: () => { session.resetFrameSchedule(); },
    showMessage,
  });

  const startup = createStartupController({
    accountState: () => coop?.accountState?.(),
    connected: () => Boolean(coop?.isConnected?.()),
    knownCharacter: () => coop?.knownCharacter?.() ?? "",
    knownCharacterGender: () => coop?.knownCharacterGender?.() ?? 0,
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
      else if (!session.hasStarted() && !account?.signedIn && !account?.authInProgress && !account?.guestSessionApproved) startup.showAccountChoice();
    }, { once: true });
  }

  let progress: ReturnType<typeof createProgressController>;
  const itemInspectionController = createItemInspectionController({
    panel: itemInspectionPanel,
    title: itemInspectionTitle,
    content: itemInspectionContent,
    close: closeItemInspectionBtn,
    back: itemInspectionBack,
  });
  const inventoryController = createInventoryController({
    inventory,
    itemInspection: itemInspectionController,
    upgradeLevel: (itemId) => coop?.itemUpgradeLevel?.(itemId) ?? 0,
    inventorySlotsUnlocked: () => coop?.inventorySlotsUnlocked?.() ?? 0,
    gemBalance: () => coop?.gemBalance?.() ?? 0n,
    unlockInventorySlot: async () => coop?.unlockInventorySlot?.(),
    showMessage,
    move: (itemId, destination) => {
      if (!moveInventoryItem(inventory, itemId, destination)) return false;
      player.speed = progress.movementSpeedForEquipment(inventory.equippedFeet === TRAILBLAZER_BOOTS);
      applyPlayerMaxHealthMultiplier(player, healthMultiplier());
      const hasWeapon = isWeaponItem(inventory.equippedRightHand || inventory.equippedLeftHand);
      saveProgress(true);
      showMessage(hasWeapon ? "EQUIPMENT UPDATED · WEAPON READY" : "EQUIPMENT UPDATED", "#72ef58");
      return true;
    },
    moveCosmetic: (itemId, destination) => {
      if (!moveCosmeticInventoryItem(inventory, itemId, destination)) return false;
      saveProgress(true);
      showMessage("COSMETIC UPDATED · STATS UNCHANGED", "#f0c66b");
      return true;
    },
    toggleCosmeticVisibility: (destination) => {
      const change = toggleCosmeticEquipmentVisibility(inventory, destination);
      if (!change) return false;
      saveProgress(true);
      showMessage(
        change === "HIDDEN"
          ? "COSMETIC UPDATED · WEARING NOTHING · STATS UNCHANGED"
          : "COSMETIC UPDATED · EQUIPMENT VISIBLE · STATS UNCHANGED",
        "#f0c66b",
      );
      return true;
    },
  });
  const renderInventory = inventoryController.render;
  let upgradeBenchController!: ReturnType<typeof createUpgradeBenchController>;
  const worldProgression = createWorldProgressionController({
    player,
    bootsPickup,
    movementSpeedForBoots: (bootsEquipped) => progress.movementSpeedForEquipment(bootsEquipped),
    collectBoots: () => {
      inventory.itemIds = [...new Set([...inventory.itemIds, TRAILBLAZER_BOOTS])];
      inventory.equippedFeet = TRAILBLAZER_BOOTS;
      inventory.selectedItemId = TRAILBLAZER_BOOTS;
      inventory.selectedItemLocation = "FEET";
    },
    saveProgress: () => saveProgress(),
    renderInventory,
    pause: () => setGameplayPause("boot-upgrade", true),
    resume: () => setGameplayPause("boot-upgrade", false),
    bootUpgrade: bootUpgradeEl,
    bootUpgradeClose,
    dragonCutsceneSeenKey: DRAGON_PORTAL_CUTSCENE_SEEN_KEY,
    snowlandsCutsceneSeenKey: SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY,
    lavaCutsceneSeenKey: LAVA_PORTAL_CUTSCENE_SEEN_KEY,
    infernalCutsceneSeenKey: INFERNAL_PORTAL_CUTSCENE_SEEN_KEY,
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
    projectileStore.spawnEnemyShot,
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
    healthMultiplier,
  });
  const {
    ranks: researchRanks,
    damageMultiplier: researchDamageMultiplier,
    rewardMultiplier: researchRewardMultiplier,
    movementSpeedMultiplier: researchMovementSpeedMultiplier,
    regenerationMultiplier: researchRegenerationMultiplier,
    effectiveArmor,
    criticalChance: researchCriticalChance,
    criticalDamageMultiplier: researchCriticalDamageMultiplier,
    applyVitality: applyVitalityResearch,
  } = research;
  const regenerationMultiplier = () => equipmentRegenerationMultiplier(
    inventory.equippedHead,
    inventory.equippedChest,
    researchRegenerationMultiplier(),
    coop?.itemUpgradeLevel?.(inventory.equippedHead) ?? 0,
    coop?.itemUpgradeLevel?.(inventory.equippedChest) ?? 0,
  );
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
    healthMultiplier,
    setAppliedVitalityRank: research.setAppliedVitalityRank,
    renderInventory,
    onLoaded: finishStartup,
  });

  playerCombat = createPlayerCombatController({
    player, enemies, spawnSites, projectileStore, boss, spiderBoss, frostclawBoss, magmaliskBoss,
    nowSeconds: () => session?.gameTime() ?? 0,
    isTutorialMap: () => currentMapId === TUTORIAL_FOREST_MAP_ID,
    isDesertMap: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    isSnowMap: () => currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID,
    isLavaMap: () => currentMapId === ADVANCED_LAVA_WASTES_MAP_ID || currentMapId === INFERNAL_DEPTHS_MAP_ID,
    engageEnemy,
    researchDamageMultiplier,
    researchCriticalChance,
    researchCriticalDamageMultiplier,
    researchRewardMultiplier,
    researchAttackSpeedMultiplier: () => 1,
    equippedWeapon: () => inventory.equippedRightHand || inventory.equippedLeftHand,
    equippedWeaponUpgradeLevel: () => coop?.itemUpgradeLevel?.(inventory.equippedRightHand || inventory.equippedLeftHand) ?? 0,
    equippedHead: () => inventory.equippedHead,
    equippedHeadUpgradeLevel: () => coop?.itemUpgradeLevel?.(inventory.equippedHead) ?? 0,
    equippedChest: () => inventory.equippedChest,
    equippedChestUpgradeLevel: () => coop?.itemUpgradeLevel?.(inventory.equippedChest) ?? 0,
    healthMultiplier,
    minAttackInterval: MIN_ATTACK_INTERVAL,
    effectiveArmor,
    isDueling,
    scheduleEnemyRespawn: regularEnemyRespawnBoost.schedule,
    incrementKills: () => { totalKills += 1; },
    recordForestEnemyDefeat: () => coop?.recordForestEnemyDefeat?.(),
    recordDesertEnemyDefeat: () => coop?.recordDesertEnemyDefeat?.(),
    recordLavaEnemyDefeat: () => coop?.recordLavaEnemyDefeat?.(),
    damageDragon: (hits) => coop?.damageDragon?.(hits, player.x, player.y),
    damageSpider: (hits) => coop?.damageSpider?.(hits, player.x, player.y),
    damageFrostclaw: (hits) => coop?.damageFrostclaw?.(hits, player.x, player.y),
    damageMagmalisk: (hits) => coop?.damageMagmalisk?.(hits, player.x, player.y),
    spawnBurst,
    spawnParticle,
    spawnDamageNumber,
    playBowAttackSound: mapMusic.playBowAttackSound,
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
  const powerIcon = new Image();
  powerIcon.src = "assets/wildwood/icons/Icon_Battle_Candy_v1.png";
  const maleGenderIcon = new Image();
  maleGenderIcon.src = playerGenderIconPath(PLAYER_GENDER_MALE);
  const femaleGenderIcon = new Image();
  femaleGenderIcon.src = playerGenderIconPath(PLAYER_GENDER_FEMALE);
  const playerIdentityRenderer = createPlayerIdentityRenderer({
    ctx,
    camera,
    viewport: canvasRuntime.viewport,
    profileIconSheet,
    powerIcon,
    genderIcons: {
      [PLAYER_GENDER_MALE]: maleGenderIcon,
      [PLAYER_GENDER_FEMALE]: femaleGenderIcon,
    },
    antiAliasingEnabled: () => appShell.antiAliasingEnabled(),
    isDeveloper: isDeveloperIdentity,
    isLocallyInvisible: (identity) => identity === coop?.localIdentity?.() && isDeveloperIdentity(identity) && coop?.developerPresenceVisible?.() === false,
    isGuest: (identity) => coop?.isGuest?.(identity) ?? false,
    profileIcon: (identity) => coop?.profileIcon?.(identity) ?? 0,
    playerGender: (identity) => coop?.playerGender?.(identity) ?? 0,
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
    drawPlayerIdentity,
  } = playerIdentityRenderer;
  const playerPower: typeof playerIdentityRenderer.playerPower = () => effectivePlayerPower({
    maxHp: player.baseMaxHp,
    damage: player.damage,
    attackRate: player.attackRate,
    armor: player.armor,
    regen: player.regen,
    equippedChest: inventory.equippedChest,
    equippedRightHand: inventory.equippedRightHand,
    equippedLeftHand: inventory.equippedLeftHand,
  }, researchRanks(), (itemId) => coop?.itemUpgradeLevel?.(itemId) ?? 0);

  let playerController: PlayerController;
  const mapController = createMapController({
    mapConfig: MAP_CONFIG,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    desertMapId: BEGINNER_DESERT_MAP_ID,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    lavaMapId: ADVANCED_LAVA_WASTES_MAP_ID,
    infernalMapId: INFERNAL_DEPTHS_MAP_ID,
    dragonCutsceneSeenKey: DRAGON_PORTAL_CUTSCENE_SEEN_KEY,
    snowlandsCutsceneSeenKey: SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY,
    lavaCutsceneSeenKey: LAVA_PORTAL_CUTSCENE_SEEN_KEY,
    infernalCutsceneSeenKey: INFERNAL_PORTAL_CUTSCENE_SEEN_KEY,
    getCurrentMapId: () => currentMapId,
    setCurrentMapId: (mapId) => { currentMapId = mapId; },
    player,
    camera,
    viewport: canvasRuntime.viewport,
    keys: playerInput.keys,
    stopTouchMove: playerInput.stopTouchMove,
    cutsceneOverlay: cutsceneOverlayEl,
    resizeViewport: canvasRuntime.resize,
    isDueling,
    running: () => session.isRunning(),
    localMapState: () => coop?.localState?.(),
    changeMap: (mapId, x, y) => coop?.changeMap?.(mapId, x, y),
    syncStoppedPosition: () => coop?.correctMovementPosition?.(player.x, player.y, true),
    fadeToWorld,
    mapUnlocked: (mapId) => mapId === BEGINNER_DESERT_MAP_ID
      ? Boolean(coop?.savedProgress?.()?.desertUnlocked)
      : mapId === INTERMEDIATE_SNOWLANDS_MAP_ID
        ? Boolean(coop?.savedProgress?.()?.snowlandsUnlocked)
        : mapId === ADVANCED_LAVA_WASTES_MAP_ID
          ? Boolean(coop?.savedProgress?.()?.lavaUnlocked)
        : mapId === INFERNAL_DEPTHS_MAP_ID
          ? Boolean(coop?.savedProgress?.()?.infernalUnlocked)
        : true,
    syncMapMusic,
    rebuildWorld: () => playerController.rebuildWorld(),
    spawnFromSite,
    enemies,
    spawnSites,
    clearTransientCombat: () => { projectileStore.clear(); effects.clear(); },
    bossRain,
    spiderVenom,
    frostclawIcefalls,
    magmaliskEruptions,
    boss,
    spiderBoss,
    frostclawBoss,
    magmaliskBoss,
    clearPendingBossHits: () => playerCombat.clearPendingBossHits(),
    showMapMessage: (mapId) => showMessage(MAP_CONFIG[mapId].name, "#ffe769"),
    onCutsceneFinished: (wasPreview) => bossController.onPortalCutsceneFinished(wasPreview),
  });
  const { activePortal, secondaryPortal, portalIsUnlocked, startDragonPortalCutscene, startSnowlandsPortalCutscene, startLavaPortalCutscene, startInfernalPortalCutscene } = mapController;

  const bossController = createBossController({
    boss,
    spiderBoss,
    frostclawBoss,
    magmaliskBoss,
    bossRain,
    spiderVenom,
    frostclawIcefalls,
    magmaliskEruptions,
    player,
    getDragonBoss: () => coop?.dragonBoss?.(),
    getSpiderBoss: () => coop?.spiderBoss?.(),
    getFrostclawBoss: () => coop?.frostclawBoss?.(),
    getMagmaliskBoss: () => coop?.magmaliskBoss?.(),
    getDragonResult: () => coop?.dragonResult?.(),
    getSpiderResult: () => coop?.spiderResult?.(),
    getFrostclawResult: () => coop?.frostclawResult?.(),
    getMagmaliskResult: () => coop?.magmaliskResult?.(),
    localIdentity: () => coop?.localIdentity?.(),
    running: () => session.isRunning(),
    currentMapIsDesert: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    currentMapIsSnow: () => currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID,
    currentMapIsLava: () => currentMapId === ADVANCED_LAVA_WASTES_MAP_ID,
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    hasSeenDragonPortalCutscene: worldProgression.hasSeenDragonPortalCutscene,
    hasSeenSnowlandsPortalCutscene: worldProgression.hasSeenSnowlandsPortalCutscene,
    hasSeenLavaPortalCutscene: worldProgression.hasSeenLavaPortalCutscene,
    hasSeenInfernalPortalCutscene: worldProgression.hasSeenInfernalPortalCutscene,
    startDragonPortalCutscene,
    startSnowlandsPortalCutscene,
    startLavaPortalCutscene,
    startInfernalPortalCutscene,
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
    healthMultiplier,
    rewardMultiplier: researchRewardMultiplier,
  });

  let playerSpriteReady = false;
  const markPlayerSpriteReady = () => {
    playerSpriteReady = true;
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
  });
  const { assets, inventoryCharacterPreview, leaderboardPodiumPreview, playerAppearanceAssets, profileCharacterPreview } = bootstrapAssets;
  const ENEMY_SPRITES = bootstrapAssets.enemySprites;
  actorShadowSprite = bootstrapAssets.actorShadowSprite;
  const worldRenderRuntime = createWorldRenderRuntime({
    ctx,
    staticWorldLayer,
    camera,
    viewport: canvasRuntime.renderViewport,
    devicePixelRatio: canvasRuntime.dpr,
    currentMapId: () => currentMapId,
    gameTime: () => session.gameTime(),
    nowMs: () => performance.now(),
    localDeath: () => localPlayerDeath,
    remoteDeath: (identity) => coop?.remotePlayerDeath?.(identity) ?? null,
    isArenaScene,
    mapName: (mapId) => MAP_CONFIG[mapId].name,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    desertMapId: BEGINNER_DESERT_MAP_ID,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    lavaMapId: ADVANCED_LAVA_WASTES_MAP_ID,
    infernalMapId: INFERNAL_DEPTHS_MAP_ID,
    paths,
    decor,
    enemies,
    player,
    boss,
    spiderBoss,
    frostclawBoss,
    magmaliskBoss,
    bossRain,
    spiderVenom,
    frostclawIcefalls,
    magmaliskEruptions,
    activePortal,
    cutscenePortal: () => mapController.cutscenePortal(),
    secondaryPortal,
    portalIsUnlocked,
    portalRevealIntensity: () => mapController.portalRevealIntensity(),
    portalDestinationOpacity: () => mapController.portalDestinationOpacity(),
    assets,
    actorShadowSprite,
    upgradeBenchStatus: () => upgradeBenchController?.worldStatus() ?? null,
    drawShadow: drawActorShadow,
    pixelCircle,
    outlinedText: outlinedWorldText,
    fillText: fillWorldText,
    bossHpLossFlashDuration: BOSS_HP_LOSS_FLASH_DURATION,
    spiderWebRange: SPIDER_WEB_RANGE,
    playerAppearanceAssets,
    skinTone: (identity) => coop?.skinTone?.(identity),
    equippedItems: () => {
      const appearance = equipmentAppearance(inventory);
      return { head: appearance.headItem, chest: appearance.chestItem, feet: appearance.feetItem, rightHand: appearance.rightHandItem, leftHand: appearance.leftHandItem };
    },
    equipmentForIdentity: (identity) => {
      if (identity === coop?.localIdentity?.()) return equipmentAppearance(inventory);
      const remote = coop?.remotePlayers?.().find((player) => player.id === identity);
      return remote ? { headItem: remote.headItem, chestItem: remote.chestItem, feetItem: remote.feetItem, rightHandItem: remote.rightHandItem, leftHandItem: remote.leftHandItem } : {};
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
    drawIdentity: drawPlayerIdentity,
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
    clearDamageNumbers: effects.clearDamageNumbers,
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
    player, boss, enemies, spawnSites, decor, paths,
    clearTransientCombat: () => { projectileStore.clear(); effects.clear(); },
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    getCurrentMapId: () => currentMapId,
    mapSpawn: (mapId) => mapId === TUTORIAL_FOREST_MAP_ID ? START_SPAWN : MAP_CONFIG[mapId].arrival,
    initialStats: { maxHp: BASE_PLAYER_HP, damage: 4, attackRate: STARTING_ATTACK_INTERVAL, projectileSpeed: BASE_PROJECTILE_SPEED, projectileCount: 1, attackRange: BASE_ATTACK_RANGE, armor: 0, regen: 0, speed: BASE_PLAYER_SPEED },
    invalidateStaticWorld,
    spawnFromSite,
    clearPlayerCombat: () => { playerCombat.clearPendingThrow(); playerCombat.clearPendingBossHits(); },
    resetBosses: () => { bossController.resetBoss(); bossController.resetSpiderBoss(); bossController.resetFrostclawBoss(); bossController.resetMagmaliskBoss(); },
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
    resolveFrostclawCollision: () => bossController.resolveFrostclawCollision(),
    resolveMagmaliskCollision: () => bossController.resolveMagmaliskCollision(),
    applyDragonConePush: (dt) => bossController.applyDragonConePush(dt),
    applyFrostclawPush: (dt) => bossController.applyFrostclawPush(dt),
    isTutorialMap: () => currentMapId === TUTORIAL_FOREST_MAP_ID,
    isDesertMap: () => currentMapId === BEGINNER_DESERT_MAP_ID,
    isSnowMap: () => currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID,
    isLavaMap: () => currentMapId === ADVANCED_LAVA_WASTES_MAP_ID,
    viewport: () => ({ ...canvasRuntime.viewport(), zoom: camera.zoom }),
    cameraPosition: () => camera,
    isConnected: () => Boolean(coop?.isConnected?.()),
    syncSpeed: (speed) => { if (coop) coop.syncSpeed(speed); },
    movementSpeedMultiplier: researchMovementSpeedMultiplier,
    regenerationMultiplier,
    healthMultiplier,
    syncMovementState: (x, y, dx, dy, inputSource, force, interestArea) => coop?.syncMovementState?.(x, y, dx, dy, inputSource, force, interestArea),
    autoAttack: () => playerCombat.attackNearest(),
    isAutoAttackEnabled: () => isWeaponItem(inventory.equippedRightHand || inventory.equippedLeftHand),
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
    bootsPickup,
    remotePlayers: () => coop?.remotePlayers?.() ?? [],
    mapPlayerMarkers: () => coop?.mapPlayerMarkers?.() ?? [],
    isDueling,
    isArenaScene,
    isReplayActive: () => duelRuntime.isReplayActive(),
    replayScene: () => duelRuntime.replayScene(),
    liveScene: () => duelRuntime.liveScene(),
    heldScene: () => heldDuelScene,
    duelResultHeld: () => playerController.isDuelResultHeld(),
    setRenderedDuelScene: (scene) => { renderedDuelScene = scene; },
    setDuelCountdown: (countdown) => runtimeHud?.setDuelCountdown(countdown),
    drawProfileCharacterPreview: () => {
      profileWindow.drawPreview();
      leaderboard.drawPodium();
      inventoryCharacterPreview.draw({
        visible: !inventoryPanel.hidden,
        inventory,
        skinTone: coop?.skinTone?.() ?? DEFAULT_SKIN_TONE,
      });
    },
    updateSpeechBubbles,
    localIdentity: () => coop?.localIdentity?.(),
    localDisplayName: () => coop?.localDisplayName?.(),
    drawParticles: effects.drawParticles,
    drawDamageNumbers: (context, activeCamera, outlined, devicePixelRatio) => effects.drawDamageNumbers(context, activeCamera, outlined, devicePixelRatio),
    portalCutsceneActive: () => mapController.isCutsceneActive(),
    portalBlackoutOpacity: () => mapController.portalBlackoutOpacity(),
    screenShake: () => screenShake,
    screenShakeEnabled: () => appShell.screenShakeEnabled(),
    attackRangeVisible: () => appShell.attackRangeVisible(),
    flash: () => flash,
    projectiles,
    enemyShots,
    particles: effects.particles,
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
    window: playerProfileEl, name: playerProfileNameEl, guest: playerProfileGuestLabel, presence: playerProfilePresenceEl, power: playerProfilePowerEl, icon: playerProfileIcon, loading: playerProfileLoadingEl,
    overviewTab: profileOverviewTab, statsTab: profileStatsTab, overviewPanel: profileOverviewPanel, statsPanel: profileStatsPanel,
    joined: profileJoinedEl, timePlayed: profileTimePlayedEl, kills: profileKillsEl, online: profileOnlineEl, statGrid: profileStatGrid,
    close: closePlayerProfileBtn, editName: editPlayerNameBtn, nameEditor: profileNameEditorEl, nameForm: profileNameEditorForm, nameInput: profileNameInput, saveName: savePlayerNameBtn,
    skinEdit: profileSkinToneEdit, skinChoices: profileSkinToneControl, preview: profileCharacterPreviewEl, previousSprite: previousPlayerSpriteBtn, nextSprite: nextPlayerSpriteBtn, genderSetting: gameElements.profileGenderSetting, genderValue: gameElements.profileGenderValue, genderEdit: gameElements.profileGenderEdit, genderChoices: gameElements.profileGenderChoices,
    duel: profileDuelBtn, developerEdit: profileEditPanel, developerEditButton: editPlayerSaveBtn,
    editNameInput: profileEditName, editMaxHp: profileEditMaxHp, editDamage: profileEditDamage, editAttackRate: profileEditAttackRate, editArmor: profileEditArmor, editRegen: profileEditRegen, editSpeed: profileEditSpeed, editAttackRange: profileEditAttackRange, editProjectileSpeed: profileEditProjectileSpeed, editProjectileCount: profileEditProjectileCount,
    cancelDeveloperEdit: cancelPlayerSaveEditBtn, saveDeveloperEdit: savePlayerSaveEditBtn,
  }, {
    localIdentity: () => coop?.localIdentity?.(), localDisplayName: () => coop?.localDisplayName?.(), profileIcon: (identity) => coop?.profileIcon?.(identity) ?? 0, paintIcon: applyProfileIcon,
    renderName: renderDomPlayerName,
    isGuest: (identity) => coop?.isGuest?.(identity) ?? false,
    isOnline: (identity) => identity === coop?.localIdentity?.()
      ? Boolean(coop?.isConnected?.()) && (!isDeveloperIdentity(identity) || coop?.developerPresenceVisible?.() === true)
      : Boolean(coop?.activePlayerMap?.(identity)) || coop?.remotePlayers?.().some((other) => other.id === identity) === true,
    presenceText: (profile, online) => {
      const mapName = mapNameForPresence(profile.mapId);
      return online && mapName ? `Online - ${mapName}` : profilePresenceText(online, profile.lifetime.sessionStartedAtMs);
    },
    renderCharacter: (identity, progress, visible) => profileCharacterPreview.draw({ visible, progress, skinTone: coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE }),
    skinTone: (identity) => coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE, setSkinTone: async (value) => coop?.setSkinTone?.(value),
    playerGender: (identity) => coop?.playerGender?.(identity) ?? 0, setGender: async (value) => coop?.setGender?.(value),
    renderStats: (profile, element) => renderProfileStats(profile, element, formatArmorReduction, MIN_ATTACK_INTERVAL, profile.research),
    formatPower: (profile) => formatCompactNumber(profilePower(profile)), formatPlayedTime,
    profile: (identity) => coop?.playerProfile?.(identity), loadProfile: async (identity) => coop?.loadPlayerProfile?.(identity), releaseProfile: () => { coop?.releasePlayerProfile?.(); },
    isDeveloper: () => isDeveloperIdentity(coop?.localIdentity?.()), isDueling, duelCooldownMs: () => coop?.duelCooldownRemainingMs?.() ?? 0, requestDuel: async (identity) => coop?.requestDuel?.(identity),
    isNameTaken: (name) => coop?.isDisplayNameTaken?.(name) ?? false, setDisplayName: async (name) => coop?.setDisplayName?.(name), updateSave: async (identity, save) => coop?.updatePlayerSave?.(identity, save), showMessage,
  });
  new ResizeObserver(() => { if (profileCharacterPreview.resize()) profileWindow.drawPreview(); }).observe(profileCharacterCanvas);
  new ResizeObserver(() => {
    if (!inventoryPanel.hidden && inventoryCharacterPreview.resize()) {
      inventoryCharacterPreview.draw({ visible: true, inventory, skinTone: coop?.skinTone?.() ?? DEFAULT_SKIN_TONE });
    }
  }).observe(inventoryCharacterCanvas);

  let minimizeMaximizedChat = () => {};
  let mapGuide!: ReturnType<typeof createMapGuideController>;

  const techTree = createTechTreePanel({
    e: gameElements,
    researchRanks,
    activeResearch: () => coop?.activeResearch?.() ?? null,
    startResearch: async (id: ResearchId) => coop?.startResearch?.(id),
    gemBalance: () => coop?.gemBalance?.() ?? 0n,
    speedUpResearch: async () => coop?.speedUpResearchWithGems?.(),
    showMessage,
    beforeOpen: () => {
      mapGuide?.close();
      minimizeMaximizedChat();
      itemInspectionController.close();
      upgradeBenchController?.close();
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
      closeLeaderboard();
      devPanel.close();
    },
  });

  const leaderboard = createLeaderboardPanel({ e: gameElements, options: {
    entries: () => coop?.leaderboardEntries?.() ?? [],
    loadSnapshot: async () => coop?.loadLeaderboardSnapshot?.() ?? [],
    localIdentity: () => coop?.localIdentity?.() || "",
    isDeveloper: isDeveloperIdentity,
    paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => paintProfileIconCanvas(canvas, coop?.profileIcon?.(identity) ?? 0),
    drawPodiumCharacter: (canvas: HTMLCanvasElement, entry: LeaderboardEntry, rank: 1 | 2 | 3) => leaderboardPodiumPreview.draw(canvas, entry, rank),
    openProfile: (identity: string, name: string) => { void profileWindow.open(identity, name); },
    beforeOpen: () => {
      mapGuide?.close();
      minimizeMaximizedChat();
      itemInspectionController.close();
      upgradeBenchController?.close();
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
      mapGuide?.close();
      minimizeMaximizedChat();
      itemInspectionController.close();
      upgradeBenchController?.close();
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
      closeLeaderboard();
      techTree.close();
    },
    showMessage,
  });

  upgradeBenchController = createUpgradeBenchController({
    panel: gameElements.upgradeBenchPanel,
    close: gameElements.closeUpgradeBenchBtn,
    prompt: gameElements.upgradeBenchPrompt,
    slot: gameElements.upgradeBenchSlot,
    slotTwo: gameElements.upgradeBenchSlotTwo,
    statGain: gameElements.upgradeBenchStatGain,
    timer: gameElements.upgradeBenchTimer,
    action: gameElements.upgradeBenchAction,
    speedUp: gameElements.upgradeBenchSpeedUp,
    back: gameElements.upgradeBenchBack,
    picker: gameElements.upgradeBenchPicker,
    pickerItems: gameElements.upgradeBenchPickerItems,
    closePicker: gameElements.closeUpgradeBenchPickerBtn,
  }, {
    inventory,
    playerPosition: () => player,
    currentMapId: () => currentMapId,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    benchPosition: UPGRADE_BENCH_POSITION,
    activeUpgrades: () => coop?.activeItemUpgrades?.() ?? [],
    secondSlotUnlocked: () => coop?.secondUpgradeSlotUnlocked?.() ?? false,
    gemBalance: () => coop?.gemBalance?.() ?? 0n,
    upgradeLevel: (itemId) => coop?.itemUpgradeLevel?.(itemId) ?? 0,
    startUpgrade: async (slot, itemId, position) => coop?.startItemUpgrade?.(slot, itemId, position),
    cancelUpgrade: async (slot) => coop?.cancelItemUpgrade?.(slot),
    speedUpUpgrade: async (slot) => coop?.speedUpItemUpgradeWithGems?.(slot),
    unlockSecondSlot: async () => coop?.unlockSecondUpgradeSlot?.(),
    beforeOpen: () => {
      mapGuide?.close();
      minimizeMaximizedChat();
      itemInspectionController.close();
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
      closeLeaderboard();
      techTree.close();
      devPanel.close();
    },
    setPaused: (paused) => setGameplayPause("upgrade-bench", paused),
    clearPlayerInput: playerInput.clear,
    onInventoryChanged: () => {
      if (inventory.selectedItemId && !inventory.itemIds.includes(inventory.selectedItemId)) {
        inventory.selectedItemId = "";
        inventory.selectedItemLocation = "";
      }
      player.speed = progress.movementSpeedForEquipment(inventory.equippedFeet === TRAILBLAZER_BOOTS);
      applyPlayerMaxHealthMultiplier(player, healthMultiplier());
      renderInventory();
      saveProgress(true);
    },
    showMessage,
  });

  mapGuide = createMapGuideController({
    trigger: minimapButton,
    overlay: mapGuideEl,
    title: mapGuideTitle,
    canvas: mapGuideCanvas,
    zoneLabels: mapGuideZoneLabels,
    dropItems: mapGuideDropItems,
    back: mapGuideBack,
  }, {
    currentMapId: () => currentMapId,
    mapName: (mapId) => MAP_CONFIG[mapId].name,
    paths,
    spawnSites,
    player,
    boss: () => currentMapId === TUTORIAL_FOREST_MAP_ID
      ? { x: boss.x, y: boss.y, name: "Dragon", dead: boss.dead }
      : currentMapId === BEGINNER_DESERT_MAP_ID
        ? { x: spiderBoss.x, y: spiderBoss.y, name: "Desert Spider", dead: spiderBoss.dead }
        : currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID
          ? { x: frostclawBoss.x, y: frostclawBoss.y, name: "Frostclaw", dead: frostclawBoss.dead }
          : currentMapId === ADVANCED_LAVA_WASTES_MAP_ID
            ? { x: magmaliskBoss.x, y: magmaliskBoss.y, name: "Magmalisk", dead: magmaliskBoss.dead }
            : null,
    portals: () => {
      const portals = [activePortal()];
      const secondary = secondaryPortal();
      if (secondary) portals.push(secondary);
      return portals.map((portal) => ({ x: portal.x, y: portal.y, destination: portal.destination, unlocked: portalIsUnlocked(portal) }));
    },
    beforeOpen: () => {
      minimizeMaximizedChat();
      itemInspectionController.close();
      upgradeBenchController.close();
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
      profileWindow.close();
      closeLeaderboard();
      techTree.close();
      devPanel.close();
    },
    clearPlayerInput: playerInput.clear,
  });

  runtimeHud = createGameRuntimeHud({
    e: gameElements, coop, player, activeDuel, duelOpponentName, applyProfileIcon, playerPower,
    setDeveloperAccess: devPanel.setDeveloperAccess, applyVitalityResearch, updateTechNotice: techTree.updateNotice,
    tickTechTree: techTree.tick, refreshAppStatus: appShell.refreshStatus, updateProfileDuelButton: profileWindow.updateDuelButton,
  });

  const rewardedRespawnAd = createRewardedRespawnAdController({
    button: enemyRespawnAdBtn,
    status: enemyRespawnAdStatus,
    activeStatus: enemyRespawnBoostStatus,
    activeTimer: enemyRespawnBoostTimer,
    browserAd: browserRewardedAd,
    browserAdTimer: browserRewardedAdTimer,
  }, {
    getNativeBridge: () => window.wildwoodNative,
    activateBoost: activateRewardedRespawnBoost,
    isBoostActive: regularEnemyRespawnBoost.isActive,
    boostRemainingMs: regularEnemyRespawnBoost.remainingMs,
    onBoostExpired: clearExpiredRespawnBoost,
    setAdPlaybackActive: (active) => {
      setGameplayPause("rewarded-ad", active);
      if (active) mapMusic.audio.pause();
      else appShell.ensureMusicPlaying();
    },
    showMessage,
  });
  rewardedRespawnAd.init();

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
    tutorialMapId: TUTORIAL_FOREST_MAP_ID, desertMapId: BEGINNER_DESERT_MAP_ID, snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID, lavaMapId: ADVANCED_LAVA_WASTES_MAP_ID,
    validMapIds: [TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, INFERNAL_DEPTHS_MAP_ID],
    getMapId: () => currentMapId, setMapId: (mapId) => { currentMapId = mapId as MapId; },
    serverMapId: () => coop?.localState?.()?.mapId,
    serverPlayerState: () => coop?.localState?.() ?? undefined,
    connected: () => Boolean(coop?.isConnected?.()),
    accountInConflict: () => Boolean(coop?.accountState?.().sessionConflict),
    lowPerformanceMode: appShell.lowPerformanceMode, ensureMusicPlaying: appShell.ensureMusicPlaying,
    hideStart: startup.hideStart,
    hideGameOver: () => { localPlayerDeath = null; deathScreen.hide(); },
    showGameOver: () => {
      localPlayerDeath = {
        id: coop?.localIdentity?.() ?? "local-player",
        x: player.x,
        y: player.y,
        facing: player.facing,
        startedAtMs: performance.now(),
      };
      mapMusic.playDeathSound();
      deathScreen.show();
    },
    beginAdventure: () => { coop?.beginAdventure?.(); },
    syncStoppedPosition: () => { coop?.correctMovementPosition?.(player.x, player.y, true); },
    resetPlayer: (preserveStats) => {
      worldProgression.hideBootUpgrade();
      playerController.reset(preserveStats, progress.hasSavedProgress());
    },
    mapMusicSync: syncMapMusic,
    isDueling, activeDuel,
    syncDragon: bossController.syncDragonState, syncSpider: bossController.syncSpiderState, syncFrostclaw: bossController.syncFrostclawState, syncMagmalisk: bossController.syncMagmaliskState,
    cutsceneActive: mapController.isCutsceneActive, updateCutscene: mapController.updatePortalCutscene,
    updatePlayer: playerController.update, updateUpgradeBench: upgradeBenchController.updateTouch, updatePortal: mapController.updatePortal, updateBootPickup: worldProgression.updateBootPickup,
    updateEnemies: enemySimulation.update, updateDragon: bossController.updateBoss, updateSpider: bossController.updateSpiderBoss, updateFrostclaw: bossController.updateFrostclawBoss, updateMagmalisk: bossController.updateMagmaliskBoss,
    updateProjectiles: playerCombat.updateProjectiles, updateRespawns,
    clearDuelCombat: () => { projectileStore.clear(); playerCombat.clearPendingBossHits(); },
    updateEffects: effects.update, updateHud: () => updateHud(),
    updateVisuals: (dt) => { flash = Math.max(0, flash - dt); screenShake *= Math.pow(.01, dt); },
    updateMessage: runtimeHud.updateMessage,
    capturePresentationState: presentation.capture,
    resetPresentationState: presentation.reset,
    render: (interpolationAlpha) => presentation.render(interpolationAlpha, () => { upgradeBenchController.tick(); renderController.render(); }), recordPerformance: performanceMonitor.record,
    renderPerformancePanel: devPanel.renderPerformance, performancePanelVisible: devPanel.isPerformanceVisible,
    renderFpsDisplay: () => {
      const performance = performanceMonitor.snapshot();
      appShell.renderFps(performance.fps, performance.onePercentLowFps, performance.workFps);
    },
    fpsDisplayVisible: appShell.fpsVisible,
    fadeElement: sceneFadeEl,
    onLeaveDuelResult: () => { duelResultEl.hidden = true; playerController.finishDuelResult(); },
  });

  const dailyGemBonus = createDailyGemBonusController({
    overlay: dailyGemBonusEl,
    claimButton: dailyGemClaimBtn,
  }, {
    canShow: () => session.hasStarted() && coop?.accountState?.().signedIn === true,
    claimable: () => coop?.dailyGemBonusClaimable?.() === true,
    claim: async () => coop?.claimDailyGemBonus?.(),
    setPaused: (paused) => setGameplayPause("daily-gem-bonus", paused),
    showMessage,
  });

  function refreshReconnectOverlay() {
    const reconnecting = Boolean(coop?.isReconnectingAfterWake?.());
    const waitingForServer = Boolean(coop?.accountState?.().updating);
    reconnectOverlayEl.hidden = !reconnecting || waitingForServer;
    // Pause reasons compose: ending an ad, reward window, or reconnect cannot
    // accidentally resume gameplay while another blocking surface remains.
    setGameplayPause("connection-gate", reconnecting || waitingForServer);
  }

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
    prepareUpdateReload: (latestVersion) => { coop?.prepareUpdateReload?.(latestVersion); },
  });
  finishStartup();
  startupCoordinator.startVersionPolling();

  let firstStartWarmupPending = false;

  function startGame(markIntro = true, restoreServerPosition = true) {
    const firstStart = !session.hasStarted();
    if (firstStart && firstStartWarmupPending) return;
    const appearance = equipmentAppearance(inventory);
    warmPlayerAppearanceCache(playerAppearanceAssets, {
      skinTone: coop?.skinTone?.(coop?.localIdentity?.()) ?? DEFAULT_SKIN_TONE,
      headItem: appearance.headItem,
      chestItem: appearance.chestItem,
      feetItem: appearance.feetItem,
      rightHandItem: appearance.rightHandItem,
      leftHandItem: appearance.leftHandItem,
    });
    const finishStart = () => {
      if (firstStart) performanceMonitor.reset();
      session.start(markIntro, restoreServerPosition);
      dailyGemBonus.refresh();
      applyGameplayPauseState();
    };
    if (firstStart && staticWorldLayer?.prepare()) {
      firstStartWarmupPending = true;
      void worldRenderRuntime.warmStaticWorld().catch(() => {}).then(() => {
        firstStartWarmupPending = false;
        finishStart();
      });
      return;
    }
    finishStart();
  }

  function endGame() {
    screenShake = 0;
    flash = 0;
    session.end();
    dailyGemBonus.refresh();
  }

  bindGameInteractionListeners({
    triggerDragonCutscene: triggerDragonCutsceneBtn,
    triggerSnowlandsCutscene: triggerSnowlandsCutsceneBtn,
    triggerLavaCutscene: triggerLavaCutsceneBtn,
    hpText,
    watchDuelReplay: watchDuelReplayBtn,
    playerHudProfile: playerHudProfileIcon,
    playerProfileIcon,
    closeProfileIconPicker: closeProfileIconPickerBtn,
    onDragonCutscene: () => {
      if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
      if (currentMapId !== TUTORIAL_FOREST_MAP_ID) {
        showMessage("Dragon cutscene: Tutorial Forest only", "#ff9b91");
        return;
      }
      if (mapController.isCutsceneActive()) return;
      devPanel.close();
      startDragonPortalCutscene(true);
    },
    onSnowlandsCutscene: () => {
      if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
      if (currentMapId !== BEGINNER_DESERT_MAP_ID) {
        showMessage("Snowlands cutscene: Beginner Desert only", "#ff9b91");
        return;
      }
      if (mapController.isCutsceneActive()) return;
      devPanel.close();
      startSnowlandsPortalCutscene(true);
    },
    onLavaCutscene: () => {
      if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
      if (currentMapId !== INTERMEDIATE_SNOWLANDS_MAP_ID) {
        showMessage("Lava cutscene: Intermediate Snowlands only", "#ff9b91");
        return;
      }
      if (mapController.isCutsceneActive()) return;
      devPanel.close();
      startLavaPortalCutscene(true);
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
    onLayoutChange: canvasRuntime.resize,
  });
  chatRuntime.init();
  minimizeMaximizedChat = chatRuntime.minimize;

  inputEscapeHandler = createGameActionsRuntime({
    e: gameElements, inventory, renderInventory, logPickup, leaveDuelResult, closeUpdateNotice,
    itemInspectionController,
    minimizeChat: minimizeMaximizedChat,
    closeCompetingWindows: () => { mapGuide.close(); upgradeBenchController.close(); closeLeaderboard(); devPanel.close(); techTree.close(); },
    closeDuelReplay: duelRuntime.closeReplayWindow, closeBootUpgrade: worldProgression.closeBootUpgrade,
    resetServerProgress: () => coop?.resetProgress?.(),
    clearProgressState: () => { progress.resetState(); newPlayerIntroShown = false; },
    setTotalKills: (value: number) => { totalKills = value; },
    setBootsCollected: (collected: boolean) => { bootsPickup.collected = collected; },
    clearPlayerInput: playerInput.clear,
    resetGame: () => { gameplayPauseReasons.clear(); session.setPaused(false); playerController.reset(false, progress.hasSavedProgress()); session.setHasStarted(false); },
    stopGame: session.stop, startConnecting: startup.showConnecting, hideGameOver: deathScreen.hide,
    refreshFrameClock: session.refreshFrameClock, closeProfileIconPicker, inventoryController,
    leaderboard, closeLeaderboard, devPanel, profileWindow, upgradeBenchController, mapGuide,
  }).handleInputEscape;

  const coopSession = createCoopSessionController({
    coop,
    syncLifetimeKills: progress.syncLifetimeKills,
    refreshGemCounter,
    refreshDailyGemBonus: dailyGemBonus.refresh,
    refreshOpenProfile: () => {
      const identity = profileWindow.identity();
      if (!identity) return;
      const profile = coop?.playerProfile?.(identity);
      if (profile) profileWindow.render(profile);
    },
    refreshLeaderboard: () => undefined,
    refreshDevPanel: devPanel.refresh,
    loadProgress,
    observedSessionGeneration: () => observedCoopSessionGeneration,
    setObservedSessionGeneration: (generation) => { observedCoopSessionGeneration = generation; },
    resetMovementSync: playerController.resetMovementSync,
    running: session.isRunning,
    syncPlayerState: () => {
      coop?.syncSpeed?.(player.speed * researchMovementSpeedMultiplier());
      const movement = playerInput.movement();
      coop?.syncMovementState?.(player.x, player.y, movement.x, movement.y, movement.source === "touch" ? "touch" : "keyboard", true);
    },
    reconcileMap: mapController.reconcileMapFromServer,
    syncBossState: () => {
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) bossController.syncDragonState();
      if (currentMapId === BEGINNER_DESERT_MAP_ID) bossController.syncSpiderState();
      if (currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID) bossController.syncFrostclawState();
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
    shouldShowAccountChoice: (account) => !session.hasStarted() && !account?.signedIn && !account?.authInProgress && !account?.guestSessionApproved,
    showAccountChoice: startup.showAccountChoice,
    refreshChat: chatRuntime.refresh,
    updateDuelControls,
    refreshAppStatus: appShell.refreshStatus,
    refreshReconnectOverlay,
  });
  if (coop?.setOnChange) coop.setOnChange(coopSession.onChange);
  coop?.setOnItemDrop?.(({ itemId, alreadyOwned }) => {
    if (!alreadyOwned) {
      if (!setInventoryItemQuantity(inventory, itemId, 1)) return;
      renderInventory();
    }
    const level = coop?.itemUpgradeLevel?.(itemId) ?? 0;
    const pickupColor = itemId === DARK_METAL_HELMET
      ? "#8f83a6"
      : itemId === FIRE_METAL_BOW || itemId === FIRE_METAL_HELMET
      ? "#ff6557"
      : itemId === FROST_BOW || itemId === FROST_ARMOR
        ? "#2d92ff"
        : itemId === IRON_BOW ? "#aeb7c5"
          : itemId === STARTER_BOW ? "#ffd45c" : "#b98752";
    runtimeHud.showItemDrop({
      artSource: itemPresentation(itemId)?.inventory.source ?? "",
      color: pickupColor,
      name: itemDisplayName(itemId, level),
      stats: alreadyOwned ? ["ALREADY OWNED"] : itemStats(itemId, level),
    });
  });
  coop?.setOnItemUpgrade?.(({ itemId, level }) => {
    setInventoryItemQuantity(inventory, itemId, 1);
    applyPlayerMaxHealthMultiplier(player, healthMultiplier());
    renderInventory();
    saveProgress(true);
    showMessage(`${itemDisplayName(itemId, level)} COMPLETE`, "#72ef58");
  });
  refreshReconnectOverlay();
  updateDuelControls();
  appShell.refreshSettings();
  appShell.refreshFullscreen();
  appShell.refreshStatus();
  updateProtocolGate();

  startGameRuntime({
    accountState: () => coop?.accountState?.(),
    showSigningIn: startup.showSigningIn,
    showAccountChoice: startup.showAccountChoice,
    showConnecting: startup.showConnecting,
    loadProgress,
    rebuildWorld: playerController.rebuildWorld,
    camera,
    player,
    viewport: canvasRuntime.viewport,
    render: () => presentation.render(1, renderController.render),
    loop: session.loop,
  });
})();
