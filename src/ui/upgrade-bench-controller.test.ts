import { describe, expect, it } from "vitest";
import { UPGRADE_CANCEL_CONFIRMATION, upgradeBenchTouchTransition } from "./upgrade-bench-controller";

describe("upgrade bench touch latch", () => {
  it("requires leaving before a closed bench can open again", () => {
    const entered = upgradeBenchTouchTransition(false, true);
    expect(entered).toEqual({ touching: true, shouldOpen: true });

    // Closing the window does not change contact with the bench.
    const stillTouching = upgradeBenchTouchTransition(entered.touching, true);
    expect(stillTouching).toEqual({ touching: true, shouldOpen: false });

    const left = upgradeBenchTouchTransition(stillTouching.touching, false);
    expect(left).toEqual({ touching: false, shouldOpen: false });
    expect(upgradeBenchTouchTransition(left.touching, true)).toEqual({ touching: true, shouldOpen: true });
  });

  it("warns that cancellation forfeits progress toward the next level", () => {
    expect(UPGRADE_CANCEL_CONFIRMATION).toBe(
      "Are you sure you want to cancel? You will lose current progress to the next upgrade.",
    );
  });
});
