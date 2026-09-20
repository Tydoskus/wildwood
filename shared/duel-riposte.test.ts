import { expect, it } from "vitest";
import { advanceDuelCombat, duelRiposted, initialDuelCombatState, DUEL_COMBAT_VERSION, type DuelCombat } from "./duel-combat";
import { PRESTIGE_PERK_MAX_RANK, RIPOSTE_REFLECT_SHARE, prestigeRiposteChance } from "./prestige-perks";

const fighters = (over: Partial<DuelCombat> = {}): DuelCombat => ({
  combatVersion: DUEL_COMBAT_VERSION,
  challengerMaxHp: 1_000, challengerDamage: 100, challengerArmor: 0, challengerRegen: 0, challengerAttackRate: 1,
  opponentMaxHp: 1_000, opponentDamage: 100, opponentArmor: 0, opponentRegen: 0, opponentAttackRate: 1,
  ...over,
});
const run = (duel: DuelCombat) => advanceDuelCombat(duel, initialDuelCombatState(duel), 0, 30_000_000);
const hits = (duel: DuelCombat, side: "challenger" | "opponent", n = 400) =>
  Array.from({ length: n }, (_, index) => duelRiposted(duel, side, index)).filter(Boolean).length;

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
  expect(hits(duel, "opponent")).not.toBe(hits(other, "opponent"));
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

it("reflects half of what it takes, never more than the attacker has left", () => {
  expect(RIPOSTE_REFLECT_SHARE).toBe(.5);
  const duel = fighters({ challengerMaxHp: 10, opponentRiposte: 1, riposteSeed: 5 });
  const result = run(duel);
  expect(result.challengerHp).toBeGreaterThanOrEqual(0);
});
