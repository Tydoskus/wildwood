import { clamp } from "../../game/math";

const DEFAULT_DELAY_MS = 175;
const MIN_DELAY_MS = 125;
const MAX_DELAY_MS = 450;
const MIN_SAMPLE_INTERVAL_MS = 35;
const MAX_SAMPLE_INTERVAL_MS = 1_200;
const MAX_EXTRAPOLATION_MS = 1_500;

export type RemoteMotionSample = {
  timelineAt: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  facing: number;
  moving: boolean;
};

export type RemoteMotionTransform = Omit<RemoteMotionSample, "timelineAt">;

export type TimestampedRemoteMotionSample = RemoteMotionSample & {
  serverAtMs: number;
  receivedAt: number;
};

export type RemoteInterpolationClock = {
  expectedIntervalMs: number;
  jitterMs: number;
  targetDelayMs: number;
  delayMs: number;
  lastRenderAt: number;
};

export function createRemoteInterpolationClock(now: number): RemoteInterpolationClock {
  return {
    expectedIntervalMs: 50,
    jitterMs: 0,
    targetDelayMs: DEFAULT_DELAY_MS,
    delayMs: DEFAULT_DELAY_MS,
    lastRenderAt: now,
  };
}

/** A movement restart should not inherit the large buffer learned at 3 Hz. */
export function createRestartRemoteInterpolationClock(now: number): RemoteInterpolationClock {
  return {
    ...createRemoteInterpolationClock(now),
    targetDelayMs: MIN_DELAY_MS,
    delayMs: MIN_DELAY_MS,
  };
}

/**
 * Adds a server-ordered sample without ever placing it in local clock future.
 * When subscription rows arrive as one burst, confirmed server spacing is
 * reconstructed backwards from arrival time. This prevents a permanent
 * future lead that otherwise makes playback step behind the oldest sample.
 */
export function appendRemoteTimelineSample<T extends TimestampedRemoteMotionSample>(
  samples: T[],
  sample: Omit<T, "timelineAt">,
): T {
  const previous = samples[samples.length - 1];
  if (previous) {
    const serverIntervalMs = clamp(sample.serverAtMs - previous.serverAtMs, 1, 250);
    const projectedTimelineAt = previous.timelineAt + serverIntervalMs;
    const futureLeadMs = projectedTimelineAt - sample.receivedAt;
    if (futureLeadMs > 0) {
      for (const buffered of samples) buffered.timelineAt -= futureLeadMs;
    }
  }
  const next = { ...sample, timelineAt: sample.receivedAt } as T;
  samples.push(next);
  return next;
}

/** Learns both sender cadence and network burstiness without changing delay abruptly. */
export function observeRemoteSample(
  clock: RemoteInterpolationClock,
  serverIntervalMs: number,
  arrivalIntervalMs: number,
) {
  const interval = clamp(serverIntervalMs, MIN_SAMPLE_INTERVAL_MS, MAX_SAMPLE_INTERVAL_MS);
  // React immediately when packets become less frequent. Decay slowly when a
  // high-rate stream returns so brief bursts cannot make the buffer underrun.
  clock.expectedIntervalMs = interval > clock.expectedIntervalMs
    ? interval
    : clock.expectedIntervalMs + (interval - clock.expectedIntervalMs) * .25;

  const deviation = Math.abs(clamp(arrivalIntervalMs, 0, MAX_SAMPLE_INTERVAL_MS * 2) - interval);
  clock.jitterMs += (deviation - clock.jitterMs) * .2;
  clock.targetDelayMs = clamp(
    clock.expectedIntervalMs * 1.15 + clock.jitterMs * 2 + 40,
    MIN_DELAY_MS,
    MAX_DELAY_MS,
  );
}

/** Advances playback delay gradually. Render time never moves backwards. */
export function adaptiveRemoteRenderAt(clock: RemoteInterpolationClock, now: number) {
  const elapsed = clamp(now - clock.lastRenderAt, 0, 100);
  clock.lastRenderAt = now;
  if (clock.targetDelayMs > clock.delayMs) {
    clock.delayMs += Math.min(clock.targetDelayMs - clock.delayMs, elapsed * .9);
  } else {
    clock.delayMs -= Math.min(clock.delayMs - clock.targetDelayMs, elapsed * .35);
  }
  return now - clock.delayMs;
}

/**
 * Samples buffered movement at a stable render time. Authoritative positions
 * interpolate corrections between sparse packets; the latest transmitted
 * vector carries motion through the one-second heartbeat interval.
 */
export function remoteMotionAt(
  samples: readonly RemoteMotionSample[],
  renderAt: number,
  maxSpeed: number,
): RemoteMotionTransform {
  const first = samples[0];
  const latest = samples[samples.length - 1];
  if (!first || !latest) return { x: 0, y: 0, dx: 0, dy: 0, facing: 0, moving: false };

  if (renderAt >= latest.timelineAt) {
    if (!latest.moving) {
      return { x: latest.x, y: latest.y, dx: 0, dy: 0, facing: latest.facing, moving: false };
    }
    const directionLength = Math.hypot(latest.dx, latest.dy);
    const directionScale = directionLength > 1 ? 1 / directionLength : 1;
    const aheadSeconds = Math.min(MAX_EXTRAPOLATION_MS, renderAt - latest.timelineAt) / 1_000;
    return {
      x: latest.x + latest.dx * directionScale * Math.max(0, maxSpeed) * aheadSeconds,
      y: latest.y + latest.dy * directionScale * Math.max(0, maxSpeed) * aheadSeconds,
      dx: latest.dx,
      dy: latest.dy,
      facing: latest.facing,
      moving: true,
    };
  }

  let before = first;
  let after = latest;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].timelineAt >= renderAt) {
      before = samples[index - 1];
      after = samples[index];
      break;
    }
  }
  const span = Math.max(1, after.timelineAt - before.timelineAt);
  const alpha = clamp((renderAt - before.timelineAt) / span, 0, 1);
  return {
    x: before.x + (after.x - before.x) * alpha,
    y: before.y + (after.y - before.y) * alpha,
    dx: before.dx + (after.dx - before.dx) * alpha,
    dy: before.dy + (after.dy - before.dy) * alpha,
    facing: before.facing + Math.atan2(
      Math.sin(after.facing - before.facing),
      Math.cos(after.facing - before.facing),
    ) * alpha,
    moving: alpha < 1 ? before.moving : after.moving,
  };
}
