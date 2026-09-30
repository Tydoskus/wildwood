import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import { PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND, PRESTIGE_CHALLENGE_LIMIT, challengeGoal, type PrestigeChallenge } from "../../shared/prestige-challenge";

/** The prestige window's two tabs: its perks, and the Reflect Only challenge. */
export function installPrestigeTabs(root: Document) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".prestige-tab")];
  const select = (chosen: HTMLButtonElement) => {
    for (const tab of tabs) {
      const active = tab === chosen;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = root.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !active;
    }
  };
  for (const tab of tabs) tab.addEventListener("click", () => select(tab));
  return { select: (id: string) => { const tab = tabs.find(tab => tab.id === id); if (tab) select(tab); } };
}

const bonus = (completed: number) => `+${completed * PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND}`;

/**
 * Reflect Only: the run is saved and starts over with starting stats, prestige
 * level and perks kept; only reflected hits deal damage. Meeting the next
 * prestige requirement restores the saved run with the reward.
 */
export function createPrestigeChallengePanel(d: {
  container: HTMLElement; state: () => PrestigeChallenge;
  /** Why the challenge cannot start yet, or null once it can. */
  locked: () => string | null;
  start: () => Promise<any>; abandon: () => Promise<any>; confirm?: ConfirmPrompt;
}) {
  const root = d.container.ownerDocument;
  const card = root.createElement("section");
  card.className = "prestige-challenge";
  card.innerHTML = `
    <header class="prestige-challenge-head">
      <span class="prestige-challenge-icon" aria-hidden="true">🛡️</span>
      <div><h3 class="prestige-challenge-title">Reflect Only</h3><p class="prestige-challenge-state"></p></div>
      <ol class="prestige-challenge-pips" aria-label="Challenges completed"></ol>
    </header>
    <p class="prestige-challenge-rule">Your attacks deal no damage. Only hits you throw back with the Reflect perk hurt enemies and bosses.</p>
    <ul class="prestige-challenge-terms"></ul>
    <div class="prestige-challenge-goal"><span>Goal</span><strong></strong><small></small></div>
    <div class="prestige-challenge-reward"><span>Reward</span><strong>${bonus(1)} attacks/sec</strong><small>to base attack speed and its cap, for good</small></div>
    <p class="prestige-challenge-earned"></p>
    <button type="button" class="prestige-challenge-action"></button>
    <p class="prestige-challenge-status" role="status"></p>`;
  d.container.append(card);
  const $ = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  const state = $(".prestige-challenge-state"), pips = $(".prestige-challenge-pips"), earned = $(".prestige-challenge-earned");
  const button = $<HTMLButtonElement>(".prestige-challenge-action"), status = $(".prestige-challenge-status");
  const terms = $(".prestige-challenge-terms"), goal = $(".prestige-challenge-goal"), reward = $(".prestige-challenge-reward");
  const goalLabel = $(".prestige-challenge-goal strong"), goalLadder = $(".prestige-challenge-goal small");
  goalLadder.textContent = `Map ${challengeGoal(0).label.match(/map (\d+)/)?.[1] ?? 15} boss → `
    + Array.from({ length: PRESTIGE_CHALLENGE_LIMIT - 1 }, (_, index) => `Endless ${index + 1}`).join(" → ");
  pips.innerHTML = Array.from({ length: PRESTIGE_CHALLENGE_LIMIT }, () => "<li></li>").join("");
  let pending = false;
  function render() {
    const current = d.state(), locked = d.locked(), done = current.completed >= PRESTIGE_CHALLENGE_LIMIT;
    card.classList.toggle("is-active", current.active);
    const number = `Challenge ${current.completed + 1} of ${PRESTIGE_CHALLENGE_LIMIT}`;
    state.textContent = done ? `All ${PRESTIGE_CHALLENGE_LIMIT} won` : current.active ? `${number} · in progress` : locked ?? number;
    pips.querySelectorAll("li").forEach((pip, index) => pip.classList.toggle("is-done", index < current.completed));
    const lines = done ? [] : current.active
      ? ["Your saved run comes back when you win or abandon.", "Reach the goal, then press Prestige to win."]
      : ["Starting saves your run and puts you back in the forest with starting stats.",
        "Prestige level, perks, research and gear all stay.", "Reach the goal, then press Prestige to win and get your run back."];
    terms.replaceChildren(...lines.map(line => Object.assign(root.createElement("li"), { textContent: line })));
    goal.hidden = reward.hidden = done;
    goalLabel.textContent = done ? "" : challengeGoal(current.completed).label;
    earned.textContent = current.completed ? `${done ? "Won" : "Won so far"}: ${bonus(current.completed)} attacks/sec for good` : "";
    button.textContent = current.active ? "Abandon and restore my run" : done ? "All challenges won" : "Start Reflect Only";
    button.classList.toggle("is-abandon", current.active);
    button.disabled = pending || (!current.active && (done || locked !== null));
  }
  button.addEventListener("click", async () => {
    if (button.disabled || pending) return;
    const active = d.state().active;
    if (!await (d.confirm ?? gameConfirm)({ message: active
      ? "Abandon Reflect Only and return to your saved run without the reward?"
      : "Start Reflect Only? Your stats and stage are saved and restored when you finish or abandon it.",
      confirmLabel: active ? "Restore saved run" : "Start challenge" })) return;
    pending = true; render();
    try {
      const result = await (active ? d.abandon() : d.start());
      status.textContent = result?.ok ? "" : result?.error ?? "Couldn't change challenge mode.";
    } catch { status.textContent = "Couldn't change challenge mode. Try again."; }
    finally { pending = false; render(); }
  });
  render();
  return { render };
}
