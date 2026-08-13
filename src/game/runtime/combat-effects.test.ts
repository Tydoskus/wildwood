import { describe, expect, it } from "vitest";
import { createCombatEffects } from "./combat-effects";

describe("combat effects runtime", () => {
  it("expires particles and damage numbers", () => {
    const effects = createCombatEffects();
    effects.spawnBurst(10, 20, "#fff", 1, 10);
    effects.spawnDamageNumber(10, 20, 1500);

    expect(effects.particles).toHaveLength(1);
    expect(effects.damageNumbers).toHaveLength(1);
    effects.update(1);
    expect(effects.particles).toHaveLength(0);
    expect(effects.damageNumbers).toHaveLength(0);
  });

  it("ignores invalid damage", () => {
    const effects = createCombatEffects();
    effects.spawnDamageNumber(10, 20, 0);
    effects.update(0);

    expect(effects.particles).toHaveLength(0);
    expect(effects.damageNumbers).toHaveLength(0);
  });
});
