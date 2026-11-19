import { describe, expect, it } from "vitest";
import {
  CROSSING_CLEAR_POINTS,
  CROSSING_MAX_POINTS,
  CROSSING_STEP_POINTS,
  CROSSING_STEPS,
  GUILD_CROSSING_ARRIVAL,
  GUILD_CROSSING_LEFT_X,
  GUILD_CROSSING_RIGHT_X,
  crossingFrontierSpawn,
  crossingPointsForState,
  crossingStepY,
  crossingTileAt,
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

  it("awards immediate points per step (+2 each for Steps 1–15) and reserves +20 for crossing the Victory Portal (50 total)", () => {
    expect(CROSSING_STEP_POINTS).toBe(2);
    expect(CROSSING_CLEAR_POINTS).toBe(20);
    expect(CROSSING_MAX_POINTS).toBe(50);
    expect(crossingPointsForState(0, false)).toBe(0);
    expect(crossingPointsForState(1, false)).toBe(2);
    expect(crossingPointsForState(5, false)).toBe(10);
    expect(crossingPointsForState(6, false)).toBe(12);
    expect(crossingPointsForState(15, false)).toBe(30);
    // Falling on step 16 reveals all 16 tiles, reserving the final +20 until someone crosses the Victory Portal.
    expect(crossingPointsForState(16, false)).toBe(30);
    expect(crossingPointsForState(16, true)).toBe(50);
  });

  it("maps bridge coordinates to tiles and spawns players right behind the active frontier", () => {
    expect(crossingFrontierSpawn(0, false, [])).toEqual(GUILD_CROSSING_ARRIVAL);
    const step4Spawn = crossingFrontierSpawn(4, false, ["left", "right", "left", "right"]);
    expect(step4Spawn.x).toBe(GUILD_CROSSING_RIGHT_X);
    expect(step4Spawn.y).toBeLessThan(GUILD_CROSSING_ARRIVAL.y);

    expect(crossingTileAt(GUILD_CROSSING_LEFT_X, crossingStepY(0))).toEqual({ step: 0, side: "left" });
    expect(crossingTileAt(GUILD_CROSSING_RIGHT_X, crossingStepY(7))).toEqual({ step: 7, side: "right" });
    expect(crossingTileAt(900, crossingStepY(3))).toBeNull();
  });
});
