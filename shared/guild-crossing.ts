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

export const GUILD_CROSSING_MAP_PREFIX = "guild_crossing_";
export const guildCrossingMapId = (guildId: bigint | string | number) => `${GUILD_CROSSING_MAP_PREFIX}${String(guildId)}`;
export type GuildCrossingMapId = `guild_crossing_${string}`;
export const isGuildCrossingMap = (mapId: unknown): mapId is GuildCrossingMapId =>
  typeof mapId === "string" && /^guild_crossing_\d{1,20}$/.test(mapId);
/** The guild a Glass Crossing map belongs to, or null for any other map. */
export function guildCrossingGuildId(mapId: unknown): bigint | null {
  return isGuildCrossingMap(mapId) ? BigInt(mapId.slice(GUILD_CROSSING_MAP_PREFIX.length)) : null;
}

/** Playable Glass Crossing world geometry (south-to-north chasm bridge). */
export const GUILD_CROSSING_WORLD = Object.freeze({ width: 1_800, height: 3_600 });
export const GUILD_CROSSING_CENTER_X = 900;
export const GUILD_CROSSING_FEET_OFFSET = 29;
export const GUILD_CROSSING_STEP_Y0 = 2_860;
export const GUILD_CROSSING_STEP_PITCH = 140;
export const GUILD_CROSSING_LEFT_X = 790;
export const GUILD_CROSSING_RIGHT_X = 1_010;
export const GUILD_CROSSING_TILE_W = 156;
export const GUILD_CROSSING_TILE_H = 104;
export const GUILD_CROSSING_START_RECT = Object.freeze({ left: 660, right: 1_140, top: 2_940, bottom: 3_235 });
export const GUILD_CROSSING_FINISH_RECT = Object.freeze({ left: 660, right: 1_140, top: 320, bottom: 640 });
export const GUILD_CROSSING_BRIDGE_X = Object.freeze({ left: 700, right: 1_100 });
/** Portal pad on the south deck of the Start Island returning to Town. */
export const GUILD_CROSSING_EXIT_PAD = Object.freeze({ x: 900, y: 3_170, width: 136, height: 136, depth: 3_170 });
/** Golden Victory Portal at the north end of the Finish Sanctuary. */
export const GUILD_CROSSING_FINISH_PORTAL = Object.freeze({ x: 900, y: 455, r: 78 });
/** Default arrival (Start Island bridgehead, clear of the Return Portal arch); server spawns closer to the live frontier when steps are already solved. */
export const GUILD_CROSSING_ARRIVAL = Object.freeze({ x: 900, y: 2_975 });
/** Courtyard portal in the Guild Hall west lawn leading into the Glass Crossing (mirrors east Fishing Pond). */
export const GUILD_HALL_CROSSING_PORTAL = Object.freeze({ x: 1_450, y: 2_360, width: 140, height: 140, depth: 2_360 });

export const CROSSING_STEP_POINTS = 2;
export const CROSSING_CLEAR_POINTS = 20;
export const CROSSING_MILESTONES = Object.freeze([
  { step: 6, points: 12 },
  { step: 12, points: 12 },
  { step: CROSSING_STEPS, points: 26 },
] as const);

export const CROSSING_MAX_POINTS = (CROSSING_STEPS - 1) * CROSSING_STEP_POINTS + CROSSING_CLEAR_POINTS;

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
  /** Real WildStat body appearance captured when this guildmate fell through the glass. */
  skinTone?: number;
  headItem?: string;
  chestItem?: string;
  feetItem?: string;
  rightHandItem?: string;
  leftHandItem?: string;
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

/**
 * Total Guild Quest Points earned so far: +2 points immediately for every step cleared (1..15 = 30 pts),
 * plus +20 bonus points on crossing the Victory Portal (50 pts total).
 */
export function crossingPointsForState(revealed: number, completed: boolean): number {
  const safeRevealed = Math.max(0, Math.min(CROSSING_STEPS, Math.floor(revealed)));
  const stepPoints = Math.min(CROSSING_STEPS - 1, safeRevealed) * CROSSING_STEP_POINTS;
  return stepPoints + (completed ? CROSSING_CLEAR_POINTS : 0);
}

export function oppositeCrossingSide(side: CrossingSide): CrossingSide {
  return side === "left" ? "right" : "left";
}

/** World Y center of step `step` (0 = closest to Start Platform, 15 = closest to Victory Portal). */
export function crossingStepY(step: number): number {
  return GUILD_CROSSING_STEP_Y0 - step * GUILD_CROSSING_STEP_PITCH;
}

/** World rectangle for one glass pane on `step` (0..15). */
export function crossingTileRect(step: number, side: CrossingSide) {
  const cx = side === "left" ? GUILD_CROSSING_LEFT_X : GUILD_CROSSING_RIGHT_X;
  const cy = crossingStepY(step);
  const hw = GUILD_CROSSING_TILE_W / 2;
  const hh = GUILD_CROSSING_TILE_H / 2;
  return { cx, cy, left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh, width: GUILD_CROSSING_TILE_W, height: GUILD_CROSSING_TILE_H };
}

/**
 * Where a guildmate lands when teleporting into the Glass Crossing: right behind the
 * active frontier step so nobody has to tediously walk across already-solved tiles.
 */
export function crossingFrontierSpawn(revealed: number, completed: boolean, revealedSides?: readonly CrossingSide[]) {
  if (completed) return { x: GUILD_CROSSING_CENTER_X, y: 585 - GUILD_CROSSING_FEET_OFFSET };
  const safeRevealed = Math.max(0, Math.min(CROSSING_STEPS, Math.floor(revealed)));
  if (safeRevealed <= 0) return { ...GUILD_CROSSING_ARRIVAL };
  const lastStep = safeRevealed - 1;
  const side = revealedSides?.[lastStep];
  const x = side ? (side === "left" ? GUILD_CROSSING_LEFT_X : GUILD_CROSSING_RIGHT_X) : GUILD_CROSSING_CENTER_X;
  return { x, y: crossingStepY(lastStep) - GUILD_CROSSING_FEET_OFFSET };
}

/** Which glass pane (`{ step, side }`) contains feet `(feetX, feetY)`, with an inset margin so grazes don't misfire. */
export function crossingTileAt(feetX: number, feetY: number, inset = 14): { step: number; side: CrossingSide } | null {
  for (let step = 0; step < CROSSING_STEPS; step++) {
    const cy = crossingStepY(step);
    if (Math.abs(feetY - cy) > GUILD_CROSSING_TILE_H / 2 - inset) continue;
    if (Math.abs(feetX - GUILD_CROSSING_LEFT_X) <= GUILD_CROSSING_TILE_W / 2 - inset) return { step, side: "left" };
    if (Math.abs(feetX - GUILD_CROSSING_RIGHT_X) <= GUILD_CROSSING_TILE_W / 2 - inset) return { step, side: "right" };
  }
  return null;
}
