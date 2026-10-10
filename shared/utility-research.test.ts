import { expect, it } from "vitest";
import { researchDurationMs } from "./research";
import { effectivePlayerMovementSpeed, PLAYER_SPEED } from "./rules";
import {
  attackRangeWithResearch,
  bossRespawnSecondsWithResearch,
  enemyRespawnSecondsWithResearch,
  offlineWindowSecondsWithResearch,
  slotUpgradeDurationWithResearch,
} from "./utility-research";

it("applies capped utility ranks to new timers and movement", () => {
  expect(researchDurationMs("foraging", 0, 5)).toBe(Math.round(15_000 / 1.05));
  expect(slotUpgradeDurationWithResearch(180_000, 5)).toBe(Math.round(180_000 / 1.05));
  expect(enemyRespawnSecondsWithResearch(20, 5)).toBe(17.5);
  expect(bossRespawnSecondsWithResearch(45, 5)).toBe(40);
  expect(offlineWindowSecondsWithResearch(3)).toBe(12 * 60 * 60);
  expect(effectivePlayerMovementSpeed(false, 5, 0, 5)).toBeCloseTo(PLAYER_SPEED * 1.1 + 15);
  expect(offlineWindowSecondsWithResearch(100)).toBe(12 * 60 * 60);
  expect(bossRespawnSecondsWithResearch(3, 5)).toBe(1);
  expect(attackRangeWithResearch(0)).toBe(200);
  expect(attackRangeWithResearch(1)).toBe(210);
  expect(attackRangeWithResearch(5)).toBe(250);
  expect(attackRangeWithResearch(100)).toBe(250);
});
