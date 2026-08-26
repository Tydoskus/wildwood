export const CHAT_REPORT_LIMIT = 5;
export const CHAT_REPORT_WINDOW_MICROS = 3_600_000_000n;

export type ChatReportRateState = {
  windowStartedAtMicros: bigint;
  reportCount: number;
};

export function nextChatReportRateState(
  nowMicros: bigint,
  current?: ChatReportRateState,
): ChatReportRateState & { allowed: boolean } {
  if (!current || nowMicros - current.windowStartedAtMicros >= CHAT_REPORT_WINDOW_MICROS) {
    return { allowed: true, windowStartedAtMicros: nowMicros, reportCount: 1 };
  }
  if (current.reportCount >= CHAT_REPORT_LIMIT) {
    return { ...current, allowed: false };
  }
  return { ...current, allowed: true, reportCount: current.reportCount + 1 };
}
