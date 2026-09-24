import { describe, expect, it } from "vitest";
import { arrowPassesThrough, rainArrowStorm, ricochetChain, type SkillTarget } from "./bow-skill-procs";
import { ARROW_STORM_ARROWS, ARROW_STORM_RADIUS, PIERCING_SHOT_MAX_EXTRA_TARGETS, RICOCHET_MAX_BOUNCES, RICOCHET_RADIUS } from "../../../shared/bow-skills";

const enemy = (x: number, y = 0, extra: Partial<SkillTarget> = {}): SkillTarget => ({ x, y, r: 10, dead: false, ...extra });
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
const PROCS = { arrowStorm: false, ricochet: false, piercingShot: true };

describe("Arrow Storm", () => {
  it("drops every arrow on a boss", () => {
    const boss = enemy(0, 0, { isBoss: true, r: 170 });
    const struck: Array<SkillTarget | null> = [];
    rainArrowStorm({ x: 5, y: 5 }, boss, [enemy(20)], Math.random, target => struck.push(target));
    expect(struck).toEqual(Array(ARROW_STORM_ARROWS).fill(boss));
  });

  it("lands on live enemies near the impact, never on a boss or one out of range", () => {
    const primary = enemy(0), near = enemy(60), far = enemy(ARROW_STORM_RADIUS + 60), boss = enemy(30, 0, { generatedBoss: true });
    const struck: Array<SkillTarget | null> = [];
    rainArrowStorm(primary, primary, [primary, near, far, boss], sequence(0, .99, .4), target => struck.push(target));
    expect(struck).toHaveLength(ARROW_STORM_ARROWS);
    expect(new Set(struck)).toEqual(new Set([primary, near]));
  });

  it("stops picking an enemy once an arrow kills it, and lands the rest on the ground", () => {
    const primary = enemy(0);
    const struck: Array<SkillTarget | null> = [];
    rainArrowStorm(primary, primary, [primary], () => .5, target => {
      struck.push(target);
      if (target) target.dead = true;
    });
    expect(struck).toEqual([primary, null, null, null, null]);
  });
});

describe("Ricochet", () => {
  it("bounces to the nearest enemies in reach, each at most once, up to its limit", () => {
    const first = enemy(0), a = enemy(80), b = enemy(170), c = enemy(260), behind = enemy(-100);
    const chain = ricochetChain(first, [first, c, b, a, behind]);
    expect(chain).toHaveLength(RICOCHET_MAX_BOUNCES);
    expect(chain).toEqual([a, b]);
  });

  it("finds nothing beyond its radius, and nothing from a boss or through the dead", () => {
    expect(ricochetChain(enemy(0), [enemy(RICOCHET_RADIUS + 40)])).toEqual([]);
    expect(ricochetChain(enemy(0, 0, { isBoss: true }), [enemy(50)])).toEqual([]);
    expect(ricochetChain(enemy(0), [enemy(50, 0, { dead: true }), enemy(60, 0, { remoteCombatGhost: true })])).toEqual([]);
  });
});

describe("Piercing Shot", () => {
  it("carries through regular enemies up to its limit, and stops at a boss", () => {
    for (let struck = 0; struck < PIERCING_SHOT_MAX_EXTRA_TARGETS; struck++) expect(arrowPassesThrough(PROCS, enemy(0), struck)).toBe(true);
    expect(arrowPassesThrough(PROCS, enemy(0), PIERCING_SHOT_MAX_EXTRA_TARGETS)).toBe(false);
    expect(arrowPassesThrough(PROCS, enemy(0, 0, { isBoss: true }), 0)).toBe(false);
    expect(arrowPassesThrough({ ...PROCS, piercingShot: false }, enemy(0), 0)).toBe(false);
    expect(arrowPassesThrough(null, enemy(0), 0)).toBe(false);
  });
});
