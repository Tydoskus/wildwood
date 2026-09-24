import { describe, expect, it, vi } from "vitest";
import {
  DAMAGE_NUMBER_FADE_DURATION,
  DAMAGE_NUMBER_RISE_DURATION,
  MAX_DAMAGE_NUMBERS,
  MAX_PARTICLES,
  createCombatEffects,
} from "./combat-effects";

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

  it("eases damage numbers to a stop before fading", () => {
    const effects = createCombatEffects();
    effects.spawnDamageNumber(10, 100, 1500);
    const number = effects.damageNumbers[0];
    const startY = number.y;

    effects.update(DAMAGE_NUMBER_RISE_DURATION / 2);
    const halfwayY = number.y;
    expect(halfwayY).toBeLessThan(startY);
    expect(number.opacity).toBe(1);

    effects.update(DAMAGE_NUMBER_RISE_DURATION / 2);
    const stoppedY = number.y;
    expect(stoppedY).toBeLessThan(halfwayY);
    expect(number.opacity).toBe(1);

    effects.update(DAMAGE_NUMBER_FADE_DURATION / 2);
    expect(number.y).toBeCloseTo(stoppedY);
    expect(number.opacity).toBeCloseTo(.5);
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


it("uses white for outgoing hits, yellow for crits, and red for damage taken, including recycled numbers", () => {
  const effects = createCombatEffects();
  const ctx = { save() {}, restore() {}, translate() {}, scale() {} } as unknown as CanvasRenderingContext2D;
  const draw = vi.fn();
  effects.spawnDamageNumber(0, 0, 10);
  effects.spawnDamageNumber(0, 0, 20, true);
  effects.spawnDamageNumber(0, 0, 30, false, true);
  effects.drawDamageNumbers(ctx, { x: 0, y: 0, zoom: 1 }, draw);
  expect(draw.mock.calls.map((args) => args[3])).toEqual(["#ffffff", "#ffe36b", "#ff5a5a"]);
  effects.update(2);
  effects.spawnDamageNumber(0, 0, 40);
  expect(effects.damageNumbers[0].damageTaken).toBe(false);
});

describe("bow skill effects and crowded damage numbers", () => {
  it("fans a burst of hits on one spot out so no two numbers share a place", () => {
    const effects = createCombatEffects();
    for (let hit = 0; hit < 6; hit++) effects.spawnDamageNumber(500, 500, 10 + hit);
    const places = effects.damageNumbers.map(number => `${Math.round(number.x / 20)}:${Math.round(number.startY / 10)}`);
    expect(new Set(places).size).toBe(6);
    // A later, separate hit starts back at the centre.
    effects.update(1);
    effects.spawnDamageNumber(500, 500, 1);
    const latest = effects.damageNumbers[effects.damageNumbers.length - 1];
    expect(Math.abs(latest.x - 500)).toBeLessThanOrEqual(6);
  });

  it("delays, runs and expires Arrow Storm arrows, streaks and rings", () => {
    const effects = createCombatEffects();
    effects.spawnArcingArrow(0, 0, 200, 0, 0, "#fff");
    effects.spawnArcingArrow(0, 0, 200, 0, 1, "#fff");
    effects.spawnSkillStreak(0, 0, 100, 100, "#8fe3ff", 4, .3, true);
    const arrows = effects.skillEffects.filter(effect => effect.kind === "arrow");
    // One arrow swings out each side of the line of fire.
    expect(Math.sign(arrows[0].controlY)).toBe(-Math.sign(arrows[1].controlY));
    expect(effects.skillEffects.length).toBe(5);
    // A delayed effect waits out its delay before its life starts running.
    effects.update(1);
    effects.update(1);
    expect(effects.skillEffects.length).toBe(0);
  });
});
