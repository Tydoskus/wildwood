import { describe, expect, it } from "vitest";
import { bossTargetsFromMapSamples } from "./presence-service";

describe("boss presence targets", () => {
  it("uses the live local position when the solo map snapshot has gone idle", () => {
    const targets = bossTargetsFromMapSamples([
      { networkId: 4, x: 500, y: 700 },
      { networkId: 9, x: 900, y: 1_100 },
    ], 4, { x: 4_220, y: 4_080 });

    expect(targets).toEqual([
      { id: "network:4", x: 4_220, y: 4_080 },
      { id: "network:9", x: 900, y: 1_100 },
    ]);
  });
});
