import { describe, expect, it } from "vitest";
import { ENEMY_TYPES, rewardLabel } from "./enemies";

describe("enemy reward rules", () => {
  it("keeps starter, desert, and Snowlands reward values intentional", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 28 });
    expect(ENEMY_TYPES.Mossback.reward).toEqual({ type: "armor", amount: 5 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 352 });
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: 1 });
    expect(ENEMY_TYPES["Dune Archer"].reward).toEqual({ type: "health", amount: 8_500 });
    expect(ENEMY_TYPES["Blight Oracle"].reward).toEqual({ type: "regen", amount: 320 });
    expect(ENEMY_TYPES["Frost Raider"].reward).toEqual({ type: "damage", amount: 240_000 });
    expect(ENEMY_TYPES["Frost Raider"].damage).toBe(2_330_000);
    expect(ENEMY_TYPES["Aurora Oracle"].reward).toEqual({ type: "regen", amount: 161_000 });
    expect(ENEMY_TYPES["Rime Guard"].hp).toBeGreaterThan(ENEMY_TYPES["Venom Guard"].hp);
  });

  it("formats reward labels without changing their numeric value", () => {
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "damage", amount: 1.05 })).toBe("+1.05 DAMAGE");
    expect(rewardLabel({ type: "armor", amount: 150 })).toBe("+150 ARMOR");
    expect(rewardLabel({ type: "health", amount: 8_500 })).toBe("+8.50k MAX HEALTH");
    expect(rewardLabel({ type: "damage", amount: 240_000 })).toBe("+240k DAMAGE");
  });
});
