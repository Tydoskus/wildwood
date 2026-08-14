import { enforceLatestVersion } from "./app/version";
import { recentReleaseNotes } from "./app/changelog";
import { DEVELOPER_BADGE, isDeveloperIdentity } from "./app/developer";
import {
  BASE_ATTACK_RANGE,
  BASE_PROJECTILE_SPEED,
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  ENEMY_HIT_MIN_MOVE_SPEED,
  ENEMY_HIT_SPEED_RECOVERY_SECONDS,
  PLAYER_KNOCKBACK_FORCE,
  REGULAR_ENEMY_AGGRO_PADDING,
  RANGED_PROJECTILE_SPEED,
  TAU,
  WORLD,
} from "./game/constants";
import { circlesOverlap, clamp, distanceSquared, rand } from "./game/math";
import { damageAfterArmor, formatArmorReduction } from "./game/combat";
import { BASIC_PAPER_HAT, inventoryFromSave, ITEM_DEFINITIONS, itemDefinition, LEGENDARY_WHITE_GOLD_ARMOR, serialiseInventory, SUPERIOR_GOLDEN_HELMET, TRAILBLAZER_BOOTS, type InventoryState } from "./game/inventory";
import { createCanvasPrimitives } from "./game/canvas";
import { createMapMusicController } from "./game/runtime/audio";
import { createCamera, snapCameraToPlayer as snapRuntimeCamera, updateCamera as updateRuntimeCamera } from "./game/runtime/camera";
import { createCombatEffects } from "./game/runtime/combat-effects";
import { createPortalCutscene } from "./game/runtime/cutscene";
import { requiredCanvasContext, requiredElement, requiredSelector } from "./game/runtime/dom";
import { createEnemyLifecycle } from "./game/runtime/enemy-lifecycle";
import { createPerformanceMonitor } from "./game/runtime/performance-monitor";
import { scheduleBackgroundTask, yieldToUser } from "./game/runtime/scheduler";
import { createWorldRenderer } from "./game/runtime/world-renderer";
import { createBossRenderer } from "./game/runtime/boss-renderer";
import { createActorRenderer } from "./game/runtime/actor-renderer";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, loadPlayerAppearanceAssets, PLAYER_SKIN_TONES, PLAYER_SKIN_TONE_NAMES } from "./game/player-appearance";
import type {
  BossCone,
  DragonBossState,
  EnemyShot,
  EnemyState,
  PlayerState,
  Projectile,
  SpiderBossState,
  BossRainStrike,
  DuelPresentation,
  DuelReturnState,
  DuelScene,
  ReplayMode,
  RuntimeDuelReplay,
  RuntimeDuelState,
  RuntimeReward,
  SpiderVenomPool,
} from "./game/runtime/types";
import {
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  createSpawnSites,
  createWorldLayout,
  loadTreeSpritesheet,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
  type SpawnSite,
  type WorldDecor,
  type WorldPath,
} from "./game/world";
import {
  DUEL_ARENA,
  DUEL_COMBAT_Y,
  DUEL_REPLAY_COUNTDOWN_SECONDS,
  DUEL_SHOT_LIFETIME,
  DUEL_SHOT_SPEED,
  duelShotsAt,
  duelTimelineState,
  duelStatLine,
  loadDuelPlatformArt,
  loadDuelSpaceBackground,
  replayState,
} from "./game/duel";
import {
  ENEMY_TYPES,
  loadActorShadowSprite,
  loadEnemySprites,
  REWARD_DATA,
  rewardLabel,
} from "./game/enemies";
import { createChatController } from "./ui/chat";
import { renderInventoryView, renderPlayerHud } from "./ui/hud";
import {
  renderLeaderboard as renderLeaderboardView,
  setLeaderboardTab as setLeaderboardTabView,
} from "./ui/leaderboard";
import { formatPlayedTime, profilePresenceText, renderProfileStats } from "./ui/profile";
import { renderUpdateNotice } from "./ui/overlays";
import {
  renderAccountStatus,
  renderBooleanSetting,
  renderConnectionStatus,
  renderFullscreenSetting,
  renderLatencyStatus,
  renderMusicVolume,
} from "./ui/settings";
import { formatCompactNumber } from "./ui/number-format";
import type { LeaderboardEntry, RemotePlayer, wildwoodCoop } from "./wildwood-coop";
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

  type PlayerProfile = NonNullable<ReturnType<typeof wildwoodCoop.playerProfile>>;
  type DragonResult = NonNullable<ReturnType<typeof wildwoodCoop.dragonResult>>;
  type SpiderResult = NonNullable<ReturnType<typeof wildwoodCoop.spiderResult>>;
  type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
  type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
  type RockDecor = Extract<WorldDecor, { type: "rock" }>;
  type DesertGrassDecor = Extract<WorldDecor, { type: "desertGrass" }>;
  type GrassDecor = Extract<WorldDecor, { type: "grass" }>;
  type PetalDecor = Extract<WorldDecor, { type: "petal" }>;
  type ActorStatus = { x: number; y: number; identity?: string; name: string; nameColor: string; hp: number; maxHp: number; power: number | null; fillColor: string };
  type LeaderboardStat = "power" | "damage" | "health" | "armor" | "regen" | "time";
  type DepthLayerKind = "tree" | "cactus" | "enemy" | "dragon" | "spider" | "boots" | "portal" | "secondaryPortal" | "remotePlayer" | "player";
  type DepthLayer = { depth: number; priority: number; kind: DepthLayerKind; entity?: WorldDecor | EnemyState | RemotePlayer };

  const GAME_VERSION = "0.370";
  const SEEN_VERSION_KEY = "wildwood-seen-version-v1";
  const ATTACK_RANGE_VISIBLE_KEY = "wildwood-attack-range-visible-v1";
  const ANTI_ALIASING_ENABLED_KEY = "wildwood-anti-aliasing-enabled-v1";
  const LOW_PERFORMANCE_MODE_KEY = "wildwood-low-performance-mode-v1";
  const LATENCY_VISIBLE_KEY = "wildwood-latency-visible-v1";
  const MUSIC_VOLUME_KEY = "wildwood-music-volume-v1";
  const DRAGON_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-dragon-portal-cutscene-v2";
  const SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY = "wildwood-snowlands-portal-cutscene-v1";
  const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
  const PLAYER_THROW_SECONDS = .42;
  const PLAYER_THROW_WINDUP_SECONDS = .12;
  const WORLD_HEALTH_BAR_HEIGHT = 15;
  const PROFILE_PORTRAIT_ZOOM = 1.03;
  const PROFILE_PORTRAIT_GRID = 8;
  const PROFILE_PORTRAIT_POSITION_START = (PROFILE_PORTRAIT_ZOOM - 1) / 2 / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
  const ENEMY_DEATH_PARTICLE_COLOR = "#e53935";
  const DRAGON_HP_LOSS_FLASH_DURATION = .18;
  const DRAGON_CONE_WINDUP = .75;
  const DRAGON_CONE_DURATION = 1.2;
  const DRAGON_HIT_BATCH_DELAY = .1;
  const SPIDER_HIT_BATCH_DELAY = .1;
  const SPIDER_AGGRO_RANGE = 1150;
  const SPIDER_WEB_RANGE = 720;
  const SPIDER_WEB_DAMAGE = 900_000;
  const SPIDER_VENOM_DAMAGE = 1_100_000;
  const SPIDER_CONTACT_DAMAGE = 1_000_000;
  const DRAGON_CONTACT_DAMAGE = 1000;
  const DRAGON_CONTACT_DAMAGE_COOLDOWN = .75;
  const NETWORK_NEAR_SCREEN_MARGIN_RATIO = .25;
  const SPEECH_BUBBLE_DURATION_MS = 6_000;
  const SPEECH_BUBBLE_FADE_MS = 1_250;
  const ENEMY_WANDER_RADIUS = 72;
  const ENEMY_WANDER_SPEED_RATIO = .28;
  const ENEMY_TEXT_CULL_MIN_DISTANCE = 600;

  let antiAliasingEnabled = true;
  try { antiAliasingEnabled = localStorage.getItem(ANTI_ALIASING_ENABLED_KEY) !== "false"; } catch {}

  const canvas = requiredElement<HTMLCanvasElement>("game");
  const ctx = requiredCanvasContext(canvas, { alpha: false });
  const textCanvas = requiredElement<HTMLCanvasElement>("textLayer");
  const textCtx = requiredCanvasContext(textCanvas);
  ctx.imageSmoothingEnabled = false;
  const { outlinedWorldText, fillWorldText, pixelCircle, roundRect } = createCanvasPrimitives(ctx, textCtx);

  const hpFill = requiredElement("hpFill");
  const hpText = requiredElement("hpText");
  const playerNameEl = requiredElement("playerName");
  const playerPowerEl = requiredElement("playerPower");
  const playerHudProfileIcon = requiredElement("playerHudProfileIcon");
  const settingsBtn = requiredElement("settingsBtn");
  const inventoryBtn = requiredElement("inventoryBtn");
  const leaderboardBtn = requiredElement("leaderboardBtn");
  const devAuditBtn = requiredElement("devAuditBtn");
  const autoAttackBtn = requiredElement("autoAttackBtn");
  const settingsPanel = requiredElement("settingsPanel");
  const closeSettingsBtn = requiredElement("closeSettingsBtn");
  const inventoryPanel = requiredElement("inventoryPanel");
  const closeInventoryBtn = requiredElement("closeInventoryBtn");
  const inventoryItemsEl = requiredElement("inventoryItems");
  const inventoryDetailEl = requiredElement("inventoryDetail");
  const inventoryCountEl = requiredElement("inventoryCount");
  const equippedHeadSlot = requiredElement("equippedHeadSlot");
  const equippedChestSlot = requiredElement("equippedChestSlot");
  const equippedFeetSlot = requiredElement("equippedFeetSlot");
  const itemInspectEl = requiredElement("itemInspect");
  const closeItemInspectBtn = requiredElement("closeItemInspectBtn");
  const itemInspectIcon = requiredElement("itemInspectIcon");
  const itemInspectSlot = requiredElement("itemInspectSlot");
  const itemInspectName = requiredElement("itemInspectName");
  const itemInspectDescription = requiredElement("itemInspectDescription");
  const itemInspectStats = requiredElement("itemInspectStats");
  const screenShakeToggle = requiredElement<HTMLButtonElement>("screenShakeToggle");
  const attackRangeToggle = requiredElement<HTMLButtonElement>("attackRangeToggle");
  const antiAliasingToggle = requiredElement<HTMLButtonElement>("antiAliasingToggle");
  const lowPerformanceToggle = requiredElement<HTMLButtonElement>("lowPerformanceToggle");
  const latencyToggle = requiredElement<HTMLButtonElement>("latencyToggle");
  const latencyStatusEl = requiredElement("latencyStatus");
  const musicVolumeInput = requiredElement<HTMLInputElement>("musicVolume");
  const musicVolumeValue = requiredElement("musicVolumeValue");
  const fullscreenToggle = requiredElement<HTMLButtonElement>("fullscreenToggle");
  const connectionStatusEl = requiredElement("connectionStatus");
  const accountButton = requiredElement("accountButton");
  const accountStatusEl = requiredElement("accountStatus");
  const resetProgressBtn = requiredElement("resetProgressBtn");
  const messageEl = requiredElement("message");
  const pickupLog = requiredElement("pickupLog");
  const startEl = requiredElement("start");
  const connectionPanel = requiredElement("connectionPanel");
  const sessionTakeoverBtn = requiredElement<HTMLButtonElement>("sessionTakeoverBtn");
  const sessionTakeoverNote = requiredElement("sessionTakeoverNote");
  const loadingDetail = requiredElement("loadingDetail");
  const loadingFill = requiredElement("loadingFill");
  const accountChoicePanel = requiredElement("accountChoicePanel");
  const accountChoiceDetail = requiredElement("accountChoiceDetail");
  const accountCharacter = requiredElement("accountCharacter");
  const accountCharacterName = requiredElement("accountCharacterName");
  const signInFromStartBtn = requiredElement<HTMLButtonElement>("signInFromStartBtn");
  const continueGuestBtn = requiredElement<HTMLButtonElement>("continueGuestBtn");
  const newPlayerPanel = requiredElement("newPlayerPanel");
  const newPlayerNameInput = requiredElement<HTMLInputElement>("newPlayerNameInput");
  const beginAdventureBtn = requiredElement("beginAdventureBtn");
  const overEl = requiredElement("gameOver");
  const joystickEl = requiredElement("joystick");
  const stickEl = requiredElement("stick");
  const bootUpgradeEl = requiredElement("bootUpgrade");
  const bootUpgradeClose = requiredElement("bootUpgradeClose");
  const coopStatusEl = requiredElement("coopStatus");
  const duelControls = requiredElement("duelControls");
  const duelStatusEl = requiredElement("duelStatus");
  const duelRequestBtn = requiredElement("duelRequestBtn");
  const duelAcceptBtn = requiredElement("duelAcceptBtn");
  const duelCountdownEl = requiredElement("duelCountdown");
  const duelResultEl = requiredElement("duelResult");
  const duelResultTitle = requiredElement("duelResultTitle");
  const duelResultStats = requiredElement("duelResultStats");
  const watchDuelReplayBtn = requiredElement("watchDuelReplayBtn");
  const closeDuelResultBtn = requiredElement("closeDuelResultBtn");
  const dragonResultEl = requiredElement("dragonResult");
  const dragonResultTitle = requiredElement("dragonResultTitle");
  const dragonResultTotal = requiredElement("dragonResultTotal");
  const dragonResultContributors = requiredElement("dragonResultContributors");
  const closeDragonResultBtn = requiredElement("closeDragonResultBtn");
  const dragonWorldNoticeEl = requiredElement("dragonWorldNotice");
  const dragonWorldNoticeDetailEl = requiredElement("dragonWorldNoticeDetail");
  const duelReplayEl = requiredElement("duelReplay");
  const duelReplayTitle = requiredElement("duelReplayTitle");
  const closeDuelReplayBtn = requiredElement("closeDuelReplayBtn");
  const sceneFadeEl = requiredElement("sceneFade");
  const cutsceneOverlayEl = requiredElement("cutsceneOverlay");
  const playerProfileEl = requiredElement("playerProfile");
  const playerProfileNameEl = requiredElement("playerProfileName");
  const playerProfilePresenceEl = requiredElement("playerProfilePresence");
  const playerProfilePowerEl = requiredElement("playerProfilePower");
  const playerProfileIcon = requiredElement<HTMLButtonElement>("playerProfileIcon");
  const editPlayerNameBtn = requiredElement<HTMLButtonElement>("editPlayerNameBtn");
  const profileCharacterPreviewEl = requiredElement("profileCharacterPreview");
  const profileCharacterCanvas = requiredElement<HTMLCanvasElement>("profileCharacterCanvas");
  const profileCharacterCtx = requiredCanvasContext(profileCharacterCanvas);
  const profileLeaderboardStatsEl = requiredElement("profileLeaderboardStats");
  const previousPlayerSpriteBtn = requiredElement<HTMLButtonElement>("previousPlayerSpriteBtn");
  const nextPlayerSpriteBtn = requiredElement<HTMLButtonElement>("nextPlayerSpriteBtn");
  const profileSkinToneEdit = requiredElement<HTMLButtonElement>("profileSkinToneEdit");
  const profileSkinToneControl = requiredElement<HTMLDivElement>("profileSkinToneControl");
  PLAYER_SKIN_TONE_NAMES.forEach((name, index) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "profile-skin-tone-choice";
    choice.dataset.skinTone = String(index);
    choice.setAttribute("aria-label", name);
    choice.title = name;
    choice.style.background = PLAYER_SKIN_TONES[index];
    profileSkinToneControl.append(choice);
  });
  const playerProfileLoadingEl = requiredElement("playerProfileLoading");
  const profileOverviewTab = requiredElement("profileOverviewTab");
  const profileStatsTab = requiredElement("profileStatsTab");
  const profileOverviewPanel = requiredElement("profileOverviewPanel");
  const profileStatsPanel = requiredElement("profileStatsPanel");
  const profileJoinedEl = requiredElement("profileJoined");
  const profileTimePlayedEl = requiredElement("profileTimePlayed");
  const profileKillsEl = requiredElement("profileKills");
  const profileOnlineEl = requiredElement("profileOnline");
  const profileStatGrid = requiredElement("profileStatGrid");
  const closePlayerProfileBtn = requiredElement("closePlayerProfileBtn");
  const editPlayerSaveBtn = requiredElement("editPlayerSaveBtn");
  const profileDuelBtn = requiredElement<HTMLButtonElement>("profileDuelBtn");
  const profileNameEditorEl = requiredElement("profileNameEditor");
  const profileNameEditorForm = requiredElement<HTMLFormElement>("profileNameEditorForm");
  const profileNameInput = requiredElement<HTMLInputElement>("profileNameInput");
  const savePlayerNameBtn = requiredElement<HTMLButtonElement>("savePlayerNameBtn");
  const profileEditPanel = requiredElement("profileEditPanel");
  const profileEditName = requiredElement<HTMLInputElement>("profileEditName");
  const profileEditMaxHp = requiredElement<HTMLInputElement>("profileEditMaxHp");
  const profileEditDamage = requiredElement<HTMLInputElement>("profileEditDamage");
  const profileEditAttackRate = requiredElement<HTMLInputElement>("profileEditAttackRate");
  const profileEditArmor = requiredElement<HTMLInputElement>("profileEditArmor");
  const profileEditRegen = requiredElement<HTMLInputElement>("profileEditRegen");
  const profileEditSpeed = requiredElement<HTMLInputElement>("profileEditSpeed");
  const profileEditAttackRange = requiredElement<HTMLInputElement>("profileEditAttackRange");
  const profileEditProjectileSpeed = requiredElement<HTMLInputElement>("profileEditProjectileSpeed");
  const profileEditProjectileCount = requiredElement<HTMLInputElement>("profileEditProjectileCount");
  const cancelPlayerSaveEditBtn = requiredElement("cancelPlayerSaveEditBtn");
  const savePlayerSaveEditBtn = requiredElement<HTMLButtonElement>("savePlayerSaveEditBtn");
  const leaderboardEl = requiredElement("leaderboard");
  const leaderboardPowerTab = requiredElement("leaderboardPowerTab");
  const leaderboardDamageTab = requiredElement("leaderboardDamageTab");
  const leaderboardHealthTab = requiredElement("leaderboardHealthTab");
  const leaderboardArmorTab = requiredElement("leaderboardArmorTab");
  const leaderboardRegenTab = requiredElement("leaderboardRegenTab");
  const leaderboardTimeTab = requiredElement("leaderboardTimeTab");
  const leaderboardValueHeading = requiredElement("leaderboardValueHeading");
  const leaderboardRowsEl = requiredElement("leaderboardRows");
  const leaderboardEmptyEl = requiredElement("leaderboardEmpty");
  const closeLeaderboardBtn = requiredElement("closeLeaderboardBtn");
  const devAuditEl = requiredElement("devAudit");
  const devControlsTab = requiredElement("devControlsTab");
  const devBugReportsTab = requiredElement("devBugReportsTab");
  const devCutscenesTab = requiredElement("devCutscenesTab");
  const devPerformanceTab = requiredElement("devPerformanceTab");
  const devControlsPanel = requiredElement("devControlsPanel");
  const devBugReportsPanel = requiredElement("devBugReportsPanel");
  const devBugReportRowsEl = requiredElement("devBugReportRows");
  const devBugReportEmptyEl = requiredElement("devBugReportEmpty");
  const devCutscenesPanel = requiredElement("devCutscenesPanel");
  const devPerformancePanel = requiredElement("devPerformancePanel");
  const devPresenceStatusEl = requiredElement("devPresenceStatus");
  const devPresenceToggleBtn = requiredElement<HTMLButtonElement>("devPresenceToggle");
  const perfFpsEl = requiredElement("perfFps");
  const perfFrameP50El = requiredElement("perfFrameP50");
  const perfFrameP95El = requiredElement("perfFrameP95");
  const perfFrameWorstEl = requiredElement("perfFrameWorst");
  const perfLongFramesEl = requiredElement("perfLongFrames");
  const perfRenderMsEl = requiredElement("perfRenderMs");
  const perfScriptMsEl = requiredElement("perfScriptMs");
  const perfEnemiesEl = requiredElement("perfEnemies");
  const perfProjectilesEl = requiredElement("perfProjectiles");
  const perfParticlesEl = requiredElement("perfParticles");
  const perfRemotePlayersEl = requiredElement("perfRemotePlayers");
  const perfCanvasDprEl = requiredElement("perfCanvasDpr");
  const perfCanvasSizeEl = requiredElement("perfCanvasSize");
  const perfMemoryEl = requiredElement("perfMemory");
  const perfSubscriptionsEl = requiredElement("perfSubscriptions");
  const triggerDragonCutsceneBtn = requiredElement("triggerDragonCutsceneBtn");
  const closeDevAuditBtn = requiredElement("closeDevAuditBtn");
  const updateNoticeEl = requiredElement("updateNotice");
  const updateNoticeTitleEl = requiredElement("updateNoticeTitle");
  const updateNoticeItemsEl = requiredElement("updateNoticeItems");
  const closeUpdateNoticeBtn = requiredElement("closeUpdateNoticeBtn");
  const signinVersionEl = requiredElement("signinVersion");
  const profileIconPickerEl = requiredElement("profileIconPicker");
  const profileIconChoices = requiredElement("profileIconChoices");
  const closeProfileIconPickerBtn = requiredElement("closeProfileIconPickerBtn");
  const gameUpdateGateEl = requiredElement("gameUpdateGate");
  const coop = window.wildwoodCoop || null;
  if (signinVersionEl) signinVersionEl.textContent = `v${GAME_VERSION}`;

  let updateReloadPending = false;

  function showGameUpdating() {
    updateReloadPending = true;
    gameUpdateGateEl.hidden = false;
  }

  const mapMusic = createMapMusicController(MUSIC_VOLUME_KEY, BEGINNER_DESERT_MAP_ID);
  let musicVolume = mapMusic.volume;

  function syncMapMusic() {
    mapMusic.syncMap(currentMapId);
  }

  enforceLatestVersion(GAME_VERSION, showGameUpdating);
  window.setInterval(() => enforceLatestVersion(GAME_VERSION, showGameUpdating), 120_000);
  const keys = new Set();
  const camera = createCamera();
  const effects = createCombatEffects();
  const performanceMonitor = createPerformanceMonitor();
  const { particles, damageNumbers, spawnBurst, spawnDamageNumber } = effects;
  const projectiles: Projectile[] = [];
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const enemyShots: EnemyShot[] = [];
  const enemies: EnemyState[] = [];
  const spawnSites: SpawnSite[] = [];
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [];
  const depthLayers: DepthLayer[] = [];
  const bossRain: BossRainStrike[] = [];
  const spiderVenom: SpiderVenomPool[] = [];
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, spawnBurst);
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  let pendingDragonHits = 0;
  let dragonHitBatchTimer = 0;
  let pendingSpiderHits = 0;
  let spiderHitBatchTimer = 0;
  const START_SPAWN = { x: 360, y: 360 };
  const MAP_CONFIG = {
    [TUTORIAL_FOREST_MAP_ID]: {
      name: "TUTORIAL FOREST",
      portal: { x: 190, y: 448, width: 198, height: 198, depth: 448, destination: BEGINNER_DESERT_MAP_ID },
      arrival: { x: 190, y: 540 },
    },
    [BEGINNER_DESERT_MAP_ID]: {
      name: "BEGINNER DESERT",
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: TUTORIAL_FOREST_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
      arrival: { x: 360, y: 770 },
    },
    [INTERMEDIATE_SNOWLANDS_MAP_ID]: {
      name: "INTERMEDIATE SNOWLANDS",
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: BEGINNER_DESERT_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
  } as const;
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;
  let mapTransitioning = false;
  let portalCooldown = 0;
  const portalCutscene = createPortalCutscene();
  let portalCutsceneIntensity = -1;
  let portalCutsceneBlackoutOpacity = 0;
  let portalCutsceneDestinationOpacity = 0;
  let portalCutscenePreview = false;
  let portalCutsceneMapId: MapId = TUTORIAL_FOREST_MAP_ID;
  let queuedDragonResult: DragonResult | null = null;

  let dpr = 1;
  let viewW = innerWidth;
  let viewH = innerHeight;
  let running = false;
  let hasStarted = false;
  let gameTime = 0;
  let last = performance.now();
  let nextFrameAt = last;
  let totalKills = 0;
  let lifetimeKillsIdentity = "";
  let flash = 0;
  let screenShake = 0;
  let screenShakeEnabled = true;
  let attackRangeVisible = true;
  try { attackRangeVisible = localStorage.getItem(ATTACK_RANGE_VISIBLE_KEY) !== "false"; } catch {}
  let lowPerformanceMode = false;
  try { lowPerformanceMode = localStorage.getItem(LOW_PERFORMANCE_MODE_KEY) === "true"; } catch {}
  let latencyVisible = false;
  try { latencyVisible = localStorage.getItem(LATENCY_VISIBLE_KEY) === "true"; } catch {}
  let messageClock = 0;
  const activeSpeechBubbles = new Map<string, { text: string; sentAtMs: number; lines: string[]; textWidth: number }>();
  let renderedSpeechBubbleRevision = -1;
  let nextSpeechBubbleExpiryAt = 0;
  let nextHudUpdateAt = 0;
  let nextPerformancePanelUpdateAt = 0;
  let pausedForUpgrade = false;
  let autoAttackEnabled = true;
  let pendingPlayerThrow: { x: number; y: number; isBoss?: boolean } | null = null;
  let duelWasActive = false;
  let liveDuelPresentation: DuelPresentation | null = null;
  let lastLocalDuelId: bigint | null = null;
  let visibleReplay: RuntimeDuelReplay | null = null;
  let replayMode: ReplayMode | null = null;
  let heldDuelScene: DuelScene | null = null;
  let renderedDuelScene: DuelScene | null = null;
  let duelResultHold = false;
  let duelReturnState: DuelReturnState | null = null;
  let duelExitFading = false;
  let dragonWorldNoticeTimer: number | null = null;
  let observedDragonEncounter: bigint | null = null;
  let dragonWasAlive: boolean | null = null;
  let pendingDragonResultEncounter: bigint | null = null;
  let shownDragonResultEncounter: bigint | null = null;
  let observedSpiderEncounter: bigint | null = null;
  let spiderWasAlive: boolean | null = null;
  let pendingSpiderResultEncounter: bigint | null = null;
  let shownSpiderResultEncounter: bigint | null = null;
  const locallyRewardedDragonEncounters = new Set<string>();
  const touchMove: { active: boolean; id: number | null; ox: number; oy: number; x: number; y: number; moved: boolean } = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false };
  let openProfileIdentity = "";
  let openProfileData: PlayerProfile | null = null;
  let leaderboardStat: LeaderboardStat = "power";


  const bootsPickup = {
    x: 940,
    y: 3660,
    r: 18,
    collected: false
  };
  const inventory: InventoryState & { selectedItemId: string } = { itemIds: [BASIC_PAPER_HAT], equippedHead: BASIC_PAPER_HAT, equippedChest: "", equippedFeet: "", selectedItemId: BASIC_PAPER_HAT };

  let hasSavedProgress = false;
  let progressLoaded = false;
  let progressLoadedIdentity = "";
  let waitingForFreshStart = false;
  let startupKind: string | null = null;
  let newPlayerIntroShown = false;
  let loadingStage = 0;
  let loadingStageStartedAt = performance.now();
  let loadingStageTimer: number | null = null;
  let loadingSequenceComplete = false;
  let pageLoadComplete = document.readyState === "complete";
  let guestContinuationChosen = false;
  let accountSignInPending = false;

  if (!pageLoadComplete) {
    window.addEventListener("load", () => {
      pageLoadComplete = true;
      updateLoadingDetail();
      finishStartup();
      const account = coop?.accountState?.();
      if (!hasStarted && account?.sessionConflict) showSessionConflict();
      else if (!hasStarted && account?.returningFromSignIn) showSigningIn();
      else if (!hasStarted && !account?.signedIn && !account?.authInProgress) showAccountChoice();
    }, { once: true });
  }

  const player: PlayerState = {
    x: 360,
    y: 360,
    r: 17,
    speed: BASE_PLAYER_SPEED,
    hp: BASE_PLAYER_HP,
    maxHp: BASE_PLAYER_HP,
    damage: 4,
    attackRate: STARTING_ATTACK_INTERVAL,
    projectileSpeed: BASE_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: BASE_ATTACK_RANGE,
    knockback: 0,
    armor: 0,
    regen: 0,
    attackClock: 0,
    throwClock: 0,
    hurtClock: 0,
    facing: 0,
    moving: false
  };

  const dragonSprite = new Image();
  const dragonSpriteCanvas = document.createElement("canvas");
  const dragonSpriteCtx = requiredCanvasContext(dragonSpriteCanvas, { willReadFrequently: true });
  let dragonSpriteReady = false;
  type TreeSpriteBound = { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number };
  type PreprocessResult = { type: "removeGreen"; requestId: number; pixels: ArrayBuffer } | { type: "treeBounds"; requestId: number; bounds: TreeSpriteBound[] };
  const assetPreprocessWorker = typeof Worker === "undefined"
    ? null
    : new Worker(new URL("./game/runtime/asset-preprocess-worker.ts", import.meta.url), { type: "module" });
  let nextPreprocessRequestId = 1;
  const preprocessRequests = new Map<number, (result: PreprocessResult) => void>();
  assetPreprocessWorker?.addEventListener("message", ({ data }: MessageEvent<PreprocessResult>) => {
    const complete = preprocessRequests.get(data.requestId);
    if (!complete) return;
    preprocessRequests.delete(data.requestId);
    complete(data);
  });

  function removeSpriteGreen(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    greenThreshold: number,
    ratio: number,
    complete: () => void,
  ) {
    const pixels = context.getImageData(0, 0, width, height);
    if (!assetPreprocessWorker) {
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        if (green > greenThreshold && green > red * ratio && green > blue * ratio) pixels.data[index + 3] = 0;
      }
      context.putImageData(pixels, 0, 0);
      complete();
      return;
    }
    const requestId = nextPreprocessRequestId++;
    preprocessRequests.set(requestId, (result) => {
      if (result.type !== "removeGreen") return;
      context.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), width, height), 0, 0);
      complete();
    });
    scheduleBackgroundTask(() => {
      assetPreprocessWorker.postMessage({ type: "removeGreen", requestId, pixels: pixels.data.buffer, greenThreshold, ratio }, [pixels.data.buffer]);
    });
  }

  dragonSprite.addEventListener("load", () => {
    dragonSpriteCanvas.width = dragonSprite.naturalWidth;
    dragonSpriteCanvas.height = dragonSprite.naturalHeight;
    dragonSpriteCtx.drawImage(dragonSprite, 0, 0);
    removeSpriteGreen(dragonSpriteCtx, dragonSpriteCanvas.width, dragonSpriteCanvas.height, 145, 1.45, () => {
      dragonSpriteReady = true;
    });
  });
  dragonSprite.src = "assets/wildwood/dragon_boss_spritesheet.png";

  const spiderSprite = new Image();
  const spiderSpriteCanvas = document.createElement("canvas");
  const spiderSpriteCtx = requiredCanvasContext(spiderSpriteCanvas, { willReadFrequently: true });
  let spiderSpriteReady = false;
  spiderSprite.addEventListener("load", () => {
    spiderSpriteCanvas.width = spiderSprite.naturalWidth;
    spiderSpriteCanvas.height = spiderSprite.naturalHeight;
    spiderSpriteCtx.drawImage(spiderSprite, 0, 0);
    removeSpriteGreen(spiderSpriteCtx, spiderSpriteCanvas.width, spiderSpriteCanvas.height, 135, 1.35, () => {
      spiderSpriteReady = true;
    });
  });
  spiderSprite.src = "assets/wildwood/desert-spider-boss-spritesheet.png";

  const boss: DragonBossState = {
    isBoss: true,
    x: WORLD.w - 760,
    y: WORLD.h - 560,
    r: 140,
    maxHp: 1000000,
    hp: 1000000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 1000000,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "cone",
    cone: null,
    encounter: null
  };

  const spiderBoss: SpiderBossState = {
    isBoss: true,
    bossKind: "spider",
    x: 4050,
    y: 4050,
    r: 125,
    maxHp: 150_000_000,
    hp: 150_000_000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 150_000_000,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "web",
    web: null,
    encounter: null,
  };

  let playerSpriteReady = false;
  let settledPlayerSprites = 0;
  const markPlayerSpriteReady = () => {
    settledPlayerSprites += 1;
    if (settledPlayerSprites < 8) return;
    playerSpriteReady = true;
    updateLoadingDetail();
    finishStartup();
  };
  const playerAppearanceAssets = loadPlayerAppearanceAssets(markPlayerSpriteReady);
  const profileIconSheet = new Image();
  profileIconSheet.addEventListener("load", () => {
    if (!leaderboardEl.hidden) renderLeaderboard();
  });
  profileIconSheet.src = "assets/wildwood/profile-portraits-grid-v2.png";

  const ENEMY_SPRITES = loadEnemySprites();
  const actorShadowSprite = loadActorShadowSprite();
  let portalArchSettled = false;
  const portalArch = new Image();
  const settlePortalArch = () => {
    portalArchSettled = true;
    updateLoadingDetail();
    finishStartup();
  };
  portalArch.addEventListener("load", settlePortalArch, { once: true });
  portalArch.addEventListener("error", settlePortalArch, { once: true });
  portalArch.src = "assets/wildwood/stone-portal-arch.png";
  let portalSwirlSettled = false;
  const portalSwirl = new Image();
  const settlePortalSwirl = () => {
    portalSwirlSettled = true;
    updateLoadingDetail();
    finishStartup();
  };
  portalSwirl.addEventListener("load", settlePortalSwirl, { once: true });
  portalSwirl.addEventListener("error", settlePortalSwirl, { once: true });
  portalSwirl.src = "assets/wildwood/portal-swirl-spritesheet.png";
  let treeSpritesheetReady = false;
  let treeSpriteBounds: TreeSpriteBound[] = [];
  function measureTreeSpriteBounds() {
    const canvas = document.createElement("canvas");
    canvas.width = treeSpritesheet.naturalWidth;
    canvas.height = treeSpritesheet.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(treeSpritesheet, 0, 0);
    const cellW = treeSpritesheet.naturalWidth / 4;
    const cellH = treeSpritesheet.naturalHeight / 4;
    return Array.from({ length: 16 }, (_, variant) => {
      const cellX = Math.floor((variant % 4) * cellW);
      const cellY = Math.floor(Math.floor(variant / 4) * cellH);
      const width = Math.ceil(cellW);
      const height = Math.ceil(cellH);
      const pixels = context.getImageData(cellX, cellY, width, height).data;
      let left = width;
      let top = height;
      let right = 0;
      let bottom = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] < 8) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + 1);
          bottom = Math.max(bottom, y + 1);
        }
      }
      if (right <= left || bottom <= top) return { x: cellX, y: cellY, w: width, h: height, groundCenter: width / 2, groundWidth: width * .3 };
      let groundLeft = width;
      let groundRight = 0;
      for (let y = Math.max(0, bottom - 3); y < bottom; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] < 8) continue;
          groundLeft = Math.min(groundLeft, x);
          groundRight = Math.max(groundRight, x + 1);
        }
      }
      const groundWidth = groundRight > groundLeft ? groundRight - groundLeft : Math.max(8, (right - left) * .28);
      const groundCenter = groundRight > groundLeft ? (groundLeft + groundRight) / 2 - left : (right - left) / 2;
      return { x: cellX + left, y: cellY + top, w: right - left, h: bottom - top, groundCenter, groundWidth };
    });
  }
  const treeSpritesheet = loadTreeSpritesheet(() => {
    const finishTreeLoad = (bounds: TreeSpriteBound[] = []) => {
      treeSpriteBounds = bounds;
      treeSpritesheetReady = true;
      updateLoadingDetail();
      finishStartup();
    };
    if (treeSpritesheet.naturalWidth <= 0) {
      finishTreeLoad();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = treeSpritesheet.naturalWidth;
    canvas.height = treeSpritesheet.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !assetPreprocessWorker) {
      void yieldToUser().then(() => finishTreeLoad(measureTreeSpriteBounds()));
      return;
    }
    context.drawImage(treeSpritesheet, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const requestId = nextPreprocessRequestId++;
    preprocessRequests.set(requestId, (result) => {
      if (result.type === "treeBounds") finishTreeLoad(result.bounds);
    });
    scheduleBackgroundTask(() => {
      assetPreprocessWorker.postMessage({ type: "treeBounds", requestId, width: canvas.width, height: canvas.height, pixels: pixels.data.buffer }, [pixels.data.buffer]);
    });
  });
  const snowPine = new Image();
  snowPine.src = "assets/wildwood/snow-pine-tree-v1.png";
  let duelSpaceBackgroundReady = false;
  const duelSpaceBackground = loadDuelSpaceBackground(() => {
    duelSpaceBackgroundReady = true;
    updateLoadingDetail();
    finishStartup();
  });
  let duelPlatformArtReady = false;
  const duelPlatformArt = loadDuelPlatformArt(() => {
    duelPlatformArtReady = true;
    updateLoadingDetail();
    finishStartup();
  });
  const worldRenderer = createWorldRenderer({
    ctx,
    camera,
    getViewport: () => ({ width: viewW, height: viewH }),
    getDevicePixelRatio: () => dpr,
    getMapId: () => currentMapId,
    getGameTime: () => gameTime,
    isArenaScene,
    mapName: (mapId) => MAP_CONFIG[mapId].name,
    activePortal,
    secondaryPortal,
    portalIsUnlocked,
    portalRevealIntensity: () => portalCutsceneIntensity,
    portalDestinationOpacity: () => portalCutsceneDestinationOpacity,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID,
    desertMapId: BEGINNER_DESERT_MAP_ID,
    snowMapId: INTERMEDIATE_SNOWLANDS_MAP_ID,
    paths,
    decor,
    enemies,
    player,
    duelSpaceBackground,
    treeSpritesheet,
    actorShadowSprite,
    treeSpriteBounds: () => treeSpriteBounds,
    portalArch,
    portalSwirl,
    snowPine,
    drawShadow: drawActorShadow,
    outlinedText: outlinedWorldText,
    roundRect,
  });
  const { drawGround, drawStaticWorld, invalidateStaticWorld, drawTree, drawCactus, drawPortal, drawSecondaryPortal, drawDecor, drawMinimap } = worldRenderer;
  const bossRenderer = createBossRenderer({
    ctx, camera, boss, spiderBoss, bossRain, spiderVenom,
    dragonSpriteCanvas, spiderSpriteCanvas,
    dragonReady: () => dragonSpriteReady,
    spiderReady: () => spiderSpriteReady,
    gameTime: () => gameTime,
    pixelCircle, outlinedText: outlinedWorldText, drawShadow: drawActorShadow,
    hpLossFlashDuration: DRAGON_HP_LOSS_FLASH_DURATION,
    spiderWebRange: SPIDER_WEB_RANGE,
  });
  const { drawBossTelegraphs, drawBoss, drawSpiderTelegraphs, drawSpiderBoss } = bossRenderer;
  const actorRenderer = createActorRenderer({
    ctx,
    camera,
    viewport: () => ({ width: viewW, height: viewH }),
    gameTime: () => gameTime,
    drawPlayerAppearance: (actor, alpha) => drawStartingPlayer(ctx, playerAppearanceAssets, {
      ...actor,
      gameTime,
      skinTone: coop?.skinTone?.(actor.identity ?? actor.id) ?? DEFAULT_SKIN_TONE,
      alpha,
    }),
    localHeadItem: () => inventory.equippedHead,
    localChestItem: () => inventory.equippedChest,
    localFeetItem: () => inventory.equippedFeet,
    playerStone: playerAppearanceAssets.stone,
    enemySprites: ENEMY_SPRITES,
    duelPlatformArt,
    player,
    enemyTextVisible: (enemy) => {
      const screenRadius = Math.hypot(viewW, viewH) / (2 * camera.zoom);
      const cullDistance = Math.max(ENEMY_TEXT_CULL_MIN_DISTANCE, screenRadius + 80);
      return distanceSquared(player, enemy) <= cullDistance * cullDistance;
    },
    pixelCircle,
    outlinedText: outlinedWorldText,
    drawShadow: drawActorShadow,
    drawStatus: drawActorStatus,
    drawSpeechBubble,
    publicName: publicPlayerName,
    worldHealthBarHeight: WORLD_HEALTH_BAR_HEIGHT,
  });
  const {
    drawDuelArena: drawDuelArenaVisual,
    drawDuelScene,
    drawPlayer: drawPlayerActor,
    drawRemotePlayer,
    drawEnemy,
    drawProjectile,
  } = actorRenderer;

  function resize() {
    viewW = innerWidth;
    viewH = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    textCanvas.width = Math.round(viewW * dpr);
    textCanvas.height = Math.round(viewH * dpr);
    textCanvas.style.width = viewW + "px";
    textCanvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  addEventListener("resize", resize);
  resize();

  function raycastProjectile(startX: number, startY: number, endX: number, endY: number, radius: number) {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return null;

    const invLength = 1 / Math.sqrt(lengthSq);
    let closestEnemy: EnemyState | DragonBossState | SpiderBossState | null = null;
    let closestT = Infinity;

    const mapBoss = currentMapId === TUTORIAL_FOREST_MAP_ID ? boss : currentMapId === BEGINNER_DESERT_MAP_ID ? spiderBoss : null;
    for (let index = mapBoss ? -1 : 0; index < enemies.length; index++) {
      const e = index < 0 ? mapBoss! : enemies[index];
      if (e.dead) continue;

      const ex = e.x - startX;
      const ey = e.y - startY;
      const hitRadius = radius + e.r;
      const hitRadiusSq = hitRadius * hitRadius;
      const startDistanceSq = ex * ex + ey * ey;
      let t = 0;

      if (startDistanceSq > hitRadiusSq) {
        const projectedT = (ex * dx + ey * dy) / lengthSq;
        if (projectedT < 0 || projectedT > 1) continue;

        const nearestX = startX + dx * projectedT;
        const nearestY = startY + dy * projectedT;
        const nearestDistanceX = e.x - nearestX;
        const nearestDistanceY = e.y - nearestY;
        const nearestDistanceSq = nearestDistanceX * nearestDistanceX + nearestDistanceY * nearestDistanceY;
        if (nearestDistanceSq > hitRadiusSq) continue;

        t = projectedT - Math.sqrt(hitRadiusSq - nearestDistanceSq) * invLength;
        if (t < 0 || t > 1) continue;
      }

      if (t < closestT) {
        closestT = t;
        closestEnemy = e;
      }
    }

    return closestEnemy ? { enemy: closestEnemy, t: closestT } : null;
  }

  function rebuildWorld() {
    const layout = createWorldLayout(player, currentMapId);
    decor.splice(0, decor.length, ...layout.decor);
    paths.splice(0, paths.length, ...layout.paths);
    spawnSites.splice(0, spawnSites.length, ...createSpawnSites(boss, currentMapId));
    invalidateStaticWorld();
  }

  function reset(preserveStats = false) {
    const mapSpawn = currentMapId === TUTORIAL_FOREST_MAP_ID ? START_SPAWN : MAP_CONFIG[currentMapId].arrival;
    player.x = mapSpawn.x;
    player.y = mapSpawn.y;

    if (!preserveStats && !hasSavedProgress) {
      player.maxHp = BASE_PLAYER_HP;
      player.damage = 4;
      player.attackRate = STARTING_ATTACK_INTERVAL;
      player.projectileSpeed = BASE_PROJECTILE_SPEED;
      player.projectileCount = 1;
      player.attackRange = BASE_ATTACK_RANGE;
      player.armor = 0;
      player.regen = 0;
      player.speed = BASE_PLAYER_SPEED;
    }

    player.hp = player.maxHp;
    player.attackClock = 0;
    player.throwClock = 0;
    pendingPlayerThrow = null;
    player.hurtClock = 0;
    player.facing = 0;
    player.moving = false;

    enemies.length = 0;
    projectiles.length = 0;
    pendingDragonHits = 0;
    dragonHitBatchTimer = 0;
    pendingSpiderHits = 0;
    spiderHitBatchTimer = 0;
    enemyShots.length = 0;
    particles.length = 0;
    damageNumbers.length = 0;

    gameTime = 0;
    flash = 0;
    screenShake = 0;
    messageClock = 0;
    pickupLog.innerHTML = "";
    resetBoss();
    resetSpiderBoss();

    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);

    showMessage(MAP_CONFIG[currentMapId].name, "#ffe769");
    updateHud(true);
  }

  function saveProgress(immediate = false) {
    if (!coop || typeof coop.saveProgress !== "function") return;
    coop.saveProgress({
      maxHp: player.maxHp,
      damage: player.damage,
      attackRate: player.attackRate,
      projectileSpeed: player.projectileSpeed,
      projectileCount: player.projectileCount,
      attackRange: player.attackRange,
      armor: player.armor,
      regen: player.regen,
      speed: player.speed,
      bootsCollected: bootsPickup.collected,
      inventoryJson: serialiseInventory(inventory),
      equippedHead: inventory.equippedHead,
      equippedChest: inventory.equippedChest,
      equippedFeet: inventory.equippedFeet,
      enemyKills: totalKills,
    }, immediate);
  }

  function loadProgress() {
    if (!coop || typeof coop.savedProgress !== "function") return;
    const progressIdentity = coop.localIdentity?.() || "";
    if (progressLoaded && progressLoadedIdentity === progressIdentity) return;
    const saved = coop.savedProgress();
    if (!saved) return;
    const lifetime = coop.playerProfile?.(progressIdentity)?.lifetime;
    if (lifetime) {
      totalKills = progressIdentity === lifetimeKillsIdentity
        ? Math.max(totalKills, lifetime.enemyKills)
        : lifetime.enemyKills;
      lifetimeKillsIdentity = progressIdentity;
    }

    let legacy = null;
    try {
      const candidate = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY) ?? "null");
      if (candidate?.stats && typeof candidate.stats === "object") legacy = candidate;
    } catch {}
    const isDefaultProgress = (progress: { maxHp: number; damage: number; attackRate: number; projectileSpeed: number; projectileCount: number; attackRange: number; armor: number; regen: number; speed: number; bootsCollected: boolean }) =>
      progress.maxHp === BASE_PLAYER_HP && progress.damage === 4 && progress.attackRate === STARTING_ATTACK_INTERVAL &&
      progress.projectileSpeed === BASE_PROJECTILE_SPEED && progress.projectileCount === 1 &&
      progress.attackRange === BASE_ATTACK_RANGE && progress.armor === 0 && progress.regen === 0 &&
      progress.speed === BASE_PLAYER_SPEED && progress.bootsCollected === false;
    const serverIsDefault = isDefaultProgress(saved);
    const source = legacy && serverIsDefault
      ? { ...legacy.stats, bootsCollected: legacy.bootsCollected === true }
      : saved;

    if (waitingForFreshStart && saved.introComplete) return;

    const number = (value: number, fallback: number, min: number, max: number) =>
      Number.isFinite(value) ? clamp(value, min, max) : fallback;

    player.maxHp = number(source.maxHp, player.maxHp, 1, MAX_PLAYER_STAT);
    player.damage = number(source.damage, player.damage, 1, MAX_PLAYER_STAT);
    player.attackRate = number(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
    player.projectileSpeed = BASE_PROJECTILE_SPEED;
    player.projectileCount = Math.floor(number(source.projectileCount, player.projectileCount, 1, 20));
    player.attackRange = BASE_ATTACK_RANGE;
    player.armor = number(source.armor, player.armor, 0, MAX_ARMOR);
    player.regen = number(source.regen, player.regen, 0, MAX_PLAYER_STAT);
    bootsPickup.collected = source.bootsCollected === true;
    player.hp = player.maxHp;
    const savedInventory = inventoryFromSave(source.inventoryJson, source.equippedFeet, source.equippedHead, source.equippedChest, bootsPickup.collected, isDeveloperIdentity(progressIdentity));
    inventory.itemIds = savedInventory.itemIds;
    inventory.equippedHead = savedInventory.equippedHead;
    inventory.equippedChest = savedInventory.equippedChest;
    inventory.equippedFeet = savedInventory.equippedFeet;
    player.speed = inventory.equippedFeet === TRAILBLAZER_BOOTS ? BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS : BASE_PLAYER_SPEED;
    if (!inventory.selectedItemId && inventory.itemIds.length) inventory.selectedItemId = inventory.itemIds[0];
    renderInventory();
    hasSavedProgress = true;
    progressLoaded = true;
    progressLoadedIdentity = progressIdentity;
    if (waitingForFreshStart) waitingForFreshStart = false;
    if (legacy && serverIsDefault) {
      saveProgress();
      try { localStorage.removeItem(LEGACY_SAVE_KEY); } catch {}
    }
    startupKind = !saved.introComplete && isDefaultProgress(source) ? "new" : "returning";
    finishStartup();
  }

  function finishStartup() {
    updateLoadingDetail();
    const account = coop?.accountState?.();
    if (account?.sessionConflict) {
      showSessionConflict();
      return;
    }
    if (hasStarted || running) return;
    if (!account?.signedIn && !account?.authInProgress && !account?.returningFromSignIn && !guestContinuationChosen && isSignInScreenReady()) {
      showAccountChoice();
      return;
    }
    if (!pageLoadComplete || !loadingSequenceComplete || !playerSpriteReady || !treeSpritesheetReady || !portalArchSettled || !portalSwirlSettled || !duelSpaceBackgroundReady || !duelPlatformArtReady ||
      !coop?.isConnected?.()) return;
    if (!progressLoaded || !coop?.localState?.()) return;
    if (account?.signedIn && !coop?.localProfileReady?.()) return;
    if (startupKind === "new") {
      if (!newPlayerIntroShown) {
        newPlayerIntroShown = true;
        showNewPlayerIntro();
      }
      return;
    }
    if (startupKind === "returning") {
      coop?.beginAdventure?.();
      startGame(false);
    }
  }

  function showConnecting() {
    if (loadingStageTimer !== null) window.clearTimeout(loadingStageTimer);
    loadingStage = 0;
    loadingStageStartedAt = performance.now();
    loadingStageTimer = null;
    loadingSequenceComplete = false;
    startEl.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    newPlayerPanel.hidden = true;
    sessionTakeoverBtn.hidden = true;
    sessionTakeoverBtn.disabled = false;
    sessionTakeoverNote.hidden = true;
    dragonResultEl.hidden = true;
    dragonWorldNoticeEl.hidden = true;
    updateLoadingDetail();
  }

  function showSessionConflict() {
    startEl.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    newPlayerPanel.hidden = true;
    loadingDetail.textContent = coop?.accountState?.().notice || "LOGGED IN ON ANOTHER TAB";
    loadingFill.style.width = "100%";
    sessionTakeoverBtn.hidden = false;
    sessionTakeoverNote.hidden = false;
  }

  function updateProtocolGate(accountState = coop?.accountState?.()) {
    if (!gameUpdateGateEl) return;
    gameUpdateGateEl.hidden = !(accountState?.updating || updateReloadPending);
    if (accountState?.updating) enforceLatestVersion(GAME_VERSION, showGameUpdating);
  }

  function showAccountChoice() {
    if (!isSignInScreenReady()) {
      if (connectionPanel.hidden) showConnecting();
      return;
    }
    const accountState = coop?.accountState?.();
    const accountOptionsReady = Boolean(coop?.isConnected?.() || accountState?.signInRequired);
    const knownAccount = Boolean(accountState?.knownAccount);
    const name = (coop?.knownCharacter?.() || "").trim();
    const characterFound = Boolean(name);
    if (accountCharacter && accountCharacterName) {
      accountCharacterName.textContent = characterFound ? name : "none";
      accountCharacter.classList.toggle("is-empty", !characterFound);
    }
    if (signInFromStartBtn) {
      signInFromStartBtn.hidden = false;
      signInFromStartBtn.textContent = characterFound || knownAccount ? "SIGN IN" : "REGISTER";
      signInFromStartBtn.disabled = accountSignInPending || !accountOptionsReady;
    }
    if (continueGuestBtn) {
      continueGuestBtn.hidden = false;
      continueGuestBtn.disabled = accountSignInPending;
    }
    if (accountChoiceDetail) {
      accountChoiceDetail.textContent = accountSignInPending
        ? "OPENING SIGN-IN…"
        : !accountOptionsReady
          ? "CONNECTING ACCOUNT OPTIONS…"
          : characterFound
            ? "SIGN IN TO THIS CHARACTER"
            : knownAccount
              ? "SIGN IN TO LOAD YOUR CHARACTER"
            : "REGISTER OR PLAY AS GUEST";
    }
    startEl.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = false;
    newPlayerPanel.hidden = true;
    showCurrentUpdateNotice();
  }

  function showSigningIn(detail = "LOADING YOUR CHARACTER…") {
    if (!isSignInScreenReady()) {
      if (connectionPanel.hidden) showConnecting();
      return;
    }
    if (loadingStageTimer !== null) window.clearTimeout(loadingStageTimer);
    loadingStageTimer = null;
    loadingSequenceComplete = true;
    startEl.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = false;
    newPlayerPanel.hidden = true;
    if (accountCharacter && accountCharacterName) {
      accountCharacterName.textContent = "signing in…";
      accountCharacter.classList.remove("is-empty");
    }
    if (signInFromStartBtn) signInFromStartBtn.hidden = true;
    if (continueGuestBtn) continueGuestBtn.hidden = true;
    if (accountChoiceDetail) accountChoiceDetail.textContent = detail;
  }

  function updateLoadingDetail() {
    if (!loadingDetail || !loadingFill) return;
    const connectionNotice = coop?.accountState?.().notice || "";
    if (/active in another tab|logged in on another tab|signing out other tab|takeover failed/i.test(connectionNotice)) {
      loadingDetail.textContent = connectionNotice;
      loadingFill.style.width = "100%";
      return;
    }
    const stages: Array<[string, boolean, number]> = [
      ["LOADING CONNECTION", Boolean(coop?.isConnected?.()), 12],
      ["LOADING PLAYER PROFILE", Boolean(coop?.localState?.()), 35],
      ["LOADING SAVED PROGRESS", progressLoaded, 60],
      ["LOADING PLAYER APPEARANCE", playerSpriteReady, 78],
      ["LOADING WORLD ART", treeSpritesheetReady && portalArchSettled && portalSwirlSettled && duelSpaceBackgroundReady && duelPlatformArtReady, 90],
      ["LOADING PAGE ART", pageLoadComplete, 97],
      ["STARTING WILDWOOD", true, 100],
    ];
    const [text, ready, percent] = stages[loadingStage];
    loadingDetail.textContent = text;
    loadingFill.style.width = `${percent}%`;

    if (loadingStageTimer !== null || !ready) return;
    const delay = Math.max(0, 200 - (performance.now() - loadingStageStartedAt));
    loadingStageTimer = window.setTimeout(() => {
      loadingStageTimer = null;
      if (loadingStage < stages.length - 1) {
        loadingStage += 1;
        loadingStageStartedAt = performance.now();
        updateLoadingDetail();
      } else {
        loadingSequenceComplete = true;
        finishStartup();
      }
    }, delay);
  }

  function isSignInScreenReady() {
    return pageLoadComplete && playerSpriteReady && treeSpritesheetReady && portalArchSettled && portalSwirlSettled && duelSpaceBackgroundReady && duelPlatformArtReady;
  }

  function showNewPlayerIntro() {
    if (!newPlayerNameInput.value) {
      newPlayerNameInput.value = coop?.localDisplayName?.() || "WANDERER";
    }
    startEl.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = true;
    newPlayerPanel.hidden = false;
    requestAnimationFrame(() => newPlayerNameInput.focus());
  }

  function beginAdventure() {
    const name = newPlayerNameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
      showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
      return;
    }
    if (name !== (coop?.localDisplayName?.() || "")) coop?.setDisplayName?.(name);
    startGame(true);
  }

  function updateBootPickup() {
    if (bootsPickup.collected) return;
    const dx = player.x - bootsPickup.x;
    const dy = player.y - bootsPickup.y;
    const reach = player.r + bootsPickup.r;

    if (dx * dx + dy * dy <= reach * reach) {
      bootsPickup.collected = true;
      inventory.itemIds = [...new Set([...inventory.itemIds, TRAILBLAZER_BOOTS])];
      inventory.equippedFeet = TRAILBLAZER_BOOTS;
      inventory.selectedItemId = TRAILBLAZER_BOOTS;
      player.speed = BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS;
      saveProgress();
      renderInventory();
      pausedForUpgrade = true;
      bootUpgradeEl.hidden = false;
      bootUpgradeClose.focus();
    }
  }

  function showMessage(text: string, color = "#fff") {
    messageEl.textContent = text;
    messageEl.style.color = color;
    messageEl.style.opacity = "1";
    messageClock = 1.45;
  }

  function logPickup(text: string, color: string) {
    const el = document.createElement("div");
    el.className = "pickup";
    el.textContent = text;
    el.style.color = color;
    pickupLog.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function fireAt(target: { x: number; y: number; isBoss?: boolean }) {
    if (pendingPlayerThrow) return;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const baseAngle = Math.atan2(dy, dx);
    player.facing = baseAngle;
    player.throwClock = PLAYER_THROW_SECONDS;
    pendingPlayerThrow = target;
  }

  function launchPlayerStone(target: { x: number; y: number; isBoss?: boolean }) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseAngle = Math.atan2(dy, dx);
    const spread = .13;

    if (target.isBoss) {
      coop?.syncPosition?.(player.x, player.y, player.facing, player.moving, true);
    }

    for (let i = 0; i < player.projectileCount; i++) {
      const angle = baseAngle + (i - (player.projectileCount - 1) / 2) * spread;
      const vx = Math.cos(angle) * player.projectileSpeed;
      const vy = Math.sin(angle) * player.projectileSpeed;
      const projectileLifeBonus = 1.25;

      projectiles.push({
        x: player.x + Math.cos(angle) * 20,
        y: player.y + Math.sin(angle) * 20,
        vx,
        vy,
        r: 6,
        damage: player.damage,
        hitLife: player.attackRange / player.projectileSpeed * projectileLifeBonus,
        life: (player.attackRange + PLAYER_PROJECTILE_VISUAL_TAIL) / player.projectileSpeed * projectileLifeBonus,
        trail: 0
      });
    }

    spawnBurst(player.x + dx / distance * 17, player.y + dy / distance * 17, "#ffe36b", 4, 38);
  }

  function attackNearest(dt: number) {
    player.attackClock -= dt;
    if (player.attackClock > 0) return;

    let target = null;
    let best = player.attackRange * player.attackRange;

    for (const e of enemies) {
      if (e.dead) continue;
      const d = distanceSquared(player, e);
      if (d < best) {
        best = d;
        target = e;
      }
    }

    const mapBoss = currentMapId === TUTORIAL_FOREST_MAP_ID ? boss : currentMapId === BEGINNER_DESERT_MAP_ID ? spiderBoss : null;
    if (mapBoss && !mapBoss.dead) {
      const centerDistance = Math.hypot(player.x - mapBoss.x, player.y - mapBoss.y);
      const edgeDistance = Math.max(0, centerDistance - mapBoss.r);
      if (edgeDistance * edgeDistance < best) {
        best = edgeDistance * edgeDistance;
        target = mapBoss;
      }
    }

    if (target) {
      fireAt(target);
      player.attackClock = player.attackRate;
    } else {
      player.attackClock = Math.min(player.attackClock, .08);
    }
  }

  function applyReward(reward: RuntimeReward, x: number, y: number) {
    switch (reward.type) {
      case "damage":
        player.damage += reward.amount;
        break;
      case "health":
        player.maxHp += reward.amount;
        player.hp = Math.min(player.maxHp, player.hp + reward.amount);
        break;
      case "speed":
        player.attackRate = 1 / Math.min(1 / MIN_ATTACK_INTERVAL, 1 / player.attackRate + reward.amount);
        break;
      case "armor":
        player.armor += reward.amount;
        break;
      case "regen":
        player.regen += reward.amount;
        break;
    }

    const data = REWARD_DATA[reward.type];
    logPickup(rewardLabel(reward), data.color);
    spawnBurst(x, y, ENEMY_DEATH_PARTICLE_COLOR, 16, 110);
    saveProgress();
  }

  function resetBoss() {
    const shared = coop?.dragonBoss?.();
    if (shared) {
      boss.encounter = shared.encounter;
      boss.hp = shared.hp;
      boss.maxHp = shared.maxHp;
      boss.dead = !shared.alive;
    }
    boss.hurt = 0;
    boss.hpLossFlashFrom = boss.hp;
    boss.hpLossFlashTimer = 0;
    boss.contactDamageClock = 0;
    boss.attackClock = 3;
    boss.nextAttack = "cone";
    boss.cone = null;
    bossRain.length = 0;
  }

  function resetSpiderBoss() {
    const shared = coop?.spiderBoss?.();
    if (shared) {
      spiderBoss.encounter = shared.encounter;
      spiderBoss.hp = shared.hp;
      spiderBoss.maxHp = shared.maxHp;
      spiderBoss.dead = !shared.alive;
    }
    spiderBoss.hpLossFlashFrom = spiderBoss.hp;
    spiderBoss.hpLossFlashTimer = 0;
    spiderBoss.contactDamageClock = 0;
    spiderBoss.attackClock = 3;
    spiderBoss.nextAttack = "web";
    spiderBoss.web = null;
    spiderVenom.length = 0;
  }

  function showSpiderResult(result: SpiderResult | null) {
    if (!result || shownSpiderResultEncounter === result.encounter) return;
    shownSpiderResultEncounter = result.encounter;
    pendingSpiderResultEncounter = null;
    if (!running) return;
    const localContribution = result.contributors.find((entry) => entry.identity === coop?.localIdentity?.());
    if (!localContribution) {
      const heading = dragonWorldNoticeEl.querySelector("strong");
      if (heading) heading.textContent = "DESERT SPIDER DEFEATED";
      dragonWorldNoticeDetailEl.replaceChildren();
      for (const contributor of result.contributors) {
        const row = document.createElement("div");
        row.className = "dragon-world-notice-row";
        const name = document.createElement("span");
        renderDomPlayerName(name, contributor.identity, contributor.name);
        const percentage = document.createElement("span");
        percentage.textContent = `${Math.round(contributor.percentage)}%`;
        row.append(name, percentage);
        dragonWorldNoticeDetailEl.appendChild(row);
      }
      dragonWorldNoticeEl.hidden = false;
      if (dragonWorldNoticeTimer !== null) window.clearTimeout(dragonWorldNoticeTimer);
      dragonWorldNoticeTimer = window.setTimeout(() => {
        dragonWorldNoticeEl.hidden = true;
        dragonWorldNoticeTimer = null;
      }, 6_000);
      return;
    }

    dragonResultTitle.textContent = "DESERT SPIDER DEFEATED";
    dragonResultTotal.textContent = `${Math.round(result.totalDamage).toLocaleString()} TOTAL DAMAGE`;
    dragonResultContributors.replaceChildren();
    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-result-row";
      const name = document.createElement("span");
      name.className = "dragon-result-name";
      renderDomPlayerName(name, contributor.identity, contributor.name);
      const damage = document.createElement("span");
      damage.className = "dragon-result-damage";
      damage.textContent = Math.round(contributor.damage).toLocaleString();
      const percentage = document.createElement("span");
      percentage.className = "dragon-result-percentage";
      percentage.textContent = `${contributor.percentage.toFixed(1)}%`;
      row.append(name, damage, percentage);
      dragonResultContributors.append(row);
    }
    logPickup("+100K MAX HEALTH", "#6fe48e");
    showMessage("+100K MAX HEALTH", "#6fe48e");
    dragonResultEl.hidden = false;
  }

  function syncSpiderState() {
    const shared = coop?.spiderBoss?.();
    if (!shared) return;
    const initialized = observedSpiderEncounter !== null;
    const encounterChanged = initialized && observedSpiderEncounter !== shared.encounter;
    const previousHp = spiderBoss.hp;
    if (!initialized || encounterChanged) {
      observedSpiderEncounter = shared.encounter;
      spiderWasAlive = shared.alive;
      spiderBoss.dead = !shared.alive;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
      spiderBoss.web = null;
      spiderVenom.length = 0;
      spiderBoss.hpLossFlashFrom = shared.hp;
      spiderBoss.hpLossFlashTimer = 0;
    } else if (spiderWasAlive && !shared.alive) {
      spiderWasAlive = false;
      spiderBoss.dead = true;
      spiderBoss.web = null;
      spiderVenom.length = 0;
      pendingSpiderResultEncounter = shared.encounter;
      spawnBurst(spiderBoss.x, spiderBoss.y, ENEMY_DEATH_PARTICLE_COLOR, 64, 230);
    } else if (!spiderWasAlive && shared.alive) {
      spiderWasAlive = true;
      spiderBoss.dead = false;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
    } else if (shared.alive && shared.hp < previousHp) {
      spiderBoss.hpLossFlashFrom = spiderBoss.hpLossFlashTimer > 0
        ? Math.max(spiderBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      spiderBoss.hpLossFlashTimer = DRAGON_HP_LOSS_FLASH_DURATION;
    }
    spiderBoss.encounter = shared.encounter;
    spiderBoss.maxHp = shared.maxHp;
    spiderBoss.hp = shared.hp;
    if (pendingSpiderResultEncounter !== null) {
      const result = coop?.spiderResult?.();
      if (result?.encounter === pendingSpiderResultEncounter) showSpiderResult(result);
    }
  }

  function killBoss() {
    if (boss.dead) return;

    boss.dead = true;
    boss.cone = null;
    bossRain.length = 0;
    spawnBurst(boss.x, boss.y, ENEMY_DEATH_PARTICLE_COLOR, 64, 230);
  }

  function hasSeenDragonPortalCutscene() {
    try { return localStorage.getItem(DRAGON_PORTAL_CUTSCENE_SEEN_KEY) === "true"; } catch { return false; }
  }

  function startMapPortalCutscene(mapId: MapId, preview = false) {
    const portal = MAP_CONFIG[mapId].portal;
    portalCutscene.begin(camera, { x: portal.x, y: portal.y - portal.height * .48 }, { width: viewW, height: viewH });
    portalCutsceneIntensity = 0;
    portalCutsceneBlackoutOpacity = 0;
    portalCutsceneDestinationOpacity = 0;
    portalCutscenePreview = preview;
    portalCutsceneMapId = mapId;
    keys.clear();
    touchMove.active = false;
    cutsceneOverlayEl.hidden = false;
    document.body.classList.add("is-cutscene");
  }

  function startDragonPortalCutscene(preview = false) {
    startMapPortalCutscene(TUTORIAL_FOREST_MAP_ID, preview);
  }

  function updatePortalCutscene(dt: number) {
    const frame = portalCutscene.update(dt);
    camera.x = frame.camera.x;
    camera.y = frame.camera.y;
    camera.zoom = frame.camera.zoom;
    portalCutsceneIntensity = frame.portalIntensity;
    portalCutsceneBlackoutOpacity = frame.blackoutOpacity;
    portalCutsceneDestinationOpacity = frame.destinationOpacity;
    if (!frame.finished) return true;

    portalCutsceneIntensity = -1;
    portalCutsceneBlackoutOpacity = 0;
    portalCutsceneDestinationOpacity = 0;
    cutsceneOverlayEl.hidden = true;
    document.body.classList.remove("is-cutscene");
    const wasPreview = portalCutscenePreview;
    portalCutscenePreview = false;
    if (!wasPreview) {
      try {
        localStorage.setItem(
          portalCutsceneMapId === INTERMEDIATE_SNOWLANDS_MAP_ID
            ? SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY
            : DRAGON_PORTAL_CUTSCENE_SEEN_KEY,
          "true",
        );
      } catch {}
    }
    const result = queuedDragonResult;
    queuedDragonResult = null;
    if (result && !wasPreview) showDragonResult(result);
    return false;
  }

  function showDragonResult(result: DragonResult | null) {
    if (!result || !dragonResultEl || shownDragonResultEncounter === result.encounter) return;
    if (portalCutscene.active && queuedDragonResult?.encounter === result.encounter) return;
    // Shared result rows can arrive while the sign-in/loading screen is still
    // visible. They describe world history, not a reward screen for a player
    // who has not entered the game yet.
    if (!running) {
      shownDragonResultEncounter = result.encounter;
      pendingDragonResultEncounter = null;
      return;
    }
    dragonResultTitle.textContent = "DRAGON DEFEATED";
    const worldHeading = dragonWorldNoticeEl.querySelector("strong");
    if (worldHeading) worldHeading.textContent = "DRAGON DEFEATED";
    const localContribution = result.contributors.find((entry) => entry.identity === coop?.localIdentity?.());
    if (localContribution && !hasSeenDragonPortalCutscene()) {
      queuedDragonResult = result;
      startDragonPortalCutscene();
      return;
    }
    shownDragonResultEncounter = result.encounter;
    pendingDragonResultEncounter = null;
    if (!localContribution) {
      if (dragonWorldNoticeTimer !== null) window.clearTimeout(dragonWorldNoticeTimer);
      dragonWorldNoticeDetailEl.replaceChildren();
      for (const contributor of result.contributors) {
        const row = document.createElement("div");
        row.className = "dragon-world-notice-row";
        const name = document.createElement("span");
        renderDomPlayerName(name, contributor.identity, contributor.name);
        const percentage = document.createElement("span");
        percentage.textContent = `${Math.round(contributor.percentage)}%`;
        row.append(name, percentage);
        dragonWorldNoticeDetailEl.appendChild(row);
      }
      dragonWorldNoticeEl.hidden = false;
      dragonWorldNoticeEl.style.animation = "none";
      void dragonWorldNoticeEl.offsetWidth;
      dragonWorldNoticeEl.style.animation = "";
      dragonWorldNoticeTimer = window.setTimeout(() => {
        dragonWorldNoticeEl.hidden = true;
        dragonWorldNoticeTimer = null;
      }, 6_000);
      return;
    }
    dragonResultTotal.textContent = `${Math.round(result.totalDamage).toLocaleString()} TOTAL DAMAGE`;
    dragonResultContributors.replaceChildren();

    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-result-row";
      const name = document.createElement("span");
      name.className = "dragon-result-name";
      renderDomPlayerName(name, contributor.identity, contributor.name);
      const damage = document.createElement("span");
      damage.className = "dragon-result-damage";
      damage.textContent = Math.round(contributor.damage).toLocaleString();
      const percentage = document.createElement("span");
      percentage.className = "dragon-result-percentage";
      percentage.textContent = `${contributor.percentage.toFixed(1)}%`;
      row.append(name, damage, percentage);
      dragonResultContributors.append(row);
    }

    if (!result.contributors.length) {
      const empty = document.createElement("div");
      empty.className = "dragon-result-row";
      empty.textContent = "NO DAMAGE RECORDS";
      dragonResultContributors.append(empty);
    }

    const encounterKey = String(result.encounter);
    if (!locallyRewardedDragonEncounters.has(encounterKey)) {
      locallyRewardedDragonEncounters.add(encounterKey);
      player.damage += 650;
      logPickup("+650 DAMAGE", "#ff655a");
      showMessage("+650 DAMAGE", "#ff655a");
      saveProgress();
    }

    dragonResultEl.hidden = false;
  }

  function tryShowDragonResult() {
    if (pendingDragonResultEncounter === null || shownDragonResultEncounter === pendingDragonResultEncounter) return;
    const result = coop?.dragonResult?.();
    if (result?.encounter === pendingDragonResultEncounter) showDragonResult(result);
  }

  function syncDragonState() {
    const shared = coop?.dragonBoss?.();
    if (!shared) return;
    const initialized = observedDragonEncounter !== null;
    const encounterChanged = initialized && observedDragonEncounter !== shared.encounter;
    const previousHp = boss.hp;

    if (!initialized) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      boss.dead = !shared.alive;
      if (boss.dead) {
        boss.cone = null;
        bossRain.length = 0;
      }
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (encounterChanged) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      pendingDragonResultEncounter = null;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      boss.dead = !shared.alive;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (dragonWasAlive && !shared.alive) {
      pendingDragonResultEncounter = shared.encounter;
      killBoss();
      dragonWasAlive = false;
    } else if (!dragonWasAlive && shared.alive) {
      dragonWasAlive = true;
      boss.dead = false;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (shared.alive && shared.hp < previousHp) {
      boss.hpLossFlashFrom = boss.hpLossFlashTimer > 0
        ? Math.max(boss.hpLossFlashFrom, previousHp)
        : previousHp;
      boss.hpLossFlashTimer = DRAGON_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    }

    boss.encounter = shared.encounter;
    boss.maxHp = shared.maxHp;
    boss.hp = shared.hp;
    if (!shared.alive) boss.dead = true;
    tryShowDragonResult();
  }

  function startBossCone() {
    boss.cone = {
      angle: Math.atan2(player.y - boss.y, player.x - boss.x),
      windup: DRAGON_CONE_WINDUP,
      timer: DRAGON_CONE_DURATION,
      duration: DRAGON_CONE_DURATION,
      hitPlayer: false,
      pushAngle: null
    };
    boss.nextAttack = "rain";
  }

  function hitBossConeWave(cone: BossCone, minRadius: number, maxRadius: number) {
    if (cone.hitPlayer) return;

    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angleDelta = Math.atan2(
      Math.sin(Math.atan2(dy, dx) - cone.angle),
      Math.cos(Math.atan2(dy, dx) - cone.angle)
    );

    if (
      distance >= minRadius - 34 &&
      distance <= maxRadius + 34 &&
      Math.abs(angleDelta) <= BOSS_CONE_HALF_ANGLE
    ) {
      cone.hitPlayer = true;
      damagePlayer(500);
      cone.pushAngle = Math.atan2(dy, dx);
      spawnBurst(player.x, player.y, "#ffb14a", 18, 165);
    }
  }

  function resolveBossCone(cone: BossCone) {
    spawnBurst(
      boss.x + Math.cos(cone.angle) * BOSS_CONE_RANGE,
      boss.y + Math.sin(cone.angle) * BOSS_CONE_RANGE,
      "#ff9b3d",
      28,
      210
    );
  }

  function startBossRain() {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count + rand(-.25, .25);
      const radius = rand(24, BOSS_RAIN_RANGE);
      const timer = .8 + i * .14;
      bossRain.push({
        x: clamp(player.x + Math.cos(angle) * radius, 60, WORLD.w - 60),
        y: clamp(player.y + Math.sin(angle) * radius, 60, WORLD.h - 60),
        timer,
        maxTimer: timer,
        r: 52
      });
    }

    boss.attackClock = 4.8;
    boss.nextAttack = "cone";
  }

  function updateBoss(dt: number) {
    boss.hpLossFlashTimer = Math.max(0, boss.hpLossFlashTimer - dt);
    boss.contactDamageClock = Math.max(0, boss.contactDamageClock - dt);
    if (boss.dead) return;

    boss.hurt = Math.max(0, boss.hurt - dt);

    for (let i = bossRain.length - 1; i >= 0; i--) {
      const strike = bossRain[i];
      strike.timer -= dt;

      if (strike.timer <= 0) {
        const dx = player.x - strike.x;
        const dy = player.y - strike.y;
        if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(100);
        spawnBurst(strike.x, strike.y, "#ff5d32", 22, 170);
        bossRain.splice(i, 1);
      }
    }

    if (boss.cone) {
      const cone = boss.cone;
      if (cone.windup > 0) {
        cone.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - cone.timer / cone.duration, 0, 1);
      boss.cone.timer -= dt;
      const progress = clamp(1 - cone.timer / cone.duration, 0, 1);
      const minRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * previousProgress;
      const maxRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * progress;
      hitBossConeWave(cone, minRadius, maxRadius);
      if (boss.cone.timer <= 0) {
        resolveBossCone(boss.cone);
        boss.cone = null;
        boss.attackClock = 2.8;
      }
      return;
    }

    if (boss.attackClock > 0) {
      boss.attackClock -= dt;
      return;
    }

    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    if (dx * dx + dy * dy > BOSS_AGGRO_RANGE * BOSS_AGGRO_RANGE) return;

    if (boss.nextAttack === "cone") startBossCone();
    else startBossRain();
  }

  function startSpiderWeb() {
    spiderBoss.web = { timer: 1.15, duration: 1.15, hitPlayer: false };
    spiderBoss.nextAttack = "venom";
  }

  function startSpiderVenom() {
    for (let index = 0; index < 6; index += 1) {
      const angle = index * TAU / 6 + rand(-.25, .25);
      const radius = rand(15, 125);
      spiderVenom.push({
        x: clamp(player.x + Math.cos(angle) * radius, 60, WORLD.w - 60),
        y: clamp(player.y + Math.sin(angle) * radius, 60, WORLD.h - 60),
        timer: .9 + index * .13,
        maxTimer: .9 + index * .13,
        r: 58,
      });
    }
    spiderBoss.attackClock = 4.2;
    spiderBoss.nextAttack = "web";
  }

  function updateSpiderBoss(dt: number) {
    spiderBoss.hpLossFlashTimer = Math.max(0, spiderBoss.hpLossFlashTimer - dt);
    spiderBoss.contactDamageClock = Math.max(0, spiderBoss.contactDamageClock - dt);
    if (spiderBoss.dead) return;

    for (let index = spiderVenom.length - 1; index >= 0; index -= 1) {
      const pool = spiderVenom[index];
      pool.timer -= dt;
      if (pool.timer <= 0) {
        const dx = player.x - pool.x;
        const dy = player.y - pool.y;
        if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(SPIDER_VENOM_DAMAGE);
        spawnBurst(pool.x, pool.y, "#89e255", 22, 150);
        spiderVenom.splice(index, 1);
      }
    }

    if (spiderBoss.web) {
      const web = spiderBoss.web;
      const previousProgress = clamp(1 - web.timer / web.duration, 0, 1);
      web.timer -= dt;
      const progress = clamp(1 - web.timer / web.duration, 0, 1);
      const minRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * previousProgress;
      const maxRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * progress;
      const distance = Math.hypot(player.x - spiderBoss.x, player.y - spiderBoss.y);
      if (!web.hitPlayer && distance >= minRadius - 30 && distance <= maxRadius + 30) {
        web.hitPlayer = true;
        damagePlayer(SPIDER_WEB_DAMAGE);
      }
      if (web.timer <= 0) {
        spiderBoss.web = null;
        spiderBoss.attackClock = 2.5;
      }
      return;
    }

    spiderBoss.attackClock -= dt;
    if (spiderBoss.attackClock > 0) return;
    const dx = player.x - spiderBoss.x;
    const dy = player.y - spiderBoss.y;
    if (dx * dx + dy * dy > SPIDER_AGGRO_RANGE * SPIDER_AGGRO_RANGE) return;
    if (spiderBoss.nextAttack === "web") startSpiderWeb();
    else startSpiderVenom();
  }

  function resolveSpiderCollision() {
    if (spiderBoss.dead) return;
    const dx = player.x - spiderBoss.x;
    const dy = player.y - spiderBoss.y;
    const minimumDistance = player.r + spiderBoss.r;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) return;
    if (spiderBoss.contactDamageClock <= 0) {
      damagePlayer(SPIDER_CONTACT_DAMAGE);
      spiderBoss.contactDamageClock = .75;
    }
    const distance = Math.sqrt(distanceSquared);
    const nx = distance > .001 ? dx / distance : 1;
    const ny = distance > .001 ? dy / distance : 0;
    player.x = spiderBoss.x + nx * minimumDistance;
    player.y = spiderBoss.y + ny * minimumDistance;
  }

  function killEnemy(e: EnemyState) {
    if (e.dead) return;
    e.dead = true;
    totalKills++;

    const base = ENEMY_TYPES[e.type];
    const site = spawnSites[e.siteId];

    if (site) {
      site.alive = false;
      site.respawnAt = gameTime + 30;
    }

    applyReward(e.reward, e.x, e.y);
    spawnBurst(e.x, e.y, ENEMY_DEATH_PARTICLE_COLOR, base.elite ? 28 : 12, base.elite ? 150 : 90);
  }

  function damagePlayer(amount: number) {
    if (isDueling()) return false;
    if (player.hurtClock > 0) return false;
    const dealt = damageAfterArmor(amount, player.armor);
    player.hp -= dealt;
    spawnDamageNumber(player.x, player.y, dealt);
    player.hurtClock = .1;
    flash = .22;
    screenShake = Math.max(screenShake, 7);
    spawnBurst(player.x, player.y, "#ff5f55", 13, 115);

    if (player.hp <= 0) {
      player.hp = 0;
      breakEnemyLeashes();
      endGame();
    }
    return true;
  }

  function breakEnemyLeashes() {
    for (const e of enemies) {
      if (e.dead) continue;
      e.engaged = false;
      e.leashing = true;
      e.attackClock = Math.max(e.attackClock, .5);
    }
  }

  let movementSyncActive = false;
  let observedCoopSessionGeneration = 0;

  function activeDuel(): RuntimeDuelState | null {
    return coop && typeof coop.localDuel === "function" ? coop.localDuel() : null;
  }

  function isDueling() {
    const duel = activeDuel();
    if (!duel || !["countdown", "active", "finishing"].includes(duel.status)) return false;
    if ((duel.status === "active" || duel.status === "finishing") && Date.now() >= duel.endsAtMs) coop?.pulseDuel?.();
    return true;
  }

  function isArenaScene() {
    return isDueling() || duelResultHold || replayMode !== null;
  }

  function liveDuelPresentationState(duel: RuntimeDuelState) {
    const durationSeconds = Math.max(0, (duel.endsAtMs - duel.startsAtMs) / 1000);
    const elapsed = Math.max(0, Math.min(durationSeconds, (Date.now() - duel.startsAtMs) / 1000));
    const state = duelTimelineState(duel, elapsed);
    return { elapsed, state };
  }

  function syncLiveDuelDamageNumbers(duel: RuntimeDuelState) {
    const presentation = liveDuelPresentationState(duel);
    const previous = liveDuelPresentation?.id === duel.id
      ? liveDuelPresentation
      : { id: duel.id, elapsed: 0, challengerHp: duel.challengerMaxHp, opponentHp: duel.opponentMaxHp };
    if (presentation.elapsed >= previous.elapsed) {
      const challengerDamage = previous.challengerHp - presentation.state.challengerHp;
      const opponentDamage = previous.opponentHp - presentation.state.opponentHp;
      if (challengerDamage > .01) spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
    }
    liveDuelPresentation = {
      id: duel.id,
      elapsed: presentation.elapsed,
      challengerHp: presentation.state.challengerHp,
      opponentHp: presentation.state.opponentHp,
    };
    return presentation;
  }

  function showDuelResult(replay: RuntimeDuelReplay | null) {
    if (!replay || !duelResultEl) return;
    const localName = coop?.localDisplayName?.() || "PLAYER";
    const selfIsChallenger = replay.challengerName === localName;
    const self = selfIsChallenger
      ? { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked }
      : { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked };
    const other = selfIsChallenger
      ? { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked }
      : { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked };
    const won = replay.winnerName === localName;
    duelResultTitle.textContent = replay.winnerName === "DRAW" ? "DUEL DRAW" : won ? "YOU WON" : "YOU LOST";
    duelResultStats.innerHTML =
      duelStatLine("YOU", self.attacks, self.damage, self.regen, self.blocked) +
      duelStatLine(other.name, other.attacks, other.damage, other.regen, other.blocked);
    duelResultEl.hidden = false;
    duelResultEl.dataset.replayId = String(replay.id);
    watchDuelReplayBtn.hidden = false;
  }

  function showDuelResultUnavailable() {
    duelResultTitle.textContent = "DUEL COMPLETE";
    duelResultStats.innerHTML = '<div class="duel-stat-row">RESULT DETAILS UNAVAILABLE</div>';
    duelResultEl.hidden = false;
    duelResultEl.dataset.replayId = "0";
    watchDuelReplayBtn.hidden = true;
  }

  async function openDuelReplay(replayId: bigint) {
    const replay = coop?.loadDuelReplay
      ? await coop.loadDuelReplay(replayId)
      : coop?.duelReplay?.(replayId);
    if (!replay) {
      showMessage("REPLAY EXPIRED", "#ff9b91");
      return;
    }
    visibleReplay = replay;
    damageNumbers.length = 0;
    replayMode = {
      replay,
      start: performance.now(),
      lastElapsed: 0,
      lastState: {
        challengerHp: replay.challengerMaxHp,
        opponentHp: replay.opponentMaxHp,
      },
    };
    duelResultEl.hidden = true;
    duelReplayTitle.textContent = `${replay.challengerName} VS ${replay.opponentName}`;
    duelReplayEl.hidden = false;
    document.body.classList.add("is-replaying");
  }

  function applyDuelState() {
    const duel = activeDuel();
    if (!duel || !coop || !isDueling()) return false;
    const localIsChallenger = duel.challenger === coop.localIdentity();
    const localState = coop.localState?.();
    if (localState) {
      player.x = localState.x;
      player.y = localState.y;
      player.facing = localState.facing ?? player.facing;
    }
    const presentation = syncLiveDuelDamageNumbers(duel);
    const localHp = localIsChallenger ? presentation.state.challengerHp : presentation.state.opponentHp;
    player.maxHp = localIsChallenger ? duel.challengerMaxHp : duel.opponentMaxHp;
    player.hp = duel.status === "finishing"
      ? localIsChallenger ? duel.challengerHp : duel.opponentHp
      : localHp;
    player.moving = false;
    duelWasActive = true;
    lastLocalDuelId = duel.id;
    heldDuelScene = liveDuelScene(coop?.remotePlayers?.() || []) || heldDuelScene;
    coop.pulseDuel?.();
    return true;
  }

  function updatePlayer(dt: number) {
    if (applyDuelState()) return;
    if (duelWasActive) {
      const returnedState = coop?.localState?.();
      if (!returnedState || returnedState.x < player.r || returnedState.y < player.r ||
        returnedState.x > WORLD.w - player.r || returnedState.y > WORLD.h - player.r) {
        return;
      }
      duelReturnState = {
        x: returnedState.x,
        y: returnedState.y,
        facing: returnedState.facing ?? player.facing,
      };
      duelWasActive = false;
      duelResultHold = true;
      liveDuelPresentation = null;
      if (lastLocalDuelId) {
        void coop?.loadDuelReplay?.(lastLocalDuelId).then((replay) => {
          if (replay) showDuelResult(replay);
          else showDuelResultUnavailable();
        });
      }
      return;
    }
    if (duelResultHold) return;
    if (mapTransitioning) {
      player.moving = false;
      return;
    }
    // Keep server position and the spatial subscription current even while no
    // remote player is cached yet. Gating sync on remotePlayerCount creates a
    // deadlock: no remote row means no movement sync, so neither player moves
    // into the other's area-of-interest query.
    const multiplayerActive = Boolean(coop?.isConnected?.());
    const multiplayerJustStarted = multiplayerActive && !movementSyncActive;
    movementSyncActive = multiplayerActive;
    if (multiplayerActive && coop) coop.syncSpeed(player.speed);

    let mx = 0, my = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) my -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) my += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;

    if (touchMove.active) {
      mx += touchMove.x;
      my += touchMove.y;
    }

    const len = Math.hypot(mx, my);
    player.moving = len > 0;
    if (player.moving) {
      mx /= len;
      my /= len;
      player.x += mx * player.speed * dt;
      player.y += my * player.speed * dt;
      // Character art mirrors horizontally. Straight vertical movement has no
      // horizontal heading, so keep the prior left/right facing direction.
      if (Math.abs(mx) > .1) player.facing = Math.atan2(my, mx);
    }

    if (typeof boss.cone?.pushAngle === "number") {
      const waveSpeed = (BOSS_CONE_RANGE - boss.r) / boss.cone.duration;
      player.x += Math.cos(boss.cone.pushAngle) * waveSpeed * dt;
      player.y += Math.sin(boss.cone.pushAngle) * waveSpeed * dt;
    }

    resolvePortalCollision();
    if (currentMapId === TUTORIAL_FOREST_MAP_ID) resolveDragonCollision();
    if (currentMapId === BEGINNER_DESERT_MAP_ID) resolveSpiderCollision();

    player.x = clamp(player.x, player.r, WORLD.w - player.r);
    player.y = clamp(player.y, player.r, WORLD.h - player.r);

    if (multiplayerActive) {
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      const marginX = visibleW * NETWORK_NEAR_SCREEN_MARGIN_RATIO;
      const marginY = visibleH * NETWORK_NEAR_SCREEN_MARGIN_RATIO;
      const highFrequency = coop?.hasRemotePlayerInArea?.(
        camera.x - marginX,
        camera.y - marginY,
        camera.x + visibleW + marginX,
        camera.y + visibleH + marginY,
      ) ?? false;
      coop?.syncPosition(player.x, player.y, player.facing, player.moving, multiplayerJustStarted, highFrequency);
    }

    player.hurtClock = Math.max(0, player.hurtClock - dt);
    const previousThrowClock = player.throwClock;
    player.throwClock = Math.max(0, player.throwClock - dt);
    if (pendingPlayerThrow && previousThrowClock > PLAYER_THROW_SECONDS - PLAYER_THROW_WINDUP_SECONDS && player.throwClock <= PLAYER_THROW_SECONDS - PLAYER_THROW_WINDUP_SECONDS) {
      const target = pendingPlayerThrow;
      pendingPlayerThrow = null;
      launchPlayerStone(target);
    }
    if (player.regen > 0 && player.hp > 0) {
      player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    }

    if (autoAttackEnabled) attackNearest(dt);
  }

  function activePortal() {
    return MAP_CONFIG[currentMapId].portal;
  }

  function secondaryPortal() {
    return currentMapId === BEGINNER_DESERT_MAP_ID ? MAP_CONFIG[BEGINNER_DESERT_MAP_ID].secondaryPortal : null;
  }

  function portalIsUnlocked() {
    return currentMapId !== TUTORIAL_FOREST_MAP_ID || Boolean(coop?.savedProgress?.()?.desertUnlocked);
  }

  function portalColliders() {
    return [activePortal(), secondaryPortal()].filter(Boolean).flatMap((portal) => {
      const current = portal!;
      return [
        { x: current.x - current.width * .32, y: current.y - 52, r: 22 },
        { x: current.x + current.width * .32, y: current.y - 52, r: 22 },
      ];
    });
  }

  function resolvePortalCollision() {
    const portal = activePortal();
    for (const obstacle of portalColliders()) {
      const dx = player.x - obstacle.x;
      const dy = player.y - obstacle.y;
      const minimumDistance = player.r + obstacle.r;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimumDistance * minimumDistance) continue;

      const distance = Math.sqrt(distanceSquared);
      const nx = distance > .001 ? dx / distance : (player.x < portal.x ? -1 : 1);
      const ny = distance > .001 ? dy / distance : 0;
      player.x = obstacle.x + nx * minimumDistance;
      player.y = obstacle.y + ny * minimumDistance;
    }
  }

  function updatePortal(dt: number) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (mapTransitioning || portalCooldown > 0 || isDueling() || !portalIsUnlocked()) return;
    const portal = [activePortal(), secondaryPortal()].filter(Boolean).find((candidate) => {
      const current = candidate!;
      return Math.hypot(player.x - current.x, player.y - (current.y - current.height * .32)) <= 48;
    });
    if (!portal) return;

    mapTransitioning = true;
    const destination = portal.destination;
    void Promise.resolve(coop?.changeMap?.(destination)).then((changed) => {
      if (!changed) {
        mapTransitioning = false;
        portalCooldown = 1;
        return;
      }
      fadeToWorld(() => {
        const arrival = MAP_CONFIG[destination].arrival;
        loadMap(destination, arrival.x, arrival.y, Math.PI / 2);
        portalCooldown = 1.5;
        mapTransitioning = false;
        showMessage(MAP_CONFIG[currentMapId].name, "#ffe769");
        coop?.syncPosition?.(player.x, player.y, player.facing, false, true);
      });
    });
  }

  function loadMap(mapId: MapId, x: number, y: number, facing = 0) {
    currentMapId = mapId;
    syncMapMusic();
    player.x = x;
    player.y = y;
    player.facing = facing;
    player.moving = false;
    enemies.length = 0;
    spawnSites.length = 0;
    projectiles.length = 0;
    enemyShots.length = 0;
    particles.length = 0;
    damageNumbers.length = 0;
    pendingDragonHits = 0;
    dragonHitBatchTimer = 0;
    pendingSpiderHits = 0;
    spiderHitBatchTimer = 0;
    bossRain.length = 0;
    boss.cone = null;
    spiderVenom.length = 0;
    spiderBoss.web = null;
    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);
    if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID) {
      try {
        if (localStorage.getItem(SNOWLANDS_PORTAL_CUTSCENE_SEEN_KEY) !== "true") {
          requestAnimationFrame(() => {
            if (running && currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID && !portalCutscene.active) {
              startMapPortalCutscene(INTERMEDIATE_SNOWLANDS_MAP_ID);
            }
          });
        }
      } catch {}
    }
  }

  function reconcileMapFromServer() {
    if (!running || mapTransitioning || isDueling()) return;
    const state = coop?.localState?.();
    if (!state || state.mapId === currentMapId) return;
    if (state.mapId !== TUTORIAL_FOREST_MAP_ID && state.mapId !== BEGINNER_DESERT_MAP_ID && state.mapId !== INTERMEDIATE_SNOWLANDS_MAP_ID) return;

    mapTransitioning = true;
    fadeToWorld(() => {
      loadMap(state.mapId as MapId, state.x, state.y, state.facing);
      portalCooldown = 1.5;
      mapTransitioning = false;
      showMessage(MAP_CONFIG[currentMapId].name, "#ffe769");
    });
  }

  function resolveDragonCollision() {
    if (boss.dead) return;

    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const minimumDistance = player.r + boss.r;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) return;

    if (boss.contactDamageClock <= 0) {
      damagePlayer(DRAGON_CONTACT_DAMAGE);
      boss.contactDamageClock = DRAGON_CONTACT_DAMAGE_COOLDOWN;
    }

    const distance = Math.sqrt(distanceSquared);
    const nx = distance > .001 ? dx / distance : 1;
    const ny = distance > .001 ? dy / distance : 0;
    player.x = boss.x + nx * minimumDistance;
    player.y = boss.y + ny * minimumDistance;
  }

  function updateEnemies(dt: number) {
    for (const e of enemies) {
      if (e.dead) continue;
      const base = ENEMY_TYPES[e.type];
      e.hurt = Math.max(0, e.hurt - dt);
      e.attackClock -= dt;
      e.moveSpeedRecovery = Math.min(ENEMY_HIT_SPEED_RECOVERY_SECONDS, e.moveSpeedRecovery + dt);
      e.phase += dt * 3;
      const moveSpeedProgress = e.moveSpeedRecovery / ENEMY_HIT_SPEED_RECOVERY_SECONDS;
      const currentMoveSpeed = ENEMY_HIT_MIN_MOVE_SPEED + (e.speed - ENEMY_HIT_MIN_MOVE_SPEED) * moveSpeedProgress;

      const toPlayerX = player.x - e.x;
      const toPlayerY = player.y - e.y;
      const playerDistance = Math.hypot(toPlayerX, toPlayerY) || 1;
      const homeDistance = Math.hypot(e.x - e.homeX, e.y - e.homeY);

      if (e.leashing && homeDistance < 10) e.leashing = false;
      const aggroRadius = base.elite
        ? e.aggroRadius
        : Math.max(0, player.attackRange - REGULAR_ENEMY_AGGRO_PADDING);
      if (!e.leashing && playerDistance < aggroRadius) {
        engageEnemy(e);
      }

      const leashRange = e.type === "Dune Archer" ? Math.max(900, e.leashRange) : e.leashRange;
      if (e.engaged && playerDistance > leashRange) {
        e.engaged = false;
        e.leashing = true;
        e.attackClock = Math.max(e.attackClock, .5);
      }

      let targetX = e.x;
      let targetY = e.y;
      let targetDistance = 1;
      let moveMode = 0;
      let moveSpeedRatio = 1;

      if (e.engaged) {
        targetX = player.x;
        targetY = player.y;
        targetDistance = playerDistance;
        moveMode = 1;
        if (Math.abs(toPlayerX) > .5) e.facingX = toPlayerX < 0 ? -1 : 1;
      } else {
        moveSpeedRatio = ENEMY_WANDER_SPEED_RATIO;
        if (e.leashing || homeDistance > ENEMY_WANDER_RADIUS) {
          e.wandering = false;
          targetX = e.homeX;
          targetY = e.homeY;
          moveMode = 1;
          if (e.leashing) moveSpeedRatio = 1;
        } else if (e.wandering) {
          targetX = e.wanderTargetX;
          targetY = e.wanderTargetY;
          if (Math.hypot(targetX - e.x, targetY - e.y) < 8) {
            e.wandering = false;
            e.wanderWait = rand(2.2, 5.2);
            targetX = e.x;
            targetY = e.y;
          } else {
            moveMode = 1;
          }
        } else {
          e.wanderWait -= dt;
          if (e.wanderWait <= 0) {
            const angle = Math.random() * TAU;
            const distance = rand(22, ENEMY_WANDER_RADIUS);
            e.wanderTargetX = e.homeX + Math.cos(angle) * distance;
            e.wanderTargetY = e.homeY + Math.sin(angle) * distance;
            e.wandering = true;
            targetX = e.wanderTargetX;
            targetY = e.wanderTargetY;
            moveMode = 1;
          }
        }

        targetDistance = Math.hypot(targetX - e.x, targetY - e.y) || 1;
        if (moveMode && Math.abs(targetX - e.x) > .5) e.facingX = targetX < e.x ? -1 : 1;

        if (homeDistance < 12 && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * .16 * dt);
        }
      }

      let dx = (targetX - e.x) / targetDistance;
      let dy = (targetY - e.y) / targetDistance;

      if (base.ranged && e.engaged) {
        const preferred = 235;
        let rangedMove = 0;
        if (playerDistance > preferred + 25) rangedMove = 1;
        if (playerDistance < preferred - 35) rangedMove = -1;

        e.vx += (toPlayerX / playerDistance) * currentMoveSpeed * rangedMove * dt * 6;
        e.vy += (toPlayerY / playerDistance) * currentMoveSpeed * rangedMove * dt * 6;

        if (e.attackClock <= 0 && playerDistance < 390) {
          enemyShots.push({
            x: e.x,
            y: e.y,
            vx: toPlayerX / playerDistance * RANGED_PROJECTILE_SPEED,
            vy: toPlayerY / playerDistance * RANGED_PROJECTILE_SPEED,
            r: 6,
            damage: e.damage,
            life: 4
          });
          const rangedAttackInterval = 1 / Math.max(.01, base.attackSpeed);
          e.attackClock = rand(rangedAttackInterval * .83, rangedAttackInterval * 1.17);
        }
      } else if (moveMode) {
        e.vx += dx * currentMoveSpeed * moveSpeedRatio * dt * 7;
        e.vy += dy * currentMoveSpeed * moveSpeedRatio * dt * 7;
      }

      e.vx *= Math.pow(.002, dt);
      e.vy *= Math.pow(.002, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, e.r, WORLD.w - e.r);
      e.y = clamp(e.y, e.r, WORLD.h - e.r);

      if (e.engaged && e.attackClock <= 0 && circlesOverlap(player, e)) {
        if (damagePlayer(e.damage)) {
          e.attackClock = 1 / Math.max(.01, base.attackSpeed);
          e.moveSpeedRecovery = 0;
          e.vx = 0;
          e.vy = 0;
        }
      }

      // Keep enemies outside the player's collision circle while allowing
      // sideways velocity to slide naturally around the player.
      const collisionX = e.x - player.x;
      const collisionY = e.y - player.y;
      const minimumDistance = player.r + e.r;
      const collisionDistanceSq = collisionX * collisionX + collisionY * collisionY;
      if (collisionDistanceSq < minimumDistance * minimumDistance) {
        const collisionDistance = Math.sqrt(collisionDistanceSq);
        const nx = collisionDistance > .001 ? collisionX / collisionDistance : (e.facingX || 1);
        const ny = collisionDistance > .001 ? collisionY / collisionDistance : 0;
        e.x = clamp(player.x + nx * minimumDistance, e.r, WORLD.w - e.r);
        e.y = clamp(player.y + ny * minimumDistance, e.r, WORLD.h - e.r);
        const inwardSpeed = e.vx * nx + e.vy * ny;
        if (inwardSpeed < 0) {
          e.vx -= inwardSpeed * nx;
          e.vy -= inwardSpeed * ny;
        }
      }
    }

    // Mild crowd separation.
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.r + b.r) * .72;
        const d2 = dx * dx + dy * dy;

        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * .5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) enemies.splice(i, 1);
    }
  }

  function updateProjectiles(dt: number) {
    for (const p of projectiles) {
      const travelTime = Math.min(dt, p.life);
      const startX = p.x;
      const startY = p.y;
      const endX = startX + p.vx * travelTime;
      const endY = startY + p.vy * travelTime;
      const hitTravelTime = Math.min(travelTime, Math.max(0, p.hitLife ?? p.life));
      const hitEndX = startX + p.vx * hitTravelTime;
      const hitEndY = startY + p.vy * hitTravelTime;
      const hit = hitTravelTime > 0 ? raycastProjectile(startX, startY, hitEndX, hitEndY, p.r) : null;

      p.life -= dt;
      if (p.hitLife !== undefined) p.hitLife -= dt;
      p.trail -= dt;

      if (hit) {
        p.x = startX + (endX - startX) * hit.t;
        p.y = startY + (endY - startY) * hit.t;
        const target = hit.enemy;
        spawnDamageNumber(target.x, target.y, p.damage);
        target.hurt = .12;
        p.life = 0;

        if (target.isBoss) {
          if ("bossKind" in target && target.bossKind === "spider") {
            pendingSpiderHits += 1;
            spiderHitBatchTimer = SPIDER_HIT_BATCH_DELAY;
          } else {
            pendingDragonHits += 1;
            dragonHitBatchTimer = DRAGON_HIT_BATCH_DELAY;
          }
        } else {
          engageEnemy(target);
          target.hp -= p.damage;
        }

        if (!target.isBoss && player.knockback > 0) {
          const ang = Math.atan2(p.vy, p.vx);
          const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
          target.vx += Math.cos(ang) * force;
          target.vy += Math.sin(ang) * force;
        }
        spawnBurst(p.x, p.y, "#fff0a1", 5, 52);
        if (!target.isBoss && target.hp <= 0) killEnemy(target);
      } else {
        p.x = endX;
        p.y = endY;
      }

      if (p.trail <= 0) {
        p.trail = .035;
        particles.push({
          x: p.x, y: p.y, vx: 0, vy: 0,
          life: .16, maxLife: .16, size: 3, color: "#ffd957"
        });
      }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].life <= 0) projectiles.splice(i, 1);
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && pendingDragonHits > 0) {
      dragonHitBatchTimer -= dt;
      if (dragonHitBatchTimer <= 0) {
        coop?.damageDragon?.(pendingDragonHits);
        pendingDragonHits = 0;
        dragonHitBatchTimer = 0;
      }
    }
    if (currentMapId === BEGINNER_DESERT_MAP_ID && pendingSpiderHits > 0) {
      spiderHitBatchTimer -= dt;
      if (spiderHitBatchTimer <= 0) {
        coop?.damageSpider?.(pendingSpiderHits);
        pendingSpiderHits = 0;
        spiderHitBatchTimer = 0;
      }
    }

    for (const p of enemyShots) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (circlesOverlap(p, player)) {
        damagePlayer(p.damage);
        p.life = 0;
      }
    }

    for (let i = enemyShots.length - 1; i >= 0; i--) {
      if (enemyShots[i].life <= 0) enemyShots.splice(i, 1);
    }
  }

  function fadeToWorld(onBlack: () => void) {
    if (duelExitFading) return;
    duelExitFading = true;
    sceneFadeEl.hidden = false;
    void sceneFadeEl.offsetWidth;
    sceneFadeEl.classList.add("is-visible");
    window.setTimeout(() => {
      onBlack();
      snapRuntimeCamera(camera, player, { width: viewW, height: viewH });
      requestAnimationFrame(() => {
        sceneFadeEl.classList.remove("is-visible");
        window.setTimeout(() => {
          sceneFadeEl.hidden = true;
          duelExitFading = false;
        }, 180);
      });
    }, 180);
  }

  function leaveDuelResult() {
    fadeToWorld(() => {
      duelResultEl.hidden = true;
      duelResultHold = false;
      heldDuelScene = null;
      if (duelReturnState) {
        player.x = duelReturnState.x;
        player.y = duelReturnState.y;
        player.facing = duelReturnState.facing;
      }
      duelReturnState = null;
      player.hp = player.maxHp;
      player.hurtClock = 0;
    });
  }

  function update(dt: number) {
    if (currentMapId === TUTORIAL_FOREST_MAP_ID) syncDragonState();
    if (currentMapId === BEGINNER_DESERT_MAP_ID) syncSpiderState();
    gameTime += dt;
    flash = Math.max(0, flash - dt);
    screenShake *= Math.pow(.01, dt);

    if (messageClock > 0) {
      messageClock -= dt;
      if (messageClock <= 0) messageEl.style.opacity = "0";
    }

    if (portalCutscene.active) {
      updatePortalCutscene(dt);
      updateHud();
      return;
    }

    updatePlayer(dt);
    if (!isDueling()) {
      updatePortal(dt);
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) updateBootPickup();
      updateEnemies(dt);
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) updateBoss(dt);
      if (currentMapId === BEGINNER_DESERT_MAP_ID) updateSpiderBoss(dt);
      updateProjectiles(dt);
      updateRespawns(gameTime);
    } else {
      projectiles.length = 0;
      pendingDragonHits = 0;
      dragonHitBatchTimer = 0;
      pendingSpiderHits = 0;
      spiderHitBatchTimer = 0;
      enemyShots.length = 0;
    }
    effects.update(dt);
    updateRuntimeCamera(camera, player, { width: viewW, height: viewH }, isDueling() ? DUEL_ARENA : null, dt);
    updateHud();
  }

  function drawActorShadow(x: number, y: number, width: number, alpha = .38) {
    const height = Math.max(8, Math.round(width * 33 / 86));
    ctx.save();
    ctx.globalAlpha = alpha;
    if (actorShadowSprite.complete && actorShadowSprite.naturalWidth > 0) {
      ctx.drawImage(
        actorShadowSprite,
        Math.round(x - width / 2),
        Math.round(y - height / 2),
        Math.round(width),
        height,
      );
    } else {
      ctx.fillStyle = "#102719";
      ctx.beginPath();
      ctx.ellipse(x, y, width / 2, height / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAttackRange() {
    if (!attackRangeVisible || isDueling()) return;
    const x = player.x - camera.x;
    const y = player.y - camera.y;
    ctx.save();
    ctx.strokeStyle = "rgba(104,180,212,.33)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 11]);
    ctx.beginPath();
    ctx.arc(x, y, player.attackRange, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawBootPickup() {
    if (bootsPickup.collected) return;

    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const x = Math.floor(bootsPickup.x - camera.x);
    const y = Math.floor(bootsPickup.y - camera.y);
    if (x < -40 || y < -40 || x > visibleW + 40 || y > visibleH + 40) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,206,76,.18)";
    pixelCircle(0, 0, 25);
    ctx.fillStyle = "#4b2919";
    ctx.fillRect(-15, -7, 11, 17);
    ctx.fillRect(4, -7, 11, 17);
    ctx.fillStyle = "#d58b32";
    ctx.fillRect(-14, -10, 10, 13);
    ctx.fillRect(5, -10, 10, 13);
    ctx.fillStyle = "#ffe47b";
    ctx.fillRect(-14, 5, 14, 6);
    ctx.fillRect(3, 5, 14, 6);
    ctx.restore();
  }

  function publicPlayerName(identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    const guestName = coop?.isGuest?.(identity) ? `${baseName} (guest)` : baseName;
    return isDeveloperIdentity(identity) ? `${DEVELOPER_BADGE} ${guestName}` : guestName;
  }

  function renderDomPlayerName(element: HTMLElement, identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    element.replaceChildren();
    if (isDeveloperIdentity(identity)) {
      const badge = document.createElement("span");
      badge.className = "dev-badge";
      badge.textContent = `${DEVELOPER_BADGE} `;
      element.appendChild(badge);
    }
    element.append(document.createTextNode(baseName));
    if (coop?.isGuest?.(identity)) element.append(document.createTextNode(" (guest)"));
  }

  function applyProfileIcon(element: HTMLElement, iconIndex: number) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const column = index % 8;
    const row = Math.floor(index / 8);
    const positionStep = PROFILE_PORTRAIT_ZOOM / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
    // These two surfaces are buttons, unlike chat portraits. Set the portrait
    // image directly so generic button styling or a late stylesheet refresh
    // cannot leave them blank while the same icon is visible elsewhere.
    element.style.backgroundImage = 'url("assets/wildwood/profile-portraits-grid-v2.png")';
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundSize = "824% 824%";
    element.style.backgroundPosition = `${PROFILE_PORTRAIT_POSITION_START + column * positionStep}% ${PROFILE_PORTRAIT_POSITION_START + row * positionStep}%`;
    element.dataset.profileIcon = String(index);
  }

  function paintProfileIconCanvas(canvas: HTMLCanvasElement, iconIndex: number) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const iconContext = canvas.getContext("2d");
    if (!iconContext) return;
    iconContext.clearRect(0, 0, canvas.width, canvas.height);
    if (!profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
    const cellWidth = profileIconSheet.naturalWidth / PROFILE_PORTRAIT_GRID;
    const cellHeight = profileIconSheet.naturalHeight / PROFILE_PORTRAIT_GRID;
    const insetX = cellWidth * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    const insetY = cellHeight * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    iconContext.imageSmoothingEnabled = antiAliasingEnabled;
    iconContext.drawImage(
      profileIconSheet,
      (index % PROFILE_PORTRAIT_GRID) * cellWidth + insetX,
      Math.floor(index / PROFILE_PORTRAIT_GRID) * cellHeight + insetY,
      cellWidth / PROFILE_PORTRAIT_ZOOM,
      cellHeight / PROFILE_PORTRAIT_ZOOM,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  function drawProfileIcon(identity: string | undefined, x: number, bottom: number, size = 15) {
    if (!identity || !profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
    const index = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(identity) ?? 0)));
    const cellW = profileIconSheet.naturalWidth / PROFILE_PORTRAIT_GRID;
    const cellH = profileIconSheet.naturalHeight / PROFILE_PORTRAIT_GRID;
    const insetX = cellW * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    const insetY = cellH * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = antiAliasingEnabled;
    ctx.drawImage(
      profileIconSheet,
      (index % PROFILE_PORTRAIT_GRID) * cellW + insetX, Math.floor(index / PROFILE_PORTRAIT_GRID) * cellH + insetY, cellW / PROFILE_PORTRAIT_ZOOM, cellH / PROFILE_PORTRAIT_ZOOM,
      Math.round(x), Math.round(bottom - size), size, size,
    );
    ctx.restore();
  }

  function updateSpeechBubbles() {
    const now = Date.now();
    const revision = coop?.chatRevision?.() ?? -1;
    if (revision === renderedSpeechBubbleRevision && now < nextSpeechBubbleExpiryAt) return;

    activeSpeechBubbles.clear();
    nextSpeechBubbleExpiryAt = Number.POSITIVE_INFINITY;
    const messages = coop?.chatMessages?.() ?? [];
    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const age = now - message.sentAtMs;
      if (age < 0 || age >= SPEECH_BUBBLE_DURATION_MS) continue;
      if (message.senderName === "DUEL" || message.replayId > 0n || activeSpeechBubbles.has(message.sender)) continue;
      const lines = wrapSpeechBubbleText(message.message, 190);
      const textWidth = Math.max(28, ...lines.map((line) => ctx.measureText(line).width));
      activeSpeechBubbles.set(message.sender, { text: message.message, sentAtMs: message.sentAtMs, lines, textWidth });
      nextSpeechBubbleExpiryAt = Math.min(nextSpeechBubbleExpiryAt, message.sentAtMs + SPEECH_BUBBLE_DURATION_MS);
    }
    ctx.restore();
    renderedSpeechBubbleRevision = revision;
  }

  function wrapSpeechBubbleText(text: string, maxWidth: number) {
    const lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (ctx.measureText(line).width > maxWidth) {
        let end = line.length - 1;
        while (end > 1 && ctx.measureText(line.slice(0, end)).width > maxWidth) end -= 1;
        lines.push(line.slice(0, end));
        line = line.slice(end);
      }
      if (lines.length >= 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    if (lines.length === 3 && text.length > lines.join(" ").length) {
      while (lines[2].length > 1 && ctx.measureText(`${lines[2]}…`).width > maxWidth) lines[2] = lines[2].slice(0, -1);
      lines[2] += "…";
    }
    return lines;
  }

  function drawSpeechBubble(identity: string | undefined, x: number, y: number) {
    if (!identity) return;
    const bubble = activeSpeechBubbles.get(identity);
    if (!bubble) return;
    const age = Date.now() - bubble.sentAtMs;
    const fadeStart = SPEECH_BUBBLE_DURATION_MS - SPEECH_BUBBLE_FADE_MS;
    const opacity = age <= fadeStart
      ? 1
      : clamp(1 - (age - fadeStart) / SPEECH_BUBBLE_FADE_MS, 0, 1);
    const paddingX = 10;
    const paddingY = 7;
    const lineHeight = 15;

    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const width = Math.ceil(bubble.textWidth + paddingX * 2);
    const height = bubble.lines.length * lineHeight + paddingY * 2;
    const visibleWidth = viewW / camera.zoom;
    const centerX = clamp(x, width / 2 + 4, visibleWidth - width / 2 - 4);
    const bottom = Math.max(height + 8, y - 108);
    const left = Math.round(centerX - width / 2);
    const top = Math.round(bottom - height);

    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#f4f0df";
    ctx.strokeStyle = "#171b18";
    ctx.lineWidth = 2;
    roundRect(left, top, width, height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6, bottom - 1);
    ctx.lineTo(centerX, bottom + 7);
    ctx.lineTo(centerX + 6, bottom - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#20251f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    bubble.lines.forEach((line, index) => {
      fillWorldText(line, centerX, top + paddingY + lineHeight * (index + .5));
    });
    ctx.restore();
  }

  function drawActorStatus({ x, y, identity, name, nameColor, hp, maxHp, power, fillColor }: ActorStatus) {
    ctx.save();
    ctx.globalAlpha = 1;
    const centerX = Math.round(x);
    const barW = 94;
    const barH = WORLD_HEALTH_BAR_HEIGHT;
    const barX = centerX - Math.floor(barW / 2);
    const barY = Math.round(y - 54);
    const hpRatio = clamp(hp / maxHp, 0, 1);
    const fillWidth = Math.round(barW * hpRatio);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(hp)))} / ${formatCompactNumber(Math.ceil(maxHp))}`;

    ctx.fillStyle = "rgba(0,0,0,.88)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#402326";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, fillWidth, barH);
    if (fillWidth > 0) {
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(barX, barY, fillWidth, 1);
    }

    ctx.save();
    ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedWorldText(hpLabel, centerX, barY + barH / 2, "#ffffff", 2);
    ctx.restore();

    drawPlayerIdentity(identity, name, power, centerX, barY - 7, nameColor);
    ctx.restore();
  }

  function drawPlayerIdentity(_identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string) {
    if (!name) return;
    const powerValue = power === null ? "" : formatCompactNumber(power);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "bottom";
    const nameWidth = ctx.measureText(name).width;
    const textLeft = Math.round(centerX - nameWidth / 2);
    const nameBottom = powerValue ? bottom - 18 : bottom;
    const developerPrefix = `${DEVELOPER_BADGE} `;
    if (name.startsWith(developerPrefix)) {
      const playerName = name.slice(developerPrefix.length);
      const prefixWidth = ctx.measureText(developerPrefix).width;
      ctx.textAlign = "left";
      outlinedWorldText(developerPrefix, textLeft, nameBottom, "#ffd85b", 2);
      outlinedWorldText(playerName, textLeft + prefixWidth, nameBottom, color, 2);
    } else {
      ctx.textAlign = "center";
      outlinedWorldText(name, centerX, nameBottom, color, 2);
    }
    if (powerValue) {
      const powerName = "Power:";
      const powerNameWidth = ctx.measureText(powerName).width;
      const powerValueWidth = ctx.measureText(` ${powerValue}`).width;
      const left = Math.round(centerX - (powerNameWidth + powerValueWidth) / 2);
      ctx.textAlign = "left";
      outlinedWorldText(powerName, left, bottom, "#ffe05d", 2);
      outlinedWorldText(` ${powerValue}`, left + powerNameWidth, bottom, "#ffffff", 2);
    }
    ctx.restore();
  }

  function playerPower(stats: Pick<PlayerState, "attackRate" | "damage" | "maxHp" | "armor" | "regen">) {
    const attackSpeedMultiplier = STARTING_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
    return Math.min(0xffffffff, Math.round(
      stats.damage * attackSpeedMultiplier +
      stats.maxHp +
      stats.armor * 3 +
      stats.regen * 10,
    ));
  }

  function drawDepthSortedWorld(remotePlayers: RemotePlayer[], includePortal = true) {
    let layerCount = 0;
    const queueLayer = (depth: number, priority: number, kind: DepthLayerKind, entity?: WorldDecor | EnemyState | RemotePlayer) => {
      const layer = depthLayers[layerCount] ?? (depthLayers[layerCount] = { depth: 0, priority: 0, kind });
      layer.depth = depth;
      layer.priority = priority;
      layer.kind = kind;
      layer.entity = entity;
      layerCount += 1;
    };
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const treeCullPadding = 240;
    for (const tree of decor) {
      if (tree.type === "cactus") {
        queueLayer(tree.y, 2, "cactus", tree);
        continue;
      }
      if (tree.type !== "tree") continue;
      const treeSize = Math.round(154 * tree.s);
      const treeHalfWidth = treeSize / 2;
      if (
        tree.x + treeHalfWidth < camera.x - treeCullPadding ||
        tree.x - treeHalfWidth > camera.x + visibleW + treeCullPadding ||
        tree.y < camera.y - treeCullPadding ||
        tree.y - treeSize > camera.y + visibleH + treeCullPadding
      ) continue;
      queueLayer(tree.y, 2, "tree", tree);
    }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      queueLayer(enemy.y + enemy.r, 1, "enemy", enemy);
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !boss.dead) {
      queueLayer(boss.y + 93, 1, "dragon");
    }
    if (currentMapId === BEGINNER_DESERT_MAP_ID && !spiderBoss.dead) {
      queueLayer(spiderBoss.y + 55, 1, "spider");
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !bootsPickup.collected) {
      queueLayer(bootsPickup.y + bootsPickup.r, 1, "boots");
    }
    if (includePortal) queueLayer(activePortal().depth, 2, "portal");
    const secondary = secondaryPortal();
    if (secondary) queueLayer(secondary.depth, 2, "secondaryPortal");
    for (const remotePlayer of remotePlayers) {
      queueLayer(remotePlayer.y + 29, 1, "remotePlayer", remotePlayer);
    }
    queueLayer(player.y + 29, 1, "player");
    depthLayers.length = layerCount;
    depthLayers.sort((a, b) => a.depth - b.depth || a.priority - b.priority);
    for (const layer of depthLayers) {
      switch (layer.kind) {
        case "tree": drawTree(layer.entity as TreeDecor); break;
        case "cactus": drawCactus(layer.entity as CactusDecor); break;
        case "enemy": drawEnemy(layer.entity as EnemyState); break;
        case "dragon": drawBoss(); break;
        case "spider": drawSpiderBoss(); break;
        case "boots": drawBootPickup(); break;
        case "portal": drawPortal(); break;
        case "secondaryPortal": drawSecondaryPortal(); break;
        case "remotePlayer": drawRemotePlayer(layer.entity as RemotePlayer); break;
        case "player":
          drawPlayerActor(
            coop?.localIdentity?.(),
            publicPlayerName(coop?.localIdentity?.(), coop?.localDisplayName?.()),
            playerPower(player),
          );
          break;
      }
    }
  }

  function duelCameraPosition() {
    const zoom = Math.min(1, Math.max(.65, Math.min(viewW, viewH) / 820));
    camera.zoom = zoom;
    camera.x = DUEL_ARENA.x - viewW / zoom / 2;
    camera.y = DUEL_ARENA.y - viewH / zoom / 2;
  }

  function liveDuelScene(remotePlayers: RemotePlayer[]): DuelScene | null {
    const duel = activeDuel();
    if (!duel) return null;
    const presentation = liveDuelPresentationState(duel);
    const localId = coop?.localIdentity?.();
    const remoteName = (identity: string) => {
      const visible = remotePlayers.find((other) => other.id === identity)?.name;
      return visible || coop?.playerDisplayName?.(identity) || "OPPONENT";
    };
    const actor = (identity: string, isChallenger: boolean): DuelScene["challenger"] => ({
      identity,
      x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
      y: DUEL_COMBAT_Y,
      name: identity === localId ? (coop?.localDisplayName?.() || "PLAYER") : remoteName(identity),
      hp: duel.status === "finishing"
        ? isChallenger ? duel.challengerHp : duel.opponentHp
        : isChallenger ? presentation.state.challengerHp : presentation.state.opponentHp,
      maxHp: isChallenger ? duel.challengerMaxHp : duel.opponentMaxHp,
      facing: isChallenger ? 0 : Math.PI,
      isLocal: identity === localId,
    });
    return {
      challenger: actor(duel.challenger, true),
      opponent: actor(duel.opponent, false),
      shots: liveDuelShots(duel, presentation),
      countdown: Date.now() < duel.startsAtMs
        ? Math.max(1, Math.ceil((duel.startsAtMs - Date.now()) / 1000))
        : 0,
    };
  }

  function timelineDuelShots(duel: RuntimeDuelState | RuntimeDuelReplay, elapsed: number, limits: Pick<RuntimeDuelState, "challengerAttacks" | "opponentAttacks">) {
    return duelShotsAt({
      challengerAttackRate: duel.challengerAttackRate,
      opponentAttackRate: duel.opponentAttackRate,
      challengerAttacks: limits.challengerAttacks,
      opponentAttacks: limits.opponentAttacks,
    }, elapsed, {
      shotLifetime: DUEL_SHOT_LIFETIME,
      shotSpeed: DUEL_SHOT_SPEED,
      challengerFromX: DUEL_ARENA.x - 120,
      opponentFromX: DUEL_ARENA.x + 120,
      y: DUEL_COMBAT_Y,
    });
  }

  function liveDuelShots(duel: RuntimeDuelState, presentation = liveDuelPresentationState(duel)) {
    return timelineDuelShots(duel, presentation.elapsed, presentation.state);
  }

  function replayDuelShots(replay: RuntimeDuelReplay, elapsed: number) {
    return timelineDuelShots(replay, elapsed, {
      challengerAttacks: replay.challengerAttacks,
      opponentAttacks: replay.opponentAttacks,
    });
  }

  function replayDuelScene() {
    if (!replayMode) return null;
    const replay = replayMode.replay;
    const totalElapsed = Math.max(0, (performance.now() - replayMode.start) / 1000);
    const countdown = Math.max(0, Math.ceil(DUEL_REPLAY_COUNTDOWN_SECONDS - totalElapsed));
    const elapsed = Math.min(replay.durationSeconds, Math.max(0, totalElapsed - DUEL_REPLAY_COUNTDOWN_SECONDS));
    const state = replayState(replay, elapsed);
    if (elapsed >= replayMode.lastElapsed) {
      const challengerDamage = replayMode.lastState.challengerHp - state.challengerHp;
      const opponentDamage = replayMode.lastState.opponentHp - state.opponentHp;
      if (challengerDamage > .01) spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
    }
    replayMode.lastElapsed = elapsed;
    replayMode.lastState = {
      challengerHp: state.challengerHp,
      opponentHp: state.opponentHp,
    };
    const actor = (isChallenger: boolean): DuelScene["challenger"] => ({
      identity: isChallenger ? replay.challengerIdentity : replay.opponentIdentity,
      x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
      y: DUEL_COMBAT_Y,
      name: isChallenger ? replay.challengerName : replay.opponentName,
      hp: isChallenger ? state.challengerHp : state.opponentHp,
      maxHp: isChallenger ? replay.challengerMaxHp : replay.opponentMaxHp,
      facing: isChallenger ? 0 : Math.PI,
      isLocal: false,
    });
    duelReplayTitle.textContent = countdown > 0
      ? `${replay.challengerName} VS ${replay.opponentName}`
      : `${replay.challengerName} VS ${replay.opponentName} · ${elapsed.toFixed(1)} / ${replay.durationSeconds.toFixed(1)}s`;
    return {
      challenger: actor(true),
      opponent: actor(false),
      shots: countdown > 0 ? [] : replayDuelShots(replay, elapsed),
      countdown,
    };
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(viewW/2, viewH/2, Math.min(viewW,viewH)*.25, viewW/2, viewH/2, Math.max(viewW,viewH)*.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.33)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function renderDuelScene(scene: DuelScene) {
    renderedDuelScene = scene;
    duelCameraPosition();
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    drawGround();
    const floatY = Math.sin(performance.now() / 1000 * 1.2) * 7;
    ctx.save();
    ctx.translate(0, floatY);
    drawDuelArenaVisual(true, DUEL_ARENA);
    drawDuelScene(scene);
    effects.drawDamageNumbers(ctx, camera, outlinedWorldText);
    ctx.restore();
    ctx.restore();
    duelCountdownEl.textContent = String(scene.countdown || "");
    duelCountdownEl.hidden = !scene.countdown;
    drawVignette();
  }

  function render() {
    textCtx.setTransform(1, 0, 0, 1, 0, 0);
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    drawProfileCharacterPreview();
    const remotePlayers = coop ? coop.remotePlayers() : [];
    updateSpeechBubbles();
    if (replayMode) {
      const scene = replayDuelScene();
      if (scene) renderDuelScene(scene);
      return;
    }
    if (duelResultHold && heldDuelScene) {
      renderDuelScene(heldDuelScene);
      return;
    }
    if (isDueling()) {
      const scene = liveDuelScene(remotePlayers);
      if (scene) renderDuelScene(scene);
      return;
    }
    renderedDuelScene = null;
    ctx.save();

    const sx = screenShakeEnabled && screenShake > .2 ? rand(-screenShake, screenShake) : 0;
    const sy = screenShakeEnabled && screenShake > .2 ? rand(-screenShake, screenShake) : 0;
    ctx.translate(sx, sy);
    ctx.scale(camera.zoom, camera.zoom);

    drawStaticWorld();
    drawDuelArenaVisual(isArenaScene(), DUEL_ARENA);
    if (!isDueling()) drawDecor();
    if (!isDueling() && currentMapId === TUTORIAL_FOREST_MAP_ID) drawBossTelegraphs();
    if (!isDueling() && currentMapId === BEGINNER_DESERT_MAP_ID) drawSpiderTelegraphs();
    drawAttackRange();

    for (const p of projectiles) drawProjectile(p, false);
    for (const p of enemyShots) drawProjectile(p, true);
    const portalCutsceneActive = portalCutscene.active;
    effects.drawDamageNumbers(ctx, camera, outlinedWorldText);
    drawDepthSortedWorld(remotePlayers, !portalCutsceneActive);
    effects.drawParticles(ctx, camera);

    ctx.restore();

    if (!isDueling() && !portalCutsceneActive) {
      drawMinimap(remotePlayers);
      clearFloatingTextFromMinimap();
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,55,40,${flash * .75})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    drawVignette();
    if (portalCutsceneActive) {
      ctx.fillStyle = `rgba(0,0,0,${portalCutsceneBlackoutOpacity})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.scale(camera.zoom, camera.zoom);
      drawPortal();
      ctx.restore();
    }
  }

  function clearFloatingTextFromMinimap() {
    const size = Math.min(126, Math.max(118, viewW * .17));
    const x = viewW - size;
    textCtx.setTransform(1, 0, 0, 1, 0, 0);
    textCtx.clearRect(Math.floor((x - 3) * dpr), 0, Math.ceil((size + 3) * dpr), Math.ceil((size + 3) * dpr));
  }

  function updateHud(force = false) {
    const now = performance.now();
    if (!force && now < nextHudUpdateAt) return;
    nextHudUpdateAt = now + 100;
    const remoteCount = coop && typeof coop.remotePlayerCount === "function"
      ? coop.remotePlayerCount()
      : coop
        ? coop.remotePlayers().length
        : 0;
    const reportedOnline = coop && typeof coop.onlinePlayerCount === "function"
      ? coop.onlinePlayerCount()
      : null;
    const playerCount = coop && coop.isConnected()
      ? (Number.isFinite(reportedOnline) ? reportedOnline ?? remoteCount + 1 : remoteCount + 1)
      : 0;
    const developer = isDeveloperIdentity(coop?.localIdentity?.());
    applyProfileIcon(playerHudProfileIcon, coop?.profileIcon?.() ?? 0);
    devAuditBtn.hidden = !developer;
    if (!developer && !devAuditEl.hidden) closeDevAudit();
    renderPlayerHud(
      { hpFill, hpText, playerName: playerNameEl, playerPower: playerPowerEl, coopStatus: coopStatusEl },
      player,
      coop?.isGuest?.(coop?.localIdentity?.())
        ? `${coop?.localDisplayName?.() || "WANDERER"} (guest)`
        : coop?.localDisplayName?.() || "WANDERER",
      playerCount,
      playerPower(player),
      developer,
    );
    updateDuelControls();
    updateConnectionStatus();
    updateAccountStatus();
    updateLatencyStatus();
  }

  function isProfileOnline(identity: string) {
    if (identity === coop?.localIdentity?.()) return Boolean(coop?.isConnected?.());
    return Boolean(coop?.activePlayerMap?.(identity)) ||
      coop?.remotePlayers?.().some((other) => other.id === identity) === true;
  }

  function setProfileTab(tab: "overview" | "stats") {
    const overview = tab === "overview";
    profileOverviewTab.classList.toggle("is-active", overview);
    profileStatsTab.classList.toggle("is-active", !overview);
    profileOverviewTab.setAttribute("aria-selected", String(overview));
    profileStatsTab.setAttribute("aria-selected", String(!overview));
    profileOverviewPanel.hidden = !overview;
    profileStatsPanel.hidden = overview;
  }

  function renderProfileLeaderboardStats(identity: string) {
    const entries = coop?.leaderboardEntries?.() ?? [];
    const stats: Array<{ id: string; label: string; key: keyof LeaderboardEntry }> = [
      { id: "power", label: "POWER", key: "power" },
      { id: "damage", label: "DAMAGE", key: "damage" },
      { id: "health", label: "HEALTH", key: "maxHp" },
      { id: "armor", label: "ARMOR", key: "armor" },
      { id: "regen", label: "REGEN", key: "regen" },
      { id: "time", label: "TIME", key: "playedSeconds" },
    ];
    const badges: HTMLElement[] = [];
    for (const stat of stats) {
      const sorted = entries
        .filter((entry) => Number.isFinite(entry[stat.key] as number))
        .sort((a, b) => Number(b[stat.key]) - Number(a[stat.key]) || a.name.localeCompare(b.name));
      const rank = sorted.findIndex((entry) => entry.identity === identity) + 1;
      if (rank < 1 || rank > 10) continue;
      const badge = document.createElement("span");
      badge.className = `profile-leaderboard-stat profile-leaderboard-${stat.id}`;
      const label = document.createElement("span");
      label.className = "profile-leaderboard-label";
      label.textContent = `${stat.label} `;
      const rankLabel = document.createElement("span");
      rankLabel.className = "profile-leaderboard-value";
      rankLabel.textContent = `#${rank}`;
      badge.append(label, rankLabel);
      badges.push(badge);
    }
    if (badges.length) {
      const heading = document.createElement("span");
      heading.className = "profile-leaderboard-heading";
      heading.textContent = "LEADERBOARD:";
      profileLeaderboardStatsEl.replaceChildren(heading, ...badges);
    } else {
      profileLeaderboardStatsEl.replaceChildren();
    }
    profileLeaderboardStatsEl.hidden = badges.length === 0;
  }

  function renderPlayerProfile(profile: PlayerProfile | null) {
    if (!profile || profile.identity !== openProfileIdentity) return;
    const { progress, lifetime } = profile;
    openProfileData = profile;
    const online = isProfileOnline(profile.identity);
    const mapName = profile.mapId === BEGINNER_DESERT_MAP_ID
      ? "BEGINNER DESERT"
      : profile.mapId === INTERMEDIATE_SNOWLANDS_MAP_ID
        ? "INTERMEDIATE SNOWLANDS"
      : profile.mapId === TUTORIAL_FOREST_MAP_ID ? "TUTORIAL FOREST" : "";
    const presenceText = online && mapName
      ? `ONLINE - ${mapName}`
      : profilePresenceText(online, lifetime.sessionStartedAtMs);
    const activeSeconds = online ? Math.max(0, (Date.now() - lifetime.sessionStartedAtMs) / 1000) : 0;
    const power = playerPower(progress);
    renderDomPlayerName(playerProfileNameEl, profile.identity, profile.name);
    playerProfilePresenceEl.textContent = presenceText;
    playerProfilePresenceEl.classList.toggle("is-online", online);
    applyProfileIcon(playerProfileIcon, coop?.profileIcon?.(profile.identity) ?? 0);
    const ownProfile = profile.identity === coop?.localIdentity?.();
    playerProfileIcon.classList.toggle("is-editable", ownProfile);
    playerProfileIcon.disabled = !ownProfile;
    playerProfileIcon.setAttribute("aria-label", ownProfile ? "Choose profile icon" : `${profile.name}'s profile icon`);
    editPlayerNameBtn.hidden = !ownProfile;
    updateProfileCharacterPreview(profile.identity, ownProfile);
    renderProfileLeaderboardStats(profile.identity);
    renderPower(playerProfilePowerEl, formatCompactNumber(power));
    profileDuelBtn.hidden = ownProfile;
    profileDuelBtn.dataset.identity = ownProfile ? "" : profile.identity;
    updateProfileDuelButton();
    profileJoinedEl.textContent = new Date(lifetime.joinedAtMs).toLocaleDateString([], {
      year: "numeric", month: "short", day: "numeric",
    });
    profileTimePlayedEl.textContent = formatPlayedTime(lifetime.playedSeconds + activeSeconds);
    profileKillsEl.textContent = Math.round(lifetime.enemyKills).toLocaleString();
    profileOnlineEl.textContent = presenceText;
    profileOnlineEl.style.color = online ? "#72ef58" : "#b7c5b7";

    renderProfileStats(profile, profileStatGrid, formatArmorReduction, MIN_ATTACK_INTERVAL);
    playerProfileLoadingEl.hidden = true;
    editPlayerSaveBtn.hidden = !isDeveloperIdentity(coop?.localIdentity?.());
    profileOverviewPanel.hidden = !profileOverviewTab.classList.contains("is-active");
    profileStatsPanel.hidden = !profileStatsTab.classList.contains("is-active");
  }

  async function openPlayerProfile(identity: string, fallbackName = "PLAYER") {
    if (!identity) return;
    openProfileIdentity = identity;
    openProfileData = null;
    profileEditPanel.hidden = true;
    editPlayerSaveBtn.hidden = true;
    profileDuelBtn.hidden = identity === coop?.localIdentity?.();
    profileDuelBtn.dataset.identity = identity;
    updateProfileDuelButton();
    playerProfileEl.hidden = false;
    renderDomPlayerName(playerProfileNameEl, identity, fallbackName);
    const online = isProfileOnline(identity);
    playerProfilePresenceEl.textContent = online ? "ONLINE" : "CHECKING LAST SEEN";
    playerProfilePresenceEl.classList.toggle("is-online", online);
    applyProfileIcon(playerProfileIcon, coop?.profileIcon?.(identity) ?? 0);
    playerProfileIcon.classList.toggle("is-editable", identity === coop?.localIdentity?.());
    playerProfileIcon.disabled = identity !== coop?.localIdentity?.();
    editPlayerNameBtn.hidden = identity !== coop?.localIdentity?.();
    updateProfileCharacterPreview(identity, identity === coop?.localIdentity?.());
    renderPower(playerProfilePowerEl, "—");
    playerProfileLoadingEl.hidden = false;
    profileOverviewPanel.hidden = true;
    profileStatsPanel.hidden = true;
    setProfileTab("stats");
    profileStatsPanel.hidden = true;
    const cached = coop?.playerProfile?.(identity);
    if (cached) {
      renderPlayerProfile(cached);
      return;
    }
    const loaded = await coop?.loadPlayerProfile?.(identity);
    if (identity !== openProfileIdentity) return;
    if (loaded) renderPlayerProfile(loaded);
    else playerProfileLoadingEl.textContent = "PLAYER DATA UNAVAILABLE";
  }

  function closePlayerProfile() {
    closeProfileNameEditor();
    profileSkinToneControl.hidden = true;
    playerProfileEl.hidden = true;
    openProfileIdentity = "";
    openProfileData = null;
    profileEditPanel.hidden = true;
    playerProfileLoadingEl.textContent = "LOADING PLAYER…";
    coop?.releasePlayerProfile?.();
  }

  function updateProfileCharacterPreview(identity: string, ownProfile: boolean) {
    const profileChanged = profileCharacterPreviewEl.dataset.identity !== identity;
    profileCharacterPreviewEl.dataset.identity = identity;
    previousPlayerSpriteBtn.hidden = true;
    nextPlayerSpriteBtn.hidden = true;
    profileSkinToneEdit.hidden = !ownProfile;
    if (!ownProfile || profileChanged) profileSkinToneControl.hidden = true;
    if (ownProfile) updateProfileSkinToneChoices(coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE);
    drawProfileCharacterPreview();
  }

  function updateProfileSkinToneChoices(value: number) {
    profileSkinToneControl.querySelectorAll<HTMLButtonElement>(".profile-skin-tone-choice").forEach((choice) => {
      choice.setAttribute("aria-pressed", String(Number(choice.dataset.skinTone) === value));
    });
  }

  function drawProfileCharacterPreview() {
    if (playerProfileEl.hidden) return;
    resizeProfileCharacterCanvas();
    const identity = profileCharacterPreviewEl.dataset.identity;
    const previewProgress = openProfileData && openProfileData.identity === identity ? openProfileData.progress : null;
    const width = Math.max(1, Math.round(profileCharacterCanvas.clientWidth));
    const height = Math.max(1, Math.round(profileCharacterCanvas.clientHeight));
    const now = performance.now();
    profileCharacterCtx.clearRect(0, 0, width, height);
    profileCharacterCtx.fillStyle = "#31945b";
    profileCharacterCtx.fillRect(0, 0, width, height);
    for (let index = 0; index < 18; index += 1) {
      const random = (seed: number) => {
        const value = Math.sin(seed * 12.9898) * 43758.5453;
        return value - Math.floor(value);
      };
      const x = 8 + random(index + 1) * Math.max(1, width - 16);
      const y = height + 7 - ((now * .025 + random(index + 29) * (height + 18)) % (height + 18));
      profileCharacterCtx.fillStyle = index % 2 ? "#237b49" : "#267f4c";
      profileCharacterCtx.fillRect(Math.floor(x - 1), Math.floor(y - 5), 2, 7);
      profileCharacterCtx.fillRect(Math.floor(x - 5), Math.floor(y - 2), 2, 5);
      profileCharacterCtx.fillRect(Math.floor(x + 3), Math.floor(y - 3), 2, 6);
      if (index % 4 > 1) profileCharacterCtx.fillRect(Math.floor(x + 6), Math.floor(y), 2, 3);
    }
    profileCharacterCtx.imageSmoothingEnabled = false;
    drawStartingPlayer(profileCharacterCtx, playerAppearanceAssets, {
      x: width / 2,
      y: 47,
      facing: 0,
      moving: true,
      gameTime: now / 1000,
      skinTone: coop?.skinTone?.(identity) ?? DEFAULT_SKIN_TONE,
      headItem: previewProgress?.equippedHead,
      chestItem: previewProgress?.equippedChest,
      feetItem: previewProgress?.equippedFeet,
      scale: .6,
    });
    const vignette = profileCharacterCtx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .25, width / 2, height / 2, Math.max(width, height) * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.33)");
    profileCharacterCtx.fillStyle = vignette;
    profileCharacterCtx.fillRect(0, 0, width, height);
  }

  function resizeProfileCharacterCanvas() {
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(profileCharacterCanvas.clientWidth));
    const height = Math.max(1, Math.round(profileCharacterCanvas.clientHeight));
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (profileCharacterCanvas.width === pixelWidth && profileCharacterCanvas.height === pixelHeight) return false;
    profileCharacterCanvas.width = pixelWidth;
    profileCharacterCanvas.height = pixelHeight;
    profileCharacterCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    profileCharacterCtx.imageSmoothingEnabled = false;
    return true;
  }

  new ResizeObserver(() => {
    if (resizeProfileCharacterCanvas()) drawProfileCharacterPreview();
  }).observe(profileCharacterCanvas);

  function selectProfileCharacter(_direction: -1 | 1) {
    // Character swaps are replaced by the modular appearance selector.
  }

  function renderPower(element: HTMLElement, value: string) {
    const label = document.createElement("span");
    label.className = "power-label";
    label.textContent = "Power:";
    const number = document.createElement("span");
    number.className = "power-value";
    number.textContent = value;
    element.replaceChildren(label, " ", number);
  }

  function openProfileNameEditor() {
    if (!openProfileIdentity || openProfileIdentity !== coop?.localIdentity?.()) return;
    profileNameInput.value = coop?.localDisplayName?.() || "";
    profileNameEditorEl.hidden = false;
    requestAnimationFrame(() => {
      profileNameInput.focus();
      profileNameInput.select();
    });
  }

  function closeProfileNameEditor() {
    profileNameEditorEl.hidden = true;
  }

  async function saveProfileName(event: SubmitEvent) {
    event.preventDefault();
    const name = profileNameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
      showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
      return;
    }
    if (name === (coop?.localDisplayName?.() || "")) {
      showMessage("NAME ALREADY SET", "#bce7ff");
      return;
    }
    if (coop?.isDisplayNameTaken?.(name)) {
      showMessage("NAME TAKEN · TRY ANOTHER", "#ff9b91");
      return;
    }
    savePlayerNameBtn.disabled = true;
    const result = await coop?.setDisplayName?.(name);
    savePlayerNameBtn.disabled = false;
    if (result?.ok) {
      closeProfileNameEditor();
      showMessage("NAME UPDATED", "#c9f5c2");
      return;
    }
    if (/already taken/i.test(result?.error ?? "")) {
      showMessage("NAME TAKEN · TRY ANOTHER", "#ff9b91");
      return;
    }
    if (/once every 30 days/i.test(result?.error ?? "")) {
      showMessage("NAME LOCKED · CHANGES EVERY 30 DAYS", "#ff9b91");
      return;
    }
    showMessage("NAME UPDATE FAILED", "#ff9b91");
  }

  function updateProfileDuelButton() {
    if (!profileDuelBtn || profileDuelBtn.hidden) return;
    const remainingMs = coop?.duelCooldownRemainingMs?.() || 0;
    const remainingSeconds = Math.ceil(remainingMs / 1_000);
    const active = isDueling();
    profileDuelBtn.disabled = active || remainingSeconds > 0;
    profileDuelBtn.classList.toggle("is-cooling-down", remainingSeconds > 0);
    profileDuelBtn.textContent = active
      ? "DUEL IN PROGRESS"
      : remainingSeconds > 0
        ? `DUEL · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`
        : "DUEL";
  }

  function renderLeaderboard() {
    renderLeaderboardView(
      { rows: leaderboardRowsEl, empty: leaderboardEmptyEl },
      leaderboardStat,
      coop?.leaderboardEntries?.() ?? [],
      coop?.localIdentity?.() || "",
      {
        isDeveloper: isDeveloperIdentity,
        paintProfileIcon: (canvas, identity) => paintProfileIconCanvas(canvas, coop?.profileIcon?.(identity) ?? 0),
        openProfile(identity, name) {
          closeLeaderboard();
          void openPlayerProfile(identity, name);
        },
      },
    );
  }

  function setLeaderboardTab(tab: string) {
    leaderboardStat = setLeaderboardTabView({
      tabs: {
        power: leaderboardPowerTab,
        damage: leaderboardDamageTab,
        health: leaderboardHealthTab,
        armor: leaderboardArmorTab,
        regen: leaderboardRegenTab,
        time: leaderboardTimeTab,
      },
      rows: leaderboardRowsEl,
      empty: leaderboardEmptyEl,
      valueHeading: leaderboardValueHeading,
    }, tab);
    renderLeaderboard();
  }

  function openLeaderboard() {
    closeDevAudit();
    leaderboardEl.hidden = false;
    leaderboardBtn.setAttribute("aria-expanded", "true");
    settingsPanel.hidden = true;
    inventoryPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
    inventoryBtn.setAttribute("aria-expanded", "false");
    setLeaderboardTab(leaderboardStat);
  }

  function closeLeaderboard() {
    leaderboardEl.hidden = true;
    leaderboardBtn.setAttribute("aria-expanded", "false");
  }

  function renderDevBugReports() {
    const entries = (coop?.bugReportEntries?.() ?? [])
      .sort((a, b) => b.reportedAtMs - a.reportedAtMs || Number(b.id - a.id));
    devBugReportRowsEl.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "dev-bug-report";
      const content = document.createElement("div");
      const meta = document.createElement("div");
      meta.className = "dev-bug-report-meta";
      meta.textContent = `[${new Date(entry.reportedAtMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}] ${entry.reporterName} · P${entry.protocolVersion}`;
      const message = document.createElement("div");
      message.className = "dev-bug-report-message";
      message.textContent = `> ${entry.message}`;
      content.append(meta, message);
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "dev-bug-report-clear";
      clear.textContent = "CLEAR";
      clear.addEventListener("click", async () => {
        clear.disabled = true;
        const result = await coop?.deleteBugReport?.(entry.id);
        if (!result?.ok) {
          clear.disabled = false;
          showMessage(result?.error || "BUG REPORT DELETE FAILED", "#ff9b91");
        }
      });
      row.append(content, clear);
      devBugReportRowsEl.appendChild(row);
    }
    devBugReportEmptyEl.hidden = entries.length > 0;
    devBugReportRowsEl.hidden = entries.length === 0;
  }

  function setDevPanelTab(tab: "controls" | "bugs" | "cutscenes" | "performance") {
    const controls = tab === "controls";
    const bugs = tab === "bugs";
    const cutscenes = tab === "cutscenes";
    const performance = tab === "performance";
    devControlsTab.classList.toggle("is-active", controls);
    devControlsTab.setAttribute("aria-selected", String(controls));
    devBugReportsTab.classList.toggle("is-active", bugs);
    devBugReportsTab.setAttribute("aria-selected", String(bugs));
    devCutscenesTab.classList.toggle("is-active", cutscenes);
    devCutscenesTab.setAttribute("aria-selected", String(cutscenes));
    devPerformanceTab.classList.toggle("is-active", performance);
    devPerformanceTab.setAttribute("aria-selected", String(performance));
    devControlsPanel.hidden = !controls;
    devBugReportsPanel.hidden = !bugs;
    devCutscenesPanel.hidden = !cutscenes;
    devPerformancePanel.hidden = !performance;
    if (controls) renderDevControls();
    if (bugs) renderDevBugReports();
    if (performance) renderPerformancePanel();
  }

  function renderDevControls() {
    const visible = coop?.developerPresenceVisible?.() === true;
    devPresenceStatusEl.textContent = visible ? "VISIBLE · COUNTED ONLINE" : "INVISIBLE · NOT COUNTED ONLINE";
    devPresenceToggleBtn.textContent = visible ? "GO INVISIBLE" : "APPEAR ONLINE";
    devPresenceToggleBtn.setAttribute("aria-pressed", String(visible));
  }

  function setPerformanceValue(element: HTMLElement, value: string) {
    if (element.textContent !== value) element.textContent = value;
  }

  function renderPerformancePanel() {
    if (devPerformancePanel.hidden) return;
    const snapshot = performanceMonitor.snapshot();
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const megabytes = memory ? `${(memory.usedJSHeapSize / 1_048_576).toFixed(1)} MB` : "UNAVAILABLE";
    const subscriptionCount = coop?.subscriptionCount?.() ?? 0;
    setPerformanceValue(perfFpsEl, `${snapshot.fps} FPS`);
    setPerformanceValue(perfFrameP50El, `${snapshot.frameP50Ms.toFixed(1)} ms`);
    setPerformanceValue(perfFrameP95El, `${snapshot.frameP95Ms.toFixed(1)} ms`);
    setPerformanceValue(perfFrameWorstEl, `${snapshot.worstFrameMs.toFixed(1)} ms`);
    setPerformanceValue(perfLongFramesEl, `${snapshot.longFrames} · ${snapshot.longestFrameMs.toFixed(0)} ms`);
    setPerformanceValue(perfRenderMsEl, `${snapshot.renderMs.toFixed(1)} ms`);
    setPerformanceValue(perfScriptMsEl, `${snapshot.updateMs.toFixed(1)} ms`);
    setPerformanceValue(perfEnemiesEl, String(enemies.length));
    setPerformanceValue(perfProjectilesEl, String(projectiles.length + enemyShots.length));
    setPerformanceValue(perfParticlesEl, String(particles.length));
    setPerformanceValue(perfRemotePlayersEl, String(coop?.remotePlayerCount?.() ?? 0));
    setPerformanceValue(perfCanvasDprEl, `${dpr.toFixed(1)}×`);
    setPerformanceValue(perfCanvasSizeEl, `${canvas.width}×${canvas.height}`);
    setPerformanceValue(perfMemoryEl, megabytes);
    setPerformanceValue(perfSubscriptionsEl, String(subscriptionCount));
  }

  function openDevAudit() {
    if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
    devAuditEl.hidden = false;
    devAuditBtn.setAttribute("aria-expanded", "true");
    settingsPanel.hidden = true;
    inventoryPanel.hidden = true;
    closeLeaderboard();
    setDevPanelTab("controls");
  }

  function closeDevAudit() {
    devAuditEl.hidden = true;
    devAuditBtn.setAttribute("aria-expanded", "false");
  }

  function beginPlayerSaveEdit() {
    if (!openProfileData || !isDeveloperIdentity(coop?.localIdentity?.())) return;
    const progress = openProfileData.progress;
    profileEditName.value = openProfileData.name;
    profileEditMaxHp.value = String(progress.maxHp);
    profileEditDamage.value = String(progress.damage);
    profileEditAttackRate.value = String(progress.attackRate);
    profileEditArmor.value = String(progress.armor);
    profileEditRegen.value = String(progress.regen);
    profileEditSpeed.value = String(progress.speed);
    profileEditAttackRange.value = String(progress.attackRange);
    profileEditProjectileSpeed.value = String(progress.projectileSpeed);
    profileEditProjectileCount.value = String(progress.projectileCount);
    profileEditPanel.hidden = false;
    editPlayerSaveBtn.hidden = true;
  }

  function cancelPlayerSaveEdit() {
    profileEditPanel.hidden = true;
    editPlayerSaveBtn.hidden = !openProfileData || !isDeveloperIdentity(coop?.localIdentity?.());
  }

  async function savePlayerSaveEdit() {
    if (!openProfileIdentity || !isDeveloperIdentity(coop?.localIdentity?.())) return;
    savePlayerSaveEditBtn.disabled = true;
    const result = await coop?.updatePlayerSave?.(openProfileIdentity, {
      displayName: profileEditName.value,
      maxHp: Number(profileEditMaxHp.value),
      damage: Number(profileEditDamage.value),
      attackRate: Number(profileEditAttackRate.value),
      armor: Number(profileEditArmor.value),
      regen: Number(profileEditRegen.value),
      speed: Number(profileEditSpeed.value),
      attackRange: Number(profileEditAttackRange.value),
      projectileSpeed: Number(profileEditProjectileSpeed.value),
      projectileCount: Number(profileEditProjectileCount.value),
    });
    savePlayerSaveEditBtn.disabled = false;
    if (!result?.ok) {
      showMessage(result?.error || "DATABASE UPDATE FAILED", "#ff9b91");
      return;
    }
    showMessage("PLAYER SAVE UPDATED", "#72ef58");
    profileEditPanel.hidden = true;
    editPlayerSaveBtn.hidden = false;
  }

  function closeUpdateNotice() {
    updateNoticeEl.hidden = true;
    try { localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION); } catch {}
  }

  function showCurrentUpdateNotice() {
    let seenVersion = "";
    try { seenVersion = localStorage.getItem(SEEN_VERSION_KEY) || ""; } catch {}
    if (seenVersion === GAME_VERSION) return;
    const releases = recentReleaseNotes(2);
    if (!releases.length) return;
    renderUpdateNotice(
      { overlay: updateNoticeEl, title: updateNoticeTitleEl, items: updateNoticeItemsEl },
      GAME_VERSION,
      releases,
    );
  }

  function openProfileIconPicker() {
    if (!coop?.isConnected?.()) return;
    const selected = coop?.profileIcon?.() ?? 0;
    profileIconChoices.replaceChildren();
    for (let index = 0; index < 64; index += 1) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "profile-icon-choice";
      choice.classList.toggle("is-selected", index === selected);
      choice.setAttribute("aria-label", `Use profile icon ${index + 1}`);
      choice.setAttribute("aria-pressed", String(index === selected));
      applyProfileIcon(choice, index);
      choice.addEventListener("click", async () => {
        const result = await coop?.setProfileIcon?.(index);
        if (!result?.ok) {
          showMessage(result?.error || "PROFILE ICON UPDATE FAILED", "#ff9b91");
          return;
        }
        applyProfileIcon(playerHudProfileIcon, index);
        if (openProfileIdentity === coop?.localIdentity?.()) applyProfileIcon(playerProfileIcon, index);
        profileIconPickerEl.hidden = true;
        showMessage("PROFILE ICON UPDATED", "#72ef58");
      });
      profileIconChoices.appendChild(choice);
    }
    profileIconPickerEl.hidden = false;
  }

  function closeProfileIconPicker() {
    profileIconPickerEl.hidden = true;
  }

  function openPlayerAtScreenPoint(clientX: number, clientY: number) {
    if (!running || !playerProfileEl.hidden) return false;
    const worldX = camera.x + clientX / camera.zoom;
    const worldY = camera.y + clientY / camera.zoom;
    let target = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const isPlayerProfileHit = (dx: number, dy: number) =>
      (Math.abs(dx) <= 48 && dy >= -60 && dy <= 60) ||
      (Math.abs(dx) <= 125 && dy >= -105 && dy < -45);
    if (isDueling() || replayMode) {
      const duelTarget = [renderedDuelScene?.challenger, renderedDuelScene?.opponent]
        .filter((actor): actor is DuelScene["challenger"] => Boolean(actor?.identity))
        .find((actor) => isPlayerProfileHit(worldX - actor.x, worldY - actor.y));
      if (!duelTarget?.identity) return false;
      void openPlayerProfile(duelTarget.identity, duelTarget.name);
      return true;
    }
    const localIdentity = coop?.localIdentity?.();
    if (localIdentity) {
      const dx = worldX - player.x;
      const dy = worldY - player.y;
      if (isPlayerProfileHit(dx, dy)) {
        target = { id: localIdentity, name: coop?.localDisplayName?.() || "PLAYER" };
        bestDistance = dx * dx + dy * dy;
      }
    }
    for (const other of coop?.remotePlayers?.() ?? []) {
      const dx = worldX - other.x;
      const dy = worldY - other.y;
      if (!isPlayerProfileHit(dx, dy)) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        target = other;
        bestDistance = distance;
      }
    }
    if (!target) return false;
    void openPlayerProfile(target.id, target.name);
    return true;
  }

  function renderInventory() {
    if (!inventoryItemsEl || !inventoryDetailEl || !inventoryCountEl || !equippedHeadSlot || !equippedChestSlot || !equippedFeetSlot) return;
    renderInventoryView(
      { items: inventoryItemsEl, detail: inventoryDetailEl, count: inventoryCountEl, equippedHead: equippedHeadSlot, equippedChest: equippedChestSlot, equippedFeet: equippedFeetSlot },
      inventory,
      {
        onSelect(itemId) {
          inventory.selectedItemId = itemId;
          renderInventory();
        },
        onEquip(itemId) {
          const item = itemDefinition(itemId);
          if (!item) return;
          if (item.slot === "HEAD") inventory.equippedHead = itemId;
          else if (item.slot === "CHEST") inventory.equippedChest = itemId;
          else if (item.slot === "FEET") inventory.equippedFeet = itemId;
          else return;
          player.speed = inventory.equippedFeet === TRAILBLAZER_BOOTS ? BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS : BASE_PLAYER_SPEED;
          saveProgress(true);
          renderInventory();
          showMessage(`${itemDefinition(itemId)?.name ?? "ITEM"} EQUIPPED`, "#72ef58");
        },
        onUnequip(itemId) {
          const item = itemDefinition(itemId);
          if (!item) return;
          if (item.slot === "HEAD" && inventory.equippedHead === itemId) inventory.equippedHead = "";
          else if (item.slot === "CHEST" && inventory.equippedChest === itemId) inventory.equippedChest = "";
          else if (item.slot === "FEET" && inventory.equippedFeet === itemId) inventory.equippedFeet = "";
          else return;
          player.speed = inventory.equippedFeet === TRAILBLAZER_BOOTS ? BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS : BASE_PLAYER_SPEED;
          saveProgress(true);
          renderInventory();
          showMessage(`${itemDefinition(itemId)?.name ?? "ITEM"} UNEQUIPPED`, "#ffe05d");
        },
        onInspect(itemId) {
          openItemInspect(itemId);
        },
      },
    );
  }

  function openItemInspect(itemId: string) {
    const item = itemDefinition(itemId);
    if (!item) return;
    const equippedItem = item.slot === "HEAD" ? inventory.equippedHead : item.slot === "CHEST" ? inventory.equippedChest : inventory.equippedFeet;
    itemInspectSlot.textContent = `${item.slot} · ${equippedItem === item.id ? "EQUIPPED" : "IN BAG"}`;
    itemInspectName.textContent = item.name;
    itemInspectDescription.textContent = item.description;
    itemInspectStats.textContent = item.stats.join(" · ");
    itemInspectIcon.innerHTML = item.id === BASIC_PAPER_HAT
      ? '<span class="inventory-item-art basic-paper-hat-art" aria-hidden="true"></span>'
      : item.id === SUPERIOR_GOLDEN_HELMET
        ? '<span class="inventory-item-art superior-golden-helmet-art" aria-hidden="true"></span>'
        : item.id === LEGENDARY_WHITE_GOLD_ARMOR
          ? '<span class="inventory-item-art legendary-white-gold-armor-art" aria-hidden="true"></span>'
        : '<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>';
    itemInspectEl.hidden = false;
  }

  function closeItemInspect() {
    itemInspectEl.hidden = true;
  }

  function duelOpponentName(duel: RuntimeDuelState) {
    const opponentId = duel.challenger === coop?.localIdentity?.() ? duel.opponent : duel.challenger;
    const opponent = coop?.remotePlayers?.().find((other) => other.id === opponentId);
    const name = opponent?.name || coop?.playerDisplayName?.(opponentId) || "OPPONENT";
    return publicPlayerName(opponentId, name);
  }

  function updateDuelControls() {
    if (!duelControls) return;
    const duel = activeDuel();
    duelStatusEl.hidden = false;
    duelRequestBtn.hidden = true;
    duelAcceptBtn.hidden = true;
    updateProfileDuelButton();

    if ((duel?.status === "active" || duel?.status === "finishing") && Date.now() >= duel.endsAtMs) {
      coop?.pulseDuel?.();
    }

    if (duel?.status === "countdown") {
      const remaining = Math.max(0, Math.ceil((duel.startsAtMs - Date.now()) / 1000));
      duelStatusEl.textContent = "DUEL STARTING";
      duelCountdownEl.textContent = String(remaining);
      duelCountdownEl.hidden = false;
      duelControls.hidden = false;
      return;
    }
    duelCountdownEl.hidden = true;
    if (duel?.status === "active") {
      const remaining = Math.max(0, Math.ceil((duel.endsAtMs - Date.now()) / 1000));
      duelStatusEl.textContent = `DUEL · ${duelOpponentName(duel)} · ${remaining}s`;
      duelControls.hidden = false;
      return;
    }
    if (duel?.status === "finishing") {
      duelStatusEl.textContent = "DUEL COMPLETE";
      duelControls.hidden = false;
      return;
    }
    duelControls.hidden = true;
  }

  function loop(now: number) {
    const frameIntervalMs = 1_000 / (lowPerformanceMode ? 30 : 60);
    if (now < nextFrameAt) {
      requestAnimationFrame(loop);
      return;
    }
    nextFrameAt += frameIntervalMs;
    if (nextFrameAt < now) nextFrameAt = now + frameIntervalMs;
    const frameStartedAt = performance.now();
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(.035, Math.max(0, rawDt));

    let updateMs = 0;
    if (running && !pausedForUpgrade && !coop?.accountState?.().sessionConflict) {
      const updateStartedAt = performance.now();
      update(dt);
      updateMs = performance.now() - updateStartedAt;
    }
    const renderStartedAt = performance.now();
    render();
    const renderMs = performance.now() - renderStartedAt;
    performanceMonitor.record(performance.now() - frameStartedAt, updateMs, renderMs);
    if (!devPerformancePanel.hidden && now >= nextPerformancePanelUpdateAt) {
      nextPerformancePanelUpdateAt = now + 500;
      renderPerformancePanel();
    }
    requestAnimationFrame(loop);
  }

  function startGame(markIntro = true, restoreServerPosition = true) {
    startEl.style.display = "none";
    overEl.style.display = "none";
    pausedForUpgrade = false;
    bootUpgradeEl.hidden = true;
    const serverMapId = coop?.localState?.()?.mapId;
    if (serverMapId === TUTORIAL_FOREST_MAP_ID || serverMapId === BEGINNER_DESERT_MAP_ID) currentMapId = serverMapId;
    syncMapMusic();
    reset(hasStarted);
    const serverState = coop?.localState?.();
    if (restoreServerPosition && serverState && serverState.mapId === currentMapId) {
      player.x = serverState.x;
      player.y = serverState.y;
      player.facing = serverState.facing;
      snapRuntimeCamera(camera, player, { width: viewW, height: viewH });
    }
    hasStarted = true;
    running = true;
    if (markIntro) coop?.beginAdventure?.();
    if (coop?.isConnected?.()) coop.syncPosition(player.x, player.y, player.facing, false, true);
    last = performance.now();
    nextFrameAt = last;
    ensureMusicPlayback();
  }

  function endGame() {
    screenShake = 0;
    flash = 0;
    running = false;
    overEl.style.display = "grid";
  }

  function updateScreenShakeSetting() {
    renderBooleanSetting(screenShakeToggle, screenShakeEnabled);
  }

  function updateAttackRangeSetting() {
    renderBooleanSetting(attackRangeToggle, attackRangeVisible);
  }

  function updateAntiAliasingSetting() {
    renderBooleanSetting(antiAliasingToggle, antiAliasingEnabled);
  }

  function updateLowPerformanceSetting() {
    renderBooleanSetting(lowPerformanceToggle, lowPerformanceMode);
  }

  function updateLatencySetting() {
    renderBooleanSetting(latencyToggle, latencyVisible);
    updateLatencyStatus();
  }

  function updateLatencyStatus() {
    renderLatencyStatus(latencyStatusEl, latencyVisible, coop?.latencyMs?.(), Boolean(coop?.isConnected?.()));
  }

  function updateMusicVolume() {
    mapMusic.setVolume(musicVolume);
    renderMusicVolume(musicVolumeInput, musicVolumeValue, musicVolume);
  }

  function ensureMusicPlayback() {
    mapMusic.ensurePlaying(hasStarted || running);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      mapMusic.audio.pause();
      return;
    }
    ensureMusicPlayback();
  });
  window.addEventListener("pagehide", () => mapMusic.audio.pause());

  function updateFullscreenSetting() {
    const root = document.documentElement;
    const supported = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    renderFullscreenSetting(fullscreenToggle, supported, Boolean(active));
  }

  async function enterFullscreen() {
    const root = document.documentElement;
    if (typeof root.requestFullscreen === "function") {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "TypeError") throw error;
        await root.requestFullscreen();
      }
      return;
    }
    if (typeof root.webkitRequestFullscreen === "function") root.webkitRequestFullscreen();
  }

  async function exitFullscreen() {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
    if (typeof document.webkitExitFullscreen === "function") document.webkitExitFullscreen();
  }

  function updateAutoAttackSetting() {
    autoAttackBtn.setAttribute("aria-pressed", String(autoAttackEnabled));
    autoAttackBtn.classList.toggle("is-off", !autoAttackEnabled);
  }

  function updateConnectionStatus() {
    renderConnectionStatus(connectionStatusEl, Boolean(coop && coop.isConnected()));
  }

  function updateAccountStatus() {
    renderAccountStatus(accountButton, accountStatusEl, coop?.accountState?.() || { signedIn: false, notice: "" });
  }

  settingsBtn.addEventListener("click", () => {
    const opening = settingsPanel.hidden;
    settingsPanel.hidden = !opening;
    inventoryPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", String(opening));
    inventoryBtn.setAttribute("aria-expanded", "false");
    closeLeaderboard();
    closeDevAudit();
  });
  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  });

  inventoryBtn.addEventListener("click", () => {
    const opening = inventoryPanel.hidden;
    inventoryPanel.hidden = !opening;
    settingsPanel.hidden = true;
    inventoryBtn.setAttribute("aria-expanded", String(opening));
    settingsBtn.setAttribute("aria-expanded", "false");
    closeLeaderboard();
    closeDevAudit();
    if (opening) renderInventory();
  });
  closeInventoryBtn.addEventListener("click", () => {
    inventoryPanel.hidden = true;
    inventoryBtn.setAttribute("aria-expanded", "false");
  });

  leaderboardBtn.addEventListener("click", openLeaderboard);
  closeLeaderboardBtn.addEventListener("click", closeLeaderboard);
  leaderboardPowerTab.addEventListener("click", () => setLeaderboardTab("power"));
  leaderboardDamageTab.addEventListener("click", () => setLeaderboardTab("damage"));
  leaderboardHealthTab.addEventListener("click", () => setLeaderboardTab("health"));
  leaderboardArmorTab.addEventListener("click", () => setLeaderboardTab("armor"));
  leaderboardRegenTab.addEventListener("click", () => setLeaderboardTab("regen"));
  leaderboardTimeTab.addEventListener("click", () => setLeaderboardTab("time"));
  devAuditBtn.addEventListener("click", openDevAudit);
  closeDevAuditBtn.addEventListener("click", closeDevAudit);
  devControlsTab.addEventListener("click", () => setDevPanelTab("controls"));
  devBugReportsTab.addEventListener("click", () => setDevPanelTab("bugs"));
  devCutscenesTab.addEventListener("click", () => setDevPanelTab("cutscenes"));
  devPerformanceTab.addEventListener("click", () => setDevPanelTab("performance"));
  devPresenceToggleBtn.addEventListener("click", async () => {
    const visible = coop?.developerPresenceVisible?.() === true;
    devPresenceToggleBtn.disabled = true;
    const result = await coop?.setDeveloperPresence?.(!visible);
    devPresenceToggleBtn.disabled = false;
    renderDevControls();
    showMessage(result?.ok ? (!visible ? "VISIBLE · NOW ONLINE" : "INVISIBLE · NOW OFFLINE") : result?.error || "PRESENCE UPDATE FAILED", result?.ok ? "#72ef58" : "#ff9b91");
  });
  triggerDragonCutsceneBtn.addEventListener("click", () => {
    if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
    if (currentMapId !== TUTORIAL_FOREST_MAP_ID) {
      showMessage("DRAGON CUTSCENE: TUTORIAL FOREST ONLY", "#ff9b91");
      return;
    }
    if (portalCutscene.active) return;
    closeDevAudit();
    startDragonPortalCutscene(true);
  });

  equippedFeetSlot?.addEventListener("click", () => {
    if (inventory.equippedFeet) {
      inventory.selectedItemId = inventory.equippedFeet;
      renderInventory();
    }
  });
  equippedHeadSlot?.addEventListener("click", () => {
    if (inventory.equippedHead) {
      inventory.selectedItemId = inventory.equippedHead;
      renderInventory();
    }
  });
  equippedChestSlot?.addEventListener("click", () => {
    if (inventory.equippedChest) {
      inventory.selectedItemId = inventory.equippedChest;
      renderInventory();
    }
  });
  closeItemInspectBtn?.addEventListener("click", closeItemInspect);

  accountButton?.addEventListener("click", () => {
    const account = coop?.accountState?.();
    if (account?.signedIn) coop?.signOut?.();
    else void coop?.signIn?.();
  });

  continueGuestBtn?.addEventListener("click", () => {
    guestContinuationChosen = true;
    coop?.continueAsGuest?.();
    finishStartup();
  });

  signInFromStartBtn?.addEventListener("click", () => {
    const characterFound = Boolean(coop?.knownCharacter?.());
    accountSignInPending = true;
    showSigningIn(characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…");
    void coop?.signIn?.().then((result) => {
      if (result?.ok !== false) return;
      accountSignInPending = false;
      showAccountChoice();
      accountChoiceDetail.textContent = characterFound
        ? "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN"
        : "REGISTRATION FAILED · TRY AGAIN OR USE GUEST LOGIN";
    }).catch(() => {
      accountSignInPending = false;
      showAccountChoice();
      accountChoiceDetail.textContent = "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN";
    });
  });

  sessionTakeoverBtn?.addEventListener("click", () => {
    sessionTakeoverBtn.disabled = true;
    loadingDetail.textContent = "SIGNING OUT OTHER TAB…";
    void coop?.takeOverSession?.().then((result) => {
      if (result?.ok === false) {
        sessionTakeoverBtn.disabled = false;
        loadingDetail.textContent = "TAKEOVER FAILED · TRY AGAIN";
        return;
      }
      showConnecting();
    }).catch(() => {
      sessionTakeoverBtn.disabled = false;
      loadingDetail.textContent = "TAKEOVER FAILED · TRY AGAIN";
    });
  });

  screenShakeToggle.addEventListener("click", () => {
    screenShakeEnabled = !screenShakeEnabled;
    if (!screenShakeEnabled) screenShake = 0;
    updateScreenShakeSetting();
  });

  attackRangeToggle.addEventListener("click", () => {
    attackRangeVisible = !attackRangeVisible;
    try { localStorage.setItem(ATTACK_RANGE_VISIBLE_KEY, String(attackRangeVisible)); } catch {}
    updateAttackRangeSetting();
  });

  antiAliasingToggle.addEventListener("click", () => {
    antiAliasingEnabled = !antiAliasingEnabled;
    try { localStorage.setItem(ANTI_ALIASING_ENABLED_KEY, String(antiAliasingEnabled)); } catch {}
    updateAntiAliasingSetting();
  });

  lowPerformanceToggle.addEventListener("click", () => {
    lowPerformanceMode = !lowPerformanceMode;
    try { localStorage.setItem(LOW_PERFORMANCE_MODE_KEY, String(lowPerformanceMode)); } catch {}
    nextFrameAt = performance.now();
    updateLowPerformanceSetting();
  });

  latencyToggle.addEventListener("click", () => {
    latencyVisible = !latencyVisible;
    try { localStorage.setItem(LATENCY_VISIBLE_KEY, String(latencyVisible)); } catch {}
    updateLatencySetting();
  });

  hpText.closest(".card")?.addEventListener("click", () => {
    const identity = coop?.localIdentity?.();
    if (identity) void openPlayerProfile(identity, coop?.localDisplayName?.() || "PLAYER");
  });
  closePlayerProfileBtn.addEventListener("click", closePlayerProfile);
  editPlayerNameBtn.addEventListener("click", openProfileNameEditor);
  previousPlayerSpriteBtn.addEventListener("click", () => selectProfileCharacter(-1));
  nextPlayerSpriteBtn.addEventListener("click", () => selectProfileCharacter(1));
  profileSkinToneEdit.addEventListener("click", () => {
    if (openProfileIdentity !== coop?.localIdentity?.()) return;
    profileSkinToneControl.hidden = !profileSkinToneControl.hidden;
  });
  profileSkinToneControl.addEventListener("click", async (event) => {
    const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-skin-tone-choice");
    if (!choice || openProfileIdentity !== coop?.localIdentity?.()) return;
    const skinTone = Number(choice.dataset.skinTone);
    if (!Number.isInteger(skinTone)) return;
    const result = await coop?.setSkinTone?.(skinTone);
    if (!result?.ok) {
      showMessage(result?.error || "SKIN TONE UPDATE FAILED", "#ff9b91");
      updateProfileSkinToneChoices(coop?.skinTone?.() ?? DEFAULT_SKIN_TONE);
      return;
    }
    updateProfileSkinToneChoices(skinTone);
    profileSkinToneControl.hidden = true;
    drawProfileCharacterPreview();
    showMessage("SKIN TONE UPDATED", "#72ef58");
  });
  profileNameEditorEl.addEventListener("click", (event) => {
    if (event.target === profileNameEditorEl) closeProfileNameEditor();
  });
  profileNameEditorForm.addEventListener("submit", (event) => void saveProfileName(event));
  profileOverviewTab.addEventListener("click", () => setProfileTab("overview"));
  profileStatsTab.addEventListener("click", () => setProfileTab("stats"));
  editPlayerSaveBtn.addEventListener("click", beginPlayerSaveEdit);
  cancelPlayerSaveEditBtn.addEventListener("click", cancelPlayerSaveEdit);
  savePlayerSaveEditBtn.addEventListener("click", () => void savePlayerSaveEdit());

  musicVolumeInput?.addEventListener("input", () => {
    musicVolume = clamp(Number(musicVolumeInput.value) / 100, 0, 1);
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch {}
    updateMusicVolume();
    if (musicVolume > 0) ensureMusicPlayback();
  });

  document.addEventListener("pointerdown", ensureMusicPlayback, { capture: true });
  document.addEventListener("keydown", ensureMusicPlayback, { capture: true });

  autoAttackBtn.addEventListener("click", () => {
    autoAttackEnabled = !autoAttackEnabled;
    updateAutoAttackSetting();
    logPickup(
      autoAttackEnabled ? "AUTO ATTACK ENABLED" : "AUTO ATTACK DISABLED",
      autoAttackEnabled ? "#72ef58" : "#ff9b91",
    );
  });

  profileDuelBtn.addEventListener("click", () => {
    const opponentIdentity = profileDuelBtn.dataset.identity || "";
    if (!opponentIdentity || profileDuelBtn.disabled) return;
    profileDuelBtn.disabled = true;
    void coop?.requestDuel?.(opponentIdentity).then((result) => {
      if (!result?.ok) showMessage(result?.error || "DUEL FAILED", "#ff9b91");
      else closePlayerProfile();
      updateProfileDuelButton();
    });
  });

  watchDuelReplayBtn.addEventListener("click", () => {
    const replayId = BigInt(duelResultEl.dataset.replayId || "0");
    if (replayId > 0n) openDuelReplay(replayId);
  });

  closeDuelResultBtn.addEventListener("click", () => {
    leaveDuelResult();
  });

  function closeDragonResult() {
    dragonResultEl.hidden = true;
    last = performance.now();
  }
  closeDragonResultBtn.addEventListener("click", closeDragonResult);
  closeUpdateNoticeBtn.addEventListener("click", closeUpdateNotice);
  playerHudProfileIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    const identity = coop?.localIdentity?.();
    if (identity) void openPlayerProfile(identity, coop?.localDisplayName?.() || "PLAYER");
  });
  playerProfileIcon.addEventListener("click", () => {
    if (openProfileIdentity === coop?.localIdentity?.()) openProfileIconPicker();
  });
  closeProfileIconPickerBtn.addEventListener("click", closeProfileIconPicker);

  closeDuelReplayBtn.addEventListener("click", () => {
    const closeReplay = () => {
      duelReplayEl.hidden = true;
      visibleReplay = null;
      replayMode = null;
      duelCountdownEl.hidden = true;
      document.body.classList.remove("is-replaying");
    };
    if (duelResultHold) {
      closeReplay();
      duelResultEl.hidden = false;
      return;
    }
    fadeToWorld(closeReplay);
  });

  fullscreenToggle.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    } catch {
      showMessage("FULLSCREEN UNAVAILABLE", "#ff9b91");
    }
    updateFullscreenSetting();
  });

  document.addEventListener("fullscreenchange", updateFullscreenSetting);
  document.addEventListener("webkitfullscreenchange", updateFullscreenSetting);

  const chat = createChatController({
    elements: {
      toggle: requiredElement<HTMLButtonElement>("chatToggle"),
      panel: requiredElement("chatPanel"),
      header: requiredSelector("#chatPanel .chat-header"),
      sizeToggle: requiredElement<HTMLButtonElement>("chatSizeToggle"),
      messages: requiredElement("chatMessages"),
      form: requiredElement<HTMLFormElement>("chatForm"),
      input: requiredElement<HTMLTextAreaElement>("chatInput"),
      sendButton: requiredElement<HTMLButtonElement>("chatSendBtn"),
    },
    getCoop: () => coop,
    showMessage,
    onOpenReplay: openDuelReplay,
    onOpenPlayer: openPlayerProfile,
  });
  chat.init();

  if (coop && typeof coop.setOnChange === "function") {
    coop.setOnChange(() => {
      const identity = coop.localIdentity?.() || "";
      const lifetime = coop.playerProfile?.(identity)?.lifetime;
      if (lifetime) {
        totalKills = identity === lifetimeKillsIdentity
          ? Math.max(totalKills, lifetime.enemyKills)
          : lifetime.enemyKills;
        lifetimeKillsIdentity = identity;
      }
      if (openProfileIdentity) {
        const profile = coop.playerProfile?.(openProfileIdentity);
        if (profile) renderPlayerProfile(profile);
      }
      if (!leaderboardEl.hidden) renderLeaderboard();
        if (!devAuditEl.hidden) {
          renderDevControls();
          renderDevBugReports();
        }
      loadProgress();
      const nextSessionGeneration = coop?.sessionGeneration?.() || 0;
      if (nextSessionGeneration !== observedCoopSessionGeneration) {
        observedCoopSessionGeneration = nextSessionGeneration;
        movementSyncActive = false;
        if (running) {
          coop.syncSpeed?.(player.speed);
          coop.syncPosition?.(player.x, player.y, player.facing, player.moving, true);
        }
      }
      reconcileMapFromServer();
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) syncDragonState();
      finishStartup();
      const account = coop?.accountState?.();
      if (account?.signedIn) accountSignInPending = false;
      updateProtocolGate(account);
      if (account?.sessionConflict) showSessionConflict();
      else if (!hasStarted && (account?.returningFromSignIn || account?.authInProgress || accountSignInPending || (account?.signedIn && !account?.hydrated))) showSigningIn();
      else if (!hasStarted && !account?.signedIn && !account?.authInProgress) showAccountChoice();
      chat.refresh();
      updateDuelControls();
      updateConnectionStatus();
      updateAccountStatus();
    });
  }
  updateFullscreenSetting();
  updateAttackRangeSetting();
  updateAntiAliasingSetting();
  updateLowPerformanceSetting();
  updateLatencySetting();
  updateMusicVolume();
  updateDuelControls();
  updateConnectionStatus();
  updateAccountStatus();
  updateProtocolGate();
  window.setInterval(() => chat.refresh(), 1_000);
  window.setInterval(() => {
    if (coop?.accountState?.().updating) enforceLatestVersion(GAME_VERSION, showGameUpdating);
  }, 5_000);

  bootUpgradeClose.addEventListener("click", () => {
    pausedForUpgrade = false;
    bootUpgradeEl.hidden = true;
    last = performance.now();
  });

  resetProgressBtn.addEventListener("click", () => {
    if (!confirm("Erase all saved Wildwood progress and start over?")) return;

    hasSavedProgress = false;
    progressLoaded = false;
    progressLoadedIdentity = "";
    waitingForFreshStart = true;
    startupKind = null;
    newPlayerIntroShown = false;
    if (coop && typeof coop.resetProgress === "function") coop.resetProgress();
    totalKills = 0;
    bootsPickup.collected = false;
    inventory.itemIds = [BASIC_PAPER_HAT, ...inventory.itemIds.filter((itemId) => itemId === SUPERIOR_GOLDEN_HELMET || itemId === LEGENDARY_WHITE_GOLD_ARMOR)];
    inventory.equippedHead = BASIC_PAPER_HAT;
    inventory.equippedChest = "";
    inventory.equippedFeet = "";
    inventory.selectedItemId = "";
    renderInventory();
    pausedForUpgrade = false;
    bootUpgradeEl.hidden = true;
    keys.clear();
    touchMove.active = false;
    reset(false);
    hasStarted = false;
    running = false;
    last = performance.now();
    showConnecting();
    overEl.style.display = "none";
    settingsPanel.hidden = true;
    inventoryPanel.hidden = true;
    closeLeaderboard();
    settingsBtn.setAttribute("aria-expanded", "false");
    inventoryBtn.setAttribute("aria-expanded", "false");
  });

  beginAdventureBtn.addEventListener("click", beginAdventure);
  newPlayerNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") beginAdventure();
  });
  requiredElement<HTMLButtonElement>("restartBtn").addEventListener("click", () => startGame(false, false));

  addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code === "Escape" && !profileIconPickerEl.hidden) {
      closeProfileIconPicker();
      return;
    }
    if (e.code === "Escape" && !itemInspectEl.hidden) {
      closeItemInspect();
      return;
    }
    if (e.code === "Escape" && !leaderboardEl.hidden) {
      closeLeaderboard();
      return;
    }
    if (e.code === "Escape" && !devAuditEl.hidden) {
      closeDevAudit();
      return;
    }
    if (e.code === "Escape" && !profileNameEditorEl.hidden) {
      closeProfileNameEditor();
      return;
    }
    if (e.code === "Escape" && !playerProfileEl.hidden) {
      closePlayerProfile();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener("keyup", (e: KeyboardEvent) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  function beginTouch(e: TouchEvent) {
    if (!running || touchMove.active) return;
    const t = e.changedTouches[0];
    touchMove.active = true;
    touchMove.id = t.identifier;
    touchMove.ox = t.clientX;
    touchMove.oy = t.clientY;
    touchMove.x = 0;
    touchMove.y = 0;
    touchMove.moved = false;

    joystickEl.style.left = (t.clientX - 59) + "px";
    joystickEl.style.top = (t.clientY - 59) + "px";
    joystickEl.style.bottom = "auto";
    joystickEl.style.display = "block";
  }

  function moveTouch(e: TouchEvent) {
    if (!touchMove.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== touchMove.id) continue;
      let dx = t.clientX - touchMove.ox;
      let dy = t.clientY - touchMove.oy;
      const d = Math.hypot(dx,dy);
      if (d > 8) touchMove.moved = true;
      const max = 38;
      if (d > max) { dx = dx/d*max; dy = dy/d*max; }
      touchMove.x = dx / max;
      touchMove.y = dy / max;
      stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
      break;
    }
  }

  function endTouch(e: TouchEvent) {
    if (!touchMove.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== touchMove.id) continue;
      const wasTap = !touchMove.moved;
      touchMove.active = false;
      touchMove.id = null;
      touchMove.x = touchMove.y = 0;
      stickEl.style.transform = "translate(0,0)";
      joystickEl.style.display = "none";
      if (wasTap) openPlayerAtScreenPoint(t.clientX, t.clientY);
      break;
    }
  }

  canvas.addEventListener("touchstart", beginTouch, {passive:false});
  canvas.addEventListener("touchmove", moveTouch, {passive:false});
  canvas.addEventListener("touchend", endTouch, {passive:false});
  canvas.addEventListener("touchcancel", endTouch, {passive:false});
  canvas.addEventListener("click", (event) => {
    openPlayerAtScreenPoint(event.clientX, event.clientY);
  });

  const initialAccount = coop?.accountState?.();
  if (initialAccount?.returningFromSignIn) showSigningIn();
  else if (initialAccount?.signInRequired) showAccountChoice();
  else if (!initialAccount?.signedIn && !initialAccount?.knownAccount && !initialAccount?.authInProgress) showAccountChoice();
  else showConnecting();
  loadProgress();
  rebuildWorld();
  updateRuntimeCamera(camera, player, { width: viewW, height: viewH }, null, 1);
  render();
  requestAnimationFrame(loop);
})();
