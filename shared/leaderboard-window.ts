/**
 * The boards. Rivals ranks power among the viewer's own prestige level; Power
 * ranks everyone by power; Prestige by prestige level, power breaking ties;
 * Skills ranks each Town skill (Fishing, Cooking, Mining, Woodcutting, Smithing,
 * Fletching, Enchanting); Time Played by hours; Account Created by when the
 * account began, oldest first. Core boards live as pages of 100 identities
 * (spacetimedb/src/leaderboard-pages.ts); skill boards live in skill-leaderboard.ts.
 */
export const LEADERBOARD_BOARDS = ["rivals", "power", "prestige", "time", "created"] as const;
export type CoreLeaderboardBoard = typeof LEADERBOARD_BOARDS[number];
export const LEADERBOARD_SKILL_VIEWS = [
  { board: "skill:fishing", label: "Fishing", unit: "level" },
  { board: "skill:cooking", label: "Cooking", unit: "level" },
  { board: "skill:mining", label: "Mining", unit: "stat" },
  { board: "skill:woodcutting", label: "Woodcutting", unit: "stat" },
  { board: "skill:smithing", label: "Smithing", unit: "level" },
  { board: "skill:fletching", label: "Fletching", unit: "level" },
  { board: "skill:enchanting", label: "Enchanting", unit: "level" },
] as const;
export type SkillLeaderboardBoard = typeof LEADERBOARD_SKILL_VIEWS[number]["board"];
export const LEADERBOARD_SKILL_BOARDS: readonly SkillLeaderboardBoard[] = LEADERBOARD_SKILL_VIEWS.map(view => view.board);
export type LeaderboardBoard = CoreLeaderboardBoard | SkillLeaderboardBoard;
export const isSkillLeaderboardBoard = (value: string): value is SkillLeaderboardBoard =>
  (LEADERBOARD_SKILL_BOARDS as readonly string[]).includes(value);
/** The window's tabs, Rivals first; Skills and Time Played each switch between their sub-boards. */
export const LEADERBOARD_TABS = ["rivals", "power", "prestige", "skills", "time"] as const;
export type LeaderboardStat = typeof LEADERBOARD_TABS[number];
export const LEADERBOARD_TIME_VIEWS = [
  { board: "time", label: "Time Played" },
  { board: "created", label: "Account Created" },
] as const satisfies readonly { board: LeaderboardBoard; label: string }[];
export const LEADERBOARD_PAGE_SIZE = 100;
/** Dragon access is reset by prestige, but a prestige level proves the player beat it. */
export function leaderboardEligible(desertUnlocked: boolean | undefined, prestigeLevel: number | undefined): boolean {
  return Boolean(desertUnlocked || (prestigeLevel ?? 0) > 0);
}
/** A requested core board. Boards older tabs ask for read the nearest one still kept. */
export function leaderboardBoard(value: string): CoreLeaderboardBoard {
  if ((LEADERBOARD_BOARDS as readonly string[]).includes(value)) return value as CoreLeaderboardBoard;
  if (["damage", "health", "armor", "regen"].includes(value)) return "power";
  if (value === "time-30d" || value === "time-7d") return "time";
  throw new Error("Unknown leaderboard board");
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
  /** The prestige level the Rivals board is for: the viewer's own. */
  prestige?: number;
};
