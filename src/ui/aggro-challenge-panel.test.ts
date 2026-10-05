import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { createAggroChallengePanel } from "./aggro-challenge-panel";
import type { RewardType } from "../game/enemies";

function setup(state: { active: boolean; completed: number; parked?: boolean }, initial: RewardType[] = []) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  let picks = [...initial];
  const panel = createAggroChallengePanel({ container: document.getElementById("c") as unknown as HTMLElement, state: () => state,
    locked: () => null, goal: () => "Defeat Aegis Prime (map 15)", start: async () => ({ ok: true }), abandon: async () => ({ ok: true }),
    picks: () => picks, setPicks: next => { picks = next; } });
  const chip = (label: string) => [...document.querySelectorAll(".aggro-pick")].find(element => element.textContent === label) as unknown as HTMLButtonElement;
  const action = () => document.querySelector(".prestige-challenge-action") as unknown as HTMLButtonElement;
  return { panel, chip, action, picks: () => picks, label: () => document.querySelector(".aggro-picks-label")?.textContent };
}

it("asks for the run's picks before it can start, newest replacing oldest when full", () => {
  const s = setup({ active: false, completed: 1 });
  expect(s.action().disabled).toBe(true);
  s.chip("Armor").click(); s.chip("Regen").click();
  expect(s.picks()).toEqual(["armor", "regen"]);
  expect(s.action().disabled).toBe(false);
  s.chip("Damage").click();
  expect(s.picks()).toEqual(["regen", "damage"]);
});

it("a run always keeps its count: it fills missing picks and switches, never drops one", () => {
  const s = setup({ active: true, completed: 0 });
  expect(s.label()).toBe("Pick 1 group to chase you (0/1)");
  s.chip("Damage").click();
  expect(s.picks()).toEqual(["damage"]);
  expect(s.label()).toBe("Chasing you: Damage (tap another to switch)");
  // Tapping another switches; tapping the picked one cannot leave the run without its group.
  s.chip("Armor").click();
  expect(s.picks()).toEqual(["armor"]);
  s.chip("Armor").click();
  expect(s.picks()).toEqual(["armor"]);
});
