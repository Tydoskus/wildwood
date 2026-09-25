import { SenderError } from "spacetimedb/server";
import { researchStatRewardMultiplier } from "../../shared/research";
import { playerPowerForStats } from "../../shared/player-power";
import { PRESTIGE_CAP_HINT, PRESTIGE_PERK_POINTS_PER_LEVEL, prestigeCapped, prestigeCampaignTarget, prestigeCampaignComplete, prestigeEndlessRequirement, prestigeStatMultiplier, prestigeUnlocked } from "../../shared/prestige";
import { PRESTIGE_PERK_MAX_RANK, isPrestigePerkId, type PrestigePerkRanks } from "../../shared/prestige-perks";

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
    * prestigeStatMultiplier(ctx.db.playerPrestige.identity.find(identity)?.level ?? 0);
}

/** The player's perk ranks, zero for anyone who has never prestiged. */
export function prestigePerkRanks(ctx: any, identity: any): PrestigePerkRanks {
  const row = ctx.db.playerPrestigePerk.identity.find(identity);
  return { keenEdge: row?.keenEdge ?? 0, doubleStrike: row?.doubleStrike ?? 0, splitShot: row?.splitShot ?? 0, riposte: row?.riposte ?? 0 };
}

export type PrestigeDeps = {
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  resetProgressToDefaults: (ctx: any, activePlayer: any, keep?: { research?: boolean; lifetimeKills?: boolean; slotTiers?: boolean; items?: boolean }) => void;
  recordPrestige: (ctx: any) => void;
};

export function createPrestige(deps: PrestigeDeps) {
  const { requireControllingPlayer, activeDuelFor, resetProgressToDefaults, recordPrestige } = deps;

  function prestigeAccount(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before prestiging.");
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    const nextLevel = (current?.level ?? 0) + 1;
    if (prestigeCapped(nextLevel)) throw new SenderError(PRESTIGE_CAP_HINT);
    const completedEndless = ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0;
    if (!progress || !prestigeUnlocked(progress.bossRewardClaims, completedEndless, nextLevel)) {
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

  /** Spend one banked point on one rank. Points never come back. */
  function spendPerkPoint(ctx: any, perk: string) {
    requireControllingPlayer(ctx);
    if (!isPrestigePerkId(perk)) throw new SenderError("Unknown prestige perk.");
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
    if (!current || current.perkPoints < 1) throw new SenderError("No perk points to spend.");
    const ranks = ctx.db.playerPrestigePerk.identity.find(ctx.sender);
    if ((ranks?.[perk] ?? 0) >= PRESTIGE_PERK_MAX_RANK) throw new SenderError("That perk is already at its highest rank.");
    const next = { identity: ctx.sender, ...prestigePerkRanks(ctx, ctx.sender), [perk]: (ranks?.[perk] ?? 0) + 1 };
    if (ranks) ctx.db.playerPrestigePerk.identity.update(next); else ctx.db.playerPrestigePerk.insert(next);
    ctx.db.playerPrestige.identity.update({ ...current, perkPoints: current.perkPoints - 1 });
  }

  return { prestigeAccount, spendPerkPoint };
}
