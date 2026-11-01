import { tables, type DbConnection } from "../../module_bindings";
import { parseRunBossClears, type RunRecord } from "../../../shared/run-timing";

/** The current prestige run's timing as the server keeps it, in milliseconds of active play. */
export type RunTiming = {
  prestige: number;
  /** The account's active play when the run began. */
  startPlayedMs: number;
  /** False for a run already under way when timing began: its start and earlier clears are unknown. */
  wholeRun: boolean;
  /** Each boss's first clear this run, in order: its map, how far into the run's active play, and when. */
  bossClears: { mapId: string; playedMs: number; clearedAtMs: number }[];
};

/** A finished run from the log, newest last. */
export type FinishedRun = RunRecord & { endedAtMs: number };

/**
 * The run timer's row and the finished runs, from the caller-scoped my_run_timing and my_run_history views
 * (run-timing.ts on the server). They live on the account, so the same times show on every device.
 */
export function createRunTimingRows(notify: () => void) {
  let timing: RunTiming | null = null;
  let history: FinishedRun[] = [];
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    timing = null;
    history = [];
    const readHistory = () => {
      if (!isCurrent()) return;
      history = [...connection.db.myRunHistory.iter()].map(row => ({
        prestige: row.prestige, playedMs: Number(row.playedMicros / 1_000n), wholeRun: row.wholeRun,
        bossClears: parseRunBossClears(row.bossClears).map(clear => ({ mapId: clear.mapId, playedMs: clear.playedMicros / 1_000 })),
        endedAtMs: Number(row.endedAt.microsSinceUnixEpoch / 1_000n),
      })).sort((a, b) => a.endedAtMs - b.endedAtMs);
      notify();
    };
    const read = () => {
      if (!isCurrent()) return;
      const [row] = [...connection.db.myRunTiming.iter()];
      timing = row ? {
        prestige: row.prestige,
        startPlayedMs: Number(row.startPlayedMicros / 1_000n),
        wholeRun: row.wholeRun,
        bossClears: parseRunBossClears(row.bossClears).map(clear => ({
          mapId: clear.mapId, playedMs: clear.playedMicros / 1_000, clearedAtMs: clear.clearedAtMicros / 1_000,
        })),
      } : null;
      notify();
    };
    connection.db.myRunTiming.onInsert(read);
    connection.db.myRunTiming.onUpdate(read);
    connection.db.myRunTiming.onDelete(read);
    connection.db.myRunHistory.onInsert(readHistory);
    connection.db.myRunHistory.onDelete(readHistory);
    connection.subscriptionBuilder().onApplied(() => { read(); readHistory(); }).subscribe([tables.myRunTiming, tables.myRunHistory]);
  }
  return {
    watch,
    api: {
      /**
       * The prestige run's timer, the same on every device: the server's row plus how long the run has been played
       * so far, from the account's banked play and the session it has open.
       */
      runTimingWith(lifetime: { playedSeconds: number; sessionStartedAtMs: number } | undefined, nowMs = Date.now()) {
        if (!timing) return null;
        const playedMs = lifetime ? lifetime.playedSeconds * 1_000 + Math.max(0, nowMs - lifetime.sessionStartedAtMs) : timing.startPlayedMs;
        return { ...timing, runPlayedMs: Math.max(0, playedMs - timing.startPlayedMs) };
      },
      /** Every finished run, oldest first. */
      runHistory: (): readonly FinishedRun[] => history,
    },
  };
}
