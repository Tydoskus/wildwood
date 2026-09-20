import { auditPrivilegedAccess, denyPrivilegedAccess } from "./privileged-access-audit";
import { defeatSessionRestriction, defeatRestrictionError, requireAllowedDefeatSession, restrictDefeatSession, suspendPlayerAccount } from "./defeat-session";
import { findDeveloperTravelTarget, readDeveloperTravelTarget, readShardTravelPosition } from "./developer-travel";
import { mapBalanceVersion, mapBalanceHead, playerMapBalance, balanceEditorState, saveMapBalance, pinMapBalance, pinnedMapBalance } from "./map-balance";
import { resolveMapBalance, validateBalanceSettings } from "../../shared/map-balance";
import { accountDeletionRequest, queueAccountDeletion } from "./account-deletion";
import { mailboxEquipment, deliverEquipmentMail } from "./mailbox-equipment";
import { gearClaimSpace } from "../../shared/mailbox-equipment";
import { duelWireAccess, syncDuelWireAccess, DUEL_WIRE_FILTER, DUEL_REPLAY_WIRE_FILTER } from "./duel-wire-access";
import { nameChangeStatus } from "../../shared/name-change";
import { validPatreonRedirect } from "./patreon-url";
import { isValidProfileIcon } from "../../shared/profile-icons";
import { releaseNotice, releaseAcknowledgement, writeReleaseWindow, acknowledgeReleaseWindow } from "./release-control";
import { PERSONAL_BOSS_COMBAT, personalBossDefinition } from "../../shared/personal-bosses";
import { playerMultiplayerPreference, writeMultiplayerPreference } from "./multiplayer-preference";
import { enemyDefeatBudget, bossDefeatWindow, bossMapDefeatWindow, acceptEnemyDefeats, beginBossTimeBudget, enemyDefeatReview } from "./enemy-defeats";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import { LOADOUT_FIELDS } from "../../shared/combat-progress";
import { chatHeartAllowance, chatReactionSummary, playerChatHearts, reactionCountsFor, chatReaction, readChatReactions, setChatReaction, removeMessageReactions, removeAccountReactions } from "./chat-reactions";
import { regularEnemyLootCursor, rollRegularEnemyLoot } from "./regular-enemy-loot";
import { BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS } from "../../shared/items";
import { playerOnboarding, advanceOnboarding, needsOnboarding } from "./onboarding";
import { canDestroyEquipment } from "../../shared/items";
import { deliverDisconnectCompensation, deliverCombatUpdateGift, deliverOutageCompensation, announceOutageCompensation, deliverAutofarmTestGift } from "./disconnect-compensation";
import { connectionDiagnosticTables, recordConnectionDiagnostics, cleanupConnectionDiagnostics } from "./connection-diagnostics";
import { moderationTables, recordModerationAction, readModerationHistory } from "./moderation-history";
import { mailboxLetter, mailboxReceipt, mailboxEntry, mailboxForPlayer, mailboxEntryV2, mailboxForPlayerV2, publishMailboxLetter, updateMailboxReceipt } from "./mailbox";
import { rollbackPlayerProgression } from "./player-progression-rollback";
import { playerItemGift, deliverAlphaTesterGifts, claimItemGift } from "./item-gifts";
import { moderateReportedMessage } from "./chat-report-moderation";
import { PLAYER_SKIN_TONES } from "../../shared/player-skin-tones";
import { leaderboardPageTables, writeLeaderboardPages, readLeaderboardWindow, readLeaderboardPage } from "./leaderboard-pages";
import { publicChatCursor, updatePublicChatCursor, readPublicChatPage } from "./public-chat-history";
import { createKillGems } from "./kill-gems";
import { generateMap, generatedBossStats, isProceduralMap, proceduralMapId, PROCEDURAL_ENTRY_MAP, PROCEDURAL_ENTRY_BOSS } from "../../shared/procedural-maps";
import { proceduralMapTables, proceduralBossKey, clearProceduralProgress, generatedMapUnlocked, ensureProceduralBoss } from "./procedural-maps";
import { ingestStoreEvent } from "./gem-store-events";
import { gemPurchaseTables } from "./gem-purchase-tables";
import { patreonTables } from "./patreon-tables";
import { beginPatreonLink as beginSupporterLink, refreshPatreon, patreonStatus, unlinkPatreon, patreonCallback } from "./patreon";
import { requestPatreonSupport } from "./patreon-support";
import { DEVELOPER_IDENTITY as DEVELOPER_IDENTITY_HEX } from "../../shared/developer-identity";
import { allowedAvatarFrame } from "../../shared/avatar-frames";
import { createGemPurchaseService } from "./gem-purchase-service";
import { rescaleEndgameProgress } from "../../shared/endgame-power-rescale";
import { CAMPAIGN_UNLOCK_FIELDS, equipmentMapRequirement } from "../../shared/equipment-access";
import { HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN, HOME_TRAVEL_PORTAL, HOME_BENCH_POSITION } from "../../shared/home";
import { insertSnapshotRow, updateSnapshotRow, deleteSnapshotRow } from "./shard-snapshot-writes";
import { decodeShardSnapshot, encodeShardSnapshot } from "../../shared/shard-wire";
import { coordinateShard, validateCoordinatorConfig } from "./shard-coordinator";
import { mapShardingTables, mapShardRouteType, rootShardingEnabled, isMapShard, assignMapShard, releaseMapShard, validateShardMap, syncMapShardRoute, syncMapShardRoutesForShard } from "./map-sharding";
import { MAP_SHARD_CAPACITY } from "../../shared/map-sharding";
import { compressLegacyMapPower } from "../../shared/map-power-rescale";
import { createPlayerMotionFrameSampler } from "../../shared/player-motion-sample";
import { schema, SenderError, Router, table, t, type InferSchema, type ReducerCtx, type ViewCtx } from "spacetimedb/server";
import { Identity, ScheduleAt, Timestamp } from "spacetimedb";
import { attackForestPrototype, beginForestPrototype } from "./forest-reward-prototype";
import { portalCutsceneBit, unlockedPortalCutsceneMask } from "../../shared/portal-cutscenes";
import { playerBlockKey, playerReportValidationError } from "../../shared/player-safety";
import {
  RESEARCH_DEFINITIONS,
  isResearchId,
  researchDurationMs,
  researchPrerequisitesForNextRank,
  researchStatRewardMultiplier,
  type ResearchId,
} from "../../shared/research";
import { VIRTUAL_PLAYER_LIMIT, isVirtualPlayerTicket } from "../../shared/virtual-player-load-test";
import { effectivePlayerPower, effectivePlayerPowerStats, legacyU32Power, playerPowerForStats } from "../../shared/player-power";
import {
  PLAYER_GENDER_UNSET,
  isSelectedPlayerGender,
} from "../../shared/player-gender";
import { syncDisplayNameHistory } from "./display-name-history";
import { isPublicDisplayNameAllowed, moderatePublicChatMessage, chatModerationReason, displayNameModerationReason, MODERATION_RULE_VERSION } from "./chat-moderation";
import { isChatReportReason } from "../../shared/chat-report";
import { TERMS_VERSION, isEligiblePlayerAgeBand } from "../../shared/legal";
import { nextChatReportRateState } from "./chat-report-rate-limit";
import {
  STARTUP_TELEMETRY_MAX_BATCH,
  normalizeStartupTelemetrySample,
} from "../../shared/startup-telemetry";
import {
  STARTUP_TELEMETRY_MAX_ROWS,
  STARTUP_TELEMETRY_RATE_WINDOW_MICROS,
  nextStartupTelemetryRateState,
  startupTelemetryIdsToDelete,
} from "./startup-telemetry-policy";
import {
  dragonBossTables,
  frostclawBossTables,
  gloomrootBossTables,
  koiShogunBossTables,
  magmaliskBossTables,
  miremawBossTables,
  prismshellBossTables, ironhornBossTables, dreadreaperBossTables, voltwardenBossTables, gravebloomBossTables, aegisPrimeBossTables,
  spiderBossTables,
  tempestKirinBossTables,
  tidewyrmBossTables,
} from "./boss-tables";
import { createBossCombat, PRISMSHELL_ID } from "./boss-combat";
import { createModuleMigrations } from "./module-migrations";
import {
  createPresenceRuntime, MOTION_DETAIL_FRAME_INTERVAL_MICROS, MAP_FRAME_INTERVAL_MICROS, playerZone,
  playerWithMotion, stoppedMotionFields, adjustPlayerMotionMapState, syncPlayerMotion, syncPlayerMotionIdentity,
  ensureMotionDetailFrameSchedule, ensureRealtimeFrameSchedules, motionSample, persistWorldLocation,
  syncPlayerMapMarker, ensureWorldStatus, reconcileOnlinePlayers,
} from "./presence-runtime";
import { createDuelRuntime, activeDuelFor, clearExpiredDuelRequests } from "./duel-runtime";
import { createAccountLifecycle, hasSpacetimeAuthAccount, clearExpiredAccountLinks, dailyGemBonusClaimReference } from "./account-lifecycle";
import {
  compressLegacyProgressionOutlier,
  compressLegacyTopFiveProgression,
  correctLegacyTopFiveV5Progression,
  rebalanceLegacyDamageHealth,
} from "../../shared/progression-balance";
import {
  DAILY_LOGIN_GEM_BONUS,
  MAX_INVENTORY_SLOT_CAPACITY,
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  gemBalanceAfter,
  inventorySlotCapacity,
  inventorySlotUnlockCost,
  itemUpgradeSpeedUpGemCost,
  researchSpeedUpGemCost,
} from "../../shared/gems";
import { HIDDEN_COSMETIC_ITEM_ID, isHiddenCosmeticItem, resolveEquipmentAppearance } from "../../shared/equipment-appearance";
import { socialTables } from "./social-tables";
import { createSocialService, socialSnapshot, visibleSocialMessages, latestSocialMessages, socialHistoryPage, pruneExpiredSocialMessages } from "./social-service";
import { guildTables } from "./guild-tables";
import { createGuildService } from "./guild-service";
import { GUILD_CREATION_MIN_POWER } from "../../shared/guilds";
import { guildWeaponRange } from "../../shared/guild-combat";
import type { DuelFighter } from "../../shared/duel-combat";
import {
  BASIC_PAPER_HAT,
  canonicalItemId,
  DEVELOPER_ITEM_IDS,
  EQUIPMENT_DROP_ITEM_IDS,
  equipmentDamage,
  equipmentMaxHealth,
  equipmentRegeneration,
  itemDefinition,
  isUpgradeableItem,
  itemFitsEquipmentSlot,
  itemUpgradeDurationMs,
  MAX_FOREST_ITEM_COUNT,
  MAX_ITEM_UPGRADE_LEVEL,
  normalizeItemUpgradeLevel,
  STARTER_BOW,
  STARTER_STONE,
  STARTER_ITEM_IDS,
  SUPERIOR_GOLDEN_HELMET,
  TRAILBLAZER_BOOTS,
  WOODEN_ARMOR,
} from "../../shared/items";
import {
  compactPlayerMapSamples,
  encodePlayerMapFrame,
  encodePlayerMotionFrame,
  type PlayerMapSample,
  type PlayerMotionSample,
} from "../../shared/player-motion-frame";
import { PLAYER_MOTION_INTEREST_LIMIT } from "../../shared/player-motion-interest";
import {
  ATTACK_BALANCE_VERSION,
  ADVANCED_LAVA_WASTES_MAP_ID,
  BOSS_REWARD_CLAIM_BITS,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  effectivePlayerMovementSpeed,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MAP_DISPLAY_NAMES,
  MAP_IDS,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID, NEON_BASTION_MAP_ID, VERDANT_CATACOMBS_MAP_ID, ION_CITADEL_MAP_ID,
  MAX_ARMOR,
  MAX_MOVEMENT_SPEED_OVERRIDE,
  MAX_PLAYER_STAT,
  MIN_ATTACK_INTERVAL,
  movementSpeedsMatch,
  NAME_ADJECTIVES,
  NAME_CREATURES,
  PLAYER_BASE_HP,
  PLAYER_BASE_DAMAGE,
  PLAYER_BASE_REGEN,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPAWN,
  PLAYER_SPEED,
  playerBaseMovementSpeed,
  PROTOCOL_VERSION,
  COMPATIBLE_PROTOCOL_VERSIONS,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../shared/rules";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../shared/map-editor-overrides";

// Cached clients parse these exact wire messages. Current clients rebrand them
// for display; changing them would break reconnects and account linking in old tabs.
const LEGACY_CLIENT_ERRORS = {
  protocolUpdate: "Wildwood updated. Refresh to continue.",
  missingPresence: "Enter Wildwood first.",
  existingAccountProgress: "This account already has Wildwood progress.",
} as const;

const WORLD = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
const VALID_MAP_IDS = { has: (id: string) => MAP_IDS.includes(id) || id === HOME_EXTERIOR_MAP_ID || isProceduralMap(id) };
const LEGACY_FROSTWIND_EXPANSE_MAP_ID = "frostwind_expanse";

function canonicalMapId(mapId: string) {
  return mapId === LEGACY_FROSTWIND_EXPANSE_MAP_ID ? INTERMEDIATE_SNOWLANDS_MAP_ID : mapId;
}
const DEVELOPER_IDENTITY = new Identity(DEVELOPER_IDENTITY_HEX);
// Maincloud database owner. CLI maintenance calls run as this identity, while
// in-game developer actions run as DEVELOPER_IDENTITY above.
const DATABASE_OWNER_IDENTITY_HEX = "c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79";
const DEFAULT_MAP_PORTALS = {
  [TUTORIAL_FOREST_MAP_ID]: [{ x: 190, y: 385, destination: BEGINNER_DESERT_MAP_ID }],
  [BEGINNER_DESERT_MAP_ID]: [
    { x: 360, y: 617, destination: TUTORIAL_FOREST_MAP_ID },
    { x: 580, y: 617, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
  ],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: [
    { x: 360, y: 617, destination: BEGINNER_DESERT_MAP_ID },
    { x: 580, y: 617, destination: ADVANCED_LAVA_WASTES_MAP_ID },
  ],
  [ADVANCED_LAVA_WASTES_MAP_ID]: [
    { x: 360, y: 617, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
    { x: 580, y: 617, destination: INFERNAL_DEPTHS_MAP_ID },
  ],
  [INFERNAL_DEPTHS_MAP_ID]: [
    { x: 360, y: 617, destination: ADVANCED_LAVA_WASTES_MAP_ID },
    { x: 580, y: 617, destination: WATER_REACH_MAP_ID },
  ],
  [WATER_REACH_MAP_ID]: [
    { x: 360, y: 617, destination: INFERNAL_DEPTHS_MAP_ID },
    { x: 580, y: 617, destination: SAMURAI_GARDEN_MAP_ID },
  ],
  [SAMURAI_GARDEN_MAP_ID]: [
    { x: 360, y: 617, destination: WATER_REACH_MAP_ID },
    { x: 580, y: 617, destination: CLOUDSPIRE_MAP_ID },
  ],
  [CLOUDSPIRE_MAP_ID]: [
    { x: 360, y: 617, destination: SAMURAI_GARDEN_MAP_ID },
    { x: 580, y: 617, destination: MOONFEN_MAP_ID },
  ],
  [MOONFEN_MAP_ID]: [
    { x: 360, y: 617, destination: CLOUDSPIRE_MAP_ID },
    { x: 580, y: 617, destination: CRYSTAL_HOLLOWS_MAP_ID },
  ],
  [CRYSTAL_HOLLOWS_MAP_ID]: [{ x: 360, y: 617, destination: MOONFEN_MAP_ID }, { x: 580, y: 617, destination: CLOCKWORK_RUINS_MAP_ID }], [CLOCKWORK_RUINS_MAP_ID]: [{ x: 360, y: 617, destination: CRYSTAL_HOLLOWS_MAP_ID }, { x: 580, y: 617, destination: DUSKFALL_ORCHARD_MAP_ID }], [DUSKFALL_ORCHARD_MAP_ID]: [{ x: 360, y: 617, destination: CLOCKWORK_RUINS_MAP_ID }, { x: 580, y: 617, destination: NEON_BASTION_MAP_ID }], [NEON_BASTION_MAP_ID]: [{ x: 360, y: 617, destination: DUSKFALL_ORCHARD_MAP_ID }, { x: 580, y: 617, destination: VERDANT_CATACOMBS_MAP_ID }], [VERDANT_CATACOMBS_MAP_ID]: [{ x: 360, y: 617, destination: NEON_BASTION_MAP_ID }, { x: 580, y: 617, destination: ION_CITADEL_MAP_ID }], [ION_CITADEL_MAP_ID]: [{ x: 360, y: 617, destination: VERDANT_CATACOMBS_MAP_ID }],
} as const;
const DEFAULT_MAP_ARRIVALS = {
  [TUTORIAL_FOREST_MAP_ID]: { x: 190, y: 540 },
  [BEGINNER_DESERT_MAP_ID]: { x: 360, y: 770 },
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: { x: 580, y: 770 },
  [ADVANCED_LAVA_WASTES_MAP_ID]: { x: 580, y: 770 },
  [INFERNAL_DEPTHS_MAP_ID]: { x: 580, y: 770 },
  [WATER_REACH_MAP_ID]: { x: 580, y: 770 },
  [SAMURAI_GARDEN_MAP_ID]: { x: 580, y: 770 },
  [CLOUDSPIRE_MAP_ID]: { x: 580, y: 770 },
  [MOONFEN_MAP_ID]: { x: 580, y: 770 },
  [CRYSTAL_HOLLOWS_MAP_ID]: { x: 580, y: 770 }, [CLOCKWORK_RUINS_MAP_ID]: { x: 580, y: 770 }, [DUSKFALL_ORCHARD_MAP_ID]: { x: 580, y: 770 }, [NEON_BASTION_MAP_ID]: { x: 580, y: 770 }, [VERDANT_CATACOMBS_MAP_ID]: { x: 580, y: 770 }, [ION_CITADEL_MAP_ID]: { x: 580, y: 770 },
} as const;
const MAP_PORTALS: Record<string, { x: number; y: number; destination: string }[]> = Object.fromEntries(
  Object.entries(DEFAULT_MAP_PORTALS).map(([mapId, portals]) => {
    const edited = MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.portals;
    return [mapId, edited?.length
      ? edited.map((portal) => ({
        x: portal.x,
        y: portal.y - portal.height * .32,
        destination: portal.destination,
      }))
      : portals.map((portal) => ({ ...portal }))];
  }),
);
const MAP_ARRIVALS: Record<string, { x: number; y: number }> = Object.fromEntries(
  Object.entries(DEFAULT_MAP_ARRIVALS).map(([mapId, arrival]) => [
    mapId,
    MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.arrival ?? arrival,
  ]),
);
const MAP_PORTAL_USE_RANGE = 125;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 3_000_000n;
const CHAT_HISTORY_RETENTION_MICROS = 86_400_000_000n;
const DUEL_REPLAY_RETENTION_MICROS = CHAT_HISTORY_RETENTION_MICROS;
const MAINTENANCE_INTERVAL_MICROS = 60_000_000n;
const LEADERBOARD_REFRESH_INTERVAL_MICROS = 900_000_000n;
const VIRTUAL_PLAYER_RUN_LIFETIME_MICROS = 3_600_000_000n;
const LEADERBOARD_REFRESH_VERSION = 11;
// Shared-boss combat bodies live in boss-combat.ts; the reducers below keep
// calling the same names. Placed after WORLD, the one const the factory reads.
const {
  maximumBossCombatForProgress, ensureDragonBoss, ensureSpiderBoss, ensureFrostclawBoss,
  ensureMagmaliskBoss, ensureGloomrootBoss, ensureTidewyrmBoss, ensureKoiShogunBoss,
  ensureTempestKirinBoss, ensureMiremawBoss, ensurePrismshellBoss, ensureIronhornBoss,
  ensureDreadreaperBoss, ensureVoltwardenBoss, ensureGravebloomBoss, ensureAegisPrimeBoss,
  regenerateIdleBosses, clearSpiderCombatRows, rewardSpiderContributor, clearFrostclawCombatRows,
  rewardFrostclawContributor, clearMagmaliskCombatRows, rewardMagmaliskContributor,
  clearGloomrootCombatRows, rewardGloomrootContributor, clearTidewyrmCombatRows,
  clearKoiShogunCombatRows, clearTempestKirinCombatRows, clearMiremawCombatRows,
  clearPrismshellCombatRows, clearIronhornCombatRows, clearDreadreaperCombatRows,
  clearVoltwardenCombatRows, clearGravebloomCombatRows, clearAegisPrimeCombatRows,
  rewardTidewyrmContributor, rewardKoiShogunContributor, rewardTempestKirinContributor,
  rewardMiremawContributor, rewardPrismshellContributor, rewardIronhornContributor,
  rewardDreadreaperContributor, rewardVoltwardenContributor, rewardGravebloomContributor,
  rewardAegisPrimeContributor, clearDragonCombatRows, rewardDragonContributor, applyDragonDamage,
  applySpiderDamage, applyFrostclawDamage, applyMagmaliskDamage, applyGloomrootDamage,
  applyTidewyrmDamage, applyKoiShogunDamage, applyTempestKirinDamage, applyMiremawDamage,
  applyPrismshellDamage, applyIronhornDamage, applyDreadreaperDamage, applyVoltwardenDamage,
  applyGravebloomDamage, applyAegisPrimeDamage, applyProceduralBossHit,
} = createBossCombat({
  WORLD, requireControllingPlayer, requireMapWorkload, activeDuelFor, playerWithMotion,
  syncPlayerMotionIdentity, powerFieldsForProgress, attackIntervalForProgress, playerOwnsItem,
  publishItemDrop, restoreItemToProgress, researchedDamage, inventoryForProgress,
  equippedRightHandForProgress, equippedLeftHandForProgress, writeProgressAndPresentation,
});
// Duel bodies live in duel-runtime.ts; the duel reducers and the equipment
// snapshot below keep calling the same names. Every dep is a hoisted function,
// so this only has to precede the lifecycle factory that borrows finishDuel.
const { duelDamage, finishDuel, resolveDuel, startDuel, publishDuelReplay } = createDuelRuntime({
  requireControllingPlayer, isSupportedProtocol, sameIdentity, playersBlocked, isVirtualPlayer,
  insertChatMessage, researchedDamage, researchedArmor, researchedRegen, maxHealthForProgress,
  attackIntervalForProgress, equippedRightHandForProgress, equippedLeftHandForProgress,
  equipmentPresentationForProgress,
});
const UPGRADE_BENCH_USE_RANGE = 75;
const UPGRADE_BENCH_SLOT_ONE = 1;
const UPGRADE_BENCH_SLOT_TWO = 2;

// One-time data migrations live in module-migrations.ts; connect and
// runMaintenance keep calling runPendingModuleMigrations by name. Placed after
// the boss factory and the bench slot consts, the last consts it reads.
const { runPendingModuleMigrations, migratePlayerBalance } = createModuleMigrations({
  MAP_ARRIVALS, MAINTENANCE_INTERVAL_MICROS, UPGRADE_BENCH_SLOT_ONE, inventoryForProgress,
  equippedRightHandForProgress, equippedLeftHandForProgress, equippedFeetForProgress,
  equipmentPresentationForProgress, forestItemCountForProgress, cancelActiveItemUpgrade,
  itemUpgradeLevelFor, effectiveMovementSpeedForProgress, powerFieldsForProgress,
  effectivePowerForProgress, effectivePowerStatsForProgress, playerWithMotion,
  syncPlayerMotionIdentity, persistWorldLocation, transitionPlayerMap, refreshLeaderboard,
  markPlayerBalanceCurrent, playerBalanceProgress, samePlayerProgressValues,
  resultIncludesContributor, contributedToLatestPrismshell, isVirtualPlayer, sameIdentity,
  applyGemBalanceChange, ensureDragonBoss, ensureSpiderBoss, ensureFrostclawBoss,
  ensureMagmaliskBoss, ensureGloomrootBoss, ensureTidewyrmBoss, ensureKoiShogunBoss,
  ensureTempestKirinBoss, ensureMiremawBoss, ensurePrismshellBoss, ensureIronhornBoss,
  ensureDreadreaperBoss, ensureVoltwardenBoss, ensureGravebloomBoss, ensureAegisPrimeBoss,
  ensureWorldStatus, ensureMaintenanceSweepSchedule,
});

// Exact-own lifecycle and physical compatibility row. Current clients never
// subscribe to remote rows; continuous coordinates live in private analytical
// anchors and remote presentation lives in playerMotionIdentity below.
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
    vx: t.f32().default(0),
    vy: t.f32().default(0),
    simulationTick: t.u32().default(0),
    motionEpoch: t.u32().default(0),
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
    vx: t.f32().default(0),
    vy: t.f32().default(0),
    simulationTick: t.u32().default(0),
    motionEpoch: t.u32().default(0),
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

// Stable map-wide presentation cache. Network ids keep identity strings,
// appearance, equipment, and visible stats out of every hot movement frame.
// Zone columns/indexes remain only for non-destructive schema compatibility.
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
    // Stable map-wide presentation. These fields change only when the player's
    // visible stats or equipment change; movement never republishes them.
    speed: t.f32().default(PLAYER_SPEED),
    powerLevel: t.f64().default(95),
    feetItem: t.string().default(""),
    headItem: t.string().default(BASIC_PAPER_HAT),
    chestItem: t.string().default(""),
    rightHandItem: t.string().default(STARTER_STONE),
    leftHandItem: t.string().default(""),
  },
);

// Inert event table retained for schema compatibility. Current publishers use
// only the two bounded packed tables below.
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

// One private, bounded interest set per controlling player. Clients derive it
// from the all-map position snapshot, so the server publisher performs O(NK)
// primary-key lookups instead of an O(N²) nearest-neighbor scan.
const playerMotionInterest = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    networkIds: t.array(t.u32()),
  },
);

// Each subscriber receives one packed frame addressed to its identity. The
// recipient predicate is applied before delivery, so unselected map actors
// are never serialized or billed to that client.
const playerMotionDetailFrame = table(
  {
    public: true,
    event: true,
    indexes: [{ accessor: "byRecipient", algorithm: "btree", columns: ["recipient"] as const }],
  },
  {
    recipient: t.identity(),
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

// Confirmed damage for the attacking player's hit-number presentation.
const bossHitResult = table(
  { public: true, event: true, indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }] },
  { identity: t.identity(), mapId: t.string(), x: t.f64(), y: t.f64(), damage: t.f64(), critical: t.bool() },
);

// Inert schema-compatibility table. Boss attack presentation is reconstructed
// from the encounter seed, authoritative player motion, and saved combat stats;
// deleting this populated table would require a destructive database publish.
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

// One authoritative death event lets same-map clients play the full presentation
// locally without turning health into continuously synchronized public state.
const playerDeathFrame = table(
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
    playerX: t.f64(),
    playerY: t.f64(),
    facing: t.f64(),
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

// Paid currency is private at rest. Clients receive only their own row through
// my_gem_wallet, while server reducers remain the sole balance writers.
const playerGemWallet = table(
  { name: "player_gem_wallet", public: false },
  {
    identity: t.identity().primaryKey(),
    balance: t.u64(),
    revision: t.u64(),
    updatedAt: t.timestamp(),
  },
);

// Every credit and debit is retained for reconciliation, refunds, chargebacks,
// and idempotent store/webhook processing. External references are globally
// unique after they are prefixed with their issuing platform.
const gemTransaction = table(
  {
    name: "gem_transaction",
    public: false,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    delta: t.i64(),
    balanceAfter: t.u64(),
    kind: t.string(),
    note: t.string(),
    externalReference: t.string().unique(),
    createdAt: t.timestamp(),
  },
);

// Private claim state lets the signed-in player see whether today's reward is
// ready without exposing currency activity or relying on the browser clock.
const dailyGemBonus = table(
  { name: "daily_gem_bonus", public: false },
  {
    identity: t.identity().primaryKey(),
    claimableDayKey: t.string(),
    lastClaimedDayKey: t.string(),
    claimCycle: t.u64(),
    revision: t.u64(),
    updatedAt: t.timestamp(),
  },
);

// Row presence means the already-credited one-time apology still needs to be
// shown. Keeping presentation state separate from the ledger makes dismissal
// retryable without ever crediting the gift twice.
const balanceApologyNotice = table(
  { name: "balance_apology_notice", public: false },
  {
    identity: t.identity().primaryKey(),
    amount: t.u64(),
    createdAt: t.timestamp(),
  },
);

// Permanent paid Upgrade Bench capacity is private account data. Slot one is
// always available; this row exists only after slot two has been purchased.
const playerUpgradeBench = table(
  { name: "player_upgrade_bench", public: false },
  {
    identity: t.identity().primaryKey(),
    secondSlotUnlocked: t.bool(),
    updatedAt: t.timestamp(),
  },
);

// Bag expansion is isolated from the established Upgrade Bench schema so it
// can roll out additively without rewriting any existing paid-unlock rows.
const playerInventoryCapacity = table(
  { name: "player_inventory_capacity", public: false },
  {
    identity: t.identity().primaryKey(),
    slotsUnlocked: t.u32(),
    updatedAt: t.timestamp(),
  },
);

const playerCutsceneHistory = table(
  { name: "player_cutscene_history", public: false },
  { identity: t.identity().primaryKey(), seenMask: t.u32(), generation: t.u32() },
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
    // Zero derives speed from stat equipment. Positive values are durable,
    // developer-authored base-speed overrides and cannot be supplied by saves.
    speedOverride: t.f32().default(0),
    // Appended default preserves existing rows while Magmalisk now owns the
    // permanent unlock for the next map.
    infernalUnlocked: t.bool().default(false),
    // Gloomroot owns the additive unlock for Water Reach. The default keeps
    // every existing progress row migration-safe.
    waterUnlocked: t.bool().default(false),
    // Tidewyrm owns the additive unlock for Samurai Garden. Keep new progress
    // columns appended so deployed PlayerProgress row order stays stable.
    samuraiUnlocked: t.bool().default(false),
    // Koi Shogun owns the additive unlock for Cloudspire.
    cloudspireUnlocked: t.bool().default(false),
    // Tempest Kirin owns the additive unlock for Moonfen.
    moonfenUnlocked: t.bool().default(false),
    // Append-only migration; only Miremaw's server-owned reward opens this map.
    crystalHollowsUnlocked: t.bool().default(false),
    // Append-only clear ledger. The bit records that a boss has been cleared
    // while preserving old save rows; every clear pays the full authored reward.
    bossRewardClaims: t.u32().default(0),
    // New region gates must stay after every previously published column.
    clockworkRuinsUnlocked: t.bool().default(false),
    duskfallOrchardUnlocked: t.bool().default(false),
    neonBastionUnlocked: t.bool().default(false), verdantCatacombsUnlocked: t.bool().default(false), ionCitadelUnlocked: t.bool().default(false),
  },
);

// Reconnect coordinates are private. Keeping them outside public profile
// progress prevents offline or invisible players from leaking exact locations.
const homeReturnLocation = table({ name: "home_return_location", public: false }, {
  identity: t.identity().primaryKey(), mapId: t.string(), x: t.f64(), y: t.f64(), facing: t.f32(),
});

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

// A running job owns the item until it completes or is canceled. The paused
// and remaining fields stay for additive-schema compatibility with v0.476;
// new jobs never enter a paused state.
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

// Kept separate from the legacy identity-keyed slot-one table so adding a
// concurrent queue is an additive, data-preserving schema migration.
const activeItemUpgradeSlotTwo = table(
  { name: "active_item_upgrade_slot_two", public: true },
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

// Kill credit toward the next gem. Private: the client only ever sees the
// resulting wallet change and the drop event below.
const gemKillProgress = table(
  { name: "gem_kill_progress", public: false },
  { identity: t.identity().primaryKey(), credit: t.u64() },
);

// One row per player, bumped on each grant, so the client can pop the gem the
// way it pops an item drop. The identity key is also the index the client's
// per-player subscription uses.
const playerGemDrop = table(
  { name: "player_gem_drop", public: true, event: true },
  { identity: t.identity().primaryKey(), amount: t.u32(), sequence: t.u64(), droppedAt: t.timestamp() },
);

// Shared periodic ranking snapshot. Clients fetch only server-selected rank
// windows; this table stays outside all normal client subscriptions.
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

// Legal acceptance is private and stores only the self-declared age band,
// never a birthday or exact age. The version makes renewed acceptance explicit
// whenever the published Terms materially change.
const playerLegalConsent = table(
  { name: "player_legal_consent", public: false },
  {
    identity: t.identity().primaryKey(),
    termsVersion: t.string(),
    ageBand: t.u8(),
    acceptedAt: t.timestamp(),
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

// Durable pre-conversion stats for recovery/audit. Never deleted by rescaling.
const playerPowerRebaseBackup = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    version: t.u32(),
    maxHp: t.f32(), damage: t.f32(), armor: t.f32(), regen: t.f32(), attackRate: t.f32(),
    beforePower: t.f64(), afterPower: t.f64(),
    recordedAt: t.timestamp(),
  },
);

// Separate v8 archive retains the original v7 recovery records.
const playerEndgameRebaseBackup = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    maxHp: t.f32(), damage: t.f32(), armor: t.f32(), regen: t.f32(), attackRate: t.f32(),
    beforePower: t.f64(), afterPower: t.f64(),
    recordedAt: t.timestamp(),
  },
);

// Separate v9 archive: retain the original values even after future migrations.
const playerEndlessRebaseBackup = table({ public: false }, {
  identity: t.identity().primaryKey(),
  maxHp: t.f32(), damage: t.f32(), armor: t.f32(), regen: t.f32(), attackRate: t.f32(),
  beforePower: t.f64(), afterPower: t.f64(), recordedAt: t.timestamp(),
  progressJson: t.string().default(""), contextJson: t.string().default(""), earnedSeconds: t.f64().default(0),
});

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

const presenceChatCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    lastLoginAtMicros: t.u64(),
    lastLeaveAtMicros: t.u64(),
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

// Clients read the public page through latest_chat_messages_with_reactions and
// the history procedure, never the table, so it carries no client sync cost.
// The indexes serve the sweep, account merge/erasure, and guild replay lookups
// that used to scan every message.
const chatMessage = table(
  {
    public: false,
    indexes: [
      { accessor: "bySender", algorithm: "btree", columns: ["sender"] as const },
      { accessor: "byGuildReplay", algorithm: "btree", columns: ["guildReplayKey"] as const },
    ],
  },
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
    moderated: t.bool().default(false),
    replyToMessageId: t.u64().default(0n),
    replyToSenderName: t.string().default(""),
    replyToMessage: t.string().default(""),
    guildReplayKey: t.string().default(""),
  },
);

// Message reports are intentionally private: ordinary clients never subscribe
// to moderation evidence or learn who reported another player.
const chatMessageReport = table(
  {
    public: false,
    indexes: [
      { accessor: "byReporterMessage", algorithm: "btree", columns: ["reporter", "messageId"] as const },
      { accessor: "byStatus", algorithm: "btree", columns: ["status"] as const },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    reporter: t.identity(),
    reporterName: t.string(),
    accused: t.identity(),
    senderName: t.string(),
    messageId: t.u64(),
    message: t.string(),
    messageModerated: t.bool(),
    sentAt: t.timestamp(),
    reason: t.string(),
    status: t.string(),
    reportedAt: t.timestamp(),
    replyToSenderName: t.string().default(""),
    replyToMessage: t.string().default(""),
  },
);

// Personal safety data is never publicly subscribable.
const playerBlock = table(
  { name: "player_block", public: false, indexes: [
    { accessor: "byOwner", algorithm: "btree", columns: ["owner"] as const },
    { accessor: "byTarget", algorithm: "btree", columns: ["target"] as const },
  ] },
  { key: t.string().primaryKey(), owner: t.identity(), target: t.identity(), targetName: t.string() },
);

const playerReport = table(
  { name: "player_report", public: false, indexes: [
    { accessor: "byReporterTarget", algorithm: "btree", columns: ["reporter", "target"] as const },
  ] },
  {
    id: t.u64().primaryKey().autoInc(), reporter: t.identity(), reporterName: t.string(),
    target: t.identity(), targetName: t.string(), reason: t.string(), note: t.string(),
    status: t.string(), reportedAt: t.timestamp(),
  },
);

// One shared row per reporter bounds both message and profile reports.
const chatMessageReportRateLimit = table(
  { public: false },
  {
    reporter: t.identity().primaryKey(),
    windowStartedAt: t.timestamp(),
    reportCount: t.u8(),
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

// Operational startup samples are intentionally anonymous at rest. The
// private rate row temporarily retains sender identity only to bound abuse.
const startupTelemetryEvent = table(
  { name: "startup_telemetry_event", public: false },
  {
    id: t.u64().primaryKey().autoInc(),
    stage: t.string(),
    outcome: t.string(),
    issueCode: t.string(),
    durationMs: t.u32(),
    attempt: t.u16(),
    clientVersion: t.string(),
    protocolVersion: t.u32(),
    connectivity: t.string(),
    recordedAt: t.timestamp(),
  },
);

const startupTelemetryRateLimit = table(
  { name: "startup_telemetry_rate_limit", public: false },
  {
    sender: t.identity().primaryKey(),
    windowStartedAt: t.timestamp(),
    sampleCount: t.u8(),
  },
);

const StartupTelemetrySample = t.object("StartupTelemetrySample", {
  stage: t.string(),
  outcome: t.string(),
  issueCode: t.string(),
  durationMs: t.u32(),
  attempt: t.u16(),
  clientVersion: t.string(),
  connectivity: t.string(),
});

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
    combatVersion: t.u8().default(0).index("btree"),
    challengerWeaponItem: t.string().default(""),
    opponentWeaponItem: t.string().default(""),
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
    combatVersion: t.u8().default(0).index("btree"),
    challengerWeaponItem: t.string().default(""),
    opponentWeaponItem: t.string().default(""),
  },
);

const maintenanceSchedule = table(
  { scheduled: (): any => runMaintenance },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

// Historical cleanup and fallback reconciliation do not need a one-minute scan.
const maintenanceSweepSchedule = table(
  { scheduled: (): any => runMaintenanceSweep },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

// Diagnostic retention has its own cadence, separate from gameplay recovery.
const startupTelemetryCleanupSchedule = table(
  { scheduled: (): any => cleanupStartupTelemetry },
  { scheduledId: t.u64().primaryKey(), scheduledAt: t.scheduleAt() },
);

const motionFrameSchedule = table(
  { scheduled: (): any => publishMotionFrames },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    previousTickMicros: t.u64(),
  },
);

const motionDetailFrameSchedule = table(
  { scheduled: (): any => publishMotionDetailFrames },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
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
    slot: t.u8().default(1),
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

const spiderRespawnSchedule = table(
  { scheduled: (): any => respawnSpider },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
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

const magmaliskRespawnSchedule = table(
  { scheduled: (): any => respawnMagmalisk },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const gloomrootRespawnSchedule = table(
  { scheduled: (): any => respawnGloomroot },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const tidewyrmRespawnSchedule = table(
  { scheduled: (): any => respawnTidewyrm },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const koiShogunRespawnSchedule = table(
  { scheduled: (): any => respawnKoiShogun },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const tempestKirinRespawnSchedule = table(
  { scheduled: (): any => respawnTempestKirin },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const miremawRespawnSchedule = table(
  { scheduled: (): any => respawnMiremaw },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const prismshellRespawnSchedule = table(
  { scheduled: (): any => respawnPrismshell },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const ironhornRespawnSchedule = table(
  { scheduled: (): any => respawnIronhorn },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const dreadreaperRespawnSchedule = table(
  { scheduled: (): any => respawnDreadreaper },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const voltwardenRespawnSchedule = table(
  { scheduled: (): any => respawnVoltwarden },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const gravebloomRespawnSchedule = table(
  { scheduled: (): any => respawnGravebloom },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);
const aegisPrimeRespawnSchedule = table(
  { scheduled: (): any => respawnAegisPrime },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const forestRewardPrototype = table(
  { name: "forest_reward_prototype", public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(), enemyHp: t.u32(), damage: t.u32(), kills: t.u64(),
    lastAttack: t.u64(), nextAttackAt: t.u64(), respawnAt: t.u64(),
  },
);

const shardCoordinatorSchedule = table(
  { scheduled: (): any => coordinateMapShard },
  { scheduledId: t.u64().primaryKey(), scheduledAt: t.scheduleAt() },
);
const spacetimedb = schema({
  defeatSessionRestriction,
  mapBalanceVersion, mapBalanceHead, playerMapBalance,
  ...moderationTables,
  publicChatCursor,
  gemKillProgress,
  playerGemDrop,
  ...proceduralMapTables,
  ...leaderboardPageTables,
  ...gemPurchaseTables,
  ...patreonTables,
  homeReturnLocation,
  ...guildTables,
  ...socialTables,
  shardCoordinatorSchedule,
  ...mapShardingTables,
  forestRewardPrototype,
  player,
  playerMapMarker,
  playerMotion,
  playerMotionMapState,
  playerMotionIdentity,
  playerMotionFrame,
  playerMotionInterest,
  playerMotionDetailFrame,
  playerMapFrame,
  bossAttackFrame,
  bossHitResult,
  playerDeathFrame,
  playerProfile,
  playerGemWallet,
  gemTransaction,
  dailyGemBonus,
  balanceApologyNotice,
  playerItemGift,
  mailboxLetter, mailboxReceipt, mailboxEquipment, accountDeletionRequest,
  playerOnboarding,
  regularEnemyLootCursor, enemyDefeatBudget, bossDefeatWindow, bossMapDefeatWindow,
  enemyDefeatReview,
  playerMultiplayerPreference,
  chatReaction, chatHeartAllowance, chatReactionSummary, playerChatHearts,
  playerUpgradeBench,
  playerInventoryCapacity,
  playerCutsceneHistory,
  playerProgress,
  playerLastLocation,
  playerResearch,
  activeResearch,
  playerItemUpgrade,
  activeItemUpgrade,
  activeItemUpgradeSlotTwo,
  playerItemDrop,
  leaderboardEntry,
  playerAccountStatus,
  playerLegalConsent,
  worldStatus,
  releaseAcknowledgement,
  releaseNotice,
  leaderboardRefreshState,
  moduleMigrationState,
  playerLifetime,
  playerNameCooldown,
  playerBalanceVersion,
  playerPowerRebaseBackup,
  playerEndgameRebaseBackup,
  playerEndlessRebaseBackup,
  developerPresencePreference,
  playerMovementDemand,
  playerAccessAudit,
  playerSession,
  playerController,
  virtualPlayer,
  virtualPlayerLoad,
  virtualPlayerRun,
  chatCooldown,
  presenceChatCooldown,
  duelRequestCooldown,
  accountLink,
  chatMessage,
  chatMessageReport,
  chatMessageReportRateLimit,
  playerBlock,
  playerReport,
  bugReport,
  ...connectionDiagnosticTables,
  startupTelemetryEvent,
  startupTelemetryRateLimit,
  duel,
  duelReplay,
  duelWireAccess,
  ...dragonBossTables,
  maintenanceSchedule,
  maintenanceSweepSchedule,
  startupTelemetryCleanupSchedule,
  motionFrameSchedule,
  motionDetailFrameSchedule,
  mapFrameSchedule,
  researchCompletionSchedule,
  itemUpgradeCompletionSchedule,
  duelResolutionSchedule,
  dragonRespawnSchedule,
  ...spiderBossTables,
  spiderRespawnSchedule,
  ...frostclawBossTables,
  frostclawRespawnSchedule,
  ...magmaliskBossTables,
  magmaliskRespawnSchedule,
  ...gloomrootBossTables,
  gloomrootRespawnSchedule,
  ...tidewyrmBossTables,
  tidewyrmRespawnSchedule,
  ...koiShogunBossTables,
  koiShogunRespawnSchedule,
  ...tempestKirinBossTables,
  tempestKirinRespawnSchedule,
  ...miremawBossTables,
  ...prismshellBossTables, ...ironhornBossTables, ...dreadreaperBossTables, ...voltwardenBossTables, ...gravebloomBossTables, ...aegisPrimeBossTables,
  miremawRespawnSchedule,
  prismshellRespawnSchedule, ironhornRespawnSchedule, dreadreaperRespawnSchedule, voltwardenRespawnSchedule, gravebloomRespawnSchedule, aegisPrimeRespawnSchedule,
});
export default spacetimedb;
export const duelWireFilter = spacetimedb.clientVisibilityFilter.sql(DUEL_WIRE_FILTER);
export const duelReplayWireFilter = spacetimedb.clientVisibilityFilter.sql(DUEL_REPLAY_WIRE_FILTER);

export type ModuleViewCtx = import("spacetimedb/server").ViewCtx<InferSchema<typeof spacetimedb>>;
export type ModuleReducerCtx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export const devForestRewardPrototype = spacetimedb.view(
  { name: "dev_forest_reward_prototype", public: true },
  t.option(forestRewardPrototype.rowType),
  (ctx) => isDeveloperIdentity(ctx.sender) ? ctx.db.forestRewardPrototype.identity.find(ctx.sender) ?? undefined : undefined,
);

function requireForestPrototypeAccess(ctx: ModuleReducerCtx, action: string) {
  requireDeveloper(ctx, action);
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player?.mapId !== TUTORIAL_FOREST_MAP_ID || activeDuelFor(ctx, ctx.sender)) {
    throw new SenderError("Run the reward prototype in the forest, outside a duel.");
  }
}

export const beginForestRewardPrototype = spacetimedb.reducer({}, (ctx) => {
  requireForestPrototypeAccess(ctx, "begin_forest_reward_prototype");
  const previous = ctx.db.forestRewardPrototype.identity.find(ctx.sender);
  try {
    const next = beginForestPrototype(previous, ctx.timestamp.microsSinceUnixEpoch);
    if (next === previous) return;
    const row = { ...next, identity: ctx.sender };
    if (previous) ctx.db.forestRewardPrototype.identity.update(row);
    else ctx.db.forestRewardPrototype.insert(row);
  } catch (error) { throw new SenderError(error instanceof Error ? error.message : "Prototype start failed."); }
});

export const attackForestRewardPrototype = spacetimedb.reducer(
  { encounter: t.u64(), firstAttack: t.u64(), count: t.u8() },
  (ctx, action) => {
    requireForestPrototypeAccess(ctx, "attack_forest_reward_prototype");
    const previous = ctx.db.forestRewardPrototype.identity.find(ctx.sender);
    if (!previous) throw new SenderError("Start the reward prototype first.");
    try {
      const next = attackForestPrototype(previous, action, ctx.timestamp.microsSinceUnixEpoch);
      if (next !== previous) ctx.db.forestRewardPrototype.identity.update({ ...next, identity: ctx.sender });
    } catch (error) { throw new SenderError(error instanceof Error ? error.message : "Prototype attack failed."); }
  },
);

export const myPlayerBlocks = spacetimedb.view(
  { name: "my_player_blocks", public: true },
  t.array(playerBlock.rowType),
  (ctx) => [...ctx.db.playerBlock.byOwner.filter(ctx.sender)],
);

function playersBlocked(ctx: ModuleReducerCtx, owner: Identity, target: Identity) {
  return Boolean(ctx.db.playerBlock.key.find(playerBlockKey(owner.toHexString(), target.toHexString()))
    || ctx.db.playerBlock.key.find(playerBlockKey(target.toHexString(), owner.toHexString())));
}

export const setPlayerBlocked = spacetimedb.reducer(
  { target: t.identity(), blocked: t.bool() },
  (ctx, { target, blocked }) => {
    requireControllingPlayer(ctx);
    if (sameIdentity(ctx.sender, target)) throw new SenderError("You cannot block yourself.");
    const key = playerBlockKey(ctx.sender.toHexString(), target.toHexString());
    if (!blocked) { ctx.db.playerBlock.key.delete(key); return; }
    if (ctx.db.playerBlock.key.find(key)) return;
    const profile = ctx.db.playerProfile.identity.find(target);
    if (!profile) throw new SenderError("Player profile unavailable.");
    ctx.db.playerBlock.insert({ key, owner: ctx.sender, target, targetName: profile.displayName });
  },
);

function consumeReportRate(ctx: ModuleReducerCtx) {
  const current = ctx.db.chatMessageReportRateLimit.reporter.find(ctx.sender);
  const next = nextChatReportRateState(ctx.timestamp.microsSinceUnixEpoch, current ? {
    windowStartedAtMicros: current.windowStartedAt.microsSinceUnixEpoch, reportCount: current.reportCount,
  } : undefined);
  if (!next.allowed) throw new SenderError("Report limit reached. Try again later.");
  const row = { reporter: ctx.sender, windowStartedAt: new Timestamp(next.windowStartedAtMicros), reportCount: next.reportCount };
  if (current) ctx.db.chatMessageReportRateLimit.reporter.update(row);
  else ctx.db.chatMessageReportRateLimit.insert(row);
}

export const reportPlayer = spacetimedb.reducer(
  { target: t.identity(), reason: t.string(), note: t.string() },
  (ctx, { target, reason, note }) => {
    requireControllingPlayer(ctx);
    const error = playerReportValidationError(ctx.sender.toHexString(), target.toHexString(), reason, note);
    if (error) throw new SenderError(error);
    const profile = ctx.db.playerProfile.identity.find(target);
    if (!profile) throw new SenderError("Player profile unavailable.");
    for (const report of ctx.db.playerReport.byReporterTarget.filter([ctx.sender, target])) {
      if (report.status === "pending") throw new SenderError("You already have a pending report for this player.");
    }
    consumeReportRate(ctx);
    ctx.db.playerReport.insert({
      id: 0n, reporter: ctx.sender, reporterName: ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER",
      target, targetName: profile.displayName, reason, note: note.trim(), status: "pending", reportedAt: ctx.timestamp,
    });
  },
);

// Keep safety relationships intact when a guest registers, including people
// who blocked that guest. This only runs during an explicit identity merge.
function transferPlayerBlocks(ctx: ModuleReducerCtx, guest: Identity, account: Identity) {
  const rows = [...ctx.db.playerBlock.byOwner.filter(guest), ...ctx.db.playerBlock.byTarget.filter(guest)];
  for (const row of rows) {
    ctx.db.playerBlock.key.delete(row.key);
    const owner = sameIdentity(row.owner, guest) ? account : row.owner;
    const target = sameIdentity(row.target, guest) ? account : row.target;
    if (sameIdentity(owner, target)) continue;
    const key = playerBlockKey(owner.toHexString(), target.toHexString());
    if (!ctx.db.playerBlock.key.find(key)) ctx.db.playerBlock.insert({ ...row, key, owner, target });
  }
  // The bounded public history must follow the new sender too; otherwise
  // transferring a block would reveal that guest's already-loaded messages.
  for (const message of [...ctx.db.chatMessage.bySender.filter(guest)]) {
    ctx.db.chatMessage.id.update({ ...message, sender: account, senderIsGuest: false });
  }
}

function removePlayerSafetyData(ctx: ModuleReducerCtx, identity: Identity) {
  removeAccountReactions(ctx, identity);
  for (const row of [...ctx.db.playerBlock.byOwner.filter(identity), ...ctx.db.playerBlock.byTarget.filter(identity)]) {
    ctx.db.playerBlock.key.delete(row.key);
  }
  for (const row of [...ctx.db.playerReport.iter()]) {
    if (sameIdentity(row.reporter, identity) || sameIdentity(row.target, identity)) ctx.db.playerReport.id.delete(row.id);
  }
}

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

export const myGemWallet = spacetimedb.view(
  { name: "my_gem_wallet", public: true },
  t.array(playerGemWallet.rowType),
  (ctx) => {
    const wallet = ctx.db.playerGemWallet.identity.find(ctx.sender);
    return wallet ? [wallet] : [];
  },
);

export const myDailyGemBonus = spacetimedb.view(
  { name: "my_daily_gem_bonus", public: true },
  t.array(dailyGemBonus.rowType),
  (ctx) => {
    const bonus = ctx.db.dailyGemBonus.identity.find(ctx.sender);
    return bonus ? [bonus] : [];
  },
);

export const myMailboxV2 = spacetimedb.view(
  { name: "my_mailbox_v2", public: true }, t.array(mailboxEntryV2), mailboxForPlayerV2,
);
export const myMailbox = spacetimedb.view(
  { name: "my_mailbox", public: true }, t.array(mailboxEntry), mailboxForPlayer,
);

export const myBalanceApologyNotice = spacetimedb.view(
  { name: "my_balance_apology_notice", public: true },
  t.array(balanceApologyNotice.rowType),
  (ctx) => {
    const notice = ctx.db.balanceApologyNotice.identity.find(ctx.sender);
    return notice ? [notice] : [];
  },
);

export const myUpgradeBench = spacetimedb.view(
  { name: "my_upgrade_bench", public: true },
  t.array(playerUpgradeBench.rowType),
  (ctx) => {
    const bench = ctx.db.playerUpgradeBench.identity.find(ctx.sender);
    return bench ? [bench] : [];
  },
);

export const myInventoryCapacity = spacetimedb.view(
  { name: "my_inventory_capacity", public: true },
  t.array(playerInventoryCapacity.rowType),
  (ctx) => {
    const capacity = ctx.db.playerInventoryCapacity.identity.find(ctx.sender);
    return capacity ? [capacity] : [];
  },
);

export const myCutsceneHistory = spacetimedb.view(
  { name: "my_cutscene_history", public: true },
  t.array(playerCutsceneHistory.rowType),
  (ctx) => {
    const history = ctx.db.playerCutsceneHistory.identity.find(ctx.sender);
    return history ? [history] : [];
  },
);

function ensureCutsceneHistory(ctx: ModuleReducerCtx, identity: Identity) {
  const existing = ctx.db.playerCutsceneHistory.identity.find(identity);
  if (existing) return existing;
  return ctx.db.playerCutsceneHistory.insert({
    identity,
    seenMask: unlockedPortalCutsceneMask(ctx.db.playerProgress.identity.find(identity)),
    generation: 0,
  });
}

export const markPortalCutsceneSeen = spacetimedb.reducer({ cutscene: t.string(), generation: t.u32() }, (ctx, { cutscene, generation }) => {
  requireControllingPlayer(ctx);
  const bit = portalCutsceneBit(cutscene);
  if (!bit) throw new SenderError("Unknown portal cutscene.");
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!(unlockedPortalCutsceneMask(progress) & bit)) throw new SenderError("Portal not unlocked.");
  const history = ensureCutsceneHistory(ctx, ctx.sender);
  if (history.generation !== generation) throw new SenderError("Character history was reset.");
  if (history.seenMask & bit) return;
  ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask | bit });
});

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

function requireAllowedDisplayName(displayName: string) {
  if (!isPublicDisplayNameAllowed(displayName)) {
    throw new SenderError("Display name is not allowed.");
  }
}

function syncDisplayNamePresentation(ctx: any, identity: any, displayName: string) {
  const guildMember = ctx.db.guildMember.identity.find(identity);
  if (guildMember && guildMember.name !== displayName) {
    ctx.db.guildMember.identity.update({ ...guildMember, name: displayName });
  }
  const leaderboard = ctx.db.leaderboardEntry.identity.find(identity);
  if (leaderboard && leaderboard.displayName !== displayName) {
    ctx.db.leaderboardEntry.identity.update({ ...leaderboard, displayName });
  }
  const motionIdentity = ctx.db.playerMotionIdentity.identity.find(identity);
  if (motionIdentity && motionIdentity.displayName !== displayName) {
    ctx.db.playerMotionIdentity.networkId.update({ ...motionIdentity, displayName });
  }
  const audit = ctx.db.playerAccessAudit.identity.find(identity);
  if (audit && audit.displayName !== displayName) {
    ctx.db.playerAccessAudit.identity.update({ ...audit, displayName });
  }
  for (const table of [
    ctx.db.dragonContribution,
    ctx.db.spiderContribution,
    ctx.db.frostclawContribution,
    ctx.db.magmaliskContribution,
    ctx.db.gloomrootContribution,
    ctx.db.tidewyrmContribution,
    ctx.db.koiShogunContribution,
    ctx.db.tempestKirinContribution,
    ctx.db.miremawContribution,
    ctx.db.prismshellContribution,
  ]) {
    const contribution = table.identity.find(identity);
    if (contribution && contribution.displayName !== displayName) {
      table.identity.update({ ...contribution, displayName });
    }
  }
  syncDisplayNameHistory(ctx, identity, displayName);
  for (const duel of [...ctx.db.duel.byChallenger.filter(identity)] as any[]) {
    if (duel.challengerName !== displayName) updateSnapshotRow(ctx, "duel", { ...duel, challengerName: displayName });
  }
  for (const duel of [...ctx.db.duel.byOpponent.filter(identity)] as any[]) {
    if (duel.opponentName !== displayName) updateSnapshotRow(ctx, "duel", { ...duel, opponentName: displayName });
  }
}

function repairModeratedDisplayName(ctx: any, profile: any, actorType: "automatic" | "owner" = "automatic") {
  if (isPublicDisplayNameAllowed(profile.displayName)) return profile;
  const displayName = generatedDisplayName(profile.identity);
  const repaired = { ...profile, displayName };
  updateSnapshotRow(ctx, "playerProfile", repaired);
  // A forced safety rename must allow a free, immediate choice of a new valid name.
  if (ctx.db.playerNameCooldown.identity.find(profile.identity)) {
    ctx.db.playerNameCooldown.identity.delete(profile.identity);
  }
  syncDisplayNamePresentation(ctx, profile.identity, displayName);
  recordModerationAction(ctx, { targetIdentity: profile.identity.toHexString(), targetName: displayName,
    channel: "profile", action: "Name changed", reason: displayNameModerationReason(profile.displayName) ?? "Disallowed username",
    actorType, rule: MODERATION_RULE_VERSION, before: profile.displayName, after: displayName });
  return repaired;
}

// Targeted moderation for existing/offline accounts. Never edit combat stats
// just to repair a name, and refuse a stale request if the owner renamed first.
export const devRepairDisplayName = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string() },
  (ctx, { identity, expectedDisplayName }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "dev_repair_display_name", "Database owner required.");
    const profile = ctx.db.playerProfile.identity.find(identity);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.displayName !== expectedDisplayName) throw new SenderError("Player name changed; repair refused.");
    // Also reconcile retained history when this account was already repaired.
    if (isPublicDisplayNameAllowed(profile.displayName)) syncDisplayNamePresentation(ctx, identity, profile.displayName);
    else repairModeratedDisplayName(ctx, profile, "owner");
    refreshLeaderboard(ctx);
  },
);

function defaultPlayerProgress(identity: any) {
  return {
    identity,
    maxHp: PLAYER_BASE_HP,
    damage: PLAYER_BASE_DAMAGE,
    attackRate: DEFAULT_ATTACK_INTERVAL,
    projectileSpeed: PLAYER_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: 0,
    regen: PLAYER_BASE_REGEN,
    speed: PLAYER_SPEED,
    bootsCollected: true,
    inventoryJson: JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE, TRAILBLAZER_BOOTS]),
    equippedHead: BASIC_PAPER_HAT,
    equippedChest: "",
    equippedFeet: TRAILBLAZER_BOOTS,
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    introComplete: false,
    desertUnlocked: false,
    snowlandsUnlocked: false,
    lavaUnlocked: false,
    infernalUnlocked: false,
    waterUnlocked: false,
    samuraiUnlocked: false,
    cloudspireUnlocked: false,
    moonfenUnlocked: false,
    crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, neonBastionUnlocked: false, verdantCatacombsUnlocked: false, ionCitadelUnlocked: false,
    bossRewardClaims: 0,
    bowCount: 0,
    woodenArmorCount: 0,
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    speedOverride: 0,
  };
}

const PLAYER_PROGRESS_VALUE_FIELDS = [
  "maxHp",
  "damage",
  "attackRate",
  "projectileSpeed",
  "projectileCount",
  "attackRange",
  "armor",
  "regen",
  "speed",
  "bootsCollected",
  "inventoryJson",
  "equippedHead",
  "equippedChest",
  "equippedFeet",
  "equippedRightHand",
  "equippedLeftHand",
  "introComplete",
  "desertUnlocked",
  "snowlandsUnlocked",
  "lavaUnlocked",
  "infernalUnlocked",
  "waterUnlocked",
  "samuraiUnlocked",
  "cloudspireUnlocked",
  "moonfenUnlocked",
  "crystalHollowsUnlocked", "clockworkRuinsUnlocked", "duskfallOrchardUnlocked", "neonBastionUnlocked", "verdantCatacombsUnlocked", "ionCitadelUnlocked",
  "bossRewardClaims",
  "bowCount",
  "woodenArmorCount",
  "cosmeticHead",
  "cosmeticChest",
  "cosmeticFeet",
  "cosmeticRightHand",
  "cosmeticLeftHand",
  "speedOverride",
] as const;

function samePlayerProgressValues(left: any, right: any) {
  return PLAYER_PROGRESS_VALUE_FIELDS.every((field) => left[field] === right[field]);
}

function defaultPlayerResearch(identity: any) {
  return { identity, warcraft: 0, foraging: 0, frontierMastery: 0, vitality: 0, precision: 0, regeneration: 0, criticalChance: 0, criticalDamage: 0, moveSpeed: 0, prosperity: 0 };
}

function researchForPlayer(ctx: any, identity: any) {
  const existing = ctx.db.playerResearch.identity.find(identity);
  if (existing) {
    if (existing.frontierMastery === 0) return existing;
    const wiped = { ...existing, frontierMastery: 0 };
    updateSnapshotRow(ctx, "playerResearch", wiped);
    return wiped;
  }
  const next = defaultPlayerResearch(identity);
  insertSnapshotRow(ctx, "playerResearch", next);
  return next;
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
  // Prerequisites are authoritative when research starts. Once accepted, keep
  // that rank valid across later tree-layout migrations so no active progress
  // is discarded merely because its node connections changed.
  return active.targetRank === research[researchId] + 1;
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
  const nextResearch = { ...research, [active.researchId]: active.targetRank };
  updateSnapshotRow(ctx, "playerResearch", nextResearch);
  const progress = ctx.db.playerProgress.identity.find(active.identity);
  const player = ctx.db.player.identity.find(active.identity);
  if (progress && player) {
    const nextPlayer = {
      ...player,
      speed: effectiveMovementSpeedForProgress(ctx, progress, nextResearch),
      ...powerFieldsForProgress(ctx, progress),
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
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

function effectiveMovementSpeedForProgress(ctx: any, progress: any, research?: any) {
  return effectivePlayerMovementSpeed(
    equippedFeetForProgress(progress) === TRAILBLAZER_BOOTS,
    (research ?? ctx.db.playerResearch.identity.find(progress.identity))?.moveSpeed ?? 0,
    progress.speedOverride ?? 0,
  );
}

function markPlayerBalanceCurrent(ctx: any, identity = ctx.sender) {
  const current = ctx.db.playerBalanceVersion.identity.find(identity);
  const next = { identity, version: ATTACK_BALANCE_VERSION };
  if (current) ctx.db.playerBalanceVersion.identity.update(next);
  else ctx.db.playerBalanceVersion.insert(next);
}

function playerBalanceProgress(progress: any, version: number, includeMapRebase = true) {
  const attackBalanced = {
    ...progress,
    // Version 1 halved legacy attack speed once. Version 2 enforces the lower
    // base-speed cap for existing players.
    attackRate: Math.max(
      MIN_ATTACK_INTERVAL,
      Math.min(DEFAULT_ATTACK_INTERVAL, version < 1 ? progress.attackRate * 2 : progress.attackRate),
    ),
  };
  const outlierBalanced = version < 3 ? compressLegacyProgressionOutlier(attackBalanced) : attackBalanced;
  const damageHealthBalanced = version < 4 ? rebalanceLegacyDamageHealth(outlierBalanced) : outlierBalanced;
  const topFiveBalanced = version < 5 ? compressLegacyTopFiveProgression(damageHealthBalanced) : damageHealthBalanced;
  const corrected = version === 5 ? correctLegacyTopFiveV5Progression(topFiveBalanced) : topFiveBalanced;
  const mapBalanced = includeMapRebase && version < 7 ? compressLegacyMapPower(corrected) : corrected;
  return includeMapRebase && version < 8 ? rescaleEndgameProgress(mapBalanced) : mapBalanced;
}

function powerForProgress(progress: { maxHp: number; damage: number; attackRate: number; armor: number; regen: number }) {
  return playerPowerForStats(progress);
}

function effectivePowerStatsForProgress(ctx: any, progress: any) {
  return effectivePlayerPowerStats(
    progress,
    ctx.db.playerResearch.identity.find(progress.identity),
    (itemId) => itemUpgradeLevelFor(ctx, progress.identity, itemId),
  );
}

function effectivePowerForProgress(ctx: any, progress: any) {
  return effectivePlayerPower(
    progress,
    ctx.db.playerResearch.identity.find(progress.identity),
    (itemId) => itemUpgradeLevelFor(ctx, progress.identity, itemId),
  );
}

function powerFieldsForProgress(ctx: any, progress: any) {
  const powerLevel = effectivePowerForProgress(ctx, progress);
  return { power: legacyU32Power(powerLevel), powerLevel };
}

function researchedDamage(ctx: any, identity: any, damage: number, knownProgress?: any, knownResearch?: any) {
  const rank = (knownResearch === undefined ? ctx.db.playerResearch.identity.find(identity) : knownResearch)?.warcraft ?? 0;
  const progress = knownProgress ?? ctx.db.playerProgress.identity.find(identity);
  const weaponItem = progress ? equippedRightHandForProgress(progress) || equippedLeftHandForProgress(progress) : "";
  const headItem = progress ? equippedHeadForProgress(progress) : "";
  const chestItem = progress ? equippedChestForProgress(progress) : "";
  return equipmentDamage(damage,
    weaponItem,
    headItem,
    chestItem,
    1 + rank * .02,
    itemUpgradeLevelFor(ctx, identity, weaponItem),
    itemUpgradeLevelFor(ctx, identity, headItem),
    itemUpgradeLevelFor(ctx, identity, chestItem),
  );
}

function researchedArmor(ctx: any, identity: any, armor: number) {
  const rank = ctx.db.playerResearch.identity.find(identity)?.precision ?? 0;
  return armor * (1 + rank * .02);
}

function researchedRegen(ctx: any, identity: any, regen: number) {
  const rank = ctx.db.playerResearch.identity.find(identity)?.regeneration ?? 0;
  const progress = ctx.db.playerProgress.identity.find(identity);
  const headItem = progress ? equippedHeadForProgress(progress) : "";
  const chestItem = progress ? equippedChestForProgress(progress) : "";
  return equipmentRegeneration(regen,
    headItem,
    chestItem,
    1 + rank * .02,
    itemUpgradeLevelFor(ctx, identity, headItem),
    itemUpgradeLevelFor(ctx, identity, chestItem),
  );
}

function publishPlayerDeathFrame(ctx: any, activePlayer: any) {
  if (boundedMapPopulation(ctx, activePlayer.mapId) < 2) return;
  const motion = ctx.db.playerMotion.identity.find(activePlayer.identity);
  if (!motion?.isVisible) return;
  ctx.db.playerDeathFrame.insert({
    mapId: activePlayer.mapId,
    ...playerZone(activePlayer.x, activePlayer.y),
    networkId: motion.networkId,
    playerX: activePlayer.x,
    playerY: activePlayer.y,
    facing: activePlayer.facing,
    emittedAt: ctx.timestamp,
  });
}

function removePlayerRealtimeState(ctx: any, identity: any) {
  if (ctx.db.playerMotionInterest.identity.find(identity)) ctx.db.playerMotionInterest.identity.delete(identity);
  const motion = ctx.db.playerMotion.identity.find(identity);
  if (motion) {
    ctx.db.playerMotion.networkId.delete(motion.networkId);
    adjustPlayerMotionMapState(ctx, motion.mapId, -1, motion.isVisible ? -1 : 0);
  }
  const mapping = ctx.db.playerMotionIdentity.identity.find(identity);
  if (mapping) ctx.db.playerMotionIdentity.networkId.delete(mapping.networkId);
}

function boundedMapPopulation(ctx: any, mapId: string) {
  return ctx.db.playerMotionMapState.mapId.find(mapId)?.playerCount ?? 0;
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
    const effectiveStats = effectivePowerStatsForProgress(ctx, progress);
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

  writeLeaderboardPages(ctx, candidates);
  const selected = new Map(candidates.map(candidate => [candidate.identityKey, candidate]));
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
  requireAllowedDefeatSession(ctx);
  const session = sessionForContext(ctx);
  if (!session || !sameIdentity(session.identity, ctx.sender)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}

// A blocked connection may continue sending queued packets for a short time
// after its session is invalidated. Hot reducers should quietly drop those
// packets instead of throwing a new error for every retry and flooding logs.
function blockedSession(ctx: any) {
  return Boolean(defeatRestrictionError(ctx));
}

function isSupportedProtocol(protocolVersion: number) {
  return COMPATIBLE_PROTOCOL_VERSIONS.includes(protocolVersion);
}

function requireCurrentLegalConsent(ctx: any) {
  const consent = ctx.db.playerLegalConsent.identity.find(ctx.sender);
  if (consent?.termsVersion !== TERMS_VERSION || !isEligiblePlayerAgeBand(consent?.ageBand ?? -1)) {
    throw new SenderError("Review and accept the Wildstat Terms to continue.");
  }
  return consent;
}

function requireSupportedSessionProtocol(ctx: any) {
  const session = requireSession(ctx);
  if (!isSupportedProtocol(session.protocolVersion)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}

function requireCurrentProtocol(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current) throw new SenderError(LEGACY_CLIENT_ERRORS.missingPresence);
  return playerWithMotion(ctx, current);
}

function requireControllingPlayer(ctx: any) {
  const current = requireCurrentProtocol(ctx);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!ctx.connectionId || !controller || !sameConnection(controller.connectionId, ctx.connectionId)) {
    throw new SenderError("Wildstat is active in another tab.");
  }
  if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.tabId !== sessionForContext(ctx)?.tabId) {
    throw new SenderError("Map admission belongs to another tab.");
  }
  return current;
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

function requireDeveloperSession(ctx: ModuleReducerCtx, action: string) {
  auditPrivilegedAccess(ctx, action, () => {
    requireSupportedSessionProtocol(ctx);
    if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
      throw new SenderError("Developer access required.");
    }
  });
}

function requireDeveloper(ctx: ModuleReducerCtx, action: string) {
  auditPrivilegedAccess(ctx, action, () => {
    requireControllingPlayer(ctx);
    if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
      throw new SenderError("Developer access required.");
    }
  });
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
    (progress.regen === 0 || Math.abs(progress.regen - defaultProgress.regen) < 1e-6) &&
    progress.speed === defaultProgress.speed &&
    (progress.speedOverride ?? 0) === 0 &&
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
    progress.lavaUnlocked === defaultProgress.lavaUnlocked &&
    progress.infernalUnlocked === defaultProgress.infernalUnlocked &&
    progress.waterUnlocked === defaultProgress.waterUnlocked &&
    progress.samuraiUnlocked === defaultProgress.samuraiUnlocked &&
    progress.cloudspireUnlocked === defaultProgress.cloudspireUnlocked &&
    progress.moonfenUnlocked === defaultProgress.moonfenUnlocked &&
    progress.crystalHollowsUnlocked === defaultProgress.crystalHollowsUnlocked &&
    progress.clockworkRuinsUnlocked === defaultProgress.clockworkRuinsUnlocked &&
    progress.duskfallOrchardUnlocked === defaultProgress.duskfallOrchardUnlocked &&
    progress.neonBastionUnlocked === defaultProgress.neonBastionUnlocked &&
    (progress.bossRewardClaims ?? 0) === defaultProgress.bossRewardClaims;
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

function contributedToLatestPrismshell(ctx: any, identity: any) {
  return resultIncludesContributor(ctx.db.prismshellResult.id.find(PRISMSHELL_ID), identity);
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
  // Decode once. Previously every catalog item reparsed the same JSON payload.
  let saved: unknown[] = [];
  try { const value = JSON.parse(progress.inventoryJson ?? "[]"); if (Array.isArray(value)) saved = value; } catch {}
  const owned = new Set(saved.map(canonicalItemId).filter(Boolean));
  const developer = isDeveloperIdentity(progress.identity);
  const forestCount = (itemId: string, field: string) => Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT,
    Math.max(Number.isInteger(progress[field]) ? progress[field] : 0, saved.filter(id => id === itemId).length)));
  return [
    ...STARTER_ITEM_IDS,
    ...(developer ? DEVELOPER_ITEM_IDS : DEVELOPER_ITEM_IDS.filter(id => owned.has(id))),
    ...(progress.bootsCollected ? [TRAILBLAZER_BOOTS] : []),
    ...Array(forestCount(STARTER_BOW, "bowCount")).fill(STARTER_BOW),
    ...Array(forestCount(WOODEN_ARMOR, "woodenArmorCount")).fill(WOODEN_ARMOR),
    ...OWNED_EQUIPMENT_DROP_IDS.filter(id => owned.has(id)),
  ];
}

// The two original forest drops retain their legacy count-field migration above.
const OWNED_EQUIPMENT_DROP_IDS = EQUIPMENT_DROP_ITEM_IDS.filter(id => id !== STARTER_BOW && id !== WOODEN_ARMOR);

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
  return activeItemUpgradeEntriesFor(ctx, identity).some(({ active }) => active.itemId === itemId);
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
  if (current) updateSnapshotRow(ctx, "playerProgress", progress);
  else insertSnapshotRow(ctx, "playerProgress", progress);
  const active = ctx.db.player.identity.find(progress.identity);
  if (active) {
    const nextPlayer = {
      ...active,
      ...powerFieldsForProgress(ctx, progress),
      speed: effectiveMovementSpeedForProgress(ctx, progress),
      ...equipmentPresentationForProgress(progress),
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
  // Ranking snapshots refresh in maintenance, never in the combat/reward path.
}

function publishItemDrop(ctx: any, identity: any, itemId: string, alreadyOwned: boolean, quantity = 1) {
  const key = itemUpgradeKey(identity, itemId);
  const current = ctx.db.playerItemDrop.key.find(key);
  const next = {
    key,
    identity,
    itemId,
    alreadyOwned,
    sequence: (current?.sequence ?? 0n) + BigInt(quantity),
    droppedAt: ctx.timestamp,
  };
  if (current) ctx.db.playerItemDrop.key.update(next);
  else ctx.db.playerItemDrop.insert(next);
}


function equippedHeadForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  if (equipmentMapRequirement(progress.equippedHead, progress)) return "";
  if (progress.equippedHead === "") return "";
  return inventory.includes(progress.equippedHead) ? progress.equippedHead : BASIC_PAPER_HAT;
}

function equippedChestForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  if (equipmentMapRequirement(progress.equippedChest, progress)) return "";
  return inventory.includes(progress.equippedChest) ? progress.equippedChest : "";
}

function equippedFeetForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  if (equipmentMapRequirement(progress.equippedFeet, progress)) return "";
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

function equippedRightHandForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const saved = canonicalSavedHand(progress, "equippedRightHand");
  if (saved && inventory.includes(saved) && !equipmentMapRequirement(saved, progress)) return saved;
  return savedInventoryHasHandItem(progress) ? "" : STARTER_STONE;
}

function equippedLeftHandForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const saved = canonicalSavedHand(progress, "equippedLeftHand");
  return saved && inventory.includes(saved) && !equipmentMapRequirement(saved, progress) ? saved : "";
}

function cosmeticEquipmentForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const ownedItemIds = new Set(inventory);
  const itemFor = (field: "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand", slot: "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND") => {
    if (isHiddenCosmeticItem(progress[field])) return HIDDEN_COSMETIC_ITEM_ID;
    const itemId = canonicalItemId(progress[field]);
    return itemId && ownedItemIds.has(itemId) && itemFitsEquipmentSlot(itemId, slot) ? itemId : "";
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

function equipmentPresentationForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const rightHandItem = equippedRightHandForProgress(progress, inventory);
  const cosmetics = cosmeticEquipmentForProgress(progress, inventory);
  return resolveEquipmentAppearance({
    equippedFeet: equippedFeetForProgress(progress, inventory),
    equippedHead: equippedHeadForProgress(progress, inventory),
    equippedChest: equippedChestForProgress(progress, inventory),
    equippedRightHand: rightHandItem,
    equippedLeftHand: rightHandItem ? "" : equippedLeftHandForProgress(progress, inventory),
    ...cosmetics,
  });
}

function leaderboardAppearanceForProgress(progress: any, profile: any) {
  return {
    skinTone: profile?.skinTone ?? 3,
    ...equipmentPresentationForProgress(progress),
  };
}

function attackIntervalForProgress(progress: any) {
  return Math.max(MIN_ATTACK_INTERVAL, progress.attackRate);
}

function maxHealthForProgress(ctx: any, identity: any, progress: any) {
  const headItem = equippedHeadForProgress(progress);
  const chestItem = equippedChestForProgress(progress);
  const vitalityMultiplier = 1 + (ctx.db.playerResearch.identity.find(identity)?.vitality ?? 0) * .02;
  return equipmentMaxHealth(progress.maxHp / vitalityMultiplier,
    headItem,
    chestItem,
    vitalityMultiplier,
    itemUpgradeLevelFor(ctx, identity, headItem),
    itemUpgradeLevelFor(ctx, identity, chestItem),
  );
}

function normalizeUpgradeBenchSlot(slot: unknown) {
  return Number(slot) === UPGRADE_BENCH_SLOT_TWO ? UPGRADE_BENCH_SLOT_TWO : UPGRADE_BENCH_SLOT_ONE;
}

function requireUpgradeBenchSlot(slot: unknown) {
  const numericSlot = Number(slot);
  if (numericSlot !== UPGRADE_BENCH_SLOT_ONE && numericSlot !== UPGRADE_BENCH_SLOT_TWO) {
    throw new SenderError("Unknown upgrade slot.");
  }
  return numericSlot;
}

function activeItemUpgradeForSlot(ctx: any, identity: any, slot: number) {
  return slot === UPGRADE_BENCH_SLOT_TWO
    ? ctx.db.activeItemUpgradeSlotTwo.identity.find(identity)
    : ctx.db.activeItemUpgrade.identity.find(identity);
}

function activeItemUpgradeEntriesFor(ctx: any, identity: any) {
  const slotOne = ctx.db.activeItemUpgrade.identity.find(identity);
  const slotTwo = ctx.db.activeItemUpgradeSlotTwo.identity.find(identity);
  return [
    ...(slotOne ? [{ slot: UPGRADE_BENCH_SLOT_ONE, active: slotOne }] : []),
    ...(slotTwo ? [{ slot: UPGRADE_BENCH_SLOT_TWO, active: slotTwo }] : []),
  ];
}

function insertActiveItemUpgrade(ctx: any, slot: number, active: any) {
  return slot === UPGRADE_BENCH_SLOT_TWO
    ? ctx.db.activeItemUpgradeSlotTwo.insert(active)
    : ctx.db.activeItemUpgrade.insert(active);
}

function deleteActiveItemUpgrade(ctx: any, identity: any, slot: number) {
  if (slot === UPGRADE_BENCH_SLOT_TWO) ctx.db.activeItemUpgradeSlotTwo.identity.delete(identity);
  else ctx.db.activeItemUpgrade.identity.delete(identity);
}

function secondUpgradeSlotUnlockedFor(ctx: any, identity: any) {
  return ctx.db.playerUpgradeBench.identity.find(identity)?.secondSlotUnlocked === true;
}

function removeItemUpgradeCompletionSchedules(ctx: any, identity: any, slot?: number) {
  const scheduledIds = [...ctx.db.itemUpgradeCompletionSchedule.iter() as Iterable<any>]
    .filter((scheduled: any) => sameIdentity(scheduled.identity, identity) &&
      (slot === undefined || normalizeUpgradeBenchSlot(scheduled.slot) === slot))
    .map((scheduled: any) => scheduled.scheduledId);
  for (const scheduledId of scheduledIds) ctx.db.itemUpgradeCompletionSchedule.scheduledId.delete(scheduledId);
}

function removePlayerItemUpgradeData(ctx: any, identity: any, removeDrops = false) {
  if (ctx.db.activeItemUpgrade.identity.find(identity)) ctx.db.activeItemUpgrade.identity.delete(identity);
  if (ctx.db.activeItemUpgradeSlotTwo.identity.find(identity)) ctx.db.activeItemUpgradeSlotTwo.identity.delete(identity);
  removeItemUpgradeCompletionSchedules(ctx, identity);
  for (const upgrade of [...ctx.db.playerItemUpgrade.byIdentity.filter(identity) as Iterable<any>]) {
    deleteSnapshotRow(ctx, "playerItemUpgrade", upgrade.key);
  }
  if (removeDrops) {
    for (const drop of [...ctx.db.playerItemDrop.byIdentity.filter(identity) as Iterable<any>]) {
      ctx.db.playerItemDrop.key.delete(drop.key);
    }
  }
}

function ensureItemUpgradeCompletionSchedule(ctx: any, active: any, slot: number) {
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
  if (active.paused) return;
  const completesAtMicros = active.completesAt.microsSinceUnixEpoch;
  ctx.db.itemUpgradeCompletionSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(completesAtMicros),
    identity: active.identity,
    itemId: active.itemId,
    targetLevel: active.targetLevel,
    completesAtMicros,
    slot,
  });
}

function completeActiveItemUpgrade(ctx: any, active: any, slot: number) {
  const currentLevel = itemUpgradeLevelFor(ctx, active.identity, active.itemId);
  const progress = ctx.db.playerProgress.identity.find(active.identity) ?? defaultPlayerProgress(active.identity);
  if (currentLevel === active.currentLevel && active.targetLevel === currentLevel + 1 && active.targetLevel <= MAX_ITEM_UPGRADE_LEVEL) {
    const key = itemUpgradeKey(active.identity, active.itemId);
    const current = ctx.db.playerItemUpgrade.key.find(key);
    const completed = { key, identity: active.identity, itemId: active.itemId, level: active.targetLevel };
    if (current) updateSnapshotRow(ctx, "playerItemUpgrade", completed);
    else insertSnapshotRow(ctx, "playerItemUpgrade", completed);
  }
  writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
  deleteActiveItemUpgrade(ctx, active.identity, slot);
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
}

function cancelActiveItemUpgrade(ctx: any, active: any, slot: number) {
  const progress = ctx.db.playerProgress.identity.find(active.identity) ?? defaultPlayerProgress(active.identity);
  writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
  deleteActiveItemUpgrade(ctx, active.identity, slot);
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
}

function reconcileActiveItemUpgrade(ctx: any, active: any, slot: number) {
  if (!isUpgradeableItem(active.itemId) || active.currentLevel !== itemUpgradeLevelFor(ctx, active.identity, active.itemId) || active.targetLevel !== active.currentLevel + 1) {
    const progress = ctx.db.playerProgress.identity.find(active.identity) ?? defaultPlayerProgress(active.identity);
    writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
    deleteActiveItemUpgrade(ctx, active.identity, slot);
    removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
    return;
  }
  if (active.paused) {
    cancelActiveItemUpgrade(ctx, active, slot);
    return;
  }
  if (ctx.timestamp.microsSinceUnixEpoch >= active.completesAt.microsSinceUnixEpoch) {
    completeActiveItemUpgrade(ctx, active, slot);
    return;
  }
  ensureItemUpgradeCompletionSchedule(ctx, active, slot);
}

function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function ensureGemWallet(ctx: any, identity: any) {
  const existing = ctx.db.playerGemWallet.identity.find(identity);
  if (existing) return existing;
  return ctx.db.playerGemWallet.insert({
    identity,
    balance: 0n,
    revision: 0n,
    updatedAt: ctx.timestamp,
  });
}

const killGems = createKillGems({ applyGemBalanceChange, isVirtualPlayer });

function applyGemBalanceChange(ctx: any, input: {
  identity: any;
  delta: bigint;
  kind: string;
  note: string;
  externalReference: string;
}) {
  const duplicate = ctx.db.gemTransaction.externalReference.find(input.externalReference);
  if (duplicate) {
    if (!sameIdentity(duplicate.identity, input.identity) || duplicate.delta !== input.delta || duplicate.kind !== input.kind) {
      throw new SenderError("Gem transaction reference conflict.");
    }
    return ensureGemWallet(ctx, input.identity);
  }

  if (input.delta === 0n) throw new SenderError("Gem amount must not be zero.");
  if (input.delta < 0n && input.kind !== "gem_refund" &&
      [...ctx.db.gemCommerceHold.byIdentity.filter(input.identity)].length) {
    throw new SenderError("Gem spending is paused while a refunded purchase is reconciled.");
  }
  const wallet = ensureGemWallet(ctx, input.identity);
  let balanceAfter: bigint;
  try {
    balanceAfter = gemBalanceAfter(wallet.balance, input.delta);
  } catch (error) {
    throw new SenderError(error instanceof Error ? error.message : "Gem balance update failed.");
  }
  const nextWallet = {
    ...wallet,
    balance: balanceAfter,
    revision: wallet.revision + 1n,
    updatedAt: ctx.timestamp,
  };
  ctx.db.playerGemWallet.identity.update(nextWallet);
  ctx.db.gemTransaction.insert({
    id: 0n,
    identity: input.identity,
    delta: input.delta,
    balanceAfter,
    kind: input.kind,
    note: input.note,
    externalReference: input.externalReference,
    createdAt: ctx.timestamp,
  });
  return nextWallet;
}

const UTC_DAY_MICROS = 86_400_000_000n;

function currentUtcDayKey(ctx: any) {
  return String(ctx.timestamp.microsSinceUnixEpoch / UTC_DAY_MICROS);
}

function legacyDailyGemBonusReference(identity: any, dayKey: string) {
  return `daily-login:${identity.toHexString()}:${dayKey}`;
}

function ensureDailyGemBonusState(ctx: any, identity: any) {
  const dayKey = currentUtcDayKey(ctx);
  const current = ctx.db.dailyGemBonus.identity.find(identity);
  if (current?.claimableDayKey === dayKey || current?.lastClaimedDayKey === dayKey) return current;

  // v0.501 credited the reward immediately. Preserve that claim for ordinary
  // players so rollout of the Claim window can never double-credit a day.
  const legacyClaimed = Boolean(ctx.db.gemTransaction.externalReference.find(
    legacyDailyGemBonusReference(identity, dayKey),
  ));
  const next = {
    identity,
    claimableDayKey: legacyClaimed ? "" : dayKey,
    lastClaimedDayKey: legacyClaimed ? dayKey : current?.lastClaimedDayKey ?? "",
    claimCycle: current?.claimCycle ?? 0n,
    revision: (current?.revision ?? 0n) + 1n,
    updatedAt: ctx.timestamp,
  };
  if (current) ctx.db.dailyGemBonus.identity.update(next);
  else ctx.db.dailyGemBonus.insert(next);
  return next;
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

/**
 * Occupancy drives both admission and whether an instance may go dormant, so a
 * seat held by an account that is no longer present keeps an empty instance
 * counted as busy and warms further instances nobody stands in. Release seats
 * whose account has gone, skipping a handoff that is still in flight.
 */
function clearOrphanShardMembers(ctx: any) {
  if (isMapShard(ctx) || !rootShardingEnabled(ctx)) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const stranded: any[] = [];
  for (const member of ctx.db.mapShardMember.iter() as Iterable<any>) {
    if (ctx.db.player.identity.find(member.identity)) continue;
    const barrier = ctx.db.shardTransferBarrier.identity.find(member.identity);
    if (barrier && barrier.expiresAt > now) continue;
    stranded.push(member.identity);
  }
  for (const identity of stranded) releaseMapShard(ctx, identity);
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

function ensureMaintenanceSchedule(ctx: any) {
  for (const _task of ctx.db.maintenanceSchedule.iter()) return;
  ctx.db.maintenanceSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(MAINTENANCE_INTERVAL_MICROS),
  });
}

function ensureMaintenanceSweepSchedule(ctx: any) {
  for (const _task of ctx.db.maintenanceSweepSchedule.iter()) return;
  ctx.db.maintenanceSweepSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(5n * MAINTENANCE_INTERVAL_MICROS),
  });
}

function insertChatMessage(
  ctx: any,
  sender: any,
  senderName: string,
  message: string,
  replayId = 0n,
  moderated = false,
  reply?: { messageId: bigint; senderName: string; message: string },
  guildReplayKey = "",
) {
  const progress = ctx.db.playerProgress.identity.find(sender);
  const profile = ctx.db.playerProfile.identity.find(sender);
  const inserted = ctx.db.chatMessage.insert({
    id: 0n,
    sender,
    senderName,
    senderIsGuest: ctx.db.playerAccountStatus.identity.find(sender)?.isGuest ?? false,
    message,
    replayId,
    sentAt: ctx.timestamp,
    powerLevel: progress ? effectivePowerForProgress(ctx, progress) : 0,
    senderGender: profile?.gender ?? PLAYER_GENDER_UNSET,
    moderated,
    replyToMessageId: reply?.messageId ?? 0n,
    replyToSenderName: reply?.senderName ?? "",
    replyToMessage: reply?.message ?? "",
    guildReplayKey,
  });
  updatePublicChatCursor(ctx, inserted.id);
  return inserted;
}

function clearExpiredHistory(ctx: any) {
  const chatCutoff = ctx.timestamp.microsSinceUnixEpoch - CHAT_HISTORY_RETENTION_MICROS;
  const replayCutoff = ctx.timestamp.microsSinceUnixEpoch - DUEL_REPLAY_RETENTION_MICROS;
  const staleMessageIds: bigint[] = [];
  const staleReplayIds: bigint[] = [];

  // Identifiers rise with time, so the expired messages are the oldest ones.
  // Walking up from the cursor stops at the first survivor instead of reading
  // the whole day, and it leaves the cursor correct without a second pass.
  const cursor = ctx.db.publicChatCursor.id.find(0);
  let firstLiveId = 0n;
  if (cursor?.firstId) {
    for (let id = cursor.firstId; id <= cursor.lastId; id++) {
      const message = ctx.db.chatMessage.id.find(id) as any;
      if (!message) continue;
      if (message.sentAt.microsSinceUnixEpoch >= chatCutoff) { firstLiveId = id; break; }
      staleMessageIds.push(id);
    }
  } else {
    for (const message of ctx.db.chatMessage.iter() as Iterable<any>) {
      if (message.sentAt.microsSinceUnixEpoch < chatCutoff) staleMessageIds.push(message.id);
    }
  }
  for (const replay of ctx.db.duelReplay.iter() as Iterable<any>) {
    if (replay.createdAt.microsSinceUnixEpoch < replayCutoff) staleReplayIds.push(replay.id);
  }

  for (const id of staleMessageIds) { removeMessageReactions(ctx, "public", id); ctx.db.chatMessage.id.delete(id); }
  for (const id of staleReplayIds) ctx.db.duelReplay.id.delete(id);
  pruneExpiredSocialMessages(ctx, ctx.timestamp.microsSinceUnixEpoch);
  if (cursor?.firstId) ctx.db.publicChatCursor.id.update({ ...cursor, firstId: firstLiveId });
  else updatePublicChatCursor(ctx);
}

function trimStartupTelemetry(ctx: ModuleReducerCtx) {
  const rows = [...ctx.db.startupTelemetryEvent.iter()]
    .map((row) => ({ id: row.id, recordedAtMicros: row.recordedAt.microsSinceUnixEpoch }));
  for (const id of startupTelemetryIdsToDelete(
    rows,
    ctx.timestamp.microsSinceUnixEpoch,
    STARTUP_TELEMETRY_MAX_ROWS,
  )) {
    ctx.db.startupTelemetryEvent.id.delete(id);
  }
}

function clearExpiredStartupTelemetryRateLimits(ctx: ModuleReducerCtx) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredSenders: Identity[] = [];
  for (const rate of ctx.db.startupTelemetryRateLimit.iter()) {
    const startedAt = rate.windowStartedAt.microsSinceUnixEpoch;
    if (now < startedAt || now - startedAt >= STARTUP_TELEMETRY_RATE_WINDOW_MICROS) {
      expiredSenders.push(rate.sender);
    }
  }
  for (const sender of expiredSenders) ctx.db.startupTelemetryRateLimit.sender.delete(sender);
}

function enterWorldPresence(ctx: any, tabId: string, forceTakeover = false, supportsTutorial = false) {
  const session = requireSupportedSessionProtocol(ctx);
  requireCurrentLegalConsent(ctx);
  if (!ctx.connectionId) return;
  const normalizedTabId = tabId.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(normalizedTabId)) throw new SenderError("Invalid Wildstat tab session.");
  const virtualRegistration = ctx.db.virtualPlayer.identity.find(ctx.sender);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (controller && !sameConnection(controller.connectionId, ctx.connectionId)) {
    const controllerSession = ctx.db.playerSession.connectionId.find(controller.connectionId);
    const sameTab = controllerSession?.tabId && controllerSession.tabId === normalizedTabId;
    if (controllerSession?.enteredWorld && !sameTab) {
      if (!forceTakeover) throw new SenderError("Wildstat is active in another tab.");
      ctx.db.playerSession.connectionId.update({ ...controllerSession, enteredWorld: false });
    }
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: ctx.connectionId });
  } else if (!controller) {
    ctx.db.playerController.insert({ identity: ctx.sender, connectionId: ctx.connectionId });
  }

  if (!session.enteredWorld || session.tabId !== normalizedTabId) {
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: true, tabId: normalizedTabId });
  }

  let existingProfile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!existingProfile) {
    insertSnapshotRow(ctx, "playerProfile", {
      identity: ctx.sender,
      displayName: generatedDisplayName(ctx.sender),
      profileIcon: 0,
      playerSprite: 0,
      skinTone: ctx.random.integerInRange(0, PLAYER_SKIN_TONES.length - 1),
      gender: PLAYER_GENDER_UNSET,
    });
  } else {
    existingProfile = repairModeratedDisplayName(ctx, existingProfile);
  }
  ensureGemWallet(ctx, ctx.sender);
  if (hasSpacetimeAuthAccount(ctx)) ensureDailyGemBonusState(ctx, ctx.sender);

  const lifetime = ensurePlayerLifetime(ctx);

  let existingProgress: any = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!existingProgress) {
    existingProgress = defaultPlayerProgress(ctx.sender);
    if (supportsTutorial && !existingProfile && !virtualRegistration) ctx.db.playerOnboarding.insert({ identity: ctx.sender, step: 1 });
    insertSnapshotRow(ctx, "playerProgress", existingProgress);
    markPlayerBalanceCurrent(ctx);
  } else {
    existingProgress = migratePlayerBalance(ctx, existingProgress);
    // Balance v9 unlocks are authoritative. Historical shared-boss results and
    // a stale presence row must not re-open maps deliberately locked by rebalancing.
    const equippedFeet = equippedFeetForProgress(existingProgress);
    const equippedHead = equippedHeadForProgress(existingProgress);
    const equippedChest = equippedChestForProgress(existingProgress);
    const equippedRightHand = equippedRightHandForProgress(existingProgress);
    const equippedLeftHand = equippedRightHand ? "" : equippedLeftHandForProgress(existingProgress);
    const inventoryJson = JSON.stringify(inventoryForProgress(existingProgress));
    const cosmeticEquipment = cosmeticEquipmentForProgress({ ...existingProgress, inventoryJson });
    const speed = playerBaseMovementSpeed(equippedFeet === TRAILBLAZER_BOOTS);
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
      updateSnapshotRow(ctx, "playerProgress", migratedProgress);
      existingProgress = migratedProgress;
    }
  }

  ensureCutsceneHistory(ctx, ctx.sender);
  researchForPlayer(ctx, ctx.sender);
  syncSenderAccountStatus(ctx);
  touchPlayerAccessAudit(ctx, session.protocolVersion);
  backfillKnownAccessAudit(ctx);

  const existing = playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender));
  const presencePreference = ctx.db.developerPresencePreference.identity.find(ctx.sender);
  // Cached mobile builds cannot complete the new tutorial. Returning through a
  // legacy entry safely skips it without rewards rather than hiding the player.
  if (!supportsTutorial && needsOnboarding(ctx, ctx.sender)) {
    const onboarding = ctx.db.playerOnboarding.identity.find(ctx.sender)!;
    ctx.db.playerOnboarding.identity.update({ ...onboarding, step: 6 });
    existingProgress = { ...existingProgress, introComplete: true };
    updateSnapshotRow(ctx, "playerProgress", existingProgress);
  }
  const visibleOnEntry = (ctx.db.playerMultiplayerPreference.identity.find(ctx.sender)?.enabled ?? false)
    && !needsOnboarding(ctx, ctx.sender) && (isDeveloperIdentity(ctx.sender)
    ? presencePreference?.visible ?? existing?.isVisible ?? false
    : true);
  if (isDeveloperIdentity(ctx.sender) && !presencePreference) {
    ctx.db.developerPresencePreference.insert({ identity: ctx.sender, visible: visibleOnEntry });
  }
  if (!existing) {
    ctx.db.playerLifetime.identity.update({ ...lifetime, sessionStartedAt: ctx.timestamp });
  }
  const equipmentPresentation = equipmentPresentationForProgress(existingProgress);
  if (existing) {
    if (["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) {
      updateSnapshotRow(ctx, "player", {
        ...existing,
        mapId: canonicalMapId(existing.mapId),
        ...playerZone(existing.x, existing.y),
        ...powerFieldsForProgress(ctx, existingProgress),
        speed: effectiveMovementSpeedForProgress(ctx, existingProgress),
        ...stoppedMotionFields(existing, true),
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
    updateSnapshotRow(ctx, "player", {
      ...existing,
      mapId: entryMapId,
      x: entryPosition.x,
      y: entryPosition.y,
      ...playerZone(entryPosition.x, entryPosition.y),
      facing: Number.isFinite(existing.facing) ? existing.facing : 0,
      ...stoppedMotionFields(existing, true),
      ...powerFieldsForProgress(ctx, existingProgress),
      speed: effectiveMovementSpeedForProgress(ctx, existingProgress),
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
    ...powerFieldsForProgress(ctx, existingProgress),
    // Cosmetic boots never affect movement stats.
    speed: effectiveMovementSpeedForProgress(ctx, existingProgress),
    ...stoppedMotionFields({ simulationTick: 0, motionEpoch: 0 }, true),
    lastInputAt: ctx.timestamp,
    lastInputSequence: 0,
    protocolVersion: session.protocolVersion,
    controllerTabId: normalizedTabId,
    ...equipmentPresentation,
    isVisible: visibleOnEntry,
  };
  insertSnapshotRow(ctx, "player", insertedPlayer);
  syncPlayerMotion(ctx, insertedPlayer);
  syncPlayerMotionIdentity(ctx, insertedPlayer);
  syncPlayerMapMarker(ctx, insertedPlayer, true);
  ensureRealtimeFrameSchedules(ctx);
  reconcileOnlinePlayers(ctx);
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  // Deny game-session admission before initialization work. Leave the notice
  // readable so clients can disconnect without mistaking this for an expired
  // guest token and creating a new guest account.
  if (defeatRestrictionError(ctx)) return;
  ensureMaintenanceSchedule(ctx);
  // Initialization and balance reconciliation run once per module version.
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
        ...stoppedMotionFields(currentPlayer, true),
        lastInputAt: ctx.timestamp,
        lastInputSequence: replacement.lastInputSequence,
        protocolVersion: replacement.protocolVersion,
        controllerTabId: replacement.tabId,
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotion(ctx, nextPlayer);
      syncPlayerMotionIdentity(ctx, nextPlayer);
    }
    return;
  }
  ctx.db.playerController.identity.delete(ctx.sender);

  if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)) {
    // The account coordinator owns admission lifetime. Deleting this row on a
    // transient socket loss strands retries: the unchanged snapshot is not sent
    // again, while enterShardPresence still requires its admitted player row.
    const currentPlayer = playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender));
    if (currentPlayer) {
      const stopped = { ...currentPlayer, ...stoppedMotionFields(currentPlayer, true), lastInputAt: ctx.timestamp };
      updateSnapshotRow(ctx, "player", stopped);
      syncPlayerMotion(ctx, stopped);
      syncPlayerMotionIdentity(ctx, stopped);
    }
    return;
  }

  if (isDeveloperIdentity(ctx.sender)) clearVirtualPlayersForOwner(ctx, ctx.sender);
  finishLifetimeSession(ctx, ctx.sender);
  removeIdentityPresence(ctx, ctx.sender);
});

export const runMaintenance = spacetimedb.reducer(
  { maintenance: maintenanceSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance;
    if (isMapShard(ctx)) {
      ensureMotionDetailFrameSchedule(ctx);
      runPendingModuleMigrations(ctx);
      regenerateIdleBosses(ctx, ctx.db.shardRuntime.id.find(0)!.mapId);
      return;
    }
    const finishedDuels = [...ctx.db.duel.iter()].filter((current: any) =>
      current.status === "finishing" && ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
    );
    for (const current of finishedDuels) finishDuel(ctx, current);
    clearExpiredDuelRequests(ctx);
    ensureMotionDetailFrameSchedule(ctx);
    runPendingModuleMigrations(ctx);
    refreshLeaderboardIfDue(ctx);
    if (!rootShardingEnabled(ctx)) regenerateIdleBosses(ctx);
  },
);

// Exact scheduled completions remain authoritative. These scans only recover
// orphaned state or missing schedules, and run even with no players connected.
export const runMaintenanceSweep = spacetimedb.reducer(
  { maintenance: maintenanceSweepSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance;
    if (isMapShard(ctx)) {
      clearOrphanPresence(ctx);
      clearOrphanRealtimeState(ctx);
      return;
    }
    clearExpiredHistory(ctx);
    clearExpiredAccountLinks(ctx);
    clearOrphanPresence(ctx);
    clearOrphanRealtimeState(ctx);
    clearOrphanShardMembers(ctx);
    clearOrphanVirtualPlayers(ctx);
    clearExpiredVirtualPlayerRuns(ctx);
    reconcileOnlinePlayers(ctx);
    for (const active of [...ctx.db.activeResearch.iter()] as any[]) reconcileActiveResearch(ctx, active);
    for (const active of [...ctx.db.activeItemUpgrade.iter()] as any[]) {
      reconcileActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_ONE);
    }
    for (const active of [...ctx.db.activeItemUpgradeSlotTwo.iter()] as any[]) {
      reconcileActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_TWO);
    }
  },
);

export const cleanupStartupTelemetry = spacetimedb.reducer(
  { schedule: startupTelemetryCleanupSchedule.rowType },
  (ctx, _args) => {
    if (isMapShard(ctx)) return;
    cleanupConnectionDiagnostics(ctx);
    trimStartupTelemetry(ctx);
    clearExpiredStartupTelemetryRateLimits(ctx);
  },
);

export const publishMotionFrames = spacetimedb.reducer(
  { schedule: motionFrameSchedule.rowType },
  (_ctx, { schedule }) => { void schedule; },
);

export const publishMotionDetailFrames = spacetimedb.reducer(
  { schedule: motionDetailFrameSchedule.rowType },
  (ctx, _args) => {
    let continuePublishing = false;
    const staleIdentities: any[] = [];
    const sampleMotion = createPlayerMotionFrameSampler(ctx.timestamp.microsSinceUnixEpoch);
    for (const interest of ctx.db.playerMotionInterest.iter() as Iterable<any>) {
      const observer = ctx.db.playerMotion.identity.find(interest.identity);
      if (!observer || !observer.isVisible) {
        staleIdentities.push(interest.identity);
        continue;
      }
      continuePublishing = true;
      const samples: PlayerMotionSample[] = [];
      const sampleLimit = Math.min(interest.networkIds.length, PLAYER_MOTION_INTEREST_LIMIT);
      for (let index = 0; index < sampleLimit; index += 1) {
        const networkId = interest.networkIds[index];
        if (networkId === observer.networkId) continue;
        const motion = ctx.db.playerMotion.networkId.find(networkId);
        if (
          !motion ||
          motion.mapId !== observer.mapId ||
          !motion.isVisible
        ) continue;
        samples.push(sampleMotion(motion));
      }
      if (samples.length === 0) continue;
      ctx.db.playerMotionDetailFrame.insert({
        recipient: interest.identity,
        emittedAt: ctx.timestamp,
        playerCount: samples.length,
        payload: encodePlayerMotionFrame(samples),
      });
    }
    for (const identity of staleIdentities) ctx.db.playerMotionInterest.identity.delete(identity);

    if (continuePublishing) {
      ctx.db.motionDetailFrameSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_DETAIL_FRAME_INTERVAL_MICROS),
      });
    }
  },
);

export const publishMapFrames = spacetimedb.reducer(
  { schedule: mapFrameSchedule.rowType },
  (ctx, _args) => {
    let continuePublishing = false;
    let sampleVisiblePlayers = false;
    const maps = new Map<string, PlayerMapSample[]>();
    for (const state of ctx.db.playerMotionMapState.iter() as Iterable<any>) {
      // Home is private: it has no remote minimap dots or observers to serve.
      if (state.mapId === HOME_EXTERIOR_MAP_ID || state.playerCount === 0) continue;
      if (state.visibleCount > 1) continuePublishing = true;
      sampleVisiblePlayers ||= state.visibleCount > 0;
      // Keep a final single/empty frame to clear dots after a departure or hide.
      maps.set(state.mapId, []);
    }
    // Regional databases already contain one map. A second index on this hot
    // movement table would add write cost without narrowing those scans.
    // The root's private-home-only case never reads motion rows at all.
    if (sampleVisiblePlayers) {
      for (const motion of ctx.db.playerMotion.iter() as Iterable<any>) {
        if (motion.isVisible) maps.get(motion.mapId)?.push(motionSample(motion, ctx.timestamp.microsSinceUnixEpoch));
      }
    }
    for (const [mapId, samples] of maps) {
      const compacted = compactPlayerMapSamples(samples, WORLD.width, WORLD.height);
      ctx.db.playerMapFrame.insert({
        mapId,
        emittedAt: ctx.timestamp,
        playerCount: compacted.length,
        payload: encodePlayerMapFrame(compacted),
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
    const slot = normalizeUpgradeBenchSlot(schedule.slot);
    const active = activeItemUpgradeForSlot(ctx, schedule.identity, slot);
    if (!active || active.paused || active.itemId !== schedule.itemId || active.targetLevel !== schedule.targetLevel) return;
    reconcileActiveItemUpgrade(ctx, active, slot);
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

export const respawnMagmalisk = spacetimedb.reducer(
  { schedule: magmaliskRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const magmalisk = ensureMagmaliskBoss(ctx);
    if (magmalisk.alive || magmalisk.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < magmalisk.respawnAtMicros) return;
    clearMagmaliskCombatRows(ctx);
    ctx.db.magmaliskBoss.id.update({
      ...magmalisk,
      encounter: magmalisk.encounter + 1n,
      hp: magmalisk.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnGloomroot = spacetimedb.reducer(
  { schedule: gloomrootRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const gloomroot = ensureGloomrootBoss(ctx);
    if (gloomroot.alive || gloomroot.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < gloomroot.respawnAtMicros) return;
    clearGloomrootCombatRows(ctx);
    ctx.db.gloomrootBoss.id.update({
      ...gloomroot,
      encounter: gloomroot.encounter + 1n,
      hp: gloomroot.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnTidewyrm = spacetimedb.reducer(
  { schedule: tidewyrmRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const tidewyrm = ensureTidewyrmBoss(ctx);
    if (tidewyrm.alive || tidewyrm.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < tidewyrm.respawnAtMicros) return;
    clearTidewyrmCombatRows(ctx);
    ctx.db.tidewyrmBoss.id.update({
      ...tidewyrm,
      encounter: tidewyrm.encounter + 1n,
      hp: tidewyrm.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnKoiShogun = spacetimedb.reducer(
  { schedule: koiShogunRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const koiShogun = ensureKoiShogunBoss(ctx);
    if (koiShogun.alive || koiShogun.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < koiShogun.respawnAtMicros) return;
    clearKoiShogunCombatRows(ctx);
    ctx.db.koiShogunBoss.id.update({
      ...koiShogun,
      encounter: koiShogun.encounter + 1n,
      hp: koiShogun.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);

export const respawnTempestKirin = spacetimedb.reducer(
  { schedule: tempestKirinRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const tempestKirin = ensureTempestKirinBoss(ctx);
    if (tempestKirin.alive || tempestKirin.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < tempestKirin.respawnAtMicros) return;
    clearTempestKirinCombatRows(ctx);
    ctx.db.tempestKirinBoss.id.update({
      ...tempestKirin,
      encounter: tempestKirin.encounter + 1n,
      hp: tempestKirin.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnMiremaw = spacetimedb.reducer(
  { schedule: miremawRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const miremaw = ensureMiremawBoss(ctx);
    if (miremaw.alive || miremaw.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < miremaw.respawnAtMicros) return;
    clearMiremawCombatRows(ctx);
    ctx.db.miremawBoss.id.update({
      ...miremaw,
      encounter: miremaw.encounter + 1n,
      hp: miremaw.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnPrismshell = spacetimedb.reducer(
  { schedule: prismshellRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const prismshell = ensurePrismshellBoss(ctx);
    if (prismshell.alive || prismshell.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < prismshell.respawnAtMicros) return;
    clearPrismshellCombatRows(ctx);
    ctx.db.prismshellBoss.id.update({
      ...prismshell,
      encounter: prismshell.encounter + 1n,
      hp: prismshell.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnIronhorn = spacetimedb.reducer(
  { schedule: ironhornRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const ironhorn = ensureIronhornBoss(ctx);
    if (ironhorn.alive || ironhorn.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < ironhorn.respawnAtMicros) return;
    clearIronhornCombatRows(ctx);
    ctx.db.ironhornBoss.id.update({
      ...ironhorn,
      encounter: ironhorn.encounter + 1n,
      hp: ironhorn.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnDreadreaper = spacetimedb.reducer(
  { schedule: dreadreaperRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const dreadreaper = ensureDreadreaperBoss(ctx);
    if (dreadreaper.alive || dreadreaper.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < dreadreaper.respawnAtMicros) return;
    clearDreadreaperCombatRows(ctx);
    ctx.db.dreadreaperBoss.id.update({
      ...dreadreaper,
      encounter: dreadreaper.encounter + 1n,
      hp: dreadreaper.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnVoltwarden = spacetimedb.reducer(
  { schedule: voltwardenRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const voltwarden = ensureVoltwardenBoss(ctx);
    if (voltwarden.alive || voltwarden.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < voltwarden.respawnAtMicros) return;
    clearVoltwardenCombatRows(ctx);
    ctx.db.voltwardenBoss.id.update({
      ...voltwarden,
      encounter: voltwarden.encounter + 1n,
      hp: voltwarden.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnGravebloom = spacetimedb.reducer(
  { schedule: gravebloomRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const gravebloom = ensureGravebloomBoss(ctx);
    if (gravebloom.alive || gravebloom.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < gravebloom.respawnAtMicros) return;
    clearGravebloomCombatRows(ctx);
    ctx.db.gravebloomBoss.id.update({
      ...gravebloom,
      encounter: gravebloom.encounter + 1n,
      hp: gravebloom.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);
export const respawnAegisPrime = spacetimedb.reducer(
  { schedule: aegisPrimeRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const aegisPrime = ensureAegisPrimeBoss(ctx);
    if (aegisPrime.alive || aegisPrime.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < aegisPrime.respawnAtMicros) return;
    clearAegisPrimeCombatRows(ctx);
    ctx.db.aegisPrimeBoss.id.update({
      ...aegisPrime,
      encounter: aegisPrime.encounter + 1n,
      hp: aegisPrime.maxHp,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  },
);


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

export const damageSpiderBatch = spacetimedb.reducer(
  { hits: t.u32() },
  (ctx, { hits }) => applySpiderDamage(ctx, hits),
);

export const damageSpiderFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applySpiderDamage(ctx, hits, { x, y }),
);

export const damageFrostclawFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyFrostclawDamage(ctx, hits, { x, y }),
);

export const damageMagmaliskFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyMagmaliskDamage(ctx, hits, { x, y }),
);

export const damageGloomrootFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyGloomrootDamage(ctx, hits, { x, y }),
);

export const damageTidewyrmFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyTidewyrmDamage(ctx, hits, { x, y }),
);

export const damageKoiShogunFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyKoiShogunDamage(ctx, hits, { x, y }),
);

export const damageTempestKirinFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyTempestKirinDamage(ctx, hits, { x, y }),
);
export const damageMiremawFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyMiremawDamage(ctx, hits, { x, y }),
);
export const damagePrismshellFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyPrismshellDamage(ctx, hits, { x, y }),
);
export const damageIronhornFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyIronhornDamage(ctx, hits, { x, y }),
);
export const damageDreadreaperFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyDreadreaperDamage(ctx, hits, { x, y }),
);
export const damageVoltwardenFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyVoltwardenDamage(ctx, hits, { x, y }),
);
export const damageGravebloomFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyGravebloomDamage(ctx, hits, { x, y }),
);
export const damageAegisPrimeFromPosition = spacetimedb.reducer(
  { hits: t.u32(), x: t.f64(), y: t.f64() },
  (ctx, { hits, x, y }) => applyAegisPrimeDamage(ctx, hits, { x, y }),
);


// Release control stays on the account database; no map publish is needed for notices.
export const setReleaseWindow = spacetimedb.reducer(
  { id: t.string(), version: t.string(), phase: t.string(), startsAt: t.f64(), reload: t.bool() },
  (ctx, args) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "set_release_window", "Database owner required.");
    writeReleaseWindow(ctx, args);
  },
);
export const acknowledgeRelease = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  requireControllingPlayer(ctx);
  acknowledgeReleaseWindow(ctx, id);
});

// One-time backfill for clients already online when the compatibility bridge ships.
export const refreshDuelWireAccess = spacetimedb.reducer({}, (ctx) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "refresh_duel_wire_access", "Database owner required.");
  for (const player of ctx.db.player.iter()) {
    syncDuelWireAccess({ db: ctx.db, sender: player.identity }, player.protocolVersion);
  }
});

export const registerProtocol = spacetimedb.reducer(
  { protocolVersion: t.u32() },
  (ctx, { protocolVersion }) => {
    if (!isSupportedProtocol(protocolVersion)) {
      throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
    }
    const session = requireSession(ctx);
    syncDuelWireAccess(ctx, protocolVersion);
    ctx.db.playerSession.connectionId.update({ ...session, protocolVersion });
    const current = ctx.db.player.identity.find(ctx.sender);
    const controller = ctx.db.playerController.identity.find(ctx.sender);
    if (current && ctx.connectionId && controller && sameConnection(controller.connectionId, ctx.connectionId)) {
      updateSnapshotRow(ctx, "player", { ...current, protocolVersion });
    }
    const activeResearch = ctx.db.activeResearch.identity.find(ctx.sender);
    if (activeResearch) reconcileActiveResearch(ctx, activeResearch);
    for (const { slot, active } of activeItemUpgradeEntriesFor(ctx, ctx.sender)) {
      reconcileActiveItemUpgrade(ctx, active, slot);
    }
  },
);

export const recordConnectionDiagnostic = spacetimedb.reducer(
  { payload: t.string() },
  (ctx, { payload }) => {
    if (blockedSession(ctx)) return;
    requireSession(ctx);
    recordConnectionDiagnostics(ctx, payload);
  },
);

export const recordStartupTelemetry = spacetimedb.reducer(
  { samples: t.array(StartupTelemetrySample) },
  (ctx, { samples }) => {
    const session = requireSupportedSessionProtocol(ctx);
    const normalized = samples
      .slice(0, STARTUP_TELEMETRY_MAX_BATCH)
      .map(normalizeStartupTelemetrySample)
      .filter((sample) => sample !== null);
    if (!normalized.length) return;

    const currentRate = ctx.db.startupTelemetryRateLimit.sender.find(ctx.sender);
    const nextRate = nextStartupTelemetryRateState(
      ctx.timestamp.microsSinceUnixEpoch,
      normalized.length,
      currentRate
        ? {
          windowStartedAtMicros: currentRate.windowStartedAt.microsSinceUnixEpoch,
          sampleCount: currentRate.sampleCount,
        }
        : undefined,
    );
    if (nextRate.acceptedCount <= 0) return;

    const rateRow = {
      sender: ctx.sender,
      windowStartedAt: new Timestamp(nextRate.windowStartedAtMicros),
      sampleCount: nextRate.sampleCount,
    };
    if (currentRate) ctx.db.startupTelemetryRateLimit.sender.update(rateRow);
    else ctx.db.startupTelemetryRateLimit.insert(rateRow);

    // Retention and the row cap are enforced by the 15-minute cleanup.
    // Recording a startup batch must never scan the telemetry history.
    for (const sample of normalized.slice(0, nextRate.acceptedCount)) {
      ctx.db.startupTelemetryEvent.insert({
        id: 0n,
        ...sample,
        protocolVersion: session.protocolVersion,
        recordedAt: ctx.timestamp,
      });
    }
  },
);

export const acceptTerms = spacetimedb.reducer(
  { termsVersion: t.string(), ageBand: t.u8() },
  (ctx, { termsVersion, ageBand }) => {
    requireSession(ctx);
    if (termsVersion !== TERMS_VERSION) throw new SenderError("Wildstat Terms changed. Review them again.");
    if (!isEligiblePlayerAgeBand(ageBand)) {
      throw new SenderError("Wildstat is currently available to players age 13 and older.");
    }
    const current = ctx.db.playerLegalConsent.identity.find(ctx.sender);
    if (current?.termsVersion === termsVersion && current.ageBand === ageBand) return;
    const next = { identity: ctx.sender, termsVersion, ageBand, acceptedAt: ctx.timestamp };
    if (current) ctx.db.playerLegalConsent.identity.update(next);
    else ctx.db.playerLegalConsent.insert(next);
  },
);

export const enterWorld = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  requireSupportedSessionProtocol(ctx);
  if (isMapShard(ctx)) enterShardPresence(ctx, tabId);
  else {
    enterWorldPresence(ctx, tabId);
    pinMapBalance(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
    beginBossTimeBudget(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
  }
});

/** Only tutorial-capable clients use this additive entry point. */
export const enterWorldWithTutorial = spacetimedb.reducer({ tabId: t.string(), forceTakeover: t.bool() }, (ctx, { tabId, forceTakeover }) => {
  requireSupportedSessionProtocol(ctx);
  if (isMapShard(ctx)) throw new SenderError("Connect to the account database.");
  enterWorldPresence(ctx, tabId, forceTakeover, true);
  pinMapBalance(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
    beginBossTimeBudget(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
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
  (ctx, { code }) => claimGuestAccountFor(ctx, code),
);

function changePlayerDisplayName(ctx: ModuleReducerCtx, displayName: string, expectedCost: number) {
  const activePlayer = requireControllingPlayer(ctx);
  const normalized = displayName.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9 _-]{2,20}$/.test(normalized)) {
    throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores");
  }
  requireAllowedDisplayName(normalized);

  const existing = ctx.db.playerProfile.identity.find(ctx.sender);
  if (existing?.displayName === normalized) return;
  const normalizedComparison = normalized.toLowerCase();
  for (const profile of ctx.db.playerProfile.iter() as Iterable<any>) {
    if (!sameIdentity(profile.identity, ctx.sender) && profile.displayName.toLowerCase() === normalizedComparison) {
      throw new SenderError("Player name is already taken.");
    }
  }
  const cooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
  const terms = nameChangeStatus(cooldown ? Number(cooldown.changedAt.microsSinceUnixEpoch / 1000n) : null,
    Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), Number(ctx.db.playerGemWallet.identity.find(ctx.sender)?.balance ?? 0n));
  if (terms.availableAtMs > terms.serverNowMs) throw new SenderError("You can change your name once every 24 hours.");
  if (expectedCost !== terms.cost) throw new SenderError("Name changes cost 50 Gems after the first free change. Reopen the name editor to continue.");
  if (terms.cost > 0) applyGemBalanceChange(ctx, { identity: ctx.sender, delta: -BigInt(terms.cost), kind: "name_change",
    note: "Player name change", externalReference: `name-change:${ctx.sender.toHexString()}:${ctx.timestamp.microsSinceUnixEpoch}` });

  if (existing) {
    updateSnapshotRow(ctx, "playerProfile", { ...existing, displayName: normalized });
  } else {
    insertSnapshotRow(ctx, "playerProfile", { identity: ctx.sender, displayName: normalized, profileIcon: 0, playerSprite: 0, skinTone: ctx.random.integerInRange(0, PLAYER_SKIN_TONES.length - 1), gender: PLAYER_GENDER_UNSET });
  }
  if (cooldown) ctx.db.playerNameCooldown.identity.update({ ...cooldown, changedAt: ctx.timestamp });
  else ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: ctx.timestamp });
  syncDisplayNamePresentation(ctx, ctx.sender, normalized);
  syncPlayerMotionIdentity(ctx, activePlayer);
  touchPlayerAccessAudit(ctx, activePlayer.protocolVersion);
}
// Older clients and the tutorial may only perform a free initial name choice.
export const setDisplayName = spacetimedb.reducer({ displayName: t.string() },
  (ctx, { displayName }) => changePlayerDisplayName(ctx, displayName, 0));
export const changeDisplayName = spacetimedb.reducer({ displayName: t.string(), expectedCost: t.u32() },
  (ctx, { displayName, expectedCost }) => changePlayerDisplayName(ctx, displayName, expectedCost));
const nameChangeStatusResult = t.object("NameChangeStatus", {
  cost: t.u32(), availableAtMs: t.f64(), serverNowMs: t.f64(), balance: t.f64(),
});
export const getMapBalance = spacetimedb.procedure({ mapId: t.string() }, t.string(), (ctx, { mapId }) => ctx.withTx(tx => {
  const active = tx.db.player.identity.find(tx.sender);
  if (!active || active.mapId !== mapId) throw new SenderError("Enter the map before loading its balance.");
  pinMapBalance(tx, mapId, true, 1);
  const row = tx.db.playerMapBalance.identity.find(tx.sender);
  if (!row || row.mapId !== mapId) throw new SenderError("Map balance is not ready. Retry after entering the map.");
  return row.snapshotJson;
}));
export const getMapConfiguration = spacetimedb.procedure({ mapId: t.string() }, t.string(), (ctx, { mapId }) => ctx.withTx(tx => {
  const active = tx.db.player.identity.find(tx.sender);
  if (!active || active.mapId !== mapId) throw new SenderError("Enter the map before loading its balance.");
  pinMapBalance(tx, mapId, true, 2);
  const row = tx.db.playerMapBalance.identity.find(tx.sender);
  if (!row || row.mapId !== mapId) throw new SenderError("Map balance is not ready. Retry after entering the map.");
  return row.snapshotJson;
}));
export const getBalanceEditor = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  requireDeveloperSession(tx, "get_balance_editor");
  return JSON.stringify(balanceEditorState(tx));
}));
export const previewMapBalance = spacetimedb.procedure({ mapId: t.string(), settingsJson: t.string() }, t.string(), (ctx, args) => ctx.withTx(tx => {
  requireDeveloperSession(tx, "preview_map_balance");
  if (args.settingsJson.length > 20_000) throw new SenderError("Balance configuration too large.");
  return JSON.stringify(resolveMapBalance(args.mapId, validateBalanceSettings(JSON.parse(args.settingsJson)), 0));
}));
export const setMapBalance = spacetimedb.reducer({ expectedRevision: t.u32(), settingsJson: t.string() }, (ctx, args) => {
  requireDeveloper(ctx, "set_map_balance");
  saveMapBalance(ctx, args.expectedRevision, args.settingsJson);
});
export const restoreMapBalance = spacetimedb.reducer({ expectedRevision: t.u32(), revision: t.u32() }, (ctx, args) => {
  requireDeveloper(ctx, "restore_map_balance");
  const row = ctx.db.mapBalanceVersion.revision.find(args.revision);
  if (!row) throw new SenderError("Balance version not found.");
  saveMapBalance(ctx, args.expectedRevision, row.settingsJson);
});

export const getNameChangeStatus = spacetimedb.procedure({}, nameChangeStatusResult, ctx => ctx.withTx(tx => {
  const cooldown = tx.db.playerNameCooldown.identity.find(tx.sender);
  return nameChangeStatus(cooldown ? Number(cooldown.changedAt.microsSinceUnixEpoch / 1000n) : null,
    Number(tx.timestamp.microsSinceUnixEpoch / 1000n), Number(tx.db.playerGemWallet.identity.find(tx.sender)?.balance ?? 0n));
}));

export const setDeveloperNameTag = spacetimedb.reducer(
  { visible: t.bool() },
  (ctx, { visible }) => {
    requireDeveloper(ctx, "set_developer_name_tag");
    const previous = ctx.db.playerNameTag.identity.find(ctx.sender);
    if (previous) ctx.db.playerNameTag.identity.update({ ...previous, showDevTag: visible });
    else ctx.db.playerNameTag.insert({ identity: ctx.sender, guildTag: "", showDevTag: visible });
  },
);

export const setDeveloperPresence = spacetimedb.reducer(
  { visible: t.bool() },
  (ctx, { visible }) => {
    requireDeveloper(ctx, "set_developer_presence");
    const activePlayer = requireControllingPlayer(ctx);
    const preference = ctx.db.developerPresencePreference.identity.find(ctx.sender);
    if (preference) ctx.db.developerPresencePreference.identity.update({ ...preference, visible });
    else ctx.db.developerPresencePreference.insert({ identity: ctx.sender, visible });
    const effectiveVisible = visible && (ctx.db.playerMultiplayerPreference.identity.find(ctx.sender)?.enabled ?? false)
      && !needsOnboarding(ctx, ctx.sender);
    if (activePlayer.isVisible === effectiveVisible) return;
    const nextPlayer = { ...playerWithMotion(ctx, activePlayer), isVisible: effectiveVisible, lastInputAt: ctx.timestamp };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotion(ctx, nextPlayer);
    syncPlayerMotionIdentity(ctx, nextPlayer);
    syncPlayerMapMarker(ctx, nextPlayer, true);
    ensureRealtimeFrameSchedules(ctx);
  },
);

export const setMultiplayerEnabled = spacetimedb.reducer({ enabled: t.bool() }, (ctx, { enabled }) => {
  const player = requireControllingPlayer(ctx);
  if (isMapShard(ctx)) throw new SenderError("Use your account connection for multiplayer settings.");
  writeMultiplayerPreference(ctx, enabled);
  const visible = enabled && !needsOnboarding(ctx, ctx.sender) && (!isDeveloperIdentity(ctx.sender)
    || (ctx.db.developerPresencePreference.identity.find(ctx.sender)?.visible ?? false));
  if (!visible && ctx.db.playerMotionInterest.identity.find(ctx.sender)) ctx.db.playerMotionInterest.identity.delete(ctx.sender);
  if (player.isVisible === visible) return;
  const next = { ...playerWithMotion(ctx, player), isVisible: visible };
  updateSnapshotRow(ctx, "player", next);
  syncPlayerMotion(ctx, next);
  syncPlayerMotionIdentity(ctx, next);
  syncPlayerMapMarker(ctx, next, true);
  ensureRealtimeFrameSchedules(ctx);
});

// Kill gems: bodies live in kill-gems.ts; this is the schema-facing declaration.
export const devGrantRetroactiveKillGems = spacetimedb.reducer({}, (ctx) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_grant_retroactive_kill_gems");
  killGems.grantRetroactiveKillGems(ctx);
});

// Development-only economy seeding. Production purchase credits will use
// verified store/webhook references through a separate trusted server path.
export const devAdjustGems = spacetimedb.reducer(
  { identity: t.identity(), delta: t.i64(), reason: t.string() },
  (ctx, { identity, delta, reason }) => {
    requireDeveloper(ctx, "dev_adjust_gems");
    const note = reason.trim().replace(/\s+/g, " ");
    if (note.length < 3 || note.length > 120) {
      throw new SenderError("Gem adjustment reason must be 3-120 characters.");
    }
    const wallet = ensureGemWallet(ctx, identity);
    applyGemBalanceChange(ctx, {
      identity,
      delta,
      kind: "developer_adjustment",
      note,
      externalReference: `developer:${ctx.sender.toHexString()}:${identity.toHexString()}:${ctx.timestamp.microsSinceUnixEpoch}:${wallet.revision + 1n}`,
    });
  },
);

// Developer/database-owner QA hook. It reverses the current reward through
// the ledger before making it claimable again, so previewing the popup does
// not mint extra currency.
export const devResetDailyGemBonus = spacetimedb.reducer(
  { identity: t.identity() },
  (ctx, { identity }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) {
      requireDeveloper(ctx, "dev_reset_daily_gem_bonus");
      if (!sameIdentity(identity, ctx.sender)) throw new SenderError("Developers may reset only their own daily bonus.");
    }
    const dayKey = currentUtcDayKey(ctx);
    const state = ensureDailyGemBonusState(ctx, identity);
    if (state.claimableDayKey === dayKey) return;

    const wallet = ensureGemWallet(ctx, identity);
    if (wallet.balance < DAILY_LOGIN_GEM_BONUS) {
      throw new SenderError("At least 7 Gems are needed to reverse today's bonus for preview.");
    }
    const nextCycle = state.claimCycle + 1n;
    applyGemBalanceChange(ctx, {
      identity,
      delta: -DAILY_LOGIN_GEM_BONUS,
      kind: "developer_daily_bonus_reset",
      note: "Reversed today's daily bonus for Claim-window preview.",
      externalReference: `daily-reset:${identity.toHexString()}:${dayKey}:${nextCycle}`,
    });
    ctx.db.dailyGemBonus.identity.update({
      ...state,
      claimableDayKey: dayKey,
      lastClaimedDayKey: "",
      claimCycle: nextCycle,
      revision: state.revision + 1n,
      updatedAt: ctx.timestamp,
    });
  },
);

export const devBeginVirtualPlayerLoadTest = spacetimedb.reducer(
  { ticket: t.string(), maxCount: t.u32() },
  (ctx, { ticket, maxCount }) => {
    // The external Node load generator authenticates as the developer without
    // taking player control away from the open game tab.
    requireDeveloperSession(ctx, "dev_begin_virtual_player_load_test");
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
    requireDeveloperSession(ctx, "dev_clear_virtual_players");
    clearVirtualPlayersForOwner(ctx, ctx.sender);
  },
);

export const devSetAccessAuditLabel = spacetimedb.reducer(
  { identity: t.identity(), label: t.string() },
  (ctx, { identity, label }) => {
    requireDeveloper(ctx, "dev_set_access_audit_label");
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
    requireDeveloper(ctx, "dev_delete_bug_report");
    if (!ctx.db.bugReport.id.find(id)) throw new SenderError("Bug report not found.");
    ctx.db.bugReport.id.delete(id);
  },
);

// Owner/developer maintenance for removing legacy pre-account saves. Every
// condition is checked again inside the transaction so a stale leaderboard
// screenshot or a player reconnect cannot turn this into a broader deletion.
export const devDeleteLegacyPlayer = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string() },
  (ctx, { identity, expectedDisplayName }) => {
    if (!isDeveloperIdentity(ctx.sender) && !isDatabaseOwnerIdentity(ctx.sender)) {
      denyPrivilegedAccess(ctx, "dev_delete_legacy_player", "Developer access required.");
    }
    if (isDeveloperIdentity(identity) || isDatabaseOwnerIdentity(identity)) {
      throw new SenderError("Protected identity cannot be deleted.");
    }
    if (isVirtualPlayer(ctx, identity)) throw new SenderError("Use virtual-player cleanup for simulated players.");

    const profile = ctx.db.playerProfile.identity.find(identity);
    const progress = ctx.db.playerProgress.identity.find(identity);
    const leaderboard = ctx.db.leaderboardEntry.identity.find(identity);
    if (!profile || !progress || !leaderboard) throw new SenderError("Legacy player save not found.");
    if (profile.displayName !== expectedDisplayName.trim()) throw new SenderError("Player name changed; deletion refused.");
    if (leaderboard.isGuest || leaderboard.powerLevel >= 104 || effectivePowerForProgress(ctx, progress) >= 104) {
      throw new SenderError("Player no longer matches the requested leaderboard criteria.");
    }
    if (ctx.db.playerAccountStatus.identity.find(identity)) {
      throw new SenderError("Known account status found; deletion refused.");
    }
    if (
      ctx.db.player.identity.find(identity) ||
      ctx.db.playerController.identity.find(identity) ||
      [...ctx.db.playerSession.byIdentity.filter(identity) as Iterable<any>].length > 0
    ) throw new SenderError("Player is online; deletion refused.");
    for (const current of ctx.db.duel.iter() as Iterable<any>) {
      if (sameIdentity(current.challenger, identity) || sameIdentity(current.opponent, identity)) {
        throw new SenderError("Player has an active duel; deletion refused.");
      }
    }

    removePlayerIdentityData(ctx, identity);
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
      denyPrivilegedAccess(ctx, "dev_repair_player_joined_at", "Developer access required.");
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

// Maintenance-only stat normalization for accounts that need to be placed on
// the same raw combat baseline. Equipment, upgrades, research, inventory, map
// access, and profile data intentionally remain owned by the target account.
export const devCopyPlayerCombatStats = spacetimedb.reducer(
  { sourceIdentity: t.identity(), targetIdentity: t.identity() },
  (ctx, { sourceIdentity, targetIdentity }) => {
    if (!isDeveloperIdentity(ctx.sender) && !isDatabaseOwnerIdentity(ctx.sender)) {
      denyPrivilegedAccess(ctx, "dev_copy_player_combat_stats", "Developer access required.");
    }
    if (sameIdentity(sourceIdentity, targetIdentity)) throw new SenderError("Source and target must differ.");
    const source = ctx.db.playerProgress.identity.find(sourceIdentity);
    const target = ctx.db.playerProgress.identity.find(targetIdentity);
    if (!source || !target) throw new SenderError("Player progress row not found.");

    const nextProgress = {
      ...target,
      maxHp: source.maxHp,
      damage: source.damage,
      attackRate: source.attackRate,
      projectileSpeed: source.projectileSpeed,
      projectileCount: source.projectileCount,
      attackRange: source.attackRange,
      armor: source.armor,
      regen: source.regen,
      speed: source.speed,
      speedOverride: source.speedOverride,
    };
    updateSnapshotRow(ctx, "playerProgress", nextProgress);
    const active = ctx.db.player.identity.find(targetIdentity);
    if (active) {
      const nextPlayer = {
        ...active,
        speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
        ...powerFieldsForProgress(ctx, nextProgress),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    refreshLeaderboard(ctx);
  },
);

export const setProfileIcon = spacetimedb.reducer(
  { profileIcon: t.u32() },
  (ctx, { profileIcon }) => {
    requireControllingPlayer(ctx);
    if (!isValidProfileIcon(profileIcon)) throw new SenderError("Choose an available profile picture.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.profileIcon === profileIcon) return;
    updateSnapshotRow(ctx, "playerProfile", { ...profile, profileIcon });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, profileIcon });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const setGender = spacetimedb.reducer(
  { gender: t.u8() },
  (ctx, { gender }) => {
    requireControllingPlayer(ctx);
    if (gender !== PLAYER_GENDER_UNSET && !isSelectedPlayerGender(gender)) {
      throw new SenderError("Gender must be unset, male, or female.");
    }
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.gender === gender) return;
    updateSnapshotRow(ctx, "playerProfile", { ...profile, gender });
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
    updateSnapshotRow(ctx, "playerProfile", { ...profile, playerSprite });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const setSkinTone = spacetimedb.reducer(
  { skinTone: t.u32() },
  (ctx, { skinTone }) => {
    requireControllingPlayer(ctx);
    if (!Number.isInteger(skinTone) || skinTone >= PLAYER_SKIN_TONES.length) throw new SenderError("Skin tone must be between 0 and 19.");
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    if (profile.skinTone === skinTone) return;
    updateSnapshotRow(ctx, "playerProfile", { ...profile, skinTone });
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, skinTone });
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  },
);

export const devSuspendPlayerAccount = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string(), untilMicros: t.u64(), reason: t.string() },
  (ctx, args) => {
    if (!isDatabaseOwnerIdentity(ctx.sender) || isMapShard(ctx)) denyPrivilegedAccess(ctx, "dev_suspend_player_account", "Account database owner required.");
    suspendPlayerAccount(ctx, args);
    finishLifetimeSession(ctx, args.identity);
    removeIdentityPresence(ctx, args.identity);
  },
);

export const devRollbackPlayerProgression = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string(), operationId: t.string(), baselineJson: t.string(), reason: t.string() },
  (ctx, args) => rollbackPlayerProgression(ctx, args, {
    requireOwner: () => {
      if (!isDatabaseOwnerIdentity(ctx.sender) || isMapShard(ctx)) denyPrivilegedAccess(ctx, "dev_rollback_player_progression", "Account database owner required.");
      if (activeDuelFor(ctx, args.identity)) throw new SenderError("Wait for this player's duel to finish.");
    },
    apply: (progress, mapIndex) => {
      writeProgressAndPresentation(ctx, progress);
      // Old shared-boss evidence must not restore revoked map access on login.
      for (const [boss, bit] of Object.entries(BOSS_REWARD_CLAIM_BITS)) {
        if (progress.bossRewardClaims & bit) continue;
        (ctx.db as any)[`${boss}Contribution`].identity.delete(args.identity);
        (ctx.db as any)[`${boss}AttackWindow`].identity.delete(args.identity);
      }
      const procedural = ctx.db.proceduralProgress.identity.find(args.identity);
      if (procedural) ctx.db.proceduralProgress.identity.update({ ...procedural, completed: 0 });
      const history = ctx.db.playerCutsceneHistory.identity.find(args.identity);
      if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history,
        seenMask: history.seenMask & unlockedPortalCutsceneMask(progress), generation: history.generation + 1 });
      const mapId = MAP_IDS[mapIndex];
      const arrival = mapIndex === 0 ? PLAYER_SPAWN : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
      const returnLocation = { identity: args.identity, mapId, ...arrival, facing: 0 };
      if (ctx.db.homeReturnLocation.identity.find(args.identity)) ctx.db.homeReturnLocation.identity.update(returnLocation);
      else ctx.db.homeReturnLocation.insert(returnLocation);
      const active = ctx.db.player.identity.find(args.identity);
      if (active) {
        const maxHp = maxHealthForProgress(ctx, args.identity, progress);
        const moved = transitionPlayerMap({ ...ctx, sender: args.identity }, { ...active, maxHp, hp: maxHp }, HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN);
        persistWorldLocation(ctx, moved);
      } else {
        releaseMapShard(ctx, args.identity);
        const location = { identity: args.identity, mapId: HOME_EXTERIOR_MAP_ID, ...HOME_EXTERIOR_SPAWN, facing: 0 };
        if (ctx.db.playerLastLocation.identity.find(args.identity)) ctx.db.playerLastLocation.identity.update(location);
        else ctx.db.playerLastLocation.insert(location);
      }
      for (const row of ctx.db.enemyDefeatBudget.identity.filter(args.identity)) ctx.db.enemyDefeatBudget.key.delete(row.key);
      if (ctx.db.bossDefeatWindow.identity.find(args.identity)) ctx.db.bossDefeatWindow.identity.delete(args.identity);
      if (ctx.db.bossMapDefeatWindow.identity.find(args.identity)) ctx.db.bossMapDefeatWindow.identity.delete(args.identity);
      // Keep accepted report cursors so old batches cannot award the same loot twice.
      refreshLeaderboard(ctx);
    },
  }),
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
    requireDeveloper(ctx, "dev_update_player_save");
    const profile = ctx.db.playerProfile.identity.find(update.identity);
    const progress = ctx.db.playerProgress.identity.find(update.identity);
    if (!profile || !progress) throw new SenderError("Player save row not found.");
    const displayName = update.displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(displayName)) {
      throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores.");
    }
    requireAllowedDisplayName(displayName);
    const bounded = (value: number, min: number, max: number, field: string) => {
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new SenderError(`${field} must be between ${min} and ${max}.`);
      }
      return value;
    };
    const requestedSpeed = bounded(update.speed, 0, MAX_MOVEMENT_SPEED_OVERRIDE, "Move speed");
    const equipmentSpeed = playerBaseMovementSpeed(equippedFeetForProgress(progress) === TRAILBLAZER_BOOTS);
    const nextProgress = {
      ...progress,
      maxHp: bounded(update.maxHp, 1, MAX_PLAYER_STAT, "Max HP"),
      damage: bounded(update.damage, 1, MAX_PLAYER_STAT, "Damage"),
      attackRate: bounded(update.attackRate, MIN_ATTACK_INTERVAL, 10, "Attack rate"),
      projectileSpeed: PLAYER_PROJECTILE_SPEED,
      projectileCount: Math.max(1, Math.min(20, Math.floor(update.projectileCount))),
      attackRange: bounded(update.attackRange, 1, 5_000, "Attack range"),
      armor: bounded(update.armor, 0, MAX_ARMOR, "Armor"),
      regen: bounded(update.regen, 0, MAX_PLAYER_STAT, "Regen"),
      speed: equipmentSpeed,
      speedOverride: requestedSpeed === 0 || movementSpeedsMatch(requestedSpeed, equipmentSpeed) ? 0 : requestedSpeed,
    };
    updateSnapshotRow(ctx, "playerProfile", { ...profile, displayName });
    syncDisplayNamePresentation(ctx, update.identity, displayName);
    updateSnapshotRow(ctx, "playerProgress", nextProgress);
    const active = ctx.db.player.identity.find(update.identity);
    if (active) {
      const nextPlayer = {
        ...active,
        speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
        ...powerFieldsForProgress(ctx, nextProgress),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
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
    for (const field of ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const) {
      const requiredMap = equipmentMapRequirement(progress[field], base);
      if (!requiredMap) continue;
      // A sleeping client can retry its saved pre-conversion loadout. Acknowledge
      // that exact old item without restoring it, so its save queue can drain.
      // Other locked equipment requests still fail normal validation.
      const backup = ctx.db.playerEndlessRebaseBackup.identity.find(ctx.sender);
      const previous = backup?.progressJson ? JSON.parse(backup.progressJson) : null;
      if (previous?.[field] === progress[field]) {
        progress = { ...progress, [field]: base[field] };
        continue;
      }
      throw new SenderError(`Reach ${requiredMap} to equip this item.`);
    }
    if (current && LOADOUT_FIELDS.every(field => progress[field] === base[field])) {
      return;
    }
    const bootsCollected = base.bootsCollected;
    const inventorySource = { ...base, identity: ctx.sender, bootsCollected };
    const inventory = inventoryForProgress(inventorySource);
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
    }, inventory);
    const next = {
      identity: ctx.sender,
      maxHp: base.maxHp,
      damage: base.damage,
      attackRate: base.attackRate,
      projectileSpeed: PLAYER_PROJECTILE_SPEED,
      projectileCount: base.projectileCount,
      attackRange: DEFAULT_ATTACK_RANGE,
      armor: base.armor,
      regen: base.regen,
      speed: playerBaseMovementSpeed(equippedFeet === TRAILBLAZER_BOOTS),
      speedOverride: base.speedOverride ?? 0,
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
      infernalUnlocked: base.infernalUnlocked,
      waterUnlocked: base.waterUnlocked,
      samuraiUnlocked: base.samuraiUnlocked,
      cloudspireUnlocked: base.cloudspireUnlocked,
      moonfenUnlocked: base.moonfenUnlocked,
      crystalHollowsUnlocked: base.crystalHollowsUnlocked, clockworkRuinsUnlocked: base.clockworkRuinsUnlocked, duskfallOrchardUnlocked: base.duskfallOrchardUnlocked, neonBastionUnlocked: base.neonBastionUnlocked, verdantCatacombsUnlocked: base.verdantCatacombsUnlocked, ionCitadelUnlocked: base.ionCitadelUnlocked,
      bossRewardClaims: base.bossRewardClaims ?? 0,
      bowCount: forestItemCountForProgress(base, STARTER_BOW, "bowCount"),
      woodenArmorCount: forestItemCountForProgress(base, WOODEN_ARMOR, "woodenArmorCount"),
    };
    if (!current) insertSnapshotRow(ctx, "playerProgress", next);
    else if (!samePlayerProgressValues(current, next)) updateSnapshotRow(ctx, "playerProgress", next);
    const equipment = equipmentPresentationForProgress(next, inventory);
    const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (leaderboard) {
      const appearance = { skinTone: ctx.db.playerProfile.identity.find(ctx.sender)?.skinTone ?? 3, ...equipment };
      if (
        leaderboard.skinTone !== appearance.skinTone ||
        leaderboard.headItem !== appearance.headItem ||
        leaderboard.chestItem !== appearance.chestItem ||
        leaderboard.feetItem !== appearance.feetItem ||
        leaderboard.rightHandItem !== appearance.rightHandItem ||
        leaderboard.leftHandItem !== appearance.leftHandItem
      ) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, ...appearance });
    }
    const presentation = {
      ...powerFieldsForProgress(ctx, next),
      speed: effectiveMovementSpeedForProgress(ctx, next) + (
        base.equippedFeet === BLACK_BOOTS && next.equippedFeet === BLACK_BOOTS &&
        movementSpeedsMatch(activePlayer.speed, effectiveMovementSpeedForProgress(ctx, base) + BLACK_BOOTS_SPEED_BONUS)
          ? BLACK_BOOTS_SPEED_BONUS : 0),
      ...equipment,
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
    ) {
      const nextPlayer = { ...activePlayer, ...presentation };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
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

export const speedUpResearchWithGems = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  const current = ctx.db.activeResearch.identity.find(ctx.sender);
  if (!current) throw new SenderError("No research is active.");
  const { active } = reconcileActiveResearch(ctx, current);
  if (!active) return;

  const remainingMicros = active.completesAt.microsSinceUnixEpoch - ctx.timestamp.microsSinceUnixEpoch;
  const remainingMs = Number((remainingMicros + 999n) / 1_000n);
  const cost = researchSpeedUpGemCost(remainingMs);
  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: -cost,
    kind: "research_speed_up",
    note: `Finished ${active.researchId} rank ${active.targetRank} research early.`,
    externalReference: `research-speed-up:${ctx.sender.toHexString()}:${active.researchId}:${active.targetRank}:${active.startedAt.microsSinceUnixEpoch}`,
  });
  if (!completeActiveResearch(ctx, active)) throw new SenderError("Research is no longer available.");
});

export const claimDailyGemBonus = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Register an account to claim daily Gems.");
  const dayKey = currentUtcDayKey(ctx);
  const state = ensureDailyGemBonusState(ctx, ctx.sender);
  if (state.claimableDayKey !== dayKey) throw new SenderError("Today's daily Gems are already claimed.");

  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: DAILY_LOGIN_GEM_BONUS,
    kind: "daily_login_bonus",
    note: "Registered-account daily login bonus claimed.",
    externalReference: dailyGemBonusClaimReference(ctx.sender, dayKey, state.claimCycle),
  });
  ctx.db.dailyGemBonus.identity.update({
    ...state,
    claimableDayKey: "",
    lastClaimedDayKey: dayKey,
    revision: state.revision + 1n,
    updatedAt: ctx.timestamp,
  });
});

export const myItemGifts = spacetimedb.view(
  { name: "my_item_gifts", public: true }, t.array(playerItemGift.rowType),
  ctx => [...ctx.db.playerItemGift.identity.filter(ctx.sender)].filter(gift => !gift.claimed),
);

/** Explicit admin grants support local equipment playtests without changing normal loot. */
export const devGrantEquipment = spacetimedb.reducer(
  { identity: t.identity(), itemId: t.string(), equip: t.bool() }, (ctx, { identity, itemId, equip }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_grant_equipment");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    const item = itemDefinition(itemId);
    const progress = ctx.db.playerProgress.identity.find(identity);
    if (!item || !progress) throw new SenderError("Player or equipment unavailable.");
    const alreadyOwned = playerOwnsItem(ctx, identity, itemId);
    let next = restoreItemToProgress(progress, itemId);
    if (equip && item.slot === "HAND") next = { ...next, equippedRightHand: itemId, equippedLeftHand: "", cosmeticRightHand: "", cosmeticLeftHand: "" };
    writeProgressAndPresentation(ctx, next);
    publishItemDrop(ctx, identity, itemId, alreadyOwned);
  },
);

export const devDeliverAlphaTesterGifts = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_alpha_tester_gifts");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverAlphaTesterGifts(ctx, recipients);
  },
);

export const claimDeveloperItemGift = spacetimedb.reducer({ key: t.string() }, (ctx, { key }) => {
  requireControllingPlayer(ctx);
  if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
  claimItemGift(ctx, key, itemId => {
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) throw new SenderError("Player unavailable.");
    if (!playerOwnsItem(ctx, ctx.sender, itemId)) updateSnapshotRow(ctx, "playerProgress", restoreItemToProgress(progress, itemId));
  });
});

export const devDeliverDisconnectCompensation = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_disconnect_compensation");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverDisconnectCompensation(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);

export const devDeliverCombatUpdateGift = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_combat_update_gift");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverCombatUpdateGift(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);

export const devDeliverOutageCompensation = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_outage_compensation");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverOutageCompensation(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);
export const devDeliverAutofarmTestGift = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_autofarm_test_gift");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverAutofarmTestGift(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);
export const devAnnounceOutageCompensation = spacetimedb.reducer({}, ctx => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_announce_outage_compensation");
  if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
  announceOutageCompensation(ctx, message => { insertChatMessage(ctx, ctx.sender, "DEVELOPER", message); });
});

export const readMailboxLetter = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  requireControllingPlayer(ctx);
  updateMailboxReceipt(ctx, id, false, () => {});
});
export const claimMailboxGift = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  requireControllingPlayer(ctx);
  updateMailboxReceipt(ctx, id, true, (amount, reference, title) => {
    applyGemBalanceChange(ctx, { identity: ctx.sender, delta: amount, kind: "mailbox_gift", note: title, externalReference: reference });
  }, (items, level) => {
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) throw new SenderError("Player unavailable.");
    const upgrading = activeItemUpgradeEntriesFor(ctx, ctx.sender).map(({ active }) => active.itemId);
    if (items.some(id => upgrading.includes(id))) throw new SenderError("Finish or cancel the upgrade on your gifted gear, then claim it here.");
    const equipped = [progress.equippedHead, progress.equippedChest, progress.equippedFeet, progress.equippedRightHand, progress.equippedLeftHand];
    const capacity = inventorySlotCapacity(ctx.db.playerInventoryCapacity.identity.find(ctx.sender)?.slotsUnlocked ?? 0);
    const { missing, slotsToFree } = gearClaimSpace(inventoryForProgress(progress), equipped, upgrading, items, capacity);
    if (slotsToFree) throw new SenderError(`Free ${slotsToFree} inventory slot${slotsToFree === 1 ? "" : "s"}, then claim your gear. Your gift will stay in Mail.`);
    let next = progress;
    for (const id of missing) next = restoreItemToProgress(next, id);
    for (const itemId of items) {
      const key = itemUpgradeKey(ctx.sender, itemId), current = ctx.db.playerItemUpgrade.key.find(key);
      if ((current?.level ?? 0) >= level) continue;
      const upgraded = { key, identity: ctx.sender, itemId, level };
      if (current) updateSnapshotRow(ctx, "playerItemUpgrade", upgraded);
      else insertSnapshotRow(ctx, "playerItemUpgrade", upgraded);
    }
    writeProgressAndPresentation(ctx, next);
  });
});
export const requestAccountDeletion = spacetimedb.reducer({ confirmation: t.string() }, (ctx, { confirmation }) => {
  if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
  requireControllingPlayer(ctx);
  queueAccountDeletion(ctx, confirmation);
});
export const devDeliverEquipmentMail = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_equipment_mail");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    deliverEquipmentMail(ctx, recipients);
  },
);
export const devPublishMailboxLetter = spacetimedb.reducer(
  { id: t.string(), title: t.string(), body: t.string(), gems: t.u64() }, (ctx, letter) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_publish_mailbox_letter");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    publishMailboxLetter(ctx, letter);
  },
);

export const acknowledgeBalanceApologyGift = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  if (ctx.db.balanceApologyNotice.identity.find(ctx.sender)) {
    ctx.db.balanceApologyNotice.identity.delete(ctx.sender);
  }
});

export const unlockSecondUpgradeSlot = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  const current = ctx.db.playerUpgradeBench.identity.find(ctx.sender);
  if (current?.secondSlotUnlocked) return;

  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: -UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
    kind: "upgrade_bench_slot_unlock",
    note: "Permanently unlocked Upgrade Bench slot two.",
    externalReference: `upgrade-bench-slot-two:${ctx.sender.toHexString()}`,
  });
  const next = {
    identity: ctx.sender,
    secondSlotUnlocked: true,
    updatedAt: ctx.timestamp,
  };
  if (current) ctx.db.playerUpgradeBench.identity.update(next);
  else ctx.db.playerUpgradeBench.insert(next);
});

export const unlockInventorySlot = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  const current = ctx.db.playerInventoryCapacity.identity.find(ctx.sender);
  const inventorySlotsUnlocked = current?.slotsUnlocked ?? 0;
  if (inventorySlotCapacity(inventorySlotsUnlocked) >= MAX_INVENTORY_SLOT_CAPACITY) {
    throw new SenderError("Maximum Bag capacity reached.");
  }
  const cost = inventorySlotUnlockCost(inventorySlotsUnlocked);
  const capacity = inventorySlotCapacity(inventorySlotsUnlocked) + 1;
  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: -cost,
    kind: "inventory_slot_unlock",
    note: `Permanently unlocked Bag slot ${capacity}.`,
    externalReference: `inventory-slot:${ctx.sender.toHexString()}:${capacity}`,
  });
  const next = {
    identity: ctx.sender,
    slotsUnlocked: inventorySlotsUnlocked + 1,
    updatedAt: ctx.timestamp,
  };
  if (current) ctx.db.playerInventoryCapacity.identity.update(next);
  else ctx.db.playerInventoryCapacity.insert(next);
});

export const startItemUpgrade = spacetimedb.reducer(
  { slot: t.u8(), itemId: t.string() },
  (ctx, { slot: requestedSlot, itemId }) => {
    const slot = requireUpgradeBenchSlot(requestedSlot);
    const playerAtBench = requireControllingPlayer(ctx);
    if (playerAtBench.mapId !== HOME_EXTERIOR_MAP_ID ||
      Math.hypot(playerAtBench.x - HOME_BENCH_POSITION.x, playerAtBench.y - HOME_BENCH_POSITION.y) > UPGRADE_BENCH_USE_RANGE) {
      throw new SenderError("Touch the Upgrade Bench first.");
    }
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    if (slot === UPGRADE_BENCH_SLOT_TWO && !secondUpgradeSlotUnlockedFor(ctx, ctx.sender)) {
      throw new SenderError("Unlock the second upgrade slot first.");
    }
    const canonical = canonicalItemId(itemId);
    if (!canonical || !isUpgradeableItem(canonical)) throw new SenderError("Choose a weapon or armor with stats.");

    const existing = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (existing) reconcileActiveItemUpgrade(ctx, existing, slot);
    const active = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (active) throw new SenderError("That upgrade slot is already in use.");
    if (activeItemUpgradeEntriesFor(ctx, ctx.sender).some(({ active: other }) => other.itemId === canonical)) {
      throw new SenderError("That item is already being upgraded.");
    }

    const progress = ctx.db.playerProgress.identity.find(ctx.sender) ?? defaultPlayerProgress(ctx.sender);
    if (!progressHasItem(progress, canonical)) throw new SenderError("That item is not in your inventory.");
    const currentLevel = itemUpgradeLevelFor(ctx, ctx.sender, canonical);
    if (currentLevel >= MAX_ITEM_UPGRADE_LEVEL) throw new SenderError("That item is already +10.");

    const durationMicros = BigInt(itemUpgradeDurationMs(currentLevel)) * 1_000n;
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
    insertActiveItemUpgrade(ctx, slot, nextActive);
    writeProgressAndPresentation(ctx, removeItemFromProgress(progress, canonical));
    ensureItemUpgradeCompletionSchedule(ctx, nextActive, slot);
  },
);

/** Inventory ownership is authoritative; a stale client save cannot restore deleted gear. */
export const destroyEquipment = spacetimedb.reducer(
  { itemId: t.string() },
  (ctx, { itemId }) => {
    requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const canonical = canonicalItemId(itemId);
    if (!canonical || !canDestroyEquipment(canonical)) throw new SenderError("This item cannot be destroyed.");
    if (activeItemUpgradeEntriesFor(ctx, ctx.sender).some(({ active }) => active.itemId === canonical)) {
      throw new SenderError("Cancel this item's upgrade first.");
    }
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress || !progressHasItem(progress, canonical)) throw new SenderError("That item is not in your inventory.");
    const key = itemUpgradeKey(ctx.sender, canonical);
    if (ctx.db.playerItemUpgrade.key.find(key)) deleteSnapshotRow(ctx, "playerItemUpgrade", key);
    writeProgressAndPresentation(ctx, removeItemFromProgress(progress, canonical));
  },
);

export const cancelItemUpgrade = spacetimedb.reducer(
  { slot: t.u8() },
  (ctx, { slot: requestedSlot }) => {
    const slot = requireUpgradeBenchSlot(requestedSlot);
    requireControllingPlayer(ctx);
    const existing = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (!existing) throw new SenderError("No item is being upgraded.");
    reconcileActiveItemUpgrade(ctx, existing, slot);
    const active = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (!active) return;
    cancelActiveItemUpgrade(ctx, active, slot);
  },
);

export const speedUpItemUpgradeWithGems = spacetimedb.reducer(
  { slot: t.u8() },
  (ctx, { slot: requestedSlot }) => {
    const slot = requireUpgradeBenchSlot(requestedSlot);
    requireControllingPlayer(ctx);
    const existing = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (!existing) throw new SenderError("No item is being upgraded.");
    reconcileActiveItemUpgrade(ctx, existing, slot);
    const active = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
    if (!active) return;

    const remainingMicros = active.completesAt.microsSinceUnixEpoch - ctx.timestamp.microsSinceUnixEpoch;
    const remainingMs = Number((remainingMicros + 999n) / 1_000n);
    const cost = itemUpgradeSpeedUpGemCost(remainingMs);
    applyGemBalanceChange(ctx, {
      identity: ctx.sender,
      delta: -cost,
      kind: "item_upgrade_speed_up",
      note: `Finished ${active.itemId} upgrade to +${active.targetLevel} early in slot ${slot}.`,
      externalReference: `item-upgrade-speed-up:${ctx.sender.toHexString()}:${slot}:${active.itemId}:${active.targetLevel}:${active.startedAt.microsSinceUnixEpoch}`,
    });
    completeActiveItemUpgrade(ctx, active, slot);
  },
);

export const recordPlayerDeath = spacetimedb.reducer(
  {},
  (ctx) => {
    const activePlayer = playerWithMotion(ctx, requireControllingPlayer(ctx));
    const motion = ctx.db.playerMotion.identity.find(ctx.sender);
    if (motion && (motion.moving || motion.dx !== 0 || motion.dy !== 0)) {
      ctx.db.playerMotion.networkId.update({
        ...motion,
        dx: 0,
        dy: 0,
        vx: 0,
        vy: 0,
        moving: false,
        lastInputAt: ctx.timestamp,
      });
    }
    publishPlayerDeathFrame(ctx, activePlayer);
    if (isMapShard(ctx)) return;
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, deathCount: lifetime.deathCount + 1n });
  },
);

function awardRegularEnemyLoot(ctx: ReducerCtx<InferSchema<typeof spacetimedb>>, mapId: string, count: number, checkpoint?: { progress: any }) {
  const drops = rollRegularEnemyLoot(ctx, mapId, count, pinnedMapBalance(ctx, ctx.sender, mapId)?.loot);
  if (!drops.size) return checkpoint?.progress;
  const current = checkpoint?.progress ?? ctx.db.playerProgress.identity.find(ctx.sender);
  let next = current ?? defaultPlayerProgress(ctx.sender);
  const owned = new Set(inventoryForProgress(next));
  for (const { active } of activeItemUpgradeEntriesFor(ctx, ctx.sender)) owned.add(active.itemId);
  let inventoryChanged = false;
  for (const [itemId, quantity] of drops) {
    const alreadyOwned = owned.has(itemId);
    publishItemDrop(ctx, ctx.sender, itemId, alreadyOwned, quantity);
    if (!alreadyOwned) {
      next = restoreItemToProgress(next, itemId);
      owned.add(itemId);
      inventoryChanged = true;
    }
  }
  if (!inventoryChanged || checkpoint) return next;
  if (current) updateSnapshotRow(ctx, "playerProgress", next);
  else insertSnapshotRow(ctx, "playerProgress", next);
  return next;
}

/** Only enemy identities/counts cross the wire; all reward values are server-owned. */
export const recordEnemyDefeats = spacetimedb.reducer(
  { streamId: t.string(), sequence: t.u64(), mapId: t.string(), enemies: t.array(t.object("EnemyDefeat", { enemy: t.string(), count: t.u16() })) },
  (ctx, batch) => {
    const player = requireControllingPlayer(ctx);
    if (isMapShard(ctx) || activeDuelFor(ctx, ctx.sender)) throw new SenderError("Enemy rewards require your account world connection.");
    const accepted = acceptEnemyDefeats(ctx, batch, player.mapId, earned => maximumBossCombatForProgress(ctx, earned));
    if (!accepted) return;
    const enforce = () => {
      if (!accepted.violations.length) return;
      const restriction = restrictDefeatSession(ctx, { mapId: batch.mapId, streamId: batch.streamId,
        sequence: batch.sequence.toString(), violations: accepted.violations });
      finishLifetimeSession(ctx, ctx.sender);
      removeIdentityPresence(ctx, ctx.sender);
      console.warn("Enemy defeat session restricted", JSON.stringify(restriction));
    };
    if (!accepted.count) { enforce(); return; }
    const base = ctx.db.playerProgress.identity.find(ctx.sender) ?? defaultPlayerProgress(ctx.sender);
    if (accepted.rewards.some(reward => reward.type !== "boss")) {
      const next = applyEnemyRewards(base, accepted.rewards, researchStatRewardMultiplier(ctx.db.playerResearch.identity.find(ctx.sender)));
      const rewarded = awardRegularEnemyLoot(ctx, batch.mapId, accepted.lootCount, { progress: next });
      updateSnapshotRow(ctx, "playerProgress", rewarded);
      const power = powerFieldsForProgress(ctx, rewarded);
      if (player.power !== power.power || player.powerLevel !== power.powerLevel) {
        const nextPlayer = { ...player, ...power };
        updateSnapshotRow(ctx, "player", nextPlayer);
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
      }
    }
    for (const reward of accepted.rewards) {
      if (reward.type !== "boss") continue;
      const boss = personalBossDefinition(batch.mapId)!;
      for (let clear = 0; clear < reward.count; clear++) {
        if (boss.kind !== "procedural") shardRewardHandlers[boss.kind](ctx, ctx.sender);
        else {
          const map = generateMap(batch.mapId as `endless_${number}`);
          const previous = ctx.db.proceduralProgress.identity.find(ctx.sender);
          const row = { identity: ctx.sender, completed: Math.max(previous?.completed ?? 0, map.number) };
          if (previous) ctx.db.proceduralProgress.identity.update(row); else ctx.db.proceduralProgress.insert(row);
          const progress = ctx.db.playerProgress.identity.find(ctx.sender)!;
          writeProgressAndPresentation(ctx, applyEnemyRewards(progress, (pinnedMapBalance(ctx, ctx.sender, batch.mapId)?.boss ? Object.entries(pinnedMapBalance(ctx, ctx.sender, batch.mapId)!.boss!.rewards).map(([type, amount]) => ({ type, amount })) : generatedBossStats(map).rewards).map(reward => ({ ...reward, count: 1 })), researchStatRewardMultiplier(ctx.db.playerResearch.identity.find(ctx.sender))));
        }
      }
    }
    const lifetime = ensurePlayerLifetime(ctx);
    const enemyKills = lifetime.enemyKills + BigInt(accepted.count);
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills });
    // Presence is the server's own signal for active play: hidden or idle
    // players earn at half rate, and nothing here is taken from the client.
    killGems.grantKillGems(ctx, ctx.sender, accepted.count, player.isVisible, enemyKills);
    enforce();
  },
);

/** Retained wire shape: obsolete clients must update before submitting rewards. */
export const recordRegularEnemyDefeats = spacetimedb.reducer(
  { streamId: t.string(), sequence: t.u64(), mapId: t.string(), count: t.u16() },
  (ctx, _batch) => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
  },
);

/** Retired client-stat checkpoint. Never accept its supplied totals. */
export const recordCombatCheckpoint = spacetimedb.reducer(
  { streamId: t.string(), sequence: t.u64(), mapId: t.string(), count: t.u16(),
    progress: t.option(t.object("CombatProgressCheckpoint", {
      maxHp: t.f64(), damage: t.f64(), attackRate: t.f64(), projectileCount: t.u32(),
      armor: t.f64(), regen: t.f64(), enemyKills: t.u32(),
    })),
  },
  (ctx, _batch) => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
  },
);

// Keep historical wire names to return an explicit update error. All new reward
// traffic uses record_enemy_defeats, including maps without item drops.
export const recordForestEnemyDefeat = spacetimedb.reducer({}, ctx => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
});
export const recordDesertEnemyDefeat = spacetimedb.reducer({}, ctx => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
});
export const recordSnowEnemyDefeat = spacetimedb.reducer({}, ctx => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
});
export const recordLavaEnemyDefeat = spacetimedb.reducer({}, ctx => { requireControllingPlayer(ctx); throw new SenderError("WildStat updated. Refresh to continue.");
});

export const myDefeatSessionRestriction = spacetimedb.view(
  { name: "my_defeat_session_restriction", public: true }, t.array(defeatSessionRestriction.rowType),
  ctx => { const row = ctx.db.defeatSessionRestriction.identity.find(ctx.sender); return row ? [row] : []; },
);

export const myOnboarding = spacetimedb.view(
  { name: "my_onboarding", public: true }, t.array(playerOnboarding.rowType),
  ctx => { const state = ctx.db.playerOnboarding.identity.find(ctx.sender); return state ? [state] : []; },
);

export const completeOnboardingStep = spacetimedb.reducer({ step: t.u8() }, (ctx, { step }) => {
  requireControllingPlayer(ctx);
  if (isMapShard(ctx)) throw new SenderError("Use your account connection for the tutorial.");
  advanceOnboarding(ctx, step, progress => writeProgressAndPresentation(ctx, progress));
  if (step === 6) {
    const player = ctx.db.player.identity.find(ctx.sender)!;
    const visible = (ctx.db.playerMultiplayerPreference.identity.find(ctx.sender)?.enabled ?? false)
      && (!isDeveloperIdentity(ctx.sender) || (ctx.db.developerPresencePreference.identity.find(ctx.sender)?.visible ?? false));
    const next = { ...player, isVisible: visible };
    updateSnapshotRow(ctx, "player", next);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, next));
    syncPlayerMapMarker(ctx, next, true);
  }
});

export const beginAdventure = spacetimedb.reducer(
  {},
  (ctx) => {
    requireControllingPlayer(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    if (current?.introComplete) return;
    if (current) updateSnapshotRow(ctx, "playerProgress", { ...current, introComplete: true });
    else insertSnapshotRow(ctx, "playerProgress", { ...defaultPlayerProgress(ctx.sender), introComplete: true });
  },
);

export const resetPlayerProgress = spacetimedb.reducer(
  {},
  (ctx) => {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before resetting progress.");
    clearProceduralProgress(ctx, ctx.sender);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const next = defaultPlayerProgress(ctx.sender);
    const history = ctx.db.playerCutsceneHistory.identity.find(ctx.sender);
    if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: 0, generation: history.generation + 1 });
    else ctx.db.playerCutsceneHistory.insert({ identity: ctx.sender, seenMask: 0, generation: 0 });
    if (current && inventoryForProgress(current).includes(SUPERIOR_GOLDEN_HELMET)) {
      next.inventoryJson = JSON.stringify(inventoryWithBetaHelmet(next, true));
    }
    if (current) updateSnapshotRow(ctx, "playerProgress", next);
    else insertSnapshotRow(ctx, "playerProgress", next);
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    if (research) deleteSnapshotRow(ctx, "playerResearch", ctx.sender);
    const activeResearchRow = ctx.db.activeResearch.identity.find(ctx.sender);
    if (activeResearchRow) ctx.db.activeResearch.identity.delete(ctx.sender);
    removeResearchCompletionSchedules(ctx, ctx.sender);
    removePlayerItemUpgradeData(ctx, ctx.sender, true);
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: 0n });
    // Re-entry uses recent boss contributions to recover earned map unlocks.
    // A deliberate reset must remove that evidence along with the unlock flags.
    for (const boss of Object.keys(BOSS_REWARD_CLAIM_BITS)) {
      (ctx.db as any)[`${boss}Contribution`].identity.delete(ctx.sender);
      (ctx.db as any)[`${boss}AttackWindow`].identity.delete(ctx.sender);
    }
    const nextPlayer = {
      ...activePlayer,
      hp: next.maxHp,
      maxHp: next.maxHp,
      ...powerFieldsForProgress(ctx, next),
      speed: effectiveMovementSpeedForProgress(ctx, next),
      ...equipmentPresentationForProgress(next),
    };
    // Rotate the regional admission even when already in Tutorial Forest;
    // otherwise an existing replica preserves its old position on snapshot sync.
    releaseMapShard(ctx, ctx.sender);
    const respawned = transitionPlayerMap(ctx, nextPlayer, TUTORIAL_FOREST_MAP_ID, PLAYER_SPAWN, 0);
    persistWorldLocation(ctx, respawned);
  },
);

function sendPlayerChatMessage(ctx: ModuleReducerCtx, message: string, replyToMessageId = 0n) {
  requireControllingPlayer(ctx);
  const profile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!profile) return;

  const normalized = message.trim();
  if (!normalized) return;
  if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new SenderError("Chat message is too long");
  }

  const bugCommand = /^\/bug(?:\s|$)/i.exec(normalized);
  const bugReportText = bugCommand ? normalized.slice(bugCommand[0].length).trim() : "";
  if (bugCommand && !bugReportText) throw new SenderError("Use /bug followed by a description.");

  let reply: { messageId: bigint; senderName: string; message: string } | undefined;
  if (!bugCommand && replyToMessageId > 0n) {
    const target = ctx.db.chatMessage.id.find(replyToMessageId);
    if (!target) throw new SenderError("The message you replied to is no longer available.");
    if (!target.senderName) throw new SenderError("This message cannot be replied to.");
    reply = {
      messageId: target.id,
      senderName: target.senderName,
      message: target.message,
    };
  }

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
      message: bugReportText,
      protocolVersion: PROTOCOL_VERSION,
      reportedAt: ctx.timestamp,
    });
    return;
  }

  const moderatedMessage = moderatePublicChatMessage(normalized);
  const inserted = insertChatMessage(
    ctx,
    ctx.sender,
    profile.displayName,
    moderatedMessage.message,
    0n,
    moderatedMessage.moderated,
    reply,
  );
  if (moderatedMessage.moderated) recordModerationAction(ctx, {
    targetIdentity: ctx.sender.toHexString(), targetName: profile.displayName, channel: "world", messageId: inserted.id,
    action: "Message filtered", reason: chatModerationReason(normalized) ?? "Disallowed content",
    actorType: "automatic", rule: MODERATION_RULE_VERSION, before: normalized, after: moderatedMessage.message,
  });
}

export const sendChatMessage = spacetimedb.reducer(
  { message: t.string() },
  (ctx, { message }) => sendPlayerChatMessage(ctx, message),
);

// Kept separate from sendChatMessage so already-deployed clients retain their
// original reducer signature while newer clients can attach a server snapshot.
export const sendChatReply = spacetimedb.reducer(
  { message: t.string(), replyToMessageId: t.u64() },
  (ctx, { message, replyToMessageId }) => sendPlayerChatMessage(ctx, message, replyToMessageId),
);

export const reportChatMessage = spacetimedb.reducer(
  { messageId: t.u64(), reason: t.string() },
  (ctx, { messageId, reason }) => {
    requireControllingPlayer(ctx);
    if (!isChatReportReason(reason)) throw new SenderError("Choose a valid report reason.");

    const message = ctx.db.chatMessage.id.find(messageId);
    if (!message) throw new SenderError("Message is no longer available.");
    if (sameIdentity(message.sender, ctx.sender)) throw new SenderError("You cannot report your own message.");
    if (!message.senderName) throw new SenderError("This message cannot be reported.");

    for (const _existing of ctx.db.chatMessageReport.byReporterMessage.filter([ctx.sender, messageId])) {
      throw new SenderError("You already reported this message.");
    }

    consumeReportRate(ctx);

    const reporterName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const report = ctx.db.chatMessageReport.insert({
      id: 0n,
      reporter: ctx.sender,
      reporterName,
      accused: message.sender,
      senderName: message.senderName,
      messageId: message.id,
      message: message.message,
      messageModerated: message.moderated,
      sentAt: message.sentAt,
      reason,
      status: "pending",
      reportedAt: ctx.timestamp,
      replyToSenderName: message.replyToSenderName,
      replyToMessage: message.replyToMessage,
    });
    if (isDeveloperIdentity(ctx.sender) && hasSpacetimeAuthAccount(ctx)) {
      moderateReportedMessage(ctx, "public", messageId, reason, "chat_message_report", report.id.toString());
      ctx.db.chatMessageReport.id.update({ ...report, status: "resolved" });
    }
  },
);

export const requestDuel = spacetimedb.reducer(
  { opponent: t.identity() },
  (ctx, { opponent }) => startDuel(ctx, opponent),
);

export const shareDuelReplay = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => publishDuelReplay(ctx, id));

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

export const updateMovementState = spacetimedb.reducer(
  {
    x: t.f64(),
    y: t.f64(),
    vx: t.f32(),
    vy: t.f32(),
    simulationTick: t.u32(),
    motionEpoch: t.u32(),
    sequence: t.u32(),
  },
  (ctx, { x, y, vx, vy, simulationTick, motionEpoch, sequence }) => {
    if (blockedSession(ctx)) return;
    applyMovementState(ctx, x, y, vx, vy, simulationTick, motionEpoch, sequence);
  },
);

export const setPlayerMotionInterest = spacetimedb.reducer(
  { networkIds: t.array(t.u32()) },
  (ctx, { networkIds }) => {
    if (blockedSession(ctx)) return;
    const activePlayer = requireControllingPlayer(ctx);
    const ownMotion = ctx.db.playerMotion.identity.find(ctx.sender);
    if (!ownMotion) throw new SenderError("Player motion is unavailable.");
    if (!ownMotion.isVisible) {
      if (ctx.db.playerMotionInterest.identity.find(ctx.sender)) ctx.db.playerMotionInterest.identity.delete(ctx.sender);
      return;
    }
    const selected: number[] = [];
    const seen = new Set<number>();
    for (const networkId of networkIds) {
      if (selected.length >= PLAYER_MOTION_INTEREST_LIMIT) break;
      if (seen.has(networkId) || networkId === ownMotion.networkId) continue;
      seen.add(networkId);
      const motion = ctx.db.playerMotion.networkId.find(networkId);
      if (!motion || !motion.isVisible || motion.mapId !== activePlayer.mapId) continue;
      selected.push(networkId);
    }

    const current = ctx.db.playerMotionInterest.identity.find(ctx.sender);
    if (selected.length === 0) {
      if (current) ctx.db.playerMotionInterest.identity.delete(ctx.sender);
      return;
    }
    if (
      current &&
      current.networkIds.length === selected.length &&
      current.networkIds.every((networkId: number, index: number) => networkId === selected[index])
    ) return;
    const next = { identity: ctx.sender, networkIds: selected };
    if (current) ctx.db.playerMotionInterest.identity.update(next);
    else ctx.db.playerMotionInterest.insert(next);
    ensureMotionDetailFrameSchedule(ctx);
  },
);

// Rollout bridge for pre-0.424 clients. Current clients never call this path.
export const syncPosition = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), facing: t.f64(), moving: t.bool(), sequence: t.u32() },
  (ctx, { x, y, facing, moving, sequence }) => {
    if (!Number.isFinite(facing)) throw new SenderError("Movement state values must be finite");
    const currentMotion = ctx.db.playerMotion.identity.find(ctx.sender);
    const speed = Math.max(0, ctx.db.player.identity.find(ctx.sender)?.speed ?? PLAYER_SPEED);
    const horizontal = Math.cos(facing);
    applyMovementState(
      ctx,
      x,
      y,
      moving && Math.abs(horizontal) >= 1e-6 ? horizontal * speed : 0,
      moving ? Math.sin(facing) * speed : 0,
      (currentMotion?.simulationTick ?? 0) + 1 >>> 0,
      currentMotion?.motionEpoch ?? 0,
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
  if (ctx.db.playerMotionInterest.identity.find(current.identity)) {
    ctx.db.playerMotionInterest.identity.delete(current.identity);
  }
  const currentMotion = ctx.db.playerMotion.identity.find(current.identity);
  // Rows read once here and handed to the presence helpers; each host call is paid for.
  const runtime = ctx.db.shardRuntime.id.find(0), sharded = runtime?.role === "root" && runtime.enabled;
  const member = sharded ? ctx.db.mapShardMember.identity.find(current.identity) : undefined;
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
    vx: 0,
    vy: 0,
    simulationTick: currentMotion?.simulationTick ?? current.simulationTick ?? 0,
    motionEpoch: ((currentMotion?.motionEpoch ?? current.motionEpoch ?? 0) + 1) >>> 0,
    lastInputAt: ctx.timestamp,
  };
  updateSnapshotRow(ctx, "player", nextPlayer);
  const motion = syncPlayerMotion(ctx, nextPlayer, { sharded, motion: currentMotion });
  syncPlayerMotionIdentity(ctx, nextPlayer, sharded ? { sharded, motion, member } : { sharded, motion });
  syncPlayerMapMarker(ctx, nextPlayer, true);
  ensureRealtimeFrameSchedules(ctx);
  // Home has no enemies: nothing reads a pin there, and the old pin still fits on the way back.
  if (runtime?.role !== "map") { if (mapId !== HOME_EXTERIOR_MAP_ID) pinMapBalance(ctx, mapId); beginBossTimeBudget(ctx, mapId); }
  return nextPlayer;
}

export const changeMap = spacetimedb.reducer(
  { mapId: t.string(), x: t.f64(), y: t.f64() },
  (ctx, { mapId, x, y }) => {
    if (blockedSession(ctx)) return;
    const current = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
    if (mapId === HOME_EXTERIOR_MAP_ID) {
      if (current.hp <= 0) throw new SenderError("Respawn before teleporting home.");
      // Leaving Home on a sharded root persists the location while seating the player.
      const persisted = current.mapId === HOME_EXTERIOR_MAP_ID && rootShardingEnabled(ctx);
      if (current.mapId === HOME_EXTERIOR_MAP_ID) {
        const saved = ctx.db.homeReturnLocation.identity.find(ctx.sender);
        // Recover already-linked accounts whose older client/server omitted
        // their Home return record. Keep their stats and unlocks intact.
        const progress = ctx.db.playerProgress.identity.find(ctx.sender);
        const converted = ctx.db.playerEndlessRebaseBackup.identity.find(ctx.sender);
        const savedMapIndex = saved ? MAP_IDS.indexOf(saved.mapId) : -1;
        const permitted = !converted || (saved && (isProceduralMap(saved.mapId)
          ? generatedMapUnlocked(saved.mapId, ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
            Boolean((progress?.bossRewardClaims ?? 0) & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS]))
          : savedMapIndex === 0 || (savedMapIndex > 0 && Boolean(progress?.[CAMPAIGN_UNLOCK_FIELDS[savedMapIndex - 1]]))));
        const destination = permitted && saved && saved.mapId !== HOME_EXTERIOR_MAP_ID && VALID_MAP_IDS.has(saved.mapId)
          && [saved.x, saved.y, saved.facing].every(Number.isFinite)
          ? saved : { mapId: TUTORIAL_FOREST_MAP_ID, ...PLAYER_SPAWN, facing: 0 };
        transitionPlayerMap(ctx, current, destination.mapId, destination, destination.facing);
      } else {
        if (![x, y].every(Number.isFinite) || x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > WORLD.width - PLAYER_RADIUS || y > WORLD.height - PLAYER_RADIUS) throw new SenderError("Invalid teleport position.");
        const saved = { identity: ctx.sender, mapId: current.mapId, x, y, facing: current.facing };
        if (ctx.db.homeReturnLocation.identity.find(ctx.sender)) ctx.db.homeReturnLocation.identity.update(saved);
        else ctx.db.homeReturnLocation.insert(saved);
        transitionPlayerMap(ctx, current, HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN);
      }
      if (!persisted) persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
      return;
    }
    if (!VALID_MAP_IDS.has(mapId) || mapId === current.mapId) throw new SenderError("Unsupported map destination.");
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SenderError("Portal position must be finite.");
    if (x < PLAYER_RADIUS || x > WORLD.width - PLAYER_RADIUS || y < PLAYER_RADIUS || y > WORLD.height - PLAYER_RADIUS) {
      throw new SenderError("Portal position is outside the world.");
    }
    const currentProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (mapId === BEGINNER_DESERT_MAP_ID && !currentProgress?.desertUnlocked) throw new SenderError("Defeat the Dragon before entering Beginner Desert.");
    if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID && !currentProgress?.snowlandsUnlocked) throw new SenderError("Defeat the Desert Spider before entering Intermediate Snowlands.");
    if (mapId === ADVANCED_LAVA_WASTES_MAP_ID && !currentProgress?.lavaUnlocked) {
      throw new SenderError(`Defeat Frostclaw before entering ${MAP_DISPLAY_NAMES[ADVANCED_LAVA_WASTES_MAP_ID]}.`);
    }
    if (mapId === INFERNAL_DEPTHS_MAP_ID && !currentProgress?.infernalUnlocked) {
      throw new SenderError(`Defeat Magmalisk before entering ${MAP_DISPLAY_NAMES[INFERNAL_DEPTHS_MAP_ID]}.`);
    }
    if (mapId === WATER_REACH_MAP_ID && !currentProgress?.waterUnlocked) {
      throw new SenderError(`Defeat Gloomroot before entering ${MAP_DISPLAY_NAMES[WATER_REACH_MAP_ID]}.`);
    }
    if (mapId === SAMURAI_GARDEN_MAP_ID && !currentProgress?.samuraiUnlocked) {
      throw new SenderError(`Defeat Tidewyrm before entering ${MAP_DISPLAY_NAMES[SAMURAI_GARDEN_MAP_ID]}.`);
    }
    if (mapId === CLOUDSPIRE_MAP_ID && !currentProgress?.cloudspireUnlocked) {
      throw new SenderError(`Defeat Koi Shogun before entering ${MAP_DISPLAY_NAMES[CLOUDSPIRE_MAP_ID]}.`);
    }
    if (mapId === MOONFEN_MAP_ID && !currentProgress?.moonfenUnlocked) {
      throw new SenderError(`Defeat Tempest Kirin before entering ${MAP_DISPLAY_NAMES[MOONFEN_MAP_ID]}.`);
    }
    if (mapId === CLOCKWORK_RUINS_MAP_ID && !currentProgress?.clockworkRuinsUnlocked) {
      throw new SenderError(`Defeat Prismshell before entering ${MAP_DISPLAY_NAMES[CLOCKWORK_RUINS_MAP_ID]}.`);
    } else if (mapId === ION_CITADEL_MAP_ID && !currentProgress?.ionCitadelUnlocked) {
      throw new SenderError(`Defeat Gravebloom before entering ${MAP_DISPLAY_NAMES[ION_CITADEL_MAP_ID]}.`);
    } else if (mapId === VERDANT_CATACOMBS_MAP_ID && !currentProgress?.verdantCatacombsUnlocked) {
      throw new SenderError(`Defeat Voltwarden before entering ${MAP_DISPLAY_NAMES[VERDANT_CATACOMBS_MAP_ID]}.`);
    } else if (mapId === NEON_BASTION_MAP_ID && !currentProgress?.neonBastionUnlocked) {
      throw new SenderError(`Defeat Dreadreaper before entering ${MAP_DISPLAY_NAMES[NEON_BASTION_MAP_ID]}.`);
    } else if (mapId === DUSKFALL_ORCHARD_MAP_ID && !currentProgress?.duskfallOrchardUnlocked) {
      throw new SenderError(`Defeat Ironhorn before entering ${MAP_DISPLAY_NAMES[DUSKFALL_ORCHARD_MAP_ID]}.`);
    } else if (mapId === CRYSTAL_HOLLOWS_MAP_ID && !currentProgress?.crystalHollowsUnlocked) {
      throw new SenderError(`Defeat Miremaw before entering ${MAP_DISPLAY_NAMES[CRYSTAL_HOLLOWS_MAP_ID]}.`);
    }

    if (isProceduralMap(mapId) && !generatedMapUnlocked(mapId,
      ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
      Boolean(currentProgress && (currentProgress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS])))) {
      throw new SenderError("Defeat the previous map's boss first.");
    }
    const sourcePortals = current.mapId === HOME_EXTERIOR_MAP_ID
      ? [{ ...HOME_TRAVEL_PORTAL, y: HOME_TRAVEL_PORTAL.y - HOME_TRAVEL_PORTAL.height * .32, destination: mapId }]
      : isProceduralMap(current.mapId)
      ? generateMap(current.mapId).portals.map(portal => ({ ...portal, y:portal.y-portal.height*.32 }))
      : [...(MAP_PORTALS[current.mapId as keyof typeof MAP_PORTALS] ?? []),
        ...(current.mapId === PROCEDURAL_ENTRY_MAP ? [{x:580,y:617,destination:proceduralMapId(1)}] : [])];
    const sourcePortal = sourcePortals.find((portal) => portal.destination === mapId);
    if (!sourcePortal) throw new SenderError("Maps are not connected.");
    // Movement is client-authoritative. Validate the coordinate from this
    // discrete portal action instead of a potentially one-heartbeat-old
    // player_motion sample, then move to the destination atomically.
    const portalDistance = Math.hypot(x - sourcePortal.x, y - sourcePortal.y);
    if (portalDistance > MAP_PORTAL_USE_RANGE) throw new SenderError("Move closer to the portal.");

    const arrival = isProceduralMap(mapId) ? generateMap(mapId).arrival : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
    transitionPlayerMap(ctx, current, mapId, arrival);
  },
);

export const setSpeed = spacetimedb.reducer(
  { speed: t.f32() },
  (ctx, { speed }) => {
    if (blockedSession(ctx)) return;
    const current = requireControllingPlayer(ctx);
    if (movementSpeedsMatch(speed, current.speed)) return;

    // Speed remains server-authoritative. Move Speed research is a legitimate
    // client-side movement multiplier, so validate its exact server record
    // instead of treating every researched speed as a malformed packet.
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    const feet = progress ? equippedFeetForProgress(progress) : current.feetItem;
    const bootsEquipped = feet === TRAILBLAZER_BOOTS;
    const moveSpeedRank = research?.moveSpeed ?? 0;
    const expectedSpeed = effectivePlayerMovementSpeed(bootsEquipped, moveSpeedRank, progress?.speedOverride ?? 0);
    // Regular-enemy combat runs locally. Permit its two exact movement states,
    // while checking ownership/equipment here and never saving a temporary bonus.
    const blackBootsEquipped = progress && feet === BLACK_BOOTS;
    const restingSpeed = expectedSpeed + (blackBootsEquipped ? BLACK_BOOTS_SPEED_BONUS : 0);
    if (!movementSpeedsMatch(speed, expectedSpeed) && !movementSpeedsMatch(speed, restingSpeed)) throw new SenderError("Unsupported player speed");

    const nextPlayer = {
      ...current,
      speed,
      lastInputAt: ctx.timestamp,
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  },
);

// Map databases export only the realtime reducers from this module (see
// spacetimedb-map/src/index.ts). Durable account writes stay on the root.
function requireShardOperator(ctx: any) {
  const internal = !ctx.connectionId && sameIdentity(ctx.sender, ctx.databaseIdentity);
  if (!internal && !isDatabaseOwnerIdentity(ctx.sender)) throw new SenderError("Shard operator required");
}
function requireMapWorkload(ctx: any) {
  if (rootShardingEnabled(ctx) && ctx.db.player.identity.find(ctx.sender)?.mapId !== HOME_EXTERIOR_MAP_ID) throw new SenderError("Connect to the assigned map shard");
  const runtime = ctx.db.shardRuntime.id.find(0);
  if (runtime?.role === "map" && (!runtime.enabled || runtime.leaseExpiresAtMicros <= ctx.timestamp.microsSinceUnixEpoch)) {
    throw new SenderError("Map shard is reconnecting to the account service");
  }
}
export const configureSharding = spacetimedb.reducer(
  { role: t.string(), enabled: t.bool(), mapId: t.string(), shardId: t.u64() },
  (ctx, args) => {
    requireShardOperator(ctx);
    if (args.role !== "root" && args.role !== "map") throw new SenderError("Invalid shard role");
    if (args.role === "map") validateShardMap(args.mapId);
    const current = ctx.db.shardRuntime.id.find(0);
    if (current && (current.role !== args.role || current.mapId !== args.mapId || current.shardId !== args.shardId)) {
      throw new SenderError("A database cannot change shard identity");
    }
    if (current) ctx.db.shardRuntime.id.update({ ...current, ...args });
    else ctx.db.shardRuntime.insert({ id: 0, ...args, leaseExpiresAtMicros: 0n });
    if (args.role === "root" && !args.enabled) {
      for (const member of ctx.db.mapShardMember.iter()) releaseMapShard(ctx, member.identity);
      for (const player of ctx.db.player.iter()) {
        const saved = ctx.db.playerLastLocation.identity.find(player.identity);
        const restored = saved?.mapId === player.mapId && !activeDuelFor(ctx, player.identity)
          ? { ...player, x: saved.x, y: saved.y, facing: saved.facing } : player;
        if (restored !== player) updateSnapshotRow(ctx, "player", restored);
        syncPlayerMotion(ctx, restored); syncPlayerMotionIdentity(ctx, restored);
      }
      ensureRealtimeFrameSchedules(ctx);
    }
    if (args.role === "root" && args.enabled) {
      for (const member of ctx.db.mapShardMember.iter()) {
        if (!ctx.db.player.identity.find(member.identity)) releaseMapShard(ctx, member.identity);
      }
      reconcileOnlinePlayers(ctx);
      for (const shard of ctx.db.mapShard.iter()) {
        if (ctx.db.shardCoordinatorConnection.id.find(0) && !ctx.db.shardCoordinatorSchedule.scheduledId.find(shard.id)) {
          ctx.db.shardCoordinatorSchedule.insert({ scheduledId: shard.id, scheduledAt: ScheduleAt.interval(1_000_000n) });
        }
      }
      for (const player of ctx.db.player.iter()) {
        removePlayerRealtimeState(ctx, player.identity);
        assignMapShard(ctx, player);
      }
    }
  },
);
export const shardReady = spacetimedb.reducer({ shardId: t.u64() }, (ctx, { shardId }) => {
  requireShardOperator(ctx);
  const shard = ctx.db.mapShard.id.find(shardId);
  if (!shard || shard.state === "draining") throw new SenderError("Unknown or draining shard");
  const ready = { ...shard, state: "ready" };
  ctx.db.mapShard.id.update(ready);
  syncMapShardRoutesForShard(ctx, ready);
  for (const member of ctx.db.mapShardMember.byMap.filter(shard.mapId)) {
    if (member.shardId === 0n) assignMapShard(ctx, ctx.db.player.identity.find(member.identity));
  }
});
export const shardMemberReady = spacetimedb.reducer(
  { identity: t.identity(), generation: t.u64(), shardId: t.u64() }, (ctx, args) => {
    requireShardOperator(ctx);
    const member = ctx.db.mapShardMember.identity.find(args.identity);
    if (!member || member.generation !== args.generation || member.shardId !== args.shardId) return;
    if (!member.ready) { const next = { ...member, ready: true }; ctx.db.mapShardMember.identity.update(next); syncMapShardRoute(ctx, args.identity, next); }
  },
);
// Kept for clients built before map_shard_route existed; new clients subscribe to
// their own row of that table. Reading the route row keeps the view's read set to one row.
export const myMapShardRoute = spacetimedb.view(
  { public: true }, t.option(mapShardRouteType), (ctx) => ctx.db.mapShardRoute.identity.find(ctx.sender) ?? undefined,
);
export const installShardPlayer = spacetimedb.reducer(
  { identity: t.identity(), generation: t.u64(), snapshot: t.string() }, installShardPlayerImpl);
function installShardPlayerImpl(ctx: any, args: any) {
    requireShardOperator(ctx);
    if (!isMapShard(ctx)) throw new SenderError("Map database required");
    const data = decodeShardSnapshot(args.snapshot);
    const runtime = ctx.db.shardRuntime.id.find(0)!;
    if (!data.player || data.player.mapId !== runtime.mapId || !sameIdentity(data.player.identity, args.identity)) throw new SenderError("Wrong map snapshot");
    const admission = ctx.db.shardAdmission.identity.find(args.identity);
    const fence = ctx.db.shardAdmissionFence.identity.find(args.identity);
    if ((fence && fence.generation >= args.generation) || (admission && admission.generation > args.generation)) return;
    if (!admission && ctx.db.shardAdmission.count() >= BigInt(MAP_SHARD_CAPACITY)) throw new SenderError("Map shard is full");
    const nextAdmission = { identity: args.identity, generation: args.generation, tabId: data.player.controllerTabId, inDuel: Boolean(data.inDuel) };
    if (admission) ctx.db.shardAdmission.identity.update(nextAdmission);
    else ctx.db.shardAdmission.insert(nextAdmission);
    for (const name of ["playerProgress", "playerProfile", "playerResearch", "playerAccountStatus"] as const) {
      const row = data[name];
      if (row && !sameIdentity(row.identity, args.identity)) throw new SenderError("Snapshot identity mismatch");
      const table = (ctx.db as any)[name];
      if (row) {
        if (table.identity.find(args.identity)) table.identity.update(row);
        else table.insert(row);
      } else if (table.identity.find(args.identity)) table.identity.delete(args.identity);
    }
    for (const row of ctx.db.playerItemUpgrade.byIdentity.filter(args.identity)) deleteSnapshotRow(ctx, "playerItemUpgrade", row.key);
    for (const row of data.playerItemUpgrade ?? []) {
      if (!sameIdentity(row.identity, args.identity)) throw new SenderError("Upgrade identity mismatch");
      insertSnapshotRow(ctx, "playerItemUpgrade", row);
    }
    markPlayerBalanceCurrent(ctx, args.identity);
    const active = ctx.db.player.identity.find(args.identity);
    // Snapshot refreshes preserve regional motion. A new reservation gets its
    // root-validated portal arrival, never a stale position from the old shard.
    const nextPlayer = active && admission?.generation === args.generation
      ? { ...active, ...powerFieldsForProgress(ctx, data.playerProgress), ...equipmentPresentationForProgress(data.playerProgress),
        speed: data.player.speed, isVisible: data.player.isVisible, controllerTabId: data.player.controllerTabId }
      : { ...data.player, lastInputAt: ctx.timestamp, moving: false, vx: 0, vy: 0 };
    if (active) updateSnapshotRow(ctx, "player", nextPlayer);
    else insertSnapshotRow(ctx, "player", nextPlayer);
    const regionalPlayer = playerWithMotion(ctx, nextPlayer);
    // Replicated eye changes must update both presentation and frame eligibility
    // immediately, even while the invisible client sends only coarse checkpoints.
    syncPlayerMotion(ctx, regionalPlayer);
    syncPlayerMotionIdentity(ctx, regionalPlayer);
    if (!nextPlayer.isVisible && ctx.db.playerMotionInterest.identity.find(args.identity)) {
      ctx.db.playerMotionInterest.identity.delete(args.identity);
    }
    ensureRealtimeFrameSchedules(ctx);
}
export const revokeShardPlayer = spacetimedb.reducer({ identity: t.identity(), generation: t.u64() }, revokeShardPlayerImpl);
function revokeShardPlayerImpl(ctx: any, args: any) {
  requireShardOperator(ctx);
  const admission = ctx.db.shardAdmission.identity.find(args.identity);
  if (!admission || admission.generation !== args.generation) return;
  ctx.db.shardAdmission.identity.delete(args.identity);
  const fence = { identity: args.identity, generation: args.generation };
  if (ctx.db.shardAdmissionFence.identity.find(args.identity)) ctx.db.shardAdmissionFence.identity.update(fence);
  else ctx.db.shardAdmissionFence.insert(fence);
  // Read models are disposable. The durable source remains on the root.
  for (const name of ["playerProgress", "playerProfile", "playerResearch", "playerAccountStatus", "playerBalanceVersion", "shardCheckpoint"] as const) {
    const table = (ctx.db as any)[name];
    if (table.identity.find(args.identity)) table.identity.delete(args.identity);
  }
  for (const row of ctx.db.playerItemUpgrade.byIdentity.filter(args.identity)) deleteSnapshotRow(ctx, "playerItemUpgrade", row.key);
  // No global duel resolution in a region: the root owns the duel lifecycle.
  deleteSnapshotRow(ctx, "player", args.identity);
  removePlayerRealtimeState(ctx, args.identity);
  if (ctx.db.playerController.identity.find(args.identity)) ctx.db.playerController.identity.delete(args.identity);
}
const shardRewardHandlers: Record<string, (ctx: any, identity: any) => void> = {
  dragon: rewardDragonContributor, spider: rewardSpiderContributor, frostclaw: rewardFrostclawContributor,
  magmalisk: rewardMagmaliskContributor, gloomroot: rewardGloomrootContributor, tidewyrm: rewardTidewyrmContributor,
  koiShogun: rewardKoiShogunContributor, tempestKirin: rewardTempestKirinContributor,
  miremaw: rewardMiremawContributor, prismshell: rewardPrismshellContributor, ironhorn: rewardIronhornContributor, dreadreaper: rewardDreadreaperContributor, voltwarden: rewardVoltwardenContributor, gravebloom: rewardGravebloomContributor, aegisPrime: rewardAegisPrimeContributor,
};
export const deliverShardReward = spacetimedb.reducer(
  { shardId: t.u64(), identity: t.identity(), boss: t.string(), encounter: t.u64() }, deliverShardRewardImpl);
function deliverShardRewardImpl(ctx: any, args: any) {
    requireShardOperator(ctx);
    if (isMapShard(ctx) || !ctx.db.mapShard.id.find(args.shardId) || !shardRewardHandlers[args.boss]) throw new SenderError("Invalid reward source");
    const key = `${args.shardId}:${args.boss}:${args.encounter}:${args.identity.toHexString()}`;
    if (ctx.db.shardRewardReceipt.key.find(key)) return;
    shardRewardHandlers[args.boss](ctx, args.identity);
    ctx.db.shardRewardReceipt.insert({ key, receivedAt: ctx.timestamp });
}
export const acknowledgeShardReward = spacetimedb.reducer({ key: t.string() }, (ctx, { key }) => {
  requireShardOperator(ctx);
  ctx.db.shardRewardOutbox.key.delete(key);
});

export const prepareWorldActionPosition = spacetimedb.reducer({ x: t.f64(), y: t.f64() }, (ctx, { x, y }) => {
  const player = requireControllingPlayer(ctx);
  if (![x, y].every(Number.isFinite) || x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > WORLD.width - PLAYER_RADIUS || y > WORLD.height - PLAYER_RADIUS) {
    throw new SenderError("Invalid bench position");
  }
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const next = { ...player, x, y, moving: false, vx: 0, vy: 0, dx: 0, dy: 0, lastInputAt: ctx.timestamp };
  updateSnapshotRow(ctx, "player", next);
  syncPlayerMotion(ctx, next);
});

export const renewShardLease = spacetimedb.reducer({}, renewShardLeaseImpl);
function renewShardLeaseImpl(ctx: any, options: { checkpoint?: boolean; enable?: boolean } = {}) {
  requireShardOperator(ctx);
  const runtime = ctx.db.shardRuntime.id.find(0);
  if (runtime?.role !== "map") throw new SenderError("Map database required");
  ctx.db.shardRuntime.id.update({ ...runtime, enabled: options.enable ?? runtime.enabled,
    leaseExpiresAtMicros: ctx.timestamp.microsSinceUnixEpoch + 45_000_000n });
  if (options.checkpoint === false) return;
  // One low-frequency checkpoint per admitted player; hot movement remains in
  // the region. The operator invokes this once per 15 seconds per database.
  for (const admission of ctx.db.shardAdmission.iter()) {
    const player = playerWithMotion(ctx, ctx.db.player.identity.find(admission.identity));
    if (!player || admission.inDuel) continue;
    const next = { identity: admission.identity, generation: admission.generation, mapId: player.mapId, x: player.x, y: player.y };
    const current = ctx.db.shardCheckpoint.identity.find(admission.identity);
    if (current && current.x === next.x && current.y === next.y && current.generation === next.generation) continue;
    if (current) ctx.db.shardCheckpoint.identity.update(next);
    else ctx.db.shardCheckpoint.insert(next);
  }
}
export const checkpointShardLocation = spacetimedb.reducer(
  { identity: t.identity(), shardId: t.u64(), generation: t.u64(), x: t.f64(), y: t.f64() }, checkpointShardLocationImpl);
function checkpointShardLocationImpl(ctx: any, args: any) {
    requireShardOperator(ctx);
    const member = ctx.db.mapShardMember.identity.find(args.identity);
    const player = ctx.db.player.identity.find(args.identity);
    if (!member || !player || member.shardId !== args.shardId || member.generation !== args.generation || activeDuelFor(ctx, args.identity)) return;
    if (![args.x, args.y].every(Number.isFinite)) throw new SenderError("Invalid shard position");
    persistWorldLocation(ctx, { ...player, x: args.x, y: args.y });
}

export const enterRegionalWorld = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  if (!isMapShard(ctx)) throw new SenderError("Map database is not configured");
  enterShardPresence(ctx, tabId);
});

export const configureShardCoordinator = spacetimedb.reducer(
  { host: t.string(), token: t.string(), program: t.string() }, (ctx, args) => {
    requireShardOperator(ctx);
    if (isMapShard(ctx)) throw new SenderError("Account database required");
    let program = args.program;
    if (!program) {
      const parts = [...ctx.db.shardProgramPart.iter()].sort((a, b) => a.part - b.part);
      if (!parts.length || parts.some((row, i) => row.part !== i || row.total !== parts.length)) throw new SenderError("Incomplete map program upload");
      program = parts.map(row => row.source).join("");
    }
    validateCoordinatorConfig(args.host, args.token, program);
    const row = { id: 0, ...args, program };
    const connection = { id: 0, host: args.host, token: args.token };
    if (ctx.db.shardCoordinatorConnection.id.find(0)) ctx.db.shardCoordinatorConnection.id.update(connection);
    else ctx.db.shardCoordinatorConnection.insert(connection);
    if (ctx.db.shardCoordinatorConfig.id.find(0)) ctx.db.shardCoordinatorConfig.id.update(row);
    else ctx.db.shardCoordinatorConfig.insert(row);
    for (const part of ctx.db.shardProgramPart.iter()) ctx.db.shardProgramPart.part.delete(part.part);
    for (const shard of ctx.db.mapShard.iter()) {
      if (!ctx.db.shardCoordinatorSchedule.scheduledId.find(shard.id)) {
        ctx.db.shardCoordinatorSchedule.insert({ scheduledId: shard.id, scheduledAt: ScheduleAt.interval(1_000_000n) });
      }
    }
  },
);
export const stageShardProgram = spacetimedb.reducer(
  { part: t.u32(), total: t.u32(), source: t.string() }, (ctx, args) => {
    requireShardOperator(ctx);
    if (isMapShard(ctx) || args.total < 1 || args.total > 64 || args.part >= args.total || args.source.length > 200_000) throw new SenderError("Invalid map program part");
    if (args.part === 0) for (const row of ctx.db.shardProgramPart.iter()) ctx.db.shardProgramPart.part.delete(row.part);
    if (ctx.db.shardProgramPart.part.find(args.part)) ctx.db.shardProgramPart.part.update(args);
    else ctx.db.shardProgramPart.insert(args);
  },
);
export const coordinateMapShard = spacetimedb.procedure(
  { arg: shardCoordinatorSchedule.rowType }, t.unit(), (ctx, { arg }) => {
    // Only the scheduler may invoke this: clients cannot spawn extra jobs or
    // keep leases alive after the account service has disabled sharding.
    if (!sameIdentity(ctx.sender, ctx.databaseIdentity)) throw new SenderError("Scheduler required");
    coordinateShard(ctx, arg.scheduledId, { reward: deliverShardRewardImpl, checkpoint: checkpointShardLocationImpl });
    return {};
  },
);
export const synchronizeMapShard = spacetimedb.procedure(
  { payload: t.string() }, t.string(), (ctx, { payload }) => {
    requireShardOperator(ctx);
    const batch = decodeShardSnapshot(payload);
    const reply = ctx.withTx(tx => {
      if (!isMapShard(tx)) throw new SenderError("Map database required");
      const current = tx.db.shardReplicaState.id.find(0);
      if (!Array.isArray(batch.members) || batch.members.length > MAP_SHARD_CAPACITY) throw new SenderError("Invalid admission batch");
      if (batch.expiresAt > tx.timestamp.microsSinceUnixEpoch && (!current || batch.sequence > current.sequence)) {
        const desired = new Map(batch.members.map((row: any) => [row.identity.toHexString(), row]));
        for (const admission of tx.db.shardAdmission.iter()) {
          const next: any = desired.get(admission.identity.toHexString());
          if (!next || next.generation !== admission.generation) revokeShardPlayerImpl(tx, admission);
        }
        for (const member of batch.members) if (member.snapshot) installShardPlayerImpl(tx, member);
        const checkpoint = !current || tx.timestamp.microsSinceUnixEpoch - current.checkpointAt >= 15_000_000n;
        const state = { id: 0, sequence: batch.sequence, checkpointAt: checkpoint ? tx.timestamp.microsSinceUnixEpoch : current.checkpointAt };
        if (current) tx.db.shardReplicaState.id.update(state);
        else tx.db.shardReplicaState.insert(state);
        if (batch.enabled) renewShardLeaseImpl(tx, { checkpoint, enable: true });
        else {
          const runtime = tx.db.shardRuntime.id.find(0)!;
          if (runtime.enabled || runtime.leaseExpiresAtMicros !== 0n)
            tx.db.shardRuntime.id.update({ ...runtime, enabled: false, leaseExpiresAtMicros: 0n });
        }
      }
      const replica = tx.db.shardReplicaState.id.find(0);
      const rewards = [];
      for (const reward of tx.db.shardRewardOutbox.iter()) {
        rewards.push(reward);
        if (rewards.length === 100) break;
      }
      return { sequence: replica?.sequence,
        admitted: [...tx.db.shardAdmission.iter()].filter(row => tx.db.player.identity.find(row.identity)),
        checkpointAt: replica?.checkpointAt ?? 0n,
        // Older roots omit the cursor and retain the original full reply.
        // New roots acknowledge only after their checkpoint transaction commits.
        checkpoints: batch.checkpointAt === undefined || batch.checkpointAt !== replica?.checkpointAt
          ? [...tx.db.shardCheckpoint.iter()] : [],
        rewards,
      };
    });
    return encodeShardSnapshot(reply);
  },
);
export const acknowledgeShardRewards = spacetimedb.reducer({ keys: t.array(t.string()) }, (ctx, { keys }) => {
  requireShardOperator(ctx);
  if (keys.length > 100) throw new SenderError("Reward batch too large");
  for (const key of keys) ctx.db.shardRewardOutbox.key.delete(key);
});

// Guild mutations belong exclusively to the root. Regional modules
// deliberately do not export these reducers or snapshot procedures.
function requireGuildConnection(ctx: ModuleReducerCtx) {
  requireControllingPlayer(ctx);
  if (isMapShard(ctx) || isVirtualPlayer(ctx, ctx.sender)) throw new SenderError("Use your main character connection.");
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
}

function requireGuildPlayer(ctx: ModuleReducerCtx) {
  requireGuildConnection(ctx);
}

function guildFighterFor(ctx: ModuleReducerCtx, identity: Identity): DuelFighter {
  const progress = ctx.db.playerProgress.identity.find(identity);
  if (!progress) throw new SenderError("Player progress is unavailable.");
  const weapon = equippedRightHandForProgress(progress) || equippedLeftHandForProgress(progress);
  return {
    maxHp: maxHealthForProgress(ctx, identity, progress),
    damage: weapon ? duelDamage(ctx, identity, progress.damage) : 0,
    armor: researchedArmor(ctx, identity, progress.armor),
    regen: researchedRegen(ctx, identity, progress.regen),
    attackRate: weapon ? attackIntervalForProgress(progress) : 31,
  };
}

const guildService = createGuildService({
  powerFor: (ctx, identity) => {
    const progress = ctx.db.playerProgress.identity.find(identity);
    return progress ? effectivePowerForProgress(ctx, progress) : 0;
  },
  presenceFor: (ctx, identity) => ({
    // Root presence survives eye-off and autofarming; no movement subscription needed.
    online: Boolean(ctx.db.player.identity.find(identity))
      && (!isDeveloperIdentity(identity) || (ctx.db.developerPresencePreference.identity.find(identity)?.visible ?? false)),
    lastSeenAtMs: Number(ctx.db.playerLifetime.identity.find(identity)?.sessionStartedAt.microsSinceUnixEpoch ?? 0n) / 1000,
  }),
  profileFor: (ctx, identity) => ctx.db.playerProfile.identity.find(identity) ?? undefined,
  announceBattle: (ctx, report) => {
    const result = report.result;
    const message = result.outcome === "DRAW" ? `[${report.attacker}] × [${report.defender}] · Draw`
      : result.outcome === "VICTORY" ? `[${report.attacker}] defeated [${report.defender}]`
      : `[${report.defender}] defeated [${report.attacker}]`;
    insertChatMessage(ctx, ctx.sender, "GUILDS", message, 0n, false, undefined, `${report.attackerId}:${report.id}`);
  },
  fighterFor: (ctx, identity) => {
    const profile = ctx.db.playerProfile.identity.find(identity);
    if (!profile) throw new SenderError("Player profile is unavailable.");
    const progress = ctx.db.playerProgress.identity.find(identity);
    if (!progress) throw new SenderError("Player progress is unavailable.");
    return { name: profile.displayName, fighter: guildFighterFor(ctx, identity),
      appearance: leaderboardAppearanceForProgress(progress, profile),
      moveSpeed: PLAYER_SPEED,
      weaponItem: progress.equippedRightHand || progress.equippedLeftHand,
      range: guildWeaponRange(progress.equippedRightHand || progress.equippedLeftHand, progress.attackRange) };

  },
});

// Guest claiming and identity removal reach guildService, so this has to
// follow it; every other dep is a hoisted function or an earlier const.
const {
  syncSenderAccountStatus, claimGuestAccountFor, removeIdentityPresence, removeVirtualPlayerData,
  removePlayerIdentityData,
} = createAccountLifecycle({
  LEGACY_CLIENT_ERRORS, UPGRADE_BENCH_SLOT_ONE, UPGRADE_BENCH_SLOT_TWO, guildService, activeDuelFor,
  activeItemUpgradeForSlot, adjustVirtualPlayerCount, applyGemBalanceChange, earlierTimestamp,
  effectiveMovementSpeedForProgress, ensureCutsceneHistory, ensureGemWallet,
  ensureItemUpgradeCompletionSchedule, ensureResearchCompletionSchedule,
  equipmentPresentationForProgress, finishDuel, generatedDisplayName, hasFreshProgress,
  insertActiveItemUpgrade, isGeneratedDisplayName, itemUpgradeKey, leaderboardAppearanceForProgress,
  persistWorldLocation, playerWithMotion, powerFieldsForProgress, reconcileOnlinePlayers,
  refreshLeaderboard, removeItemUpgradeCompletionSchedules, removePlayerItemUpgradeData,
  removePlayerRealtimeState, removePlayerSafetyData, removeResearchCompletionSchedules,
  repairModeratedDisplayName, requireSupportedSessionProtocol, sameIdentity,
  syncDisplayNamePresentation, syncPlayerMotionIdentity, transferPlayerBlocks,
});

// Presence and motion bodies live in presence-runtime.ts. Only these four still
// borrow from index.ts; removeIdentityPresence comes from the lifecycle factory
// above, so this has to follow it.
const { savedWorldLocation, clearOrphanPresence, applyMovementState, enterShardPresence } = createPresenceRuntime({
  WORLD, VALID_MAP_IDS, MAP_ARRIVALS, hasEndlessTravelAccess, sameIdentity, finishLifetimeSession,
  removeIdentityPresence, requireMapWorkload, requireSupportedSessionProtocol, requireControllingPlayer,
  activeDuelFor, effectiveMovementSpeedForProgress, equippedFeetForProgress,
});

export const createGuild = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireGuildPlayer(ctx);
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress || effectivePowerForProgress(ctx, progress) < GUILD_CREATION_MIN_POWER) {
    throw new SenderError("Reach 1 billion power to create a guild.");
  }
  if (!isPublicDisplayNameAllowed(name)) throw new SenderError("Choose a different guild name.");
  guildService.create(ctx, name);
});
export const joinGuild = spacetimedb.reducer({ guildId: t.u64() }, (ctx, { guildId }) => { requireGuildPlayer(ctx); guildService.join(ctx, guildId); });
export const leaveGuild = spacetimedb.reducer((ctx) => { requireGuildPlayer(ctx); guildService.leave(ctx); });
export const transferGuildLeadership = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => { requireGuildPlayer(ctx); guildService.transfer(ctx, identity); });
export const setGuildVicePresident = spacetimedb.reducer({ identity: t.identity(), enabled: t.bool() }, (ctx, { identity, enabled }) => { requireGuildPlayer(ctx); guildService.setVicePresident(ctx, identity, enabled); });
export const kickGuildMember = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => { requireGuildPlayer(ctx); guildService.kick(ctx, identity); });
export const challengeGuild = spacetimedb.reducer({ opponentGuildId: t.u64() }, (ctx, { opponentGuildId }) => { requireGuildPlayer(ctx); guildService.challenge(ctx, opponentGuildId); });
export const getGuildHub = spacetimedb.procedure({ afterId: t.u64() }, t.string(), (ctx, { afterId }) => ctx.withTx(tx => {
  requireGuildConnection(tx);
  return JSON.stringify(guildService.snapshot(tx, afterId, hasSpacetimeAuthAccount(tx)));
}));
export const getGuildPreview = spacetimedb.procedure({ guildId: t.u64() }, t.string(), (ctx, { guildId }) => ctx.withTx(tx => {
  requireGuildConnection(tx);
  return JSON.stringify(guildService.preview(tx, guildId));
}));
export const getGuildReplay = spacetimedb.procedure({ reportKey: t.string() }, t.string(), (ctx, { reportKey }) => ctx.withTx(tx => {
  requireGuildConnection(tx);
  const announced = !tx.db.chatMessage.byGuildReplay.filter(reportKey)[Symbol.iterator]().next().done;
  const report = announced ? tx.db.guildBattleReport.key.find(reportKey) : null;
  if (!report) throw new SenderError("This replay is no longer available.");
  return report.payload;
}));

/** One-shot operator setup for the requested temporary opponent. Never runs on
 * login or startup, and never moves somebody out of an existing guild. */
export const seedTemporaryGuild = spacetimedb.reducer((ctx) => {
  requireShardOperator(ctx);
  if (isMapShard(ctx)) throw new SenderError("Use the root database.");
  const existing = ctx.db.guild.nameKey.find("temp");
  if (existing) {
    if (existing.members === 20) return;
    throw new SenderError("The temp guild already exists; its membership was preserved.");
  }
  const candidates = [...ctx.db.leaderboardEntry.iter()]
    .filter(row => !ctx.db.guildMember.identity.find(row.identity) && ctx.db.playerProgress.identity.find(row.identity)
      && ctx.db.playerProfile.identity.find(row.identity) && !isVirtualPlayer(ctx, row.identity))
    .sort((a, b) => a.powerLevel - b.powerLevel || a.identity.toHexString().localeCompare(b.identity.toHexString()))
    .slice(0, 20);
  if (candidates.length !== 20) throw new SenderError("Need twenty unassigned leaderboard players.");
  guildService.create({ ...ctx, sender: candidates[0].identity }, "temp");
  const guildId = ctx.db.guildMember.identity.find(candidates[0].identity)!.guildId;
  for (const member of candidates.slice(1)) guildService.join({ ...ctx, sender: member.identity }, guildId);
});


// Private backing tables are exposed only through sender-scoped views. Views
// depend on guild membership and blocks, so leaving or blocking revokes access.
export const mySocialMessages = spacetimedb.view(
  { name: "my_social_messages", public: true }, t.array(socialTables.socialMessage.rowType),
  ctx => latestSocialMessages(ctx),
);
const socialHubRow = t.row("SocialHubPayload", { identity: t.identity().primaryKey(), snapshot: t.string() });
export const mySocialHub = spacetimedb.view(
  { name: "my_social_hub", public: true }, t.array(socialHubRow),
  ctx => [{ identity: ctx.sender, snapshot: JSON.stringify(socialSnapshot(ctx, !(ctx.db.playerAccountStatus.identity.find(ctx.sender)?.isGuest ?? true))) }],
);
const socialService = createSocialService({ joinGuild: (ctx, id) => guildService.join(ctx, id) });
function requireSocialPlayer(ctx: ModuleReducerCtx) {
  requireControllingPlayer(ctx);
  if (isMapShard(ctx) || isVirtualPlayer(ctx, ctx.sender)) throw new SenderError("Use your main character connection.");
}
export const getChatMessageReactions = spacetimedb.procedure(
  { channel: t.string(), messageId: t.u64() }, t.string(), (ctx, { channel, messageId }) => ctx.withTx(tx => {
    requireSocialPlayer(tx); return JSON.stringify(readChatReactions(tx, channel, messageId));
  }),
);
export const setChatMessageReaction = spacetimedb.reducer(
  { channel: t.string(), messageId: t.u64(), reaction: t.string(), active: t.bool() },
  (ctx, { channel, messageId, reaction, active }) => {
    requireSocialPlayer(ctx); setChatReaction(ctx, channel, messageId, reaction, active);
  },
);
export const getSocialHub = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  requireSocialPlayer(tx); return JSON.stringify(socialSnapshot(tx, hasSpacetimeAuthAccount(tx)));
}));
export const getSocialChatHistory = spacetimedb.procedure(
  { channel: t.string(), peer: t.string(), beforeId: t.u64() },
  t.object("SocialChatPage", { messages: t.array(socialTables.socialMessage.rowType), hasMore: t.bool() }),
  (ctx, { channel, peer, beforeId }) => ctx.withTx(tx => {
    requireSocialPlayer(tx);
    return socialHistoryPage(tx, channel, peer, beforeId);
  }),
);
export const friendAction = spacetimedb.reducer({ action: t.string(), target: t.string() }, (ctx, { action, target }) => {
  requireSocialPlayer(ctx); socialService.friendAction(ctx, action, target);
});
export const guildInviteAction = spacetimedb.reducer({ action: t.string(), target: t.string(), invitationId: t.u64() }, (ctx, { action, target, invitationId }) => {
  requireGuildPlayer(ctx); socialService.guildInviteAction(ctx, action, target, invitationId);
});
export const sendSocialMessage = spacetimedb.reducer({ channel: t.string(), target: t.string(), message: t.string(), replyToMessageId: t.u64() }, (ctx, { channel, target, message, replyToMessageId }) => {
  requireSocialPlayer(ctx); socialService.sendMessage(ctx, channel, target, message, replyToMessageId);
});
export const reportSocialMessage = spacetimedb.reducer({ messageId: t.u64(), reason: t.string() }, (ctx, { messageId, reason }) => {
  requireSocialPlayer(ctx);
  if (!isChatReportReason(reason)) throw new SenderError("Choose a valid report reason.");
  const row = visibleSocialMessages(ctx).find(row => row.id === messageId);
  if (!row || sameIdentity(row.sender, ctx.sender)) throw new SenderError("Message is unavailable for reporting.");
  const key = `${ctx.sender.toHexString()}:${messageId}`;
  if (ctx.db.socialReport.key.find(key)) throw new SenderError("You already reported this message.");
  consumeReportRate(ctx);
  ctx.db.socialReport.insert({ key, reporter: ctx.sender, accused: row.sender, messageId, message: row.message, reason, reportedAt: ctx.timestamp });
  // Reuse the existing developer player-report inbox so private-chat reports
  // reach moderation without placing their text in any public chat table.
  const report = ctx.db.playerReport.insert({ id: 0n, reporter: ctx.sender,
    reporterName: ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER",
    target: row.sender, targetName: row.senderName, reason,
    note: `[${row.channel === "dm" ? "Private message" : "Guild chat"} #${row.id}] ${row.message}`,
    status: "pending", reportedAt: ctx.timestamp });
  if (isDeveloperIdentity(ctx.sender) && hasSpacetimeAuthAccount(ctx)) {
    moderateReportedMessage(ctx, "social", messageId, reason, "social_report", key);
    ctx.db.playerReport.id.update({ ...report, status: "resolved" });
  }
});


// Checkout remains off until a dedicated server verifier is configured. Players
// can reserve an allowance, but only that verifier can attest a paid receipt.
export const configureGemCommerce = spacetimedb.reducer(
  { verifier: t.identity(), enabled: t.bool() },
  (ctx, { verifier, enabled }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "configure_gem_commerce", "Database owner required.");
    if (isMapShard(ctx)) throw new SenderError("Commerce belongs to the root database.");
    const value = { id: 0, verifier, enabled };
    if (ctx.db.gemCommerceConfig.id.find(0)) ctx.db.gemCommerceConfig.id.update(value);
    else ctx.db.gemCommerceConfig.insert(value);
  },
);

function purchaseService(ctx: ReducerCtx<InferSchema<typeof spacetimedb>>) {
  return createGemPurchaseService({
    get: (id) => {
      const row = ctx.db.gemPurchase.reservationId.find(id);
      return row ? { ...row, owner: row.identity.toHexString() } : null;
    },
    slot: (key) => ctx.db.gemPurchaseSlot.key.find(key)?.reservationId ?? null,
    lock: (key, reservationId) => { ctx.db.gemPurchaseSlot.insert({ key, reservationId }); },
    unlock: (key) => { ctx.db.gemPurchaseSlot.key.delete(key); },
    save: (purchase) => {
      const previous = ctx.db.gemPurchase.reservationId.find(purchase.reservationId);
      const { owner, ...values } = purchase;
      const row = { ...values, identity: Identity.fromString(owner), createdAt: previous?.createdAt ?? ctx.timestamp, updatedAt: ctx.timestamp };
      if (previous) ctx.db.gemPurchase.reservationId.update(row);
      else ctx.db.gemPurchase.insert(row);
    },
    credit: (purchase, gems, reference) => {
      // Bind the global receipt to this exact reservation, including on retries.
      const duplicate = ctx.db.gemTransaction.externalReference.find(reference);
      if (duplicate && duplicate.note !== purchase.reservationId) throw new SenderError("Store receipt already used.");
      applyGemBalanceChange(ctx, { identity: Identity.fromString(purchase.owner), delta: gems,
        kind: "gem_purchase", note: purchase.reservationId, externalReference: reference });
    },
  });
}

function requireGemVerifier(ctx: ReducerCtx<InferSchema<typeof spacetimedb>>) {
  const config = ctx.db.gemCommerceConfig.id.find(0);
  // Disabling new checkout must still allow paid in-flight orders to settle.
  if (isMapShard(ctx) || !config || !config.verifier.equals(ctx.sender)) throw new SenderError("Purchase verifier required.");
}

export const reserveGemPurchase = spacetimedb.reducer(
  { packId: t.string(), reservationId: t.string() },
  (ctx, { packId, reservationId }) => {
    if (isMapShard(ctx) || !ctx.db.gemCommerceConfig.id.find(0)?.enabled) throw new SenderError("Purchases are not available yet.");
    if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in to purchase Gems.");
    purchaseService(ctx).reserve(ctx.sender.toHexString(), packId, reservationId, ctx.timestamp.microsSinceUnixEpoch);
  },
);

export const fulfillGemPurchase = spacetimedb.reducer(
  { reservationId: t.string(), identity: t.identity(), packId: t.string(), externalReference: t.string() },
  (ctx, { reservationId, identity, packId, externalReference }) => {
    requireGemVerifier(ctx);
    purchaseService(ctx).fulfill(reservationId, identity.toHexString(), packId, externalReference);
  },
);

export const cancelGemPurchase = spacetimedb.reducer(
  { reservationId: t.string() },
  (ctx, { reservationId }) => {
    requireGemVerifier(ctx);
    purchaseService(ctx).cancel(reservationId);
  },
);

export const myGemPurchases = spacetimedb.view(
  { name: "my_gem_purchases", public: true }, t.array(gemPurchaseTables.gemPurchase.rowType),
  (ctx) => Array.from(ctx.db.gemPurchase.byIdentity.filter(ctx.sender)),
);


export const ingestGemStoreEvent = spacetimedb.reducer(
  { eventId: t.string(), eventHash: t.string(), kind: t.string(), owner: t.string(), packId: t.string(), reference: t.string(), purchasedAtMs: t.f64() },
  (ctx, event) => {
    requireGemVerifier(ctx);
    if (event.purchasedAtMs > Number(ctx.timestamp.microsSinceUnixEpoch / 1000n) + 300_000) throw new SenderError("Payment timestamp is in the future.");
    ingestStoreEvent({
      eventHash: (id) => ctx.db.gemStoreEvent.eventId.find(id)?.eventHash ?? null,
      rememberEvent: (eventId, eventHash) => { ctx.db.gemStoreEvent.insert({ eventId, eventHash, receivedAt: ctx.timestamp }); },
      receipt: (reference) => ctx.db.gemStoreReceipt.reference.find(reference),
      saveReceipt: (receipt) => {
        const row = { ...receipt, updatedAt: ctx.timestamp };
        if (ctx.db.gemStoreReceipt.reference.find(row.reference)) ctx.db.gemStoreReceipt.reference.update(row);
        else ctx.db.gemStoreReceipt.insert(row);
      },
      reservation: (owner, packId, day) => {
        const slot = ctx.db.gemPurchaseSlot.key.find(`${owner}:${packId}:${day}`);
        const row = slot && ctx.db.gemPurchase.reservationId.find(slot.reservationId);
        return row ? { id: row.reservationId, createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1000n), status: row.status } : null;
      },
      fulfill: (id, owner, packId, reference) => { purchaseService(ctx).fulfill(id, owner, packId, reference); },
      balance: (owner) => ctx.db.playerGemWallet.identity.find(Identity.fromString(owner))?.balance ?? 0n,
      debitRefund: (owner, amount, reference) => {
        applyGemBalanceChange(ctx, { identity: Identity.fromString(owner), delta: -amount, kind: "gem_refund", note: reference, externalReference: `refund:${reference}` });
      },
      hold: (owner, reference, active) => {
        if (active && !ctx.db.gemCommerceHold.reference.find(reference)) ctx.db.gemCommerceHold.insert({ reference, identity: Identity.fromString(owner) });
        else if (!active) ctx.db.gemCommerceHold.reference.delete(reference);
      },
    }, event);
  },
);

export const devGemPurchaseReview = spacetimedb.view(
  { name: "dev_gem_purchase_review", public: true }, t.array(gemPurchaseTables.gemStoreReceipt.rowType),
  (ctx) => isDeveloperIdentity(ctx.sender) || isDatabaseOwnerIdentity(ctx.sender)
    ? [...ctx.db.gemStoreReceipt.iter()].filter(row => row.status === "review" || row.status === "refund_review") : [],
);

export type GameViewContext = ViewCtx<InferSchema<typeof spacetimedb>>;
export type GameReducerContext = ReducerCtx<InferSchema<typeof spacetimedb>>;

function hasEndlessTravelAccess(ctx: GameViewContext | GameReducerContext, identity: Identity) {
  return isDeveloperIdentity(identity) || Boolean(ctx.db.endlessTravelAccess.identity.find(identity));
}

export const myEndlessTravelAccess = spacetimedb.view(
  { public: true }, t.option(proceduralMapTables.endlessTravelAccess.rowType),
  (ctx) => hasEndlessTravelAccess(ctx, ctx.sender) ? { identity: ctx.sender } : undefined,
);

export const devSetEndlessTravelAccess = spacetimedb.reducer(
  { identity: t.identity(), enabled: t.bool() }, (ctx, { identity, enabled }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_set_endless_travel_access");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    const existing = ctx.db.endlessTravelAccess.identity.find(identity);
    if (enabled && !existing) ctx.db.endlessTravelAccess.insert({ identity });
    else if (!enabled && existing) ctx.db.endlessTravelAccess.identity.delete(identity);
  },
);

export const getDeveloperTravelTarget = spacetimedb.procedure({ query: t.string() }, t.string(), (ctx, { query }) => ctx.withTx(tx => {
  requireDeveloper(tx, "get_developer_travel_target");
  const target = findDeveloperTravelTarget(tx, query);
  return JSON.stringify({ identity: target.identity.toHexString(), displayName: target.displayName, mapId: target.mapId });
}));

export const devTeleportToPlayer = spacetimedb.procedure({ identity: t.identity(), mapId: t.string() }, t.string(), (ctx, args) => {
  const target = ctx.withTx(tx => {
    requireDeveloper(tx, "dev_teleport_to_player");
    if (activeDuelFor(tx, tx.sender)) throw new SenderError("Finish the duel before teleporting.");
    if (activeDuelFor(tx, args.identity)) throw new SenderError("Player is in a duel. Try again afterward.");
    return readDeveloperTravelTarget(tx, args.identity, args.mapId);
  });
  const position = readShardTravelPosition(ctx, target);
  return ctx.withTx(tx => {
    requireDeveloper(tx, "dev_teleport_to_player");
    const current = requireControllingPlayer(tx);
    if (current.hp <= 0 || activeDuelFor(tx, tx.sender)) throw new SenderError("Teleport unavailable while dead or dueling.");
    if (activeDuelFor(tx, args.identity)) throw new SenderError("Player is in a duel. Try again afterward.");
    const latest = readDeveloperTravelTarget(tx, args.identity, args.mapId);
    if (latest.shardId !== target.shardId || latest.generation !== target.generation)
      throw new SenderError("Player moved to another instance. Try again.");
    // Choose their instance before the normal transition assigns one for us.
    if (latest.shardId !== undefined) assignMapShard(tx, { ...current, mapId: latest.mapId }, latest.shardId);
    const moved = transitionPlayerMap(tx, current, latest.mapId, position ?? latest, latest.facing);
    persistWorldLocation(tx, moved);
    return JSON.stringify({ mapId: moved.mapId, x: moved.x, y: moved.y, facing: moved.facing });
  });
});

export const devTeleportEndless = spacetimedb.reducer(
  { number: t.f64() }, (ctx, { number }) => {
    const player = requireControllingPlayer(ctx);
    if (!hasEndlessTravelAccess(ctx, ctx.sender)) denyPrivilegedAccess(ctx, "dev_teleport_endless", "Developer travel access required.");
    if (isDeveloperIdentity(ctx.sender)) requireDeveloper(ctx, "dev_teleport_endless");
    if (isMapShard(ctx)) throw new SenderError("Use the world connection.");
    if (!Number.isSafeInteger(number) || number < 1) throw new SenderError("Enter a positive whole map number.");
    if (player.hp <= 0) throw new SenderError("Respawn before teleporting.");
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before teleporting.");
    const mapId = proceduralMapId(number);
    const moved = transitionPlayerMap(ctx, player, mapId, generateMap(mapId).arrival);
    persistWorldLocation(ctx, moved);
  },
);

export const myProceduralBoss = spacetimedb.view(
  { public: true }, t.option(proceduralMapTables.proceduralInstanceBoss.rowType), (ctx) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    const key = player && proceduralBossKey(ctx, player.mapId);
    return key ? ctx.db.proceduralInstanceBoss.key.find(key) ?? undefined : undefined;
  },
);

export const prepareProceduralBoss = spacetimedb.reducer({ mapId:t.string() }, (ctx, {mapId}) => {
  if (PERSONAL_BOSS_COMBAT) return;
  const player = requireControllingPlayer(ctx);
  if (player.mapId !== mapId) return;
  const key = proceduralBossKey(ctx, mapId);
  if (key) ensureProceduralBoss(ctx, mapId, key);
});
const proceduralHitArgs = { mapId:t.string(), bossKey:t.string(), encounter:t.u64(), hits:t.u32(), x:t.f64(), y:t.f64() };
export const hitProceduralBoss = spacetimedb.reducer(proceduralHitArgs, (ctx, action) => applyProceduralBossHit(ctx, action));
export const hitProceduralBossBatch = spacetimedb.reducer(proceduralHitArgs, (ctx, action) => applyProceduralBossHit(ctx, action));

const rankedLeaderboardPlayer = t.object("RankedLeaderboardPlayer", { rank: t.u32(), entry: leaderboardEntry.rowType });
export const getLeaderboardWindow = spacetimedb.procedure(
  { stat: t.string() }, t.array(rankedLeaderboardPlayer),
  (ctx, { stat }) => ctx.withTx(tx => readLeaderboardWindow(tx, stat)),
);
export const getLeaderboardPage = spacetimedb.procedure(
  { stat: t.string(), startRank: t.u32(), count: t.u32() },
  t.object("LeaderboardPage", { entries: t.array(rankedLeaderboardPlayer), startRank: t.u32(), endRank: t.u32(), localRank: t.u32(), total: t.u32() }),
  (ctx, { stat, startRank, count }) => ctx.withTx(tx => readLeaderboardPage(tx, stat, startRank, count)),
);

export const latestChatMessages = spacetimedb.anonymousView(
  { public: true }, t.array(chatMessage.rowType),
  ctx => readPublicChatPage(ctx).messages,
);
export const getChatHistory = spacetimedb.procedure(
  { beforeId: t.u64() }, t.object("PublicChatPage", { messages: t.array(chatMessage.rowType), hasMore: t.bool() }),
  (ctx, { beforeId }) => ctx.withTx(tx => {
    requireControllingPlayer(tx);
    return readPublicChatPage(tx, beforeId);
  }),
);

// Private evidence is fetched only on demand, never through a public view.
export const getModerationHistory = spacetimedb.procedure({ beforeId: t.u64() }, t.string(),
  (ctx, { beforeId }) => ctx.withTx(tx => {
    if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_moderation_history");
    return JSON.stringify(readModerationHistory(tx, beforeId));
  }),
);

// New clients subscribe to extended views; existing app schemas remain unchanged.
const publicChatWithReactions = t.row("PublicChatWithReactions", { ...chatMessage.rowType.row, reactionCountsJson: t.string() });
const socialChatWithReactions = t.row("SocialChatWithReactions", { ...socialTables.socialMessage.rowType.row, reactionCountsJson: t.string() });
export const latestChatMessagesWithReactions = spacetimedb.anonymousView(
  { public: true }, t.array(publicChatWithReactions),
  ctx => readPublicChatPage(ctx).messages.map(row => ({ ...row, reactionCountsJson: row.moderated ? "{}" : reactionCountsFor(ctx, "public", row.id) })),
);
export const mySocialMessagesWithReactions = spacetimedb.view(
  { public: true }, t.array(socialChatWithReactions),
  ctx => latestSocialMessages(ctx).map(row => ({ ...row, reactionCountsJson: row.moderated ? "{}" : reactionCountsFor(ctx, "social", row.id) })),
);
export const getChatHistoryWithReactions = spacetimedb.procedure(
  { beforeId: t.u64() }, t.object("PublicChatPageWithReactions", { messages: t.array(publicChatWithReactions), hasMore: t.bool() }),
  (ctx, { beforeId }) => ctx.withTx(tx => {
    requireControllingPlayer(tx);
    const page = readPublicChatPage(tx, beforeId);
    return { ...page, messages: page.messages.map(row => ({ ...row, reactionCountsJson: row.moderated ? "{}" : reactionCountsFor(tx, "public", row.id) })) };
  }),
);
export const getSocialChatHistoryWithReactions = spacetimedb.procedure(
  { channel: t.string(), peer: t.string(), beforeId: t.u64() },
  t.object("SocialChatPageWithReactions", { messages: t.array(socialChatWithReactions), hasMore: t.bool() }),
  (ctx, { channel, peer, beforeId }) => ctx.withTx(tx => {
    requireSocialPlayer(tx);
    const page = socialHistoryPage(tx, channel, peer, beforeId);
    return { ...page, messages: page.messages.map(row => ({ ...row, reactionCountsJson: row.moderated ? "{}" : reactionCountsFor(tx, "social", row.id) })) };
  }),
);

export const configurePatreon = spacetimedb.reducer({ clientId: t.string(), clientSecret: t.string(), campaignId: t.string(), silverTierId: t.string(), goldTierId: t.string(), redirectUri: t.string() }, (ctx, config) => {
  if (!isDatabaseOwnerIdentity(ctx.sender) || isMapShard(ctx)) denyPrivilegedAccess(ctx, "configure_patreon", "Database owner required.");
  if (!config.clientId || !config.clientSecret || !/^\d+$/.test(config.campaignId) || !/^\d+$/.test(config.silverTierId) || !/^\d+$/.test(config.goldTierId) || config.silverTierId === config.goldTierId) throw new SenderError("Invalid Patreon configuration.");
  if (!validPatreonRedirect(config.redirectUri)) throw new SenderError("Use the database's Patreon callback URL.");
  const row = { id: 0, ...config };
  if (ctx.db.patreonConfig.id.find(0)) ctx.db.patreonConfig.id.update(row); else ctx.db.patreonConfig.insert(row);
});
export const beginPatreonLink = spacetimedb.procedure({ state: t.string() }, t.string(), (ctx, { state }) => ctx.withTx(tx => {
  if (isMapShard(tx) || !hasSpacetimeAuthAccount(tx)) throw new SenderError("Sign in to link Patreon.");
  return beginSupporterLink(tx, state);
}));
export const refreshPatreonMembership = spacetimedb.procedure({}, t.string(), ctx => refreshPatreon(ctx));
export const getPatreonStatus = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => JSON.stringify(patreonStatus(tx, ctx.sender))));
// One shared materialization, refreshed by membership/profile changes rather
// than one procedure call per sign-in. Never expose Patreon IDs or credentials.
export const patreonTickerSupporters = spacetimedb.anonymousView(
  { name: "patreon_ticker_supporters", public: true },
  t.array(t.row("PatreonTickerSupporter", { identity: t.identity().primaryKey(), name: t.string(), validUntilMs: t.f64() })),
  ctx => [...ctx.db.patreonLink.iter()].flatMap(link => {
    if (!link.userId || (link.tier !== "silver" && link.tier !== "gold")) return [];
    const profile = ctx.db.playerProfile.identity.find(link.identity);
    return profile ? [{ identity: link.identity, name: profile.displayName, validUntilMs: link.validUntilMs }] : [];
  }),
);
export const getAvatarFrames = spacetimedb.procedure({ identities: t.array(t.identity()) }, t.string(), (ctx, { identities }) => ctx.withTx(tx => {
  if (identities.length > 50) throw new SenderError("Request at most 50 portraits.");
  return JSON.stringify(identities.map(identity => { const { tier, frame, validUntilMs } = patreonStatus(tx, identity); return { identity: identity.toHexString(), tier, frame, validUntilMs }; }));
}));
export const setAvatarFrame = spacetimedb.reducer({ frame: t.string() }, (ctx, { frame }) => {
  const row = ctx.db.patreonLink.identity.find(ctx.sender), status = patreonStatus(ctx, ctx.sender);
  if (!allowedAvatarFrame(status.tier, frame)) throw new SenderError("This frame requires an active supporter membership.");
  if (status.preview) {
    const preview = { identity: ctx.sender, frame };
    if (ctx.db.patreonPreview.identity.find(ctx.sender)) ctx.db.patreonPreview.identity.update(preview);
    else ctx.db.patreonPreview.insert(preview);
    return;
  }
  if (row && row.frame !== frame) ctx.db.patreonLink.identity.update({ ...row, frame });
});
export const disconnectPatreon = spacetimedb.reducer(ctx => unlinkPatreon(ctx));
export const requestPatreonHelp = spacetimedb.reducer({ email: t.string() }, (ctx, { email }) => {
  requireControllingPlayer(ctx);
  requestPatreonSupport(ctx, email);
});
export const patreonOauthCallback = spacetimedb.httpHandler((ctx, request) => patreonCallback(ctx, request.uri));
export const patreonRoutes = spacetimedb.httpRouter(new Router().get("/patreon/callback", patreonOauthCallback));
