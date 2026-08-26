import { describe, expect, it } from "vitest";
import {
  PLAYER_MAP_FRAME_MAX_SAMPLES,
  PLAYER_MAP_SAMPLE_BYTES,
  PLAYER_MOTION_SAMPLE_BYTES,
  compactPlayerMapSamples,
  decodePlayerMapFrame,
  decodePlayerMotionFrame,
  encodePlayerMapFrame,
  encodePlayerMotionFrame,
} from "./player-motion-frame";

describe("player motion frames", () => {
  it("round-trips compact samples at gameplay precision", () => {
    const encoded = encodePlayerMotionFrame([
      { networkId: 1, x: 17.26, y: 4_783.04, vx: 266.54, vy: -188.47, simulationTick: 0x1_0007, motionEpoch: 12 },
      { networkId: 0xffffffff, x: 0, y: 6_553.5, vx: -3_276.8, vy: 0, simulationTick: 65_535, motionEpoch: 70_000 },
    ]);

    expect(encoded).toHaveLength(PLAYER_MOTION_SAMPLE_BYTES * 2);
    const decoded = decodePlayerMotionFrame(encoded, 2);
    expect(decoded[0]).toMatchObject({ networkId: 1, x: 17.3, y: 4_783, vx: 266.5, vy: -188.5, simulationTick: 7, motionEpoch: 12 });
    expect(decoded[1]).toMatchObject({ networkId: 0xffffffff, x: 0, y: 6_553.5, vx: -3_276.8, vy: 0, simulationTick: 65_535, motionEpoch: 4_464 });
  });

  it("rejects malformed frames instead of reading partial samples", () => {
    expect(() => decodePlayerMotionFrame(new Uint8Array(15), 1)).toThrow(RangeError);
    expect(() => decodePlayerMotionFrame(new Uint8Array(), -1)).toThrow(RangeError);
  });

  it("bounds invalid values", () => {
    const [sample] = decodePlayerMotionFrame(encodePlayerMotionFrame([
      { networkId: Number.POSITIVE_INFINITY, x: -10, y: Number.NaN, vx: Number.NaN, vy: 4_000, simulationTick: Number.NaN, motionEpoch: Number.POSITIVE_INFINITY },
    ]), 1);
    expect(sample).toMatchObject({ networkId: 0, x: 0, y: 0, vx: 0, vy: 3_276.7, simulationTick: 0, motionEpoch: 0 });
  });

  it("keeps normal minimap populations exact", () => {
    const samples = [
      { networkId: 1, x: 100, y: 200, vx: 180, vy: 0, simulationTick: 60, motionEpoch: 1 },
      { networkId: 2, x: 300, y: 400, vx: 0, vy: 180, simulationTick: 61, motionEpoch: 1 },
    ];
    expect(compactPlayerMapSamples(samples, 6_000, 6_000)).toBe(samples);
  });

  it("uses a position-only minimap frame", () => {
    const encoded = encodePlayerMapFrame([
      { networkId: 7, x: 123.45, y: 4_799.96 },
      { networkId: 0xffffffff, x: 0, y: 0 },
    ]);
    expect(encoded).toHaveLength(PLAYER_MAP_SAMPLE_BYTES * 2);
    expect(decodePlayerMapFrame(encoded, 2)).toEqual([
      { networkId: 7, x: 123.5, y: 4_800 },
      { networkId: 0xffffffff, x: 0, y: 0 },
    ]);
    expect(() => decodePlayerMapFrame(encoded.subarray(1), 2)).toThrow(RangeError);
  });

  it("bounds large minimap frames with spatial centroids", () => {
    const samples = Array.from({ length: 1_024 }, (_, index) => ({
      networkId: index + 1,
      x: index % 32 * 187.5,
      y: Math.floor(index / 32) * 187.5,
      vx: 180,
      vy: 0,
      simulationTick: index,
      motionEpoch: 1,
    }));
    const compacted = compactPlayerMapSamples(samples, 6_000, 6_000);

    expect(compacted).toHaveLength(PLAYER_MAP_FRAME_MAX_SAMPLES);
    expect(compacted[0]).toMatchObject({ networkId: 1, x: 93.75, y: 93.75 });
  });
});
