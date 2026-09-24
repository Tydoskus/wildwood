import { isDuplicateOfferItem } from "../../shared/equipment-copies";
import { itemTier } from "../../shared/item-tier";
import { itemDisplayName } from "../../shared/items";
import { itemArtMarkup } from "../game/item-presentation";
import { itemDropColor } from "./item-drop-color";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

type Result = { ok: boolean; error?: string } | undefined;

/** What the window needs from the coop session. Both are optional so an older API simply has no Ignore drops button. */
export type IgnoredDropsPort = {
  ignoredDrops?: () => ReadonlySet<string>;
  setIgnoredDrops?: (itemIds: readonly string[], ignored: boolean) => Promise<Result>;
};

export type DropIgnoreSettingsOptions = {
  port: () => IgnoredDropsPort | null | undefined;
  /** The map window's Item Drops header; the button that opens this window goes at its end. */
  anchor: HTMLElement;
  root?: Document;
  tickMs?: number;
};

const NOTE = "New items still drop; only copies you already own are ignored.";
const NOTHING = new Set<string>();

/**
 * The items a map's drop list can ignore, once each, in the list's order:
 * equipment a duplicate drop would offer. Cosmetic looks and permanent items
 * never make an offer, so there is nothing to ignore for them.
 */
export function ignorableDrops(itemIds: readonly string[]) {
  return [...new Set(itemIds)].filter(itemId => isDuplicateOfferItem(itemId));
}

/** The "Ignore all" checkbox: on when every item is, off when none is, mixed between. */
export function ignoreAllState(itemIds: readonly string[], isIgnored: (itemId: string) => boolean): "true" | "false" | "mixed" {
  const count = itemIds.filter(isIgnored).length;
  return count === 0 ? "false" : count === itemIds.length ? "true" : "mixed";
}

/**
 * Ignore drops, opened from the map window.
 *
 * Lists the equipment that drops on the map being viewed, each with an
 * Ignore switch, and one "Ignore all" above them. The account's list lives on
 * the server, so it follows the player to other devices. A switch changes the
 * moment it is pressed and the server is told; if the server refuses or
 * cannot be reached the switch goes back and the window says why.
 */
export function createDropIgnoreSettings(options: DropIgnoreSettingsOptions) {
  const doc = options.root ?? document;
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "map-guide-drop-settings";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.hidden = true;
  options.anchor.append(trigger);

  const dialog = doc.createElement("dialog");
  dialog.className = "farm-sheet drop-ignore-sheet";
  dialog.setAttribute("aria-labelledby", "dropIgnoreTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="dropIgnoreTitle" class="window-banner"><span>Ignore Drops</span></h2></header>`
    + `<p class="farm-map"></p>`
    + `<div class="drop-ignore-all-wrap"><button type="button" role="checkbox" class="drop-ignore-row drop-ignore-all" aria-checked="false">`
    + `<span class="drop-ignore-copy"><strong>Ignore all</strong><span class="drop-ignore-detail">Every item on this map</span></span>`
    + `<span class="drop-ignore-toggle" aria-hidden="true"><span class="drop-ignore-switch"></span></span></button></div>`
    + `<div class="farm-choices drop-ignore-list" role="group" aria-label="Items that drop on this map"></div>`
    + `<footer class="farm-footer"><p class="drop-ignore-note">${NOTE}</p>`
    + `<p class="farm-selection" aria-live="polite" hidden></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  doc.body.append(dialog);
  const part = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const mapLabel = part(".farm-map");
  const allWrap = part(".drop-ignore-all-wrap");
  const all = part<HTMLButtonElement>(".drop-ignore-all");
  const list = part(".drop-ignore-list");
  const status = part(".farm-selection");
  const back = part<HTMLButtonElement>(".window-back-button");

  /**
   * Switches pressed here that the list from the server may not show yet.
   * A newer press of the same item replaces an older one, so a late answer
   * to the older press never undoes it. Once the server confirms, the entry
   * only waits for the row to arrive.
   */
  const pending = new Map<string, { value: boolean; press: number; confirmed: boolean }>();
  let presses = 0;
  let items: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const serverList = () => options.port()?.ignoredDrops?.() ?? NOTHING;
  function isIgnored(itemId: string) {
    const server = serverList().has(itemId);
    const entry = pending.get(itemId);
    if (!entry) return server;
    if (entry.confirmed && entry.value === server) {
      pending.delete(itemId);
      return server;
    }
    return entry.value;
  }

  function setStatus(text: string) {
    status.textContent = text;
    status.hidden = !text;
  }

  function sync() {
    for (const row of list.querySelectorAll<HTMLButtonElement>("[data-item-id]")) {
      row.setAttribute("aria-checked", String(isIgnored(row.dataset.itemId!)));
    }
    all.setAttribute("aria-checked", ignoreAllState(items, isIgnored));
    const count = items.filter(isIgnored).length;
    trigger.textContent = count ? `Ignore drops (${count})` : "Ignore drops";
  }

  function row(itemId: string) {
    const name = itemInspectionButtonLabel(itemDisplayName(itemId));
    const tier = itemTier(itemId);
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "drop-ignore-row";
    button.dataset.itemId = itemId;
    button.setAttribute("role", "checkbox");
    button.setAttribute("aria-label", `Ignore ${name}`);
    button.innerHTML = `<span class="drop-ignore-art">${itemArtMarkup(itemId)}</span>`
      + `<span class="drop-ignore-copy"><strong></strong><span class="drop-ignore-detail"></span></span>`
      + `<span class="drop-ignore-toggle" aria-hidden="true"><span class="drop-ignore-label">Ignore</span><span class="drop-ignore-switch"></span></span>`;
    const title = button.querySelector<HTMLElement>("strong")!;
    title.textContent = name;
    title.style.color = itemDropColor(itemId);
    button.querySelector(".drop-ignore-detail")!.textContent = tier ? `Tier ${tier}` : "";
    button.addEventListener("click", () => { void change([itemId], !isIgnored(itemId)); });
    return button;
  }

  async function change(itemIds: readonly string[], value: boolean) {
    const send = options.port()?.setIgnoredDrops;
    if (!send || !itemIds.length) return;
    const press = ++presses;
    for (const itemId of itemIds) pending.set(itemId, { value, press, confirmed: false });
    setStatus("");
    sync();
    let result: Result;
    try { result = await send(itemIds, value); } catch (error) { result = { ok: false, error: String((error as Error)?.message ?? error) }; }
    for (const itemId of itemIds) {
      const entry = pending.get(itemId);
      if (!entry || entry.press !== press) continue;
      if (result?.ok) entry.confirmed = true;
      else pending.delete(itemId);
    }
    if (!result?.ok) setStatus(`Not saved: ${result?.error ?? "NOT CONNECTED"}`);
    sync();
  }

  /** Every item on when any is off; every item off when all are on. Only the ones that change are sent. */
  function toggleAll() {
    const ignoreEvery = ignoreAllState(items, isIgnored) !== "true";
    void change(items.filter(itemId => isIgnored(itemId) !== ignoreEvery), ignoreEvery);
  }

  /** The map window's render: which map is on screen and what drops there. */
  function setMap(mapName: string, dropItemIds: readonly string[]) {
    items = ignorableDrops(dropItemIds);
    mapLabel.textContent = mapName;
    trigger.hidden = !items.length || !options.port()?.setIgnoredDrops;
    allWrap.hidden = !items.length;
    list.replaceChildren(...items.map(row));
    if (!items.length) close();
    sync();
  }

  function open() {
    if (dialog.open || !items.length) return;
    // A confirmed switch the server never matched was changed elsewhere since; the server's list stands.
    for (const [itemId, entry] of pending) if (entry.confirmed) pending.delete(itemId);
    setStatus("");
    sync();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    timer ??= setInterval(sync, options.tickMs ?? 1_000);
    all.focus({ preventScroll: true });
  }

  function close() {
    if (timer) clearInterval(timer);
    timer = null;
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", open);
  all.addEventListener("click", toggleAll);
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
