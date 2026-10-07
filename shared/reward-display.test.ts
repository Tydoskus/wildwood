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

it("applies each stat's effective bonus, Vitality included now that it multiplies health live", () => {
  const equipment = { weapon: "", head: "", chest: "", weaponLevel: 0, headLevel: 0, chestLevel: 0 };
  expect(effectiveRewardAmount("health", 10, 1.2, { vitality: 5 }, equipment)).toBeCloseTo(13.2);
  expect(effectiveRewardAmount("armor", 10, 1.2, { precision: 5 }, equipment)).toBeCloseTo(13.2);
  expect(effectiveRewardAmount("regen", 10, 1.2, { regeneration: 5 }, equipment)).toBeCloseTo(13.2);
});

it("shows every stat's reward as exactly what the profile's stat rises by", () => {
  const equipment = { weapon: FROST_BOW, head: "", chest: "", weaponLevel: 3, headLevel: 0, chestLevel: 0 };
  const research = { warcraft: 4, vitality: 7, precision: 2, regeneration: 9 };
  const progress = { damage: 100, maxHp: 500, attackRate: 1, armor: 10, regen: 2, equippedRightHand: FROST_BOW };
  const level = (itemId: string) => itemId === FROST_BOW ? 3 : 0;
  const before = effectivePlayerPowerStats(progress, research, level);
  // Tech 1.15 × Prestige 1.3 × Guild 1.05: the server's statRewardMultiplier.
  const gain = 1.15 * 1.3 * 1.05;
  for (const [type, field] of [["damage", "damage"], ["health", "maxHp"], ["armor", "armor"], ["regen", "regen"]] as const) {
    const after = effectivePlayerPowerStats({ ...progress, [field]: progress[field] + 40 * gain }, research, level);
    expect(effectiveRewardAmount(type, 40, gain, research, equipment)).toBeCloseTo(after[field] - before[field], 9);
  }
});
