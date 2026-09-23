import { expect, it } from "vitest";
import { leaderboardEligible } from "./leaderboard-window";

it("opens the leaderboard after the Dragon and keeps it open through prestige", () => {
  expect(leaderboardEligible(false, 0)).toBe(false);
  expect(leaderboardEligible(true, 0)).toBe(true);
  expect(leaderboardEligible(false, 1)).toBe(true);
  expect(leaderboardEligible(false, 2)).toBe(true);
});
