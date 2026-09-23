import { describe, expect, it } from "vitest";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { formatHudRemaining, hudProgressTimers } from "./hud-progress-timers";

const upgrade = (slot: 1 | 2, completesAtMs: number, paused = false): ActiveItemUpgrade => ({
  slot, itemId: slot === 1 ? "HAND" : "HEAD", currentLevel: 1, targetLevel: 2,
  startedAtMs: 0, completesAtMs, paused, remainingMs: 90_000,
});

describe("HUD progress timers", () => {
  it("shows research and both upgrade slots independently", () => {
    expect(hudProgressTimers(true, {
      researchId: "warcraft", targetRank: 2, startedAtMs: 0, completesAtMs: 3_700_000,
    }, [upgrade(1, 125_000), upgrade(2, 61_000)], 1_000)).toEqual({
      research: "1h 2m", slotOne: { remaining: "3m", paused: false },
      slotTwo: { remaining: "1m", paused: false },
    });
  });

  it("keeps a paused upgrade still and hides stale jobs after disconnect", () => {
    const job = upgrade(2, 1_000, true);
    expect(hudProgressTimers(true, null, [job], 900_000).slotTwo).toEqual({ remaining: "2m", paused: true });
    expect(hudProgressTimers(false, null, [job], 900_000)).toEqual({ research: null, slotOne: null, slotTwo: null });
  });

  it("shows seconds only below one minute", () => {
    expect(formatHudRemaining(60_000)).toBe("1m");
    expect(formatHudRemaining(59_000)).toBe("59s");
    expect(formatHudRemaining(1)).toBe("1s");
    expect(formatHudRemaining(0)).toBe("0s");
  });
});
