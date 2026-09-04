import { describe, expect, it } from "vitest";
import { damageAfterArmor } from "./combat";
import { ENEMY_TYPES } from "./enemies";
import { lateMapReferenceBuild } from "../../shared/incoming-damage";
import { BALANCE_TARGET_MAP_POWER_MULTIPLIER, CRYSTAL_HOLLOWS_BOSS_HEALTH_CORRECTION, KOI_SHOGUN_MAX_HP, TEMPEST_KIRIN_MAX_HP, MIREMAW_MAX_HP, POST_FOREST_BOSS_HEALTH_MULTIPLIER, PRISMSHELL_MAX_HP } from "../../shared/rules";

const tiers = [
  ["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"],
  ["Gale Prowler", "Nimbus Archer", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"],
  ["Fen Prowler", "Glowcap Archer", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"],
  ["Shard Hopper", "Crystal Spitter", "Geode Guardian", "Prism Reaver", "Hollow Oracle"],
] as const;

describe("authored late-map incoming damage", () => {
  it("keeps every regular enemy threatening after armor at its reference tier", () => {
    for (const [tier, kinds] of tiers.entries()) {
      const build = lateMapReferenceBuild(tier);
      const fractions = kinds.map((kind) => damageAfterArmor(ENEMY_TYPES[kind].damage, build.armor) / build.maxHp);
      expect(Math.min(...fractions)).toBeCloseTo(.08, 8);
      expect(Math.max(...fractions)).toBeLessThan(.14);
    }
  });

  it("keeps the Crystal hit on the calibrated tier curve", () => {
    const reference = lateMapReferenceBuild(3);
    const referenceHit = damageAfterArmor(ENEMY_TYPES["Geode Guardian"].damage, reference.armor);
    expect(referenceHit / reference.maxHp).toBeGreaterThanOrEqual(.08);
    expect(referenceHit / reference.maxHp).toBeLessThan(.1);
    expect(damageAfterArmor(ENEMY_TYPES["Geode Guardian"].damage, 1e10)).toBeGreaterThan(6e9);
    const crystalHit = ENEMY_TYPES["Geode Guardian"].damage;
    const previousHit = ENEMY_TYPES["Bog Colossus"].damage;
    expect(crystalHit / previousHit).toBeGreaterThan(10);
    expect(crystalHit / previousHit).toBeLessThan(11);
  });

  it("keeps boss HP separate from incoming damage after the post-Forest retune", () => {
    // Boss-health budgets remain separate from the incoming damage ladder;
    // the post-Forest boss multiplier is applied once to the authored roots.
    const health = [KOI_SHOGUN_MAX_HP, TEMPEST_KIRIN_MAX_HP, MIREMAW_MAX_HP, PRISMSHELL_MAX_HP];
    const baseline = [
      313453825312.5001 * POST_FOREST_BOSS_HEALTH_MULTIPLIER,
      2930793266671.8765 * POST_FOREST_BOSS_HEALTH_MULTIPLIER,
      27402917043382.047 * POST_FOREST_BOSS_HEALTH_MULTIPLIER,
      MIREMAW_MAX_HP * BALANCE_TARGET_MAP_POWER_MULTIPLIER * 1.1 * CRYSTAL_HOLLOWS_BOSS_HEALTH_CORRECTION,
    ];
    expect(health).toEqual(baseline);
  });

  it("preserves early-map incoming hits", () => {
    expect(ENEMY_TYPES.Bramble.damage).toBe(14);
    expect(ENEMY_TYPES["Tide Raider"].damage).toBe(1_870_000);
    expect(ENEMY_TYPES["Coral Colossus"].damage).toBe(2_700_000);
  });
});
