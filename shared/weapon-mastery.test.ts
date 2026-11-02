import { describe, expect, it } from "vitest";
import { IRON_BOW, STARTER_STAFF, STARTER_STONE, WOODEN_SWORD } from "./items";
import {
  MASTERY_MAX_LEVEL, duelSkillsWithProficiency, masteryAttackRange, masteryBlastScale, masteryDamageTaken, masteryInPlay, masteryLevel,
  masteryPointsForLevel, masteryPointsForReport, masteryPointsInPlay, masteryProgress, rollWithProficiency, schoolPassiveValue, skillProficiency, weaponSchool,
} from "./weapon-mastery";
import { bowSkillChance } from "./bow-skills";
import { duelBowSkillProc } from "./duel-combat";

describe("weapon mastery", () => {
  it("trains the school of the weapon type in hand", () => {
    expect(weaponSchool(IRON_BOW)).toBe("archery");
    expect(weaponSchool(STARTER_STONE)).toBe("archery");
    expect(weaponSchool("")).toBe("archery");
    expect(weaponSchool(WOODEN_SWORD)).toBe("swordplay");
    expect(weaponSchool(STARTER_STAFF)).toBe("sorcery");
  });

  it("costs 70 points for level 1 and 17.8% more each level after", () => {
    expect(masteryPointsForLevel(1)).toBe(70);
    expect(masteryPointsForLevel(2)).toBe(152);
    expect(masteryPointsForLevel(10)).toBeCloseTo(1_630, -1);
    expect(masteryPointsForLevel(50)).toBeCloseTo(1_418_477, -1);
    expect(masteryPointsForLevel(99)).toBe(masteryPointsForLevel(MASTERY_MAX_LEVEL));
  });

  it("reads a level and the progress into it from points, stopping at the top", () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(69)).toBe(0);
    expect(masteryLevel(70)).toBe(1);
    expect(masteryProgress(100)).toEqual({ level: 1, into: 30, needed: 82 });
    expect(masteryLevel(10n ** 12n)).toBe(MASTERY_MAX_LEVEL);
    expect(masteryProgress(10n ** 12n)).toEqual({ level: MASTERY_MAX_LEVEL, into: 0, needed: 0 });
    expect(masteryLevel(-5)).toBe(0);
  });

  it("pays a point a kill and 50 for a boss's first clear", () => {
    expect(masteryPointsForReport(7, false)).toBe(7);
    expect(masteryPointsForReport(0, true)).toBe(50);
    expect(masteryPointsForReport(NaN, false)).toBe(0);
  });

  it("grows each school's passive and Skill Proficiency a little every level, stopping at the top", () => {
    expect(schoolPassiveValue("archery", 10)).toBeCloseTo(4);
    expect(schoolPassiveValue("swordplay", 10)).toBeCloseTo(0.02);
    expect(schoolPassiveValue("sorcery", 10)).toBeCloseTo(0.05);
    expect(schoolPassiveValue("archery", 0)).toBe(0);
    expect(schoolPassiveValue("archery", 49)).toBeCloseTo(19.6);
    expect(schoolPassiveValue("archery", 99)).toBeCloseTo(30);
    expect(skillProficiency(25)).toBeCloseTo(0.25);
    expect(skillProficiency(NaN)).toBe(0);
  });
});

describe("weapon mastery in combat", () => {
  const LEVEL_50 = BigInt(masteryPointsForLevel(50)), LEVEL_10 = BigInt(masteryPointsForLevel(10));
  const points = { archery: LEVEL_50, swordplay: LEVEL_10, sorcery: 0n };

  it("uses the right hand's school, and nothing while another kind of weapon is the one in use", () => {
    expect(masteryInPlay(points, IRON_BOW)).toEqual({ school: "archery", level: 50 });
    expect(masteryInPlay(points, WOODEN_SWORD)).toEqual({ school: "swordplay", level: 10 });
    expect(masteryInPlay(points, "", STARTER_STONE)).toEqual({ school: "archery", level: 50 });
    expect(masteryInPlay(points, "", WOODEN_SWORD).level).toBe(0);
    expect(masteryInPlay(null, IRON_BOW).level).toBe(0);
  });

  it("is off during Reflect Only and Aggro runs", () => {
    expect(masteryPointsInPlay(points, false)).toBe(points);
    expect(masteryInPlay(masteryPointsInPlay(points, true), IRON_BOW).level).toBe(0);
    expect(masteryInPlay(masteryPointsInPlay(undefined, false), IRON_BOW).level).toBe(0);
  });

  it("raises every skill chance by its own share: 6% at level 50 is 9%, never past 100%", () => {
    const roll = { arrowStorm: 6, ricochet: 0, piercingShot: 80 };
    const raised = rollWithProficiency(roll, 50);
    expect(raised.arrowStorm).toBeCloseTo(9);
    expect(raised.ricochet).toBe(0);
    expect(bowSkillChance(raised, "piercingShot")).toBe(1);
    expect(rollWithProficiency(roll, 0)).toBe(roll);
    expect(rollWithProficiency(null, 50)).toBeNull();
  });

  it("gives each school's passive only with its own weapon", () => {
    const archery = masteryInPlay(points, IRON_BOW), swordplay = masteryInPlay(points, WOODEN_SWORD);
    const sorcery = masteryInPlay({ sorcery: LEVEL_50 }, STARTER_STAFF);
    expect(masteryAttackRange(archery)).toBeCloseTo(30);
    expect(masteryAttackRange(swordplay)).toBe(0);
    expect(masteryDamageTaken(swordplay)).toBeCloseTo(0.98);
    expect(masteryDamageTaken(archery)).toBe(1);
    expect(masteryBlastScale(sorcery)).toBeCloseTo(1.25);
    expect(masteryBlastScale(archery)).toBe(1);
  });

  it("raises each duellist's frozen skill chances by their own level, so a duel procs more", () => {
    const fields = duelSkillsWithProficiency({ challengerArrowStorm: 6, opponentArrowStorm: 6, challengerMeteor: 2 }, 50, 0);
    expect(fields).toEqual({ challengerArrowStorm: 9, opponentArrowStorm: 6, challengerMeteor: 3 });
    const duel = (arrowStorm: number) => ({ combatVersion: 10, riposteSeed: 7, challengerArrowStorm: arrowStorm }) as never;
    const procs = (arrowStorm: number) => Array.from({ length: 2_000 }, (_, i) => duelBowSkillProc(duel(arrowStorm), "challenger", i + 1, "arrowStorm"))
      .filter(Boolean).length;
    expect(procs(fields.challengerArrowStorm) / procs(6)).toBeCloseTo(1.5, 0);
  });
});
