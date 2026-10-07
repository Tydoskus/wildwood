import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { createAggroPickPrompt } from "./aggro-pick-prompt";
import { togglePick } from "../game/runtime/aggro-picks";
import type { RewardType } from "../game/enemies";
import type { AutoFarmPriority } from "../game/runtime/auto-farm-priority";

it("stays open until the run has its count of groups", () => {
  const { document } = parseHTML("<html><body></body></html>");
  let picks: RewardType[] = [];
  const prompt = createAggroPickPrompt(document as unknown as Document, { picks: () => picks, setPicks: next => { picks = next; } });
  prompt.open(2);
  const done = document.querySelector(".aggro-pick-done") as unknown as HTMLButtonElement;
  const chip = (label: string) => [...document.querySelectorAll(".aggro-pick")].find(element => element.textContent === label) as unknown as HTMLButtonElement;
  expect(done.disabled).toBe(true);
  done.click();
  expect(prompt.isOpen()).toBe(true);
  chip("Damage").click(); chip("Regen").click();
  expect(done.disabled).toBe(false);
  done.click();
  expect(prompt.isOpen()).toBe(false);
  expect(picks).toEqual(["damage", "regen"]);
});

it("switches rather than drops during a run", () => {
  expect(togglePick(["damage"], "armor", 1, true)).toEqual(["armor"]);
  expect(togglePick(["damage"], "damage", 1, true)).toEqual(["damage"]);
  expect(togglePick(["damage"], "damage", 1, false)).toEqual([]);
  expect(togglePick(["damage", "armor"], "regen", 2, false)).toEqual(["armor", "regen"]);
});

it("offers only this map's groups, and asks again when a pick is missing here", () => {
  const { document } = parseHTML("<html><body></body></html>");
  let picks: RewardType[] = ["speed"];
  const prompt = createAggroPickPrompt(document as unknown as Document, { picks: () => picks, setPicks: next => { picks = next; } });
  // A map with no Atk Speed enemies: the saved pick cannot chase here.
  const here: RewardType[] = ["damage", "health", "armor"];
  expect(prompt.lacking(1, here)).toBe(true);
  expect(prompt.lacking(1, ["speed", "damage"])).toBe(false);
  prompt.open(1, here);
  const chips = [...document.querySelectorAll(".aggro-pick")] as unknown as HTMLButtonElement[];
  expect(chips.filter(chip => !chip.hidden).map(chip => chip.textContent)).toEqual(["Damage", "Max Health", "Armor"]);
  const done = document.querySelector(".aggro-pick-done") as unknown as HTMLButtonElement;
  expect(done.disabled).toBe(true);
  chips.find(chip => chip.textContent === "Armor")!.click();
  done.click();
  expect(picks).toEqual(["armor"]);
  expect(prompt.isOpen()).toBe(false);
  expect(prompt.lacking(1, here)).toBe(false);
});

it("changes nothing that chases the player until Done: unpicking everything and leaving it open is not a way out", () => {
  const { document } = parseHTML("<html><body></body></html>");
  let picks: RewardType[] = ["damage"];
  const prompt = createAggroPickPrompt(document as unknown as Document, { picks: () => picks, setPicks: next => { picks = next; } });
  prompt.open(1);
  const chip = (label: string) => [...document.querySelectorAll(".aggro-pick")].find(element => element.textContent === label) as unknown as HTMLButtonElement;
  chip("Damage").click();
  expect(picks).toEqual(["damage"]);
  expect((document.querySelector(".aggro-pick-done") as unknown as HTMLButtonElement).disabled).toBe(true);
  chip("Regen").click();
  (document.querySelector(".aggro-pick-done") as unknown as HTMLButtonElement).click();
  expect(picks).toEqual(["regen"]);
});

it("holds autofarm's Target, which applies on tap without waiting for Done", () => {
  const { document } = parseHTML("<html><body></body></html>");
  let picks: RewardType[] = [], priority: AutoFarmPriority = "closest";
  const prompt = createAggroPickPrompt(document as unknown as Document, { picks: () => picks, setPicks: next => { picks = next; },
    priority: () => priority, setPriority: next => { priority = next; } });
  prompt.open(1);
  const targets = [...document.querySelectorAll(".aggro-pick-target [data-priority]")] as unknown as HTMLButtonElement[];
  expect(targets.map(button => button.textContent)).toEqual(["Closest", "Lowest HP", "Strongest"]);
  expect(targets.map(button => button.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  targets[2].click();
  expect(priority).toBe("strongest");
  expect(targets.map(button => button.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
  // Picks still gate Done; Target never does.
  expect(prompt.isOpen()).toBe(true);
  expect((document.querySelector(".aggro-pick-done") as unknown as HTMLButtonElement).disabled).toBe(true);
});

it("has no Target row without a farm to set it on", () => {
  const { document } = parseHTML("<html><body></body></html>");
  createAggroPickPrompt(document as unknown as Document, { picks: () => [], setPicks: () => {} }).open(1);
  expect(document.querySelector(".aggro-pick-target")).toBeNull();
});
