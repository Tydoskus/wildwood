import { expect, it, vi } from "vitest";
import { createEmptyResearchRanks, researchStatRewardMultiplier } from "../../../shared/research";
import { prestigeStatMultiplier } from "../../../shared/prestige";
import { createResearchController } from "./research-controller";
import { addPlayerBaseMaxHealth, setPlayerBaseMaxHealth } from "./player-health";
import { createRewardDisplay } from "./reward-display";
import type { PlayerState } from "./types";

// main.ts's wiring: the research controller's reward multiplier is the stat gain the server pays.
function wired(showBase = false, aggro = false) {
  const ranks = { ...createEmptyResearchRanks(), foraging: 5, prosperity: 3, vitality: 12 };
  const player = { hp: 0, baseMaxHp: 0, maxHp: 0, damage: 100 } as PlayerState;
  const healthBonus = () => (1 + ranks.vitality * .02) - 1;
  const research = createResearchController({ player, getRanks: () => ranks, isDueling: () => false, maxPlayerStat: 1e30, saveProgress: vi.fn(),
    healthMultiplierBonus: healthBonus, prestigeLevel: () => aggro ? 0 : 4, guildQuestBonus: () => 1.08 });
  const display = createRewardDisplay(research.rewardMultiplier, research.ranks, () => showBase,
    () => ({ equippedRightHand: "", equippedLeftHand: "", equippedHead: "", equippedChest: "" }), () => 0);
  return { ranks, player, healthBonus, research, display };
}

it("shows a kill's reward at the full stat gain the server pays: Tech, Prestige and Guild", () => {
  const { ranks, research, display } = wired();
  const gain = researchStatRewardMultiplier(ranks) * prestigeStatMultiplier(4) * 1.08;
  expect(research.rewardMultiplier()).toBeCloseTo(gain);
  expect(display.displayedAmount("damage", 10)).toBeCloseTo(10 * gain);
  expect(display.displayedMultiplier()).toBeCloseTo(gain);
});

it("drops the prestige bonus during an Aggro run, as the server does", () => {
  const { ranks, display } = wired(false, true);
  expect(display.displayedAmount("damage", 10)).toBeCloseTo(10 * researchStatRewardMultiplier(ranks) * 1.08);
});

it("shows a health reward as exactly the max health it adds, Vitality included", () => {
  const { player, healthBonus, research, display } = wired();
  setPlayerBaseMaxHealth(player, 1_000, healthBonus(), true);
  const before = player.maxHp;
  addPlayerBaseMaxHealth(player, 50 * research.rewardMultiplier(), healthBonus());
  expect(display.displayedAmount("health", 50)).toBeCloseTo(player.maxHp - before, 9);
});

it("shows the base reward with Show Base Stat Rewards on", () => {
  const { display } = wired(true);
  expect(display.displayedAmount("health", 50)).toBe(50);
  expect(display.displayedMultiplier()).toBe(1);
});
