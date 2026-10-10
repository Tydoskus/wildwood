import { expect, test } from "vitest";
import { formatTimer, formatTimerMs } from "./timer-format";

test("an hour or more reads HH:MM, under an hour reads MM:SS", () => {
  expect(formatTimer(0)).toBe("00:00");
  expect(formatTimer(5)).toBe("00:05");
  expect(formatTimer(45)).toBe("00:45");
  expect(formatTimer(59)).toBe("00:59");
  expect(formatTimer(60)).toBe("01:00");
  expect(formatTimer(61)).toBe("01:01");
  expect(formatTimer(12 * 60 + 30)).toBe("12:30");
  expect(formatTimer(3_599)).toBe("59:59");
  expect(formatTimer(3_600)).toBe("01:00");
  expect(formatTimer(7_500)).toBe("02:05");
  expect(formatTimer(360_000)).toBe("100:00");
});

test("bad input reads as zero and partial seconds round down", () => {
  expect(formatTimer(-5)).toBe("00:00");
  expect(formatTimer(Number.NaN)).toBe("00:00");
  expect(formatTimer(Number.POSITIVE_INFINITY)).toBe("00:00");
  expect(formatTimer(59.9)).toBe("00:59");
});

test("a millisecond countdown rounds partial seconds up", () => {
  expect(formatTimerMs(0)).toBe("00:00");
  expect(formatTimerMs(1)).toBe("00:01");
  expect(formatTimerMs(59_001)).toBe("01:00");
  expect(formatTimerMs(3_599_001)).toBe("01:00");
  expect(formatTimerMs(59_000)).toBe("00:59");
  expect(formatTimerMs(-1_000)).toBe("00:00");
  expect(formatTimerMs(7_500_000)).toBe("02:05");
});
