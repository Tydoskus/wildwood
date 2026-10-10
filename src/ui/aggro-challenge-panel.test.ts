import { expect, it, vi } from "vitest";
import { CHALLENGE_ANSWER_MS, CHALLENGE_NO_ANSWER } from "./challenge-answer";
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

it("gives the button back when the server never answers a drop out", async () => {
  vi.useFakeTimers();
  try {
    const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
    createAggroChallengePanel({ container: document.getElementById("c") as unknown as HTMLElement, state: () => ({ active: true, completed: 0 }),
      locked: () => null, goal: () => "Defeat Aegis Prime (map 15)", start: async () => ({ ok: true }), abandon: () => new Promise(() => {}),
      picks: () => ["damage"], setPicks: () => {}, confirm: async () => true });
    const action = document.querySelector(".prestige-challenge-action") as unknown as HTMLButtonElement;
    action.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(action.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(CHALLENGE_ANSWER_MS);
    expect(action.disabled).toBe(false);
    expect(document.body.textContent).toContain(CHALLENGE_NO_ANSWER);
  } finally { vi.useRealTimers(); }
});
