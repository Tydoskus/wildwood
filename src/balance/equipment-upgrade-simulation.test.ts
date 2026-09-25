import { describe, expect, it, vi } from "vitest";
import { advanceTime, startNextEquipmentUpgrade, simulationUpgradeLevel } from "./simulator";
import { IRON_BOW, STARTER_STONE, itemUpgradeDurationMs } from "../../shared/items";
import { createEmptyResearchRanks } from "../../shared/research";

function fixture() {
  return {
    time: 0, mapIndex: 1,
    stats: { damage: 100, maxHp: 1000, armor: 10, regen: 1, attackRate: 1 },
    research: createEmptyResearchRanks(),
    equipped: { head: "", chest: "", weapon: IRON_BOW },
    ownedItems: new Set([IRON_BOW, STARTER_STONE]),
    bootsEquipped: true, itemUpgradeLevel: 0, itemUpgradeLevels: {} as Record<string, number>,
    equipmentStrengthMultiplier: 1, steadyEquipmentUpgrades: true,
    activeUpgrade: null as { itemId: string; completesAt: number; level: number } | null,
    activeResearch: null, bossRewardClaims: 0,
  };
}

describe("steady simulated equipment upgrades", () => {
  it("keeps equipment usable and applies completed tiers to the whole slot", () => {
    const state = fixture();
    startNextEquipmentUpgrade(state);
    expect(state.activeUpgrade?.itemId).toBe(IRON_BOW);
    expect(state.equipped.weapon).toBe(IRON_BOW);
    const duration = itemUpgradeDurationMs(0) / 1000;
    state.steadyEquipmentUpgrades = false;
    advanceTime(state, duration - 1, "off", vi.fn());
    expect(state.itemUpgradeLevels.HAND).toBeUndefined();
    advanceTime(state, duration, "off", vi.fn());
    expect(state.itemUpgradeLevels.HAND).toBe(1);
    expect(state.equipped.weapon).toBe(IRON_BOW);
    expect(simulationUpgradeLevel(state, STARTER_STONE)).toBe(1);
    expect(simulationUpgradeLevel(state, IRON_BOW)).toBe(1);
  });

  it("keeps one upgrade active and uses the longer duration for the next level", () => {
    const state = fixture();
    advanceTime(state, itemUpgradeDurationMs(0) / 1000, "off", vi.fn());
    expect(state.itemUpgradeLevels.HAND).toBe(1);
    expect(state.activeUpgrade?.level).toBe(1);
    expect(state.activeUpgrade?.completesAt).toBeCloseTo((itemUpgradeDurationMs(0) + itemUpgradeDurationMs(1)) / 1000, 6);
  });
});
