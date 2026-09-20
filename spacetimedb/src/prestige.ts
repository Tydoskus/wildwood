import { SenderError } from "spacetimedb/server";
import { researchStatRewardMultiplier } from "../../shared/research";
import { playerPowerForStats } from "../../shared/player-power";
import { PRESTIGE_PERK_POINTS_PER_LEVEL, prestigeStatMultiplier, prestigeUnlocked } from "../../shared/prestige";

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

export type PrestigeDeps = {
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  resetProgressToDefaults: (ctx: any, activePlayer: any) => void;
};

export function createPrestige(deps: PrestigeDeps) {
  const { requireControllingPlayer, activeDuelFor, resetProgressToDefaults } = deps;

  function prestigeAccount(ctx: any) {
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before prestiging.");
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress || !prestigeUnlocked(progress.bossRewardClaims)) {
      throw new SenderError("Defeat Aegis Prime before prestiging.");
    }
    const current = ctx.db.playerPrestige.identity.find(ctx.sender);
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
    resetProgressToDefaults(ctx, activePlayer);
    return next;
  }

  return { prestigeAccount };
}
