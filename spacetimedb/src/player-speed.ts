import { effectivePlayerMovementSpeed } from "../../shared/rules";
import { prestigePerkValue } from "../../shared/prestige-perks";
import { attackRangeWithResearch } from "../../shared/utility-research";
import { updateSnapshotRow } from "./snapshot-row-writes";

/** The server's saved movement speed, including both research trees. */
export function effectiveMovementSpeedForProgress(ctx: any, progress: any, research?: any) {
  const ranks = research ?? ctx.db.playerResearch.identity.find(progress.identity);
  return effectivePlayerMovementSpeed(
    false,
    ranks?.moveSpeed ?? 0,
    progress.speedOverride ?? 0,
    ranks?.utilityMoveSpeed ?? 0,
  ) * (1 + prestigePerkValue(ctx.db.playerPrestigeExpansionPerk.identity.find(progress.identity), "fleetFoot"));
}

/** Saved range includes research and Long Shot, while base stat totals stay unchanged. */
export function prestigeRangeBonus(ctx: any, identity: any) {
  return prestigePerkValue(ctx.db.playerPrestigeExpansionPerk.identity.find(identity), "longShot");
}

/** Refresh saved range and live movement immediately when a perk point is spent. */
export function refreshPrestigeMovement(ctx: any, activePlayer: any, syncMotion: (player: any) => void) {
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) return;
  const next = { ...progress, attackRange: attackRangeWithResearch(ctx.db.playerResearch.identity.find(ctx.sender)?.utilityAttackRange ?? 0) + prestigeRangeBonus(ctx, ctx.sender) };
  updateSnapshotRow(ctx, "playerProgress", next);
  const player = { ...activePlayer, speed: effectiveMovementSpeedForProgress(ctx, next) };
  updateSnapshotRow(ctx, "player", player);
  syncMotion(player);
}
