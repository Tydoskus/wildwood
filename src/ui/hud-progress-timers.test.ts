import { describe, expect, it } from "vitest";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { hudProgressTimers } from "./hud-progress-timers";

const upgrade = (slot: 1 | 2, completesAtMs: number, paused = false): ActiveItemUpgrade => ({
  slot, itemId: slot === 1 ? "HAND" : "HEAD", currentLevel: 1, targetLevel: 2,
  startedAtMs: 0, completesAtMs, paused, remainingMs: 90_000,
});

describe("HUD progress timers", () => {
  it("shows research and both upgrade slots independently", () => {
    expect(hudProgressTimers(true, {
      researchId: "warcraft", targetRank: 2, startedAtMs: 0, completesAtMs: 3_700_000,
    }, [upgrade(1, 125_000), upgrade(2, 61_000)], 1_000)).toEqual({
      research: "1:01:39", slotOne: { remaining: "2:04", paused: false },
      slotTwo: { remaining: "1:00", paused: false },
    });
  });

  it("keeps a paused upgrade still and hides stale jobs after disconnect", () => {
    const job = upgrade(2, 1_000, true);
    expect(hudProgressTimers(true, null, [job], 900_000).slotTwo).toEqual({ remaining: "1:30", paused: true });
    expect(hudProgressTimers(false, null, [job], 900_000)).toEqual({ research: null, slotOne: null, slotTwo: null });
  });
});
