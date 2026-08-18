import { describe, expect, it } from "vitest";
import { ENEMY_TYPES, rewardLabel } from "./enemies";

describe("enemy reward rules", () => {
  it("keeps starter through Lava Wastes reward values intentional", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 28 });
    expect(ENEMY_TYPES.Mossback.reward).toEqual({ type: "armor", amount: 5 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 352 });
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: 1 });
    expect(ENEMY_TYPES["Dune Archer"].reward).toEqual({ type: "health", amount: 8_500 });
    expect(ENEMY_TYPES["Blight Oracle"].reward).toEqual({ type: "regen", amount: 320 });
    expect(ENEMY_TYPES["Frost Raider"].reward).toEqual({ type: "damage", amount: 240_000 });
    expect(ENEMY_TYPES["Frost Raider"].hp).toBe(2_700_000_000);
    expect(ENEMY_TYPES["Frost Raider"].damage).toBe(2_330_000);
    expect(ENEMY_TYPES["Glacier Archer"].hp).toBe(2_280_000_000);
    expect(ENEMY_TYPES["Whiteout Reaper"].reward).toEqual({ type: "damage", amount: 3_150_000 });
    expect(ENEMY_TYPES["Rime Guard"].reward).toEqual({ type: "armor", amount: 14_000 });
    expect(ENEMY_TYPES["Aurora Oracle"].reward).toEqual({ type: "regen", amount: 161_000 });
    expect(ENEMY_TYPES["Rime Guard"].hp).toBeGreaterThan(ENEMY_TYPES["Venom Guard"].hp);
    expect(ENEMY_TYPES["Ember Raider"]).toMatchObject({
      hp: 6_075_000_000_000,
      damage: 2_714_450_000,
      reward: { type: "damage", amount: 48_000_000 },
    });
    expect(ENEMY_TYPES["Cinder Archer"].hp).toBeGreaterThan(ENEMY_TYPES["Glacier Archer"].hp);
    expect(ENEMY_TYPES["Cinder Archer"].damage).toBe(49_729_000_000);
    expect(ENEMY_TYPES["Magma Guard"].damage).toBe(389_400_000_000);
    expect(ENEMY_TYPES["Ash Reaper"].damage).toBe(14_700_000_000);
    expect(ENEMY_TYPES["Inferno Oracle"].damage).toBe(204_490_000_000);
    expect(ENEMY_TYPES["Magma Guard"].reward).toEqual({ type: "armor", amount: 1_307_000 });
    expect(ENEMY_TYPES["Ash Reaper"].reward).toEqual({ type: "damage", amount: 1_984_500_000 });
    expect(ENEMY_TYPES["Inferno Oracle"].reward).toEqual({ type: "regen", amount: 81_003_125 });
  });

  it("formats reward labels without changing their numeric value", () => {
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "damage", amount: 1.05 })).toBe("+1.05 DAMAGE");
    expect(rewardLabel({ type: "armor", amount: 150 })).toBe("+150 ARMOR");
    expect(rewardLabel({ type: "health", amount: 8_500 })).toBe("+8.50k MAX HEALTH");
    expect(rewardLabel({ type: "damage", amount: 240_000 })).toBe("+240k DAMAGE");
  });
});
