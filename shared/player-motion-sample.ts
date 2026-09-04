import { analyticalPlayerMotionAt } from "./analytical-player-motion";
import type { PlayerMotionSample } from "./player-motion-frame";

export type MotionSampleRow = {
  networkId: number; x: number; y: number; vx: number; vy: number;
  moving: boolean; simulationTick: number; motionEpoch: number;
  lastInputAt: { microsSinceUnixEpoch: bigint };
};

/** Sample only wire fields; full player poses also calculate facing and zones. */
export function playerMotionSampleAt(motion: MotionSampleRow, atMicros: bigint): PlayerMotionSample {
  const sampled = analyticalPlayerMotionAt({
    x: motion.x, y: motion.y, vx: motion.vx, vy: motion.vy,
    moving: motion.moving, simulationTick: motion.simulationTick,
    anchoredAtMicros: motion.lastInputAt.microsSinceUnixEpoch,
  }, atMicros);
  return {
    networkId: motion.networkId, x: sampled.x, y: sampled.y,
    vx: sampled.vx, vy: sampled.vy, simulationTick: sampled.simulationTick,
    motionEpoch: motion.motionEpoch,
  };
}

/** One publication only: all observers share the same immutable motion rows
 * and timestamp. Callers must check map/visibility before requesting a sample. */
export function createPlayerMotionFrameSampler(atMicros: bigint) {
  const samples = new Map<number, PlayerMotionSample>();
  return (motion: MotionSampleRow) => {
    let sample = samples.get(motion.networkId);
    if (!sample) {
      sample = playerMotionSampleAt(motion, atMicros);
      samples.set(motion.networkId, sample);
    }
    return sample;
  };
}
