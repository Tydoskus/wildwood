import { describe, expect, it } from "vitest";
import { addPlayerBaseMaxHealth, applyPlayerMaxHealthMultiplier } from "./player-health";

describe("equipment max health", () => {
  it("applies and removes Wooden Armor without compounding the base save stat", () => {
    const player = { hp: 50, baseMaxHp: 100, maxHp: 100 };
    applyPlayerMaxHealthMultiplier(player, 1.05);
    expect(player).toEqual({ hp: 52.5, baseMaxHp: 100, maxHp: 105 });
    applyPlayerMaxHealthMultiplier(player, 1);
    expect(player).toEqual({ hp: 50, baseMaxHp: 100, maxHp: 100 });
  });

  it("scales newly earned max health through the active equipment multiplier", () => {
    const player = { hp: 105, baseMaxHp: 100, maxHp: 105 };
    addPlayerBaseMaxHealth(player, 20, 1.05);
    expect(player).toEqual({ hp: 126, baseMaxHp: 120, maxHp: 126 });
  });
});
