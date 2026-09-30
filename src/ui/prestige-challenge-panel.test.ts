import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPrestigeChallengePanel } from "./prestige-challenge-panel";

it("shows persistent rewards and confirms starting or abandoning a temporary run", async () => {
  const { document } = parseHTML("<html><body><div id='panel'></div></body></html>");
  const container = document.getElementById("panel") as unknown as HTMLElement;
  let state = { active: false, completed: 2 };
  const start = vi.fn(async () => { state = { ...state, active: true }; return { ok: true }; });
  const abandon = vi.fn(async () => { state = { ...state, active: false }; return { ok: true }; });
  const confirm = vi.fn(async (_request: { message: string }) => true);
  const panel = createPrestigeChallengePanel({ container, state: () => state, available: () => true, start, abandon, confirm });
  expect(container.textContent).toContain("Permanent +1 attacks/sec to base and cap");
  const button = container.querySelector("button")!;
  button.click(); await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  panel.render(); expect(button.textContent).toContain("Abandon");
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click(); await vi.waitFor(() => expect(abandon).toHaveBeenCalledOnce());
  expect(state.completed).toBe(2);
  expect(confirm.mock.calls[0][0].message).toContain("saved and restored");
  state = { active: false, completed: 4 }; panel.render();
  expect(button.disabled).toBe(true);
  expect(container.textContent).toContain("Permanent +2 attacks/sec");
});
