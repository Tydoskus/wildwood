import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import {
  createLeaderboardPrestigeSelection, leaderboardPrestigeLabel, leaderboardPrestigeLevels, leaderboardPrestigeTitle, renderLeaderboardPrestige,
} from "./leaderboard-prestige";

afterEach(() => vi.unstubAllGlobals());

it("names level 0 No prestige and every other level by its number", () => {
  expect(leaderboardPrestigeLabel(0)).toBe("No prestige");
  expect(leaderboardPrestigeLabel(2)).toBe("P2");
  expect(leaderboardPrestigeTitle(0)).toBe("No prestige leaderboard");
  expect(leaderboardPrestigeTitle(2)).toBe("Prestige 2 leaderboard");
});

it("lists No prestige up to the highest level anyone is on, with the viewer's and the selected level always in", () => {
  expect(leaderboardPrestigeLevels([], 0, 0)).toEqual([0]);
  expect(leaderboardPrestigeLevels([0, 1, 3], 0, 0)).toEqual([0, 1, 2, 3]);
  expect(leaderboardPrestigeLevels([0, 1], 4, 0)).toEqual([0, 1, 2, 3, 4]);
  expect(leaderboardPrestigeLevels([0], 0, 2)).toEqual([0, 1, 2]);
  expect(leaderboardPrestigeLevels([0], Number.NaN, -3)).toEqual([0]);
});

it("follows the viewer's level until a different one is picked, then holds the pick", () => {
  let own: number | undefined;
  const selection = createLeaderboardPrestigeSelection(() => own);
  expect(selection.level()).toBe(0);
  own = 2;
  expect(selection.level()).toBe(2);
  selection.pick(1);
  expect(selection.picked()).toBe(true);
  own = 3;
  expect(selection.level()).toBe(1);
  // Choosing their own level again goes back to following it.
  selection.pick(3);
  expect(selection.picked()).toBe(false);
  own = 4;
  expect(selection.level()).toBe(4);
  selection.pick(0);
  selection.reset();
  expect(selection.level()).toBe(4);
});

it("marks the viewer's own chip, highlights the selected one and reports a pick", () => {
  const { document } = parseHTML("<html><body><div id=chips></div><p id=heading></p></body></html>");
  const chips = document.getElementById("chips") as unknown as HTMLElement;
  const heading = document.getElementById("heading") as unknown as HTMLElement;
  const onPick = vi.fn();
  renderLeaderboardPrestige({ chips, heading }, { levels: [0, 1, 2], selected: 1, own: 2, localRank: 0, loading: false }, onPick);
  const buttons = [...chips.querySelectorAll<HTMLElement>("button")];
  expect(buttons.map(button => button.querySelector(".leaderboard-prestige-chip-label")!.textContent)).toEqual(["No prestige", "P1", "P2"]);
  expect(buttons.map(button => button.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
  expect(buttons[1].classList.contains("is-active")).toBe(true);
  expect(buttons[2].classList.contains("is-own")).toBe(true);
  expect(buttons[2].getAttribute("aria-label")).toBe("Prestige 2 leaderboard, your prestige");
  expect(buttons.filter(button => button.querySelector(".leaderboard-prestige-you"))).toEqual([buttons[2]]);
  expect(heading.querySelector(".leaderboard-prestige-title")!.textContent).toBe("Prestige 1 leaderboard");
  // Someone else's level: no rank line.
  expect(heading.querySelector<HTMLElement>(".leaderboard-prestige-rank")!.hidden).toBe(true);
  buttons[1].click();
  expect(onPick).not.toHaveBeenCalled();
  buttons[2].click();
  expect(onPick).toHaveBeenCalledWith(2);

  renderLeaderboardPrestige({ chips, heading }, { levels: [0, 1, 2], selected: 2, own: 2, localRank: 14, loading: false }, onPick);
  expect(heading.querySelector(".leaderboard-prestige-rank")!.textContent).toBe("You're #14");
  renderLeaderboardPrestige({ chips, heading }, { levels: [0, 1, 2], selected: 2, own: 2, localRank: 0, loading: false }, onPick);
  expect(heading.querySelector(".leaderboard-prestige-rank")!.textContent).toBe("Not ranked yet");
  renderLeaderboardPrestige({ chips, heading }, { levels: [0, 1, 2], selected: 2, own: 2, localRank: 0, loading: true }, onPick);
  expect(heading.querySelector<HTMLElement>(".leaderboard-prestige-rank")!.hidden).toBe(true);
});
