export const TRACKED_STATS = ['power', 'hp', 'damage', 'armor', 'regen', 'kills'] as const;
export type TrackedStat = typeof TRACKED_STATS[number];
export type TrackerValues = Record<TrackedStat, number>;
type Session = { startedAt: number; baseline: TrackerValues; lastKills: number; prestige?: number };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function validValues(value: unknown): value is TrackerValues {
  return Boolean(value && typeof value === 'object' && TRACKED_STATS.every(key => {
    const number = (value as TrackerValues)[key];
    return Number.isFinite(number) && number >= 0;
  }));
}

/** Exact own-character values; elapsed time includes time away, as in tracker v2.8. */
export function createStatTrackerModel(storage: Store, now = Date.now) {
  let identity = '', session: Session | null = null, current: TrackerValues | null = null, prestige = 0;
  const key = () => `wildstat-native-stat-tracker-v1:${identity}`;
  function save() {
    if (identity && session) try { storage.setItem(key(), JSON.stringify(session)); } catch {}
  }
  function reset() {
    if (!current) return;
    session = { startedAt: now(), baseline: { ...current }, lastKills: current.kills, prestige };
    save();
  }
  function update(nextIdentity: string, values: TrackerValues, prestigeLevel = 0) {
    if (!nextIdentity || !validValues(values)) return null;
    if (identity !== nextIdentity) {
      save();
      identity = nextIdentity;
      session = null;
      try {
        const saved = JSON.parse(storage.getItem(key()) || 'null');
        if (saved && Number.isFinite(saved.startedAt) && saved.startedAt >= 0 && saved.startedAt <= now()
          && validValues(saved.baseline) && Number.isFinite(saved.lastKills) && saved.lastKills >= 0
          && (saved.prestige === undefined || (Number.isInteger(saved.prestige) && saved.prestige >= 0))) session = saved;
      } catch {}
    }
    current = { ...values };
    prestige = prestigeLevel;
    // A character progress reset starts a fresh session instead of negative lifetime kills.
    if (!session || values.kills < session.lastKills || prestigeLevel > (session.prestige ?? 0)) reset();
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
