import { describe, expect, it } from "vitest";
import { nextInventorySelection } from "./inventory-controller";

describe("inventory selection", () => {
  it("unselects an item when tapped twice", () => {
    expect(nextInventorySelection("starter_stone", "starter_stone")).toBe("");
  });

  it("selects a different item", () => {
    expect(nextInventorySelection("starter_stone", "starter_bow")).toBe("starter_bow");
  });
});
