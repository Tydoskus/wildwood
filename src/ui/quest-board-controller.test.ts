import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { formatQuestReset, guildQuestStanding, questBoardView, questBoardWorldStatus, questTrackerView } from "./quest-board-controller";
import { MAP_IDS } from '../../shared/rules';
import { questWeekEndsAtMs } from "../../shared/weekly-quests";

const state = { day: 20_000, bonus: 1.1, guildPoints: 37, guildName: "Oaks", quests: [
  { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
  { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
  { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0 }] };

it('orders active tracker quests by descending area without promoting the current map', () => {
  const quests = [0, 2, 1].map(index => ({ mapId: MAP_IDS[index], stat: 'damage' as const, target: 10, progress: 0 }));
  const input = { ...state, quests };
  const view = questTrackerView(input, MAP_IDS[0], id => id)!;
  expect(view.items.map(item => item.where)).toEqual([MAP_IDS[2], MAP_IDS[1], MAP_IDS[0]]);
  expect(view.items.map(item => item.onMap)).toEqual([false, false, true]);
  expect(input.quests).toEqual(quests);
});

it('retains the original order within one area and excludes completed quests', () => {
  const quests = [
    { mapId: MAP_IDS[0], stat: 'damage' as const, target: 10, progress: 10 },
    { mapId: MAP_IDS[1], stat: 'regen' as const, target: 10, progress: 1 },
    { mapId: MAP_IDS[1], stat: 'armor' as const, target: 10, progress: 2 },
    { mapId: MAP_IDS[0], stat: 'health' as const, target: 10, progress: 3 },
  ];
  expect(questTrackerView({ ...state, quests }, MAP_IDS[0], id => id)!.items.map(item => item.stat))
    .toEqual(['regen', 'armor', 'health']);
});

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
  expect(standing.guild).toEqual({ name: "Oaks", points: 37, bonusNow: "×1.1", bonusNext: "×1.04" });
  expect(standing.ranking).toEqual([{ place: 1, name: "Pines", points: 50, mine: false }, { place: 2, name: "Oaks", points: 37, mine: true }]);
  expect(standing.solo).toBeNull();
  // Without a guild the same row is the player's own week: quests so far, bonus now and next.
  const solo = guildQuestStanding({ ...state, guildName: "", guildPoints: 6, bonus: 1.04 }, []);
  expect(solo.guild).toBeNull();
  expect(solo.solo).toEqual({ quests: 6, bonusNow: "×1.04", bonusNext: "×1.06", bonusMax: "×1.15" });
});

it("tells the courtyard board how many papers are still pinned up, and the week's count", () => {
  expect(questBoardWorldStatus(state)).toEqual({ finished: [false, false, true], timer: "1/3 done" });
  expect(questBoardWorldStatus(null)).toBeNull();
  expect(formatQuestReset(30_000)).toBe("1m");
});

it("counts a quest kill at once from the server's count and the kills it has not taken, and never what it refused", async () => {
  vi.stubGlobal("document", parseHTML("<html><body></body></html>").document);
  const { createQuestBoardRuntime } = await import("./quest-board-controller");
  const shownCounts: [string, number, number][] = [];
  let current: any = { ...state, quests: [{ mapId: "beginner_desert", enemy: "Dune Raider", target: 3, progress: 0 }] };
  // The kill report queue: a kill is queued before its pop-up, and leaves when the server takes the report.
  let queue: { mapId: string; enemy: string }[] = [];
  const runtime = createQuestBoardRuntime({
    source: () => ({ weeklyQuests: () => current, questBoardSeen: () => true,
      pendingQuestKills: (mapId: string) => queue.filter(kill => kill.mapId === mapId).map(kill => ({ enemy: kill.enemy, count: 1 })) }),
    atHome: () => false, pause: () => {}, mapName: id => id, showProgress: (enemy, count, target) => shownCounts.push([enemy, count, target]) });
  const kill = (mapId: string, enemy: string) => { queue.push({ mapId, enemy }); runtime.noteKill(mapId, enemy); };
  kill("beginner_desert", "Dune Raider");
  kill("beginner_desert", "Venom Guard");   // not a quest: no pop-up
  kill("tutorial_forest", "Dune Raider");   // wrong map: no pop-up
  expect(shownCounts).toEqual([["Dune Raider", 1, 3]]);
  kill("beginner_desert", "Dune Raider");
  expect(runtime.trackerView("beginner_desert")!.items[0].count).toBe(2);
  // The server took the report but refused one kill: the tracker follows it, not the pop-ups.
  queue = []; current = { ...current, quests: [{ ...current.quests[0], progress: 1 }] };
  expect(runtime.trackerView("beginner_desert")!.items[0].count).toBe(1);
  kill("beginner_desert", "Dune Raider");
  kill("beginner_desert", "Dune Raider");
  kill("beginner_desert", "Dune Raider");   // finished: nothing more
  expect(shownCounts.slice(2)).toEqual([["Dune Raider", 2, 3], ["Dune Raider", 3, 3]]);
  vi.unstubAllGlobals();
});

it("tracks the quests in play away from home, later areas first", async () => {
  const { questTrackerView } = await import("./quest-board-controller");
  const week = { ...state, quests: [
    { mapId: "beginner_desert", enemy: "Venom Guard", target: 73, progress: 73 },
    { mapId: "beginner_desert", enemy: "Dune Raider", target: 60, progress: 12 },
    { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0, from: "Odin" },
    { mapId: "tutorial_forest", enemy: "Brood", target: 40, progress: 0 },
  ] };
  const view = questTrackerView(week, "tutorial_forest", id => id === "tutorial_forest" ? "Forest" : "Desert")!;
  // The week counts the quest collected from the pool as well as the player's own three, so it can pass their own.
  expect(view).toMatchObject({ done: 1, total: 4 });
  expect(view.items.map(item => [item.enemy, item.onMap, item.count, item.where, item.from])).toEqual([
    ["Dune Raider", false, 12, "Desert", ""], ["Spitter", true, 0, "Forest", "Odin"], ["Brood", true, 0, "Forest", ""],
  ]);
  // Each names the stat its kills pay.
  expect(view.items.map(item => item.stat)).toEqual(["damage", "damage", "regen"]);
  expect(questTrackerView({ ...week, quests: [week.quests[0]] }, "tutorial_forest", id => id)).toBeNull();
  expect(questTrackerView(null, "tutorial_forest", id => id)).toBeNull();
});

it("shows the tracker switch as it is now each time the board opens, after the tracker's × or Settings changed it", async () => {
  const { document, window } = parseHTML("<html><body></body></html>");
  const dialogProto = Object.getPrototypeOf(document.createElement("dialog"));
  dialogProto.showModal ??= function (this: HTMLElement) { this.setAttribute("open", ""); };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", Object.assign(window, { setInterval: () => 0, clearInterval: () => {} }));
  const { createQuestBoardController } = await import("./quest-board-controller");
  let enabled = false;
  const board = createQuestBoardController({ source: () => ({ weeklyQuests: () => state }), atHome: () => true, pause: () => {}, mapName: id => id,
    tracker: { enabled: () => enabled, set: next => { enabled = next; } } });
  const toggle = document.querySelector(".quest-tracker-switch")!;
  expect(toggle.textContent).toBe("OFF");
  enabled = true;
  board.open();
  expect(toggle.textContent).toBe("ON");
  vi.unstubAllGlobals();
});
