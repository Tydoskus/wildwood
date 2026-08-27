import { describe, expect, it } from "vitest";
import {
  BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS,
  balanceApologyTransactionReference,
  isBalanceApologyEligible,
} from "./balance-apology";

describe("balance apology eligibility", () => {
  const now = 200_000_000_000n;

  it("includes activity at the exact 24-hour boundary", () => {
    expect(isBalanceApologyEligible(now, {
      lastSeenAtMicros: now - BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS,
      currentlyActive: false,
    })).toBe(true);
  });

  it("accepts either persistent activity clock", () => {
    expect(isBalanceApologyEligible(now, {
      sessionStartedAtMicros: now - 1n,
      currentlyActive: false,
    })).toBe(true);
  });

  it("rejects players whose latest activity is older than 24 hours", () => {
    expect(isBalanceApologyEligible(now, {
      lastSeenAtMicros: now - BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS - 1n,
      sessionStartedAtMicros: now - BALANCE_APOLOGY_ACTIVITY_WINDOW_MICROS - 1n,
      currentlyActive: false,
    })).toBe(false);
  });

  it("always includes a player who is currently active", () => {
    expect(isBalanceApologyEligible(now, { currentlyActive: true })).toBe(true);
  });

  it("creates a stable identity-scoped ledger reference", () => {
    expect(balanceApologyTransactionReference("abc123")).toBe("balance-apology:v0.541:abc123");
  });
});
