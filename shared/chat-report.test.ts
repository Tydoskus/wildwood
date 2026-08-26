import { describe, expect, it } from "vitest";
import { CHAT_REPORT_REASONS, isChatReportReason } from "./chat-report";

describe("chat report reasons", () => {
  it("keeps the message-report choices small and explicit", () => {
    expect(CHAT_REPORT_REASONS.map(({ label }) => label)).toEqual([
      "Harassment",
      "Hate / Sexual Content",
      "Spam / Scam",
      "Personal Information",
      "Other",
    ]);
  });

  it("accepts only canonical server reason values", () => {
    for (const { value } of CHAT_REPORT_REASONS) {
      expect(isChatReportReason(value)).toBe(true);
    }
    expect(isChatReportReason("anything else")).toBe(false);
    expect(isChatReportReason("")).toBe(false);
  });
});
