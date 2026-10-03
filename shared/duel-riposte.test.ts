import { expect, it } from "vitest";
import { advanceDuelCombat, duelRiposted, initialDuelCombatState, DUEL_COMBAT_VERSION, DUEL_RIPOSTE_BAG_VERSION, DUEL_RIPOSTE_MAX_HP_VERSION, DUEL_RIPOSTE_PRE_ARMOR_VERSION, type DuelCombat } from "./duel-combat";
import { regularEnemySeededUnit } from "./regular-enemy-simulation";
import { PRESTIGE_PERK_MAX_RANK, RIPOSTE_REFLECT_SHARE, prestigeRiposteChance } from "./prestige-perks";

const fighters = (over: Partial<DuelCombat> = {}): DuelCombat => ({
  combatVersion: DUEL_COMBAT_VERSION,
  challengerMaxHp: 1_000, challengerDamage: 100, challengerArmor: 0, challengerRegen: 0, challengerAttackRate: 1,
  opponentMaxHp: 1_000, opponentDamage: 100, opponentArmor: 0, opponentRegen: 0, opponentAttackRate: 1,
  ...over,
});
const run = (duel: DuelCombat) => advanceDuelCombat(duel, initialDuelCombatState(duel), 0, 30_000_000);
// Attacks count from 1, as advanceDuelCombat numbers them.
const rolls = (duel: DuelCombat, side: "challenger" | "opponent", n = 400) =>
  Array.from({ length: n }, (_, index) => duelRiposted(duel, side, index + 1));
const hits = (duel: DuelCombat, side: "challenger" | "opponent", n = 400) => rolls(duel, side, n).filter(Boolean).length;

it("throws a hit back about as often as the rank promises, and never without the perk", () => {
  const chance = prestigeRiposteChance({ riposte: PRESTIGE_PERK_MAX_RANK });
  expect(chance).toBeCloseTo(.3);
  const rate = hits(fighters({ opponentRiposte: chance, riposteSeed: 11n as unknown as number }), "opponent") / 400;
  expect(rate).toBeGreaterThan(.2);
  expect(rate).toBeLessThan(.4);
  expect(hits(fighters({ riposteSeed: 11n as unknown as number }), "opponent")).toBe(0);
});

it("rolls the same way every replay, and differently for another duel", () => {
  const duel = fighters({ opponentRiposte: .3, riposteSeed: 7 });
  expect(run(duel)).toEqual(run(duel));
  const other = fighters({ opponentRiposte: .3, riposteSeed: 8 });
  expect(rolls(duel, "opponent")).not.toEqual(rolls(other, "opponent"));
});

it("reflects exactly its share over every twenty attacks from version 5, a stored f32 chance included", () => {
  const duel = fighters({ opponentRiposte: Math.fround(.3), riposteSeed: 11 });
  expect(DUEL_COMBAT_VERSION).toBeGreaterThanOrEqual(DUEL_RIPOSTE_BAG_VERSION);
  for (let start = 0; start < 400; start += 20) {
    expect(rolls(duel, "opponent", 420).slice(start, start + 20).filter(Boolean)).toHaveLength(6);
  }
});

it("keeps the coin for fights recorded before the bag, so their replays still agree", () => {
  const recorded = fighters({ combatVersion: DUEL_RIPOSTE_BAG_VERSION - 1, opponentRiposte: .3, riposteSeed: 7 });
  const coin = Array.from({ length: 200 }, (_, index) => regularEnemySeededUnit("duel-riposte", "7", "opponent", index + 1) < .3);
  expect(rolls(recorded, "opponent", 200)).toEqual(coin);
});

it("turns a duel the defender would otherwise lose", () => {
  // The challenger swings faster and wins cleanly with no perk in play.
  const plain = fighters({ challengerAttackRate: .5 });
  expect(run(plain).opponentHp).toBe(0);
  // Riposte alone does not save them, but it takes a real bite out of the
  // winner rather than leaving the fight untouched.
  const riposting = fighters({ challengerAttackRate: .5, opponentRiposte: .3, riposteSeed: 3 });
  const result = run(riposting);
  expect(result.challengerHp).toBeLessThan(run(plain).challengerHp);
  expect(result.opponentDamageDealt).toBeGreaterThan(run(plain).opponentDamageDealt);
});

it("throws back half the hit before the defender's armor from version 6, and half of what got through before", () => {
  // Armor 1,000 halves each hit of 100, and every hit is reflected.
  const duel = (combatVersion: number) => fighters({ combatVersion, challengerDamage: 100, opponentArmor: 1_000,
    challengerMaxHp: 1_000_000, opponentMaxHp: 1_000_000, opponentDamage: 0, opponentRiposte: 1, riposteSeed: 5 });
  // Stop before the ten-second ramp; the opponent's own swings still land for the minimum 1.
  const firstAttack = (combatVersion: number) => {
    const state = advanceDuelCombat(duel(combatVersion), initialDuelCombatState(duel(combatVersion)), 0, 9_500_000);
    expect(state.challengerAttacks).toBeGreaterThan(0);
    return (1_000_000 - state.challengerHp - state.opponentAttacks) / state.challengerAttacks;
  };
  expect(firstAttack(DUEL_RIPOSTE_PRE_ARMOR_VERSION)).toBeCloseTo(50, 0);
  expect(firstAttack(DUEL_RIPOSTE_PRE_ARMOR_VERSION - 1)).toBeCloseTo(25, 0);
});

it("reflects half of what it takes, never more than the attacker has left", () => {
  expect(RIPOSTE_REFLECT_SHARE).toBe(.5);
  const duel = fighters({ challengerMaxHp: 10, opponentRiposte: 1, riposteSeed: 5 });
  const result = run(duel);
  expect(result.challengerHp).toBeGreaterThanOrEqual(0);
});

it("caps a thrown-back hit at the reflecting player's max health from version 7, and leaves older replays as they were", () => {
  // A 1,000 hit at a 100-health reflector, every hit reflected, against an attacker who cannot fall.
  const duel = (combatVersion: number) => fighters({ combatVersion, challengerDamage: 1_000, challengerMaxHp: 1_000_000,
    opponentMaxHp: 100, opponentDamage: 0, opponentRiposte: 1, riposteSeed: 5 });
  const thrownOnFirstHit = (combatVersion: number) => {
    const state = advanceDuelCombat(duel(combatVersion), initialDuelCombatState(duel(combatVersion)), 0, 1_100_000);
    expect(state.challengerAttacks).toBe(1);
    return 1_000_000 - state.challengerHp - state.opponentAttacks;
  };
  expect(DUEL_COMBAT_VERSION).toBe(DUEL_RIPOSTE_MAX_HP_VERSION);
  expect(thrownOnFirstHit(DUEL_RIPOSTE_MAX_HP_VERSION)).toBeCloseTo(100, 0);     // the reflector's 100, not half of 1,000
  expect(thrownOnFirstHit(DUEL_RIPOSTE_MAX_HP_VERSION - 1)).toBeCloseTo(500, 0); // a version 6 replay still throws back 500
});
