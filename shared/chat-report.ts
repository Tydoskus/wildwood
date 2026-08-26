export const CHAT_REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "hate-sexual-content", label: "Hate / Sexual Content" },
  { value: "spam-scam", label: "Spam / Scam" },
  { value: "personal-information", label: "Personal Information" },
  { value: "other", label: "Other" },
] as const;

export type ChatReportReason = typeof CHAT_REPORT_REASONS[number]["value"];

const CHAT_REPORT_REASON_VALUES = new Set<string>(
  CHAT_REPORT_REASONS.map(({ value }) => value),
);

export function isChatReportReason(value: string): value is ChatReportReason {
  return CHAT_REPORT_REASON_VALUES.has(value);
}
