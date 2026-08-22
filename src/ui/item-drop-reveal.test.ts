import { describe, expect, it } from "vitest";
import { itemDropRevealName } from "./item-drop-reveal";

describe("item drop reveal", () => {
  it("shows a quantity only for stacked drops", () => {
    expect(itemDropRevealName("FROST BOW", 1)).toBe("FROST BOW");
    expect(itemDropRevealName("FROST BOW", 2)).toBe("FROST BOW ×2");
  });

  it("normalizes invalid quantities to one", () => {
    expect(itemDropRevealName("WOODEN ARMOR", 0)).toBe("WOODEN ARMOR");
    expect(itemDropRevealName("WOODEN ARMOR", Number.NaN)).toBe("WOODEN ARMOR");
  });
});
