import { describe, expect, it } from "vitest";
import { FROST_BOW } from "../../shared/items";
import { UPGRADE_BENCH_TOUCH_OFFSET_Y, UPGRADE_CANCEL_CONFIRMATION, playerTouchesUpgradeBench, upgradeBenchTouchTransition, upgradePickerPreview, upgradeSlotAfterPickerDismiss, upgradeFinishedSinceLastPoll } from "./upgrade-bench-controller";

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
    expect(playerTouchesUpgradeBench({ x: 854, y: 674 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 855, y: 674 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 713 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 800, y: 714 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 595 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 753 }, bench)).toBe(false);
  });

  it("warns that cancellation forfeits progress toward the next level", () => {
    expect(UPGRADE_CANCEL_CONFIRMATION).toBe(
      "Are you sure you want to cancel? You will lose current progress to the next upgrade.",
    );
  });

  it("previews the tier a track is about to gain, measured on the gear in it", () => {
    // Upgrades belong to the slot now, so the preview names the track and its
    // next tier, and reads the numbers off whatever is equipped there.
    expect(upgradePickerPreview("HAND", 0, FROST_BOW)).toEqual({
      name: "WEAPON \u00b7 TIER 0 \u2192 1",
      equippedItemId: FROST_BOW,
      changes: [
        { label: "DAMAGE", current: "+11.43%", next: "+11.89%" },
      ],
    });
    // An empty slot still shows the tier; there is nothing to measure.
    expect(upgradePickerPreview("HEAD", 4)).toEqual({
      name: "HELMET \u00b7 TIER 4 \u2192 5", equippedItemId: "", changes: [],
    });
  });

  it("restores a slotted item's actions when item choices are dismissed", () => {
    expect(upgradeSlotAfterPickerDismiss(1, FROST_BOW)).toBe(1);
    expect(upgradeSlotAfterPickerDismiss(1, "")).toBeNull();
    expect(upgradeSlotAfterPickerDismiss(null, FROST_BOW)).toBeNull();
  });
});

describe("finished upgrade notification", () => {
  const job = (slot: 1 | 2, completesAtMs: number) => new Map([[slot, completesAtMs]] as const);

  it("notices a job that disappears after its time", () => {
    expect(upgradeFinishedSinceLastPoll(job(1, 500), new Map(), 500)).toBe(true);
    expect(upgradeFinishedSinceLastPoll(job(1, 500), new Map(), 900)).toBe(true);
  });

  it("ignores a job cancelled before its time", () => {
    expect(upgradeFinishedSinceLastPoll(job(1, 500), new Map(), 499)).toBe(false);
  });

  it("ignores a job that is still running", () => {
    expect(upgradeFinishedSinceLastPoll(job(1, 500), job(1, 500), 900)).toBe(false);
  });

  it("reports the finished slot while another keeps going", () => {
    const tracked = new Map([[1, 500], [2, 9_000]] as const);
    expect(upgradeFinishedSinceLastPoll(tracked, new Map([[2, 9_000]] as const), 600)).toBe(true);
  });

  it("has nothing to report on the first poll", () => {
    expect(upgradeFinishedSinceLastPoll(new Map(), job(1, 500), 600)).toBe(false);
  });
});
