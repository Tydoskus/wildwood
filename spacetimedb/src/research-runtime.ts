// Research timers: availability checks, the scheduled completion row, and
// reconciling an active research against the player's current ranks. Moved
// out of index.ts unchanged; the research reducers stay there.
import { createResearchState } from "./research-state";
import { updateSnapshotRow, insertSnapshotRow } from "./snapshot-row-writes";
import { type ResearchId, RESEARCH_DEFINITIONS, researchIsAvailable, isResearchId, researchDurationMs } from "../../shared/research";
import { SenderError } from "spacetimedb/server";
import { refreshActiveSlotUpgrades } from "./upgrade-bench-slots";
import { readPlayerProgress } from "./wide-stats";
import { savedAttackRange, effectiveMovementSpeedForProgress } from "./player-speed";
import { syncPlayerMotionIdentity, playerWithMotion } from "./presence-runtime";
import { ScheduleAt, Timestamp } from "spacetimedb";
import { reconcileActiveItemUpgrade } from "./item-upgrade-runtime";
import { powerFieldsForProgress } from "./player-power";
import { isLuckResearchId, writeLuckRanks } from "./luck-research";
import { touchCombatProfile } from "./combat-profile";
import { LUCK_RESEARCH_IDS, RANK_TABLE_RESEARCH_IDS, isRankTableResearchId } from "../../shared/research";
import { writeRankTableRanks } from "./research-rank";

export const researchForPlayer = createResearchState({ updateSnapshotRow, insertSnapshotRow });

/**
 * Stores ranks from researchForPlayer: luck to player_luck_research, the rank-table research to player_research_rank,
 * the rest to player_research.
 */
export function writeResearchRanks(ctx: any, identity: any, research: Record<string, any>, changed: ResearchId) {
  // Research also completes on the scheduler's clock, where no reducer of this player's bumps the stamp.
  touchCombatProfile(ctx, identity);
  if (isLuckResearchId(changed)) { writeLuckRanks(ctx, identity, research); return; }
  if (isRankTableResearchId(changed)) { writeRankTableRanks(ctx, identity, research); return; }
  const row: Record<string, any> = { ...research, identity };
  for (const id of [...LUCK_RESEARCH_IDS, ...RANK_TABLE_RESEARCH_IDS]) delete row[id];
  updateSnapshotRow(ctx, "playerResearch", row as any);
}

export function assertResearchAvailable(research: Record<ResearchId, number>, researchId: ResearchId) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  if (research[researchId] >= definition.maxRank) throw new SenderError("Research already complete.");
  if (!researchIsAvailable(researchId, research)) throw new SenderError("Research prerequisites not met.");
}

export function activeResearchIsAvailable(research: Record<ResearchId, number>, active: any) {
  const researchId = String(active.researchId);
  if (!isResearchId(researchId)) return false;
  const definition = RESEARCH_DEFINITIONS[researchId];
  if (research[researchId] >= definition.maxRank) return false;
  // Prerequisites are authoritative when research starts. Once accepted, keep
  // that rank valid across later tree-layout migrations so no active progress
  // is discarded merely because its node connections changed.
  return active.targetRank === research[researchId] + 1;
}

export function activeResearchCanComplete(research: Record<ResearchId, number>, active: any) {
  return activeResearchIsAvailable(research, active);
}

export function removeResearchCompletionSchedules(ctx: any, identity: any) {
  const scheduledIds = [...ctx.db.researchCompletionSchedule.identity.filter(identity) as Iterable<any>]
    .map((scheduled: any) => scheduled.scheduledId);
  for (const scheduledId of scheduledIds) ctx.db.researchCompletionSchedule.scheduledId.delete(scheduledId);
}

export function completeActiveResearch(ctx: any, active: any) {
  const research = researchForPlayer(ctx, active.identity);
  if (!activeResearchCanComplete(research, active)) {
    ctx.db.activeResearch.identity.delete(active.identity);
    removeResearchCompletionSchedules(ctx, active.identity);
    return false;
  }
  const nextResearch = { ...research, [active.researchId]: active.targetRank };
  writeResearchRanks(ctx, active.identity, nextResearch, active.researchId);
  if (active.researchId === "slotUpgradeSpeed") refreshActiveSlotUpgrades(ctx, active.identity, reconcileActiveItemUpgrade);
  let progress = readPlayerProgress(ctx, active.identity);
  if (progress && active.researchId === "utilityAttackRange") {
    progress = { ...progress, attackRange: savedAttackRange(ctx, active.identity) };
    updateSnapshotRow(ctx, "playerProgress", progress);
  }
  const player = ctx.db.player.identity.find(active.identity);
  if (progress && player) {
    const nextPlayer = {
      ...player,
      speed: effectiveMovementSpeedForProgress(ctx, progress, nextResearch),
      ...powerFieldsForProgress(ctx, progress),
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
  ctx.db.activeResearch.identity.delete(active.identity);
  removeResearchCompletionSchedules(ctx, active.identity);
  return true;
}

export function ensureResearchCompletionSchedule(ctx: any, active: any) {
  const completesAtMicros = active.completesAt.microsSinceUnixEpoch;
  for (const scheduled of [...ctx.db.researchCompletionSchedule.identity.filter(active.identity) as Iterable<any>]) {
    if (scheduled.researchId === active.researchId && scheduled.targetRank === active.targetRank && scheduled.completesAtMicros === completesAtMicros) return;
    ctx.db.researchCompletionSchedule.scheduledId.delete(scheduled.scheduledId);
  }
  ctx.db.researchCompletionSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(active.completesAt.microsSinceUnixEpoch),
    identity: active.identity,
    researchId: active.researchId,
    targetRank: active.targetRank,
    completesAtMicros,
  });
}

/**
 * Repairs missing schedules and rebases legacy timers only toward the current,
 * shorter curve. Maintenance calls this for offline players; registration is
 * merely a fast path, never the only recovery mechanism.
 */
export function reconcileActiveResearch(ctx: any, active: any) {
  const research = researchForPlayer(ctx, active.identity);
  if (!activeResearchCanComplete(research, active)) {
    completeActiveResearch(ctx, active);
    return { active: null, completed: false };
  }
  const researchId = active.researchId as ResearchId;
  const expectedCompletesAtMicros = active.startedAt.microsSinceUnixEpoch +
    BigInt(researchDurationMs(researchId, active.targetRank - 1, research.researchSpeed)) * 1_000n;
  const storedCompletesAtMicros = active.completesAt.microsSinceUnixEpoch;
  const completesAtMicros = storedCompletesAtMicros < expectedCompletesAtMicros
    ? storedCompletesAtMicros
    : expectedCompletesAtMicros;
  const nextActive = completesAtMicros === storedCompletesAtMicros
    ? active
    : { ...active, completesAt: new Timestamp(completesAtMicros) };

  if (ctx.timestamp.microsSinceUnixEpoch >= completesAtMicros) {
    return { active: null, completed: completeActiveResearch(ctx, nextActive) };
  }
  if (nextActive !== active) ctx.db.activeResearch.identity.update(nextActive);
  ensureResearchCompletionSchedule(ctx, nextActive);
  return { active: nextActive, completed: false };
}
