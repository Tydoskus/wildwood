import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { NO_CARDS, cardStatFactors } from "../../shared/card-effects";
import { attackIntervalUnderNewCap } from "../../shared/stat-rating";
import { attackCapInPlay } from "./prestige";
import { readPlayerProgress } from "./wide-stats";
import { activeCardTotalsFor } from "./active-cards";
import { updateSnapshotRow } from "./snapshot-row-writes";

/**
 * The Quick Draw card raise (attacks a second) the saved attack interval was last placed under. No row is
 * none. Active cards move the cap as they change; this lets the run keep its rating across them.
 */
export const playerCardAttackCap = table({ name: "player_card_attack_cap", public: false }, {
  identity: t.identity().primaryKey(),
  raise: t.f64(),
});

type Ctx = any;

/**
 * Moves the saved attack speed onto the curve the active cards set now, as a Quick Draw perk change does. Returns
 * the active cards it read, for a kill report to use throughout: nothing it does changes them.
 */
export function syncCardAttackCap(ctx: Ctx, identity: Identity) {
  return syncCardAttackCapFor(ctx, identity).worn;
}

/** syncCardAttackCap, plus the save it read when it wrote nothing, so a kill report need not read it again. */
export function syncCardAttackCapFor(ctx: Ctx, identity: Identity) {
  const progress = readPlayerProgress(ctx, identity);
  if (!progress) return { worn: NO_CARDS, progress: undefined };
  const worn = activeCardTotalsFor(ctx, identity);
  const current = cardStatFactors(worn).attackCapRaise;
  const row = ctx.db.playerCardAttackCap.identity.find(identity);
  const basis = row?.raise ?? 0;
  if (Math.abs(current - basis) < 1e-9) return { worn, progress };
  const now = attackCapInPlay(ctx, identity, worn);
  const before = { ...now, raise: Math.max(0, now.raise - current + basis) };
  const attackRate = attackIntervalUnderNewCap(progress.attackRate, before, now);
  if (attackRate !== progress.attackRate) updateSnapshotRow(ctx, "playerProgress", { ...progress, attackRate });
  if (row) ctx.db.playerCardAttackCap.identity.update({ identity, raise: current });
  else ctx.db.playerCardAttackCap.insert({ identity, raise: current });
  return { worn, progress: undefined };
}
