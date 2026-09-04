import { describe, expect, it } from "vitest";
import { createPlayerMotionFrameSampler, playerMotionSampleAt } from "./player-motion-sample";
import { analyticalPlayerMotionAt } from "./analytical-player-motion";
import { encodePlayerMotionFrame } from "./player-motion-frame";

const motion = {
  networkId: 1, x: 100, y: 200, vx: 100, vy: -60,
  moving: true, simulationTick: 20, motionEpoch: 3,
  lastInputAt: { microsSinceUnixEpoch: 0n },
};

describe("movement publication samples", () => {
  it("preserves packet bytes across moving, stopped, expired and clamped anchors", () => {
    for (const row of [motion, { ...motion, moving: false }, { ...motion, x: 1, y: 1, vx: -100 }]) {
      for (const time of [0n, 500_000n, 2_000_000n]) {
        const old = analyticalPlayerMotionAt({ ...row, anchoredAtMicros: row.lastInputAt.microsSinceUnixEpoch }, time);
        const expected = { ...old, networkId: row.networkId, motionEpoch: row.motionEpoch };
        expect(encodePlayerMotionFrame([playerMotionSampleAt(row, time)]))
          .toEqual(encodePlayerMotionFrame([expected]));
      }
    }
  });

  it("shares work within a publication but refreshes motion on the next publication", () => {
    const firstFrame = createPlayerMotionFrameSampler(500_000n);
    const first = firstFrame(motion);
    expect(firstFrame(motion)).toBe(first);
    expect(firstFrame({ ...motion, networkId: 2 }).networkId).toBe(2);
    const nextFrame = createPlayerMotionFrameSampler(600_000n);
    expect(nextFrame({ ...motion, vx: 200 }).x).toBe(220);
    expect(first.x).toBe(150);
  });
});
