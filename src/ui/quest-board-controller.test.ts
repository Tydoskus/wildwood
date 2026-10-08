import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { formatQuestReset, guildQuestStanding, questBoardView, questBoardWorldStatus } from "./quest-board-controller";
import { questWeekEndsAtMs } from "../../shared/daily-quests";

const state = { day: 20_000, bonus: 1.1, guildPoints: 37, guildName: "Oaks", quests: [
  { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
  { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
  { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0 }] };

it("lists the quests in play, the week's count, and when the next fifteen come", () => {
  const view = questBoardView(state, questWeekEndsAtMs(20_000) - 90 * 60_000,
    (id: string) => ({ beginner_desert: "Desert", tutorial_forest: "Forest" } as Record<string, string>)[id] ?? id);
  // The finished quest leaves the board; the open ones stay.
  expect(view.quests.map(quest => quest.title)).toEqual(["Defeat 60 Dune Raider", "Defeat 50 Spitter"]);
  expect(view.quests[0]).toMatchObject({ where: "Desert", progress: "12/60", done: false });
  expect(view).toMatchObject({ done: 1, total: 3, resetsIn: "1h 30m", finished: false });
  expect(formatQuestReset(3 * 86_400_000 + 2 * 3_600_000)).toBe("3d 2h");
});

it("gives the Guild window the guild's week, its bonus, and the ranking", () => {
  const standing = guildQuestStanding(state, [{ guildId: "1", guildName: "Pines", points: 50 }, { guildId: "7", guildName: "Oaks", points: 37 }]);
  expect(standing.guild).toEqual({ name: "Oaks", points: 37, bonusNow: "10%", bonusNext: "3.7%" });
  expect(standing.ranking).toEqual([{ place: 1, name: "Pines", points: 50, mine: false }, { place: 2, name: "Oaks", points: 37, mine: true }]);
  expect(standing.solo).toBeNull();
  // Without a guild the same row is the player's own week: quests so far, bonus now and next.
  const solo = guildQuestStanding({ ...state, guildName: "", guildPoints: 6, bonus: 1.04 }, []);
  expect(solo.guild).toBeNull();
  expect(solo.solo).toEqual({ quests: 6, bonusNow: "4%", bonusNext: "6%", bonusMax: "15%" });
});

it("tells the courtyard board how many papers are still pinned up, and the week's count", () => {
  expect(questBoardWorldStatus(state)).toEqual({ finished: [false, false, true], timer: "1/3 done" });
  expect(questBoardWorldStatus(null)).toBeNull();
  expect(formatQuestReset(30_000)).toBe("1m");
});

it("counts a quest enemy at once, never backwards, catching up to the server and stopping at the target", async () => {
  vi.stubGlobal("document", parseHTML("<html><body></body></html>").document);
  const { createQuestBoardRuntime } = await import("./quest-board-controller");
  const shownCounts: [string, number, number][] = [];
  let current: any = { ...state, quests: [{ mapId: "beginner_desert", enemy: "Dune Raider", target: 3, progress: 0 }] };
  const runtime = createQuestBoardRuntime({ source: () => ({ dailyQuests: () => current }), atHome: () => false, pause: () => {},
    mapName: id => id, showProgress: (enemy, count, target) => shownCounts.push([enemy, count, target]) });
  runtime.noteKill("beginner_desert", "Dune Raider");
  runtime.noteKill("beginner_desert", "Venom Guard");   // not a quest: no pop-up
  runtime.noteKill("tutorial_forest", "Dune Raider");   // wrong map: no pop-up
  expect(shownCounts).toEqual([["Dune Raider", 1, 3]]);
  // The server's report is ahead of what was shown: count on from it.
  current = { ...current, quests: [{ ...current.quests[0], progress: 2 }] };
  runtime.noteKill("beginner_desert", "Dune Raider");
  runtime.noteKill("beginner_desert", "Dune Raider");   // finished: nothing more
  expect(shownCounts.slice(1)).toEqual([["Dune Raider", 3, 3]]);
  // A new week starts the counts over.
  current = { ...current, day: current.day + 7, quests: [{ ...current.quests[0], progress: 0 }] };
  runtime.noteKill("beginner_desert", "Dune Raider");
  expect(shownCounts.at(-1)).toEqual(["Dune Raider", 1, 3]);
  vi.unstubAllGlobals();
});

it("tracks the quests in play away from home, this map's first, counted as far as the pop-ups showed", async () => {
  const { questTrackerView } = await import("./quest-board-controller");
  const week = { ...state, quests: [
    { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
    { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
    { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0, from: "Odin" },
    { mapId: "tutorial_forest", enemy: "Brood", target: 40, progress: 0 },
  ] };
  const view = questTrackerView(week, "tutorial_forest", id => id === "tutorial_forest" ? "Forest" : "Desert", key => key === "tutorial_forest:Spitter:2" ? 4 : undefined)!;
  expect(view).toMatchObject({ done: 1, total: 3 });
  expect(view.items.map(item => [item.enemy, item.onMap, item.count, item.where, item.from])).toEqual([
    ["Spitter", true, 4, "Forest", "Odin"], ["Brood", true, 0, "Forest", ""], ["Dune Raider", false, 12, "Desert", ""],
  ]);
  // Each names the stat its kills pay.
  expect(view.items.map(item => item.stat)).toEqual(["damage", "regen", "damage"]);
  expect(questTrackerView({ ...week, quests: [week.quests[0]] }, "tutorial_forest", id => id)).toBeNull();
  expect(questTrackerView(null, "tutorial_forest", id => id)).toBeNull();
});
