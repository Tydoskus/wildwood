import { challengeActive, challengeWinReady, resumeParkedChallenge, setPrestigeChallenge } from "./prestige-challenge";
import { guildQuestBonusFor } from "./daily-quests";
import { challengeAttackInterval, challengeGoal, challengeGoalMet } from "../../shared/prestige-challenge";
import { SenderError } from "spacetimedb/server";
import { researchStatRewardMultiplier } from "../../shared/research";
import { PLAYER_STARTING_POWER, playerPowerForStats } from "../../shared/player-power";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { PRESTIGE_CAP_HINT, PRESTIGE_PERK_POINTS_PER_LEVEL, prestigeCapped, prestigeCampaignTarget, prestigeCampaignComplete, prestigeEndlessRequirement, prestigeStatMultiplier, prestigeUnlocked } from "../../shared/prestige";
import { PRESTIGE_PERK_IDS, isPrestigePerkId, prestigePerkMaxRank, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { PRESTIGE_EXPANSION_PERK_IDS } from "../../shared/prestige-expansion";
import { prestigeExpanded } from "./prestige-expansion";
import { attackRangeWithResearch } from "../../shared/utility-research";
import { readPlayerProgress } from "./wide-stats";

// Prestige bodies. The player_prestige table and the reducer declaration stay
// in index.ts; this module owns what they call. The reset arrives through deps
// because it is the same reset the player can run by hand.

/**
 * What a kill's stat reward is worth to this player: research first, then the
 * permanent prestige bonus. Every reward path multiplies by this, so one
 * prestige level raises regular and boss rewards alike, and the server's own
 * projection of a claim's rewards stays in step with what the client earned.
 */
export function statRewardMultiplier(ctx: any, identity: any) {
  return researchStatRewardMultiplier(ctx.db.playerResearch.identity.find(identity))
    * prestigeStatMultiplier(ctx.db.playerPrestige.identity.find(identity)?.level ?? 0)
    // The guild's daily quest points last week (daily-quests.ts).
    * guildQuestBonusFor(ctx, identity);
}

/** The player's perk ranks, zero for anyone who has never prestiged. */
export function prestigePerkRanks(ctx: any, identity: any): PrestigePerkRanks {
  const row = ctx.db.playerPrestigePerk.identity.find(identity);
  const expansion = prestigeExpanded(ctx) ? ctx.db.playerPrestigeExpansionPerk.identity.find(identity) : null;
  return { keenEdge: row?.keenEdge ?? 0, doubleStrike: row?.doubleStrike ?? 0, splitShot: row?.splitShot ?? 0, riposte: row?.riposte ?? 0,
    bossSlayer: expansion?.bossSlayer ?? 0, secondWind: expansion?.secondWind ?? 0, longShot: expansion?.longShot ?? 0, fleetFoot: expansion?.fleetFoot ?? 0 };
}

/** Preserve the original public row's wire shape; expansion ranks live beside it. */
export function writePrestigePerkRanks(ctx: any, identity: any, ranks: PrestigePerkRanks) {
  const original = { identity, keenEdge: ranks.keenEdge, doubleStrike: ranks.doubleStrike, splitShot: ranks.splitShot, riposte: ranks.riposte };
  const expanded = { identity, bossSlayer: ranks.bossSlayer, secondWind: ranks.secondWind, longShot: ranks.longShot, fleetFoot: ranks.fleetFoot };
  for (const [table, row] of [[ctx.db.playerPrestigePerk, original], [ctx.db.playerPrestigeExpansionPerk, expanded]]) {
    if (table.identity.find(identity)) table.identity.update(row); else table.insert(row);
  }
}

export type PrestigeDeps = {
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  resetProgressToDefaults: (ctx: any, activePlayer: any, keep?: { research?: boolean; lifetimeKills?: boolean; slotTiers?: boolean; items?: boolean }) => void;
  recordPrestige: (ctx: any) => void;
  respawnWithProgress: (ctx: any, activePlayer: any, progress: any, destination?: { mapId: string; x: number; y: number }) => void;
  restoreChallenge: (ctx: any, player: any, reward: boolean) => void;
  refreshPerkEffects: (ctx: any, activePlayer: any) => void;
};

export function createPrestige(deps: PrestigeDeps) {
  const { requireControllingPlayer, activeDuelFor, resetProgressToDefaults, recordPrestige, respawnWithProgress } = deps;

  function prestigeAccount(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before prestiging.");
    const progress = readPlayerProgress(ctx, ctx.sender);
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    // A Reflect Only run wins on its own goal, not the next prestige's requirement or cap.
    const challenge = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
    if (challenge?.active) {
      const endless = ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0;
      if (!progress || !challengeGoalMet(challenge.completed, progress.bossRewardClaims, endless)) {
        throw new SenderError(`Reflect Only: ${challengeGoal(challenge.completed).label} to win.`);
      }
      deps.restoreChallenge(ctx, activePlayer, true);
      return current;
    }
    const nextLevel = (current?.level ?? 0) + 1;
    const expanded = prestigeExpanded(ctx);
    if (prestigeCapped(nextLevel, expanded)) throw new SenderError(PRESTIGE_CAP_HINT);
    const completedEndless = ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0;
    if (!progress || !prestigeUnlocked(progress.bossRewardClaims, completedEndless, nextLevel, undefined, expanded)) {
      // The campaign first, then one Endless stage more than the last prestige asked for.
      throw new SenderError(progress && prestigeCampaignComplete(progress.bossRewardClaims, nextLevel) && prestigeEndlessRequirement(nextLevel) > 0
        ? `Clear Endless ${prestigeEndlessRequirement(nextLevel)} before prestiging.`
        : `Defeat ${prestigeCampaignTarget(nextLevel).bossName} before prestiging.`);
    }
    // The peak is kept for the player to see what they traded away; it only
    // ever rises, so a weaker later run cannot erase a stronger earlier one.
    const next = {
      identity: ctx.sender,
      level: (current?.level ?? 0) + 1,
      perkPoints: (current?.perkPoints ?? 0) + PRESTIGE_PERK_POINTS_PER_LEVEL,
      peakPower: Math.max(current?.peakPower ?? 0, playerPowerForStats(progress)),
      prestigedAt: ctx.timestamp,
    };
    if (current) ctx.db.playerPrestige.identity.update(next); else ctx.db.playerPrestige.insert(next);
    recordPrestige(ctx);
    resetProgressToDefaults(ctx, activePlayer, { research: true, lifetimeKills: true, slotTiers: true, items: true });
    return next;
  }

  /** Spend one banked point on one rank; unspent points have no gameplay cap. */
  function spendPerkPoint(ctx: any, perk: string) {
    const activePlayer = requireControllingPlayer(ctx);
    if (challengeActive(ctx, ctx.sender)) throw new SenderError("Finish or abandon the prestige challenge before spending perk points.");
    if (!isPrestigePerkId(perk)) throw new SenderError("Unknown prestige perk.");
    if ((PRESTIGE_EXPANSION_PERK_IDS as readonly string[]).includes(perk) && !prestigeExpanded(ctx)) {
      throw new SenderError("New prestige perks unlock when the countdown finishes.");
    }
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    if (!current || current.perkPoints < 1) throw new SenderError("No perk points to spend.");
    const ranks = prestigePerkRanks(ctx, ctx.sender);
    if (ranks[perk] >= prestigePerkMaxRank(perk, ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)?.completed ?? 0)) {
      throw new SenderError(perk === "riposte" ? "Reflect is at its cap. Each Reflect Only win raises it by one." : "That perk is already at its highest rank.");
    }
    writePrestigePerkRanks(ctx, ctx.sender, { ...ranks, [perk]: ranks[perk] + 1 });
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints - 1 });
    deps.refreshPerkEffects(ctx, activePlayer);
  }

  /**
   * Hands back every spent perk point to place again. The price is the run's
   * power: the stats kills raised go back to where a new run starts them, and
   * the player starts again at the forest spawn, since starting power on a
   * late map is a death loop. Map unlocks, Endless stages, research, gear,
   * bench tiers and the prestige level all stay, so the maps already opened
   * are there to farm again. The peak records the power traded away.
   */
  function respecPerks(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before respeccing.");
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    if (challengeActive(ctx, ctx.sender)) throw new SenderError("Finish or abandon the prestige challenge before respeccing.");
    const ranks = prestigePerkRanks(ctx, ctx.sender);
    const spent = PRESTIGE_PERK_IDS.reduce((sum, perk) => sum + ranks[perk], 0);
    const progress = readPlayerProgress(ctx, ctx.sender);
    if (!current || !progress || spent < 1) throw new SenderError("No perk points to respec.");
    writePrestigePerkRanks(ctx, ctx.sender, Object.fromEntries(PRESTIGE_PERK_IDS.map(perk => [perk, 0])) as PrestigePerkRanks);
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints + spent,
      peakPower: Math.max(current.peakPower, playerPowerForStats(progress)) });
    const next = { ...progress, ...PLAYER_STARTING_POWER,
      attackRate: challengeAttackInterval(PLAYER_STARTING_POWER.attackRate, ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)),
      attackRange: attackRangeWithResearch(ctx.db.playerResearch.identity.find(ctx.sender)?.utilityAttackRange ?? 0) };
    updateSnapshotRow(ctx, "playerProgress", next);
    respawnWithProgress(ctx, activePlayer, next);
    return spent;
  }

  /**
   * The one free respec every account gets: the same refund as respecPerks, but
   * the run keeps its stats, map and position. Only the perks' own effects
   * (Fleet Foot's speed, Long Shot's range) come off with their ranks.
   */
  function freeRespecPerks(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before respeccing.");
    if (ctx.db.playerFreeRespec.identity.find(ctx.sender)) throw new SenderError("Your free respec is already used.");
    if (challengeActive(ctx, ctx.sender)) throw new SenderError("Finish or drop out of the prestige challenge before respeccing.");
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    const ranks = prestigePerkRanks(ctx, ctx.sender);
    const spent = PRESTIGE_PERK_IDS.reduce((sum, perk) => sum + ranks[perk], 0);
    if (!current || spent < 1) throw new SenderError("No perk points to respec.");
    writePrestigePerkRanks(ctx, ctx.sender, Object.fromEntries(PRESTIGE_PERK_IDS.map(perk => [perk, 0])) as PrestigePerkRanks);
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints + spent });
    ctx.db.playerFreeRespec.insert({ identity: ctx.sender, usedAt: ctx.timestamp });
    deps.refreshPerkEffects(ctx, activePlayer);
    return spent;
  }

  function changeChallenge(ctx: any, active: boolean) {
    const player = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before changing challenge mode.");
    if (!active) { deps.restoreChallenge(ctx, player, false); return; }
    setPrestigeChallenge(ctx, true, player);
    const resumed = resumeParkedChallenge(ctx);
    if (resumed) respawnWithProgress(ctx, player, resumed.progress, resumed);
    else resetProgressToDefaults(ctx, player, { research: true, lifetimeKills: true, slotTiers: true, items: true });
  }

  /**
   * A Reflect Only run wins the moment its goal is met, with the same reward
   * and restored run the Prestige button gives: players took the goal for the
   * win and stopped there. Called after a boss clear. Every guard returns
   * rather than throws, because a throw would undo the kill report around it.
   */
  function completeChallengeIfMet(ctx: any) {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player || !challengeWinReady(ctx) || activeDuelFor(ctx, ctx.sender)) return false;
    deps.restoreChallenge(ctx, player, true);
    return true;
  }

  return { prestigeAccount, spendPerkPoint, respecPerks, freeRespecPerks, changeChallenge, completeChallengeIfMet };
}
