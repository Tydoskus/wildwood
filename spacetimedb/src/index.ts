import { playerPrestigeChallenge, playerPrestigeChallengeParked, prestigeChallengeBackup, prestigeChallengeRun, restorePrestigeChallenge } from "./prestige-challenge";
import { standsAtResearch } from "./research-station";
import { playerDailyQuest, guildQuestWeek, guildMemberQuestWeek, soloQuestWeek, playerQuestWeekTotal, ensureDailyQuests, pruneOldGuildQuestWeeks, recordDailyQuestKills, memberQuestStanding, questCollectStanding, collectMemberQuests, moveSoloQuestsToGuild, refreshQuestBonus, guildQuestBonusFor } from "./daily-quests";
import { duelCombatSnapshot } from "./duel-combat-snapshot";
import { playerEquipmentLock, setEquipmentLock } from "./equipment-locks";
import { compactNumberChanged } from "../../shared/compact-number";
import { denyPrivilegedAccess } from "./privileged-access-audit";
import { defeatSessionRestriction, defeatRestrictionError, restrictDefeatSession, suspendPlayerAccount } from "./defeat-session";
import { findDeveloperTravelTarget, readDeveloperTravelTarget } from "./developer-travel";
import { mapBalanceVersion, mapBalanceHead, playerMapBalance, balanceEditorState, saveMapBalance, pinMapBalance, liveMapBalance, mapBalanceForIndex } from "./map-balance";
import { resolveMapBalance, validateBalanceSettings } from "../../shared/map-balance";
import { accountDeletionRequest, eraseKeepingRequest, queueAccountDeletion } from "./account-deletion";
import { mailboxEquipment, deliverEquipmentMail, claimEquipmentMail } from "./mailbox-equipment";
import { nameChangeStatus } from "../../shared/name-change";
import { validPatreonRedirect } from "./patreon-url";
import { isValidProfileIcon } from "../../shared/profile-icons";
import { releaseNotice, releaseAcknowledgement, writeReleaseWindow, acknowledgeReleaseWindow, announceClientUpdate as announceClientUpdateWindow } from "./release-control";
import { recordBossGateClear } from "./boss-gates";
import { playerMultiplayerPreference, writeMultiplayerPreference } from "./multiplayer-preference";
import { enemyDefeatBank, enemyDefeatBudget, playerDefeatClock, playerMapDeparture, acceptEnemyDefeats, permittedDefeatMaps, pruneIdleDefeatBudgets, throttleKillReports, type EnemyDefeatBatch, type ThrottledClocks } from "./enemy-defeats";
import { grantVirtualPlayerConsent, revokeVirtualPlayerConsent } from "./virtual-player-consent";
import { offlineProgressTables, beginOfflineWindow, grantOfflineProgress, collectOfflineProgress, setSimulatedTimeAway } from "./offline-progress";
import { offlineGatherChoice, playerGatherPicks, registerGatherPicks } from "./offline-gathering";
import { ensureRunTiming, playerRunTiming, playerRunHistory } from "./run-timing";
import { playerNockedArrow, registerArrows } from "./arrows";
import { offlineActivity } from "../../shared/offline-gathering";
import { playerOfflinePreference, writeOfflinePreference } from "./offline-preference";
import { playerAudioSetting, writeAudioSettings } from "./audio-settings";
import { playerIgnoredDrop, writeIgnoredDrops } from "./ignored-drops";
import { playerLootSetting, writeLootSettings } from "./loot-settings";
import { playerProfileSnapshot, requireSnapshotForIcon, takeProfileSnapshot } from "./profile-snapshot";
import { claimAdGemReward, playerAdReward, playerAdWatch, startAdWatch } from "./ad-gem-reward";
import { playerClientHost, recordClientHost } from "./client-host";
import { playerChatMute, setChatMute } from "./chat-mute";
import { requireErasureConfirmation } from "./account-erasure";
import { chatHeartAllowance, chatReactionCooldown, chatReactionSummary, chatReactionUnlock, playerChatHearts, reactionCountsFor, chatReaction, readChatReactions, setChatReaction, grantGemHeartUnlock, isChatModerator, chatModerator, moderatorHeartFor, setChatModerator, removeAccountReactions } from "./chat-reactions";
import { pruneIdleStreams, regularEnemyLootCursor, regularEnemyStream } from "./regular-enemy-loot";
import { playerOnboarding, advanceOnboarding, needsOnboarding } from "./onboarding";
import { deliverDisconnectCompensation, deliverCombatUpdateGift, deliverOutageCompensation, announceOutageCompensation, deliverAutofarmTestGift } from "./disconnect-compensation";
import { connectionDiagnosticTables, recordConnectionDiagnostics, cleanupConnectionDiagnostics } from "./connection-diagnostics";
import { moderationTables, recordModerationAction, readModerationHistory, readPlayerModerationHistory, searchModerationHistory } from "./moderation-history";
import { readDevConsole, readDevPlayerCard, warnPlayer } from "./dev-console";
import { mailboxLetter, mailboxReceipt, mailboxEntryV2, mailboxForPlayerV2, publishMailboxLetter, updateMailboxReceipt, clearExpiredMail } from "./mailbox";
import { playerJoinDate, syncPlayerJoinDate } from "./player-join-date";
import { rollbackPlayerProgression } from "./player-progression-rollback";
import { playerItemGift, deliverAlphaTesterGifts, claimItemGift } from "./item-gifts";
import { playerBowSkill } from "./bow-skills";
import { playerSwordSkill } from "./sword-skills";
import { duelStaffSkill, playerStaffSkill, playerWornStaffSkill } from "./staff-skills"; import { registerStaffs } from "./starter-staff";
import { ensureWeaponSkillRoll } from "./weapon-skills";
import { playerEquipmentCopy, pendingEquipmentOffer, createEquipmentCopies, publishItemDrop, offerDuplicateEquipment, expireEquipmentOffers, playerItemCollection, registerItemCollection } from "./equipment-copies";
import { playerItemRefine, playerCopyRefine, playerOre, playerRefineResult, playerRefinePity, registerItemRefine } from "./item-refine";
import { reachableStopFor } from "./door-reach";
import { playerMining, playerMinedNode, playerMiningLevel, registerMining } from "./mining";
import { playerWoodcutting, playerChoppedTree, playerWoodcuttingLevel, registerWoodcutting } from "./woodcutting";
import { awardWeaponMastery, playerMasteryLevel, playerWeaponMastery, registerWeaponMastery } from "./weapon-mastery";
import { awardKillGold, playerGold, registerGold } from "./gold";
import { registerGradeShop } from "./grade-shop";
import { registerGradeSale } from "./grade-sale";
import { exchangeTables, registerExchange } from "./exchange";
import { playerStarterWeapon, registerStarterChest } from "./starter-chest";
import { playerCraftSkill, playerCraftLevel, registerCrafting } from "./crafting";
import { playerTool, registerTools } from "./tools";
import { mergeOldGearPayout, oldGearPayout, payOutOldGear } from "./old-gear-payout";
import { playerCard, playerGearSlots, playerCopySlots, playerCardDrop, registerGearCards } from "./gear-cards"; import { playerActiveCard, registerActiveCards } from "./active-cards"; import { playerCardAttackCap, syncCardAttackCap } from "./card-attack-cap"; import { combatStampEpoch, keepsCombatProfile, playerCombatStamp, touchAllCombatProfiles, touchCombatProfile, touchCombatProfileAfterReducers } from "./combat-profile"; import { playerBuild, playerBuildName, registerBuilds } from "./builds"; import { playerWornSkill, syncWornSkill } from "./worn-skill";
import { awardCardDrops, playerBossCardRoll, playerCardMeter } from "./card-drops"; import { playerCardShopPurchase, registerCardShop } from "./card-shop";
import { awardRegularEnemyLoot } from "./enemy-loot-award";
import { moderateReportedMessage } from "./chat-report-moderation";
import { PLAYER_SKIN_TONES } from "../../shared/player-skin-tones";
import { leaderboardPageTables, readLeaderboardWindow, readLeaderboardRanks, findLeaderboardSpot } from "./leaderboard-pages";
import { effectiveMovementSpeedForProgress, refreshPrestigeMovement, attackIntervalForProgress, savedAttackRange } from "./player-speed";
import { playerBonusToggle } from "./bonus-toggles";
import { playerLuckResearch } from "./luck-research";
import { playerResearchRank, registerResearchRanks } from "./research-rank";
import { registerBonusToggleReducers } from "./bonus-toggles-reducer";
import { playerNameColor, registerProfileLookReducers } from "./profile-look";
import { playerPrestige, playerPrestigePerk, prestigeExpansion, playerPrestigeExpansionPerk, playerPrestigeCardPerk, playerFreeRespec } from "./prestige-expansion";
import { earlierTimestamp } from "./timestamp-utils";
import { createCosmeticConversion } from "./cosmetic-conversion";
import { playerCosmeticRefine, registerCosmeticRefine } from "./cosmetic-refine";
import { publicChatCursor, readPublicChatPage } from "./public-chat-history";
import { createKillGems, gemKillDaily, gemLedgerTrim } from "./kill-gems";
import { createPrestige, statRewardMultiplierFor } from "./prestige";
import { generateMap, proceduralMapId, PROCEDURAL_ENTRY_BOSS } from "../../shared/procedural-maps";
import { proceduralMapTables, proceduralBossKey } from "./procedural-maps";
import { ingestStoreEvent } from "./gem-store-events";
import { gemPurchaseTables } from "./gem-purchase-tables";
import { patreonTables } from "./patreon-tables";
import { beginPatreonLink as beginSupporterLink, refreshPatreon, sweepPatreonLinks, ensurePatreonSweep, PATREON_SWEEP_INTERVAL_MICROS, patreonStatus, lentLooksFor, unlinkPatreon, patreonCallback } from "./patreon";
import { requestPatreonSupport } from "./patreon-support";
import { triggerServerBoost, registerServerBoost } from "./server-boost";
import { serverBoostTables } from "./server-boost-tables";
import { chatAnnouncementTables } from "./chat-announcement";
import { allowedAvatarFrame, isAvatarFrame } from "../../shared/avatar-frames";
import { createGemPurchaseService } from "./gem-purchase-service";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { registerTown, TOWN_ARRIVAL, TOWN_MAP_ID } from "./town";
import { guildHallMember, guildHallReturnPointFor, memberEnteredWorld, guildHallMemberLeft, guildHallTables, isGuildHallMap, registerGuildHall } from "./guild-hall";
import { isSoulMap, noteEnemyDefeats, registerSoulDimension, soulDimensionOpenFor, soulDimensionTables, wideMotionMap, worldBoundsFor } from "./soul-dimension";
import { insertSnapshotRow, updateSnapshotRow } from "./snapshot-row-writes";
import { createPlayerMotionFrameSampler } from "../../shared/player-motion-sample";
import { schema, SenderError, Router, table, t, type InferSchema, type ReducerCtx, type ViewCtx } from "spacetimedb/server";
import { Identity, ScheduleAt, Timestamp } from "spacetimedb";
import { accountEmail, otherCharacterForLogin, recordAccountEmail } from "./account-email";
import { beginLoginMove, claimLoginMove, loginMove, swapCharacterLogins } from "./account-transfer";
import { devReviewTables, findDevPlayers, liftPlayerSuspension, readDevReviewQueue, recordBugDeletion, restoreMessageFromChat, reviewBug, reviewReport } from "./dev-review";
import { QUEST_BOARD_SEEN_BIT, portalCutsceneBit, unlockedPortalCutsceneMask } from "../../shared/portal-cutscenes";
import { playerBlockKey, playerReportValidationError } from "../../shared/player-safety";
import {
  isResearchId,
  researchDurationMs,
} from "../../shared/research";
import { VIRTUAL_PLAYER_LIMIT, isVirtualPlayerTicket } from "../../shared/virtual-player-load-test";
import {
  PLAYER_GENDER_UNSET,
  isSelectedPlayerGender,
} from "../../shared/player-gender";
import { isPublicDisplayNameAllowed } from "./chat-moderation";
import { isChatReportReason } from "../../shared/chat-report";
import { AGE_BAND_UNVERIFIED, TERMS_VERSION, isEligiblePlayerAgeBand, isPlayableAgeBand } from "../../shared/legal";
import { nextChatReportRateState } from "./chat-report-rate-limit";
import {
  STARTUP_TELEMETRY_MAX_BATCH,
  normalizeStartupTelemetrySample,
} from "../../shared/startup-telemetry";
import {
  nextStartupTelemetryRateState,
} from "./startup-telemetry-policy";
import { createCombatReport } from "./boss-combat";
import { createModuleMigrations } from "./module-migrations";
import { UPGRADE_BENCH_SLOT_ONE, UPGRADE_BENCH_SLOT_TWO, UPGRADE_BENCH_SLOT_THREE, normalizeUpgradeBenchSlot, requireUpgradeBenchSlot, activeItemUpgradeForSlot, activeItemUpgradeEntriesFor, insertActiveItemUpgrade } from "./upgrade-bench-slots";
import {
  createPresenceRuntime, MOTION_DETAIL_FRAME_INTERVAL_MICROS, MAP_FRAME_INTERVAL_MICROS, playerZone,
  playerWithMotion, stoppedMotionFields, syncPlayerMotion, syncPlayerMotionIdentity,
  ensureMotionDetailFrameSchedule, ensureRealtimeFrameSchedules, motionSample, persistWorldLocation,
  syncPlayerMapMarker, ensureWorldStatus, reconcileOnlinePlayers, requireScheduler, ensureRepeatingSchedule,
} from "./presence-runtime";
import { createDuelRuntime, activeDuelFor, clearExpiredDuelRequests } from "./duel-runtime";
import { createAccountLifecycle, clearExpiredAccountLinks, dailyGemBonusClaimReference } from "./account-lifecycle";
import { analyticsTables, finishAnalyticsSession, readAnalyticsDashboard, recordAnalyticsConversion, recordAnalyticsMilestone, recordAnalyticsSessionStart } from "./analytics";
import {
  DAILY_LOGIN_GEM_BONUS,
  MAX_INVENTORY_SLOT_CAPACITY,
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  UPGRADE_BENCH_THIRD_SLOT_GEM_COST,
  inventorySlotCapacity,
  inventorySlotUnlockCost,
  itemUpgradeSpeedUpGemCost,
  researchSpeedUpGemCost,
} from "../../shared/gems";
import { socialTables } from "./social-tables";
import { pausedResearch, pauseActiveResearch, takePausedResearch } from "./research-pause";
import { createSocialService, socialSnapshot, visibleSocialMessages, latestSocialMessages, socialHistoryPage } from "./social-service";
import { playerDirectoryJson } from "./player-directory";
import { guildTables } from "./guild-tables";
import { registerGuildJoinRequestView } from "./guild-admissions";
import { createGuildService } from "./guild-service";
import { registerGuildReducers } from "./guild-reducers";
import { aggroChallengeRun, endAggroChallenge, playerAggroChallenge, playerAggroChallengeParked, registerAggroReducers, restartAggroRunOnDeath } from "./aggro-challenge";
import { playerAutoFarmPuppet, registerAutoFarmPuppetReducers } from "./autofarm-puppet";
import { GUILD_MAX_RANGE, guildWeaponRange } from "../../shared/guild-combat";
import type { DuelFighter } from "../../shared/duel-combat";
import {
  itemDefinition,
  STARTER_STONE,
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
  BOSS_REWARD_CLAIM_BITS,
  MAP_IDS,
  PLAYER_BASE_HP,
  PLAYER_RADIUS,
  PLAYER_SPAWN,
  PLAYER_SPEED,
  playerBaseMovementSpeed,
  TUTORIAL_FOREST_MAP_ID,
} from "../../shared/rules";
import { readPlayerProgress, withDuelWide } from "./wide-stats";
import { playerInventory, playerWideStats, duelWideStats, duelReplayWideStats, playerCombatRating } from "./wide-stats-table";
import { LEGACY_CLIENT_ERRORS, sameConnection, sessionForContext, requireSession, blockedSession, isSupportedProtocol, requireCurrentLegalConsent, requireChatAge, requireSupportedSessionProtocol, requireControllingPlayer, requireControllingPlayerRow, isDeveloperIdentity, isDatabaseOwnerIdentity, isVirtualPlayer, requireDeveloperSession, requireDeveloper, touchPlayerAccessAudit, backfillKnownAccessAudit, sameIdentity, hasSpacetimeAuthAccount } from "./session-guards";
import { defaultPlayerProgress, samePlayerProgressValues, hasFreshProgress, resultIncludesContributor, contributedToLatestPrismshell, forestItemCountForProgress, inventoryForProgress, slotUpgradeKey, itemUpgradeLevelFor, itemLevelFor, playerOwnsItem, restoreItemToProgress, equippedHeadForProgress, equippedChestForProgress, equippedFeetForProgress, equippedRightHandForProgress, equippedLeftHandForProgress, cosmeticEquipmentForProgress, equipmentPresentationForProgress, leaderboardAppearanceForProgress, maxHealthForProgress } from "./progress-helpers";
import { researchForPlayer, assertResearchAvailable, activeResearchIsAvailable, removeResearchCompletionSchedules, completeActiveResearch, ensureResearchCompletionSchedule, reconcileActiveResearch } from "./research-runtime";
import { ensurePlayerLifetime, finishLifetimeSession, markPlayerBalanceCurrent, playerBalanceProgress, effectivePowerStatsForProgress, effectivePowerForProgress, powerFieldsForProgress, researchedDamage, researchedArmor, researchedRegen } from "./player-power";
import { removeItemUpgradeCompletionSchedules, removePlayerItemUpgradeData, ensureItemUpgradeCompletionSchedule, completeActiveItemUpgrade, cancelActiveItemUpgrade, reconcileActiveItemUpgrade } from "./item-upgrade-runtime";
import { ensureGemWallet, applyGemBalanceChange, creditGemsWithoutLedger, currentUtcDayKey, ensureDailyGemBonusState } from "./gem-wallet";
import { writeProgressAndPresentation } from "./player-power";
import { refreshLeaderboard, requestLeaderboardRefresh, refreshLeaderboardIfDue } from "./leaderboard-refresh";
import { generatedDisplayName, isGeneratedDisplayName, syncDisplayNamePresentation, repairModeratedDisplayName, changePlayerDisplayName } from "./display-names";
import { insertChatMessage, clearExpiredHistory, trimStartupTelemetry, clearExpiredStartupTelemetryRateLimits, sendPlayerChatMessage } from "./chat-runtime";
import { MAINTENANCE_INTERVAL_MICROS, VIRTUAL_PLAYER_RUN_LIFETIME_MICROS, adjustVirtualPlayerCount, virtualPlayerCountForOwner, clearExpiredVirtualPlayerRuns, clearOrphanRealtimeState, ensureMaintenanceSchedule, ensureMaintenanceSweepSchedule, removePlayerRealtimeState } from "./maintenance-runtime";
import { autoEquip } from "./player-power";
import { publishPlayerDeathFrame, resetProgressToDefaults, resetWholeSave, startFreshRun, respawnWithProgress, transitionPlayerMap } from "./character-reset";
import { saveSubmittedProgress } from "./progress-save";
import { WORLD, VALID_MAP_IDS, canonicalMapId, MAP_ARRIVALS, changePlayerMap, hasEndlessTravelAccess, teleportToResearchRoom, teleportToTownSquare as teleportToSquare, travelOnward, travelToMap as travelStraightToMap } from "./map-travel";
import { startItemUpgradeFor } from "./item-upgrade-runtime";
import { devResetDailyBonus, devCopyCombatStats, devUpdateSave } from "./dev-save-tools";
import { setMotionInterest, setPlayerSpeed } from "./movement-requests";
// Only regular enemies use server reward/combat bounds. Boss clears persist gates.
const { combatBoundForReport } = createCombatReport({
  attackIntervalForProgress, itemUpgradeLevelFor: itemLevelFor, inventoryForProgress,
  equippedRightHandForProgress, equippedLeftHandForProgress, equippedHeadForProgress, equippedChestForProgress,
});
// Duel bodies live in duel-runtime.ts; the duel reducers and the equipment
// snapshot below keep calling the same names. Every dep is a hoisted function,
// so this only has to precede the lifecycle factory that borrows finishDuel.
const { guildFighter, finishDuel, resolveDuel, startDuel, publishDuelReplay } = createDuelRuntime({
  requireControllingPlayer, isSupportedProtocol, sameIdentity, playersBlocked, isVirtualPlayer,
  insertChatMessage, researchedDamage, researchedArmor, researchedRegen, maxHealthForProgress,
  attackIntervalForProgress, equippedRightHandForProgress, equippedLeftHandForProgress,
  equipmentPresentationForProgress,
});

// One-time data migrations live in module-migrations.ts; connect and
// runMaintenance keep calling runPendingModuleMigrations by name. Placed after
// the boss factory and the bench slot consts, the last consts it reads.
const { runPendingModuleMigrations } = createModuleMigrations({
  MAP_ARRIVALS, MAINTENANCE_INTERVAL_MICROS, UPGRADE_BENCH_SLOT_ONE, inventoryForProgress,
  equippedRightHandForProgress, equippedLeftHandForProgress, equippedFeetForProgress,
  equipmentPresentationForProgress, forestItemCountForProgress, cancelActiveItemUpgrade,
  itemUpgradeLevelFor, effectiveMovementSpeedForProgress, powerFieldsForProgress,
  effectivePowerForProgress, effectivePowerStatsForProgress, playerWithMotion,
  syncPlayerMotionIdentity, persistWorldLocation, transitionPlayerMap, refreshLeaderboard,
  markPlayerBalanceCurrent, playerBalanceProgress, samePlayerProgressValues,
  resultIncludesContributor, contributedToLatestPrismshell, sameIdentity, ensureWorldStatus, ensureMaintenanceSweepSchedule,
});

// Exact-own lifecycle and physical compatibility row. Current clients never
// subscribe to remote rows; continuous coordinates live in private analytical
// anchors and remote presentation lives in playerMotionIdentity below.
// No zone indexes: nothing filters on them, and the subscription planner
// ignores an index wider than three columns.
const player = table(
  { public: true },
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
    headItem: t.string().default(""),
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
    lastInputAt: t.timestamp(),
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
      { accessor: "byMap", algorithm: "btree", columns: ["mapId"] as const },
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
    // The column's default as published; movement itself comes from PLAYER_SPEED.
    speed: t.f32().default(200),
    powerLevel: t.f64().default(95),
    feetItem: t.string().default(""),
    headItem: t.string().default(""),
    chestItem: t.string().default(""),
    rightHandItem: t.string().default(STARTER_STONE),
    leftHandItem: t.string().default(""),
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



// One authoritative death event lets same-map clients play the full presentation
// locally without turning health into continuously synchronized public state.
const playerDeathFrame = table(
  {
    public: true,
    event: true,
    indexes: [
      { accessor: "byMap", algorithm: "btree", columns: ["mapId"] as const },
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
// always available; this row exists after slot two has been purchased.
const playerUpgradeBench = table(
  { name: "player_upgrade_bench", public: false },
  {
    identity: t.identity().primaryKey(),
    secondSlotUnlocked: t.bool(),
    updatedAt: t.timestamp(),
  },
);

// Keep the paid third unlock additive so existing clients can stay connected.
const playerUpgradeBenchThirdSlot = table(
  { name: "player_upgrade_bench_third_slot", public: false },
  { identity: t.identity().primaryKey(), updatedAt: t.timestamp() },
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
    equippedHead: t.string().default(""),
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
    // Magmalisk owns the permanent unlock for the next map; the default keeps
    // existing rows valid.
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
    // Gem-purchased looks survive equipment loss and prestige.
    cosmeticItemsJson: t.string().default("[]"),
    // Were player_combat_rating and player_wide_stats, read with every save (shared/progress-row.ts).
    critRating: t.f64().default(0),
    maxHpWide: t.f64().default(0), damageWide: t.f64().default(0), armorWide: t.f64().default(0), regenWide: t.f64().default(0),
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
    researchSpeed: t.u32().default(0),
    slotUpgradeSpeed: t.u32().default(0),
    enemyRespawn: t.u32().default(0),
    bossRespawn: t.u32().default(0),
    offlineWindow: t.u32().default(0),
    utilityMoveSpeed: t.u32().default(0),
    utilityAttackRange: t.u32().default(0),
    critCap: t.u32().default(0), inventorySlots: t.u32().default(0),
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
/**
 * One row per account per upgrade slot: the tier that slot has reached.
 *
 * Tiers live on the slot so a better drop inherits the work already done.
 * The column names stay because adding or renaming one would make every player reload:
 * `itemId` holds the slot ("HAND", "HEAD", "CHEST") and `level` its tier.
 */
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
// and remaining fields stay for schema compatibility; jobs never pause.
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

// Separate from the identity-keyed slot-one table, so the second concurrent
// queue leaves that table's schema untouched.
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

const activeItemUpgradeSlotThree = table(
  { name: "active_item_upgrade_slot_three", public: true },
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

// Explicit loot events let the client reveal each drop. A duplicate of held
// equipment is flagged alreadyOwned and waits as a pending_equipment_offer.
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
// windows; this table stays outside all normal client subscriptions. Stats are
// f64: f32 cannot hold past 3.4e38.
const leaderboardEntry = table(
  { name: "leaderboard_entry_v2", public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    damage: t.f64(),
    maxHp: t.f64(),
    isGuest: t.bool(),
    power: t.u32().default(0),
    armor: t.f64().default(0),
    regen: t.f64().default(0),
    playedMicros: t.u64().default(0n),
    profileIcon: t.u32().default(0),
    powerLevel: t.f64().default(0),
    gender: t.u8().default(PLAYER_GENDER_UNSET),
    skinTone: t.u32().default(3),
    headItem: t.string().default(""),
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



// Separate v9 archive: retain the original values even after future migrations.
// Permanent account bonuses. A prestige reset clears progress and unlocks but
// never this row: the level multiplies every stat reward a kill grants, and the
// perk points buy prestige perks. Public like player_progress, read per player.
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
    // Appended, never inserted: a column moved into the middle of a live table
    // reads as a reordering and needs a manual migration.
  },
);

// What analytics needs to know about a live connection. Beside player_session
// rather than in it: adding a column to a table that already exists breaks
// every connected client, while a new table is additive. Rows follow the
// session, so they are written and cleared with it.
const playerSessionAnalytics = table({ name: "player_session_analytics", public: false }, {
  connectionId: t.connectionId().primaryKey(),
  clientVersion: t.string().default(""),
  analyticsStartedAtMicros: t.u64().default(0n),
});
function sessionAnalytics(ctx: any, connectionId: any) {
  return ctx.db.playerSessionAnalytics.connectionId.find(connectionId);
}
function writeSessionAnalytics(ctx: any, connectionId: any, changes: { clientVersion?: string; analyticsStartedAtMicros?: bigint }) {
  const current = sessionAnalytics(ctx, connectionId);
  const next = { connectionId, clientVersion: current?.clientVersion ?? "",
    analyticsStartedAtMicros: current?.analyticsStartedAtMicros ?? 0n, ...changes };
  if (current) ctx.db.playerSessionAnalytics.connectionId.update(next);
  else ctx.db.playerSessionAnalytics.insert(next);
}

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
// The indexes serve the sweep, account merge/erasure, and guild replay lookups,
// so none of them scans every message.
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

// Riposte chances and the seed their rolls come from, beside the duel rather
// than in it: the duel row is public and shipped clients subscribe to it, so
// its shape is frozen. A new table is additive and leaves them connected.
const duelRiposte = table({ name: "duel_riposte", public: true }, {
  duelId: t.u64().primaryKey(),
  challengerRiposte: t.f32().default(0), opponentRiposte: t.f32().default(0), riposteSeed: t.u64().default(0n),
});

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
    // Indexed: maintenance and every connect look up one player's schedule.
    identity: t.identity().index("btree"),
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
    identity: t.identity().index("btree"),
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











// The last trace of map sharding. The live publish tooling still reads the
// operator token from this table, so it stays until that tooling has another
// source; nothing in the module reads or writes it.
const shardCoordinatorConnection = table({ public: false }, { id: t.u32().primaryKey(), host: t.string(), token: t.string() });
// Supporter memberships are re-checked on the server's own clock, so a frame
// and a ticker entry never depend on the supporter logging in.
const patreonSweepSchedule = table(
  { scheduled: (): any => sweepPatreonMemberships },
  { scheduledId: t.u64().primaryKey(), scheduledAt: t.scheduleAt() },
);
const spacetimedb = schema({
  ...offlineProgressTables,
  // The Soul Dimension's three tables (soul-dimension.ts).
  ...soulDimensionTables, ...guildHallTables,
  playerOfflinePreference, playerAudioSetting,
  defeatSessionRestriction,
  mapBalanceVersion, mapBalanceHead, playerMapBalance,
  ...moderationTables, ...devReviewTables, accountEmail, loginMove,
  publicChatCursor,
  gemKillProgress,
  playerGemDrop,
  ...proceduralMapTables,
  ...leaderboardPageTables,
  ...gemPurchaseTables,
  ...patreonTables, ...serverBoostTables, ...chatAnnouncementTables, ...exchangeTables,
  homeReturnLocation,
  ...guildTables,
  ...socialTables,
  pausedResearch,
  patreonSweepSchedule,
  shardCoordinatorConnection,
  player,
  playerMapMarker,
  playerMotion,
  playerMotionMapState,
  playerMotionIdentity,
  playerMotionInterest,
  playerMotionDetailFrame,
  playerMapFrame,
  playerDeathFrame,
  playerProfile, playerProfileSnapshot, playerCosmeticRefine,
  playerGemWallet,
  gemTransaction,
  dailyGemBonus,
  playerAdReward, playerAdWatch, playerChatMute, playerClientHost, offlineGatherChoice, playerGatherPicks, playerRunTiming, playerRunHistory, playerNockedArrow,
  balanceApologyNotice,
  playerEquipmentLock, playerItemGift, playerBowSkill, playerSwordSkill, playerStaffSkill, playerWornStaffSkill, playerEquipmentCopy, pendingEquipmentOffer, playerIgnoredDrop, playerLootSetting, playerItemRefine, playerCopyRefine, playerOre, playerRefineResult, playerRefinePity, playerCard, playerGearSlots, playerCopySlots, playerCardDrop, playerCardAttackCap, playerBossCardRoll, playerBuild, playerBuildName, playerWeaponMastery, playerMasteryLevel, playerGold, playerCardMeter, playerCardShopPurchase, playerItemCollection, playerWornSkill, playerMining, playerMinedNode, playerMiningLevel, playerWoodcutting, playerChoppedTree, playerWoodcuttingLevel, playerCraftSkill, playerCraftLevel, playerTool, oldGearPayout, playerStarterWeapon, gemKillDaily, gemLedgerTrim,
  mailboxLetter, mailboxReceipt, playerJoinDate, mailboxEquipment, accountDeletionRequest,
  playerOnboarding,
  regularEnemyLootCursor, regularEnemyStream, enemyDefeatBudget, enemyDefeatBank, playerDefeatClock, playerMapDeparture,
  playerMultiplayerPreference,
  chatReaction, chatHeartAllowance, chatReactionCooldown, chatReactionSummary, chatReactionUnlock, chatModerator, playerChatHearts,
  playerUpgradeBench,
  playerUpgradeBenchThirdSlot,
  playerInventoryCapacity,
  playerCutsceneHistory,
  playerProgress,
  playerLastLocation,
  playerResearch,
  playerLuckResearch,
  playerResearchRank,
  activeResearch,
  playerItemUpgrade,
  activeItemUpgrade,
  activeItemUpgradeSlotTwo,
  activeItemUpgradeSlotThree,
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
  playerEndlessRebaseBackup,
  playerPrestige,
  playerPrestigePerk,
  playerPrestigeChallenge, prestigeChallengeBackup, prestigeChallengeRun, playerPrestigeChallengeParked, playerAggroChallenge, aggroChallengeRun, playerAggroChallengeParked, playerAutoFarmPuppet, playerFreeRespec, playerDailyQuest, guildQuestWeek, guildMemberQuestWeek, soloQuestWeek, playerQuestWeekTotal, playerInventory, playerWideStats, playerCombatRating, duelWideStats, duelReplayWideStats, prestigeExpansion,
  playerPrestigeExpansionPerk, playerPrestigeCardPerk, playerActiveCard,
  playerBonusToggle, playerNameColor,
  duelRiposte, duelCombatSnapshot, duelStaffSkill,
  playerSessionAnalytics,
  developerPresencePreference,
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
  ...analyticsTables,
  duel,
  duelReplay,
  maintenanceSchedule,
  maintenanceSweepSchedule,
  startupTelemetryCleanupSchedule,
  motionDetailFrameSchedule,
  mapFrameSchedule,
  researchCompletionSchedule,
  itemUpgradeCompletionSchedule,
  duelResolutionSchedule,
  playerCombatStamp, combatStampEpoch,
});
export default spacetimedb;
// Before any reducer is declared: each one bumps its sender's combat profile stamp unless marked (combat-profile.ts).
touchCombatProfileAfterReducers(spacetimedb);

// Row-level visibility. Subscription filters are the client's own choice, so
// without these a modified client could read where an invisible player (a
// developer, often) is standing, or anyone's quests and drops. Rules on one
// table are OR'd: a row reaches its owner, and a presence row reaches everyone
// only while its player is visible.
//
// player_motion_detail_frame has no rule: a rule on its 3 Hz rows, one per
// observer, is checked against every connected player's subscription.
// A frame holds only visible players, and only a visible observer gets one, so
// it shows nothing the map frames do not.
export const visiblePlayerRows = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player WHERE is_visible = true");
export const ownPlayerRow = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player WHERE identity = :sender");
export const visibleMotionIdentityRows = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_motion_identity WHERE is_visible = true");
export const ownMotionIdentityRow = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_motion_identity WHERE identity = :sender");
export const visibleMapMarkerRows = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_map_marker WHERE is_visible = true");
export const ownMapMarkerRow = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_map_marker WHERE identity = :sender");
export const ownDailyQuestRow = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_daily_quest WHERE identity = :sender");
export const ownItemDropRows = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM player_item_drop WHERE identity = :sender");
// A shared duel message is between its two players: no one else may read who sent what to whom.
export const sentDuelMessages = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM social_duel_message WHERE sender = :sender");
export const receivedDuelMessages = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM social_duel_message WHERE recipient = :sender");

export type ModuleViewCtx = import("spacetimedb/server").ViewCtx<InferSchema<typeof spacetimedb>>;
export type ModuleReducerCtx = ReducerCtx<InferSchema<typeof spacetimedb>>;



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

export const myUpgradeBenchThirdSlot = spacetimedb.view(
  { name: "my_upgrade_bench_third_slot", public: true },
  t.array(playerUpgradeBenchThirdSlot.rowType),
  (ctx) => {
    const unlock = ctx.db.playerUpgradeBenchThirdSlot.identity.find(ctx.sender);
    return unlock ? [unlock] : [];
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
    seenMask: unlockedPortalCutsceneMask(readPlayerProgress(ctx, identity)),
    generation: 0,
  });
}

export const markPortalCutsceneSeen = spacetimedb.reducer({ cutscene: t.string(), generation: t.u32() }, (ctx, { cutscene, generation }) => {
  requireControllingPlayer(ctx);
  const bit = portalCutsceneBit(cutscene);
  if (!bit) throw new SenderError("Unknown portal cutscene.");
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!(unlockedPortalCutsceneMask(progress) & bit)) throw new SenderError("Portal not unlocked.");
  const history = ensureCutsceneHistory(ctx, ctx.sender);
  if (history.generation !== generation) throw new SenderError("Character history was reset.");
  if (history.seenMask & bit) return;
  ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask | bit });
});

/** The player opened the Quest Board: their HUD shows quests from now on, on every device. */
export const markQuestBoardSeen = spacetimedb.reducer({}, (ctx) => {
  requireControllingPlayer(ctx);
  const history = ensureCutsceneHistory(ctx, ctx.sender);
  if (history.seenMask & QUEST_BOARD_SEEN_BIT) return;
  ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask | QUEST_BOARD_SEEN_BIT });
});

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

// A player moving their character to another sign-in, from Settings (account-transfer.ts).
export const startLoginMove = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  requireSupportedSessionProtocol(ctx);
  beginLoginMove(ctx, code);
});
export const finishLoginMove = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  requireSupportedSessionProtocol(ctx);
  claimLoginMove(ctx, code);
  requestLeaderboardRefresh(ctx);
});

// Swaps two characters between logins (account-transfer.ts). Owner-only, from the CLI.
export const devSwapCharacters = spacetimedb.reducer(
  { firstIdentity: t.string(), secondIdentity: t.string(), expectedFirstName: t.string(), expectedSecondName: t.string(),
    reason: t.string(), confirmation: t.string() },
  (ctx, args) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "dev_swap_characters", "Database owner required.");
    touchAllCombatProfiles(ctx);
    swapCharacterLogins(ctx, args);
    refreshLeaderboard(ctx);
  },
);

/** What offline-progress.ts needs from this module, wired once. */
const OFFLINE_GRANT_PORTS = { effectiveStats: effectivePowerStatsForProgress, mapBalance: liveMapBalance,
  statMultiplier: statRewardMultiplierFor, endlessClaimBit: BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS],
  writeProgress: (ctx: any, progress: any) => writeProgressAndPresentation(ctx, progress), inventoryForProgress };

const cosmeticConversion = createCosmeticConversion({ requireControllingPlayer, activeDuelFor,
  inventoryForProgress, writeProgressAndPresentation, applyGemBalanceChange });

const equipmentCopies = createEquipmentCopies({ requireControllingPlayer, activeDuelFor, inventoryForProgress,
  restoreItemToProgress, removeItemFromProgress: cosmeticConversion.removeItemFromProgress, writeProgressAndPresentation });

const killGems = createKillGems({ creditGemsWithoutLedger });

function clearVirtualPlayersForOwner(ctx: any, owner: any) {
  if (ctx.db.virtualPlayerRun.owner.find(owner)) ctx.db.virtualPlayerRun.owner.delete(owner);
  const identities = [...ctx.db.virtualPlayer.byOwner.filter(owner) as Iterable<any>]
    .map((registration: any) => registration.identity);
  if (!identities.length) {
    if (ctx.db.virtualPlayerLoad.owner.find(owner)) ctx.db.virtualPlayerLoad.owner.delete(owner);
    return false;
  }
  for (const identity of identities) { removeVirtualPlayerData(ctx, identity, false); revokeVirtualPlayerConsent(ctx, identity); }
  if (ctx.db.virtualPlayerLoad.owner.find(owner)) ctx.db.virtualPlayerLoad.owner.delete(owner);
  refreshLeaderboard(ctx);
  return true;
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
  for (const identity of orphaned) removeVirtualPlayerData(ctx, identity);
}

function enterWorldPresence(ctx: any, tabId: string, forceTakeover = false, supportsTutorial = false) {
  const session = requireSupportedSessionProtocol(ctx);
  requireCurrentLegalConsent(ctx); syncWornSkill(ctx, ctx.sender); // The weapon in hand shows on the profile from login on.
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
      if (sessionAnalytics(ctx, controllerSession.connectionId)?.analyticsStartedAtMicros) {
        finishAnalyticsSession(ctx, { ...controllerSession, ...sessionAnalytics(ctx, controllerSession.connectionId) }, ctx.db.player.identity.find(ctx.sender)?.mapId ?? TUTORIAL_FOREST_MAP_ID);
      }
      ctx.db.playerSession.connectionId.update({ ...controllerSession, enteredWorld: false });
    }
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: ctx.connectionId });
  } else if (!controller) {
    ctx.db.playerController.insert({ identity: ctx.sender, connectionId: ctx.connectionId });
  }

  if (!session.enteredWorld || session.tabId !== normalizedTabId) {
    if (session.enteredWorld && sessionAnalytics(ctx, session.connectionId)?.analyticsStartedAtMicros) {
      finishAnalyticsSession(ctx, { ...session, ...sessionAnalytics(ctx, session.connectionId) }, ctx.db.player.identity.find(ctx.sender)?.mapId ?? TUTORIAL_FOREST_MAP_ID);
    }
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
  ensureDailyGemBonusState(ctx, ctx.sender);

  const lifetime = ensurePlayerLifetime(ctx);

  let existingProgress: any = readPlayerProgress(ctx, ctx.sender);
  if (!existingProgress) {
    existingProgress = defaultPlayerProgress(ctx.sender);
    if (supportsTutorial && !existingProfile && !virtualRegistration) ctx.db.playerOnboarding.insert({ identity: ctx.sender, step: 1 });
    insertSnapshotRow(ctx, "playerProgress", existingProgress);
  } else {
    // Balance v9 unlocks are authoritative. Historical shared-boss results and
    // a stale presence row must not re-open maps deliberately locked by rebalancing.
    const equippedFeet = equippedFeetForProgress(existingProgress);
    const equippedHead = equippedHeadForProgress(existingProgress);
    const equippedChest = equippedChestForProgress(existingProgress);
    // Hands the player emptied stay empty (unarmed Reflect runs); only gear locked away or lost is replaced.
    const handsEmpty = !existingProgress.equippedRightHand && !existingProgress.equippedLeftHand;
    const equippedRightHand = handsEmpty ? "" : equippedRightHandForProgress(existingProgress);
    const equippedLeftHand = handsEmpty || equippedRightHand ? "" : equippedLeftHandForProgress(existingProgress);
    const inventoryJson = JSON.stringify(inventoryForProgress(existingProgress));
    const cosmeticEquipment = cosmeticEquipmentForProgress({ ...existingProgress, inventoryJson }, lentLooksFor(ctx, ctx.sender));
    const speed = playerBaseMovementSpeed(false);
    const maxHp = Math.max(PLAYER_BASE_HP, existingProgress.maxHp);
    const attackRange = savedAttackRange(ctx, ctx.sender);
    if (existingProgress.maxHp !== maxHp || existingProgress.attackRange !== attackRange || existingProgress.speed !== speed || existingProgress.inventoryJson !== inventoryJson || existingProgress.equippedHead !== equippedHead || existingProgress.equippedChest !== equippedChest || existingProgress.equippedFeet !== equippedFeet || existingProgress.equippedRightHand !== equippedRightHand || existingProgress.equippedLeftHand !== equippedLeftHand || existingProgress.cosmeticHead !== cosmeticEquipment.cosmeticHead || existingProgress.cosmeticChest !== cosmeticEquipment.cosmeticChest || existingProgress.cosmeticFeet !== cosmeticEquipment.cosmeticFeet || existingProgress.cosmeticRightHand !== cosmeticEquipment.cosmeticRightHand || existingProgress.cosmeticLeftHand !== cosmeticEquipment.cosmeticLeftHand) {
      const migratedProgress = {
        ...existingProgress,
        maxHp,
        attackRange,
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
  // After research exists, so effective stats are the real ones, and before the
  // player row is written, so the entry snapshot carries the payout. A player
  // still in the tutorial has no map to have been farming.
  if (!virtualRegistration && !needsOnboarding(ctx, ctx.sender)) existingProgress = grantOfflineProgress(ctx, existingProgress, OFFLINE_GRANT_PORTS);
  if (!virtualRegistration) ensureRunTiming(ctx, ctx.sender);
  if (!virtualRegistration && (!session.enteredWorld || session.tabId !== normalizedTabId)) {
    const updatedSession = ctx.db.playerSession.connectionId.find(ctx.connectionId);
    if (updatedSession) {
      writeSessionAnalytics(ctx, updatedSession.connectionId, { analyticsStartedAtMicros: ctx.timestamp.microsSinceUnixEpoch });
      recordAnalyticsSessionStart(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? TUTORIAL_FOREST_MAP_ID);
    }
  }
  touchPlayerAccessAudit(ctx, session.protocolVersion);
  backfillKnownAccessAudit(ctx); if (!virtualRegistration) memberEnteredWorld(ctx);

  const existing = playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender));
  const presencePreference = ctx.db.developerPresencePreference.identity.find(ctx.sender);
  // Cached mobile builds cannot complete the tutorial. Entering from one
  // skips it without rewards rather than hiding the player.
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
  const equipmentPresentation = equipmentPresentationForProgress(ctx, existingProgress);
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
    const entryMapId = VALID_MAP_IDS.has(normalizedMapId) && normalizedMapId !== HOME_EXTERIOR_MAP_ID && (!isSoulMap(normalizedMapId) || soulDimensionOpenFor(ctx, ctx.sender))
      && (!isGuildHallMap(normalizedMapId) || guildHallMember(ctx, ctx.sender, normalizedMapId)) ? normalizedMapId // Home is retired: its players arrive in the Town.
      : isSoulMap(normalizedMapId) || isGuildHallMap(normalizedMapId) || normalizedMapId === HOME_EXTERIOR_MAP_ID ? TOWN_MAP_ID : TUTORIAL_FOREST_MAP_ID;
    const fallbackPosition = entryMapId === TOWN_MAP_ID ? TOWN_ARRIVAL : MAP_ARRIVALS[entryMapId as keyof typeof MAP_ARRIVALS] ?? PLAYER_SPAWN;
    const entryPosition = entryMapId === normalizedMapId && isGuildHallMap(entryMapId) ? guildHallReturnPointFor(ctx, entryMapId, existing.x, existing.y)
      : entryMapId === normalizedMapId ? {
        x: Math.max(PLAYER_RADIUS, Math.min(worldBoundsFor(entryMapId).width - PLAYER_RADIUS, existing.x)),
        y: Math.max(PLAYER_RADIUS, Math.min(worldBoundsFor(entryMapId).height - PLAYER_RADIUS, existing.y)),
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
    // Required by the player table's schema. These are never synchronized.
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
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  // Before the restriction check: a suspended player's login is still worth knowing.
  recordAccountEmail(ctx);
  // Deny game-session admission before initialization work. Leave the notice
  // readable so clients can disconnect without mistaking this for an expired
  // guest token and creating a new guest account.
  if (defeatRestrictionError(ctx)) return;
  ensureMaintenanceSchedule(ctx); ensureMaintenanceSweepSchedule(ctx); ensureRepeatingSchedule(ctx.db.startupTelemetryCleanupSchedule, 15n * MAINTENANCE_INTERVAL_MICROS);
  ensurePatreonSweep(ctx, ScheduleAt.interval(PATREON_SWEEP_INTERVAL_MICROS));
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
  if (session.enteredWorld) {
    finishAnalyticsSession(ctx, { ...session, ...sessionAnalytics(ctx, session.connectionId) }, ctx.db.player.identity.find(ctx.sender)?.mapId ?? TUTORIAL_FOREST_MAP_ID);
  }
  ctx.db.playerSession.connectionId.delete(ctx.connectionId);
  ctx.db.playerSessionAnalytics.connectionId.delete(ctx.connectionId);

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

  if (isDeveloperIdentity(ctx.sender)) clearVirtualPlayersForOwner(ctx, ctx.sender);
  finishLifetimeSession(ctx, ctx.sender);
  // The account's last session just ended, so the unattended clock starts here.
  // A virtual player has no account to pay out, so it never opens one.
  if (!isVirtualPlayer(ctx, ctx.sender)) beginOfflineWindow(ctx, ctx.sender);
  removeIdentityPresence(ctx, ctx.sender);
});

export const runMaintenance = spacetimedb.reducer(
  { maintenance: maintenanceSchedule.rowType },
  keepsCombatProfile((ctx: any, { maintenance }: any) => {
    void maintenance; requireScheduler(ctx);
    const finishedDuels = [...ctx.db.duel.iter()].map(row => withDuelWide(ctx, row)).filter((current: any) =>
      current.status === "finishing" && ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
    );
    for (const current of finishedDuels) finishDuel(ctx, current);
    clearExpiredDuelRequests(ctx);
    ensureMotionDetailFrameSchedule(ctx);
    runPendingModuleMigrations(ctx);
    // The online count lives here only: every client subscribes to it, so a
    // refresh per connect and disconnect made a mass reload players-squared.
    reconcileOnlinePlayers(ctx);
    refreshLeaderboardIfDue(ctx);
    expireEquipmentOffers(ctx); killGems.trimKillGemLedger(ctx);
  }),
);

// Exact scheduled completions remain authoritative. These scans only recover
// orphaned state or missing schedules, and run even with no players connected.
export const devCleanupStaleSessions = spacetimedb.reducer({}, (ctx) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_cleanup_stale_sessions");
  clearOrphanPresence(ctx); reconcileOnlinePlayers(ctx);
});

export const runMaintenanceSweep = spacetimedb.reducer(
  { maintenance: maintenanceSweepSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance; requireScheduler(ctx);
    clearExpiredHistory(ctx);
    clearExpiredAccountLinks(ctx);
    clearOrphanPresence(ctx);
    clearOrphanRealtimeState(ctx);
    clearOrphanVirtualPlayers(ctx);
    clearExpiredVirtualPlayerRuns(ctx);
    pruneIdleDefeatBudgets(ctx);
    pruneIdleStreams(ctx);
    reconcileOnlinePlayers(ctx);
    ensureRealtimeFrameSchedules(ctx);   // a frame loop a publish left dead restarts within one sweep
    // Timers have exact schedules; this only recovers one a publish lost, and
    // reads every player's, online or not. Once an hour: the sweep in its first five minutes.
    if ((ctx.timestamp.microsSinceUnixEpoch / 60_000_000n) % 60n >= 5n) return;
    pruneOldGuildQuestWeeks(ctx);
    clearExpiredMail(ctx);   // a letter leaves a week after it was sent
    for (const active of [...ctx.db.activeResearch.iter()] as any[]) reconcileActiveResearch(ctx, active);
    for (const active of [...ctx.db.activeItemUpgrade.iter()] as any[]) {
      reconcileActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_ONE);
    }
    for (const active of [...ctx.db.activeItemUpgradeSlotTwo.iter()] as any[]) {
      reconcileActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_TWO);
    }
    for (const active of [...ctx.db.activeItemUpgradeSlotThree.iter()] as any[]) {
      reconcileActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_THREE);
    }
  },
);

export const cleanupStartupTelemetry = spacetimedb.reducer(
  { schedule: startupTelemetryCleanupSchedule.rowType },
  (ctx, _args) => {
    requireScheduler(ctx); cleanupConnectionDiagnostics(ctx);
    trimStartupTelemetry(ctx);
    clearExpiredStartupTelemetryRateLimits(ctx);
  },
);

export const publishMotionDetailFrames = spacetimedb.reducer(
  { schedule: motionDetailFrameSchedule.rowType },
  keepsCombatProfile((ctx: any, _args: any) => {
    requireScheduler(ctx); let continuePublishing = false;
    const staleIdentities: any[] = [];
    const sampleMotion = createPlayerMotionFrameSampler(ctx.timestamp.microsSinceUnixEpoch);
    // This reducer never mutates motion. Share decoded rows (and misses) across
    // observers as well as sharing sampled positions for this publication only.
    const motions = new Map<number, ReturnType<typeof ctx.db.playerMotion.networkId.find>>();
    for (const interest of ctx.db.playerMotionInterest.iter() as Iterable<any>) {
      const observer = ctx.db.playerMotion.identity.find(interest.identity);
      if (!observer || !observer.isVisible) {
        staleIdentities.push(interest.identity);
        continue;
      }
      motions.set(observer.networkId, observer);
      continuePublishing = true;
      const samples: PlayerMotionSample[] = [];
      const sampleLimit = Math.min(interest.networkIds.length, PLAYER_MOTION_INTEREST_LIMIT);
      for (let index = 0; index < sampleLimit; index += 1) {
        const networkId = interest.networkIds[index];
        if (networkId === observer.networkId) continue;
        if (!motions.has(networkId)) motions.set(networkId, ctx.db.playerMotion.networkId.find(networkId));
        const motion = motions.get(networkId);
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
        payload: encodePlayerMotionFrame(samples, wideMotionMap(observer.mapId)),
      });
    }
    for (const identity of staleIdentities) ctx.db.playerMotionInterest.identity.delete(identity);

    if (continuePublishing) {
      ctx.db.motionDetailFrameSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_DETAIL_FRAME_INTERVAL_MICROS),
      });
    }
  }),
);

export const publishMapFrames = spacetimedb.reducer(
  { schedule: mapFrameSchedule.rowType },
  keepsCombatProfile((ctx: any, _args: any) => {
    requireScheduler(ctx); let continuePublishing = false;
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
    // A map index on this hot movement table would add write cost to every
    // packet. The private-home-only case never reads motion rows at all.
    if (sampleVisiblePlayers) {
      for (const motion of ctx.db.playerMotion.iter() as Iterable<any>) {
        if (motion.isVisible) maps.get(motion.mapId)?.push(motionSample(motion, ctx.timestamp.microsSinceUnixEpoch));
      }
    }
    for (const [mapId, samples] of maps) {
      const compacted = compactPlayerMapSamples(samples, worldBoundsFor(mapId).width, worldBoundsFor(mapId).height);
      ctx.db.playerMapFrame.insert({
        mapId,
        emittedAt: ctx.timestamp,
        playerCount: compacted.length,
        payload: encodePlayerMapFrame(compacted, wideMotionMap(mapId)),
      });
    }

    if (continuePublishing) {
      ctx.db.mapFrameSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MAP_FRAME_INTERVAL_MICROS),
      });
    }
  }),
);

export const completeResearch = spacetimedb.reducer(
  { schedule: researchCompletionSchedule.rowType },
  (ctx, { schedule }) => {
    requireScheduler(ctx); const active = ctx.db.activeResearch.identity.find(schedule.identity);
    if (!active || active.researchId !== schedule.researchId || active.targetRank !== schedule.targetRank) return;
    reconcileActiveResearch(ctx, active);
  },
);

export const completeItemUpgrade = spacetimedb.reducer(
  { schedule: itemUpgradeCompletionSchedule.rowType },
  (ctx, { schedule }) => {
    requireScheduler(ctx); const slot = normalizeUpgradeBenchSlot(schedule.slot);
    const active = activeItemUpgradeForSlot(ctx, schedule.identity, slot);
    if (!active || active.paused || active.itemId !== schedule.itemId || active.targetLevel !== schedule.targetLevel) return;
    reconcileActiveItemUpgrade(ctx, active, slot);
  },
);

export const resolveScheduledDuel = spacetimedb.reducer(
  { schedule: duelResolutionSchedule.rowType },
  (ctx, { schedule }) => {
    requireScheduler(ctx); const current = withDuelWide(ctx, ctx.db.duel.id.find(schedule.duelId));
    if (current) resolveDuel(ctx, current);
  },
);

// Release control stays on the account database; no map publish is needed for notices.
export const setReleaseWindow = spacetimedb.reducer(
  { id: t.string(), version: t.string(), phase: t.string(), startsAt: t.f64(), reload: t.bool() },
  (ctx, args) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "set_release_window", "Database owner required.");
    writeReleaseWindow(ctx, args);
  },
);
export const announceClientUpdate = spacetimedb.reducer({ version: t.string(), step: t.string() }, (ctx, { version, step }) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "announce_client_update", "Database owner required.");
  announceClientUpdateWindow(ctx, version, step);
});
export const acknowledgeRelease = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  requireControllingPlayer(ctx);
  acknowledgeReleaseWindow(ctx, id);
});

export const registerProtocol = spacetimedb.reducer(
  { protocolVersion: t.u32() },
  (ctx, { protocolVersion }) => {
    if (!isSupportedProtocol(protocolVersion)) {
      throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
    }
    const session = requireSession(ctx);
    if (session.protocolVersion !== protocolVersion) ctx.db.playerSession.connectionId.update({ ...session, protocolVersion });
    const current = ctx.db.player.identity.find(ctx.sender);
    const controller = ctx.db.playerController.identity.find(ctx.sender);
    if (current && current.protocolVersion !== protocolVersion && ctx.connectionId && controller && sameConnection(controller.connectionId, ctx.connectionId)) {
      updateSnapshotRow(ctx, "player", { ...current, protocolVersion });
    }
    const activeResearch = ctx.db.activeResearch.identity.find(ctx.sender);
    if (activeResearch) reconcileActiveResearch(ctx, activeResearch);
    for (const { slot, active } of activeItemUpgradeEntriesFor(ctx, ctx.sender)) {
      reconcileActiveItemUpgrade(ctx, active, slot);
    }
  },
);

export const registerClientVersion = spacetimedb.reducer(
  { clientVersion: t.string() },
  (ctx, { clientVersion }) => {
    const session = requireSession(ctx);
    if (!/^(?:unknown|\d{1,4}(?:\.\d{1,4}){1,3})$/.test(clientVersion)) return;
    writeSessionAnalytics(ctx, session.connectionId, { clientVersion });
  },
);

/** The host the client was served from, for hosting stats (client-host.ts). */
export const registerClientHost = spacetimedb.reducer({ host: t.string() }, (ctx, { host }) => {
  requireSession(ctx);
  recordClientHost(ctx, host);
});

export const recordConnectionDiagnostic = spacetimedb.reducer(
  { payload: t.string() },
  keepsCombatProfile((ctx: any, { payload }: any) => {
    if (blockedSession(ctx)) return;
    requireSession(ctx);
    recordConnectionDiagnostics(ctx, payload);
  }),
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
    if (!isPlayableAgeBand(ageBand)) throw new SenderError("Wildstat is currently available to players age 13 and older.");
    const current = ctx.db.playerLegalConsent.identity.find(ctx.sender);
    // Agreeing to the Terms again never forgets an age already given.
    if (ageBand === AGE_BAND_UNVERIFIED && current && isEligiblePlayerAgeBand(current.ageBand)) ageBand = current.ageBand;
    if (current?.termsVersion === termsVersion && current.ageBand === ageBand) return;
    const next = { identity: ctx.sender, termsVersion, ageBand, acceptedAt: ctx.timestamp };
    if (current) ctx.db.playerLegalConsent.identity.update(next);
    else ctx.db.playerLegalConsent.insert(next);
  },
);

export const enterWorld = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  requireSupportedSessionProtocol(ctx);
  enterWorldPresence(ctx, tabId);
  pinMapBalance(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
});

/** Only tutorial-capable clients use this additive entry point. */
export const enterWorldWithTutorial = spacetimedb.reducer({ tabId: t.string(), forceTakeover: t.bool() }, (ctx, { tabId, forceTakeover }) => {
  requireSupportedSessionProtocol(ctx);
  enterWorldPresence(ctx, tabId, forceTakeover, true);
  pinMapBalance(ctx, ctx.db.player.identity.find(ctx.sender)?.mapId ?? "");
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

export const setMultiplayerEnabled = spacetimedb.reducer({ enabled: t.bool() }, (ctx, { enabled }) => applyPresence(ctx, enabled, enabled));
// The eye (`enabled`: see others, and be seen) and, with it off, whether to be seen anyway while idle or
// autofarming (`shown`): a still or puppet player costs other players next to nothing.
export const setPresence = spacetimedb.reducer({ enabled: t.bool(), shown: t.bool() }, keepsCombatProfile((ctx: any, { enabled, shown }: any) => applyPresence(ctx, enabled, enabled || shown)));
function applyPresence(ctx: GameReducerContext, enabled: boolean, seen: boolean) {
  const player = requireControllingPlayer(ctx);
  writeMultiplayerPreference(ctx, enabled);
  const visible = seen && !needsOnboarding(ctx, ctx.sender) && (!isDeveloperIdentity(ctx.sender)
    || (ctx.db.developerPresencePreference.identity.find(ctx.sender)?.visible ?? false));
  if ((!visible || !enabled) && ctx.db.playerMotionInterest.identity.find(ctx.sender)) ctx.db.playerMotionInterest.identity.delete(ctx.sender);
  if (player.isVisible === visible) return;
  const next = { ...playerWithMotion(ctx, player), isVisible: visible };
  updateSnapshotRow(ctx, "player", next);
  syncPlayerMotion(ctx, next);
  syncPlayerMotionIdentity(ctx, next);
  syncPlayerMapMarker(ctx, next, true);
  ensureRealtimeFrameSchedules(ctx);
}

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
  (ctx, args) => devResetDailyBonus(ctx, args),
);

export const devBeginVirtualPlayerLoadTest = spacetimedb.reducer(
  { ticket: t.string(), maxCount: t.u32() },
  (ctx, args) => beginVirtualPlayerLoadTest(ctx, args),
);

function beginVirtualPlayerLoadTest(ctx: ModuleReducerCtx, { ticket, maxCount }: { ticket: string; maxCount: number }) {
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
}

export const joinVirtualPlayerLoadTest = spacetimedb.reducer(
  { owner: t.identity(), ticket: t.string(), mapId: t.string(), x: t.f64(), y: t.f64() },
  (ctx, args) => joinVirtualPlayer(ctx, args),
);

function joinVirtualPlayer(ctx: ModuleReducerCtx, { owner, ticket, mapId, x, y }: {
  owner: Identity;
  ticket: string;
  mapId: string;
  x: number;
  y: number;
}) {
  const session = requireSupportedSessionProtocol(ctx);
  if (sameIdentity(ctx.sender, owner) || isDeveloperIdentity(ctx.sender)) {
    throw new SenderError("Developer cannot become a virtual player.");
  }
  if (session.enteredWorld) throw new SenderError("Virtual-player identity must be fresh.");
  if (!VALID_MAP_IDS.has(mapId) || isGuildHallMap(mapId)) throw new SenderError("Unsupported virtual-player map.");
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
      readPlayerProgress(ctx, ctx.sender) ||
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
  grantVirtualPlayerConsent(ctx, owner);
}

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
    recordBugDeletion(ctx, id);
    ctx.db.bugReport.id.delete(id);
  },
);

// Owner/developer maintenance for removing legacy pre-account saves. Every
// condition is checked again inside the transaction so a stale leaderboard
// screenshot or a player reconnect cannot turn this into a broader deletion.
export const devDeleteLegacyPlayer = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string() },
  (ctx, args) => devDeleteLegacy(ctx, args),
);

function devDeleteLegacy(ctx: ModuleReducerCtx, { identity, expectedDisplayName }: { identity: Identity; expectedDisplayName: string }) {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_delete_legacy_player");
  if (isDeveloperIdentity(identity) || isDatabaseOwnerIdentity(identity)) {
    throw new SenderError("Protected identity cannot be deleted.");
  }
  if (isVirtualPlayer(ctx, identity)) throw new SenderError("Use virtual-player cleanup for simulated players.");

  const profile = ctx.db.playerProfile.identity.find(identity);
  const progress = readPlayerProgress(ctx, identity);
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
}

// Maintenance-only correction for account links whose lifetime metadata was
// not transferred. The CLI runs it as the database
// owner; the developer account needs its signed-in game session like every
// other developer tool. It can only move a join date earlier.
export const devRepairPlayerJoinedAt = spacetimedb.reducer(
  { identity: t.identity(), sourceIdentity: t.identity() },
  (ctx, { identity, sourceIdentity }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_repair_player_joined_at");
    if (sameIdentity(identity, sourceIdentity)) throw new SenderError("Source and target must differ.");
    const targetLifetime = ctx.db.playerLifetime.identity.find(identity);
    const sourceLifetime = ctx.db.playerLifetime.identity.find(sourceIdentity);
    if (!targetLifetime || !sourceLifetime) throw new SenderError("Player lifetime row not found.");

    const joinedAt = earlierTimestamp(targetLifetime.joinedAt, sourceLifetime.joinedAt);
    if (joinedAt.microsSinceUnixEpoch === targetLifetime.joinedAt.microsSinceUnixEpoch) return;
    ctx.db.playerLifetime.identity.update({ ...targetLifetime, joinedAt });
    syncPlayerJoinDate(ctx, identity, joinedAt);
  },
);

// Maintenance-only stat normalization for accounts that need to be placed on
// the same raw combat baseline. Equipment, upgrades, research, inventory, map
// access, and profile data intentionally remain owned by the target account.
export const devCopyPlayerCombatStats = spacetimedb.reducer(
  { sourceIdentity: t.identity(), targetIdentity: t.identity() },
  (ctx, args) => devCopyCombatStats(ctx, args),
);

export const setProfileIcon = spacetimedb.reducer(
  { profileIcon: t.u32() },
  (ctx, { profileIcon }) => {
    requireControllingPlayer(ctx);
    if (!isValidProfileIcon(profileIcon)) throw new SenderError("Choose an available profile picture.");
    requireSnapshotForIcon(ctx, profileIcon);
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) throw new SenderError("Player profile not found.");
    saveProfileIcon(ctx, profile, profileIcon);
  },
);
function saveProfileIcon(ctx: any, profile: any, profileIcon: number) {
  if (profile.profileIcon === profileIcon) return;
  updateSnapshotRow(ctx, "playerProfile", { ...profile, profileIcon });
  const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
  if (leaderboard) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, profileIcon });
  syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
}
/** Freezes the caller's current look, read from the server's own rows, as their picture. Body: profile-snapshot.ts. */
export const snapshotProfileCharacter = spacetimedb.reducer({}, (ctx) => {
  requireControllingPlayer(ctx);
  const profile = ctx.db.playerProfile.identity.find(ctx.sender), progress = readPlayerProgress(ctx, ctx.sender);
  takeProfileSnapshot(ctx, { profile, look: progress ? leaderboardAppearanceForProgress(ctx, progress, profile) : undefined,
    saveIcon: (profileIcon) => saveProfileIcon(ctx, profile, profileIcon) });
});

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

// Bodies live in profile-look.ts.
export const { setPlayerSprite, setNameColor } = registerProfileLookReducers(spacetimedb, { requireControllingPlayer,
  syncLook: ctx => syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender))) });

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
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_suspend_player_account");
    if (isDeveloperIdentity(args.identity) || isDatabaseOwnerIdentity(args.identity)) throw new SenderError("Protected identity cannot be suspended.");
    suspendPlayerAccount(ctx, args);
    finishLifetimeSession(ctx, args.identity);
    removeIdentityPresence(ctx, args.identity);
  },
);

export const devRollbackPlayerProgression = spacetimedb.reducer(
  { identity: t.identity(), expectedDisplayName: t.string(), operationId: t.string(), baselineJson: t.string(), reason: t.string() },
  (ctx, args) => rollbackPlayerProgression(ctx, args, {
    requireOwner: () => {
      if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "dev_rollback_player_progression", "Account database owner required.");
      if (activeDuelFor(ctx, args.identity)) throw new SenderError("Wait for this player's duel to finish.");
      touchAllCombatProfiles(ctx);
    },
    apply: (progress, mapIndex) => {
      writeProgressAndPresentation(ctx, progress);
      const procedural = ctx.db.proceduralProgress.identity.find(args.identity);
      if (procedural) ctx.db.proceduralProgress.identity.update({ ...procedural, completed: 0 });
      const history = ctx.db.playerCutsceneHistory.identity.find(args.identity);
      if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history,
        seenMask: history.seenMask & (unlockedPortalCutsceneMask(progress) | QUEST_BOARD_SEEN_BIT), generation: history.generation + 1 });
      const mapId = MAP_IDS[mapIndex];
      const arrival = mapIndex === 0 ? PLAYER_SPAWN : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
      const returnLocation = { identity: args.identity, mapId, ...arrival, facing: 0 };
      if (ctx.db.homeReturnLocation.identity.find(args.identity)) ctx.db.homeReturnLocation.identity.update(returnLocation);
      else ctx.db.homeReturnLocation.insert(returnLocation);
      const active = ctx.db.player.identity.find(args.identity);
      if (active) {
        const maxHp = maxHealthForProgress(ctx, args.identity, progress);
        const moved = transitionPlayerMap({ ...ctx, sender: args.identity }, { ...active, maxHp, hp: maxHp }, TOWN_MAP_ID, TOWN_ARRIVAL);
        persistWorldLocation(ctx, moved);
      } else {
        const location = { identity: args.identity, mapId: TOWN_MAP_ID, ...TOWN_ARRIVAL, facing: 0 };
        if (ctx.db.playerLastLocation.identity.find(args.identity)) ctx.db.playerLastLocation.identity.update(location);
        else ctx.db.playerLastLocation.insert(location);
      }
      for (const row of ctx.db.enemyDefeatBudget.identity.filter(args.identity)) ctx.db.enemyDefeatBudget.key.delete(row.key); ctx.db.playerDefeatClock.identity.delete(args.identity);
      for (const row of [...ctx.db.enemyDefeatBank.identity.filter(args.identity)]) ctx.db.enemyDefeatBank.key.delete(row.key);
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
  (ctx, update) => devUpdateSave(ctx, update),
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
  // Bumps the stamp itself, only when the loadout changes: an unchanged save is the common one.
  keepsCombatProfile((ctx: any, progress: any) => saveSubmittedProgress(ctx, progress)),
);

export const startResearch = spacetimedb.reducer(
  { researchId: t.string() },
  (ctx, { researchId }) => {
    if (!standsAtResearch(ctx, requireControllingPlayer(ctx))) throw new SenderError("Go to Tech Research in Town first.");
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
    const durationMicros = BigInt(researchDurationMs(researchId, research[researchId], research.researchSpeed)) * 1_000n;
    const remainingMicros = takePausedResearch(ctx, ctx.sender, researchId, targetRank, durationMicros);
    const completesAtMicros = ctx.timestamp.microsSinceUnixEpoch + remainingMicros;
    ctx.db.activeResearch.insert({
      identity: ctx.sender,
      researchId,
      targetRank,
      startedAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch - (durationMicros - remainingMicros)),
      completesAt: new Timestamp(completesAtMicros),
    });
    ensureResearchCompletionSchedule(ctx, { identity: ctx.sender, researchId, targetRank, completesAt: new Timestamp(completesAtMicros) });
  },
);

/** Sets the running research aside with its time left, freeing the slot; starting it again resumes it. */
export const pauseResearch = spacetimedb.reducer((ctx) => { requireControllingPlayer(ctx); pauseActiveResearch(ctx, reconcileActiveResearch, removeResearchCompletionSchedules); });

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
  const dayKey = currentUtcDayKey(ctx);
  const state = ensureDailyGemBonusState(ctx, ctx.sender);
  if (state.claimableDayKey !== dayKey) throw new SenderError("Today's daily Gems are already claimed.");

  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: DAILY_LOGIN_GEM_BONUS,
    kind: "daily_login_bonus",
    note: "Daily login bonus claimed.",
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
    const item = itemDefinition(itemId);
    const progress = readPlayerProgress(ctx, identity);
    if (!item || !progress) throw new SenderError("Player or equipment unavailable.");
    const alreadyOwned = playerOwnsItem(ctx, identity, itemId);
    let next = restoreItemToProgress(progress, itemId);
    if (equip && item.slot === "HAND") next ={ ...next, equippedRightHand: itemId, equippedLeftHand: "", cosmeticRightHand: "", cosmeticLeftHand: "" };
    writeProgressAndPresentation(ctx, next);
    publishItemDrop(ctx, identity, itemId, alreadyOwned);
  },
);

export const devDeliverAlphaTesterGifts = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_alpha_tester_gifts");
    deliverAlphaTesterGifts(ctx, recipients);
  },
);

export const claimDeveloperItemGift = spacetimedb.reducer({ key: t.string() }, (ctx, { key }) => {
  requireControllingPlayer(ctx);
  claimItemGift(ctx, key, itemId => {
    const progress = readPlayerProgress(ctx, ctx.sender);
    if (!progress) throw new SenderError("Player unavailable.");
    if (playerOwnsItem(ctx, ctx.sender, itemId)) return offerDuplicateEquipment(ctx, ctx.sender, itemId);
    updateSnapshotRow(ctx, "playerProgress", restoreItemToProgress(progress, itemId));
    ensureWeaponSkillRoll(ctx, ctx.sender, itemId);
  });
});

export const devDeliverDisconnectCompensation = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_disconnect_compensation");
    deliverDisconnectCompensation(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);

export const devDeliverCombatUpdateGift = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_combat_update_gift");
    deliverCombatUpdateGift(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);

export const devDeliverOutageCompensation = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_outage_compensation");
    deliverOutageCompensation(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);
export const devDeliverAutofarmTestGift = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_autofarm_test_gift");
    deliverAutofarmTestGift(ctx, recipients, input => { applyGemBalanceChange(ctx, input); });
  },
);
export const devAnnounceOutageCompensation = spacetimedb.reducer({}, ctx => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_announce_outage_compensation");
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
    claimEquipmentMail(ctx, items, level);
  });
});
export const requestAccountDeletion = spacetimedb.reducer({ confirmation: t.string() }, (ctx, { confirmation }) => {
  requireControllingPlayer(ctx);
  queueAccountDeletion(ctx, confirmation);
});
export const devDeliverEquipmentMail = spacetimedb.reducer(
  { recipients: t.array(t.identity()) }, (ctx, { recipients }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_deliver_equipment_mail");
    deliverEquipmentMail(ctx, recipients);
  },
);
export const devPublishMailboxLetter = spacetimedb.reducer(
  { id: t.string(), title: t.string(), body: t.string(), gems: t.u64() }, (ctx, letter) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_publish_mailbox_letter");
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
    note: "Permanently unlocked Slot Upgrades queue two.",
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

export const unlockThirdUpgradeSlot = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  const current = ctx.db.playerUpgradeBench.identity.find(ctx.sender);
  if (!current?.secondSlotUnlocked) throw new SenderError("Unlock the second queue first.");
  if (ctx.db.playerUpgradeBenchThirdSlot.identity.find(ctx.sender)) return;
  applyGemBalanceChange(ctx, {
    identity: ctx.sender,
    delta: -UPGRADE_BENCH_THIRD_SLOT_GEM_COST,
    kind: "upgrade_bench_slot_unlock",
    note: "Permanently unlocked Slot Upgrades queue three.",
    externalReference: `upgrade-bench-slot-three:${ctx.sender.toHexString()}`,
  });
  ctx.db.playerUpgradeBenchThirdSlot.insert({ identity: ctx.sender, updatedAt: ctx.timestamp });
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
  (ctx, args) => startItemUpgradeFor(ctx, args),
);

/** Inventory ownership is authoritative; a stale client save cannot restore deleted gear. Bodies: equipment-copies.ts. */
export const destroyEquipment = spacetimedb.reducer(
  { itemId: t.string() }, (ctx, { itemId }) => equipmentCopies.destroy(ctx, itemId, 0n),
);
export const destroyEquipmentCopy = spacetimedb.reducer(
  { itemId: t.string(), copyId: t.u64() }, (ctx, { itemId, copyId }) => equipmentCopies.destroy(ctx, itemId, copyId),
);
export const selectEquipmentCopy = spacetimedb.reducer({ copyId: t.u64() }, (ctx, { copyId }) => equipmentCopies.select(ctx, copyId));
export const resolveEquipmentOffer = spacetimedb.reducer({ id: t.u64(), keep: t.bool() }, (ctx, args) => equipmentCopies.resolveOffer(ctx, args));
export const { sellGradedItem } = registerGradeSale(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress, removeCopy: equipmentCopies.removeCopy });
export const { placeExchangeOffer, cancelExchangeOffer, listExchangeGear, buyExchangeGear, cancelExchangeListing, collectExchange,
  myExchangeCollect, myExchangeOffers, myExchangeListings } = registerExchange(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress, restoreItemToProgress,
  writeProgressAndPresentation, removeCopy: equipmentCopies.removeCopy });

export const convertItemToCosmetic = spacetimedb.reducer(
  { itemId: t.string() }, (ctx, { itemId }) => cosmeticConversion.convertItemToCosmetic(ctx, itemId),
);

export const buyOxShopCosmetic = spacetimedb.reducer(
  { itemId: t.string() }, (ctx, { itemId }) => cosmeticConversion.buyOxShopCosmetic(ctx, itemId),
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
    // The client respawns a dead player somewhere the server never saw them
    // walk to. Stop them and forget the input sequence, as world entry does, so
    // the first packet after the respawn re-anchors them instead of being
    // refused as a teleport for as long as they keep running. The sequence the
    // movement check reads lives on the motion row; the player row mirrors it.
    if (motion) ctx.db.playerMotion.networkId.update({ ...motion, dx: 0, dy: 0, vx: 0, vy: 0, moving: false, lastInputAt: ctx.timestamp, lastInputSequence: 0 });
    const dead = ctx.db.player.identity.find(ctx.sender);
    if (dead && dead.lastInputSequence > 0) updateSnapshotRow(ctx, "player", { ...dead, lastInputSequence: 0 });
    publishPlayerDeathFrame(ctx, activePlayer);
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, deathCount: lifetime.deathCount + 1n });
    restartAggroRunOnDeath(ctx, ctx.db.player.identity.find(ctx.sender), startFreshRun);
  },
);

/** Only enemy identities/counts cross the wire; all reward values are server-owned. */
const EnemyDefeatEntry = t.object("EnemyDefeat", { enemy: t.string(), count: t.u16() });
// Plus the milliseconds the client simulated since its previous report (0 when it cannot say); see simulationClock.
const enemyDefeatReportArgs = { streamId: t.string(), sequence: t.u64(), mapId: t.string(), simulatedMillis: t.u32(), enemies: t.array(EnemyDefeatEntry) };
function recordEnemyDefeatsFor(ctx: any, batch: EnemyDefeatBatch, clocks?: ThrottledClocks) {
    // Only the map and power are read here; the position is worked out below if the row is written.
    const player = requireControllingPlayerRow(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Enemy rewards require your account world connection.");
    // Everything the combat bound reads, read once for the whole report; most of it kept between reports.
    const combat = combatBoundForReport(ctx), worn = combat.wornCards();
    const accepted = acceptEnemyDefeats(ctx, batch, permittedDefeatMaps(ctx, player, TOWN_MAP_ID), combat, clocks);
    if (!accepted) return;
    const enforce = () => {
      // Only a report no real client could have sent. A clipped claim is
      // already bounded; taking the session as well kicked honest players off
      // a portal round-trip. See enemy-defeats.ts.
      if (!accepted.restrict) return;
      const restriction = restrictDefeatSession(ctx, { mapId: batch.mapId, streamId: batch.streamId,
        sequence: batch.sequence.toString(), violations: accepted.violations });
      finishLifetimeSession(ctx, ctx.sender);
      removeIdentityPresence(ctx, ctx.sender);
      console.warn("Enemy defeat session restricted", JSON.stringify(restriction));
    };
    if (!accepted.count && !accepted.bossCleared) { enforce(); return; }
    // Validation wrote no progress, so the row the bound read is still current.
    const base = accepted.count ? combat.savedProgress() : null;
    let rewarded: any;
    if (accepted.count) {
      const next = combat.rewardedProgress()!;
      rewarded = awardRegularEnemyLoot(ctx, batch.mapId, accepted.lootCount, accepted.balance, { progress: next });
      updateSnapshotRow(ctx, "playerProgress", rewarded);
      const power = combat.powerFields(rewarded);
      // Both rows below are broadcast to everyone on the map, and kills move
      // power on nearly every report. The plate shows only the compact figure,
      // so write when that changes; the row is exact when written and never
      // more than one displayed step behind.
      if (compactNumberChanged(player.powerLevel, power.powerLevel)) {
        const nextPlayer = { ...playerWithMotion(ctx, player), ...power };
        updateSnapshotRow(ctx, "player", nextPlayer);
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
      }
    }
    const gate = accepted.bossCleared ? recordBossGateClear(ctx, batch.mapId) : null;
    // A gate clear opens maps and can win a challenge: the profile is built again next report.
    if (gate) touchCombatProfile(ctx, ctx.sender);
    awardCardDrops(ctx, ctx.sender, batch.mapId, accepted.kills, accepted.bossCleared ? 1 : 0, 1, worn, combat.luck);
    awardWeaponMastery(ctx, ctx.sender, (base ?? gate?.previousProgress ?? combat.savedProgress())?.equippedRightHand, accepted.count, Boolean(gate),
      combat.inChallenge, () => combat.hallBonus("banners"));
    // New regular loot goes on when it beats the slot. A gate clear wrote the save again after the loot.
    autoEquip.equipNewUpgrades(ctx, ctx.sender, base ?? gate?.previousProgress, gate ? undefined : rewarded);
    if (accepted.count) {
      const lifetime = ensurePlayerLifetime(ctx);
      const enemyKills = lifetime.enemyKills + BigInt(accepted.count);
      ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills });
      // Only an account's first kills can be its first kill day.
      if (lifetime.enemyKills === 0n) recordAnalyticsMilestone(ctx, "kill");
      killGems.grantKillGems(ctx, ctx.sender, accepted.count, enemyKills);
      recordDailyQuestKills(ctx, ctx.sender, batch.mapId, accepted.kills, combat.bonuses().quest); noteEnemyDefeats(ctx, batch.mapId, accepted.rewards);
    }
    awardKillGold(ctx, ctx.sender, accepted.count, Boolean(gate), worn, combat);
    enforce();
    if (!accepted.restrict && gate) {
      recordAnalyticsMilestone(ctx, "boss");
      // A challenge won here moves the player itself; otherwise Onward (Warden II card) takes them to the map just opened.
      if (!prestige.completeChallengeIfMet(ctx)) travelOnward(ctx, batch.mapId, worn);
    }
}
// The throttle comes before any other read; throttleKillReports says why.
const killReport = (ctx: any, batch: any) => {
  recordEnemyDefeatsFor(ctx, batch, throttleKillReports(ctx));
};
export const reportEnemyDefeats = spacetimedb.reducer(enemyDefeatReportArgs, keepsCombatProfile(killReport));
// Same reward as reportEnemyDefeats: which reducer a client calls is its own claim.
export const reportAutoFarmEnemyDefeats = spacetimedb.reducer(enemyDefeatReportArgs, killReport);

export const myDefeatSessionRestriction = spacetimedb.view(
  { name: "my_defeat_session_restriction", public: true }, t.array(defeatSessionRestriction.rowType),
  ctx => { const row = ctx.db.defeatSessionRestriction.identity.find(ctx.sender); return row ? [row] : []; },
);

export const myOfflineProgress = spacetimedb.view(
  { name: "my_offline_progress", public: true }, t.array(offlineProgressTables.offlineProgress.rowType),
  ctx => { const row = ctx.db.offlineProgress.identity.find(ctx.sender); return row?.pending ? [row] : []; },
);

/**
 * The account's own consent row.
 *
 * Acceptance is per account and lives on the server. This lets the client read
 * what the account already agreed to, so a new device or token does not ask again.
 */
export const myLegalConsent = spacetimedb.view(
  { name: "my_legal_consent", public: true }, t.array(playerLegalConsent.rowType),
  ctx => { const row = ctx.db.playerLegalConsent.identity.find(ctx.sender); return row ? [row] : []; },
);

/** The mining and chopping on offer beside the waiting fight summary. */
export const myOfflineGatherChoice = spacetimedb.view(
  { name: "my_offline_gather_choice", public: true }, t.array(offlineGatherChoice.rowType),
  ctx => { const row = ctx.db.offlineGatherChoice.identity.find(ctx.sender); return row ? [row] : []; },
);
/** The caller's prestige run timing (run-timing.ts): its start in active play and each boss's first clear. */
export const myRunTiming = spacetimedb.view(
  { name: "my_run_timing", public: true }, t.array(playerRunTiming.rowType),
  ctx => { const row = ctx.db.playerRunTiming.identity.find(ctx.sender); return row ? [row] : []; },
);
/** The caller's finished runs (run-timing.ts), for the run log and personal bests. */
export const myRunHistory = spacetimedb.view(
  { name: "my_run_history", public: true }, t.array(playerRunHistory.rowType), ctx => [...ctx.db.playerRunHistory.identity.filter(ctx.sender)],
);

export const myOfflinePreference = spacetimedb.view(
  { name: "my_offline_preference", public: true }, t.array(playerOfflinePreference.rowType),
  ctx => { const row = ctx.db.playerOfflinePreference.identity.find(ctx.sender); return row ? [row] : []; },
);

/**
 * Opt out of being paid for time away. On by default, so an account with no
 * row here is unaffected and nothing needed migrating.
 */
export const setOfflineProgressEnabled = spacetimedb.reducer({ enabled: t.bool() }, (ctx, { enabled }) => {
  requireControllingPlayer(ctx);
  writeOfflinePreference(ctx, enabled);
});

export const myBowSkills = spacetimedb.view(
  { name: "my_bow_skills", public: true }, t.array(playerBowSkill.rowType),
  ctx => [...ctx.db.playerBowSkill.identity.filter(ctx.sender)],
);

export const mySwordSkills = spacetimedb.view(
  { name: "my_sword_skills", public: true }, t.array(playerSwordSkill.rowType),
  ctx => [...ctx.db.playerSwordSkill.identity.filter(ctx.sender)],
);
export const myEquipmentLocks = spacetimedb.view(
  { name: "my_equipment_locks", public: true }, t.array(playerEquipmentLock.rowType),
  ctx => [...ctx.db.playerEquipmentLock.identity.filter(ctx.sender)],
);
export const setEquipmentLocked = spacetimedb.reducer({ itemId: t.string(), copyId: t.u64(), locked: t.bool() }, (ctx, args) => {
  requireControllingPlayer(ctx);
  setEquipmentLock(ctx, args, inventoryForProgress);
});
export const myEquipmentCopies = spacetimedb.view(
  { name: "my_equipment_copies", public: true }, t.array(playerEquipmentCopy.rowType),
  ctx => [...ctx.db.playerEquipmentCopy.identity.filter(ctx.sender)],
);
export const myEquipmentOffers = spacetimedb.view(
  { name: "my_equipment_offers", public: true }, t.array(pendingEquipmentOffer.rowType),
  ctx => [...ctx.db.pendingEquipmentOffer.identity.filter(ctx.sender)],
);
export const myIgnoredDrops = spacetimedb.view(
  { name: "my_ignored_drops", public: true }, t.array(playerIgnoredDrop.rowType),
  ctx => [...ctx.db.playerIgnoredDrop.identity.filter(ctx.sender)],
);
/** The loot filter: slots and items that never drop for the caller, set from the map window. Body: ignored-drops.ts. */
export const setIgnoredDrops = spacetimedb.reducer({ itemIds: t.array(t.string()), ignored: t.bool() }, (ctx, args) => {
  requireControllingPlayer(ctx);
  writeIgnoredDrops(ctx, args);
});
export const myLootSettings = spacetimedb.view(
  { name: "my_loot_settings", public: true }, t.array(playerLootSetting.rowType),
  ctx => { const row = ctx.db.playerLootSetting.identity.find(ctx.sender); return row ? [row] : []; },
);
/** Auto keep best and Auto equip upgrades, from the top of the Loot Filter window. Body: loot-settings.ts. */
export const setLootSettings = spacetimedb.reducer({ autoKeepBest: t.bool(), autoEquipBest: t.bool() }, (ctx, settings) => {
  requireControllingPlayer(ctx);
  writeLootSettings(ctx, settings);
});
export const myAdGemReward = spacetimedb.view(
  { name: "my_ad_gem_reward", public: true }, t.array(playerAdReward.rowType),
  ctx => { const row = ctx.db.playerAdReward.identity.find(ctx.sender); return row ? [row] : []; },
);
/** Ten Gems for a watched ad, thirty minutes apart and four a UTC day. Body: ad-gem-reward.ts. */
export const claimAdGems = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  claimAdGemReward(ctx, applyGemBalanceChange, patreonStatus(ctx, ctx.sender).tier !== "none");
});
/** An ad starts playing: the claim after it pays only once it has run (ad-gem-reward.ts). */
export const startAdGems = spacetimedb.reducer((ctx) => {
  requireControllingPlayer(ctx);
  startAdWatch(ctx);
});
export const myChatMute = spacetimedb.view(
  { name: "my_chat_mute", public: true }, t.array(playerChatMute.rowType),
  ctx => { const row = ctx.db.playerChatMute.identity.find(ctx.sender); return row ? [row] : []; },
);
/** Owner or signed-in developer: mute an account's chat for `minutes`, or lift it with 0. Body: chat-mute.ts. */
export const devSetChatMute = spacetimedb.reducer({ identity: t.identity(), minutes: t.u32() }, (ctx, { identity, minutes }) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_set_chat_mute");
  if (isDeveloperIdentity(identity) || isDatabaseOwnerIdentity(identity)) throw new SenderError("Protected identity cannot be muted.");
  setChatMute(ctx, identity, minutes);
});
export const myAudioSettings = spacetimedb.view(
  { name: "my_audio_settings", public: true }, t.array(playerAudioSetting.rowType),
  ctx => { const row = ctx.db.playerAudioSetting.identity.find(ctx.sender); return row ? [row] : []; },
);

/** The account's volumes. Any tab with a session may save them, in or out of the world. */
export const setAudioSettings = spacetimedb.reducer({ musicVolume: t.f32(), sfxVolume: t.f32() }, (ctx, volumes) => {
  requireSupportedSessionProtocol(ctx);
  writeAudioSettings(ctx, volumes);
});

/**
 * Erase every trace of an account, for a verified deletion request.
 *
 * Resumable on purpose: a reducer's execution budget will not carry the larger
 * tables in one pass, so this deletes what it can and says whether anything is
 * left. Run it until `complete` is true and the row count reaches zero. It is
 * the same work each time, so a repeat is harmless.
 *
 * Only the account asked for goes. A guest that became a registered account
 * (analytics_conversion) is a second account: erasing one leaves the other,
 * and only the record linking them goes with it.
 *
 * What this cannot do: remove the SpacetimeAuth account itself, or anything
 * held by a provider. Those are separate administrative steps, and a request
 * is not finished until they are done. The queue row is deleted here only
 * because it is one of this account's rows; that is not a claim the wider
 * workflow is complete.
 */
export const devEraseAccount = spacetimedb.reducer(
  { identityHex: t.string(), confirmation: t.string(), reason: t.string() },
  (ctx, { identityHex, confirmation, reason }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_erase_account");
    requireErasureConfirmation(confirmation);
    if (!reason.trim() || reason.length > 500) throw new SenderError("Record why this account is being erased.");
    let target: any;
    try { target = Identity.fromString(identityHex); }
    catch { throw new SenderError("That is not an identity."); }
    if (isDeveloperIdentity(target)) throw new SenderError("Refusing to erase a developer identity.");

    const identities = [target];
    const displayName = ctx.db.playerProfile.identity.find(target)?.displayName ?? "";
    const result = eraseKeepingRequest(ctx, identities);

    // Written before the sweep's own audit row could be caught by a later
    // pass, and outside the erased account's rows, so the record survives it.
    recordModerationAction(ctx, {
      targetIdentity: identityHex, targetName: displayName,
      channel: "account", action: result.complete ? "Account erased" : "Account erasure in progress",
      reason, actorType: "owner", rule: "privacy-erasure",
      before: JSON.stringify({ identities: identities.map((id: any) => id.toHexString()) }),
      after: JSON.stringify({ deleted: result.deleted, complete: result.complete, remaining: result.remaining }),
    });
    console.warn("Account erasure", JSON.stringify({ identityHex, ...result }));
  },
);

/**
 * Corrects when an account began: the profile's Joined and the leaderboard's Account Created (from its next
 * snapshot). `date` is YYYY-MM-DD and is stored at noon UTC, so it reads as that day in nearly every time zone.
 */
export const devSetJoinDate = spacetimedb.reducer(
  { identityHex: t.string(), date: t.string(), reason: t.string() },
  (ctx, { identityHex, date, reason }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_set_join_date");
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const ms = parts ? Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12) : NaN;
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new SenderError("Use a date like 2026-08-06.");
    if (BigInt(ms) * 1000n > ctx.timestamp.microsSinceUnixEpoch) throw new SenderError("That date is in the future.");
    let target: any;
    try { target = Identity.fromString(identityHex); }
    catch { throw new SenderError("That is not an identity."); }
    const lifetime = ctx.db.playerLifetime.identity.find(target);
    if (!lifetime) throw new SenderError("No account with that identity.");
    const joinedAt = new Timestamp(BigInt(ms) * 1000n);
    ctx.db.playerLifetime.identity.update({ ...lifetime, joinedAt });
    syncPlayerJoinDate(ctx, target, joinedAt);
    const standing = ctx.db.leaderboardStanding.identity.find(target);
    if (standing) ctx.db.leaderboardStanding.identity.update({ ...standing, joinedAtMicros: joinedAt.microsSinceUnixEpoch });
    recordModerationAction(ctx, {
      targetIdentity: identityHex, targetName: ctx.db.playerProfile.identity.find(target)?.displayName ?? "",
      channel: "account", action: "Join date set", reason: reason.trim() || "Corrected by the developer", actorType: "owner", rule: "account-correction",
      before: lifetime.joinedAt.toDate().toISOString(), after: joinedAt.toDate().toISOString(),
    });
  },
);

/** The summary has been shown, by a client from before the choice: it collects the fight. */
export const acknowledgeOfflineSummary = spacetimedb.reducer({}, (ctx) => {
  requireControllingPlayer(ctx);
  collectOfflineProgress(ctx, "fight", OFFLINE_GRANT_PORTS);
});

/** Collects the time away as the fight, the mining or the chopping (offline-progress.ts). */
export const collectOfflineProgressAs = spacetimedb.reducer({ activity: t.string() }, (ctx, { activity }) => {
  requireControllingPlayer(ctx);
  const picked = offlineActivity(activity);
  if (!picked) throw new SenderError("Pick fight, mine or chop.");
  collectOfflineProgress(ctx, picked, OFFLINE_GRANT_PORTS);
});

/**
 * Developer-only: backdate the unattended window so the next world entry pays
 * out without waiting. Offline progress is otherwise untestable in one sitting.
 */
export const simulateTimeAway = spacetimedb.reducer({ seconds: t.u32() }, (ctx, { seconds }) => {
  requireDeveloper(ctx, "simulate_time_away");
  setSimulatedTimeAway(ctx, seconds, OFFLINE_GRANT_PORTS);
});

export const myOnboarding = spacetimedb.view(
  { name: "my_onboarding", public: true }, t.array(playerOnboarding.rowType),
  ctx => { const state = ctx.db.playerOnboarding.identity.find(ctx.sender); return state ? [state] : []; },
);

export const completeOnboardingStep = spacetimedb.reducer({ step: t.u8() }, (ctx, { step }) => {
  requireControllingPlayer(ctx);
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
    const current = readPlayerProgress(ctx, ctx.sender);
    if (current?.introComplete) return;
    if (current) updateSnapshotRow(ctx, "playerProgress", { ...current, introComplete: true });
    else insertSnapshotRow(ctx, "playerProgress", { ...defaultPlayerProgress(ctx.sender), introComplete: true });
  },
);
const prestige = createPrestige({
  requireControllingPlayer,
  activeDuelFor,
  resetProgressToDefaults, respawnWithProgress, winAggro: (ctx, player) => endAggroChallenge(ctx, player, true, { respawnWithProgress }),
  restoreChallenge: (ctx, player, reward) => restorePrestigeChallenge(ctx, player, reward,
    restored => respawnWithProgress(ctx, player, restored.progress, restored)),
  refreshPerkEffects: (ctx, player) => refreshPrestigeMovement(ctx, player, updated => syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated))),
  recordPrestige: (ctx: any) => { recordAnalyticsMilestone(ctx, "prestige"); },
});
export const resetPlayerProgress = spacetimedb.reducer({}, (ctx) => {
  const activePlayer = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before resetting progress.");
  // In a challenge the main run is set aside, and dropping out brings it back over a reset of the challenge run.
  if (ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)?.active || ctx.db.playerAggroChallenge.identity.find(ctx.sender)?.active) throw new SenderError("Drop out of the challenge before resetting your save.");
  resetWholeSave(ctx, activePlayer);
});
// Bodies live in prestige.ts; this is the schema-facing declaration.
export const startPrestigeChallenge = spacetimedb.reducer({}, ctx => prestige.changeChallenge(ctx, true));
export const abandonPrestigeChallenge = spacetimedb.reducer({}, ctx => prestige.changeChallenge(ctx, false));
export const { startAggroRun, abandonAggroRun } = registerAggroReducers(spacetimedb, { requireControllingPlayer, activeDuelFor, startFreshRun, respawnWithProgress });
export const { setBonusToggleState } = registerBonusToggleReducers(spacetimedb, { requireControllingPlayer, activeDuelFor,
  refreshPerkEffects: (ctx, player) => refreshPrestigeMovement(ctx, player, updated => syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated))) });
export const { setAutoFarmPuppet } = registerAutoFarmPuppetReducers(spacetimedb, { blockedSession, requireControllingPlayer, playerWithMotion });
export const { mySoulStats, mySoulLevel, myRewardKills, profileSoulStats, setSoulDimensionOpen } = registerSoulDimension(spacetimedb, { requireDeveloper });
export const { fallIntoWell, useTownDoor } = registerTown(spacetimedb, { requireControllingPlayer, playerWithMotion, transitionPlayerMap });
export const prestigeAccount = spacetimedb.reducer({}, (ctx) => { prestige.prestigeAccount(ctx); });
export const spendPrestigePerkPoint = spacetimedb.reducer({ perk: t.string() },
  (ctx, { perk }) => { prestige.spendPerkPoint(ctx, perk); });
export const respecPrestigePerks = spacetimedb.reducer({}, (ctx) => { prestige.respecPerks(ctx); });
export const useFreePrestigeRespec = spacetimedb.reducer({}, (ctx) => { prestige.freeRespecPerks(ctx); });
export const refreshDailyQuests = spacetimedb.reducer({}, (ctx) => { requireControllingPlayer(ctx); ensureDailyQuests(ctx, ctx.sender); });
export const collectGuildMemberQuests = spacetimedb.reducer({ member: t.identity() }, (ctx, { member }) => { requireControllingPlayer(ctx); collectMemberQuests(ctx, ctx.sender, member); });

export const sendChatMessage = spacetimedb.reducer(
  { message: t.string() },
  keepsCombatProfile((ctx: any, { message }: any) => sendPlayerChatMessage(ctx, message)),
);

// Kept separate from sendChatMessage so already-deployed clients retain their
// original reducer signature while newer clients can attach a server snapshot.
export const sendChatReply = spacetimedb.reducer(
  { message: t.string(), replyToMessageId: t.u64() },
  keepsCombatProfile((ctx: any, { message, replyToMessageId }: any) => sendPlayerChatMessage(ctx, message, replyToMessageId)),
);

export const reportChatMessage = spacetimedb.reducer(
  { messageId: t.u64(), reason: t.string() },
  (ctx, args) => reportChatMessageFor(ctx, args),
);

function reportChatMessageFor(ctx: ModuleReducerCtx, { messageId, reason }: { messageId: bigint; reason: string }) {
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
  if ((isDeveloperIdentity(ctx.sender) || isChatModerator(ctx, ctx.sender)) && hasSpacetimeAuthAccount(ctx)) {
    moderateReportedMessage(ctx, "public", messageId, reason, "chat_message_report", report.id.toString(), isDeveloperIdentity(ctx.sender) ? "developer" : "moderator");
    ctx.db.chatMessageReport.id.update({ ...report, status: "resolved" });
  }
}

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
  keepsCombatProfile((ctx: any, { x, y, vx, vy, simulationTick, motionEpoch, sequence }: any) => {
    if (blockedSession(ctx)) return;
    applyMovementState(ctx, x, y, vx, vy, simulationTick, motionEpoch, sequence);
  }),
);

export const setPlayerMotionInterest = spacetimedb.reducer(
  { networkIds: t.array(t.u32()) },
  keepsCombatProfile((ctx: any, args: any) => setMotionInterest(ctx, args)),
);

export const changeMap = spacetimedb.reducer(
  { mapId: t.string(), x: t.f64(), y: t.f64() },
  keepsCombatProfile((ctx: any, args: any) => changePlayerMap(ctx, args)),
);
/** Research Ready's tap: the Town teleport into the Research building (map-travel.ts). */
export const teleportToResearch = spacetimedb.reducer({ x: t.f64(), y: t.f64() }, (ctx, args) => teleportToResearchRoom(ctx, args));
export const teleportToTownSquare = spacetimedb.reducer({}, (ctx) => teleportToSquare(ctx));
export const travelToMap = spacetimedb.reducer({ mapId: t.string() }, (ctx, args) => travelStraightToMap(ctx, args));

export const setSpeed = spacetimedb.reducer(
  { speed: t.f32() },
  (ctx, args) => setPlayerSpeed(ctx, args),
);

/** The database owner, or the module calling itself from a schedule. */
function requireOperator(ctx: any) {
  const internal = !ctx.connectionId && sameIdentity(ctx.sender, ctx.databaseIdentity);
  if (!internal && !isDatabaseOwnerIdentity(ctx.sender)) throw new SenderError("Database operator required");
}
export const prepareWorldActionPosition = spacetimedb.reducer({ x: t.f64(), y: t.f64() }, keepsCombatProfile((ctx: any, { x, y }: any) => {
  const player = requireControllingPlayer(ctx);
  if (![x, y].every(Number.isFinite) || x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > worldBoundsFor(player.mapId).width - PLAYER_RADIUS || y > worldBoundsFor(player.mapId).height - PLAYER_RADIUS) {
    throw new SenderError("Invalid bench position");
  }
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  // A stop, not a teleport: only where the player could have walked, as a movement packet is judged.
  const at = reachableStopFor(ctx, player, x, y);
  const next = { ...player, ...at, ...playerZone(at.x, at.y), moving: false, vx: 0, vy: 0, dx: 0, dy: 0, lastInputAt: ctx.timestamp };
  updateSnapshotRow(ctx, "player", next);
  syncPlayerMotion(ctx, next);
}));

function requireGuildConnection(ctx: ModuleReducerCtx) {
  requireControllingPlayer(ctx);
  if (isVirtualPlayer(ctx, ctx.sender)) throw new SenderError("Use your main character connection.");
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
}

function requireGuildPlayer(ctx: ModuleReducerCtx) {
  requireGuildConnection(ctx);
}

/** A guild battle fighter, built as a duel builds its sides (duel-runtime.ts guildFighter). */
function guildFighterFor(ctx: ModuleReducerCtx, identity: Identity): DuelFighter {
  const progress = readPlayerProgress(ctx, identity);
  if (!progress) throw new SenderError("Player progress is unavailable.");
  return guildFighter(ctx, identity, progress);
}

/** Online and where, for profiles and guilds: survives eye-off and autofarming; an invisible developer is offline. */
function playerPresence(ctx: any, identity: any) {
  const active = ctx.db.player.identity.find(identity);
  const online = Boolean(active)
    && (!isDeveloperIdentity(identity) || (ctx.db.developerPresencePreference.identity.find(identity)?.visible ?? false));
  return { online, mapId: online ? active.mapId as string : "",
    lastSeenAtMs: Number(ctx.db.playerLifetime.identity.find(identity)?.sessionStartedAt.microsSinceUnixEpoch ?? 0n) / 1000 };
}
const guildService = createGuildService({
  onMemberRemoved: (ctx, identity, guildId, deleted) => { refreshQuestBonus(ctx, identity); guildHallMemberLeft(ctx, identity, guildId, deleted, { transitionPlayerMap, persistWorldLocation }); },
  prestigeFor: (ctx, identity) => ctx.db.playerPrestige.identity.find(identity)?.level ?? 0,
  powerFor: (ctx, identity) => {
    const progress = readPlayerProgress(ctx, identity);
    return progress ? effectivePowerForProgress(ctx, progress) : 0;
  },
  // Guild rows show online and last seen, never the map.
  presenceFor: (ctx, identity) => { const { online, lastSeenAtMs } = playerPresence(ctx, identity); return { online, lastSeenAtMs }; },
  profileFor: (ctx, identity) => ctx.db.playerProfile.identity.find(identity) ?? undefined,
  questFor: memberQuestStanding, questCollect: questCollectStanding, onJoin: moveSoloQuestsToGuild,
  battleShared: (ctx, replayKey) => !ctx.db.chatMessage.byGuildReplay.filter(replayKey)[Symbol.iterator]().next().done,
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
    const progress = readPlayerProgress(ctx, identity);
    if (!progress) throw new SenderError("Player progress is unavailable.");
    return { name: profile.displayName, fighter: guildFighterFor(ctx, identity),
      appearance: leaderboardAppearanceForProgress(ctx, progress, profile),
      moveSpeed: PLAYER_SPEED,
      weaponItem: progress.equippedRightHand || progress.equippedLeftHand,
      range: Math.min(GUILD_MAX_RANGE, guildWeaponRange(progress.equippedRightHand || progress.equippedLeftHand, progress.attackRange)) };

  },
});

// Guest claiming and identity removal reach guildService, so this has to
// follow it; every other dep is a hoisted function or an earlier const.
const {
  syncSenderAccountStatus, claimGuestAccountFor, removeIdentityPresence, removeVirtualPlayerData,
  removePlayerIdentityData,
} = createAccountLifecycle({
  LEGACY_CLIENT_ERRORS, UPGRADE_BENCH_SLOT_ONE, UPGRADE_BENCH_SLOT_TWO, UPGRADE_BENCH_SLOT_THREE, guildService, activeDuelFor,
  activeItemUpgradeForSlot, mergeOldGearPayout, payOutOldGear, adjustVirtualPlayerCount, applyGemBalanceChange, earlierTimestamp,
  effectiveMovementSpeedForProgress, ensureCutsceneHistory, ensureGemWallet,
  ensureItemUpgradeCompletionSchedule, ensureResearchCompletionSchedule,
  equipmentPresentationForProgress, finishDuel, generatedDisplayName, hasFreshProgress,
  insertActiveItemUpgrade, isGeneratedDisplayName, slotUpgradeKey, leaderboardAppearanceForProgress,
  persistWorldLocation, playerWithMotion, powerFieldsForProgress,
  refreshLeaderboard, removeItemUpgradeCompletionSchedules, removePlayerItemUpgradeData,
  removePlayerRealtimeState, removePlayerSafetyData, removeResearchCompletionSchedules,
  repairModeratedDisplayName, requireSupportedSessionProtocol, sameIdentity,
  syncDisplayNamePresentation, syncPlayerMotionIdentity, transferPlayerBlocks,
  recordAnalyticsConversion,
});

// Presence and motion bodies live in presence-runtime.ts. Only these three still
// borrow from index.ts; removeIdentityPresence comes from the lifecycle factory
// above, so this has to follow it.
const { savedWorldLocation, clearOrphanPresence, applyMovementState } = createPresenceRuntime({
  WORLD, VALID_MAP_IDS, MAP_ARRIVALS, hasEndlessTravelAccess, sameIdentity, finishLifetimeSession,
  removeIdentityPresence, LEGACY_CLIENT_ERRORS, sessionForContext, isSupportedProtocol, sameConnection,
  activeDuelFor, effectiveMovementSpeedForProgress, equippedFeetForProgress,
});

export const { createGuild, joinGuild, leaveGuild, transferGuildLeadership, setGuildVicePresident,
  setGuildEmblem, kickGuildMember, challengeGuild, guildAdmission, shareGuildBattle, getGuildBattleBadges } = registerGuildReducers(spacetimedb,
  { guildService, requireGuildPlayer, requireGuildConnection, effectivePowerForProgress, isPublicDisplayNameAllowed });
// Refining (item-refine.ts, shared/refine.ts).
export const { refineItem, destroyOre, myItemRefines, myCopyRefines, myOres, myRefineResult, myRefinePity } = registerItemRefine(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress, writeProgressAndPresentation });
export const { myCosmeticRefines } = registerCosmeticRefine(spacetimedb);
// Mining in the Copper Hills (mining.ts, shared/mining.ts).
export const { claimPickaxe, mineNode, reportMining, myMining, myMinedNodes } = registerMining(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress });
export const { claimHatchet, chopTree, reportChopping, myWoodcutting, myChoppedTrees } = registerWoodcutting(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress });
export const { myResearchRanks } = registerResearchRanks(spacetimedb);
export const { claimStarterStaff, myStaffSkills } = registerStaffs(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress, restoreItemToProgress, writeProgressAndPresentation });
export const { myCards, myGearSlots, myCopySlots, myCardDrop } = registerGearCards(spacetimedb); export const myItemCollection = registerItemCollection(spacetimedb);
// Stats, power and the attack speed cap follow the active cards.
const afterCardsChanged = (ctx: any, identity: any) => { syncCardAttackCap(ctx, identity); const progress = readPlayerProgress(ctx, identity); if (progress) writeProgressAndPresentation(ctx, progress); };
export const { activateCard, deactivateCard, myActiveCards } = registerActiveCards(spacetimedb, { requireControllingPlayer, activeDuelFor, afterCardsChanged });
export const { saveBuild, applyBuildCards, renameBuild, myBuilds, myBuildNames } = registerBuilds(spacetimedb, { requireControllingPlayer, activeDuelFor, afterCardsChanged });
export const { myWeaponMastery } = registerWeaponMastery(spacetimedb);
export const { myGold } = registerGold(spacetimedb);
export const { buyShopCard, myCardShopPurchases } = registerCardShop(spacetimedb, { requireControllingPlayer, activeDuelFor });
export const { buyGradeGear } = registerGradeShop(spacetimedb, { requireControllingPlayer, activeDuelFor, inventoryForProgress, restoreItemToProgress, writeProgressAndPresentation });
// The Starter Chest by the forest spawn (starter-chest.ts).
export const { claimStarterWeapon, myStarterWeapon } = registerStarterChest(spacetimedb, { requireControllingPlayer, activeDuelFor });
const craftingDeps = { requireControllingPlayer, activeDuelFor, inventoryForProgress, restoreItemToProgress, writeProgressAndPresentation };
export const { craftGradeItem, reforgeWeapon, craftGradeGear, myCraftSkills } = registerCrafting(spacetimedb, craftingDeps);
export const { craftArrows, nockArrow, spendArrows, myNockedArrow } = registerArrows(spacetimedb, craftingDeps);
export const setGatherPicks = registerGatherPicks(spacetimedb);
export const { upgradeTool, myTools } = registerTools(spacetimedb, { requireControllingPlayer, activeDuelFor });
export const myGuildJoinRequests = registerGuildJoinRequestView(spacetimedb);
export const { myGuildHall, upgradeGuildHall, useGuildHallDoor } = registerGuildHall(spacetimedb, { requireGuildPlayer, requireControllingPlayer, playerWithMotion, transitionPlayerMap, persistWorldLocation });
export const getGuildHub = spacetimedb.procedure({ afterId: t.u64() }, t.string(), (ctx, { afterId }) => ctx.withTx(tx => {
  requireGuildConnection(tx);
  return JSON.stringify(guildService.snapshot(tx, afterId, hasSpacetimeAuthAccount(tx)));
}));
export const getGuildBattleHub = spacetimedb.procedure({ afterId: t.u64() }, t.string(), (ctx, { afterId }) => ctx.withTx(tx => {
  requireGuildConnection(tx);
  return JSON.stringify(guildService.snapshot(tx, afterId, hasSpacetimeAuthAccount(tx), true));
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
  requireOperator(ctx);
  const existing = ctx.db.guild.nameKey.find("temp");
  if (existing) {
    if (existing.members === 20) return;
    throw new SenderError("The temp guild already exists; its membership was preserved.");
  }
  const candidates = [...ctx.db.leaderboardEntry.iter()]
    .filter(row => !ctx.db.guildMember.identity.find(row.identity) && readPlayerProgress(ctx, row.identity)
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
const socialService = createSocialService({ joinInvited: (ctx, id) => guildService.joinInvited(ctx, id) });
function requireSocialPlayer(ctx: ModuleReducerCtx) {
  requireControllingPlayer(ctx);
  if (isVirtualPlayer(ctx, ctx.sender)) throw new SenderError("Use your main character connection.");
}
/** The viewer's chat role: their moderator heart, and whether their reports remove messages. */
// A profile's online line: player rows of eye-off players are withheld from other clients.
export const getPlayerPresence = spacetimedb.procedure({ identity: t.identity() }, t.string(), (ctx, { identity }) => ctx.withTx(tx => JSON.stringify(playerPresence(tx, identity))));
// A profile's Guild stat gain: last week's guild points, or solo quests without a guild.
export const getStatGainBonus = spacetimedb.procedure({ identity: t.identity() }, t.f64(), (ctx, { identity }) => ctx.withTx(tx => guildQuestBonusFor(tx, identity)));
export const getMapIndexBalance = spacetimedb.procedure({ mapId: t.string() }, t.string(), (ctx, { mapId }) => ctx.withTx(tx => mapBalanceForIndex(tx, mapId)));
export const getChatRole = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => { requireSocialPlayer(tx); return JSON.stringify({ moderatorHeart: moderatorHeartFor(tx, tx.sender), canModerate: (isDeveloperIdentity(tx.sender) || isChatModerator(tx, tx.sender)) && hasSpacetimeAuthAccount(tx) }); }));
/** Undo a removal from the chat itself; developers and moderators, signed in. */
export const restoreChatMessage = spacetimedb.reducer({ channel: t.string(), messageId: t.u64() }, (ctx, { channel, messageId }) => {
  requireSocialPlayer(ctx); const developer = isDeveloperIdentity(ctx.sender);
  if (!(developer || isChatModerator(ctx, ctx.sender)) || !hasSpacetimeAuthAccount(ctx)) throw new SenderError("Only moderators can restore messages.");
  if (channel === "social" && !visibleSocialMessages(ctx).some(row => row.id === messageId)) throw new SenderError("Message unavailable.");
  restoreMessageFromChat(ctx, channel, messageId, developer ? "developer" : "moderator");
});
export const devSetChatModerator = spacetimedb.reducer({ identity: t.identity(), heart: t.string() }, (ctx, { identity, heart }) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "dev_set_chat_moderator", "Database owner required."); setChatModerator(ctx, identity, heart);
});
export const getChatMessageReactions = spacetimedb.procedure(
  { channel: t.string(), messageId: t.u64() }, t.string(), (ctx, { channel, messageId }) => ctx.withTx(tx => {
    requireSocialPlayer(tx); return JSON.stringify(readChatReactions(tx, channel, messageId));
  }),
);
export const setChatMessageReaction = spacetimedb.reducer(
  { channel: t.string(), messageId: t.u64(), reaction: t.string(), active: t.bool() },
  (ctx, { channel, messageId, reaction, active }) => {
    requireSocialPlayer(ctx); requireChatAge(ctx); setChatReaction(ctx, channel, messageId, reaction, active);
  },
);
export const devGrantGemHeart = spacetimedb.reducer(
  { identity: t.identity(), enabled: t.bool() },
  (ctx, { identity, enabled }) => { if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "dev_grant_gem_heart", "Database owner required."); grantGemHeartUnlock(ctx, identity, enabled); },
);
export const getSocialHub = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  requireSocialPlayer(tx); return JSON.stringify(socialSnapshot(tx, hasSpacetimeAuthAccount(tx)));
}));
/** Recently active players' names, for player search; built at most once every ten minutes for everyone. */
export const getPlayerDirectory = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  requireSocialPlayer(tx); return playerDirectoryJson(tx, isVirtualPlayer);
}));
export const friendAction = spacetimedb.reducer({ action: t.string(), target: t.string() }, (ctx, { action, target }) => {
  requireSocialPlayer(ctx); socialService.friendAction(ctx, action, target);
});
export const guildInviteAction = spacetimedb.reducer({ action: t.string(), target: t.string(), invitationId: t.u64() }, (ctx, { action, target, invitationId }) => {
  requireGuildPlayer(ctx); socialService.guildInviteAction(ctx, action, target, invitationId);
});
export const sendSocialMessage = spacetimedb.reducer({ channel: t.string(), target: t.string(), message: t.string(), replyToMessageId: t.u64() }, (ctx, { channel, target, message, replyToMessageId }) => {
  requireSocialPlayer(ctx); requireChatAge(ctx); socialService.sendMessage(ctx, channel, target, message, replyToMessageId);
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
  if ((isDeveloperIdentity(ctx.sender) || isChatModerator(ctx, ctx.sender)) && hasSpacetimeAuthAccount(ctx)) {
    moderateReportedMessage(ctx, "social", messageId, reason, "social_report", key, isDeveloperIdentity(ctx.sender) ? "developer" : "moderator");
    ctx.db.playerReport.id.update({ ...report, status: "resolved" });
  }
});


// Checkout remains off until a dedicated server verifier is configured. Players
// can reserve an allowance, but only that verifier can attest a paid receipt.
export const configureGemCommerce = spacetimedb.reducer(
  { verifier: t.identity(), enabled: t.bool() },
  (ctx, { verifier, enabled }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "configure_gem_commerce", "Database owner required.");
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
  if (!config || !config.verifier.equals(ctx.sender)) throw new SenderError("Purchase verifier required.");
}

export const reserveGemPurchase = spacetimedb.reducer(
  { packId: t.string(), reservationId: t.string() },
  (ctx, { packId, reservationId }) => {
    if (!ctx.db.gemCommerceConfig.id.find(0)?.enabled) throw new SenderError("Purchases are not available yet.");
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
  (ctx, event) => ingestGemStoreEventFor(ctx, event),
);

function ingestGemStoreEventFor(ctx: ModuleReducerCtx, event: {
  eventId: string;
  eventHash: string;
  kind: string;
  owner: string;
  packId: string;
  reference: string;
  purchasedAtMs: number;
}) {
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
}

export const devGemPurchaseReview = spacetimedb.view(
  { name: "dev_gem_purchase_review", public: true }, t.array(gemPurchaseTables.gemStoreReceipt.rowType),
  (ctx) => isDeveloperIdentity(ctx.sender) || isDatabaseOwnerIdentity(ctx.sender)
    ? [...ctx.db.gemStoreReceipt.iter()].filter(row => row.status === "review" || row.status === "refund_review") : [],
);

export type GameViewContext = ViewCtx<InferSchema<typeof spacetimedb>>;
export type GameReducerContext = ReducerCtx<InferSchema<typeof spacetimedb>>;

export const myEndlessTravelAccess = spacetimedb.view(
  { public: true }, t.option(proceduralMapTables.endlessTravelAccess.rowType),
  (ctx) => hasEndlessTravelAccess(ctx, ctx.sender) ? { identity: ctx.sender } : undefined,
);

export const devSetEndlessTravelAccess = spacetimedb.reducer(
  { identity: t.identity(), enabled: t.bool() }, (ctx, { identity, enabled }) => {
    if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_set_endless_travel_access");
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

export const getAnalyticsDashboard = spacetimedb.procedure(
  { fromDayKey: t.string(), toDayKey: t.string() },
  t.string(),
  (ctx, { fromDayKey, toDayKey }) => ctx.withTx(tx => {
    requireDeveloper(tx, "get_analytics_dashboard");
    return readAnalyticsDashboard(tx, fromDayKey, toDayKey);
  }),
);

export const devTeleportToPlayer = spacetimedb.procedure({ identity: t.identity(), mapId: t.string() }, t.string(), (ctx, args) => ctx.withTx(tx => {
  requireDeveloper(tx, "dev_teleport_to_player");
  const current = requireControllingPlayer(tx);
  if (current.hp <= 0 || activeDuelFor(tx, tx.sender)) throw new SenderError("Teleport unavailable while dead or dueling.");
  if (activeDuelFor(tx, args.identity)) throw new SenderError("Player is in a duel. Try again afterward.");
  const target = readDeveloperTravelTarget(tx, args.identity, args.mapId);
  const moved = transitionPlayerMap(tx, current, target.mapId, target, target.facing);
  persistWorldLocation(tx, moved);
  return JSON.stringify({ mapId: moved.mapId, x: moved.x, y: moved.y, facing: moved.facing });
}));

export const devTeleportEndless = spacetimedb.reducer(
  { number: t.f64() }, (ctx, { number }) => {
    const player = requireControllingPlayer(ctx);
    if (!hasEndlessTravelAccess(ctx, ctx.sender)) denyPrivilegedAccess(ctx, "dev_teleport_endless", "Developer travel access required.");
    if (isDeveloperIdentity(ctx.sender)) requireDeveloper(ctx, "dev_teleport_endless");
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

const rankedLeaderboardPlayer = t.object("RankedLeaderboardPlayer", { rank: t.u32(), entry: leaderboardEntry.rowType });
export const getLeaderboardWindow = spacetimedb.procedure(
  { stat: t.string() }, t.array(rankedLeaderboardPlayer),
  (ctx, { stat }) => ctx.withTx(tx => readLeaderboardWindow(tx, stat)),
);
// The board's ranks with each account's start, and which prestige level Rivals is.
export const getLeaderboardRanks = spacetimedb.procedure(
  { board: t.string(), startRank: t.u32(), count: t.u32() },
  t.object("LeaderboardRanks", { entries: t.array(t.object("LeaderboardRank", { rank: t.u32(), entry: leaderboardEntry.rowType, joinedAtMicros: t.u64() })),
    startRank: t.u32(), endRank: t.u32(), localRank: t.u32(), total: t.u32(), prestige: t.u32() }),
  (ctx, { board, startRank, count }) => ctx.withTx(tx => readLeaderboardRanks(tx, board, startRank, count)),
);
export const findLeaderboardPlayer = spacetimedb.procedure({ stat: t.string(), prestige: t.i32(), identity: t.identity() },
  t.object("LeaderboardSpot", { rank: t.u32(), prestige: t.i32() }), (ctx, { stat, prestige, identity }) => ctx.withTx(tx => findLeaderboardSpot(tx, stat, prestige, identity)));

export const latestChatMessages = spacetimedb.anonymousView(
  { public: true }, t.array(chatMessage.rowType),
  ctx => readPublicChatPage(ctx).messages,
);

// Private evidence is fetched only on demand, never through a public view.
export const getModerationHistory = spacetimedb.procedure({ beforeId: t.u64() }, t.string(),
  (ctx, { beforeId }) => ctx.withTx(tx => {
    if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_moderation_history");
    return JSON.stringify(readModerationHistory(tx, beforeId));
  }),
);
// Developer triage: every open report and bug, then the recent reviewed ones, and
// the decisions that close them. Bodies live in dev-review.ts.
export const getDevReviewQueue = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_dev_review_queue");
  return JSON.stringify(readDevReviewQueue(tx));
}));
export const getPlayerModerationHistory = spacetimedb.procedure({ identity: t.identity() }, t.string(), (ctx, { identity }) => ctx.withTx(tx => {
  if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_player_moderation_history");
  return JSON.stringify(readPlayerModerationHistory(tx, identity.toHexString()));
}));
// The caller's email already has a played character on another login (account-email.ts).
export const getOtherCharacterForLogin = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => otherCharacterForLogin(tx)));
export const devFindPlayers = spacetimedb.procedure({ query: t.string() }, t.string(), (ctx, { query }) => ctx.withTx(tx => {
  if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "dev_find_players");
  return JSON.stringify(findDevPlayers(tx, query));
}));
export const devReviewReport = spacetimedb.reducer({ reportKey: t.string(), decision: t.string(), note: t.string(), mailReporter: t.bool() }, (ctx, args) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_review_report");
  reviewReport(ctx, args);
});
export const devReviewBug = spacetimedb.reducer({ id: t.u64(), decision: t.string(), note: t.string(), mailReporter: t.bool() }, (ctx, args) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_review_bug");
  reviewBug(ctx, args);
});
export const devLiftPlayerSuspension = spacetimedb.reducer({ identity: t.identity(), reason: t.string() }, (ctx, { identity, reason }) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_lift_player_suspension");
  liftPlayerSuspension(ctx, identity, reason);
});
// The rest of the console: muted and banned lists, headline counts, the player
// card, the filtered log, warnings and name resets. Bodies live in dev-console.ts.
export const getDevConsole = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => {
  if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_dev_console");
  return JSON.stringify(readDevConsole(tx));
}));
export const getDevPlayerCard = spacetimedb.procedure({ identity: t.identity() }, t.string(), (ctx, { identity }) => ctx.withTx(tx => {
  if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_dev_player_card");
  return JSON.stringify(readDevPlayerCard(tx, identity));
}));
export const getModerationLog = spacetimedb.procedure({ text: t.string(), category: t.string(), fromMs: t.f64(), toMs: t.f64(), beforeId: t.u64() }, t.string(),
  (ctx, { beforeId, ...query }) => ctx.withTx(tx => {
    if (!isDatabaseOwnerIdentity(tx.sender)) requireDeveloperSession(tx, "get_moderation_log");
    return JSON.stringify(searchModerationHistory(tx, query, beforeId));
  }));
export const devWarnPlayer = spacetimedb.reducer({ identity: t.identity(), message: t.string() }, (ctx, { identity, message }) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_warn_player");
  warnPlayer(ctx, identity, message);
});
export const devResetDisplayName = spacetimedb.reducer({ identity: t.identity(), expectedDisplayName: t.string(), reason: t.string() }, (ctx, args) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_reset_display_name");
  const profile = ctx.db.playerProfile.identity.find(args.identity);
  if (!profile || profile.displayName !== args.expectedDisplayName) throw new SenderError("Player name changed; reset refused.");
  if (isDeveloperIdentity(args.identity) || isDatabaseOwnerIdentity(args.identity)) throw new SenderError("Protected identity cannot be renamed.");
  repairModeratedDisplayName(ctx, profile, isDeveloperIdentity(ctx.sender) ? "developer" : "owner", args.reason.trim().slice(0, 300) || "Reset by the developer");
  refreshLeaderboard(ctx);
});

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

export const configurePatreon = spacetimedb.reducer({ clientId: t.string(), clientSecret: t.string(), campaignId: t.string(), silverTierId: t.string(), goldTierId: t.string(), redirectUri: t.string(), diamondTierId: t.string() }, (ctx, config) => {
  if (!isDatabaseOwnerIdentity(ctx.sender)) denyPrivilegedAccess(ctx, "configure_patreon", "Database owner required.");
  if (!config.clientId || !config.clientSecret || !/^\d+$/.test(config.campaignId) || !/^\d+$/.test(config.silverTierId) || !/^\d+$/.test(config.goldTierId) || config.silverTierId === config.goldTierId) throw new SenderError("Invalid Patreon configuration.");
  // Diamond is optional so the campaign can run without it, but an id that is
  // given must be real and must not double as another tier.
  if (config.diamondTierId && (!/^\d+$/.test(config.diamondTierId) || config.diamondTierId === config.goldTierId || config.diamondTierId === config.silverTierId))
    throw new SenderError("Invalid Patreon configuration.");
  if (!validPatreonRedirect(config.redirectUri)) throw new SenderError("Use the database's Patreon callback URL.");
  const row = { id: 0, ...config };
  if (ctx.db.patreonConfig.id.find(0)) ctx.db.patreonConfig.id.update(row); else ctx.db.patreonConfig.insert(row);
});
export const beginPatreonLink = spacetimedb.procedure({ state: t.string() }, t.string(), (ctx, { state }) => ctx.withTx(tx => {
  if (!hasSpacetimeAuthAccount(tx)) throw new SenderError("Sign in to link Patreon.");
  return beginSupporterLink(tx, state);
}));
export const refreshPatreonMembership = spacetimedb.procedure({}, t.string(), ctx => refreshPatreon(ctx));
export const sweepPatreonMemberships = spacetimedb.procedure(
  { arg: patreonSweepSchedule.rowType }, t.unit(), (ctx, { arg }) => {
    // Only the scheduler may invoke this: a client cannot make the server spend
    // Patreon API calls on demand.
    if (!sameIdentity(ctx.sender, ctx.databaseIdentity)) throw new SenderError("Scheduler required");
    void arg;
    sweepPatreonLinks(ctx);
    return {};
  },
);
export const getPatreonStatus = spacetimedb.procedure({}, t.string(), ctx => ctx.withTx(tx => JSON.stringify(patreonStatus(tx, ctx.sender))));
// One shared materialization, refreshed by membership/profile changes rather
// than one procedure call per sign-in. Never expose Patreon IDs or credentials.
export const patreonTickerSupporters = spacetimedb.anonymousView(
  { name: "patreon_ticker_supporters", public: true },
  t.array(t.row("PatreonTickerSupporter", { identity: t.identity().primaryKey(), name: t.string(), validUntilMs: t.f64() })),
  ctx => [...ctx.db.patreonLink.iter()].flatMap(link => {
    if (!link.userId || link.tier === "none" || !isAvatarFrame(link.tier)) return [];
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
export const startServerBoost = spacetimedb.reducer(ctx => triggerServerBoost(ctx));
export const { myServerBoostTrigger } = registerServerBoost(spacetimedb);
export const requestPatreonHelp = spacetimedb.reducer({ email: t.string() }, (ctx, { email }) => {
  requireControllingPlayer(ctx);
  requestPatreonSupport(ctx, email);
});
export const patreonOauthCallback = spacetimedb.httpHandler((ctx, request) => patreonCallback(ctx, request.uri));
export const patreonRoutes = spacetimedb.httpRouter(new Router().get("/patreon/callback", patreonOauthCallback));
