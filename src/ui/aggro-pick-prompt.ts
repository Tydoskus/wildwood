import { AGGRO_GROUPS, AGGRO_GROUP_LABELS, togglePick } from "../game/runtime/aggro-picks";
import { REWARD_DATA, type RewardType } from "../game/enemies";

/**
 * The picker an Aggro run opens over the game while it lacks its chasing
 * groups: a run must always have its tier's count. It has no Back and does not
 * close until that many are picked; the same choices live on the Aggro card,
 * where they can be switched any time.
 */
export function createAggroPickPrompt(doc: Document, deps: { picks: () => RewardType[]; setPicks: (picks: RewardType[]) => void }) {
  let overlay: HTMLElement | null = null, needed = 1;
  let label: HTMLElement, done: HTMLButtonElement;
  const chips = new Map<RewardType, HTMLButtonElement>();

  function render() {
    const picks = deps.picks().slice(0, needed);
    label.textContent = `Pick ${needed} ${needed === 1 ? "group" : "groups"} to chase you on every map (${picks.length}/${needed})`;
    for (const [group, chip] of chips) chip.setAttribute("aria-pressed", String(picks.includes(group)));
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
        <p class="aggro-pick-note">You can switch them any time on the Aggro card.</p>
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
      chip.addEventListener("click", () => { deps.setPicks(togglePick(deps.picks(), group, needed, false)); render(); });
      chips.set(group, chip);
      box.append(chip);
    }
    done.addEventListener("click", () => { if (deps.picks().length >= needed && overlay) overlay.hidden = true; });
    // No way out but picking: Escape is swallowed here rather than reaching the game.
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } });
  }

  return {
    open(count: number) {
      if (!overlay) build();
      needed = Math.max(1, count);
      render();
      overlay!.hidden = false;
      chips.get(AGGRO_GROUPS[0])?.focus();
    },
    isOpen: () => Boolean(overlay && !overlay.hidden),
  };
}
