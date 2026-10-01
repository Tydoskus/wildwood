import { describe, expect, it } from "vitest";
import { DAILY_QUEST_COUNT, applyQuestKills, dailyQuestCandidates, dailyQuestsFor, guildQuestBonus, parseDailyQuests, questDay, questWeek } from "./daily-quests";
import { ENEMY_TYPES } from "./enemy-definitions";

describe("daily quests", () => {
  const id = "c200aa";
  it("draws three different regular enemies, 50 to 100 kills each, the same all day", () => {
    const progress = { desertUnlocked: true, snowlandsUnlocked: true };
    const quests = dailyQuestsFor(id, 20_000, progress);
    expect(quests).toHaveLength(DAILY_QUEST_COUNT);
    expect(new Set(quests.map(q => `${q.mapId}:${q.enemy}`)).size).toBe(3);
    for (const quest of quests) {
      expect(quest.target).toBeGreaterThanOrEqual(50);
      expect(quest.target).toBeLessThanOrEqual(100);
      expect((ENEMY_TYPES as any)[quest.enemy].elite).toBeFalsy();
      expect(["tutorial_forest", "beginner_desert", "intermediate_snowlands"]).toContain(quest.mapId);
    }
    expect(dailyQuestsFor(id, 20_000, progress)).toEqual(quests);
    expect(dailyQuestsFor(id, 20_001, progress)).not.toEqual(quests);
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

  it("turns days at midnight UTC and weeks on Monday, and pays 0.25% a point", () => {
    // 2026-09-28 is a Monday.
    const monday = questDay(BigInt(Date.UTC(2026, 8, 28)) * 1000n), sunday = monday - 1;
    expect(questWeek(monday)).toBe(questWeek(sunday) + 1);
    expect(questWeek(monday + 6)).toBe(questWeek(monday));
    expect(guildQuestBonus(420)).toBeCloseTo(2.05);
    expect(guildQuestBonus(0)).toBe(1);
    expect(guildQuestBonus(-5)).toBe(1);
  });

  it("drops malformed stored quests", () => {
    expect(parseDailyQuests("nope")).toEqual([]);
    expect(parseDailyQuests('[{"mapId":"a","enemy":"b","target":50,"progress":3},{"x":1}]')).toEqual([{ mapId: "a", enemy: "b", target: 50, progress: 3 }]);
  });
});
