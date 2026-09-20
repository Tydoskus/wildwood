import { expect, it } from "vitest";
import { createResearchController } from "./research-controller";
import { createEmptyResearchRanks, researchStatRewardMultiplier } from "../../../shared/research";
import { PRESTIGE_STAT_GAIN_PER_LEVEL } from "../../../shared/prestige";
import { MAX_PLAYER_STAT } from "../../../shared/rules";

/**
 * The server multiplies a kill's stat reward by research and prestige together.
 * The client applies and labels the same reward locally, so it has to use the
 * same product or the number a player sees is not the number they are paid.
 */
function controller(prestigeLevel: number, foraging = 0) {
  const ranks = { ...createEmptyResearchRanks(), foraging };
  return createResearchController({
    player: { damage: 1, maxHp: 100, armor: 0, regen: 0, attackRate: 1 } as any,
    getRanks: () => ranks, isDueling: () => false, maxPlayerStat: MAX_PLAYER_STAT,
    saveProgress: () => {}, prestigeLevel: () => prestigeLevel,
  });
}

it("pays research and prestige together, adding across levels and multiplying the tree", () => {
  const research = researchStatRewardMultiplier({ ...createEmptyResearchRanks(), foraging: 6 });
  expect(controller(0).rewardMultiplier()).toBe(1);
  expect(controller(3).rewardMultiplier()).toBeCloseTo(1 + 3 * PRESTIGE_STAT_GAIN_PER_LEVEL);
  expect(controller(3, 6).rewardMultiplier()).toBeCloseTo(research * (1 + 3 * PRESTIGE_STAT_GAIN_PER_LEVEL));
  // Levels add, they do not compound: three prestiges are +30%, not 1.1 cubed.
  expect(controller(3).rewardMultiplier()).not.toBeCloseTo(1.1 ** 3);
});

it("treats a player who has never prestiged exactly as before", () => {
  const before = createResearchController({
    player: { damage: 1, maxHp: 100, armor: 0, regen: 0, attackRate: 1 } as any,
    getRanks: () => ({ ...createEmptyResearchRanks(), foraging: 4 }),
    isDueling: () => false, maxPlayerStat: MAX_PLAYER_STAT, saveProgress: () => {},
  });
  expect(before.rewardMultiplier()).toBeCloseTo(controller(0, 4).rewardMultiplier());
});
