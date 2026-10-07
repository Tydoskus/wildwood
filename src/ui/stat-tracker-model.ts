export const TRACKED_STATS = ['power', 'hp', 'damage', 'armor', 'regen', 'kills'] as const;
export type TrackedStat = typeof TRACKED_STATS[number];
export type TrackerValues = Record<TrackedStat, number>;
/**
 * Which build the figures belong to. `run` names the run (the main one, or a
 * challenge's); `basePower` is the power of the stats kills raise, before gear
 * and research, which only climbs within one run.
 */
export type TrackerBuild = { run: string; basePower: number };
type Session = { startedAt: number; baseline: TrackerValues; lastKills: number; prestigeLevel: number; run?: string; peakBasePower?: number };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * A fall in base power past this share is another run: an Aggro run started
 * over after a death, or a prestige whose level row came first. Autofarm's
 * gain meter starts over on a fall in power the same way.
 */
export const RUN_POWER_FALL = .1;
/**
 * A changed run must hold this long before the session starts over: a
 * reconnect reads every challenge as off, and research as none, until the
 * rows come back.
 */
export const RUN_SETTLE_MS = 5_000;

function validValues(value: unknown): value is TrackerValues {
  return Boolean(value && typeof value === 'object' && TRACKED_STATS.every(key => {
    const number = (value as TrackerValues)[key];
    return Number.isFinite(number) && number >= 0;
  }));
}
const validBuild = (build: TrackerBuild | undefined) =>
  build && typeof build.run === 'string' && Number.isFinite(build.basePower) && build.basePower >= 0 ? build : undefined;

/** Exact own-character values; elapsed time includes time away, as in tracker v2.8. */
export function createStatTrackerModel(storage: Store, now = Date.now) {
  let prestigeLevel = 0;
  let identity = '', session: Session | null = null, current: TrackerValues | null = null;
  let build: TrackerBuild | undefined, changedRunSince: number | null = null;
  const key = () => `wildstat-native-stat-tracker-v1:${identity}`;
  function save() {
    if (identity && session) try { storage.setItem(key(), JSON.stringify(session)); } catch {}
  }
  function reset() {
    if (!current) return;
    changedRunSince = null;
    session = { startedAt: now(), baseline: { ...current }, lastKills: current.kills, prestigeLevel,
      ...(build ? { run: build.run, peakBasePower: build.basePower } : {}) };
    save();
  }
  /** Another run than the session's: a challenge started or ended, or the build fell back toward starting stats. */
  function runChanged() {
    if (!session || !build) return false;
    if (session.run !== undefined && session.run !== build.run) return true;
    return session.peakBasePower !== undefined && build.basePower < session.peakBasePower * (1 - RUN_POWER_FALL);
  }
  function update(nextIdentity: string, values: TrackerValues, nextPrestigeLevel = 0, nextBuild?: TrackerBuild) {
    if (!nextIdentity || !validValues(values)) return null;
    if (identity !== nextIdentity) {
      save();
      identity = nextIdentity;
      session = null;
      changedRunSince = null;
      try {
        const saved = JSON.parse(storage.getItem(key()) || 'null');
        if (saved && Number.isFinite(saved.startedAt) && saved.startedAt >= 0 && saved.startedAt <= now()
          && validValues(saved.baseline) && Number.isFinite(saved.lastKills) && saved.lastKills >= 0) {
          session = { ...saved, prestigeLevel: Number.isSafeInteger(saved.prestigeLevel) && saved.prestigeLevel >= 0 ? saved.prestigeLevel : 0,
            run: typeof saved.run === 'string' ? saved.run : undefined,
            peakBasePower: Number.isFinite(saved.peakBasePower) && saved.peakBasePower >= 0 ? saved.peakBasePower : undefined };
        }
      } catch {}
    }
    prestigeLevel = Number.isSafeInteger(nextPrestigeLevel) && nextPrestigeLevel >= 0 ? nextPrestigeLevel : 0;
    current = { ...values };
    build = validBuild(nextBuild);
    // Prestige keeps lifetime kills. A temporarily absent prestige row reads as
    // zero and must not erase a session's known level during hydration.
    if (!session || values.kills < session.lastKills || prestigeLevel > (session.prestigeLevel ?? 0)) reset();
    // A challenge swaps the whole build, so its gains and time are its own.
    // The new run's figures become the baseline once the change has held.
    if (runChanged()) {
      changedRunSince ??= now();
      if (now() - changedRunSince >= RUN_SETTLE_MS) reset();
    } else {
      changedRunSince = null;
      // Sessions saved before runs were told apart take the run they are read in.
      if (build) {
        session!.run ??= build.run;
        session!.peakBasePower = Math.max(session!.peakBasePower ?? 0, build.basePower);
      }
    }
    prestigeLevel = Math.max(prestigeLevel, session!.prestigeLevel ?? 0);
    session!.prestigeLevel = prestigeLevel;
    session!.lastKills = values.kills;
    const elapsedMs = Math.max(0, now() - session!.startedAt);
    return {
      elapsedMs,
      rows: TRACKED_STATS.map(stat => {
        // Base stats only climb, so a figure below the baseline is a gear swap
        // rather than progress. Report no gain instead of a loss, which would
        // otherwise persist for the session and drag the hourly rate negative.
        const gain = Math.max(0, values[stat] - session!.baseline[stat]);
        return { stat, current: values[stat], gain, perHour: elapsedMs >= 1000 ? gain * 3_600_000 / elapsedMs : 0 };
      }),
    };
  }
  return { update, reset, save };
}
