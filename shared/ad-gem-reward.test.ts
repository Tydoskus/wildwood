import { expect, it } from "vitest";
import {
  AD_GEM_COOLDOWN_MS,
  AD_GEM_DAILY_LIMIT,
  AD_GEM_REWARD,
  adGemRewardStatus,
  formatAdGemWait,
  mergeAdGemRewardRecords,
  utcDayKey,
} from "./ad-gem-reward";

const DAY_MS = 86_400_000;
const NOON = 20_000 * DAY_MS + DAY_MS / 2;

it("pays 10 Gems, 30 minutes apart, four a day", () => {
  expect(AD_GEM_REWARD).toBe(10);
  expect(AD_GEM_COOLDOWN_MS).toBe(30 * 60_000);
  expect(AD_GEM_DAILY_LIMIT).toBe(4);
});

it("keys days the way the daily Gem bonus does: whole UTC days since the epoch", () => {
  expect(utcDayKey(NOON)).toBe("20000");
  expect(utcDayKey(20_001 * DAY_MS - 1)).toBe("20000");
  expect(utcDayKey(20_001 * DAY_MS)).toBe("20001");
  expect(utcDayKey(NOON)).toBe(String(BigInt(NOON) * 1000n / 86_400_000_000n));
});

it("formats waits as the HUD and the refusal show them", () => {
  expect(formatAdGemWait(30 * 60_000)).toBe("30:00");
  expect(formatAdGemWait(754_000)).toBe("12:34");
  expect(formatAdGemWait(1)).toBe("0:01");
  expect(formatAdGemWait(0)).toBe("0:00");
  expect(formatAdGemWait(5 * 3_600_000 + 12 * 60_000)).toBe("5:12:00");
  expect(formatAdGemWait(29 * 60_000 + 1)).toBe("29:01");
});

it("reads ready, cooldown and a spent day", () => {
  const day = utcDayKey(NOON);
  expect(adGemRewardStatus(null, NOON)).toEqual({ kind: "ready", dayKey: day, claimsToday: 0, claimsLeft: 4 });
  expect(adGemRewardStatus({ lastClaimAtMs: NOON - 60_000, dayKey: day, claimsToday: 1 }, NOON))
    .toEqual({ kind: "cooldown", waitMs: 29 * 60_000, claimsLeft: 3 });
  expect(adGemRewardStatus({ lastClaimAtMs: NOON - 3_600_000, dayKey: day, claimsToday: 4 }, NOON))
    .toEqual({ kind: "limit", waitMs: DAY_MS / 2, claimsLeft: 0 });
  // Yesterday's four do not count today.
  expect(adGemRewardStatus({ lastClaimAtMs: NOON - DAY_MS, dayKey: utcDayKey(NOON - DAY_MS), claimsToday: 4 }, NOON))
    .toMatchObject({ kind: "ready", claimsToday: 0, claimsLeft: 4 });
});

it("merges to the later claim and the later day's higher count", () => {
  const day = utcDayKey(NOON);
  const yesterday = utcDayKey(NOON - DAY_MS);
  expect(mergeAdGemRewardRecords(
    { lastClaimAtMs: NOON - 5 * 3_600_000, dayKey: day, claimsToday: 1 },
    { lastClaimAtMs: NOON - 60_000, dayKey: day, claimsToday: 3 },
  )).toEqual({ lastClaimAtMs: NOON - 60_000, dayKey: day, claimsToday: 3 });
  expect(mergeAdGemRewardRecords(
    { lastClaimAtMs: NOON - 60_000, dayKey: day, claimsToday: 1 },
    { lastClaimAtMs: NOON - DAY_MS, dayKey: yesterday, claimsToday: 4 },
  )).toEqual({ lastClaimAtMs: NOON - 60_000, dayKey: day, claimsToday: 1 });
});
