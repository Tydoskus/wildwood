import { describe, expect, it } from "vitest";
import {
  ITEM_INSPECTION_HOLD_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  movedBeyondLongPressTolerance,
} from "./long-press";

describe("long press", () => {
  it("opens item inspection after a 0.6-second hold", () => {
    expect(ITEM_INSPECTION_HOLD_MS).toBe(600);
  });

  it("allows small finger drift but cancels when the inventory is scrolled", () => {
    expect(movedBeyondLongPressTolerance(0, 0, 8, 8)).toBe(false);
    expect(movedBeyondLongPressTolerance(0, 0, LONG_PRESS_MOVE_TOLERANCE_PX + 1, 0)).toBe(true);
  });
});
