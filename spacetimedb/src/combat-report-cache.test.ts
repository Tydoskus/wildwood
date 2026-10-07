import { expect, it, vi } from "vitest";
import * as items from "../../shared/items";
import * as armor from "../../shared/combat";
import * as perks from "../../shared/prestige-perks";
import { createCombatReport } from "./boss-combat";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { effectivePlayerPowerStats, preparePlayerPowerStats } from "../../shared/player-power";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("prepares equipment/research factors once and preserves the original multiplication order", () => {
  const progress = { maxHp: 17.33, damage: 123.4567, armor: 400, regen: .17, attackRate: .4,
    equippedRightHand: "starter_bow", equippedHead: "forest_cap", equippedChest: "wooden_armor" };
  const research = { warcraft: 3, vitality: 7, precision: 2, regeneration: 9 };
  const levels = vi.fn(() => 7);
  const prepared = preparePlayerPowerStats(progress, research, levels);
  expect(levels).toHaveBeenCalledTimes(3);
  for (const scale of [1e-10, 1, 1234.567, 1e40]) {
    const base = { ...progress, damage: progress.damage * scale, maxHp: progress.maxHp * scale, regen: progress.regen * scale };
    const actual = prepared(base);
    expect(actual).toEqual(effectivePlayerPowerStats(base, research, () => 7));
    expect(actual.damage).toBe(items.equipmentDamage(base.damage, base.equippedRightHand, base.equippedHead, base.equippedChest, 1.06, 7, 7, 7));
    expect(actual.maxHp).toBe(items.equipmentMaxHealth(base.maxHp, base.equippedHead, base.equippedChest, 1 + 7 * .02, 7, 7));
  }
  expect(levels).toHaveBeenCalledTimes(3);
});

it("reuses challenge, equipment and armor calculations until an armor reward changes the input", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { damage: 1000, armor: 400, equippedRightHand: "starter_bow", inventoryJson: '["starter_bow"]' });
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 1 });
  // Perks live in their own row; the fixture fills the other ranks with zero.
  f.seed("playerPrestigePerk", { identity: f.ctx.sender, riposte: 1 });
  const challengeReads = vi.spyOn(f.db.playerPrestigeChallenge.identity, "find");
  const aggroReads = vi.spyOn(f.db.playerAggroChallenge.identity, "find");
  const reduction = vi.spyOn(armor, "armorDamageReduction");
  const preArmor = vi.spyOn(perks, "preArmorFactor");
  const equipment = vi.spyOn(items, "equipmentDamageMultiplierBonus");
  const { combatBoundForReport } = createCombatReport({
    attackIntervalForProgress: progress => progress.attackRate,
    itemUpgradeLevelFor: () => 3,
    inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
    equippedRightHandForProgress: progress => progress.equippedRightHand,
    equippedLeftHandForProgress: progress => progress.equippedLeftHand,
    equippedHeadForProgress: progress => progress.equippedHead,
    equippedChestForProgress: progress => progress.equippedChest,
  });
  const report = combatBoundForReport(f.ctx as any);
  for (let i = 0; i < 30; i++) {
    const reward = { type: "damage", amount: 1, count: 1 };
    report.preview(reward); report.commit(reward);
  }
  const challengeCount = challengeReads.mock.calls.length, aggroCount = aggroReads.mock.calls.length;
  // Includes fixed prestige multiplier/perk reads, and soul stats' check that no challenge is under way.
  expect(challengeCount).toBeLessThanOrEqual(4);
  expect(aggroCount).toBeLessThanOrEqual(4);
  expect(reduction).toHaveBeenCalledTimes(1);
  const equipmentCount = equipment.mock.calls.length;
  const preArmorCount = preArmor.mock.calls.length;
  expect(preArmorCount).toBeGreaterThan(0);
  const armorReward = { type: "armor", amount: 10, count: 1 };
  report.preview(armorReward); report.commit(armorReward);
  const after = report.preview({ type: "health", amount: 10, count: 1 });
  expect(after.reflectDps).toBeGreaterThan(0);
  expect(reduction).toHaveBeenCalledTimes(2);
  expect(preArmor).toHaveBeenCalledTimes(preArmorCount + 1);
  report.powerFields(report.rewardedProgress());
  expect(equipment).toHaveBeenCalledTimes(equipmentCount);
  expect(challengeReads).toHaveBeenCalledTimes(challengeCount);
  expect(aggroReads).toHaveBeenCalledTimes(aggroCount);
  vi.restoreAllMocks();
});
