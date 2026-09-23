import { describe, expect, it } from "vitest";
import { GEM_KILL_CREDIT_PER_GEM, gemKillCredit, settleGemKillCredit } from "./gem-drops";

describe("deterministic gem credit", () => {
  it("pays one gem per 1,200 kills", () => {
    expect(settleGemKillCredit(gemKillCredit(1_199))).toEqual({ gems: 0n, remainder: 5_995n });
    expect(settleGemKillCredit(gemKillCredit(1_200))).toEqual({ gems: 1n, remainder: 0n });
  });

  it("carries the remainder forward instead of losing it", () => {
    const first = settleGemKillCredit(gemKillCredit(1_000));
    expect(first).toEqual({ gems: 0n, remainder: 5_000n });
    expect(settleGemKillCredit(first.remainder + gemKillCredit(200))).toEqual({ gems: 1n, remainder: 0n });
  });

  it("ignores impossible counts and never goes negative", () => {
    expect(gemKillCredit(0)).toBe(0n);
    expect(gemKillCredit(-5)).toBe(0n);
    expect(gemKillCredit(2.5)).toBe(0n);
    expect(settleGemKillCredit(-1n)).toEqual({ gems: 0n, remainder: 0n });
    expect(GEM_KILL_CREDIT_PER_GEM).toBe(6_000n);
  });
});
