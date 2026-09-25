export const LEADERBOARD_STATS = ["power", "damage", "health", "armor", "regen", "time"] as const;
export type LeaderboardStat = typeof LEADERBOARD_STATS[number];
export const LEADERBOARD_PAGE_SIZE = 100;
/** Dragon access is reset by prestige, but a prestige level proves the player beat it. */
export function leaderboardEligible(desertUnlocked: boolean | undefined, prestigeLevel: number | undefined): boolean {
  return Boolean(desertUnlocked || (prestigeLevel ?? 0) > 0);
}
export function leaderboardStat(value: string): LeaderboardStat {
  if (!(LEADERBOARD_STATS as readonly string[]).includes(value)) throw new Error("Unknown leaderboard stat");
  return value as LeaderboardStat;
}
export function leaderboardWindowRanks(rank: number, total: number) {
  const ranks = new Set<number>();
  for (let i = 1; i <= Math.min(3, total); i++) ranks.add(i);
  // A new character not in the periodic snapshot sees the first page.
  const start = rank > 0 ? Math.max(1, rank - 50) : 1;
  const end = Math.min(total, rank > 0 ? rank + 50 : 100);
  for (let i = start; i <= end; i++) ranks.add(i);
  return [...ranks].sort((a, b) => a - b);
}

export type LeaderboardPage<Entry> = {
  entries: Entry[];
  startRank: number;
  endRank: number;
  localRank: number;
  total: number;
};

/** One prestige level's board, and every level that has anyone on it. */
/**
 * The switcher's choice for the combined board: every player, highest prestige
 * first. It is read from the combined pages, never sent as a prestige level.
 */
export const GLOBAL_LEADERBOARD_PRESTIGE = -1;

export type PrestigeLeaderboardPage<Entry> = LeaderboardPage<Entry> & {
  prestige: number;
  levels: number[];
};
