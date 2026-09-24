import { itemTier } from "../../shared/item-tier";
import { BLACK_BOOTS, IRON_BOW, WOOD_FULL_HELM, WOODEN_ARMOR, isCosmeticOnlyItem, itemDisplayName, type ItemSlot } from "../../shared/items";
import { LOOT_FILTER_SLOTS, isDropFiltered, isFilterableDrop, itemSlot, slotFilterId } from "../../shared/loot-filter";
import { itemArtMarkup } from "../game/item-presentation";
import { itemDropColor } from "./item-drop-color";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

type Result = { ok: boolean; error?: string } | undefined;

/**
 * What the window needs from the coop session: the account's filter entries
 * (slot entries and item ids that are off) and the call that changes them.
 * Both optional, so an older API simply has no Loot filter button.
 */
export type LootFilterPort = {
  ignoredDrops?: () => ReadonlySet<string>;
  setIgnoredDrops?: (filterIds: readonly string[], ignored: boolean) => Promise<Result>;
};

export type LootFilterWindowOptions = {
  port: () => LootFilterPort | null | undefined;
  /** The map window's Item Drops header; the Loot filter button goes at its end. */
  anchor: HTMLElement;
  /** The map window's drop cards, tagged "Filtered" for what will not drop. */
  cards?: HTMLElement;
  root?: Document;
  tickMs?: number;
};

/** One recognisable piece of gear for each slot chip. */
const SLOT_ART: Record<ItemSlot, string> = { HAND: IRON_BOW, CHEST: WOODEN_ARMOR, HEAD: WOOD_FULL_HELM, FEET: BLACK_BOOTS };
const NOTHING = new Set<string>();

/** The items a map's drop list shows switches for, once each, in the list's order. */
export function filterableDrops(itemIds: readonly string[]) {
  return [...new Set(itemIds)].filter(itemId => isFilterableDrop(itemId));
}

/**
 * The Loot Filter, opened from the map window.
 *
 * Phrased as what the player picks up. Four slot chips on top turn a whole
 * slot off on every map, which is the one-tap way to farm only bows. Below,
 * this map's items each have a Pick up switch; an item whose slot is off
 * shows "Slot off" and cannot be switched until the slot is back on. All on
 * and All off set this map's items at once.
 *
 * The list lives on the account on the server. A switch changes the moment it
 * is pressed and the server is told; if the server refuses or cannot be
 * reached it goes back and the window says why.
 */
export function createLootFilterWindow(options: LootFilterWindowOptions) {
  const doc = options.root ?? document;
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "map-guide-loot-filter";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.innerHTML = `<span>Loot filter</span><span class="map-guide-loot-filter-count" hidden></span>`;
  trigger.hidden = true;
  options.anchor.append(trigger);
  const triggerCount = trigger.querySelector<HTMLElement>(".map-guide-loot-filter-count")!;

  const dialog = doc.createElement("dialog");
  dialog.className = "farm-sheet loot-filter-sheet";
  dialog.setAttribute("aria-labelledby", "lootFilterTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="lootFilterTitle" class="window-banner"><span>Loot Filter</span></h2></header>`
    + `<div class="loot-filter-slots" role="group" aria-label="Slots you pick up"></div>`
    + `<p class="loot-filter-hint">Off = never drops, on every map.</p>`
    + `<div class="loot-filter-items-head"><h3 class="loot-filter-map"></h3>`
    + `<span class="loot-filter-bulk"><button type="button" class="loot-filter-all-on">All on</button>`
    + `<button type="button" class="loot-filter-all-off">All off</button></span></div>`
    + `<div class="farm-choices loot-filter-list" role="group"></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite" hidden></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  doc.body.append(dialog);
  const part = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const slots = part(".loot-filter-slots");
  const mapHeading = part(".loot-filter-map");
  const bulk = part(".loot-filter-bulk");
  const allOn = part<HTMLButtonElement>(".loot-filter-all-on");
  const allOff = part<HTMLButtonElement>(".loot-filter-all-off");
  const list = part(".loot-filter-list");
  const status = part(".farm-selection");
  const back = part<HTMLButtonElement>(".window-back-button");

  for (const { slot, label } of LOOT_FILTER_SLOTS) {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "loot-filter-chip";
    chip.dataset.filterId = slotFilterId(slot);
    chip.innerHTML = `<span class="loot-filter-chip-art">${itemArtMarkup(SLOT_ART[slot])}</span><span class="loot-filter-chip-label"></span>`;
    chip.querySelector(".loot-filter-chip-label")!.textContent = label;
    chip.addEventListener("click", () => { void change([slotFilterId(slot)], !listed(slotFilterId(slot))); });
    slots.append(chip);
  }

  /**
   * Entries pressed here that the list from the server may not show yet.
   * A newer press of the same entry replaces an older one, so a late answer
   * to the older press never undoes it. Once the server confirms, the entry
   * only waits for the row to arrive.
   */
  const pending = new Map<string, { off: boolean; press: number; confirmed: boolean }>();
  let presses = 0;
  let items: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const serverList = () => options.port()?.ignoredDrops?.() ?? NOTHING;
  /** Whether an entry (a slot or an item) is off, counting presses still on their way. */
  function listed(filterId: string) {
    const server = serverList().has(filterId);
    const entry = pending.get(filterId);
    if (!entry) return server;
    if (entry.confirmed && entry.off === server) {
      pending.delete(filterId);
      return server;
    }
    return entry.off;
  }
  const filtered = (itemId: string) => isDropFiltered(itemId, listed);
  const slotOff = (itemId: string) => {
    const slot = itemSlot(itemId);
    return Boolean(slot && listed(slotFilterId(slot)));
  };

  function setStatus(text: string) {
    status.textContent = text;
    status.hidden = !text;
  }

  function sync() {
    for (const chip of slots.querySelectorAll<HTMLButtonElement>("[data-filter-id]")) {
      const on = !listed(chip.dataset.filterId!);
      chip.setAttribute("aria-pressed", String(on));
      chip.setAttribute("aria-label", `${chip.textContent}: ${on ? "picked up" : "filtered on every map"}`);
    }
    for (const row of list.querySelectorAll<HTMLButtonElement>("[data-item-id]")) {
      const itemId = row.dataset.itemId!;
      const byslot = slotOff(itemId);
      row.disabled = byslot;
      row.classList.toggle("is-slot-off", byslot);
      row.setAttribute("aria-checked", String(!filtered(itemId)));
      row.querySelector(".loot-filter-switch-label")!.textContent = byslot ? "Slot off" : "Pick up";
    }
    allOn.disabled = !items.some(itemId => listed(itemId));
    allOff.disabled = items.every(itemId => listed(itemId));
    const off = items.filter(filtered).length;
    triggerCount.hidden = off === 0;
    triggerCount.textContent = off ? `· ${off} off` : "";
    trigger.setAttribute("aria-label", off ? `Loot filter, ${off} of this map's drops off` : "Loot filter");
    for (const card of options.cards?.querySelectorAll<HTMLElement>(".map-guide-drop-card[data-item-id]") ?? []) {
      const isFiltered = filtered(card.dataset.itemId!);
      card.classList.toggle("is-filtered", isFiltered);
      let tag = card.querySelector<HTMLElement>(".map-guide-drop-filtered");
      if (isFiltered && !tag) {
        tag = doc.createElement("span");
        tag.className = "map-guide-drop-filtered";
        tag.textContent = "Filtered";
        (card.querySelector(".map-guide-drop-copy") ?? card).append(tag);
      }
      if (!isFiltered) tag?.remove();
    }
  }

  function row(itemId: string) {
    const name = itemInspectionButtonLabel(itemDisplayName(itemId));
    const tier = itemTier(itemId);
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "loot-filter-row";
    button.dataset.itemId = itemId;
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", `Pick up ${name}`);
    button.innerHTML = `<span class="loot-filter-art">${itemArtMarkup(itemId)}</span>`
      + `<span class="loot-filter-copy"><strong></strong><span class="loot-filter-detail"></span></span>`
      + `<span class="loot-filter-switch" aria-hidden="true"><span class="loot-filter-switch-label">Pick up</span><span class="loot-filter-check"></span></span>`;
    const title = button.querySelector<HTMLElement>("strong")!;
    title.textContent = name;
    title.style.color = itemDropColor(itemId);
    button.querySelector(".loot-filter-detail")!.textContent = tier ? `Tier ${tier}` : isCosmeticOnlyItem(itemId) ? "Cosmetic" : "";
    button.addEventListener("click", () => { if (!slotOff(itemId)) void change([itemId], !listed(itemId)); });
    return button;
  }

  async function change(filterIds: readonly string[], off: boolean) {
    const send = options.port()?.setIgnoredDrops;
    if (!send || !filterIds.length) return;
    const press = ++presses;
    for (const filterId of filterIds) pending.set(filterId, { off, press, confirmed: false });
    setStatus("");
    sync();
    let result: Result;
    try { result = await send(filterIds, off); } catch (error) { result = { ok: false, error: String((error as Error)?.message ?? error) }; }
    for (const filterId of filterIds) {
      const entry = pending.get(filterId);
      if (!entry || entry.press !== press) continue;
      if (result?.ok) entry.confirmed = true;
      else pending.delete(filterId);
    }
    if (!result?.ok) setStatus(`Not saved: ${result?.error ?? "NOT CONNECTED"}`);
    sync();
  }

  /** This map's items, all picked up or all off. Only the ones that change are sent. */
  function setAll(off: boolean) {
    void change(items.filter(itemId => listed(itemId) !== off), off);
  }

  /** The map window's render: which map is on screen and what drops there. */
  function setMap(mapName: string, dropItemIds: readonly string[]) {
    items = filterableDrops(dropItemIds);
    mapHeading.textContent = `Items on ${mapName}`;
    trigger.hidden = !options.port()?.setIgnoredDrops;
    bulk.hidden = !items.length;
    list.setAttribute("aria-label", `Items on ${mapName}`);
    list.replaceChildren(...items.map(row));
    if (!items.length) {
      const empty = doc.createElement("p");
      empty.className = "farm-empty";
      empty.textContent = "No items drop on this map.";
      list.append(empty);
    }
    sync();
  }

  function open() {
    if (dialog.open) return;
    // A confirmed press the server never matched was changed elsewhere since; the server's list stands.
    for (const [filterId, entry] of pending) if (entry.confirmed) pending.delete(filterId);
    setStatus("");
    sync();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    timer ??= setInterval(sync, options.tickMs ?? 1_000);
    slots.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  function close() {
    if (timer) clearInterval(timer);
    timer = null;
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    sync(); // The drop cards beneath show what changed.
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", open);
  allOn.addEventListener("click", () => setAll(false));
  allOff.addEventListener("click", () => setAll(true));
  back.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  // One Escape closes this window, not the map window beneath it too.
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  // A tap on the backdrop closes it, as the Auto Farm window does.
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });

  return { setMap, open, close, isOpen: () => dialog.open, refresh: sync };
}
