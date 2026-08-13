import { describe, expect, it } from "vitest";
import { duelShotsAt, duelTimelineState, replayState } from "./duel";

const duel = {
  challengerMaxHp: 100,
  opponentMaxHp: 100,
  challengerAttackRate: 1,
  opponentAttackRate: 1,
  challengerAttacks: 3,
  opponentAttacks: 3,
  challengerRegen: 0,
  opponentRegen: 0,
  challengerDamage: 20,
  opponentDamage: 30,
  challengerArmor: 0,
  opponentArmor: 0,
};

describe("duel replay rules", () => {
  it("uses the same timeline for both duel combatants", () => {
    expect(duelTimelineState(duel, 1)).toEqual({
      challengerHp: 70,
      opponentHp: 80,
      challengerAttacks: 1,
      opponentAttacks: 1,
    });
  });

  it("only renders projectiles inside their visible lifetime", () => {
    const shots = duelShotsAt(duel, 1.2, {
      shotLifetime: .38,
      shotSpeed: 100,
      challengerFromX: 0,
      opponentFromX: 100,
      y: 20,
    });
    expect(shots).toHaveLength(2);
    expect(shots[0].x).toBeCloseTo(20);
    expect(shots[1].x).toBeCloseTo(80);
  });

  it("uses recorded final health at replay completion", () => {
    expect(replayState({ ...duel, durationSeconds: 3, challengerFinalHp: 4, opponentFinalHp: 0 }, 3)).toMatchObject({
      challengerHp: 4,
      opponentHp: 0,
    });
  });
});
