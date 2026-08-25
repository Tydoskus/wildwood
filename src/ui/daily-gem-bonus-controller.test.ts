import { describe, expect, it } from "vitest";
import { dailyGemBonusShouldShow } from "./daily-gem-bonus-controller";

describe("daily Gem bonus visibility", () => {
  it("opens only for a ready registered session with a claim", () => {
    expect(dailyGemBonusShouldShow(true, true)).toBe(true);
    expect(dailyGemBonusShouldShow(false, true)).toBe(false);
    expect(dailyGemBonusShouldShow(true, false)).toBe(false);
  });

  it("stays open while claiming and celebrating after the server row clears", () => {
    expect(dailyGemBonusShouldShow(true, false, true, false)).toBe(true);
    expect(dailyGemBonusShouldShow(true, false, false, true)).toBe(true);
  });
});
