import { expect, it } from "vitest";
import { formatQuestReset, questBoardView, questBoardWorldStatus } from "./quest-board-controller";
import { questDayEndsAtMs } from "../../shared/daily-quests";

const state = { day: 20_000, bonus: 1.1, guildPoints: 37, guildName: "Oaks", quests: [
  { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
  { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
  { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0 }] };

it("lists today's quests with progress, the guild's week, and the ranking", () => {
  const view = questBoardView(state, [{ guildId: "1", guildName: "Pines", points: 50 }, { guildId: "7", guildName: "Oaks", points: 37 }],
    questDayEndsAtMs(20_000) - 90 * 60_000, id => ({ beginner_desert: "Desert", tutorial_forest: "Forest" } as Record<string, string>)[id] ?? id);
  expect(view.quests[0]).toMatchObject({ title: "Defeat 73 Venom Guard", where: "Desert", done: true });
  expect(view.quests[1]).toMatchObject({ progress: "12/60", done: false });
  expect(view.resetsIn).toBe("1h 30m");
  expect(view.guild).toEqual({ name: "Oaks", points: 37, bonusNow: "10%", bonusNext: "9.3%" });
  expect(view.ranking).toEqual([{ place: 1, name: "Pines", points: 50, mine: false }, { place: 2, name: "Oaks", points: 37, mine: true }]);
});

it("shows no guild section figures without a guild", () => {
  expect(questBoardView({ ...state, guildName: "", guildPoints: 0, bonus: 1 }, [], 0, id => id).guild).toBeNull();
});

it("tells the courtyard board which papers are checked off", () => {
  expect(questBoardWorldStatus(state)).toEqual({ finished: [true, false, false], timer: "1/3 done" });
  expect(questBoardWorldStatus(null)).toBeNull();
  expect(formatQuestReset(30_000)).toBe("1m");
});
