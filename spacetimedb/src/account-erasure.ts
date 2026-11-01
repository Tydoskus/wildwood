import { SenderError } from "spacetimedb/server";

/**
 * Every table that holds a player identity, and how to reach that player's
 * rows in it.
 *
 * Erasure has to be complete or it is not erasure, so this list is generated
 * from the module's own published schema — `spacetime describe` — rather than
 * read off the source. A first attempt parsed the table declarations in
 * index.ts and found 88 of these 138: fifty tables hid behind declarations the
 * pattern terminated early on, and every one of them would have kept a deleted
 * player's data. `npm run check:erasure` regenerates this and fails on drift.
 *
 * `mode` is how the rows are found.
 *   key   - the identity is the primary key, so one direct delete.
 *   index - a btree index on the identity column narrows it.
 *   scan  - neither, so the table is walked. These are the expensive ones and
 *           the reason erasure runs against a row budget.
 *
 * Two tables are deliberately absent: player_motion_detail_frame and
 * boss_hit_result are `event: true`, delivered and dropped rather than stored,
 * so there is nothing in them to erase.
 */
export type ErasureTarget = {
  table: string;
  columns: readonly string[];
  pk: string | null;
  mode: "key" | "index" | "scan";
  index?: string;
};

export const ERASURE_TARGETS: readonly ErasureTarget[] = [
  { table: "accountDeletionRequest", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "accountEmail", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "accountLink", columns: ["guest"], pk: "code", mode: "scan" },
  { table: "activeItemUpgrade", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeItemUpgradeSlotTwo", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeItemUpgradeSlotThree", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeResearch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "pausedResearch", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "analyticsConversion", columns: ["guest_identity","account_identity"], pk: "id", mode: "scan" },
  { table: "analyticsDailyMapPlayer", columns: ["identity"], pk: "key", mode: "scan" },
  { table: "analyticsDailyPlayer", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "analyticsPlayer", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "balanceApologyNotice", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "bugReport", columns: ["reporter"], pk: "id", mode: "index", index: "byReporter" },
  { table: "chatCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatHeartAllowance", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatMessage", columns: ["sender"], pk: "id", mode: "index", index: "bySender" },
  { table: "chatMessageReport", columns: ["reporter","accused"], pk: "id", mode: "scan" },
  { table: "chatMessageReportRateLimit", columns: ["reporter"], pk: "reporter", mode: "key" },
  { table: "chatReaction", columns: ["actor"], pk: "key", mode: "index", index: "actor" },
  { table: "chatReactionCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatReactionUnlock", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatModerator", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "connectionDiagnostic", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "connectionDiagnosticRate", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dailyGemBonus", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "defeatSessionRestriction", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "developerPresencePreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "duel", columns: ["challenger","opponent"], pk: "id", mode: "index", index: "byChallenger" },
  { table: "duelRequestCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "duelWideStats", columns: ["challenger"], pk: "duelId", mode: "scan" },
  { table: "endlessTravelAccess", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "enemyDefeatBudget", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerDefeatClock", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMapDeparture", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gemCommerceConfig", columns: ["verifier"], pk: "id", mode: "scan" },
  { table: "gemCommerceHold", columns: ["identity"], pk: "reference", mode: "index", index: "byIdentity" },
  { table: "gemKillDaily", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "gemKillProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gemPurchase", columns: ["identity"], pk: "reservation_id", mode: "index", index: "byIdentity" },
  { table: "gemTransaction", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "guild", columns: ["leader"], pk: "id", mode: "scan" },
  { table: "guildAccount", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildJoinRequest", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildMember", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildReportParticipant", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "homeReturnLocation", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "itemUpgradeCompletionSchedule", columns: ["identity"], pk: "scheduled_id", mode: "scan" },
  { table: "leaderboardEntry", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardDirty", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardPosition", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardPrestigePosition", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardStanding", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "loginMove", columns: ["source"], pk: "code", mode: "scan" },
  { table: "mailboxEquipment", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "mailboxReceipt", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "mapBalanceVersion", columns: ["editor"], pk: "revision", mode: "scan" },
  { table: "offlineProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "patreonAnnouncement", columns: ["identity"], pk: "user_id", mode: "scan" },
  { table: "patreonLink", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "patreonOwner", columns: ["identity"], pk: "user_id", mode: "scan" },
  { table: "patreonPending", columns: ["identity"], pk: "state", mode: "index", index: "identity" },
  { table: "patreonPreview", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "pendingEquipmentOffer", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "player", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAutoFarmPuppet", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAccessAudit", columns: ["identity","viewer"], pk: "identity", mode: "key" },
  { table: "playerAccountStatus", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAdReward", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAdWatch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerClientHost", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "offlineGatherChoice", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerRunTiming", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerRunHistory", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "playerNockedArrow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerGatherPicks", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAudioSetting", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerBalanceVersion", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerBlock", columns: ["owner","target"], pk: "key", mode: "index", index: "byOwner" },
  { table: "playerBowSkill", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerSwordSkill", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerStaffSkill", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerItemRefine", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCopyRefine", columns: ["identity"], pk: "copyId", mode: "index", index: "identity" },
  { table: "playerCosmeticRefine", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerOre", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCard", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerActiveCard", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerGearSlots", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerBuild", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerBuildName", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerWeaponMastery", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerMasteryLevel", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerGold", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "exchangeOffer", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "exchangeListing", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "exchangeCollect", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "oldGearPayout", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerStarterWeapon", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCraftSkill", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCraftLevel", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerTool", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCardMeter", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCardShopPurchase", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerBossCardRoll", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerCardAttackCap", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCardDrop", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerItemCollection", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerWornSkill", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerWornStaffSkill", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMiningLevel", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCopySlots", columns: ["identity"], pk: "copyId", mode: "index", index: "identity" },
  { table: "playerRefineResult", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerRefinePity", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerMining", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMinedNode", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerWoodcutting", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerChoppedTree", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerWoodcuttingLevel", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerChatHearts", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerChatMute", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCombatRating", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerController", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCutsceneHistory", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEndlessRebaseBackup", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEquipmentCopy", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "playerGemWallet", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEquipmentLock", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerIgnoredDrop", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerInventoryCapacity", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerItemDrop", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "playerItemGift", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerItemUpgrade", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "playerJoinDate", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerLastLocation", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerLegalConsent", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerLifetime", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerLootSetting", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMapBalance", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMail", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerMapMarker", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMotion", columns: ["identity"], pk: "network_id", mode: "index", index: "identity" },
  { table: "playerMotionIdentity", columns: ["identity"], pk: "network_id", mode: "index", index: "identity" },
  { table: "playerMotionInterest", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMultiplayerPreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerNameCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerNameTag", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerOfflinePreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerOnboarding", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestige", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigePerk", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigeExpansionPerk", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigeCardPerk", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerBonusToggle", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerNameColor", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigeChallenge", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "prestigeChallengeBackup", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "prestigeChallengeRun", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigeChallengeParked", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAggroChallenge", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "aggroChallengeRun", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAggroChallengeParked", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerFreeRespec", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerDailyQuest", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildMemberQuestWeek", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "soloQuestWeek", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerQuestWeekTotal", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildRejoin", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerProfile", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerProfileSnapshot", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerInventory", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerWideStats", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerReport", columns: ["reporter","target"], pk: "id", mode: "scan" },
  { table: "playerResearch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerLuckResearch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerResearchRank", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerRewardKills", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerSession", columns: ["identity"], pk: "connection_id", mode: "index", index: "byIdentity" },
  { table: "playerSoulLevel", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerSoulStats", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerUpgradeBench", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerUpgradeBenchThirdSlot", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "presenceChatCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "proceduralContribution", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "proceduralInstanceContribution", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "proceduralProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "regularEnemyLootCursor", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "regularEnemyStream", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "releaseAcknowledgement", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "researchCompletionSchedule", columns: ["identity"], pk: "scheduled_id", mode: "scan" },
  { table: "serverBoostTrigger", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "socialFriend", columns: ["owner","peer"], pk: "key", mode: "index", index: "owner" },
  { table: "socialGuildInvite", columns: ["sender","recipient"], pk: "id", mode: "index", index: "sender" },
  { table: "socialMessage", columns: ["sender","recipient","reply_sender"], pk: "id", mode: "index", index: "sender" },
  { table: "socialDuelMessage", columns: ["sender","recipient"], pk: "messageId", mode: "index", index: "sender" },
  { table: "socialReport", columns: ["reporter","accused"], pk: "key", mode: "index", index: "reporter" },
  { table: "socialRequest", columns: ["sender","recipient"], pk: "id", mode: "index", index: "recipient" },
  { table: "startupTelemetryRateLimit", columns: ["sender"], pk: "sender", mode: "key" },
  { table: "virtualPlayer", columns: ["identity","owner"], pk: "identity", mode: "key" },
  { table: "virtualPlayerLoad", columns: ["owner"], pk: "owner", mode: "key" },
  { table: "virtualPlayerRun", columns: ["owner"], pk: "owner", mode: "key" },
];

/**
 * How many rows one call may delete.
 *
 * A reducer has a bounded execution budget and some of these tables are large,
 * so erasure is resumable: run it until it reports nothing left. Deleting less
 * than asked is normal and safe; deleting nothing means the account is clean.
 */
export const ERASURE_ROW_BUDGET = 2_000;

// The published schema, and so ERASURE_TARGETS, names some columns and keys in
// snake_case; server rows and index accessors use camelCase. Reading
// row["reservation_id"] is undefined, and the row is silently kept.
const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

function matchesIdentity(row: any, columns: readonly string[], identities: readonly any[]) {
  for (const column of columns) {
    const value = row[camel(column)];
    if (!value) continue;
    for (const identity of identities) if (value.isEqual ? value.isEqual(identity) : value === identity) return true;
  }
  return false;
}

/**
 * The rows an index gives for one identity: a btree index's filter, or a unique index's find (a row
 * or none). Null when it is neither, and the table is scanned instead. An accessor named like the
 * column is a unique index, which has no filter.
 */
function indexRows(index: any, identity: any): Iterable<any> | null {
  if (typeof index?.filter === "function") return index.filter(identity);
  if (typeof index?.find === "function") { const row = index.find(identity); return row ? [row] : []; }
  return null;
}

/**
 * Delete up to `budget` rows belonging to `identities`, and report what is
 * left to do. Safe to call repeatedly: it is the same work each time, minus
 * what has already gone. `only` limits the sweep to those tables, which is how
 * the player-removal paths reuse these lookups for the rows they clear.
 */
export function eraseIdentityRows(ctx: any, identities: readonly any[], budget = ERASURE_ROW_BUDGET, only?: ReadonlySet<string>) {
  let deleted = 0;
  let exhausted = false;
  const remaining: string[] = [];

  for (const target of ERASURE_TARGETS) {
    if (only && !only.has(target.table)) continue;
    const handle = ctx.db[target.table];
    if (!handle) continue;
    if (exhausted) { remaining.push(target.table); continue; }

    const pk = target.pk ? handle[camel(target.pk)] : null;
    if (target.mode === "key" && pk) {
      for (const identity of identities) {
        if (deleted >= budget) { exhausted = true; break; }
        if (pk.find(identity)) { pk.delete(identity); deleted += 1; }
      }
      if (exhausted) remaining.push(target.table);
      continue;
    }

    // Snapshot the matches before deleting: mutating a table while iterating
    // it is how a sweep silently skips rows. The index only covers one column,
    // so a table naming the player in two (owner and peer, sender and
    // recipient) is scanned, or the rows naming this player second stay behind.
    const rows: any[] = [];
    const index = target.index ? handle[camel(target.index)] : null;
    const viaIndex = target.mode === "index" && index && target.columns.length === 1
      ? identities.map(identity => indexRows(index, identity)) : null;
    if (viaIndex && viaIndex.every(Boolean)) {
      for (const found of viaIndex) for (const row of found!) rows.push(row);
    } else {
      for (const row of handle.iter() as Iterable<any>) {
        if (matchesIdentity(row, target.columns, identities)) rows.push(row);
      }
    }

    for (const row of rows) {
      if (deleted >= budget) { exhausted = true; break; }
      if (!target.pk || !pk) continue;
      const key = row[camel(target.pk)];
      if (pk.find(key)) { pk.delete(key); deleted += 1; }
    }
    if (exhausted) remaining.push(target.table);
  }

  return { deleted, complete: !exhausted, remaining };
}

export function requireErasureConfirmation(confirmation: string) {
  if (confirmation !== "ERASE") throw new SenderError("Confirm erasure by sending ERASE.");
}
