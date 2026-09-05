import * as currentMotion from "../../src/coop/services/remote-interpolation";

export type MotionPath = "straight" | "turn" | "stop";
export type MotionDelivery = "steady" | "jitter" | "burst" | "stall" | "higher-latency";
type MotionAPI = Omit<typeof currentMotion, "remoteMotionAtServerTime">;

// Deterministic receiver replay, not a live network or visual benchmark.
// Turns and stops deliberately fall BETWEEN the server's 3 Hz publications.
function positionAt(timeMs: number, path: MotionPath) {
  if (path === "stop") {
    if (timeMs < 2_150) return { x: 100 + timeMs * .18, y: 100, vx: 180, vy: 0 };
    if (timeMs < 4_150) return { x: 487, y: 100, vx: 0, vy: 0 };
    return { x: 487, y: 100 + (timeMs - 4_150) * .18, vx: 0, vy: 180 };
  }
  if (path === "turn") {
    const leg = Math.floor(Math.max(0, timeMs) / 1_750);
    const distance = timeMs % 1_750 * .18;
    const [x, y, vx, vy] = [
      [100 + distance, 100, 180, 0], [415, 100 + distance, 0, 180],
      [415 - distance, 415, -180, 0], [100, 415 - distance, 0, -180],
    ][leg % 4];
    return { x, y, vx, vy };
  }
  return { x: 100 + timeMs * .18, y: 100, vx: 180, vy: 0 };
}

function deliveryDelay(index: number, delivery: MotionDelivery) {
  if (delivery === "jitter") return [0, 100, 30, 150, 0, 70][index % 6];
  if (delivery === "burst" && index % 9 >= 4 && index % 9 <= 6) return (6 - index % 9) * 1_000 / 3;
  if (delivery === "stall" && index >= 10 && index <= 15) return (15 - index) * 1_000 / 3;
  if (delivery === "higher-latency" && index >= 10) return 450;
  return 0;
}

export function replayRemoteMotion(
  path: MotionPath,
  delivery: MotionDelivery,
  framesPerSecond = 60,
  api: MotionAPI = currentMotion,
) {
  const packets: currentMotion.TimestampedRemoteMotionSample[] = [];
  let lastArrival = 0;
  for (let index = 0; index <= 30; index += 1) {
    const serverAtMs = index * 1_000 / 3;
    const receivedAt = Math.max(lastArrival, serverAtMs + 80 + deliveryDelay(index, delivery));
    lastArrival = receivedAt;
    const position = positionAt(serverAtMs, path);
    packets.push({
      ...position, serverAtMs, receivedAt, timelineAt: receivedAt,
      simulationTick: index * 20, motionEpoch: 1,
      moving: position.vx !== 0 || position.vy !== 0, facing: position.vx < 0 ? Math.PI : 0,
    });
  }
  const samples = [packets.shift()!];
  let clock = api.createRemoteInterpolationClock(samples[0].receivedAt);
  const correction = api.createRemoteMotionCorrection(samples[0].receivedAt);
  let squaredPositionError = 0;
  let squaredVelocityError = 0;
  let count = 0;
  let maxPacketJump = 0;
  let maxPositionError = 0;
  let maxCorrection = 0;
  let previous: { pose: currentMotion.RemoteMotionTransform; expected: ReturnType<typeof positionAt> } | null = null;

  function presentedAt(renderAt: number, now: number, mutateCorrection: boolean) {
    return api.constrainRemoteMotionToLatestStop(api.applyRemoteMotionCorrection(
      api.remoteMotionAt(samples, renderAt), mutateCorrection ? correction : { ...correction }, now, 180,
    ), samples);
  }

  for (let frame = 0; frame <= Math.floor(9_900 * framesPerSecond / 1_000); frame += 1) {
    const now = 100 + frame * 1_000 / framesPerSecond;
    while (packets.length && packets[0].receivedAt <= now) {
      const packet = packets.shift()!;
      const latest = samples[samples.length - 1];
      if (api.remoteMotionTransition(latest, packet) === "restart") {
        clock = api.createRestartRemoteInterpolationClock(packet.receivedAt);
      } else {
        api.observeRemoteSample(clock, packet.serverAtMs - latest.serverAtMs, packet.receivedAt - latest.receivedAt);
      }
      const renderAt = api.adaptiveRemoteRenderAt(clock, packet.receivedAt);
      const before = presentedAt(renderAt, packet.receivedAt, false);
      api.appendRemoteCorrectionSample(samples, packet, renderAt, 180, correction);
      while (samples.length > 8) samples.shift();
      const after = presentedAt(renderAt, packet.receivedAt, false);
      if (now > 1_000) maxPacketJump = Math.max(maxPacketJump, Math.hypot(after.x - before.x, after.y - before.y));
      maxCorrection = Math.max(maxCorrection, Math.hypot(correction.x, correction.y));
    }
    const renderAt = api.adaptiveRemoteRenderAt(clock, now);
    const pose = presentedAt(renderAt, now, true);
    // Remove the intentional presentation delay from error measurements.
    // The initial 80 ms transport offset is known only to this test fixture.
    const expected = positionAt(renderAt - 80, path);
    if (now > 1_000 && previous) {
      const error = Math.hypot(pose.x - expected.x, pose.y - expected.y);
      squaredPositionError += error * error;
      maxPositionError = Math.max(maxPositionError, error);
      const dx = pose.x - previous.pose.x - (expected.x - previous.expected.x);
      const dy = pose.y - previous.pose.y - (expected.y - previous.expected.y);
      squaredVelocityError += (dx * dx + dy * dy) * framesPerSecond ** 2;
      count += 1;
    }
    previous = { pose, expected };
  }
  return {
    positionRMSE: Math.sqrt(squaredPositionError / count),
    velocityRMSE: Math.sqrt(squaredVelocityError / count),
    maxPacketJump, maxPositionError, maxCorrection,
  };
}
