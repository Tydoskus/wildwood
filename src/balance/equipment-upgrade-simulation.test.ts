import { describe, expect, it, vi } from "vitest";
import { advanceTime, startNextEquipmentUpgrade } from "./simulator";
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
  it("uses a fallback weapon while the bow is at the bench and restores it on completion", () => {
    const state = fixture();
    startNextEquipmentUpgrade(state);
    expect(state.activeUpgrade?.itemId).toBe(IRON_BOW);
    expect(state.equipped.weapon).toBe(STARTER_STONE);
    const duration = itemUpgradeDurationMs(0) / 1000;
    state.steadyEquipmentUpgrades = false;
    advanceTime(state, duration - 1, "off", vi.fn());
    expect(state.itemUpgradeLevels[IRON_BOW]).toBeUndefined();
    advanceTime(state, duration, "off", vi.fn());
    expect(state.itemUpgradeLevels[IRON_BOW]).toBe(1);
    expect(state.equipped.weapon).toBe(IRON_BOW);
    expect(state.itemUpgradeLevels[STARTER_STONE]).toBeUndefined();
  });

  it("keeps one upgrade active and uses the longer duration for the next level", () => {
    const state = fixture();
    advanceTime(state, itemUpgradeDurationMs(0) / 1000, "off", vi.fn());
    expect(state.itemUpgradeLevels[IRON_BOW]).toBe(1);
    expect(state.activeUpgrade?.level).toBe(1);
    expect(state.activeUpgrade?.completesAt).toBe((itemUpgradeDurationMs(0) + itemUpgradeDurationMs(1)) / 1000);
  });
});
