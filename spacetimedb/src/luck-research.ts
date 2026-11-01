import { table, t } from "spacetimedb/server";
import { LUCK_RESEARCH_IDS, type LuckResearchId } from "../../shared/research";
import { luckRanksOf, type LuckRanks } from "../../shared/luck-research";
import { researchInPlayFor } from "../../shared/bonus-toggles";
import { bonusOffFor } from "./bonus-toggles";

/**
 * The luck research ranks (shared/luck-research.ts), kept beside player_research in a table of their own so
 * player_research never gains a column. No row is every luck at zero. A new research node does not go here either:
 * it goes in player_research_rank (research-rank.ts), one row per node, which needs no column at all.
 */
export const playerLuckResearch = table({ name: "player_luck_research", public: true }, {
  identity: t.identity().primaryKey(),
  cardLuck: t.u32().default(0),
  gearLuck: t.u32().default(0),
  miningLuck: t.u32().default(0),
  skillLuck: t.u32().default(0),
  refineLuck: t.u32().default(0),
});

export const isLuckResearchId = (id: string): id is LuckResearchId => (LUCK_RESEARCH_IDS as readonly string[]).includes(id);

/** A player's stored luck ranks. */
export function luckRanksFor(ctx: any, identity: any): LuckRanks {
  return luckRanksOf(ctx.db.playerLuckResearch?.identity.find(identity));
}

/** Luck as drops, mining and refines read it: a switched-off luck research at zero (bonus-toggles.ts). */
export function luckInPlay(ctx: any, identity: any, off = bonusOffFor(ctx, identity)): LuckRanks {
  return researchInPlayFor(luckRanksFor(ctx, identity), off) as LuckRanks;
}

/** Stores a player's luck ranks; all zero removes the row. */
export function writeLuckRanks(ctx: any, identity: any, ranks: Partial<Record<string, unknown>>) {
  const next = { identity, ...luckRanksOf(ranks) };
  const current = ctx.db.playerLuckResearch.identity.find(identity);
  if (LUCK_RESEARCH_IDS.every(id => next[id] === 0)) {
    if (current) ctx.db.playerLuckResearch.identity.delete(identity);
  } else if (current) ctx.db.playerLuckResearch.identity.update(next);
  else ctx.db.playerLuckResearch.insert(next);
}

export function deleteLuckResearch(ctx: any, identity: any) {
  if (ctx.db.playerLuckResearch?.identity.find(identity)) ctx.db.playerLuckResearch.identity.delete(identity);
}
