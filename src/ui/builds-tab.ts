import { BUILD_GEAR_SLOTS, BUILD_NAME_MAX, BUILD_SLOTS, buildLabel } from "../../shared/builds";
import { ARROW_KINDS, isArrowId } from "../../shared/arrows";
import type { SavedBuild } from "../../shared/builds";
import type { BuildActions } from "./build-actions";

/**
 * The Builds tab: ten saved loadouts, a compact row each, each the gear in every slot and the active cards. Save Current
 * stores what is worn now (a second tap confirms over a saved build); Equip puts it all back on. Rename names
 * one (Enter or leaving the box keeps it, Escape keeps the old one; an empty name is its number again).
 */
export function createBuildsTab(options: {
  actions: BuildActions;
  itemName: (itemId: string) => string;
  showMessage: (text: string, color?: string) => void;
}) {
  const element = document.createElement("section");
  element.className = "builds-tab";
  element.hidden = true;
  const note = document.createElement("p");
  note.className = "inventory-cosmetics-note builds-tab-note";
  note.textContent = "Save what you wear, your active cards and your nocked arrow, then swap back in one tap.";
  const list = document.createElement("div");
  list.className = "builds-tab-list";
  element.append(note, list);
  let busy = -1, armed = -1, editing = -1, renderedKey = "";
  const label = (slot: number) => buildLabel(slot, options.actions.names()[slot]);

  const summary = (build: SavedBuild | null) => {
    if (!build) return "Empty";
    const names = BUILD_GEAR_SLOTS.map(slot => build.gear[slot]).filter(Boolean).map(options.itemName);
    // The arrow it nocks, by name (Steel Arrow); a build without one shoots plain arrows.
    if (isArrowId(build.gear.ARROW)) names.push(ARROW_KINDS[build.gear.ARROW].name);
    const cards = Object.values(build.cards).reduce((sum, ids) => sum + ids.length, 0);
    return `${names.join(" · ") || "No gear"}${cards ? ` · ${cards} Card${cards === 1 ? "" : "s"}` : ""}`;
  };

  async function run(slot: number, kind: "save" | "equip") {
    if (busy >= 0) return;
    busy = slot; armed = -1; render(true);
    try {
      if (kind === "save") {
        const result = await options.actions.save(slot);
        options.showMessage(result.ok ? `${label(slot)} Saved` : result.error ?? "Not Connected", result.ok ? "#72ef58" : "#ff9b91");
      } else {
        const result = await options.actions.equip(slot);
        const missing = result.missingGear ? ` · ${result.missingGear} Item${result.missingGear === 1 ? "" : "s"} Missing` : "";
        options.showMessage(result.ok ? `${label(slot)} Equipped${missing}` : result.error ?? "Not Connected", result.ok ? "#72ef58" : "#ff9b91");
      }
    } finally { busy = -1; render(true); }
  }

  async function rename(slot: number, name: string) {
    editing = -1; render(true);
    if (name === (options.actions.names()[slot] ?? "")) return;
    const result = await options.actions.rename(slot, name);
    if (!result.ok) options.showMessage(result.error ?? "Not Connected", "#ff9b91");
    render(true);
  }

  function render(force = false) {
    const builds = options.actions.builds();
    const key = JSON.stringify([builds, options.actions.names(), busy, armed, editing]);
    if (!force && key === renderedKey) return;
    renderedKey = key;
    list.textContent = "";
    for (let slot = 0; slot < BUILD_SLOTS; slot += 1) {
      const build = builds[slot] ?? null;
      const card = document.createElement("div");
      card.className = "builds-tab-card";
      const head = document.createElement("div");
      head.className = "builds-tab-head";
      let title: HTMLElement;
      if (editing === slot) {
        const input = document.createElement("input");
        input.className = "builds-tab-name";
        input.maxLength = BUILD_NAME_MAX;
        input.value = options.actions.names()[slot] ?? "";
        input.placeholder = `Build ${slot + 1}`;
        input.setAttribute("aria-label", `Name for build ${slot + 1}`);
        let done = false;
        const finish = (keep: boolean) => { if (done) return; done = true; if (keep) void rename(slot, input.value.trim()); else { editing = -1; render(true); } };
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") { event.preventDefault(); finish(true); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
        });
        input.addEventListener("blur", () => finish(true));
        requestAnimationFrame(() => { input.focus(); input.select?.(); });
        title = input;
      } else {
        title = document.createElement("strong");
        title.textContent = label(slot);
      }
      const renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.className = "builds-tab-rename";
      renameButton.textContent = "✎";
      renameButton.hidden = editing === slot;
      renameButton.disabled = busy >= 0;
      renameButton.setAttribute("aria-label", `Rename ${label(slot)}`);
      renameButton.addEventListener("click", () => { editing = slot; armed = -1; render(true); });
      head.append(title);
      const detail = document.createElement("span");
      detail.className = "builds-tab-detail";
      detail.textContent = summary(build);
      const actions = document.createElement("div");
      actions.className = "builds-tab-actions";
      const equip = document.createElement("button");
      equip.type = "button";
      equip.className = "builds-tab-equip";
      equip.textContent = busy === slot ? "Working…" : "Equip";
      equip.disabled = !build || busy >= 0;
      equip.addEventListener("click", () => { void run(slot, "equip"); });
      const save = document.createElement("button");
      save.type = "button";
      save.className = "builds-tab-save";
      save.textContent = armed === slot ? "Confirm" : "Save";
      save.disabled = busy >= 0;
      save.addEventListener("click", () => {
        if (build && armed !== slot) { armed = slot; render(true); return; }
        void run(slot, "save");
      });
      actions.append(renameButton, equip, save);
      const text = document.createElement("div");
      text.className = "builds-tab-text";
      text.append(head, detail);
      card.append(text, actions);
      list.append(card);
    }
  }

  return {
    element,
    /** Equips a saved build as its Equip button does (the Build 1-10 hotkeys); an empty slot says so. */
    equip(slot: number) {
      if (busy >= 0) return;
      if (!options.actions.builds()[slot]) { options.showMessage(`${label(slot)} Is Empty`, "#ff9b91"); return; }
      void run(slot, "equip");
    },
    render: () => render(),
    show(visible: boolean) { element.hidden = !visible; if (visible) render(); else if (armed >= 0) { armed = -1; render(true); } },
  };
}
