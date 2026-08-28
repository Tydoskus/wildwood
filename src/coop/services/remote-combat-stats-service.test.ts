import { describe, expect, it } from "vitest";
import type { Identity } from "spacetimedb";
import { remoteCombatStatsFromRows } from "./remote-combat-stats-service";

const identity = {} as Identity;

describe("remote combat stats", () => {
  it("uses the same saved-stat, research, and projectile values as local combat", () => {
    const stats = remoteCombatStatsFromRows({
      identity,
      maxHp: 500,
      damage: 100,
      attackRate: 1.2,
      projectileSpeed: 780,
      projectileCount: 3,
      attackRange: 280,
      armor: 100,
      regen: 5,
      equippedHead: "",
      equippedChest: "",
      equippedRightHand: "",
      equippedLeftHand: "",
    }, {
      identity,
      warcraft: 5,
      precision: 2,
      regeneration: 3,
      criticalChance: 7,
      criticalDamage: 4,
    }, []);

    expect(stats).toMatchObject({
      maxHp: 500,
      armor: 104,
      attackInterval: 1.2,
      projectileSpeed: 780,
      projectileCount: 3,
      attackRange: 280,
      criticalChance: .07,
      criticalDamageMultiplier: 1.25,
    });
    expect(stats.damage).toBeCloseTo(110);
    expect(stats.regen).toBeCloseTo(5.3);
  });
});
