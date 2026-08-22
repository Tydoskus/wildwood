import { Range, schema, SenderError, table, t } from "spacetimedb/server";
import { Identity, ScheduleAt, Timestamp } from "spacetimedb";
import { damageAfterArmor } from "./combat";
import {
  RESEARCH_DEFINITIONS,
  isResearchId,
  researchDurationMs,
  researchPrerequisitesForNextRank,
  shouldBackfillLegacyRegeneration,
  type ResearchId,
} from "../../shared/research";
import { VIRTUAL_PLAYER_LIMIT, isVirtualPlayerTicket } from "../../shared/virtual-player-load-test";
import { legacyU32Power, playerPowerForStats } from "../../shared/player-power";
import {
  PLAYER_GENDER_UNSET,
  isSelectedPlayerGender,
} from "../../shared/player-gender";
import { duelAnnouncementText } from "../../shared/duel-announcement";
import { resolveEquipmentAppearance } from "../../shared/equipment-appearance";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  FOREST_ITEM_DROP_DENOMINATOR,
  FROST_ARMOR,
  FROST_BOW,
  inventoryJsonItemQuantity,
  itemDefinition,
  isUpgradeableItem,
  itemMaxHealthMultiplier,
  itemRegenerationMultiplier,
  itemFitsEquipmentSlot,
  itemUpgradeDurationMs,
  LEGENDARY_WHITE_GOLD_ARMOR,
  MAX_FOREST_ITEM_COUNT,
  MAX_ITEM_UPGRADE_LEVEL,
  normalizeItemUpgradeLevel,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_DROP_ITEM_IDS,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  weaponAttackInterval,
  weaponDamageMultiplier,
  WOODEN_ARMOR,
} from "../../shared/items";
import {
  PLAYER_MAP_FRAME_HZ,
  PLAYER_MOTION_FRAME_HZ,
  compactPlayerMapSamples,
  encodePlayerMotionFrame,
  type PlayerMotionSample,
} from "../../shared/player-motion-frame";
import {
  ATTACK_BALANCE_VERSION,
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  BOOTS_SPEED_BONUS,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MAP_DISPLAY_NAMES,
  MAP_IDS,
  MAX_ARMOR,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  NAME_ADJECTIVES,
  NAME_CREATURES,
  PLAYER_BASE_HP,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPAWN,
  PLAYER_SPEED,
  PROTOCOL_VERSION,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  SPACETIME_AUTH_CLIENT_ID,
  SPACETIME_AUTH_ISSUER,
  TUTORIAL_FOREST_MAP_ID,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/rules";

const WORLD = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
const PLAYER_ZONE_SIZE = 1_000;
const VALID_MAP_IDS = new Set<string>(MAP_IDS);
const LEGACY_FROSTWIND_EXPANSE_MAP_ID = "frostwind_expanse";
const BETA_TESTER_ACTIVITY_MICROS = 120n * 60n * 60n * 1_000_000n;

function canonicalMapId(mapId: string) {
  return mapId === LEGACY_FROSTWIND_EXPANSE_MAP_ID ? INTERMEDIATE_SNOWLANDS_MAP_ID : mapId;
}
const DEVELOPER_IDENTITY_HEX = "c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13";
const DEVELOPER_IDENTITY = new Identity(DEVELOPER_IDENTITY_HEX);
// Maincloud database owner. CLI maintenance calls run as this identity, while
// in-game developer actions run as DEVELOPER_IDENTITY above.
const DATABASE_OWNER_IDENTITY_HEX = "c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79";
const ACCOUNT_LINK_LIFETIME_MICROS = 600_000_000n;
const MAP_PORTALS = {
  [TUTORIAL_FOREST_MAP_ID]: [{ x: 190, y: 385, destination: BEGINNER_DESERT_MAP_ID }],
  [BEGINNER_DESERT_MAP_ID]: [
    { x: 360, y: 617, destination: TUTORIAL_FOREST_MAP_ID },
    { x: 580, y: 617, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
  ],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: [
    { x: 360, y: 617, destination: BEGINNER_DESERT_MAP_ID },
    { x: 580, y: 617, destination: ADVANCED_LAVA_WASTES_MAP_ID },
  ],
  [ADVANCED_LAVA_WASTES_MAP_ID]: [{ x: 360, y: 617, destination: INTERMEDIATE_SNOWLANDS_MAP_ID }],
} as const;
const MAP_ARRIVALS = {
  [TUTORIAL_FOREST_MAP_ID]: { x: 190, y: 540 },
  [BEGINNER_DESERT_MAP_ID]: { x: 360, y: 770 },
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: { x: 580, y: 770 },
  [ADVANCED_LAVA_WASTES_MAP_ID]: { x: 580, y: 770 },
} as const;
const MAP_PORTAL_USE_RANGE = 125;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 3_000_000n;
const CHAT_HISTORY_RETENTION_MICROS = 86_400_000_000n;
const CHAT_HISTORY_MAX_ROWS = 200;
const DUEL_REPLAY_RETENTION_MICROS = CHAT_HISTORY_RETENTION_MICROS;
const MAINTENANCE_INTERVAL_MICROS = 60_000_000n;
const LEADERBOARD_REFRESH_INTERVAL_MICROS = 900_000_000n;
const MOTION_FRAME_INTERVAL_MICROS = 1_000_000n / BigInt(PLAYER_MOTION_FRAME_HZ);
const MAP_FRAME_INTERVAL_MICROS = 1_000_000n / BigInt(PLAYER_MAP_FRAME_HZ);
const DIRECT_MOTION_PLAYER_LIMIT = 2;
const VIRTUAL_PLAYER_RUN_LIFETIME_MICROS = 3_600_000_000n;
const MODULE_MIGRATION_VERSION = 8;
const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_REFRESH_VERSION = 8;
const DUEL_REQUEST_COOLDOWN_MICROS = 120_000_000n;
const DISPLAY_NAME_COOLDOWN_MICROS = 2_592_000_000_000n;
// Beta support: let players correct names freely. Re-enable after account-link
// migration issues have settled without deleting any existing cooldown data.
const DISPLAY_NAME_COOLDOWN_ENABLED = false;
const DUEL_REQUEST_TIMEOUT_MICROS = 30_000_000n;
const DUEL_COUNTDOWN_MICROS = 3_000_000n;
const DUEL_DURATION_MICROS = 30_000_000n;
const DUEL_FINISH_HOLD_MICROS = 600_000n;
const DUEL_ARENA = {
  challenger: { x: 5880, y: 5940 },
  opponent: { x: 6120, y: 5940 },
};
const DRAGON_ID = 1;
const DRAGON_MAX_HP = 1_000_000;
const DRAGON_REWARD_DAMAGE = 650;
const DRAGON_RADIUS = 140;
const DRAGON_POSITION = { x: WORLD.width - 760, y: WORLD.height - 560 };
const DRAGON_HIT_RANGE_TOLERANCE = 60;
const DRAGON_RESPAWN_MICROS = 30_000_000n;
const SPIDER_ID = 1;
const SPIDER_MAX_HP = 150_000_000;
const SPIDER_RADIUS = 125;
const SPIDER_POSITION = { x: 4050, y: 4050 };
const SPIDER_HIT_RANGE_TOLERANCE = 60;
const SPIDER_RESPAWN_MICROS = 30_000_000n;
const FROSTCLAW_ID = 1;
const FROSTCLAW_MAX_HP = 750_000_000_000;
const FROSTCLAW_RADIUS = 150;
const FROSTCLAW_POSITION = { x: 4050, y: 4050 };
const FROSTCLAW_HIT_RANGE_TOLERANCE = 60;
const FROSTCLAW_RESPAWN_MICROS = 30_000_000n;
const UPGRADE_BENCH_POSITION = { x: 800, y: 710 };
const UPGRADE_BENCH_USE_RANGE = 150;
const BOSS_REGEN_DELAY_MICROS = 180_000_000n;
const BOSS_REGEN_FRACTION_PER_MAINTENANCE = .05;

// Cold public presence and presentation. Continuous coordinates live in the
// private motion table and aggregate events below.
const player = table(
  {
    public: true,
    indexes: [
      { accessor: "byMapZone", algorithm: "btree", columns: ["mapId", "isVisible", "zoneX", "zoneY"] as const },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
    facing: t.f64(),
    // Physical compatibility columns only. Current HP is local simulation
    // state; no reducer updates these values and clients ignore them.
    hp: t.f32(),
    maxHp: t.f32(),
    speed: t.f32(),
    moving: t.bool(),
    lastInputAt: t.timestamp(),
    lastInputSequence: t.u32().default(0),
    power: t.u32().default(95),
    protocolVersion: t.u32().default(0),
    feetItem: t.string().default(""),
    zoneX: t.i32().default(0),
    zoneY: t.i32().default(0),
    mapId: t.string().default(TUTORIAL_FOREST_MAP_ID),
    controllerTabId: t.string().default(""),
    headItem: t.string().default(BASIC_PAPER_HAT),
    chestItem: t.string().default(""),
    isVisible: t.bool().default(true),
    dx: t.f32().default(0),
    dy: t.f32().default(0),
    powerLevel: t.f64().default(95),
    // Cold presentation fields. Appended defaults keep existing rows
    // migration-safe without expanding the hot aggregate movement frames.
    rightHandItem: t.string().default(""),
    leftHandItem: t.string().default(""),
  },
);

// Physical compatibility table from the former per-player minimap lane. New
// clients use compact playerMapFrame events; lifecycle-only writes keep old
// stored rows coherent without paying hot subscription fanout.
const playerMapMarker = table(
  { public: true, indexes: [{ accessor: "byMap", algorithm: "btree", columns: ["mapId", "isVisible"] as const }] },
  {
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
    mapId: t.string(),
    isVisible: t.bool(),
    updatedAt: t.timestamp(),
  },
);

// Movement inputs live in a private table. Public subscribers receive compact
// aggregate frames instead of one full player-row update per input packet.
const playerMotion = table(
  { public: false },
  {
    networkId: t.u32().primaryKey().autoInc(),
    identity: t.identity().unique(),
    x: t.f64(),
    y: t.f64(),
    facing: t.f64(),
    moving: t.bool(),
    lastInputAt: t.timestamp().index("btree"),
    lastInputSequence: t.u32(),
    inputIntervalMicros: t.u64(),
    zoneX: t.i32(),
    zoneY: t.i32(),
    mapId: t.string(),
    dx: t.f32().default(0),
    dy: t.f32().default(0),
    isVisible: t.bool().default(true),
  },
);

// Small private control plane for realtime publishers. Maintaining one row per
// populated map avoids recounting every motion row at 10 Hz.
const playerMotionMapState = table(
  { public: false },
  {
    mapId: t.string().primaryKey(),
    playerCount: t.u32(),
    visibleCount: t.u32(),
  },
);

// Cold active-presence mapping. Network ids keep identity strings and profile
// presentation out of every hot movement frame.
const playerMotionIdentity = table(
  {
    public: true,
    indexes: [
      { accessor: "byMapZone", algorithm: "btree", columns: ["mapId", "isVisible", "zoneX", "zoneY"] as const },
    ],
  },
  {
    networkId: t.u32().primaryKey(),
    identity: t.identity().unique(),
    mapId: t.string(),
    isVisible: t.bool(),
    zoneX: t.i32(),
    zoneY: t.i32(),
    displayName: t.string(),
    profileIcon: t.u32(),
    playerSprite: t.u32(),
    skinTone: t.u32(),
    isGuest: t.bool(),
    gender: t.u8().default(PLAYER_GENDER_UNSET),
  },
);

// Insert-only event rows are never retained in client caches. One event carries
// every changed player in a zone for this server frame.
const playerMotionFrame = table(
  {
    public: true,
    event: true,
    indexes: [
      { accessor: "byMapZone", algorithm: "btree", columns: ["mapId", "zoneX", "zoneY"] as const },
    ],
  },
  {
    mapId: t.string(),
    zoneX: t.i32(),
    zoneY: t.i32(),
    emittedAt: t.timestamp(),
    playerCount: t.u32(),
    payload: t.byteArray(),
  },
);

// One 1 Hz compact map snapshot replaces N individually updated minimap rows.
const playerMapFrame = table(
  {
    public: true,
    event: true,
    indexes: [{ accessor: "byMap", algorithm: "btree", columns: ["mapId"] as const }],
  },
  {
    mapId: t.string(),
    emittedAt: t.timestamp(),
    playerCount: t.u32(),
    payload: t.byteArray(),
  },
);

// Exact accepted boss attacks fan out as cacheless, zone-filtered events.
// Clients build short throw/projectile visuals locally instead of syncing
// animation state or predicting attacks from nearby idle players.
const bossAttackFrame = table(
  {
    public: true,
    event: true,
    indexes: [
      { accessor: "byMapZone", algorithm: "btree", columns: ["mapId", "zoneX", "zoneY"] as const },
    ],
  },
  {
    mapId: t.string(),
    zoneX: t.i32(),
    zoneY: t.i32(),
    networkId: t.u32(),
    attackerX: t.f64(),
    attackerY: t.f64(),
    targetX: t.f64(),
    targetY: t.f64(),
    targetRadius: t.f32(),
    hits: t.u32(),
    emittedAt: t.timestamp(),
  },
);

const playerProfile = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    profileIcon: t.u32().default(0),
    playerSprite: t.u32().default(0),
    skinTone: t.u32().default(3),
    gender: t.u8().default(PLAYER_GENDER_UNSET),
  },
);

const playerProgress = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool(),
    introComplete: t.bool().default(false),
    inventoryJson: t.string().default("[]"),
    equippedFeet: t.string().default(""),
    desertUnlocked: t.bool().default(false),
    equippedHead: t.string().default(BASIC_PAPER_HAT),
    equippedChest: t.string().default(""),
    snowlandsUnlocked: t.bool().default(false),
    equippedRightHand: t.string().default(""),
    equippedLeftHand: t.string().default(""),
    lavaUnlocked: t.bool().default(false),
    bowCount: t.u32().default(0),
    woodenArmorCount: t.u32().default(0),
    // Cosmetic equipment is presentation-only. Appended defaults preserve
    // every existing save while empty slots fall back to stat equipment.
    cosmeticHead: t.string().default(""),
    cosmeticChest: t.string().default(""),
    cosmeticFeet: t.string().default(""),
    cosmeticRightHand: t.string().default(""),
    cosmeticLeftHand: t.string().default(""),
  },
);

// Reconnect coordinates are private. Keeping them outside public profile
// progress prevents offline or invisible players from leaking exact locations.
const playerLastLocation = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    mapId: t.string().default(TUTORIAL_FOREST_MAP_ID),
    x: t.f64().default(PLAYER_SPAWN.x),
    y: t.f64().default(PLAYER_SPAWN.y),
    facing: t.f64().default(0),
  },
);

// Research stays separate from stat-save rows. Timers and rank unlocks are
// always created and completed against the database clock.
const playerResearch = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    warcraft: t.u32().default(0),
    foraging: t.u32().default(0),
    // Migration-only storage shim. Maincloud cannot remove a populated column
    // without deleting player data. No game path reads this retired rank, and
    // world entry/one-time maintenance force every legacy value to zero.
    frontierMastery: t.u32().default(0),
    vitality: t.u32().default(0),
    precision: t.u32().default(0),
    criticalChance: t.u32().default(0),
    moveSpeed: t.u32().default(0),
    prosperity: t.u32().default(0),
    criticalDamage: t.u32().default(0),
    regeneration: t.u32().default(0),
  },
);

const activeResearch = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    researchId: t.string(),
    targetRank: t.u32(),
    startedAt: t.timestamp(),
    completesAt: t.timestamp(),
  },
);

// Completed levels are stored independently from the inventory payload so an
// upgrade cannot be overwritten by a delayed client save.
const playerItemUpgrade = table(
  {
    public: true,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    key: t.string().primaryKey(),
    identity: t.identity(),
    itemId: t.string(),
    level: t.u8(),
  },
);

// A paused job keeps its remaining duration while its item is back in the
// player's inventory. A running job owns the item until it completes.
const activeItemUpgrade = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    itemId: t.string(),
    currentLevel: t.u8(),
    targetLevel: t.u8(),
    startedAt: t.timestamp(),
    completesAt: t.timestamp(),
    paused: t.bool().default(false),
    remainingMicros: t.u64().default(0n),
  },
);

// Explicit loot events let the client reveal successful duplicate rolls as
// "Already owned" without manufacturing another copy of the item.
const playerItemDrop = table(
  {
    public: true,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    key: t.string().primaryKey(),
    identity: t.identity(),
    itemId: t.string(),
    alreadyOwned: t.bool(),
    sequence: t.u64(),
    droppedAt: t.timestamp(),
  },
);

// Compact public ranking snapshot. Clients load it only when rankings are
// needed, keeping it outside the hot gameplay subscription.
const leaderboardEntry = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    damage: t.f32(),
    maxHp: t.f32(),
    isGuest: t.bool(),
    power: t.u32().default(0),
    armor: t.f32().default(0),
    regen: t.f32().default(0),
    playedMicros: t.u64().default(0n),
    profileIcon: t.u32().default(0),
    powerLevel: t.f64().default(0),
    gender: t.u8().default(PLAYER_GENDER_UNSET),
    skinTone: t.u32().default(3),
    headItem: t.string().default(BASIC_PAPER_HAT),
    chestItem: t.string().default(""),
    feetItem: t.string().default(""),
    rightHandItem: t.string().default(STARTER_STONE),
    leftHandItem: t.string().default(""),
  },
);

// Public account kind stays separate from rankings so guest labels also work
// for players outside top 100. Legacy rows become known on next connection.
const playerAccountStatus = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    isGuest: t.bool(),
  },
);

// One tiny public presence aggregate keeps the HUD accurate without making
// every client subscribe to every active player row.
const worldStatus = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    onlinePlayers: t.u32(),
  },
);

const leaderboardRefreshState = table(
  { public: false },
  {
    id: t.u32().primaryKey(),
    refreshedAtMicros: t.u64(),
    version: t.u32().default(0),
  },
);

const moduleMigrationState = table(
  { public: false },
  {
    id: t.u32().primaryKey(),
    version: t.u32(),
  },
);

// Public profile metadata is queried one identity at a time by the client.
// Combat progress remains out of the global subscription and is also loaded
// only for the profile currently being viewed.
const playerLifetime = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    joinedAt: t.timestamp(),
    playedMicros: t.u64().default(0n),
    sessionStartedAt: t.timestamp(),
    enemyKills: t.u64().default(0n),
    deathCount: t.u64().default(0n),
  },
);

const playerNameCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    changedAt: t.timestamp(),
  },
);

const playerBalanceVersion = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    version: t.u32(),
  },
);

// Developers keep their presence choice across disconnects and devices. The
// active player row is deliberately ephemeral, so it cannot hold this setting.
const developerPresencePreference = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    visible: t.bool().default(false),
  },
);

// Private interest signal for visible players currently watched by an
// invisible developer. Public clients can read only their identity-scoped view.
const playerMovementDemand = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
  },
);

// Persistent sign-in history. Private storage prevents account activity from
// becoming public player data. The viewer index powers the developer-only view
// without scanning private rows.
const playerAccessAudit = table(
  {
    public: false,
    indexes: [{ accessor: "byViewer", algorithm: "btree", columns: ["viewer"] as const }],
  },
  {
    identity: t.identity().primaryKey(),
    viewer: t.identity(),
    displayName: t.string(),
    firstSeenAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    accountType: t.string(),
    lastProtocolVersion: t.u32(),
    label: t.string().default(""),
  },
);

// Presence belongs to a physical websocket, not an identity. Multiple tabs can
// share one identity; only the controller connection owns movement and duels.
const playerSession = table(
  {
    public: false,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    connectedAt: t.timestamp(),
    protocolVersion: t.u32().default(0),
    lastInputSequence: t.u32().default(0),
    enteredWorld: t.bool().default(false),
    tabId: t.string().default(""),
  },
);

const playerController = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    connectionId: t.connectionId(),
  },
);

// Developer load-test clients use real anonymous websocket connections and
// normal player reducers. This private tag makes every row they create
// disposable and keeps simulated progress out of permanent rankings.
const virtualPlayer = table(
  {
    public: false,
    indexes: [{ accessor: "byOwner", algorithm: "btree", columns: ["owner"] as const }],
  },
  {
    identity: t.identity().primaryKey(),
    owner: t.identity(),
    mapId: t.string(),
    spawnX: t.f64(),
    spawnY: t.f64(),
    createdAt: t.timestamp(),
  },
);

// O(1) authorization limit. Recounting every existing bot for every new bot
// makes a 3,000-client test perform roughly 4.5 million registration scans.
const virtualPlayerLoad = table(
  { public: false },
  {
    owner: t.identity().primaryKey(),
    activeCount: t.u32(),
  },
);

// Developer creates one private capability before a load test. Bots consume it
// from their own websocket, so authorization cannot race another connection's
// lifecycle row under heavy load.
const virtualPlayerRun = table(
  { public: false },
  {
    owner: t.identity().primaryKey(),
    ticket: t.string(),
    maxCount: t.u32(),
    expiresAtMicros: t.u64(),
  },
);

const chatCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    lastSentAt: t.timestamp(),
  },
);

const duelRequestCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    requestedAt: t.timestamp(),
  },
);

// A short-lived, private bridge from an anonymous SpacetimeDB identity to its
// first authenticated SpacetimeAuth identity. The random code never leaves the
// browser that began sign-in and is consumed once claimed.
const accountLink = table(
  { public: false },
  {
    code: t.string().primaryKey(),
    guest: t.identity(),
    createdAt: t.timestamp(),
  },
);

const chatMessage = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    senderName: t.string(),
    message: t.string(),
    sentAt: t.timestamp(),
    replayId: t.u64().default(0n),
    senderIsGuest: t.bool().default(false),
    powerLevel: t.f32().default(0),
    senderGender: t.u8().default(PLAYER_GENDER_UNSET),
  },
);

// Private beta feedback submitted through `/bug <description>`. Reports never
// enter public chat, but remain queryable by developers through Maincloud SQL.
const bugReport = table(
  {
    public: false,
    indexes: [{ accessor: "byReporter", algorithm: "btree", columns: ["reporter"] as const }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    reporter: t.identity(),
    reporterName: t.string(),
    message: t.string(),
    protocolVersion: t.u32(),
    reportedAt: t.timestamp(),
  },
);

const duel = table(
  {
    public: true,
    indexes: [
      { accessor: "byChallenger", algorithm: "btree", columns: ["challenger"] as const },
      { accessor: "byOpponent", algorithm: "btree", columns: ["opponent"] as const },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    challenger: t.identity(),
    opponent: t.identity(),
    status: t.string(),
    createdAt: t.timestamp(),
    startedAt: t.timestamp(),
    endsAtMicros: t.u64(),
    lastResolvedAt: t.timestamp(),
    challengerOriginX: t.f64(),
    challengerOriginY: t.f64(),
    opponentOriginX: t.f64(),
    opponentOriginY: t.f64(),
    challengerHp: t.f32(),
    challengerMaxHp: t.f32(),
    challengerDamage: t.f32(),
    challengerArmor: t.f32(),
    challengerAttackRate: t.f32(),
    opponentHp: t.f32(),
    opponentMaxHp: t.f32(),
    opponentDamage: t.f32(),
    opponentArmor: t.f32(),
    opponentAttackRate: t.f32(),
    startsAtMicros: t.u64().default(0n),
    challengerRegen: t.f32().default(0),
    challengerAttacks: t.u32().default(0),
    challengerDamageDealt: t.f32().default(0),
    challengerRegened: t.f32().default(0),
    challengerBlocked: t.f32().default(0),
    opponentRegen: t.f32().default(0),
    opponentAttacks: t.u32().default(0),
    opponentDamageDealt: t.f32().default(0),
    opponentRegened: t.f32().default(0),
    opponentBlocked: t.f32().default(0),
    challengerHeadItem: t.string().default(""),
    challengerChestItem: t.string().default(""),
    challengerFeetItem: t.string().default(""),
    challengerRightHandItem: t.string().default(""),
    challengerLeftHandItem: t.string().default(""),
    opponentHeadItem: t.string().default(""),
    opponentChestItem: t.string().default(""),
    opponentFeetItem: t.string().default(""),
    opponentRightHandItem: t.string().default(""),
    opponentLeftHandItem: t.string().default(""),
    challengerName: t.string().default(""),
    opponentName: t.string().default(""),
    challengerGender: t.u8().default(PLAYER_GENDER_UNSET),
    opponentGender: t.u8().default(PLAYER_GENDER_UNSET),
  },
);

const duelReplay = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    challengerName: t.string(),
    opponentName: t.string(),
    winnerName: t.string(),
    durationSeconds: t.f32(),
    challengerMaxHp: t.f32(),
    challengerDamage: t.f32(),
    challengerArmor: t.f32(),
    challengerAttackRate: t.f32(),
    challengerRegen: t.f32(),
    challengerFinalHp: t.f32(),
    challengerAttacks: t.u32(),
    challengerDamageDealt: t.f32(),
    challengerRegened: t.f32(),
    challengerBlocked: t.f32(),
    opponentMaxHp: t.f32(),
    opponentDamage: t.f32(),
    opponentArmor: t.f32(),
    opponentAttackRate: t.f32(),
    opponentRegen: t.f32(),
    opponentFinalHp: t.f32(),
    opponentAttacks: t.u32(),
    opponentDamageDealt: t.f32(),
    opponentRegened: t.f32(),
    opponentBlocked: t.f32(),
    createdAt: t.timestamp(),
    challengerIdentity: t.string().default(""),
    opponentIdentity: t.string().default(""),
    challengerHeadItem: t.string().default(""),
    challengerChestItem: t.string().default(""),
    challengerFeetItem: t.string().default(""),
    challengerRightHandItem: t.string().default(""),
    challengerLeftHandItem: t.string().default(""),
    opponentHeadItem: t.string().default(""),
    opponentChestItem: t.string().default(""),
    opponentFeetItem: t.string().default(""),
    opponentRightHandItem: t.string().default(""),
    opponentLeftHandItem: t.string().default(""),
    challengerGender: t.u8().default(PLAYER_GENDER_UNSET),
    opponentGender: t.u8().default(PLAYER_GENDER_UNSET),
  },
);

const dragonBoss = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    hp: t.f32(),
    maxHp: t.f32(),
    alive: t.bool(),
    respawnAtMicros: t.u64(),
    lastDamageAtMicros: t.u64().default(0n),
  },
);

const dragonContribution = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    displayName: t.string(),
    damage: t.f32(),
  },
);

const dragonAttackWindow = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    startedAtMicros: t.u64(),
    hits: t.u32(),
  },
);

const dragonResult = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    totalDamage: t.f32(),
    contributorsJson: t.string(),
    createdAt: t.timestamp(),
  },
);

const maintenanceSchedule = table(
  { scheduled: (): any => runMaintenance },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const motionFrameSchedule = table(
  { scheduled: (): any => publishMotionFrames },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    previousTickMicros: t.u64(),
  },
);

const mapFrameSchedule = table(
  { scheduled: (): any => publishMapFrames },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const researchCompletionSchedule = table(
  { scheduled: (): any => completeResearch },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    identity: t.identity(),
    researchId: t.string(),
    targetRank: t.u32(),
    completesAtMicros: t.u64().default(0n),
  },
);

const itemUpgradeCompletionSchedule = table(
  { scheduled: (): any => completeItemUpgrade },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    identity: t.identity(),
    itemId: t.string(),
    targetLevel: t.u8(),
    completesAtMicros: t.u64(),
  },
);

const duelResolutionSchedule = table(
  { scheduled: (): any => resolveScheduledDuel },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    duelId: t.u64(),
  },
);

const dragonRespawnSchedule = table(
  { scheduled: (): any => respawnDragon },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const spiderBoss = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    hp: t.f32(),
    maxHp: t.f32(),
    alive: t.bool(),
    respawnAtMicros: t.u64(),
    lastDamageAtMicros: t.u64().default(0n),
  },
);

const spiderContribution = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    displayName: t.string(),
    damage: t.f32(),
  },
);

const spiderAttackWindow = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    startedAtMicros: t.u64(),
    hits: t.u32(),
  },
);

const spiderResult = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    totalDamage: t.f32(),
    contributorsJson: t.string(),
    createdAt: t.timestamp(),
  },
);

const spiderRespawnSchedule = table(
  { scheduled: (): any => respawnSpider },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const frostclawBoss = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    hp: t.f32(),
    maxHp: t.f32(),
    alive: t.bool(),
    respawnAtMicros: t.u64(),
    lastDamageAtMicros: t.u64().default(0n),
  },
);

const frostclawContribution = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    displayName: t.string(),
    damage: t.f32(),
  },
);

const frostclawAttackWindow = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    startedAtMicros: t.u64(),
    hits: t.u32(),
  },
);

const frostclawResult = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    totalDamage: t.f32(),
    contributorsJson: t.string(),
    createdAt: t.timestamp(),
  },
);

const frostclawRespawnSchedule = table(
  { scheduled: (): any => respawnFrostclaw },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const spacetimedb = schema({
  player,
  playerMapMarker,
  playerMotion,
  playerMotionMapState,
  playerMotionIdentity,
  playerMotionFrame,
  playerMapFrame,
  bossAttackFrame,
  playerProfile,
  playerProgress,
  playerLastLocation,
  playerResearch,
  activeResearch,
  playerItemUpgrade,
  activeItemUpgrade,
  playerItemDrop,
  leaderboardEntry,
  playerAccountStatus,
  worldStatus,
  leaderboardRefreshState,
  moduleMigrationState,
  playerLifetime,
  playerNameCooldown,
  playerBalanceVersion,
  developerPresencePreference,
  playerMovementDemand,
  playerAccessAudit,
  playerSession,
  playerController,
  virtualPlayer,
  virtualPlayerLoad,
  virtualPlayerRun,
  chatCooldown,
  duelRequestCooldown,
  accountLink,
  chatMessage,
  bugReport,
  duel,
  duelReplay,
  dragonBoss,
  dragonContribution,
  dragonAttackWindow,
  dragonResult,
  maintenanceSchedule,
  motionFrameSchedule,
  mapFrameSchedule,
  researchCompletionSchedule,
  itemUpgradeCompletionSchedule,
  duelResolutionSchedule,
  dragonRespawnSchedule,
  spiderBoss,
  spiderContribution,
  spiderAttackWindow,
  spiderResult,
  spiderRespawnSchedule,
  frostclawBoss,
  frostclawContribution,
  frostclawAttackWindow,
  frostclawResult,
  frostclawRespawnSchedule,
});
export default spacetimedb;

export const devAccessAudit = spacetimedb.view(
  { name: "dev_access_audit", public: true },
  t.array(playerAccessAudit.rowType),
  (ctx) => {
    if (!isDeveloperIdentity(ctx.sender)) return [];
    return Array.from(ctx.db.playerAccessAudit.byViewer.filter(ctx.sender));
  },
);

// Reports are private at rest. This view is the developer-only live queue.
export const devBugReports = spacetimedb.view(
  { name: "dev_bug_reports", public: true },
  t.array(bugReport.rowType),
  (ctx) => {
    if (!isDeveloperIdentity(ctx.sender)) return [];
    return Array.from(ctx.db.bugReport.iter());
  },
);

export const localMovementDemand = spacetimedb.view(
  { name: "local_movement_demand", public: true },
  t.array(playerMovementDemand.rowType),
  (ctx) => {
    const row = ctx.db.playerMovementDemand.identity.find(ctx.sender);
    return row ? [row] : [];
  },
);

function generatedDisplayName(identity: { toHexString: () => string }) {
  let hash = 2166136261;
  for (const character of identity.toHexString()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const adjective = NAME_ADJECTIVES[(hash >>> 0) % NAME_ADJECTIVES.length];
  const creature = NAME_CREATURES[((hash >>> 8) >>> 0) % NAME_CREATURES.length];
  const number = String((hash >>> 16) % 1000).padStart(3, "0");
  return `${adjective} ${creature} ${number}`;
}

function isGeneratedDisplayName(displayName: string) {
  const [adjective, creature, suffix, ...extra] = displayName.split(" ");
  return extra.length === 0 &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_CREATURES.includes(creature) &&
    /^\d{3}$/.test(suffix ?? "");
}

function defaultPlayerProgress(identity: any) {
  return {
    identity,
    maxHp: PLAYER_BASE_HP,
    damage: 4,
    attackRate: DEFAULT_ATTACK_INTERVAL,
    projectileSpeed: PLAYER_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: 0,
    regen: 0,
    speed: PLAYER_SPEED,
    bootsCollected: false,
    inventoryJson: JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE]),
    equippedHead: BASIC_PAPER_HAT,
    equippedChest: "",
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    introComplete: false,
    desertUnlocked: false,
    snowlandsUnlocked: false,
    lavaUnlocked: false,
    bowCount: 0,
    woodenArmorCount: 0,
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
  };
}

function defaultPlayerResearch(identity: any) {
  return { identity, warcraft: 0, foraging: 0, frontierMastery: 0, vitality: 0, precision: 0, regeneration: 0, criticalChance: 0, criticalDamage: 0, moveSpeed: 0, prosperity: 0 };
}

function researchForPlayer(ctx: any, identity: any) {
  const existing = ctx.db.playerResearch.identity.find(identity);
  if (existing) {
    if (existing.frontierMastery === 0) return existing;
    const wiped = { ...existing, frontierMastery: 0 };
    ctx.db.playerResearch.identity.update(wiped);
    return wiped;
  }
  const next = defaultPlayerResearch(identity);
  ctx.db.playerResearch.insert(next);
  return next;
}

function runPendingModuleMigrations(ctx: any) {
  const state = ctx.db.moduleMigrationState.id.find(0);
  const currentVersion = state?.version ?? 0;
  if (currentVersion >= MODULE_MIGRATION_VERSION) return;
  if (currentVersion < 1) {
    for (const research of ctx.db.playerResearch.iter() as Iterable<any>) {
      if (research.frontierMastery !== 0) ctx.db.playerResearch.identity.update({ ...research, frontierMastery: 0 });
    }
  }
  if (currentVersion < 2) {
    for (const demand of [...ctx.db.playerMovementDemand.iter()] as any[]) {
      ctx.db.playerMovementDemand.identity.delete(demand.identity);
    }
  }
  if (currentVersion < 3) rebuildPlayerMotionMapState(ctx);
  if (currentVersion < 4) {
    for (const research of ctx.db.playerResearch.iter() as Iterable<any>) {
      if (shouldBackfillLegacyRegeneration(research)) {
        ctx.db.playerResearch.identity.update({
          ...research,
          regeneration: RESEARCH_DEFINITIONS.regeneration.ranksPerBand,
        });
      }
    }
  }
  if (currentVersion < 5) {
    for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
      const inventoryJson = JSON.stringify(inventoryForProgress(progress));
      const equippedRightHand = equippedRightHandForProgress(progress);
      const equippedLeftHand = equippedRightHand ? "" : equippedLeftHandForProgress(progress);
      if (progress.inventoryJson !== inventoryJson ||
        progress.equippedRightHand !== equippedRightHand ||
        progress.equippedLeftHand !== equippedLeftHand) {
        ctx.db.playerProgress.identity.update({
          ...progress,
          inventoryJson,
          equippedRightHand,
          equippedLeftHand,
        });
      }
    }
  }
  if (currentVersion < 6) {
    for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
      const restoredProgress = {
        ...progress,
        equippedRightHand: progress.equippedRightHand === STARTER_BOW ? STARTER_STONE : progress.equippedRightHand,
        equippedLeftHand: progress.equippedLeftHand === STARTER_BOW ? STARTER_STONE : progress.equippedLeftHand,
      };
      const inventoryJson = JSON.stringify(inventoryForProgress(restoredProgress));
      const normalizedProgress = { ...restoredProgress, inventoryJson };
      const equippedRightHand = equippedRightHandForProgress(normalizedProgress);
      const equippedLeftHand = equippedRightHand ? "" : equippedLeftHandForProgress(normalizedProgress);
      ctx.db.playerProgress.identity.update({
        ...progress,
        inventoryJson,
        equippedRightHand,
        equippedLeftHand,
      });
    }
  }
  if (currentVersion < 7) {
    for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
      const normalizedProgress = {
        ...progress,
        bowCount: forestItemCountForProgress(progress, STARTER_BOW, "bowCount"),
        woodenArmorCount: forestItemCountForProgress(progress, WOODEN_ARMOR, "woodenArmorCount"),
      };
      ctx.db.playerProgress.identity.update({
        ...normalizedProgress,
        inventoryJson: JSON.stringify(inventoryForProgress(normalizedProgress)),
      });
    }
  }
  if (currentVersion < 8) {
    for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
      const normalizedProgress = {
        ...progress,
        bowCount: Math.min(1, forestItemCountForProgress(progress, STARTER_BOW, "bowCount")),
        woodenArmorCount: Math.min(1, forestItemCountForProgress(progress, WOODEN_ARMOR, "woodenArmorCount")),
      };
      ctx.db.playerProgress.identity.update({
        ...normalizedProgress,
        inventoryJson: JSON.stringify([...new Set(inventoryForProgress(normalizedProgress))]),
      });
    }
  }
  const next = { id: 0, version: MODULE_MIGRATION_VERSION };
  if (state) ctx.db.moduleMigrationState.id.update(next);
  else ctx.db.moduleMigrationState.insert(next);
}

function assertResearchAvailable(research: Record<ResearchId, number>, researchId: ResearchId) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  if (research[researchId] >= definition.maxRank) throw new SenderError("Research already complete.");
  for (const [requiredId, requiredRank] of Object.entries(researchPrerequisitesForNextRank(researchId, research[researchId]))) {
    if (research[requiredId as ResearchId] < requiredRank!) throw new SenderError("Research prerequisites not met.");
  }
}

function activeResearchIsAvailable(research: Record<ResearchId, number>, active: any) {
  const researchId = String(active.researchId);
  if (!isResearchId(researchId)) return false;
  const definition = RESEARCH_DEFINITIONS[researchId];
  if (research[researchId] >= definition.maxRank) return false;
  if (active.targetRank !== research[researchId] + 1) return false;
  return Object.entries(researchPrerequisitesForNextRank(researchId, research[researchId]))
    .every(([requiredId, requiredRank]) => research[requiredId as ResearchId] >= Number(requiredRank));
}

function activeResearchCanComplete(research: Record<ResearchId, number>, active: any) {
  return activeResearchIsAvailable(research, active);
}

function removeResearchCompletionSchedules(ctx: any, identity: any) {
  const scheduledIds = [...ctx.db.researchCompletionSchedule.iter() as Iterable<any>]
    .filter((scheduled: any) => sameIdentity(scheduled.identity, identity))
    .map((scheduled: any) => scheduled.scheduledId);
  for (const scheduledId of scheduledIds) ctx.db.researchCompletionSchedule.scheduledId.delete(scheduledId);
}

function completeActiveResearch(ctx: any, active: any) {
  const research = researchForPlayer(ctx, active.identity);
  if (!activeResearchCanComplete(research, active)) {
    ctx.db.activeResearch.identity.delete(active.identity);
    removeResearchCompletionSchedules(ctx, active.identity);
    return false;
  }
  ctx.db.playerResearch.identity.update({ ...research, [active.researchId]: active.targetRank });
  ctx.db.activeResearch.identity.delete(active.identity);
  removeResearchCompletionSchedules(ctx, active.identity);
  return true;
}

function ensureResearchCompletionSchedule(ctx: any, active: any) {
  const completesAtMicros = active.completesAt.microsSinceUnixEpoch;
  for (const scheduled of ctx.db.researchCompletionSchedule.iter() as Iterable<any>) {
    if (!sameIdentity(scheduled.identity, active.identity)) continue;
    if (scheduled.researchId === active.researchId && scheduled.targetRank === active.targetRank && scheduled.completesAtMicros === completesAtMicros) return;
    ctx.db.researchCompletionSchedule.scheduledId.delete(scheduled.scheduledId);
  }
  ctx.db.researchCompletionSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(active.completesAt.microsSinceUnixEpoch),
    identity: active.identity,
    researchId: active.researchId,
    targetRank: active.targetRank,
    completesAtMicros,
  });
}

/**
 * Repairs missing schedules and rebases legacy timers only toward the current,
 * shorter curve. Maintenance calls this for offline players; registration is
 * merely a fast path, never the only recovery mechanism.
 */
function reconcileActiveResearch(ctx: any, active: any) {
  const research = researchForPlayer(ctx, active.identity);
  if (!activeResearchCanComplete(research, active)) {
    completeActiveResearch(ctx, active);
    return { active: null, completed: false };
  }
  const researchId = active.researchId as ResearchId;
  const expectedCompletesAtMicros = active.startedAt.microsSinceUnixEpoch +
    BigInt(researchDurationMs(researchId, active.targetRank - 1)) * 1_000n;
  const storedCompletesAtMicros = active.completesAt.microsSinceUnixEpoch;
  const completesAtMicros = storedCompletesAtMicros < expectedCompletesAtMicros
    ? storedCompletesAtMicros
    : expectedCompletesAtMicros;
  const nextActive = completesAtMicros === storedCompletesAtMicros
    ? active
    : { ...active, completesAt: new Timestamp(completesAtMicros) };

  if (ctx.timestamp.microsSinceUnixEpoch >= completesAtMicros) {
    return { active: null, completed: completeActiveResearch(ctx, nextActive) };
  }
  if (nextActive !== active) ctx.db.activeResearch.identity.update(nextActive);
  ensureResearchCompletionSchedule(ctx, nextActive);
  return { active: nextActive, completed: false };
}

function ensurePlayerLifetime(ctx: any) {
  const current = ctx.db.playerLifetime.identity.find(ctx.sender);
  if (current) return current;
  const next = {
    identity: ctx.sender,
    joinedAt: ctx.timestamp,
    playedMicros: 0n,
    sessionStartedAt: ctx.timestamp,
    enemyKills: 0n,
    deathCount: 0n,
  };
  ctx.db.playerLifetime.insert(next);
  return next;
}

function finishLifetimeSession(ctx: any, identity: any) {
  const lifetime = ctx.db.playerLifetime.identity.find(identity);
  if (!lifetime) return;
  const elapsed = ctx.timestamp.microsSinceUnixEpoch - lifetime.sessionStartedAt.microsSinceUnixEpoch;
  ctx.db.playerLifetime.identity.update({
    ...lifetime,
    playedMicros: lifetime.playedMicros + (elapsed > 0n ? elapsed : 0n),
    sessionStartedAt: ctx.timestamp,
  });
}

function earlierTimestamp(first: Timestamp, second: Timestamp) {
  return first.microsSinceUnixEpoch <= second.microsSinceUnixEpoch ? first : second;
}

function speedForBoots(bootsEquipped: boolean) {
  return PLAYER_SPEED + (bootsEquipped ? BOOTS_SPEED_BONUS : 0);
}

function markAttackBalanceCurrent(ctx: any) {
  const current = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
  const next = { identity: ctx.sender, version: ATTACK_BALANCE_VERSION };
  if (current) ctx.db.playerBalanceVersion.identity.update(next);
  else ctx.db.playerBalanceVersion.insert(next);
}

function migrateAttackBalance(ctx: any, progress: any) {
  const current = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
  if (current?.version === ATTACK_BALANCE_VERSION) return progress;
  const migrated = {
    ...progress,
    attackRate: Math.max(MIN_ATTACK_INTERVAL, Math.min(DEFAULT_ATTACK_INTERVAL, progress.attackRate * 2)),
  };
  ctx.db.playerProgress.identity.update(migrated);
  markAttackBalanceCurrent(ctx);
  return migrated;
}

function powerForProgress(progress: { maxHp: number; damage: number; attackRate: number; armor: number; regen: number }) {
  return playerPowerForStats(progress);
}

function powerFieldsForProgress(progress: { maxHp: number; damage: number; attackRate: number; armor: number; regen: number }) {
  const powerLevel = powerForProgress(progress);
  return { power: legacyU32Power(powerLevel), powerLevel };
}

function researchedDamage(ctx: any, identity: any, damage: number) {
  const rank = ctx.db.playerResearch.identity.find(identity)?.warcraft ?? 0;
  const progress = ctx.db.playerProgress.identity.find(identity);
  const weaponItem = progress ? equippedRightHandForProgress(progress) || equippedLeftHandForProgress(progress) : "";
  return damage * weaponDamageMultiplier(weaponItem, 1 + rank * .02, itemUpgradeLevelFor(ctx, identity, weaponItem));
}

function researchedArmor(ctx: any, identity: any, armor: number) {
  const rank = ctx.db.playerResearch.identity.find(identity)?.precision ?? 0;
  return armor * (1 + rank * .02);
}

function researchedRegen(ctx: any, identity: any, regen: number) {
  const rank = ctx.db.playerResearch.identity.find(identity)?.regeneration ?? 0;
  const progress = ctx.db.playerProgress.identity.find(identity);
  const chestItem = progress ? equippedChestForProgress(progress) : "";
  return regen * itemRegenerationMultiplier(chestItem, 1 + rank * .02, itemUpgradeLevelFor(ctx, identity, chestItem));
}

function duelDamage(ctx: any, identity: any, damage: number) {
  const research = ctx.db.playerResearch.identity.find(identity);
  const baseDamage = researchedDamage(ctx, identity, damage);
  const criticalChance = (research?.criticalChance ?? 0) * .01;
  const criticalMultiplier = 1.05 + (research?.criticalDamage ?? 0) * .05;
  // Duel simulation is deterministic. Fold random criticals into expected
  // damage so the server snapshot still honors both critical technologies.
  return baseDamage * (1 + criticalChance * (criticalMultiplier - 1));
}

function playerZone(x: number, y: number) {
  return {
    zoneX: Math.floor(x / PLAYER_ZONE_SIZE),
    zoneY: Math.floor(y / PLAYER_ZONE_SIZE),
  };
}

function publishBossAttack(
  ctx: any,
  activePlayer: any,
  attackerX: number,
  attackerY: number,
  target: { x: number; y: number },
  targetRadius: number,
  hits: number,
) {
  if (boundedMapPopulation(ctx, activePlayer.mapId) < 2) return;
  const motion = ctx.db.playerMotion.identity.find(ctx.sender);
  if (!motion?.isVisible) return;
  const zone = playerZone(attackerX, attackerY);
  ctx.db.bossAttackFrame.insert({
    mapId: activePlayer.mapId,
    ...zone,
    networkId: motion.networkId,
    attackerX,
    attackerY,
    targetX: target.x,
    targetY: target.y,
    targetRadius,
    hits,
    emittedAt: ctx.timestamp,
  });
}

function playerWithMotion(ctx: any, activePlayer: any) {
  if (!activePlayer) return activePlayer;
  const motion = ctx.db.playerMotion.identity.find(activePlayer.identity);
  if (!motion) return activePlayer;
  return {
    ...activePlayer,
    x: motion.x,
    y: motion.y,
    facing: motion.facing,
    moving: motion.moving,
    dx: motion.dx,
    dy: motion.dy,
    lastInputAt: motion.lastInputAt,
    lastInputSequence: motion.lastInputSequence,
    zoneX: motion.zoneX,
    zoneY: motion.zoneY,
    mapId: motion.mapId,
  };
}

function adjustPlayerMotionMapState(ctx: any, mapId: string, playerDelta: number, visibleDelta: number) {
  const current = ctx.db.playerMotionMapState.mapId.find(mapId);
  const playerCount = Math.max(0, (current?.playerCount ?? 0) + playerDelta);
  const visibleCount = Math.max(0, Math.min(playerCount, (current?.visibleCount ?? 0) + visibleDelta));
  if (playerCount === 0) {
    if (current) ctx.db.playerMotionMapState.mapId.delete(mapId);
    return;
  }
  const next = { mapId, playerCount, visibleCount };
  if (current) ctx.db.playerMotionMapState.mapId.update(next);
  else ctx.db.playerMotionMapState.insert(next);
}

function rebuildPlayerMotionMapState(ctx: any) {
  for (const state of [...ctx.db.playerMotionMapState.iter()] as any[]) {
    ctx.db.playerMotionMapState.mapId.delete(state.mapId);
  }
  const counts = new Map<string, { playerCount: number; visibleCount: number }>();
  for (const motion of [...ctx.db.playerMotion.iter()] as any[]) {
    const mapping = ctx.db.playerMotionIdentity.networkId.find(motion.networkId);
    const player = ctx.db.player.identity.find(motion.identity);
    const isVisible = mapping?.isVisible ?? player?.isVisible ?? motion.isVisible;
    if (motion.isVisible !== isVisible) {
      ctx.db.playerMotion.networkId.update({ ...motion, isVisible });
    }
    const current = counts.get(motion.mapId) ?? { playerCount: 0, visibleCount: 0 };
    current.playerCount += 1;
    if (isVisible) current.visibleCount += 1;
    counts.set(motion.mapId, current);
  }
  for (const [mapId, count] of counts) {
    ctx.db.playerMotionMapState.insert({ mapId, ...count });
  }
}

function syncPlayerMotion(ctx: any, activePlayer: any) {
  const current = ctx.db.playerMotion.identity.find(activePlayer.identity);
  const moving = Boolean(activePlayer.moving);
  const isVisible = activePlayer.isVisible !== false;
  const next = {
    networkId: current?.networkId ?? 0,
    identity: activePlayer.identity,
    x: activePlayer.x,
    y: activePlayer.y,
    facing: activePlayer.facing,
    moving,
    lastInputAt: activePlayer.lastInputAt,
    lastInputSequence: activePlayer.lastInputSequence,
    // Physical compatibility column. No current client or publisher reads it.
    inputIntervalMicros: 0n,
    zoneX: activePlayer.zoneX,
    zoneY: activePlayer.zoneY,
    mapId: activePlayer.mapId,
    dx: moving && Number.isFinite(activePlayer.dx) ? Math.max(-1, Math.min(1, activePlayer.dx)) : 0,
    dy: moving && Number.isFinite(activePlayer.dy) ? Math.max(-1, Math.min(1, activePlayer.dy)) : 0,
    isVisible,
  };
  const stored = current
    ? ctx.db.playerMotion.networkId.update(next)
    : ctx.db.playerMotion.insert(next);
  if (!current) {
    adjustPlayerMotionMapState(ctx, next.mapId, 1, isVisible ? 1 : 0);
  } else if (current.mapId !== next.mapId) {
    adjustPlayerMotionMapState(ctx, current.mapId, -1, current.isVisible ? -1 : 0);
    adjustPlayerMotionMapState(ctx, next.mapId, 1, isVisible ? 1 : 0);
  } else if (current.isVisible !== isVisible) {
    adjustPlayerMotionMapState(ctx, next.mapId, 0, isVisible ? 1 : -1);
  }
  return stored;
}

function syncPlayerMotionIdentity(ctx: any, activePlayer: any) {
  if (!activePlayer) return;
  const motion = ctx.db.playerMotion.identity.find(activePlayer.identity) ?? syncPlayerMotion(ctx, activePlayer);
  const profile = ctx.db.playerProfile.identity.find(activePlayer.identity);
  if (!profile) return;
  const current = ctx.db.playerMotionIdentity.identity.find(activePlayer.identity);
  const next = {
    networkId: motion.networkId,
    identity: activePlayer.identity,
    mapId: activePlayer.mapId,
    isVisible: activePlayer.isVisible,
    zoneX: activePlayer.zoneX,
    zoneY: activePlayer.zoneY,
    displayName: profile.displayName,
    profileIcon: profile.profileIcon,
    playerSprite: profile.playerSprite,
    skinTone: profile.skinTone,
    isGuest: ctx.db.playerAccountStatus.identity.find(activePlayer.identity)?.isGuest ?? false,
    gender: profile.gender,
  };
  if (!current) {
    ctx.db.playerMotionIdentity.insert(next);
    return;
  }
  if (current.networkId !== next.networkId) {
    ctx.db.playerMotionIdentity.networkId.delete(current.networkId);
    ctx.db.playerMotionIdentity.insert(next);
    return;
  }
  if (
    current.mapId !== next.mapId ||
    current.isVisible !== next.isVisible ||
    current.zoneX !== next.zoneX ||
    current.zoneY !== next.zoneY ||
    current.displayName !== next.displayName ||
    current.profileIcon !== next.profileIcon ||
    current.playerSprite !== next.playerSprite ||
    current.skinTone !== next.skinTone ||
    current.isGuest !== next.isGuest ||
    current.gender !== next.gender
  ) ctx.db.playerMotionIdentity.networkId.update(next);
}

function removePlayerRealtimeState(ctx: any, identity: any) {
  const motion = ctx.db.playerMotion.identity.find(identity);
  if (motion) {
    ctx.db.playerMotion.networkId.delete(motion.networkId);
    adjustPlayerMotionMapState(ctx, motion.mapId, -1, motion.isVisible ? -1 : 0);
  }
  const mapping = ctx.db.playerMotionIdentity.identity.find(identity);
  if (mapping) ctx.db.playerMotionIdentity.networkId.delete(mapping.networkId);
}

function sharedMapCounts(ctx: any) {
  const counts = new Map<string, number>();
  for (const state of ctx.db.playerMotionMapState.iter() as Iterable<any>) counts.set(state.mapId, state.playerCount);
  return counts;
}

function hasSharedMap(ctx: any) {
  for (const count of sharedMapCounts(ctx).values()) if (count > 1) return true;
  return false;
}

function hasMovingBatchedMap(ctx: any) {
  const counts = sharedMapCounts(ctx);
  for (const motion of ctx.db.playerMotion.iter() as Iterable<any>) {
    if (motion.moving && motion.isVisible && (counts.get(motion.mapId) ?? 0) > DIRECT_MOTION_PLAYER_LIMIT) return true;
  }
  return false;
}

function activeMotionSchedule(ctx: any) {
  for (const _schedule of ctx.db.motionFrameSchedule.iter()) return true;
  return false;
}

function boundedMapPopulation(ctx: any, mapId: string) {
  return ctx.db.playerMotionMapState.mapId.find(mapId)?.playerCount ?? 0;
}

function publishOrScheduleMotion(ctx: any, motion: any, isVisible: boolean) {
  if (!motion.moving || !isVisible || activeMotionSchedule(ctx)) return;
  const population = boundedMapPopulation(ctx, motion.mapId);
  if (population < 2) return;
  if (population <= DIRECT_MOTION_PLAYER_LIMIT) {
    const sample = motionSample(motion);
    ctx.db.playerMotionFrame.insert({
      mapId: motion.mapId,
      zoneX: motion.zoneX,
      zoneY: motion.zoneY,
      emittedAt: ctx.timestamp,
      playerCount: 1,
      payload: encodePlayerMotionFrame([sample]),
    });
    return;
  }
  // Current input must be eligible for the first scheduled frame.
  ctx.db.motionFrameSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_FRAME_INTERVAL_MICROS),
    previousTickMicros: ctx.timestamp.microsSinceUnixEpoch - 1n,
  });
}

function ensureMotionFrameSchedule(ctx: any) {
  for (const _schedule of ctx.db.motionFrameSchedule.iter()) return;
  // Hot sync calls hit this one-row lease first. Full player scans happen only
  // when restarting an idle scheduler, never once per input packet.
  if (!hasMovingBatchedMap(ctx)) return;
  ctx.db.motionFrameSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_FRAME_INTERVAL_MICROS),
    previousTickMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

function ensureMapFrameSchedule(ctx: any) {
  for (const _schedule of ctx.db.mapFrameSchedule.iter()) return;
  if (!hasSharedMap(ctx)) return;
  ctx.db.mapFrameSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MAP_FRAME_INTERVAL_MICROS),
  });
}

function ensureRealtimeFrameSchedules(ctx: any) {
  ensureMotionFrameSchedule(ctx);
  ensureMapFrameSchedule(ctx);
}

function motionSample(motion: any): PlayerMotionSample {
  return {
    networkId: motion.networkId,
    x: motion.x,
    y: motion.y,
    dx: motion.dx,
    dy: motion.dy,
    moving: motion.moving,
  };
}

function savedWorldLocation(ctx: any, identity: any, progress: any) {
  const saved = ctx.db.playerLastLocation.identity.find(identity);
  const requestedMap = VALID_MAP_IDS.has(saved?.mapId) ? saved.mapId : TUTORIAL_FOREST_MAP_ID;
  let mapId = requestedMap;
  if (mapId === ADVANCED_LAVA_WASTES_MAP_ID && !progress.lavaUnlocked) {
    mapId = progress.snowlandsUnlocked
      ? INTERMEDIATE_SNOWLANDS_MAP_ID
      : progress.desertUnlocked ? BEGINNER_DESERT_MAP_ID : TUTORIAL_FOREST_MAP_ID;
  }
  if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID && !progress.snowlandsUnlocked) {
    mapId = progress.desertUnlocked ? BEGINNER_DESERT_MAP_ID : TUTORIAL_FOREST_MAP_ID;
  }
  if (mapId === BEGINNER_DESERT_MAP_ID && !progress.desertUnlocked) mapId = TUTORIAL_FOREST_MAP_ID;
  const fallback = mapId === TUTORIAL_FOREST_MAP_ID ? PLAYER_SPAWN : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
  const x = Number.isFinite(saved?.x)
    ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, saved.x))
    : fallback.x;
  const y = Number.isFinite(saved?.y)
    ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, saved.y))
    : fallback.y;
  return { mapId, x, y, facing: Number.isFinite(saved?.facing) ? saved.facing : 0 };
}

function persistWorldLocation(ctx: any, activePlayer: any) {
  if (ctx.db.virtualPlayer.identity.find(activePlayer.identity)) return;
  const current = ctx.db.playerLastLocation.identity.find(activePlayer.identity);
  const next = {
    identity: activePlayer.identity,
    mapId: activePlayer.mapId,
    x: activePlayer.x,
    y: activePlayer.y,
    facing: activePlayer.facing,
  };
  if (
    !current ||
    current.mapId !== next.mapId ||
    current.x !== next.x ||
    current.y !== next.y ||
    current.facing !== next.facing
  ) {
    if (current) ctx.db.playerLastLocation.identity.update(next);
    else ctx.db.playerLastLocation.insert(next);
  }
}

function syncPlayerMapMarker(ctx: any, activePlayer: any, force = false) {
  if (!activePlayer) return;
  const current = ctx.db.playerMapMarker.identity.find(activePlayer.identity);
  const next = {
    identity: activePlayer.identity,
    x: activePlayer.x,
    y: activePlayer.y,
    mapId: activePlayer.mapId,
    isVisible: activePlayer.isVisible,
    updatedAt: ctx.timestamp,
  };
  if (!current) {
    ctx.db.playerMapMarker.insert(next);
    return;
  }
  // Physical compatibility row. New clients use player_map_frame; update this
  // row only at lifecycle boundaries so old stored data stays coherent.
  if (force || current.mapId !== next.mapId || current.isVisible !== next.isVisible) {
    ctx.db.playerMapMarker.identity.update(next);
  }
}

function syncSenderAccountStatus(ctx: any) {
  const current = ctx.db.playerAccountStatus.identity.find(ctx.sender);
  const next = { identity: ctx.sender, isGuest: !hasSpacetimeAuthAccount(ctx) };
  if (current) ctx.db.playerAccountStatus.identity.update(next);
  else ctx.db.playerAccountStatus.insert(next);
  syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
}

function refreshLeaderboard(ctx: any) {
  const candidates: any[] = [];
  for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
    if (ctx.db.virtualPlayer.identity.find(progress.identity)) continue;
    const profile = ctx.db.playerProfile.identity.find(progress.identity);
    if (!profile) continue;
    const current = ctx.db.leaderboardEntry.identity.find(progress.identity);
    const lifetime = ctx.db.playerLifetime.identity.find(progress.identity);
    const active = ctx.db.player.identity.find(progress.identity);
    const activeMicros = lifetime && active
      ? ctx.timestamp.microsSinceUnixEpoch - lifetime.sessionStartedAt.microsSinceUnixEpoch
      : 0n;
    const effectiveStats = {
      maxHp: maxHealthForProgress(ctx, progress.identity, progress),
      damage: researchedDamage(ctx, progress.identity, progress.damage),
      attackRate: attackIntervalForProgress(ctx, progress.identity, progress),
      armor: researchedArmor(ctx, progress.identity, progress.armor),
      regen: researchedRegen(ctx, progress.identity, progress.regen),
    };
    candidates.push({
      identity: progress.identity,
      identityKey: progress.identity.toHexString(),
      displayName: profile.displayName,
      power: powerForProgress(effectiveStats),
      profileIcon: profile.profileIcon,
      gender: profile.gender,
      ...leaderboardAppearanceForProgress(progress, profile),
      damage: effectiveStats.damage,
      maxHp: effectiveStats.maxHp,
      armor: effectiveStats.armor,
      regen: effectiveStats.regen,
      playedMicros: (lifetime?.playedMicros ?? 0n) + (activeMicros > 0n ? activeMicros : 0n),
      isGuest: ctx.db.playerAccountStatus.identity.find(progress.identity)?.isGuest ?? current?.isGuest ?? false,
    });
  }

  const byName = (a: any, b: any) => a.displayName.localeCompare(b.displayName);
  const selected = new Map<string, any>();
  for (const candidate of [...candidates].sort((a, b) => b.power - a.power || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.damage - a.damage || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.maxHp - a.maxHp || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.armor - a.armor || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.regen - a.regen || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => Number(b.playedMicros - a.playedMicros) || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }

  for (const current of [...ctx.db.leaderboardEntry.iter()] as any[]) {
    if (!selected.has(current.identity.toHexString())) ctx.db.leaderboardEntry.identity.delete(current.identity);
  }
  for (const candidate of selected.values()) {
    const next = {
      identity: candidate.identity,
      displayName: candidate.displayName,
      power: legacyU32Power(candidate.power),
      powerLevel: candidate.power,
      profileIcon: candidate.profileIcon,
      gender: candidate.gender,
      skinTone: candidate.skinTone,
      headItem: candidate.headItem,
      chestItem: candidate.chestItem,
      feetItem: candidate.feetItem,
      rightHandItem: candidate.rightHandItem,
      leftHandItem: candidate.leftHandItem,
      damage: candidate.damage,
      maxHp: candidate.maxHp,
      armor: candidate.armor,
      regen: candidate.regen,
      playedMicros: candidate.playedMicros,
      isGuest: candidate.isGuest,
    };
    const current = ctx.db.leaderboardEntry.identity.find(candidate.identity);
    if (!current) ctx.db.leaderboardEntry.insert(next);
    else if (
      current.displayName !== next.displayName ||
      current.power !== next.power ||
      current.powerLevel !== next.powerLevel ||
      current.profileIcon !== next.profileIcon ||
      current.gender !== next.gender ||
      current.skinTone !== next.skinTone ||
      current.headItem !== next.headItem ||
      current.chestItem !== next.chestItem ||
      current.feetItem !== next.feetItem ||
      current.rightHandItem !== next.rightHandItem ||
      current.leftHandItem !== next.leftHandItem ||
      current.damage !== next.damage ||
      current.maxHp !== next.maxHp ||
      current.armor !== next.armor ||
      current.regen !== next.regen ||
      current.playedMicros !== next.playedMicros ||
      current.isGuest !== next.isGuest
    ) ctx.db.leaderboardEntry.identity.update(next);
  }

  const refreshState = ctx.db.leaderboardRefreshState.id.find(1);
  const nextState = { id: 1, refreshedAtMicros: ctx.timestamp.microsSinceUnixEpoch, version: LEADERBOARD_REFRESH_VERSION };
  if (refreshState) ctx.db.leaderboardRefreshState.id.update(nextState);
  else ctx.db.leaderboardRefreshState.insert(nextState);
}

function refreshLeaderboardIfDue(ctx: any) {
  const state = ctx.db.leaderboardRefreshState.id.find(1);
  if (
    state?.version === LEADERBOARD_REFRESH_VERSION &&
    ctx.timestamp.microsSinceUnixEpoch - state.refreshedAtMicros < LEADERBOARD_REFRESH_INTERVAL_MICROS
  ) return;
  refreshLeaderboard(ctx);
}

function sameConnection(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function sessionForContext(ctx: any) {
  return ctx.connectionId ? ctx.db.playerSession.connectionId.find(ctx.connectionId) : null;
}

function requireSession(ctx: any) {
  const session = sessionForContext(ctx);
  if (!session || !sameIdentity(session.identity, ctx.sender)) {
    throw new SenderError("Wildwood updated. Refresh to continue.");
  }
  return session;
}

function isSupportedProtocol(protocolVersion: number) {
  return protocolVersion === PROTOCOL_VERSION;
}

function requireSupportedSessionProtocol(ctx: any) {
  const session = requireSession(ctx);
  if (!isSupportedProtocol(session.protocolVersion)) {
    throw new SenderError("Wildwood updated. Refresh to continue.");
  }
  return session;
}

function requireCurrentProtocol(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current) throw new SenderError("Enter Wildwood first.");
  return playerWithMotion(ctx, current);
}

function requireControllingPlayer(ctx: any) {
  const current = requireCurrentProtocol(ctx);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!ctx.connectionId || !controller || !sameConnection(controller.connectionId, ctx.connectionId)) {
    throw new SenderError("Wildwood is active in another tab.");
  }
  return current;
}

function hasSpacetimeAuthAccount(ctx: any) {
  const jwt = ctx.senderAuth?.jwt;
  return Boolean(
    jwt &&
    jwt.issuer === SPACETIME_AUTH_ISSUER &&
    Array.isArray(jwt.audience) &&
    jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID),
  );
}

function isDeveloperIdentity(identity: any) {
  return identity?.toHexString?.().replace(/^0x/i, "").toLowerCase() === DEVELOPER_IDENTITY_HEX;
}

function isDatabaseOwnerIdentity(identity: any) {
  return identity?.toHexString?.().replace(/^0x/i, "").toLowerCase() === DATABASE_OWNER_IDENTITY_HEX;
}

function isVirtualPlayer(ctx: any, identity: any) {
  return Boolean(ctx.db.virtualPlayer.identity.find(identity));
}

function requireDeveloperSession(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
    throw new SenderError("Developer access required.");
  }
}

function requireDeveloper(ctx: any) {
  requireControllingPlayer(ctx);
  if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
    throw new SenderError("Developer access required.");
  }
}

function touchPlayerAccessAudit(ctx: any, protocolVersion: number) {
  if (isVirtualPlayer(ctx, ctx.sender)) return;
  const profile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!profile) return;
  const current = ctx.db.playerAccessAudit.identity.find(ctx.sender);
  const next = {
    identity: ctx.sender,
    viewer: DEVELOPER_IDENTITY,
    displayName: profile.displayName,
    firstSeenAt: current?.firstSeenAt ?? ctx.timestamp,
    lastSeenAt: ctx.timestamp,
    accountType: hasSpacetimeAuthAccount(ctx) ? "account" : "guest",
    lastProtocolVersion: protocolVersion,
    label: current?.label ?? "",
  };
  if (current) ctx.db.playerAccessAudit.identity.update(next);
  else ctx.db.playerAccessAudit.insert(next);
}

function backfillKnownAccessAudit(ctx: any) {
  if (!isDeveloperIdentity(ctx.sender)) return;
  for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) {
    if (isVirtualPlayer(ctx, lifetime.identity)) continue;
    if (ctx.db.playerAccessAudit.identity.find(lifetime.identity)) continue;
    const profile = ctx.db.playerProfile.identity.find(lifetime.identity);
    if (!profile) continue;
    const status = ctx.db.playerAccountStatus.identity.find(lifetime.identity);
    const activePlayer = ctx.db.player.identity.find(lifetime.identity);
    ctx.db.playerAccessAudit.insert({
      identity: lifetime.identity,
      viewer: DEVELOPER_IDENTITY,
      displayName: profile.displayName,
      firstSeenAt: lifetime.joinedAt,
      lastSeenAt: lifetime.sessionStartedAt,
      accountType: status ? (status.isGuest ? "guest" : "account") : "unknown",
      lastProtocolVersion: activePlayer?.protocolVersion ?? 0,
      label: "",
    });
  }
}

function clearExpiredAccountLinks(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredCodes: string[] = [];
  for (const link of ctx.db.accountLink.iter() as Iterable<any>) {
    if (now - link.createdAt.microsSinceUnixEpoch >= ACCOUNT_LINK_LIFETIME_MICROS) {
      expiredCodes.push(link.code);
    }
  }
  for (const code of expiredCodes) ctx.db.accountLink.code.delete(code);
}

function hasFreshProgress(progress: any) {
  const defaultProgress = defaultPlayerProgress(progress.identity);
  return !progress.introComplete &&
    progress.maxHp === defaultProgress.maxHp &&
    progress.damage === defaultProgress.damage &&
    progress.attackRate === defaultProgress.attackRate &&
    progress.projectileSpeed === defaultProgress.projectileSpeed &&
    progress.projectileCount === defaultProgress.projectileCount &&
    progress.attackRange === defaultProgress.attackRange &&
    progress.armor === defaultProgress.armor &&
    progress.regen === defaultProgress.regen &&
    progress.speed === defaultProgress.speed &&
    progress.bootsCollected === defaultProgress.bootsCollected &&
    progress.inventoryJson === defaultProgress.inventoryJson &&
    progress.equippedHead === defaultProgress.equippedHead &&
    progress.equippedFeet === defaultProgress.equippedFeet &&
    progress.equippedChest === defaultProgress.equippedChest &&
    progress.equippedRightHand === defaultProgress.equippedRightHand &&
    progress.equippedLeftHand === defaultProgress.equippedLeftHand &&
    progress.cosmeticHead === defaultProgress.cosmeticHead &&
    progress.cosmeticChest === defaultProgress.cosmeticChest &&
    progress.cosmeticFeet === defaultProgress.cosmeticFeet &&
    progress.cosmeticRightHand === defaultProgress.cosmeticRightHand &&
    progress.cosmeticLeftHand === defaultProgress.cosmeticLeftHand &&
    progress.bowCount === defaultProgress.bowCount &&
    progress.woodenArmorCount === defaultProgress.woodenArmorCount &&
    progress.desertUnlocked === defaultProgress.desertUnlocked &&
    progress.snowlandsUnlocked === defaultProgress.snowlandsUnlocked &&
    progress.lavaUnlocked === defaultProgress.lavaUnlocked;
}

function resultIncludesContributor(latest: any, identity: any) {
  if (!latest) return false;
  try {
    const contributors = JSON.parse(latest.contributorsJson);
    const identityHex = identity.toHexString();
    return Array.isArray(contributors) && contributors.some((entry: any) => entry?.identity === identityHex);
  } catch {
    return false;
  }
}

function contributedToLatestDragon(ctx: any, identity: any) {
  return resultIncludesContributor(ctx.db.dragonResult.id.find(DRAGON_ID), identity);
}

function contributedToLatestFrostclaw(ctx: any, identity: any) {
  return resultIncludesContributor(ctx.db.frostclawResult.id.find(FROSTCLAW_ID), identity);
}

function forestItemCountForProgress(progress: any, itemId: string, field: "bowCount" | "woodenArmorCount") {
  const storedCount = Number.isInteger(progress?.[field]) ? progress[field] : 0;
  let legacyCount = 0;
  try {
    const savedItems = JSON.parse(progress.inventoryJson ?? "[]");
    if (Array.isArray(savedItems)) legacyCount = savedItems.filter((savedItem) => savedItem === itemId).length;
  } catch {}
  return Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT, Math.max(storedCount, legacyCount)));
}

function inventoryForProgress(progress: any) {
  let hasBetaTesterGoldenHelmet = isDeveloperIdentity(progress.identity);
  try {
    hasBetaTesterGoldenHelmet ||= JSON.parse(progress.inventoryJson ?? "[]").includes(SUPERIOR_GOLDEN_HELMET);
  } catch {}
  const developerItems = isDeveloperIdentity(progress.identity)
    ? DEVELOPER_ITEM_IDS
    : hasBetaTesterGoldenHelmet ? [SUPERIOR_GOLDEN_HELMET] : [];
  return [
    ...STARTER_ITEM_IDS,
    ...developerItems,
    ...(progress.bootsCollected ? [TRAILBLAZER_BOOTS] : []),
    ...Array(forestItemCountForProgress(progress, STARTER_BOW, "bowCount")).fill(STARTER_BOW),
    ...Array(forestItemCountForProgress(progress, WOODEN_ARMOR, "woodenArmorCount")).fill(WOODEN_ARMOR),
    ...SNOW_BOSS_DROP_ITEM_IDS.flatMap((itemId) =>
      Array(inventoryJsonItemQuantity(progress.inventoryJson, itemId)).fill(itemId)),
  ];
}

function inventoryWithBetaHelmet(progress: any, grant: boolean) {
  const inventory = inventoryForProgress(progress);
  if (grant && !inventory.includes(SUPERIOR_GOLDEN_HELMET)) inventory.push(SUPERIOR_GOLDEN_HELMET);
  return inventory;
}

function itemUpgradeKey(identity: any, itemId: string) {
  return `${identity.toHexString()}:${itemId}`;
}

function itemUpgradeLevelFor(ctx: any, identity: any, itemId: unknown) {
  const canonical = canonicalItemId(itemId);
  if (!canonical) return 0;
  return normalizeItemUpgradeLevel(ctx.db.playerItemUpgrade.key.find(itemUpgradeKey(identity, canonical))?.level ?? 0);
}

function progressHasItem(progress: any, itemId: string) {
  return inventoryForProgress(progress).includes(itemId);
}

function playerOwnsItem(ctx: any, identity: any, itemId: string) {
  const progress = ctx.db.playerProgress.identity.find(identity);
  if (progressHasItem(progress ?? defaultPlayerProgress(identity), itemId)) return true;
  return ctx.db.activeItemUpgrade.identity.find(identity)?.itemId === itemId;
}

function clearItemFromProgressSlots(progress: any, itemId: string) {
  const next = { ...progress };
  for (const field of [
    "equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand",
    "cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand",
  ] as const) {
    if (next[field] === itemId) next[field] = "";
  }
  return next;
}

function removeItemFromProgress(progress: any, itemId: string) {
  let next = clearItemFromProgressSlots(progress, itemId);
  if (itemId === STARTER_BOW) next = { ...next, bowCount: 0 };
  if (itemId === WOODEN_ARMOR) next = { ...next, woodenArmorCount: 0 };
  next.inventoryJson = JSON.stringify(inventoryForProgress(next).filter((savedItemId) => savedItemId !== itemId));
  return next;
}

function restoreItemToProgress(progress: any, itemId: string) {
  let next = { ...progress };
  if (itemId === STARTER_BOW) next.bowCount = 1;
  else if (itemId === WOODEN_ARMOR) next.woodenArmorCount = 1;
  else {
    const inventory = inventoryForProgress(next);
    if (!inventory.includes(itemId)) inventory.push(itemId);
    next.inventoryJson = JSON.stringify(inventory);
  }
  next.inventoryJson = JSON.stringify([...new Set(inventoryForProgress(next))]);
  return next;
}

function writeProgressAndPresentation(ctx: any, progress: any) {
  const current = ctx.db.playerProgress.identity.find(progress.identity);
  if (current) ctx.db.playerProgress.identity.update(progress);
  else ctx.db.playerProgress.insert(progress);
  const active = ctx.db.player.identity.find(progress.identity);
  if (active) {
    ctx.db.player.identity.update({
      ...active,
      ...powerFieldsForProgress(progress),
      speed: progress.speed,
      ...equipmentPresentationForProgress(progress),
    });
  }
  refreshLeaderboard(ctx);
}

function publishItemDrop(ctx: any, identity: any, itemId: string, alreadyOwned: boolean) {
  const key = itemUpgradeKey(identity, itemId);
  const current = ctx.db.playerItemDrop.key.find(key);
  const next = {
    key,
    identity,
    itemId,
    alreadyOwned,
    sequence: (current?.sequence ?? 0n) + 1n,
    droppedAt: ctx.timestamp,
  };
  if (current) ctx.db.playerItemDrop.key.update(next);
  else ctx.db.playerItemDrop.insert(next);
}

function hasRecentPlayerActivity(ctx: any, identity: any) {
  if (isDeveloperIdentity(identity)) return true;
  const lifetime = ctx.db.playerLifetime.identity.find(identity);
  if (!lifetime) return true;
  return ctx.timestamp.microsSinceUnixEpoch - lifetime.sessionStartedAt.microsSinceUnixEpoch <= BETA_TESTER_ACTIVITY_MICROS;
}

function equippedHeadForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  if (progress.equippedHead === "") return "";
  return inventory.includes(progress.equippedHead) ? progress.equippedHead : BASIC_PAPER_HAT;
}

function equippedChestForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  return inventory.includes(progress.equippedChest) ? progress.equippedChest : "";
}

function equippedFeetForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  return inventory.includes(progress.equippedFeet) ? progress.equippedFeet : "";
}

function savedInventoryHasHandItem(progress: any) {
  try {
    const itemIds = JSON.parse(progress.inventoryJson ?? "[]");
    return Array.isArray(itemIds) && itemIds.some((itemId) => itemDefinition(itemId)?.slot === "HAND");
  } catch {
    return false;
  }
}

function canonicalSavedHand(progress: any, field: "equippedRightHand" | "equippedLeftHand") {
  const itemId = canonicalItemId(progress[field]);
  return itemId && itemFitsEquipmentSlot(itemId, field === "equippedRightHand" ? "RIGHT_HAND" : "LEFT_HAND")
    ? itemId
    : "";
}

function equippedRightHandForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  const saved = canonicalSavedHand(progress, "equippedRightHand");
  if (saved && inventory.includes(saved)) return saved;
  return savedInventoryHasHandItem(progress) ? "" : STARTER_STONE;
}

function equippedLeftHandForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  const saved = canonicalSavedHand(progress, "equippedLeftHand");
  return saved && inventory.includes(saved) ? saved : "";
}

function cosmeticEquipmentForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  const remainingCounts = new Map<string, number>();
  for (const itemId of inventory) remainingCounts.set(itemId, (remainingCounts.get(itemId) ?? 0) + 1);
  const equippedRightHand = equippedRightHandForProgress(progress);
  for (const itemId of [
    equippedHeadForProgress(progress),
    equippedChestForProgress(progress),
    equippedFeetForProgress(progress),
    equippedRightHand,
    equippedRightHand ? "" : equippedLeftHandForProgress(progress),
  ]) {
    if (itemId) remainingCounts.set(itemId, Math.max(0, (remainingCounts.get(itemId) ?? 0) - 1));
  }
  const itemFor = (field: "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand", slot: "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND") => {
    const itemId = canonicalItemId(progress[field]);
    if (!itemId || !itemFitsEquipmentSlot(itemId, slot) || (remainingCounts.get(itemId) ?? 0) <= 0) return "";
    remainingCounts.set(itemId, (remainingCounts.get(itemId) ?? 0) - 1);
    return itemId;
  };
  const cosmeticRightHand = itemFor("cosmeticRightHand", "RIGHT_HAND");
  return {
    cosmeticHead: itemFor("cosmeticHead", "HEAD"),
    cosmeticChest: itemFor("cosmeticChest", "CHEST"),
    cosmeticFeet: itemFor("cosmeticFeet", "FEET"),
    cosmeticRightHand,
    cosmeticLeftHand: cosmeticRightHand ? "" : itemFor("cosmeticLeftHand", "LEFT_HAND"),
  };
}

function equipmentPresentationForProgress(progress: any) {
  const rightHandItem = equippedRightHandForProgress(progress);
  const cosmetics = cosmeticEquipmentForProgress(progress);
  return resolveEquipmentAppearance({
    equippedFeet: equippedFeetForProgress(progress),
    equippedHead: equippedHeadForProgress(progress),
    equippedChest: equippedChestForProgress(progress),
    equippedRightHand: rightHandItem,
    equippedLeftHand: rightHandItem ? "" : equippedLeftHandForProgress(progress),
    ...cosmetics,
  });
}

function leaderboardAppearanceForProgress(progress: any, profile: any) {
  return {
    skinTone: profile?.skinTone ?? 3,
    ...equipmentPresentationForProgress(progress),
  };
}

function attackIntervalForProgress(ctx: any, identity: any, progress: any) {
  const weaponItem = equippedRightHandForProgress(progress) || equippedLeftHandForProgress(progress);
  return weaponAttackInterval(weaponItem, progress.attackRate, 1, itemUpgradeLevelFor(ctx, identity, weaponItem));
}

function maxHealthForProgress(ctx: any, identity: any, progress: any) {
  const chestItem = equippedChestForProgress(progress);
  return progress.maxHp * itemMaxHealthMultiplier(chestItem, 1, itemUpgradeLevelFor(ctx, identity, chestItem));
}

function removeItemUpgradeCompletionSchedules(ctx: any, identity: any) {
  const scheduledIds = [...ctx.db.itemUpgradeCompletionSchedule.iter() as Iterable<any>]
    .filter((scheduled: any) => sameIdentity(scheduled.identity, identity))
    .map((scheduled: any) => scheduled.scheduledId);
  for (const scheduledId of scheduledIds) ctx.db.itemUpgradeCompletionSchedule.scheduledId.delete(scheduledId);
}

function removePlayerItemUpgradeData(ctx: any, identity: any, removeDrops = false) {
  if (ctx.db.activeItemUpgrade.identity.find(identity)) ctx.db.activeItemUpgrade.identity.delete(identity);
  removeItemUpgradeCompletionSchedules(ctx, identity);
  for (const upgrade of [...ctx.db.playerItemUpgrade.byIdentity.filter(identity) as Iterable<any>]) {
    ctx.db.playerItemUpgrade.key.delete(upgrade.key);
  }
  if (removeDrops) {
    for (const drop of [...ctx.db.playerItemDrop.byIdentity.filter(identity) as Iterable<any>]) {
      ctx.db.playerItemDrop.key.delete(drop.key);
    }
  }
}

function ensureItemUpgradeCompletionSchedule(ctx: any, active: any) {
  removeItemUpgradeCompletionSchedules(ctx, active.identity);
  if (active.paused) return;
  const completesAtMicros = active.completesAt.microsSinceUnixEpoch;
  ctx.db.itemUpgradeCompletionSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(completesAtMicros),
    identity: active.identity,
    itemId: active.itemId,
    targetLevel: active.targetLevel,
    completesAtMicros,
  });
}

function completeActiveItemUpgrade(ctx: any, active: any) {
  const currentLevel = itemUpgradeLevelFor(ctx, active.identity, active.itemId);
  const progress = ctx.db.playerProgress.identity.find(active.identity) ?? defaultPlayerProgress(active.identity);
  if (currentLevel === active.currentLevel && active.targetLevel === currentLevel + 1 && active.targetLevel <= MAX_ITEM_UPGRADE_LEVEL) {
    const key = itemUpgradeKey(active.identity, active.itemId);
    const current = ctx.db.playerItemUpgrade.key.find(key);
    const completed = { key, identity: active.identity, itemId: active.itemId, level: active.targetLevel };
    if (current) ctx.db.playerItemUpgrade.key.update(completed);
    else ctx.db.playerItemUpgrade.insert(completed);
  }
  writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
  ctx.db.activeItemUpgrade.identity.delete(active.identity);
  removeItemUpgradeCompletionSchedules(ctx, active.identity);
}

function reconcileActiveItemUpgrade(ctx: any, active: any) {
  if (!isUpgradeableItem(active.itemId) || active.currentLevel !== itemUpgradeLevelFor(ctx, active.identity, active.itemId) || active.targetLevel !== active.currentLevel + 1) {
    const progress = ctx.db.playerProgress.identity.find(active.identity) ?? defaultPlayerProgress(active.identity);
    writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
    ctx.db.activeItemUpgrade.identity.delete(active.identity);
    removeItemUpgradeCompletionSchedules(ctx, active.identity);
    return;
  }
  if (active.paused) {
    removeItemUpgradeCompletionSchedules(ctx, active.identity);
    return;
  }
  if (ctx.timestamp.microsSinceUnixEpoch >= active.completesAt.microsSinceUnixEpoch) {
    completeActiveItemUpgrade(ctx, active);
    return;
  }
  ensureItemUpgradeCompletionSchedule(ctx, active);
}

function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function countOnlinePlayers(ctx: any) {
  let count = 0;
  for (const current of ctx.db.player.iter() as Iterable<any>) {
    if (current.isVisible) count += 1;
  }
  return count;
}

function ensureWorldStatus(ctx: any) {
  const current = ctx.db.worldStatus.id.find(0);
  if (current) return current;
  return ctx.db.worldStatus.insert({ id: 0, onlinePlayers: countOnlinePlayers(ctx) });
}

function adjustOnlinePlayers(ctx: any, change: number) {
  const current = ensureWorldStatus(ctx);
  const onlinePlayers = Math.max(0, current.onlinePlayers + change);
  if (onlinePlayers !== current.onlinePlayers) ctx.db.worldStatus.id.update({ ...current, onlinePlayers });
}

function reconcileOnlinePlayers(ctx: any) {
  const current = ensureWorldStatus(ctx);
  const onlinePlayers = countOnlinePlayers(ctx);
  if (onlinePlayers !== current.onlinePlayers) ctx.db.worldStatus.id.update({ ...current, onlinePlayers });
}

function activeDuelFor(ctx: any, identity: any) {
  const isActive = (current: any) =>
    current.status === "requested" ||
    current.status === "countdown" ||
    current.status === "active" ||
    current.status === "finishing";
  for (const current of ctx.db.duel.byChallenger.filter(identity) as Iterable<any>) {
    if (isActive(current)) return current;
  }
  return null;
}

function removeIdentityPresence(ctx: any, identity: any) {
  const currentDuel = activeDuelFor(ctx, identity);
  let disconnectedDuelOrigin: { x: number; y: number } | null = null;
  if (currentDuel) {
    if (currentDuel.status === "finishing") {
      finishDuel(ctx, currentDuel);
    } else {
      disconnectedDuelOrigin = {
        x: currentDuel.challengerOriginX,
        y: currentDuel.challengerOriginY,
      };
      ctx.db.duel.id.delete(currentDuel.id);
    }
  }
  const activePlayer = playerWithMotion(ctx, ctx.db.player.identity.find(identity));
  if (activePlayer) {
    // Duel actors live outside world bounds. A disconnect must save their
    // pre-duel origin, not clamp arena coordinates into a map corner.
    persistWorldLocation(ctx, disconnectedDuelOrigin
      ? { ...activePlayer, ...disconnectedDuelOrigin }
      : activePlayer);
    ctx.db.player.identity.delete(identity);
    if (ctx.db.playerMapMarker.identity.find(identity)) ctx.db.playerMapMarker.identity.delete(identity);
    if (ctx.db.playerMovementDemand.identity.find(identity)) ctx.db.playerMovementDemand.identity.delete(identity);
    if (activePlayer.isVisible) adjustOnlinePlayers(ctx, -1);
  }
  removePlayerRealtimeState(ctx, identity);
}

function adjustVirtualPlayerCount(ctx: any, owner: any, change: number) {
  const current = ctx.db.virtualPlayerLoad.owner.find(owner);
  const activeCount = Math.max(0, (current?.activeCount ?? 0) + change);
  if (activeCount === 0) {
    if (current) ctx.db.virtualPlayerLoad.owner.delete(owner);
    return;
  }
  const next = { owner, activeCount };
  if (current) ctx.db.virtualPlayerLoad.owner.update(next);
  else ctx.db.virtualPlayerLoad.insert(next);
}

function virtualPlayerCountForOwner(ctx: any, owner: any) {
  const current = ctx.db.virtualPlayerLoad.owner.find(owner);
  if (current) return current.activeCount;

  // One indexed recount repairs deployments created before the counter table.
  // Every later authorization is a primary-key lookup plus one increment.
  let activeCount = 0;
  for (const _registration of ctx.db.virtualPlayer.byOwner.filter(owner) as Iterable<any>) activeCount += 1;
  if (activeCount > 0) ctx.db.virtualPlayerLoad.insert({ owner, activeCount });
  return activeCount;
}

/** Erases every durable and realtime row owned by one simulated client. */
function removeVirtualPlayerData(ctx: any, identity: any, adjustPresence = true, adjustOwnerCount = true) {
  const registration = ctx.db.virtualPlayer.identity.find(identity);
  if (!registration) return false;

  const activePlayer = ctx.db.player.identity.find(identity);
  if (activePlayer) ctx.db.player.identity.delete(identity);
  removePlayerRealtimeState(ctx, identity);
  if (ctx.db.playerMapMarker.identity.find(identity)) ctx.db.playerMapMarker.identity.delete(identity);
  if (ctx.db.playerMovementDemand.identity.find(identity)) ctx.db.playerMovementDemand.identity.delete(identity);
  if (ctx.db.playerProfile.identity.find(identity)) ctx.db.playerProfile.identity.delete(identity);
  if (ctx.db.playerProgress.identity.find(identity)) ctx.db.playerProgress.identity.delete(identity);
  if (ctx.db.playerLastLocation.identity.find(identity)) ctx.db.playerLastLocation.identity.delete(identity);
  if (ctx.db.playerResearch.identity.find(identity)) ctx.db.playerResearch.identity.delete(identity);
  if (ctx.db.activeResearch.identity.find(identity)) ctx.db.activeResearch.identity.delete(identity);
  removeResearchCompletionSchedules(ctx, identity);
  removePlayerItemUpgradeData(ctx, identity, true);
  if (ctx.db.playerAccountStatus.identity.find(identity)) ctx.db.playerAccountStatus.identity.delete(identity);
  if (ctx.db.playerLifetime.identity.find(identity)) ctx.db.playerLifetime.identity.delete(identity);
  if (ctx.db.playerNameCooldown.identity.find(identity)) ctx.db.playerNameCooldown.identity.delete(identity);
  if (ctx.db.playerBalanceVersion.identity.find(identity)) ctx.db.playerBalanceVersion.identity.delete(identity);
  if (ctx.db.playerAccessAudit.identity.find(identity)) ctx.db.playerAccessAudit.identity.delete(identity);
  if (ctx.db.chatCooldown.identity.find(identity)) ctx.db.chatCooldown.identity.delete(identity);
  if (ctx.db.duelRequestCooldown.identity.find(identity)) ctx.db.duelRequestCooldown.identity.delete(identity);
  if (ctx.db.dragonContribution.identity.find(identity)) ctx.db.dragonContribution.identity.delete(identity);
  if (ctx.db.dragonAttackWindow.identity.find(identity)) ctx.db.dragonAttackWindow.identity.delete(identity);
  if (ctx.db.spiderContribution.identity.find(identity)) ctx.db.spiderContribution.identity.delete(identity);
  if (ctx.db.spiderAttackWindow.identity.find(identity)) ctx.db.spiderAttackWindow.identity.delete(identity);
  if (ctx.db.frostclawContribution.identity.find(identity)) ctx.db.frostclawContribution.identity.delete(identity);
  if (ctx.db.frostclawAttackWindow.identity.find(identity)) ctx.db.frostclawAttackWindow.identity.delete(identity);
  if (ctx.db.leaderboardEntry.identity.find(identity)) ctx.db.leaderboardEntry.identity.delete(identity);

  for (const session of [...ctx.db.playerSession.byIdentity.filter(identity) as Iterable<any>]) {
    ctx.db.playerSession.connectionId.delete(session.connectionId);
  }
  if (ctx.db.playerController.identity.find(identity)) ctx.db.playerController.identity.delete(identity);

  const linkCodes: string[] = [];
  for (const link of ctx.db.accountLink.iter() as Iterable<any>) {
    if (sameIdentity(link.guest, identity)) linkCodes.push(link.code);
  }
  for (const code of linkCodes) ctx.db.accountLink.code.delete(code);

  const reportIds: bigint[] = [];
  for (const report of ctx.db.bugReport.byReporter.filter(identity) as Iterable<any>) reportIds.push(report.id);
  for (const id of reportIds) ctx.db.bugReport.id.delete(id);

  ctx.db.virtualPlayer.identity.delete(identity);
  if (adjustOwnerCount) adjustVirtualPlayerCount(ctx, registration.owner, -1);
  if (adjustPresence && activePlayer?.isVisible) adjustOnlinePlayers(ctx, -1);
  return Boolean(activePlayer?.isVisible);
}

function clearVirtualPlayersForOwner(ctx: any, owner: any) {
  if (ctx.db.virtualPlayerRun.owner.find(owner)) ctx.db.virtualPlayerRun.owner.delete(owner);
  const identities = [...ctx.db.virtualPlayer.byOwner.filter(owner) as Iterable<any>]
    .map((registration: any) => registration.identity);
  if (!identities.length) {
    if (ctx.db.virtualPlayerLoad.owner.find(owner)) ctx.db.virtualPlayerLoad.owner.delete(owner);
    return false;
  }
  for (const identity of identities) removeVirtualPlayerData(ctx, identity, false, false);
  if (ctx.db.virtualPlayerLoad.owner.find(owner)) ctx.db.virtualPlayerLoad.owner.delete(owner);
  reconcileOnlinePlayers(ctx);
  refreshLeaderboard(ctx);
  return true;
}

function clearExpiredVirtualPlayerRuns(ctx: any) {
  for (const run of [...ctx.db.virtualPlayerRun.iter()] as Iterable<any>) {
    const ownerActive = Boolean(
      ctx.db.player.identity.find(run.owner) &&
      ctx.db.playerController.identity.find(run.owner)
    );
    if (!ownerActive || ctx.timestamp.microsSinceUnixEpoch >= run.expiresAtMicros) {
      ctx.db.virtualPlayerRun.owner.delete(run.owner);
    }
  }
}

function clearOrphanVirtualPlayers(ctx: any) {
  const orphaned: any[] = [];
  for (const registration of ctx.db.virtualPlayer.iter() as Iterable<any>) {
    const ownerActive = Boolean(
      ctx.db.player.identity.find(registration.owner) &&
      ctx.db.playerController.identity.find(registration.owner)
    );
    let hasSession = false;
    for (const _session of ctx.db.playerSession.byIdentity.filter(registration.identity) as Iterable<any>) {
      hasSession = true;
      break;
    }
    if (!ownerActive || !hasSession) orphaned.push(registration.identity);
  }
  if (!orphaned.length) return;
  for (const identity of orphaned) removeVirtualPlayerData(ctx, identity, false);
  reconcileOnlinePlayers(ctx);
}

function clearOrphanPresence(ctx: any) {
  const sessionsByIdentity = new Map<string, any[]>();
  for (const session of ctx.db.playerSession.iter() as Iterable<any>) {
    const key = session.identity.toHexString();
    const sessions = sessionsByIdentity.get(key) ?? [];
    sessions.push(session);
    sessionsByIdentity.set(key, sessions);
  }

  const invalidControllers: any[] = [];
  for (const controller of ctx.db.playerController.iter() as Iterable<any>) {
    const session = ctx.db.playerSession.connectionId.find(controller.connectionId);
    if (!session || !sameIdentity(session.identity, controller.identity)) invalidControllers.push(controller.identity);
  }
  for (const identity of invalidControllers) ctx.db.playerController.identity.delete(identity);

  for (const sessions of sessionsByIdentity.values()) {
    const identity = sessions[0].identity;
    if (!ctx.db.playerController.identity.find(identity)) {
      const enteredSession = sessions.find((session: any) => session.enteredWorld);
      if (enteredSession) ctx.db.playerController.insert({ identity, connectionId: enteredSession.connectionId });
    }
  }

  const orphanIdentities: any[] = [];
  for (const activePlayer of ctx.db.player.iter() as Iterable<any>) {
    if (!ctx.db.playerController.identity.find(activePlayer.identity)) orphanIdentities.push(activePlayer.identity);
  }
  for (const identity of orphanIdentities) {
    finishLifetimeSession(ctx, identity);
    removeIdentityPresence(ctx, identity);
  }
}

function clearOrphanRealtimeState(ctx: any) {
  const orphanIdentities: any[] = [];
  for (const motion of ctx.db.playerMotion.iter() as Iterable<any>) {
    if (!ctx.db.player.identity.find(motion.identity)) orphanIdentities.push(motion.identity);
  }
  for (const identity of orphanIdentities) removePlayerRealtimeState(ctx, identity);

  const orphanNetworkIds: number[] = [];
  for (const mapping of ctx.db.playerMotionIdentity.iter() as Iterable<any>) {
    if (!ctx.db.playerMotion.identity.find(mapping.identity)) orphanNetworkIds.push(mapping.networkId);
  }
  for (const networkId of orphanNetworkIds) ctx.db.playerMotionIdentity.networkId.delete(networkId);
}

function clearExpiredDuelRequests(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredIds: bigint[] = [];
  for (const current of ctx.db.duel.iter() as Iterable<any>) {
    if (
      current.status === "requested" &&
      now - current.createdAt.microsSinceUnixEpoch >= DUEL_REQUEST_TIMEOUT_MICROS
    ) {
      expiredIds.push(current.id);
    }
  }
  for (const id of expiredIds) ctx.db.duel.id.delete(id);
}

function ensureMaintenanceSchedule(ctx: any) {
  for (const _task of ctx.db.maintenanceSchedule.iter()) return;
  ctx.db.maintenanceSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(MAINTENANCE_INTERVAL_MICROS),
  });
}

function ensureDragonBoss(ctx: any) {
  const existing = ctx.db.dragonBoss.id.find(DRAGON_ID);
  if (existing) return existing;
  return ctx.db.dragonBoss.insert({
    id: DRAGON_ID,
    encounter: 1n,
    hp: DRAGON_MAX_HP,
    maxHp: DRAGON_MAX_HP,
    alive: true,
    respawnAtMicros: 0n,
    lastDamageAtMicros: 0n,
  });
}

function ensureSpiderBoss(ctx: any) {
  const existing = ctx.db.spiderBoss.id.find(SPIDER_ID);
  if (existing) return existing;
  return ctx.db.spiderBoss.insert({
    id: SPIDER_ID,
    encounter: 1n,
    hp: SPIDER_MAX_HP,
    maxHp: SPIDER_MAX_HP,
    alive: true,
    respawnAtMicros: 0n,
    lastDamageAtMicros: 0n,
  });
}

function ensureFrostclawBoss(ctx: any) {
  const existing = ctx.db.frostclawBoss.id.find(FROSTCLAW_ID);
  if (existing) return existing;
  return ctx.db.frostclawBoss.insert({
    id: FROSTCLAW_ID,
    encounter: 1n,
    hp: FROSTCLAW_MAX_HP,
    maxHp: FROSTCLAW_MAX_HP,
    alive: true,
    respawnAtMicros: 0n,
    lastDamageAtMicros: 0n,
  });
}

function regenerateIdleBosses(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const regenerate = (current: any, update: (next: any) => void) => {
    if (!current.alive || current.hp <= 0 || current.hp >= current.maxHp) return;
    if (current.lastDamageAtMicros === 0n) {
      update({ ...current, lastDamageAtMicros: now });
      return;
    }
    if (now - current.lastDamageAtMicros < BOSS_REGEN_DELAY_MICROS) return;
    update({
      ...current,
      hp: Math.min(current.maxHp, current.hp + current.maxHp * BOSS_REGEN_FRACTION_PER_MAINTENANCE),
    });
  };
  regenerate(ensureDragonBoss(ctx), (next) => ctx.db.dragonBoss.id.update(next));
  regenerate(ensureSpiderBoss(ctx), (next) => ctx.db.spiderBoss.id.update(next));
  regenerate(ensureFrostclawBoss(ctx), (next) => ctx.db.frostclawBoss.id.update(next));
}

function clearSpiderCombatRows(ctx: any) {
  const contributionIdentities = [...ctx.db.spiderContribution.iter()].map((row: any) => row.identity);
  const attackIdentities = [...ctx.db.spiderAttackWindow.iter()].map((row: any) => row.identity);
  for (const identity of contributionIdentities) ctx.db.spiderContribution.identity.delete(identity);
  for (const identity of attackIdentities) ctx.db.spiderAttackWindow.identity.delete(identity);
}

function rewardSpiderContributor(ctx: any, identity: any) {
  const current = ctx.db.playerProgress.identity.find(identity);
  if (!current) return;
  const next = {
    ...current,
    damage: current.damage + SPIDER_REWARD_DAMAGE,
    maxHp: current.maxHp + SPIDER_REWARD_HEALTH,
    snowlandsUnlocked: true,
  };
  ctx.db.playerProgress.identity.update(next);
  const active = ctx.db.player.identity.find(identity);
  if (active) {
    ctx.db.player.identity.update({
      ...active,
      ...powerFieldsForProgress(next),
    });
  }
}

function finishSpiderEncounter(ctx: any, spider: any) {
  const contributions = [...ctx.db.spiderContribution.iter()]
    .filter((row: any) => row.encounter === spider.encounter && row.damage > 0)
    .sort((a: any, b: any) => b.damage - a.damage);
  const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
  const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
    identity: row.identity.toHexString(),
    name: row.displayName,
    gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
    damage: row.damage,
    percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
  })));

  const result = {
    id: SPIDER_ID,
    encounter: spider.encounter,
    totalDamage,
    contributorsJson,
    createdAt: ctx.timestamp,
  };
  if (ctx.db.spiderResult.id.find(SPIDER_ID)) ctx.db.spiderResult.id.update(result);
  else ctx.db.spiderResult.insert(result);

  for (const row of contributions) rewardSpiderContributor(ctx, row.identity);

  const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + SPIDER_RESPAWN_MICROS;
  ctx.db.spiderBoss.id.update({ ...spider, hp: 0, alive: false, respawnAtMicros });
  ctx.db.spiderRespawnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(respawnAtMicros),
    encounter: spider.encounter,
  });
}

function clearFrostclawCombatRows(ctx: any) {
  const contributionIdentities = [...ctx.db.frostclawContribution.iter()].map((row: any) => row.identity);
  const attackIdentities = [...ctx.db.frostclawAttackWindow.iter()].map((row: any) => row.identity);
  for (const identity of contributionIdentities) ctx.db.frostclawContribution.identity.delete(identity);
  for (const identity of attackIdentities) ctx.db.frostclawAttackWindow.identity.delete(identity);
}

function rewardFrostclawContributor(ctx: any, identity: any) {
  const current = ctx.db.playerProgress.identity.find(identity);
  if (!current) return;
  // Each boss item owns an independent roll, even when the player already has
  // that item. Successful duplicates become an explicit "Already owned" event.
  const frostBowDropped = ctx.random.integerInRange(1, SNOW_BOSS_ITEM_DROP_DENOMINATOR) === 1;
  const frostArmorDropped = ctx.random.integerInRange(1, SNOW_BOSS_ARMOR_DROP_DENOMINATOR) === 1;
  let next = {
    ...current,
    damage: current.damage + FROSTCLAW_REWARD_DAMAGE,
    maxHp: current.maxHp + FROSTCLAW_REWARD_HEALTH,
    armor: current.armor + FROSTCLAW_REWARD_ARMOR,
    lavaUnlocked: true,
  };
  if (frostBowDropped) {
    const alreadyOwned = playerOwnsItem(ctx, identity, FROST_BOW);
    publishItemDrop(ctx, identity, FROST_BOW, alreadyOwned);
    if (!alreadyOwned) next = restoreItemToProgress(next, FROST_BOW);
  }
  if (frostArmorDropped) {
    const alreadyOwned = playerOwnsItem(ctx, identity, FROST_ARMOR);
    publishItemDrop(ctx, identity, FROST_ARMOR, alreadyOwned);
    if (!alreadyOwned) next = restoreItemToProgress(next, FROST_ARMOR);
  }
  next.inventoryJson = JSON.stringify([...new Set(inventoryForProgress(next))]);
  ctx.db.playerProgress.identity.update(next);
  const active = ctx.db.player.identity.find(identity);
  if (active) {
    ctx.db.player.identity.update({
      ...active,
      ...powerFieldsForProgress(next),
    });
  }
}

function finishFrostclawEncounter(ctx: any, frostclaw: any) {
  const contributions = [...ctx.db.frostclawContribution.iter()]
    .filter((row: any) => row.encounter === frostclaw.encounter && row.damage > 0)
    .sort((a: any, b: any) => b.damage - a.damage);
  const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
  const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
    identity: row.identity.toHexString(),
    name: row.displayName,
    gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
    damage: row.damage,
    percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
  })));

  const result = {
    id: FROSTCLAW_ID,
    encounter: frostclaw.encounter,
    totalDamage,
    contributorsJson,
    createdAt: ctx.timestamp,
  };
  if (ctx.db.frostclawResult.id.find(FROSTCLAW_ID)) ctx.db.frostclawResult.id.update(result);
  else ctx.db.frostclawResult.insert(result);

  for (const row of contributions) rewardFrostclawContributor(ctx, row.identity);

  const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + FROSTCLAW_RESPAWN_MICROS;
  ctx.db.frostclawBoss.id.update({ ...frostclaw, hp: 0, alive: false, respawnAtMicros });
  ctx.db.frostclawRespawnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(respawnAtMicros),
    encounter: frostclaw.encounter,
  });
}

function clearDragonCombatRows(ctx: any) {
  const contributionIdentities = [...ctx.db.dragonContribution.iter()].map((row: any) => row.identity);
  const attackIdentities = [...ctx.db.dragonAttackWindow.iter()].map((row: any) => row.identity);
  for (const identity of contributionIdentities) ctx.db.dragonContribution.identity.delete(identity);
  for (const identity of attackIdentities) ctx.db.dragonAttackWindow.identity.delete(identity);
}

function rewardDragonContributor(ctx: any, identity: any) {
  const current = ctx.db.playerProgress.identity.find(identity);
  if (!current) return;
  const next = { ...current, damage: current.damage + DRAGON_REWARD_DAMAGE, desertUnlocked: true };
  ctx.db.playerProgress.identity.update(next);
  const active = ctx.db.player.identity.find(identity);
  if (active) {
    ctx.db.player.identity.update({
      ...active,
      ...powerFieldsForProgress(next),
    });
  }
}

function finishDragonEncounter(ctx: any, dragon: any) {
  const contributions = [...ctx.db.dragonContribution.iter()]
    .filter((row: any) => row.encounter === dragon.encounter && row.damage > 0)
    .sort((a: any, b: any) => b.damage - a.damage);
  const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
  const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
    identity: row.identity.toHexString(),
    name: row.displayName,
    gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
    damage: row.damage,
    percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
  })));

  const result = {
    id: DRAGON_ID,
    encounter: dragon.encounter,
    totalDamage,
    contributorsJson,
    createdAt: ctx.timestamp,
  };
  if (ctx.db.dragonResult.id.find(DRAGON_ID)) ctx.db.dragonResult.id.update(result);
  else ctx.db.dragonResult.insert(result);

  for (const row of contributions) rewardDragonContributor(ctx, row.identity);

  const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + DRAGON_RESPAWN_MICROS;
  ctx.db.dragonBoss.id.update({
    ...dragon,
    hp: 0,
    alive: false,
    respawnAtMicros,
  });
  ctx.db.dragonRespawnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(respawnAtMicros),
    encounter: dragon.encounter,
  });
}

function trimChatHistory(ctx: any) {
  const messages = [...ctx.db.chatMessage.iter()] as Array<{ id: bigint }>;
  if (messages.length <= CHAT_HISTORY_MAX_ROWS) return;
  messages.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const message of messages.slice(0, messages.length - CHAT_HISTORY_MAX_ROWS)) {
    ctx.db.chatMessage.id.delete(message.id);
  }
}

function insertChatMessage(ctx: any, sender: any, senderName: string, message: string, replayId = 0n) {
  const progress = ctx.db.playerProgress.identity.find(sender);
  const profile = ctx.db.playerProfile.identity.find(sender);
  ctx.db.chatMessage.insert({
    id: 0n,
    sender,
    senderName,
    senderIsGuest: ctx.db.playerAccountStatus.identity.find(sender)?.isGuest ?? false,
    message,
    replayId,
    sentAt: ctx.timestamp,
    powerLevel: progress ? powerForProgress(progress) : 0,
    senderGender: profile?.gender ?? PLAYER_GENDER_UNSET,
  });
  trimChatHistory(ctx);
}

function returnDuelPlayer(ctx: any, identity: any, x: number, y: number) {
  const current = playerWithMotion(ctx, ctx.db.player.identity.find(identity));
  if (!current) return;
  const next = {
    ...current,
    x,
    y,
    ...playerZone(x, y),
    moving: false,
    lastInputAt: ctx.timestamp,
  };
  ctx.db.player.identity.update(next);
  syncPlayerMotion(ctx, next);
  syncPlayerMotionIdentity(ctx, next);
  syncPlayerMapMarker(ctx, next, true);
  ensureRealtimeFrameSchedules(ctx);
}

function finishDuel(ctx: any, current: any) {
  returnDuelPlayer(
    ctx,
    current.challenger,
    current.challengerOriginX,
    current.challengerOriginY,
  );
  const challengerName = current.challengerName || ctx.db.playerProfile.identity.find(current.challenger)?.displayName || "PLAYER";
  const opponentName = current.opponentName || ctx.db.playerProfile.identity.find(current.opponent)?.displayName || "PLAYER";
  const challengerWon = current.challengerHp > current.opponentHp;
  const opponentWon = current.opponentHp > current.challengerHp;
  const winnerName = challengerWon ? challengerName : opponentWon ? opponentName : "DRAW";
  const durationSeconds = Math.max(0, Number(current.lastResolvedAt.microsSinceUnixEpoch - current.startsAtMicros) / 1_000_000);

  ctx.db.duelReplay.insert({
    id: current.id,
    challengerIdentity: current.challenger.toHexString(),
    opponentIdentity: current.opponent.toHexString(),
    challengerName,
    opponentName,
    winnerName,
    durationSeconds,
    challengerMaxHp: current.challengerMaxHp,
    challengerDamage: current.challengerDamage,
    challengerArmor: current.challengerArmor,
    challengerAttackRate: current.challengerAttackRate,
    challengerRegen: current.challengerRegen,
    challengerFinalHp: current.challengerHp,
    challengerAttacks: current.challengerAttacks,
    challengerDamageDealt: current.challengerDamageDealt,
    challengerRegened: current.challengerRegened,
    challengerBlocked: current.challengerBlocked,
    opponentMaxHp: current.opponentMaxHp,
    opponentDamage: current.opponentDamage,
    opponentArmor: current.opponentArmor,
    opponentAttackRate: current.opponentAttackRate,
    opponentRegen: current.opponentRegen,
    opponentFinalHp: current.opponentHp,
    opponentAttacks: current.opponentAttacks,
    opponentDamageDealt: current.opponentDamageDealt,
    opponentRegened: current.opponentRegened,
    opponentBlocked: current.opponentBlocked,
    createdAt: ctx.timestamp,
    challengerHeadItem: current.challengerHeadItem,
    challengerChestItem: current.challengerChestItem,
    challengerFeetItem: current.challengerFeetItem,
    challengerRightHandItem: current.challengerRightHandItem,
    challengerLeftHandItem: current.challengerLeftHandItem,
    opponentHeadItem: current.opponentHeadItem,
    opponentChestItem: current.opponentChestItem,
    opponentFeetItem: current.opponentFeetItem,
    opponentRightHandItem: current.opponentRightHandItem,
    opponentLeftHandItem: current.opponentLeftHandItem,
    challengerGender: current.challengerGender,
    opponentGender: current.opponentGender,
  });

  const announcementOutcome = challengerWon
    ? "CHALLENGER_WIN"
    : opponentWon ? "OPPONENT_WIN" : "DRAW";
  insertChatMessage(
    ctx,
    current.challenger,
    challengerName,
    duelAnnouncementText(challengerName, opponentName, announcementOutcome),
    current.id,
  );
  ctx.db.duel.id.delete(current.id);
}

function resolveDuel(ctx: any, current: any) {
  if (current.status === "finishing") {
    if (ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros) finishDuel(ctx, current);
    return;
  }
  if (current.status === "countdown") {
    if (ctx.timestamp.microsSinceUnixEpoch < current.startsAtMicros) return;
    // Continue directly into simulation. Scheduled resolution may be the first
    // server wake-up when the challenger backgrounds during the countdown.
    current = {
      ...current,
      status: "active",
      startedAt: ctx.timestamp,
      lastResolvedAt: new Timestamp(current.startsAtMicros),
    };
  }
  const resolutionMicros = current.endsAtMicros < ctx.timestamp.microsSinceUnixEpoch
    ? current.endsAtMicros
    : ctx.timestamp.microsSinceUnixEpoch;
  let cursorMicros = current.lastResolvedAt.microsSinceUnixEpoch;
  let challengerHp = current.challengerHp;
  let opponentHp = current.opponentHp;
  let challengerAttacks = current.challengerAttacks;
  let opponentAttacks = current.opponentAttacks;
  let challengerDamageDealt = current.challengerDamageDealt;
  let opponentDamageDealt = current.opponentDamageDealt;
  let challengerRegened = current.challengerRegened;
  let opponentRegened = current.opponentRegened;
  let challengerBlocked = current.challengerBlocked;
  let opponentBlocked = current.opponentBlocked;
  const challengerHit = damageAfterArmor(current.challengerDamage, current.opponentArmor);
  const opponentHit = damageAfterArmor(current.opponentDamage, current.challengerArmor);
  const challengerIntervalMicros = Math.max(1, Math.round(current.challengerAttackRate * 1_000_000));
  const opponentIntervalMicros = Math.max(1, Math.round(current.opponentAttackRate * 1_000_000));

  while (cursorMicros < resolutionMicros && challengerHp > 0 && opponentHp > 0) {
    const nextChallengerAttack = current.startsAtMicros + BigInt((challengerAttacks + 1) * challengerIntervalMicros);
    const nextOpponentAttack = current.startsAtMicros + BigInt((opponentAttacks + 1) * opponentIntervalMicros);
    const nextEventMicros = nextChallengerAttack < nextOpponentAttack
      ? nextChallengerAttack
      : nextOpponentAttack;
    const advanceToMicros = nextEventMicros < resolutionMicros ? nextEventMicros : resolutionMicros;
    const elapsedSeconds = Number(advanceToMicros - cursorMicros) / 1_000_000;
    const challengerRegen = Math.min(current.challengerMaxHp - challengerHp, current.challengerRegen * elapsedSeconds);
    const opponentRegen = Math.min(current.opponentMaxHp - opponentHp, current.opponentRegen * elapsedSeconds);
    challengerHp += challengerRegen;
    opponentHp += opponentRegen;
    challengerRegened += challengerRegen;
    opponentRegened += opponentRegen;
    cursorMicros = advanceToMicros;
    if (nextEventMicros > resolutionMicros) break;

    const challengerHits = nextChallengerAttack === nextEventMicros;
    const opponentHits = nextOpponentAttack === nextEventMicros;
    const challengerTaken = opponentHits ? Math.min(challengerHp, opponentHit) : 0;
    const opponentTaken = challengerHits ? Math.min(opponentHp, challengerHit) : 0;
    challengerHp = Math.max(0, challengerHp - challengerTaken);
    opponentHp = Math.max(0, opponentHp - opponentTaken);
    if (challengerHits) {
      challengerAttacks += 1;
      challengerDamageDealt += opponentTaken;
      challengerBlocked += Math.max(0, current.challengerDamage - challengerHit);
    }
    if (opponentHits) {
      opponentAttacks += 1;
      opponentDamageDealt += challengerTaken;
      opponentBlocked += Math.max(0, current.opponentDamage - opponentHit);
    }
  }

  const next = {
    ...current,
    challengerHp,
    opponentHp,
    challengerAttacks,
    opponentAttacks,
    challengerDamageDealt,
    opponentDamageDealt,
    challengerRegened,
    opponentRegened,
    challengerBlocked,
    opponentBlocked,
    lastResolvedAt: new Timestamp(cursorMicros),
  };

  if (
    next.challengerHp <= 0 ||
    next.opponentHp <= 0 ||
    ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
  ) {
    const finishing = {
      ...next,
      status: "finishing",
      endsAtMicros: ctx.timestamp.microsSinceUnixEpoch + DUEL_FINISH_HOLD_MICROS,
    };
    ctx.db.duel.id.update(finishing);
    ctx.db.duelResolutionSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(finishing.endsAtMicros),
      duelId: finishing.id,
    });
  } else {
    ctx.db.duel.id.update(next);
  }
}

function clearExpiredHistory(ctx: any) {
  const chatCutoff = ctx.timestamp.microsSinceUnixEpoch - CHAT_HISTORY_RETENTION_MICROS;
  const replayCutoff = ctx.timestamp.microsSinceUnixEpoch - DUEL_REPLAY_RETENTION_MICROS;
  const staleMessageIds: bigint[] = [];
  const staleReplayIds: bigint[] = [];

  for (const message of ctx.db.chatMessage.iter() as Iterable<any>) {
    if (message.sentAt.microsSinceUnixEpoch < chatCutoff) staleMessageIds.push(message.id);
  }
  for (const replay of ctx.db.duelReplay.iter() as Iterable<any>) {
    if (replay.createdAt.microsSinceUnixEpoch < replayCutoff) staleReplayIds.push(replay.id);
  }

  for (const id of staleMessageIds) ctx.db.chatMessage.id.delete(id);
  for (const id of staleReplayIds) ctx.db.duelReplay.id.delete(id);
  trimChatHistory(ctx);
}

function enterWorldPresence(ctx: any, tabId: string, forceTakeover = false) {
  const session = requireSupportedSessionProtocol(ctx);
  if (!ctx.connectionId) return;
  const normalizedTabId = tabId.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(normalizedTabId)) throw new SenderError("Invalid Wildwood tab session.");
  const virtualRegistration = ctx.db.virtualPlayer.identity.find(ctx.sender);

  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (controller && !sameConnection(controller.connectionId, ctx.connectionId)) {
    const controllerSession = ctx.db.playerSession.connectionId.find(controller.connectionId);
    const sameTab = controllerSession?.tabId && controllerSession.tabId === normalizedTabId;
    if (controllerSession?.enteredWorld && !sameTab) {
      if (!forceTakeover) throw new SenderError("Wildwood is active in another tab.");
      ctx.db.playerSession.connectionId.update({ ...controllerSession, enteredWorld: false });
    }
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: ctx.connectionId });
  } else if (!controller) {
    ctx.db.playerController.insert({ identity: ctx.sender, connectionId: ctx.connectionId });
  }

  if (!session.enteredWorld || session.tabId !== normalizedTabId) {
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: true, tabId: normalizedTabId });
  }

  const existingProfile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!existingProfile) {
    ctx.db.playerProfile.insert({
      identity: ctx.sender,
      displayName: generatedDisplayName(ctx.sender),
      profileIcon: 0,
      playerSprite: 0,
      skinTone: 3,
      gender: PLAYER_GENDER_UNSET,
    });
  }

  const lifetime = ensurePlayerLifetime(ctx);
  const grantBetaTesterGoldenHelmet = hasRecentPlayerActivity(ctx, ctx.sender);

  let existingProgress: any = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!existingProgress) {
    existingProgress = defaultPlayerProgress(ctx.sender);
    if (grantBetaTesterGoldenHelmet) {
      existingProgress.inventoryJson = JSON.stringify(inventoryWithBetaHelmet(existingProgress, true));
    }
    ctx.db.playerProgress.insert(existingProgress);
    markAttackBalanceCurrent(ctx);
  } else {
    existingProgress = migrateAttackBalance(ctx, existingProgress);
    const existingPlayer = ctx.db.player.identity.find(ctx.sender);
    const latestDragonContributor = contributedToLatestDragon(ctx, ctx.sender);
    const latestFrostclawContributor = contributedToLatestFrostclaw(ctx, ctx.sender);
    const isInDesert = existingPlayer?.mapId === BEGINNER_DESERT_MAP_ID;
    const isInSnowlands = existingPlayer?.mapId === INTERMEDIATE_SNOWLANDS_MAP_ID;
    const isInLavaWastes = existingPlayer?.mapId === ADVANCED_LAVA_WASTES_MAP_ID;
    if ((!existingProgress.desertUnlocked && (isInDesert || isInSnowlands || isInLavaWastes || latestDragonContributor || latestFrostclawContributor)) ||
      (!existingProgress.snowlandsUnlocked && (isInSnowlands || isInLavaWastes || latestFrostclawContributor)) ||
      (!existingProgress.lavaUnlocked && (isInLavaWastes || latestFrostclawContributor))) {
      existingProgress = {
        ...existingProgress,
        desertUnlocked: existingProgress.desertUnlocked || isInDesert || isInSnowlands || isInLavaWastes || latestDragonContributor || latestFrostclawContributor,
        snowlandsUnlocked: existingProgress.snowlandsUnlocked || isInSnowlands || isInLavaWastes || latestFrostclawContributor,
        lavaUnlocked: existingProgress.lavaUnlocked || isInLavaWastes || latestFrostclawContributor,
      };
      ctx.db.playerProgress.identity.update(existingProgress);
    }
    const equippedFeet = equippedFeetForProgress(existingProgress);
    const equippedHead = equippedHeadForProgress(existingProgress);
    const equippedChest = equippedChestForProgress(existingProgress);
    const equippedRightHand = equippedRightHandForProgress(existingProgress);
    const equippedLeftHand = equippedRightHand ? "" : equippedLeftHandForProgress(existingProgress);
    const inventoryJson = JSON.stringify(inventoryWithBetaHelmet(existingProgress, grantBetaTesterGoldenHelmet));
    const cosmeticEquipment = cosmeticEquipmentForProgress({ ...existingProgress, inventoryJson });
    const speed = speedForBoots(equippedFeet === TRAILBLAZER_BOOTS);
    const maxHp = Math.max(PLAYER_BASE_HP, existingProgress.maxHp);
    if (existingProgress.maxHp !== maxHp || existingProgress.attackRange !== DEFAULT_ATTACK_RANGE || existingProgress.speed !== speed || existingProgress.inventoryJson !== inventoryJson || existingProgress.equippedHead !== equippedHead || existingProgress.equippedChest !== equippedChest || existingProgress.equippedFeet !== equippedFeet || existingProgress.equippedRightHand !== equippedRightHand || existingProgress.equippedLeftHand !== equippedLeftHand || existingProgress.cosmeticHead !== cosmeticEquipment.cosmeticHead || existingProgress.cosmeticChest !== cosmeticEquipment.cosmeticChest || existingProgress.cosmeticFeet !== cosmeticEquipment.cosmeticFeet || existingProgress.cosmeticRightHand !== cosmeticEquipment.cosmeticRightHand || existingProgress.cosmeticLeftHand !== cosmeticEquipment.cosmeticLeftHand) {
      const migratedProgress = {
        ...existingProgress,
        maxHp,
        attackRange: DEFAULT_ATTACK_RANGE,
        speed,
        inventoryJson,
        equippedHead,
        equippedChest,
        equippedFeet,
        equippedRightHand,
        equippedLeftHand,
        ...cosmeticEquipment,
      };
      ctx.db.playerProgress.identity.update(migratedProgress);
      existingProgress = migratedProgress;
    }
  }

  researchForPlayer(ctx, ctx.sender);
  syncSenderAccountStatus(ctx);
  touchPlayerAccessAudit(ctx, session.protocolVersion);
  backfillKnownAccessAudit(ctx);

  const existing = playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender));
  const presencePreference = ctx.db.developerPresencePreference.identity.find(ctx.sender);
  const visibleOnEntry = isDeveloperIdentity(ctx.sender)
    ? presencePreference?.visible ?? existing?.isVisible ?? false
    : true;
  if (isDeveloperIdentity(ctx.sender) && !presencePreference) {
    ctx.db.developerPresencePreference.insert({ identity: ctx.sender, visible: visibleOnEntry });
  }
  if (!existing) {
    ctx.db.playerLifetime.identity.update({ ...lifetime, sessionStartedAt: ctx.timestamp });
  }
  const equipmentPresentation = equipmentPresentationForProgress(existingProgress);
  if (existing) {
    if (["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) {
      ctx.db.player.identity.update({
        ...existing,
        mapId: canonicalMapId(existing.mapId),
        ...playerZone(existing.x, existing.y),
        ...powerFieldsForProgress(existingProgress),
        moving: false,
        ...equipmentPresentation,
        isVisible: visibleOnEntry,
        protocolVersion: session.protocolVersion,
        controllerTabId: normalizedTabId,
        lastInputAt: ctx.timestamp,
      });
      const currentPlayer = ctx.db.player.identity.find(ctx.sender);
      syncPlayerMotion(ctx, currentPlayer);
      syncPlayerMotionIdentity(ctx, currentPlayer);
      syncPlayerMapMarker(ctx, currentPlayer, true);
      ensureRealtimeFrameSchedules(ctx);
      if (existing.isVisible !== visibleOnEntry) adjustOnlinePlayers(ctx, visibleOnEntry ? 1 : -1);
      return;
    }
    const normalizedMapId = canonicalMapId(existing.mapId);
    const entryMapId = VALID_MAP_IDS.has(normalizedMapId) ? normalizedMapId : TUTORIAL_FOREST_MAP_ID;
    const fallbackPosition = MAP_ARRIVALS[entryMapId as keyof typeof MAP_ARRIVALS] ?? PLAYER_SPAWN;
    const entryPosition = VALID_MAP_IDS.has(normalizedMapId)
      ? {
        x: Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, existing.x)),
        y: Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, existing.y)),
      }
      : fallbackPosition;
    ctx.db.player.identity.update({
      ...existing,
      mapId: entryMapId,
      x: entryPosition.x,
      y: entryPosition.y,
      ...playerZone(entryPosition.x, entryPosition.y),
      facing: Number.isFinite(existing.facing) ? existing.facing : 0,
      moving: false,
      ...powerFieldsForProgress(existingProgress),
      protocolVersion: session.protocolVersion,
      controllerTabId: normalizedTabId,
      lastInputAt: ctx.timestamp,
      lastInputSequence: 0,
      ...equipmentPresentation,
      isVisible: visibleOnEntry,
    });
    const currentPlayer = ctx.db.player.identity.find(ctx.sender);
    syncPlayerMotion(ctx, currentPlayer);
    syncPlayerMotionIdentity(ctx, currentPlayer);
    syncPlayerMapMarker(ctx, currentPlayer, true);
    ensureRealtimeFrameSchedules(ctx);
    if (existing.isVisible !== visibleOnEntry) adjustOnlinePlayers(ctx, visibleOnEntry ? 1 : -1);
    return;
  }

  const savedLocation = virtualRegistration
    ? {
      mapId: VALID_MAP_IDS.has(virtualRegistration.mapId) ? virtualRegistration.mapId : TUTORIAL_FOREST_MAP_ID,
      x: Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, virtualRegistration.spawnX)),
      y: Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, virtualRegistration.spawnY)),
      facing: 0,
    }
    : savedWorldLocation(ctx, ctx.sender, existingProgress);
  const insertedPlayer = {
    identity: ctx.sender,
    x: savedLocation.x,
    y: savedLocation.y,
    ...playerZone(savedLocation.x, savedLocation.y),
    mapId: savedLocation.mapId,
    facing: savedLocation.facing,
    // Required by the legacy physical schema. These are never synchronized.
    hp: existingProgress.maxHp,
    maxHp: existingProgress.maxHp,
    ...powerFieldsForProgress(existingProgress),
    // Cosmetic boots never affect movement stats.
    speed: speedForBoots(equippedFeetForProgress(existingProgress) === TRAILBLAZER_BOOTS),
    moving: false,
    lastInputAt: ctx.timestamp,
    lastInputSequence: 0,
    protocolVersion: session.protocolVersion,
    controllerTabId: normalizedTabId,
    ...equipmentPresentation,
    isVisible: visibleOnEntry,
  };
  ctx.db.player.insert(insertedPlayer);
  syncPlayerMotion(ctx, insertedPlayer);
  syncPlayerMotionIdentity(ctx, insertedPlayer);
  syncPlayerMapMarker(ctx, insertedPlayer, true);
  ensureRealtimeFrameSchedules(ctx);
  if (visibleOnEntry) adjustOnlinePlayers(ctx, 1);
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  ensureMaintenanceSchedule(ctx);
  ensureDragonBoss(ctx);
  ensureSpiderBoss(ctx);
  ensureFrostclawBoss(ctx);
  ensureWorldStatus(ctx);
  runPendingModuleMigrations(ctx);

  if (!ctx.connectionId) return;
  const existingSession = ctx.db.playerSession.connectionId.find(ctx.connectionId);
  const nextSession = {
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    connectedAt: ctx.timestamp,
    protocolVersion: 0,
    lastInputSequence: 0,
    enteredWorld: false,
    tabId: "",
  };
  if (existingSession) ctx.db.playerSession.connectionId.update(nextSession);
  else ctx.db.playerSession.insert(nextSession);
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (!ctx.connectionId) return;
  const session = ctx.db.playerSession.connectionId.find(ctx.connectionId);
  if (!session) return;
  if (session.enteredWorld) touchPlayerAccessAudit(ctx, session.protocolVersion);
  ctx.db.playerSession.connectionId.delete(ctx.connectionId);

  const remainingSessions = [...ctx.db.playerSession.byIdentity.filter(ctx.sender) as Iterable<any>];
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (isVirtualPlayer(ctx, ctx.sender) && remainingSessions.length === 0) {
    removeVirtualPlayerData(ctx, ctx.sender);
    return;
  }
  if (!controller || !sameConnection(controller.connectionId, ctx.connectionId)) return;

  const replacement = remainingSessions.find((candidate: any) => candidate.enteredWorld);
  if (replacement) {
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: replacement.connectionId });
    const currentPlayer = playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender));
    if (currentPlayer) {
      const nextPlayer = {
        ...currentPlayer,
        moving: false,
        lastInputAt: ctx.timestamp,
        lastInputSequence: replacement.lastInputSequence,
        protocolVersion: replacement.protocolVersion,
        controllerTabId: replacement.tabId,
      };
      ctx.db.player.identity.update(nextPlayer);
      syncPlayerMotion(ctx, nextPlayer);
      syncPlayerMotionIdentity(ctx, nextPlayer);
    }
    return;
  }
  ctx.db.playerController.identity.delete(ctx.sender);

  if (isDeveloperIdentity(ctx.sender)) clearVirtualPlayersForOwner(ctx, ctx.sender);
  finishLifetimeSession(ctx, ctx.sender);
  removeIdentityPresence(ctx, ctx.sender);
});

export const runMaintenance = spacetimedb.reducer(
  { maintenance: maintenanceSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance;
    const finishedDuels = [...ctx.db.duel.iter()].filter((current: any) =>
      current.status === "finishing" && ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
    );
    for (const current of finishedDuels) finishDuel(ctx, current);
    clearExpiredDuelRequests(ctx);
    clearExpiredHistory(ctx);
    clearExpiredAccountLinks(ctx);
    clearOrphanPresence(ctx);
    clearOrphanRealtimeState(ctx);
    clearOrphanVirtualPlayers(ctx);
    clearExpiredVirtualPlayerRuns(ctx);
    reconcileOnlinePlayers(ctx);
    runPendingModuleMigrations(ctx);
    for (const active of [...ctx.db.activeResearch.iter()] as any[]) reconcileActiveResearch(ctx, active);
    for (const active of [...ctx.db.activeItemUpgrade.iter()] as any[]) reconcileActiveItemUpgrade(ctx, active);
    refreshLeaderboardIfDue(ctx);
    regenerateIdleBosses(ctx);
  },
);

export const publishMotionFrames = spacetimedb.reducer(
  { schedule: motionFrameSchedule.rowType },
  (ctx, { schedule }) => {
    const mapCounts = sharedMapCounts(ctx);
    const zones = new Map<string, { mapId: string; zoneX: number; zoneY: number; samples: PlayerMotionSample[] }>();
    const changedSinceLastTick = new Range(
      { tag: "excluded", value: new Timestamp(schedule.previousTickMicros) },
      { tag: "included", value: ctx.timestamp },
    );
    for (const motion of ctx.db.playerMotion.lastInputAt.filter(changedSinceLastTick) as Iterable<any>) {
      const mapPopulation = mapCounts.get(motion.mapId) ?? 0;
      const sharedMap = mapPopulation > 1;
      if (
        !motion.moving ||
        !sharedMap ||
        !motion.isVisible
      ) continue;
      const key = `${motion.mapId}:${motion.zoneX}:${motion.zoneY}`;
      const zone = zones.get(key) ?? {
        mapId: motion.mapId,
        zoneX: motion.zoneX,
        zoneY: motion.zoneY,
        samples: [] as PlayerMotionSample[],
      };
      zone.samples.push(motionSample(motion));
      zones.set(key, zone);
    }

    for (const zone of zones.values()) {
      ctx.db.playerMotionFrame.insert({
        mapId: zone.mapId,
        zoneX: zone.zoneX,
        zoneY: zone.zoneY,
        emittedAt: ctx.timestamp,
        playerCount: zone.samples.length,
        payload: encodePlayerMotionFrame(zone.samples),
      });
    }

    // One trailing tick detects the end of a burst. Sustained steering keeps
    // the shared lane at 10 Hz; a sparse heartbeat costs one empty follow-up
    // scan instead of a continuously leased scheduler.
    if (zones.size > 0) {
      ctx.db.motionFrameSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_FRAME_INTERVAL_MICROS),
        previousTickMicros: ctx.timestamp.microsSinceUnixEpoch,
      });
    }
  },
);

export const publishMapFrames = spacetimedb.reducer(
  { schedule: mapFrameSchedule.rowType },
  (ctx, _args) => {
    const mapCounts = sharedMapCounts(ctx);
    let continuePublishing = false;
    for (const count of mapCounts.values()) {
      if (count > 1) {
        continuePublishing = true;
        break;
      }
    }
    const maps = new Map<string, PlayerMotionSample[]>();
    // Emit one final single-player/empty-visible snapshot before stopping so
    // clients clear dots belonging to players who just left or hid.
    for (const [mapId, count] of mapCounts) if (count > 0) maps.set(mapId, []);
    for (const motion of ctx.db.playerMotion.iter() as Iterable<any>) {
      if (!motion.isVisible) continue;
      const samples = maps.get(motion.mapId) ?? [];
      samples.push(motionSample(motion));
      maps.set(motion.mapId, samples);
    }
    for (const [mapId, samples] of maps) {
      const compacted = compactPlayerMapSamples(samples, WORLD.width, WORLD.height);
      ctx.db.playerMapFrame.insert({
        mapId,
        emittedAt: ctx.timestamp,
        playerCount: compacted.length,
        payload: encodePlayerMotionFrame(compacted),
      });
    }

    if (continuePublishing) {
      ctx.db.mapFrameSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MAP_FRAME_INTERVAL_MICROS),
      });
    }
  },
);

export const completeResearch = spacetimedb.reducer(
  { schedule: researchCompletionSchedule.rowType },
  (ctx, { schedule }) => {
    const active = ctx.db.activeResearch.identity.find(schedule.identity);
    if (!active || active.researchId !== schedule.researchId || active.targetRank !== schedule.targetRank) return;
    reconcileActiveResearch(ctx, active);
  },
);

export const completeItemUpgrade = spacetimedb.reducer(
  { schedule: itemUpgradeCompletionSchedule.rowType },
  (ctx, { schedule }) => {
    const active = ctx.db.activeItemUpgrade.identity.find(schedule.identity);
    if (!active || active.paused || active.itemId !== schedule.itemId || active.targetLevel !== schedule.targetLevel) return;
    reconcileActiveItemUpgrade(ctx, active);
  },
);

export const resolveScheduledDuel = spacetimedb.reducer(
  { schedule: duelResolutionSchedule.rowType },
  (ctx, { schedule }) => {
    const current = ctx.db.duel.id.find(schedule.duelId);
    if (current) resolveDuel(ctx, current);
  },
);

export const respawnDragon = spacetimedb.reducer(
  { schedule: dragonRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const dragon = ensureDragonBoss(ctx);
    if (dragon.alive || dragon.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < dragon.respawnAtMicros) return;
    clearDragonCombatRows(ctx);
    ctx.db.dragonBoss.id.update({
      ...dragon,
      encounter: dragon.encounter + 1n,
      hp: dragon.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnSpider = spacetimedb.reducer(
  { schedule: spiderRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const spider = ensureSpiderBoss(ctx);
    if (spider.alive || spider.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < spider.respawnAtMicros) return;
    clearSpiderCombatRows(ctx);
    ctx.db.spiderBoss.id.update({
      ...spider,
      encounter: spider.encounter + 1n,
      hp: spider.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnFrostclaw = spacetimedb.reducer(
  { schedule: frostclawRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const frostclaw = ensureFrostclawBoss(ctx);
    if (frostclaw.alive || frostclaw.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < frostclaw.respawnAtMicros) return;
    clearFrostclawCombatRows(ctx);
    ctx.db.frostclawBoss.id.update({
      ...frostclaw,
      encounter: frostclaw.encounter + 1n,
      hp: frostclaw.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

function applyDragonDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
  const activePlayer = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) return;
  if (activePlayer.mapId !== TUTORIAL_FOREST_MAP_ID) return;
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) return;
  const dragon = ensureDragonBoss(ctx);
  if (!dragon.alive || dragon.hp <= 0) return;

  if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
    throw new SenderError("Boss attack position must be finite");
  }
  const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
  const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
  const centerDistance = Math.hypot(actionX - DRAGON_POSITION.x, actionY - DRAGON_POSITION.y);
  if (centerDistance - DRAGON_RADIUS > progress.attackRange + DRAGON_HIT_RANGE_TOLERANCE) return;

  const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(ctx, ctx.sender, progress) * 1_000_000)));
  const currentWindow = ctx.db.dragonAttackWindow.identity.find(ctx.sender);
  const newWindow =
    !currentWindow ||
    currentWindow.encounter !== dragon.encounter ||
    now - currentWindow.startedAtMicros >= intervalMicros;
  const remainingHits = newWindow
    ? progress.projectileCount
    : Math.max(0, progress.projectileCount - currentWindow.hits);
  const acceptedHits = Math.min(boundedHits, remainingHits);
  if (acceptedHits <= 0) return;

  if (newWindow) {
    const nextWindow = {
      identity: ctx.sender,
      encounter: dragon.encounter,
      startedAtMicros: now,
      hits: acceptedHits,
    };
    if (currentWindow) ctx.db.dragonAttackWindow.identity.update(nextWindow);
    else ctx.db.dragonAttackWindow.insert(nextWindow);
  } else {
    ctx.db.dragonAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
  }

  const damage = Math.min(dragon.hp, Math.max(1, researchedDamage(ctx, ctx.sender, progress.damage)) * acceptedHits);
  const currentContribution = ctx.db.dragonContribution.identity.find(ctx.sender);
  const continuingContribution = currentContribution?.encounter === dragon.encounter;
  const displayName = continuingContribution
    ? currentContribution.displayName
    : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
  const nextContribution = {
    identity: ctx.sender,
    encounter: dragon.encounter,
    displayName,
    damage: continuingContribution ? currentContribution.damage + damage : damage,
  };
  if (currentContribution) ctx.db.dragonContribution.identity.update(nextContribution);
  else ctx.db.dragonContribution.insert(nextContribution);
  publishBossAttack(ctx, activePlayer, activePlayer.x, activePlayer.y, DRAGON_POSITION, DRAGON_RADIUS, acceptedHits);

  const nextDragon = {
    ...dragon,
    hp: Math.max(0, dragon.hp - damage),
    lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (nextDragon.hp <= 0) finishDragonEncounter(ctx, nextDragon);
  else ctx.db.dragonBoss.id.update(nextDragon);
}

// Legacy one-projectile reducer remains available while cached clients drain.
export const damageDragon = spacetimedb.reducer({}, (ctx) => applyDragonDamage(ctx, 1));

export const damageDragonBatch = spacetimedb.reducer(
  { hits: t.u32() },
  (ctx, { hits }) => applyDragonDamage(ctx, hits),
);

export const damageDragonFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyDragonDamage(ctx, hits, { x, y }),
);

function applySpiderDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
  const activePlayer = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) return;
  if (activePlayer.mapId !== BEGINNER_DESERT_MAP_ID) return;
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) return;
  const spider = ensureSpiderBoss(ctx);
  if (!spider.alive || spider.hp <= 0) return;

  if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
    throw new SenderError("Boss attack position must be finite");
  }
  const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
  const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
  const centerDistance = Math.hypot(actionX - SPIDER_POSITION.x, actionY - SPIDER_POSITION.y);
  if (centerDistance - SPIDER_RADIUS > progress.attackRange + SPIDER_HIT_RANGE_TOLERANCE) return;

  const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(ctx, ctx.sender, progress) * 1_000_000)));
  const currentWindow = ctx.db.spiderAttackWindow.identity.find(ctx.sender);
  const newWindow =
    !currentWindow ||
    currentWindow.encounter !== spider.encounter ||
    now - currentWindow.startedAtMicros >= intervalMicros;
  const remainingHits = newWindow
    ? progress.projectileCount
    : Math.max(0, progress.projectileCount - currentWindow.hits);
  const acceptedHits = Math.min(boundedHits, remainingHits);
  if (acceptedHits <= 0) return;

  if (newWindow) {
    const nextWindow = {
      identity: ctx.sender,
      encounter: spider.encounter,
      startedAtMicros: now,
      hits: acceptedHits,
    };
    if (currentWindow) ctx.db.spiderAttackWindow.identity.update(nextWindow);
    else ctx.db.spiderAttackWindow.insert(nextWindow);
  } else {
    ctx.db.spiderAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
  }

  const damage = Math.min(spider.hp, Math.max(1, researchedDamage(ctx, ctx.sender, progress.damage)) * acceptedHits);
  const currentContribution = ctx.db.spiderContribution.identity.find(ctx.sender);
  const continuingContribution = currentContribution?.encounter === spider.encounter;
  const displayName = continuingContribution
    ? currentContribution.displayName
    : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
  const nextContribution = {
    identity: ctx.sender,
    encounter: spider.encounter,
    displayName,
    damage: continuingContribution ? currentContribution.damage + damage : damage,
  };
  if (currentContribution) ctx.db.spiderContribution.identity.update(nextContribution);
  else ctx.db.spiderContribution.insert(nextContribution);
  publishBossAttack(ctx, activePlayer, activePlayer.x, activePlayer.y, SPIDER_POSITION, SPIDER_RADIUS, acceptedHits);

  const nextSpider = {
    ...spider,
    hp: Math.max(0, spider.hp - damage),
    lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (nextSpider.hp <= 0) finishSpiderEncounter(ctx, nextSpider);
  else ctx.db.spiderBoss.id.update(nextSpider);
}

export const damageSpiderBatch = spacetimedb.reducer(
  { hits: t.u32() },
  (ctx, { hits }) => applySpiderDamage(ctx, hits),
);

export const damageSpiderFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applySpiderDamage(ctx, hits, { x, y }),
);

function applyFrostclawDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
  const activePlayer = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) return;
  if (activePlayer.mapId !== INTERMEDIATE_SNOWLANDS_MAP_ID) return;
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) return;
  const frostclaw = ensureFrostclawBoss(ctx);
  if (!frostclaw.alive || frostclaw.hp <= 0) return;

  if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
    throw new SenderError("Boss attack position must be finite");
  }
  const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
  const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
  const centerDistance = Math.hypot(actionX - FROSTCLAW_POSITION.x, actionY - FROSTCLAW_POSITION.y);
  if (centerDistance - FROSTCLAW_RADIUS > progress.attackRange + FROSTCLAW_HIT_RANGE_TOLERANCE) return;

  const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(ctx, ctx.sender, progress) * 1_000_000)));
  const currentWindow = ctx.db.frostclawAttackWindow.identity.find(ctx.sender);
  const newWindow =
    !currentWindow ||
    currentWindow.encounter !== frostclaw.encounter ||
    now - currentWindow.startedAtMicros >= intervalMicros;
  const remainingHits = newWindow
    ? progress.projectileCount
    : Math.max(0, progress.projectileCount - currentWindow.hits);
  const acceptedHits = Math.min(boundedHits, remainingHits);
  if (acceptedHits <= 0) return;

  if (newWindow) {
    const nextWindow = {
      identity: ctx.sender,
      encounter: frostclaw.encounter,
      startedAtMicros: now,
      hits: acceptedHits,
    };
    if (currentWindow) ctx.db.frostclawAttackWindow.identity.update(nextWindow);
    else ctx.db.frostclawAttackWindow.insert(nextWindow);
  } else {
    ctx.db.frostclawAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
  }

  const damage = Math.min(frostclaw.hp, Math.max(1, researchedDamage(ctx, ctx.sender, progress.damage)) * acceptedHits);
  const currentContribution = ctx.db.frostclawContribution.identity.find(ctx.sender);
  const continuingContribution = currentContribution?.encounter === frostclaw.encounter;
  const displayName = continuingContribution
    ? currentContribution.displayName
    : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
  const nextContribution = {
    identity: ctx.sender,
    encounter: frostclaw.encounter,
    displayName,
    damage: continuingContribution ? currentContribution.damage + damage : damage,
  };
  if (currentContribution) ctx.db.frostclawContribution.identity.update(nextContribution);
  else ctx.db.frostclawContribution.insert(nextContribution);
  publishBossAttack(ctx, activePlayer, activePlayer.x, activePlayer.y, FROSTCLAW_POSITION, FROSTCLAW_RADIUS, acceptedHits);

  const nextFrostclaw = {
    ...frostclaw,
    hp: Math.max(0, frostclaw.hp - damage),
    lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (nextFrostclaw.hp <= 0) finishFrostclawEncounter(ctx, nextFrostclaw);
  else ctx.db.frostclawBoss.id.update(nextFrostclaw);
}

export const damageFrostclawFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyFrostclawDamage(ctx, hits, { x, y }),
);

export const registerProtocol = spacetimedb.reducer(
  { protocolVersion: t.u32() },
  (ctx, { protocolVersion }) => {
    if (!isSupportedProtocol(protocolVersion)) {
      throw new SenderError("Wildwood updated. Refresh to continue.");
    }
    const session = requireSession(ctx);
    ctx.db.playerSession.connectionId.update({ ...session, protocolVersion });
    const current = ctx.db.player.identity.find(ctx.sender);
    const controller = ctx.db.playerController.identity.find(ctx.sender);
    if (current && ctx.connectionId && controller && sameConnection(controller.connectionId, ctx.connectionId)) {
      ctx.db.player.identity.update({ ...current, protocolVersion });
    }
    const activeResearch = ctx.db.activeResearch.identity.find(ctx.sender);
    if (activeResearch) reconcileActiveResearch(ctx, activeResearch);
    const activeUpgrade = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (activeUpgrade) reconcileActiveItemUpgrade(ctx, activeUpgrade);
  },
);

export const enterWorld = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  requireSupportedSessionProtocol(ctx);
  enterWorldPresence(ctx, tabId);
});

export const takeOverSession = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  requireSupportedSessionProtocol(ctx);
  enterWorldPresence(ctx, tabId, true);
});

export const resumeSession = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
  },
);

export const beginAccountLink = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireSupportedSessionProtocol(ctx);
    if (hasSpacetimeAuthAccount(ctx)) throw new SenderError("Already signed in.");
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) throw new SenderError("Invalid account link.");
    clearExpiredAccountLinks(ctx);
    if (ctx.db.accountLink.code.find(code)) throw new SenderError("Account link already exists.");
    ctx.db.accountLink.insert({ code, guest: ctx.sender, createdAt: ctx.timestamp });
  },
);

export const claimGuestAccount = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireSupportedSessionProtocol(ctx);
    if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in required.");
    clearExpiredAccountLinks(ctx);

    const link = ctx.db.accountLink.code.find(code);
    if (!link) throw new SenderError("Account link expired. Sign in again.");
    if (sameIdentity(link.guest, ctx.sender)) throw new SenderError("Invalid account link.");
    if (activeDuelFor(ctx, link.guest) || activeDuelFor(ctx, ctx.sender)) {
      throw new SenderError("Finish duel before linking this account.");
    }

    const accountProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (accountProgress && !hasFreshProgress(accountProgress)) {
      throw new SenderError("This account already has Wildwood progress.");
    }

    const guestProgress = ctx.db.playerProgress.identity.find(link.guest);
    if (!guestProgress) throw new SenderError("Guest save unavailable. Return to guest mode and try again.");
    const nextProgress = { ...guestProgress, identity: ctx.sender };
    if (accountProgress) ctx.db.playerProgress.identity.update(nextProgress);
    else ctx.db.playerProgress.insert(nextProgress);

    const guestLocation = ctx.db.playerLastLocation.identity.find(link.guest);
    const accountLocation = ctx.db.playerLastLocation.identity.find(ctx.sender);
    if (guestLocation) {
      const nextLocation = { ...guestLocation, identity: ctx.sender };
      if (accountLocation) ctx.db.playerLastLocation.identity.update(nextLocation);
      else ctx.db.playerLastLocation.insert(nextLocation);
    }

    const guestResearch = ctx.db.playerResearch.identity.find(link.guest);
    const accountResearch = ctx.db.playerResearch.identity.find(ctx.sender);
    if (guestResearch) {
      const nextResearch = { ...guestResearch, identity: ctx.sender, frontierMastery: 0 };
      if (accountResearch) ctx.db.playerResearch.identity.update(nextResearch);
      else ctx.db.playerResearch.insert(nextResearch);
    }
    const guestActiveResearch = ctx.db.activeResearch.identity.find(link.guest);
    const accountActiveResearch = ctx.db.activeResearch.identity.find(ctx.sender);
    if (guestActiveResearch && !accountActiveResearch) {
      const transferredActiveResearch = { ...guestActiveResearch, identity: ctx.sender };
      ctx.db.activeResearch.insert(transferredActiveResearch);
      removeResearchCompletionSchedules(ctx, link.guest);
      ensureResearchCompletionSchedule(ctx, transferredActiveResearch);
    } else if (guestActiveResearch) {
      removeResearchCompletionSchedules(ctx, link.guest);
    }

    for (const guestUpgrade of [...ctx.db.playerItemUpgrade.byIdentity.filter(link.guest) as Iterable<any>]) {
      const key = itemUpgradeKey(ctx.sender, guestUpgrade.itemId);
      const accountUpgrade = ctx.db.playerItemUpgrade.key.find(key);
      const transferred = {
        key,
        identity: ctx.sender,
        itemId: guestUpgrade.itemId,
        level: Math.max(accountUpgrade?.level ?? 0, guestUpgrade.level),
      };
      if (accountUpgrade) ctx.db.playerItemUpgrade.key.update(transferred);
      else ctx.db.playerItemUpgrade.insert(transferred);
    }
    const guestActiveItemUpgrade = ctx.db.activeItemUpgrade.identity.find(link.guest);
    const accountActiveItemUpgrade = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (guestActiveItemUpgrade && !accountActiveItemUpgrade) {
      const transferred = { ...guestActiveItemUpgrade, identity: ctx.sender };
      ctx.db.activeItemUpgrade.insert(transferred);
      removeItemUpgradeCompletionSchedules(ctx, link.guest);
      ensureItemUpgradeCompletionSchedule(ctx, transferred);
    } else if (guestActiveItemUpgrade) {
      removeItemUpgradeCompletionSchedules(ctx, link.guest);
    }

    const guestLifetime = ctx.db.playerLifetime.identity.find(link.guest);
    const accountLifetime = ctx.db.playerLifetime.identity.find(ctx.sender);
    if (guestLifetime) {
      const nextLifetime = {
        identity: ctx.sender,
        joinedAt: accountLifetime
          ? earlierTimestamp(accountLifetime.joinedAt, guestLifetime.joinedAt)
          : guestLifetime.joinedAt,
        playedMicros: (accountLifetime?.playedMicros ?? 0n) + guestLifetime.playedMicros,
        sessionStartedAt: ctx.timestamp,
        enemyKills: (accountLifetime?.enemyKills ?? 0n) + guestLifetime.enemyKills,
        deathCount: (accountLifetime?.deathCount ?? 0n) + guestLifetime.deathCount,
      };
      if (accountLifetime) ctx.db.playerLifetime.identity.update(nextLifetime);
      else ctx.db.playerLifetime.insert(nextLifetime);
    }

    const guestProfile = ctx.db.playerProfile.identity.find(link.guest);
    const accountProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const preserveAccountName = Boolean(accountProfile && !isGeneratedDisplayName(accountProfile.displayName));
    const transferGuestName = Boolean(guestProfile && !preserveAccountName && !isGeneratedDisplayName(guestProfile.displayName));
    if (transferGuestName && guestProfile && accountProfile) {
      ctx.db.playerProfile.identity.update({ ...accountProfile, displayName: guestProfile.displayName, profileIcon: guestProfile.profileIcon, playerSprite: guestProfile.playerSprite, skinTone: guestProfile.skinTone, gender: guestProfile.gender });
    } else if (transferGuestName && guestProfile) {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: guestProfile.displayName, profileIcon: guestProfile.profileIcon, playerSprite: guestProfile.playerSprite, skinTone: guestProfile.skinTone, gender: guestProfile.gender });
    } else if (guestProfile?.gender && accountProfile?.gender === PLAYER_GENDER_UNSET) {
      ctx.db.playerProfile.identity.update({ ...accountProfile, gender: guestProfile.gender });
    } else if (guestProfile?.gender && !accountProfile) {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: generatedDisplayName(ctx.sender), profileIcon: 0, playerSprite: 0, skinTone: 3, gender: guestProfile.gender });
    }

    // A freshly-created guest's generated name must never overwrite an existing
    // authenticated name or carry a name-change lock onto that account.
    if (transferGuestName) {
      const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
      const accountNameCooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
      if (guestNameCooldown && accountNameCooldown) {
        ctx.db.playerNameCooldown.identity.update({ ...accountNameCooldown, changedAt: guestNameCooldown.changedAt });
      } else if (guestNameCooldown) {
        ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: guestNameCooldown.changedAt });
      }
    }

    const activePlayer = ctx.db.player.identity.find(ctx.sender);
    if (activePlayer) {
      ctx.db.player.identity.update({
        ...activePlayer,
        speed: speedForBoots(nextProgress.equippedFeet === TRAILBLAZER_BOOTS),
        ...powerFieldsForProgress(nextProgress),
        ...equipmentPresentationForProgress(nextProgress),
      });
    }

    const finalProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const finalDisplayName = finalProfile?.displayName ?? generatedDisplayName(ctx.sender);
    const accountStatus = ctx.db.playerAccountStatus.identity.find(ctx.sender);
    const linkedStatus = { identity: ctx.sender, isGuest: false };
    if (accountStatus) ctx.db.playerAccountStatus.identity.update(linkedStatus);
    else ctx.db.playerAccountStatus.insert(linkedStatus);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
    const guestAccountStatus = ctx.db.playerAccountStatus.identity.find(link.guest);
    if (guestAccountStatus) ctx.db.playerAccountStatus.identity.delete(link.guest);
    const guestLeaderboardEntry = ctx.db.leaderboardEntry.identity.find(link.guest);
    const accountLeaderboardEntry = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (guestLeaderboardEntry || accountLeaderboardEntry) {
      const nextLeaderboardEntry = {
        identity: ctx.sender,
        displayName: finalDisplayName,
        ...powerFieldsForProgress(nextProgress),
        profileIcon: finalProfile?.profileIcon ?? 0,
        gender: finalProfile?.gender ?? PLAYER_GENDER_UNSET,
        ...leaderboardAppearanceForProgress(nextProgress, finalProfile),
        damage: nextProgress.damage,
        maxHp: nextProgress.maxHp,
        armor: nextProgress.armor,
        regen: nextProgress.regen,
        playedMicros: (accountLeaderboardEntry?.playedMicros ?? 0n) + (guestLeaderboardEntry?.playedMicros ?? 0n),
        isGuest: false,
      };
      if (accountLeaderboardEntry) ctx.db.leaderboardEntry.identity.update(nextLeaderboardEntry);
      else ctx.db.leaderboardEntry.insert(nextLeaderboardEntry);
    }
    if (guestLeaderboardEntry) ctx.db.leaderboardEntry.identity.delete(link.guest);
    const guestContribution = ctx.db.dragonContribution.identity.find(link.guest);
    const accountContribution = ctx.db.dragonContribution.identity.find(ctx.sender);
    if (guestContribution) {
      const nextContribution = {
        identity: ctx.sender,
        encounter: guestContribution.encounter,
        displayName: finalDisplayName,
        damage: accountContribution?.encounter === guestContribution.encounter
          ? accountContribution.damage + guestContribution.damage
          : guestContribution.damage,
      };
      if (accountContribution) ctx.db.dragonContribution.identity.update(nextContribution);
      else ctx.db.dragonContribution.insert(nextContribution);
      ctx.db.dragonContribution.identity.delete(link.guest);
    }
    const guestDragonWindow = ctx.db.dragonAttackWindow.identity.find(link.guest);
    if (guestDragonWindow) ctx.db.dragonAttackWindow.identity.delete(link.guest);
    const accountDragonWindow = ctx.db.dragonAttackWindow.identity.find(ctx.sender);
    if (accountDragonWindow) ctx.db.dragonAttackWindow.identity.delete(ctx.sender);

    const accountBalance = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
    const nextBalance = { identity: ctx.sender, version: ATTACK_BALANCE_VERSION };
    if (accountBalance) ctx.db.playerBalanceVersion.identity.update(nextBalance);
    else ctx.db.playerBalanceVersion.insert(nextBalance);

    // Migration transfers a guest save into the authenticated identity. Leave
    // no second durable save behind; otherwise an old guest token can later
    // reconnect with the pre-migration name and stats.
    const guestActivePlayer = ctx.db.player.identity.find(link.guest);
    if (guestActivePlayer) {
      ctx.db.player.identity.delete(link.guest);
      if (guestActivePlayer.isVisible) adjustOnlinePlayers(ctx, -1);
    }
    removePlayerRealtimeState(ctx, link.guest);
    if (ctx.db.playerMapMarker.identity.find(link.guest)) ctx.db.playerMapMarker.identity.delete(link.guest);
    if (ctx.db.playerMovementDemand.identity.find(link.guest)) ctx.db.playerMovementDemand.identity.delete(link.guest);
    if (guestProgress) ctx.db.playerProgress.identity.delete(link.guest);
    if (guestLocation) ctx.db.playerLastLocation.identity.delete(link.guest);
    if (guestResearch) ctx.db.playerResearch.identity.delete(link.guest);
    if (guestActiveResearch) ctx.db.activeResearch.identity.delete(link.guest);
    removePlayerItemUpgradeData(ctx, link.guest, true);
    if (guestProfile) ctx.db.playerProfile.identity.delete(link.guest);
    if (guestLifetime) ctx.db.playerLifetime.identity.delete(link.guest);
    const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
    if (guestNameCooldown) ctx.db.playerNameCooldown.identity.delete(link.guest);
    const guestChatCooldown = ctx.db.chatCooldown.identity.find(link.guest);
    if (guestChatCooldown) ctx.db.chatCooldown.identity.delete(link.guest);
    const guestDuelRequestCooldown = ctx.db.duelRequestCooldown.identity.find(link.guest);
    if (guestDuelRequestCooldown) ctx.db.duelRequestCooldown.identity.delete(link.guest);
    const guestBalance = ctx.db.playerBalanceVersion.identity.find(link.guest);
    if (guestBalance) ctx.db.playerBalanceVersion.identity.delete(link.guest);

    const guestSessions = [...ctx.db.playerSession.byIdentity.filter(link.guest) as Iterable<any>];
    for (const session of guestSessions) ctx.db.playerSession.connectionId.delete(session.connectionId);
    const guestController = ctx.db.playerController.identity.find(link.guest);
    if (guestController) ctx.db.playerController.identity.delete(link.guest);

    const guestLinkCodes: string[] = [];
    for (const pendingLink of ctx.db.accountLink.iter() as Iterable<any>) {
      if (sameIdentity(pendingLink.guest, link.guest)) guestLinkCodes.push(pendingLink.code);
    }
    for (const pendingCode of guestLinkCodes) ctx.db.accountLink.code.delete(pendingCode);
  },
);

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const activePlayer = requireControllingPlayer(ctx);
    const normalized = displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(normalized)) {
      throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores");
    }

    const existing = ctx.db.playerProfile.identity.find(ctx.sender);
    if (existing?.displayName === normalized) return;
    const normalizedComparison = normalized.toLowerCase();
    for (const profile of ctx.db.playerProfile.iter() as Iterable<any>) {
      if (!sameIdentity(profile.identity, ctx.sender) && profile.displayName.toLowerCase() === normalizedComparison) {
        throw new SenderError("Player name is already taken.");
      }
    }
    const cooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
    // Repair names accidentally replaced by a generated guest name during a
    // prior account-link operation. The next real name starts the 30-day lock.
    if (DISPLAY_NAME_COOLDOWN_ENABLED && cooldown && !isGeneratedDisplayName(existing?.displayName ?? "") &&
      ctx.timestamp.microsSinceUnixEpoch - cooldown.changedAt.microsSinceUnixEpoch < DISPLAY_NAME_COOLDOWN_MICROS) {
      throw new SenderError("Display name can be changed once every 30 days.");
    }

    if (existing) {
      ctx.db.playerProfile.identity.update({ ...existing, displayName: normalized });
    } else {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: normalized, profileIcon: 0, playerSprite: 0, skinTone: 3, gender: PLAYER_GENDER_UNSET });
    }
    if (cooldown) ctx.db.playerNameCooldown.identity.update({ ...cooldown, changedAt: ctx.timestamp });
    else ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: ctx.timestamp });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, displayName: normalized });
    syncPlayerMotionIdentity(ctx, activePlayer);
    touchPlayerAccessAudit(ctx, activePlayer.protocolVersion);
  },
);

export const setDeveloperPresence = spacetimedb.reducer(
  { visible: t.bool() },
  (ctx, { visible }) => {
    requireDeveloper(ctx);
    const activePlayer = requireControllingPlayer(ctx);
    const preference = ctx.db.developerPresencePreference.identity.find(ctx.sender);
    if (preference) ctx.db.developerPresencePreference.identity.update({ ...preference, visible });
    else ctx.db.developerPresencePreference.insert({ identity: ctx.sender, visible });
    if (activePlayer.isVisible === visible) return;
    const nextPlayer = { ...activePlayer, isVisible: visible, lastInputAt: ctx.timestamp };
    ctx.db.player.identity.update(nextPlayer);
    syncPlayerMotion(ctx, nextPlayer);
    syncPlayerMotionIdentity(ctx, nextPlayer);
    syncPlayerMapMarker(ctx, nextPlayer, true);
    ensureRealtimeFrameSchedules(ctx);
    adjustOnlinePlayers(ctx, visible ? 1 : -1);
  },
);

export const devBeginVirtualPlayerLoadTest = spacetimedb.reducer(
  { ticket: t.string(), maxCount: t.u32() },
  (ctx, { ticket, maxCount }) => {
    // The external Node load generator authenticates as the developer without
    // taking player control away from the open game tab.
    requireDeveloperSession(ctx);
    if (!ctx.db.player.identity.find(ctx.sender) || !ctx.db.playerController.identity.find(ctx.sender)) {
      throw new SenderError("Keep the developer game session open during a virtual-player test.");
    }
    if (!isVirtualPlayerTicket(ticket)) throw new SenderError("Invalid virtual-player ticket.");
    if (maxCount < 1 || maxCount > VIRTUAL_PLAYER_LIMIT) {
      throw new SenderError(`Virtual-player count must be between 1 and ${VIRTUAL_PLAYER_LIMIT}.`);
    }

    clearVirtualPlayersForOwner(ctx, ctx.sender);
    ctx.db.virtualPlayerRun.insert({
      owner: ctx.sender,
      ticket,
      maxCount,
      expiresAtMicros: ctx.timestamp.microsSinceUnixEpoch + VIRTUAL_PLAYER_RUN_LIFETIME_MICROS,
    });
  },
);

export const joinVirtualPlayerLoadTest = spacetimedb.reducer(
  { owner: t.identity(), ticket: t.string(), mapId: t.string(), x: t.f64(), y: t.f64() },
  (ctx, { owner, ticket, mapId, x, y }) => {
    const session = requireSupportedSessionProtocol(ctx);
    if (sameIdentity(ctx.sender, owner) || isDeveloperIdentity(ctx.sender)) {
      throw new SenderError("Developer cannot become a virtual player.");
    }
    if (session.enteredWorld) throw new SenderError("Virtual-player identity must be fresh.");
    if (!VALID_MAP_IDS.has(mapId)) throw new SenderError("Unsupported virtual-player map.");
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SenderError("Virtual-player position must be finite.");

    const run = ctx.db.virtualPlayerRun.owner.find(owner);
    if (
      !run ||
      !isDeveloperIdentity(owner) ||
      run.ticket !== ticket ||
      ctx.timestamp.microsSinceUnixEpoch >= run.expiresAtMicros ||
      !ctx.db.player.identity.find(owner) ||
      !ctx.db.playerController.identity.find(owner)
    ) throw new SenderError("Virtual-player test is no longer active.");

    const existing = ctx.db.virtualPlayer.identity.find(ctx.sender);
    if (existing && !sameIdentity(existing.owner, owner)) throw new SenderError("Virtual player belongs to another test.");
    if (!existing) {
      const activeCount = virtualPlayerCountForOwner(ctx, owner);
      if (activeCount >= run.maxCount || activeCount >= VIRTUAL_PLAYER_LIMIT) {
        throw new SenderError(`Virtual-player limit is ${Math.min(run.maxCount, VIRTUAL_PLAYER_LIMIT)}.`);
      }
      if (
        ctx.db.player.identity.find(ctx.sender) ||
        ctx.db.playerProfile.identity.find(ctx.sender) ||
        ctx.db.playerProgress.identity.find(ctx.sender) ||
        ctx.db.playerLifetime.identity.find(ctx.sender)
      ) throw new SenderError("Virtual-player identity must be new.");
    }

    const registration = {
      identity: ctx.sender,
      owner,
      mapId,
      spawnX: Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, x)),
      spawnY: Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, y)),
      createdAt: existing?.createdAt ?? ctx.timestamp,
    };
    if (existing) ctx.db.virtualPlayer.identity.update(registration);
    else {
      ctx.db.virtualPlayer.insert(registration);
      adjustVirtualPlayerCount(ctx, owner, 1);
    }
  },
);

export const devClearVirtualPlayers = spacetimedb.reducer(
  {},
  (ctx) => {
    requireDeveloperSession(ctx);
    clearVirtualPlayersForOwner(ctx, ctx.sender);
  },
);

export const devSetAccessAuditLabel = spacetimedb.reducer(
  { identity: t.identity(), label: t.string() },
  (ctx, { identity, label }) => {
    requireDeveloper(ctx);
    const normalized = label.trim().replace(/\s+/g, " ");
    if (normalized.length > 60) throw new SenderError("Audit label must be 60 characters or fewer.");
    const current = ctx.db.playerAccessAudit.identity.find(identity);
    if (!current) throw new SenderError("Access audit row not found.");
    ctx.db.playerAccessAudit.identity.update({ ...current, label: normalized });
  },
);

export const devDeleteBugReport = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    requireDeveloper(ctx);
    if (!ctx.db.bugReport.id.find(id)) throw new SenderError("Bug report not found.");
    ctx.db.bugReport.id.delete(id);
  },
);

// Maintenance-only correction for legacy account links created before all
// lifetime metadata was reliably transferred. This intentionally does not
// require a live player controller so the developer can run it through the
// authenticated SpacetimeDB CLI. It can only move a join date earlier.
export const devRepairPlayerJoinedAt = spacetimedb.reducer(
  { identity: t.identity(), sourceIdentity: t.identity() },
  (ctx, { identity, sourceIdentity }) => {
    if (!isDeveloperIdentity(ctx.sender) && !isDatabaseOwnerIdentity(ctx.sender)) {
      throw new SenderError("Developer access required.");
    }
    if (sameIdentity(identity, sourceIdentity)) throw new SenderError("Source and target must differ.");
    const targetLifetime = ctx.db.playerLifetime.identity.find(identity);
    const sourceLifetime = ctx.db.playerLifetime.identity.find(sourceIdentity);
    if (!targetLifetime || !sourceLifetime) throw new SenderError("Player lifetime row not found.");

    const joinedAt = earlierTimestamp(targetLifetime.joinedAt, sourceLifetime.joinedAt);
    if (joinedAt.microsSinceUnixEpoch === targetLifetime.joinedAt.microsSinceUnixEpoch) return;
    ctx.db.playerLifetime.identity.update({ ...targetLifetime, joinedAt });
  },
);

export const setProfileIcon = spacetimedb.reducer(
  { profileIcon: t.u32() },
  (ctx, { profileIcon }) => {
    requireControllingPlayer(ctx);
    if (!Number.isInteger(profileIcon) || profileIcon > 63) throw new SenderError("Profile icon must be between 0 and 63.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.profileIcon === profileIcon) return;
    ctx.db.playerProfile.identity.update({ ...profile, profileIcon });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, profileIcon });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const setGender = spacetimedb.reducer(
  { gender: t.u8() },
  (ctx, { gender }) => {
    requireControllingPlayer(ctx);
    if (!isSelectedPlayerGender(gender)) throw new SenderError("Gender must be male or female.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.gender === gender) return;
    ctx.db.playerProfile.identity.update({ ...profile, gender });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, gender });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const setPlayerSprite = spacetimedb.reducer(
  { playerSprite: t.u32() },
  (ctx, { playerSprite }) => {
    requireControllingPlayer(ctx);
    if (!Number.isInteger(playerSprite) || playerSprite > 3) throw new SenderError("Player sprite must be between 0 and 3.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.playerSprite === playerSprite) return;
    ctx.db.playerProfile.identity.update({ ...profile, playerSprite });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const setSkinTone = spacetimedb.reducer(
  { skinTone: t.u32() },
  (ctx, { skinTone }) => {
    requireControllingPlayer(ctx);
    if (!Number.isInteger(skinTone) || skinTone > 19) throw new SenderError("Skin tone must be between 0 and 19.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.skinTone === skinTone) return;
    ctx.db.playerProfile.identity.update({ ...profile, skinTone });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, skinTone });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const devUpdatePlayerSave = spacetimedb.reducer(
  {
    identity: t.identity(),
    displayName: t.string(),
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
  },
  (ctx, update) => {
    requireDeveloper(ctx);
    const profile = ctx.db.playerProfile.identity.find(update.identity);
    const progress = ctx.db.playerProgress.identity.find(update.identity);
    if (!profile || !progress) throw new SenderError("Player save row not found.");
    const displayName = update.displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(displayName)) {
      throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores.");
    }
    const bounded = (value: number, min: number, max: number, field: string) => {
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new SenderError(`${field} must be between ${min} and ${max}.`);
      }
      return value;
    };
    const nextProgress = {
      ...progress,
      maxHp: bounded(update.maxHp, 1, MAX_PLAYER_STAT, "Max HP"),
      damage: bounded(update.damage, 1, MAX_PLAYER_STAT, "Damage"),
      attackRate: bounded(update.attackRate, .05, 10, "Attack rate"),
      projectileSpeed: PLAYER_PROJECTILE_SPEED,
      projectileCount: Math.max(1, Math.min(20, Math.floor(update.projectileCount))),
      attackRange: bounded(update.attackRange, 1, 5_000, "Attack range"),
      armor: bounded(update.armor, 0, MAX_ARMOR, "Armor"),
      regen: bounded(update.regen, 0, MAX_PLAYER_STAT, "Regen"),
      speed: bounded(update.speed, 1, 2_000, "Move speed"),
    };
    ctx.db.playerProfile.identity.update({ ...profile, displayName });
    ctx.db.playerProgress.identity.update(nextProgress);
    const active = ctx.db.player.identity.find(update.identity);
    if (active) {
      ctx.db.player.identity.update({
        ...active,
        speed: nextProgress.speed,
        ...powerFieldsForProgress(nextProgress),
      });
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, active));
    }
    const audit = ctx.db.playerAccessAudit.identity.find(update.identity);
    if (audit) ctx.db.playerAccessAudit.identity.update({ ...audit, displayName });
    refreshLeaderboard(ctx);
  },
);

export const savePlayerProgress = spacetimedb.reducer(
  {
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool(),
    inventoryJson: t.string(),
    equippedHead: t.string(),
    equippedChest: t.string(),
    equippedFeet: t.string(),
    enemyKills: t.u32(),
    equippedRightHand: t.string(),
    equippedLeftHand: t.string(),
    cosmeticHead: t.string(),
    cosmeticChest: t.string(),
    cosmeticFeet: t.string(),
    cosmeticRightHand: t.string(),
    cosmeticLeftHand: t.string(),
  },
  (ctx, progress) => {
    const activePlayer = requireControllingPlayer(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const base = current ?? defaultPlayerProgress(ctx.sender);
    const bounded = (value: number, min: number, max: number, fallback: number) =>
      Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const normalized = {
      maxHp: bounded(progress.maxHp, 1, MAX_PLAYER_STAT, base.maxHp),
      damage: bounded(progress.damage, 1, MAX_PLAYER_STAT, base.damage),
      attackRate: bounded(progress.attackRate, MIN_ATTACK_INTERVAL, 10, base.attackRate),
      projectileSpeed: PLAYER_PROJECTILE_SPEED,
      projectileCount: Number.isInteger(progress.projectileCount)
        ? Math.max(1, Math.min(20, progress.projectileCount))
        : base.projectileCount,
      armor: bounded(progress.armor, 0, MAX_ARMOR, base.armor),
      regen: bounded(progress.regen, 0, MAX_PLAYER_STAT, base.regen),
      speed: bounded(progress.speed, 1, 2_000, base.speed),
      bootsCollected: progress.bootsCollected === true,
    };
    const bootsCollected = base.bootsCollected || normalized.bootsCollected;
    const inventorySource = { ...base, identity: ctx.sender, bootsCollected };
    const inventory = inventoryWithBetaHelmet(inventorySource, hasRecentPlayerActivity(ctx, ctx.sender));
    const inventoryJson = JSON.stringify(inventory);
    const equippedHead = progress.equippedHead === ""
      ? ""
      : inventory.includes(progress.equippedHead) ? progress.equippedHead : BASIC_PAPER_HAT;
    const equippedChest = inventory.includes(progress.equippedChest) ? progress.equippedChest : "";
    const equippedFeet = inventory.includes(progress.equippedFeet) ? progress.equippedFeet : "";
    const requestedRightHand = canonicalItemId(progress.equippedRightHand);
    const requestedLeftHand = canonicalItemId(progress.equippedLeftHand);
    const equippedRightHand = requestedRightHand && inventory.includes(requestedRightHand) && itemFitsEquipmentSlot(requestedRightHand, "RIGHT_HAND")
      ? requestedRightHand
      : "";
    const equippedLeftHand = !equippedRightHand && requestedLeftHand && inventory.includes(requestedLeftHand) && itemFitsEquipmentSlot(requestedLeftHand, "LEFT_HAND")
      ? requestedLeftHand
      : "";
    const cosmeticEquipment = cosmeticEquipmentForProgress({
      ...base,
      inventoryJson,
      equippedHead,
      equippedChest,
      equippedFeet,
      equippedRightHand,
      equippedLeftHand,
      cosmeticHead: progress.cosmeticHead,
      cosmeticChest: progress.cosmeticChest,
      cosmeticFeet: progress.cosmeticFeet,
      cosmeticRightHand: progress.cosmeticRightHand,
      cosmeticLeftHand: progress.cosmeticLeftHand,
    });
    const next = {
      identity: ctx.sender,
      maxHp: Math.max(base.maxHp, normalized.maxHp),
      damage: Math.max(base.damage, normalized.damage),
      attackRate: Math.min(base.attackRate, normalized.attackRate),
      projectileSpeed: PLAYER_PROJECTILE_SPEED,
      projectileCount: Math.max(base.projectileCount, normalized.projectileCount),
      attackRange: DEFAULT_ATTACK_RANGE,
      armor: Math.max(base.armor, normalized.armor),
      regen: Math.max(base.regen, normalized.regen),
      speed: speedForBoots(equippedFeet === TRAILBLAZER_BOOTS),
      bootsCollected,
      inventoryJson,
      equippedHead,
      equippedChest,
      equippedFeet,
      equippedRightHand,
      equippedLeftHand,
      ...cosmeticEquipment,
      introComplete: base.introComplete,
      desertUnlocked: base.desertUnlocked,
      snowlandsUnlocked: base.snowlandsUnlocked,
      lavaUnlocked: base.lavaUnlocked,
      bowCount: forestItemCountForProgress(base, STARTER_BOW, "bowCount"),
      woodenArmorCount: forestItemCountForProgress(base, WOODEN_ARMOR, "woodenArmorCount"),
    };
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) {
      const appearance = leaderboardAppearanceForProgress(next, ctx.db.playerProfile.identity.find(ctx.sender));
      if (
        leaderboard.skinTone !== appearance.skinTone ||
        leaderboard.headItem !== appearance.headItem ||
        leaderboard.chestItem !== appearance.chestItem ||
        leaderboard.feetItem !== appearance.feetItem ||
        leaderboard.rightHandItem !== appearance.rightHandItem ||
        leaderboard.leftHandItem !== appearance.leftHandItem
      ) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, ...appearance });
    }
    const lifetime = ensurePlayerLifetime(ctx);
    const boundedKills = BigInt(Math.max(0, Math.min(4_294_967_295, Math.floor(progress.enemyKills))));
    if (boundedKills > lifetime.enemyKills) {
      ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: boundedKills });
    }
    const presentation = {
      ...powerFieldsForProgress(next),
      speed: next.speed,
      ...equipmentPresentationForProgress(next),
    };
    if (
      activePlayer.power !== presentation.power ||
      activePlayer.powerLevel !== presentation.powerLevel ||
      activePlayer.speed !== presentation.speed ||
      activePlayer.feetItem !== presentation.feetItem ||
      activePlayer.headItem !== presentation.headItem ||
      activePlayer.chestItem !== presentation.chestItem ||
      activePlayer.rightHandItem !== presentation.rightHandItem ||
      activePlayer.leftHandItem !== presentation.leftHandItem
    ) ctx.db.player.identity.update({ ...activePlayer, ...presentation });
  },
);

export const startResearch = spacetimedb.reducer(
  { researchId: t.string() },
  (ctx, { researchId }) => {
    requireControllingPlayer(ctx);
    if (!isResearchId(researchId)) throw new SenderError("Unknown research.");
    const research = researchForPlayer(ctx, ctx.sender);
    const active = ctx.db.activeResearch.identity.find(ctx.sender);
    if (active) {
      if (activeResearchIsAvailable(research, active)) throw new SenderError("Research already in progress.");
      ctx.db.activeResearch.identity.delete(ctx.sender);
      removeResearchCompletionSchedules(ctx, ctx.sender);
    }
    assertResearchAvailable(research, researchId);
    const targetRank = research[researchId] + 1;
    const durationMicros = BigInt(researchDurationMs(researchId, research[researchId])) * 1_000n;
    const completesAtMicros = ctx.timestamp.microsSinceUnixEpoch + durationMicros;
    ctx.db.activeResearch.insert({
      identity: ctx.sender,
      researchId,
      targetRank,
      startedAt: ctx.timestamp,
      completesAt: new Timestamp(completesAtMicros),
    });
    ensureResearchCompletionSchedule(ctx, { identity: ctx.sender, researchId, targetRank, completesAt: new Timestamp(completesAtMicros) });
  },
);

export const startItemUpgrade = spacetimedb.reducer(
  { itemId: t.string() },
  (ctx, { itemId }) => {
    const playerAtBench = requireControllingPlayer(ctx);
    if (playerAtBench.mapId !== INTERMEDIATE_SNOWLANDS_MAP_ID ||
      Math.hypot(playerAtBench.x - UPGRADE_BENCH_POSITION.x, playerAtBench.y - UPGRADE_BENCH_POSITION.y) > UPGRADE_BENCH_USE_RANGE) {
      throw new SenderError("Touch the Upgrade Bench first.");
    }
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const canonical = canonicalItemId(itemId);
    if (!canonical || !isUpgradeableItem(canonical)) throw new SenderError("Choose a weapon or armor with stats.");

    const existing = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (existing) reconcileActiveItemUpgrade(ctx, existing);
    const active = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (active && !active.paused) throw new SenderError("An item is already being upgraded.");
    if (active && active.itemId !== canonical) throw new SenderError("Resume your paused upgrade first.");

    const progress = ctx.db.playerProgress.identity.find(ctx.sender) ?? defaultPlayerProgress(ctx.sender);
    if (!progressHasItem(progress, canonical)) throw new SenderError("That item is not in your inventory.");
    const currentLevel = itemUpgradeLevelFor(ctx, ctx.sender, canonical);
    if (currentLevel >= MAX_ITEM_UPGRADE_LEVEL) throw new SenderError("That item is already +10.");
    if (active && (active.currentLevel !== currentLevel || active.targetLevel !== currentLevel + 1)) {
      throw new SenderError("That paused upgrade is no longer valid.");
    }

    const durationMicros = active
      ? active.remainingMicros
      : BigInt(itemUpgradeDurationMs(currentLevel)) * 1_000n;
    const safeDurationMicros = durationMicros > 0n ? durationMicros : 1n;
    const completesAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + safeDurationMicros);
    const nextActive = {
      identity: ctx.sender,
      itemId: canonical,
      currentLevel,
      targetLevel: currentLevel + 1,
      startedAt: ctx.timestamp,
      completesAt,
      paused: false,
      remainingMicros: safeDurationMicros,
    };
    if (active) ctx.db.activeItemUpgrade.identity.update(nextActive);
    else ctx.db.activeItemUpgrade.insert(nextActive);
    writeProgressAndPresentation(ctx, removeItemFromProgress(progress, canonical));
    ensureItemUpgradeCompletionSchedule(ctx, nextActive);
  },
);

export const pauseItemUpgrade = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
    const existing = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (!existing) throw new SenderError("No item is being upgraded.");
    reconcileActiveItemUpgrade(ctx, existing);
    const active = ctx.db.activeItemUpgrade.identity.find(ctx.sender);
    if (!active) return;
    if (active.paused) return;
    const remainingMicros = active.completesAt.microsSinceUnixEpoch - ctx.timestamp.microsSinceUnixEpoch;
    if (remainingMicros <= 0n) {
      completeActiveItemUpgrade(ctx, active);
      return;
    }
    const progress = ctx.db.playerProgress.identity.find(ctx.sender) ?? defaultPlayerProgress(ctx.sender);
    writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
    ctx.db.activeItemUpgrade.identity.update({
      ...active,
      paused: true,
      remainingMicros,
      completesAt: ctx.timestamp,
    });
    removeItemUpgradeCompletionSchedules(ctx, ctx.sender);
  },
);

export const recordPlayerDeath = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, deathCount: lifetime.deathCount + 1n });
  },
);

/** Records one client-simulated forest defeat; server RNG owns durable loot. */
export const recordForestEnemyDefeat = spacetimedb.reducer(
  {},
  (ctx) => {
    const activePlayer = requireControllingPlayer(ctx);
    if (activePlayer.mapId !== TUTORIAL_FOREST_MAP_ID || activeDuelFor(ctx, ctx.sender)) return;
    const current = ctx.db.playerProgress.identity.find(ctx.sender) ?? defaultPlayerProgress(ctx.sender);
    const bowDropped = ctx.random.integerInRange(1, FOREST_ITEM_DROP_DENOMINATOR) === 1;
    const woodenArmorDropped = ctx.random.integerInRange(1, FOREST_ITEM_DROP_DENOMINATOR) === 1;
    if (!bowDropped && !woodenArmorDropped) return;

    let next = { ...current };
    if (bowDropped) {
      const alreadyOwned = playerOwnsItem(ctx, ctx.sender, STARTER_BOW);
      publishItemDrop(ctx, ctx.sender, STARTER_BOW, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, STARTER_BOW);
    }
    if (woodenArmorDropped) {
      const alreadyOwned = playerOwnsItem(ctx, ctx.sender, WOODEN_ARMOR);
      publishItemDrop(ctx, ctx.sender, WOODEN_ARMOR, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, WOODEN_ARMOR);
    }
    next.inventoryJson = JSON.stringify(inventoryForProgress(next));
    if (ctx.db.playerProgress.identity.find(ctx.sender)) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
  },
);

export const beginAdventure = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    if (current?.introComplete) return;
    if (current) ctx.db.playerProgress.identity.update({ ...current, introComplete: true });
    else ctx.db.playerProgress.insert({ ...defaultPlayerProgress(ctx.sender), introComplete: true });
  },
);

export const resetPlayerProgress = spacetimedb.reducer(
  {},
  (ctx) => {
    const activePlayer = requireControllingPlayer(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const next = defaultPlayerProgress(ctx.sender);
    if (hasRecentPlayerActivity(ctx, ctx.sender)) {
      next.inventoryJson = JSON.stringify(inventoryWithBetaHelmet(next, true));
    }
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    if (research) ctx.db.playerResearch.identity.delete(ctx.sender);
    const activeResearchRow = ctx.db.activeResearch.identity.find(ctx.sender);
    if (activeResearchRow) ctx.db.activeResearch.identity.delete(ctx.sender);
    removeResearchCompletionSchedules(ctx, ctx.sender);
    removePlayerItemUpgradeData(ctx, ctx.sender, true);
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: 0n });
    ctx.db.player.identity.update({
      ...activePlayer,
      ...powerFieldsForProgress(next),
      speed: next.speed,
      ...equipmentPresentationForProgress(next),
    });
  },
);

export const sendChatMessage = spacetimedb.reducer(
  { message: t.string() },
  (ctx, { message }) => {
    requireControllingPlayer(ctx);
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) return;

    const normalized = message.trim();
    if (!normalized) return;
    if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new SenderError("Chat message is too long");
    }

    const bugCommand = /^\/bug(?:\s|$)/i.exec(normalized);
    const report = bugCommand ? normalized.slice(bugCommand[0].length).trim() : "";
    if (bugCommand && !report) throw new SenderError("Use /bug followed by a description.");

    const cooldown = ctx.db.chatCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.lastSentAt.microsSinceUnixEpoch < CHAT_COOLDOWN_MICROS) {
      const elapsed = ctx.timestamp.microsSinceUnixEpoch - cooldown.lastSentAt.microsSinceUnixEpoch;
      const remainingSeconds = Math.max(1, Math.ceil(Number(CHAT_COOLDOWN_MICROS - elapsed) / 1_000_000));
      throw new SenderError(`Wait ${remainingSeconds} seconds before sending another chat message.`);
    }
    if (cooldown) ctx.db.chatCooldown.identity.update({ ...cooldown, lastSentAt: ctx.timestamp });
    else ctx.db.chatCooldown.insert({ identity: ctx.sender, lastSentAt: ctx.timestamp });
    if (bugCommand) {
      ctx.db.bugReport.insert({
        id: 0n,
        reporter: ctx.sender,
        reporterName: profile.displayName,
        message: report,
        protocolVersion: PROTOCOL_VERSION,
        reportedAt: ctx.timestamp,
      });
      return;
    }

    insertChatMessage(ctx, ctx.sender, profile.displayName, normalized);
  },
);

export const requestDuel = spacetimedb.reducer(
  { opponent: t.identity() },
  (ctx, { opponent }) => {
    const challenger = requireControllingPlayer(ctx);
    if (sameIdentity(opponent, ctx.sender)) throw new SenderError("You cannot duel yourself.");
    if (isVirtualPlayer(ctx, opponent) || isVirtualPlayer(ctx, ctx.sender)) {
      throw new SenderError("Virtual test players cannot duel.");
    }
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your current duel first.");

    const cooldown = ctx.db.duelRequestCooldown.identity.find(ctx.sender);
    const cooldownElapsed = cooldown
      ? ctx.timestamp.microsSinceUnixEpoch - cooldown.requestedAt.microsSinceUnixEpoch
      : DUEL_REQUEST_COOLDOWN_MICROS;
    if (cooldownElapsed < DUEL_REQUEST_COOLDOWN_MICROS) {
      const remainingSeconds = Number((DUEL_REQUEST_COOLDOWN_MICROS - cooldownElapsed + 999_999n) / 1_000_000n);
      throw new SenderError(`Duel cooldown: ${remainingSeconds} seconds remaining.`);
    }

    const challengerProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    const opponentProgress = ctx.db.playerProgress.identity.find(opponent);
    const challengerProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const opponentProfile = ctx.db.playerProfile.identity.find(opponent);
    if (!challengerProgress || !opponentProgress || !challengerProfile || !opponentProfile) throw new SenderError("Player profile unavailable.");
    if (cooldown) ctx.db.duelRequestCooldown.identity.update({ ...cooldown, requestedAt: ctx.timestamp });
    else ctx.db.duelRequestCooldown.insert({ identity: ctx.sender, requestedAt: ctx.timestamp });

    const startsAtMicros = ctx.timestamp.microsSinceUnixEpoch + DUEL_COUNTDOWN_MICROS;
    const endsAtMicros = startsAtMicros + DUEL_DURATION_MICROS;
    const challengerRightHandItem = equippedRightHandForProgress(challengerProgress);
    const opponentRightHandItem = equippedRightHandForProgress(opponentProgress);
    const challengerLeftHandItem = challengerRightHandItem ? "" : equippedLeftHandForProgress(challengerProgress);
    const opponentLeftHandItem = opponentRightHandItem ? "" : equippedLeftHandForProgress(opponentProgress);
    const challengerAppearance = equipmentPresentationForProgress(challengerProgress);
    const opponentAppearance = equipmentPresentationForProgress(opponentProgress);
    const challengerMaxHp = maxHealthForProgress(ctx, ctx.sender, challengerProgress);
    const opponentMaxHp = maxHealthForProgress(ctx, opponent, opponentProgress);
    const inactiveAttackRate = Number(DUEL_DURATION_MICROS) / 1_000_000 + 1;
    const insertedDuel = ctx.db.duel.insert({
      id: 0n,
      challenger: ctx.sender,
      opponent,
      status: "countdown",
      createdAt: ctx.timestamp,
      startedAt: ctx.timestamp,
      startsAtMicros,
      endsAtMicros,
      lastResolvedAt: ctx.timestamp,
      challengerOriginX: challenger.x,
      challengerOriginY: challenger.y,
      opponentOriginX: 0,
      opponentOriginY: 0,
      challengerHp: challengerMaxHp,
      challengerMaxHp,
      challengerDamage: duelDamage(ctx, ctx.sender, challengerProgress.damage),
      challengerArmor: researchedArmor(ctx, ctx.sender, challengerProgress.armor),
      challengerAttackRate: challengerRightHandItem || challengerLeftHandItem ? attackIntervalForProgress(ctx, ctx.sender, challengerProgress) : inactiveAttackRate,
      challengerRegen: researchedRegen(ctx, ctx.sender, challengerProgress.regen),
      challengerAttacks: 0,
      challengerDamageDealt: 0,
      challengerRegened: 0,
      challengerBlocked: 0,
      opponentHp: opponentMaxHp,
      opponentMaxHp,
      opponentDamage: duelDamage(ctx, opponent, opponentProgress.damage),
      opponentArmor: researchedArmor(ctx, opponent, opponentProgress.armor),
      opponentAttackRate: opponentRightHandItem || opponentLeftHandItem ? attackIntervalForProgress(ctx, opponent, opponentProgress) : inactiveAttackRate,
      opponentRegen: researchedRegen(ctx, opponent, opponentProgress.regen),
      opponentAttacks: 0,
      opponentDamageDealt: 0,
      opponentRegened: 0,
      opponentBlocked: 0,
      challengerHeadItem: challengerAppearance.headItem,
      challengerChestItem: challengerAppearance.chestItem,
      challengerFeetItem: challengerAppearance.feetItem,
      challengerRightHandItem: challengerAppearance.rightHandItem,
      challengerLeftHandItem: challengerAppearance.leftHandItem,
      opponentHeadItem: opponentAppearance.headItem,
      opponentChestItem: opponentAppearance.chestItem,
      opponentFeetItem: opponentAppearance.feetItem,
      opponentRightHandItem: opponentAppearance.rightHandItem,
      opponentLeftHandItem: opponentAppearance.leftHandItem,
      challengerName: challengerProfile.displayName,
      opponentName: opponentProfile.displayName,
      challengerGender: challengerProfile.gender,
      opponentGender: opponentProfile.gender,
    });
    ctx.db.duelResolutionSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(endsAtMicros),
      duelId: insertedDuel.id,
    });
    const nextChallenger = {
      ...challenger,
      x: DUEL_ARENA.challenger.x,
      y: DUEL_ARENA.challenger.y,
      ...playerZone(DUEL_ARENA.challenger.x, DUEL_ARENA.challenger.y),
      moving: false,
      lastInputAt: ctx.timestamp,
    };
    ctx.db.player.identity.update(nextChallenger);
    syncPlayerMotion(ctx, nextChallenger);
    syncPlayerMotionIdentity(ctx, nextChallenger);
    syncPlayerMapMarker(ctx, nextChallenger, true);
    ensureRealtimeFrameSchedules(ctx);
  },
);

export const acceptDuel = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id: _id }) => {
    requireControllingPlayer(ctx);
    throw new SenderError("Duel acceptance is no longer required.");
  },
);

export const pulseDuel = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
    const current = activeDuelFor(ctx, ctx.sender);
    if (current?.status === "countdown" || current?.status === "active" || current?.status === "finishing") resolveDuel(ctx, current);
  },
);

function applyMovementState(ctx: any, x: number, y: number, dx: number, dy: number, sequence: number) {
  const current = requireControllingPlayer(ctx);
  if (sequence <= current.lastInputSequence || ["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) return;
  if (![x, y, dx, dy].every(Number.isFinite)) throw new SenderError("Movement state values must be finite");

  const clampedX = Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, x));
  const clampedY = Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, y));
  const boundedDx = Math.max(-1, Math.min(1, dx));
  const boundedDy = Math.max(-1, Math.min(1, dy));
  const moving = boundedDx !== 0 || boundedDy !== 0;
  const facing = boundedDx < 0 ? Math.PI : boundedDx > 0 ? 0 : current.facing;
  const nextPlayer = {
    ...current,
    x: clampedX,
    y: clampedY,
    ...playerZone(clampedX, clampedY),
    facing,
    moving,
    dx: moving ? boundedDx : 0,
    dy: moving ? boundedDy : 0,
    lastInputAt: ctx.timestamp,
    lastInputSequence: sequence,
  };
  const nextMotion = syncPlayerMotion(ctx, nextPlayer);

  // Cold player rows carry presentation and zone membership. Publish only
  // start/stop endpoints, idle corrections, or zone crossings. Direction and
  // continuous coordinates travel in compact aggregate events.
  const staticStateChanged =
    current.moving !== moving ||
    current.zoneX !== nextPlayer.zoneX ||
    current.zoneY !== nextPlayer.zoneY ||
    !moving;
  if (staticStateChanged) {
    ctx.db.player.identity.update(nextPlayer);
    syncPlayerMotionIdentity(ctx, nextPlayer);
  }
  publishOrScheduleMotion(ctx, nextMotion, nextPlayer.isVisible);
}

export const updateMovementState = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), dx: t.f32(), dy: t.f32(), sequence: t.u32() },
  (ctx, { x, y, dx, dy, sequence }) => applyMovementState(ctx, x, y, dx, dy, sequence),
);

// Rollout bridge for pre-0.424 clients. Current clients never call this path.
export const syncPosition = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), facing: t.f64(), moving: t.bool(), sequence: t.u32() },
  (ctx, { x, y, facing, moving, sequence }) => {
    if (!Number.isFinite(facing)) throw new SenderError("Movement state values must be finite");
    const horizontal = Math.cos(facing);
    applyMovementState(
      ctx,
      x,
      y,
      moving && Math.abs(horizontal) >= 1e-6 ? horizontal : 0,
      moving ? Math.sin(facing) : 0,
      sequence,
    );
  },
);

function transitionPlayerMap(
  ctx: any,
  current: any,
  mapId: string,
  arrival: { x: number; y: number },
  facing = current.facing,
) {
  const nextPlayer = {
    ...current,
    mapId,
    x: arrival.x,
    y: arrival.y,
    ...playerZone(arrival.x, arrival.y),
    facing: Number.isFinite(facing) ? facing : 0,
    moving: false,
    dx: 0,
    dy: 0,
    lastInputAt: ctx.timestamp,
  };
  ctx.db.player.identity.update(nextPlayer);
  syncPlayerMotion(ctx, nextPlayer);
  syncPlayerMotionIdentity(ctx, nextPlayer);
  syncPlayerMapMarker(ctx, nextPlayer, true);
  ensureRealtimeFrameSchedules(ctx);
}

export const changeMap = spacetimedb.reducer(
  { mapId: t.string(), x: t.f64(), y: t.f64() },
  (ctx, { mapId, x, y }) => {
    const current = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
    if (!VALID_MAP_IDS.has(mapId) || mapId === current.mapId) throw new SenderError("Unsupported map destination.");
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SenderError("Portal position must be finite.");
    if (x < PLAYER_RADIUS || x > WORLD.width - PLAYER_RADIUS || y < PLAYER_RADIUS || y > WORLD.height - PLAYER_RADIUS) {
      throw new SenderError("Portal position is outside the world.");
    }
    const currentProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (mapId === BEGINNER_DESERT_MAP_ID) {
      const progress = ctx.db.playerProgress.identity.find(ctx.sender);
      if (!progress?.desertUnlocked) throw new SenderError("Defeat the Dragon before entering Beginner Desert.");
    }
    if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID && !currentProgress?.snowlandsUnlocked) {
      throw new SenderError("Defeat the Desert Spider before entering Intermediate Snowlands.");
    }
    if (mapId === ADVANCED_LAVA_WASTES_MAP_ID && !currentProgress?.lavaUnlocked) {
      throw new SenderError(`Defeat Frostclaw before entering ${MAP_DISPLAY_NAMES[ADVANCED_LAVA_WASTES_MAP_ID]}.`);
    }

    const sourcePortal = MAP_PORTALS[current.mapId as keyof typeof MAP_PORTALS]?.find((portal) => portal.destination === mapId);
    if (!sourcePortal) throw new SenderError("Maps are not connected.");
    // Movement is client-authoritative. Validate the coordinate from this
    // discrete portal action instead of a potentially one-heartbeat-old
    // player_motion sample, then move to the destination atomically.
    const portalDistance = Math.hypot(x - sourcePortal.x, y - sourcePortal.y);
    if (portalDistance > MAP_PORTAL_USE_RANGE) throw new SenderError("Move closer to the portal.");

    const arrival = MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
    transitionPlayerMap(ctx, current, mapId, arrival);
  },
);

export const setSpeed = spacetimedb.reducer(
  { speed: t.f32() },
  (ctx, { speed }) => {
    const current = requireControllingPlayer(ctx);

    // Speed remains server-authoritative. Move Speed research is a legitimate
    // client-side movement multiplier, so validate its exact server record
    // instead of treating every researched speed as a malformed packet.
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    const bootsEquipped = progress
      ? equippedFeetForProgress(progress) === TRAILBLAZER_BOOTS
      : current.feetItem === TRAILBLAZER_BOOTS;
    const moveSpeedRank = research?.moveSpeed ?? 0;
    const expectedSpeed = speedForBoots(bootsEquipped) * (1 + moveSpeedRank * 0.02);
    if (Math.abs(speed - expectedSpeed) >= 0.01) throw new SenderError("Unsupported player speed");

    ctx.db.player.identity.update({
      ...current,
      speed,
      lastInputAt: ctx.timestamp,
    });
  },
);
