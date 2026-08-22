import { describe, expect, it } from "vitest";
import { itemDropRevealName } from "./item-drop-reveal";

describe("item drop reveal", () => {
  it("shows the unique item name without a quantity", () => {
    expect(itemDropRevealName("FROST BOW")).toBe("FROST BOW");
  });

  it("preserves other unique equipment names", () => {
    expect(itemDropRevealName("WOODEN ARMOR")).toBe("WOODEN ARMOR");
  });
});
