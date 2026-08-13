import { describe, expect, it } from "vitest";
import { ENEMY_TYPES, rewardLabel } from "./enemies";

describe("enemy reward rules", () => {
  it("keeps starter and desert reward values intentional", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 28 });
    expect(ENEMY_TYPES.Mossback.reward).toEqual({ type: "armor", amount: 5 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 352 });
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: 1 });
    expect(ENEMY_TYPES["Dune Archer"].reward).toEqual({ type: "health", amount: 8_500 });
    expect(ENEMY_TYPES["Blight Oracle"].reward).toEqual({ type: "regen", amount: 220 });
  });

  it("formats reward labels without changing their numeric value", () => {
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "armor", amount: 150 })).toBe("+150 ARMOR");
  });
});
