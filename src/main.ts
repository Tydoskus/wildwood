// @ts-nocheck
// Gradual TypeScript migration: existing game behavior stays unchanged.

import { enforceLatestVersion } from "./app/version";
import { recentReleaseNotes } from "./app/changelog";
import { DEVELOPER_BADGE, isDeveloperIdentity } from "./app/developer";
import {
  ATTACK_RANGE_ZOOM_REFERENCE,
  BASE_ATTACK_RANGE,
  BASE_PROJECTILE_SPEED,
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  ENEMY_HIT_MIN_MOVE_SPEED,
  ENEMY_HIT_SPEED_RECOVERY_SECONDS,
  MAX_PROJECTILE_SPEED,
  MIN_CAMERA_ZOOM,
  PLAYER_KNOCKBACK_FORCE,
  PLAYER_SPRITE_CENTER_X_SHIFT,
  PLAYER_SPRITE_X_OFFSETS,
  PLAYER_SPRITE_Y_OFFSETS,
  REGULAR_ENEMY_AGGRO_PADDING,
  RANGED_PROJECTILE_SPEED,
  TAU,
  WORLD,
} from "./game/constants";
import { circlesOverlap, clamp, distanceSquared, rand, randi } from "./game/math";
import { damageAfterArmor, formatArmorReduction } from "./game/combat";
import { inventoryFromSave, ITEM_DEFINITIONS, serialiseInventory, TRAILBLAZER_BOOTS } from "./game/inventory";
import { createCanvasPrimitives } from "./game/canvas";
import {
  BEGINNER_DESERT_MAP_ID,
  createSpawnSites,
  createWorldLayout,
  loadTreeSpritesheet,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
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
import { formatCompactNumber } from "./ui/number-format";
import {
  BOOTS_SPEED_BONUS,
  DEFAULT_ATTACK_INTERVAL as STARTING_ATTACK_INTERVAL,
  MAX_ARMOR,
  MIN_ATTACK_INTERVAL,
  PLAYER_BASE_HP as BASE_PLAYER_HP,
  PLAYER_SPEED as BASE_PLAYER_SPEED,
} from "../shared/rules";

(() => {
  "use strict";

  const GAME_VERSION = "0.277";
  const SEEN_VERSION_KEY = "wildwood-seen-version-v1";
  const ATTACK_RANGE_VISIBLE_KEY = "wildwood-attack-range-visible-v1";
  const LATENCY_VISIBLE_KEY = "wildwood-latency-visible-v1";
  const MUSIC_VOLUME_KEY = "wildwood-music-volume-v1";
  const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
  const WORLD_HEALTH_BAR_HEIGHT = 13;
  const ENEMY_DEATH_PARTICLE_COLOR = "#e53935";
  const DRAGON_HP_LOSS_FLASH_DURATION = .18;
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

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const { outlinedText, pixelCircle, roundRect } = createCanvasPrimitives(ctx);

  const hpFill = document.getElementById("hpFill");
  const hpText = document.getElementById("hpText");
  const playerNameEl = document.getElementById("playerName");
  const playerPowerEl = document.getElementById("playerPower");
  const playerHudProfileIcon = document.getElementById("playerHudProfileIcon");
  const settingsBtn = document.getElementById("settingsBtn");
  const inventoryBtn = document.getElementById("inventoryBtn");
  const leaderboardBtn = document.getElementById("leaderboardBtn");
  const devAuditBtn = document.getElementById("devAuditBtn");
  const autoAttackBtn = document.getElementById("autoAttackBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const inventoryPanel = document.getElementById("inventoryPanel");
  const inventoryItemsEl = document.getElementById("inventoryItems");
  const inventoryDetailEl = document.getElementById("inventoryDetail");
  const inventoryCountEl = document.getElementById("inventoryCount");
  const equippedFeetSlot = document.getElementById("equippedFeetSlot");
  const itemInspectEl = document.getElementById("itemInspect");
  const closeItemInspectBtn = document.getElementById("closeItemInspectBtn");
  const itemInspectIcon = document.getElementById("itemInspectIcon");
  const itemInspectSlot = document.getElementById("itemInspectSlot");
  const itemInspectName = document.getElementById("itemInspectName");
  const itemInspectDescription = document.getElementById("itemInspectDescription");
  const itemInspectStats = document.getElementById("itemInspectStats");
  const screenShakeToggle = document.getElementById("screenShakeToggle");
  const attackRangeToggle = document.getElementById("attackRangeToggle");
  const latencyToggle = document.getElementById("latencyToggle");
  const latencyStatusEl = document.getElementById("latencyStatus");
  const musicVolumeInput = document.getElementById("musicVolume");
  const musicVolumeValue = document.getElementById("musicVolumeValue");
  const fullscreenToggle = document.getElementById("fullscreenToggle");
  const connectionStatusEl = document.getElementById("connectionStatus");
  const accountButton = document.getElementById("accountButton");
  const accountStatusEl = document.getElementById("accountStatus");
  const resetProgressBtn = document.getElementById("resetProgressBtn");
  const messageEl = document.getElementById("message");
  const pickupLog = document.getElementById("pickupLog");
  const startEl = document.getElementById("start");
  const connectionPanel = document.getElementById("connectionPanel");
  const sessionTakeoverBtn = document.getElementById("sessionTakeoverBtn");
  const sessionTakeoverNote = document.getElementById("sessionTakeoverNote");
  const loadingDetail = document.getElementById("loadingDetail");
  const loadingFill = document.getElementById("loadingFill");
  const accountChoicePanel = document.getElementById("accountChoicePanel");
  const accountChoiceDetail = document.getElementById("accountChoiceDetail");
  const accountCharacter = document.getElementById("accountCharacter");
  const accountCharacterName = document.getElementById("accountCharacterName");
  const signInFromStartBtn = document.getElementById("signInFromStartBtn");
  const continueGuestBtn = document.getElementById("continueGuestBtn");
  const newPlayerPanel = document.getElementById("newPlayerPanel");
  const newPlayerNameInput = document.getElementById("newPlayerNameInput");
  const beginAdventureBtn = document.getElementById("beginAdventureBtn");
  const overEl = document.getElementById("gameOver");
  const joystickEl = document.getElementById("joystick");
  const stickEl = document.getElementById("stick");
  const bootUpgradeEl = document.getElementById("bootUpgrade");
  const bootUpgradeClose = document.getElementById("bootUpgradeClose");
  const coopStatusEl = document.getElementById("coopStatus");
  const duelControls = document.getElementById("duelControls");
  const duelStatusEl = document.getElementById("duelStatus");
  const duelRequestBtn = document.getElementById("duelRequestBtn");
  const duelAcceptBtn = document.getElementById("duelAcceptBtn");
  const duelCountdownEl = document.getElementById("duelCountdown");
  const duelResultEl = document.getElementById("duelResult");
  const duelResultTitle = document.getElementById("duelResultTitle");
  const duelResultStats = document.getElementById("duelResultStats");
  const watchDuelReplayBtn = document.getElementById("watchDuelReplayBtn");
  const closeDuelResultBtn = document.getElementById("closeDuelResultBtn");
  const dragonResultEl = document.getElementById("dragonResult");
  const dragonResultTotal = document.getElementById("dragonResultTotal");
  const dragonResultContributors = document.getElementById("dragonResultContributors");
  const closeDragonResultBtn = document.getElementById("closeDragonResultBtn");
  const dragonWorldNoticeEl = document.getElementById("dragonWorldNotice");
  const dragonWorldNoticeDetailEl = document.getElementById("dragonWorldNoticeDetail");
  const duelReplayEl = document.getElementById("duelReplay");
  const duelReplayTitle = document.getElementById("duelReplayTitle");
  const closeDuelReplayBtn = document.getElementById("closeDuelReplayBtn");
  const sceneFadeEl = document.getElementById("sceneFade");
  const playerProfileEl = document.getElementById("playerProfile");
  const playerProfileNameEl = document.getElementById("playerProfileName");
  const playerProfilePresenceEl = document.getElementById("playerProfilePresence");
  const playerProfilePowerEl = document.getElementById("playerProfilePower");
  const playerProfileIcon = document.getElementById("playerProfileIcon");
  const playerProfileLoadingEl = document.getElementById("playerProfileLoading");
  const profileOverviewTab = document.getElementById("profileOverviewTab");
  const profileStatsTab = document.getElementById("profileStatsTab");
  const profileOverviewPanel = document.getElementById("profileOverviewPanel");
  const profileStatsPanel = document.getElementById("profileStatsPanel");
  const profileJoinedEl = document.getElementById("profileJoined");
  const profileTimePlayedEl = document.getElementById("profileTimePlayed");
  const profileKillsEl = document.getElementById("profileKills");
  const profileOnlineEl = document.getElementById("profileOnline");
  const profileStatGrid = document.getElementById("profileStatGrid");
  const closePlayerProfileBtn = document.getElementById("closePlayerProfileBtn");
  const editPlayerSaveBtn = document.getElementById("editPlayerSaveBtn");
  const profileDuelBtn = document.getElementById("profileDuelBtn");
  const profileEditPanel = document.getElementById("profileEditPanel");
  const profileEditName = document.getElementById("profileEditName");
  const profileEditMaxHp = document.getElementById("profileEditMaxHp");
  const profileEditDamage = document.getElementById("profileEditDamage");
  const profileEditAttackRate = document.getElementById("profileEditAttackRate");
  const profileEditArmor = document.getElementById("profileEditArmor");
  const profileEditRegen = document.getElementById("profileEditRegen");
  const profileEditSpeed = document.getElementById("profileEditSpeed");
  const profileEditAttackRange = document.getElementById("profileEditAttackRange");
  const profileEditProjectileSpeed = document.getElementById("profileEditProjectileSpeed");
  const profileEditProjectileCount = document.getElementById("profileEditProjectileCount");
  const cancelPlayerSaveEditBtn = document.getElementById("cancelPlayerSaveEditBtn");
  const savePlayerSaveEditBtn = document.getElementById("savePlayerSaveEditBtn");
  const leaderboardEl = document.getElementById("leaderboard");
  const leaderboardPowerTab = document.getElementById("leaderboardPowerTab");
  const leaderboardDamageTab = document.getElementById("leaderboardDamageTab");
  const leaderboardHealthTab = document.getElementById("leaderboardHealthTab");
  const leaderboardArmorTab = document.getElementById("leaderboardArmorTab");
  const leaderboardRegenTab = document.getElementById("leaderboardRegenTab");
  const leaderboardTimeTab = document.getElementById("leaderboardTimeTab");
  const leaderboardValueHeading = document.getElementById("leaderboardValueHeading");
  const leaderboardRowsEl = document.getElementById("leaderboardRows");
  const leaderboardEmptyEl = document.getElementById("leaderboardEmpty");
  const closeLeaderboardBtn = document.getElementById("closeLeaderboardBtn");
  const devAuditEl = document.getElementById("devAudit");
  const devAuditRowsEl = document.getElementById("devAuditRows");
  const devAuditEmptyEl = document.getElementById("devAuditEmpty");
  const closeDevAuditBtn = document.getElementById("closeDevAuditBtn");
  const updateNoticeEl = document.getElementById("updateNotice");
  const updateNoticeTitleEl = document.getElementById("updateNoticeTitle");
  const updateNoticeItemsEl = document.getElementById("updateNoticeItems");
  const closeUpdateNoticeBtn = document.getElementById("closeUpdateNoticeBtn");
  const signinVersionEl = document.getElementById("signinVersion");
  const profileIconPickerEl = document.getElementById("profileIconPicker");
  const profileIconChoices = document.getElementById("profileIconChoices");
  const closeProfileIconPickerBtn = document.getElementById("closeProfileIconPickerBtn");
  const gameUpdateGateEl = document.getElementById("gameUpdateGate");
  const coop = window.wildwoodCoop || null;
  if (signinVersionEl) signinVersionEl.textContent = `v${GAME_VERSION}`;

  const backgroundMusic = new Audio("assets/wildwood/audio/forest.mp3");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "metadata";
  let musicVolume = .35;
  try {
    const storedVolume = localStorage.getItem(MUSIC_VOLUME_KEY);
    if (storedVolume !== null) {
      const savedVolume = Number(storedVolume);
      if (Number.isFinite(savedVolume)) musicVolume = clamp(savedVolume, 0, 1);
    }
  } catch {}
  backgroundMusic.volume = musicVolume;

  function syncMapMusic() {
    const nextSource = currentMapId === BEGINNER_DESERT_MAP_ID
      ? "assets/wildwood/audio/desert.mp3"
      : "assets/wildwood/audio/forest.mp3";
    if (backgroundMusic.getAttribute("src") === nextSource) return;
    const shouldResume = !backgroundMusic.paused;
    backgroundMusic.src = nextSource;
    backgroundMusic.load();
    if (shouldResume && musicVolume > 0) void backgroundMusic.play().catch(() => {});
  }

  enforceLatestVersion(GAME_VERSION);
  window.setInterval(() => enforceLatestVersion(GAME_VERSION), 30_000);
  const keys = new Set();
  const camera = { x: 0, y: 0, zoom: 1 };
  const particles = [];
  const damageNumbers = [];
  const projectiles = [];
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const enemyShots = [];
  const enemies = [];
  const spawnSites = [];
  const decor = [];
  const paths = [];
  const bossRain = [];
  const spiderVenom = [];
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
      emptyArch: { x: 580, y: 680, width: 198, height: 198, depth: 680 },
      arrival: { x: 360, y: 770 },
    },
  } as const;
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;
  let mapTransitioning = false;
  let portalCooldown = 0;

  let dpr = 1;
  let viewW = innerWidth;
  let viewH = innerHeight;
  let running = false;
  let hasStarted = false;
  let gameTime = 0;
  let last = performance.now();
  let totalKills = 0;
  let lifetimeKillsIdentity = "";
  let flash = 0;
  let screenShake = 0;
  let screenShakeEnabled = true;
  let attackRangeVisible = true;
  try { attackRangeVisible = localStorage.getItem(ATTACK_RANGE_VISIBLE_KEY) !== "false"; } catch {}
  let latencyVisible = false;
  try { latencyVisible = localStorage.getItem(LATENCY_VISIBLE_KEY) === "true"; } catch {}
  let messageClock = 0;
  let activeSpeechBubbles = new Map();
  let pausedForUpgrade = false;
  let autoAttackEnabled = true;
  let duelWasActive = false;
  let liveDuelPresentation = null;
  let lastLocalDuelId = null;
  let visibleReplay = null;
  let replayMode = null;
  let heldDuelScene = null;
  let duelResultHold = false;
  let duelReturnState = null;
  let duelExitFading = false;
  let dragonWorldNoticeTimer = null;
  let observedDragonEncounter = null;
  let dragonWasAlive = null;
  let pendingDragonResultEncounter = null;
  let shownDragonResultEncounter = null;
  let observedSpiderEncounter = null;
  let spiderWasAlive = null;
  let pendingSpiderResultEncounter = null;
  let shownSpiderResultEncounter = null;
  const locallyRewardedDragonEncounters = new Set();
  const touchMove = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false };
  let openProfileIdentity = "";
  let openProfileData = null;
  let leaderboardStat = "power";


  const bootsPickup = {
    x: 940,
    y: 3660,
    r: 18,
    collected: false
  };
  const inventory = { itemIds: [], equippedFeet: "", selectedItemId: "" };

  let hasSavedProgress = false;
  let progressLoaded = false;
  let progressLoadedIdentity = "";
  let waitingForFreshStart = false;
  let startupKind = null;
  let newPlayerIntroShown = false;
  let loadingStage = 0;
  let loadingStageStartedAt = performance.now();
  let loadingStageTimer = null;
  let loadingSequenceComplete = false;
  let guestContinuationChosen = false;
  let accountSignInPending = false;

  const player = {
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
    hurtClock: 0,
    facing: 0,
    moving: false
  };

  const dragonSprite = new Image();
  const dragonSpriteCanvas = document.createElement("canvas");
  const dragonSpriteCtx = dragonSpriteCanvas.getContext("2d", { willReadFrequently: true });
  let dragonSpriteReady = false;

  dragonSprite.addEventListener("load", () => {
    dragonSpriteCanvas.width = dragonSprite.naturalWidth;
    dragonSpriteCanvas.height = dragonSprite.naturalHeight;
    dragonSpriteCtx.drawImage(dragonSprite, 0, 0);
    const pixels = dragonSpriteCtx.getImageData(0, 0, dragonSpriteCanvas.width, dragonSpriteCanvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const red = pixels.data[i];
      const green = pixels.data[i + 1];
      const blue = pixels.data[i + 2];
      if (green > 145 && green > red * 1.45 && green > blue * 1.45) pixels.data[i + 3] = 0;
    }
    dragonSpriteCtx.putImageData(pixels, 0, 0);
    dragonSpriteReady = true;
  });
  dragonSprite.src = "assets/wildwood/dragon_boss_spritesheet.png";

  const spiderSprite = new Image();
  const spiderSpriteCanvas = document.createElement("canvas");
  const spiderSpriteCtx = spiderSpriteCanvas.getContext("2d", { willReadFrequently: true });
  let spiderSpriteReady = false;
  spiderSprite.addEventListener("load", () => {
    spiderSpriteCanvas.width = spiderSprite.naturalWidth;
    spiderSpriteCanvas.height = spiderSprite.naturalHeight;
    spiderSpriteCtx.drawImage(spiderSprite, 0, 0);
    const pixels = spiderSpriteCtx.getImageData(0, 0, spiderSpriteCanvas.width, spiderSpriteCanvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      if (green > 135 && green > red * 1.35 && green > blue * 1.35) pixels.data[index + 3] = 0;
    }
    spiderSpriteCtx.putImageData(pixels, 0, 0);
    spiderSpriteReady = true;
  });
  spiderSprite.src = "assets/wildwood/desert-spider-boss-spritesheet.png";

  const boss = {
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

  const spiderBoss = {
    isBoss: true,
    bossKind: "spider",
    x: 4050,
    y: 4050,
    r: 125,
    maxHp: 150_000_000,
    hp: 150_000_000,
    dead: false,
    hpLossFlashFrom: 150_000_000,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "web",
    web: null,
    encounter: null,
  };

  const playerSprite = new Image();
  let playerSpriteReady = false;
  const markPlayerSpriteReady = () => {
    playerSpriteReady = true;
    updateLoadingDetail();
    finishStartup();
  };
  playerSprite.addEventListener("load", markPlayerSpriteReady, { once: true });
  playerSprite.addEventListener("error", markPlayerSpriteReady, { once: true });
  playerSprite.src = "assets/wildwood/wildwood-player-spritesheet-flat-v1.png";
  const profileIconSheet = new Image();
  profileIconSheet.addEventListener("load", () => {
    if (!leaderboardEl.hidden) renderLeaderboard();
  });
  profileIconSheet.src = "assets/wildwood/profile-portraits-grid-v1.png";

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
  let treeSpriteBounds = [];
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
      return right > left && bottom > top
        ? { x: cellX + left, y: cellY + top, w: right - left, h: bottom - top }
        : { x: cellX, y: cellY, w: width, h: height };
    });
  }
  const treeSpritesheet = loadTreeSpritesheet(() => {
    if (treeSpritesheet.naturalWidth > 0) treeSpriteBounds = measureTreeSpriteBounds();
    treeSpritesheetReady = true;
    updateLoadingDetail();
    finishStartup();
  });
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

  function resize() {
    viewW = innerWidth;
    viewH = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  addEventListener("resize", resize);
  resize();

  function raycastProjectile(startX, startY, endX, endY, radius) {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return null;

    const invLength = 1 / Math.sqrt(lengthSq);
    let closestEnemy = null;
    let closestT = Infinity;

    const mapBoss = currentMapId === BEGINNER_DESERT_MAP_ID ? spiderBoss : boss;
    for (let index = -1; index < enemies.length; index++) {
      const e = index < 0 ? mapBoss : enemies[index];
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
  }

  function reset(preserveStats = false) {
    const mapSpawn = currentMapId === BEGINNER_DESERT_MAP_ID
      ? MAP_CONFIG[BEGINNER_DESERT_MAP_ID].arrival
      : START_SPAWN;
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
    updateHud();
  }

  function saveProgress() {
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
      equippedFeet: inventory.equippedFeet,
      enemyKills: totalKills,
    });
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
      const candidate = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY));
      if (candidate?.stats && typeof candidate.stats === "object") legacy = candidate;
    } catch {}
    const isDefaultProgress = (progress) =>
      progress.maxHp === BASE_PLAYER_HP && progress.damage === 4 && progress.attackRate === STARTING_ATTACK_INTERVAL &&
      progress.projectileSpeed === BASE_PROJECTILE_SPEED && progress.projectileCount === 1 &&
      progress.attackRange === BASE_ATTACK_RANGE && progress.armor === 0 && progress.regen === 0 &&
      progress.speed === BASE_PLAYER_SPEED && progress.bootsCollected === false;
    const serverIsDefault = isDefaultProgress(saved);
    const source = legacy && serverIsDefault
      ? { ...legacy.stats, bootsCollected: legacy.bootsCollected === true }
      : saved;

    if (waitingForFreshStart && saved.introComplete) return;

    const number = (value, fallback, min, max) =>
      Number.isFinite(value) ? clamp(value, min, max) : fallback;

    player.maxHp = number(source.maxHp, player.maxHp, 1, 1_000_000_000);
    player.damage = number(source.damage, player.damage, 1, 1000000);
    player.attackRate = number(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
    player.projectileSpeed = number(source.projectileSpeed, player.projectileSpeed, BASE_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED);
    player.projectileCount = Math.floor(number(source.projectileCount, player.projectileCount, 1, 20));
    player.attackRange = BASE_ATTACK_RANGE;
    player.armor = number(source.armor, player.armor, 0, MAX_ARMOR);
    player.regen = number(source.regen, player.regen, 0, 1000000);
    bootsPickup.collected = source.bootsCollected === true;
    player.hp = player.maxHp;
    const savedInventory = inventoryFromSave(source.inventoryJson, source.equippedFeet, bootsPickup.collected);
    inventory.itemIds = savedInventory.itemIds;
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
    if (hasStarted || running || !loadingSequenceComplete || !playerSpriteReady || !treeSpritesheetReady || !portalArchSettled || !portalSwirlSettled || !duelSpaceBackgroundReady || !duelPlatformArtReady ||
      !coop?.isConnected?.()) return;
    if (!account?.signedIn && !guestContinuationChosen) {
      showAccountChoice();
      return;
    }
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
    gameUpdateGateEl.hidden = !accountState?.updating;
  }

  function showAccountChoice() {
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

  function showSigningIn() {
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
    if (accountChoiceDetail) accountChoiceDetail.textContent = "LOADING YOUR CHARACTER…";
  }

  function updateLoadingDetail() {
    if (!loadingDetail || !loadingFill) return;
    const connectionNotice = coop?.accountState?.().notice || "";
    if (/active in another tab|logged in on another tab|signing out other tab|takeover failed/i.test(connectionNotice)) {
      loadingDetail.textContent = connectionNotice;
      loadingFill.style.width = "100%";
      return;
    }
    const stages = [
      ["LOADING CONNECTION", Boolean(coop?.isConnected?.()), 12],
      ["LOADING PLAYER PROFILE", Boolean(coop?.localState?.()), 35],
      ["LOADING SAVED PROGRESS", progressLoaded, 60],
      ["LOADING PLAYER SPRITE", playerSpriteReady, 78],
      ["LOADING WORLD ART", treeSpritesheetReady && portalArchSettled && portalSwirlSettled && duelSpaceBackgroundReady && duelPlatformArtReady, 90],
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
      inventory.itemIds = [TRAILBLAZER_BOOTS];
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

  function showMessage(text, color = "#fff") {
    messageEl.textContent = text;
    messageEl.style.color = color;
    messageEl.style.opacity = "1";
    messageClock = 1.45;
  }

  function logPickup(text, color) {
    const el = document.createElement("div");
    el.className = "pickup";
    el.textContent = text;
    el.style.color = color;
    pickupLog.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function spawnFromSite(site) {
    const base = ENEMY_TYPES[site.type];

    // Enemy stats stay fixed by enemy type.
    const maxHp = base.hp;

    enemies.push({
      type: site.type,
      siteId: site.id,
      campName: site.campName,
      x: site.x,
      y: site.y,
      homeX: site.x,
      homeY: site.y,
      vx: 0,
      vy: 0,
      r: base.r,
      hp: maxHp,
      maxHp,
      speed: base.speed,
      damage: base.damage,
      reward: base.reward,
      aggroRadius: base.aggro ?? 0,
      leashRange: site.leashRange,
      engaged: false,
      leashing: false,
      facingX: Math.random() < .5 ? -1 : 1,
      wandering: false,
      wanderTargetX: site.x,
      wanderTargetY: site.y,
      wanderWait: rand(1, 4),
      attackClock: base.ranged ? rand(.2, 1.2) : 0,
      moveSpeedRecovery: ENEMY_HIT_SPEED_RECOVERY_SECONDS,
      hurt: 0,
      dead: false,
      phase: Math.random() * TAU
    });

    site.alive = true;
    site.respawnAt = 0;
  }

  function engageEnemy(enemy) {
    const group = enemy.type === "Dune Archer"
      ? enemies.filter((candidate) => !candidate.dead && candidate.type === "Dune Archer")
      : [enemy];
    for (const candidate of group) {
      candidate.engaged = true;
      candidate.leashing = false;
      candidate.wandering = false;
    }
  }

  function updateRespawns() {
    for (const site of spawnSites) {
      if (!site.alive && site.respawnAt > 0 && gameTime >= site.respawnAt) {
        spawnFromSite(site);
        spawnBurst(site.x, site.y, "#76d978", 8, 55);
      }
    }
  }

  function spawnBurst(x, y, color, count = 8, speed = 75) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = rand(speed * .4, speed);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(.25, .7),
        maxLife: 1,
        size: randi(2, 5),
        color
      });
    }
  }

  function formatDamage(amount) {
    const units = [[1e9, "b"], [1e6, "m"], [1e3, "k"]];
    for (const [value, suffix] of units) {
      if (amount < value) continue;
      const scaled = amount / value;
      const digits = scaled >= 100 ? 0 : 1;
      return `${Number(scaled.toFixed(digits))}${suffix}`;
    }
    return String(Math.round(amount));
  }

  function spawnDamageNumber(x, y, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    damageNumbers.push({
      x: x + rand(-10, 10),
      y: y - 28,
      life: .72,
      maxLife: .72,
      text: `-${formatDamage(amount)}`,
    });
  }

  function fireAt(target) {
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

  function attackNearest(dt) {
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

    const mapBoss = currentMapId === BEGINNER_DESERT_MAP_ID ? spiderBoss : boss;
    if (!mapBoss.dead) {
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

  function applyReward(reward, x, y) {
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

  function showSpiderResult(result) {
    if (!result || shownSpiderResultEncounter === result.encounter) return;
    shownSpiderResultEncounter = result.encounter;
    pendingSpiderResultEncounter = null;
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

  function showDragonResult(result) {
    if (!result || !dragonResultEl || shownDragonResultEncounter === result.encounter) return;
    dragonResultTitle.textContent = "DRAGON DEFEATED";
    const worldHeading = dragonWorldNoticeEl.querySelector("strong");
    if (worldHeading) worldHeading.textContent = "DRAGON DEFEATED";
    shownDragonResultEncounter = result.encounter;
    pendingDragonResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === coop?.localIdentity?.());
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
      timer: 1.2,
      duration: 1.2,
      hitPlayer: false,
      pushAngle: null
    };
    boss.nextAttack = "rain";
  }

  function hitBossConeWave(cone, minRadius, maxRadius) {
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

  function resolveBossCone(cone) {
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

  function updateBoss(dt) {
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

  function updateSpiderBoss(dt) {
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

  function killEnemy(e) {
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

  function damagePlayer(amount) {
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

  function activeDuel() {
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

  function liveDuelPresentationState(duel) {
    const durationSeconds = Math.max(0, (duel.endsAtMs - duel.startsAtMs) / 1000);
    const elapsed = Math.max(0, Math.min(durationSeconds, (Date.now() - duel.startsAtMs) / 1000));
    const state = duelTimelineState(duel, elapsed);
    return { elapsed, state };
  }

  function syncLiveDuelDamageNumbers(duel) {
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

  function showDuelResult(replay) {
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

  async function openDuelReplay(replayId) {
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
    if (!isDueling()) return false;
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

  function updatePlayer(dt) {
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
    if (multiplayerActive) coop.syncSpeed(player.speed);

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
      if (Math.abs(mx) + Math.abs(my) > .1) player.facing = Math.atan2(my, mx);
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
      const highFrequency = coop.hasRemotePlayerInArea?.(
        camera.x - marginX,
        camera.y - marginY,
        camera.x + visibleW + marginX,
        camera.y + visibleH + marginY,
      ) ?? false;
      coop.syncPosition(player.x, player.y, player.facing, player.moving, multiplayerJustStarted, highFrequency);
    }

    player.hurtClock = Math.max(0, player.hurtClock - dt);
    if (player.regen > 0 && player.hp > 0) {
      player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    }

    if (autoAttackEnabled) attackNearest(dt);
  }

  function activePortal() {
    return MAP_CONFIG[currentMapId].portal;
  }

  function portalIsUnlocked() {
    return currentMapId !== TUTORIAL_FOREST_MAP_ID || Boolean(coop?.savedProgress?.()?.desertUnlocked);
  }

  function portalColliders() {
    const portal = activePortal();
    const colliders = [
      { x: portal.x - portal.width * .32, y: portal.y - 52, r: 22 },
      { x: portal.x + portal.width * .32, y: portal.y - 52, r: 22 },
    ];
    const emptyArch = currentMapId === BEGINNER_DESERT_MAP_ID
      ? MAP_CONFIG[BEGINNER_DESERT_MAP_ID].emptyArch
      : null;
    if (emptyArch) {
      colliders.push(
        { x: emptyArch.x - emptyArch.width * .32, y: emptyArch.y - 52, r: 22 },
        { x: emptyArch.x + emptyArch.width * .32, y: emptyArch.y - 52, r: 22 },
      );
    }
    return colliders;
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

  function updatePortal(dt) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (mapTransitioning || portalCooldown > 0 || isDueling() || !portalIsUnlocked()) return;
    const portal = activePortal();
    const triggerX = portal.x;
    const triggerY = portal.y - portal.height * .32;
    if (Math.hypot(player.x - triggerX, player.y - triggerY) > 48) return;

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
  }

  function reconcileMapFromServer() {
    if (!running || mapTransitioning || isDueling()) return;
    const state = coop?.localState?.();
    if (!state || state.mapId === currentMapId) return;
    if (state.mapId !== TUTORIAL_FOREST_MAP_ID && state.mapId !== BEGINNER_DESERT_MAP_ID) return;

    mapTransitioning = true;
    fadeToWorld(() => {
      loadMap(state.mapId, state.x, state.y, state.facing);
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

  function updateEnemies(dt) {
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

  function updateProjectiles(dt) {
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
          if (target.bossKind === "spider") {
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

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.03, dt);
      p.vy *= Math.pow(.03, dt);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function updateDamageNumbers(dt) {
    for (const number of damageNumbers) {
      number.life -= dt;
      number.y -= 34 * dt;
    }
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      if (damageNumbers[i].life <= 0) damageNumbers.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    const rangeIncrease = player.attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
    const targetZoom = clamp((1 - rangeIncrease * .5) * .85, MIN_CAMERA_ZOOM, 1);
    const zoomFollow = 1 - Math.pow(.0008, dt);
    camera.zoom += (targetZoom - camera.zoom) * zoomFollow;

    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const targetX = isDueling()
      ? DUEL_ARENA.x - visibleW / 2
      : clamp(player.x - visibleW / 2, 0, Math.max(0, WORLD.w - visibleW));
    const targetY = isDueling()
      ? DUEL_ARENA.y - visibleH / 2
      : clamp(player.y - visibleH / 2, 0, Math.max(0, WORLD.h - visibleH));
    const follow = 1 - Math.pow(.00006, dt);
    camera.x += (targetX - camera.x) * follow;
    camera.y += (targetY - camera.y) * follow;
  }

  function snapCameraToPlayer() {
    const rangeIncrease = player.attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
    camera.zoom = clamp((1 - rangeIncrease * .5) * .85, MIN_CAMERA_ZOOM, 1);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    camera.x = clamp(player.x - visibleW / 2, 0, Math.max(0, WORLD.w - visibleW));
    camera.y = clamp(player.y - visibleH / 2, 0, Math.max(0, WORLD.h - visibleH));
  }

  function fadeToWorld(onBlack) {
    if (duelExitFading) return;
    duelExitFading = true;
    sceneFadeEl.hidden = false;
    void sceneFadeEl.offsetWidth;
    sceneFadeEl.classList.add("is-visible");
    window.setTimeout(() => {
      onBlack();
      snapCameraToPlayer();
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

  function update(dt) {
    if (currentMapId === TUTORIAL_FOREST_MAP_ID) syncDragonState();
    if (currentMapId === BEGINNER_DESERT_MAP_ID) syncSpiderState();
    gameTime += dt;
    flash = Math.max(0, flash - dt);
    screenShake *= Math.pow(.01, dt);

    if (messageClock > 0) {
      messageClock -= dt;
      if (messageClock <= 0) messageEl.style.opacity = "0";
    }

    updatePlayer(dt);
    if (!isDueling()) {
      updatePortal(dt);
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) updateBootPickup();
      updateEnemies(dt);
      if (currentMapId === TUTORIAL_FOREST_MAP_ID) updateBoss(dt);
      if (currentMapId === BEGINNER_DESERT_MAP_ID) updateSpiderBoss(dt);
      updateProjectiles(dt);
      updateRespawns();
    } else {
      projectiles.length = 0;
      pendingDragonHits = 0;
      dragonHitBatchTimer = 0;
      pendingSpiderHits = 0;
      spiderHitBatchTimer = 0;
      enemyShots.length = 0;
    }
    updateParticles(dt);
    updateDamageNumbers(dt);
    updateCamera(dt);
    updateHud();
  }

  function drawGround() {
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (isArenaScene()) {
      if (duelSpaceBackground.complete && duelSpaceBackground.naturalWidth > 0) {
        ctx.fillStyle = "#050713";
        ctx.fillRect(0, 0, visibleW, visibleH);
        const rotateForPortrait = visibleH > visibleW;
        const backgroundW = rotateForPortrait
          ? duelSpaceBackground.naturalHeight
          : duelSpaceBackground.naturalWidth;
        const backgroundH = rotateForPortrait
          ? duelSpaceBackground.naturalWidth
          : duelSpaceBackground.naturalHeight;
        const scale = Math.max(
          visibleW / backgroundW,
          visibleH / backgroundH,
        );
        const drawW = duelSpaceBackground.naturalWidth * scale;
        const drawH = duelSpaceBackground.naturalHeight * scale;
        ctx.save();
        ctx.translate(visibleW / 2, visibleH / 2);
        if (rotateForPortrait) ctx.rotate(Math.PI / 2);
        ctx.drawImage(duelSpaceBackground, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        return;
      }
      ctx.fillStyle = "#03050a";
      ctx.fillRect(0, 0, visibleW, visibleH);
      const spacing = 42;
      for (let y = -spacing; y < visibleH + spacing; y += spacing) {
        for (let x = -spacing; x < visibleW + spacing; x += spacing) {
          const seed = ((Math.floor(x / spacing) * 73 + Math.floor(y / spacing) * 151) >>> 0);
          if (seed % 5 !== 0) continue;
          const size = seed % 17 === 0 ? 3 : 2;
          ctx.fillStyle = seed % 11 === 0 ? "#b7c9ff" : "#eef3ff";
          ctx.fillRect(x + (seed % 29), y + ((seed >>> 5) % 31), size, size);
        }
      }
      return;
    }
    const desert = currentMapId === BEGINNER_DESERT_MAP_ID;
    ctx.fillStyle = desert ? "#d9a95f" : "#31945b";
    ctx.fillRect(0, 0, visibleW, visibleH);

    for (const p of paths) {
      const x = Math.floor(p.x - camera.x);
      const y = Math.floor(p.y - camera.y);
      ctx.fillStyle = desert ? "#c48b4b" : "#8b6551";
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)";
      for (let yy = y + 7; yy < y + p.h; yy += 18) {
        for (let xx = x + ((yy / 18) % 2 ? 4 : 12); xx < x + p.w; xx += 24) {
          ctx.fillRect(xx, yy, 2, 2);
        }
      }
    }
  }

  function drawTree(o) {
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const x = Math.floor(o.x - camera.x);
    const y = Math.floor(o.y - camera.y);
    const drawSize = Math.round(154 * o.s);
    const halfWidth = Math.ceil(drawSize / 2);
    const cullPadding = drawSize + 32;
    if (
      x + halfWidth < -cullPadding ||
      x - halfWidth > visibleW + cullPadding ||
      y < -cullPadding ||
      y - drawSize > visibleH + cullPadding
    ) return;
    if (!treeSpritesheet.complete || treeSpritesheet.naturalWidth <= 0) return;

    const variant = o.variant % 16;
    const source = treeSpriteBounds[variant];
    if (!source) return;
    const drawHeight = drawSize;
    const drawWidth = Math.round(drawHeight * source.w / source.h);
    const drawX = Math.round(x - drawWidth / 2);
    const drawY = Math.round(y - drawHeight);
    drawActorShadow(x, y - 4, Math.round(drawWidth * .52), .12);
    ctx.drawImage(
      treeSpritesheet,
      source.x, source.y, source.w, source.h,
      drawX, drawY, drawWidth, drawHeight,
    );
  }

  function drawPortal() {
    if (!portalArch.complete || portalArch.naturalWidth <= 0) return;
    const portal = activePortal();
    const x = Math.round(portal.x - camera.x);
    const y = Math.round(portal.y - camera.y);
    drawActorShadow(x, y - 4, Math.round(portal.width * .68), .14);
    if (portalIsUnlocked() && portalSwirl.complete && portalSwirl.naturalWidth > 0) {
      const frameStep = Math.floor(gameTime * 10) % 30;
      const frame = frameStep <= 15 ? frameStep : 30 - frameStep;
      const cell = portalSwirl.naturalWidth / 4;
      const portalWidth = Math.round(portal.width * .59 * 1.265);
      const portalHeight = Math.round(portal.height * .75 * 1.265);
      ctx.drawImage(
        portalSwirl,
        (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell,
        Math.round(x - portalWidth / 2), Math.round(y - portalHeight - 5), portalWidth, portalHeight,
      );
    }
    ctx.drawImage(
      portalArch,
      Math.round(x - portal.width / 2), Math.round(y - portal.height), portal.width, portal.height,
    );
    if (portalIsUnlocked()) {
      const destination = MAP_CONFIG[portal.destination].name;
      const floatY = Math.sin(gameTime * 2.4) * 3;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      outlinedText(destination, x, Math.round(y - portal.height - 8 + floatY), "#f5e9c4", 4);
      ctx.restore();
    }
  }

  function drawEmptyDesertArch() {
    if (currentMapId !== BEGINNER_DESERT_MAP_ID || !portalArch.complete || portalArch.naturalWidth <= 0) return;
    const arch = MAP_CONFIG[BEGINNER_DESERT_MAP_ID].emptyArch;
    const x = Math.round(arch.x - camera.x);
    const y = Math.round(arch.y - camera.y);
    drawActorShadow(x, y - 4, Math.round(arch.width * .68), .14);
    ctx.drawImage(
      portalArch,
      Math.round(x - arch.width / 2), Math.round(y - arch.height), arch.width, arch.height,
    );
  }

  function drawCactus(o) {
    const x = Math.round(o.x - camera.x);
    const y = Math.round(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x < -90 || y < -100 || x > visibleW + 90 || y > visibleH + 50) return;
    const h = Math.round(68 * o.s);
    const w = Math.max(10, Math.round(15 * o.s));
    drawActorShadow(x, y - 2, Math.round(46 * o.s), .12);
    ctx.fillStyle = "#245a36";
    ctx.fillRect(x - w / 2 - 2, y - h, w + 4, h);
    ctx.fillStyle = "#3f8050";
    ctx.fillRect(x - w / 2, y - h, w - 2, h - 4);
    ctx.fillStyle = "#70a961";
    ctx.fillRect(x - w / 2 + 2, y - h + 4, 3, h - 10);
    const armY = y - Math.round(h * .58);
    const direction = o.variant % 2 ? -1 : 1;
    ctx.fillStyle = "#245a36";
    ctx.fillRect(x + direction * (w / 2 - 1), armY, direction * Math.round(19 * o.s), Math.round(10 * o.s));
    ctx.fillRect(x + direction * Math.round(16 * o.s), armY - Math.round(18 * o.s), Math.round(10 * o.s), Math.round(27 * o.s));
    ctx.fillStyle = "#3f8050";
    ctx.fillRect(x + direction * Math.round(14 * o.s), armY - Math.round(16 * o.s), direction * Math.round(8 * o.s), Math.round(23 * o.s));
  }

  function drawDesertRock(o) {
    const x = Math.round(o.x - camera.x);
    const y = Math.round(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x < -60 || y < -60 || x > visibleW + 60 || y > visibleH + 40) return;
    const w = Math.round(35 * o.s);
    const h = Math.round(22 * o.s);
    drawActorShadow(x, y, Math.round(w * 1.2), .11);
    ctx.fillStyle = "#79543d";
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w * .32, y - h * .72);
    ctx.lineTo(x + w * .2, y - h);
    ctx.lineTo(x + w / 2, y - h * .28);
    ctx.lineTo(x + w * .38, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b77b4b";
    ctx.beginPath();
    ctx.moveTo(x - w * .32, y - h * .72);
    ctx.lineTo(x + w * .2, y - h);
    ctx.lineTo(x + w * .12, y - h * .45);
    ctx.closePath();
    ctx.fill();
  }

  function drawDune(o) {
    const x = Math.round(o.x - camera.x);
    const y = Math.round(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x + o.w / 2 < -40 || x - o.w / 2 > visibleW + 40 || y < -80 || y - o.h > visibleH + 40) return;
    ctx.save();
    ctx.fillStyle = o.variant % 2 ? "#c58b48" : "#c9934e";
    ctx.beginPath();
    ctx.ellipse(x, y, o.w / 2, o.h / 2, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = o.variant % 2 ? "#e3b66b" : "#e9bd72";
    ctx.beginPath();
    ctx.ellipse(x - o.w * .08, y - o.h * .08, o.w * .39, o.h * .25, 0, Math.PI, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(119,71,36,.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, o.w * .38, o.h * .32, 0, Math.PI * 1.08, Math.PI * 1.88);
    ctx.stroke();
    ctx.restore();
  }

  function drawDesertGrass(o) {
    const x = Math.round(o.x - camera.x);
    const y = Math.round(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x < -10 || y < -10 || x > visibleW + 10 || y > visibleH + 10) return;
    ctx.fillStyle = o.variant % 2 ? "#8b7b3d" : "#a28a43";
    ctx.fillRect(x - 1, y - 6, 2, 7);
    ctx.fillRect(x - 5, y - 3, 2, 5);
    ctx.fillRect(x + 3, y - 4, 2, 6);
  }

  function drawGrass(o) {
    const x = Math.floor(o.x - camera.x);
    const y = Math.floor(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x < -8 || y < -8 || x > visibleW + 8 || y > visibleH + 8) return;
    ctx.fillStyle = o.variant % 2 ? "#237b49" : "#267f4c";
    ctx.fillRect(x - 1, y - 5, 2, 7);
    ctx.fillRect(x - 5, y - 2, 2, 5);
    ctx.fillRect(x + 3, y - 3, 2, 6);
    if (o.variant > 1) ctx.fillRect(x + 6, y, 2, 3);
  }

  function drawPetal(o) {
    const x = Math.floor(o.x - camera.x);
    const y = Math.floor(o.y - camera.y);
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    if (x < -8 || y < -8 || x > visibleW + 8 || y > visibleH + 8) return;
    ctx.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][o.variant % 3];
    ctx.fillRect(x - 3, y - 1, 7, 3);
    ctx.fillRect(x - 1, y - 3, 3, 7);
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillRect(x, y, 1, 1);
  }

  function drawDecor() {
    for (const o of decor) if (o.type === "dune") drawDune(o);
    for (const o of decor) if (o.type === "grass") drawGrass(o);
    for (const o of decor) if (o.type === "petal") drawPetal(o);
    for (const o of decor) if (o.type === "desertGrass") drawDesertGrass(o);
    for (const o of decor) if (o.type === "rock") drawDesertRock(o);
  }

  function drawActorShadow(x, y, width, alpha = .38) {
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

  function drawDuelArena() {
    if (!isArenaScene()) return;
    const x = DUEL_ARENA.x - camera.x;
    const y = DUEL_ARENA.y - camera.y;
    const displayRadius = DUEL_ARENA.r * .75;
    if (duelPlatformArt.complete && duelPlatformArt.naturalWidth > 0) {
      const drawSize = displayRadius * 2.16;
      ctx.drawImage(duelPlatformArt, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
      return;
    }
    ctx.save();
    ctx.fillStyle = "#697174";
    ctx.beginPath();
    ctx.arc(x, y, displayRadius, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#aeb8ba";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(235,239,238,.46)";
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.arc(x, y, displayRadius - 18, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawDuelShots(shots) {
    for (const shot of shots) {
      ctx.fillStyle = shot.color;
      pixelCircle(shot.x - camera.x, shot.y - camera.y, 6);
    }
  }

  function drawDuelCombatant(actor) {
    const x = Math.floor(actor.x - camera.x);
    const y = Math.floor(actor.y - camera.y);
    drawActorShadow(x, y + 29, 54, actor.isLocal ? .21 : .17);

    if (playerSprite.complete && playerSprite.naturalWidth > 0) {
      const cellW = playerSprite.naturalWidth / 4;
      const cellH = playerSprite.naturalHeight / 4;
      const fx = Math.cos(actor.facing);
      const fy = Math.sin(actor.facing);
      const row = Math.abs(fx) > Math.abs(fy)
        ? (fx < 0 ? 1 : 2)
        : (fy < 0 ? 3 : 0);
      const frame = 0;
      const drawSize = 96;
      const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
      const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
      ctx.save();
      ctx.globalAlpha = actor.isLocal ? 1 : .88;
      ctx.drawImage(
        playerSprite,
        frame * cellW, row * cellH, cellW, cellH,
        Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT), Math.floor(y - drawSize / 2 + offsetY), drawSize, drawSize
      );
      ctx.restore();
    }

    drawActorStatus({
      x, y,
      identity: actor.identity,
      name: actor.name,
      nameColor: actor.isLocal ? "#ffffff" : "#9eeeff",
      hp: actor.hp,
      maxHp: actor.maxHp,
      power: null,
      fillColor: actor.isLocal ? "#46cf5a" : "#55a9c6",
    });
  }

  function drawDamageNumbers() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 19px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    for (const number of damageNumbers) {
      const alpha = clamp(number.life / number.maxLife, 0, 1);
      const x = Math.floor(number.x - camera.x);
      const y = Math.floor(number.y - camera.y);
      ctx.globalAlpha = alpha;
      outlinedText(number.text, x, y, "#ff5a5a", 3);
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

  function publicPlayerName(identity, name) {
    const baseName = name || "PLAYER";
    const guestName = coop?.isGuest?.(identity) ? `${baseName} (guest)` : baseName;
    return isDeveloperIdentity(identity) ? `${DEVELOPER_BADGE} ${guestName}` : guestName;
  }

  function renderDomPlayerName(element, identity, name) {
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

  function applyProfileIcon(element, iconIndex) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const column = index % 8;
    const row = Math.floor(index / 8);
    element.style.backgroundPosition = `${column / 7 * 100}% ${row / 7 * 100}%`;
    element.dataset.profileIcon = String(index);
  }

  function paintProfileIconCanvas(canvas, iconIndex) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const iconContext = canvas.getContext("2d");
    if (!iconContext) return;
    iconContext.clearRect(0, 0, canvas.width, canvas.height);
    if (!profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
    const cellWidth = profileIconSheet.naturalWidth / 8;
    const cellHeight = profileIconSheet.naturalHeight / 8;
    iconContext.imageSmoothingEnabled = true;
    iconContext.drawImage(
      profileIconSheet,
      (index % 8) * cellWidth,
      Math.floor(index / 8) * cellHeight,
      cellWidth,
      cellHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  function drawProfileIcon(identity, x, bottom, size = 15) {
    if (!identity || !profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
    const index = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(identity) ?? 0)));
    const cellW = profileIconSheet.naturalWidth / 8;
    const cellH = profileIconSheet.naturalHeight / 8;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      profileIconSheet,
      (index % 8) * cellW, Math.floor(index / 8) * cellH, cellW, cellH,
      Math.round(x), Math.round(bottom - size), size, size,
    );
    ctx.restore();
  }

  function drawPlayer() {
    const x = Math.floor(player.x - camera.x);
    const y = Math.floor(player.y - camera.y);
    drawActorShadow(x, y + 29, 54, .21);

    if (playerSprite.complete && playerSprite.naturalWidth > 0) {
      const cellW = playerSprite.naturalWidth / 4;
      const cellH = playerSprite.naturalHeight / 4;
      const fx = Math.cos(player.facing);
      const fy = Math.sin(player.facing);
      const row = Math.abs(fx) > Math.abs(fy)
        ? (fx < 0 ? 1 : 2)
        : (fy < 0 ? 3 : 0);
      const frame = player.moving ? Math.floor(gameTime * 10) % 4 : 0;
      const drawSize = 96;
      const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
      const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
      ctx.drawImage(
        playerSprite,
        frame * cellW, row * cellH, cellW, cellH,
        Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT), Math.floor(y - drawSize / 2 + offsetY), drawSize, drawSize
      );
    }

    drawActorStatus({
      x, y,
      identity: coop?.localIdentity?.(),
      name: publicPlayerName(coop?.localIdentity?.(), coop?.localDisplayName?.()),
      nameColor: "#ffffff",
      hp: player.hp,
      maxHp: player.maxHp,
      power: playerPower(player),
      fillColor: "#46cf5a",
    });
    drawSpeechBubble(coop?.localIdentity?.(), x, y);
  }

  function updateSpeechBubbles() {
    activeSpeechBubbles = new Map();
    const now = Date.now();
    const messages = coop?.chatMessages?.() ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const age = now - message.sentAtMs;
      if (age < 0 || age >= SPEECH_BUBBLE_DURATION_MS) continue;
      if (message.senderName === "DUEL" || message.replayId > 0n || activeSpeechBubbles.has(message.sender)) continue;
      activeSpeechBubbles.set(message.sender, { text: message.message, age });
    }
  }

  function wrapSpeechBubbleText(text, maxWidth) {
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

  function drawSpeechBubble(identity, x, y) {
    const bubble = activeSpeechBubbles.get(identity);
    if (!bubble) return;
    const fadeStart = SPEECH_BUBBLE_DURATION_MS - SPEECH_BUBBLE_FADE_MS;
    const opacity = bubble.age <= fadeStart
      ? 1
      : clamp(1 - (bubble.age - fadeStart) / SPEECH_BUBBLE_FADE_MS, 0, 1);
    const maxTextWidth = 190;
    const paddingX = 10;
    const paddingY = 7;
    const lineHeight = 15;

    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const lines = wrapSpeechBubbleText(bubble.text, maxTextWidth);
    const textWidth = Math.max(28, ...lines.map((line) => ctx.measureText(line).width));
    const width = Math.ceil(textWidth + paddingX * 2);
    const height = lines.length * lineHeight + paddingY * 2;
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
    lines.forEach((line, index) => {
      ctx.fillText(line, centerX, top + paddingY + lineHeight * (index + .5));
    });
    ctx.restore();
  }

  function drawActorStatus({ x, y, identity, name, nameColor, hp, maxHp, power, fillColor }) {
    const centerX = Math.round(x);
    const barW = 87;
    const barH = WORLD_HEALTH_BAR_HEIGHT;
    const barX = centerX - Math.floor(barW / 2);
    const barY = Math.round(y - 54);
    const hpRatio = clamp(hp / maxHp, 0, 1);
    const fillWidth = Math.round(barW * hpRatio);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(hp)))} / ${formatCompactNumber(Math.ceil(maxHp))} HP`;

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
    ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(hpLabel, centerX, barY + barH / 2, "#ffffff", 1.5);
    ctx.restore();

    drawPlayerIdentity(identity, name, power, centerX, barY - 7, nameColor);
  }

  function drawPlayerIdentity(_identity, name, power, centerX, bottom, color) {
    if (!name) return;
    const powerLabel = power === null ? "" : `Power: ${formatCompactNumber(power)}`;
    ctx.save();
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "bottom";
    const nameWidth = ctx.measureText(name).width;
    const powerWidth = powerLabel ? ctx.measureText(powerLabel).width : 0;
    const textWidth = Math.max(nameWidth, powerWidth);
    const textLeft = Math.round(centerX - textWidth / 2);
    const nameBottom = powerLabel ? bottom - 16 : bottom;
    const developerPrefix = `${DEVELOPER_BADGE} `;
    if (name.startsWith(developerPrefix)) {
      const playerName = name.slice(developerPrefix.length);
      const prefixWidth = ctx.measureText(developerPrefix).width;
      ctx.textAlign = "left";
      outlinedText(developerPrefix, textLeft, nameBottom, "#ffd85b", 2);
      outlinedText(playerName, textLeft + prefixWidth, nameBottom, color, 2);
    } else {
      ctx.textAlign = "left";
      outlinedText(name, textLeft, nameBottom, color, 2);
    }
    if (powerLabel) outlinedText(powerLabel, textLeft, bottom, "#ffe05d", 2);
    ctx.restore();
  }

  function playerPower(stats) {
    const attackSpeedMultiplier = STARTING_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
    return Math.min(0xffffffff, Math.round(
      stats.damage * attackSpeedMultiplier +
      stats.maxHp +
      stats.armor * 3 +
      stats.regen * 10,
    ));
  }

  function drawRemotePlayers(remotePlayers) {
    if (!coop) return;

    for (const other of remotePlayers) {
      const x = Math.floor(other.x - camera.x);
      const y = Math.floor(other.y - camera.y);
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      if (x < -65 || y < -70 || x > visibleW + 65 || y > visibleH + 70) continue;
      drawActorShadow(x, y + 29, 54, .16);

      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        const cellW = playerSprite.naturalWidth / 4;
        const cellH = playerSprite.naturalHeight / 4;
        const fx = Math.cos(other.facing);
        const fy = Math.sin(other.facing);
        const row = Math.abs(fx) > Math.abs(fy)
          ? (fx < 0 ? 1 : 2)
          : (fy < 0 ? 3 : 0);
        const frame = other.moving ? Math.floor(gameTime * 10) % 4 : 0;
        const drawSize = 96;
        const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
        const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
        ctx.save();
        ctx.globalAlpha = .82;
        ctx.drawImage(
          playerSprite,
          frame * cellW, row * cellH, cellW, cellH,
          Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT), Math.floor(y - drawSize / 2 + offsetY), drawSize, drawSize
        );
        ctx.restore();
      }

      drawActorStatus({
        x, y,
        identity: other.id,
        name: publicPlayerName(other.id, other.name),
        nameColor: "#9eeeff",
        hp: other.hp,
        maxHp: other.maxHp,
        power: Number.isFinite(other.power) ? other.power : playerPower(other),
        fillColor: "#55a9c6",
      });
      drawSpeechBubble(other.id, x, y);
    }
  }

  function drawBossTelegraphs() {
    if (boss.dead) return;

    if (boss.cone) {
      const x = boss.x - camera.x;
      const y = boss.y - camera.y;
      const cone = boss.cone;
      ctx.save();
      ctx.fillStyle = "rgba(255,52,42,.20)";
      ctx.strokeStyle = "rgba(255,92,64,.92)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, BOSS_CONE_RANGE, cone.angle - BOSS_CONE_HALF_ANGLE, cone.angle + BOSS_CONE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const progress = clamp(1 - cone.timer / cone.duration, 0, 1);
      const waveRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * progress;
      const fireballCount = 9;
      for (let i = 0; i < fireballCount; i++) {
        const fraction = i / (fireballCount - 1);
        const angle = cone.angle - BOSS_CONE_HALF_ANGLE + fraction * BOSS_CONE_HALF_ANGLE * 2;
        const fireX = x + Math.cos(angle) * waveRadius;
        const fireY = y + Math.sin(angle) * waveRadius;
        ctx.fillStyle = "#a83218";
        pixelCircle(fireX, fireY, 15);
        ctx.fillStyle = "#ff6a28";
        pixelCircle(fireX, fireY - 2, 11);
        ctx.fillStyle = "#ffd05c";
        pixelCircle(fireX, fireY - 4, 6);
      }
      ctx.restore();
    }

    for (const strike of bossRain) {
      const x = strike.x - camera.x;
      const y = strike.y - camera.y;
      const progress = 1 - clamp(strike.timer / strike.maxTimer, 0, 1);
      const fallY = y - 150 * (1 - progress);

      ctx.save();
      ctx.strokeStyle = "rgba(255,70,54,.92)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, strike.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#ff5b36";
      pixelCircle(x, fallY, 9);
      ctx.fillStyle = "#ffd05c";
      pixelCircle(x, fallY, 5);
      ctx.restore();
    }
  }

  function drawBoss() {
    if (boss.dead || !dragonSpriteReady) return;

    const cellW = dragonSpriteCanvas.width / 4;
    const frame = Math.floor(gameTime * 4) % 4;
    const drawW = 300;
    const drawH = 400;
    const x = Math.floor(boss.x - camera.x);
    const y = Math.floor(boss.y - camera.y);
    drawActorShadow(x, y + 93, 188, .24);

    ctx.drawImage(
      dragonSpriteCanvas,
      frame * cellW, 0, cellW, dragonSpriteCanvas.height,
      Math.floor(x - drawW / 2), Math.floor(y - drawH / 2), drawW, drawH
    );

    const barW = 220;
    const barH = 20;
    const barX = x - Math.floor(barW / 2);
    const barY = y - drawH / 2 - 20;
    const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);

    ctx.fillStyle = "rgba(0,0,0,.86)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#4d1d1d";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "#d8352d";
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
    if (boss.hpLossFlashTimer > 0 && boss.hpLossFlashFrom > boss.hp) {
      const flashFromRatio = clamp(boss.hpLossFlashFrom / boss.maxHp, hpRatio, 1);
      const flashX = barX + Math.round(barW * hpRatio);
      const flashRight = barX + Math.round(barW * flashFromRatio);
      ctx.save();
      ctx.globalAlpha = clamp(boss.hpLossFlashTimer / DRAGON_HP_LOSS_FLASH_DURATION, 0, 1);
      ctx.fillStyle = "#fff";
      ctx.fillRect(flashX, barY, Math.max(1, flashRight - flashX), barH);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(boss.hp)))} / ${formatCompactNumber(Math.ceil(boss.maxHp))} HP`, x, barY + barH / 2, "#fff", 3);
    ctx.textBaseline = "bottom";
    outlinedText("DRAGON", x, barY - 18, "#f5e9c4", 3);
    outlinedText("+650 DAMAGE", x, barY - 5, "#ff655a", 3);
    ctx.restore();
  }

  function drawSpiderTelegraphs() {
    if (spiderBoss.dead) return;
    const x = spiderBoss.x - camera.x;
    const y = spiderBoss.y - camera.y;
    if (spiderBoss.web) {
      const progress = clamp(1 - spiderBoss.web.timer / spiderBoss.web.duration, 0, 1);
      const radius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * progress;
      ctx.save();
      ctx.strokeStyle = "rgba(235,239,218,.9)";
      ctx.lineWidth = 7;
      ctx.setLineDash([13, 10]);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    for (const pool of spiderVenom) {
      const progress = 1 - clamp(pool.timer / pool.maxTimer, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(113,214,71,${.12 + progress * .18})`;
      ctx.strokeStyle = "rgba(155,238,88,.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pool.x - camera.x, pool.y - camera.y, pool.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSpiderBoss() {
    if (spiderBoss.dead || !spiderSpriteReady) return;
    const cellW = spiderSpriteCanvas.width / 4;
    const cellH = spiderSpriteCanvas.height / 2;
    const frame = Math.floor(gameTime * 5) % 8;
    const column = frame % 4;
    const row = Math.floor(frame / 4);
    const drawW = 310;
    const drawH = 155;
    const x = Math.floor(spiderBoss.x - camera.x);
    const y = Math.floor(spiderBoss.y - camera.y);
    drawActorShadow(x, y + 55, 220, .24);
    ctx.drawImage(
      spiderSpriteCanvas,
      column * cellW, row * cellH, cellW, cellH,
      Math.floor(x - drawW / 2), Math.floor(y - drawH / 2), drawW, drawH,
    );

    const barW = 250;
    const barH = 22;
    const barX = x - Math.floor(barW / 2);
    const barY = y - drawH / 2 - 32;
    const hpRatio = clamp(spiderBoss.hp / spiderBoss.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,.86)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#342027";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "#9f5c2f";
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
    if (spiderBoss.hpLossFlashTimer > 0 && spiderBoss.hpLossFlashFrom > spiderBoss.hp) {
      const fromRatio = clamp(spiderBoss.hpLossFlashFrom / spiderBoss.maxHp, hpRatio, 1);
      ctx.save();
      ctx.globalAlpha = clamp(spiderBoss.hpLossFlashTimer / DRAGON_HP_LOSS_FLASH_DURATION, 0, 1);
      ctx.fillStyle = "#fff";
      ctx.fillRect(barX + Math.round(barW * hpRatio), barY, Math.max(1, Math.round(barW * (fromRatio - hpRatio))), barH);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(spiderBoss.hp)))} / ${formatCompactNumber(Math.ceil(spiderBoss.maxHp))} HP`, x, barY + barH / 2, "#fff", 3);
    ctx.textBaseline = "bottom";
    outlinedText("DESERT SPIDER", x, barY - 18, "#f5e9c4", 3);
    outlinedText("+100K MAX HEALTH", x, barY - 5, "#6fe48e", 3);
    ctx.restore();
  }

  function drawEnemy(e) {
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const x = Math.floor(e.x - camera.x);
    const y = Math.floor(e.y - camera.y);
    const base = ENEMY_TYPES[e.type];
    if (x < -80 || y < -80 || x > visibleW + 80 || y > visibleH + 80) return;

    const sprite = ENEMY_SPRITES[e.type];
    const spriteReady = sprite?.layers
      ? sprite.layers.every((layer) => layer.image.complete && layer.image.naturalWidth > 0)
      : sprite?.image.complete && sprite.image.naturalWidth > 0;
    const spriteHeight = spriteReady
      ? (sprite.height ?? sprite.size * sprite.image.naturalHeight / sprite.image.naturalWidth)
      : e.r * 2;
    const shadowWidth = Math.max(34, Math.min(76, (sprite?.size ?? e.r * 2) * .9));
    const shadowY = y + Math.max(10, Math.min(30, spriteHeight / 2 - 4));
    drawActorShadow(x, shadowY, shadowWidth, .36);

    ctx.save();
    ctx.translate(x, y);
    if (e.facingX < 0) ctx.scale(-1, 1);

    if (spriteReady) {
      ctx.globalAlpha = e.hurt > 0 ? .7 : 1;
      if (sprite.layers) {
        for (const layer of sprite.layers) {
          ctx.drawImage(layer.image, layer.x, layer.y - 3, layer.w, layer.h);
        }
      } else {
        ctx.drawImage(sprite.image, -sprite.size / 2, -spriteHeight / 2 - 3, sprite.size, spriteHeight);
      }
    } else {
      ctx.fillStyle = base.outline;
      pixelCircle(0, 0, e.r + 3);
      ctx.fillStyle = e.hurt > 0 ? "#fff3d0" : base.color;
      pixelCircle(0, 0, e.r);
    }

    ctx.restore();

    const reward = REWARD_DATA[e.reward.type];
    const visualRadius = Math.max(e.r, spriteHeight / 2);
    const rewardY = y + visualRadius + 10;
    const barW = Math.max(50, Math.min(86, (sprite?.size ?? e.r * 2) * 1.26));
    const barH = WORLD_HEALTH_BAR_HEIGHT;
    const barX = Math.round(x - barW / 2);
    const barY = Math.round(y - spriteHeight / 2 - 17);
    const hpRatio = clamp(e.hp / e.maxHp, 0, 1);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(e.hp)))} / ${formatCompactNumber(Math.ceil(e.maxHp))} HP`;

    ctx.fillStyle = "rgba(0,0,0,.86)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#472225";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = e.hurt > 0 ? "#fff1b6" : "#55d568";
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    outlinedText(e.type, x, barY - 4, "#f5e9c4", 3);

    ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "middle";
    outlinedText(hpLabel, x, barY + barH / 2, "#ffffff", 1.5);

    const label = rewardLabel(e.reward);
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "top";
    outlinedText(label, x, rewardY, reward.color, 3);
    ctx.restore();
  }

  function drawProjectile(p, enemy = false) {
    const x = Math.floor(p.x - camera.x);
    const y = Math.floor(p.y - camera.y);
    ctx.fillStyle = enemy ? "#d67cff" : "#5a250d";
    pixelCircle(x, y, p.r + 2);
    ctx.fillStyle = enemy ? "#f3c5ff" : "#ffe76a";
    pixelCircle(x, y, p.r);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / (p.maxLife || 1), 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(
        Math.floor(p.x - camera.x),
        Math.floor(p.y - camera.y),
        p.size,
        p.size
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawDepthSortedWorld(remotePlayers) {
    const layers = [];
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const treeCullPadding = 240;
    for (const tree of decor) {
      if (tree.type === "cactus") {
        layers.push({ depth: tree.y, priority: 2, draw: () => drawCactus(tree) });
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
      layers.push({ depth: tree.y, priority: 2, draw: () => drawTree(tree) });
    }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      layers.push({ depth: enemy.y + enemy.r, priority: 1, draw: () => drawEnemy(enemy) });
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !boss.dead) {
      layers.push({ depth: boss.y + 93, priority: 1, draw: drawBoss });
    }
    if (currentMapId === BEGINNER_DESERT_MAP_ID && !spiderBoss.dead) {
      layers.push({ depth: spiderBoss.y + 55, priority: 1, draw: drawSpiderBoss });
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !bootsPickup.collected) {
      layers.push({ depth: bootsPickup.y + bootsPickup.r, priority: 1, draw: drawBootPickup });
    }
    layers.push({ depth: activePortal().depth, priority: 2, draw: drawPortal });
    if (currentMapId === BEGINNER_DESERT_MAP_ID) {
      layers.push({ depth: MAP_CONFIG[BEGINNER_DESERT_MAP_ID].emptyArch.depth, priority: 2, draw: drawEmptyDesertArch });
    }
    for (const remotePlayer of remotePlayers) {
      layers.push({
        depth: remotePlayer.y + 29,
        priority: 1,
        draw: () => drawRemotePlayers([remotePlayer]),
      });
    }
    layers.push({ depth: player.y + 29, priority: 1, draw: drawPlayer });
    layers.sort((a, b) => a.depth - b.depth || a.priority - b.priority);
    for (const layer of layers) layer.draw();
  }

  function drawMinimap(remotePlayers) {
    const size = Math.min(180, Math.max(110, viewW * .17));
    const x = viewW - size;
    const y = 0;

    ctx.save();
    ctx.fillStyle = "rgba(12,18,15,.82)";
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 2;
    roundRect(x, y, size, size, 10);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.font = '900 9px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    outlinedText(MAP_CONFIG[currentMapId].name, x + size / 2, y + 7, "#f5f5e9", 1.5);
    ctx.restore();

    const sx = size / WORLD.w;
    const sy = size / WORLD.h;

    ctx.save();
    roundRect(x+5, y+5, size-10, size-10, 7);
    ctx.clip();

    ctx.fillStyle = currentMapId === BEGINNER_DESERT_MAP_ID ? "#d9a95f" : "#31945b";
    ctx.fillRect(x+5, y+5, size-10, size-10);

    ctx.fillStyle = currentMapId === BEGINNER_DESERT_MAP_ID ? "#c48b4b" : "#8b6551";
    for (const p of paths) {
      ctx.fillRect(x + p.x*sx, y + p.y*sy, p.w*sx, p.h*sy);
    }

    ctx.fillStyle = "#ff5d5d";
    for (const e of enemies) {
      const markerSize = ENEMY_TYPES[e.type].elite ? 5 : 3;
      ctx.fillRect(x + e.x*sx - 1, y + e.y*sy - 1, markerSize, markerSize);
    }

    ctx.fillStyle = "#58e878";
    for (const other of remotePlayers) {
      ctx.fillRect(x + other.x*sx - 2, y + other.y*sy - 2, 5, 5);
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(x + player.x*sx - 2, y + player.y*sy - 2, 5, 5);

    ctx.strokeStyle = "rgba(255,255,255,.52)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + camera.x*sx, y + camera.y*sy, (viewW / camera.zoom)*sx, (viewH / camera.zoom)*sy);
    ctx.restore();
    ctx.restore();
  }

  function duelCameraPosition() {
    const zoom = Math.min(1, Math.max(.65, Math.min(viewW, viewH) / 820));
    camera.zoom = zoom;
    camera.x = DUEL_ARENA.x - viewW / zoom / 2;
    camera.y = DUEL_ARENA.y - viewH / zoom / 2;
  }

  function liveDuelScene(remotePlayers) {
    const duel = activeDuel();
    if (!duel) return null;
    const presentation = liveDuelPresentationState(duel);
    const localId = coop?.localIdentity?.();
    const remoteName = (identity) => {
      const visible = remotePlayers.find((other) => other.id === identity)?.name;
      return visible || coop?.playerDisplayName?.(identity) || "OPPONENT";
    };
    const actor = (identity, isChallenger) => ({
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

  function timelineDuelShots(duel, elapsed, limits) {
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

  function liveDuelShots(duel, presentation = liveDuelPresentationState(duel)) {
    return timelineDuelShots(duel, presentation.elapsed, presentation.state);
  }

  function replayDuelShots(replay, elapsed) {
    return timelineDuelShots(replay, elapsed, {
      challengerAttacks: replay.challengerAttacks,
      opponentAttacks: replay.opponentAttacks,
    });
  }

  function replayDuelScene() {
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
    const actor = (isChallenger) => ({
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

  function renderDuelScene(scene) {
    duelCameraPosition();
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    drawGround();
    const floatY = Math.sin(performance.now() / 1000 * 1.2) * 7;
    ctx.save();
    ctx.translate(0, floatY);
    drawDuelArena();
    drawDuelShots(scene.shots);
    drawDuelCombatant(scene.challenger);
    drawDuelCombatant(scene.opponent);
    drawDamageNumbers();
    ctx.restore();
    ctx.restore();
    duelCountdownEl.textContent = String(scene.countdown || "");
    duelCountdownEl.hidden = !scene.countdown;
    drawVignette();
  }

  function render() {
    const remotePlayers = coop ? coop.remotePlayers() : [];
    updateSpeechBubbles();
    if (replayMode) {
      renderDuelScene(replayDuelScene());
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
    ctx.save();

    const sx = screenShakeEnabled && screenShake > .2 ? rand(-screenShake, screenShake) : 0;
    const sy = screenShakeEnabled && screenShake > .2 ? rand(-screenShake, screenShake) : 0;
    ctx.translate(sx, sy);
    ctx.scale(camera.zoom, camera.zoom);

    drawGround();
    drawDuelArena();
    if (!isDueling()) drawDecor();
    if (!isDueling() && currentMapId === TUTORIAL_FOREST_MAP_ID) drawBossTelegraphs();
    if (!isDueling() && currentMapId === BEGINNER_DESERT_MAP_ID) drawSpiderTelegraphs();
    drawAttackRange();

    for (const p of projectiles) drawProjectile(p, false);
    for (const p of enemyShots) drawProjectile(p, true);
    drawDepthSortedWorld(remotePlayers);
    drawParticles();
    drawDamageNumbers();

    ctx.restore();

    if (!isDueling()) drawMinimap(remotePlayers);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,55,40,${flash * .75})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    drawVignette();
  }

  function updateHud() {
    const remoteCount = coop && typeof coop.remotePlayerCount === "function"
      ? coop.remotePlayerCount()
      : coop
        ? coop.remotePlayers().length
        : 0;
    const reportedOnline = coop && typeof coop.onlinePlayerCount === "function"
      ? coop.onlinePlayerCount()
      : null;
    const playerCount = coop && coop.isConnected()
      ? (Number.isFinite(reportedOnline) ? reportedOnline : remoteCount + 1)
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

  function formatPlayedTime(seconds) {
    const wholeMinutes = Math.max(0, Math.floor(seconds / 60));
    const days = Math.floor(wholeMinutes / 1440);
    const hours = Math.floor(wholeMinutes % 1440 / 60);
    const minutes = wholeMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function isProfileOnline(identity) {
    if (identity === coop?.localIdentity?.()) return Boolean(coop?.isConnected?.());
    return Boolean(coop?.activePlayerMap?.(identity)) ||
      coop?.remotePlayers?.().some((other) => other.id === identity) === true;
  }

  function profilePresenceText(online, lastSeenAtMs) {
    if (online) return "ONLINE";
    if (!Number.isFinite(lastSeenAtMs) || lastSeenAtMs <= 0) return "LAST SEEN —";
    const lastSeen = new Date(lastSeenAtMs);
    const options = lastSeen.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric" };
    return `LAST SEEN ${lastSeen.toLocaleString([], options).toUpperCase()}`;
  }

  function setProfileTab(tab) {
    const overview = tab === "overview";
    profileOverviewTab.classList.toggle("is-active", overview);
    profileStatsTab.classList.toggle("is-active", !overview);
    profileOverviewTab.setAttribute("aria-selected", String(overview));
    profileStatsTab.setAttribute("aria-selected", String(!overview));
    profileOverviewPanel.hidden = !overview;
    profileStatsPanel.hidden = overview;
  }

  function renderPlayerProfile(profile) {
    if (!profile || profile.identity !== openProfileIdentity) return;
    const { progress, lifetime } = profile;
    openProfileData = profile;
    const online = isProfileOnline(profile.identity);
    const mapName = profile.mapId === BEGINNER_DESERT_MAP_ID
      ? "BEGINNER DESERT"
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
    playerProfilePowerEl.textContent = `Power: ${formatCompactNumber(power)}`;
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

    const stats = [
      ["MAX HP", Math.round(progress.maxHp).toLocaleString()],
      ["DAMAGE", Math.round(progress.damage).toLocaleString()],
      ["ARMOR", `${Math.round(progress.armor).toLocaleString()} (${formatArmorReduction(progress.armor)} REDUCTION)`],
      ["ATTACK SPEED", `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= MIN_ATTACK_INTERVAL + .0001 ? " (MAX)" : ""}`],
      ["ATTACK RANGE", Math.round(progress.attackRange).toLocaleString()],
      ["REGEN", `${progress.regen.toFixed(1)}/s`],
      ["MOVE SPEED", Math.round(progress.speed).toLocaleString()],
      ["PROJECTILE SPEED", Math.round(progress.projectileSpeed).toLocaleString()],
      ["PROJECTILES", String(progress.projectileCount)],
    ];
    profileStatGrid.replaceChildren();
    for (const [label, value] of stats) {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      item.append(term, detail);
      profileStatGrid.append(item);
    }
    playerProfileLoadingEl.hidden = true;
    editPlayerSaveBtn.hidden = !isDeveloperIdentity(coop?.localIdentity?.());
    profileOverviewPanel.hidden = !profileOverviewTab.classList.contains("is-active");
    profileStatsPanel.hidden = !profileStatsTab.classList.contains("is-active");
  }

  async function openPlayerProfile(identity, fallbackName = "PLAYER") {
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
    playerProfilePowerEl.textContent = "Power: —";
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
    playerProfileEl.hidden = true;
    openProfileIdentity = "";
    openProfileData = null;
    profileEditPanel.hidden = true;
    playerProfileLoadingEl.textContent = "LOADING PLAYER…";
    coop?.releasePlayerProfile?.();
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
    const valueKey = leaderboardStat === "health" ? "maxHp" : leaderboardStat === "time" ? "playedSeconds" : leaderboardStat;
    const entries = (coop?.leaderboardEntries?.() ?? [])
      .filter((entry) => Number.isFinite(entry[valueKey]))
      .sort((a, b) => b[valueKey] - a[valueKey] || a.name.localeCompare(b.name))
      .slice(0, 100);
    const localIdentity = coop?.localIdentity?.() || "";
    leaderboardRowsEl.replaceChildren();
    entries.forEach((entry, index) => {
      const row = document.createElement("li");
      row.className = "leaderboard-row";
      row.classList.toggle("is-local", entry.identity === localIdentity);

      const rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = `#${index + 1}`;

      const name = document.createElement("button");
      name.className = "leaderboard-name";
      name.type = "button";
      if (isDeveloperIdentity(entry.identity)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = `${DEVELOPER_BADGE} `;
        name.appendChild(badge);
      }
      name.append(document.createTextNode(entry.name));
      if (entry.isGuest) {
        const guest = document.createElement("span");
        guest.className = "leaderboard-guest";
        guest.textContent = " (guest)";
        name.appendChild(guest);
      }
      name.addEventListener("click", () => {
        closeLeaderboard();
        void openPlayerProfile(entry.identity, entry.name);
      });

      const icon = document.createElement("canvas");
      icon.className = "leaderboard-profile-icon";
      icon.width = 64;
      icon.height = 64;
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", "0");
      icon.setAttribute("aria-label", `View ${entry.name}'s profile`);
      const openEntryProfile = (event) => {
        event.stopPropagation();
        closeLeaderboard();
        void openPlayerProfile(entry.identity, entry.name);
      };
      icon.addEventListener("click", openEntryProfile);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openEntryProfile(event);
      });
      paintProfileIconCanvas(icon, coop?.profileIcon?.(entry.identity) ?? 0);

      const value = document.createElement("span");
      value.className = "leaderboard-value";
      value.textContent = leaderboardStat === "time"
        ? formatPlayedTime(entry.playedSeconds)
        : leaderboardStat === "regen"
        ? `${entry.regen < 1_000 ? Number(entry.regen.toFixed(2)) : formatCompactNumber(entry.regen)}/s`
        : formatCompactNumber(entry[valueKey]);
      row.append(rank, icon, name, value);
      leaderboardRowsEl.appendChild(row);
    });
    leaderboardEmptyEl.hidden = entries.length > 0;
    leaderboardRowsEl.hidden = entries.length === 0;
  }

  function setLeaderboardTab(tab) {
    leaderboardStat = ["power", "damage", "health", "armor", "regen", "time"].includes(tab) ? tab : "power";
    const power = leaderboardStat === "power";
    const damage = leaderboardStat === "damage";
    const health = leaderboardStat === "health";
    const armor = leaderboardStat === "armor";
    const regen = leaderboardStat === "regen";
    const time = leaderboardStat === "time";
    leaderboardPowerTab.classList.toggle("is-active", power);
    leaderboardDamageTab.classList.toggle("is-active", damage);
    leaderboardHealthTab.classList.toggle("is-active", health);
    leaderboardArmorTab.classList.toggle("is-active", armor);
    leaderboardRegenTab.classList.toggle("is-active", regen);
    leaderboardTimeTab.classList.toggle("is-active", time);
    leaderboardPowerTab.setAttribute("aria-selected", String(power));
    leaderboardDamageTab.setAttribute("aria-selected", String(damage));
    leaderboardHealthTab.setAttribute("aria-selected", String(health));
    leaderboardArmorTab.setAttribute("aria-selected", String(armor));
    leaderboardRegenTab.setAttribute("aria-selected", String(regen));
    leaderboardTimeTab.setAttribute("aria-selected", String(time));
    leaderboardValueHeading.textContent = leaderboardStat === "health" ? "HEALTH" : leaderboardStat === "time" ? "TIME PLAYED" : leaderboardStat.toUpperCase();
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

  function renderDevAudit() {
    const entries = (coop?.accessAuditEntries?.() ?? [])
      .sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs || a.displayName.localeCompare(b.displayName));
    devAuditRowsEl.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "dev-audit-row";

      const account = document.createElement("div");
      account.className = "dev-audit-account";
      const accountName = document.createElement("strong");
      renderDomPlayerName(accountName, entry.identity, entry.displayName);
      const identity = document.createElement("small");
      identity.textContent = `${entry.accountType.toUpperCase()} · ${entry.identity.slice(0, 10)}…${entry.identity.slice(-6)}`;
      const firstSeen = document.createElement("small");
      firstSeen.textContent = `FIRST · ${new Date(entry.firstSeenAtMs).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}`;
      account.append(accountName, identity, firstSeen);
      const actions = document.createElement("div");
      actions.className = "dev-audit-account-actions";
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "OPEN / EDIT";
      open.addEventListener("click", () => {
        closeDevAudit();
        void openPlayerProfile(entry.identity, entry.displayName);
      });
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "COPY ID";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(entry.identity);
          showMessage("IDENTITY COPIED", "#72ef58");
        } catch {
          showMessage("COPY FAILED", "#ff9b91");
        }
      });
      actions.append(open, copy);
      account.append(actions);

      const lastSeen = document.createElement("div");
      lastSeen.className = "dev-audit-last-seen";
      lastSeen.textContent = new Date(entry.lastSeenAtMs).toLocaleString([], {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });

      const client = document.createElement("div");
      client.className = "dev-audit-client";
      client.textContent = `P${entry.lastProtocolVersion}`;

      const editor = document.createElement("div");
      editor.className = "dev-audit-editor";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 60;
      input.value = entry.label;
      input.placeholder = "DEVICE / NOTE";
      input.setAttribute("aria-label", `Label for ${entry.displayName}`);
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "SAVE";
      save.addEventListener("click", async () => {
        save.disabled = true;
        const result = await coop?.setAccessAuditLabel?.(entry.identity, input.value);
        save.disabled = false;
        showMessage(result?.ok ? "AUDIT LABEL SAVED" : result?.error || "AUDIT UPDATE FAILED", result?.ok ? "#72ef58" : "#ff9b91");
      });
      editor.append(input, save);
      row.append(account, lastSeen, client, editor);
      devAuditRowsEl.appendChild(row);
    }
    devAuditEmptyEl.hidden = entries.length > 0;
    devAuditRowsEl.hidden = entries.length === 0;
  }

  function openDevAudit() {
    if (!isDeveloperIdentity(coop?.localIdentity?.())) return;
    devAuditEl.hidden = false;
    devAuditBtn.setAttribute("aria-expanded", "true");
    settingsPanel.hidden = true;
    inventoryPanel.hidden = true;
    closeLeaderboard();
    renderDevAudit();
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
  }

  function showCurrentUpdateNotice() {
    let seenVersion = "";
    try { seenVersion = localStorage.getItem(SEEN_VERSION_KEY) || ""; } catch {}
    if (seenVersion === GAME_VERSION) return;
    const releases = recentReleaseNotes(10);
    if (!releases.length) return;
    updateNoticeTitleEl.textContent = `v${GAME_VERSION}`;
    updateNoticeItemsEl.replaceChildren();
    for (const release of releases) {
      const group = document.createElement("li");
      group.className = "update-release";
      const version = document.createElement("strong");
      version.textContent = `v${release.version}`;
      const notes = document.createElement("ul");
      for (const note of release.notes) {
        const item = document.createElement("li");
        item.textContent = note;
        notes.appendChild(item);
      }
      group.append(version, notes);
      updateNoticeItemsEl.appendChild(group);
    }
    updateNoticeEl.hidden = false;
    try { localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION); } catch {}
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

  function openPlayerAtScreenPoint(clientX, clientY) {
    if (!running || !playerProfileEl.hidden || isDueling()) return false;
    const worldX = camera.x + clientX / camera.zoom;
    const worldY = camera.y + clientY / camera.zoom;
    let target = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const isPlayerProfileHit = (dx, dy) =>
      (Math.abs(dx) <= 48 && dy >= -60 && dy <= 60) ||
      (Math.abs(dx) <= 125 && dy >= -105 && dy < -45);
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
    if (!inventoryItemsEl || !inventoryDetailEl || !inventoryCountEl || !equippedFeetSlot) return;
    renderInventoryView(
      { items: inventoryItemsEl, detail: inventoryDetailEl, count: inventoryCountEl, equippedFeet: equippedFeetSlot },
      inventory,
      {
        onSelect(itemId) {
          inventory.selectedItemId = itemId;
          renderInventory();
        },
        onEquip(itemId) {
          if (ITEM_DEFINITIONS[itemId]?.slot !== "FEET") return;
          inventory.equippedFeet = itemId;
          player.speed = BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS;
          saveProgress();
          renderInventory();
          showMessage(`${ITEM_DEFINITIONS[itemId].name} EQUIPPED`, "#72ef58");
        },
        onUnequip(itemId) {
          if (inventory.equippedFeet !== itemId) return;
          inventory.equippedFeet = "";
          player.speed = BASE_PLAYER_SPEED;
          saveProgress();
          renderInventory();
          showMessage(`${ITEM_DEFINITIONS[itemId].name} UNEQUIPPED`, "#ffe05d");
        },
        onInspect(itemId) {
          openItemInspect(itemId);
        },
      },
    );
  }

  function openItemInspect(itemId) {
    const item = ITEM_DEFINITIONS[itemId];
    if (!item) return;
    itemInspectSlot.textContent = `${item.slot} · ${inventory.equippedFeet === item.id ? "EQUIPPED" : "IN BAG"}`;
    itemInspectName.textContent = item.name;
    itemInspectDescription.textContent = item.description;
    itemInspectStats.textContent = item.stats.join(" · ");
    itemInspectIcon.innerHTML = `<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>`;
    itemInspectEl.hidden = false;
  }

  function closeItemInspect() {
    itemInspectEl.hidden = true;
  }

  function duelOpponentName(duel) {
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

  function loop(now) {
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(.035, Math.max(0, rawDt));

    if (running && !pausedForUpgrade && !coop?.accountState?.().sessionConflict) update(dt);
    render();
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
      snapCameraToPlayer();
    }
    hasStarted = true;
    running = true;
    if (markIntro) coop?.beginAdventure?.();
    if (coop?.isConnected?.()) coop.syncPosition(player.x, player.y, player.facing, false, true);
    last = performance.now();
    ensureMusicPlayback();
  }

  function endGame() {
    running = false;
    overEl.style.display = "grid";
  }

  function updateScreenShakeSetting() {
    screenShakeToggle.textContent = screenShakeEnabled ? "ON" : "OFF";
    screenShakeToggle.setAttribute("aria-pressed", String(screenShakeEnabled));
    screenShakeToggle.classList.toggle("is-off", !screenShakeEnabled);
  }

  function updateAttackRangeSetting() {
    attackRangeToggle.textContent = attackRangeVisible ? "ON" : "OFF";
    attackRangeToggle.setAttribute("aria-pressed", String(attackRangeVisible));
    attackRangeToggle.classList.toggle("is-off", !attackRangeVisible);
  }

  function updateLatencySetting() {
    latencyToggle.textContent = latencyVisible ? "ON" : "OFF";
    latencyToggle.setAttribute("aria-pressed", String(latencyVisible));
    latencyToggle.classList.toggle("is-off", !latencyVisible);
    updateLatencyStatus();
  }

  function updateLatencyStatus() {
    latencyStatusEl.hidden = !latencyVisible;
    if (!latencyVisible) return;
    const latency = coop?.latencyMs?.();
    const connected = Boolean(coop?.isConnected?.());
    const rounded = typeof latency === "number" && Number.isFinite(latency) ? Math.round(latency) : null;
    const displayedLatency = connected ? rounded : null;
    const text = displayedLatency !== null ? `PING: ${displayedLatency}MS` : "PING: --";
    if (latencyStatusEl.textContent !== text) latencyStatusEl.textContent = text;
    latencyStatusEl.dataset.quality = displayedLatency === null
      ? ""
      : displayedLatency <= 80 ? "good" : displayedLatency <= 150 ? "fair" : "poor";
  }

  function updateMusicVolume() {
    const percent = Math.round(musicVolume * 100);
    backgroundMusic.volume = musicVolume;
    if (musicVolumeInput) musicVolumeInput.value = String(percent);
    if (musicVolumeValue) musicVolumeValue.textContent = `${percent}%`;
  }

  function ensureMusicPlayback() {
    if ((!hasStarted && !running) || musicVolume <= 0 || !backgroundMusic.paused) return;
    void backgroundMusic.play().catch(() => {});
  }

  function updateFullscreenSetting() {
    const root = document.documentElement;
    const supported = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    fullscreenToggle.disabled = !supported;
    fullscreenToggle.textContent = supported
      ? (active ? "EXIT" : "ENTER")
      : "N/A";
  }

  async function enterFullscreen() {
    const root = document.documentElement;
    if (typeof root.requestFullscreen === "function") {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
      } catch (error) {
        if (error?.name !== "TypeError") throw error;
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
    if (!connectionStatusEl) return;
    const connected = Boolean(coop && coop.isConnected());
    connectionStatusEl.textContent = connected ? "ONLINE" : "OFFLINE";
    connectionStatusEl.classList.toggle("is-offline", !connected);
  }

  function updateAccountStatus() {
    if (!accountButton || !accountStatusEl) return;
    const account = coop?.accountState?.() || { signedIn: false, notice: "" };
    accountButton.textContent = account.signedIn ? "SIGN OUT" : "SIGN IN / CREATE";
    const status = account.notice || (account.signedIn ? "SIGNED IN · ACCOUNT SAVE" : "GUEST · DEVICE SAVE");
    accountStatusEl.textContent = status;
    accountStatusEl.classList.toggle("is-signed-in", account.signedIn);
    accountStatusEl.classList.toggle("is-error", /FAILED|WAIT|CHECK/.test(status));
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

  leaderboardBtn.addEventListener("click", openLeaderboard);
  closeLeaderboardBtn.addEventListener("click", closeLeaderboard);
  leaderboardEl.addEventListener("click", (event) => {
    if (event.target === leaderboardEl) closeLeaderboard();
  });
  leaderboardPowerTab.addEventListener("click", () => setLeaderboardTab("power"));
  leaderboardDamageTab.addEventListener("click", () => setLeaderboardTab("damage"));
  leaderboardHealthTab.addEventListener("click", () => setLeaderboardTab("health"));
  leaderboardArmorTab.addEventListener("click", () => setLeaderboardTab("armor"));
  leaderboardRegenTab.addEventListener("click", () => setLeaderboardTab("regen"));
  leaderboardTimeTab.addEventListener("click", () => setLeaderboardTab("time"));
  devAuditBtn.addEventListener("click", openDevAudit);
  closeDevAuditBtn.addEventListener("click", closeDevAudit);
  devAuditEl.addEventListener("click", (event) => {
    if (event.target === devAuditEl) closeDevAudit();
  });

  equippedFeetSlot?.addEventListener("click", () => {
    if (inventory.equippedFeet) {
      inventory.selectedItemId = inventory.equippedFeet;
      renderInventory();
    }
  });
  closeItemInspectBtn?.addEventListener("click", closeItemInspect);
  itemInspectEl?.addEventListener("click", (event) => {
    if (event.target === itemInspectEl) closeItemInspect();
  });

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
    showAccountChoice();
    accountChoiceDetail.textContent = characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…";
    void coop?.signIn?.().then((result) => {
      if (result?.ok !== false) {
        showConnecting();
        return;
      }
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
  playerProfileEl.addEventListener("click", (event) => {
    if (event.target === playerProfileEl) closePlayerProfile();
  });
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
  profileIconPickerEl.addEventListener("click", (event) => {
    if (event.target === profileIconPickerEl) closeProfileIconPicker();
  });

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
      toggle: document.getElementById("chatToggle"),
      panel: document.getElementById("chatPanel"),
      header: document.querySelector("#chatPanel .chat-header"),
      sizeToggle: document.getElementById("chatSizeToggle"),
      messages: document.getElementById("chatMessages"),
      form: document.getElementById("chatForm"),
      input: document.getElementById("chatInput"),
      displayNameInput: document.getElementById("displayNameInput"),
      saveNameButton: document.getElementById("saveNameBtn"),
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
      if (!devAuditEl.hidden) renderDevAudit();
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
      updateProtocolGate(account);
      if (account?.sessionConflict) showSessionConflict();
      else if (account?.returningFromSignIn) showSigningIn();
      else if (account?.signInRequired && !hasStarted) showAccountChoice();
      else if (!accountChoicePanel.hidden && !hasStarted) showAccountChoice();
      chat.refresh();
      updateDuelControls();
      updateConnectionStatus();
      updateAccountStatus();
    });
  }
  updateFullscreenSetting();
  updateAttackRangeSetting();
  updateLatencySetting();
  updateMusicVolume();
  updateDuelControls();
  updateConnectionStatus();
  updateAccountStatus();
  updateProtocolGate();
  window.setInterval(() => chat.refresh(), 1_000);
  window.setInterval(() => {
    if (coop?.accountState?.().updating) enforceLatestVersion(GAME_VERSION);
  }, 5_000);

  bootUpgradeClose.addEventListener("click", () => {
    pausedForUpgrade = false;
    bootUpgradeEl.hidden = true;
    last = performance.now();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toolbar = settingsBtn.closest(".settings-wrap");
    if (toolbar && !toolbar.contains(target)) {
      settingsPanel.hidden = true;
      inventoryPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
      inventoryBtn.setAttribute("aria-expanded", "false");
    }
    if (!playerProfileEl.hidden && !playerProfileEl.querySelector(".modal")?.contains(target)) closePlayerProfile();
    if (!leaderboardEl.hidden && !leaderboardEl.querySelector(".modal")?.contains(target)) closeLeaderboard();
    if (!devAuditEl.hidden && !devAuditEl.querySelector(".modal")?.contains(target)) closeDevAudit();
    if (!dragonResultEl.hidden && !dragonResultEl.querySelector(".modal")?.contains(target)) closeDragonResult();
    if (!duelResultEl.hidden && !duelResultEl.querySelector(".modal")?.contains(target)) leaveDuelResult();
    if (!bootUpgradeEl.hidden && !bootUpgradeEl.querySelector(".modal")?.contains(target)) bootUpgradeClose.click();
    if (!profileIconPickerEl.hidden && !profileIconPickerEl.querySelector(".modal")?.contains(target)) closeProfileIconPicker();
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
    inventory.itemIds = [];
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
  document.getElementById("restartBtn").addEventListener("click", () => startGame(false, false));

  addEventListener("keydown", e => {
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
    if (e.code === "Escape" && !playerProfileEl.hidden) {
      closePlayerProfile();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener("keyup", e => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  function beginTouch(e) {
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

  function moveTouch(e) {
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

  function endTouch(e) {
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
    if (event.pointerType === "touch") return;
    openPlayerAtScreenPoint(event.clientX, event.clientY);
  });

  const initialAccount = coop?.accountState?.() || { signedIn: false, knownAccount: false, authInProgress: false, returningFromSignIn: false };
  if (initialAccount.returningFromSignIn) showSigningIn();
  else if (initialAccount.signInRequired) showAccountChoice();
  else if (!initialAccount.signedIn && !initialAccount.knownAccount && !initialAccount.authInProgress) showAccountChoice();
  else showConnecting();
  loadProgress();
  rebuildWorld();
  updateCamera(1);
  render();
  requestAnimationFrame(loop);
})();
