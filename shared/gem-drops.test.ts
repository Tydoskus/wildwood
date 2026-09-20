import { describe, expect, it } from "vitest";
import { GEM_KILL_CREDIT_PER_GEM, gemKillCredit, settleGemKillCredit } from "./gem-drops";

describe("deterministic gem credit", () => {
  it("pays one gem per thousand active kills and per two thousand idle kills", () => {
    expect(settleGemKillCredit(gemKillCredit(1_000, true))).toEqual({ gems: 1n, remainder: 0n });
    expect(settleGemKillCredit(gemKillCredit(1_000, false))).toEqual({ gems: 0n, remainder: 1_000n });
    expect(settleGemKillCredit(gemKillCredit(2_000, false))).toEqual({ gems: 1n, remainder: 0n });
  });

  it("carries the remainder forward instead of losing it", () => {
    const first = settleGemKillCredit(gemKillCredit(1_500, false));
    expect(first).toEqual({ gems: 0n, remainder: 1_500n });
    expect(settleGemKillCredit(first.remainder + gemKillCredit(700, false))).toEqual({ gems: 1n, remainder: 200n });
  });

  it("ignores impossible counts and never goes negative", () => {
    expect(gemKillCredit(0, true)).toBe(0n);
    expect(gemKillCredit(-5, true)).toBe(0n);
    expect(gemKillCredit(2.5, true)).toBe(0n);
    expect(settleGemKillCredit(-1n)).toEqual({ gems: 0n, remainder: 0n });
    expect(GEM_KILL_CREDIT_PER_GEM).toBe(2_000n);
  });
});
