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
  { table: "accountLink", columns: ["guest"], pk: "code", mode: "scan" },
  { table: "activeItemUpgrade", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeItemUpgradeSlotTwo", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeItemUpgradeSlotThree", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "activeResearch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "aegisPrimeAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "aegisPrimeContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "analyticsConversion", columns: ["guest_identity","account_identity"], pk: "id", mode: "scan" },
  { table: "analyticsDailyMapPlayer", columns: ["identity"], pk: "key", mode: "scan" },
  { table: "analyticsDailyPlayer", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "analyticsPlayer", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "balanceApologyNotice", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "bossDefeatWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "bossMapDefeatWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "bugReport", columns: ["reporter"], pk: "id", mode: "index", index: "byReporter" },
  { table: "chatCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatHeartAllowance", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatMessage", columns: ["sender"], pk: "id", mode: "index", index: "bySender" },
  { table: "chatMessageReport", columns: ["reporter","accused"], pk: "id", mode: "scan" },
  { table: "chatMessageReportRateLimit", columns: ["reporter"], pk: "reporter", mode: "key" },
  { table: "chatReaction", columns: ["actor"], pk: "key", mode: "index", index: "actor" },
  { table: "chatReactionCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "chatReactionUnlock", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "connectionDiagnostic", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "connectionDiagnosticRate", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dailyGemBonus", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "defeatSessionRestriction", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "developerPresencePreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dragonAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dragonContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dreadreaperAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "dreadreaperContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "duel", columns: ["challenger","opponent"], pk: "id", mode: "index", index: "byChallenger" },
  { table: "duelRequestCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "duelWireAccess", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "endlessTravelAccess", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "enemyDefeatBudget", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "enemyDefeatReview", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "forestRewardPrototype", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "frostclawAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "frostclawContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gemCommerceConfig", columns: ["verifier"], pk: "id", mode: "scan" },
  { table: "gemCommerceHold", columns: ["identity"], pk: "reference", mode: "index", index: "byIdentity" },
  { table: "gemKillProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gemPurchase", columns: ["identity"], pk: "reservation_id", mode: "index", index: "byIdentity" },
  { table: "gemTransaction", columns: ["identity"], pk: "id", mode: "index", index: "byIdentity" },
  { table: "gloomrootAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gloomrootContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gravebloomAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "gravebloomContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guild", columns: ["leader"], pk: "id", mode: "scan" },
  { table: "guildAccount", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildMember", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "guildReportParticipant", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "homeReturnLocation", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "ironhornAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "ironhornContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "itemUpgradeCompletionSchedule", columns: ["identity"], pk: "scheduled_id", mode: "scan" },
  { table: "koiShogunAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "koiShogunContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardEntry", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardPosition", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "leaderboardPrestigePosition", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "magmaliskAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "magmaliskContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "mailboxEquipment", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "mailboxReceipt", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "mapBalanceVersion", columns: ["editor"], pk: "revision", mode: "scan" },
  { table: "miremawAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "miremawContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "offlineProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "patreonAnnouncement", columns: ["identity"], pk: "user_id", mode: "scan" },
  { table: "patreonLink", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "patreonOwner", columns: ["identity"], pk: "user_id", mode: "scan" },
  { table: "patreonPending", columns: ["identity"], pk: "state", mode: "index", index: "identity" },
  { table: "patreonPreview", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "pendingEquipmentOffer", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "player", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAccessAudit", columns: ["identity","viewer"], pk: "identity", mode: "key" },
  { table: "playerAccountStatus", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAdReward", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerAudioSetting", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerBalanceVersion", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerBlock", columns: ["owner","target"], pk: "key", mode: "index", index: "byOwner" },
  { table: "playerBowSkill", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerChatHearts", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerChatMute", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerController", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerCutsceneHistory", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEndgameRebaseBackup", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEndlessRebaseBackup", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerEquipmentCopy", columns: ["identity"], pk: "id", mode: "index", index: "identity" },
  { table: "playerGemWallet", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerIgnoredDrop", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerInventoryCapacity", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerItemDrop", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "playerItemGift", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "playerItemUpgrade", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
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
  { table: "playerMovementDemand", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerMultiplayerPreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerNameCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerNameTag", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerOfflinePreference", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerOnboarding", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPowerRebaseBackup", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestige", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerPrestigePerk", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerProfile", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerReport", columns: ["reporter","target"], pk: "id", mode: "scan" },
  { table: "playerResearch", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerSession", columns: ["identity"], pk: "connection_id", mode: "index", index: "byIdentity" },
  { table: "playerUpgradeBench", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "playerUpgradeBenchThirdSlot", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "presenceChatCooldown", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "prismshellAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "prismshellContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "proceduralContribution", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "proceduralInstanceContribution", columns: ["identity"], pk: "key", mode: "index", index: "byIdentity" },
  { table: "proceduralProgress", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "regularEnemyLootCursor", columns: ["identity"], pk: "key", mode: "index", index: "identity" },
  { table: "releaseAcknowledgement", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "researchCompletionSchedule", columns: ["identity"], pk: "scheduled_id", mode: "scan" },
  { table: "socialFriend", columns: ["owner","peer"], pk: "key", mode: "index", index: "owner" },
  { table: "socialGuildInvite", columns: ["sender","recipient"], pk: "id", mode: "index", index: "sender" },
  { table: "socialMessage", columns: ["sender","recipient","reply_sender"], pk: "id", mode: "index", index: "sender" },
  { table: "socialReport", columns: ["reporter","accused"], pk: "key", mode: "index", index: "reporter" },
  { table: "socialRequest", columns: ["sender","recipient"], pk: "id", mode: "index", index: "recipient" },
  { table: "spiderAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "spiderContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "startupTelemetryRateLimit", columns: ["sender"], pk: "sender", mode: "key" },
  { table: "tempestKirinAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "tempestKirinContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "tidewyrmAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "tidewyrmContribution", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "virtualPlayer", columns: ["identity","owner"], pk: "identity", mode: "key" },
  { table: "virtualPlayerLoad", columns: ["owner"], pk: "owner", mode: "key" },
  { table: "virtualPlayerRun", columns: ["owner"], pk: "owner", mode: "key" },
  { table: "voltwardenAttackWindow", columns: ["identity"], pk: "identity", mode: "key" },
  { table: "voltwardenContribution", columns: ["identity"], pk: "identity", mode: "key" },
];

/**
 * How many rows one call may delete.
 *
 * A reducer has a bounded execution budget and some of these tables are large,
 * so erasure is resumable: run it until it reports nothing left. Deleting less
 * than asked is normal and safe; deleting nothing means the account is clean.
 */
export const ERASURE_ROW_BUDGET = 2_000;

function matchesIdentity(row: any, columns: readonly string[], identities: readonly any[]) {
  for (const column of columns) {
    const value = row[column];
    if (!value) continue;
    for (const identity of identities) if (value.isEqual ? value.isEqual(identity) : value === identity) return true;
  }
  return false;
}

/**
 * Delete up to `budget` rows belonging to `identities`, and report what is
 * left to do. Safe to call repeatedly: it is the same work each time, minus
 * what has already gone.
 */
export function eraseIdentityRows(ctx: any, identities: readonly any[], budget = ERASURE_ROW_BUDGET) {
  let deleted = 0;
  let exhausted = false;
  const remaining: string[] = [];

  for (const target of ERASURE_TARGETS) {
    const handle = ctx.db[target.table];
    if (!handle) continue;
    if (exhausted) { remaining.push(target.table); continue; }

    if (target.mode === "key" && target.pk) {
      for (const identity of identities) {
        if (deleted >= budget) { exhausted = true; break; }
        if (handle[target.pk]?.find(identity)) { handle[target.pk].delete(identity); deleted += 1; }
      }
      if (exhausted) remaining.push(target.table);
      continue;
    }

    // Snapshot the matches before deleting: mutating a table while iterating
    // it is how a sweep silently skips rows.
    const rows: any[] = [];
    if (target.mode === "index" && target.index && handle[target.index]) {
      for (const identity of identities) {
        for (const row of handle[target.index].filter(identity) as Iterable<any>) rows.push(row);
      }
    } else {
      for (const row of handle.iter() as Iterable<any>) {
        if (matchesIdentity(row, target.columns, identities)) rows.push(row);
      }
    }

    for (const row of rows) {
      if (deleted >= budget) { exhausted = true; break; }
      if (!target.pk) continue;
      const key = row[target.pk];
      if (handle[target.pk]?.find(key)) { handle[target.pk].delete(key); deleted += 1; }
    }
    if (exhausted) remaining.push(target.table);
  }

  return { deleted, complete: !exhausted, remaining };
}

/**
 * Every identity that is the same person.
 *
 * A player who signed up after playing as a guest has two: analytics_conversion
 * is the durable record of that pairing. account_link is not — it is a pending
 * claim code with no account column — so erasing only the identity that asked
 * would leave the guest half of the account behind.
 *
 * Both directions are followed, because either half may be the one requesting.
 */
export function linkedIdentities(ctx: any, identity: any): any[] {
  const found = [identity];
  const seen = (candidate: any) => found.some(existing => existing.isEqual?.(candidate) ?? existing === candidate);
  for (const conversion of ctx.db.analyticsConversion.iter() as Iterable<any>) {
    const { guestIdentity, accountIdentity } = conversion;
    if (guestIdentity?.isEqual?.(identity) && accountIdentity && !seen(accountIdentity)) found.push(accountIdentity);
    if (accountIdentity?.isEqual?.(identity) && guestIdentity && !seen(guestIdentity)) found.push(guestIdentity);
  }
  return found;
}

export function requireErasureConfirmation(confirmation: string) {
  if (confirmation !== "ERASE") throw new SenderError("Confirm erasure by sending ERASE.");
}
