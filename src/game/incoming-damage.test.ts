import { describe, expect, it } from "vitest";
import { damageAfterArmor } from "./combat";
import { ENEMY_TYPES } from "./enemies";
import { lateMapReferenceBuild } from "../../shared/incoming-damage";

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
      expect(Math.min(...fractions)).toBeCloseTo(.06, 6);
      expect(Math.max(...fractions)).toBeLessThan(.14);
    }
  });

  it("preserves the tutorial and keeps extra armor useful", () => {
    expect(ENEMY_TYPES.Bramble.damage).toBe(14);
    const build = lateMapReferenceBuild(3), hit = ENEMY_TYPES["Geode Guardian"].damage;
    expect(damageAfterArmor(hit, build.armor * 10)).toBeLessThan(damageAfterArmor(hit, build.armor));
  });
});
