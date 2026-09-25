import { describe, expect, it } from "vitest";
import { damageAfterArmor } from "./combat";
import { ENEMY_TYPES } from "./enemies";
import { lateMapReferenceBuild } from "../../shared/incoming-damage";

describe("authored late-map incoming damage", () => {
  it("sets every regular and elite hit to ten percent of maximum health", () => {
    for (const enemy of Object.values(ENEMY_TYPES)) expect(enemy.damage).toBe(enemy.hp * .1);
  });

  it("uses the same rule in Tutorial Forest and keeps armor useful", () => {
    expect(ENEMY_TYPES.Bramble.damage).toBe(4.2);
    expect(ENEMY_TYPES.Spitter.damage).toBe(ENEMY_TYPES.Spitter.hp * .1);
    const build = lateMapReferenceBuild(3), hit = ENEMY_TYPES["Geode Guardian"].damage;
    expect(damageAfterArmor(hit, build.armor * 10)).toBeLessThan(damageAfterArmor(hit, build.armor));
  });
});
