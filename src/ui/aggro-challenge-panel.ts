import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import { AGGRO_CHALLENGE_LIMIT, aggroForcedCamps, aggroPullCamps, type AggroChallenge } from "../../shared/aggro-challenge";
import { AGGRO_GROUPS, AGGRO_GROUP_LABELS as GROUP_LABELS, togglePick } from "../game/runtime/aggro-picks";
import { REWARD_DATA, type RewardType } from "../game/enemies";
import { challengeAnswer } from "./challenge-answer";


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
  /** The stat groups the player picked to chase them, saved; locked while a run is under way. */
  picks: () => RewardType[]; setPicks: (picks: RewardType[]) => void;
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
    <div class="aggro-picks"><p class="aggro-picks-label"></p><div class="aggro-picks-chips" role="group" aria-label="Groups that chase you"></div></div>
    <ul class="prestige-challenge-terms"></ul>
    <div class="prestige-challenge-goal"><span>Goal</span><strong></strong><small>The same as a first prestige</small></div>
    <div class="prestige-challenge-reward"><span>Reward</span><strong></strong><small>Autofarm's Pull aggroes one more of your picked camps at once, for good</small></div>
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
  const pickLabel = $(".aggro-picks-label"), chips = $(".aggro-picks-chips"), picksBox = $(".aggro-picks");
  const chipFor = new Map<RewardType, HTMLButtonElement>();
  for (const group of AGGRO_GROUPS) {
    const chip = root.createElement("button");
    chip.type = "button";
    chip.className = "aggro-pick";
    chip.textContent = GROUP_LABELS[group];
    chip.style.setProperty("--pick-color", REWARD_DATA[group].color);
    chip.addEventListener("click", () => {
      const current = d.state();
      if (chip.disabled) return;
      d.setPicks(togglePick(d.picks(), group, aggroForcedCamps({ active: true, completed: current.completed }), current.active));
      shown = ""; render();
    });
    chipFor.set(group, chip);
    chips.append(chip);
  }
  let pending = false, shown = "";

  function render() {
    const current = d.state(), locked = d.locked(), done = current.completed >= AGGRO_CHALLENGE_LIMIT, target = d.goal();
    // Called every frame: only a change rebuilds it.
    const picks = d.picks();
    const key = JSON.stringify([current.active, current.completed, current.parked === true, locked, pending, target, picks]);
    if (key === shown) return;
    shown = key;
    card.classList.toggle("is-active", current.active);
    const number = `Challenge ${current.completed + 1} of ${AGGRO_CHALLENGE_LIMIT}`;
    const parked = !current.active && !done && current.parked === true;
    state.textContent = done ? `All ${AGGRO_CHALLENGE_LIMIT} won` : current.active ? `${number} · in progress` : locked ?? (parked ? `${number} · dropped out` : number);
    pips.querySelectorAll("li").forEach((pip, index) => pip.classList.toggle("is-done", index < current.completed));
    const chasing = aggroForcedCamps({ active: true, completed: current.completed });
    rule.textContent = done ? "" : `On every map, ${chasing === 1 ? "the group you pick chases" : `the ${chasing} groups you pick chase`} you from the moment you arrive. Dying after Tutorial Forest starts the run over.`;
    picksBox.hidden = done;
    const chosen = picks.slice(0, chasing);
    // Always the tier's count: pick that many, and switch any time (tap another to swap it in).
    const filling = chosen.length < chasing;
    pickLabel.textContent = current.active && !filling ? `Chasing you: ${chosen.map(pick => GROUP_LABELS[pick]).join(", ")} (tap another to switch)`
      : `Pick ${chasing} ${chasing === 1 ? "group" : "groups"} to chase you (${Math.min(picks.length, chasing)}/${chasing})`;
    pickLabel.classList.toggle("is-needed", current.active && filling);
    for (const [group, chip] of chipFor) {
      chip.setAttribute("aria-pressed", String(chosen.includes(group)));
      chip.disabled = pending;
    }
    const lines = done ? [] : current.active
      ? ["No prestige bonuses this run: stat gain, perks and challenge rewards are off. Autofarm's Pull is off too.",
        "Drop out any time: this run is kept, and your main run comes back. Only dying after Tutorial Forest starts it over.", "Reach the goal, then press Prestige to win."]
      : parked ? ["Your Aggro run is kept where you left it.", "Dropping back in saves your main run and picks the run up again."]
      : ["Starting saves your run and puts you back in the forest with starting stats.",
        "No prestige bonuses: stat gain, perks and challenge rewards are off, and so is Autofarm's Pull. Research and gear stay.",
        "Reach the goal, then press Prestige to win and get your run back."];
    terms.replaceChildren(...lines.map(line => Object.assign(root.createElement("li"), { textContent: line })));
    goal.hidden = reward.hidden = done;
    goalLabel.textContent = done ? "" : target;
    rewardLabel.textContent = `Pull aggroes ${camps(aggroPullCamps(current) + 1)}`;
    earned.textContent = current.completed ? `${done ? "Won" : "Won so far"}: Pull aggroes ${camps(aggroPullCamps(current))} at once` : "";
    button.textContent = current.active ? "Drop out" : done ? "All challenges won" : parked ? "Drop back in" : "Start Aggro";
    button.classList.toggle("is-abandon", current.active);
    // Starting or dropping back in needs the run's full set of picks.
    button.disabled = pending || (!current.active && (done || locked !== null || chosen.length < chasing));
  }

  button.addEventListener("click", async () => {
    if (button.disabled || pending) return;
    const { active, parked } = d.state();
    if (!await (d.confirm ?? gameConfirm)({ message: active
      ? "Drop out of Aggro? This run is kept for later, and your main run comes back."
      : parked ? "Drop back in to Aggro? Your main run is saved, and the run picks up where you left it."
      : "Start Aggro? Your stats and stage are saved and restored when you win or drop out. Dying after Tutorial Forest starts the run over.",
      confirmLabel: active ? "Drop out" : parked ? "Drop back in" : "Start challenge" })) return;
    pending = true; render();
    try {
      const result = await challengeAnswer(active ? d.abandon() : d.start());
      status.textContent = result?.ok ? "" : result?.error ?? "Couldn't change challenge mode.";
    } catch { status.textContent = "Couldn't change challenge mode. Try again."; }
    finally { pending = false; render(); }
  });
  render();
  return { render };
}
