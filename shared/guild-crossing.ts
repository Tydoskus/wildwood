/**
 * The Glass Crossing: a weekly whole-guild 50/50 glass bridge challenge.
 *
 * Sixteen paired glass tiles span a chasm toward a Victory Portal. Each step
 * hides one safe tile and one fragile tile (generated secretly on the server
 * per guild per week). Stepping safely advances the guild and preserves your
 * daily try for a hot streak; stepping on fragile glass shatters it, spends
 * your try, leaves your memorial on that tile for the rest of the week, and
 * reveals the opposite tile as safe so your guildmates immediately push ahead.
 *
 * Tries reset daily at 00:00 UTC and scale gently for smaller guilds so even a
 * 1–4 member guild can finish within a week while 20-member guilds play as a
 * coordinated team. Milestone and clear points are pure bonus Guild Quest
 * Points (+50 total) + Hall Fund, never consuming the 300-quest weekly pool.
 */
export const CROSSING_STEPS = 16;

export const CROSSING_MILESTONES = Object.freeze([
  { step: 6, points: 10 },
  { step: 12, points: 15 },
  { step: CROSSING_STEPS, points: 25 },
] as const);

export const CROSSING_MAX_POINTS = CROSSING_MILESTONES.reduce((sum, entry) => sum + entry.points, 0);

export type CrossingSide = "left" | "right";
export type CrossingChoice = CrossingSide | "finish";

export type CrossingFall = {
  /** 0-based step index (0..15). */
  step: number;
  side: CrossingSide;
  name: string;
  identity: string;
  profileIcon: number;
  atMs: number;
};

export type CrossingPioneer = {
  /** 0-based step index (0..15). */
  step: number;
  side: CrossingSide;
  name: string;
  identity: string;
  profileIcon: number;
};

export type GuildCrossingSummary = {
  revealed: number;
  steps: number;
  completed: boolean;
  pointsAwarded: number;
  maxPoints: number;
  fallsCount: number;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  winnerName: string | null;
};

export type GuildCrossingSnapshot = GuildCrossingSummary & {
  week: number;
  day: number;
  resetsAtMs: number;
  nextDayAtMs: number;
  guildId: string;
  guildName: string;
  guildEmblem: number;
  memberCount: number;
  /** Safe side for each already-revealed step (length === revealed). Never contains unrevealed steps. */
  revealedSides: CrossingSide[];
  falls: CrossingFall[];
  pioneers: CrossingPioneer[];
  winner: { name: string; identity: string; profileIcon: number } | null;
  currentStreak: number;
  bestStreak: number;
};

/**
 * Daily tries per member: 1/day for 11–20 member guilds (normal team difficulty),
 * 2/day for 5–10 member guilds, and 3/day for 1–4 member guilds (so even a solo
 * guild gets 21 tries/week, beating worst-case 16 falls + 1 winning cross).
 */
export function dailyCrossingAttempts(memberCount: number): number {
  const count = Math.max(1, Math.floor(Number.isFinite(memberCount) ? memberCount : 1));
  if (count <= 4) return 3;
  if (count <= 10) return 2;
  return 1;
}

/** Total Guild Quest Points unlocked by reaching `revealed` steps and optional `completed` clear. */
export function crossingPointsForState(revealed: number, completed: boolean): number {
  const safeRevealed = Math.max(0, Math.min(CROSSING_STEPS, Math.floor(revealed)));
  let total = 0;
  for (const milestone of CROSSING_MILESTONES) {
    if (milestone.step === CROSSING_STEPS) {
      if (completed) total += milestone.points;
    } else if (safeRevealed >= milestone.step) {
      total += milestone.points;
    }
  }
  return total;
}

export function oppositeCrossingSide(side: CrossingSide): CrossingSide {
  return side === "left" ? "right" : "left";
}
