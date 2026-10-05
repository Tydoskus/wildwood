import { describe, expect, it } from 'vitest';
import { CALIBRATION_MAX, createFarmEvaluator, groupFightDanger, meetsMapReference } from './auto-farm-build';
import { referenceBuildForMap } from '../../../shared/progression';
import { MAP_IDS } from '../../../shared/rules';

const evaluator = (measuredDps: number | null, extra: Partial<Parameters<typeof createFarmEvaluator>[0]> = {}) => createFarmEvaluator({
  base: () => ({ maxHp: 1_000, damage: 100, armor: 0, regen: 0, attackRate: 1 }),
  equipment: () => ({ equippedHead: '', equippedChest: '', equippedRightHand: '', equippedLeftHand: '' }) as never,
  research: () => null, upgradeLevel: () => 0, rewardMultiplier: () => 1, minAttackInterval: () => .2,
  criticalChance: () => 0, criticalMultiplier: () => 1,
  boss: () => ({ hp: 10_000, strongestHit: 100, averageHit: 100, regenFraction: 0, mapId: 'tutorial_forest' }),
  measuredDps: () => measuredDps, ...extra,
});

describe('autofarm build estimates', () => {
  it("prices the boss fight by the damage the player really lands, not damage and crits alone", () => {
    const modelled = evaluator(null);
    // Multishot and the rest: three times what damage predicts.
    const measured = evaluator(modelled.dps() * 3);
    expect(measured.calibration()).toBeCloseTo(3);
    expect(measured.dps()).toBeCloseTo(modelled.dps() * 3);
    expect(measured.evaluate().fightSeconds!).toBeLessThan(modelled.evaluate().fightSeconds! / 2.5);
    // An odd sample cannot swing it without limit.
    expect(evaluator(modelled.dps() * 1_000).calibration()).toBe(CALIBRATION_MAX);
  });

  it("forgets the old build's hits when a run swaps the build, so a fresh run never looks boss-ready", () => {
    let damage = 10_000, measured: number | null = null;
    const reset = () => { measured = null; };
    const farm = evaluator(null, { base: () => ({ maxHp: 1_000, damage, armor: 0, regen: 0, attackRate: 1 }), measuredDps: () => measured, resetMeasured: reset });
    measured = farm.dps() * 3;
    expect(farm.calibration()).toBeCloseTo(3);
    // A farm's own growth keeps the measurement.
    damage *= 1.1;
    expect(farm.calibration()).toBeGreaterThan(1);
    // An Aggro run starts: the build falls to a fresh character's.
    damage = 100;
    expect(farm.calibration()).toBe(1);
    expect(measured).toBeNull();
  });

  it('counts Boss Slayer on the boss fight', () => {
    expect(evaluator(null, { bossSlayer: () => 1 }).evaluate().fightSeconds!).toBeLessThan(evaluator(null).evaluate().fightSeconds!);
  });

  it('charges a pulled group all at once, and lets Second Wind and Reflect take the edge off', () => {
    const group = [{ hp: 100, damage: 50, attacksPerSecond: 1, population: 10 }];
    const fighter = { maxHp: 1_000, armor: 0, regen: 0, dps: 100, reflectChance: 0, reflectOnly: false, healPerKill: 0 };
    const pulled = groupFightDanger(group, fighter, 10), unpulled = groupFightDanger(group, fighter, 3);
    expect(pulled).toBeGreaterThan(unpulled);
    expect(groupFightDanger(group, { ...fighter, healPerKill: .1 }, 10)).toBeLessThan(pulled);
    expect(groupFightDanger(group, { ...fighter, reflectChance: 1 }, 10)).toBeLessThan(pulled);
  });

  it("moves on only with the next map's expected arrival build: half the damage or half the toughness is not enough", () => {
    for (const [index, mapId] of MAP_IDS.entries()) {
      const reference = referenceBuildForMap(index);
      const stats = { maxHp: reference.maxHp, damage: reference.damage, armor: reference.armor, regen: reference.regen, attackRate: reference.attackInterval };
      const dps = reference.damage / reference.attackInterval;
      expect(meetsMapReference(mapId, stats, dps), mapId).toBe(true);
      expect(meetsMapReference(mapId, stats, dps / 2), mapId).toBe(false);
      expect(meetsMapReference(mapId, { ...stats, maxHp: stats.maxHp / 2, armor: stats.armor / 2, regen: stats.regen / 2 }, dps), mapId).toBe(false);
    }
    expect(meetsMapReference('endless_3', referenceBuildForMap(1) as never, 1)).toBeNull();
  });
});
