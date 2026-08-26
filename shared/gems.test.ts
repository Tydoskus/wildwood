import { describe, expect, it } from "vitest";
import {
  DAILY_LOGIN_GEM_BONUS,
  BASE_INVENTORY_SLOT_CAPACITY,
  MAX_GEM_BALANCE,
  RESEARCH_SPEED_UP_MS_PER_GEM,
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  gemBalanceAfter,
  itemUpgradeSpeedUpGemCost,
  inventorySlotCapacity,
  inventorySlotUnlockCost,
  researchSpeedUpGemCost,
} from "./gems";

describe("Gem balance rules", () => {
  it("credits and spends whole Gems exactly", () => {
    expect(gemBalanceAfter(120n, 30n)).toBe(150n);
    expect(gemBalanceAfter(120n, -20n)).toBe(100n);
  });

  it("rejects overspending and balances above the economy cap", () => {
    expect(() => gemBalanceAfter(5n, -6n)).toThrow("Not enough Gems");
    expect(() => gemBalanceAfter(MAX_GEM_BALANCE, 1n)).toThrow("limit reached");
  });

  it("grants seven Gems in the daily registered-account bonus", () => {
    expect(DAILY_LOGIN_GEM_BONUS).toBe(7n);
  });

  it("prices the permanent second upgrade slot at 150 Gems", () => {
    expect(UPGRADE_BENCH_SECOND_SLOT_GEM_COST).toBe(150n);
  });

  it("prices consecutive inventory slots at one, two, three Gems and expands the free 16 slots", () => {
    expect(BASE_INVENTORY_SLOT_CAPACITY).toBe(16);
    expect(inventorySlotCapacity(0)).toBe(16);
    expect(inventorySlotCapacity(2)).toBe(18);
    expect(inventorySlotUnlockCost(0)).toBe(1n);
    expect(inventorySlotUnlockCost(1)).toBe(2n);
    expect(inventorySlotUnlockCost(2)).toBe(3n);
  });

  it("prices research at one Gem per started ten-minute block", () => {
    expect(researchSpeedUpGemCost(0)).toBe(1n);
    expect(researchSpeedUpGemCost(1)).toBe(1n);
    expect(researchSpeedUpGemCost(RESEARCH_SPEED_UP_MS_PER_GEM)).toBe(1n);
    expect(researchSpeedUpGemCost(RESEARCH_SPEED_UP_MS_PER_GEM + 1)).toBe(2n);
    expect(researchSpeedUpGemCost(25 * 60 * 1_000)).toBe(3n);
  });

  it("prices item-upgrade skips at one Gem per started ten-minute block", () => {
    expect(itemUpgradeSpeedUpGemCost(0)).toBe(1n);
    expect(itemUpgradeSpeedUpGemCost(1)).toBe(1n);
    expect(itemUpgradeSpeedUpGemCost(RESEARCH_SPEED_UP_MS_PER_GEM)).toBe(1n);
    expect(itemUpgradeSpeedUpGemCost(RESEARCH_SPEED_UP_MS_PER_GEM + 1)).toBe(2n);
  });
});
