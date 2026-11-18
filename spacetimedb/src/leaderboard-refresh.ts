// Leaderboard snapshot. A full snapshot recomputes every player; the regular
// one recomputes only players who could have changed (online now, or marked in
// leaderboard_dirty) and sorts everyone else from their standing row. The
// leaderboard tables and views stay in index.ts and leaderboard-pages.ts.
import { iterPlayerProgress, readPlayerProgress } from "./wide-stats";
import { LEADERBOARD_BOARDS, leaderboardEligible } from "../../shared/leaderboard-window";
import { effectivePowerStatsForProgress, powerForProgress } from "./player-power";
import { leaderboardAppearanceForProgress } from "./progress-helpers";
import { writeLeaderboardPages, type Standing } from "./leaderboard-pages";
import { dropSkillLeaderboardStanding, writeSkillLeaderboardPages } from "./skill-leaderboard";
import { legacyU32Power } from "../../shared/player-power";

/** The regular snapshot: online players and those marked since. */
export const LEADERBOARD_REFRESH_INTERVAL_MICROS = 900_000_000n;
/** Every player recomputed, in case something changed one offline without marking them. */
export const LEADERBOARD_FULL_REFRESH_MICROS = 6n * 3_600_000_000n;

export const LEADERBOARD_REFRESH_VERSION = 15;

/** A version no build uses, so refreshLeaderboardIfDue rebuilds on its next pass. */
export const LEADERBOARD_REFRESH_QUEUED = 0;

export const LEADERBOARD_PLAYER_REFRESH_MIN_MICROS = 60_000_000n;

/** leaderboard_refresh_state rows: the last snapshot of either kind, and the last full one. */
const LAST_REFRESH = 1, LAST_FULL_REFRESH = 2;

export function boundedMapPopulation(ctx: any, mapId: string) {
  return ctx.db.playerMotionMapState.mapId.find(mapId)?.playerCount ?? 0;
}

/** Recompute this player at the next snapshot even if they are offline by then. */
export function markLeaderboardDirty(ctx: any, identity: any) {
  if (ctx.db.leaderboardDirty && !ctx.db.leaderboardDirty.identity.find(identity)) ctx.db.leaderboardDirty.insert({ identity });
}

/** A player's entry and sort keys, or null when they are not on the board. */
function rankPlayer(ctx: any, progress: any) {
  if (!progress || ctx.db.virtualPlayer.identity.find(progress.identity)) return null;
  // First runs join after the Dragon; a prestige level retains that credit
  // when the reset clears the current run's Desert access.
  const prestigeLevel = ctx.db.playerPrestige.identity.find(progress.identity)?.level ?? 0;
  if (!leaderboardEligible(progress.desertUnlocked, prestigeLevel)) return null;
  const profile = ctx.db.playerProfile.identity.find(progress.identity);
  if (!profile) return null;
  const current = ctx.db.leaderboardEntry.identity.find(progress.identity);
  const lifetime = ctx.db.playerLifetime.identity.find(progress.identity);
  const active = ctx.db.player.identity.find(progress.identity);
  const activeMicros = lifetime && active
    ? ctx.timestamp.microsSinceUnixEpoch - lifetime.sessionStartedAt.microsSinceUnixEpoch
    : 0n;
  const stats = effectivePowerStatsForProgress(ctx, progress);
  const power = powerForProgress(stats);
  const playedMicros = (lifetime?.playedMicros ?? 0n) + (activeMicros > 0n ? activeMicros : 0n);
  const appearance = leaderboardAppearanceForProgress(ctx, progress, profile);
  const entry = {
    identity: progress.identity, displayName: profile.displayName, power: legacyU32Power(power), powerLevel: power,
    profileIcon: profile.profileIcon, gender: profile.gender, skinTone: appearance.skinTone,
    headItem: appearance.headItem, chestItem: appearance.chestItem, feetItem: appearance.feetItem,
    rightHandItem: appearance.rightHandItem, leftHandItem: appearance.leftHandItem,
    damage: stats.damage, maxHp: stats.maxHp, armor: stats.armor, regen: stats.regen, playedMicros,
    isGuest: ctx.db.playerAccountStatus.identity.find(progress.identity)?.isGuest ?? current?.isGuest ?? false,
  };
  return { entry, current, sortKeys: { prestige: prestigeLevel, power, playedMicros,
    joinedAtMicros: lifetime?.joinedAt.microsSinceUnixEpoch ?? 0n } };
}

const ENTRY_FIELDS = ["displayName", "power", "powerLevel", "profileIcon", "gender", "skinTone", "headItem", "chestItem", "feetItem",
  "rightHandItem", "leftHandItem", "damage", "maxHp", "armor", "regen", "playedMicros", "isGuest"] as const;

function dropPlayer(ctx: any, identity: any) {
  if (ctx.db.leaderboardEntry.identity.find(identity)) ctx.db.leaderboardEntry.identity.delete(identity);
  if (ctx.db.leaderboardStanding.identity.find(identity)) ctx.db.leaderboardStanding.identity.delete(identity);
  dropSkillLeaderboardStanding(ctx, identity);
}

/** The retired per-player rank tables of the per-prestige-level boards, emptied once. */
function clearRetiredTables(ctx: any) {
  for (const table of [ctx.db.leaderboardPosition, ctx.db.leaderboardPrestigePosition]) {
    for (const row of [...table.iter()]) table.identity.delete(row.identity);
  }
  for (const row of [...ctx.db.leaderboardPrestigeRankPage.iter()]) ctx.db.leaderboardPrestigeRankPage.key.delete(row.key);
}

/**
 * A snapshot. `full` recomputes every save; otherwise only players online now
 * and those in leaderboard_dirty are recomputed, and every other player is
 * sorted from the standing the last snapshot left. Either way only the pages
 * and standings that changed are written.
 */
export function refreshLeaderboard(ctx: any, { full = true }: { full?: boolean } = {}) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const standings = new Map<string, Standing>();
  for (const row of ctx.db.leaderboardStanding.iter() as Iterable<Standing>) standings.set(row.identity.toHexString(), row);
  const recompute = (progress: any, identity: any) => {
    const ranked = rankPlayer(ctx, progress);
    const hex = identity.toHexString();
    if (!ranked) { dropPlayer(ctx, identity); standings.delete(hex); return; }
    const { entry, current, sortKeys } = ranked;
    if (!current) ctx.db.leaderboardEntry.insert(entry);
    else if (ENTRY_FIELDS.some(field => current[field] !== entry[field])) ctx.db.leaderboardEntry.identity.update(entry);
    standings.set(hex, { identity, pages: standings.get(hex)?.pages ?? [], ...sortKeys });
  };

  if (full) {
    const seen = new Set<string>();
    for (const progress of iterPlayerProgress(ctx) as Iterable<any>) {
      seen.add(progress.identity.toHexString());
      recompute(progress, progress.identity);
    }
    for (const [hex, standing] of [...standings]) if (!seen.has(hex)) { dropPlayer(ctx, standing.identity); standings.delete(hex); }
    for (const entry of [...ctx.db.leaderboardEntry.iter()] as any[]) {
      if (!standings.has(entry.identity.toHexString())) ctx.db.leaderboardEntry.identity.delete(entry.identity);
    }
    clearRetiredTables(ctx);
  } else {
    const changed = new Map<string, any>();
    for (const player of ctx.db.player.iter() as Iterable<any>) changed.set(player.identity.toHexString(), player.identity);
    for (const row of ctx.db.leaderboardDirty.iter() as Iterable<any>) changed.set(row.identity.toHexString(), row.identity);
    for (const identity of changed.values()) recompute(readPlayerProgress(ctx, identity), identity);
  }
  for (const row of [...ctx.db.leaderboardDirty.iter()] as any[]) ctx.db.leaderboardDirty.identity.delete(row.identity);

  // Sort everyone, write the pages that changed, then the standings that changed.
  const rows = [...standings.values()];
  const pages = writeLeaderboardPages(ctx, rows);
  writeSkillLeaderboardPages(ctx, rows.map(row => row.identity));
  for (const row of rows) {
    const next = { ...row, pages: pages.get(row.identity.toHexString()) ?? LEADERBOARD_BOARDS.map(() => 0) };
    const old = ctx.db.leaderboardStanding.identity.find(row.identity);
    if (!old) ctx.db.leaderboardStanding.insert(next);
    else if (old.prestige !== next.prestige || old.power !== next.power || old.playedMicros !== next.playedMicros
      || old.joinedAtMicros !== next.joinedAtMicros || old.pages.length !== next.pages.length || old.pages.some((page: number, i: number) => page !== next.pages[i])) {
      ctx.db.leaderboardStanding.identity.update(next);
    }
  }

  writeState(ctx, LAST_REFRESH, now);
  if (full) writeState(ctx, LAST_FULL_REFRESH, now);
}

function writeState(ctx: any, id: number, now: bigint) {
  const next = { id, refreshedAtMicros: now, version: LEADERBOARD_REFRESH_VERSION };
  if (ctx.db.leaderboardRefreshState.id.find(id)) ctx.db.leaderboardRefreshState.id.update(next);
  else ctx.db.leaderboardRefreshState.insert(next);
}

/**
 * Rebuild for a player's own action (reset, respec, prestige, login move). It
 * recomputes only the players online, so it is cheap, but at most one runs per
 * minute: a second request inside that minute marks the board stale and the
 * per-minute maintenance pass rebuilds it.
 */
export function requestLeaderboardRefresh(ctx: any) {
  const state = ctx.db.leaderboardRefreshState.id.find(LAST_REFRESH);
  if (state?.version === LEADERBOARD_REFRESH_QUEUED) return;
  if (
    state?.version === LEADERBOARD_REFRESH_VERSION &&
    ctx.timestamp.microsSinceUnixEpoch - state.refreshedAtMicros < LEADERBOARD_PLAYER_REFRESH_MIN_MICROS
  ) {
    ctx.db.leaderboardRefreshState.id.update({ ...state, version: LEADERBOARD_REFRESH_QUEUED });
    return;
  }
  refreshLeaderboard(ctx, { full: !fullIsCurrent(ctx) });
}

/** Whether the last full snapshot is from this build and recent enough. */
function fullIsCurrent(ctx: any) {
  const full = ctx.db.leaderboardRefreshState.id.find(LAST_FULL_REFRESH);
  return full?.version === LEADERBOARD_REFRESH_VERSION
    && ctx.timestamp.microsSinceUnixEpoch - full.refreshedAtMicros < LEADERBOARD_FULL_REFRESH_MICROS;
}

export function refreshLeaderboardIfDue(ctx: any) {
  if (!fullIsCurrent(ctx)) { refreshLeaderboard(ctx, { full: true }); return; }
  const state = ctx.db.leaderboardRefreshState.id.find(LAST_REFRESH);
  if (
    state?.version === LEADERBOARD_REFRESH_VERSION &&
    ctx.timestamp.microsSinceUnixEpoch - state.refreshedAtMicros < LEADERBOARD_REFRESH_INTERVAL_MICROS
  ) return;
  refreshLeaderboard(ctx, { full: false });
}
