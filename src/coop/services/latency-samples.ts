/** How many round trips the reading is taken from. Odd, so there is a middle. */
export const LATENCY_WINDOW = 7;

/** A reading covers only the last few seconds (0.873); at idle the 7 samples could span 15 s or more. Three, now samples come four a second. */
export const LATENCY_MAX_AGE_MS = 3_000;

/**
 * The connection's latency, as the median of its recent reducer round trips.
 *
 * It used to be an exponential average of every sampled round trip, which made
 * it a reading of the slowest thing the client had recently asked for rather
 * than of the network. A kill report behind a queue, a save, a portal — any of
 * them takes hundreds of milliseconds on the server, and one such sample at
 * .25 smoothing showed as an 800ms ping that then decayed over several
 * seconds. Travelling appeared to cure it only because arriving somewhere new
 * produces a burst of fast reducers that drag the average back down.
 *
 * A median ignores a single slow sample outright, and still follows a real
 * change once most of the window agrees with it. Samples come only with the
 * player's own reducers, at most four a second, so a quiet player's window
 * could reach back 15 seconds or more: now only the last three seconds count,
 * and with nothing that recent, the newest sample stands.
 */
export function createLatencySamples(window = LATENCY_WINDOW, maxAgeMs = LATENCY_MAX_AGE_MS, now = () => performance.now()) {
  let samples: { value: number; at: number }[] = [];

  return {
    record(sample: number) {
      if (!Number.isFinite(sample) || sample < 0) return;
      samples.push({ value: sample, at: now() });
      if (samples.length > window) samples.shift();
    },
    /** Null until there is anything to report, which the HUD shows as blank. */
    value(): number | null {
      if (!samples.length) return null;
      const since = now() - maxAgeMs;
      const recent = samples.filter(sample => sample.at >= since);
      if (!recent.length) return samples[samples.length - 1].value;
      const sorted = recent.map(sample => sample.value).sort((left, right) => left - right);
      return sorted[Math.floor(sorted.length / 2)];
    },
    reset() { samples = []; },
    get size() { return samples.length; },
  };
}
