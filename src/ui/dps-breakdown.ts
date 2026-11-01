import { formatCompactNumber } from "./number-format";
import { installMovableHudCard } from "./movable-hud-card";
import { renderBooleanSetting } from "./settings";
import { setHidden, setText } from "./dom-write";
import { DAMAGE_SOURCE_NAMES, DPS_BREAKDOWN_WINDOW_MS, type DamageSource } from "../game/runtime/dps-meter";

const ENABLED_KEY = "wildstat-dps-breakdown-enabled";
const POSITION_KEY = "wildstat-dps-breakdown-position";
const COLLAPSED_KEY = "wildstat-dps-breakdown-collapsed";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/**
 * Where the player's damage comes from: each source's DPS and share over the
 * last 20 seconds, in a card styled, moved and collapsed like the stat tracker.
 * Switched on in Settings; rows change only when the sources do.
 */
export function installDpsBreakdown(options: {
  meter: { breakdown: () => { source: DamageSource; perSecond: number }[] };
  storage: () => Storage | undefined;
}) {
  const read = (key: string) => { try { return options.storage()?.getItem(key) === "true"; } catch { return false; } };
  const write = (key: string, value: boolean) => { try { options.storage()?.setItem(key, String(value)); } catch { /* holds for the session */ } };
  const toggle = document.getElementById("dpsBreakdownToggle");
  const panel = document.createElement("section");
  panel.className = "dps-breakdown";
  panel.hidden = true;
  panel.setAttribute("aria-label", "DPS breakdown");
  panel.innerHTML = `<header><button type="button" class="dps-breakdown-handle"></button></header>`
    + `<table><thead><tr><th scope="col">Source</th><th scope="col">DPS</th><th scope="col">Share</th></tr></thead><tbody></tbody></table>`
    + `<p class="dps-breakdown-empty">Hit something to see where your damage comes from.</p>`
    + `<footer><span>Last ${DPS_BREAKDOWN_WINDOW_MS / 1_000}s</span></footer>`;
  document.getElementById("hud")!.append(panel);
  const handle = panel.querySelector<HTMLButtonElement>(".dps-breakdown-handle")!;
  const table = panel.querySelector("table")!;
  const body = panel.querySelector("tbody")!;
  const empty = panel.querySelector<HTMLElement>(".dps-breakdown-empty")!;
  const footer = panel.querySelector("footer")!;
  let enabled = read(ENABLED_KEY), collapsed = read(COLLAPSED_KEY), shownSources = "";
  let integrated = read("wildstat-stat-tracker-dps-switch");

  function renderCollapsed() {
    panel.classList.toggle("is-collapsed", collapsed);
    handle.setAttribute("aria-expanded", String(!collapsed));
    handle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} DPS breakdown. Double-click or double-tap to lock or unlock position.`);
    handle.textContent = `DPS Breakdown ${collapsed ? "▸" : "▾"}`;
    movable.place();
  }
  function refresh() {
    const wasHidden = panel.hidden;
    setHidden(panel, !enabled || integrated);
    if (!enabled || integrated) return;
    if (wasHidden) movable.place();
    if (collapsed) { table.hidden = empty.hidden = footer.hidden = true; return; }
    const rows = options.meter.breakdown();
    const total = rows.reduce((sum, row) => sum + row.perSecond, 0);
    setHidden(table, !rows.length);
    setHidden(empty, rows.length > 0);
    setHidden(footer, !rows.length);
    // A new source (a proc's first hit) rebuilds the rows; otherwise only their numbers change.
    const sources = rows.map(row => row.source).join();
    if (sources !== shownSources) {
      shownSources = sources;
      body.replaceChildren(...rows.map(row => {
        const line = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = DAMAGE_SOURCE_NAMES[row.source];
        line.append(name, document.createElement("td"), document.createElement("td"));
        return line;
      }));
    }
    rows.forEach((row, index) => {
      const line = body.rows[index];
      const share = total > 0 ? row.perSecond / total : 0;
      setText(line.cells[1], formatCompactNumber(row.perSecond));
      setText(line.cells[2], `${Math.round(share * 100)}%`);
      line.style.setProperty("--share", `${share * 100}%`);
    });
  }
  function setEnabled(value: boolean) {
    enabled = value;
    write(ENABLED_KEY, value);
    if (toggle) renderBooleanSetting(toggle, value);
    refresh();
  }
  toggle?.addEventListener("click", () => setEnabled(!enabled));
  window.addEventListener("stat-tracker-dps-change", event => {
    integrated = (event as CustomEvent<boolean>).detail;
    refresh();
  });
  const movable = installMovableHudCard({ panel, handle, storage: options.storage, positionKey: POSITION_KEY, lockKey: "wildstat-dps-breakdown-position-locked", toggle: () => {
    collapsed = !collapsed;
    write(COLLAPSED_KEY, collapsed);
    renderCollapsed();
    refresh();
  } });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 500);
  if (toggle) renderBooleanSetting(toggle, enabled);
  renderCollapsed();
  refresh();
}
