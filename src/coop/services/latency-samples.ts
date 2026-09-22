/** How many round trips the reading is taken from. Odd, so there is a middle. */
export const LATENCY_WINDOW = 7;

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
 * change once most of the window agrees with it — about four seconds at one
 * sample a second.
 */
export function createLatencySamples(window = LATENCY_WINDOW) {
  let samples: number[] = [];

  return {
    record(sample: number) {
      if (!Number.isFinite(sample) || sample < 0) return;
      samples.push(sample);
      if (samples.length > window) samples.shift();
    },
    /** Null until there is anything to report, which the HUD shows as blank. */
    value(): number | null {
      if (!samples.length) return null;
      const sorted = [...samples].sort((left, right) => left - right);
      return sorted[Math.floor(sorted.length / 2)];
    },
    reset() { samples = []; },
    get size() { return samples.length; },
  };
}
