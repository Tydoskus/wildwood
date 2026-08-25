import { describe, expect, it } from "vitest";
import { gemSpendConfirmationText } from "./gem-spend-confirmation";

describe("Gem spend confirmation", () => {
  it("shows the exact cost with singular and plural currency copy", () => {
    expect(gemSpendConfirmationText("finish this upgrade now", 1n))
      .toBe("Spend 1 Gem to finish this upgrade now?");
    expect(gemSpendConfirmationText("unlock the second slot", 150n))
      .toBe("Spend 150 Gems to unlock the second slot?");
  });
});
