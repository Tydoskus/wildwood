import { describe, expect, it } from "vitest";
import {
  BOSS_NAME_FONT_SIZE,
  BOSS_REWARD_FONT_SIZE,
  BOSS_STATUS_HEALTH_FONT_SIZE,
  bossStatusLabelOffsets,
} from "./boss-label-style";

describe("boss floating label style", () => {
  it("makes names 50% larger and stat rewards 25% larger than the original label size", () => {
    expect(BOSS_NAME_FONT_SIZE).toBe(BOSS_STATUS_HEALTH_FONT_SIZE * 1.5);
    expect(BOSS_REWARD_FONT_SIZE).toBe(BOSS_STATUS_HEALTH_FONT_SIZE * 1.25);
  });

  it("spreads larger reward lines upward while preserving the bottom anchor", () => {
    expect(bossStatusLabelOffsets(1, -5)).toEqual({ name: -24, rewards: [-5] });
    expect(bossStatusLabelOffsets(2, -5)).toEqual({ name: -40, rewards: [-21, -5] });
    expect(bossStatusLabelOffsets(4)).toEqual({ name: -71, rewards: [-52, -36, -20, -4] });
  });
});
