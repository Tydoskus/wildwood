import { describe, expect, it } from "vitest";
import {
  PLAYER_MOTION_SAMPLE_BYTES,
  decodePlayerMotionFrame,
  encodePlayerMotionFrame,
} from "./player-motion-frame";

describe("player motion frames", () => {
  it("round-trips compact samples at gameplay precision", () => {
    const encoded = encodePlayerMotionFrame([
      { networkId: 1, x: 17.26, y: 4_783.04, dx: Math.SQRT1_2, dy: -Math.SQRT1_2, moving: true },
      { networkId: 0xffffffff, x: 0, y: 6_553.5, dx: -1, dy: 0, moving: false },
    ]);

    expect(encoded).toHaveLength(PLAYER_MOTION_SAMPLE_BYTES * 2);
    const decoded = decodePlayerMotionFrame(encoded, 2);
    expect(decoded[0]).toMatchObject({ networkId: 1, x: 17.3, y: 4_783, moving: true });
    expect(decoded[0].dx).toBeCloseTo(Math.SQRT1_2, 2);
    expect(decoded[0].dy).toBeCloseTo(-Math.SQRT1_2, 2);
    expect(decoded[1]).toMatchObject({ networkId: 0xffffffff, x: 0, y: 6_553.5, dx: -1, dy: 0, moving: false });
  });

  it("rejects malformed frames instead of reading partial samples", () => {
    expect(() => decodePlayerMotionFrame(new Uint8Array(10), 1)).toThrow(RangeError);
    expect(() => decodePlayerMotionFrame(new Uint8Array(), -1)).toThrow(RangeError);
  });

  it("bounds invalid values", () => {
    const [sample] = decodePlayerMotionFrame(encodePlayerMotionFrame([
      { networkId: Number.POSITIVE_INFINITY, x: -10, y: Number.NaN, dx: Number.NaN, dy: 4, moving: true },
    ]), 1);
    expect(sample).toMatchObject({ networkId: 0, x: 0, y: 0, dx: 0, dy: 1, moving: true });
  });
});
