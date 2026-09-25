import { expect, it, vi } from "vitest";
import { showDuelSkillEffects } from "./duel-skill-effects";
import { ARROW_STORM_ARROWS } from "../../../shared/bow-skills";
import type { DuelCombat } from "../../../shared/duel-combat";

it("shows all three bow effects only on the hit crossing, and respects old duels", () => {
  const duel: DuelCombat = { combatVersion: 4, riposteSeed: 42n,
    challengerMaxHp: 1e9, challengerDamage: 100, challengerArmor: 0, challengerRegen: 0, challengerAttackRate: 1,
    opponentMaxHp: 1e9, opponentDamage: 100, opponentArmor: 0, opponentRegen: 0, opponentAttackRate: 1,
    challengerArrowStorm: 100, challengerRicochet: 100, challengerPiercingShot: 100 };
  const effects = { spawnArcingArrow: vi.fn(), spawnSkillStreak: vi.fn(), spawnSkillRing: vi.fn() };
  const counts = { challengerAttacks: 1, opponentAttacks: 1 };
  showDuelSkillEffects(duel, .9, 1, counts, effects);
  expect(effects.spawnArcingArrow).toHaveBeenCalledTimes(ARROW_STORM_ARROWS);
  expect(effects.spawnSkillStreak).toHaveBeenCalledTimes(3);
  expect(effects.spawnSkillRing).toHaveBeenCalledTimes(2);
  showDuelSkillEffects(duel, 1, 1.1, counts, effects);
  showDuelSkillEffects({ ...duel, combatVersion: 3 }, .9, 1, counts, effects);
  expect(effects.spawnArcingArrow).toHaveBeenCalledTimes(ARROW_STORM_ARROWS);
});
