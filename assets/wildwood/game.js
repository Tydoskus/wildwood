(function() {
  "use strict";
  function enforceLatestVersion(version) {
    fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((release) => {
      if (!(release == null ? void 0 : release.version) || release.version === version) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("v") === release.version) return;
      url.searchParams.set("v", release.version);
      window.location.replace(url.toString());
    }).catch(() => {
    });
  }
  const TAU = Math.PI * 2;
  const WORLD = { w: 4800, h: 4800 };
  const ENEMY_RESPAWN_SAFE_DISTANCE = 420;
  const BOSS_ENEMY_SAFE_DISTANCE = 900;
  const BOSS_AGGRO_RANGE = 1150;
  const BOSS_CONE_RANGE = 760;
  const BOSS_CONE_HALF_ANGLE = 0.42;
  const BASE_PROJECTILE_SPEED = 390;
  const MAX_PROJECTILE_SPEED = BASE_PROJECTILE_SPEED * 7;
  const PLAYER_KNOCKBACK_FORCE = 90;
  const BASE_ATTACK_RANGE = 250;
  const ATTACK_RANGE_ZOOM_REFERENCE = 155;
  const MIN_CAMERA_ZOOM = 0.5;
  const ENEMY_SPEED_MULTIPLIER = 3;
  const ELITE_SPEED_MULTIPLIER = 2;
  const MELEE_ENEMY_SPEED_MULTIPLIER = 2;
  const MIN_ENEMY_AGGRO_RADIUS = 285;
  const RANGED_PROJECTILE_SPEED = 165 * 3;
  const PLAYER_SPRITE_X_OFFSETS = [
    [0, 14, 27, 39],
    [0, 14, 22, 32],
    [0, 10, 17, 31],
    [0, 11, 25, 33]
  ];
  const PLAYER_SPRITE_CENTER_X_SHIFT = -6;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function randi(min, max) {
    return Math.floor(rand(min, max + 1));
  }
  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
  function circlesOverlap(a, b) {
    const radius = a.r + b.r;
    return distanceSquared(a, b) < radius * radius;
  }
  const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
  const CHAT_DISPLAY_TTL_MS = 108e5;
  const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];
  function createChatController({ elements, getCoop, showMessage, onOpenReplay }) {
    let enabled = true;
    let large = false;
    try {
      enabled = localStorage.getItem(CHAT_ENABLED_KEY) !== "false";
    } catch {
    }
    function updateVisibility() {
      elements.toggle.textContent = enabled ? "ON" : "OFF";
      elements.toggle.setAttribute("aria-pressed", String(enabled));
      elements.toggle.classList.toggle("is-off", !enabled);
      elements.panel.hidden = !enabled;
      try {
        localStorage.setItem(CHAT_ENABLED_KEY, String(enabled));
      } catch {
      }
    }
    function updateHeight() {
      elements.panel.classList.toggle("is-large", large);
    }
    function nameColor(identity) {
      let hash = 2166136261;
      for (const character of identity) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
    }
    function refresh() {
      var _a, _b;
      const coop = getCoop();
      const localName = (_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop);
      if (localName && document.activeElement !== elements.displayNameInput) {
        elements.displayNameInput.value = localName;
      }
      elements.messages.replaceChildren();
      const now = Date.now();
      const messages = ((_b = coop == null ? void 0 : coop.chatMessages) == null ? void 0 : _b.call(coop).filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS)) ?? [];
      for (const message of messages) {
        const line = document.createElement("div");
        line.className = "chat-line";
        const time = document.createElement("span");
        time.className = "chat-time";
        time.textContent = new Date(message.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const name = document.createElement("span");
        name.className = "chat-name";
        name.style.color = nameColor(message.sender);
        name.textContent = `${message.senderName}: `;
        const text = document.createElement("span");
        text.className = "chat-text";
        text.textContent = message.message;
        line.append(time, name, text);
        if (message.replayId > 0n) {
          const replay = document.createElement("button");
          replay.className = "chat-replay";
          replay.type = "button";
          replay.title = "Watch duel replay";
          replay.setAttribute("aria-label", "Watch duel replay");
          replay.textContent = "▶";
          replay.addEventListener("click", (event) => {
            event.stopPropagation();
            onOpenReplay == null ? void 0 : onOpenReplay(message.replayId);
          });
          line.appendChild(replay);
        }
        elements.messages.appendChild(line);
      }
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
    function saveDisplayName() {
      var _a, _b;
      const name = elements.displayNameInput.value.trim().replace(/\s+/g, " ");
      if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
        showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
        return;
      }
      (_b = (_a = getCoop()) == null ? void 0 : _a.setDisplayName) == null ? void 0 : _b.call(_a, name);
    }
    function init() {
      elements.toggle.addEventListener("click", () => {
        enabled = !enabled;
        updateVisibility();
      });
      elements.panel.addEventListener("pointerup", (event) => {
        if (event.target instanceof Element && event.target.closest("#chatForm, button, input, textarea, label")) return;
        large = !large;
        updateHeight();
      });
      elements.form.addEventListener("submit", (event) => {
        var _a, _b;
        event.preventDefault();
        const message = elements.input.value.trim();
        if (!message) return;
        (_b = (_a = getCoop()) == null ? void 0 : _a.sendChatMessage) == null ? void 0 : _b.call(_a, message);
        elements.input.value = "";
        elements.input.style.height = "28px";
      });
      elements.input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        elements.form.requestSubmit();
      });
      elements.input.addEventListener("input", () => {
        elements.input.style.height = "auto";
        elements.input.style.height = `${Math.min(elements.input.scrollHeight, 54)}px`;
      });
      elements.saveNameButton.addEventListener("click", saveDisplayName);
      updateVisibility();
      updateHeight();
      refresh();
    }
    return { init, refresh };
  }
  (() => {
    const GAME_VERSION = "0.136";
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;
    const hpFill = document.getElementById("hpFill");
    const hpText = document.getElementById("hpText");
    const playerNameEl = document.getElementById("playerName");
    const statsEl = document.getElementById("stats");
    const settingsBtn = document.getElementById("settingsBtn");
    const autoAttackBtn = document.getElementById("autoAttackBtn");
    const settingsPanel = document.getElementById("settingsPanel");
    const screenShakeToggle = document.getElementById("screenShakeToggle");
    const fullscreenToggle = document.getElementById("fullscreenToggle");
    const connectionStatusEl = document.getElementById("connectionStatus");
    const resetProgressBtn = document.getElementById("resetProgressBtn");
    const messageEl = document.getElementById("message");
    const pickupLog = document.getElementById("pickupLog");
    const startEl = document.getElementById("start");
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
    const duelReplayEl = document.getElementById("duelReplay");
    const duelReplayTitle = document.getElementById("duelReplayTitle");
    const duelReplayCanvas = document.getElementById("duelReplayCanvas");
    duelReplayCanvas.getContext("2d");
    const closeDuelReplayBtn = document.getElementById("closeDuelReplayBtn");
    const coop = window.wildwoodCoop || null;
    enforceLatestVersion(GAME_VERSION);
    window.setInterval(() => enforceLatestVersion(GAME_VERSION), 3e4);
    const keys = /* @__PURE__ */ new Set();
    const camera = { x: 0, y: 0, zoom: 1 };
    const particles = [];
    const projectiles = [];
    const duelShots = [];
    const LEGACY_SAVE_KEY = "wildwood-player-progress-v1";
    const enemyShots = [];
    const enemies = [];
    const spawnSites = [];
    const decor = [];
    const paths = [];
    const bossRain = [];
    const DUEL_REQUEST_RANGE = 250;
    const DUEL_ARENA = { x: 6e3, y: 6e3, r: 760 };
    let dpr = 1;
    let viewW = innerWidth;
    let viewH = innerHeight;
    let running = false;
    let hasStarted = false;
    let gameTime = 0;
    let last = performance.now();
    let kills = 0;
    let score = 0;
    let flash = 0;
    let screenShake = 0;
    let screenShakeEnabled = true;
    let messageClock = 0;
    let pausedForUpgrade = false;
    let autoAttackEnabled = true;
    let duelWasActive = false;
    let lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
    let lastLocalDuelId = null;
    let replayFrame = 0;
    let replayMode = null;
    const touchMove = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    const bootsPickup = {
      x: 940,
      y: 3660,
      r: 18,
      collected: false
    };
    let hasSavedProgress = false;
    let progressLoaded = false;
    const player = {
      x: 360,
      y: 360,
      r: 17,
      speed: 175,
      hp: 30,
      maxHp: 30,
      damage: 4,
      attackRate: 0.78,
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
      maxHp: 1e6,
      hp: 1e6,
      dead: false,
      hurt: 0,
      attackClock: 3,
      nextAttack: "cone",
      cone: null,
      rewardGranted: false
    };
    const playerSprite = new Image();
    playerSprite.src = "assets/wildwood/wildwood-player-spritesheet.png";
    const ENEMY_TYPES = {
      grunt: {
        name: "Bramble",
        hp: 12,
        speed: 58,
        damage: 4,
        r: 14,
        color: "#d95738",
        outline: "#5c1b13",
        reward: 4,
        aggro: 245
      },
      runner: {
        name: "Needle",
        hp: 9,
        speed: 102,
        damage: 4,
        r: 10,
        color: "#ffd34d",
        outline: "#6f4a12",
        reward: 5,
        aggro: 275
      },
      tank: {
        name: "Mossback",
        hp: 38,
        speed: 34,
        damage: 9,
        r: 22,
        color: "#768d51",
        outline: "#2c3b20",
        reward: 10,
        aggro: 220
      },
      shooter: {
        name: "Spitter",
        hp: 18,
        speed: 43,
        damage: 8,
        r: 15,
        color: "#b16ac8",
        outline: "#4b235d",
        reward: 8,
        ranged: true,
        aggro: 330
      },
      splitter: {
        name: "Brood",
        hp: 22,
        speed: 52,
        damage: 6,
        r: 16,
        color: "#45b6c2",
        outline: "#174a54",
        reward: 8,
        aggro: 255
      },
      elite: {
        name: "Ironhorn",
        hp: 92,
        speed: 46,
        damage: 13,
        r: 27,
        color: "#d47a2b",
        outline: "#5c2b12",
        reward: 30,
        elite: true,
        aggro: 300
      },
      warden: {
        name: "Dread Warden",
        hp: 1e3,
        speed: 27,
        damage: 75,
        r: 36,
        color: "#a52e3a",
        outline: "#47101a",
        reward: 180,
        elite: true,
        aggro: 350,
        damageReward: 83
      }
    };
    const REWARD_DATA = {
      damage: { color: "#ff655a" },
      health: { color: "#66ed79", label: "+6 MAX HEALTH" },
      speed: { color: "#ffe05d", label: "+8% ATT SPEED" },
      armor: { color: "#d3dbe0", label: "+1 ARMOR" },
      regen: { color: "#ff7ccb", label: "+0.3 HP/SEC" }
    };
    function damageRewardForHp(maxHp, explicitReward) {
      return explicitReward ?? Math.max(1, Math.floor(maxHp / 12));
    }
    function rewardLabel(type, maxHp, explicitReward) {
      return type === "damage" ? `+${damageRewardForHp(maxHp, explicitReward)} DAMAGE` : REWARD_DATA[type].label;
    }
    const CAMPS = [
      {
        name: "Ember Fen",
        x: 820,
        y: 900,
        minRadius: 260,
        radius: 610,
        count: 6,
        types: ["grunt", "grunt", "runner"],
        rewards: ["damage", "health", "speed"],
        ground: "#5b3b28",
        ring: "#b66a37"
      },
      {
        name: "Mossfall Ruins",
        x: 2400,
        y: 760,
        minRadius: 260,
        radius: 630,
        count: 6,
        types: ["grunt", "tank", "tank"],
        rewards: ["armor", "health", "damage"],
        ground: "#33423a",
        ring: "#8d9b75"
      },
      {
        name: "Glass Thicket",
        x: 3970,
        y: 1120,
        minRadius: 280,
        radius: 600,
        count: 5,
        types: ["runner", "runner", "splitter"],
        rewards: ["speed", "health", "damage"],
        ground: "#244f53",
        ring: "#64bdc5"
      },
      {
        name: "Brine Marsh",
        x: 850,
        y: 2860,
        minRadius: 270,
        radius: 620,
        count: 6,
        types: ["shooter", "splitter", "shooter"],
        rewards: ["regen", "health", "health"],
        ground: "#243e4d",
        ring: "#5f9eb5"
      },
      {
        name: "Cinder Quarry",
        x: 3830,
        y: 2790,
        minRadius: 280,
        radius: 610,
        count: 6,
        types: ["tank", "shooter", "tank", "warden"],
        rewards: ["armor", "damage", "regen"],
        ground: "#4b4039",
        ring: "#b5875c"
      },
      {
        name: "Moonroot Grove",
        x: 1540,
        y: 4040,
        minRadius: 240,
        radius: 560,
        count: 5,
        types: ["splitter", "tank", "elite"],
        rewards: ["regen", "armor", "damage", "health"],
        ground: "#3d3157",
        ring: "#9a79d5"
      },
      {
        name: "Sunken Yard",
        x: 3590,
        y: 4100,
        minRadius: 240,
        radius: 560,
        count: 5,
        types: ["runner", "shooter", "elite"],
        rewards: ["speed", "health", "regen", "damage"],
        ground: "#553334",
        ring: "#d37362"
      }
    ];
    function resize() {
      viewW = innerWidth;
      viewH = innerHeight;
      dpr = Math.min(devicePixelRatio || 1, 2);
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
    function makeWorld() {
      decor.length = 0;
      paths.length = 0;
      const centerX = WORLD.w / 2;
      const centerY = WORLD.h / 2;
      paths.push({ x: centerX - 105, y: 0, w: 210, h: WORLD.h });
      paths.push({ x: 0, y: centerY - 105, w: WORLD.w, h: 210 });
      paths.push({ x: 760, y: 840, w: 1640, h: 120 });
      paths.push({ x: 2400, y: 700, w: 1570, h: 120 });
      paths.push({ x: 780, y: 2790, w: 1620, h: 120 });
      paths.push({ x: 2400, y: 2720, w: 1430, h: 120 });
      paths.push({ x: 1500, y: 3950, w: 2100, h: 120 });
      for (let i = 0; i < 36; i++) {
        const side = i % 4;
        let x, y, w, h;
        if (side === 0) {
          x = rand(140, WORLD.w - 410);
          y = rand(85, 260);
          w = rand(110, 280);
          h = rand(35, 70);
        }
        if (side === 1) {
          x = rand(WORLD.w - 260, WORLD.w - 85);
          y = rand(140, WORLD.h - 410);
          w = rand(35, 70);
          h = rand(110, 280);
        }
        if (side === 2) {
          x = rand(140, WORLD.w - 410);
          y = rand(WORLD.h - 260, WORLD.h - 85);
          w = rand(110, 280);
          h = rand(35, 70);
        }
        if (side === 3) {
          x = rand(85, 260);
          y = rand(140, WORLD.h - 410);
          w = rand(35, 70);
          h = rand(110, 280);
        }
        decor.push({ type: "stone", x, y, w, h });
      }
      for (let i = 0; i < 360; i++) {
        const x = rand(55, WORLD.w - 55);
        const y = rand(55, WORLD.h - 55);
        let onRoad = false;
        for (const p of paths) {
          if (x > p.x - 35 && x < p.x + p.w + 35 && y > p.y - 35 && y < p.y + p.h + 35) {
            onRoad = true;
            break;
          }
        }
        if (!onRoad && Math.hypot(x - player.x, y - player.y) > 420) {
          decor.push({ type: "tree", x, y, s: rand(0.7, 1.35), seed: Math.random() });
        }
      }
    }
    function buildSpawnSites() {
      spawnSites.length = 0;
      let id = 0;
      for (let campIndex = 0; campIndex < CAMPS.length; campIndex++) {
        const camp = CAMPS[campIndex];
        for (let i = 0; i < camp.count; i++) {
          const angle = i * 2.399963 + campIndex * 0.71;
          const fraction = (i * 37 + campIndex * 19) % 101 / 100;
          const distance = camp.minRadius + (camp.radius - camp.minRadius) * fraction;
          let x = clamp(camp.x + Math.cos(angle) * distance, 45, WORLD.w - 45);
          let y = clamp(camp.y + Math.sin(angle) * distance, 45, WORLD.h - 45);
          const bossDx = x - boss.x;
          const bossDy = y - boss.y;
          const bossDistance = Math.hypot(bossDx, bossDy) || 1;
          if (bossDistance < BOSS_ENEMY_SAFE_DISTANCE) {
            x = clamp(boss.x + bossDx / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.w - 45);
            y = clamp(boss.y + bossDy / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.h - 45);
          }
          spawnSites.push({
            id: id++,
            x,
            y,
            campName: camp.name,
            type: camp.types[i % camp.types.length],
            rewardType: camp.rewards[(i * 2 + campIndex) % camp.rewards.length],
            leashRange: Math.max(420, camp.radius * 0.9),
            alive: false,
            respawnAt: 0
          });
        }
      }
    }
    function reset(preserveStats = false) {
      player.x = 360;
      player.y = 360;
      if (!preserveStats && !hasSavedProgress) {
        player.maxHp = 30;
        player.damage = 4;
        player.attackRate = 0.78;
        player.projectileSpeed = BASE_PROJECTILE_SPEED;
        player.projectileCount = 1;
        player.attackRange = BASE_ATTACK_RANGE;
        player.armor = 0;
        player.regen = 0;
        player.speed = 175;
      }
      player.hp = player.maxHp;
      player.attackClock = 0;
      player.hurtClock = 0;
      player.facing = 0;
      player.moving = false;
      enemies.length = 0;
      projectiles.length = 0;
      enemyShots.length = 0;
      particles.length = 0;
      gameTime = 0;
      kills = 0;
      score = 0;
      flash = 0;
      screenShake = 0;
      messageClock = 0;
      pickupLog.innerHTML = "";
      resetBoss();
      makeWorld();
      buildSpawnSites();
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
        bootsCollected: bootsPickup.collected
      });
    }
    function loadProgress() {
      if (progressLoaded || !coop || typeof coop.savedProgress !== "function") return;
      const saved = coop.savedProgress();
      if (!saved) return;
      let legacy = null;
      try {
        const candidate = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY));
        if ((candidate == null ? void 0 : candidate.stats) && typeof candidate.stats === "object") legacy = candidate;
      } catch {
      }
      const serverIsDefault = saved.maxHp === 30 && saved.damage === 4 && saved.attackRate === 0.78 && saved.projectileSpeed === BASE_PROJECTILE_SPEED && saved.projectileCount === 1 && saved.attackRange === BASE_ATTACK_RANGE && saved.armor === 0 && saved.regen === 0 && saved.speed === 175 && saved.bootsCollected === false;
      const source = legacy && serverIsDefault ? { ...legacy.stats, bootsCollected: legacy.bootsCollected === true } : saved;
      const number = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
      player.maxHp = number(source.maxHp, player.maxHp, 1, 1e6);
      player.damage = number(source.damage, player.damage, 1, 1e6);
      player.attackRate = number(source.attackRate, player.attackRate, 0.16, 10);
      player.projectileSpeed = number(source.projectileSpeed, player.projectileSpeed, BASE_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED);
      player.projectileCount = Math.floor(number(source.projectileCount, player.projectileCount, 1, 20));
      player.attackRange = number(source.attackRange, player.attackRange, BASE_ATTACK_RANGE, 5e3);
      player.armor = number(source.armor, player.armor, 0, 1e6);
      player.regen = number(source.regen, player.regen, 0, 1e6);
      player.speed = number(source.speed, player.speed, 1, 2e3);
      player.hp = player.maxHp;
      bootsPickup.collected = source.bootsCollected === true;
      hasSavedProgress = true;
      progressLoaded = true;
      if (legacy && serverIsDefault) {
        saveProgress();
        try {
          localStorage.removeItem(LEGACY_SAVE_KEY);
        } catch {
        }
      }
    }
    function updateBootPickup() {
      if (bootsPickup.collected) return;
      const dx = player.x - bootsPickup.x;
      const dy = player.y - bootsPickup.y;
      const reach = player.r + bootsPickup.r;
      if (dx * dx + dy * dy <= reach * reach) {
        bootsPickup.collected = true;
        player.speed *= 1.5;
        saveProgress();
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
      const maxHp = base.hp;
      enemies.push({
        type: site.type,
        siteId: site.id,
        campName: site.campName,
        rewardType: site.rewardType,
        x: site.x,
        y: site.y,
        homeX: site.x,
        homeY: site.y,
        vx: 0,
        vy: 0,
        r: base.r,
        hp: maxHp,
        maxHp,
        speed: base.speed * ENEMY_SPEED_MULTIPLIER * (base.elite ? ELITE_SPEED_MULTIPLIER : 1) * (base.ranged ? 1 : MELEE_ENEMY_SPEED_MULTIPLIER),
        damage: base.damage,
        reward: base.reward,
        rewardDamage: base.damageReward,
        aggroRadius: Math.max(base.aggro, MIN_ENEMY_AGGRO_RADIUS),
        leashRange: site.leashRange,
        engaged: false,
        leashing: false,
        attackClock: rand(0.2, 1.2),
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
        const s = rand(speed * 0.4, speed);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rand(0.25, 0.7),
          maxLife: 1,
          size: randi(2, 5),
          color
        });
      }
    }
    function fireAt(target) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      const baseAngle = Math.atan2(dy, dx);
      const spread = 0.13;
      for (let i = 0; i < player.projectileCount; i++) {
        const angle = baseAngle + (i - (player.projectileCount - 1) / 2) * spread;
        const vx = Math.cos(angle) * player.projectileSpeed;
        const vy = Math.sin(angle) * player.projectileSpeed;
        projectiles.push({
          x: player.x + Math.cos(angle) * 20,
          y: player.y + Math.sin(angle) * 20,
          vx,
          vy,
          r: 6,
          damage: player.damage,
          life: player.attackRange / player.projectileSpeed,
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
        const d = distanceSquared(player, boss);
        if (d < best) {
          best = d;
          target = boss;
        }
      }
      if (target) {
        fireAt(target);
        player.attackClock = player.attackRate;
      } else {
        player.attackClock = Math.min(player.attackClock, 0.08);
      }
    }
    function applyReward(type, x, y, enemyMaxHp, explicitDamageReward) {
      switch (type) {
        case "damage":
          player.damage += damageRewardForHp(enemyMaxHp, explicitDamageReward);
          break;
        case "health":
          player.maxHp += 6;
          player.hp = Math.min(player.maxHp, player.hp + 6);
          break;
        case "speed":
          player.attackRate = Math.max(0.16, player.attackRate * 0.92);
          player.projectileSpeed = Math.min(MAX_PROJECTILE_SPEED, player.projectileSpeed * 1.04);
          break;
        case "armor":
          player.armor += 1;
          break;
        case "regen":
          player.regen += 0.3;
          break;
      }
      const data = REWARD_DATA[type];
      logPickup(rewardLabel(type, enemyMaxHp, explicitDamageReward), data.color);
      spawnBurst(x, y, data.color, 16, 110);
      score += 20;
      saveProgress();
    }
    function resetBoss() {
      boss.hp = boss.maxHp;
      boss.dead = false;
      boss.hurt = 0;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      boss.rewardGranted = false;
      bossRain.length = 0;
    }
    function killBoss() {
      if (boss.dead) return;
      boss.dead = true;
      boss.cone = null;
      bossRain.length = 0;
      score += 5e3;
      spawnBurst(boss.x, boss.y, "#ff7b42", 64, 230);
      if (!boss.rewardGranted) {
        boss.rewardGranted = true;
        player.projectileCount = 2;
        logPickup("DOUBLE SHOT", "#ffe36b");
        showMessage("DOUBLE SHOT", "#ffe36b");
        saveProgress();
      }
    }
    function startBossCone() {
      boss.cone = {
        angle: Math.atan2(player.y - boss.y, player.x - boss.x),
        timer: 1.2
      };
      boss.nextAttack = "rain";
    }
    function resolveBossCone(cone) {
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const distance = Math.hypot(dx, dy) || 1;
      const angleDelta = Math.atan2(
        Math.sin(Math.atan2(dy, dx) - cone.angle),
        Math.cos(Math.atan2(dy, dx) - cone.angle)
      );
      if (distance <= BOSS_CONE_RANGE && Math.abs(angleDelta) <= BOSS_CONE_HALF_ANGLE) {
        damagePlayer(500);
      }
      spawnBurst(
        boss.x + Math.cos(cone.angle) * 90,
        boss.y + Math.sin(cone.angle) * 90,
        "#ff7444",
        28,
        210
      );
    }
    function startBossRain() {
      const count = 8;
      for (let i = 0; i < count; i++) {
        const angle = i * TAU / count + rand(-0.25, 0.25);
        const radius = rand(45, 270);
        const timer = 0.8 + i * 0.14;
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
      if (boss.dead) return;
      boss.hurt = Math.max(0, boss.hurt - dt);
      for (let i = bossRain.length - 1; i >= 0; i--) {
        const strike = bossRain[i];
        strike.timer -= dt;
        if (strike.timer <= 0) {
          const dx2 = player.x - strike.x;
          const dy2 = player.y - strike.y;
          if (dx2 * dx2 + dy2 * dy2 <= strike.r * strike.r) damagePlayer(100);
          spawnBurst(strike.x, strike.y, "#ff5d32", 22, 170);
          bossRain.splice(i, 1);
        }
      }
      if (boss.cone) {
        boss.cone.timer -= dt;
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
      score += e.reward;
      const base = ENEMY_TYPES[e.type];
      const site = spawnSites[e.siteId];
      if (site) {
        site.alive = false;
        site.respawnAt = gameTime + 30;
      }
      applyReward(e.rewardType, e.x, e.y, e.maxHp, e.rewardDamage);
      spawnBurst(e.x, e.y, base.color, base.elite ? 28 : 12, base.elite ? 150 : 90);
    }
    function damagePlayer(amount) {
      if (isDueling()) return;
      if (player.hurtClock > 0) return;
      const dealt = Math.max(1, Math.round(amount - player.armor));
      player.hp -= dealt;
      player.hurtClock = 0.1;
      flash = 0.22;
      screenShake = Math.max(screenShake, 7);
      spawnBurst(player.x, player.y, "#ff5f55", 13, 115);
      if (player.hp <= 0) {
        player.hp = 0;
        breakEnemyLeashes();
        endGame();
      }
    }
    function breakEnemyLeashes() {
      for (const e of enemies) {
        if (e.dead) continue;
        e.engaged = false;
        e.leashing = true;
        e.attackClock = Math.max(e.attackClock, 0.5);
      }
    }
    let movementSyncActive = false;
    function activeDuel() {
      return coop && typeof coop.localDuel === "function" ? coop.localDuel() : null;
    }
    function isDueling() {
      var _a;
      return ["countdown", "active"].includes((_a = activeDuel()) == null ? void 0 : _a.status);
    }
    function isArenaScene() {
      return isDueling() || replayMode !== null;
    }
    function spawnDuelShot(fromX, fromY, toX, toY, color) {
      const distance = Math.hypot(toX - fromX, toY - fromY) || 1;
      duelShots.push({
        x: fromX,
        y: fromY,
        vx: (toX - fromX) / distance * 620,
        vy: (toY - fromY) / distance * 620,
        color,
        life: 0.38
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
        spawnDuelShot(challengerX, DUEL_ARENA.y, opponentX, DUEL_ARENA.y, "#ffe36b");
      }
      for (let i = lastDuelAttackCounts.opponent; i < duel.opponentAttacks; i++) {
        spawnDuelShot(opponentX, DUEL_ARENA.y, challengerX, DUEL_ARENA.y, "#ff8aa8");
      }
      lastDuelAttackCounts = { id: duel.id, challenger: duel.challengerAttacks, opponent: duel.opponentAttacks };
    }
    function duelStatLine(subject, attacks, damage, regen, blocked) {
      return `<div class="duel-stat-row"><span class="duel-stat-name">${subject}</span><br>ATTACKED ${attacks} TIMES<br>DID ${Math.round(damage)} DMG<br>REGENERATED ${Math.round(regen)} HP<br>BLOCKED ${Math.round(blocked)} DMG</div>`;
    }
    function showDuelResult(replay) {
      var _a;
      if (!replay || !duelResultEl) return;
      const localName = ((_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop)) || "PLAYER";
      const selfIsChallenger = replay.challengerName === localName;
      const self = selfIsChallenger ? { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked } : { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked };
      const other = selfIsChallenger ? { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked } : { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked };
      const won = replay.winnerName === localName;
      duelResultTitle.textContent = replay.winnerName === "DRAW" ? "DUEL DRAW" : won ? "YOU WON" : "YOU LOST";
      duelResultStats.innerHTML = duelStatLine("YOU", self.attacks, self.damage, self.regen, self.blocked) + duelStatLine(other.name, other.attacks, other.damage, other.regen, other.blocked);
      duelResultEl.hidden = false;
      duelResultEl.dataset.replayId = String(replay.id);
    }
    function replayState(replay, seconds) {
      const elapsed = Math.min(replay.durationSeconds, seconds);
      let time = 0;
      let challengerHp = replay.challengerMaxHp;
      let opponentHp = replay.opponentMaxHp;
      let challengerAttacks = 0;
      let opponentAttacks = 0;
      let nextChallengerAttack = replay.challengerAttackRate;
      let nextOpponentAttack = replay.opponentAttackRate;
      while (time < elapsed && challengerHp > 0 && opponentHp > 0) {
        const nextEvent = Math.min(elapsed, nextChallengerAttack, nextOpponentAttack);
        const delta = nextEvent - time;
        challengerHp = Math.min(replay.challengerMaxHp, challengerHp + replay.challengerRegen * delta);
        opponentHp = Math.min(replay.opponentMaxHp, opponentHp + replay.opponentRegen * delta);
        time = nextEvent;
        const challengerHits = nextChallengerAttack <= time + 1e-5 && challengerAttacks < replay.challengerAttacks;
        const opponentHits = nextOpponentAttack <= time + 1e-5 && opponentAttacks < replay.opponentAttacks;
        const challengerDamage = challengerHits ? Math.max(1, replay.challengerDamage - replay.opponentArmor) : 0;
        const opponentDamage = opponentHits ? Math.max(1, replay.opponentDamage - replay.challengerArmor) : 0;
        opponentHp = Math.max(0, opponentHp - challengerDamage);
        challengerHp = Math.max(0, challengerHp - opponentDamage);
        if (challengerHits) {
          challengerAttacks++;
          nextChallengerAttack += replay.challengerAttackRate;
        }
        if (opponentHits) {
          opponentAttacks++;
          nextOpponentAttack += replay.opponentAttackRate;
        }
      }
      if (elapsed >= replay.durationSeconds) {
        challengerHp = replay.challengerFinalHp;
        opponentHp = replay.opponentFinalHp;
      }
      return { challengerHp, opponentHp, challengerAttacks, opponentAttacks };
    }
    function openDuelReplay(replayId) {
      var _a;
      const replay = (_a = coop == null ? void 0 : coop.duelReplay) == null ? void 0 : _a.call(coop, replayId);
      if (!replay) {
        showMessage("REPLAY LOADING", "#bce7ff");
        return;
      }
      replayMode = { replay, start: performance.now() };
      performance.now();
      duelReplayTitle.textContent = `${replay.challengerName} VS ${replay.opponentName}`;
      duelReplayEl.hidden = false;
      document.body.classList.add("is-replaying");
    }
    function drawReplayWorldPlayer(x, y, name, hp, maxHp, facing) {
      const screenX = Math.floor(x - camera.x);
      const screenY = Math.floor(y - camera.y);
      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        const cellW = playerSprite.naturalWidth / 4;
        const cellH = playerSprite.naturalHeight / 4;
        const row = facing < 0 ? 1 : 2;
        ctx.drawImage(playerSprite, 0, row * cellH, cellW, cellH, screenX - 48, screenY - 48, 96, 96);
      }
      const ratio = clamp(hp / maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.82)";
      ctx.fillRect(screenX - 24, screenY - 53, 48, 9);
      ctx.fillStyle = "#46cf5a";
      ctx.fillRect(screenX - 23, screenY - 52, 46 * ratio, 7);
      drawPlayerName(name, screenX, screenY - 58, "#ffffff");
    }
    function renderReplayWorld() {
      const replay = replayMode.replay;
      const elapsed = Math.min(replay.durationSeconds, (performance.now() - replayMode.start) / 1e3 * 2);
      const state = replayState(replay, elapsed);
      const zoom = Math.min(1, Math.max(0.65, Math.min(viewW, viewH) / 820));
      camera.zoom = zoom;
      camera.x = DUEL_ARENA.x - viewW / zoom / 2;
      camera.y = DUEL_ARENA.y - viewH / zoom / 2;
      ctx.save();
      ctx.scale(zoom, zoom);
      drawGround();
      drawDuelArena();
      const left = DUEL_ARENA.x - 120, right = DUEL_ARENA.x + 120;
      drawReplayWorldPlayer(left, DUEL_ARENA.y, replay.challengerName, state.challengerHp, replay.challengerMaxHp, 1);
      drawReplayWorldPlayer(right, DUEL_ARENA.y, replay.opponentName, state.opponentHp, replay.opponentMaxHp, -1);
      const phase = elapsed % 0.8;
      if (phase < 0.16) {
        const fromLeft = Math.floor(elapsed / 0.8) % 2 === 0;
        ctx.fillStyle = fromLeft ? "#ffe36b" : "#ff8aa8";
        pixelCircle((fromLeft ? left + 20 + phase / 0.16 * 200 : right - 20 - phase / 0.16 * 200) - camera.x, DUEL_ARENA.y - camera.y, 6);
      }
      ctx.restore();
      if (elapsed >= replay.durationSeconds) replayMode.start = performance.now() - replay.durationSeconds * 500;
    }
    function applyDuelState() {
      var _a, _b;
      const duel = activeDuel();
      if (!isDueling()) return false;
      const localIsChallenger = duel.challenger === coop.localIdentity();
      const localState = (_a = coop.localState) == null ? void 0 : _a.call(coop);
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
      (_b = coop.pulseDuel) == null ? void 0 : _b.call(coop);
      return true;
    }
    function updatePlayer(dt) {
      var _a;
      if (applyDuelState()) return;
      if (duelWasActive) {
        player.hp = player.maxHp;
        player.hurtClock = 0;
        duelWasActive = false;
        duelShots.length = 0;
        lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
        const replay = (_a = coop == null ? void 0 : coop.duelReplay) == null ? void 0 : _a.call(coop, lastLocalDuelId);
        if (replay) showDuelResult(replay);
      }
      const multiplayerActive = Boolean(
        coop && coop.isConnected() && typeof coop.remotePlayerCount === "function" && coop.remotePlayerCount() > 0
      );
      if (multiplayerActive && !movementSyncActive) {
        coop.syncPosition(player.x, player.y, player.facing);
      }
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
        if (Math.abs(mx) + Math.abs(my) > 0.1) player.facing = Math.atan2(my, mx);
      }
      if (multiplayerActive) coop.sendMovement(player.moving ? mx : 0, player.moving ? my : 0);
      player.x = clamp(player.x, player.r, WORLD.w - player.r);
      player.y = clamp(player.y, player.r, WORLD.h - player.r);
      if (multiplayerActive) {
        const reconciled = coop.reconcileLocal(player.x, player.y, dt);
        player.x = clamp(reconciled.x, player.r, WORLD.w - player.r);
        player.y = clamp(reconciled.y, player.r, WORLD.h - player.r);
      }
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
        if (!e.leashing && playerDistance < e.aggroRadius) e.engaged = true;
        if (e.engaged && playerDistance > e.leashRange) {
          e.engaged = false;
          e.leashing = true;
          e.attackClock = Math.max(e.attackClock, 0.5);
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
            e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.16 * dt);
          }
        }
        let dx = (targetX - e.x) / targetDistance;
        let dy = (targetY - e.y) / targetDistance;
        if (base.ranged && e.engaged) {
          const preferred = 235;
          let rangedMove = 0;
          if (playerDistance > preferred + 25) rangedMove = 1;
          if (playerDistance < preferred - 35) rangedMove = -1;
          e.vx += toPlayerX / playerDistance * e.speed * rangedMove * dt * 6;
          e.vy += toPlayerY / playerDistance * e.speed * rangedMove * dt * 6;
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
        e.vx *= Math.pow(2e-3, dt);
        e.vy *= Math.pow(2e-3, dt);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.x = clamp(e.x, e.r, WORLD.w - e.r);
        e.y = clamp(e.y, e.r, WORLD.h - e.r);
        if (e.engaged && circlesOverlap(player, e)) {
          damagePlayer(e.damage);
          const pushX = toPlayerX / playerDistance;
          const pushY = toPlayerY / playerDistance;
          e.x -= pushX * 34;
          e.y -= pushY * 34;
        }
      }
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (a.dead) continue;
        for (let j = i + 1; j < enemies.length; j++) {
          const b = enemies[j];
          if (b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = (a.r + b.r) * 0.72;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < min * min) {
            const d = Math.sqrt(d2);
            const push = (min - d) * 0.5;
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
        const hit = raycastProjectile(startX, startY, endX, endY, p.r);
        p.life -= dt;
        p.trail -= dt;
        if (hit) {
          p.x = startX + (endX - startX) * hit.t;
          p.y = startY + (endY - startY) * hit.t;
          const target = hit.enemy;
          target.hp -= p.damage;
          target.hurt = 0.12;
          p.life = 0;
          if (!target.isBoss && player.knockback > 0) {
            const ang = Math.atan2(p.vy, p.vx);
            const force = PLAYER_KNOCKBACK_FORCE * player.knockback;
            target.vx += Math.cos(ang) * force;
            target.vy += Math.sin(ang) * force;
          }
          spawnBurst(p.x, p.y, "#fff0a1", 5, 52);
          if (target.hp <= 0) {
            if (target.isBoss) killBoss();
            else killEnemy(target);
          }
        } else {
          p.x = endX;
          p.y = endY;
        }
        if (p.trail <= 0) {
          p.trail = 0.035;
          particles.push({
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            life: 0.16,
            maxLife: 0.16,
            size: 3,
            color: "#ffd957"
          });
        }
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (projectiles[i].life <= 0) projectiles.splice(i, 1);
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
        p.vx *= Math.pow(0.03, dt);
        p.vy *= Math.pow(0.03, dt);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life <= 0) particles.splice(i, 1);
      }
    }
    function updateCamera(dt) {
      const rangeIncrease = player.attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
      const targetZoom = clamp(1 - rangeIncrease * 0.5, MIN_CAMERA_ZOOM, 1);
      const zoomFollow = 1 - Math.pow(8e-4, dt);
      camera.zoom += (targetZoom - camera.zoom) * zoomFollow;
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      const targetX = isDueling() ? DUEL_ARENA.x - visibleW / 2 : clamp(player.x - visibleW / 2, 0, Math.max(0, WORLD.w - visibleW));
      const targetY = isDueling() ? DUEL_ARENA.y - visibleH / 2 : clamp(player.y - visibleH / 2, 0, Math.max(0, WORLD.h - visibleH));
      const follow = 1 - Math.pow(6e-5, dt);
      camera.x += (targetX - camera.x) * follow;
      camera.y += (targetY - camera.y) * follow;
    }
    function update(dt) {
      gameTime += dt;
      flash = Math.max(0, flash - dt);
      screenShake *= Math.pow(0.01, dt);
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
      updateCamera(dt);
      updateHud();
    }
    function drawGround() {
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      if (isArenaScene()) {
        ctx.fillStyle = "#42494b";
        ctx.fillRect(0, 0, visibleW, visibleH);
        const tile2 = 48;
        for (let y = 0; y < visibleH + tile2; y += tile2) {
          for (let x = 0; x < visibleW + tile2; x += tile2) {
            ctx.fillStyle = x / tile2 + y / tile2 & 1 ? "#4e5557" : "#484f51";
            ctx.fillRect(x, y, tile2, tile2);
          }
        }
        return;
      }
      ctx.fillStyle = "#102b19";
      ctx.fillRect(0, 0, visibleW, visibleH);
      const tile = 32;
      const sx = Math.floor(camera.x / tile) * tile;
      const sy = Math.floor(camera.y / tile) * tile;
      for (let y = sy; y < camera.y + visibleH + tile; y += tile) {
        for (let x = sx; x < camera.x + visibleW + tile; x += tile) {
          const n = x * 13 + y * 7 >>> 5 & 3;
          ctx.fillStyle = ["#12301c", "#102d1a", "#14331e", "#112f1b"][n];
          ctx.fillRect(Math.floor(x - camera.x), Math.floor(y - camera.y), tile, tile);
          ctx.fillStyle = "rgba(0,0,0,.08)";
          ctx.fillRect(Math.floor(x - camera.x + n * 7 % 26), Math.floor(y - camera.y + n * 11 % 26), 3, 3);
        }
      }
      for (const p of paths) {
        const x = Math.floor(p.x - camera.x);
        const y = Math.floor(p.y - camera.y);
        ctx.fillStyle = "#775243";
        ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = "rgba(255,255,255,.035)";
        for (let yy = y + 7; yy < y + p.h; yy += 18) {
          for (let xx = x + (yy / 18 % 2 ? 4 : 12); xx < x + p.w; xx += 24) {
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
          const px = x + 8 + (ix * 19 + iy * 7) % Math.max(10, o.w - 15);
          const py = y + 8 + (iy * 17 + ix * 5) % Math.max(10, o.h - 15);
          ctx.fillRect(px, py, 4 + (ix + iy) % 5, 3 + (ix * 2 + iy) % 4);
        }
      }
    }
    function drawTree(o) {
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      const x = Math.floor(o.x - camera.x);
      const y = Math.floor(o.y - camera.y);
      const s = o.s;
      if (x < -55 || y < -70 || x > visibleW + 55 || y > visibleH + 55) return;
      ctx.fillStyle = "#815844";
      ctx.fillRect(Math.floor(x - 5 * s), Math.floor(y + 7 * s), Math.floor(10 * s), Math.floor(24 * s));
      const blobs = [
        [-12, -2, 16, "#185b2b"],
        [3, -8, 18, "#1d6c31"],
        [13, 3, 14, "#22773a"],
        [-3, 6, 18, "#207236"]
      ];
      for (const [bx, by, br, c] of blobs) {
        ctx.fillStyle = c;
        pixelCircle(x + bx * s, y + by * s, br * s);
      }
      ctx.fillStyle = "rgba(129,233,116,.18)";
      pixelCircle(x - 5 * s, y - 9 * s, 8 * s);
    }
    function pixelCircle(x, y, r) {
      const step = 4;
      const rr = r * r;
      for (let yy = -r; yy <= r; yy += step) {
        const half = Math.sqrt(Math.max(0, rr - yy * yy));
        ctx.fillRect(
          Math.floor(x - half),
          Math.floor(y + yy),
          Math.ceil(half * 2),
          step
        );
      }
    }
    function drawDecor() {
      for (const o of decor) if (o.type === "stone") drawStone(o);
      for (const o of decor) if (o.type === "tree") drawTree(o);
    }
    function drawDuelArena() {
      if (!isArenaScene()) return;
      const x = DUEL_ARENA.x - camera.x;
      const y = DUEL_ARENA.y - camera.y;
      ctx.save();
      ctx.fillStyle = "#6f7474";
      ctx.beginPath();
      ctx.arc(x, y, DUEL_ARENA.r, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#3e4545";
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(235,239,238,.34)";
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.arc(x, y, DUEL_ARENA.r - 18, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    function drawDuelShots() {
      for (const shot of duelShots) {
        ctx.fillStyle = shot.color;
        pixelCircle(shot.x - camera.x, shot.y - camera.y, 6);
      }
    }
    function drawAttackRange() {
      if (isDueling()) return;
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
      const blink = player.hurtClock > 0 && Math.floor(player.hurtClock * 18) % 2 === 0;
      if (blink) return;
      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        const cellW = playerSprite.naturalWidth / 4;
        const cellH = playerSprite.naturalHeight / 4;
        const fx = Math.cos(player.facing);
        const fy = Math.sin(player.facing);
        const row = Math.abs(fx) > Math.abs(fy) ? fx < 0 ? 1 : 2 : fy < 0 ? 3 : 0;
        const frame = player.moving ? Math.floor(gameTime * 10) % 4 : 0;
        const drawSize = 96;
        const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
        ctx.drawImage(
          playerSprite,
          frame * cellW,
          row * cellH,
          cellW,
          cellH,
          Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT),
          Math.floor(y - drawSize / 2),
          drawSize,
          drawSize
        );
      }
      const barW = 46;
      const barH = 7;
      const barX = Math.round(x - barW / 2);
      const barY = y - 50;
      const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.82)";
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = "#402326";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#46cf5a";
      ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
      ctx.fillStyle = "rgba(255,255,255,.24)";
      ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 1);
      drawPlayerName(coop && coop.localDisplayName() || "PLAYER", x, barY - 4, "#ffffff");
    }
    function drawPlayerName(name, x, y, color) {
      if (!name) return;
      ctx.save();
      ctx.font = "900 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.strokeText(name, x, y);
      ctx.fillStyle = color;
      ctx.fillText(name, x, y);
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
        if (playerSprite.complete && playerSprite.naturalWidth > 0) {
          const cellW = playerSprite.naturalWidth / 4;
          const cellH = playerSprite.naturalHeight / 4;
          const fx = Math.cos(other.facing);
          const fy = Math.sin(other.facing);
          const row = Math.abs(fx) > Math.abs(fy) ? fx < 0 ? 1 : 2 : fy < 0 ? 3 : 0;
          const frame = other.moving ? Math.floor(gameTime * 10) % 4 : 0;
          const drawSize = 96;
          const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
          ctx.save();
          ctx.globalAlpha = 0.82;
          ctx.drawImage(
            playerSprite,
            frame * cellW,
            row * cellH,
            cellW,
            cellH,
            Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT),
            Math.floor(y - drawSize / 2),
            drawSize,
            drawSize
          );
          ctx.restore();
        }
        const barW = 46;
        const barH = 5;
        const barX = Math.round(x - barW / 2);
        const barY = y - 50;
        const hpRatio = clamp(other.hp / other.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,.82)";
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = "#3d7d92";
        ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
        drawPlayerName(other.name, x, barY - 4, "#9eeeff");
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
      ctx.drawImage(
        dragonSpriteCanvas,
        frame * cellW,
        0,
        cellW,
        dragonSpriteCanvas.height,
        Math.floor(x - drawW / 2),
        Math.floor(y - drawH / 2),
        drawW,
        drawH
      );
      const barW = 220;
      const barH = 10;
      const barX = x - Math.floor(barW / 2);
      const barY = y - drawH / 2 - 20;
      const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.86)";
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = "#4d1d1d";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = boss.hurt > 0 ? "#fff1b6" : "#d8352d";
      ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
      ctx.fillStyle = "#f5e9c4";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "900 11px ui-monospace, monospace";
      ctx.fillText(`DRAGON ${Math.ceil(boss.hp).toLocaleString()} HP`, x, barY - 5);
    }
    function drawEnemy(e) {
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      const x = Math.floor(e.x - camera.x);
      const y = Math.floor(e.y - camera.y);
      const base = ENEMY_TYPES[e.type];
      if (x < -80 || y < -80 || x > visibleW + 80 || y > visibleH + 80) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath();
      ctx.ellipse(0, e.r * 0.76, e.r * 0.92, e.r * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = base.outline;
      pixelCircle(0, 0, e.r + 3);
      ctx.fillStyle = e.hurt > 0 ? "#fff3d0" : base.color;
      pixelCircle(0, 0, e.r);
      if (e.type === "runner") {
        ctx.fillStyle = "#6f4a12";
        ctx.fillRect(-e.r - 6, -3, 8, 5);
        ctx.fillRect(e.r - 2, 4, 8, 5);
      } else if (e.type === "tank") {
        ctx.fillStyle = "#b0bd7c";
        ctx.fillRect(-12, -8, 24, 7);
        ctx.fillStyle = "#2b3b1f";
        ctx.fillRect(-5, -3, 4, 4);
        ctx.fillRect(4, -3, 4, 4);
      } else if (e.type === "shooter") {
        ctx.fillStyle = "#eab2f2";
        ctx.fillRect(-4, -6, 8, 12);
        ctx.fillStyle = "#4b235d";
        ctx.fillRect(-2, -2, 4, 4);
      } else if (e.type === "splitter") {
        ctx.fillStyle = "#e3fdff";
        ctx.fillRect(-5, -4, 3, 3);
        ctx.fillRect(3, -4, 3, 3);
      } else if (base.elite) {
        ctx.fillStyle = "#ffe37e";
        ctx.fillRect(-14, -14, 28, 6);
        ctx.fillStyle = "#3e180d";
        ctx.fillRect(-8, -3, 5, 5);
        ctx.fillRect(4, -3, 5, 5);
        ctx.fillRect(-20, -24, 8, 14);
        ctx.fillRect(12, -24, 8, 14);
      } else {
        ctx.fillStyle = "#3a100d";
        ctx.fillRect(-6, -5, 4, 4);
        ctx.fillRect(3, -5, 4, 4);
      }
      ctx.restore();
      const reward = REWARD_DATA[e.rewardType];
      const rewardY = y + e.r + 8;
      const healthY = rewardY + 12;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "900 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.92)";
      const label = rewardLabel(e.rewardType, e.maxHp, e.rewardDamage);
      ctx.strokeText(label, x, rewardY);
      ctx.fillStyle = reward.color;
      ctx.fillText(label, x, rewardY);
      const hpLabel = `${Math.max(0, Math.ceil(e.hp))}/${Math.ceil(e.maxHp)} HP`;
      ctx.strokeText(hpLabel, x, healthY);
      ctx.fillStyle = "#f4f3df";
      ctx.fillText(hpLabel, x, healthY);
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
    function drawMinimap(remotePlayers) {
      const size = Math.min(180, Math.max(110, viewW * 0.17));
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
      roundRect(x + 5, y + 5, size - 10, size - 10, 7);
      ctx.clip();
      ctx.fillStyle = "#244a2c";
      ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
      ctx.fillStyle = "#8a6250";
      for (const p of paths) {
        ctx.fillRect(x + p.x * sx, y + p.y * sy, p.w * sx, p.h * sy);
      }
      ctx.fillStyle = "#ff5d5d";
      for (const e of enemies) {
        ctx.fillRect(x + e.x * sx - 1, y + e.y * sy - 1, e.type === "elite" ? 5 : 3, e.type === "elite" ? 5 : 3);
      }
      ctx.fillStyle = "#58e878";
      for (const other of remotePlayers) {
        ctx.fillRect(x + other.x * sx - 2, y + other.y * sy - 2, 5, 5);
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + player.x * sx - 2, y + player.y * sy - 2, 5, 5);
      ctx.strokeStyle = "rgba(255,255,255,.52)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, viewW / camera.zoom * sx, viewH / camera.zoom * sy);
      ctx.restore();
      ctx.restore();
    }
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    function render() {
      if (replayMode) {
        renderReplayWorld();
        return;
      }
      const remotePlayers = coop ? coop.remotePlayers() : [];
      ctx.save();
      const sx = screenShakeEnabled && screenShake > 0.2 ? rand(-screenShake, screenShake) : 0;
      const sy = screenShakeEnabled && screenShake > 0.2 ? rand(-screenShake, screenShake) : 0;
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
      for (const e of enemies) drawEnemy(e);
      drawBoss();
      drawBootPickup();
      drawRemotePlayers(remotePlayers);
      drawPlayer();
      drawParticles();
      ctx.restore();
      if (!isDueling()) drawMinimap(remotePlayers);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,55,40,${flash * 0.75})`;
        ctx.fillRect(0, 0, viewW, viewH);
      }
      const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.25, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,.33)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    function updateHud() {
      var _a;
      const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
      hpFill.style.width = (hpRatio * 100).toFixed(1) + "%";
      hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp} HP`;
      if (playerNameEl) {
        playerNameEl.textContent = ((_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop)) || "WANDERER";
      }
      statsEl.innerHTML = `DMG ${player.damage.toFixed(0)} &nbsp; ARM ${player.armor}<br>ATK SPEED ${(1 / player.attackRate).toFixed(2)}/s &nbsp; ATK RANGE ${Math.round(player.attackRange)}<br>REGEN ${player.regen.toFixed(1)}/s`;
      if (coopStatusEl) {
        const remoteCount = coop && typeof coop.remotePlayerCount === "function" ? coop.remotePlayerCount() : coop ? coop.remotePlayers().length : 0;
        const playerCount = coop && coop.isConnected() ? remoteCount + 1 : 1;
        coopStatusEl.textContent = `PLAYERS: ${playerCount}`;
      }
      updateDuelControls();
      updateConnectionStatus();
    }
    function nearbyDuelOpponent() {
      var _a;
      if (!coop || !((_a = coop.isConnected) == null ? void 0 : _a.call(coop))) return null;
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
      var _a, _b, _c;
      const opponentId = duel.challenger === ((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop)) ? duel.opponent : duel.challenger;
      return ((_c = (_b = coop == null ? void 0 : coop.remotePlayers) == null ? void 0 : _b.call(coop).find((other) => other.id === opponentId)) == null ? void 0 : _c.name) ?? "OPPONENT";
    }
    function updateDuelControls() {
      var _a;
      if (!duelControls) return;
      const duel = activeDuel();
      const localId = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      const nearby = nearbyDuelOpponent();
      duelStatusEl.hidden = false;
      duelRequestBtn.hidden = true;
      duelAcceptBtn.hidden = true;
      if ((duel == null ? void 0 : duel.status) === "countdown") {
        const remaining = Math.max(0, Math.ceil((duel.startsAtMs - Date.now()) / 1e3));
        duelStatusEl.textContent = "DUEL STARTING";
        duelCountdownEl.textContent = String(remaining);
        duelCountdownEl.hidden = false;
        duelControls.hidden = false;
        return;
      }
      duelCountdownEl.hidden = true;
      if ((duel == null ? void 0 : duel.status) === "active") {
        const remaining = Math.max(0, Math.ceil((duel.endsAtMs - Date.now()) / 1e3));
        duelStatusEl.textContent = `DUEL · ${duelOpponentName(duel)} · ${remaining}s`;
        duelControls.hidden = false;
        return;
      }
      if ((duel == null ? void 0 : duel.status) === "requested") {
        if (Date.now() - duel.createdAtMs >= 3e4) {
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
        duelRequestBtn.textContent = `REQUEST ${nearby.name}`;
        duelRequestBtn.hidden = false;
        duelControls.hidden = false;
        return;
      }
      duelControls.hidden = true;
    }
    function loop(now) {
      const rawDt = (now - last) / 1e3;
      last = now;
      const dt = Math.min(0.035, Math.max(0, rawDt));
      if (running && !pausedForUpgrade) update(dt);
      render();
      requestAnimationFrame(loop);
    }
    function startGame() {
      startEl.style.display = "none";
      overEl.style.display = "none";
      pausedForUpgrade = false;
      bootUpgradeEl.hidden = true;
      reset(hasStarted);
      hasStarted = true;
      running = true;
      last = performance.now();
    }
    function endGame() {
      running = false;
      finalScore.textContent = `Survived ${Math.floor(gameTime / 60)}:${Math.floor(gameTime % 60).toString().padStart(2, "0")} · ${kills} kills · score ${score}`;
      overEl.style.display = "grid";
    }
    function updateScreenShakeSetting() {
      screenShakeToggle.textContent = screenShakeEnabled ? "ON" : "OFF";
      screenShakeToggle.setAttribute("aria-pressed", String(screenShakeEnabled));
      screenShakeToggle.classList.toggle("is-off", !screenShakeEnabled);
    }
    function updateFullscreenSetting() {
      const root = document.documentElement;
      const supported = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
      const active = document.fullscreenElement || document.webkitFullscreenElement;
      fullscreenToggle.disabled = !supported;
      fullscreenToggle.textContent = supported ? active ? "EXIT" : "ENTER" : "N/A";
    }
    async function enterFullscreen() {
      const root = document.documentElement;
      if (typeof root.requestFullscreen === "function") {
        try {
          await root.requestFullscreen({ navigationUI: "hide" });
        } catch (error) {
          if ((error == null ? void 0 : error.name) !== "TypeError") throw error;
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
    settingsBtn.addEventListener("click", () => {
      const opening = settingsPanel.hidden;
      settingsPanel.hidden = !opening;
      settingsBtn.setAttribute("aria-expanded", String(opening));
    });
    screenShakeToggle.addEventListener("click", () => {
      screenShakeEnabled = !screenShakeEnabled;
      if (!screenShakeEnabled) screenShake = 0;
      updateScreenShakeSetting();
    });
    autoAttackBtn.addEventListener("click", () => {
      autoAttackEnabled = !autoAttackEnabled;
      updateAutoAttackSetting();
    });
    duelRequestBtn.addEventListener("click", () => {
      var _a;
      (_a = coop == null ? void 0 : coop.requestDuel) == null ? void 0 : _a.call(coop);
    });
    duelAcceptBtn.addEventListener("click", () => {
      var _a;
      const duel = activeDuel();
      if ((duel == null ? void 0 : duel.status) === "requested") (_a = coop == null ? void 0 : coop.acceptDuel) == null ? void 0 : _a.call(coop, duel.id);
    });
    watchDuelReplayBtn.addEventListener("click", () => {
      const replayId = BigInt(duelResultEl.dataset.replayId || "0");
      if (replayId > 0n) openDuelReplay(replayId);
    });
    closeDuelResultBtn.addEventListener("click", () => {
      duelResultEl.hidden = true;
    });
    closeDuelReplayBtn.addEventListener("click", () => {
      duelReplayEl.hidden = true;
      replayMode = null;
      document.body.classList.remove("is-replaying");
      cancelAnimationFrame(replayFrame);
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
        saveNameButton: document.getElementById("saveNameBtn")
      },
      getCoop: () => coop,
      showMessage,
      onOpenReplay: openDuelReplay
    });
    chat.init();
    if (coop && typeof coop.setOnChange === "function") {
      coop.setOnChange(() => {
        loadProgress();
        chat.refresh();
        updateDuelControls();
        updateConnectionStatus();
      });
    }
    updateFullscreenSetting();
    updateDuelControls();
    updateConnectionStatus();
    window.setInterval(() => chat.refresh(), 1e3);
    bootUpgradeClose.addEventListener("click", () => {
      pausedForUpgrade = false;
      bootUpgradeEl.hidden = true;
      last = performance.now();
    });
    resetProgressBtn.addEventListener("click", () => {
      if (!confirm("Erase all saved Wildwood progress and start over?")) return;
      hasSavedProgress = false;
      progressLoaded = false;
      if (coop && typeof coop.resetProgress === "function") coop.resetProgress();
      bootsPickup.collected = false;
      pausedForUpgrade = false;
      bootUpgradeEl.hidden = true;
      keys.clear();
      touchMove.active = false;
      reset(false);
      running = true;
      last = performance.now();
      startEl.style.display = "none";
      overEl.style.display = "none";
      settingsPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
    });
    document.getElementById("playBtn").addEventListener("click", startGame);
    document.getElementById("restartBtn").addEventListener("click", startGame);
    addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    addEventListener("keyup", (e) => keys.delete(e.code));
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
      joystickEl.style.left = t.clientX - 59 + "px";
      joystickEl.style.top = t.clientY - 59 + "px";
      joystickEl.style.bottom = "auto";
      joystickEl.style.display = "block";
    }
    function moveTouch(e) {
      if (!touchMove.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touchMove.id) continue;
        let dx = t.clientX - touchMove.ox;
        let dy = t.clientY - touchMove.oy;
        const d = Math.hypot(dx, dy);
        const max = 38;
        if (d > max) {
          dx = dx / d * max;
          dy = dy / d * max;
        }
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
        touchMove.active = false;
        touchMove.id = null;
        touchMove.x = touchMove.y = 0;
        stickEl.style.transform = "translate(0,0)";
        joystickEl.style.display = "none";
        break;
      }
    }
    canvas.addEventListener("touchstart", beginTouch, { passive: false });
    canvas.addEventListener("touchmove", moveTouch, { passive: false });
    canvas.addEventListener("touchend", endTouch, { passive: false });
    canvas.addEventListener("touchcancel", endTouch, { passive: false });
    loadProgress();
    makeWorld();
    updateCamera(1);
    render();
    requestAnimationFrame(loop);
  })();
})();
