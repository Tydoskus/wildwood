import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { formatQuestReset, guildQuestStanding, questBoardView, questBoardWorldStatus } from "./quest-board-controller";
import { questDayEndsAtMs } from "../../shared/daily-quests";

const state = { day: 20_000, bonus: 1.1, guildPoints: 37, guildName: "Oaks", quests: [
  { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
  { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
  { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0 }] };

it("lists today's quests with progress and when new ones come", () => {
  const view = questBoardView(state, questDayEndsAtMs(20_000) - 90 * 60_000,
    (id: string) => ({ beginner_desert: "Desert", tutorial_forest: "Forest" } as Record<string, string>)[id] ?? id);
  expect(view.quests[0]).toMatchObject({ title: "Defeat 73 Venom Guard", where: "Desert", done: true });
  expect(view.quests[1]).toMatchObject({ progress: "12/60", done: false });
  expect(view.resetsIn).toBe("1h 30m");
});

it("gives the Guild window the guild's week, its bonus, and the ranking", () => {
  const standing = guildQuestStanding(state, [{ guildId: "1", guildName: "Pines", points: 50 }, { guildId: "7", guildName: "Oaks", points: 37 }]);
  expect(standing.guild).toEqual({ name: "Oaks", points: 37, bonusNow: "10%", bonusNext: "9.3%" });
  expect(standing.ranking).toEqual([{ place: 1, name: "Pines", points: 50, mine: false }, { place: 2, name: "Oaks", points: 37, mine: true }]);
  expect(guildQuestStanding({ ...state, guildName: "", guildPoints: 0, bonus: 1 }, []).guild).toBeNull();
});

it("tells the courtyard board which papers are checked off", () => {
  expect(questBoardWorldStatus(state)).toEqual({ finished: [true, false, false], timer: "1/3 done" });
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
  // A new day starts the counts over.
  current = { ...current, day: current.day + 1, quests: [{ ...current.quests[0], progress: 0 }] };
  runtime.noteKill("beginner_desert", "Dune Raider");
  expect(shownCounts.at(-1)).toEqual(["Dune Raider", 1, 3]);
  vi.unstubAllGlobals();
});
