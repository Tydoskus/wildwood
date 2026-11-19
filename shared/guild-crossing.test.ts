import { describe, expect, it } from "vitest";
import {
  CROSSING_MAX_POINTS,
  CROSSING_STEPS,
  crossingPointsForState,
  dailyCrossingAttempts,
} from "./guild-crossing";

describe("shared guild crossing rules", () => {
  it("scales daily tries so 20-member guilds get 1/day and even a solo guild can clear worst-case 16 falls within a week", () => {
    expect(dailyCrossingAttempts(20)).toBe(1);
    expect(dailyCrossingAttempts(11)).toBe(1);
    expect(dailyCrossingAttempts(10)).toBe(2);
    expect(dailyCrossingAttempts(5)).toBe(2);
    expect(dailyCrossingAttempts(4)).toBe(3);
    expect(dailyCrossingAttempts(1)).toBe(3);
    // Solo guild weekly tries (3 * 7 = 21) strictly exceeds worst-case 16 falls + 1 finish step.
    expect(dailyCrossingAttempts(1) * 7).toBeGreaterThanOrEqual(CROSSING_STEPS + 1);
  });

  it("awards milestone points progressively and reserves the final 25 points for crossing the Victory Portal", () => {
    expect(CROSSING_MAX_POINTS).toBe(50);
    expect(crossingPointsForState(0, false)).toBe(0);
    expect(crossingPointsForState(5, false)).toBe(0);
    expect(crossingPointsForState(6, false)).toBe(10);
    expect(crossingPointsForState(11, false)).toBe(10);
    expect(crossingPointsForState(12, false)).toBe(25);
    // Falling on step 16 reveals all 16 tiles, but does not award the finish-portal clear bonus until someone crosses.
    expect(crossingPointsForState(16, false)).toBe(25);
    expect(crossingPointsForState(16, true)).toBe(50);
  });
});
