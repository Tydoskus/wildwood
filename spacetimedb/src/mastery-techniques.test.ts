import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { masteryPointsForLevel, type WeaponSchool } from "../../shared/weapon-mastery";
import { BLOODLUST_HEAL_SHARE, MANA_SHIELD_REDUCTION, MARK_DAMAGE_BONUS, MOMENTUM_MAX, PARRY_RETURN_BONUS, TAILWIND_SPEED_BONUS } from "../../shared/mastery-techniques";
import { ARROW_STORM_ARROWS } from "../../shared/bow-skills";
import { PLAYER_SPEED } from "../../shared/rules";
import { createCombatReport } from "./boss-combat";
import { masteryKey } from "./weapon-mastery";
import { bowSkillKey } from "./bow-skills";
import { setSwordSkillRoll } from "./sword-skills";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
/** Sets a school's level, replacing any earlier one. */
function train(f: Fixture, school: WeaponSchool, level: number, who = f.ctx.sender) {
  const key = masteryKey(who, school), row = { key, identity: who, school, points: BigInt(masteryPointsForLevel(level)) };
  if (f.db.playerWeaponMastery.key.find(key)) f.db.playerWeaponMastery.key.update(row); else f.seed("playerWeaponMastery", row);
}
const holding = (f: Fixture, itemId: string, who = f.ctx.sender) => f.patch("playerProgress", { inventoryJson: JSON.stringify([itemId]),
  equippedRightHand: itemId, equippedLeftHand: "", ionCitadelUnlocked: true, equippedHead: "", equippedChest: "" }, who);
function bound(f: Fixture) {
  const { combatBoundForReport } = createCombatReport({ attackIntervalForProgress: progress => progress.attackRate,
    itemUpgradeLevelFor: () => 0, inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
    equippedRightHandForProgress: progress => progress.equippedRightHand, equippedLeftHandForProgress: progress => progress.equippedLeftHand,
    equippedHeadForProgress: progress => progress.equippedHead, equippedChestForProgress: progress => progress.equippedChest });
  return combatBoundForReport(f.ctx as any).preview({ type: "damage", amount: 0, count: 0 });
}
/** The bound at two levels of one school. */
function boundAt(f: Fixture, school: WeaponSchool, before: number, after: number) {
  train(f, school, before);
  const plain = bound(f);
  train(f, school, after);
  return { plain, trained: bound(f) };
}

describe("techniques in the kill bound", () => {
  it("counts a bow's hits as crits with no crit chance, so Steady Aim adds none, and Hunter's Mark's 8%", () => {
    const f = crystalFixture();
    holding(f, "ion_bow");
    f.patch("playerProgress", { damage: 10 });
    // A bow crits on its own (bow-skills.ts): every hit is already at the crit multiplier before Steady Aim.
    const steady = boundAt(f, "archery", 9, 10);
    expect(steady.trained.dps / steady.plain.dps).toBeCloseTo(1);
    const mark = boundAt(f, "archery", 29, 30);
    expect(mark.trained.dps / mark.plain.dps).toBeCloseTo(1 + MARK_DAMAGE_BONUS);
  });

  it("counts Volley's 15% only when Split Shot is in play", () => {
    const f = crystalFixture();
    holding(f, "ion_bow");
    f.patch("playerProgress", { damage: 10 });
    const without = boundAt(f, "archery", 19, 20);
    expect(without.trained.dps).toBeCloseTo(without.plain.dps);
    f.seed("playerPrestigePerk", { identity: f.ctx.sender, splitShot: 1 });
    const split = boundAt(f, "archery", 19, 20);
    expect(split.trained.dps / split.plain.dps).toBeCloseTo(1.15);
  });

  it("counts Rain of Arrows' second wave in a bow's reach", () => {
    const f = crystalFixture();
    holding(f, "ion_bow");
    f.patch("playerProgress", { damage: 10, projectileCount: 1 });
    f.seed("playerBowSkill", { key: bowSkillKey(f.ctx.sender, "ion_bow"), identity: f.ctx.sender, itemId: "ion_bow",
      arrowStorm: 10, ricochet: 0, piercingShot: 0 });
    const rain = boundAt(f, "archery", 49, 50);
    // Skill Proficiency at 49 and 50: 10% × 1.49 and 10% × 1.5 a storm, each of five arrows, the second wave five more.
    expect(rain.trained.reach! / rain.plain.reach!).toBeCloseTo((1 + .15 * ARROW_STORM_ARROWS * 2) / (1 + .149 * ARROW_STORM_ARROWS));
  });

  it("counts Momentum's faster swings, Bloodlust's heal for Reflect and Parry's bigger return", () => {
    const f = crystalFixture();
    holding(f, "ion_sword");
    f.patch("playerProgress", { damage: 10, maxHp: 1_000, regen: 0, armor: 0, attackRate: 1 });
    const momentum = boundAt(f, "swordplay", 39, 40);
    expect(momentum.trained.attackInterval / momentum.plain.attackInterval).toBeCloseTo(1 / (1 + MOMENTUM_MAX));
    expect(momentum.trained.dps / momentum.plain.dps).toBeCloseTo(1 + MOMENTUM_MAX, 2);
    f.seed("playerPrestigePerk", { identity: f.ctx.sender, riposte: 1 });
    const bloodlust = boundAt(f, "swordplay", 29, 30);
    expect(bloodlust.trained.reflectDps!).toBeGreaterThan(bloodlust.plain.reflectDps!);
    const g = crystalFixture();
    holding(g, "ion_sword");
    g.patch("playerProgress", { damage: 10, maxHp: 1_000, regen: 0, armor: 0 });
    g.transaction(() => setSwordSkillRoll(g.ctx as any, g.ctx.sender, "ion_sword", { whirlwind: 0, deflect: 5, shockwave: 0 }));
    const parry = boundAt(g, "swordplay", 19, 20);
    expect(parry.trained.reflectDps! / parry.plain.reflectDps!).toBeCloseTo(1 + PARRY_RETURN_BONUS);
  });

  it("lets Reflect answer the bigger hit Mana Shield let less of through", () => {
    const f = crystalFixture();
    holding(f, "ion_staff");
    f.patch("playerProgress", { damage: 10, maxHp: 1_000, regen: 0, armor: 0 });
    f.seed("playerPrestigePerk", { identity: f.ctx.sender, riposte: 1 });
    const shield = boundAt(f, "sorcery", 39, 40);
    expect(shield.trained.reflectDps! / shield.plain.reflectDps!).toBeCloseTo(1 / (1 - MANA_SHIELD_REDUCTION));
  });
});

describe("techniques in duels", () => {
  function duel(challengerWeapon: string, opponentWeapon: string, levels: { challenger?: [WeaponSchool, number]; opponent?: [WeaponSchool, number] }) {
    const f = crystalFixture(), opponent = identity("b");
    holding(f, challengerWeapon);
    f.patch("playerProgress", { damage: 10, maxHp: 10_000, regen: 0 });
    f.progress(opponent, { damage: 10, maxHp: 10_000 });
    holding(f, opponentWeapon, opponent);
    f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
    f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
    f.transaction(() => setSwordSkillRoll(f.ctx as any, f.ctx.sender, "ion_sword", { whirlwind: 10, deflect: 4, shockwave: 0 }));
    if (levels.challenger) train(f, levels.challenger[0], levels.challenger[1]);
    if (levels.opponent) train(f, levels.opponent[0], levels.opponent[1], opponent);
    return { f, run: () => {
      f.run(server.requestDuel, { opponent });
      const row = [...f.db.duel.iter()][0];
      return { duel: row, frozen: f.db.duelCombatSnapshot.duelId.find(row.id) };
    } };
  }

  it("folds a Swordplay 50 challenger's Momentum, Bloodlust, Blade Storm and Parry into what the duel stores", () => {
    const plain = duel("ion_sword", "starter_bow", { challenger: ["swordplay", 9] }).run();
    const trained = duel("ion_sword", "starter_bow", { challenger: ["swordplay", 50] }).run();
    expect(trained.duel.challengerAttackRate / plain.duel.challengerAttackRate).toBeCloseTo(1 / (1 + MOMENTUM_MAX));
    expect(trained.duel.challengerRegen - plain.duel.challengerRegen)
      .toBeCloseTo(BLOODLUST_HEAL_SHARE * 10_000 / trained.duel.challengerAttackRate);
    // 10% Whirlwind × 1.5 proficiency × 4/3 for the extra tick.
    expect(trained.frozen.challengerWhirlwind).toBeCloseTo(20);
    // The bow can be deflected, so Parry adds to the sword's damage.
    expect(trained.duel.challengerDamage).toBeGreaterThan(plain.duel.challengerDamage);
  });

  it("folds Mana Shield into what the other side deals, and Steady Aim into an archer's damage", () => {
    const plain = duel("ion_staff", "starter_bow", {}).run();
    const shielded = duel("ion_staff", "starter_bow", { challenger: ["sorcery", 40] }).run();
    expect(shielded.duel.opponentDamage / plain.duel.opponentDamage).toBeCloseTo(1 / (.5 + .5 / (1 - MANA_SHIELD_REDUCTION)));
    const aiming = duel("ion_staff", "starter_bow", { opponent: ["archery", 10] }).run();
    expect(aiming.duel.opponentDamage).toBeGreaterThan(plain.duel.opponentDamage);
  });

  it("brings no technique into a duel during an Aggro run", () => {
    const plain = duel("ion_sword", "starter_bow", {}).run();
    const fixture = duel("ion_sword", "starter_bow", { challenger: ["swordplay", 50] });
    fixture.f.seed("playerAggroChallenge", { identity: fixture.f.ctx.sender, active: true, completed: 0 });
    const aggro = fixture.run();
    expect(aggro.duel.challengerAttackRate).toBeCloseTo(plain.duel.challengerAttackRate);
    expect(aggro.duel.challengerDamage).toBeCloseTo(plain.duel.challengerDamage);
    expect(aggro.frozen.challengerWhirlwind).toBeCloseTo(10);
  });
});

describe("Tailwind on the server", () => {
  const tailwind = PLAYER_SPEED * (1 + TAILWIND_SPEED_BONUS);

  it("accepts 6% more speed with Archery 40 and a bow in hand, and keeps movement at it", () => {
    const f = crystalFixture();
    holding(f, "starter_bow");
    train(f, "archery", 40);
    f.run(server.setSpeed, { speed: tailwind });
    // A save puts the row back to the plain speed; the movement check still allows Tailwind.
    f.patch("player", { speed: PLAYER_SPEED });
    f.run(server.updateMovementState, { x: 4050, y: 4050, vx: tailwind, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1 });
    expect(f.db.playerMotion.identity.find(f.ctx.sender)!.vx).toBeCloseTo(tailwind);
  });

  it("refuses it below level 40, with a sword in hand, or during an Aggro run", () => {
    const f = crystalFixture();
    holding(f, "starter_bow");
    train(f, "archery", 39);
    expect(() => f.run(server.setSpeed, { speed: tailwind })).toThrow("Unsupported player speed");
    train(f, "archery", 50);
    holding(f, "wooden_sword");
    expect(() => f.run(server.setSpeed, { speed: tailwind })).toThrow("Unsupported player speed");
    holding(f, "starter_bow");
    f.seed("playerAggroChallenge", { identity: f.ctx.sender, active: true, completed: 0 });
    expect(() => f.run(server.setSpeed, { speed: tailwind })).toThrow("Unsupported player speed");
    f.run(server.updateMovementState, { x: 4050, y: 4050, vx: tailwind, vy: 0, simulationTick: 1, motionEpoch: 1, sequence: 1 });
    expect(f.db.playerMotion.identity.find(f.ctx.sender)!.vx).toBeLessThan(tailwind);
  });
});
