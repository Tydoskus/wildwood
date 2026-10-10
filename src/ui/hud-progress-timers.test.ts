import { describe, expect, it } from "vitest";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { hudProgressTimers } from "./hud-progress-timers";

const upgrade = (slot: 1 | 2 | 3, completesAtMs: number, paused = false): ActiveItemUpgrade => ({
  slot, itemId: slot === 1 ? "HAND" : slot === 2 ? "HEAD" : "CHEST", currentLevel: 1, targetLevel: 2,
  startedAtMs: 0, completesAtMs, paused, remainingMs: 90_000,
});

describe("HUD progress timers", () => {
  it("shows research and three upgrade slots independently", () => {
    expect(hudProgressTimers(true, {
      researchId: "warcraft", targetRank: 2, startedAtMs: 0, completesAtMs: 3_700_000,
    }, [upgrade(1, 125_000), upgrade(2, 61_000), upgrade(3, 59_000)], 1_000)).toEqual({
      research: "01:01", slotOne: { remaining: "02:04", paused: false },
      slotTwo: { remaining: "01:00", paused: false },
      slotThree: { remaining: "00:58", paused: false },
    });
  });

  it("keeps a paused upgrade still and hides stale jobs after disconnect", () => {
    const job = upgrade(2, 1_000, true);
    expect(hudProgressTimers(true, null, [job], 900_000).slotTwo).toEqual({ remaining: "01:30", paused: true });
    expect(hudProgressTimers(false, null, [job], 900_000)).toEqual({ research: null, slotOne: null, slotTwo: null, slotThree: null });
  });
});
