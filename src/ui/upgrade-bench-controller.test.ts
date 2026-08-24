import { describe, expect, it } from "vitest";
import { FROST_BOW } from "../../shared/items";
import { UPGRADE_CANCEL_CONFIRMATION, upgradeBenchTouchTransition, upgradePickerPreview } from "./upgrade-bench-controller";

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

  it("previews every stat change before an item is selected", () => {
    expect(upgradePickerPreview(FROST_BOW, 0)).toEqual({
      name: "FROST BOW",
      nextLevel: 1,
      changes: [
        { label: "DAMAGE MULTIPLIER", current: "3.00×", next: "3.40×" },
        { label: "ATTACK SPEED MULTIPLIER", current: "1.20×", next: "1.24×" },
      ],
    });
  });
});
