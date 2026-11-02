import { describe, expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { setActiveCards } from "../../tests/helpers/active-cards";
import { effectivePowerForProgress, effectivePowerStatsForProgress, researchedArmor, researchedDamage, researchedRegen } from "./player-power";
import { itemLevelFor, maxHealthForProgress } from "./progress-helpers";
import { critPowerFields } from "./crit-power";
import { attackCapInPlay } from "./prestige";
import { effectiveMovementSpeedForProgress } from "./player-speed";
import { activeCardTotalsFor } from "./active-cards";
import { readPlayerProgress } from "./wide-stats";
import { createCombatReport } from "./boss-combat";
import { cardTotals } from "../../shared/card-effects";
import { CARD_DROP_OUTCOMES } from "../../shared/cards";
import { cardOffenseBound } from "../../shared/card-bounds";
import { statRewardMultiplierFor, statRewardMultiplier } from "./prestige";
import { awardCardDrops } from "./card-drops";
import { cardCount } from "./gear-cards";
import { awardKillGold, goldChanceMultiplier, goldFor } from "./gold";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// Tier 1 gear, worn: a bow, a cap and armor; `slot` switches cards on as if each item had them.
function wearing() {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify(["starter_bow", "forest_cap", "wooden_armor"]),
    equippedRightHand: "starter_bow", equippedHead: "forest_cap", equippedChest: "wooden_armor" });
  const progress = () => readPlayerProgress(f.ctx, f.ctx.sender);
  const chosen = new Map<string, string[]>();
  const slot = (itemId: string, cards: string[]) => { chosen.set(itemId, cards); setActiveCards(f.ctx, f.ctx.sender, [...chosen.values()].flat()); };
  const snapshot = () => ({
    damage: researchedDamage(f.ctx, f.ctx.sender, 100), armor: researchedArmor(f.ctx, f.ctx.sender, 50), regen: researchedRegen(f.ctx, f.ctx.sender, 5),
    health: maxHealthForProgress(f.ctx, f.ctx.sender, progress()), stats: effectivePowerStatsForProgress(f.ctx, progress()),
    power: effectivePowerForProgress(f.ctx, progress()), crit: critPowerFields(f.ctx, f.ctx.sender), cap: attackCapInPlay(f.ctx, f.ctx.sender),
    speed: effectiveMovementSpeedForProgress(f.ctx, progress()),
  });
  return { f, progress, slot, snapshot };
}

describe("cards on the server", () => {
  it("counts the active cards whatever is worn, and no item level carries cards", () => {
    const view = wearing();
    view.slot("starter_bow", ["spitter_card", "dune_needle_card"]);
    expect(itemLevelFor(view.f.ctx, view.f.ctx.sender, "starter_bow")).toEqual({ tier: 0, refine: 0 });
    expect(activeCardTotalsFor(view.f.ctx, view.f.ctx.sender).sum).toEqual({ atk: 2, quickDraw: .05 });
    view.f.patch("playerProgress", { equippedRightHand: "" });
    expect(activeCardTotalsFor(view.f.ctx, view.f.ctx.sender).sum).toEqual({ atk: 2, quickDraw: .05 });
  });

  it("puts stat cards into damage, health, armor, regen and power, as the client and power count them", () => {
    const view = wearing();
    const before = view.snapshot();
    view.slot("starter_bow", ["ember_raider_card"]);
    view.slot("forest_cap", ["brood_card"]);
    view.slot("wooden_armor", ["mossback_card"]);
    const after = view.snapshot();
    expect(after.damage).toBeCloseTo(before.damage * 1.049, 9);
    expect(after.health).toBeCloseTo(before.health * .964, 9);
    expect(after.armor).toBeCloseTo(before.armor * 1.03, 9);
    expect(after.regen).toBeCloseTo(before.regen * 1.04, 9);
    expect(after.stats.damage).toBeCloseTo(before.stats.damage * 1.049, 9);
    expect(after.stats.maxHp).toBeCloseTo(before.stats.maxHp * .964, 9);
    expect(after.power).not.toBe(before.power);
  });

  it("adds crit, the attack speed cap and move speed from cards", () => {
    const view = wearing();
    const before = view.snapshot();
    view.slot("starter_bow", ["dune_striker_card", "dune_needle_card"]);
    view.slot("forest_cap", ["striker_card", "tempest_kirin_card"]);
    const after = view.snapshot();
    expect(after.crit.critChance).toBeCloseTo(before.crit.critChance + .01, 9);
    expect(after.crit.critMultiplier).toBeCloseTo(before.crit.critMultiplier * 1.06, 9);
    expect(after.cap.raise).toBeCloseTo(before.cap.raise + .25, 9);
    expect(after.speed).toBeCloseTo(before.speed * 1.1, 6);
  });
});

describe("cards in the kill bound", () => {
  function bounded(cards: Record<string, string[]>) {
    const f = crystalFixture();
    f.patch("playerProgress", { inventoryJson: JSON.stringify(["starter_bow", "wooden_armor"]), equippedRightHand: "starter_bow", equippedChest: "wooden_armor",
      damage: 10, maxHp: 100, regen: 1, armor: 0 });
    setActiveCards(f.ctx, f.ctx.sender, Object.values(cards).flat());
    const { combatBoundForReport } = createCombatReport({ attackIntervalForProgress: progress => progress.attackRate,
      itemUpgradeLevelFor: () => ({ tier: 0 }),
      inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
      equippedRightHandForProgress: progress => progress.equippedRightHand, equippedLeftHandForProgress: progress => progress.equippedLeftHand,
      equippedHeadForProgress: progress => progress.equippedHead, equippedChestForProgress: progress => progress.equippedChest });
    return combatBoundForReport(f.ctx as unknown as Parameters<typeof combatBoundForReport>[0]).preview({ type: "damage", amount: 0, count: 0 });
  }

  it("lets card damage, damage over time and reach kill more, as much as all of them at once could", () => {
    const plain = bounded({});
    const weapon = ["cindermaw_card", "dragon_card", "voltwarden_card", "wastes_reaper_card"];
    const carded = bounded({ starter_bow: weapon });
    const bound = cardOffenseBound(cardTotals(weapon));
    expect(bound.damage).toBeGreaterThan(1);
    expect(bound.reach).toBeGreaterThan(1);
    // Per swing: a Quick Draw card also raises the attack speed cap the report syncs to.
    expect(carded.dps * carded.attackInterval).toBeCloseTo(plain.dps * plain.attackInterval * bound.damage, 6);
    expect(carded.reach).toBeCloseTo(plain.reach! * bound.reach, 6);
  });

  it("counts Reflect cards, Prism's splash and what defensive cards soak in the Reflect bound", () => {
    expect(bounded({}).reflectDps).toBe(0);
    const reflect = bounded({ wooden_armor: ["bramble_card"] }).reflectDps!;
    expect(reflect).toBeGreaterThan(0);
    expect(bounded({ wooden_armor: ["prismshell_card"] }).reflectDps).toBeCloseTo(reflect * 5, 6);
    expect(bounded({ wooden_armor: ["bramble_card", "glacier_regent_card"] }).reflectDps).toBeGreaterThan(reflect);
    expect(bounded({ wooden_armor: ["bramble_card", "glacier_archer_card"] }).reflectDps).toBeGreaterThan(reflect);
  });
});

describe("cards outside a fight, on the server", () => {
  it("pays Bounty cards on their stat's kills", () => {
    const view = wearing();
    view.slot("forest_cap", ["seed_spitter_card"]);
    const pay = statRewardMultiplierFor(view.f.ctx, view.f.ctx.sender), base = statRewardMultiplier(view.f.ctx, view.f.ctx.sender);
    expect(pay("health")).toBeCloseTo(base * 1.036, 9);
    expect(pay("damage")).toBeCloseTo(base, 9);
  });

  it("raises card and gold drop odds with Card Hunter and Treasure cards", () => {
    const view = wearing();
    // A roll that just misses a regular card at its plain odds lands once Card Hunter's +10% is worn.
    Object.assign(view.f.ctx, { random: Object.assign(() => 1.05 / CARD_DROP_OUTCOMES.regular, { integerInRange: (_min: number, max: number) => max }) });
    const award = () => view.f.transaction(() => awardCardDrops(view.f.ctx, view.f.ctx.sender, "tutorial_forest", [{ enemy: "Needle", count: 1 }], 0));
    award();
    expect(cardCount(view.f.ctx, view.f.ctx.sender, "needle_card")).toBe(0);
    view.slot("forest_cap", ["nether_oracle_card"]);
    award();
    expect(cardCount(view.f.ctx, view.f.ctx.sender, "needle_card")).toBe(1);
    // Gold drops on 10% of kills: a draw of .103 misses, and lands once Treasure's +6% is worn (10.6%).
    Object.assign(view.f.ctx, { random: Object.assign(() => .103, { integerInRange: (min: number) => min }) });
    const gold = () => { view.f.transaction(() => awardKillGold(view.f.ctx, view.f.ctx.sender, 1, false)); return goldFor(view.f.ctx, view.f.ctx.sender); };
    expect(gold()).toBe(0n);
    view.slot("forest_cap", ["shrine_oracle_card"]);
    expect(goldChanceMultiplier(view.f.ctx, view.f.ctx.sender)).toBeCloseTo(1.06, 9);
    expect(gold()).toBe(3n);
  });
});
