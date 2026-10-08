import { AGGRO_GROUPS, AGGRO_GROUP_LABELS, togglePick } from "../game/runtime/aggro-picks";
import { REWARD_DATA, type RewardType } from "../game/enemies";
import { AUTO_FARM_PRIORITIES, type AutoFarmPriority } from "../game/runtime/auto-farm-priority";

/**
 * The Aggro picker: during a run the autofarm button opens it, and it opens on
 * its own whenever this map lacks the run's count of picked groups (a run that
 * predates picks, or a pick this map does not have, such as Atk Speed where no
 * enemy pays it). It offers only this map's groups, has no Back, and closes
 * once the run's count is picked; the picks are saved for the maps after.
 * It also holds Target (autofarm's stored choice): the button never opens the
 * autofarm window during a run, and with every group chasing at once, which
 * one is shot first is the run's one targeting decision. It applies on tap.
 */
/** An Off / On row in the picker's own segment style. */
const onOff = (name: string, label: string) => `<div class="farm-setting aggro-pick-target"><span id="aggroPick-${name}" class="farm-setting-label">${label}</span>`
  + `<div class="farm-segment" role="radiogroup" aria-labelledby="aggroPick-${name}">`
  + `<button type="button" role="radio" data-switch="${name}" data-on="0">Off</button><button type="button" role="radio" data-switch="${name}" data-on="1">On</button></div></div>`;

export function createAggroPickPrompt(doc: Document, deps: {
  picks: () => RewardType[]; setPicks: (picks: RewardType[]) => void;
  priority?: () => AutoFarmPriority; setPriority?: (priority: AutoFarmPriority) => void;
  /** Autofarm's Fight Bosses and Move On switches: during a run this is the only window, so they live here too. */
  fightBosses?: () => boolean; setFightBosses?: (on: boolean) => void;
  advance?: () => boolean; setAdvance?: (on: boolean) => void;
}) {
  let overlay: HTMLElement | null = null, needed = 1, available: readonly RewardType[] = AGGRO_GROUPS;
  // Taps change a draft; the saved picks (what chases the player) change only on Done, with the full count.
  let draft: RewardType[] = [];
  let label: HTMLElement, done: HTMLButtonElement;
  const chips = new Map<RewardType, HTMLButtonElement>();
  let targets: HTMLButtonElement[] = [];
  let switches: HTMLButtonElement[] = [];
  const switchValue = (name: string) => name === "bosses" ? deps.fightBosses?.() : deps.advance?.();

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
    const priority = deps.priority?.();
    for (const button of targets) button.setAttribute("aria-checked", String(button.dataset.priority === priority));
    for (const button of switches) button.setAttribute("aria-checked", String((button.dataset.on === "1") === Boolean(switchValue(button.dataset.switch!))));
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
        ${deps.priority ? `<div class="farm-setting aggro-pick-target"><span id="aggroPickTargetLabel" class="farm-setting-label">Target</span>`
          + `<div class="farm-segment farm-target" role="radiogroup" aria-labelledby="aggroPickTargetLabel">`
          + AUTO_FARM_PRIORITIES.map(entry => `<button type="button" role="radio" data-priority="${entry.id}">${entry.label}</button>`).join("")
          + `</div></div>` : ""}
        ${deps.setFightBosses ? onOff("bosses", "Fight Bosses") : ""}
        ${deps.setAdvance ? onOff("advance", "Move On") : ""}
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
    targets = [...overlay.querySelectorAll<HTMLButtonElement>("[data-priority]")];
    switches = [...overlay.querySelectorAll<HTMLButtonElement>("[data-switch]")];
    for (const button of switches) button.addEventListener("click", () => {
      const on = button.dataset.on === "1";
      if (button.dataset.switch === "bosses") deps.setFightBosses?.(on); else deps.setAdvance?.(on);
      render();
    });
    for (const button of targets) button.addEventListener("click", () => {
      const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
      if (choice) deps.setPriority?.(choice.id);
      render();
    });
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
