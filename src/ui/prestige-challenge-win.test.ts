import { expect, it } from "vitest";
import { challengeWinReached, reflectOnlyWinNotice } from "./prestige-challenge-win";

const reading = (active: boolean, completed: number, identity = "me") => ({ identity, active, completed });

it("announces a Reflect Only win once, and never a drop-out, a first reading or another account", () => {
  expect(challengeWinReached(reading(true, 0), reading(false, 1))).toBe(true);
  expect(challengeWinReached(reading(false, 1), reading(false, 1))).toBe(false);
  expect(challengeWinReached(reading(true, 1), reading(false, 1))).toBe(false);
  expect(challengeWinReached(null, reading(false, 1))).toBe(false);
  expect(challengeWinReached(reading(true, 0, "other"), reading(false, 1))).toBe(false);
});

it("is a notice with one button that names the reward", () => {
  const notice = reflectOnlyWinNotice(2);
  expect(notice.cancelLabel).toBe("");
  expect(notice.details?.map(row => row.value)).toEqual(["+0.5 attacks/sec", "+1", "Restored", "2/4"]);
});
