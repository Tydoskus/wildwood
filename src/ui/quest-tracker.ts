import type { QuestTrackerView } from "./quest-board-controller";
import { REWARD_DATA } from "../game/enemies";
import { SHORT_STAT } from "./map-enemy-index";

const COLLAPSED_KEY = "wildstat-quest-tracker-collapsed-v1";
const POSITION_KEY = "wildstat-quest-tracker-position-v1";
const ENABLED_KEY = "wildstat-quest-tracker-v1";

/** Whether the HUD tracker is on: switched from the Quest Board, on unless turned off, remembered per device. */
export function createQuestTrackerSetting(storage: Pick<Storage, "getItem" | "setItem">) {
  let enabled = (() => { try { return storage.getItem(ENABLED_KEY) !== "false"; } catch { return true; } })();
  return {
    enabled: () => enabled,
    set(next: boolean) { enabled = next; try { storage.setItem(ENABLED_KEY, String(next)); } catch { /* holds for the session */ } },
  };
}

/**
 * The quest tracker on the HUD, at home too while it is switched on: the three quests in play with
 * their counts, those on the current map first and bright, the rest dimmed
 * with where to find them. The header collapses it to a small chip; the Quest
 * Board turns it off. Rows are rebuilt only when what they show changes.
 */
export function installQuestTracker(options: {
  view: () => QuestTrackerView | null;
  /** Home, a cutscene, the tutorial: anywhere the tracker should stay out of the way. */
  hiddenHere: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Draws this week's quests if they have not arrived (rate-limited by the caller). */
  ensure?: () => void;
  enabled: () => boolean;
}) {
  const panel = document.createElement("section");
  panel.className = "quest-tracker";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Quest tracker");
  panel.innerHTML = `<button type="button" class="quest-tracker-header" aria-expanded="true"><span class="quest-tracker-title">Quests</span><span class="quest-tracker-week"></span><span class="quest-tracker-chevron" aria-hidden="true"></span></button><ol class="quest-tracker-list"></ol>`;
  document.getElementById("hud")!.append(panel);
  const header = panel.querySelector<HTMLButtonElement>(".quest-tracker-header")!;
  const week = panel.querySelector<HTMLElement>(".quest-tracker-week")!;
  const list = panel.querySelector<HTMLOListElement>(".quest-tracker-list")!;
  const read = () => { try { return options.storage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; } };
  let collapsed = read();
  let signature = "";
  // Dragged by its header like the stat tracker; a double tap puts it back under the gem row.
  let position: { x: number; y: number } | null = null;
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  let suppressClick = false;
  try {
    const saved = JSON.parse(options.storage.getItem(POSITION_KEY) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
  } catch { /* the default spot */ }
  const savePosition = () => { try { options.storage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* this session only */ } };
  function place() {
    if (panel.hidden || !position) return;
    position.x = Math.max(8, Math.min(position.x, window.innerWidth - panel.offsetWidth - 8));
    position.y = Math.max(8, Math.min(position.y, window.innerHeight - panel.offsetHeight - 8));
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
  }
  const home = () => { position = null; panel.style.left = ""; panel.style.top = ""; savePosition(); };

  function applyCollapsed() {
    panel.classList.toggle("is-collapsed", collapsed);
    header.setAttribute("aria-expanded", String(!collapsed));
    header.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} quests. Drag to move; double tap to put it back.`);
  }
  header.addEventListener("click", event => {
    if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
    collapsed = !collapsed;
    try { options.storage.setItem(COLLAPSED_KEY, String(collapsed)); } catch { /* the choice still holds this session */ }
    applyCollapsed();
    place();
  });
  header.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top, startX: event.clientX, startY: event.clientY, moved: false };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    position = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    place();
  });
  const finishDrag = () => { if (drag?.moved) { suppressClick = true; savePosition(); } drag = null; };
  header.addEventListener("pointerup", finishDrag);
  header.addEventListener("pointercancel", () => { finishDrag(); suppressClick = true; });
  header.addEventListener("lostpointercapture", finishDrag);
  header.addEventListener("dblclick", home);
  // Touches on the tracker are the tracker's, never a step or a shot in the world.
  for (const type of ["pointerdown", "pointermove", "pointerup", "click", "dblclick"]) panel.addEventListener(type, event => event.stopPropagation());
  // A world gesture that slides across the panel keeps going.
  window.addEventListener("pointerdown", event => {
    if (event.button === 0 && (event.target as HTMLElement | null)?.tagName === "CANVAS") panel.classList.add("is-world-gesture");
  }, true);
  const endWorldGesture = () => panel.classList.remove("is-world-gesture");
  window.addEventListener("pointerup", endWorldGesture, true);
  window.addEventListener("pointercancel", endWorldGesture, true);
  applyCollapsed();

  function render() {
    const showing = options.enabled() && !options.hiddenHere();
    if (showing) options.ensure?.();
    const view = showing ? options.view() : null;
    if (!view) { panel.hidden = true; return; }
    const wasHidden = panel.hidden;
    panel.hidden = false;
    if (wasHidden) place();
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
      label.append(name);
      if (item.stat) {
        const stat = document.createElement("span");
        stat.className = "quest-tracker-stat";
        stat.textContent = SHORT_STAT[item.stat];
        stat.style.color = REWARD_DATA[item.stat].color;
        label.append(stat);
      }
      const count = document.createElement("span");
      count.className = "quest-tracker-count";
      count.textContent = `${item.count}/${item.target}`;
      line.append(label, count);
      // Bright means this map; a line says where only for the rest, and whose a collected quest was.
      const whereText = item.onMap ? (item.from ? `For ${item.from}` : "") : item.from ? `${item.where} · For ${item.from}` : item.where;
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
      row.append(line, bar, where);
      row.setAttribute("aria-label", `${item.enemy}, ${item.count} of ${item.target}, ${item.onMap ? "on this map" : item.where}`);
      return row;
    }));
  }
  // Nothing to repaint while the tab is hidden; it catches up on the next tick after.
  const timer = window.setInterval(() => { if (!document.hidden) render(); }, 400);
  render();
  return { render, destroy() { window.clearInterval(timer); panel.remove(); } };
}
