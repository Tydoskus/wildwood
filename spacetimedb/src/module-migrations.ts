import { activateCampaignPacing, activateCampaignProgression, activateCampaignRewardFloor } from './campaign-pacing-migration';
// One-time data migrations: the version-gated steps runPendingModuleMigrations
// walks once per module version, the legacy balance rebases they call and the
// per-connection migratePlayerBalance catch-up for saves that predate the
// current balance version. The moduleMigrationState table, the schema
// registration and the connect/runMaintenance reducers that invoke these stay
// in index.ts; this module only owns the bodies. Helpers that still live in
// index.ts arrive through createModuleMigrations' deps so the moved code reads
// exactly as it did. The version constant and the order of steps are history:
// append new steps, never reorder or renumber the old ones.
import { Identity, ScheduleAt, Timestamp } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { deleteSnapshotRow, insertSnapshotRow, updateSnapshotRow } from "./snapshot-row-writes";
import { RESEARCH_DEFINITIONS, createEmptyResearchRanks, shouldBackfillLegacyRegeneration } from "../../shared/research";
import { STARTER_BOW, STARTER_STONE, WOODEN_ARMOR } from "../../shared/items";
import { normalizeSlotTier, upgradeSlotForItem } from "../../shared/slot-upgrades";
import {
  ATTACK_BALANCE_VERSION,
  BOSS_REWARD_CLAIM_BITS,
  MAP_IDS,
  MAX_MOVEMENT_SPEED_OVERRIDE,
  movementSpeedsMatch,
  PLAYER_SPAWN,
  playerBaseMovementSpeed,
  TUTORIAL_FOREST_MAP_ID,
} from "../../shared/rules";
import { MAGMALISK_ID, TEMPEST_KIRIN_ID, MIREMAW_ID, DREADREAPER_ID, VOLTWARDEN_ID, GRAVEBLOOM_ID } from "./boss-combat";
import { NAME_CHANGE_COOLDOWN_MS } from "../../shared/name-change";
import { publishRebalanceMail, publishSlotUpgradeMail } from "./mailbox";
import { forgetBalanceCaches } from "./map-balance";
import { defaultBalanceSettings, validateBalanceSettings } from "../../shared/map-balance";
import { migrateGuildTags } from "./player-name-tags";
import { compressLegacyMapPower } from "../../shared/map-power-rescale";
import { rescaleEndgameProgress, rescaleRankingConflict, rescaleRankingStats } from "../../shared/endgame-power-rescale";
import { rebaseProgressByEffort } from "../../shared/progression-rebase";
import { unlockedPortalCutsceneMask } from "../../shared/portal-cutscenes";
import { HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN } from "../../shared/home";
import { generateMap, isProceduralMap, proceduralMapId, proceduralMapNumber } from "../../shared/procedural-maps";
import { balanceApologyTransactionReference, isBalanceApologyEligible } from "./balance-apology";
import { BALANCE_APOLOGY_GEM_GIFT } from "../../shared/gems";
import { grantGemHeartUnlock } from "./chat-reactions";
import { GEM_KILL_CREDIT_PER_GEM } from "../../shared/gem-drops";
import { syncPlayerJoinDate } from "./mailbox";

export const MODULE_MIGRATION_VERSION = 45;

export type ModuleMigrationDeps = {
  MAP_ARRIVALS: Record<string, { x: number; y: number }>;
  MAINTENANCE_INTERVAL_MICROS: bigint;
  UPGRADE_BENCH_SLOT_ONE: number;
  inventoryForProgress: (progress: any) => string[];
  equippedRightHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedLeftHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedFeetForProgress: (progress: any, inventory?: string[]) => string;
  equipmentPresentationForProgress: (progress: any, inventory?: string[]) => any;
  forestItemCountForProgress: (progress: any, itemId: string, field: "bowCount" | "woodenArmorCount") => number;
  cancelActiveItemUpgrade: (ctx: any, active: any, slot: number) => void;
  itemUpgradeLevelFor: (ctx: any, identity: any, itemId: unknown) => number;
  effectiveMovementSpeedForProgress: (ctx: any, progress: any, research?: any) => number;
  powerFieldsForProgress: (ctx: any, progress: any) => { power: number; powerLevel: number };
  effectivePowerForProgress: (ctx: any, progress: any) => number;
  effectivePowerStatsForProgress: (ctx: any, progress: any) => any;
  playerWithMotion: (ctx: any, activePlayer: any) => any;
  syncPlayerMotionIdentity: (ctx: any, activePlayer: any) => void;
  persistWorldLocation: (ctx: any, activePlayer: any) => void;
  transitionPlayerMap: (ctx: any, current: any, mapId: string, arrival: { x: number; y: number }, facing?: number) => any;
  refreshLeaderboard: (ctx: any) => void;
  markPlayerBalanceCurrent: (ctx: any, identity?: any) => void;
  playerBalanceProgress: (progress: any, version: number, includeMapRebase?: boolean) => any;
  samePlayerProgressValues: (left: any, right: any) => boolean;
  resultIncludesContributor: (latest: any, identity: any) => boolean;
  contributedToLatestPrismshell: (ctx: any, identity: any) => boolean;
  isVirtualPlayer: (ctx: any, identity: any) => boolean;
  sameIdentity: (a: any, b: any) => boolean;
  applyGemBalanceChange: (ctx: any, input: any) => any;
  ensureWorldStatus: (ctx: any) => void;
  ensureMaintenanceSweepSchedule: (ctx: any) => void;
};

export function createModuleMigrations(deps: ModuleMigrationDeps) {
  const {
    MAP_ARRIVALS, MAINTENANCE_INTERVAL_MICROS, UPGRADE_BENCH_SLOT_ONE, inventoryForProgress,
    equippedRightHandForProgress, equippedLeftHandForProgress,     equipmentPresentationForProgress, forestItemCountForProgress, cancelActiveItemUpgrade,
    itemUpgradeLevelFor, effectiveMovementSpeedForProgress, powerFieldsForProgress,
    effectivePowerForProgress, effectivePowerStatsForProgress, playerWithMotion,
    syncPlayerMotionIdentity, persistWorldLocation, transitionPlayerMap, refreshLeaderboard,
    markPlayerBalanceCurrent, playerBalanceProgress, samePlayerProgressValues,
    resultIncludesContributor, contributedToLatestPrismshell, isVirtualPlayer, sameIdentity,
    applyGemBalanceChange, ensureWorldStatus, ensureMaintenanceSweepSchedule,
  } = deps;

  function runPendingModuleMigrations(ctx: any) {
    const state = ctx.db.moduleMigrationState.id.find(0);
    const currentVersion = state?.version ?? 0;
    if (currentVersion >= MODULE_MIGRATION_VERSION) return;
    if (currentVersion < 1) {
      for (const research of ctx.db.playerResearch.iter() as Iterable<any>) {
        if (research.frontierMastery !== 0) updateSnapshotRow(ctx, "playerResearch", { ...research, frontierMastery: 0 });
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
          updateSnapshotRow(ctx, "playerResearch", {
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
          updateSnapshotRow(ctx, "playerProgress", {
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
        updateSnapshotRow(ctx, "playerProgress", {
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
        updateSnapshotRow(ctx, "playerProgress", {
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
        updateSnapshotRow(ctx, "playerProgress", {
          ...normalizedProgress,
          inventoryJson: JSON.stringify([...new Set(inventoryForProgress(normalizedProgress))]),
        });
      }
    }
    if (currentVersion < 9) {
      // v0.476 briefly supported paused upgrades. Cancellation now forfeits the
      // unfinished timer, so return any item left in that legacy paused state.
      for (const active of [...ctx.db.activeItemUpgrade.iter()] as any[]) {
        if (active.paused) cancelActiveItemUpgrade(ctx, active, UPGRADE_BENCH_SLOT_ONE);
      }
    }
    if (currentVersion < 10) {
      // Preserve obvious developer-authored custom speeds while normalizing
      // historical base values that predate the current 180/+25 equipment rule.
      const legacyDerivedSpeeds = [175, 180, 200, 205];
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        // Trailblazer Boots never granted speed, and no longer exist.
        const equipmentSpeed = playerBaseMovementSpeed(false);
        const storedSpeed = Number(progress.speed);
        const existingOverride = Number(progress.speedOverride ?? 0);
        const isLegacyDerivedSpeed = legacyDerivedSpeeds.some((speed) => movementSpeedsMatch(storedSpeed, speed));
        const speedOverride = existingOverride > 0
          ? Math.min(MAX_MOVEMENT_SPEED_OVERRIDE, existingOverride)
          : Number.isFinite(storedSpeed) && storedSpeed > 0 && !isLegacyDerivedSpeed
            ? Math.min(MAX_MOVEMENT_SPEED_OVERRIDE, storedSpeed)
            : 0;
        const nextProgress = { ...progress, speed: equipmentSpeed, speedOverride };
        updateSnapshotRow(ctx, "playerProgress", nextProgress);
        const active = ctx.db.player.identity.find(progress.identity);
        if (active) {
          updateSnapshotRow(ctx, "player", {
            ...active,
            speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
          });
        }
      }
    }
    if (currentVersion < 11) {
      // Public player labels previously used raw save stats while profiles and
      // rankings applied research, equipment, and item upgrades.
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const active = ctx.db.player.identity.find(progress.identity);
        if (active) updateSnapshotRow(ctx, "player", { ...active, ...powerFieldsForProgress(ctx, progress) });
      }
    }
    if (currentVersion < 12) {
      // Blocked damage belongs to the defender whose armor prevented it. Older
      // duel simulation stored that amount on the attacker, so repair completed
      // replays and any duel that was active during this deployment.
      for (const replay of [...ctx.db.duelReplay.iter()] as any[]) {
        ctx.db.duelReplay.id.update({
          ...replay,
          challengerBlocked: replay.opponentBlocked,
          opponentBlocked: replay.challengerBlocked,
        });
      }
      for (const activeDuel of [...ctx.db.duel.iter()] as any[]) {
        updateSnapshotRow(ctx, "duel", {
          ...activeDuel,
          challengerBlocked: activeDuel.opponentBlocked,
          opponentBlocked: activeDuel.challengerBlocked,
        });
      }
    }
    if (currentVersion < 13) {
      // Preserve the unlock for players who contributed to the latest completed
      // Magmalisk encounter before Infernal Depths existed.
      const result = ctx.db.magmaliskResult.id.find(MAGMALISK_ID);
      if (result) {
        try {
          const contributors = JSON.parse(result.contributorsJson);
          if (Array.isArray(contributors)) {
            for (const contributor of contributors) {
              if (typeof contributor?.identity !== "string") continue;
              const identity = new Identity(contributor.identity);
              const progress = ctx.db.playerProgress.identity.find(identity);
              if (progress && !progress.infernalUnlocked) {
                updateSnapshotRow(ctx, "playerProgress", { ...progress, infernalUnlocked: true });
              }
            }
          }
        } catch {}
      }
    }
    if (currentVersion < 14) {
      // Backfill the stable map-wide presentation cache from active player rows.
      // The physical identity table retains legacy zone columns for migration
      // compatibility, but zone-only movement no longer updates its rows.
      for (const active of ctx.db.player.iter() as Iterable<any>) {
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, active));
      }
    }
    if (currentVersion < 15) {
      // Version 3 is deliberately narrow: only legacy saves beyond the measured
      // endgame envelope are soft-compressed. The logarithmic transform keeps
      // their ordering and veteran advantage while returning them to the curve.
      let changedProgress = false;
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const currentBalance = ctx.db.playerBalanceVersion.identity.find(progress.identity);
        const migrated = playerBalanceProgress(progress, currentBalance?.version ?? 0, false);
        if (!samePlayerProgressValues(progress, migrated)) {
          updateSnapshotRow(ctx, "playerProgress", migrated);
          changedProgress = true;
          const active = ctx.db.player.identity.find(progress.identity);
          if (active) {
            const nextActive = { ...active, ...powerFieldsForProgress(ctx, migrated) };
            updateSnapshotRow(ctx, "player", nextActive);
            syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextActive));
          }
        }
        markPlayerBalanceCurrent(ctx, progress.identity);
      }
      if (changedProgress) refreshLeaderboard(ctx);
    }
    if (currentVersion < 16) {
      // Version 4 corrects the late-game damage/health divergence without
      // changing an account's raw damage-plus-health power budget. Accounts
      // already at or below the authored ratio remain byte-for-byte unchanged.
      let changedProgress = false;
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const currentBalance = ctx.db.playerBalanceVersion.identity.find(progress.identity);
        const migrated = playerBalanceProgress(progress, currentBalance?.version ?? 0, false);
        if (!samePlayerProgressValues(progress, migrated)) {
          updateSnapshotRow(ctx, "playerProgress", migrated);
          changedProgress = true;
          const active = ctx.db.player.identity.find(progress.identity);
          if (active) {
            const nextActive = { ...active, ...powerFieldsForProgress(ctx, migrated) };
            updateSnapshotRow(ctx, "player", nextActive);
            syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextActive));
          }
        }
        markPlayerBalanceCurrent(ctx, progress.identity);
      }
      if (changedProgress) refreshLeaderboard(ctx);
    }
    if (currentVersion < 17) grantBalanceApologyGifts(ctx);
    if (currentVersion < 18) {
      // Balance version 5 repairs only the five accounts separated from the
      // campaign by the measured legacy power gap. The shared transform also
      // migrates old pending browser saves, preventing them from restoring the
      // pre-compression values on reconnect.
      let changedProgress = false;
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const currentBalance = ctx.db.playerBalanceVersion.identity.find(progress.identity);
        const migrated = playerBalanceProgress(progress, currentBalance?.version ?? 0, false);
        if (!samePlayerProgressValues(progress, migrated)) {
          updateSnapshotRow(ctx, "playerProgress", migrated);
          changedProgress = true;
          const active = ctx.db.player.identity.find(progress.identity);
          if (active) {
            const nextActive = { ...active, ...powerFieldsForProgress(ctx, migrated) };
            updateSnapshotRow(ctx, "player", nextActive);
            syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextActive));
          }
        }
        markPlayerBalanceCurrent(ctx, progress.identity);
      }
      if (changedProgress) refreshLeaderboard(ctx);
    }
    if (currentVersion < 19) {
      // Balance version 6 corrects the short-lived v5 cohort from its cached
      // pre-equipment anchor to the intended current-equipment map targets.
      let changedProgress = false;
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const currentBalance = ctx.db.playerBalanceVersion.identity.find(progress.identity);
        const migrated = playerBalanceProgress(progress, currentBalance?.version ?? 0, false);
        if (!samePlayerProgressValues(progress, migrated)) {
          updateSnapshotRow(ctx, "playerProgress", migrated);
          changedProgress = true;
          const active = ctx.db.player.identity.find(progress.identity);
          if (active) {
            const nextActive = { ...active, ...powerFieldsForProgress(ctx, migrated) };
            updateSnapshotRow(ctx, "player", nextActive);
            syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextActive));
          }
        }
        markPlayerBalanceCurrent(ctx, progress.identity);
      }
      if (changedProgress) refreshLeaderboard(ctx);
    }
    if (currentVersion < 20) {
      // Players who cleared Tempest Kirin before Moonfen shipped keep the unlock
      // they already earned when the new destination becomes available.
      const result = ctx.db.tempestKirinResult.id.find(TEMPEST_KIRIN_ID);
      if (result) {
        try {
          const contributors = JSON.parse(result.contributorsJson);
          if (Array.isArray(contributors)) {
            for (const contributor of contributors) {
              if (typeof contributor?.identity !== "string") continue;
              const identity = new Identity(contributor.identity);
              const progress = ctx.db.playerProgress.identity.find(identity);
              if (progress && !progress.moonfenUnlocked) {
                updateSnapshotRow(ctx, "playerProgress", { ...progress, moonfenUnlocked: true });
              }
            }
          }
        } catch {}
      }
    }
    if (currentVersion < 21) {
      // Preserve the latest recorded Miremaw clear, without inferring a victory
      // from stats or merely being present in Moonfen.
      const result = ctx.db.miremawResult.id.find(MIREMAW_ID);
      if (result) {
        for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
          if (!progress.crystalHollowsUnlocked && resultIncludesContributor(result, progress.identity)) {
            updateSnapshotRow(ctx, "playerProgress", { ...progress, crystalHollowsUnlocked: true });
          }
        }
      }
    }
    if (currentVersion < 22) {
      // Existing map access proves the corresponding first-clear reward was
      // already earned. Seed the append-only ledger before repeat encounters;
      // Prismshell has no downstream unlock, so only its latest recorded
      // contributor list is safe evidence for that bit. The ledger is metadata
      // only: every clear pays the full authored reward.
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        let bossRewardClaims = Number(progress.bossRewardClaims ?? 0) >>> 0;
        if (progress.desertUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.dragon;
        if (progress.snowlandsUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.spider;
        if (progress.lavaUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.frostclaw;
        if (progress.infernalUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.magmalisk;
        if (progress.waterUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.gloomroot;
        if (progress.samuraiUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.tidewyrm;
        if (progress.cloudspireUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.koiShogun;
        if (progress.moonfenUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.tempestKirin;
        if (progress.crystalHollowsUnlocked) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.miremaw;
        if (contributedToLatestPrismshell(ctx, progress.identity)) bossRewardClaims |= BOSS_REWARD_CLAIM_BITS.prismshell;
        if (bossRewardClaims !== Number(progress.bossRewardClaims ?? 0)) {
          updateSnapshotRow(ctx, "playerProgress", { ...progress, bossRewardClaims });
        }
      }
    }
    if (currentVersion < 23) {
      // This step also seeded the shared-boss rows. Bosses are personal now and
      // nothing reads those rows, so a fresh database no longer creates them.
      ensureWorldStatus(ctx);
      ensureMaintenanceSweepSchedule(ctx);
    }
    if (currentVersion < 24) rebaseLegacyPlayersToMaps(ctx);
    if (currentVersion < 25) {
      // The existing claim ledger preserves every prior Prismshell victory.
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        if ((progress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS.prismshell) !== 0 || contributedToLatestPrismshell(ctx, progress.identity)) {
          updateSnapshotRow(ctx, "playerProgress", { ...progress, clockworkRuinsUnlocked: true });
        }
      }
    }
    if (currentVersion < 26) rebasePlayersToEndgame(ctx);
    if (currentVersion < 27) migrateGuildTags(ctx);
    if (currentVersion < 28) {
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        if (!progress.neonBastionUnlocked && ((progress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS.dreadreaper) || contributedToLatestDreadreaper(ctx, progress.identity))) {
          updateSnapshotRow(ctx, "playerProgress", { ...progress, neonBastionUnlocked: true });
        }
      }
    }
    if (currentVersion < 29) {
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        if (!progress.verdantCatacombsUnlocked && ((progress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS.voltwarden) || contributedToLatestVoltwarden(ctx, progress.identity))) {
          updateSnapshotRow(ctx, "playerProgress", { ...progress, verdantCatacombsUnlocked: true });
        }
      }
    }
    if (currentVersion < 30) {
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        if (!progress.ionCitadelUnlocked && ((progress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS.gravebloom) || contributedToLatestGravebloom(ctx, progress.identity))) {
          updateSnapshotRow(ctx, "playerProgress", { ...progress, ionCitadelUnlocked: true });
        }
      }
    }
    if (currentVersion < 31 && !ctx.db.startupTelemetryCleanupSchedule.scheduledId.find(0n)) {
      ctx.db.startupTelemetryCleanupSchedule.insert({ scheduledId: 0n,
        scheduledAt: ScheduleAt.interval(15n * MAINTENANCE_INTERVAL_MICROS) });
    }
    if (currentVersion < 32) {
      // Reset only the wait, retaining whether the free name change was used.
      const resetAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch - BigInt(NAME_CHANGE_COOLDOWN_MS) * 1000n);
      for (const row of ctx.db.playerNameCooldown.iter()) {
        ctx.db.playerNameCooldown.identity.update({ ...row, changedAt: resetAt });
      }
      for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
        const next = rebaseEndlessPlayer(ctx, progress);
        markPlayerBalanceCurrent(ctx, progress.identity);
        const active = ctx.db.player.identity.find(progress.identity);
        if (active) {
          const updated = { ...active, ...powerFieldsForProgress(ctx, next), ...equipmentPresentationForProgress(next), speed: effectiveMovementSpeedForProgress(ctx, next) };
          updateSnapshotRow(ctx, "player", updated);
          syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated));
        }
      }
      refreshLeaderboard(ctx);
    }
    if (currentVersion < 33) publishRebalanceMail(ctx);
    // 34 seated map-shard members in a route table. Sharding is gone; the number stays spent.
    // 35: prestige originally cleared research before the keep-research fix
    // shipped. The rebase archive contains the last complete research row for
    // those players, so restore it without reducing any progress earned since.
    if (currentVersion < 35) restorePrestigeResearch(ctx);
    // 36: the balance panel's own multipliers are now base values, so a stored
    // revision still holding them would apply each one a second time. Land a
    // fresh all-defaults revision with the publish that bakes them, not after.
    if (currentVersion < 36) resetBalanceToBakedDefaults(ctx);
    // 37 repairs 36. The map factors were the multipliers that needed folding
    // in; the Endless block is a curve the panel is resolved against, not a set
    // of multipliers, and 36 reset it to the authored reference along with
    // them. That changed Endless for everyone, so put the live curve back.
    if (currentVersion < 37) restoreLiveEndlessCurve(ctx);
    if (currentVersion < 38) convertItemUpgradesToSlotTiers(ctx);
    // 39: a make-good for the slot upgrades a prestige wiped, and for the
    // ones a sweep threw away while they were still running.
    if (currentVersion < 39) publishSlotUpgradeMail(ctx);
    // Skittle's early gem-heart grant follows the account into production.
    if (currentVersion < 40) {
      const skittle = Identity.fromString("c2000fe3ee7c17481d5dcb88ae9d09af8a28a6f0d63643e59ed75a3fc3c80a8e");
      grantGemHeartUnlock(ctx, skittle, true);
    }
    // Scale the previous 2,000-credit ledger exactly into the new 6,000-credit
    // unit before any defeat is credited at the Auto Farm rate.
    if (currentVersion < 41) {
      for (const progress of ctx.db.gemKillProgress.iter() as Iterable<any>) {
        ctx.db.gemKillProgress.identity.update({ ...progress, credit: progress.credit * (GEM_KILL_CREDIT_PER_GEM / 2_000n) });
      }
    }
    // 42: copy every join date out of player_lifetime for the mailbox view.
    if (currentVersion < 42) {
      for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) syncPlayerJoinDate(ctx, lifetime.identity, lifetime.joinedAt);
    }
    // 43: adopt the verified HP/reward curves as a new balance revision.
    if (currentVersion < 43) activateCampaignPacing(ctx);
    if (currentVersion < 44) activateCampaignRewardFloor(ctx);
    // 45: switch on the unified campaign progression curve shipped inactive in 0.821.
    if (currentVersion < 45) activateCampaignProgression(ctx);
    const next = { id: 0, version: MODULE_MIGRATION_VERSION };
    if (state) ctx.db.moduleMigrationState.id.update(next);
    else ctx.db.moduleMigrationState.insert(next);
  }

  /**
   * Every tuned multiplier the panel carried has been folded into the base
   * numbers, so the live configuration has to go back to 1 in the same publish.
   * Saved revisions are kept: they are the record of what was live when, and
   * rolling back to one would knowingly re-apply its factors.
   */
  /**
   * The Endless curve that was live at revision 58, before migration 36 reset
   * it. Held literally because it is a one-time repair of a specific mistake,
   * not a value anyone should tune from here.
   */
  const ENDLESS_LIVE_CURVE = {
    rewardMultiplier: 2, statStep: .6, enduranceStep: .06, enduranceExponent: 1, rewardPerHealth: 1,
  } as const;

  /**
   * Upgrades moved from the item to the slot it goes in.
   *
   * Every account keeps what it earned: each slot starts at the highest level
   * any item in it had reached, so a +10 helmet becomes a HEAD track at tier
   * 10 and the work is not lost. The per-item rows are rewritten in place,
   * keyed by slot, because a new table would strand the ones already written.
   *
   * A job running when this lands is left alone. Its row names an item rather
   * than a slot, so it can no longer complete into a tier; cancelling it is
   * the player's to do, and its target was one tier either way.
   */
  function convertItemUpgradesToSlotTiers(ctx: any) {
    const best = new Map<string, { identity: any; slot: string; tier: number }>();
    const stale: string[] = [];
    for (const row of ctx.db.playerItemUpgrade.iter() as Iterable<any>) {
      stale.push(row.key);
      const slot = upgradeSlotForItem(row.itemId);
      if (!slot) continue;
      const key = `${row.identity.toHexString()}:${slot}`;
      const tier = normalizeSlotTier(row.level);
      const current = best.get(key);
      if (!current || tier > current.tier) best.set(key, { identity: row.identity, slot, tier });
    }
    for (const key of stale) deleteSnapshotRow(ctx, "playerItemUpgrade", key);
    for (const [key, { identity, slot, tier }] of best) {
      if (tier <= 0) continue;
      insertSnapshotRow(ctx, "playerItemUpgrade", { key, identity, itemId: slot, level: tier });
    }
  }

  function restoreLiveEndlessCurve(ctx: any) {
    const head = ctx.db.mapBalanceHead.id.find(0);
    if (!head) return;
    const current = ctx.db.mapBalanceVersion.revision.find(head.revision);
    if (!current) return;
    const settings = validateBalanceSettings(JSON.parse(current.settingsJson));
    settings.endless = { ...ENDLESS_LIVE_CURVE };
    const revision = head.revision + 1;
    ctx.db.mapBalanceVersion.insert({
      revision, settingsJson: JSON.stringify(settings), editor: ctx.sender, createdAt: ctx.timestamp,
    });
    ctx.db.mapBalanceHead.id.update({ id: 0, revision });
    forgetBalanceCaches();
  }

  function resetBalanceToBakedDefaults(ctx: any) {
    const head = ctx.db.mapBalanceHead.id.find(0);
    if (!head) return;
    const revision = head.revision + 1;
    ctx.db.mapBalanceVersion.insert({
      revision, settingsJson: JSON.stringify(defaultBalanceSettings()),
      editor: ctx.sender, createdAt: ctx.timestamp,
    });
    ctx.db.mapBalanceHead.id.update({ id: 0, revision });
    forgetBalanceCaches();
  }

  function restorePrestigeResearch(ctx: any) {
    const fields = ["warcraft", "foraging", "frontierMastery", "vitality", "precision", "criticalChance", "moveSpeed", "prosperity", "criticalDamage", "regeneration"] as const;
    for (const prestige of ctx.db.playerPrestige.iter() as Iterable<any>) {
      const backup = ctx.db.playerEndlessRebaseBackup.identity.find(prestige.identity);
      if (!backup?.contextJson) continue;
      let archivedResearch: any;
      try { archivedResearch = JSON.parse(backup.contextJson).research; } catch { continue; }
      if (!archivedResearch) continue;
      const current = ctx.db.playerResearch.identity.find(prestige.identity);
      const nextResearch: any = {
        identity: prestige.identity,
        ...createEmptyResearchRanks(),
        ...current,
        ...Object.fromEntries(fields.map((field) => [field, Math.max(Number(current?.[field] ?? 0), Number(archivedResearch[field] ?? 0))])),
      };
      const changed = !current || fields.some((field) => Number(current[field] ?? 0) !== nextResearch[field]);
      if (!changed) continue;
      if (current) updateSnapshotRow(ctx, "playerResearch", nextResearch);
      else insertSnapshotRow(ctx, "playerResearch", nextResearch);

      const active = ctx.db.activeResearch.identity.find(prestige.identity);
      if (active && Number(nextResearch[active.researchId] ?? 0) >= Number(active.targetRank)) {
        ctx.db.activeResearch.identity.delete(prestige.identity);
        for (const schedule of [...ctx.db.researchCompletionSchedule.iter()] as any[]) {
          if (sameIdentity(schedule.identity, prestige.identity)) ctx.db.researchCompletionSchedule.scheduledId.delete(schedule.scheduledId);
        }
      }

      const progress = ctx.db.playerProgress.identity.find(prestige.identity);
      const player = ctx.db.player.identity.find(prestige.identity);
      if (progress && player) {
        const updated = {
          ...player,
          ...powerFieldsForProgress(ctx, progress),
          speed: effectiveMovementSpeedForProgress(ctx, progress, nextResearch),
          ...equipmentPresentationForProgress(progress),
        };
        updateSnapshotRow(ctx, "player", updated);
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated));
      }
    }
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

  function contributedToLatestDreadreaper(ctx: any, identity: any) {
    return resultIncludesContributor(ctx.db.dreadreaperResult.id.find(DREADREAPER_ID), identity);
  }
  function contributedToLatestVoltwarden(ctx: any, identity: any) {
    return resultIncludesContributor(ctx.db.voltwardenResult.id.find(VOLTWARDEN_ID), identity);
  }
  function contributedToLatestGravebloom(ctx: any, identity: any) {
    return resultIncludesContributor(ctx.db.gravebloomResult.id.find(GRAVEBLOOM_ID), identity);
  }

  function grantBalanceApologyGifts(ctx: any) {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) {
      if (isVirtualPlayer(ctx, lifetime.identity)) continue;
      const audit = ctx.db.playerAccessAudit.identity.find(lifetime.identity);
      const currentlyActive = Boolean(ctx.db.player.identity.find(lifetime.identity)) ||
        sameIdentity(lifetime.identity, ctx.sender);
      if (!isBalanceApologyEligible(nowMicros, {
        lastSeenAtMicros: audit?.lastSeenAt.microsSinceUnixEpoch,
        sessionStartedAtMicros: lifetime.sessionStartedAt.microsSinceUnixEpoch,
        currentlyActive,
      })) continue;

      applyGemBalanceChange(ctx, {
        identity: lifetime.identity,
        delta: BALANCE_APOLOGY_GEM_GIFT,
        kind: "balance_apology_gift",
        note: "One-time apology gift for the major balance changes.",
        externalReference: balanceApologyTransactionReference(lifetime.identity.toHexString()),
      });
      if (!ctx.db.balanceApologyNotice.identity.find(lifetime.identity)) {
        ctx.db.balanceApologyNotice.insert({
          identity: lifetime.identity,
          amount: BALANCE_APOLOGY_GEM_GIFT,
          createdAt: ctx.timestamp,
        });
      }
    }
  }

  function rebaseLegacyPlayersToMaps(ctx: any) {
    const plans = [...ctx.db.playerProgress.iter() as Iterable<any>].map((progress) => {
      const archived = ctx.db.playerPowerRebaseBackup.identity.find(progress.identity);
      const next = archived ? progress : compressLegacyMapPower(progress);
      return { progress, next, archived, before: effectivePowerForProgress(ctx, progress), after: effectivePowerForProgress(ctx, next) };
    });
    // Check the actual current population and Float32-rounded saved stats before
    // writing anything. A changed cohort must be re-audited, never silently reordered.
    const ranked = [...plans].sort((a, b) => a.before - b.before);
    for (let i = 1; i < ranked.length; i++) {
      const previous = ranked[i - 1], current = ranked[i];
      if (Math.sign(previous.before - current.before) !== Math.sign(previous.after - current.after)) {
        throw new SenderError("Player power rescale needs a fresh ranking audit; no stats changed.");
      }
    }
    for (const { progress, next, archived, before, after } of plans) {
      if (!archived) ctx.db.playerPowerRebaseBackup.insert({
        identity: progress.identity, version: 7, maxHp: progress.maxHp, damage: progress.damage,
        armor: progress.armor, regen: progress.regen, attackRate: progress.attackRate,
        beforePower: before, afterPower: after, recordedAt: ctx.timestamp,
      });
      if (!samePlayerProgressValues(progress, next)) updateSnapshotRow(ctx, "playerProgress", next);
      markPlayerBalanceCurrent(ctx, progress.identity);
      const active = ctx.db.player.identity.find(progress.identity);
      if (active) {
        const updated = { ...active, ...powerFieldsForProgress(ctx, next) };
        updateSnapshotRow(ctx, "player", updated);
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated));
      }
    }
    refreshLeaderboard(ctx);
  }

  function rebasePlayersToEndgame(ctx: any) {
    const stats = (progress: any) => {
      const effective = effectivePowerStatsForProgress(ctx, progress);
      return rescaleRankingStats(effective);
    };
    const plans = [...ctx.db.playerProgress.iter() as Iterable<any>].map((progress) => {
      const archived = ctx.db.playerEndgameRebaseBackup.identity.find(progress.identity);
      const next = archived ? progress : rescaleEndgameProgress(progress);
      return { progress, next, archived, before: stats(progress), after: stats(next) };
    });
    const displayedPlans = plans.flatMap((plan) => {
      const entry = ctx.db.leaderboardEntry.identity.find(plan.progress.identity);
      return entry ? [{ before: { ...entry, power: entry.powerLevel || entry.power }, after: plan.after }] : [];
    });
    const conflict = rescaleRankingConflict(plans) ?? rescaleRankingConflict(displayedPlans);
    if (conflict) throw new SenderError(`Endgame rescale needs a fresh ${conflict} ranking audit; no stats changed.`);
    for (const { progress, next, archived, before, after } of plans) {
      if (!archived) ctx.db.playerEndgameRebaseBackup.insert({
        identity: progress.identity, maxHp: progress.maxHp, damage: progress.damage,
        armor: progress.armor, regen: progress.regen, attackRate: progress.attackRate,
        beforePower: before.power, afterPower: after.power, recordedAt: ctx.timestamp,
      });
      if (!samePlayerProgressValues(progress, next)) updateSnapshotRow(ctx, "playerProgress", next);
      markPlayerBalanceCurrent(ctx, progress.identity);
      const active = ctx.db.player.identity.find(progress.identity);
      if (active) {
        const updated = { ...active, ...powerFieldsForProgress(ctx, next) };
        updateSnapshotRow(ctx, "player", updated);
        syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, updated));
      }
    }
    refreshLeaderboard(ctx);
  }

  function rebaseEndlessPlayer(ctx: any, progress: any) {
    if (ctx.db.playerEndlessRebaseBackup.identity.find(progress.identity)) return progress;
    const procedural = ctx.db.proceduralProgress.identity.find(progress.identity);
    const result = rebaseProgressByEffort(progress.desertUnlocked ? { ...progress, inventoryJson: JSON.stringify(inventoryForProgress(progress)) } : progress,
      ctx.db.playerResearch.identity.find(progress.identity), id => itemUpgradeLevelFor(ctx, progress.identity, id), procedural?.completed ?? 0);
    const next = result.progress;
    const json = (value: unknown) => JSON.stringify(value, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    ctx.db.playerEndlessRebaseBackup.insert({ identity: progress.identity,
      maxHp: progress.maxHp, damage: progress.damage, armor: progress.armor, regen: progress.regen, attackRate: progress.attackRate,
      beforePower: result.beforePower, afterPower: result.afterPower, recordedAt: ctx.timestamp,
      progressJson: json(progress), earnedSeconds: result.earnedSeconds,
      contextJson: json({ procedural, location: ctx.db.playerLastLocation.identity.find(progress.identity),
        homeReturn: ctx.db.homeReturnLocation.identity.find(progress.identity), cutscenes: ctx.db.playerCutsceneHistory.identity.find(progress.identity),
        research: ctx.db.playerResearch.identity.find(progress.identity), upgrades: [...ctx.db.playerItemUpgrade.byIdentity.filter(progress.identity)] }) });
    if (!samePlayerProgressValues(progress, next)) updateSnapshotRow(ctx, "playerProgress", next);
    if (procedural && procedural.completed !== result.completedEndless) ctx.db.proceduralProgress.identity.update({ ...procedural, completed: result.completedEndless });
    const history = ctx.db.playerCutsceneHistory.identity.find(progress.identity);
    if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask & unlockedPortalCutsceneMask(next), generation: history.generation + 1 });
    const allowed = (mapId: string) => mapId === HOME_EXTERIOR_MAP_ID || mapId === "first_steps"
      || (isProceduralMap(mapId) ? result.mapIndex === 15 && proceduralMapNumber(mapId)! <= result.completedEndless + 1
        : MAP_IDS.indexOf(mapId) >= 0 && MAP_IDS.indexOf(mapId) <= result.mapIndex);
    const fallbackMap = result.mapIndex === 15 ? proceduralMapId(result.completedEndless + 1) : MAP_IDS[result.mapIndex];
    const fallback = isProceduralMap(fallbackMap) ? generateMap(fallbackMap).arrival : fallbackMap === TUTORIAL_FOREST_MAP_ID ? PLAYER_SPAWN : MAP_ARRIVALS[fallbackMap as keyof typeof MAP_ARRIVALS];
    for (const table of [ctx.db.playerLastLocation, ctx.db.homeReturnLocation]) {
      const saved = table.identity.find(progress.identity);
      if (progress.desertUnlocked && saved && !allowed(saved.mapId)) table.identity.update({ ...saved, mapId: fallbackMap, ...fallback, facing: 0 });
    }
    const active = ctx.db.player.identity.find(progress.identity);
    if (progress.desertUnlocked && active && !allowed(active.mapId)) {
      // Moving home prevents a weakened character reconnecting into a hostile camp.
      const moved = transitionPlayerMap({ ...ctx, sender: progress.identity }, active, HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN);
      const homeReturn = { identity: progress.identity, mapId: fallbackMap, ...fallback, facing: 0 };
      if (ctx.db.homeReturnLocation.identity.find(progress.identity)) ctx.db.homeReturnLocation.identity.update(homeReturn);
      else ctx.db.homeReturnLocation.insert(homeReturn);
      persistWorldLocation(ctx, moved);
    }
    // Old DPS/time credit must never validate kills after a stat reduction.
    for (const row of ctx.db.enemyDefeatBudget.identity.filter(progress.identity)) ctx.db.enemyDefeatBudget.key.delete(row.key);
    if (ctx.db.bossDefeatWindow.identity.find(progress.identity)) ctx.db.bossDefeatWindow.identity.delete(progress.identity);
    if (ctx.db.bossMapDefeatWindow.identity.find(progress.identity)) ctx.db.bossMapDefeatWindow.identity.delete(progress.identity);
    // Keep accepted-loot sequence cursors: deleting them would permit double rewards.
    return next;
  }

  function migratePlayerBalance(ctx: any, progress: any) {
    const current = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
    if ((current?.version ?? 0) >= ATTACK_BALANCE_VERSION) return progress;
    const migrated = rebaseEndlessPlayer(ctx, playerBalanceProgress(progress, current?.version ?? 0));
    updateSnapshotRow(ctx, "playerProgress", migrated);
    markPlayerBalanceCurrent(ctx);
    return migrated;
  }

  return { runPendingModuleMigrations, migratePlayerBalance };
}
