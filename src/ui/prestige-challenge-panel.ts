import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import type { PrestigeChallenge } from "../../shared/prestige-challenge";

export function createPrestigeChallengePanel(d: {
  container: HTMLElement; state: () => PrestigeChallenge; available: () => boolean;
  start: () => Promise<any>; abandon: () => Promise<any>; confirm?: ConfirmPrompt;
}) {
  const root = d.container.ownerDocument;
  const section = root.createElement("section"), text = root.createElement("p"), button = root.createElement("button");
  section.className = "prestige-challenge";
  const status = root.createElement("p"); status.setAttribute("role", "status");
  section.append(text, button, status); d.container.append(section);
  let pending = false;
  function render() {
    const state = d.state();
    text.textContent = `Prestige Challenge ${state.completed}/4 · Permanent +${state.completed * .5} attacks/sec to base and cap. `
      + (state.active ? "Challenge active: prestige stats, perks and challenge speed rewards are disabled. Finish the prestige requirement to return to your saved stage with +0.5 attacks/sec."
        : "Temporarily start from the forest without prestige bonuses. Research and equipment stay. Completing or abandoning restores your saved stats and stage.");
    button.textContent = state.active ? "Abandon challenge and restore run" : state.completed >= 4 ? "All challenges complete" : "Start prestige challenge";
    button.disabled = pending || (!state.active && (!d.available() || state.completed >= 4));
  }
  button.addEventListener("click", async () => {
    if (button.disabled || pending) return;
    const active = d.state().active;
    if (!await (d.confirm ?? gameConfirm)({ message: active
      ? "Abandon this challenge and return to your saved stage without earning a reward?"
      : "Start a temporary prestige run without prestige bonuses? Your stats and stage will be saved and restored afterward.",
      confirmLabel: active ? "Restore saved run" : "Start challenge" })) return;
    pending = true; render();
    try {
      const result = await (active ? d.abandon() : d.start());
      if (!result?.ok) status.textContent = result?.error ?? "Couldn't change challenge mode.";
      else { status.textContent = ""; render(); }
    } catch { status.textContent = "Couldn't change challenge mode. Try again."; }
    finally { pending = false; render(); }
  });
  render();
  return { render };
}
