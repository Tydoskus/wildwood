import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import {
  LEADERBOARD_PAGE_SIZE, LEADERBOARD_SKILL_BOARDS, isSkillLeaderboardBoard, leaderboardWindowRanks,
  type SkillLeaderboardBoard,
} from "../../shared/leaderboard-window";
import { normalizeFishingExperience } from "../../shared/fishing";
import { normalizeMining } from "../../shared/mining";
import { normalizeWoodcutting } from "../../shared/woodcutting";

/**
 * Town skill leaderboards (Fishing, Cooking, Mining, Woodcutting, Smithing, Fletching, Enchanting).
 * Stored in their own private paging tables so existing core leaderboard views and procedures stay
 * 100% compatible with older clients.
 */
export const skillLeaderboardTables = {
  skillLeaderboardPage: table({ name: "skill_leaderboard_page", public: false }, {
    key: t.string().primaryKey(),
    identities: t.array(t.identity()),
  }),
  skillLeaderboardSize: table({ name: "skill_leaderboard_size", public: false }, {
    board: t.string().primaryKey(),
    total: t.u32(),
  }),
  playerSkillStanding: table({ name: "player_skill_standing", public: false }, {
    identity: t.identity().primaryKey(),
    pages: t.array(t.u32()),
  }),
};

type Ctx = any;
const pageKey = (board: SkillLeaderboardBoard, page: number) => `${board}:${page}`;

/** Raw sort score for one player on one skill board: XP for Fishing/Crafting, stat for Mining/Woodcutting. */
export function skillScoreFor(ctx: Ctx, board: SkillLeaderboardBoard, identity: Identity): bigint {
  if (board === "skill:fishing") return BigInt(normalizeFishingExperience(ctx.db.playerFishing.identity.find(identity)?.experience));
  if (board === "skill:mining") return BigInt(normalizeMining(ctx.db.playerMining.identity.find(identity)?.mining));
  if (board === "skill:woodcutting") return BigInt(normalizeWoodcutting(ctx.db.playerWoodcutting.identity.find(identity)?.woodcutting));
  const craft = board.slice("skill:".length);
  const xp = ctx.db.playerCraftSkill.key.find(`${identity.toHexString()}:${craft}`)?.experience ?? 0n;
  return xp > 0n ? xp : 0n;
}

/** Rebuilds every skill board's pages for the given eligible identities; writes only pages and standings that changed. */
export function writeSkillLeaderboardPages(ctx: Ctx, identities: readonly Identity[]) {
  if (!ctx.db.skillLeaderboardPage || !ctx.db.skillLeaderboardSize || !ctx.db.playerSkillStanding) return;
  const pagesByIdentity = new Map<string, { identity: Identity; pages: number[] }>(
    identities.map(identity => [identity.toHexString(), { identity, pages: LEADERBOARD_SKILL_BOARDS.map(() => 0) }]),
  );
  const livePages = new Set<string>();
  const byHex = (a: Identity, b: Identity) => (a.toHexString() < b.toHexString() ? -1 : a.toHexString() > b.toHexString() ? 1 : 0);

  for (const [index, board] of LEADERBOARD_SKILL_BOARDS.entries()) {
    const ranked = identities
      .map(identity => ({ identity, score: skillScoreFor(ctx, board, identity) }))
      .filter(row => row.score > 0n)
      .sort((a, b) => (a.score > b.score ? -1 : a.score < b.score ? 1 : byHex(a.identity, b.identity)));
    for (let offset = 0, page = 0; offset < ranked.length; offset += LEADERBOARD_PAGE_SIZE, page++) {
      const slice = ranked.slice(offset, offset + LEADERBOARD_PAGE_SIZE).map(row => row.identity);
      for (const identity of slice) pagesByIdentity.get(identity.toHexString())!.pages[index] = page + 1;
      const key = pageKey(board, page);
      livePages.add(key);
      const old = ctx.db.skillLeaderboardPage.key.find(key);
      if (!old) ctx.db.skillLeaderboardPage.insert({ key, identities: slice });
      else if (old.identities.length !== slice.length || old.identities.some((id: Identity, i: number) => !id.equals(slice[i]))) {
        ctx.db.skillLeaderboardPage.key.update({ key, identities: slice });
      }
    }
    const size = { board, total: ranked.length };
    const oldSize = ctx.db.skillLeaderboardSize.board.find(board);
    if (!oldSize) ctx.db.skillLeaderboardSize.insert(size);
    else if (oldSize.total !== size.total) ctx.db.skillLeaderboardSize.board.update(size);
  }

  for (const old of [...ctx.db.skillLeaderboardPage.iter()]) if (!livePages.has(old.key)) ctx.db.skillLeaderboardPage.key.delete(old.key);
  for (const old of [...ctx.db.playerSkillStanding.iter()]) {
    if (!pagesByIdentity.has(old.identity.toHexString())) ctx.db.playerSkillStanding.identity.delete(old.identity);
  }
  for (const { identity, pages } of pagesByIdentity.values()) {
    const hasAny = pages.some(page => page > 0);
    const old = ctx.db.playerSkillStanding.identity.find(identity);
    if (!hasAny) { if (old) ctx.db.playerSkillStanding.identity.delete(identity); continue; }
    if (!old) ctx.db.playerSkillStanding.insert({ identity, pages });
    else if (old.pages.length !== pages.length || old.pages.some((page: number, i: number) => page !== pages[i])) {
      ctx.db.playerSkillStanding.identity.update({ identity, pages });
    }
  }
}

export function dropSkillLeaderboardStanding(ctx: Ctx, identity: Identity) {
  if (ctx.db.playerSkillStanding?.identity.find(identity)) ctx.db.playerSkillStanding.identity.delete(identity);
}

export function moveSkillLeaderboardStanding(ctx: Ctx, guest: Identity, account: Identity) {
  const standing = ctx.db.playerSkillStanding?.identity.find(guest);
  if (!standing) return;
  ctx.db.playerSkillStanding.identity.delete(guest);
  if (ctx.db.playerSkillStanding.identity.find(account)) return;
  ctx.db.playerSkillStanding.insert({ ...standing, identity: account });
  for (const [index, board] of LEADERBOARD_SKILL_BOARDS.entries()) {
    const page = standing.pages[index];
    const row = page ? ctx.db.skillLeaderboardPage.key.find(pageKey(board, page - 1)) : null;
    if (row) ctx.db.skillLeaderboardPage.key.update({ ...row, identities: row.identities.map((id: Identity) => id.equals(guest) ? account : id) });
  }
}

/** A player's 1-based rank on a skill board, or 0 when unranked. Two key lookups. */
export function skillLeaderboardRank(ctx: Ctx, board: SkillLeaderboardBoard, identity: Identity) {
  const standing = ctx.db.playerSkillStanding?.identity.find(identity);
  const page = standing?.pages[LEADERBOARD_SKILL_BOARDS.indexOf(board)] ?? 0;
  if (!standing || !page) return 0;
  const place = ctx.db.skillLeaderboardPage.key.find(pageKey(board, page - 1))?.identities.findIndex((id: Identity) => id.equals(identity)) ?? -1;
  return place < 0 ? 0 : (page - 1) * LEADERBOARD_PAGE_SIZE + place + 1;
}

/** Reads a window of ranks on one skill board, with each player's raw skill score (XP or stat). */
export function readSkillLeaderboardRanks(ctx: Ctx, requested: string, requestedStart: number, requestedCount: number) {
  if (!isSkillLeaderboardBoard(requested)) throw new Error("Unknown skill leaderboard board");
  const total = ctx.db.skillLeaderboardSize?.board.find(requested)?.total ?? 0;
  const localRank = skillLeaderboardRank(ctx, requested, ctx.sender);
  const initial = requestedStart === 0;
  const startRank = initial ? Math.max(1, localRank - 50) : Math.max(1, Math.floor(requestedStart));
  const count = initial ? localRank > 0 ? 101 : 100 : Math.max(1, Math.min(LEADERBOARD_PAGE_SIZE, Math.floor(requestedCount)));
  const endRank = Math.min(total, initial && localRank > 0 ? localRank + 50 : startRank + count - 1);
  const ranks = initial ? leaderboardWindowRanks(localRank, total)
    : Array.from({ length: Math.max(0, endRank - startRank + 1) }, (_, index) => startRank + index);
  const pages = new Map<number, Identity[]>();
  const entries = ranks.flatMap(rank => {
    const page = Math.floor((rank - 1) / LEADERBOARD_PAGE_SIZE);
    if (!pages.has(page)) pages.set(page, ctx.db.skillLeaderboardPage?.key.find(pageKey(requested, page))?.identities ?? []);
    const identity = pages.get(page)![(rank - 1) % LEADERBOARD_PAGE_SIZE];
    const entry = identity && ctx.db.leaderboardEntry.identity.find(identity);
    if (!entry) return [];
    return [{ rank, entry, score: skillScoreFor(ctx, requested, identity) }];
  });
  return { entries, startRank, endRank, localRank, total };
}
