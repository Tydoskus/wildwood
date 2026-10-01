import { describe, expect, it } from "vitest";
import { WEEKLY_QUEST_COUNT, activeQuestIndices, applyQuestKills, dailyQuestCandidates, weeklyQuestsFor, guildQuestBonus, soloQuestBonus, parseDailyQuests, questDay, questWeek, questWeekEndsAtMs } from "./daily-quests";
import { ENEMY_TYPES } from "./enemy-definitions";

describe("daily quests", () => {
  const id = "c200aa";
  it("draws fifteen regular enemies a week, 50 to 100 kills each, the same all week", () => {
    const progress = { desertUnlocked: true, snowlandsUnlocked: true };
    const quests = weeklyQuestsFor(id, 2_857, progress);
    expect(quests).toHaveLength(WEEKLY_QUEST_COUNT);
    // Every enemy comes up once before any repeats.
    const pool = dailyQuestCandidates(progress).length;
    expect(new Set(quests.map(q => `${q.mapId}:${q.enemy}`)).size).toBe(Math.min(pool, WEEKLY_QUEST_COUNT));
    for (const quest of quests) {
      expect(quest.target).toBeGreaterThanOrEqual(50);
      expect(quest.target).toBeLessThanOrEqual(100);
      expect((ENEMY_TYPES as any)[quest.enemy].elite).toBeFalsy();
      expect(["tutorial_forest", "beginner_desert", "intermediate_snowlands"]).toContain(quest.mapId);
    }
    expect(weeklyQuestsFor(id, 2_857, progress)).toEqual(quests);
    expect(weeklyQuestsFor(id, 2_858, progress)).not.toEqual(quests);
    // A new player with one map open still gets a full week.
    expect(weeklyQuestsFor(id, 2_857, {})).toHaveLength(WEEKLY_QUEST_COUNT);
  });

  it("puts three quests on the board at a time, and kills move only those", () => {
    const quest = (enemy: string, progress = 0) => ({ mapId: "tutorial_forest", enemy, target: 10, progress });
    const quests = [quest("Spitter", 10), quest("Brood"), quest("Needle"), quest("Bramble"), quest("Spitter")];
    expect(activeQuestIndices(quests)).toEqual([1, 2, 3]);
    // The fourth open Spitter waits off the board; the finished first one takes nothing.
    const result = applyQuestKills(quests, "tutorial_forest", [{ enemy: "Spitter", count: 10 }, { enemy: "Brood", count: 10 }]);
    expect(result.quests.map(q => q.progress)).toEqual([10, 10, 0, 0, 0]);
    expect(activeQuestIndices(result.quests)).toEqual([2, 3, 4]);
  });

  it("only offers maps the player can reach", () => {
    expect(new Set(dailyQuestCandidates({}).map(c => c.mapId))).toEqual(new Set(["tutorial_forest"]));
    expect(dailyQuestCandidates({ ionCitadelUnlocked: true }).some(c => c.mapId === "ion_citadel")).toBe(true);
  });

  it("counts only matching kills on the quest's map, finishing each quest once", () => {
    const quests = [{ mapId: "beginner_desert", enemy: "Venom Guard", target: 50, progress: 45 },
      { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 0 }];
    const once = applyQuestKills(quests, "beginner_desert", [{ enemy: "Venom Guard", count: 10 }, { enemy: "Dune Archer", count: 30 }]);
    expect(once.completed).toBe(1);
    expect(once.quests[0].progress).toBe(50);
    expect(once.quests[1].progress).toBe(0);
    expect(applyQuestKills(once.quests, "beginner_desert", [{ enemy: "Venom Guard", count: 10 }]).completed).toBe(0);
    expect(applyQuestKills(quests, "tutorial_forest", [{ enemy: "Venom Guard", count: 10 }]).completed).toBe(0);
  });

  it("counts each kill toward one quest, and never toward a quest a leader has taken", () => {
    const quests = [
      { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 45, from: "Ann" },
      { mapId: "tutorial_forest", enemy: "Spitter", target: 60, progress: 0, from: "Bo" },
      { mapId: "tutorial_forest", enemy: "Bramble", target: 60, progress: 0, takenBy: "Cy" },
    ];
    const result = applyQuestKills(quests, "tutorial_forest", [{ enemy: "Spitter", count: 8 }, { enemy: "Bramble", count: 60 }]);
    expect(result.quests.map(quest => quest.progress)).toEqual([50, 3, 0]);
    expect(result.completed).toBe(1);
    expect(parseDailyQuests(JSON.stringify(quests)).map(quest => quest.from ?? quest.takenBy)).toEqual(["Ann", "Bo", "Cy"]);
  });

  it("turns weeks on Monday, and pays 0.1% a guild point or 1% a solo quest, up to 15%", () => {
    // 2026-09-28 is a Monday.
    const monday = questDay(BigInt(Date.UTC(2026, 8, 28)) * 1000n), sunday = monday - 1;
    expect(questWeek(monday)).toBe(questWeek(sunday) + 1);
    expect(questWeek(monday + 6)).toBe(questWeek(monday));
    expect(questWeekEndsAtMs(monday + 3)).toBe(Date.UTC(2026, 9, 5));
    expect(guildQuestBonus(300)).toBeCloseTo(1.3);
    expect(soloQuestBonus(15)).toBeCloseTo(1.15);
    expect(soloQuestBonus(40)).toBeCloseTo(1.15);
    expect(guildQuestBonus(0)).toBe(1);
    expect(guildQuestBonus(-5)).toBe(1);
  });

  it("drops malformed stored quests", () => {
    expect(parseDailyQuests("nope")).toEqual([]);
    expect(parseDailyQuests('[{"mapId":"a","enemy":"b","target":50,"progress":3},{"x":1}]')).toEqual([{ mapId: "a", enemy: "b", target: 50, progress: 3 }]);
  });
});
