import { criticalDamageMultiplier } from "../../../shared/critical-damage";
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

it("rolls criticals at the cap: 50×, 10× more a Crit Cap rank", () => {
  let ranks = { ...createEmptyResearchRanks(), criticalDamage: 4 };
  const research = createResearchController({ player: {} as PlayerState, getRanks: () => ranks, isDueling: () => false, maxPlayerStat: 1e30,
    saveProgress: () => {}, prestigePerks: () => ({ keenEdge: 1 }) });
  expect(research.criticalDamageMultiplier()).toBeCloseTo(1.05 + .2 + .12);
  expect(research.criticalDamageMultiplier(10)).toBeCloseTo(criticalDamageMultiplier({ researchRank: 4, perks: { keenEdge: 1 }, soul: 10 }));
  expect(research.criticalDamageMultiplier(0, 10)).toBeCloseTo(research.criticalDamageMultiplier(10));
  expect(research.criticalDamageMultiplier(1e300)).toBe(50);
  ranks = { ...ranks, critCap: 4 };
  expect(research.criticalDamageMultiplier(1e300)).toBe(90);
  expect(research.criticalDamageParts()).toMatchObject({ researchRank: 4, capRank: 4 });
});
