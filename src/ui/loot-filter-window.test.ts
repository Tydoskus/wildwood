import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createLootFilterWindow, filterableDrops, type LootFilterPort } from "./loot-filter-window";
import { mapGuideDrops } from "./map-guide-controller";
import { BASIC_PAPER_HAT, IRON_BOW, SAMURAI_BOW, SAMURAI_HAT, STARTER_BOW, WOODEN_ARMOR } from "../../shared/items";
import { SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID } from "../game/world";

const globals = globalThis as unknown as Record<string, unknown>;
const saved = { document: globals.document, HTMLElement: globals.HTMLElement };
afterEach(() => { Object.assign(globals, saved); vi.useRealTimers(); });

type Call = { ids: readonly string[]; off: boolean; resolve: (result: { ok: boolean; error?: string }) => void };

function harness(initial: string[] = [], options: { withSetter?: boolean } = {}) {
  vi.useFakeTimers();
  const { document, window } = parseHTML(`<html><body><section class="map-guide-drops"><header><h3>Item Drops</h3></header>
    <div id="mapGuideDropItems">
      <article class="map-guide-drop-card" data-item-id="samurai_hat"><div class="map-guide-drop-copy"><h4>Samurai Hat</h4></div></article>
      <article class="map-guide-drop-card" data-item-id="samurai_bow"><div class="map-guide-drop-copy"><h4>Samurai Bow</h4></div></article>
    </div></section></body></html>`);
  Object.assign(globals, { document, HTMLElement: window.HTMLElement });
  const server = new Set(initial);
  const calls: Call[] = [];
  const port: LootFilterPort = {
    ignoredDrops: () => server,
    ...(options.withSetter === false ? {} : {
      setIgnoredDrops: (ids: readonly string[], off: boolean) => new Promise(resolve => calls.push({ ids, off, resolve })),
    }),
  };
  const filter = createLootFilterWindow({
    anchor: document.querySelector("header") as unknown as HTMLElement,
    cards: document.querySelector("#mapGuideDropItems") as unknown as HTMLElement,
    port: () => port, root: document as unknown as Document,
  });
  const dialog = document.querySelector("dialog") as unknown as HTMLDialogElement;
  Object.assign(dialog, { showModal() { dialog.setAttribute("open", ""); }, close() { dialog.removeAttribute("open"); } });
  Object.defineProperty(dialog, "open", { get: () => dialog.hasAttribute("open") });
  const q = <T = HTMLElement>(selector: string) => document.querySelector(selector) as unknown as T;
  const trigger = q<HTMLButtonElement>(".map-guide-loot-filter");
  const row = (itemId: string) => q<HTMLButtonElement>(`.loot-filter-list [data-item-id="${itemId}"]`);
  const chip = (slot: string) => q<HTMLButtonElement>(`.loot-filter-chip[data-filter-id="slot:${slot}"]`);
  const pickedUp = (itemId: string) => row(itemId).getAttribute("aria-checked");
  const card = (itemId: string) => q<HTMLElement>(`.map-guide-drop-card[data-item-id="${itemId}"]`);
  /** The server answers the oldest call: on success its rows change first, as a transaction update does. */
  const answer = async (result: { ok: boolean; error?: string } = { ok: true }) => {
    const call = calls.shift()!;
    if (result.ok) for (const id of call.ids) call.off ? server.add(id) : server.delete(id);
    call.resolve(result);
    await Promise.resolve(); await Promise.resolve();
  };
  const sent = () => calls.map(call => [[...call.ids], call.off]);
  return { document, filter, dialog, trigger, row, chip, pickedUp, card, q, calls, sent, answer, server };
}

it("lists every item that drops on the map once, cosmetic looks included, never starter items", () => {
  expect(filterableDrops([IRON_BOW, BASIC_PAPER_HAT, IRON_BOW, SAMURAI_HAT])).toEqual([IRON_BOW, BASIC_PAPER_HAT, SAMURAI_HAT]);
  expect(filterableDrops(["starter_stone", "wooden_sword"])).toEqual([]);
  const forest = filterableDrops(mapGuideDrops(TUTORIAL_FOREST_MAP_ID).map(drop => drop.itemId));
  expect(forest).toEqual(expect.arrayContaining([STARTER_BOW, WOODEN_ARMOR, BASIC_PAPER_HAT]));

  const view = harness();
  view.filter.setMap("Samurai Garden", mapGuideDrops(SAMURAI_GARDEN_MAP_ID).map(drop => drop.itemId));
  expect(view.trigger.hidden).toBe(false);
  expect(view.trigger.textContent).toBe("Loot filter");
  expect(view.q(".loot-filter-map").textContent).toBe("Items on Samurai Garden");
  expect(view.q("#lootFilterTitle").textContent).toBe("Loot Filter");
  expect(view.q(".loot-filter-hint").textContent).toBe("Off = never drops, on every map.");
  expect(view.row(SAMURAI_HAT).querySelector("strong")!.textContent).toBe("Samurai Hat");
  expect(view.row(SAMURAI_HAT).querySelector(".loot-filter-detail")!.textContent).toBe("Tier 7");
  expect(view.pickedUp(SAMURAI_HAT)).toBe("true");
  expect(view.row(SAMURAI_HAT).querySelector(".loot-filter-switch-label")!.textContent).toBe("Pick up");
  expect([...view.document.querySelectorAll(".loot-filter-chip")].map(chip => [chip.textContent, chip.getAttribute("aria-pressed")]))
    .toEqual([["Weapons", "true"], ["Armor", "true"], ["Helmets", "true"], ["Boots", "true"]]);
  expect(view.document.body.textContent).not.toContain("New items still drop");
});

it("has no button when the session cannot save", () => {
  const old = harness([], { withSetter: false });
  old.filter.setMap("Samurai Garden", [SAMURAI_HAT]);
  expect(old.trigger.hidden).toBe(true);
});

it("turns a whole slot off with one chip, and shows that slot's rows as Slot off", async () => {
  const view = harness();
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW]);
  view.filter.open();
  view.chip("HEAD").click();
  expect(view.sent()).toEqual([[["slot:HEAD"], true]]);
  expect(view.chip("HEAD").getAttribute("aria-pressed")).toBe("false");
  expect(view.row(SAMURAI_HAT).disabled).toBe(true);
  expect(view.row(SAMURAI_HAT).classList.contains("is-slot-off")).toBe(true);
  expect(view.row(SAMURAI_HAT).querySelector(".loot-filter-switch-label")!.textContent).toBe("Slot off");
  expect(view.pickedUp(SAMURAI_HAT)).toBe("false");
  expect(view.pickedUp(SAMURAI_BOW)).toBe("true");
  await view.answer();
  // A disabled row cannot be switched while its slot is off.
  view.row(SAMURAI_HAT).click();
  expect(view.calls).toHaveLength(0);
  view.chip("HEAD").click();
  expect(view.sent()).toEqual([[["slot:HEAD"], false]]);
  expect(view.row(SAMURAI_HAT).disabled).toBe(false);
  expect(view.pickedUp(SAMURAI_HAT)).toBe("true");
});

it("keeps an item's own switch under its slot: back on with the slot, it is still off if it was", () => {
  const view = harness([SAMURAI_HAT, "slot:HEAD"]);
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT]);
  expect(view.pickedUp(SAMURAI_HAT)).toBe("false");
  expect(view.row(SAMURAI_HAT).disabled).toBe(true);
  view.server.delete("slot:HEAD");
  view.filter.refresh();
  expect(view.row(SAMURAI_HAT).disabled).toBe(false);
  expect(view.pickedUp(SAMURAI_HAT)).toBe("false");
  expect(view.row(SAMURAI_HAT).querySelector(".loot-filter-switch-label")!.textContent).toBe("Pick up");
});

it("switches one item at once and puts it back with a reason when the server refuses", async () => {
  const view = harness();
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW]);
  view.filter.open();
  view.row(SAMURAI_BOW).click();
  expect(view.pickedUp(SAMURAI_BOW)).toBe("false");
  expect(view.sent()).toEqual([[[SAMURAI_BOW], true]]);
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.pickedUp(SAMURAI_BOW)).toBe("true");
  expect(view.q(".farm-selection").hidden).toBe(false);
  expect(view.q(".farm-selection").textContent).toBe("Not saved: NOT CONNECTED");
  view.row(SAMURAI_BOW).click();
  expect(view.q(".farm-selection").hidden).toBe(true);
  await view.answer();
  expect(view.pickedUp(SAMURAI_BOW)).toBe("false");
  expect(view.q(".map-guide-loot-filter-count").textContent).toBe("· 1 off");
  expect(view.q(".map-guide-loot-filter-count").hidden).toBe(false);
});

it("a late answer to an older press never undoes a newer one", async () => {
  const view = harness();
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT]);
  view.filter.open();
  view.row(SAMURAI_HAT).click();
  view.row(SAMURAI_HAT).click();
  expect(view.pickedUp(SAMURAI_HAT)).toBe("true");
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.pickedUp(SAMURAI_HAT)).toBe("true");
  await view.answer();
  expect(view.pickedUp(SAMURAI_HAT)).toBe("true");
});

it("All off and All on set this map's items, sending only what changes", async () => {
  const view = harness([SAMURAI_HAT]);
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW, IRON_BOW]);
  view.filter.open();
  const allOn = view.q<HTMLButtonElement>(".loot-filter-all-on");
  const allOff = view.q<HTMLButtonElement>(".loot-filter-all-off");
  expect([allOn.disabled, allOff.disabled]).toEqual([false, false]);
  allOff.click();
  expect(view.sent()).toEqual([[[SAMURAI_BOW, IRON_BOW], true]]);
  expect([SAMURAI_HAT, SAMURAI_BOW, IRON_BOW].map(view.pickedUp)).toEqual(["false", "false", "false"]);
  expect(allOff.disabled).toBe(true);
  await view.answer();
  allOn.click();
  expect(view.sent()).toEqual([[[SAMURAI_HAT, SAMURAI_BOW, IRON_BOW], false]]);
  expect(allOn.disabled).toBe(true);
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect([SAMURAI_HAT, SAMURAI_BOW, IRON_BOW].map(view.pickedUp)).toEqual(["false", "false", "false"]);
  // The slot chips are not this map's to change.
  expect(view.sent()).toEqual([]);
  expect(view.server.has("slot:HAND")).toBe(false);
});

it("tags the map's drop cards Filtered, by slot or by item, and counts them on the button", async () => {
  const view = harness(["slot:HEAD"]);
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW]);
  expect(view.card(SAMURAI_HAT).classList.contains("is-filtered")).toBe(true);
  expect(view.card(SAMURAI_HAT).querySelector(".map-guide-drop-filtered")!.textContent).toBe("Filtered");
  expect(view.card(SAMURAI_BOW).querySelector(".map-guide-drop-filtered")).toBeNull();
  expect(view.q(".map-guide-loot-filter-count").textContent).toBe("· 1 off");
  view.filter.open();
  view.row(SAMURAI_BOW).click();
  await view.answer();
  expect(view.card(SAMURAI_BOW).classList.contains("is-filtered")).toBe(true);
  expect(view.q(".map-guide-loot-filter-count").textContent).toBe("· 2 off");
  view.chip("HEAD").click();
  await view.answer();
  expect(view.card(SAMURAI_HAT).classList.contains("is-filtered")).toBe(false);
  expect(view.card(SAMURAI_HAT).querySelector(".map-guide-drop-filtered")).toBeNull();
  expect(view.card(SAMURAI_HAT).querySelectorAll(".map-guide-drop-filtered")).toHaveLength(0);
});

it("follows changes made on another device while open, and closes on Back or Escape without closing the map", () => {
  const view = harness();
  view.filter.setMap("Samurai Garden", [SAMURAI_HAT]);
  view.filter.open();
  view.server.add("slot:HEAD");
  vi.advanceTimersByTime(1_000);
  expect(view.chip("HEAD").getAttribute("aria-pressed")).toBe("false");
  view.q<HTMLButtonElement>(".loot-filter-sheet .window-back-button").click();
  expect(view.dialog.open).toBe(false);
  view.filter.open();
  const outside = vi.fn();
  view.document.body.addEventListener("keydown", outside);
  const escape = new (view.document.defaultView as any).Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(escape, { key: "Escape" });
  view.dialog.dispatchEvent(escape);
  expect(view.dialog.open).toBe(false);
  expect(outside).not.toHaveBeenCalled();
});
