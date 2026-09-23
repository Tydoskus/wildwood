import { expect, it } from "vitest";
import { FROST_BOW } from "./items";
import { effectivePlayerPowerStats } from "./player-power";
import { effectiveRewardAmount } from "./reward-display";

it("includes stat gain, damage research, and equipment in displayed damage rewards", () => {
  const equipment = { weapon: FROST_BOW, head: "", chest: "", weaponLevel: 0, headLevel: 0, chestLevel: 0 };
  const progress = { damage: 100, maxHp: 100, attackRate: 1, armor: 10, regen: 2, equippedRightHand: FROST_BOW };
  const before = effectivePlayerPowerStats(progress, { warcraft: 5 });
  const after = effectivePlayerPowerStats({ ...progress, damage: progress.damage + 10 * 1.2 }, { warcraft: 5 });
  expect(effectiveRewardAmount("damage", 10, 1.2, { warcraft: 5 }, equipment)).toBeCloseTo(after.damage - before.damage);
  expect(effectiveRewardAmount("speed", .1, 1.2, { warcraft: 5 }, equipment)).toBeCloseTo(.12);
});

it("applies each stat's effective bonus without counting Vitality twice", () => {
  const equipment = { weapon: "", head: "", chest: "", weaponLevel: 0, headLevel: 0, chestLevel: 0 };
  expect(effectiveRewardAmount("health", 10, 1.2, { vitality: 5 }, equipment)).toBeCloseTo(12);
  expect(effectiveRewardAmount("armor", 10, 1.2, { precision: 5 }, equipment)).toBeCloseTo(13.2);
  expect(effectiveRewardAmount("regen", 10, 1.2, { regeneration: 5 }, equipment)).toBeCloseTo(13.2);
});
