import { CHALLENGE_ABSOLUTE_MIN_INTERVAL } from "../../shared/prestige-challenge";
import { mergeEquipmentLocks, removeEquipmentLocks } from "./equipment-locks";
// Guest-to-account claiming and identity removal: the claimGuestAccount body
// that folds a guest save into its signed-in identity, the helpers that erase
// a player or simulated client row by row, and the account-link and
// Spacetime-auth checks around them. The beginAccountLink, claimGuestAccount
// and deletion reducer declarations, the accountLink table and the schema
// registration stay in index.ts; this module only owns the bodies they call.
// Helpers that still live in index.ts arrive through createAccountLifecycle's
// deps so the moved code reads exactly as it did.
import { SenderError } from "spacetimedb/server";
import { removePlayerJoinDate, syncPlayerJoinDate } from "./player-join-date";
import { movePausedResearch, removePausedResearch } from "./research-pause";
import { removeStreamCursors } from "./regular-enemy-loot";
import { DEFAULT_ATTACK_INTERVAL } from "../../shared/rules";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { isTownMap } from "../../shared/town";
import { cosmeticUnlocks } from "../../shared/cosmetic-conversion";
import { PLAYER_GENDER_UNSET } from "../../shared/player-gender";
import { PLAYER_SKIN_TONES } from "../../shared/player-skin-tones";
import { isPublicDisplayNameAllowed } from "./chat-moderation";
import { mergeAccountReactions, removeMessageReactions } from "./chat-reactions";
import { unmarkChatAnnouncement } from "./chat-announcement";
import { mergeItemGifts, removeItemGifts } from "./item-gifts";
import { mergeBowSkills, removeBowSkills } from "./bow-skills";
import { mergeSwordSkills, removeSwordSkills } from "./sword-skills";
import { mergeStaffSkills, removeStaffSkills } from "./staff-skills";
import { mergeEquipmentCopies, mergeItemCollection } from "./equipment-copies";
import { mergeRefineData } from "./item-refine";
import { mergeCosmeticRefines } from "./cosmetic-refine";
import { mergeCardData } from "./gear-cards";
import { mergeCardShopPurchases } from "./card-shop";
import { mergeMiningData } from "./mining";
import { mergeWoodcuttingData } from "./woodcutting";
import { mergeWeaponMastery } from "./weapon-mastery";
import { mergeGold } from "./gold";
import { mergeStarterWeapon } from "./starter-chest";
import { mergeCraftSkills } from "./crafting";
import { mergeTools } from "./tools";
import { mergeMailboxReceipts, removeMailboxReceipts } from "./mailbox";
import { mergeOnboarding } from "./onboarding";
import { mergeAudioSettings, removeAudioSettings } from "./audio-settings";
import { mergeAdGemReward, removeAdGemReward } from "./ad-gem-reward";
import { mergeDailyGemBonus } from "./gem-wallet";
import { mergeChatMute, removeChatMute } from "./chat-mute";
import { mergeLootSettings, removeLootSettings } from "./loot-settings";
import { mergeProfileSnapshot, removeProfileSnapshot } from "./profile-snapshot";
import { mergeSoulDimensionRows, removeSoulDimensionRows } from "./soul-dimension";
import { mergeIgnoredDrops, removeIgnoredDrops } from "./ignored-drops";
import { mergeOfflinePreference } from "./offline-preference";
import { mergeLinkedPrestige } from "./prestige-transfer";
import { moveLeaderboardStanding } from "./leaderboard-pages";
import { unlinkPatreon } from "./patreon";
import { clearProceduralProgress, mergeProceduralProgress } from "./procedural-maps";
import { deleteSnapshotRow, insertSnapshotRow, updateSnapshotRow } from "./snapshot-row-writes";
import { mergeSocialAccount, removeSocialAccount } from "./social-service";
import { readPlayerProgress, deleteReplayWide } from "./wide-stats";
import { eraseIdentityRows } from "./account-erasure";
import { deleteLuckResearch, luckRanksFor, writeLuckRanks } from "./luck-research";
import { deleteRankTableResearch, rankTableRanksFor, writeRankTableRanks } from "./research-rank";
import { carryNameColor } from "./profile-look";
import { hasSpacetimeAuthAccount } from "./session-guards";

export const ACCOUNT_LINK_LIFETIME_MICROS = 600_000_000n;

export function dailyGemBonusClaimReference(identity: any, dayKey: string, cycle: bigint) {
  return `daily-claim:${identity.toHexString()}:${dayKey}:${cycle}`;
}

export function clearExpiredAccountLinks(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredCodes: string[] = [];
  for (const link of ctx.db.accountLink.iter() as Iterable<any>) {
    if (now - link.createdAt.microsSinceUnixEpoch >= ACCOUNT_LINK_LIFETIME_MICROS) {
      expiredCodes.push(link.code);
    }
  }
  for (const code of expiredCodes) ctx.db.accountLink.code.delete(code);
}

export type AccountLifecycleDeps = {
  LEGACY_CLIENT_ERRORS: { existingAccountProgress: string };
  UPGRADE_BENCH_SLOT_ONE: number;
  UPGRADE_BENCH_SLOT_TWO: number;
  UPGRADE_BENCH_SLOT_THREE: number;
  guildService: {
    removeAccount: (ctx: any, identity: any) => void;
    mergeGuest: (ctx: any, guest: any, accountIdentity: any) => void;
  };
  activeDuelFor: (ctx: any, identity: any) => any;
  activeItemUpgradeForSlot: (ctx: any, identity: any, slot: number) => any;
  mergeOldGearPayout: (ctx: any, guest: any, account: any) => void;
  payOutOldGear: (ctx: any, identity: any) => { gold: number; changed: boolean };
  adjustVirtualPlayerCount: (ctx: any, owner: any, change: number) => void;
  applyGemBalanceChange: (ctx: any, input: any) => any;
  earlierTimestamp: (first: any, second: any) => any;
  effectiveMovementSpeedForProgress: (ctx: any, progress: any, research?: any) => number;
  ensureCutsceneHistory: (ctx: any, identity: any) => any;
  ensureGemWallet: (ctx: any, identity: any) => any;
  ensureItemUpgradeCompletionSchedule: (ctx: any, active: any, slot: number) => void;
  ensureResearchCompletionSchedule: (ctx: any, active: any) => void;
  equipmentPresentationForProgress: (ctx: any, progress: any) => any;
  finishDuel: (ctx: any, current: any) => void;
  generatedDisplayName: (identity: any) => string;
  hasFreshProgress: (progress: any) => boolean;
  insertActiveItemUpgrade: (ctx: any, slot: number, active: any) => void;
  isGeneratedDisplayName: (displayName: string) => boolean;
  slotUpgradeKey: (identity: any, slot: string) => string;
  leaderboardAppearanceForProgress: (ctx: any, progress: any, profile: any) => any;
  persistWorldLocation: (ctx: any, activePlayer: any) => void;
  playerWithMotion: (ctx: any, activePlayer: any) => any;
  powerFieldsForProgress: (ctx: any, progress: any) => { power: number; powerLevel: number };
  refreshLeaderboard: (ctx: any) => void;
  removeItemUpgradeCompletionSchedules: (ctx: any, identity: any, slot?: number) => void;
  removePlayerItemUpgradeData: (ctx: any, identity: any, removeDrops?: boolean) => void;
  removePlayerRealtimeState: (ctx: any, identity: any) => void;
  removePlayerSafetyData: (ctx: any, identity: any) => void;
  removeResearchCompletionSchedules: (ctx: any, identity: any) => void;
  repairModeratedDisplayName: (ctx: any, profile: any) => any;
  requireSupportedSessionProtocol: (ctx: any) => void;
  sameIdentity: (a: any, b: any) => boolean;
  syncDisplayNamePresentation: (ctx: any, identity: any, displayName: string) => void;
  syncPlayerMotionIdentity: (ctx: any, activePlayer: any) => void;
  transferPlayerBlocks: (ctx: any, guest: any, account: any) => void;
  recordAnalyticsConversion: (ctx: any, guest: any, account: any) => void;
};

/**
 * Every plain per-player row both removals clear, through the erasure
 * lookups: the one-row-per-player tables, each shared boss's contribution and
 * attack window, and the state added since (prestige, quests, aggro, offline
 * progress, rebase backups, Gem kill credit and the rest). Rows that need more
 * than a delete (snapshot rows, chat with its reactions, duels with their
 * replays) stay written out in the functions below. Deliberately absent: rows the game
 * owns rather than the player (a guild, the store config, balance edits,
 * Patreon receipts), Gem purchase records, and analytics history.
 * player-removal.test.ts lists exactly what each removal leaves.
 */
const PLAYER_STATE_TABLES: ReadonlySet<string> = new Set([
  // One row per player, cleared the same way by both removals.
  "activeResearch", "balanceApologyNotice", "chatCooldown",
  "chatReactionUnlock", "defeatSessionRestriction", "duelRequestCooldown", "leaderboardEntry", "playerAccessAudit",
  "playerBalanceVersion", "playerController", "playerCutsceneHistory", "playerGemWallet", "playerInventoryCapacity",
  "playerDefeatClock", "playerMapDeparture", "playerLastLocation", "playerLegalConsent", "playerLifetime", "playerMapBalance", "playerMapMarker",
  "playerMultiplayerPreference", "playerNameCooldown", "playerOnboarding",
  "playerUpgradeBench", "playerUpgradeBenchThirdSlot",
  "accountDeletionRequest", "accountEmail", "aggroChallengeRun", "chatMessageReportRateLimit", "chatModerator",
  "connectionDiagnostic", "connectionDiagnosticRate", "dailyGemBonus", "developerPresencePreference",
  "endlessTravelAccess", "exchangeCollect", "exchangeListing", "exchangeOffer",
  "gemKillDaily", "gemKillProgress", "gemTransaction", "guildMemberQuestWeek", "guildRejoin",
  "homeReturnLocation", "leaderboardDirty", "leaderboardPosition", "leaderboardPrestigePosition", "leaderboardStanding", "loginMove",
  "offlineProgress", "offlineGatherChoice", "playerRunTiming", "playerRunHistory", "playerNockedArrow", "playerGatherPicks", "patreonPreview", "serverBoostTrigger", "playerAggroChallenge", "playerAggroChallengeParked", "playerBonusToggle", "playerNameColor",
  "playerMining", "playerMinedNode", "playerMiningLevel", "playerWoodcutting", "playerChoppedTree", "playerWoodcuttingLevel", "playerLuckResearch", "playerResearchRank", "playerCardShopPurchase", "playerWeaponMastery", "playerMasteryLevel", "playerGold", "oldGearPayout", "playerStarterWeapon", "playerCraftSkill", "playerCraftLevel", "playerTool",
  "playerCosmeticRefine", "playerClientHost",
  "playerDailyQuest", "playerEndlessRebaseBackup", "playerFreeRespec",
  "playerOfflinePreference", "playerPrestige", "playerPrestigeChallenge",
  "playerPrestigeChallengeParked", "playerPrestigeExpansionPerk", "playerPrestigeCardPerk", "playerPrestigePerk", "playerQuestWeekTotal",
  "presenceChatCooldown", "prestigeChallengeBackup", "prestigeChallengeRun",
  "proceduralContribution", "proceduralInstanceContribution", "proceduralProgress",
  "releaseAcknowledgement", "soloQuestWeek", "startupTelemetryRateLimit", "virtualPlayerLoad", "virtualPlayerRun",
]);
const removePlayerStateRows = (ctx: any, identity: any) => eraseIdentityRows(ctx, [identity], Infinity, PLAYER_STATE_TABLES);

export function createAccountLifecycle(deps: AccountLifecycleDeps) {
  const {
    LEGACY_CLIENT_ERRORS, UPGRADE_BENCH_SLOT_ONE, UPGRADE_BENCH_SLOT_TWO, UPGRADE_BENCH_SLOT_THREE, guildService,
    activeDuelFor, activeItemUpgradeForSlot, mergeOldGearPayout, payOutOldGear, adjustVirtualPlayerCount, applyGemBalanceChange,
    earlierTimestamp, effectiveMovementSpeedForProgress, ensureCutsceneHistory, ensureGemWallet,
    ensureItemUpgradeCompletionSchedule, ensureResearchCompletionSchedule,
    equipmentPresentationForProgress, finishDuel, generatedDisplayName, hasFreshProgress,
    insertActiveItemUpgrade, isGeneratedDisplayName, slotUpgradeKey,
    leaderboardAppearanceForProgress, persistWorldLocation, playerWithMotion,
    powerFieldsForProgress, refreshLeaderboard,
    removeItemUpgradeCompletionSchedules, removePlayerItemUpgradeData, removePlayerRealtimeState,
    removePlayerSafetyData, removeResearchCompletionSchedules, repairModeratedDisplayName,
    requireSupportedSessionProtocol, sameIdentity, syncDisplayNamePresentation,
    syncPlayerMotionIdentity, transferPlayerBlocks, recordAnalyticsConversion,
  } = deps;

  function syncSenderAccountStatus(ctx: any) {
    const current = ctx.db.playerAccountStatus.identity.find(ctx.sender);
    const next = { identity: ctx.sender, isGuest: !hasSpacetimeAuthAccount(ctx) };
    if (!current) insertSnapshotRow(ctx, "playerAccountStatus", next);
    else if (current.isGuest !== next.isGuest) updateSnapshotRow(ctx, "playerAccountStatus", next);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
  }

  function mergeGuestGemWallet(ctx: any, guestIdentity: any, accountIdentity: any, accountLinkCode: string) {
    const accountWallet = ensureGemWallet(ctx, accountIdentity);
    const guestWallet = ctx.db.playerGemWallet.identity.find(guestIdentity);
    if (!guestWallet) return accountWallet;
    const guestBalance = BigInt(guestWallet.balance);
    if (guestBalance > 0n) {
      const reference = `account-link:${accountLinkCode}`;
      applyGemBalanceChange(ctx, {
        identity: guestIdentity,
        delta: -guestBalance,
        kind: "account_transfer_out",
        note: "Guest balance transferred to signed-in account.",
        externalReference: `${reference}:out`,
      });
      applyGemBalanceChange(ctx, {
        identity: accountIdentity,
        delta: guestBalance,
        kind: "account_transfer_in",
        note: "Guest balance transferred to signed-in account.",
        externalReference: `${reference}:in`,
      });
    }
    ctx.db.playerGemWallet.identity.delete(guestIdentity);
    return ctx.db.playerGemWallet.identity.find(accountIdentity);
  }

  function mergeBalanceApologyNotice(ctx: any, guestIdentity: any, accountIdentity: any) {
    const guestNotice = ctx.db.balanceApologyNotice.identity.find(guestIdentity);
    if (!guestNotice) return;
    const accountNotice = ctx.db.balanceApologyNotice.identity.find(accountIdentity);
    const transferred = {
      identity: accountIdentity,
      amount: guestNotice.amount + (accountNotice?.amount ?? 0n),
      createdAt: accountNotice ? earlierTimestamp(accountNotice.createdAt, guestNotice.createdAt) : guestNotice.createdAt,
    };
    if (accountNotice) ctx.db.balanceApologyNotice.identity.update(transferred);
    else ctx.db.balanceApologyNotice.insert(transferred);
    ctx.db.balanceApologyNotice.identity.delete(guestIdentity);
  }

  function claimGuestAccountFor(ctx: any, code: string) {
    requireSupportedSessionProtocol(ctx);
    if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in required.");
    clearExpiredAccountLinks(ctx);

    const link = ctx.db.accountLink.code.find(code);
    if (!link) throw new SenderError("Account link expired. Sign in again.");
    if (sameIdentity(link.guest, ctx.sender)) throw new SenderError("Invalid account link.");
    if (activeDuelFor(ctx, link.guest) || activeDuelFor(ctx, ctx.sender)) {
      throw new SenderError("Finish duel before linking this account.");
    }

    const accountProgress = readPlayerProgress(ctx, ctx.sender);
    if (accountProgress && !hasFreshProgress(accountProgress)) {
      throw new SenderError(LEGACY_CLIENT_ERRORS.existingAccountProgress);
    }

    const guestProgress = readPlayerProgress(ctx, link.guest);
    if (!guestProgress) throw new SenderError("Guest save unavailable. Return to guest mode and try again.");
    const guestCutscenes = ensureCutsceneHistory(ctx, link.guest);
    const accountCutscenes = ensureCutsceneHistory(ctx, ctx.sender);
    ctx.db.playerCutsceneHistory.identity.update({
      ...accountCutscenes,
      seenMask: accountCutscenes.seenMask | guestCutscenes.seenMask,
    });
    mergeGuestGemWallet(ctx, link.guest, ctx.sender, link.code);
    mergeAdGemReward(ctx, link.guest, ctx.sender);
    mergeDailyGemBonus(ctx, link.guest, ctx.sender);
    mergeChatMute(ctx, link.guest, ctx.sender);
    mergeBalanceApologyNotice(ctx, link.guest, ctx.sender);
    mergeItemGifts(ctx, link.guest, ctx.sender);
    mergeBowSkills(ctx, link.guest, ctx.sender);
    mergeSwordSkills(ctx, link.guest, ctx.sender);
    mergeStaffSkills(ctx, link.guest, ctx.sender);
    mergeEquipmentCopies(ctx, link.guest, ctx.sender);
    mergeItemCollection(ctx, link.guest, ctx.sender);
    mergeRefineData(ctx, link.guest, ctx.sender);
    mergeCosmeticRefines(ctx, link.guest, ctx.sender);
    mergeCardData(ctx, link.guest, ctx.sender);
    mergeCardShopPurchases(ctx, link.guest, ctx.sender);
    mergeMiningData(ctx, link.guest, ctx.sender);
    mergeWoodcuttingData(ctx, link.guest, ctx.sender);
    mergeWeaponMastery(ctx, link.guest, ctx.sender);
    mergeGold(ctx, link.guest, ctx.sender);
    mergeOldGearPayout(ctx, link.guest, ctx.sender);
    mergeStarterWeapon(ctx, link.guest, ctx.sender);
    mergeCraftSkills(ctx, link.guest, ctx.sender);
    mergeTools(ctx, link.guest, ctx.sender);
    mergeMailboxReceipts(ctx, link.guest, ctx.sender);
    mergeOnboarding(ctx, link.guest, ctx.sender);
    mergeAudioSettings(ctx, link.guest, ctx.sender);
    mergeLootSettings(ctx, link.guest, ctx.sender);
    mergeProfileSnapshot(ctx, link.guest, ctx.sender);
    mergeSoulDimensionRows(ctx, link.guest, ctx.sender);
    mergeEquipmentLocks(ctx, link.guest, ctx.sender);
    mergeIgnoredDrops(ctx, link.guest, ctx.sender);
    mergeOfflinePreference(ctx, link.guest, ctx.sender);
    // Every save is at the current balance version (player_balance_version), so the guest's is too.
    const guestAttackRate = guestProgress.attackRate;
    let nextProgress = {
      ...guestProgress,
      identity: ctx.sender,
      attackRate: Math.max(CHALLENGE_ABSOLUTE_MIN_INTERVAL, Math.min(DEFAULT_ATTACK_INTERVAL, guestAttackRate)),
      cosmeticItemsJson: JSON.stringify([...new Set([
        ...cosmeticUnlocks(accountProgress?.cosmeticItemsJson),
        ...cosmeticUnlocks(guestProgress.cosmeticItemsJson),
      ])]),
    };
    if (accountProgress) updateSnapshotRow(ctx, "playerProgress", nextProgress);
    else insertSnapshotRow(ctx, "playerProgress", nextProgress);

    mergeLinkedPrestige(ctx, link.guest, ctx.sender);
    mergeProceduralProgress(ctx, link.guest);
    const guestLocation = ctx.db.playerLastLocation.identity.find(link.guest);
    const accountLocation = ctx.db.playerLastLocation.identity.find(ctx.sender);
    if (guestLocation) {
      const nextLocation = { ...guestLocation, identity: ctx.sender };
      if (accountLocation) ctx.db.playerLastLocation.identity.update(nextLocation);
      else ctx.db.playerLastLocation.insert(nextLocation);
    }

    const guestHomeReturn = ctx.db.homeReturnLocation.identity.find(link.guest);
    if (guestHomeReturn) {
      const nextHomeReturn = { ...guestHomeReturn, identity: ctx.sender };
      if (ctx.db.homeReturnLocation.identity.find(ctx.sender)) ctx.db.homeReturnLocation.identity.update(nextHomeReturn);
      else ctx.db.homeReturnLocation.insert(nextHomeReturn);
      ctx.db.homeReturnLocation.identity.delete(link.guest);
    } else if ((guestLocation?.mapId === HOME_EXTERIOR_MAP_ID || isTownMap(guestLocation?.mapId)) && ctx.db.homeReturnLocation.identity.find(ctx.sender)) {
      // Never borrow a different save's return point when importing a save at the Town (or Home).
      ctx.db.homeReturnLocation.identity.delete(ctx.sender);
    }

    const guestResearch = ctx.db.playerResearch.identity.find(link.guest);
    const accountResearch = ctx.db.playerResearch.identity.find(ctx.sender);
    if (guestResearch) {
      const nextResearch = { ...guestResearch, identity: ctx.sender, frontierMastery: 0 };
      if (accountResearch) updateSnapshotRow(ctx, "playerResearch", nextResearch);
      else insertSnapshotRow(ctx, "playerResearch", nextResearch);
      // The guest's luck and rank-table ranks come with the rest of its research.
      writeLuckRanks(ctx, ctx.sender, luckRanksFor(ctx, link.guest));
      writeRankTableRanks(ctx, ctx.sender, rankTableRanksFor(ctx, link.guest));
    }
    const guestReactionUnlock = ctx.db.chatReactionUnlock.identity.find(link.guest);
    if (guestReactionUnlock) {
      const accountReactionUnlock = ctx.db.chatReactionUnlock.identity.find(ctx.sender);
      const next = { identity: ctx.sender, gemHeart: Boolean(guestReactionUnlock.gemHeart || accountReactionUnlock?.gemHeart) };
      if (accountReactionUnlock) ctx.db.chatReactionUnlock.identity.update(next);
      else ctx.db.chatReactionUnlock.insert(next);
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
    movePausedResearch(ctx, link.guest, ctx.sender);

    for (const guestUpgrade of [...ctx.db.playerItemUpgrade.byIdentity.filter(link.guest) as Iterable<any>]) {
      // Rows are keyed by slot, so this merges a guest's tiers into
      // the account's, keeping whichever went further on each track.
      const key = slotUpgradeKey(ctx.sender, guestUpgrade.itemId);
      const accountUpgrade = ctx.db.playerItemUpgrade.key.find(key);
      const transferred = {
        key,
        identity: ctx.sender,
        itemId: guestUpgrade.itemId,
        level: Math.max(accountUpgrade?.level ?? 0, guestUpgrade.level),
      };
      if (accountUpgrade) updateSnapshotRow(ctx, "playerItemUpgrade", transferred);
      else insertSnapshotRow(ctx, "playerItemUpgrade", transferred);
    }
    for (const slot of [UPGRADE_BENCH_SLOT_ONE, UPGRADE_BENCH_SLOT_TWO, UPGRADE_BENCH_SLOT_THREE]) {
      const guestActiveItemUpgrade = activeItemUpgradeForSlot(ctx, link.guest, slot);
      const accountActiveItemUpgrade = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
      if (guestActiveItemUpgrade && !accountActiveItemUpgrade) {
        const transferred = { ...guestActiveItemUpgrade, identity: ctx.sender };
        insertActiveItemUpgrade(ctx, slot, transferred);
        removeItemUpgradeCompletionSchedules(ctx, link.guest, slot);
        ensureItemUpgradeCompletionSchedule(ctx, transferred, slot);
      } else if (guestActiveItemUpgrade) {
        removeItemUpgradeCompletionSchedules(ctx, link.guest, slot);
      }
    }

    // A guest save still holding old map gear is paid out for it as migration 62 paid everyone.
    if (payOutOldGear(ctx, ctx.sender).changed) nextProgress = readPlayerProgress(ctx, ctx.sender) ?? nextProgress;

    const guestUpgradeBench = ctx.db.playerUpgradeBench.identity.find(link.guest);
    const accountUpgradeBench = ctx.db.playerUpgradeBench.identity.find(ctx.sender);
    const guestThirdSlot = ctx.db.playerUpgradeBenchThirdSlot.identity.find(link.guest);
    const accountThirdSlot = ctx.db.playerUpgradeBenchThirdSlot.identity.find(ctx.sender);
    if ((guestUpgradeBench?.secondSlotUnlocked || guestThirdSlot) && !accountUpgradeBench?.secondSlotUnlocked) {
      const transferred = {
        identity: ctx.sender,
        secondSlotUnlocked: true,
        updatedAt: ctx.timestamp,
      };
      if (accountUpgradeBench) ctx.db.playerUpgradeBench.identity.update(transferred);
      else ctx.db.playerUpgradeBench.insert(transferred);
    }
    if (guestThirdSlot && !accountThirdSlot) ctx.db.playerUpgradeBenchThirdSlot.insert({ identity: ctx.sender, updatedAt: ctx.timestamp });
    const guestInventoryCapacity = ctx.db.playerInventoryCapacity.identity.find(link.guest);
    const accountInventoryCapacity = ctx.db.playerInventoryCapacity.identity.find(ctx.sender);
    if (guestInventoryCapacity) {
      const transferred = {
        identity: ctx.sender,
        slotsUnlocked: Math.max(accountInventoryCapacity?.slotsUnlocked ?? 0, guestInventoryCapacity.slotsUnlocked),
        updatedAt: ctx.timestamp,
      };
      if (accountInventoryCapacity) ctx.db.playerInventoryCapacity.identity.update(transferred);
      else ctx.db.playerInventoryCapacity.insert(transferred);
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
      syncPlayerJoinDate(ctx, ctx.sender, nextLifetime.joinedAt);
    }

    const guestProfile = ctx.db.playerProfile.identity.find(link.guest);
    let accountProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (accountProfile) accountProfile = repairModeratedDisplayName(ctx, accountProfile);
    const preserveAccountName = Boolean(accountProfile && !isGeneratedDisplayName(accountProfile.displayName));
    const transferGuestName = Boolean(guestProfile && !preserveAccountName && !isGeneratedDisplayName(guestProfile.displayName) && isPublicDisplayNameAllowed(guestProfile.displayName));
    if (transferGuestName && guestProfile && accountProfile) {
      updateSnapshotRow(ctx, "playerProfile", { ...accountProfile, displayName: guestProfile.displayName, profileIcon: guestProfile.profileIcon, playerSprite: guestProfile.playerSprite, skinTone: guestProfile.skinTone, gender: guestProfile.gender });
    } else if (transferGuestName && guestProfile) {
      insertSnapshotRow(ctx, "playerProfile", { identity: ctx.sender, displayName: guestProfile.displayName, profileIcon: guestProfile.profileIcon, playerSprite: guestProfile.playerSprite, skinTone: guestProfile.skinTone, gender: guestProfile.gender });
    } else if (guestProfile?.gender && accountProfile?.gender === PLAYER_GENDER_UNSET) {
      updateSnapshotRow(ctx, "playerProfile", { ...accountProfile, gender: guestProfile.gender });
    } else if (!accountProfile) {
      // Registration can claim the save before enterWorld creates a profile.
      // Guild membership transfer below requires the destination profile even
      // when the guest never selected a gender or custom display name.
      insertSnapshotRow(ctx, "playerProfile", { identity: ctx.sender, displayName: generatedDisplayName(ctx.sender), profileIcon: 0, playerSprite: 0, skinTone: guestProfile?.skinTone ?? ctx.random.integerInRange(0, PLAYER_SKIN_TONES.length - 1), gender: guestProfile?.gender ?? PLAYER_GENDER_UNSET });
    }
    if (guestProfile && accountProfile && !preserveAccountName && !transferGuestName) {
      const linkedProfile = ctx.db.playerProfile.identity.find(ctx.sender)!;
      updateSnapshotRow(ctx, "playerProfile", { ...linkedProfile, skinTone: guestProfile.skinTone });
    }
    if (transferGuestName && guestProfile) {
      syncDisplayNamePresentation(ctx, ctx.sender, guestProfile.displayName);
    }
    if (guestProfile && !preserveAccountName) carryNameColor(ctx, link.guest, ctx.sender);

    // A freshly-created guest's generated name must never overwrite an existing
    // authenticated name or carry a name-change lock onto that account.
    if (transferGuestName) {
      const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
      const accountNameCooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
      if (guestNameCooldown && accountNameCooldown && guestNameCooldown.changedAt.microsSinceUnixEpoch > accountNameCooldown.changedAt.microsSinceUnixEpoch) {
        ctx.db.playerNameCooldown.identity.update({ ...accountNameCooldown, changedAt: guestNameCooldown.changedAt });
      } else if (guestNameCooldown && !accountNameCooldown) {
        ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: guestNameCooldown.changedAt });
      }
    }

    const activePlayer = ctx.db.player.identity.find(ctx.sender);
    if (activePlayer) {
      updateSnapshotRow(ctx, "player", {
        ...activePlayer,
        speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
        ...powerFieldsForProgress(ctx, nextProgress),
        ...equipmentPresentationForProgress(ctx, nextProgress),
      });
    }

    const finalProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const finalDisplayName = finalProfile?.displayName ?? generatedDisplayName(ctx.sender);
    const accountStatus = ctx.db.playerAccountStatus.identity.find(ctx.sender);
    const linkedStatus = { identity: ctx.sender, isGuest: false };
    if (accountStatus) updateSnapshotRow(ctx, "playerAccountStatus", linkedStatus);
    else insertSnapshotRow(ctx, "playerAccountStatus", linkedStatus);
    recordAnalyticsConversion(ctx, link.guest, ctx.sender);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, ctx.db.player.identity.find(ctx.sender)));
    guildService.mergeGuest(ctx, link.guest, ctx.sender);
    mergeSocialAccount(ctx, link.guest, ctx.sender);
    mergeAccountReactions(ctx, link.guest, ctx.sender);
    const guestAccountStatus = ctx.db.playerAccountStatus.identity.find(link.guest);
    if (guestAccountStatus) deleteSnapshotRow(ctx, "playerAccountStatus", link.guest);
    const guestLeaderboardEntry = ctx.db.leaderboardEntry.identity.find(link.guest);
    const accountLeaderboardEntry = ctx.db.leaderboardEntry.identity.find(ctx.sender);
    if (guestLeaderboardEntry || accountLeaderboardEntry) {
      const nextLeaderboardEntry = {
        identity: ctx.sender,
        displayName: finalDisplayName,
        ...powerFieldsForProgress(ctx, nextProgress),
        profileIcon: finalProfile?.profileIcon ?? 0,
        gender: finalProfile?.gender ?? PLAYER_GENDER_UNSET,
        ...leaderboardAppearanceForProgress(ctx, nextProgress, finalProfile),
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
    moveLeaderboardStanding(ctx, link.guest, ctx.sender);

    // Migration transfers a guest save into the authenticated identity. Leave
    // no second durable save behind; otherwise an old guest token can later
    // reconnect with the pre-migration name and stats.
    const guestActivePlayer = ctx.db.player.identity.find(link.guest);
    if (guestActivePlayer) {
      deleteSnapshotRow(ctx, "player", link.guest);
    }
    removePlayerRealtimeState(ctx, link.guest);
    if (ctx.db.playerMapMarker.identity.find(link.guest)) ctx.db.playerMapMarker.identity.delete(link.guest);
    if (guestProgress) deleteSnapshotRow(ctx, "playerProgress", link.guest);
    if (ctx.db.playerLegalConsent.identity.find(link.guest)) ctx.db.playerLegalConsent.identity.delete(link.guest);
    if (guestLocation) ctx.db.playerLastLocation.identity.delete(link.guest);
    if (guestResearch) deleteSnapshotRow(ctx, "playerResearch", link.guest);
    deleteLuckResearch(ctx, link.guest);
    deleteRankTableResearch(ctx, link.guest);
    if (guestReactionUnlock) ctx.db.chatReactionUnlock.identity.delete(link.guest);
    if (guestActiveResearch) ctx.db.activeResearch.identity.delete(link.guest);
    removePausedResearch(ctx, link.guest);
    removePlayerItemUpgradeData(ctx, link.guest, true);
    if (guestProfile) deleteSnapshotRow(ctx, "playerProfile", link.guest);
    if (guestLifetime) ctx.db.playerLifetime.identity.delete(link.guest);
    removePlayerJoinDate(ctx, link.guest);
    const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
    if (guestNameCooldown) ctx.db.playerNameCooldown.identity.delete(link.guest);
    const guestChatCooldown = ctx.db.chatCooldown.identity.find(link.guest);
    if (guestChatCooldown) ctx.db.chatCooldown.identity.delete(link.guest);
    const guestPresenceChatCooldown = ctx.db.presenceChatCooldown.identity.find(link.guest);
    const accountPresenceChatCooldown = ctx.db.presenceChatCooldown.identity.find(ctx.sender);
    if (guestPresenceChatCooldown) {
      const transferredPresenceChatCooldown = {
        identity: ctx.sender,
        lastLoginAtMicros: accountPresenceChatCooldown
          ? accountPresenceChatCooldown.lastLoginAtMicros > guestPresenceChatCooldown.lastLoginAtMicros
            ? accountPresenceChatCooldown.lastLoginAtMicros
            : guestPresenceChatCooldown.lastLoginAtMicros
          : guestPresenceChatCooldown.lastLoginAtMicros,
        lastLeaveAtMicros: accountPresenceChatCooldown
          ? accountPresenceChatCooldown.lastLeaveAtMicros > guestPresenceChatCooldown.lastLeaveAtMicros
            ? accountPresenceChatCooldown.lastLeaveAtMicros
            : guestPresenceChatCooldown.lastLeaveAtMicros
          : guestPresenceChatCooldown.lastLeaveAtMicros,
      };
      if (accountPresenceChatCooldown) ctx.db.presenceChatCooldown.identity.update(transferredPresenceChatCooldown);
      else ctx.db.presenceChatCooldown.insert(transferredPresenceChatCooldown);
      ctx.db.presenceChatCooldown.identity.delete(link.guest);
    }
    const guestDuelRequestCooldown = ctx.db.duelRequestCooldown.identity.find(link.guest);
    if (guestDuelRequestCooldown) ctx.db.duelRequestCooldown.identity.delete(link.guest);
    if (ctx.db.playerBalanceVersion.identity.find(link.guest)) ctx.db.playerBalanceVersion.identity.delete(link.guest);
    const guestGemWallet = ctx.db.playerGemWallet.identity.find(link.guest);
    if (guestGemWallet) ctx.db.playerGemWallet.identity.delete(link.guest);
    if (ctx.db.playerUpgradeBench.identity.find(link.guest)) ctx.db.playerUpgradeBench.identity.delete(link.guest);
    if (ctx.db.playerUpgradeBenchThirdSlot.identity.find(link.guest)) ctx.db.playerUpgradeBenchThirdSlot.identity.delete(link.guest);
    if (ctx.db.playerInventoryCapacity.identity.find(link.guest)) ctx.db.playerInventoryCapacity.identity.delete(link.guest);
    ctx.db.playerCutsceneHistory.identity.delete(link.guest);
    transferPlayerBlocks(ctx, link.guest, ctx.sender);

    const guestSessions = [...ctx.db.playerSession.byIdentity.filter(link.guest) as Iterable<any>];
    for (const session of guestSessions) { ctx.db.playerSession.connectionId.delete(session.connectionId); ctx.db.playerSessionAnalytics.connectionId.delete(session.connectionId); }
    const guestController = ctx.db.playerController.identity.find(link.guest);
    if (guestController) ctx.db.playerController.identity.delete(link.guest);

    const guestLinkCodes: string[] = [];
    for (const pendingLink of ctx.db.accountLink.iter() as Iterable<any>) {
      if (sameIdentity(pendingLink.guest, link.guest)) guestLinkCodes.push(pendingLink.code);
    }
    for (const pendingCode of guestLinkCodes) ctx.db.accountLink.code.delete(pendingCode);
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
        deleteSnapshotRow(ctx, "duel", currentDuel.id);
        ctx.db.duelRiposte.duelId.delete(currentDuel.id);
      }
    }
    const activePlayer = playerWithMotion(ctx, ctx.db.player.identity.find(identity));
    if (activePlayer) {
      // Duel actors live outside world bounds. A disconnect must save their
      // pre-duel origin, not clamp arena coordinates into a map corner.
      persistWorldLocation(ctx, disconnectedDuelOrigin
        ? { ...activePlayer, ...disconnectedDuelOrigin }
        : activePlayer);
      deleteSnapshotRow(ctx, "player", identity);
      if (ctx.db.playerMapMarker.identity.find(identity)) ctx.db.playerMapMarker.identity.delete(identity);
    }
    removePlayerRealtimeState(ctx, identity);
  }

  /** Erases every durable and realtime row owned by one simulated client. */
  function removeVirtualPlayerData(ctx: any, identity: any, adjustOwnerCount = true) {
    const registration = ctx.db.virtualPlayer.identity.find(identity);
    if (!registration) return false;
    removeSocialAccount(ctx, identity);
    guildService.removeAccount(ctx, identity);
    ctx.db.playerNameTag.identity.delete(identity);
    removePlayerSafetyData(ctx, identity);

    const activePlayer = ctx.db.player.identity.find(identity);
    if (activePlayer) deleteSnapshotRow(ctx, "player", identity);
    removePlayerRealtimeState(ctx, identity);
    if (ctx.db.playerProfile.identity.find(identity)) deleteSnapshotRow(ctx, "playerProfile", identity);
    if (readPlayerProgress(ctx, identity)) deleteSnapshotRow(ctx, "playerProgress", identity);
    if (ctx.db.playerResearch.identity.find(identity)) deleteSnapshotRow(ctx, "playerResearch", identity);
    removeResearchCompletionSchedules(ctx, identity);
    removePausedResearch(ctx, identity);
    removePlayerItemUpgradeData(ctx, identity, true);
    if (ctx.db.playerAccountStatus.identity.find(identity)) deleteSnapshotRow(ctx, "playerAccountStatus", identity);
    removePlayerJoinDate(ctx, identity);
    removeAdGemReward(ctx, identity);
    removeChatMute(ctx, identity);
    removeItemGifts(ctx, identity);
    removeBowSkills(ctx, identity);
    removeSwordSkills(ctx, identity);
    removeStaffSkills(ctx, identity);
    removeMailboxReceipts(ctx, identity);
    unlinkPatreon(ctx, identity);
    for (const budget of ctx.db.enemyDefeatBudget.identity.filter(identity)) ctx.db.enemyDefeatBudget.key.delete(budget.key);
    for (const bank of [...ctx.db.enemyDefeatBank.identity.filter(identity)]) ctx.db.enemyDefeatBank.key.delete(bank.key);
    ctx.db.playerDefeatClock.identity.delete(identity);
    ctx.db.playerCombatStamp.identity.delete(identity);
    ctx.db.playerMapDeparture.identity.delete(identity);
    removeAudioSettings(ctx, identity);
    removeLootSettings(ctx, identity);
    removeProfileSnapshot(ctx, identity);
    removeSoulDimensionRows(ctx, identity);
    removeEquipmentLocks(ctx, identity);
    removeIgnoredDrops(ctx, identity);
    removeStreamCursors(ctx, identity);

    for (const session of [...ctx.db.playerSession.byIdentity.filter(identity) as Iterable<any>]) {
      ctx.db.playerSession.connectionId.delete(session.connectionId);
      ctx.db.playerSessionAnalytics.connectionId.delete(session.connectionId);
    }

    const linkCodes: string[] = [];
    for (const link of ctx.db.accountLink.iter() as Iterable<any>) {
      if (sameIdentity(link.guest, identity)) linkCodes.push(link.code);
    }
    for (const code of linkCodes) ctx.db.accountLink.code.delete(code);

    const reportIds: bigint[] = [];
    for (const report of ctx.db.bugReport.byReporter.filter(identity) as Iterable<any>) reportIds.push(report.id);
    for (const id of reportIds) ctx.db.bugReport.id.delete(id);

    removePlayerStateRows(ctx, identity);
    ctx.db.virtualPlayer.identity.delete(identity);
    if (adjustOwnerCount) adjustVirtualPlayerCount(ctx, registration.owner, -1);
    return Boolean(activePlayer?.isVisible);
  }

  /**
   * Permanently removes every row that belongs to a player identity. Historical
   * rows that identify the player (chat, reports, duels, and gem transactions)
   * are included so this is a full account-data deletion rather than merely a
   * leaderboard removal.
   */
  function removePlayerIdentityData(ctx: any, identity: any) {
    clearProceduralProgress(ctx, identity);
    removeSocialAccount(ctx, identity);
    guildService.removeAccount(ctx, identity);
    ctx.db.playerNameTag.identity.delete(identity);
    removePlayerSafetyData(ctx, identity);
    const activePlayer = ctx.db.player.identity.find(identity);
    if (activePlayer) deleteSnapshotRow(ctx, "player", identity);
    removePlayerRealtimeState(ctx, identity);

    if (ctx.db.playerProfile.identity.find(identity)) deleteSnapshotRow(ctx, "playerProfile", identity);
    if (readPlayerProgress(ctx, identity)) deleteSnapshotRow(ctx, "playerProgress", identity);
    if (ctx.db.playerResearch.identity.find(identity)) deleteSnapshotRow(ctx, "playerResearch", identity);
    removeResearchCompletionSchedules(ctx, identity);
    removePausedResearch(ctx, identity);
    removePlayerItemUpgradeData(ctx, identity, true);

    if (ctx.db.playerAccountStatus.identity.find(identity)) deleteSnapshotRow(ctx, "playerAccountStatus", identity);
    removePlayerJoinDate(ctx, identity);
    removeAdGemReward(ctx, identity);
    removeChatMute(ctx, identity);
    removeItemGifts(ctx, identity);
    removeBowSkills(ctx, identity);
    removeSwordSkills(ctx, identity);
    removeStaffSkills(ctx, identity);
    removeMailboxReceipts(ctx, identity);
    unlinkPatreon(ctx, identity);
    for (const budget of ctx.db.enemyDefeatBudget.identity.filter(identity)) ctx.db.enemyDefeatBudget.key.delete(budget.key);
    for (const bank of [...ctx.db.enemyDefeatBank.identity.filter(identity)]) ctx.db.enemyDefeatBank.key.delete(bank.key);
    ctx.db.playerDefeatClock.identity.delete(identity);
    ctx.db.playerCombatStamp.identity.delete(identity);
    ctx.db.playerMapDeparture.identity.delete(identity);
    removeAudioSettings(ctx, identity);
    removeLootSettings(ctx, identity);
    removeProfileSnapshot(ctx, identity);
    removeSoulDimensionRows(ctx, identity);
    removeEquipmentLocks(ctx, identity);
    removeIgnoredDrops(ctx, identity);
    removeStreamCursors(ctx, identity);


    for (const session of [...ctx.db.playerSession.byIdentity.filter(identity) as Iterable<any>]) {
      ctx.db.playerSession.connectionId.delete(session.connectionId);
      ctx.db.playerSessionAnalytics.connectionId.delete(session.connectionId);
    }

    const linkCodes = [...ctx.db.accountLink.iter() as Iterable<any>]
      .filter((link: any) => sameIdentity(link.guest, identity))
      .map((link: any) => link.code);
    for (const code of linkCodes) ctx.db.accountLink.code.delete(code);

    const removedMessageIds = new Set<bigint>();
    for (const message of [...ctx.db.chatMessage.bySender.filter(identity) as Iterable<any>]) {
      removedMessageIds.add(message.id);
      removeMessageReactions(ctx, "public", message.id);
      unmarkChatAnnouncement(ctx, message.id);
      ctx.db.chatMessage.id.delete(message.id);
    }

    for (const report of [...ctx.db.chatMessageReport.iter() as Iterable<any>]) {
      if (
        sameIdentity(report.reporter, identity) ||
        sameIdentity(report.accused, identity) ||
        removedMessageIds.has(report.messageId)
      ) ctx.db.chatMessageReport.id.delete(report.id);
    }

    for (const report of [...ctx.db.bugReport.byReporter.filter(identity) as Iterable<any>]) {
      ctx.db.bugReport.id.delete(report.id);
    }

    const duelIds = new Set<bigint>();
    for (const current of [...ctx.db.duel.iter() as Iterable<any>]) {
      if (!sameIdentity(current.challenger, identity) && !sameIdentity(current.opponent, identity)) continue;
      duelIds.add(current.id);
      deleteSnapshotRow(ctx, "duel", current.id);
      ctx.db.duelRiposte.duelId.delete(current.id);
    }
    for (const schedule of [...ctx.db.duelResolutionSchedule.iter() as Iterable<any>]) {
      if (duelIds.has(schedule.duelId)) ctx.db.duelResolutionSchedule.scheduledId.delete(schedule.scheduledId);
    }

    const identityHex = identity.toHexString().replace(/^0x/i, "").toLowerCase();
    for (const replay of [...ctx.db.duelReplay.iter() as Iterable<any>]) {
      const challengerHex = replay.challengerIdentity.replace(/^0x/i, "").toLowerCase();
      const opponentHex = replay.opponentIdentity.replace(/^0x/i, "").toLowerCase();
      if (challengerHex === identityHex || opponentHex === identityHex) { ctx.db.duelReplay.id.delete(replay.id); deleteReplayWide(ctx, replay.id); }
    }

    removePlayerStateRows(ctx, identity);
    refreshLeaderboard(ctx);
  }

  return {
    syncSenderAccountStatus, mergeGuestGemWallet, mergeBalanceApologyNotice, claimGuestAccountFor,
    removeIdentityPresence, removeVirtualPlayerData, removePlayerIdentityData,
  };
}
