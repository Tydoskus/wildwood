import { SenderError, table, t } from "spacetimedb/server";

/**
 * Research set aside (0.860): the rank it was working toward and the time it
 * still needed. Starting that research again picks up from here, so a player
 * can pause one, run another, and come back without losing the time spent.
 * One row per research, so several can wait at once; only one ever runs.
 */
export const pausedResearch = table({ name: "paused_research", public: true }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), researchId: t.string(),
  targetRank: t.u32(), remainingMicros: t.u64(), pausedAt: t.timestamp(),
});

export function pausedResearchKey(identity: { toHexString(): string }, researchId: string) {
  return `${identity.toHexString()}:${researchId}`;
}

/** The pause_research reducer: settles the running research, then shelves it and frees the slot. */
export function pauseActiveResearch(ctx: any, reconcile: (ctx: any, active: any) => { active: any }, removeSchedules: (ctx: any, identity: any) => void) {
  const current = ctx.db.activeResearch.identity.find(ctx.sender);
  if (!current) throw new SenderError("No research is active.");
  const { active } = reconcile(ctx, current);
  if (!active) return;
  shelveResearch(ctx, active);
  ctx.db.activeResearch.identity.delete(ctx.sender);
  removeSchedules(ctx, ctx.sender);
}

function shelveResearch(ctx: any, active: any) {
  const remainingMicros = active.completesAt.microsSinceUnixEpoch - ctx.timestamp.microsSinceUnixEpoch;
  const row = {
    key: pausedResearchKey(active.identity, active.researchId), identity: active.identity, researchId: active.researchId,
    targetRank: active.targetRank, remainingMicros: remainingMicros > 0n ? remainingMicros : 1n, pausedAt: ctx.timestamp,
  };
  if (ctx.db.pausedResearch.key.find(row.key)) ctx.db.pausedResearch.key.update(row);
  else ctx.db.pausedResearch.insert(row);
}

/**
 * Takes the paused row for this research, if any, and returns the time it
 * still needs. A row for another rank is stale and simply dropped. The caller
 * backdates the start by the time already spent, so the timer, the progress
 * bar and reconciliation all agree.
 */
export function takePausedResearch(ctx: any, identity: any, researchId: string, targetRank: number, durationMicros: bigint) {
  const paused = ctx.db.pausedResearch.key.find(pausedResearchKey(identity, researchId));
  if (!paused) return durationMicros;
  ctx.db.pausedResearch.key.delete(paused.key);
  if (paused.targetRank !== targetRank) return durationMicros;
  return paused.remainingMicros < durationMicros ? paused.remainingMicros : durationMicros;
}

export function removePausedResearch(ctx: any, identity: any) {
  for (const row of [...ctx.db.pausedResearch.identity.filter(identity)] as any[]) ctx.db.pausedResearch.key.delete(row.key);
}
