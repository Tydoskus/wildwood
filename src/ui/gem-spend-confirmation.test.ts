import { describe, expect, it } from "vitest";
import { gemSpendConfirmation, gemSpendConfirmationText } from "./gem-spend-confirmation";

describe("Gem spend confirmation", () => {
  it("shows the exact cost with singular and plural currency copy", () => {
    expect(gemSpendConfirmationText("finish this upgrade now", 1n))
      .toBe("Spend 1 Gem to finish this upgrade now?");
    expect(gemSpendConfirmationText("unlock the second slot", 150n))
      .toBe("Spend 150 Gems to unlock the second slot?");
  });

  it("carries the cost, the balance it comes out of, and what it leaves", () => {
    expect(gemSpendConfirmation("finish this research now", 12n, 40n)).toEqual({
      message: "Spend 12 Gems to finish this research now?",
      details: [
        { label: "Cost", value: "12 Gems", kind: "cost" },
        { label: "Your Gems", value: "40 Gems", kind: "balance" },
        { label: "After", value: "28 Gems", kind: "after" },
      ],
    });
  });

  it("never shows a negative balance for a spend the player cannot afford", () => {
    // The callers refuse the spend before prompting, but a stale balance must
    // not render as "After -5 Gems".
    expect(gemSpendConfirmation("do the thing", 10n, 5n).details?.[2])
      .toEqual({ label: "After", value: "0 Gems", kind: "after" });
  });
});
