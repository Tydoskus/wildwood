import { expect, it } from "vitest";
import { advanceDuelCombat, duelBowSkillProc, initialDuelCombatState, DUEL_BOW_SKILLS_VERSION, DUEL_COMBAT_VERSION, type DuelCombat } from "./duel-combat";
import { ARROW_STORM_ARROWS, ARROW_STORM_DAMAGE_SHARE, RICOCHET_DAMAGE_SHARE } from "./bow-skills";
import { damageAfterArmor } from "./combat";

const fighters = (over: Partial<DuelCombat> = {}): DuelCombat => ({
  combatVersion: DUEL_COMBAT_VERSION, riposteSeed: 42,
  challengerMaxHp: 1e9, challengerDamage: 100, challengerArmor: 0, challengerRegen: 0, challengerAttackRate: 1,
  opponentMaxHp: 1e9, opponentDamage: 100, opponentArmor: 0, opponentRegen: 0, opponentAttackRate: 1,
  ...over,
});
const run = (duel: DuelCombat, micros = 30_000_000) => advanceDuelCombat(duel, initialDuelCombatState(duel), 0, micros);
// The first hit lands before any escalation multiplier.
const firstHit = (duel: DuelCombat) => run(duel, 1_000_000).challengerDamageDealt;

it("is version 4, and a fight with no bow skills plays exactly as it did before", () => {
  expect(DUEL_COMBAT_VERSION).toBe(4);
  expect(DUEL_BOW_SKILLS_VERSION).toBe(4);
  const plain = fighters({ challengerArmor: 300, opponentArmor: 50, challengerAttackRate: .7 });
  expect(run(plain)).toEqual(run({ ...plain, combatVersion: 3 }));
});

it("never rolls skills in a fight recorded before they existed, so old replays still match", () => {
  const skilled = { challengerArrowStorm: 100, challengerRicochet: 100, challengerPiercingShot: 100 };
  const old = fighters({ combatVersion: 3, ...skilled });
  expect(duelBowSkillProc(old, "challenger", 1, "arrowStorm")).toBe(false);
  expect(run(old)).toEqual(run(fighters({ combatVersion: 3 })));
});

it("lands Arrow Storm's extra arrows on the one opponent, each through their armor", () => {
  const armor = 200;
  const duel = fighters({ opponentArmor: armor, challengerArrowStorm: 100 });
  expect(firstHit(duel)).toBe(damageAfterArmor(100, armor) + ARROW_STORM_ARROWS * damageAfterArmor(100 * ARROW_STORM_DAMAGE_SHARE, armor));
});

it("bounces Ricochet back off the opponent once at its share", () => {
  const duel = fighters({ opponentArmor: 200, challengerRicochet: 100 });
  expect(firstHit(duel)).toBe(damageAfterArmor(100, 200) + damageAfterArmor(100 * RICOCHET_DAMAGE_SHARE, 200));
});

it("sends a Piercing Shot through the opponent's armor", () => {
  const duel = fighters({ opponentArmor: 5_000, challengerPiercingShot: 100 });
  expect(firstHit(fighters({ opponentArmor: 5_000 }))).toBeLessThan(100);
  expect(firstHit(duel)).toBe(100);
  // What armor would have blocked is not counted as blocked.
  expect(run(duel, 1_000_000).opponentBlocked).toBe(0);
});

it("fires about as often as the roll says, for each side on its own", () => {
  const duel = fighters({ challengerArrowStorm: 15, opponentRicochet: 7 });
  const rate = (side: "challenger" | "opponent", skill: "arrowStorm" | "ricochet") =>
    Array.from({ length: 4_000 }, (_, index) => duelBowSkillProc(duel, side, index + 1, skill)).filter(Boolean).length / 4_000;
  expect(rate("challenger", "arrowStorm")).toBeGreaterThan(.12);
  expect(rate("challenger", "arrowStorm")).toBeLessThan(.18);
  expect(rate("opponent", "ricochet")).toBeGreaterThan(.05);
  expect(rate("opponent", "ricochet")).toBeLessThan(.09);
  expect(rate("challenger", "ricochet")).toBe(0);
});

it("resolves the same every time from the stored seed, whether in one step or many", () => {
  const duel = fighters({ challengerArrowStorm: 15, challengerRicochet: 10, opponentPiercingShot: 12, opponentArmor: 400, challengerArmor: 400,
    challengerMaxHp: 20_000, opponentMaxHp: 20_000 });
  const whole = run(duel);
  expect(run(duel)).toEqual(whole);
  let state = initialDuelCombatState(duel), from = 0;
  for (const to of [700_000, 3_100_000, 9_000_000, 17_500_000, 30_000_000]) {
    const next = advanceDuelCombat(duel, state, from, to);
    const { resolvedMicros, ...rest } = next;
    state = rest; from = resolvedMicros;
  }
  expect(state).toEqual((({ resolvedMicros: _, ...rest }) => rest)(whole));
  // Another duel's seed rolls differently.
  expect(run({ ...duel, riposteSeed: 43 })).not.toEqual(whole);
  // A bigint seed, as the server row stores it, rolls the same as its number.
  expect(run({ ...duel, riposteSeed: 42n as unknown as number })).toEqual(whole);
});
