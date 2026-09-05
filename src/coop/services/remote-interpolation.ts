import { clamp } from "../../game/math";

const DEFAULT_DELAY_MS = 240;
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 320;
const BASE_NETWORK_DELAY_MS = 220;
const MIN_SAMPLE_INTERVAL_MS = 35;
const MAX_SAMPLE_INTERVAL_MS = 1_200;
const MAX_RESTART_ANCHOR_INTERVAL_MS = 250;
const MAX_EXTRAPOLATION_MS = 1_500;
const CORRECTION_TIME_CONSTANT_MS = 180;
const MAX_CORRECTION_SPEED_RATIO = .75;
const MIN_CORRECTION_SPEED = 90;

export type RemoteMotionSample = {
  timelineAt: number;
  serverAtMs?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  simulationTick: number;
  motionEpoch: number;
  facing: number;
  moving: boolean;
};

export type RemoteMotionTransform = Omit<RemoteMotionSample, "timelineAt" | "serverAtMs">;

export type TimestampedRemoteMotionSample = RemoteMotionSample & {
  serverAtMs: number;
  receivedAt: number;
};

export type RemoteInterpolationClock = {
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

export type RemoteMotionTransition = "continuous" | "restart" | "stop" | "discontinuity";

/** Epoch is the explicit hard-reset guard; distance never decides continuity. */
export function remoteMotionTransition(
  previous: Pick<RemoteMotionSample, "motionEpoch" | "moving">,
  next: Pick<RemoteMotionSample, "motionEpoch" | "moving">,
): RemoteMotionTransition {
  if (previous.motionEpoch !== next.motionEpoch) return "discontinuity";
  if (!previous.moving && next.moving) return "restart";
  if (previous.moving && !next.moving) return "stop";
  return "continuous";
}

export function duplicateRemoteMotionSample(
  previous: Pick<RemoteMotionSample, "simulationTick" | "motionEpoch" | "moving">,
  next: Pick<RemoteMotionSample, "simulationTick" | "motionEpoch" | "moving">,
) {
  return previous.motionEpoch === next.motionEpoch &&
    previous.simulationTick === next.simulationTick &&
    previous.moving === next.moving;
}

export function createRemoteInterpolationClock(now: number): RemoteInterpolationClock {
  return {
    jitterMs: 0,
    targetDelayMs: DEFAULT_DELAY_MS,
    delayMs: DEFAULT_DELAY_MS,
    lastRenderAt: now,
  };
}

/** A movement restart keeps enough history to interpolate its first visible step. */
export function createRestartRemoteInterpolationClock(now: number): RemoteInterpolationClock {
  return {
    ...createRemoteInterpolationClock(now),
    targetDelayMs: MIN_DELAY_MS,
    delayMs: MIN_DELAY_MS,
  };
}

/**
 * Maps the server's publication clock onto local time. Late delivery does not
 * stretch the movement timeline; only an earlier arrival improves the clock
 * offset, rebasing history backwards so no sample sits in the local future.
 * The server samples positions at publication time, so sender tick counters
 * (which can wrap, pause, or be reanchored) must not determine their spacing.
 */
export function appendRemoteTimelineSample<T extends TimestampedRemoteMotionSample>(
  samples: T[],
  sample: Omit<T, "timelineAt">,
): T {
  const previous = samples[samples.length - 1];
  let timelineAt = sample.receivedAt;
  if (previous) {
    const serverIntervalMs = Math.max(1, sample.serverAtMs - previous.serverAtMs);
    const projectedTimelineAt = previous.timelineAt + serverIntervalMs;
    const futureLeadMs = projectedTimelineAt - sample.receivedAt;
    if (futureLeadMs > 0) {
      for (const buffered of samples) buffered.timelineAt -= futureLeadMs;
    }
    timelineAt = Math.min(projectedTimelineAt, sample.receivedAt);
    // Idle history is only a start anchor, not a movement segment to replay.
    // Shorten that stationary segment without losing the stream's clock offset.
    if (!previous.moving) {
      previous.timelineAt = Math.max(previous.timelineAt, timelineAt - MAX_RESTART_ANCHOR_INTERVAL_MS);
    }
  }
  const next = { ...sample, timelineAt } as T;
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
  const deviation = Math.abs(clamp(arrivalIntervalMs, 0, MAX_SAMPLE_INTERVAL_MS * 2) - interval);
  clock.jitterMs += (deviation - clock.jitterMs) * .2;
  // The 3 Hz nearby stream is sparse by design. Keep most of one interval in
  // hand so start/stop transitions arrive before their presentation time.
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
  if (Math.abs(correction.x) <= .01 && Math.abs(correction.y) <= .01) {
    correction.x = 0;
    correction.y = 0;
    return;
  }
  const distance = Math.hypot(correction.x, correction.y);
  if (elapsedMs <= 0) return;
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
 * A continuity correction may preserve a pose beyond a newly confirmed stop.
 * Remove only that forward overshoot; lateral/behind correction still eases.
 */
export function constrainRemoteMotionToLatestStop(
  motion: RemoteMotionTransform,
  samples: readonly RemoteMotionSample[],
): RemoteMotionTransform {
  const latest = samples[samples.length - 1];
  if (!latest || latest.moving) return motion;
  let incoming: RemoteMotionSample | undefined;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const candidate = samples[index];
    if (candidate.motionEpoch !== latest.motionEpoch) break;
    if (candidate.moving && Math.hypot(candidate.vx, candidate.vy) > .001) {
      incoming = candidate;
      break;
    }
  }
  if (!incoming) return motion;
  const speed = Math.hypot(incoming.vx, incoming.vy);
  const directionX = incoming.vx / speed;
  const directionY = incoming.vy / speed;
  const ahead = (motion.x - latest.x) * directionX + (motion.y - latest.y) * directionY;
  if (ahead <= 0) return motion;
  return {
    ...motion,
    x: motion.x - directionX * ahead,
    y: motion.y - directionY * ahead,
    vx: 0,
    vy: 0,
    facing: latest.facing,
    moving: false,
  };
}

/**
 * Preserves the presented pose while replacing its underlying prediction.
 * This also applies within a delivery burst: skipping those rows would expose
 * intermediate clock rebases or turns as jumps. Only real prediction error
 * becomes a decaying offset; a late but otherwise correct sample adds none.
 */
export function appendRemoteCorrectionSample<T extends TimestampedRemoteMotionSample>(
  samples: T[],
  sample: Omit<T, "timelineAt">,
  renderAt: number,
  maxSpeed: number,
  correction: RemoteMotionCorrection,
): T {
  const previous = samples[samples.length - 1];
  if (!previous) {
    return appendRemoteTimelineSample(samples, sample);
  }

  const continuity = applyRemoteMotionCorrection(
    remoteMotionAt(samples, renderAt),
    correction,
    sample.receivedAt,
    maxSpeed,
  );
  const next = appendRemoteTimelineSample(samples, sample);
  const corrected = remoteMotionAt(samples, renderAt);
  const boundedContinuity = constrainRemoteMotionToLatestStop(continuity, samples);
  correction.x = boundedContinuity.x - corrected.x;
  correction.y = boundedContinuity.y - corrected.y;
  correction.lastAt = sample.receivedAt;
  return next;
}

/**
 * Samples buffered movement at a stable render time. Authoritative positions
 * interpolate corrections between sparse packets; the latest transmitted
 * velocity carries motion through the 333 ms nearby-frame interval.
 */
export function remoteMotionAt(
  samples: readonly RemoteMotionSample[],
  renderAt: number,
): RemoteMotionTransform {
  const first = samples[0];
  const latest = samples[samples.length - 1];
  if (!first || !latest) return { x: 0, y: 0, vx: 0, vy: 0, simulationTick: 0, motionEpoch: 0, facing: 0, moving: false };

  if (renderAt >= latest.timelineAt) {
    if (!latest.moving) {
      return { x: latest.x, y: latest.y, vx: 0, vy: 0, simulationTick: latest.simulationTick, motionEpoch: latest.motionEpoch, facing: latest.facing, moving: false };
    }
    const aheadSeconds = Math.min(MAX_EXTRAPOLATION_MS, renderAt - latest.timelineAt) / 1_000;
    return {
      x: latest.x + latest.vx * aheadSeconds,
      y: latest.y + latest.vy * aheadSeconds,
      vx: latest.vx,
      vy: latest.vy,
      simulationTick: latest.simulationTick,
      motionEpoch: latest.motionEpoch,
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
  const facing = before.facing === after.facing
    ? before.facing
    : before.facing + Math.atan2(
      Math.sin(after.facing - before.facing),
      Math.cos(after.facing - before.facing),
    ) * alpha;
  const moving = before.moving === after.moving
    ? before.moving
    : after.moving ? alpha > 0 : alpha < 1;
  return {
    x: before.x + (after.x - before.x) * alpha,
    y: before.y + (after.y - before.y) * alpha,
    vx: before.vx + (after.vx - before.vx) * alpha,
    vy: before.vy + (after.vy - before.vy) * alpha,
    simulationTick: alpha < 1 ? before.simulationTick : after.simulationTick,
    motionEpoch: alpha < 1 ? before.motionEpoch : after.motionEpoch,
    facing,
    moving,
  };
}

/**
 * Samples the same server-time pose on every observer. This deliberately
 * bypasses each client's adaptive presentation buffer and correction offset;
 * it is for deterministic gameplay decisions, not drawing remote players.
 */
export function remoteMotionAtServerTime(
  samples: readonly TimestampedRemoteMotionSample[],
  serverAtMs: number,
): RemoteMotionTransform {
  const first = samples[0];
  const latest = samples[samples.length - 1];
  if (!first || !latest) return { x: 0, y: 0, vx: 0, vy: 0, simulationTick: 0, motionEpoch: 0, facing: 0, moving: false };
  const sampledAt = Number.isFinite(serverAtMs) ? serverAtMs : latest.serverAtMs;
  if (sampledAt <= first.serverAtMs) {
    return {
      x: first.x,
      y: first.y,
      vx: first.moving ? first.vx : 0,
      vy: first.moving ? first.vy : 0,
      simulationTick: first.simulationTick,
      motionEpoch: first.motionEpoch,
      facing: first.facing,
      moving: first.moving,
    };
  }
  if (sampledAt >= latest.serverAtMs) {
    if (!latest.moving) {
      return { x: latest.x, y: latest.y, vx: 0, vy: 0, simulationTick: latest.simulationTick, motionEpoch: latest.motionEpoch, facing: latest.facing, moving: false };
    }
    const aheadMs = Math.min(MAX_EXTRAPOLATION_MS, sampledAt - latest.serverAtMs);
    const aheadSeconds = aheadMs / 1_000;
    return {
      x: latest.x + latest.vx * aheadSeconds,
      y: latest.y + latest.vy * aheadSeconds,
      vx: latest.vx,
      vy: latest.vy,
      simulationTick: latest.simulationTick,
      motionEpoch: latest.motionEpoch,
      facing: latest.facing,
      moving: true,
    };
  }

  let before = first;
  let after = latest;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].serverAtMs >= sampledAt) {
      before = samples[index - 1];
      after = samples[index];
      break;
    }
  }
  if (before.motionEpoch !== after.motionEpoch) {
    return {
      x: before.x,
      y: before.y,
      vx: before.moving ? before.vx : 0,
      vy: before.moving ? before.vy : 0,
      simulationTick: before.simulationTick,
      motionEpoch: before.motionEpoch,
      facing: before.facing,
      moving: before.moving,
    };
  }
  const span = Math.max(1, after.serverAtMs - before.serverAtMs);
  const alpha = clamp((sampledAt - before.serverAtMs) / span, 0, 1);
  const facing = before.facing === after.facing
    ? before.facing
    : before.facing + Math.atan2(
      Math.sin(after.facing - before.facing),
      Math.cos(after.facing - before.facing),
    ) * alpha;
  return {
    x: before.x + (after.x - before.x) * alpha,
    y: before.y + (after.y - before.y) * alpha,
    vx: before.vx + (after.vx - before.vx) * alpha,
    vy: before.vy + (after.vy - before.vy) * alpha,
    simulationTick: alpha < 1 ? before.simulationTick : after.simulationTick,
    motionEpoch: before.motionEpoch,
    facing,
    moving: alpha < 1 ? before.moving : after.moving,
  };
}
