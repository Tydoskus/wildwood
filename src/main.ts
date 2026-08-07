// @ts-nocheck
// Gradual TypeScript migration: existing game behavior stays unchanged.

import { enforceLatestVersion } from "./app/version";
import {
  ATTACK_RANGE_ZOOM_REFERENCE,
  BASE_ATTACK_RANGE,
  BASE_PROJECTILE_SPEED,
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  ENEMY_CONTACT_RECOIL_DISTANCE,
  ENEMY_RESPAWN_SAFE_DISTANCE,
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
import { inventoryFromSave, serialiseInventory, TRAILBLAZER_BOOTS } from "./game/inventory";
import { createCanvasPrimitives } from "./game/canvas";
import { createSpawnSites, createWorldLayout, loadTreeSpritesheet } from "./game/world";
import {
  DUEL_ARENA,
  DUEL_COMBAT_Y,
  DUEL_REPLAY_COUNTDOWN_SECONDS,
  DUEL_REQUEST_RANGE,
  DUEL_SHOT_LIFETIME,
  DUEL_SHOT_SPEED,
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

(() => {
  "use strict";

  const GAME_VERSION = "0.231";
  const ATTACK_RANGE_VISIBLE_KEY = "wildwood-attack-range-visible-v1";
  const MUSIC_VOLUME_KEY = "wildwood-music-volume-v1";
  const BOOTS_SPEED_BONUS = 25;
  const BASE_PLAYER_HP = 100;
  const BASE_PLAYER_SPEED = 180;
  const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
  const STARTING_ATTACK_INTERVAL = 1.56;
  const MIN_ATTACK_INTERVAL = .32;
  const WORLD_HEALTH_BAR_HEIGHT = 13;
  const ENEMY_DEATH_PARTICLE_COLOR = "#e53935";
  const DRAGON_HP_LOSS_FLASH_DURATION = .18;
  const DRAGON_HIT_BATCH_DELAY = .1;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const { outlinedText, pixelCircle, roundRect } = createCanvasPrimitives(ctx);

  const hpFill = document.getElementById("hpFill");
  const hpText = document.getElementById("hpText");
  const playerNameEl = document.getElementById("playerName");
  const playerPowerEl = document.getElementById("playerPower");
  const settingsBtn = document.getElementById("settingsBtn");
  const inventoryBtn = document.getElementById("inventoryBtn");
  const autoAttackBtn = document.getElementById("autoAttackBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const inventoryPanel = document.getElementById("inventoryPanel");
  const inventoryItemsEl = document.getElementById("inventoryItems");
  const inventoryDetailEl = document.getElementById("inventoryDetail");
  const inventoryCountEl = document.getElementById("inventoryCount");
  const equippedFeetSlot = document.getElementById("equippedFeetSlot");
  const screenShakeToggle = document.getElementById("screenShakeToggle");
  const attackRangeToggle = document.getElementById("attackRangeToggle");
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
  const finalScore = document.getElementById("finalScore");
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
  const duelReplayEl = document.getElementById("duelReplay");
  const duelReplayTitle = document.getElementById("duelReplayTitle");
  const closeDuelReplayBtn = document.getElementById("closeDuelReplayBtn");
  const sceneFadeEl = document.getElementById("sceneFade");
  const playerProfileEl = document.getElementById("playerProfile");
  const playerProfileNameEl = document.getElementById("playerProfileName");
  const playerProfilePowerEl = document.getElementById("playerProfilePower");
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
  const coop = window.wildwoodCoop || null;

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

  enforceLatestVersion(GAME_VERSION);
  window.setInterval(() => enforceLatestVersion(GAME_VERSION), 30_000);
  const keys = new Set();
  const camera = { x: 0, y: 0, zoom: 1 };
  const particles = [];
  const damageNumbers = [];
  const projectiles = [];
  const duelShots = [];
  const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
  const enemyShots = [];
  const enemies = [];
  const spawnSites = [];
  const decor = [];
  const paths = [];
  const bossRain = [];
  let pendingDragonHits = 0;
  let dragonHitBatchTimer = 0;
  const START_SPAWN = { x: 360, y: 360 };

  let dpr = 1;
  let viewW = innerWidth;
  let viewH = innerHeight;
  let running = false;
  let hasStarted = false;
  let gameTime = 0;
  let last = performance.now();
  let kills = 0;
  let totalKills = 0;
  let lifetimeKillsIdentity = "";
  let score = 0;
  let flash = 0;
  let screenShake = 0;
  let screenShakeEnabled = true;
  let attackRangeVisible = true;
  try { attackRangeVisible = localStorage.getItem(ATTACK_RANGE_VISIBLE_KEY) !== "false"; } catch {}
  let messageClock = 0;
  let pausedForUpgrade = false;
  let autoAttackEnabled = true;
  let duelWasActive = false;
  let lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
  let lastDuelHealth = { id: null, challenger: 0, opponent: 0 };
  let lastLocalDuelId = null;
  let visibleReplay = null;
  let replayMode = null;
  let heldDuelScene = null;
  let duelResultHold = false;
  let duelReturnState = null;
  let duelExitFading = false;
  let dragonResultOpen = false;
  let observedDragonEncounter = null;
  let dragonWasAlive = null;
  let pendingDragonResultEncounter = null;
  let shownDragonResultEncounter = null;
  const locallyRewardedDragonEncounters = new Set();
  const touchMove = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false };
  let openProfileIdentity = "";


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

  const boss = {
    isBoss: true,
    x: WORLD.w - 360,
    y: WORLD.h - 360,
    r: 140,
    maxHp: 1000000,
    hp: 1000000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 1000000,
    hpLossFlashTimer: 0,
    attackClock: 3,
    nextAttack: "cone",
    cone: null,
    encounter: null
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

  const ENEMY_SPRITES = loadEnemySprites();
  const actorShadowSprite = loadActorShadowSprite();
  let treeSpritesheetReady = false;
  const treeSpritesheet = loadTreeSpritesheet(() => {
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

    for (let index = -1; index < enemies.length; index++) {
      const e = index < 0 ? boss : enemies[index];
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
    const layout = createWorldLayout(player);
    decor.splice(0, decor.length, ...layout.decor);
    paths.splice(0, paths.length, ...layout.paths);
    spawnSites.splice(0, spawnSites.length, ...createSpawnSites(boss));
  }

  function reset(preserveStats = false) {
    player.x = START_SPAWN.x;
    player.y = START_SPAWN.y;

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
    enemyShots.length = 0;
    particles.length = 0;
    damageNumbers.length = 0;

    gameTime = 0;
    kills = 0;
    score = 0;
    flash = 0;
    screenShake = 0;
    messageClock = 0;
    pickupLog.innerHTML = "";
    resetBoss();

    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);

    showMessage("EXPLORE", "#ffe769");
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

    player.maxHp = number(source.maxHp, player.maxHp, 1, 1000000);
    player.damage = number(source.damage, player.damage, 1, 1000000);
    player.attackRate = number(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
    player.projectileSpeed = number(source.projectileSpeed, player.projectileSpeed, BASE_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED);
    player.projectileCount = Math.floor(number(source.projectileCount, player.projectileCount, 1, 20));
    player.attackRange = BASE_ATTACK_RANGE;
    player.armor = number(source.armor, player.armor, 0, 1000000);
    player.regen = number(source.regen, player.regen, 0, 1000000);
    bootsPickup.collected = source.bootsCollected === true;
    player.speed = bootsPickup.collected ? BASE_PLAYER_SPEED + BOOTS_SPEED_BONUS : BASE_PLAYER_SPEED;
    player.hp = player.maxHp;
    const savedInventory = inventoryFromSave(source.inventoryJson, source.equippedFeet, bootsPickup.collected);
    inventory.itemIds = savedInventory.itemIds;
    inventory.equippedFeet = savedInventory.equippedFeet;
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
    if (hasStarted || running || !loadingSequenceComplete || !playerSpriteReady || !treeSpritesheetReady || !duelSpaceBackgroundReady || !duelPlatformArtReady ||
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
    updateLoadingDetail();
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
    if (/active in another tab/i.test(connectionNotice)) {
      loadingDetail.textContent = connectionNotice;
      loadingFill.style.width = "35%";
      return;
    }
    const stages = [
      ["LOADING CONNECTION", Boolean(coop?.isConnected?.()), 12],
      ["LOADING PLAYER PROFILE", Boolean(coop?.localState?.()), 35],
      ["LOADING SAVED PROGRESS", progressLoaded, 60],
      ["LOADING PLAYER SPRITE", playerSpriteReady, 78],
      ["LOADING WORLD ART", treeSpritesheetReady && duelSpaceBackgroundReady && duelPlatformArtReady, 90],
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
      score: base.score,
      aggroRadius: base.aggro ?? 0,
      leashRange: site.leashRange,
      engaged: false,
      leashing: false,
      attackClock: rand(.2, 1.2),
      hurt: 0,
      dead: false,
      phase: Math.random() * TAU
    });

    site.alive = true;
    site.respawnAt = 0;
  }

  function updateRespawns() {
    const safeDistanceSq = ENEMY_RESPAWN_SAFE_DISTANCE * ENEMY_RESPAWN_SAFE_DISTANCE;

    for (const site of spawnSites) {
      if (!site.alive && site.respawnAt > 0 && gameTime >= site.respawnAt) {
        const dx = site.x - player.x;
        const dy = site.y - player.y;
        if (dx * dx + dy * dy < safeDistanceSq) {
          site.respawnAt = gameTime + 5;
          continue;
        }

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
      y: y - 18,
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

    if (!boss.dead) {
      const centerDistance = Math.hypot(player.x - boss.x, player.y - boss.y);
      const edgeDistance = Math.max(0, centerDistance - boss.r);
      if (edgeDistance * edgeDistance < best) {
        best = edgeDistance * edgeDistance;
        target = boss;
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
    score += 20;
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
    boss.attackClock = 3;
    boss.nextAttack = "cone";
    boss.cone = null;
    bossRain.length = 0;
  }

  function killBoss() {
    if (boss.dead) return;

    boss.dead = true;
    boss.cone = null;
    bossRain.length = 0;
    score += 5000;
    spawnBurst(boss.x, boss.y, ENEMY_DEATH_PARTICLE_COLOR, 64, 230);
  }

  function showDragonResult(result) {
    if (!result || !dragonResultEl || shownDragonResultEncounter === result.encounter) return;
    shownDragonResultEncounter = result.encounter;
    pendingDragonResultEncounter = null;
    dragonResultOpen = true;
    dragonResultTotal.textContent = `${Math.round(result.totalDamage).toLocaleString()} TOTAL DAMAGE`;
    dragonResultContributors.replaceChildren();

    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-result-row";
      const name = document.createElement("span");
      name.className = "dragon-result-name";
      name.textContent = contributor.name;
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
    const earnedReward = result.contributors.some((entry) => entry.identity === coop?.localIdentity?.());
    if (earnedReward && !locallyRewardedDragonEncounters.has(encounterKey)) {
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

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    kills++;
    totalKills++;
    score += e.score;

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
    const dealt = Math.max(1, Math.round(amount - player.armor));
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

  function spawnDuelShot(fromX, fromY, toX, toY, color) {
    const distance = Math.hypot(toX - fromX, toY - fromY) || 1;
    duelShots.push({
      x: fromX,
      y: fromY,
      vx: (toX - fromX) / distance * DUEL_SHOT_SPEED,
      vy: (toY - fromY) / distance * DUEL_SHOT_SPEED,
      color,
      life: DUEL_SHOT_LIFETIME,
    });
  }

  function syncDuelAttacks(duel) {
    if (lastDuelAttackCounts.id !== duel.id) {
      lastDuelAttackCounts = { id: duel.id, challenger: duel.challengerAttacks, opponent: duel.opponentAttacks };
      return;
    }
    const challengerX = DUEL_ARENA.x - 120;
    const opponentX = DUEL_ARENA.x + 120;
    for (let i = lastDuelAttackCounts.challenger; i < duel.challengerAttacks; i++) {
      spawnDuelShot(challengerX, DUEL_COMBAT_Y, opponentX, DUEL_COMBAT_Y, "#ffe36b");
    }
    for (let i = lastDuelAttackCounts.opponent; i < duel.opponentAttacks; i++) {
      spawnDuelShot(opponentX, DUEL_COMBAT_Y, challengerX, DUEL_COMBAT_Y, "#ff8aa8");
    }
    lastDuelAttackCounts = { id: duel.id, challenger: duel.challengerAttacks, opponent: duel.opponentAttacks };
  }

  function syncDuelDamageNumbers(duel) {
    if (lastDuelHealth.id !== duel.id) {
      lastDuelHealth = { id: duel.id, challenger: duel.challengerHp, opponent: duel.opponentHp };
      return;
    }
    const challengerDamage = lastDuelHealth.challenger - duel.challengerHp;
    const opponentDamage = lastDuelHealth.opponent - duel.opponentHp;
    if (challengerDamage > .01) spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
    if (opponentDamage > .01) spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
    lastDuelHealth = { id: duel.id, challenger: duel.challengerHp, opponent: duel.opponentHp };
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
    player.maxHp = localIsChallenger ? duel.challengerMaxHp : duel.opponentMaxHp;
    player.hp = localIsChallenger ? duel.challengerHp : duel.opponentHp;
    player.moving = false;
    duelWasActive = true;
    lastLocalDuelId = duel.id;
    syncDuelAttacks(duel);
    syncDuelDamageNumbers(duel);
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
      duelShots.length = 0;
      lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
      lastDuelHealth = { id: null, challenger: 0, opponent: 0 };
      if (lastLocalDuelId) {
        void coop?.loadDuelReplay?.(lastLocalDuelId).then((replay) => {
          if (replay) showDuelResult(replay);
          else showDuelResultUnavailable();
        });
      }
      return;
    }
    if (duelResultHold) return;
    const multiplayerActive = Boolean(
      coop && coop.isConnected() && typeof coop.remotePlayerCount === "function" && coop.remotePlayerCount() > 0,
    );
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

    player.x = clamp(player.x, player.r, WORLD.w - player.r);
    player.y = clamp(player.y, player.r, WORLD.h - player.r);

    if (multiplayerActive) coop.syncPosition(player.x, player.y, player.facing, player.moving, multiplayerJustStarted);

    player.hurtClock = Math.max(0, player.hurtClock - dt);
    if (player.regen > 0 && player.hp > 0) {
      player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    }

    if (autoAttackEnabled) attackNearest(dt);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) continue;
      const base = ENEMY_TYPES[e.type];
      e.hurt = Math.max(0, e.hurt - dt);
      e.attackClock -= dt;
      e.phase += dt * 3;

      const toPlayerX = player.x - e.x;
      const toPlayerY = player.y - e.y;
      const playerDistance = Math.hypot(toPlayerX, toPlayerY) || 1;
      const homeDistance = Math.hypot(e.x - e.homeX, e.y - e.homeY);

      if (e.leashing && homeDistance < 10) e.leashing = false;
      const aggroRadius = base.elite
        ? e.aggroRadius
        : Math.max(0, player.attackRange - REGULAR_ENEMY_AGGRO_PADDING);
      if (!e.leashing && playerDistance < aggroRadius) e.engaged = true;

      if (e.engaged && playerDistance > e.leashRange) {
        e.engaged = false;
        e.leashing = true;
        e.attackClock = Math.max(e.attackClock, .5);
      }

      let targetX;
      let targetY;
      let targetDistance;
      let moveMode = 0;

      if (e.engaged) {
        targetX = player.x;
        targetY = player.y;
        targetDistance = playerDistance;
        moveMode = 1;
      } else {
        targetX = e.homeX;
        targetY = e.homeY;
        targetDistance = Math.hypot(targetX - e.x, targetY - e.y) || 1;
        moveMode = targetDistance > 7 ? 1 : 0;

        if (targetDistance < 12 && e.hp < e.maxHp) {
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

        e.vx += (toPlayerX / playerDistance) * e.speed * rangedMove * dt * 6;
        e.vy += (toPlayerY / playerDistance) * e.speed * rangedMove * dt * 6;

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
          e.attackClock = rand(1.2, 1.7);
        }
      } else if (moveMode) {
        e.vx += dx * e.speed * dt * 7;
        e.vy += dy * e.speed * dt * 7;
      }

      e.vx *= Math.pow(.002, dt);
      e.vy *= Math.pow(.002, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, e.r, WORLD.w - e.r);
      e.y = clamp(e.y, e.r, WORLD.h - e.r);

      if (e.engaged && circlesOverlap(player, e)) {
        if (damagePlayer(e.damage)) {
          const pushX = toPlayerX / playerDistance;
          const pushY = toPlayerY / playerDistance;
          e.x -= pushX * ENEMY_CONTACT_RECOIL_DISTANCE;
          e.y -= pushY * ENEMY_CONTACT_RECOIL_DISTANCE;
          e.vx = 0;
          e.vy = 0;
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
          pendingDragonHits += 1;
          dragonHitBatchTimer = DRAGON_HIT_BATCH_DELAY;
        } else {
          target.engaged = true;
          target.leashing = false;
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
    if (pendingDragonHits > 0) {
      dragonHitBatchTimer -= dt;
      if (dragonHitBatchTimer <= 0) {
        coop?.damageDragon?.(pendingDragonHits);
        pendingDragonHits = 0;
        dragonHitBatchTimer = 0;
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
    syncDragonState();
    gameTime += dt;
    flash = Math.max(0, flash - dt);
    screenShake *= Math.pow(.01, dt);

    if (messageClock > 0) {
      messageClock -= dt;
      if (messageClock <= 0) messageEl.style.opacity = "0";
    }

    updatePlayer(dt);
    if (!isDueling()) {
      updateBootPickup();
      updateEnemies(dt);
      updateBoss(dt);
      updateProjectiles(dt);
      updateRespawns();
    } else {
      projectiles.length = 0;
      pendingDragonHits = 0;
      dragonHitBatchTimer = 0;
      enemyShots.length = 0;
    }
    for (const shot of duelShots) {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    }
    for (let i = duelShots.length - 1; i >= 0; i--) {
      if (duelShots[i].life <= 0) duelShots.splice(i, 1);
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
    ctx.fillStyle = "#31945b";
    ctx.fillRect(0, 0, visibleW, visibleH);

    for (const p of paths) {
      const x = Math.floor(p.x - camera.x);
      const y = Math.floor(p.y - camera.y);
      ctx.fillStyle = "#8b6551";
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = "rgba(68,38,29,.12)";
      for (let yy = y + 7; yy < y + p.h; yy += 18) {
        for (let xx = x + ((yy / 18) % 2 ? 4 : 12); xx < x + p.w; xx += 24) {
          ctx.fillRect(xx, yy, 2, 2);
        }
      }
    }
  }

  function drawStone(o) {
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const x = Math.floor(o.x - camera.x);
    const y = Math.floor(o.y - camera.y);
    if (x + o.w < -20 || y + o.h < -20 || x > visibleW + 20 || y > visibleH + 20) return;

    ctx.fillStyle = "#777e7b";
    ctx.fillRect(x, y, o.w, o.h);
    ctx.fillStyle = "#949b98";
    ctx.fillRect(x + 5, y + 5, o.w - 10, o.h - 10);

    ctx.fillStyle = "rgba(45,47,47,.35)";
    const cols = Math.max(1, Math.floor(o.w / 24));
    const rows = Math.max(1, Math.floor(o.h / 24));
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const px = x + 8 + ((ix * 19 + iy * 7) % Math.max(10, o.w - 15));
        const py = y + 8 + ((iy * 17 + ix * 5) % Math.max(10, o.h - 15));
        ctx.fillRect(px, py, 4 + ((ix+iy)%5), 3 + ((ix*2+iy)%4));
      }
    }
  }

  function drawTree(o) {
    const visibleW = viewW / camera.zoom;
    const visibleH = viewH / camera.zoom;
    const x = Math.floor(o.x - camera.x);
    const y = Math.floor(o.y - camera.y);
    const drawSize = Math.round(154 * o.s);
    const halfWidth = drawSize / 2;
    const cullPadding = 48;
    if (
      x + halfWidth < -cullPadding ||
      x - halfWidth > visibleW + cullPadding ||
      y < -cullPadding ||
      y - drawSize > visibleH + cullPadding
    ) return;
    if (!treeSpritesheet.complete || treeSpritesheet.naturalWidth <= 0) return;

    const cellW = treeSpritesheet.naturalWidth / 4;
    const cellH = treeSpritesheet.naturalHeight / 4;
    const variant = o.variant % 16;
    const sourceX = (variant % 4) * cellW;
    const sourceY = Math.floor(variant / 4) * cellH;
    drawActorShadow(x, y - 5, Math.round(drawSize * .62), .15);
    ctx.drawImage(
      treeSpritesheet,
      sourceX, sourceY, cellW, cellH,
      Math.round(x - drawSize / 2), Math.round(y - drawSize), drawSize, drawSize,
    );
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
    for (const o of decor) if (o.type === "grass") drawGrass(o);
    for (const o of decor) if (o.type === "petal") drawPetal(o);
    for (const o of decor) if (o.type === "stone") drawStone(o);
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

  function drawDuelShots(shots = duelShots) {
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
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
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
      name: coop && coop.localDisplayName() || "PLAYER",
      nameColor: "#ffffff",
      hp: player.hp,
      maxHp: player.maxHp,
      power: playerPower(player),
      fillColor: "#46cf5a",
    });
  }

  function drawActorStatus({ x, y, name, nameColor, hp, maxHp, power, fillColor }) {
    const centerX = Math.round(x);
    const barW = 77;
    const barH = WORLD_HEALTH_BAR_HEIGHT;
    const barX = centerX - Math.floor(barW / 2);
    const barY = Math.round(y - 54);
    const hpRatio = clamp(hp / maxHp, 0, 1);
    const fillWidth = Math.round(barW * hpRatio);
    const hpLabel = `${Math.max(0, Math.ceil(hp))} / ${Math.ceil(maxHp)} HP`;

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

    const powerBaseline = barY - 7;
    const nameBaseline = power === null ? powerBaseline : powerBaseline - 17;
    drawPlayerName(name, centerX, nameBaseline, nameColor);
    if (power !== null) drawPlayerPowerValue(power, centerX, powerBaseline);
  }

  function drawPlayerName(name, x, y, color) {
    if (!name) return;
    ctx.save();
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    outlinedText(name, x, y, color, 2);
    ctx.restore();
  }

  function playerPower(stats) {
    return Math.round(
      stats.damage * .15 +
      stats.maxHp +
      stats.armor * 3 +
      stats.regen * 10 +
      50 / stats.attackRate,
    );
  }

  function drawPlayerPowerValue(power, x, y) {
    ctx.save();
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    outlinedText(`Power: ${formatCompactNumber(power)}`, x, y, "#ffe05d", 2);
    ctx.restore();
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
        name: other.name,
        nameColor: "#9eeeff",
        hp: other.hp,
        maxHp: other.maxHp,
        power: Number.isFinite(other.power) ? other.power : playerPower(other),
        fillColor: "#55a9c6",
      });
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
    outlinedText(`${Math.ceil(boss.hp).toLocaleString()} / ${Math.ceil(boss.maxHp).toLocaleString()} HP`, x, barY + barH / 2, "#fff", 3);
    ctx.textBaseline = "bottom";
    outlinedText("DRAGON", x, barY - 18, "#f5e9c4", 3);
    outlinedText("+650 DAMAGE", x, barY - 5, "#ff655a", 3);
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
    const hpLabel = `${Math.max(0, Math.ceil(e.hp))} / ${Math.ceil(e.maxHp)} HP`;

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
    const treeCullPadding = 48;
    for (const tree of decor) {
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
    if (!boss.dead) {
      layers.push({ depth: boss.y + 93, priority: 1, draw: drawBoss });
    }
    if (!bootsPickup.collected) {
      layers.push({ depth: bootsPickup.y + bootsPickup.r, priority: 1, draw: drawBootPickup });
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
    const pad = 12;
    const x = viewW - size - pad;
    const y = pad;

    ctx.save();
    ctx.fillStyle = "rgba(12,18,15,.82)";
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 2;
    roundRect(x, y, size, size, 10);
    ctx.fill();
    ctx.stroke();

    const sx = size / WORLD.w;
    const sy = size / WORLD.h;

    ctx.save();
    roundRect(x+5, y+5, size-10, size-10, 7);
    ctx.clip();

    ctx.fillStyle = "#31945b";
    ctx.fillRect(x+5, y+5, size-10, size-10);

    ctx.fillStyle = "#8b6551";
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
    const localId = coop?.localIdentity?.();
    const remoteName = (identity) => remotePlayers.find((other) => other.id === identity)?.name ?? "OPPONENT";
    const actor = (identity, isChallenger) => ({
      x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
      y: DUEL_COMBAT_Y,
      name: identity === localId ? (coop?.localDisplayName?.() || "PLAYER") : remoteName(identity),
      hp: isChallenger ? duel.challengerHp : duel.opponentHp,
      maxHp: isChallenger ? duel.challengerMaxHp : duel.opponentMaxHp,
      facing: isChallenger ? 0 : Math.PI,
      isLocal: identity === localId,
    });
    return {
      challenger: actor(duel.challenger, true),
      opponent: actor(duel.opponent, false),
      shots: duelShots,
      countdown: duel.status === "countdown"
        ? Math.max(1, Math.ceil((duel.startsAtMs - Date.now()) / 1000))
        : 0,
    };
  }

  function replayDuelShots(replay, elapsed) {
    const shots = [];
    const addShots = (attackRate, attackCount, fromX, toX, color) => {
      for (let attack = 1; attack <= attackCount; attack++) {
        const age = elapsed - attack * attackRate;
        if (age < 0 || age >= DUEL_SHOT_LIFETIME) continue;
        const direction = Math.sign(toX - fromX);
        shots.push({
          x: fromX + direction * DUEL_SHOT_SPEED * age,
          y: DUEL_COMBAT_Y,
          color,
        });
      }
    };
    addShots(replay.challengerAttackRate, replay.challengerAttacks, DUEL_ARENA.x - 120, DUEL_ARENA.x + 120, "#ffe36b");
    addShots(replay.opponentAttackRate, replay.opponentAttacks, DUEL_ARENA.x + 120, DUEL_ARENA.x - 120, "#ff8aa8");
    return shots;
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
    if (!isDueling()) drawBossTelegraphs();
    drawAttackRange();

    for (const p of projectiles) drawProjectile(p, false);
    for (const p of enemyShots) drawProjectile(p, true);
    drawDuelShots();
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
    const playerCount = coop && coop.isConnected() ? remoteCount + 1 : 1;
    renderPlayerHud(
      { hpFill, hpText, playerName: playerNameEl, playerPower: playerPowerEl, coopStatus: coopStatusEl },
      player,
      coop?.localDisplayName?.() || "WANDERER",
      playerCount,
      playerPower(player),
    );
    updateDuelControls();
    updateConnectionStatus();
    updateAccountStatus();
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
    return coop?.remotePlayers?.().some((other) => other.id === identity) === true;
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
    const online = isProfileOnline(profile.identity);
    const activeSeconds = online ? Math.max(0, (Date.now() - lifetime.sessionStartedAtMs) / 1000) : 0;
    const power = playerPower(progress);
    playerProfileNameEl.textContent = profile.name || "PLAYER";
    playerProfilePowerEl.textContent = `Power: ${formatCompactNumber(power)}`;
    profileJoinedEl.textContent = new Date(lifetime.joinedAtMs).toLocaleDateString([], {
      year: "numeric", month: "short", day: "numeric",
    });
    profileTimePlayedEl.textContent = formatPlayedTime(lifetime.playedSeconds + activeSeconds);
    profileKillsEl.textContent = Math.round(lifetime.enemyKills).toLocaleString();
    profileOnlineEl.textContent = online ? "ONLINE" : "OFFLINE";
    profileOnlineEl.style.color = online ? "#72ef58" : "#b7c5b7";

    const stats = [
      ["MAX HP", Math.round(progress.maxHp).toLocaleString()],
      ["DAMAGE", Math.round(progress.damage).toLocaleString()],
      ["ARMOR", Math.round(progress.armor).toLocaleString()],
      ["ATTACK SPEED", `${(1 / progress.attackRate).toFixed(2)}/s`],
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
    profileOverviewPanel.hidden = !profileOverviewTab.classList.contains("is-active");
    profileStatsPanel.hidden = !profileStatsTab.classList.contains("is-active");
  }

  async function openPlayerProfile(identity, fallbackName = "PLAYER") {
    if (!identity) return;
    openProfileIdentity = identity;
    playerProfileEl.hidden = false;
    playerProfileNameEl.textContent = fallbackName;
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
    playerProfileLoadingEl.textContent = "LOADING PLAYER…";
    coop?.releasePlayerProfile?.();
  }

  function openPlayerAtScreenPoint(clientX, clientY) {
    if (!running || !playerProfileEl.hidden || isDueling()) return false;
    const worldX = camera.x + clientX / camera.zoom;
    const worldY = camera.y + clientY / camera.zoom;
    let target = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const other of coop?.remotePlayers?.() ?? []) {
      const dx = worldX - other.x;
      const dy = worldY - other.y;
      if (Math.abs(dx) > 48 || Math.abs(dy) > 60) continue;
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
      (itemId) => {
        inventory.selectedItemId = itemId;
        renderInventory();
      },
    );
  }

  function nearbyDuelOpponent() {
    if (!coop || !coop.isConnected?.()) return null;
    let closest = null;
    let closestDistanceSq = DUEL_REQUEST_RANGE * DUEL_REQUEST_RANGE;
    for (const other of coop.remotePlayers()) {
      const dx = other.x - player.x;
      const dy = other.y - player.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= closestDistanceSq) {
        closest = other;
        closestDistanceSq = distanceSq;
      }
    }
    return closest;
  }

  function duelOpponentName(duel) {
    const opponentId = duel.challenger === coop?.localIdentity?.() ? duel.opponent : duel.challenger;
    return coop?.remotePlayers?.().find((other) => other.id === opponentId)?.name ?? "OPPONENT";
  }

  function updateDuelControls() {
    if (!duelControls) return;
    const duel = activeDuel();
    const localId = coop?.localIdentity?.();
    const nearby = nearbyDuelOpponent();
    duelStatusEl.hidden = false;
    duelRequestBtn.hidden = true;
    duelAcceptBtn.hidden = true;

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
    if (duel?.status === "requested") {
      if (Date.now() - duel.createdAtMs >= 30_000) {
        duelControls.hidden = true;
        return;
      }
      duelControls.hidden = false;
      if (duel.opponent === localId) {
        duelStatusEl.textContent = `${duelOpponentName(duel)} CHALLENGES YOU`;
        duelAcceptBtn.hidden = false;
      } else {
        duelStatusEl.textContent = "DUEL REQUEST SENT";
      }
      return;
    }
    if (nearby) {
      duelStatusEl.hidden = true;
      duelRequestBtn.textContent = `Challenge ${nearby.name} to Duel`;
      duelRequestBtn.hidden = false;
      duelControls.hidden = false;
      return;
    }
    duelControls.hidden = true;
  }

  function loop(now) {
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(.035, Math.max(0, rawDt));

    if (running && !pausedForUpgrade && !dragonResultOpen) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function startGame(markIntro = true) {
    startEl.style.display = "none";
    overEl.style.display = "none";
    pausedForUpgrade = false;
    bootUpgradeEl.hidden = true;
    reset(hasStarted);
    hasStarted = true;
    running = true;
    if (markIntro) coop?.beginAdventure?.();
    if (coop?.isConnected?.()) coop.syncPosition(player.x, player.y, player.facing, false, true);
    last = performance.now();
    ensureMusicPlayback();
  }

  function endGame() {
    running = false;
    finalScore.textContent = `Survived ${Math.floor(gameTime / 60)}:${Math.floor(gameTime % 60).toString().padStart(2,"0")} · ${kills} kills · score ${score}`;
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
  });

  inventoryBtn.addEventListener("click", () => {
    const opening = inventoryPanel.hidden;
    inventoryPanel.hidden = !opening;
    settingsPanel.hidden = true;
    inventoryBtn.setAttribute("aria-expanded", String(opening));
    settingsBtn.setAttribute("aria-expanded", "false");
    if (opening) renderInventory();
  });

  equippedFeetSlot?.addEventListener("click", () => {
    if (inventory.equippedFeet) {
      inventory.selectedItemId = inventory.equippedFeet;
      renderInventory();
    }
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
      if (result?.ok !== false) return;
      accountSignInPending = false;
      showAccountChoice();
      accountChoiceDetail.textContent = characterFound
        ? "SIGN-IN FAILED · TRY AGAIN OR CONTINUE AS GUEST"
        : "REGISTRATION FAILED · TRY AGAIN OR CONTINUE AS GUEST";
    }).catch(() => {
      accountSignInPending = false;
      showAccountChoice();
      accountChoiceDetail.textContent = "SIGN-IN FAILED · TRY AGAIN OR CONTINUE AS GUEST";
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
  });

  duelRequestBtn.addEventListener("click", () => {
    void coop?.requestDuel?.().then((result) => {
      if (!result?.ok) showMessage(result?.error || "DUEL REQUEST FAILED", "#ff9b91");
    });
  });

  duelAcceptBtn.addEventListener("click", () => {
    const duel = activeDuel();
    if (duel?.status === "requested") coop?.acceptDuel?.(duel.id);
  });

  watchDuelReplayBtn.addEventListener("click", () => {
    const replayId = BigInt(duelResultEl.dataset.replayId || "0");
    if (replayId > 0n) openDuelReplay(replayId);
  });

  closeDuelResultBtn.addEventListener("click", () => {
    leaveDuelResult();
  });

  closeDragonResultBtn.addEventListener("click", () => {
    dragonResultEl.hidden = true;
    dragonResultOpen = false;
    last = performance.now();
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
      syncDragonState();
      finishStartup();
      const account = coop?.accountState?.();
      if (account?.returningFromSignIn) showSigningIn();
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
  updateMusicVolume();
  updateDuelControls();
  updateConnectionStatus();
  updateAccountStatus();
  window.setInterval(() => chat.refresh(), 1_000);

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
    settingsBtn.setAttribute("aria-expanded", "false");
    inventoryBtn.setAttribute("aria-expanded", "false");
  });

  beginAdventureBtn.addEventListener("click", beginAdventure);
  newPlayerNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") beginAdventure();
  });
  document.getElementById("restartBtn").addEventListener("click", startGame);

  addEventListener("keydown", e => {
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
