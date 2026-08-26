import { describe, expect, it } from "vitest";
import {
  CHAT_REPORT_LIMIT,
  CHAT_REPORT_WINDOW_MICROS,
  nextChatReportRateState,
} from "./chat-report-rate-limit";

describe("chat report rate limiting", () => {
  it("allows five reports in a fixed one-hour window", () => {
    let state = nextChatReportRateState(10n);
    expect(state.allowed).toBe(true);
    for (let count = 2; count <= CHAT_REPORT_LIMIT; count += 1) {
      state = nextChatReportRateState(10n + BigInt(count), state);
      expect(state).toMatchObject({ allowed: true, reportCount: count });
    }
    expect(nextChatReportRateState(99n, state).allowed).toBe(false);
  });

  it("starts a fresh allowance after an hour", () => {
    const current = { windowStartedAtMicros: 10n, reportCount: CHAT_REPORT_LIMIT };
    expect(nextChatReportRateState(10n + CHAT_REPORT_WINDOW_MICROS, current)).toEqual({
      allowed: true,
      windowStartedAtMicros: 10n + CHAT_REPORT_WINDOW_MICROS,
      reportCount: 1,
    });
  });
});
