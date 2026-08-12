(function() {
  "use strict";
  let versionCheckInFlight = false;
  let reloadScheduled = false;
  function enforceLatestVersion(version) {
    if (versionCheckInFlight || reloadScheduled) return;
    versionCheckInFlight = true;
    fetch(`version.json?cache=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((release) => {
      if (!(release == null ? void 0 : release.version) || release.version === version) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("v") === release.version) return;
      reloadScheduled = true;
      url.searchParams.set("v", release.version);
      window.location.replace(url.toString());
    }).catch(() => {
    }).finally(() => {
      versionCheckInFlight = false;
    });
  }
  const RELEASE_NOTES = {
    "0.257": [
      "Sign-in and loading panel frames removed",
      "Extra mobile World Chat bottom spacing added"
    ],
    "0.256": [
      "World Chat header spacing tightened"
    ],
    "0.255": [
      "Sign-in now recovers cleanly when saved account tokens expire",
      "Sign-in options and update history layout improved",
      "World Chat now respects phone safe areas and keeps one row layout at every size",
      "Spitter health reduced to 24"
    ],
    "0.254": [
      "Armor and Regen leaderboards added",
      "Account linking now preserves leaderboard placement immediately",
      "Profile portraits now open player profiles throughout the game",
      "World Chat, inventory, profile spacing, and update history improved"
    ],
    "0.252": [
      "Player profiles scale better and preserve full usernames",
      "Your own character now opens your player profile",
      "Minimap and toolbar presentation improved"
    ],
    "0.251": [
      "Leaderboard profile portraits corrected",
      "Mobile HUD and World Chat layout improved",
      "Player profiles now show online or last-seen status",
      "Update notes now close only from their close button"
    ],
    "0.250": [
      "Profile portrait grid math corrected"
    ],
    "0.249": [
      "Profile portrait caching and alignment fixed",
      "Neutral default profile portrait added"
    ],
    "0.248": [
      "Profile portrait alignment corrected",
      "Profile portraits added to leaderboard"
    ],
    "0.247": [
      "Tutorial Forest map-wide player visibility added",
      "Sign-in now requires an explicit button press",
      "Mobile inventory and item actions improved",
      "Player profile icons added"
    ],
    "0.246": [
      "Developer button visibility fixed",
      "Developer player-save editor added"
    ],
    "0.245": [
      "Private account access auditing added",
      "Developer account badge and audit panel added"
    ],
    "0.244": [
      "Nearby players now appear reliably as they enter your area"
    ],
    "0.243": [
      "Leaderboard rows simplified into a compact list",
      "Profile stats simplified into a compact grid",
      "Leaderboard names now open player profiles"
    ],
    "0.242": [
      "Accurate global online player count",
      "Chat renamed to World Chat",
      "Guest name labels made consistent"
    ],
    "0.241": [
      "Mobile leaderboard made more compact",
      "Update deployment waiting screen added"
    ],
    "0.240": [
      "Power leaderboard added",
      "Power now scales damage with attack speed",
      "Nearby and distant movement networking optimized",
      "Maximum attack speed now labeled in profiles",
      "Nearby chat now appears above players",
      "Auto attack now confirms enabled or disabled"
    ]
  };
  function recentReleaseNotes(limit = 10) {
    return Object.entries(RELEASE_NOTES).sort(([a], [b]) => b.localeCompare(a, void 0, { numeric: true })).slice(0, Math.max(0, limit)).map(([version, notes]) => ({ version, notes }));
  }
  const DEVELOPER_IDENTITY = "c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13";
  function isDeveloperIdentity(identity) {
    return (identity == null ? void 0 : identity.replace(/^0x/i, "").toLowerCase()) === DEVELOPER_IDENTITY;
  }
  const DEVELOPER_BADGE = "[DEV]";
  const TAU = Math.PI * 2;
  const WORLD = { w: 4800, h: 4800 };
  const ENEMY_RESPAWN_SAFE_DISTANCE = 420;
  const BOSS_ENEMY_SAFE_DISTANCE = 900;
  const BOSS_AGGRO_RANGE = 1150;
  const BOSS_CONE_RANGE = 760;
  const BOSS_CONE_HALF_ANGLE = 0.42;
  const BOSS_RAIN_RANGE = 135;
  const BASE_PROJECTILE_SPEED = 390;
  const MAX_PROJECTILE_SPEED = BASE_PROJECTILE_SPEED * 7;
  const PLAYER_KNOCKBACK_FORCE = 90;
  const BASE_ATTACK_RANGE = 200;
  const ATTACK_RANGE_ZOOM_REFERENCE = 155;
  const MIN_CAMERA_ZOOM = 0.5;
  const REGULAR_ENEMY_AGGRO_PADDING = 15;
  const ENEMY_HIT_MIN_MOVE_SPEED = 1;
  const ENEMY_HIT_SPEED_RECOVERY_SECONDS = 3;
  const RANGED_PROJECTILE_SPEED = 165 * 3;
  const PLAYER_SPRITE_X_OFFSETS = [
    // Calibrated from the flat 4×4 player sheet's alpha bounds so walk frames
    // keep the character's visual center fixed.
    [0, 14, 28, 41],
    [0, 16, 28, 34],
    [0, 16, 27, 40],
    [0, 14, 28, 41]
  ];
  const PLAYER_SPRITE_CENTER_X_SHIFT = -6;
  const PLAYER_SPRITE_Y_OFFSETS = [-6, 2, 2, 4];
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
  const TRAILBLAZER_BOOTS = "trailblazer_boots";
  const ITEM_DEFINITIONS = {
    [TRAILBLAZER_BOOTS]: {
      id: TRAILBLAZER_BOOTS,
      name: "TRAILBLAZER BOOTS",
      slot: "FEET",
      description: "Leather boots built for crossing Wildwood faster.",
      stats: ["MOVE SPEED +25"]
    }
  };
  function normaliseInventory(itemIds, equippedFeet, ownsBoots) {
    const requested = Array.isArray(itemIds) ? itemIds : [];
    const hasBoots = ownsBoots || requested.includes(TRAILBLAZER_BOOTS);
    const items = hasBoots ? [TRAILBLAZER_BOOTS] : [];
    return {
      itemIds: items,
      equippedFeet: hasBoots && equippedFeet === TRAILBLAZER_BOOTS ? TRAILBLAZER_BOOTS : ""
    };
  }
  function inventoryFromSave(inventoryJson, equippedFeet, ownsBoots) {
    let itemIds = [];
    if (typeof inventoryJson === "string") {
      try {
        itemIds = JSON.parse(inventoryJson);
      } catch {
      }
    }
    return normaliseInventory(itemIds, equippedFeet, ownsBoots);
  }
  function serialiseInventory(inventory) {
    return JSON.stringify(inventory.itemIds);
  }
  function createCanvasPrimitives(ctx) {
    function pixelCircle(x, y, radius) {
      const step = 4;
      const radiusSquared = radius * radius;
      for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
        const halfWidth = Math.sqrt(Math.max(0, radiusSquared - offsetY * offsetY));
        ctx.fillRect(
          Math.floor(x - halfWidth),
          Math.floor(y + offsetY),
          Math.ceil(halfWidth * 2),
          step
        );
      }
    }
    function roundRect(x, y, width, height, radius) {
      const corner = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + corner, y);
      ctx.arcTo(x + width, y, x + width, y + height, corner);
      ctx.arcTo(x + width, y + height, x, y + height, corner);
      ctx.arcTo(x, y + height, x, y, corner);
      ctx.arcTo(x, y, x + width, y, corner);
      ctx.closePath();
    }
    function outlinedText(text, x, y, fillColor, strokeWidth = ctx.lineWidth) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineWidth = strokeWidth;
      ctx.fillStyle = fillColor;
      ctx.shadowColor = "rgba(0, 0, 0, .92)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
      ctx.fillText(text, x, y);
      ctx.shadowColor = "transparent";
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "#000";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fillColor;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
    return { outlinedText, pixelCircle, roundRect };
  }
  const enemyTypes = {
    Bramble: {
      hp: 42,
      speed: 210,
      damage: 14,
      attackSpeed: 1,
      r: 14,
      color: "#d95738",
      outline: "#5c1b13",
      reward: { type: "health", amount: 14 },
      score: 4
    },
    Needle: {
      hp: 90,
      speed: 210,
      damage: 24,
      attackSpeed: 1,
      r: 10,
      color: "#ffd34d",
      outline: "#6f4a12",
      reward: { type: "speed", amount: 0.01 },
      score: 1
    },
    Mossback: {
      hp: 380,
      speed: 210,
      damage: 29,
      attackSpeed: 1,
      r: 22,
      color: "#768d51",
      outline: "#2c3b20",
      reward: { type: "armor", amount: 1 },
      score: 1
    },
    Spitter: {
      hp: 24,
      speed: 210,
      damage: 48,
      attackSpeed: 1,
      r: 15,
      color: "#b16ac8",
      outline: "#4b235d",
      reward: { type: "damage", amount: 1 },
      score: 1
    },
    Brood: {
      hp: 220,
      speed: 180,
      damage: 56,
      attackSpeed: 0.69,
      r: 16,
      color: "#45b6c2",
      outline: "#174a54",
      reward: { type: "regen", amount: 0.3 },
      score: 1,
      ranged: true
    },
    Cindermaw: {
      hp: 360,
      speed: 210,
      damage: 86,
      attackSpeed: 1,
      r: 19,
      color: "#d95738",
      outline: "#5c1b13",
      reward: { type: "damage", amount: 6 },
      score: 1
    },
    "King Slime": {
      hp: 920,
      speed: 190,
      damage: 143,
      attackSpeed: 1,
      r: 27,
      color: "#70a94f",
      outline: "#2d5127",
      reward: { type: "health", amount: 176 },
      score: 1,
      elite: true,
      aggro: 300
    },
    "Dread Warden": {
      hp: 1e3,
      speed: 220,
      damage: 275,
      attackSpeed: 1,
      r: 36,
      color: "#a52e3a",
      outline: "#47101a",
      reward: { type: "damage", amount: 83 },
      score: 1,
      elite: true,
      aggro: 350
    }
  };
  const ENEMY_TYPES = enemyTypes;
  const ENEMY_SPRITE_SOURCES = {
    Bramble: { src: "assets/wildwood/enemies/slime-green.png", size: 46 },
    Needle: { src: "assets/wildwood/enemies/slime-orange.png", size: 42 },
    Mossback: { src: "assets/wildwood/enemies/slime-green-stone.png", size: 62 },
    Spitter: { src: "assets/wildwood/enemies/slime-orange.png", size: 50 },
    Brood: {
      size: 64,
      height: 70,
      layers: [
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg1.png", x: -16, y: 19, w: 15, h: 21 },
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg2.png", x: 1, y: 19, w: 17, h: 22 },
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/body.png", x: -20, y: -5, w: 40, h: 40 },
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/arm2.png", x: 13, y: -1, w: 20, h: 21 },
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/bow.png", x: 15, y: -6, w: 43, h: 33 },
        { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/head.png", x: -32, y: -37, w: 64, h: 46 }
      ]
    },
    Cindermaw: { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 64 },
    "King Slime": { src: "assets/wildwood/enemies/slime-green-king.png", size: 74 },
    "Dread Warden": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 88 }
  };
  const REWARD_DATA = {
    damage: { color: "#ff655a" },
    health: { color: "#66ed79" },
    speed: { color: "#ffe05d" },
    armor: { color: "#d3dbe0" },
    regen: { color: "#ff7ccb" }
  };
  const CAMPS = [
    // Starter: exact +health and +1 damage camps near the top-left spawn.
    { name: "Ember Fen", x: 820, y: 1700, minRadius: 190, radius: 440, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
    { name: "Thornshot Rise", x: 1650, y: 820, minRadius: 190, radius: 440, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
    // Medium: attack-speed and regeneration camps across the top-right.
    { name: "Glass Thicket", x: 3300, y: 900, minRadius: 230, radius: 520, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
    { name: "Brine Marsh", x: 4050, y: 1700, minRadius: 230, radius: 520, count: 5, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
    // Hard: armor enemies occupy the lower-left and late-game routes.
    { name: "Mossfall Ruins", x: 950, y: 3150, minRadius: 250, radius: 570, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
    // Elite locations stay unchanged; regular camp members share one reward type.
    { name: "Cinder Quarry", x: 3830, y: 2790, minRadius: 280, radius: 610, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
    { name: "Moonroot Grove", x: 1540, y: 4040, minRadius: 240, radius: 560, count: 5, types: ["Mossback", "Mossback", "King Slime"], ground: "#3d3157", ring: "#9a79d5" },
    { name: "Sunken Yard", x: 3590, y: 4100, minRadius: 240, radius: 560, count: 5, types: ["Mossback", "Mossback", "King Slime"], ground: "#553334", ring: "#d37362" }
  ];
  function loadEnemySprites() {
    return Object.fromEntries(Object.entries(ENEMY_SPRITE_SOURCES).map(([kind, source]) => {
      if ("layers" in source) {
        const layers = source.layers.map((layer) => {
          const image2 = new Image();
          image2.src = layer.src;
          return { ...layer, image: image2 };
        });
        return [kind, { size: source.size, height: source.height, layers }];
      }
      const image = new Image();
      image.src = source.src;
      return [kind, { size: source.size, image }];
    }));
  }
  function loadActorShadowSprite() {
    const image = new Image();
    image.src = "assets/wildwood/2D Character - Casual Monsters/_PNG/slime/shadow.png";
    return image;
  }
  function rewardLabel(reward) {
    if (reward.type === "damage") return `+${reward.amount} DAMAGE`;
    if (reward.type === "health") return `+${reward.amount} MAX HEALTH`;
    if (reward.type === "speed") return `+${reward.amount.toFixed(2)} ATK/SEC`;
    if (reward.type === "armor") return `+${reward.amount} ARMOR`;
    return `+${reward.amount} HP/SEC`;
  }
  function createWorldLayout(playerSpawn) {
    const decor = [];
    const paths = [];
    const centerX = WORLD.w / 2;
    const centerY = WORLD.h / 2;
    paths.push({ x: centerX - 105, y: 0, w: 210, h: WORLD.h });
    paths.push({ x: 0, y: centerY - 105, w: WORLD.w, h: 210 });
    paths.push({ x: 760, y: 840, w: 1640, h: 120 });
    paths.push({ x: 2400, y: 700, w: 1570, h: 120 });
    paths.push({ x: 780, y: 2790, w: 1620, h: 120 });
    paths.push({ x: 2400, y: 2720, w: 1430, h: 120 });
    paths.push({ x: 1500, y: 3950, w: 2100, h: 120 });
    const isOnRoad = (x, y, margin = 0) => paths.some((path) => x > path.x - margin && x < path.x + path.w + margin && y > path.y - margin && y < path.y + path.h + margin);
    for (let index = 0; index < 36; index += 1) {
      const side = index % 4;
      let x = 0;
      let y = 0;
      let width = 0;
      let height = 0;
      if (side === 0) {
        x = rand(140, WORLD.w - 410);
        y = rand(85, 260);
        width = rand(110, 280);
        height = rand(35, 70);
      }
      if (side === 1) {
        x = rand(WORLD.w - 260, WORLD.w - 85);
        y = rand(140, WORLD.h - 410);
        width = rand(35, 70);
        height = rand(110, 280);
      }
      if (side === 2) {
        x = rand(140, WORLD.w - 410);
        y = rand(WORLD.h - 260, WORLD.h - 85);
        width = rand(110, 280);
        height = rand(35, 70);
      }
      if (side === 3) {
        x = rand(85, 260);
        y = rand(140, WORLD.h - 410);
        width = rand(35, 70);
        height = rand(110, 280);
      }
      decor.push({ type: "stone", x, y, w: width, h: height });
    }
    const groveCenters = [];
    let treeVariant = 0;
    for (let grove = 0; grove < 18; grove += 1) {
      let center = null;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const candidate = { x: rand(180, WORLD.w - 180), y: rand(180, WORLD.h - 180) };
        if (isOnRoad(candidate.x, candidate.y, 150)) continue;
        if (Math.hypot(candidate.x - playerSpawn.x, candidate.y - playerSpawn.y) < 620) continue;
        if (groveCenters.some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < 390)) continue;
        center = candidate;
        break;
      }
      if (!center) continue;
      groveCenters.push(center);
      const treeCount = Math.floor(rand(5, 10));
      const radiusX = rand(90, 185);
      const radiusY = rand(70, 150);
      for (let tree = 0; tree < treeCount; tree += 1) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const angle = rand(0, Math.PI * 2);
          const distance = Math.sqrt(Math.random());
          const x = center.x + Math.cos(angle) * radiusX * distance;
          const y = center.y + Math.sin(angle) * radiusY * distance;
          if (x < 65 || x > WORLD.w - 65 || y < 65 || y > WORLD.h - 65) continue;
          if (isOnRoad(x, y, 65)) continue;
          if (Math.hypot(x - playerSpawn.x, y - playerSpawn.y) < 500) continue;
          decor.push({ type: "tree", x, y, s: rand(0.72, 1.32), variant: treeVariant++ % 16 });
          break;
        }
      }
    }
    for (let index = 0; index < 430; index += 1) {
      const x = rand(24, WORLD.w - 24);
      const y = rand(24, WORLD.h - 24);
      if (!isOnRoad(x, y, 8)) decor.push({ type: "grass", x, y, variant: index % 4 });
    }
    for (let index = 0; index < 115; index += 1) {
      const x = rand(24, WORLD.w - 24);
      const y = rand(24, WORLD.h - 24);
      if (!isOnRoad(x, y, 8)) decor.push({ type: "petal", x, y, variant: index % 3 });
    }
    return { decor, paths };
  }
  function loadTreeSpritesheet(onSettled) {
    const image = new Image();
    if (onSettled) {
      image.addEventListener("load", onSettled, { once: true });
      image.addEventListener("error", onSettled, { once: true });
    }
    image.src = "assets/wildwood/tree-spritesheet-v1.png";
    return image;
  }
  function createSpawnSites(boss) {
    const sites = [];
    let id = 0;
    for (let campIndex = 0; campIndex < CAMPS.length; campIndex += 1) {
      const camp = CAMPS[campIndex];
      for (let index = 0; index < camp.count; index += 1) {
        const angle = index * 2.399963 + campIndex * 0.71;
        const fraction = (index * 37 + campIndex * 19) % 101 / 100;
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
        const type = camp.types[index % camp.types.length];
        sites.push({
          id: id++,
          x,
          y,
          campName: camp.name,
          type,
          leashRange: Math.max(420, camp.radius * 0.9),
          alive: false,
          respawnAt: 0
        });
      }
    }
    return sites;
  }
  const DUEL_REQUEST_RANGE = 250;
  const DUEL_ARENA = { x: 6e3, y: 6e3, r: 430 };
  const DUEL_COMBAT_Y = DUEL_ARENA.y - 60;
  const DUEL_REPLAY_COUNTDOWN_SECONDS = 3;
  const DUEL_SHOT_LIFETIME = 0.38;
  const DUEL_SHOT_SPEED = 620;
  function loadDuelImage(source, onSettled) {
    const image = new Image();
    if (onSettled) {
      image.addEventListener("load", onSettled, { once: true });
      image.addEventListener("error", onSettled, { once: true });
    }
    image.src = source;
    return image;
  }
  function loadDuelSpaceBackground(onSettled) {
    return loadDuelImage("assets/wildwood/duel-space-background-v1.png", onSettled);
  }
  function loadDuelPlatformArt(onSettled) {
    return loadDuelImage("assets/wildwood/duel-floating-platform-v1.png", onSettled);
  }
  function duelStatLine(subject, attacks, damage, regen, blocked) {
    return `<div class="duel-stat-row"><span class="duel-stat-name">${subject}</span><br>ATTACKED ${attacks} TIMES<br>DID ${Math.round(damage)} DMG<br>REGENERATED ${Math.round(regen)} HP<br>BLOCKED ${Math.round(blocked)} DMG</div>`;
  }
  function replayState(replay, seconds) {
    const elapsed = Math.min(replay.durationSeconds, seconds);
    let time = 0;
    let challengerHp = replay.challengerMaxHp;
    let opponentHp = replay.opponentMaxHp;
    let challengerAttacks = 0;
    let opponentAttacks = 0;
    const challengerRate = Math.max(1e-3, replay.challengerAttackRate);
    const opponentRate = Math.max(1e-3, replay.opponentAttackRate);
    while (time < elapsed && challengerHp > 0 && opponentHp > 0) {
      const nextChallengerAttack = challengerAttacks < replay.challengerAttacks ? (challengerAttacks + 1) * challengerRate : Infinity;
      const nextOpponentAttack = opponentAttacks < replay.opponentAttacks ? (opponentAttacks + 1) * opponentRate : Infinity;
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
      if (challengerHits) challengerAttacks += 1;
      if (opponentHits) opponentAttacks += 1;
      if (!challengerHits && !opponentHits) break;
    }
    if (elapsed >= replay.durationSeconds) {
      challengerHp = replay.challengerFinalHp;
      opponentHp = replay.opponentFinalHp;
    }
    return { challengerHp, opponentHp, challengerAttacks, opponentAttacks };
  }
  const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
  const CHAT_DISPLAY_TTL_MS = 108e5;
  const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];
  function createChatController({ elements, getCoop, showMessage, onOpenReplay, onOpenPlayer }) {
    let enabled = true;
    let large = false;
    let renderedRevision = -1;
    let nextExpiryAt = 0;
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
      elements.sizeToggle.setAttribute("aria-expanded", String(large));
      elements.sizeToggle.setAttribute("aria-label", large ? "Minimize chat" : "Expand chat");
      if (large) requestAnimationFrame(() => {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      });
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
      var _a, _b, _c, _d, _e;
      const coop = getCoop();
      const localName = (_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop);
      if (localName && document.activeElement !== elements.displayNameInput) {
        elements.displayNameInput.value = localName;
      }
      const now = Date.now();
      const revision = ((_b = coop == null ? void 0 : coop.chatRevision) == null ? void 0 : _b.call(coop)) ?? -1;
      if (revision === renderedRevision && now < nextExpiryAt) return;
      const messages = (((_c = coop == null ? void 0 : coop.chatMessages) == null ? void 0 : _c.call(coop).filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS)) ?? []).slice(-100);
      renderedRevision = revision;
      nextExpiryAt = messages.length > 0 ? messages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
      elements.messages.replaceChildren();
      for (const message of messages) {
        const line = document.createElement("div");
        line.className = "chat-line";
        const time = document.createElement("span");
        time.className = "chat-time";
        time.textContent = new Date(message.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const name = document.createElement("span");
        name.className = "chat-name";
        name.style.color = nameColor(message.sender);
        const guestSuffix = ((_d = coop == null ? void 0 : coop.isGuest) == null ? void 0 : _d.call(coop, message.sender)) ? " (guest)" : "";
        if (isDeveloperIdentity(message.sender)) {
          const badge = document.createElement("span");
          badge.className = "dev-badge";
          badge.textContent = `${DEVELOPER_BADGE} `;
          name.appendChild(badge);
        }
        name.append(document.createTextNode(`${message.senderName}${guestSuffix}`));
        name.setAttribute("role", "button");
        name.setAttribute("tabindex", "0");
        name.setAttribute("aria-label", `View ${message.senderName}'s profile`);
        const openPlayer = (event) => {
          event.stopPropagation();
          onOpenPlayer == null ? void 0 : onOpenPlayer(message.sender, message.senderName);
        };
        name.addEventListener("click", openPlayer);
        name.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openPlayer(event);
        });
        const text = document.createElement("span");
        text.className = "chat-text";
        text.textContent = message.message;
        const icon = document.createElement("span");
        icon.className = "chat-profile-icon";
        icon.setAttribute("role", "button");
        icon.setAttribute("tabindex", "0");
        icon.setAttribute("aria-label", `View ${message.senderName}'s profile`);
        icon.addEventListener("click", openPlayer);
        icon.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openPlayer(event);
        });
        const iconIndex = Math.max(0, Math.min(63, Math.floor(((_e = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _e.call(coop, message.sender)) ?? 0)));
        icon.style.backgroundPosition = `${iconIndex % 8 / 7 * 100}% ${Math.floor(iconIndex / 8) / 7 * 100}%`;
        line.append(time, icon, name, text);
        if (message.replayId > 0n) {
          line.classList.add("has-replay");
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
    async function saveDisplayName() {
      var _a, _b, _c, _d;
      const name = elements.displayNameInput.value.trim().replace(/\s+/g, " ");
      if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
        showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
        return;
      }
      const currentName = (_b = (_a = getCoop()) == null ? void 0 : _a.localDisplayName) == null ? void 0 : _b.call(_a);
      if (name === currentName) {
        showMessage("NAME ALREADY SET", "#bce7ff");
        return;
      }
      elements.saveNameButton.disabled = true;
      const result = await ((_d = (_c = getCoop()) == null ? void 0 : _c.setDisplayName) == null ? void 0 : _d.call(_c, name));
      elements.saveNameButton.disabled = false;
      if (result == null ? void 0 : result.ok) {
        showMessage("NAME UPDATED", "#c9f5c2");
        return;
      }
      if (/once every 30 days/i.test((result == null ? void 0 : result.error) ?? "")) {
        showMessage("NAME LOCKED · CHANGES EVERY 30 DAYS", "#ff9b91");
        return;
      }
      showMessage("NAME UPDATE FAILED", "#ff9b91");
    }
    function init() {
      elements.toggle.addEventListener("click", () => {
        enabled = !enabled;
        updateVisibility();
      });
      elements.header.addEventListener("pointerup", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        large = !large;
        updateHeight();
      });
      elements.sizeToggle.addEventListener("click", () => {
        large = !large;
        updateHeight();
      });
      elements.form.addEventListener("submit", async (event) => {
        var _a, _b;
        event.preventDefault();
        const message = elements.input.value.trim();
        if (!message) return;
        const bugCommand = /^\/bug(?:\s|$)/i.exec(message);
        if (bugCommand && !message.slice(bugCommand[0].length).trim()) {
          showMessage("USE /BUG FOLLOWED BY A DESCRIPTION", "#ff9b91");
          return;
        }
        const result = await ((_b = (_a = getCoop()) == null ? void 0 : _a.sendChatMessage) == null ? void 0 : _b.call(_a, message));
        if (!(result == null ? void 0 : result.ok)) {
          showMessage((result == null ? void 0 : result.error) || "MESSAGE FAILED", "#ff9b91");
          return;
        }
        elements.input.value = "";
        elements.input.style.height = "28px";
        if (bugCommand) showMessage("BUG REPORT SENT", "#c9f5c2");
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
  const COMPACT_UNITS = ["", "k", "m", "b", "t"];
  function formatCompactNumber(value) {
    if (!Number.isFinite(value)) return "0";
    const sign = value < 0 ? "-" : "";
    const absolute = Math.abs(value);
    if (absolute < 1e3) return `${sign}${Math.round(absolute)}`;
    let unit = Math.min(Math.floor(Math.log10(absolute) / 3), COMPACT_UNITS.length - 1);
    let scaled = absolute / 1e3 ** unit;
    let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let rounded = Number(scaled.toFixed(decimals));
    if (rounded >= 1e3 && unit < COMPACT_UNITS.length - 1) {
      unit += 1;
      scaled = absolute / 1e3 ** unit;
      decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      rounded = Number(scaled.toFixed(decimals));
    }
    return `${sign}${rounded}${COMPACT_UNITS[unit]}`;
  }
  function renderPlayerHud(elements, player, displayName, playerCount, power, isDeveloper = false) {
    const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    elements.hpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
    elements.hpText.textContent = `${formatCompactNumber(Math.max(0, Math.ceil(player.hp)))} / ${formatCompactNumber(Math.ceil(player.maxHp))} HP`;
    if (elements.playerName) {
      const name = displayName || "WANDERER";
      if (isDeveloper) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = "[DEV] ";
        elements.playerName.replaceChildren(badge, document.createTextNode(name));
      } else {
        elements.playerName.textContent = name;
      }
    }
    elements.playerPower.textContent = `Power: ${formatCompactNumber(power)}`;
    if (elements.coopStatus) elements.coopStatus.textContent = `PLAYERS: ${playerCount}`;
  }
  const itemsById = ITEM_DEFINITIONS;
  function renderInventoryView(elements, inventory, actions) {
    elements.items.replaceChildren();
    const itemIds = inventory.itemIds.filter((itemId) => itemsById[itemId]);
    if (!inventory.selectedItemId && itemIds.length) inventory.selectedItemId = itemIds[0];
    elements.count.textContent = `${itemIds.length} / 16`;
    elements.equippedFeet.classList.toggle("is-equipped", inventory.equippedFeet === TRAILBLAZER_BOOTS);
    elements.equippedFeet.innerHTML = inventory.equippedFeet === TRAILBLAZER_BOOTS ? `<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span><span>FEET</span>` : "<span>FEET</span>";
    for (let index = 0; index < 16; index += 1) {
      const itemId = itemIds[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inventory-item" + (itemId ? " is-filled" : "") + (inventory.selectedItemId === itemId ? " is-selected" : "");
      if (itemId) {
        const item = itemsById[itemId];
        button.setAttribute("aria-label", item.name);
        button.setAttribute("aria-pressed", String(inventory.selectedItemId === itemId));
        button.innerHTML = `<span class="boot-pixel-icon" aria-hidden="true"><i></i><i></i></span>`;
        button.addEventListener("click", () => actions.onSelect(itemId));
      } else {
        button.setAttribute("aria-label", `Empty bag slot ${index + 1}`);
        button.disabled = true;
      }
      elements.items.appendChild(button);
    }
    const selected = itemsById[inventory.selectedItemId] ?? itemsById[itemIds[0]];
    if (!selected) {
      elements.detail.textContent = "SELECT AN ITEM TO VIEW ITS STATS";
      return;
    }
    elements.detail.innerHTML = `<div class="inventory-slot">${selected.slot} · ${inventory.equippedFeet === selected.id ? "EQUIPPED" : "IN BAG"}</div><strong>${selected.name}</strong><p>${selected.description}</p><div class="inventory-stats">${selected.stats.join(" · ")}</div>`;
    const actionRow = document.createElement("div");
    actionRow.className = "inventory-actions";
    const equip = document.createElement("button");
    equip.type = "button";
    const equipped = inventory.equippedFeet === selected.id;
    equip.textContent = equipped ? "UNEQUIP" : "EQUIP";
    equip.addEventListener("click", () => equipped ? actions.onUnequip(selected.id) : actions.onEquip(selected.id));
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.className = "secondary-button";
    inspect.textContent = "INSPECT";
    inspect.addEventListener("click", () => actions.onInspect(selected.id));
    actionRow.append(equip, inspect);
    elements.detail.appendChild(actionRow);
  }
  (() => {
    var _b, _c;
    const GAME_VERSION = "0.257";
    const SEEN_VERSION_KEY = "wildwood-seen-version-v1";
    const ATTACK_RANGE_VISIBLE_KEY = "wildwood-attack-range-visible-v1";
    const LATENCY_VISIBLE_KEY = "wildwood-latency-visible-v1";
    const MUSIC_VOLUME_KEY = "wildwood-music-volume-v1";
    const BOOTS_SPEED_BONUS = 25;
    const BASE_PLAYER_HP = 100;
    const BASE_PLAYER_SPEED = 180;
    const PLAYER_PROJECTILE_VISUAL_TAIL = 36;
    const STARTING_ATTACK_INTERVAL = 1.56;
    const MIN_ATTACK_INTERVAL = 0.32;
    const WORLD_HEALTH_BAR_HEIGHT = 13;
    const ENEMY_DEATH_PARTICLE_COLOR = "#e53935";
    const DRAGON_HP_LOSS_FLASH_DURATION = 0.18;
    const DRAGON_HIT_BATCH_DELAY = 0.1;
    const NETWORK_NEAR_SCREEN_MARGIN_RATIO = 0.25;
    const SPEECH_BUBBLE_DURATION_MS = 6e3;
    const SPEECH_BUBBLE_FADE_MS = 1250;
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
    let musicVolume = 0.35;
    try {
      const storedVolume = localStorage.getItem(MUSIC_VOLUME_KEY);
      if (storedVolume !== null) {
        const savedVolume = Number(storedVolume);
        if (Number.isFinite(savedVolume)) musicVolume = clamp(savedVolume, 0, 1);
      }
    } catch {
    }
    backgroundMusic.volume = musicVolume;
    enforceLatestVersion(GAME_VERSION);
    window.setInterval(() => enforceLatestVersion(GAME_VERSION), 3e4);
    const keys = /* @__PURE__ */ new Set();
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
    try {
      attackRangeVisible = localStorage.getItem(ATTACK_RANGE_VISIBLE_KEY) !== "false";
    } catch {
    }
    let latencyVisible = false;
    try {
      latencyVisible = localStorage.getItem(LATENCY_VISIBLE_KEY) === "true";
    } catch {
    }
    let messageClock = 0;
    let activeSpeechBubbles = /* @__PURE__ */ new Map();
    let pausedForUpgrade = false;
    let autoAttackEnabled = true;
    let duelWasActive = false;
    let lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
    let lastDuelHealth = { id: null, challenger: 0, opponent: 0 };
    let lastLocalDuelId = null;
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
    const locallyRewardedDragonEncounters = /* @__PURE__ */ new Set();
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
    const boss = {
      isBoss: true,
      x: WORLD.w - 360,
      y: WORLD.h - 360,
      r: 140,
      maxHp: 1e6,
      hp: 1e6,
      dead: false,
      hurt: 0,
      hpLossFlashFrom: 1e6,
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
    const profileIconSheet = new Image();
    profileIconSheet.addEventListener("load", () => {
      if (!leaderboardEl.hidden) renderLeaderboard();
    });
    profileIconSheet.src = "assets/wildwood/profile-portraits-grid-v1.png";
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
        enemyKills: totalKills
      });
    }
    function loadProgress() {
      var _a, _b2, _c2;
      if (!coop || typeof coop.savedProgress !== "function") return;
      const progressIdentity = ((_a = coop.localIdentity) == null ? void 0 : _a.call(coop)) || "";
      if (progressLoaded && progressLoadedIdentity === progressIdentity) return;
      const saved = coop.savedProgress();
      if (!saved) return;
      const lifetime = (_c2 = (_b2 = coop.playerProfile) == null ? void 0 : _b2.call(coop, progressIdentity)) == null ? void 0 : _c2.lifetime;
      if (lifetime) {
        totalKills = progressIdentity === lifetimeKillsIdentity ? Math.max(totalKills, lifetime.enemyKills) : lifetime.enemyKills;
        lifetimeKillsIdentity = progressIdentity;
      }
      let legacy = null;
      try {
        const candidate = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY));
        if ((candidate == null ? void 0 : candidate.stats) && typeof candidate.stats === "object") legacy = candidate;
      } catch {
      }
      const isDefaultProgress = (progress) => progress.maxHp === BASE_PLAYER_HP && progress.damage === 4 && progress.attackRate === STARTING_ATTACK_INTERVAL && progress.projectileSpeed === BASE_PROJECTILE_SPEED && progress.projectileCount === 1 && progress.attackRange === BASE_ATTACK_RANGE && progress.armor === 0 && progress.regen === 0 && progress.speed === BASE_PLAYER_SPEED && progress.bootsCollected === false;
      const serverIsDefault = isDefaultProgress(saved);
      const source = legacy && serverIsDefault ? { ...legacy.stats, bootsCollected: legacy.bootsCollected === true } : saved;
      if (waitingForFreshStart && saved.introComplete) return;
      const number = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
      player.maxHp = number(source.maxHp, player.maxHp, 1, 1e6);
      player.damage = number(source.damage, player.damage, 1, 1e6);
      player.attackRate = number(source.attackRate, player.attackRate, MIN_ATTACK_INTERVAL, 10);
      player.projectileSpeed = number(source.projectileSpeed, player.projectileSpeed, BASE_PROJECTILE_SPEED, MAX_PROJECTILE_SPEED);
      player.projectileCount = Math.floor(number(source.projectileCount, player.projectileCount, 1, 20));
      player.attackRange = BASE_ATTACK_RANGE;
      player.armor = number(source.armor, player.armor, 0, 1e6);
      player.regen = number(source.regen, player.regen, 0, 1e6);
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
        try {
          localStorage.removeItem(LEGACY_SAVE_KEY);
        } catch {
        }
      }
      startupKind = !saved.introComplete && isDefaultProgress(source) ? "new" : "returning";
      finishStartup();
    }
    function finishStartup() {
      var _a, _b2, _c2, _d, _e;
      updateLoadingDetail();
      const account = (_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop);
      if (hasStarted || running || !loadingSequenceComplete || !playerSpriteReady || !treeSpritesheetReady || !duelSpaceBackgroundReady || !duelPlatformArtReady || !((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop))) return;
      if (!(account == null ? void 0 : account.signedIn) && !guestContinuationChosen) {
        showAccountChoice();
        return;
      }
      if (!progressLoaded || !((_c2 = coop == null ? void 0 : coop.localState) == null ? void 0 : _c2.call(coop))) return;
      if ((account == null ? void 0 : account.signedIn) && !((_d = coop == null ? void 0 : coop.localProfileReady) == null ? void 0 : _d.call(coop))) return;
      if (startupKind === "new") {
        if (!newPlayerIntroShown) {
          newPlayerIntroShown = true;
          showNewPlayerIntro();
        }
        return;
      }
      if (startupKind === "returning") {
        (_e = coop == null ? void 0 : coop.beginAdventure) == null ? void 0 : _e.call(coop);
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
    function updateProtocolGate(accountState = ((_a) => (_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop))()) {
      if (!gameUpdateGateEl) return;
      gameUpdateGateEl.hidden = !(accountState == null ? void 0 : accountState.updating);
    }
    function showAccountChoice() {
      var _a, _b2, _c2;
      const accountState = (_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop);
      const accountOptionsReady = Boolean(((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop)) || (accountState == null ? void 0 : accountState.signInRequired));
      const knownAccount = Boolean(accountState == null ? void 0 : accountState.knownAccount);
      const name = (((_c2 = coop == null ? void 0 : coop.knownCharacter) == null ? void 0 : _c2.call(coop)) || "").trim();
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
        accountChoiceDetail.textContent = accountSignInPending ? "OPENING SIGN-IN…" : !accountOptionsReady ? "CONNECTING ACCOUNT OPTIONS…" : characterFound ? "SIGN IN TO THIS CHARACTER" : knownAccount ? "SIGN IN TO LOAD YOUR CHARACTER" : "REGISTER OR PLAY AS GUEST";
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
      var _a, _b2, _c2;
      if (!loadingDetail || !loadingFill) return;
      const connectionNotice = ((_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop).notice) || "";
      if (/active in another tab/i.test(connectionNotice)) {
        loadingDetail.textContent = connectionNotice;
        loadingFill.style.width = "35%";
        return;
      }
      const stages = [
        ["LOADING CONNECTION", Boolean((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop)), 12],
        ["LOADING PLAYER PROFILE", Boolean((_c2 = coop == null ? void 0 : coop.localState) == null ? void 0 : _c2.call(coop)), 35],
        ["LOADING SAVED PROGRESS", progressLoaded, 60],
        ["LOADING PLAYER SPRITE", playerSpriteReady, 78],
        ["LOADING WORLD ART", treeSpritesheetReady && duelSpaceBackgroundReady && duelPlatformArtReady, 90],
        ["STARTING WILDWOOD", true, 100]
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
      var _a;
      if (!newPlayerNameInput.value) {
        newPlayerNameInput.value = ((_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop)) || "WANDERER";
      }
      startEl.style.display = "grid";
      connectionPanel.hidden = true;
      accountChoicePanel.hidden = true;
      newPlayerPanel.hidden = false;
      requestAnimationFrame(() => newPlayerNameInput.focus());
    }
    function beginAdventure() {
      var _a, _b2;
      const name = newPlayerNameInput.value.trim().replace(/\s+/g, " ");
      if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
        showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
        return;
      }
      if (name !== (((_a = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a.call(coop)) || "")) (_b2 = coop == null ? void 0 : coop.setDisplayName) == null ? void 0 : _b2.call(coop, name);
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
        attackClock: base.ranged ? rand(0.2, 1.2) : 0,
        moveSpeedRecovery: ENEMY_HIT_SPEED_RECOVERY_SECONDS,
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
        life: 0.72,
        maxLife: 0.72,
        text: `-${formatDamage(amount)}`
      });
    }
    function fireAt(target) {
      var _a;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      const baseAngle = Math.atan2(dy, dx);
      const spread = 0.13;
      if (target.isBoss) {
        (_a = coop == null ? void 0 : coop.syncPosition) == null ? void 0 : _a.call(coop, player.x, player.y, player.facing, player.moving, true);
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
        player.attackClock = Math.min(player.attackClock, 0.08);
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
      var _a;
      const shared = (_a = coop == null ? void 0 : coop.dragonBoss) == null ? void 0 : _a.call(coop);
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
      score += 5e3;
      spawnBurst(boss.x, boss.y, ENEMY_DEATH_PARTICLE_COLOR, 64, 230);
    }
    function showDragonResult(result) {
      if (!result || !dragonResultEl || shownDragonResultEncounter === result.encounter) return;
      shownDragonResultEncounter = result.encounter;
      pendingDragonResultEncounter = null;
      const localContribution = result.contributors.find((entry) => {
        var _a;
        return entry.identity === ((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop));
      });
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
        }, 6e3);
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
      var _a;
      if (pendingDragonResultEncounter === null || shownDragonResultEncounter === pendingDragonResultEncounter) return;
      const result = (_a = coop == null ? void 0 : coop.dragonResult) == null ? void 0 : _a.call(coop);
      if ((result == null ? void 0 : result.encounter) === pendingDragonResultEncounter) showDragonResult(result);
    }
    function syncDragonState() {
      var _a;
      const shared = (_a = coop == null ? void 0 : coop.dragonBoss) == null ? void 0 : _a.call(coop);
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
        boss.hpLossFlashFrom = boss.hpLossFlashTimer > 0 ? Math.max(boss.hpLossFlashFrom, previousHp) : previousHp;
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
      if (distance >= minRadius - 34 && distance <= maxRadius + 34 && Math.abs(angleDelta) <= BOSS_CONE_HALF_ANGLE) {
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
        const angle = i * TAU / count + rand(-0.25, 0.25);
        const radius = rand(24, BOSS_RAIN_RANGE);
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
      boss.hpLossFlashTimer = Math.max(0, boss.hpLossFlashTimer - dt);
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
      player.hurtClock = 0.1;
      flash = 0.22;
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
        e.attackClock = Math.max(e.attackClock, 0.5);
      }
    }
    let movementSyncActive = false;
    let observedCoopSessionGeneration = 0;
    function activeDuel() {
      return coop && typeof coop.localDuel === "function" ? coop.localDuel() : null;
    }
    function isDueling() {
      var _a;
      const duel = activeDuel();
      if (!duel || !["countdown", "active", "finishing"].includes(duel.status)) return false;
      if ((duel.status === "active" || duel.status === "finishing") && Date.now() >= duel.endsAtMs) (_a = coop == null ? void 0 : coop.pulseDuel) == null ? void 0 : _a.call(coop);
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
        life: DUEL_SHOT_LIFETIME
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
      if (challengerDamage > 0.01) spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > 0.01) spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
      lastDuelHealth = { id: duel.id, challenger: duel.challengerHp, opponent: duel.opponentHp };
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
      var _a;
      const replay = (coop == null ? void 0 : coop.loadDuelReplay) ? await coop.loadDuelReplay(replayId) : (_a = coop == null ? void 0 : coop.duelReplay) == null ? void 0 : _a.call(coop, replayId);
      if (!replay) {
        showMessage("REPLAY EXPIRED", "#ff9b91");
        return;
      }
      damageNumbers.length = 0;
      replayMode = {
        replay,
        start: performance.now(),
        lastElapsed: 0,
        lastState: {
          challengerHp: replay.challengerMaxHp,
          opponentHp: replay.opponentMaxHp
        }
      };
      duelResultEl.hidden = true;
      duelReplayTitle.textContent = `${replay.challengerName} VS ${replay.opponentName}`;
      duelReplayEl.hidden = false;
      document.body.classList.add("is-replaying");
    }
    function applyDuelState() {
      var _a, _b2, _c2;
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
      syncDuelDamageNumbers(duel);
      heldDuelScene = liveDuelScene(((_b2 = coop == null ? void 0 : coop.remotePlayers) == null ? void 0 : _b2.call(coop)) || []) || heldDuelScene;
      (_c2 = coop.pulseDuel) == null ? void 0 : _c2.call(coop);
      return true;
    }
    function updatePlayer(dt) {
      var _a, _b2, _c2, _d, _e;
      if (applyDuelState()) return;
      if (duelWasActive) {
        const returnedState = (_a = coop == null ? void 0 : coop.localState) == null ? void 0 : _a.call(coop);
        if (!returnedState || returnedState.x < player.r || returnedState.y < player.r || returnedState.x > WORLD.w - player.r || returnedState.y > WORLD.h - player.r) {
          return;
        }
        duelReturnState = {
          x: returnedState.x,
          y: returnedState.y,
          facing: returnedState.facing ?? player.facing
        };
        duelWasActive = false;
        duelResultHold = true;
        duelShots.length = 0;
        lastDuelAttackCounts = { id: null, challenger: 0, opponent: 0 };
        lastDuelHealth = { id: null, challenger: 0, opponent: 0 };
        if (lastLocalDuelId) {
          void ((_b2 = coop == null ? void 0 : coop.loadDuelReplay) == null ? void 0 : _b2.call(coop, lastLocalDuelId).then((replay) => {
            if (replay) showDuelResult(replay);
            else showDuelResultUnavailable();
          }));
        }
        return;
      }
      if (duelResultHold) return;
      const multiplayerActive = Boolean((_c2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _c2.call(coop));
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
        if (Math.abs(mx) + Math.abs(my) > 0.1) player.facing = Math.atan2(my, mx);
      }
      if (typeof ((_d = boss.cone) == null ? void 0 : _d.pushAngle) === "number") {
        const waveSpeed = (BOSS_CONE_RANGE - boss.r) / boss.cone.duration;
        player.x += Math.cos(boss.cone.pushAngle) * waveSpeed * dt;
        player.y += Math.sin(boss.cone.pushAngle) * waveSpeed * dt;
      }
      player.x = clamp(player.x, player.r, WORLD.w - player.r);
      player.y = clamp(player.y, player.r, WORLD.h - player.r);
      if (multiplayerActive) {
        const visibleW = viewW / camera.zoom;
        const visibleH = viewH / camera.zoom;
        const marginX = visibleW * NETWORK_NEAR_SCREEN_MARGIN_RATIO;
        const marginY = visibleH * NETWORK_NEAR_SCREEN_MARGIN_RATIO;
        const highFrequency = ((_e = coop.hasRemotePlayerInArea) == null ? void 0 : _e.call(
          coop,
          camera.x - marginX,
          camera.y - marginY,
          camera.x + visibleW + marginX,
          camera.y + visibleH + marginY
        )) ?? false;
        coop.syncPosition(player.x, player.y, player.facing, player.moving, multiplayerJustStarted, highFrequency);
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
        e.moveSpeedRecovery = Math.min(ENEMY_HIT_SPEED_RECOVERY_SECONDS, e.moveSpeedRecovery + dt);
        e.phase += dt * 3;
        const moveSpeedProgress = e.moveSpeedRecovery / ENEMY_HIT_SPEED_RECOVERY_SECONDS;
        const currentMoveSpeed = ENEMY_HIT_MIN_MOVE_SPEED + (e.speed - ENEMY_HIT_MIN_MOVE_SPEED) * moveSpeedProgress;
        const toPlayerX = player.x - e.x;
        const toPlayerY = player.y - e.y;
        const playerDistance = Math.hypot(toPlayerX, toPlayerY) || 1;
        const homeDistance = Math.hypot(e.x - e.homeX, e.y - e.homeY);
        if (e.leashing && homeDistance < 10) e.leashing = false;
        const aggroRadius = base.elite ? e.aggroRadius : Math.max(0, player.attackRange - REGULAR_ENEMY_AGGRO_PADDING);
        if (!e.leashing && playerDistance < aggroRadius) e.engaged = true;
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
          e.vx += toPlayerX / playerDistance * currentMoveSpeed * rangedMove * dt * 6;
          e.vy += toPlayerY / playerDistance * currentMoveSpeed * rangedMove * dt * 6;
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
            const rangedAttackInterval = 1 / Math.max(0.01, base.attackSpeed);
            e.attackClock = rand(rangedAttackInterval * 0.83, rangedAttackInterval * 1.17);
          }
        } else if (moveMode) {
          e.vx += dx * currentMoveSpeed * dt * 7;
          e.vy += dy * currentMoveSpeed * dt * 7;
        }
        e.vx *= Math.pow(2e-3, dt);
        e.vy *= Math.pow(2e-3, dt);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.x = clamp(e.x, e.r, WORLD.w - e.r);
        e.y = clamp(e.y, e.r, WORLD.h - e.r);
        if (e.engaged && e.attackClock <= 0 && circlesOverlap(player, e)) {
          if (damagePlayer(e.damage)) {
            e.attackClock = 1 / Math.max(0.01, base.attackSpeed);
            e.moveSpeedRecovery = 0;
            e.vx = 0;
            e.vy = 0;
          }
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
      var _a;
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
        if (p.hitLife !== void 0) p.hitLife -= dt;
        p.trail -= dt;
        if (hit) {
          p.x = startX + (endX - startX) * hit.t;
          p.y = startY + (endY - startY) * hit.t;
          const target = hit.enemy;
          spawnDamageNumber(target.x, target.y, p.damage);
          target.hurt = 0.12;
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
      if (pendingDragonHits > 0) {
        dragonHitBatchTimer -= dt;
        if (dragonHitBatchTimer <= 0) {
          (_a = coop == null ? void 0 : coop.damageDragon) == null ? void 0 : _a.call(coop, pendingDragonHits);
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
        p.vx *= Math.pow(0.03, dt);
        p.vy *= Math.pow(0.03, dt);
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
      const targetZoom = clamp((1 - rangeIncrease * 0.5) * 0.85, MIN_CAMERA_ZOOM, 1);
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
    function snapCameraToPlayer() {
      const rangeIncrease = player.attackRange / ATTACK_RANGE_ZOOM_REFERENCE - 1;
      camera.zoom = clamp((1 - rangeIncrease * 0.5) * 0.85, MIN_CAMERA_ZOOM, 1);
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
          const backgroundW = rotateForPortrait ? duelSpaceBackground.naturalHeight : duelSpaceBackground.naturalWidth;
          const backgroundH = rotateForPortrait ? duelSpaceBackground.naturalWidth : duelSpaceBackground.naturalHeight;
          const scale = Math.max(
            visibleW / backgroundW,
            visibleH / backgroundH
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
            const seed = Math.floor(x / spacing) * 73 + Math.floor(y / spacing) * 151 >>> 0;
            if (seed % 5 !== 0) continue;
            const size = seed % 17 === 0 ? 3 : 2;
            ctx.fillStyle = seed % 11 === 0 ? "#b7c9ff" : "#eef3ff";
            ctx.fillRect(x + seed % 29, y + (seed >>> 5) % 31, size, size);
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
      const drawSize = Math.round(154 * o.s);
      const halfWidth = drawSize / 2;
      const cullPadding = 48;
      if (x + halfWidth < -cullPadding || x - halfWidth > visibleW + cullPadding || y < -cullPadding || y - drawSize > visibleH + cullPadding) return;
      if (!treeSpritesheet.complete || treeSpritesheet.naturalWidth <= 0) return;
      const cellW = treeSpritesheet.naturalWidth / 4;
      const cellH = treeSpritesheet.naturalHeight / 4;
      const variant = o.variant % 16;
      const sourceX = variant % 4 * cellW;
      const sourceY = Math.floor(variant / 4) * cellH;
      drawActorShadow(x, y - 5, Math.round(drawSize * 0.62), 0.15);
      ctx.drawImage(
        treeSpritesheet,
        sourceX,
        sourceY,
        cellW,
        cellH,
        Math.round(x - drawSize / 2),
        Math.round(y - drawSize),
        drawSize,
        drawSize
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
    function drawActorShadow(x, y, width, alpha = 0.38) {
      const height = Math.max(8, Math.round(width * 33 / 86));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (actorShadowSprite.complete && actorShadowSprite.naturalWidth > 0) {
        ctx.drawImage(
          actorShadowSprite,
          Math.round(x - width / 2),
          Math.round(y - height / 2),
          Math.round(width),
          height
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
      const displayRadius = DUEL_ARENA.r * 0.75;
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
      drawActorShadow(x, y + 29, 54, actor.isLocal ? 0.21 : 0.17);
      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        const cellW = playerSprite.naturalWidth / 4;
        const cellH = playerSprite.naturalHeight / 4;
        const fx = Math.cos(actor.facing);
        const fy = Math.sin(actor.facing);
        const row = Math.abs(fx) > Math.abs(fy) ? fx < 0 ? 1 : 2 : fy < 0 ? 3 : 0;
        const frame = 0;
        const drawSize = 96;
        const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
        const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
        ctx.save();
        ctx.globalAlpha = actor.isLocal ? 1 : 0.88;
        ctx.drawImage(
          playerSprite,
          frame * cellW,
          row * cellH,
          cellW,
          cellH,
          Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT),
          Math.floor(y - drawSize / 2 + offsetY),
          drawSize,
          drawSize
        );
        ctx.restore();
      }
      drawActorStatus({
        x,
        y,
        identity: actor.identity,
        name: actor.name,
        nameColor: actor.isLocal ? "#ffffff" : "#9eeeff",
        hp: actor.hp,
        maxHp: actor.maxHp,
        power: null,
        fillColor: actor.isLocal ? "#46cf5a" : "#55a9c6"
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
    function publicPlayerName(identity, name) {
      var _a;
      const baseName = name || "PLAYER";
      const guestName = ((_a = coop == null ? void 0 : coop.isGuest) == null ? void 0 : _a.call(coop, identity)) ? `${baseName} (guest)` : baseName;
      return isDeveloperIdentity(identity) ? `${DEVELOPER_BADGE} ${guestName}` : guestName;
    }
    function renderDomPlayerName(element, identity, name) {
      var _a;
      const baseName = name || "PLAYER";
      element.replaceChildren();
      if (isDeveloperIdentity(identity)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = `${DEVELOPER_BADGE} `;
        element.appendChild(badge);
      }
      element.append(document.createTextNode(baseName));
      if ((_a = coop == null ? void 0 : coop.isGuest) == null ? void 0 : _a.call(coop, identity)) element.append(document.createTextNode(" (guest)"));
    }
    function applyProfileIcon(element, iconIndex) {
      const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
      const column = index % 8;
      const row = Math.floor(index / 8);
      element.style.backgroundPosition = `${column / 7 * 100}% ${row / 7 * 100}%`;
      element.dataset.profileIcon = String(index);
    }
    function paintProfileIconCanvas(canvas2, iconIndex) {
      const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
      const iconContext = canvas2.getContext("2d");
      if (!iconContext) return;
      iconContext.clearRect(0, 0, canvas2.width, canvas2.height);
      if (!profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
      const cellWidth = profileIconSheet.naturalWidth / 8;
      const cellHeight = profileIconSheet.naturalHeight / 8;
      iconContext.imageSmoothingEnabled = true;
      iconContext.drawImage(
        profileIconSheet,
        index % 8 * cellWidth,
        Math.floor(index / 8) * cellHeight,
        cellWidth,
        cellHeight,
        0,
        0,
        canvas2.width,
        canvas2.height
      );
    }
    function drawProfileIcon(identity, x, bottom, size = 15) {
      var _a;
      if (!identity || !profileIconSheet.complete || profileIconSheet.naturalWidth <= 0) return;
      const index = Math.max(0, Math.min(63, Math.floor(((_a = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _a.call(coop, identity)) ?? 0)));
      const cellW = profileIconSheet.naturalWidth / 8;
      const cellH = profileIconSheet.naturalHeight / 8;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        profileIconSheet,
        index % 8 * cellW,
        Math.floor(index / 8) * cellH,
        cellW,
        cellH,
        Math.round(x),
        Math.round(bottom - size),
        size,
        size
      );
      ctx.restore();
    }
    function drawPlayer() {
      var _a, _b2, _c2, _d;
      const x = Math.floor(player.x - camera.x);
      const y = Math.floor(player.y - camera.y);
      drawActorShadow(x, y + 29, 54, 0.21);
      if (playerSprite.complete && playerSprite.naturalWidth > 0) {
        const cellW = playerSprite.naturalWidth / 4;
        const cellH = playerSprite.naturalHeight / 4;
        const fx = Math.cos(player.facing);
        const fy = Math.sin(player.facing);
        const row = Math.abs(fx) > Math.abs(fy) ? fx < 0 ? 1 : 2 : fy < 0 ? 3 : 0;
        const frame = player.moving ? Math.floor(gameTime * 10) % 4 : 0;
        const drawSize = 96;
        const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
        const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
        ctx.drawImage(
          playerSprite,
          frame * cellW,
          row * cellH,
          cellW,
          cellH,
          Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT),
          Math.floor(y - drawSize / 2 + offsetY),
          drawSize,
          drawSize
        );
      }
      drawActorStatus({
        x,
        y,
        identity: (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop),
        name: publicPlayerName((_b2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _b2.call(coop), (_c2 = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _c2.call(coop)),
        nameColor: "#ffffff",
        hp: player.hp,
        maxHp: player.maxHp,
        power: playerPower(player),
        fillColor: "#46cf5a"
      });
      drawSpeechBubble((_d = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _d.call(coop), x, y);
    }
    function updateSpeechBubbles() {
      var _a;
      activeSpeechBubbles = /* @__PURE__ */ new Map();
      const now = Date.now();
      const messages = ((_a = coop == null ? void 0 : coop.chatMessages) == null ? void 0 : _a.call(coop)) ?? [];
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
      const opacity = bubble.age <= fadeStart ? 1 : clamp(1 - (bubble.age - fadeStart) / SPEECH_BUBBLE_FADE_MS, 0, 1);
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
      const bottom = Math.max(height + 8, y - 92);
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
        ctx.fillText(line, centerX, top + paddingY + lineHeight * (index + 0.5));
      });
      ctx.restore();
    }
    function drawActorStatus({ x, y, identity, name, nameColor, hp, maxHp, power, fillColor }) {
      const centerX = Math.round(x);
      const barW = 77;
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
      const powerBaseline = barY - 7;
      const nameBaseline = power === null ? powerBaseline : powerBaseline - 17;
      drawPlayerName(identity, name, centerX, nameBaseline, nameColor);
      if (power !== null) drawPlayerPowerValue(power, centerX, powerBaseline);
    }
    function drawPlayerName(identity, name, x, y, color) {
      if (!name) return;
      ctx.save();
      ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textBaseline = "bottom";
      const nameWidth = ctx.measureText(name).width;
      drawProfileIcon(identity, x - nameWidth / 2 - 19, y, 15);
      const developerPrefix = `${DEVELOPER_BADGE} `;
      if (name.startsWith(developerPrefix)) {
        const playerName = name.slice(developerPrefix.length);
        const prefixWidth = ctx.measureText(developerPrefix).width;
        const totalWidth = prefixWidth + ctx.measureText(playerName).width;
        const left = x - totalWidth / 2;
        ctx.textAlign = "left";
        outlinedText(developerPrefix, left, y, "#ffd85b", 2);
        outlinedText(playerName, left + prefixWidth, y, color, 2);
      } else {
        ctx.textAlign = "center";
        outlinedText(name, x, y, color, 2);
      }
      ctx.restore();
    }
    function playerPower(stats) {
      const attackSpeedMultiplier = STARTING_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
      return Math.round(
        stats.damage * attackSpeedMultiplier + stats.maxHp + stats.armor * 3 + stats.regen * 10
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
        drawActorShadow(x, y + 29, 54, 0.16);
        if (playerSprite.complete && playerSprite.naturalWidth > 0) {
          const cellW = playerSprite.naturalWidth / 4;
          const cellH = playerSprite.naturalHeight / 4;
          const fx = Math.cos(other.facing);
          const fy = Math.sin(other.facing);
          const row = Math.abs(fx) > Math.abs(fy) ? fx < 0 ? 1 : 2 : fy < 0 ? 3 : 0;
          const frame = other.moving ? Math.floor(gameTime * 10) % 4 : 0;
          const drawSize = 96;
          const offsetX = PLAYER_SPRITE_X_OFFSETS[row][frame] * drawSize / cellW;
          const offsetY = PLAYER_SPRITE_Y_OFFSETS[row];
          ctx.save();
          ctx.globalAlpha = 0.82;
          ctx.drawImage(
            playerSprite,
            frame * cellW,
            row * cellH,
            cellW,
            cellH,
            Math.floor(x - drawSize / 2 + offsetX + PLAYER_SPRITE_CENTER_X_SHIFT),
            Math.floor(y - drawSize / 2 + offsetY),
            drawSize,
            drawSize
          );
          ctx.restore();
        }
        drawActorStatus({
          x,
          y,
          identity: other.id,
          name: publicPlayerName(other.id, other.name),
          nameColor: "#9eeeff",
          hp: other.hp,
          maxHp: other.maxHp,
          power: Number.isFinite(other.power) ? other.power : playerPower(other),
          fillColor: "#55a9c6"
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
      drawActorShadow(x, y + 93, 188, 0.24);
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
    function drawEnemy(e) {
      const visibleW = viewW / camera.zoom;
      const visibleH = viewH / camera.zoom;
      const x = Math.floor(e.x - camera.x);
      const y = Math.floor(e.y - camera.y);
      const base = ENEMY_TYPES[e.type];
      if (x < -80 || y < -80 || x > visibleW + 80 || y > visibleH + 80) return;
      const sprite = ENEMY_SPRITES[e.type];
      const spriteReady = (sprite == null ? void 0 : sprite.layers) ? sprite.layers.every((layer) => layer.image.complete && layer.image.naturalWidth > 0) : (sprite == null ? void 0 : sprite.image.complete) && sprite.image.naturalWidth > 0;
      const spriteHeight = spriteReady ? sprite.height ?? sprite.size * sprite.image.naturalHeight / sprite.image.naturalWidth : e.r * 2;
      const shadowWidth = Math.max(34, Math.min(76, ((sprite == null ? void 0 : sprite.size) ?? e.r * 2) * 0.9));
      const shadowY = y + Math.max(10, Math.min(30, spriteHeight / 2 - 4));
      drawActorShadow(x, shadowY, shadowWidth, 0.36);
      ctx.save();
      ctx.translate(x, y);
      if (spriteReady) {
        ctx.globalAlpha = e.hurt > 0 ? 0.7 : 1;
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
      const barW = Math.max(50, Math.min(86, ((sprite == null ? void 0 : sprite.size) ?? e.r * 2) * 1.26));
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
      const treeCullPadding = 48;
      for (const tree of decor) {
        if (tree.type !== "tree") continue;
        const treeSize = Math.round(154 * tree.s);
        const treeHalfWidth = treeSize / 2;
        if (tree.x + treeHalfWidth < camera.x - treeCullPadding || tree.x - treeHalfWidth > camera.x + visibleW + treeCullPadding || tree.y < camera.y - treeCullPadding || tree.y - treeSize > camera.y + visibleH + treeCullPadding) continue;
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
          draw: () => drawRemotePlayers([remotePlayer])
        });
      }
      layers.push({ depth: player.y + 29, priority: 1, draw: drawPlayer });
      layers.sort((a, b) => a.depth - b.depth || a.priority - b.priority);
      for (const layer of layers) layer.draw();
    }
    function drawMinimap(remotePlayers) {
      const size = Math.min(180, Math.max(110, viewW * 0.17));
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
      outlinedText("TUTORIAL FOREST", x + size / 2, y + 7, "#f5f5e9", 1.5);
      ctx.restore();
      const sx = size / WORLD.w;
      const sy = size / WORLD.h;
      ctx.save();
      roundRect(x + 5, y + 5, size - 10, size - 10, 7);
      ctx.clip();
      ctx.fillStyle = "#31945b";
      ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
      ctx.fillStyle = "#8b6551";
      for (const p of paths) {
        ctx.fillRect(x + p.x * sx, y + p.y * sy, p.w * sx, p.h * sy);
      }
      ctx.fillStyle = "#ff5d5d";
      for (const e of enemies) {
        const markerSize = ENEMY_TYPES[e.type].elite ? 5 : 3;
        ctx.fillRect(x + e.x * sx - 1, y + e.y * sy - 1, markerSize, markerSize);
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
    function duelCameraPosition() {
      const zoom = Math.min(1, Math.max(0.65, Math.min(viewW, viewH) / 820));
      camera.zoom = zoom;
      camera.x = DUEL_ARENA.x - viewW / zoom / 2;
      camera.y = DUEL_ARENA.y - viewH / zoom / 2;
    }
    function liveDuelScene(remotePlayers) {
      var _a;
      const duel = activeDuel();
      if (!duel) return null;
      const localId = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      const remoteName = (identity) => {
        var _a2;
        return ((_a2 = remotePlayers.find((other) => other.id === identity)) == null ? void 0 : _a2.name) ?? "OPPONENT";
      };
      const actor = (identity, isChallenger) => {
        var _a2;
        return {
          identity,
          x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
          y: DUEL_COMBAT_Y,
          name: identity === localId ? ((_a2 = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _a2.call(coop)) || "PLAYER" : remoteName(identity),
          hp: isChallenger ? duel.challengerHp : duel.opponentHp,
          maxHp: isChallenger ? duel.challengerMaxHp : duel.opponentMaxHp,
          facing: isChallenger ? 0 : Math.PI,
          isLocal: identity === localId
        };
      };
      return {
        challenger: actor(duel.challenger, true),
        opponent: actor(duel.opponent, false),
        shots: duelShots,
        countdown: duel.status === "countdown" ? Math.max(1, Math.ceil((duel.startsAtMs - Date.now()) / 1e3)) : 0
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
            color
          });
        }
      };
      addShots(replay.challengerAttackRate, replay.challengerAttacks, DUEL_ARENA.x - 120, DUEL_ARENA.x + 120, "#ffe36b");
      addShots(replay.opponentAttackRate, replay.opponentAttacks, DUEL_ARENA.x + 120, DUEL_ARENA.x - 120, "#ff8aa8");
      return shots;
    }
    function replayDuelScene() {
      const replay = replayMode.replay;
      const totalElapsed = Math.max(0, (performance.now() - replayMode.start) / 1e3);
      const countdown = Math.max(0, Math.ceil(DUEL_REPLAY_COUNTDOWN_SECONDS - totalElapsed));
      const elapsed = Math.min(replay.durationSeconds, Math.max(0, totalElapsed - DUEL_REPLAY_COUNTDOWN_SECONDS));
      const state = replayState(replay, elapsed);
      if (elapsed >= replayMode.lastElapsed) {
        const challengerDamage = replayMode.lastState.challengerHp - state.challengerHp;
        const opponentDamage = replayMode.lastState.opponentHp - state.opponentHp;
        if (challengerDamage > 0.01) spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
        if (opponentDamage > 0.01) spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
      }
      replayMode.lastElapsed = elapsed;
      replayMode.lastState = {
        challengerHp: state.challengerHp,
        opponentHp: state.opponentHp
      };
      const actor = (isChallenger) => ({
        x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
        y: DUEL_COMBAT_Y,
        name: isChallenger ? replay.challengerName : replay.opponentName,
        hp: isChallenger ? state.challengerHp : state.opponentHp,
        maxHp: isChallenger ? replay.challengerMaxHp : replay.opponentMaxHp,
        facing: isChallenger ? 0 : Math.PI,
        isLocal: false
      });
      duelReplayTitle.textContent = countdown > 0 ? `${replay.challengerName} VS ${replay.opponentName}` : `${replay.challengerName} VS ${replay.opponentName} · ${elapsed.toFixed(1)} / ${replay.durationSeconds.toFixed(1)}s`;
      return {
        challenger: actor(true),
        opponent: actor(false),
        shots: countdown > 0 ? [] : replayDuelShots(replay, elapsed),
        countdown
      };
    }
    function drawVignette() {
      const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.25, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72);
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
      const floatY = Math.sin(performance.now() / 1e3 * 1.2) * 7;
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
      drawDepthSortedWorld(remotePlayers);
      drawParticles();
      drawDamageNumbers();
      ctx.restore();
      if (!isDueling()) drawMinimap(remotePlayers);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,55,40,${flash * 0.75})`;
        ctx.fillRect(0, 0, viewW, viewH);
      }
      drawVignette();
    }
    function updateHud() {
      var _a, _b2, _c2, _d, _e, _f;
      const remoteCount = coop && typeof coop.remotePlayerCount === "function" ? coop.remotePlayerCount() : coop ? coop.remotePlayers().length : 0;
      const reportedOnline = coop && typeof coop.onlinePlayerCount === "function" ? coop.onlinePlayerCount() : null;
      const playerCount = coop && coop.isConnected() ? Number.isFinite(reportedOnline) ? reportedOnline : remoteCount + 1 : 0;
      const developer = isDeveloperIdentity((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop));
      applyProfileIcon(playerHudProfileIcon, ((_b2 = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _b2.call(coop)) ?? 0);
      devAuditBtn.hidden = !developer;
      if (!developer && !devAuditEl.hidden) closeDevAudit();
      renderPlayerHud(
        { hpFill, hpText, playerName: playerNameEl, playerPower: playerPowerEl, coopStatus: coopStatusEl },
        player,
        ((_d = coop == null ? void 0 : coop.isGuest) == null ? void 0 : _d.call(coop, (_c2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _c2.call(coop))) ? `${((_e = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _e.call(coop)) || "WANDERER"} (guest)` : ((_f = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _f.call(coop)) || "WANDERER",
        playerCount,
        playerPower(player),
        developer
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
      var _a, _b2, _c2;
      if (identity === ((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop))) return Boolean((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop));
      return ((_c2 = coop == null ? void 0 : coop.remotePlayers) == null ? void 0 : _c2.call(coop).some((other) => other.id === identity)) === true;
    }
    function profilePresenceText(online, lastSeenAtMs) {
      if (online) return "ONLINE";
      if (!Number.isFinite(lastSeenAtMs) || lastSeenAtMs <= 0) return "LAST SEEN —";
      const lastSeen = new Date(lastSeenAtMs);
      const options = lastSeen.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" };
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
      var _a, _b2, _c2;
      if (!profile || profile.identity !== openProfileIdentity) return;
      const { progress, lifetime } = profile;
      openProfileData = profile;
      const online = isProfileOnline(profile.identity);
      const presenceText = profilePresenceText(online, lifetime.sessionStartedAtMs);
      const activeSeconds = online ? Math.max(0, (Date.now() - lifetime.sessionStartedAtMs) / 1e3) : 0;
      const power = playerPower(progress);
      renderDomPlayerName(playerProfileNameEl, profile.identity, profile.name);
      playerProfilePresenceEl.textContent = presenceText;
      playerProfilePresenceEl.classList.toggle("is-online", online);
      applyProfileIcon(playerProfileIcon, ((_a = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _a.call(coop, profile.identity)) ?? 0);
      const ownProfile = profile.identity === ((_b2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _b2.call(coop));
      playerProfileIcon.classList.toggle("is-editable", ownProfile);
      playerProfileIcon.disabled = !ownProfile;
      playerProfileIcon.setAttribute("aria-label", ownProfile ? "Choose profile icon" : `${profile.name}'s profile icon`);
      playerProfilePowerEl.textContent = `Power: ${formatCompactNumber(power)}`;
      profileJoinedEl.textContent = new Date(lifetime.joinedAtMs).toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
      profileTimePlayedEl.textContent = formatPlayedTime(lifetime.playedSeconds + activeSeconds);
      profileKillsEl.textContent = Math.round(lifetime.enemyKills).toLocaleString();
      profileOnlineEl.textContent = presenceText;
      profileOnlineEl.style.color = online ? "#72ef58" : "#b7c5b7";
      const stats = [
        ["MAX HP", Math.round(progress.maxHp).toLocaleString()],
        ["DAMAGE", Math.round(progress.damage).toLocaleString()],
        ["ARMOR", Math.round(progress.armor).toLocaleString()],
        ["ATTACK SPEED", `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= MIN_ATTACK_INTERVAL + 1e-4 ? " (MAX)" : ""}`],
        ["ATTACK RANGE", Math.round(progress.attackRange).toLocaleString()],
        ["REGEN", `${progress.regen.toFixed(1)}/s`],
        ["MOVE SPEED", Math.round(progress.speed).toLocaleString()],
        ["PROJECTILE SPEED", Math.round(progress.projectileSpeed).toLocaleString()],
        ["PROJECTILES", String(progress.projectileCount)]
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
      editPlayerSaveBtn.hidden = !isDeveloperIdentity((_c2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _c2.call(coop));
      profileOverviewPanel.hidden = !profileOverviewTab.classList.contains("is-active");
      profileStatsPanel.hidden = !profileStatsTab.classList.contains("is-active");
    }
    async function openPlayerProfile(identity, fallbackName = "PLAYER") {
      var _a, _b2, _c2, _d, _e;
      if (!identity) return;
      openProfileIdentity = identity;
      openProfileData = null;
      profileEditPanel.hidden = true;
      editPlayerSaveBtn.hidden = true;
      playerProfileEl.hidden = false;
      renderDomPlayerName(playerProfileNameEl, identity, fallbackName);
      const online = isProfileOnline(identity);
      playerProfilePresenceEl.textContent = online ? "ONLINE" : "CHECKING LAST SEEN";
      playerProfilePresenceEl.classList.toggle("is-online", online);
      applyProfileIcon(playerProfileIcon, ((_a = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _a.call(coop, identity)) ?? 0);
      playerProfileIcon.classList.toggle("is-editable", identity === ((_b2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _b2.call(coop)));
      playerProfileIcon.disabled = identity !== ((_c2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _c2.call(coop));
      playerProfilePowerEl.textContent = "Power: —";
      playerProfileLoadingEl.hidden = false;
      profileOverviewPanel.hidden = true;
      profileStatsPanel.hidden = true;
      setProfileTab("stats");
      profileStatsPanel.hidden = true;
      const cached = (_d = coop == null ? void 0 : coop.playerProfile) == null ? void 0 : _d.call(coop, identity);
      if (cached) {
        renderPlayerProfile(cached);
        return;
      }
      const loaded = await ((_e = coop == null ? void 0 : coop.loadPlayerProfile) == null ? void 0 : _e.call(coop, identity));
      if (identity !== openProfileIdentity) return;
      if (loaded) renderPlayerProfile(loaded);
      else playerProfileLoadingEl.textContent = "PLAYER DATA UNAVAILABLE";
    }
    function closePlayerProfile() {
      var _a;
      playerProfileEl.hidden = true;
      openProfileIdentity = "";
      openProfileData = null;
      profileEditPanel.hidden = true;
      playerProfileLoadingEl.textContent = "LOADING PLAYER…";
      (_a = coop == null ? void 0 : coop.releasePlayerProfile) == null ? void 0 : _a.call(coop);
    }
    function renderLeaderboard() {
      var _a, _b2;
      const valueKey = leaderboardStat === "health" ? "maxHp" : leaderboardStat;
      const entries = (((_a = coop == null ? void 0 : coop.leaderboardEntries) == null ? void 0 : _a.call(coop)) ?? []).filter((entry) => Number.isFinite(entry[valueKey])).sort((a, b) => b[valueKey] - a[valueKey] || a.name.localeCompare(b.name)).slice(0, 100);
      const localIdentity = ((_b2 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _b2.call(coop)) || "";
      leaderboardRowsEl.replaceChildren();
      entries.forEach((entry, index) => {
        var _a2;
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
        paintProfileIconCanvas(icon, ((_a2 = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _a2.call(coop, entry.identity)) ?? 0);
        const value = document.createElement("span");
        value.className = "leaderboard-value";
        value.textContent = leaderboardStat === "regen" ? `${entry.regen < 1e3 ? Number(entry.regen.toFixed(2)) : formatCompactNumber(entry.regen)}/s` : formatCompactNumber(entry[valueKey]);
        row.append(rank, icon, name, value);
        leaderboardRowsEl.appendChild(row);
      });
      leaderboardEmptyEl.hidden = entries.length > 0;
      leaderboardRowsEl.hidden = entries.length === 0;
    }
    function setLeaderboardTab(tab) {
      leaderboardStat = ["power", "damage", "health", "armor", "regen"].includes(tab) ? tab : "power";
      const power = leaderboardStat === "power";
      const damage = leaderboardStat === "damage";
      const health = leaderboardStat === "health";
      const armor = leaderboardStat === "armor";
      const regen = leaderboardStat === "regen";
      leaderboardPowerTab.classList.toggle("is-active", power);
      leaderboardDamageTab.classList.toggle("is-active", damage);
      leaderboardHealthTab.classList.toggle("is-active", health);
      leaderboardArmorTab.classList.toggle("is-active", armor);
      leaderboardRegenTab.classList.toggle("is-active", regen);
      leaderboardPowerTab.setAttribute("aria-selected", String(power));
      leaderboardDamageTab.setAttribute("aria-selected", String(damage));
      leaderboardHealthTab.setAttribute("aria-selected", String(health));
      leaderboardArmorTab.setAttribute("aria-selected", String(armor));
      leaderboardRegenTab.setAttribute("aria-selected", String(regen));
      leaderboardValueHeading.textContent = leaderboardStat === "health" ? "HEALTH" : leaderboardStat.toUpperCase();
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
      var _a;
      const entries = (((_a = coop == null ? void 0 : coop.accessAuditEntries) == null ? void 0 : _a.call(coop)) ?? []).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs || a.displayName.localeCompare(b.displayName));
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
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
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
          var _a2;
          save.disabled = true;
          const result = await ((_a2 = coop == null ? void 0 : coop.setAccessAuditLabel) == null ? void 0 : _a2.call(coop, entry.identity, input.value));
          save.disabled = false;
          showMessage((result == null ? void 0 : result.ok) ? "AUDIT LABEL SAVED" : (result == null ? void 0 : result.error) || "AUDIT UPDATE FAILED", (result == null ? void 0 : result.ok) ? "#72ef58" : "#ff9b91");
        });
        editor.append(input, save);
        row.append(account, lastSeen, client, editor);
        devAuditRowsEl.appendChild(row);
      }
      devAuditEmptyEl.hidden = entries.length > 0;
      devAuditRowsEl.hidden = entries.length === 0;
    }
    function openDevAudit() {
      var _a;
      if (!isDeveloperIdentity((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop))) return;
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
      var _a;
      if (!openProfileData || !isDeveloperIdentity((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop))) return;
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
      var _a;
      profileEditPanel.hidden = true;
      editPlayerSaveBtn.hidden = !openProfileData || !isDeveloperIdentity((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop));
    }
    async function savePlayerSaveEdit() {
      var _a, _b2;
      if (!openProfileIdentity || !isDeveloperIdentity((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop))) return;
      savePlayerSaveEditBtn.disabled = true;
      const result = await ((_b2 = coop == null ? void 0 : coop.updatePlayerSave) == null ? void 0 : _b2.call(coop, openProfileIdentity, {
        displayName: profileEditName.value,
        maxHp: Number(profileEditMaxHp.value),
        damage: Number(profileEditDamage.value),
        attackRate: Number(profileEditAttackRate.value),
        armor: Number(profileEditArmor.value),
        regen: Number(profileEditRegen.value),
        speed: Number(profileEditSpeed.value),
        attackRange: Number(profileEditAttackRange.value),
        projectileSpeed: Number(profileEditProjectileSpeed.value),
        projectileCount: Number(profileEditProjectileCount.value)
      }));
      savePlayerSaveEditBtn.disabled = false;
      if (!(result == null ? void 0 : result.ok)) {
        showMessage((result == null ? void 0 : result.error) || "DATABASE UPDATE FAILED", "#ff9b91");
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
      try {
        seenVersion = localStorage.getItem(SEEN_VERSION_KEY) || "";
      } catch {
      }
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
      try {
        localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION);
      } catch {
      }
    }
    function openProfileIconPicker() {
      var _a, _b2;
      if (!((_a = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _a.call(coop))) return;
      const selected = ((_b2 = coop == null ? void 0 : coop.profileIcon) == null ? void 0 : _b2.call(coop)) ?? 0;
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
          var _a2, _b3;
          const result = await ((_a2 = coop == null ? void 0 : coop.setProfileIcon) == null ? void 0 : _a2.call(coop, index));
          if (!(result == null ? void 0 : result.ok)) {
            showMessage((result == null ? void 0 : result.error) || "PROFILE ICON UPDATE FAILED", "#ff9b91");
            return;
          }
          applyProfileIcon(playerHudProfileIcon, index);
          if (openProfileIdentity === ((_b3 = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _b3.call(coop))) applyProfileIcon(playerProfileIcon, index);
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
      var _a, _b2, _c2;
      if (!running || !playerProfileEl.hidden || isDueling()) return false;
      const worldX = camera.x + clientX / camera.zoom;
      const worldY = camera.y + clientY / camera.zoom;
      let target = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      const isPlayerProfileHit = (dx, dy) => Math.abs(dx) <= 48 && dy >= -60 && dy <= 60 || Math.abs(dx) <= 125 && dy >= -105 && dy < -45;
      const localIdentity = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      if (localIdentity) {
        const dx = worldX - player.x;
        const dy = worldY - player.y;
        if (isPlayerProfileHit(dx, dy)) {
          target = { id: localIdentity, name: ((_b2 = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _b2.call(coop)) || "PLAYER" };
          bestDistance = dx * dx + dy * dy;
        }
      }
      for (const other of ((_c2 = coop == null ? void 0 : coop.remotePlayers) == null ? void 0 : _c2.call(coop)) ?? []) {
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
            var _a;
            if (((_a = ITEM_DEFINITIONS[itemId]) == null ? void 0 : _a.slot) !== "FEET") return;
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
          }
        }
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
      var _a, _b2;
      const opponentId = duel.challenger === ((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop)) ? duel.opponent : duel.challenger;
      const opponent = (_b2 = coop == null ? void 0 : coop.remotePlayers) == null ? void 0 : _b2.call(coop).find((other) => other.id === opponentId);
      return opponent ? publicPlayerName(opponent.id, opponent.name) : "OPPONENT";
    }
    function updateDuelControls() {
      var _a, _b2;
      if (!duelControls) return;
      const duel = activeDuel();
      const localId = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      const nearby = nearbyDuelOpponent();
      duelStatusEl.hidden = false;
      duelRequestBtn.hidden = true;
      duelAcceptBtn.hidden = true;
      if (((duel == null ? void 0 : duel.status) === "active" || (duel == null ? void 0 : duel.status) === "finishing") && Date.now() >= duel.endsAtMs) {
        (_b2 = coop == null ? void 0 : coop.pulseDuel) == null ? void 0 : _b2.call(coop);
      }
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
      if ((duel == null ? void 0 : duel.status) === "finishing") {
        duelStatusEl.textContent = "DUEL COMPLETE";
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
        duelRequestBtn.textContent = `Challenge ${publicPlayerName(nearby.id, nearby.name)} to Duel`;
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
    function startGame(markIntro = true) {
      var _a, _b2;
      startEl.style.display = "none";
      overEl.style.display = "none";
      pausedForUpgrade = false;
      bootUpgradeEl.hidden = true;
      reset(hasStarted);
      hasStarted = true;
      running = true;
      if (markIntro) (_a = coop == null ? void 0 : coop.beginAdventure) == null ? void 0 : _a.call(coop);
      if ((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop)) coop.syncPosition(player.x, player.y, player.facing, false, true);
      last = performance.now();
      ensureMusicPlayback();
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
      var _a, _b2;
      latencyStatusEl.hidden = !latencyVisible;
      if (!latencyVisible) return;
      const latency = (_a = coop == null ? void 0 : coop.latencyMs) == null ? void 0 : _a.call(coop);
      const connected = Boolean((_b2 = coop == null ? void 0 : coop.isConnected) == null ? void 0 : _b2.call(coop));
      const rounded = typeof latency === "number" && Number.isFinite(latency) ? Math.round(latency) : null;
      const displayedLatency = connected ? rounded : null;
      const text = displayedLatency !== null ? `PING: ${displayedLatency}MS` : "PING: --";
      if (latencyStatusEl.textContent !== text) latencyStatusEl.textContent = text;
      latencyStatusEl.dataset.quality = displayedLatency === null ? "" : displayedLatency <= 80 ? "good" : displayedLatency <= 150 ? "fair" : "poor";
    }
    function updateMusicVolume() {
      const percent = Math.round(musicVolume * 100);
      backgroundMusic.volume = musicVolume;
      if (musicVolumeInput) musicVolumeInput.value = String(percent);
      if (musicVolumeValue) musicVolumeValue.textContent = `${percent}%`;
    }
    function ensureMusicPlayback() {
      if (!hasStarted && !running || musicVolume <= 0 || !backgroundMusic.paused) return;
      void backgroundMusic.play().catch(() => {
      });
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
    function updateAccountStatus() {
      var _a;
      if (!accountButton || !accountStatusEl) return;
      const account = ((_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop)) || { signedIn: false, notice: "" };
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
    devAuditBtn.addEventListener("click", openDevAudit);
    closeDevAuditBtn.addEventListener("click", closeDevAudit);
    devAuditEl.addEventListener("click", (event) => {
      if (event.target === devAuditEl) closeDevAudit();
    });
    equippedFeetSlot == null ? void 0 : equippedFeetSlot.addEventListener("click", () => {
      if (inventory.equippedFeet) {
        inventory.selectedItemId = inventory.equippedFeet;
        renderInventory();
      }
    });
    closeItemInspectBtn == null ? void 0 : closeItemInspectBtn.addEventListener("click", closeItemInspect);
    itemInspectEl == null ? void 0 : itemInspectEl.addEventListener("click", (event) => {
      if (event.target === itemInspectEl) closeItemInspect();
    });
    accountButton == null ? void 0 : accountButton.addEventListener("click", () => {
      var _a, _b2, _c2;
      const account = (_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop);
      if (account == null ? void 0 : account.signedIn) (_b2 = coop == null ? void 0 : coop.signOut) == null ? void 0 : _b2.call(coop);
      else void ((_c2 = coop == null ? void 0 : coop.signIn) == null ? void 0 : _c2.call(coop));
    });
    continueGuestBtn == null ? void 0 : continueGuestBtn.addEventListener("click", () => {
      var _a;
      guestContinuationChosen = true;
      (_a = coop == null ? void 0 : coop.continueAsGuest) == null ? void 0 : _a.call(coop);
      finishStartup();
    });
    signInFromStartBtn == null ? void 0 : signInFromStartBtn.addEventListener("click", () => {
      var _a, _b2;
      const characterFound = Boolean((_a = coop == null ? void 0 : coop.knownCharacter) == null ? void 0 : _a.call(coop));
      accountSignInPending = true;
      showAccountChoice();
      accountChoiceDetail.textContent = characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…";
      void ((_b2 = coop == null ? void 0 : coop.signIn) == null ? void 0 : _b2.call(coop).then((result) => {
        if ((result == null ? void 0 : result.ok) !== false) {
          showConnecting();
          return;
        }
        accountSignInPending = false;
        showAccountChoice();
        accountChoiceDetail.textContent = characterFound ? "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN" : "REGISTRATION FAILED · TRY AGAIN OR USE GUEST LOGIN";
      }).catch(() => {
        accountSignInPending = false;
        showAccountChoice();
        accountChoiceDetail.textContent = "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN";
      }));
    });
    screenShakeToggle.addEventListener("click", () => {
      screenShakeEnabled = !screenShakeEnabled;
      if (!screenShakeEnabled) screenShake = 0;
      updateScreenShakeSetting();
    });
    attackRangeToggle.addEventListener("click", () => {
      attackRangeVisible = !attackRangeVisible;
      try {
        localStorage.setItem(ATTACK_RANGE_VISIBLE_KEY, String(attackRangeVisible));
      } catch {
      }
      updateAttackRangeSetting();
    });
    latencyToggle.addEventListener("click", () => {
      latencyVisible = !latencyVisible;
      try {
        localStorage.setItem(LATENCY_VISIBLE_KEY, String(latencyVisible));
      } catch {
      }
      updateLatencySetting();
    });
    (_b = hpText.closest(".card")) == null ? void 0 : _b.addEventListener("click", () => {
      var _a, _b2;
      const identity = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      if (identity) void openPlayerProfile(identity, ((_b2 = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _b2.call(coop)) || "PLAYER");
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
    musicVolumeInput == null ? void 0 : musicVolumeInput.addEventListener("input", () => {
      musicVolume = clamp(Number(musicVolumeInput.value) / 100, 0, 1);
      try {
        localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume));
      } catch {
      }
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
        autoAttackEnabled ? "#72ef58" : "#ff9b91"
      );
    });
    duelRequestBtn.addEventListener("click", () => {
      var _a;
      void ((_a = coop == null ? void 0 : coop.requestDuel) == null ? void 0 : _a.call(coop).then((result) => {
        if (!(result == null ? void 0 : result.ok)) showMessage((result == null ? void 0 : result.error) || "DUEL REQUEST FAILED", "#ff9b91");
      }));
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
      leaveDuelResult();
    });
    function closeDragonResult() {
      dragonResultEl.hidden = true;
      last = performance.now();
    }
    closeDragonResultBtn.addEventListener("click", closeDragonResult);
    closeUpdateNoticeBtn.addEventListener("click", closeUpdateNotice);
    playerHudProfileIcon.addEventListener("click", (event) => {
      var _a, _b2;
      event.stopPropagation();
      const identity = (_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop);
      if (identity) void openPlayerProfile(identity, ((_b2 = coop == null ? void 0 : coop.localDisplayName) == null ? void 0 : _b2.call(coop)) || "PLAYER");
    });
    playerProfileIcon.addEventListener("click", () => {
      var _a;
      if (openProfileIdentity === ((_a = coop == null ? void 0 : coop.localIdentity) == null ? void 0 : _a.call(coop))) openProfileIconPicker();
    });
    closeProfileIconPickerBtn.addEventListener("click", closeProfileIconPicker);
    profileIconPickerEl.addEventListener("click", (event) => {
      if (event.target === profileIconPickerEl) closeProfileIconPicker();
    });
    closeDuelReplayBtn.addEventListener("click", () => {
      const closeReplay = () => {
        duelReplayEl.hidden = true;
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
        saveNameButton: document.getElementById("saveNameBtn")
      },
      getCoop: () => coop,
      showMessage,
      onOpenReplay: openDuelReplay,
      onOpenPlayer: openPlayerProfile
    });
    chat.init();
    if (coop && typeof coop.setOnChange === "function") {
      coop.setOnChange(() => {
        var _a, _b2, _c2, _d, _e, _f, _g, _h;
        const identity = ((_a = coop.localIdentity) == null ? void 0 : _a.call(coop)) || "";
        const lifetime = (_c2 = (_b2 = coop.playerProfile) == null ? void 0 : _b2.call(coop, identity)) == null ? void 0 : _c2.lifetime;
        if (lifetime) {
          totalKills = identity === lifetimeKillsIdentity ? Math.max(totalKills, lifetime.enemyKills) : lifetime.enemyKills;
          lifetimeKillsIdentity = identity;
        }
        if (openProfileIdentity) {
          const profile = (_d = coop.playerProfile) == null ? void 0 : _d.call(coop, openProfileIdentity);
          if (profile) renderPlayerProfile(profile);
        }
        if (!leaderboardEl.hidden) renderLeaderboard();
        if (!devAuditEl.hidden) renderDevAudit();
        loadProgress();
        const nextSessionGeneration = ((_e = coop == null ? void 0 : coop.sessionGeneration) == null ? void 0 : _e.call(coop)) || 0;
        if (nextSessionGeneration !== observedCoopSessionGeneration) {
          observedCoopSessionGeneration = nextSessionGeneration;
          movementSyncActive = false;
          if (running) {
            (_f = coop.syncSpeed) == null ? void 0 : _f.call(coop, player.speed);
            (_g = coop.syncPosition) == null ? void 0 : _g.call(coop, player.x, player.y, player.facing, player.moving, true);
          }
        }
        syncDragonState();
        finishStartup();
        const account = (_h = coop == null ? void 0 : coop.accountState) == null ? void 0 : _h.call(coop);
        updateProtocolGate(account);
        if (account == null ? void 0 : account.returningFromSignIn) showSigningIn();
        else if ((account == null ? void 0 : account.signInRequired) && !hasStarted) showAccountChoice();
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
    window.setInterval(() => chat.refresh(), 1e3);
    window.setInterval(() => {
      var _a;
      if ((_a = coop == null ? void 0 : coop.accountState) == null ? void 0 : _a.call(coop).updating) enforceLatestVersion(GAME_VERSION);
    }, 5e3);
    bootUpgradeClose.addEventListener("click", () => {
      pausedForUpgrade = false;
      bootUpgradeEl.hidden = true;
      last = performance.now();
    });
    document.addEventListener("pointerdown", (event) => {
      var _a, _b2, _c2, _d, _e, _f, _g;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const toolbar = settingsBtn.closest(".settings-wrap");
      if (toolbar && !toolbar.contains(target)) {
        settingsPanel.hidden = true;
        inventoryPanel.hidden = true;
        settingsBtn.setAttribute("aria-expanded", "false");
        inventoryBtn.setAttribute("aria-expanded", "false");
      }
      if (!playerProfileEl.hidden && !((_a = playerProfileEl.querySelector(".modal")) == null ? void 0 : _a.contains(target))) closePlayerProfile();
      if (!leaderboardEl.hidden && !((_b2 = leaderboardEl.querySelector(".modal")) == null ? void 0 : _b2.contains(target))) closeLeaderboard();
      if (!devAuditEl.hidden && !((_c2 = devAuditEl.querySelector(".modal")) == null ? void 0 : _c2.contains(target))) closeDevAudit();
      if (!dragonResultEl.hidden && !((_d = dragonResultEl.querySelector(".modal")) == null ? void 0 : _d.contains(target))) closeDragonResult();
      if (!duelResultEl.hidden && !((_e = duelResultEl.querySelector(".modal")) == null ? void 0 : _e.contains(target))) leaveDuelResult();
      if (!bootUpgradeEl.hidden && !((_f = bootUpgradeEl.querySelector(".modal")) == null ? void 0 : _f.contains(target))) bootUpgradeClose.click();
      if (!profileIconPickerEl.hidden && !((_g = profileIconPickerEl.querySelector(".modal")) == null ? void 0 : _g.contains(target))) closeProfileIconPicker();
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
    document.getElementById("restartBtn").addEventListener("click", startGame);
    addEventListener("keydown", (e) => {
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
      touchMove.moved = false;
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
        if (d > 8) touchMove.moved = true;
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
    canvas.addEventListener("touchstart", beginTouch, { passive: false });
    canvas.addEventListener("touchmove", moveTouch, { passive: false });
    canvas.addEventListener("touchend", endTouch, { passive: false });
    canvas.addEventListener("touchcancel", endTouch, { passive: false });
    canvas.addEventListener("click", (event) => {
      if (event.pointerType === "touch") return;
      openPlayerAtScreenPoint(event.clientX, event.clientY);
    });
    const initialAccount = ((_c = coop == null ? void 0 : coop.accountState) == null ? void 0 : _c.call(coop)) || { signedIn: false, knownAccount: false, authInProgress: false, returningFromSignIn: false };
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
})();
