import { describe, expect, it } from "vitest";
import { formatRespawnBoostRemaining } from "./rewarded-respawn-ad-controller";

describe("rewarded respawn countdown", () => {
  it("formats the full 30-minute reward and final second", () => {
    expect(formatRespawnBoostRemaining(30 * 60 * 1_000)).toBe("30:00");
    expect(formatRespawnBoostRemaining(1)).toBe("0:01");
    expect(formatRespawnBoostRemaining(0)).toBe("0:00");
  });

  it("rounds partial seconds up so the timer never displays early", () => {
    expect(formatRespawnBoostRemaining(29 * 60 * 1_000 + 1)).toBe("29:01");
  });
});
