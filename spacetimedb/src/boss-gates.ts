import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { proceduralMapNumber } from "../../shared/procedural-maps";
import { readPlayerProgress } from "./wide-stats";
import { updateSnapshotRow } from "./snapshot-row-writes";
import type { GameReducerContext } from "./index";

/** The caller has checked the owning session, report sequence and current map.
 * Local boss combat reports a gate clear, never a stat, loot or currency reward.
 * Repeated clears are no-ops. The historical claim bits remain save metadata for
 * campaign access, prestige and challenge completion.
 */
export function recordBossGateClear(ctx: GameReducerContext, mapId: string) {
  const number = proceduralMapNumber(mapId);
  if (number !== null) {
    const previous = ctx.db.proceduralProgress.identity.find(ctx.sender);
    if ((previous?.completed ?? 0) >= number) return null;
    const next = { identity: ctx.sender, completed: number };
    if (previous) ctx.db.proceduralProgress.identity.update(next); else ctx.db.proceduralProgress.insert(next);
    return { changed: true, previousProgress: null };
  }
  const index = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
  if (index < 0) return null;
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) return null;
  const claims = (progress.bossRewardClaims | 2 ** CAMPAIGN_MAPS[index].claimIndex) >>> 0;
  const unlock = CAMPAIGN_MAPS[index + 1]?.unlockField;
  const legacyUnlock = (CAMPAIGN_UNLOCK_FIELDS as readonly string[]).includes(unlock) ? unlock : null;
  if (claims === progress.bossRewardClaims && (!legacyUnlock || progress[legacyUnlock])) return null;
  updateSnapshotRow(ctx, "playerProgress", { ...progress, bossRewardClaims: claims, ...(legacyUnlock ? { [legacyUnlock]: true } : {}) });
  return { changed: true, previousProgress: progress };
}
