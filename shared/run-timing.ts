import { CAMPAIGN_MAPS } from "./campaign-registry";
import { proceduralMapNumber } from "./procedural-map-core";

/** A boss's first clear in a prestige run: its map, how far into the run's active play, and when. */
export type RunBossClear = { mapId: string; playedMicros: number; clearedAtMicros: number };

/** The stored list (player_run_timing.bossClears), read leniently: a malformed entry is skipped, not fatal. */
export function parseRunBossClears(json: string): RunBossClear[] {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(entry => Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(entry[1]) && Number.isFinite(entry[2]))
      .map(([mapId, playedMicros, clearedAtMicros]) => ({ mapId, playedMicros, clearedAtMicros }));
  } catch {
    return [];
  }
}

/** A run, finished or under way, in milliseconds of active play. A run not whole began before timing did. */
export type RunRecord = { prestige: number; playedMs: number; wholeRun: boolean; bossClears: readonly { mapId: string; playedMs: number }[] };

/** Run time with its seconds at any length: "42:07", "3:05:12". */
export function formatRunTime(ms: number) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1_000)) : 0;
  const hours = Math.floor(total / 3_600), minutes = Math.floor(total % 3_600 / 60), seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Against a best: "−0:42" ahead, "+1:05" behind. */
export function formatRunDelta(ms: number) {
  return `${ms < 0 ? "−" : "+"}${formatRunTime(Math.abs(ms))}`;
}

/** A split's name: the campaign map's boss, or the Endless stage. */
export function runSplitName(mapId: string) {
  const map = CAMPAIGN_MAPS.find(entry => entry.id === mapId);
  if (map) return map.bossName;
  const stage = proceduralMapNumber(mapId);
  return stage ? `Endless ${stage}` : mapId;
}

/** Personal bests from whole runs only: the fastest run, and the fastest time into a run to each boss. */
export function runBests(runs: readonly RunRecord[]) {
  let fastest: RunRecord | null = null;
  const splits = new Map<string, number>();
  for (const run of runs) {
    if (!run.wholeRun) continue;
    if (!fastest || run.playedMs < fastest.playedMs) fastest = run;
    for (const clear of run.bossClears) {
      const best = splits.get(clear.mapId);
      if (best === undefined || clear.playedMs < best) splits.set(clear.mapId, clear.playedMs);
    }
  }
  return { fastest, splits };
}

/** The run under way against the bests: its latest boss and how far ahead or behind the best time to it. */
export function latestSplit(run: RunRecord, bests: ReturnType<typeof runBests>) {
  const last = run.bossClears[run.bossClears.length - 1];
  if (!last || !run.wholeRun) return null;
  const best = bests.splits.get(last.mapId);
  return { mapId: last.mapId, deltaMs: best === undefined ? null : last.playedMs - best };
}
