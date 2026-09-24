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
  // The same six boards again, one set per prestige level: a Prestige 2 board
  // ranks Prestige 2 players among themselves, so its rank 1 is the best of
  // that level and its top 100 are that level's own top 100. The position
  // records which level the ranks belong to, and a page is keyed
  // "stat:level:page". The combined tables above stay for tabs still running
  // a client that asks for the combined board.
  leaderboardPrestigePosition: table({ public: false }, {
    identity: t.identity().primaryKey(), prestige: t.u32(), ranks: t.array(t.u32()),
  }),
  leaderboardPrestigeRankPage: table({ public: false }, {
    key: t.string().primaryKey(), identities: t.array(t.identity()),
  }),
  leaderboardPrestigeSize: table({ public: false }, { prestige: t.u32().primaryKey(), total: t.u32() }),
};
type Candidate = { identity: Identity; identityKey: string; displayName: string; prestige: number;
  power: number; damage: number; maxHp: number; armor: number; regen: number; playedMicros: bigint };
type RankPage = { key: string; identities: Identity[] };
type RankPageTable = {
  key: { find(key: string): RankPage | null | undefined; update(row: RankPage): unknown; delete(key: string): unknown };
  insert(row: RankPage): unknown;
  iter(): Iterable<RankPage>;
};

/** Writes a rank page only when its identities changed, and records its key as live. */
function writePage(pages: RankPageTable, keys: Set<string>, key: string, identities: Identity[]) {
  keys.add(key);
  const next = { key, identities };
  const old = pages.key.find(key);
  if (!old) pages.insert(next);
  else if (old.identities.length !== identities.length || old.identities.some((id, i) => !id.equals(identities[i]))) pages.key.update(next);
}

function dropStalePages(pages: RankPageTable, keys: Set<string>) {
  for (const old of [...pages.iter()]) if (!keys.has(old.key)) pages.key.delete(old.key);
}

/** Built once with the shared periodic snapshot, never in a viewer's request. */
export function writeLeaderboardPages(ctx: GameReducerContext, candidates: Candidate[]) {
  const positions = new Map(candidates.map(row => [row.identityKey, { identity: row.identity, ranks: [] as number[] }]));
  const levelPositions = new Map(candidates.map(row => [row.identityKey,
    { identity: row.identity, prestige: Math.max(0, Math.floor(row.prestige)), ranks: [] as number[] }]));
  const levelTotals = new Map<number, number>();
  for (const position of levelPositions.values()) levelTotals.set(position.prestige, (levelTotals.get(position.prestige) ?? 0) + 1);
  const keys = new Set<string>(), levelKeys = new Set<string>();
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
      writePage(ctx.db.leaderboardRankPage, keys, `${stat}:${offset / LEADERBOARD_PAGE_SIZE}`,
        sorted.slice(offset, offset + LEADERBOARD_PAGE_SIZE).map(row => row.identity));
    }
    // Each level's board is the combined order with everyone else taken out.
    // Inside one level the prestige key is equal, so this is the stat's own
    // order on every board, time played included.
    const byLevel = new Map<number, Candidate[]>();
    for (const row of sorted) {
      const position = levelPositions.get(row.identityKey)!;
      const rows = byLevel.get(position.prestige) ?? [];
      rows.push(row);
      byLevel.set(position.prestige, rows);
      position.ranks[statIndex] = rows.length;
    }
    for (const [level, rows] of byLevel) {
      for (let offset = 0; offset < rows.length; offset += LEADERBOARD_PAGE_SIZE) {
        writePage(ctx.db.leaderboardPrestigeRankPage, levelKeys, `${stat}:${level}:${offset / LEADERBOARD_PAGE_SIZE}`,
          rows.slice(offset, offset + LEADERBOARD_PAGE_SIZE).map(row => row.identity));
      }
    }
  }
  dropStalePages(ctx.db.leaderboardRankPage, keys);
  dropStalePages(ctx.db.leaderboardPrestigeRankPage, levelKeys);
  for (const old of ctx.db.leaderboardPosition.iter()) if (!positions.has(old.identity.toHexString())) ctx.db.leaderboardPosition.identity.delete(old.identity);
  for (const next of positions.values()) {
    const old = ctx.db.leaderboardPosition.identity.find(next.identity);
    if (!old) ctx.db.leaderboardPosition.insert(next);
    else if (old.ranks.some((rank, i) => rank !== next.ranks[i])) ctx.db.leaderboardPosition.identity.update(next);
  }
  for (const old of [...ctx.db.leaderboardPrestigePosition.iter()]) {
    if (!levelPositions.has(old.identity.toHexString())) ctx.db.leaderboardPrestigePosition.identity.delete(old.identity);
  }
  for (const next of levelPositions.values()) {
    const old = ctx.db.leaderboardPrestigePosition.identity.find(next.identity);
    if (!old) ctx.db.leaderboardPrestigePosition.insert(next);
    else if (old.prestige !== next.prestige || old.ranks.some((rank, i) => rank !== next.ranks[i])) ctx.db.leaderboardPrestigePosition.identity.update(next);
  }
  for (const old of [...ctx.db.leaderboardPrestigeSize.iter()]) {
    if (!levelTotals.has(old.prestige)) ctx.db.leaderboardPrestigeSize.prestige.delete(old.prestige);
  }
  for (const [prestige, total] of levelTotals) {
    const old = ctx.db.leaderboardPrestigeSize.prestige.find(prestige);
    if (!old) ctx.db.leaderboardPrestigeSize.insert({ prestige, total });
    else if (old.total !== total) ctx.db.leaderboardPrestigeSize.prestige.update({ prestige, total });
  }
  const size = { id: 0, total: candidates.length };
  if (ctx.db.leaderboardSize.id.find(0)) ctx.db.leaderboardSize.id.update(size);
  else ctx.db.leaderboardSize.insert(size);
}

/**
 * A linked guest keeps its place on its level's board until the next snapshot
 * instead of dropping out of it: the guest's leaderboard entry moves to the
 * account in the same transaction, so the pages have to name the account too.
 * Six page reads at most, found from the position rather than by a scan. When
 * the account already had a place of its own, the guest's is dropped and the
 * next snapshot ranks the merged player once.
 */
export function moveLeaderboardPrestigePosition(ctx: GameReducerContext, guest: Identity, account: Identity) {
  const position = ctx.db.leaderboardPrestigePosition.identity.find(guest);
  if (!position) return;
  ctx.db.leaderboardPrestigePosition.identity.delete(guest);
  if (ctx.db.leaderboardPrestigePosition.identity.find(account)) return;
  ctx.db.leaderboardPrestigePosition.insert({ ...position, identity: account });
  for (const [statIndex, stat] of LEADERBOARD_STATS.entries()) {
    const rank = position.ranks[statIndex];
    if (!rank) continue;
    const key = `${stat}:${position.prestige}:${Math.floor((rank - 1) / LEADERBOARD_PAGE_SIZE)}`;
    const page = ctx.db.leaderboardPrestigeRankPage.key.find(key);
    if (page) ctx.db.leaderboardPrestigeRankPage.key.update({ key, identities: page.identities.map(id => id.equals(guest) ? account : id) });
  }
}

type PageLookup = (page: number) => { identities: Identity[] } | null | undefined;

/** At most 104 entry lookups and four rank pages, independent of population. */
export function readLeaderboardWindow(ctx: Pick<GameViewContext, "db" | "sender">, requested: string) {
  const stat = leaderboardStat(requested);
  const rank = ctx.db.leaderboardPosition.identity.find(ctx.sender)?.ranks[LEADERBOARD_STATS.indexOf(stat)] ?? 0;
  const total = ctx.db.leaderboardSize.id.find(0)?.total ?? 0;
  return readRanks(ctx, page => ctx.db.leaderboardRankPage.key.find(`${stat}:${page}`), leaderboardWindowRanks(rank, total));
}

function readRanks(ctx: Pick<GameViewContext, "db" | "sender">, lookup: PageLookup, ranks: number[]) {
  const pages = new Map<number, Identity[]>();
  return ranks.flatMap(rank => {
    const page = Math.floor((rank - 1) / LEADERBOARD_PAGE_SIZE);
    if (!pages.has(page)) pages.set(page, lookup(page)?.identities ?? []);
    const identity = pages.get(page)![(rank - 1) % LEADERBOARD_PAGE_SIZE];
    const entry = identity && ctx.db.leaderboardEntry.identity.find(identity);
    return entry ? [{ rank, entry }] : [];
  });
}

/** Zero starts at the viewer; a later request is clamped to one page of ranks. */
function pageRanks(localRank: number, total: number, requestedStart: number, requestedCount: number) {
  const initial = requestedStart === 0;
  const startRank = initial ? Math.max(1, localRank - 50) : Math.max(1, Math.floor(requestedStart));
  const count = initial ? localRank > 0 ? 101 : 100 : Math.max(1, Math.min(LEADERBOARD_PAGE_SIZE, Math.floor(requestedCount)));
  const endRank = Math.min(total, initial && localRank > 0 ? localRank + 50 : startRank + count - 1);
  const ranks = initial ? leaderboardWindowRanks(localRank, total)
    : Array.from({ length: Math.max(0, endRank - startRank + 1) }, (_, index) => startRank + index);
  return { ranks, startRank, endRank };
}

/** Zero starts at the viewer; subsequent requests read at most 100 indexed ranks. */
export function readLeaderboardPage(ctx: Pick<GameViewContext, "db" | "sender">, requested: string, requestedStart: number, requestedCount: number) {
  const stat = leaderboardStat(requested);
  const localRank = ctx.db.leaderboardPosition.identity.find(ctx.sender)?.ranks[LEADERBOARD_STATS.indexOf(stat)] ?? 0;
  const total = ctx.db.leaderboardSize.id.find(0)?.total ?? 0;
  const { ranks, startRank, endRank } = pageRanks(localRank, total, requestedStart, requestedCount);
  return { entries: readRanks(ctx, page => ctx.db.leaderboardRankPage.key.find(`${stat}:${page}`), ranks), startRank, endRank, localRank, total };
}

/**
 * One prestige level's board, with the same bounds as the combined one. The
 * viewer has a rank only on the level the last snapshot put them on, so a
 * Prestige 2 player browsing the No prestige board opens it at the top.
 * `levels` lists every level that has anyone on it, for the switcher; that is
 * one small row per level, never a row per player.
 */
export function readPrestigeLeaderboardPage(ctx: Pick<GameViewContext, "db" | "sender">, requested: string, requestedLevel: number,
  requestedStart: number, requestedCount: number) {
  const stat = leaderboardStat(requested);
  const prestige = Math.max(0, Math.floor(requestedLevel));
  const position = ctx.db.leaderboardPrestigePosition.identity.find(ctx.sender);
  const localRank = position?.prestige === prestige ? position.ranks[LEADERBOARD_STATS.indexOf(stat)] ?? 0 : 0;
  const total = ctx.db.leaderboardPrestigeSize.prestige.find(prestige)?.total ?? 0;
  const { ranks, startRank, endRank } = pageRanks(localRank, total, requestedStart, requestedCount);
  const entries = readRanks(ctx, page => ctx.db.leaderboardPrestigeRankPage.key.find(`${stat}:${prestige}:${page}`), ranks);
  const levels = [...ctx.db.leaderboardPrestigeSize.iter()].filter(row => row.total > 0).map(row => row.prestige).sort((a, b) => a - b);
  return { entries, startRank, endRank, localRank, total, prestige, levels };
}
