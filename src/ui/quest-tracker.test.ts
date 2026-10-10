import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installQuestTracker } from "./quest-tracker";
import type { QuestTrackerView } from "./quest-board-controller";

afterEach(() => vi.unstubAllGlobals());

it("names each quest's stat in the words the enemies' own labels use", () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="hud"></div></body></html>');
  vi.stubGlobal("window", Object.assign(window, { setInterval: () => 0, clearInterval: () => {}, innerWidth: 800, innerHeight: 600 }));
  vi.stubGlobal("document", document);
  const item = (enemy: string, stat: QuestTrackerView["items"][number]["stat"]) => ({
    key: enemy, enemy, stat, where: "Tutorial Forest - 1", from: "", onMap: true, count: 3, target: 60, share: .05 });
  const view: QuestTrackerView = { done: 0, total: 15, items: [item("Spitter", "damage"), item("Needle", "speed"), item("Brood", "regen")] };
  installQuestTracker({ view: () => view, hiddenHere: () => false, storage: { getItem: () => null, setItem: () => {} }, enabled: () => true });
  const stats = [...document.querySelectorAll(".quest-tracker-stat")].map(stat => stat.textContent);
  // Not "Atk" for damage, which read as attack speed.
  expect(stats).toEqual(["Damage", "Attack Speed", "HP/sec"]);
});
