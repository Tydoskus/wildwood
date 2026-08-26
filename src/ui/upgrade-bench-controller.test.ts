import { describe, expect, it } from "vitest";
import { FROST_BOW } from "../../shared/items";
import { UPGRADE_BENCH_TOUCH_OFFSET_Y, UPGRADE_CANCEL_CONFIRMATION, playerTouchesUpgradeBench, upgradeBenchTouchTransition, upgradePickerPreview, upgradeSlotAfterPickerDismiss } from "./upgrade-bench-controller";

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

  it("centers the interaction collision above the decor depth point", () => {
    const bench = { x: 800, y: 710 };
    expect(UPGRADE_BENCH_TOUCH_OFFSET_Y).toBe(-36);
    expect(playerTouchesUpgradeBench({ x: 800, y: 674 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 800, y: 595 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 753 }, bench)).toBe(false);
  });

  it("warns that cancellation forfeits progress toward the next level", () => {
    expect(UPGRADE_CANCEL_CONFIRMATION).toBe(
      "Are you sure you want to cancel? You will lose current progress to the next upgrade.",
    );
  });

  it("previews every stat change before an item is selected", () => {
    expect(upgradePickerPreview(FROST_BOW, 0)).toEqual({
      name: "FROST BOW",
      changes: [
        { label: "DAMAGE MULTIPLIER", current: "3.00×", next: "3.40×" },
        { label: "ATTACK SPEED MULTIPLIER", current: "1.20×", next: "1.24×" },
      ],
    });
  });

  it("restores a slotted item's actions when item choices are dismissed", () => {
    expect(upgradeSlotAfterPickerDismiss(1, FROST_BOW)).toBe(1);
    expect(upgradeSlotAfterPickerDismiss(1, "")).toBeNull();
    expect(upgradeSlotAfterPickerDismiss(null, FROST_BOW)).toBeNull();
  });
});
