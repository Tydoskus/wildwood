import { describe, expect, it } from "vitest";
import { nightEnemyOpacity, nightGroundShadowsVisible } from "./night-visibility";

describe("Night Forest visibility", () => {
  it("keeps enemies fully visible at every distance", () => {
    expect(nightEnemyOpacity(100, 200, 20)).toBe(1);
    expect(nightEnemyOpacity(2_000, 200, 20)).toBe(1);
    expect(nightEnemyOpacity(Number.POSITIVE_INFINITY, 200, 20)).toBe(1);
  });

  it("removes ground shadows only from the night map", () => {
    expect(nightGroundShadowsVisible("infernal_depths", "infernal_depths")).toBe(false);
    expect(nightGroundShadowsVisible("water_reach", "infernal_depths")).toBe(true);
  });
});
