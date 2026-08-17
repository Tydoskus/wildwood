import { describe, expect, it } from "vitest";
import { createCombatEffects, MAX_DAMAGE_NUMBERS, MAX_PARTICLES } from "./combat-effects";

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

  it("caps and recycles transient effects", () => {
    const effects = createCombatEffects();
    for (let index = 0; index < MAX_PARTICLES + 50; index += 1) effects.spawnParticle(0, 0, 0, 0, 1, 1, 1, "#fff");
    for (let index = 0; index < MAX_DAMAGE_NUMBERS + 20; index += 1) effects.spawnDamageNumber(0, 0, 1);
    expect(effects.particles).toHaveLength(MAX_PARTICLES);
    expect(effects.damageNumbers).toHaveLength(MAX_DAMAGE_NUMBERS);
    effects.update(2);
    expect(effects.particles).toHaveLength(0);
    expect(effects.damageNumbers).toHaveLength(0);
  });
});
