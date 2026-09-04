import { describe, expect, it } from "vitest";
import { advanceDuelCombat, initialDuelCombatState, duelOutcome, duelHitMultiplier, type DuelCombat } from "./duel-combat";
const duel: DuelCombat = { challengerMaxHp: 2000, opponentMaxHp: 2000,
  challengerDamage: 200, opponentDamage: 200, challengerArmor: 100, opponentArmor: 100,
  challengerRegen: 10, opponentRegen: 10, challengerAttackRate: .7333333, opponentAttackRate: .7333333 };

describe("authoritative raw-stat duels", () => {
  it("escalates new fights equally while preserving historical replay rules", () => {
    expect(duelHitMultiplier(10, 1)).toBe(1);
    expect(duelHitMultiplier(20, 1)).toBe(3);
    expect(duelHitMultiplier(30, 1)).toBe(5);
    expect(duelHitMultiplier(30, 0)).toBe(1);
    const oldFight = { ...duel, challengerMaxHp: 6000, opponentMaxHp: 6000 };
    const newFight = { ...oldFight, combatVersion: 1 };
    const oldResult = advanceDuelCombat(oldFight, initialDuelCombatState(oldFight), 0, 30_000_000);
    const newResult = advanceDuelCombat(newFight, initialDuelCombatState(newFight), 0, 30_000_000);
    expect(oldResult.challengerHp).toBeGreaterThan(0);
    expect(newResult.challengerHp).toBe(0);
    expect(newResult.opponentHp).toBe(0);
  });
  it("resolves identical simultaneous lethal attacks as a draw", () => {
    const fight = { ...duel, challengerMaxHp: 100, opponentMaxHp: 100 };
    const result = advanceDuelCombat(fight, initialDuelCombatState(fight), 0, 30_000_000);
    expect(result.challengerHp).toBe(0); expect(result.opponentHp).toBe(0);
    expect(result.challengerDamageDealt).toBe(100);
    expect(duelOutcome(fight, result)).toBe("DRAW");
  });
  it("gives the same result with delayed server pulses or a single replay step", () => {
    const escalating = { ...duel, combatVersion: 1 };
    let state = initialDuelCombatState(escalating), from = 0;
    for (const to of [123456, 2345678, 4000000, 7999999, 11000000, 30000000]) {
      const next = advanceDuelCombat(escalating, state, from, to);
      state = next; from = next.resolvedMicros;
    }
    const whole = advanceDuelCombat(escalating, initialDuelCombatState(escalating), 0, 30_000_000);
    expect(state.challengerHp).toBeCloseTo(whole.challengerHp, 8);
    expect(state.challengerAttacks).toBe(whole.challengerAttacks);
    expect(state.challengerRegened).toBeCloseTo(whole.challengerRegened, 8);
    expect(duelOutcome(duel, state)).toBe(duelOutcome(duel, whole));
  });
  it("keeps earned strength decisive without compressing the advantage", () => {
    const fight = { ...duel, challengerDamage: duel.challengerDamage * 100, challengerMaxHp: duel.challengerMaxHp * 100 };
    const result = advanceDuelCombat(fight, initialDuelCombatState(fight), 0, 30_000_000);
    expect(result.challengerAttacks).toBe(1);
    expect(duelOutcome(fight, result)).toBe("CHALLENGER_WIN");
  });
  it("credits mitigation and recovery to the defender without overheal", () => {
    const result = advanceDuelCombat(duel, initialDuelCombatState(duel), 0, 3_000_000);
    expect(result.challengerBlocked).toBeGreaterThan(0);
    expect(result.challengerRegened).toBeGreaterThan(0);
    expect(result.challengerHp).toBeLessThan(duel.challengerMaxHp);
    expect(result.challengerDamageDealt - result.challengerRegened).toBeCloseTo(duel.opponentMaxHp - result.opponentHp);
  });
  it("awards a knockout even when the survivor has a tiny fraction of HP", () => {
    expect(duelOutcome({ challengerMaxHp: 1e20, opponentMaxHp: 1e20 }, { challengerHp: 1, opponentHp: 0 })).toBe("CHALLENGER_WIN");
  });
  it("judges timeouts by HP fraction instead of granting passive tanks a free win", () => {
    expect(duelOutcome({ challengerMaxHp: 10000, opponentMaxHp: 1000 }, { challengerHp: 4000, opponentHp: 800 })).toBe("OPPONENT_WIN");
    expect(duelOutcome({ challengerMaxHp: 10000, opponentMaxHp: 1000 }, { challengerHp: 10000, opponentHp: 1000 })).toBe("DRAW");
  });
});
