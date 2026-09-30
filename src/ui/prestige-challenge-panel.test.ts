import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPrestigeChallengePanel, installPrestigeTabs } from "./prestige-challenge-panel";

it("shows Reflect Only's rule and reward, and confirms starting or abandoning it", async () => {
  const { document } = parseHTML("<html><body><div id='panel'></div></body></html>");
  const container = document.getElementById("panel") as unknown as HTMLElement;
  let state = { active: false, completed: 2 };
  const start = vi.fn(async () => { state = { ...state, active: true }; return { ok: true }; });
  const abandon = vi.fn(async () => { state = { ...state, active: false }; return { ok: true }; });
  const confirm = vi.fn(async (_request: { message: string }) => true);
  const panel = createPrestigeChallengePanel({ container, state: () => state, locked: () => null, start, abandon, confirm });
  expect(container.textContent).toContain("Reflect Only");
  expect(container.textContent).toContain("Only reflected hits deal damage");
  expect(container.textContent).toContain("+0.5 attacks/sec");
  expect(container.textContent).toContain("Earned so far: +1 attacks/sec");
  expect(container.querySelectorAll(".prestige-challenge-pips li.is-done")).toHaveLength(2);
  const button = container.querySelector("button")!;
  button.click(); await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  panel.render(); expect(button.textContent).toContain("Abandon");
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click(); await vi.waitFor(() => expect(abandon).toHaveBeenCalledOnce());
  expect(state.completed).toBe(2);
  expect(confirm.mock.calls[0][0].message).toContain("saved and restored");
  state = { active: false, completed: 4 }; panel.render();
  expect(button.disabled).toBe(true);
  expect(container.textContent).toContain("Earned so far: +2 attacks/sec");
});

it("names why the challenge is locked and keeps its button off", () => {
  const { document } = parseHTML("<html><body><div id='panel'></div></body></html>");
  const container = document.getElementById("panel") as unknown as HTMLElement;
  createPrestigeChallengePanel({ container, state: () => ({ active: false, completed: 0 }), locked: () => "Prestige once to unlock",
    start: vi.fn(), abandon: vi.fn() });
  expect(container.textContent).toContain("Prestige once to unlock");
  expect(container.querySelector("button")!.disabled).toBe(true);
});

it("switches between the Perks and Challenge tabs", () => {
  const { document } = parseHTML(`<html><body>
    <button id="a" class="prestige-tab is-active" aria-controls="pa"></button><button id="b" class="prestige-tab" aria-controls="pb"></button>
    <div id="pa"></div><div id="pb" hidden></div></body></html>`);
  installPrestigeTabs(document as unknown as Document);
  (document.getElementById("b") as unknown as HTMLButtonElement).click();
  expect(document.getElementById("pa")!.hidden).toBe(true);
  expect(document.getElementById("pb")!.hidden).toBe(false);
  expect(document.getElementById("b")!.getAttribute("aria-selected")).toBe("true");
});
