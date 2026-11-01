import { challengeActive, challengeWinReady, reflectRewardsInPlay, resumeParkedChallenge, setPrestigeChallenge } from "./prestige-challenge";
import { startRunTiming } from "./run-timing";
import { attackIntervalUnderNewCap } from "../../shared/stat-rating";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { guildQuestBonusFor, questStandingFor, type QuestStanding } from "./daily-quests";
import { challengeGoal, challengeGoalMet } from "../../shared/prestige-challenge";
import { SenderError } from "spacetimedb/server";
import { researchStatRewardMultiplier } from "../../shared/research";
import { playerPowerForStats } from "../../shared/player-power";
import { PRESTIGE_CAP_HINT, PRESTIGE_PERK_POINTS_PER_LEVEL, prestigeCapped, prestigeCampaignTarget, prestigeCampaignComplete, prestigeEndlessRequirement, prestigeStatMultiplier, prestigeUnlocked } from "../../shared/prestige";
import { PRESTIGE_PERK_IDS, isPrestigePerkId, playerAttackCap, prestigePerkMaxRank, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { readPlayerProgress } from "./wide-stats";
import { activeCardTotalsFor } from "./active-cards";
import { cardStatFactors, cardStatGainFactor, type CardTotals } from "../../shared/card-effects";
import { aggroChallengeActive } from "./aggro-challenge";
import { bonusOffFor, researchInPlay } from "./bonus-toggles";
import { perksInPlayFor, prestigeStatGainOn, reflectRewardsOn, researchInPlayFor, type BonusOff } from "../../shared/bonus-toggles";
import { aggroGoal, aggroGoalMet } from "../../shared/aggro-challenge";

// Prestige bodies. The player_prestige table and the reducer declaration stay
// in index.ts; this module owns what they call. The reset arrives through deps
// because it is the same reset the player can run by hand.

/**
 * What a kill's stat reward is worth to this player: research first, then the
 * permanent prestige bonus. Every reward path multiplies by this, so one
 * prestige level raises regular and boss rewards alike, and the server's own
 * projection of a claim's rewards stays in step with what the client earned.
 */
export function statRewardMultiplier(ctx: any, identity: any, read?: BonusRows) {
  if (!read) return researchStatRewardMultiplier(researchInPlay(ctx, identity))
    // An Aggro run plays with no prestige bonuses at all, and Stat Gain can be switched off (bonus-toggles.ts).
    * prestigeStatMultiplier(prestigeStatGainInPlay(ctx, identity) ? ctx.db.playerPrestige.identity.find(identity)?.level ?? 0 : 0)
    // The guild's daily quest points last week (daily-quests.ts).
    * guildQuestBonusFor(ctx, identity);
  // The same three factors, from rows the kill report already read.
  return researchStatRewardMultiplier(researchInPlayFor(read.research, read.off) ?? undefined)
    * prestigeStatMultiplier(!read.aggro && prestigeStatGainOn(read.off) ? ctx.db.playerPrestige.identity.find(identity)?.level ?? 0 : 0)
    * read.quest.bonus;
}

/**
 * The rows a kill report reads once for the reward multiplier, perks, soul stats and attack cap
 * (combatBoundForReport), so each helper does not read them again. Nothing in a report writes them.
 */
export type BonusRows = { off: BonusOff; aggro: boolean; challenge: any; research: any; stored: PrestigePerkRanks; quest: QuestStanding };
export function bonusRowsFor(ctx: any, identity: any, research: any): BonusRows {
  return { off: bonusOffFor(ctx, identity), aggro: aggroChallengeActive(ctx, identity), challenge: ctx.db.playerPrestigeChallenge.identity.find(identity),
    research, stored: storedPrestigePerkRanks(ctx, identity), quest: questStandingFor(ctx, identity) };
}

/** The stat gain for each type of reward: statRewardMultiplier, and the active Bounty cards on top. `cards` saves the read when the caller has them. */
export function statRewardMultiplierFor(ctx: any, identity: any, cards: CardTotals = activeCardTotalsFor(ctx, identity), read?: BonusRows) {
  const base = statRewardMultiplier(ctx, identity, read);
  return (type: string) => base * cardStatGainFactor(cards, type);
}

/** Whether prestige stat gain counts: not during an Aggro run, nor with Stat Gain switched off (bonus-toggles.ts). */
export const prestigeStatGainInPlay = (ctx: any, identity: any) => !aggroChallengeActive(ctx, identity) && prestigeStatGainOn(bonusOffFor(ctx, identity));

/** The perk ranks in play: zero for anyone who has never prestiged and during an Aggro run, and each switched-off perk zero. */
export function prestigePerkRanks(ctx: any, identity: any, read?: BonusRows): PrestigePerkRanks {
  if (read ? read.aggro : aggroChallengeActive(ctx, identity)) return Object.fromEntries(PRESTIGE_PERK_IDS.map(perk => [perk, 0])) as PrestigePerkRanks;
  return perksInPlayFor(read?.stored ?? storedPrestigePerkRanks(ctx, identity), read?.off ?? bonusOffFor(ctx, identity));
}

/**
 * The attack speed cap in play (playerAttackCap): Reflect Only's wins and Quick Draw, each unless switched off
 * (bonus-toggles.ts). An Aggro run keeps both, though it plays without every other prestige bonus.
 */
export function attackCapInPlay(ctx: any, identity: any, worn?: CardTotals, read?: BonusRows) {
  const off = read?.off ?? bonusOffFor(ctx, identity);
  const cap = playerAttackCap(reflectRewardsOn(off) ? (read ? read.challenge : ctx.db.playerPrestigeChallenge.identity.find(identity)) : null,
    perksInPlayFor(read?.stored ?? storedPrestigePerkRanks(ctx, identity), off));
  // Quick Draw cards raise the cap as the perk does.
  const cards = cardStatFactors(worn ?? activeCardTotalsFor(ctx, identity)).attackCapRaise;
  return cards > 0 ? { ...cap, raise: cap.raise + cards } : cap;
}

/** The ranks the player owns, whether or not they are in play: what spending and respeccing work from. */
export function storedPrestigePerkRanks(ctx: any, identity: any): PrestigePerkRanks {
  const row = ctx.db.playerPrestigePerk.identity.find(identity);
  const expansion = ctx.db.playerPrestigeExpansionPerk.identity.find(identity);
  const cards = ctx.db.playerPrestigeCardPerk?.identity.find(identity);
  return { keenEdge: row?.keenEdge ?? 0, doubleStrike: row?.doubleStrike ?? 0, splitShot: row?.splitShot ?? 0, riposte: row?.riposte ?? 0,
    bossSlayer: expansion?.bossSlayer ?? 0, secondWind: expansion?.secondWind ?? 0, longShot: expansion?.longShot ?? 0, fleetFoot: expansion?.fleetFoot ?? 0,
    quickDraw: expansion?.quickDraw ?? 0,
    weaponCards: cards?.weaponCards ?? 0, helmetCards: cards?.helmetCards ?? 0, armorCards: cards?.armorCards ?? 0 };
}

/** Preserve the original public row's wire shape; expansion ranks live beside it. */
export function writePrestigePerkRanks(ctx: any, identity: any, ranks: PrestigePerkRanks) {
  const original = { identity, keenEdge: ranks.keenEdge, doubleStrike: ranks.doubleStrike, splitShot: ranks.splitShot, riposte: ranks.riposte };
  const expanded = { identity, bossSlayer: ranks.bossSlayer, secondWind: ranks.secondWind, longShot: ranks.longShot, fleetFoot: ranks.fleetFoot, quickDraw: ranks.quickDraw };
  for (const [table, row] of [[ctx.db.playerPrestigePerk, original], [ctx.db.playerPrestigeExpansionPerk, expanded]]) {
    if (table.identity.find(identity)) table.identity.update(row); else table.insert(row);
  }
  const cards = { identity, weaponCards: ranks.weaponCards ?? 0, helmetCards: ranks.helmetCards ?? 0, armorCards: ranks.armorCards ?? 0 };
  const cardRow = ctx.db.playerPrestigeCardPerk.identity.find(identity);
  if (!cards.weaponCards && !cards.helmetCards && !cards.armorCards) { if (cardRow) ctx.db.playerPrestigeCardPerk.identity.delete(identity); }
  else if (cardRow) ctx.db.playerPrestigeCardPerk.identity.update(cards);
  else ctx.db.playerPrestigeCardPerk.insert(cards);
}

/**
 * Perk ranks written, and the run's attack interval moved to the new Quick Draw cap at the same rating
 * (stat-rating.ts): the cap the curve closes in on changed under it. Spending and respeccing are refused
 * during a challenge, so the ranks in play are the ranks stored.
 */
function writeRanksKeepingAttackRating(ctx: any, identity: any, before: PrestigePerkRanks, after: PrestigePerkRanks) {
  writePrestigePerkRanks(ctx, identity, after);
  if (before.quickDraw === after.quickDraw) return;
  const progress = readPlayerProgress(ctx, identity);
  if (!progress) return;
  const challenge = reflectRewardsInPlay(ctx, identity);
  const attackRate = attackIntervalUnderNewCap(progress.attackRate, playerAttackCap(challenge, before), playerAttackCap(challenge, after));
  if (attackRate !== progress.attackRate) updateSnapshotRow(ctx, "playerProgress", { ...progress, attackRate });
}

export type PrestigeDeps = {
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  resetProgressToDefaults: (ctx: any, activePlayer: any, keep?: { research?: boolean; lifetimeKills?: boolean; slotTiers?: boolean; items?: boolean }) => void;
  recordPrestige: (ctx: any) => void;
  respawnWithProgress: (ctx: any, activePlayer: any, progress: any, destination?: { mapId: string; x: number; y: number }) => void;
  restoreChallenge: (ctx: any, player: any, reward: boolean) => void;
  /** Wins an Aggro run: the main run comes back and the win counts. */
  winAggro: (ctx: any, player: any) => void;
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
    // An Aggro run wins on a first prestige's requirement: the campaign's last boss.
    if (aggroChallengeActive(ctx, ctx.sender)) {
      if (!progress || !aggroGoalMet(progress.bossRewardClaims)) throw new SenderError(`Aggro: ${aggroGoal().label} to win.`);
      deps.winAggro(ctx, activePlayer);
      return current;
    }
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
    const expanded = true;
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
    startRunTiming(ctx, ctx.sender, next.level);
    recordPrestige(ctx);
    resetProgressToDefaults(ctx, activePlayer, { research: true, lifetimeKills: true, slotTiers: true, items: true });
    return next;
  }

  /** Spend one banked point on one rank; unspent points have no gameplay cap. */
  function spendPerkPoint(ctx: any, perk: string) {
    const activePlayer = requireControllingPlayer(ctx);
    if (challengeActive(ctx, ctx.sender)) throw new SenderError("Finish or abandon the prestige challenge before spending perk points.");
    if (!isPrestigePerkId(perk)) throw new SenderError("Unknown prestige perk.");
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    if (!current || current.perkPoints < 1) throw new SenderError("No perk points to spend.");
    const ranks = storedPrestigePerkRanks(ctx, ctx.sender);
    if (ranks[perk] >= prestigePerkMaxRank(perk, ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)?.completed ?? 0)) {
      throw new SenderError(perk === "riposte" ? "Reflect is at its cap. Each Reflect Only win raises it by one." : "That perk is already at its highest rank.");
    }
    writeRanksKeepingAttackRating(ctx, ctx.sender, ranks, { ...ranks, [perk]: ranks[perk] + 1 });
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints - 1 });
    deps.refreshPerkEffects(ctx, activePlayer);
  }

  /**
   * Hands back every spent perk point to place again, free, as often as the
   * player likes. The run keeps its stats, map and position; only the perks'
   * own effects (Fleet Foot's speed, Long Shot's range) come off with their
   * ranks.
   */
  function respecPerks(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before respeccing.");
    if (challengeActive(ctx, ctx.sender)) throw new SenderError("Finish or abandon the prestige challenge before respeccing.");
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    const ranks = storedPrestigePerkRanks(ctx, ctx.sender);
    const spent = PRESTIGE_PERK_IDS.reduce((sum, perk) => sum + ranks[perk], 0);
    if (!current || spent < 1) throw new SenderError("No perk points to respec.");
    writeRanksKeepingAttackRating(ctx, ctx.sender, ranks, Object.fromEntries(PRESTIGE_PERK_IDS.map(perk => [perk, 0])) as PrestigePerkRanks);
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints + spent });
    deps.refreshPerkEffects(ctx, activePlayer);
    return spent;
  }

  /** The free-respec reducer older clients still call: every respec is free. */
  const freeRespecPerks = respecPerks;

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
    if (!player || activeDuelFor(ctx, ctx.sender)) return false;
    // An Aggro run wins the same way, the moment Aegis Prime falls.
    if (aggroChallengeActive(ctx, ctx.sender)) {
      const progress = readPlayerProgress(ctx, ctx.sender);
      if (!progress || !aggroGoalMet(progress.bossRewardClaims) || !ctx.db.prestigeChallengeBackup.identity.find(ctx.sender)) return false;
      deps.winAggro(ctx, player);
      return true;
    }
    if (!challengeWinReady(ctx)) return false;
    deps.restoreChallenge(ctx, player, true);
    return true;
  }

  return { prestigeAccount, spendPerkPoint, respecPerks, freeRespecPerks, changeChallenge, completeChallengeIfMet };
}
