import { describe, expect, it } from "vitest";
import {
  hasMissingPlayerMotionDetail,
  PLAYER_MOTION_DETAIL_FRAME_HZ,
  PLAYER_MOTION_INTEREST_LIMIT,
  samePlayerMotionInterest,
  selectPlayerMotionInterest,
  shouldRecoverPlayerMotionDetail,
} from "./player-motion-interest";

const available = new Set(Array.from({ length: 20 }, (_, index) => index + 1));

describe("player motion interest", () => {
  it("selects no more than the nearest five available remote actors", () => {
    const selected = selectPlayerMotionInterest({
      samples: Array.from({ length: 10 }, (_, index) => ({ networkId: index + 1, x: (index + 1) * 10, y: 0 })),
      originX: 0,
      originY: 0,
      localNetworkId: 1,
      availableNetworkIds: available,
      previousNetworkIds: [],
    });

    expect(selected).toEqual([2, 3, 4, 5, 6]);
    expect(selected).toHaveLength(PLAYER_MOTION_INTEREST_LIMIT);
    expect(PLAYER_MOTION_DETAIL_FRAME_HZ).toBe(3);
  });

  it("retains the boundary actor until a newcomer is materially closer", () => {
    const base = [
      { networkId: 2, x: 10, y: 0 },
      { networkId: 3, x: 20, y: 0 },
      { networkId: 4, x: 30, y: 0 },
      { networkId: 5, x: 40, y: 0 },
      { networkId: 6, x: 50, y: 0 },
    ];
    const barelyCloser = selectPlayerMotionInterest({
      samples: [...base, { networkId: 7, x: 45, y: 0 }],
      originX: 0,
      originY: 0,
      localNetworkId: 1,
      availableNetworkIds: available,
      previousNetworkIds: [2, 3, 4, 5, 6],
    });
    const materiallyCloser = selectPlayerMotionInterest({
      samples: [...base, { networkId: 7, x: 39, y: 0 }],
      originX: 0,
      originY: 0,
      localNetworkId: 1,
      availableNetworkIds: available,
      previousNetworkIds: [2, 3, 4, 5, 6],
    });

    expect(barelyCloser).toEqual([2, 3, 4, 5, 6]);
    expect(materiallyCloser).toEqual([2, 3, 4, 5, 7]);
  });

  it("ignores unavailable, duplicate, local, and malformed samples", () => {
    expect(selectPlayerMotionInterest({
      samples: [
        { networkId: 1, x: 0, y: 0 },
        { networkId: 2, x: 10, y: 0 },
        { networkId: 2, x: 1, y: 0 },
        { networkId: 30, x: 2, y: 0 },
        { networkId: 3, x: Number.NaN, y: 0 },
      ],
      originX: 0,
      originY: 0,
      localNetworkId: 1,
      availableNetworkIds: available,
      previousNetworkIds: [],
    })).toEqual([2]);
  });

  it("compares ordered interest sets without allocation", () => {
    expect(samePlayerMotionInterest([2, 3, 4], [2, 3, 4])).toBe(true);
    expect(samePlayerMotionInterest([2, 3, 4], [3, 2, 4])).toBe(false);
    expect(samePlayerMotionInterest([2, 3], [2, 3, 4])).toBe(false);
  });

  it("recovers a selected actor when its detail frame never becomes ready", () => {
    const desiredNetworkIds = [2, 3];
    expect(hasMissingPlayerMotionDetail(desiredNetworkIds, new Set([2]))).toBe(true);
    expect(shouldRecoverPlayerMotionDetail({
      desiredNetworkIds,
      readyNetworkIds: new Set([2]),
      missingSince: 1_000,
      now: 2_499,
    })).toBe(false);
    expect(shouldRecoverPlayerMotionDetail({
      desiredNetworkIds,
      readyNetworkIds: new Set([2]),
      missingSince: 1_000,
      now: 2_500,
    })).toBe(true);
    expect(shouldRecoverPlayerMotionDetail({
      desiredNetworkIds,
      readyNetworkIds: new Set([2, 3]),
      missingSince: 1_000,
      now: 9_000,
    })).toBe(false);
  });
});
