import { clamp } from "../../game/math";

const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS = 75;
const MAX_DELAY_MS = 200;
const BASE_NETWORK_DELAY_MS = 80;
const MIN_SAMPLE_INTERVAL_MS = 35;
const MAX_SAMPLE_INTERVAL_MS = 1_200;
const MAX_EXTRAPOLATION_MS = 1_500;
const LIVE_CORRECTION_MIN_ARRIVAL_MS = 8;
const CORRECTION_TIME_CONSTANT_MS = 180;
const MAX_CORRECTION_SPEED_RATIO = .75;
const MIN_CORRECTION_SPEED = 90;

export type RemoteMotionSample = {
  timelineAt: number;
  serverAtMs?: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  facing: number;
  moving: boolean;
};

export type RemoteMotionTransform = Omit<RemoteMotionSample, "timelineAt" | "serverAtMs">;

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

export type RemoteMotionCorrection = {
  x: number;
  y: number;
  lastAt: number;
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

/** Learns network burstiness without mistaking sparse correction cadence for jitter. */
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
  // Straight movement intentionally sends only a one-second correction. That
  // interval is sender cadence, not network latency, and must not place a
  // running remote player almost half a second behind the local player.
  clock.targetDelayMs = clamp(BASE_NETWORK_DELAY_MS + clock.jitterMs * 2, MIN_DELAY_MS, MAX_DELAY_MS);
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

export function createRemoteMotionCorrection(now: number): RemoteMotionCorrection {
  return { x: 0, y: 0, lastAt: now };
}

export function resetRemoteMotionCorrection(correction: RemoteMotionCorrection, now: number) {
  correction.x = 0;
  correction.y = 0;
  correction.lastAt = now;
}

function advanceRemoteMotionCorrection(correction: RemoteMotionCorrection, now: number, maxSpeed: number) {
  const elapsedMs = clamp(now - correction.lastAt, 0, 100);
  correction.lastAt = now;
  const distance = Math.hypot(correction.x, correction.y);
  if (elapsedMs <= 0 || distance <= .01) {
    if (distance <= .01) {
      correction.x = 0;
      correction.y = 0;
    }
    return;
  }
  const easedStep = distance * (1 - Math.exp(-elapsedMs / CORRECTION_TIME_CONSTANT_MS));
  const speedLimit = Math.max(MIN_CORRECTION_SPEED, Math.max(0, maxSpeed) * MAX_CORRECTION_SPEED_RATIO);
  const step = Math.min(distance, easedStep, speedLimit * elapsedMs / 1_000);
  const retained = 1 - step / distance;
  correction.x *= retained;
  correction.y *= retained;
}

export function applyRemoteMotionCorrection(
  motion: RemoteMotionTransform,
  correction: RemoteMotionCorrection,
  now: number,
  maxSpeed: number,
): RemoteMotionTransform {
  advanceRemoteMotionCorrection(correction, now, maxSpeed);
  motion.x += correction.x;
  motion.y += correction.y;
  return motion;
}

/**
 * Adds an authoritative sample without changing the pose already on screen.
 * The current predicted pose becomes a short synthetic anchor, so correction
 * error is consumed over the remaining jitter buffer instead of in one frame.
 */
export function appendRemoteCorrectionSample<T extends TimestampedRemoteMotionSample>(
  samples: T[],
  sample: Omit<T, "timelineAt">,
  renderAt: number,
  maxSpeed: number,
  correction: RemoteMotionCorrection,
): T {
  const previous = samples[samples.length - 1];
  if (!previous || sample.receivedAt - previous.receivedAt <= LIVE_CORRECTION_MIN_ARRIVAL_MS) {
    return appendRemoteTimelineSample(samples, sample);
  }

  const continuity = applyRemoteMotionCorrection(
    remoteMotionAt(samples, renderAt, maxSpeed),
    correction,
    sample.receivedAt,
    maxSpeed,
  );
  const next = appendRemoteTimelineSample(samples, sample);
  const corrected = remoteMotionAt(samples, renderAt, maxSpeed);
  correction.x = continuity.x - corrected.x;
  correction.y = continuity.y - corrected.y;
  correction.lastAt = sample.receivedAt;
  return next;
}

function normalizedInputVelocity(sample: RemoteMotionSample, maxSpeed: number) {
  const length = Math.hypot(sample.dx, sample.dy);
  const scale = length > 1 ? 1 / length : 1;
  return {
    x: sample.dx * scale * Math.max(0, maxSpeed),
    y: sample.dy * scale * Math.max(0, maxSpeed),
  };
}

/** Uses the last confirmed straight segment to avoid repeatedly overpredicting a stalled mobile client. */
function remoteExtrapolationVelocity(
  samples: readonly RemoteMotionSample[],
  latest: RemoteMotionSample,
  maxSpeed: number,
) {
  const fallback = normalizedInputVelocity(latest, maxSpeed);
  const previous = samples[samples.length - 2];
  if (!previous?.moving || !latest.moving) return fallback;

  const latestLength = Math.hypot(latest.dx, latest.dy);
  const previousLength = Math.hypot(previous.dx, previous.dy);
  if (latestLength <= 1e-6 || previousLength <= 1e-6) return fallback;
  const inputAlignment = (latest.dx * previous.dx + latest.dy * previous.dy) / (latestLength * previousLength);
  if (inputAlignment < .95) return fallback;

  const latestAt = Number.isFinite(latest.serverAtMs) ? Number(latest.serverAtMs) : latest.timelineAt;
  const previousAt = Number.isFinite(previous.serverAtMs) ? Number(previous.serverAtMs) : previous.timelineAt;
  const elapsedSeconds = (latestAt - previousAt) / 1_000;
  if (elapsedSeconds < MIN_SAMPLE_INTERVAL_MS / 1_000 || elapsedSeconds > MAX_SAMPLE_INTERVAL_MS * 2 / 1_000) {
    return fallback;
  }

  const x = (latest.x - previous.x) / elapsedSeconds;
  const y = (latest.y - previous.y) / elapsedSeconds;
  const observedSpeed = Math.hypot(x, y);
  const speedLimit = Math.max(0, maxSpeed);
  if (observedSpeed <= 1e-6) return { x: 0, y: 0 };
  if (observedSpeed > speedLimit * 1.25 + 1) return fallback;
  const displacementAlignment = (x * latest.dx + y * latest.dy) / (observedSpeed * latestLength);
  return displacementAlignment >= .85 ? { x, y } : fallback;
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
    const velocity = remoteExtrapolationVelocity(samples, latest, maxSpeed);
    const aheadSeconds = Math.min(MAX_EXTRAPOLATION_MS, renderAt - latest.timelineAt) / 1_000;
    return {
      x: latest.x + velocity.x * aheadSeconds,
      y: latest.y + velocity.y * aheadSeconds,
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
