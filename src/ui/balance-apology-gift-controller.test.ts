import { describe, expect, it } from "vitest";
import { balanceApologyGiftShouldShow } from "./balance-apology-gift-controller";

describe("balance apology gift", () => {
  it("shows only after gameplay starts with a pending server notice", () => {
    expect(balanceApologyGiftShouldShow(true, 10n)).toBe(true);
    expect(balanceApologyGiftShouldShow(false, 10n)).toBe(false);
    expect(balanceApologyGiftShouldShow(true, 0n)).toBe(false);
  });

  it("stays hidden after a successful local acknowledgement", () => {
    expect(balanceApologyGiftShouldShow(true, 10n, true)).toBe(false);
  });
});
