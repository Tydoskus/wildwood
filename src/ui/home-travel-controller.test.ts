import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createHomeTravelController, homeTravelEntries, type HomeTravelSource } from "./home-travel-controller";
import type { CampaignAccess } from "../../shared/equipment-access";
import type { MapId } from "../game/world";

let destroy: (() => void) | undefined;
afterEach(() => { destroy?.(); destroy = undefined; vi.unstubAllGlobals(); });

function setup(progress: CampaignAccess = {}, endless = { unlocked: false, completed: 0 }, departure: MapId | null = null) {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("window", window); vi.stubGlobal("document", document); vi.stubGlobal("HTMLElement", window.HTMLElement);
  const source: HomeTravelSource = {
    savedProgress: () => progress,
    proceduralMapUnlocked: mapId => endless.unlocked && Number(mapId.split("_")[1]) <= endless.completed + 1,
    proceduralCompleted: () => endless.completed,
  };
  let atHome = true;
  const travel = vi.fn(async (_mapId: MapId) => true);
  const pause = vi.fn(), clearInput = vi.fn();
  const picker = createHomeTravelController({ source: () => source, travel, departure: () => departure, atHome: () => atHome, pause, clearInput });
  destroy = picker.destroy;
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  Object.assign(dialog, { showModal() { dialog.open = true; }, close() { dialog.open = false; } });
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event("click", { bubbles: true }));
  const rows = () => [...document.querySelectorAll<HTMLButtonElement>(".travel-map")];
  const names = () => rows().map(row => row.querySelector("strong")!.textContent);
  const selected = () => document.querySelector('[aria-pressed="true"]')?.getAttribute("data-map") ?? null;
  const go = () => document.querySelector<HTMLButtonElement>(".travel-go")!;
  return { document, window, dialog, picker, travel, pause, clearInput, click, rows, names, selected, go,
    leaveHome: () => { atHome = false; } };
}

it("lists unlocked maps in campaign order with their zone numbers, then the next locked map", () => {
  const s = setup({ desertUnlocked: true, snowlandsUnlocked: true });
  s.picker.open();
  expect(s.names()).toEqual(["Tutorial Forest", "Beginner Desert", "Intermediate Snowlands", "Advanced Lava Lake"]);
  expect(s.rows().map(row => row.querySelector(".farm-enemy-mark")!.textContent)).toEqual(["1", "2", "3", "4"]);
  const locked = s.rows()[3];
  expect(locked.disabled).toBe(true);
  expect(locked.classList.contains("is-locked")).toBe(true);
  expect(locked.textContent).toContain("Defeat Frostclaw in Intermediate Snowlands to unlock");
  expect(locked.hasAttribute("data-map")).toBe(false);
  expect(s.selected()).toBe("intermediate_snowlands");
});

it("offers a new player the first map and the Dragon as the next goal", () => {
  const { entries, endlessHighest } = homeTravelEntries({ savedProgress: () => ({}) });
  expect(entries.map(entry => [entry.key, entry.locked])).toEqual([
    ["tutorial_forest", null], ["beginner_desert", "Defeat the Dragon in Tutorial Forest to unlock"]]);
  expect(endlessHighest).toBe(0);
});

it("chooses a map and travels there, closing and unpausing first", async () => {
  const s = setup({ desertUnlocked: true });
  s.picker.open();
  expect(s.dialog.open).toBe(true);
  expect(s.pause).toHaveBeenLastCalledWith(true);
  s.click('[data-map="tutorial_forest"]');
  expect(s.selected()).toBe("tutorial_forest");
  s.click(".travel-go");
  expect(s.dialog.open).toBe(false);
  expect(s.pause).toHaveBeenLastCalledWith(false);
  await vi.waitFor(() => expect(s.travel).toHaveBeenCalledWith("tutorial_forest"));
  expect(s.dialog.open).toBe(false);
});

it("reopens with a message when the server refuses, unless the player already left Home", async () => {
  const s = setup();
  s.travel.mockResolvedValueOnce(false);
  s.picker.open(); s.click(".travel-go");
  await vi.waitFor(() => expect(s.dialog.open).toBe(true));
  expect(s.document.querySelector(".farm-selection")!.textContent).toBe("Travel unavailable. Try again.");
  s.travel.mockResolvedValueOnce(false);
  s.leaveHome(); s.click(".travel-go");
  await vi.waitFor(() => expect(s.travel).toHaveBeenCalledTimes(2));
  await Promise.resolve();
  expect(s.dialog.open).toBe(false);
});

it("Back and Escape close without travelling", () => {
  const s = setup({ desertUnlocked: true });
  s.picker.open(); s.click(".window-back-button");
  expect(s.dialog.open).toBe(false);
  expect(s.pause).toHaveBeenLastCalledWith(false);
  expect(s.clearInput).toHaveBeenCalled();
  s.picker.open();
  const cancel = new s.window.Event("cancel", { cancelable: true });
  s.dialog.dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(s.dialog.open).toBe(false);
  expect(s.travel).not.toHaveBeenCalled();
});

it("marks where the player left and preselects it", () => {
  const s = setup({ desertUnlocked: true, snowlandsUnlocked: true }, undefined, "beginner_desert");
  s.picker.open();
  expect(s.selected()).toBe("beginner_desert");
  const row = s.document.querySelector('[data-map="beginner_desert"]')!;
  expect(row.classList.contains("is-departure")).toBe(true);
  expect(row.textContent).toContain("Where you left");
});

const campaignDone: CampaignAccess = { desertUnlocked: true, snowlandsUnlocked: true, lavaUnlocked: true, infernalUnlocked: true,
  waterUnlocked: true, samuraiUnlocked: true, cloudspireUnlocked: true, moonfenUnlocked: true, crystalHollowsUnlocked: true,
  clockworkRuinsUnlocked: true, duskfallOrchardUnlocked: true, neonBastionUnlocked: true, verdantCatacombsUnlocked: true, ionCitadelUnlocked: true };

it("shows Endless as locked behind Aegis Prime once every campaign map is open", () => {
  const s = setup(campaignDone);
  s.picker.open();
  expect(s.names()).toHaveLength(16);
  expect(s.rows().at(-1)!.textContent).toContain("Defeat Aegis Prime in Ion Citadel to unlock");
  expect(s.selected()).toBe("ion_citadel");
  expect(s.document.querySelector(".travel-stage")).toBeNull();
});

it("travels to the highest Endless stage by default and steps to lower ones", async () => {
  const s = setup(campaignDone, { unlocked: true, completed: 4 });
  s.picker.open();
  expect(s.selected()).toBe("endless");
  const stage = s.document.querySelector<HTMLInputElement>(".travel-stage")!;
  expect(stage.value).toBe("5");
  expect(s.document.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled).toBe(true);
  s.click('[data-step="-1"]'); s.click('[data-step="-1"]');
  expect(stage.value).toBe("3");
  stage.value = "99"; stage.dispatchEvent(new s.window.Event("change"));
  expect(stage.value).toBe("5");
  s.click('[data-step="-1"]');
  s.click(".travel-go");
  await vi.waitFor(() => expect(s.travel).toHaveBeenCalledWith("endless_4"));
});

it("returns to the Endless stage the player left from", () => {
  const s = setup(campaignDone, { unlocked: true, completed: 9 }, "endless_7");
  s.picker.open();
  expect(s.selected()).toBe("endless");
  expect(s.document.querySelector<HTMLInputElement>(".travel-stage")!.value).toBe("7");
  expect(s.document.querySelector('[data-map="endless"]')!.textContent).toContain("Where you left");
});
