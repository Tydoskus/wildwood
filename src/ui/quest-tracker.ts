import { installMovableHudCard } from "./movable-hud-card";
import type { QuestTrackerView } from "./quest-board-controller";
import { REWARD_DATA, rewardStatLabel } from "../game/enemies";
import { renderBooleanSetting } from "./settings";
import { setHidden } from "./dom-write";

const COLLAPSED_KEY = "wildstat-quest-tracker-collapsed-v1";
const POSITION_KEY = "wildstat-quest-tracker-position-v1";
const ENABLED_KEY = "wildstat-quest-tracker-v1";

/** Whether the HUD tracker is on: switched from the Quest Board, Settings or the tracker's own ×, on unless turned off, remembered per device. */
export function createQuestTrackerSetting(storage: Pick<Storage, "getItem" | "setItem">) {
  let enabled = (() => { try { return storage.getItem(ENABLED_KEY) !== "false"; } catch { return true; } })();
  return {
    enabled: () => enabled,
    set(next: boolean) { enabled = next; try { storage.setItem(ENABLED_KEY, String(next)); } catch { /* holds for the session */ } },
  };
}

/**
 * The quest tracker on the HUD, at home too while it is switched on: the three quests in play with
 * their counts, ordered by area from later to earlier. Those on the current map are bright, the rest dimmed
 * with where to find them. The header collapses it to a small chip; its ×, the
 * Quest Board and Settings turn it off. Rows are rebuilt only when what they show changes.
 */
export function installQuestTracker(options: {
  view: () => QuestTrackerView | null;
  /** Home, a cutscene, the tutorial: anywhere the tracker should stay out of the way. */
  hiddenHere: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Draws this week's quests if they have not arrived (rate-limited by the caller). */
  ensure?: () => void;
  enabled: () => boolean;
  /** Turns it on or off; the × and the Settings row need it. */
  set?: (enabled: boolean) => void;
}) {
  const panel = document.createElement("section");
  panel.className = "quest-tracker";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Quest tracker");
  panel.innerHTML = `<button type="button" class="quest-tracker-header" aria-expanded="true"><span class="quest-tracker-title">Quests</span><span class="quest-tracker-week"></span><span class="quest-tracker-chevron" aria-hidden="true"></span></button><button type="button" class="quest-tracker-hide" aria-label="Hide the quest tracker">×</button><ol class="quest-tracker-list"></ol>`
    + `<div class="quest-tracker-confirm" hidden><p>Hide the quest tracker? Turn it back on at the Quest Board or in Settings.</p>`
    + `<div class="quest-tracker-confirm-actions"><button type="button" class="quest-tracker-confirm-hide">Hide</button><button type="button" class="quest-tracker-confirm-keep">Keep</button></div></div>`;
  document.getElementById("hud")!.append(panel);
  const header = panel.querySelector<HTMLButtonElement>(".quest-tracker-header")!;
  const hide = panel.querySelector<HTMLButtonElement>(".quest-tracker-hide")!;
  const confirm = panel.querySelector<HTMLElement>(".quest-tracker-confirm")!;
  // The Settings row turns it back on from anywhere; it and the × share the board's switch.
  const toggle = document.getElementById("questTrackerToggle");
  hide.hidden = !options.set;
  panel.classList.toggle("has-hide", Boolean(options.set));
  const confirming = (open: boolean) => { confirm.hidden = !open; panel.classList.toggle("is-confirming", open); };
  hide.addEventListener("click", () => confirming(true));
  panel.querySelector(".quest-tracker-confirm-keep")!.addEventListener("click", () => confirming(false));
  panel.querySelector(".quest-tracker-confirm-hide")!.addEventListener("click", () => { confirming(false); options.set?.(false); render(); });
  toggle?.addEventListener("click", () => { options.set?.(!options.enabled()); render(); });
  const week = panel.querySelector<HTMLElement>(".quest-tracker-week")!;
  const list = panel.querySelector<HTMLOListElement>(".quest-tracker-list")!;
  const read = () => { try { return options.storage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; } };
  let collapsed = read();
  let signature = "";
  function applyCollapsed() {
    panel.classList.toggle("is-collapsed", collapsed);
    header.setAttribute("aria-expanded", String(!collapsed));
    header.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} quests. Drag to move; double tap to put it back.`);
  }
  // Dragged by its header like the stat tracker (the shared HUD card); a double tap puts it back under the gem row.
  const movable = installMovableHudCard({ panel, handle: header, storage: () => options.storage, positionKey: POSITION_KEY, toggle: () => {
    collapsed = !collapsed;
    confirming(false);
    try { options.storage.setItem(COLLAPSED_KEY, String(collapsed)); } catch { /* the choice still holds this session */ }
    applyCollapsed();
    movable.place();
  } });
  applyCollapsed();

  function render() {
    if (toggle) renderBooleanSetting(toggle, options.enabled());
    const showing = options.enabled() && !options.hiddenHere();
    if (showing) options.ensure?.();
    const view = showing ? options.view() : null;
    if (!view) { setHidden(panel, true); return; }
    const wasHidden = panel.hidden;
    panel.hidden = false;
    if (wasHidden) movable.place();
    const next = JSON.stringify(view);
    if (next === signature) return;
    signature = next;
    week.textContent = `${view.done}/${view.total}`;
    week.setAttribute("aria-label", `${view.done} of ${view.total} done this week`);
    list.replaceChildren(...view.items.map(item => {
      const row = document.createElement("li");
      row.className = `quest-tracker-item${item.onMap ? " is-here" : ""}`;
      const line = document.createElement("span");
      line.className = "quest-tracker-line";
      const name = document.createElement("span");
      name.className = "quest-tracker-enemy";
      name.textContent = item.enemy;
      const label = document.createElement("span");
      label.className = "quest-tracker-label";
      // A stat quest has no one enemy: its stat names it.
      if (item.enemy) label.append(name);
      if (item.stat) {
        const stat = document.createElement("span");
        stat.className = "quest-tracker-stat";
        // The enemy's own label's words ("Damage", "Atk/sec"), so the quest names the stat as the map does.
        stat.textContent = rewardStatLabel({ type: item.stat, amount: 0 });
        stat.style.color = REWARD_DATA[item.stat].color;
        label.append(stat);
      }
      const count = document.createElement("span");
      count.className = "quest-tracker-count";
      count.textContent = `${item.count}/${item.target}`;
      line.append(label, count);
      // Bright means this map; a line says where only for the rest.
      const whereText = item.onMap ? "" : item.where;
      const where = document.createElement("span");
      where.className = "quest-tracker-where";
      where.textContent = whereText;
      where.hidden = !whereText;
      const bar = document.createElement("span");
      bar.className = "quest-tracker-bar";
      bar.setAttribute("aria-hidden", "true");
      const fill = document.createElement("span");
      fill.style.width = `${Math.round(item.share * 100)}%`;
      bar.append(fill);
      // Where first, then the enemy: the map is what a player looks for.
      row.append(where, line, bar);
      row.setAttribute("aria-label", `${item.enemy || (item.stat ? rewardStatLabel({ type: item.stat, amount: 0 }) : "")}, ${item.count} of ${item.target}, ${item.onMap ? "on this map" : item.where}`);
      return row;
    }));
  }
  // Nothing to repaint while the tab is hidden; it catches up on the next tick after.
  const timer = window.setInterval(() => { if (!document.hidden) render(); }, 400);
  render();
  return { render, destroy() { window.clearInterval(timer); panel.remove(); } };
}
