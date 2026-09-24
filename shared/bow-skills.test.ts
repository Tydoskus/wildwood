import { describe, expect, it } from "vitest";
import {
  ARROW_STORM_ARROWS, ARROW_STORM_DAMAGE_SHARE, BOW_SKILL_APPEAR_CHANCE, BOW_SKILL_IDS, PIERCING_SHOT_MAX_EXTRA_TARGETS,
  RICOCHET_MAX_BOUNCES, bowSkillBossDamageMultiplier, bowSkillChance, bowSkillChanceRangeTenths, bowSkillLines,
  bowSkillReachMultiplier, bowSkillTier, hasBowSkills, isSkillBow, rollArrowSkillProcs, rollBowSkills,
} from "./bow-skills";
import { CAMPAIGN_EQUIPMENT } from "./campaign-equipment";
import { ITEM_DEFINITIONS, STARTER_BOW, STARTER_STONE, WOODEN_SWORD } from "./items";
import { itemTier } from "./item-tier";

/** A small seeded generator, so statistical checks are repeatable. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };

describe("which bows carry skills", () => {
  it("is every stat-bearing ranged bow, at the tier it was authored at", () => {
    expect(bowSkillTier(STARTER_BOW)).toBe(1);
    expect(bowSkillTier("iron_bow")).toBe(2);
    expect(bowSkillTier("snow_bow")).toBe(3);
    expect(bowSkillTier("night_bow")).toBe(5);
    expect(bowSkillTier(CAMPAIGN_EQUIPMENT.moonfen_bow.definition.id)).toBe(9);
    expect(bowSkillTier("ion_bow")).toBe(15);
    // The starter stone, melee weapons and armor never do.
    expect(isSkillBow(STARTER_STONE)).toBe(false);
    expect(isSkillBow(WOODEN_SWORD)).toBe(false);
    expect(isSkillBow("ion_helmet")).toBe(false);
    expect(isSkillBow("not_an_item")).toBe(false);
  });

  it("agrees with the map tier the item window shows for every bow", () => {
    const bows = Object.values(ITEM_DEFINITIONS).filter(item => item.slot === "HAND" && item.weapon?.projectile === "ARROW");
    expect(bows.length).toBeGreaterThanOrEqual(17);
    for (const bow of bows) expect(bowSkillTier(bow.id), bow.id).toBe(itemTier(bow.id));
  });
});

describe("rolling a bow", () => {
  it("ranges from 1-3% at tier 1 to 7-15% at tier 15, straight between, in tenths", () => {
    expect(bowSkillChanceRangeTenths(1)).toEqual({ min: 10, max: 30 });
    expect(bowSkillChanceRangeTenths(15)).toEqual({ min: 70, max: 150 });
    expect(bowSkillChanceRangeTenths(8)).toEqual({ min: 40, max: 90 });
    for (let tier = 1; tier < 15; tier++) {
      const low = bowSkillChanceRangeTenths(tier), high = bowSkillChanceRangeTenths(tier + 1);
      expect(high.min).toBeGreaterThanOrEqual(low.min);
      expect(high.max).toBeGreaterThan(low.max);
    }
  });

  it("gives each skill its own appearance draw and chance draw", () => {
    // Arrow Storm appears at the bottom of its range, Ricochet does not
    // appear, Piercing Shot appears at the top of its range.
    const roll = rollBowSkills("ion_bow", sequence(0, 0, .5, .5, .1, .9999));
    expect(roll).toEqual({ arrowStorm: 7, ricochet: 0, piercingShot: 15 });
    expect(rollBowSkills(STARTER_STONE, Math.random)).toBeNull();
  });

  it("appears one time in three per skill, anywhere in the tier's range on a 0.1% grid", () => {
    const random = seeded(7);
    for (const tier of [1, 8, 15]) {
      const bow = Object.values(ITEM_DEFINITIONS).find(item => bowSkillTier(item.id) === tier)!;
      const { min, max } = bowSkillChanceRangeTenths(tier);
      const seen = new Set<number>();
      let appeared = 0;
      const total = 6_000;
      for (let index = 0; index < total; index++) {
        const roll = rollBowSkills(bow.id, random)!;
        for (const skill of BOW_SKILL_IDS) {
          if (!roll[skill]) continue;
          appeared++;
          const tenths = Math.round(roll[skill] * 10);
          expect(Math.abs(roll[skill] * 10 - tenths)).toBeLessThan(1e-9);
          expect(tenths).toBeGreaterThanOrEqual(min);
          expect(tenths).toBeLessThanOrEqual(max);
          seen.add(tenths);
        }
      }
      expect(appeared / (total * BOW_SKILL_IDS.length)).toBeCloseTo(BOW_SKILL_APPEAR_CHANCE, 1);
      // Both ends of the range are reachable.
      expect(seen.has(min)).toBe(true);
      expect(seen.has(max)).toBe(true);
    }
  });
});

describe("reading a roll", () => {
  it("shows the skills in title case, one decimal, and nothing for a bow without any", () => {
    expect(bowSkillLines({ arrowStorm: 2.4, ricochet: 0, piercingShot: 12 })).toEqual(["Arrow Storm 2.4%", "Piercing Shot 12.0%"]);
    expect(bowSkillLines({ arrowStorm: 0, ricochet: 5.1, piercingShot: 0 })).toEqual(["Ricochet 5.1%"]);
    // A float32 read back from the table still shows its tenth.
    expect(bowSkillLines({ arrowStorm: Math.fround(2.4), ricochet: 0, piercingShot: 0 })).toEqual(["Arrow Storm 2.4%"]);
    expect(bowSkillLines({ arrowStorm: 0, ricochet: 0, piercingShot: 0 })).toEqual([]);
    expect(bowSkillLines(null)).toEqual([]);
    expect(hasBowSkills(null)).toBe(false);
  });

  it("treats malformed or out-of-range values as no skill or a capped one", () => {
    expect(bowSkillChance({ arrowStorm: Number.NaN }, "arrowStorm")).toBe(0);
    expect(bowSkillChance({ arrowStorm: -5 }, "arrowStorm")).toBe(0);
    expect(bowSkillChance({ arrowStorm: 500 }, "arrowStorm")).toBe(1);
  });

  it("widens reach by every extra enemy an arrow can strike, and boss damage by Arrow Storm alone", () => {
    const top = { arrowStorm: 15, ricochet: 15, piercingShot: 15 };
    expect(bowSkillReachMultiplier(top)).toBeCloseTo(1 + .15 * (ARROW_STORM_ARROWS + RICOCHET_MAX_BOUNCES + PIERCING_SHOT_MAX_EXTRA_TARGETS));
    expect(bowSkillReachMultiplier(top)).toBeCloseTo(2.65);
    expect(bowSkillBossDamageMultiplier(top)).toBeCloseTo(1 + .15 * ARROW_STORM_ARROWS * ARROW_STORM_DAMAGE_SHARE);
    expect(bowSkillBossDamageMultiplier({ arrowStorm: 0, ricochet: 15, piercingShot: 15 })).toBe(1);
    expect(bowSkillReachMultiplier(null)).toBe(1);
  });
});

describe("firing", () => {
  it("rolls each skill on every arrow, independently", () => {
    const roll = { arrowStorm: 50, ricochet: 0, piercingShot: 100 };
    expect(rollArrowSkillProcs(roll, sequence(.4, 0, .99))).toEqual({ arrowStorm: true, ricochet: false, piercingShot: true });
    expect(rollArrowSkillProcs(roll, sequence(.6, 0, .99))).toEqual({ arrowStorm: false, ricochet: false, piercingShot: true });
  });

  it("never lets an honest top-rolled bow outrun the server's kill bound", () => {
    // The most an honest client can land: every storm arrow, bounce and
    // pierce finds a fresh enemy and one-shots it. Over every 900-second bank
    // at one arrow a second, that stays under the bound the server pays.
    const top = { arrowStorm: 15, ricochet: 15, piercingShot: 15 };
    const random = seeded(11);
    const bank = 900, bound = bank * bowSkillReachMultiplier(top) * 1.25;
    let worst = 0;
    for (let window = 0; window < 200; window++) {
      let kills = 0;
      for (let arrow = 0; arrow < bank; arrow++) {
        const procs = rollArrowSkillProcs(top, random);
        kills += 1 + (procs.arrowStorm ? ARROW_STORM_ARROWS : 0) + (procs.ricochet ? RICOCHET_MAX_BOUNCES : 0)
          + (procs.piercingShot ? PIERCING_SHOT_MAX_EXTRA_TARGETS : 0);
      }
      worst = Math.max(worst, kills);
    }
    expect(worst).toBeLessThan(bound);
    // The bound still means something: a claim of twice the average is refused.
    expect(2 * bank * bowSkillReachMultiplier(top)).toBeGreaterThan(bound);
  });
});
