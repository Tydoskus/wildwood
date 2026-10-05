import { AGGRO_GROUPS, AGGRO_GROUP_LABELS, togglePick } from "../game/runtime/aggro-picks";
import { REWARD_DATA, type RewardType } from "../game/enemies";

/**
 * The Aggro picker: during a run the autofarm button opens it, and it opens on
 * its own whenever this map lacks the run's count of picked groups (a run that
 * predates picks, or a pick this map does not have, such as Atk Speed where no
 * enemy pays it). It offers only this map's groups, has no Back, and closes
 * once the run's count is picked; the picks are saved for the maps after.
 */
export function createAggroPickPrompt(doc: Document, deps: { picks: () => RewardType[]; setPicks: (picks: RewardType[]) => void }) {
  let overlay: HTMLElement | null = null, needed = 1, available: readonly RewardType[] = AGGRO_GROUPS;
  // Taps change a draft; the saved picks (what chases the player) change only on Done, with the full count.
  let draft: RewardType[] = [];
  let label: HTMLElement, done: HTMLButtonElement;
  const chips = new Map<RewardType, HTMLButtonElement>();

  // The picks this map can honour: those it has, in pick order.
  const here = () => draft.filter(pick => available.includes(pick)).slice(0, needed);
  function render() {
    const picks = here();
    label.textContent = `Pick ${needed} ${needed === 1 ? "group" : "groups"} to chase you (${picks.length}/${needed})`;
    for (const [group, chip] of chips) {
      chip.hidden = !available.includes(group);
      chip.setAttribute("aria-pressed", String(picks.includes(group)));
    }
    done.disabled = picks.length < needed;
  }

  function build() {
    overlay = doc.createElement("div");
    overlay.className = "aggro-pick-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="aggro-pick-window" role="dialog" aria-modal="true" aria-labelledby="aggroPickTitle">
        <h2 id="aggroPickTitle" class="window-banner window-banner--gray"><span>Aggro</span></h2>
        <p class="aggro-picks-label"></p>
        <div class="aggro-picks-chips" role="group" aria-label="Groups that chase you"></div>
        <p class="aggro-pick-note">They chase you on every map. Tap the autofarm button to switch them.</p>
        <button type="button" class="aggro-pick-done">Done</button>
      </section>`;
    doc.body.append(overlay);
    label = overlay.querySelector(".aggro-picks-label")!;
    done = overlay.querySelector(".aggro-pick-done")!;
    const box = overlay.querySelector(".aggro-picks-chips")!;
    for (const group of AGGRO_GROUPS) {
      const chip = doc.createElement("button");
      chip.type = "button";
      chip.className = "aggro-pick";
      chip.textContent = AGGRO_GROUP_LABELS[group];
      chip.style.setProperty("--pick-color", REWARD_DATA[group].color);
      chip.addEventListener("click", () => { draft = togglePick(here(), group, needed, false); render(); });
      chips.set(group, chip);
      box.append(chip);
    }
    done.addEventListener("click", () => {
      if (here().length < needed || !overlay) return;
      deps.setPicks(here());
      overlay.hidden = true;
    });
    // No way out but picking: Escape is swallowed here rather than reaching the game.
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } });
  }

  return {
    /** `groups`: the stat groups this map has; a map with fewer than the count asks for all of them. */
    open(count: number, groups: readonly RewardType[] = AGGRO_GROUPS) {
      if (!overlay) build();
      available = AGGRO_GROUPS.filter(group => groups.includes(group));
      needed = Math.max(1, Math.min(count, available.length));
      draft = deps.picks();
      render();
      overlay!.hidden = false;
      chips.get(available[0])?.focus();
    },
    isOpen: () => Boolean(overlay && !overlay.hidden),
    /** Whether this map lacks the run's count of picked groups. */
    lacking: (count: number, groups: readonly RewardType[]) =>
      deps.picks().filter(pick => groups.includes(pick)).length < Math.min(count, groups.length),
  };
}
