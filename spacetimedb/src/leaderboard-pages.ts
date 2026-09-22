import { table, t } from "spacetimedb/server";
import { LEADERBOARD_STATS, LEADERBOARD_PAGE_SIZE, leaderboardStat, leaderboardWindowRanks } from "../../shared/leaderboard-window";
import type { GameReducerContext, GameViewContext } from "./index";
import type { Identity } from "spacetimedb";

export const leaderboardPageTables = {
  leaderboardPosition: table({ public: false }, {
    identity: t.identity().primaryKey(), ranks: t.array(t.u32()),
  }),
  leaderboardRankPage: table({ public: false }, {
    key: t.string().primaryKey(), identities: t.array(t.identity()),
  }),
  leaderboardSize: table({ public: false }, { id: t.u8().primaryKey(), total: t.u32() }),
};
type Candidate = { identity: Identity; identityKey: string; displayName: string; prestige: number;
  power: number; damage: number; maxHp: number; armor: number; regen: number; playedMicros: bigint };

/** Built once with the shared periodic snapshot, never in a viewer's request. */
export function writeLeaderboardPages(ctx: GameReducerContext, candidates: Candidate[]) {
  const positions = new Map(candidates.map(row => [row.identityKey, { identity: row.identity, ranks: [] as number[] }]));
  const keys = new Set<string>();
  const fields = ["power", "damage", "maxHp", "armor", "regen", "playedMicros"] as const;
  for (const [statIndex, stat] of LEADERBOARD_STATS.entries()) {
    const field = fields[statIndex];
    // Prestige groups the stat boards: the top of the list is the best of the
    // highest prestige, and scrolling past them begins the next prestige, down
    // to the players who have never prestiged. Within a group the board's own
    // stat orders it.
    //
    // Time played is the exception. It is a record of hours, not of power, and
    // prestige does not make an hour bigger.
    const byPrestige = stat !== "time";
    const sorted = [...candidates].sort((a, b) => {
      const prestige = byPrestige ? b.prestige - a.prestige : 0;
      const av = a[field], bv = b[field];
      return prestige || (av > bv ? -1 : av < bv ? 1 : 0)
        || a.displayName.localeCompare(b.displayName) || a.identityKey.localeCompare(b.identityKey);
    });
    sorted.forEach((row, index) => { positions.get(row.identityKey)!.ranks[statIndex] = index + 1; });
    for (let offset = 0; offset < sorted.length; offset += LEADERBOARD_PAGE_SIZE) {
      const key = `${stat}:${offset / LEADERBOARD_PAGE_SIZE}`;
      keys.add(key);
      const next = { key, identities: sorted.slice(offset, offset + LEADERBOARD_PAGE_SIZE).map(row => row.identity) };
      const old = ctx.db.leaderboardRankPage.key.find(key);
      if (!old) ctx.db.leaderboardRankPage.insert(next);
      else if (old.identities.length !== next.identities.length || old.identities.some((id, i) => !id.equals(next.identities[i]))) ctx.db.leaderboardRankPage.key.update(next);
    }
  }
  for (const old of ctx.db.leaderboardRankPage.iter()) if (!keys.has(old.key)) ctx.db.leaderboardRankPage.key.delete(old.key);
  for (const old of ctx.db.leaderboardPosition.iter()) if (!positions.has(old.identity.toHexString())) ctx.db.leaderboardPosition.identity.delete(old.identity);
  for (const next of positions.values()) {
    const old = ctx.db.leaderboardPosition.identity.find(next.identity);
    if (!old) ctx.db.leaderboardPosition.insert(next);
    else if (old.ranks.some((rank, i) => rank !== next.ranks[i])) ctx.db.leaderboardPosition.identity.update(next);
  }
  const size = { id: 0, total: candidates.length };
  if (ctx.db.leaderboardSize.id.find(0)) ctx.db.leaderboardSize.id.update(size);
  else ctx.db.leaderboardSize.insert(size);
}

/** At most 104 entry lookups and four rank pages, independent of population. */
export function readLeaderboardWindow(ctx: Pick<GameViewContext, "db" | "sender">, requested: string) {
  const stat = leaderboardStat(requested);
  const rank = ctx.db.leaderboardPosition.identity.find(ctx.sender)?.ranks[LEADERBOARD_STATS.indexOf(stat)] ?? 0;
  const total = ctx.db.leaderboardSize.id.find(0)?.total ?? 0;
  return readRanks(ctx, stat, leaderboardWindowRanks(rank, total));
}

function readRanks(ctx: Pick<GameViewContext, "db" | "sender">, stat: string, ranks: number[]) {
  const pages = new Map<number, Identity[]>();
  return ranks.flatMap(rank => {
    const page = Math.floor((rank - 1) / LEADERBOARD_PAGE_SIZE);
    if (!pages.has(page)) pages.set(page, ctx.db.leaderboardRankPage.key.find(`${stat}:${page}`)?.identities ?? []);
    const identity = pages.get(page)![(rank - 1) % LEADERBOARD_PAGE_SIZE];
    const entry = identity && ctx.db.leaderboardEntry.identity.find(identity);
    return entry ? [{ rank, entry }] : [];
  });
}

/** Zero starts at the viewer; subsequent requests read at most 100 indexed ranks. */
export function readLeaderboardPage(ctx: Pick<GameViewContext, "db" | "sender">, requested: string, requestedStart: number, requestedCount: number) {
  const stat = leaderboardStat(requested);
  const localRank = ctx.db.leaderboardPosition.identity.find(ctx.sender)?.ranks[LEADERBOARD_STATS.indexOf(stat)] ?? 0;
  const total = ctx.db.leaderboardSize.id.find(0)?.total ?? 0;
  const initial = requestedStart === 0;
  const startRank = initial ? Math.max(1, localRank - 50) : Math.max(1, Math.floor(requestedStart));
  const count = initial ? localRank > 0 ? 101 : 100 : Math.max(1, Math.min(LEADERBOARD_PAGE_SIZE, Math.floor(requestedCount)));
  const endRank = Math.min(total, initial && localRank > 0 ? localRank + 50 : startRank + count - 1);
  const ranks = initial ? leaderboardWindowRanks(localRank, total)
    : Array.from({ length: Math.max(0, endRank - startRank + 1) }, (_, index) => startRank + index);
  return { entries: readRanks(ctx, stat, ranks), startRank, endRank, localRank, total };
}
