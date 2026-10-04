import { expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../../shared/research";
import { createResearchController } from "./research-controller";
import { setPlayerBaseMaxHealth } from "./player-health";
import type { PlayerState } from "./types";

it("never rewrites saved health for Vitality, so research arriving after stats cannot apply it twice", () => {
  // A login where saved stats land first and the research row a moment later.
  let ranks = createEmptyResearchRanks();
  const player = { hp: 0, baseMaxHp: 0, maxHp: 0 } as PlayerState;
  const bonus = () => (1 + ranks.vitality * .02) - 1;
  const saveProgress = vi.fn();
  const research = createResearchController({ player, getRanks: () => ranks, isDueling: () => false, maxPlayerStat: 1e30, saveProgress, healthMultiplierBonus: bonus });
  setPlayerBaseMaxHealth(player, 1_000, bonus(), true);
  research.setAppliedVitalityRank(0);
  ranks = { ...ranks, vitality: 20 };
  research.applyVitality();
  research.applyVitality();
  expect(player.baseMaxHp).toBe(1_000);
  expect(player.maxHp).toBeCloseTo(1_400);
  expect(saveProgress).not.toHaveBeenCalled();
});
