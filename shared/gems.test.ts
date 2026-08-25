import { describe, expect, it } from "vitest";
import { MAX_GEM_BALANCE, gemBalanceAfter } from "./gems";

describe("Gem balance rules", () => {
  it("credits and spends whole Gems exactly", () => {
    expect(gemBalanceAfter(120n, 30n)).toBe(150n);
    expect(gemBalanceAfter(120n, -20n)).toBe(100n);
  });

  it("rejects overspending and balances above the economy cap", () => {
    expect(() => gemBalanceAfter(5n, -6n)).toThrow("Not enough Gems");
    expect(() => gemBalanceAfter(MAX_GEM_BALANCE, 1n)).toThrow("limit reached");
  });
});
