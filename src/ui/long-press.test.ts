import { describe, expect, it } from "vitest";
import {
  ITEM_INSPECTION_HOLD_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  movedBeyondLongPressTolerance,
} from "./long-press";

describe("long press", () => {
  it("requires at least a two-second hold for item inspection", () => {
    expect(ITEM_INSPECTION_HOLD_MS).toBe(2_000);
  });

  it("allows small finger drift but cancels when the inventory is scrolled", () => {
    expect(movedBeyondLongPressTolerance(0, 0, 8, 8)).toBe(false);
    expect(movedBeyondLongPressTolerance(0, 0, LONG_PRESS_MOVE_TOLERANCE_PX + 1, 0)).toBe(true);
  });
});
