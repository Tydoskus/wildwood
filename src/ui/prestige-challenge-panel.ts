import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import { PRESTIGE_CHALLENGE_ATTACKS_PER_SECOND, PRESTIGE_CHALLENGE_LIMIT, type PrestigeChallenge } from "../../shared/prestige-challenge";

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
    <p class="prestige-challenge-rule">Only reflected hits deal damage. Your own attacks land nothing, so your Reflect perk does all the work.</p>
    <ul class="prestige-challenge-terms">
      <li>Your run is saved; you restart from the forest with starting stats.</li>
      <li>Your prestige level and perks stay on.</li>
      <li>Meet your next prestige requirement and press Prestige to win. Your saved run comes back.</li>
    </ul>
    <div class="prestige-challenge-reward"><span>Reward</span><strong>${bonus(1)} attacks/sec</strong><small>to your base attack speed and its cap, for good</small></div>
    <p class="prestige-challenge-earned"></p>
    <button type="button" class="prestige-challenge-action"></button>
    <p class="prestige-challenge-status" role="status"></p>`;
  d.container.append(card);
  const $ = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  const state = $(".prestige-challenge-state"), pips = $(".prestige-challenge-pips"), earned = $(".prestige-challenge-earned");
  const button = $<HTMLButtonElement>(".prestige-challenge-action"), status = $(".prestige-challenge-status");
  pips.innerHTML = Array.from({ length: PRESTIGE_CHALLENGE_LIMIT }, () => "<li></li>").join("");
  let pending = false;
  function render() {
    const current = d.state(), locked = d.locked(), done = current.completed >= PRESTIGE_CHALLENGE_LIMIT;
    card.classList.toggle("is-active", current.active);
    state.textContent = current.active ? "In progress" : done ? "All complete" : locked ?? `Challenge ${current.completed + 1} of ${PRESTIGE_CHALLENGE_LIMIT}`;
    pips.querySelectorAll("li").forEach((pip, index) => pip.classList.toggle("is-done", index < current.completed));
    earned.textContent = current.completed ? `Earned so far: ${bonus(current.completed)} attacks/sec` : "";
    button.textContent = current.active ? "Abandon and restore my run" : done ? "All challenges complete" : "Start Reflect Only";
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
