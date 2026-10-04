import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import { AGGRO_CHALLENGE_LIMIT, aggroForcedCamps, aggroPullCamps, type AggroChallenge } from "../../shared/aggro-challenge";

const camps = (count: number) => `${count} camp${count === 1 ? "" : "s"}`;

/**
 * Aggro, beside Reflect Only on the Challenge tab: a fresh run with no
 * prestige bonuses, where random camps chase the player on every map and a
 * death starts it over. The goal is the next regular prestige; each win lets
 * Autofarm's Pull bring one more camp at once.
 */
export function createAggroChallengePanel(d: {
  container: HTMLElement; state: () => AggroChallenge;
  /** Why the challenge cannot start yet, or null once it can. */
  locked: () => string | null;
  /** The next prestige's requirement, e.g. "Clear Endless 2". */
  goal: () => string;
  start: () => Promise<any>; abandon: () => Promise<any>; confirm?: ConfirmPrompt;
}) {
  const root = d.container.ownerDocument;
  const card = root.createElement("section");
  card.className = "prestige-challenge aggro-challenge";
  card.innerHTML = `
    <header class="prestige-challenge-head">
      <span class="prestige-challenge-icon" aria-hidden="true">😡</span>
      <div><h3 class="prestige-challenge-title">Aggro</h3><p class="prestige-challenge-state"></p></div>
      <ol class="prestige-challenge-pips" aria-label="Challenges completed"></ol>
    </header>
    <p class="prestige-challenge-rule"></p>
    <ul class="prestige-challenge-terms"></ul>
    <div class="prestige-challenge-goal"><span>Goal</span><strong></strong><small>Your next prestige's requirement</small></div>
    <div class="prestige-challenge-reward"><span>Reward</span><strong></strong><small>Autofarm's Pull brings one more camp at once, for good</small></div>
    <p class="prestige-challenge-earned"></p>
    <button type="button" class="prestige-challenge-action"></button>
    <p class="prestige-challenge-status" role="status"></p>`;
  d.container.append(card);
  const $ = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  const state = $(".prestige-challenge-state"), pips = $(".prestige-challenge-pips"), earned = $(".prestige-challenge-earned");
  const rule = $(".prestige-challenge-rule"), terms = $(".prestige-challenge-terms");
  const goal = $(".prestige-challenge-goal"), goalLabel = $(".prestige-challenge-goal strong");
  const reward = $(".prestige-challenge-reward"), rewardLabel = $(".prestige-challenge-reward strong");
  const button = $<HTMLButtonElement>(".prestige-challenge-action"), status = $(".prestige-challenge-status");
  pips.innerHTML = Array.from({ length: AGGRO_CHALLENGE_LIMIT }, () => "<li></li>").join("");
  let pending = false, shown = "";

  function render() {
    const current = d.state(), locked = d.locked(), done = current.completed >= AGGRO_CHALLENGE_LIMIT, target = d.goal();
    // Called every frame: only a change rebuilds it.
    const key = JSON.stringify([current.active, current.completed, locked, pending, target]);
    if (key === shown) return;
    shown = key;
    card.classList.toggle("is-active", current.active);
    const number = `Challenge ${current.completed + 1} of ${AGGRO_CHALLENGE_LIMIT}`;
    state.textContent = done ? `All ${AGGRO_CHALLENGE_LIMIT} won` : current.active ? `${number} · in progress` : locked ?? number;
    pips.querySelectorAll("li").forEach((pip, index) => pip.classList.toggle("is-done", index < current.completed));
    const chasing = aggroForcedCamps({ active: true, completed: current.completed });
    rule.textContent = done ? "" : `On every map, ${chasing === 1 ? "a random camp chases" : `${chasing} random camps chase`} you from the moment you arrive. Dying starts the run over.`;
    const lines = done ? [] : current.active
      ? ["No prestige bonuses this run: stat gain, perks and challenge rewards are off.",
        "Dropping out ends this run, and your main run comes back.", "Reach the goal, then press Prestige to win."]
      : ["Starting saves your run and puts you back in the forest with starting stats.",
        "No prestige bonuses: stat gain, perks and challenge rewards are off. Research and gear stay.",
        "Reach the goal, then press Prestige to win and get your run back."];
    terms.replaceChildren(...lines.map(line => Object.assign(root.createElement("li"), { textContent: line })));
    goal.hidden = reward.hidden = done;
    goalLabel.textContent = done ? "" : target;
    rewardLabel.textContent = `Pull brings ${camps(aggroPullCamps(current) + 1)}`;
    earned.textContent = current.completed ? `${done ? "Won" : "Won so far"}: Pull brings ${camps(aggroPullCamps(current))} at once` : "";
    button.textContent = current.active ? "Drop out" : done ? "All challenges won" : "Start Aggro";
    button.classList.toggle("is-abandon", current.active);
    button.disabled = pending || (!current.active && (done || locked !== null));
  }

  button.addEventListener("click", async () => {
    if (button.disabled || pending) return;
    const { active } = d.state();
    if (!await (d.confirm ?? gameConfirm)({ message: active
      ? "Drop out of Aggro? This run ends, and your main run comes back."
      : "Start Aggro? Your stats and stage are saved and restored when you win or drop out. Dying starts the run over.",
      confirmLabel: active ? "Drop out" : "Start challenge" })) return;
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
