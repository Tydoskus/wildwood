import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createDropIgnoreSettings, ignorableDrops, ignoreAllState, type IgnoredDropsPort } from "./drop-ignore-settings";
import { mapGuideDrops } from "./map-guide-controller";
import { BASIC_PAPER_HAT, IRON_BOW, SAMURAI_BOW, SAMURAI_HAT, STARTER_BOW, WOODEN_ARMOR } from "../../shared/items";
import { SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID } from "../game/world";

const globals = globalThis as unknown as Record<string, unknown>;
const saved = { document: globals.document, HTMLElement: globals.HTMLElement };
afterEach(() => { Object.assign(globals, saved); vi.useRealTimers(); });

type Deferred = { itemIds: readonly string[]; ignored: boolean; resolve: (result: { ok: boolean; error?: string }) => void };

function harness(initial: string[] = [], options: { withSetter?: boolean } = {}) {
  vi.useFakeTimers();
  const { document, window } = parseHTML(`<html><body><section class="map-guide-drops"><header><h3>Item Drops</h3></header>
    <div id="mapGuideDropItems"></div></section></body></html>`);
  Object.assign(globals, { document, HTMLElement: window.HTMLElement });
  const server = new Set(initial);
  const calls: Deferred[] = [];
  const port: IgnoredDropsPort = {
    ignoredDrops: () => server,
    ...(options.withSetter === false ? {} : {
      setIgnoredDrops: (itemIds: readonly string[], ignored: boolean) =>
        new Promise(resolve => calls.push({ itemIds, ignored, resolve })),
    }),
  };
  const settings = createDropIgnoreSettings({ anchor: document.querySelector("header") as unknown as HTMLElement, port: () => port, root: document as unknown as Document });
  const dialog = document.querySelector("dialog") as unknown as HTMLDialogElement;
  Object.assign(dialog, { showModal() { dialog.setAttribute("open", ""); }, close() { dialog.removeAttribute("open"); } });
  Object.defineProperty(dialog, "open", { get: () => dialog.hasAttribute("open") });
  const trigger = document.querySelector(".map-guide-drop-settings") as unknown as HTMLButtonElement;
  const row = (itemId: string) => document.querySelector(`.drop-ignore-list [data-item-id="${itemId}"]`) as unknown as HTMLButtonElement;
  const all = () => document.querySelector(".drop-ignore-all") as unknown as HTMLButtonElement;
  const checked = (itemId: string) => row(itemId).getAttribute("aria-checked");
  const status = () => document.querySelector(".farm-selection") as unknown as HTMLElement;
  /** The server answers the oldest call: on success its rows change first, as a transaction update does. */
  const answer = async (result: { ok: boolean; error?: string } = { ok: true }) => {
    const call = calls.shift()!;
    if (result.ok) for (const itemId of call.itemIds) call.ignored ? server.add(itemId) : server.delete(itemId);
    call.resolve(result);
    await Promise.resolve(); await Promise.resolve();
  };
  return { document, settings, dialog, trigger, row, all, checked, status, calls, answer, server };
}

it("lists each piece of equipment that drops on the map once, with its tier, and nothing that cannot be offered", () => {
  expect(ignorableDrops([IRON_BOW, BASIC_PAPER_HAT, IRON_BOW, SAMURAI_HAT])).toEqual([IRON_BOW, SAMURAI_HAT]);
  // The Tutorial Forest's paper hat is a cosmetic look, which never makes an offer.
  const forest = ignorableDrops(mapGuideDrops(TUTORIAL_FOREST_MAP_ID).map(drop => drop.itemId));
  expect(forest).toEqual(expect.arrayContaining([STARTER_BOW, WOODEN_ARMOR]));
  expect(forest).not.toContain(BASIC_PAPER_HAT);

  const view = harness();
  view.settings.setMap("Samurai Garden", mapGuideDrops(SAMURAI_GARDEN_MAP_ID).map(drop => drop.itemId));
  expect(view.trigger.hidden).toBe(false);
  expect(view.trigger.textContent).toBe("Ignore drops");
  expect(view.row(SAMURAI_HAT).querySelector("strong")!.textContent).toBe("Samurai Hat");
  expect(view.row(SAMURAI_HAT).querySelector(".drop-ignore-detail")!.textContent).toBe("Tier 7");
  expect(view.row(SAMURAI_BOW).getAttribute("role")).toBe("checkbox");
  expect(view.document.querySelector(".drop-ignore-note")!.textContent)
    .toBe("New items still drop; only copies you already own are ignored.");
});

it("hides the button on a map with nothing to ignore, or when the session cannot save", () => {
  const view = harness();
  view.settings.setMap("Home", []);
  expect(view.trigger.hidden).toBe(true);
  view.settings.open();
  expect(view.dialog.open).toBe(false);
  const old = harness([], { withSetter: false });
  old.settings.setMap("Samurai Garden", [SAMURAI_HAT]);
  expect(old.trigger.hidden).toBe(true);
});

it("switches one item at once, sends it, and keeps it once the server agrees", async () => {
  const view = harness();
  view.settings.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW]);
  view.trigger.click();
  expect(view.dialog.open).toBe(true);
  view.row(SAMURAI_HAT).click();
  expect(view.checked(SAMURAI_HAT)).toBe("true");
  expect(view.checked(SAMURAI_BOW)).toBe("false");
  expect(view.calls.map(call => [call.itemIds, call.ignored])).toEqual([[[SAMURAI_HAT], true]]);
  await view.answer();
  expect(view.checked(SAMURAI_HAT)).toBe("true");
  expect(view.trigger.textContent).toBe("Ignore drops (1)");
  view.row(SAMURAI_HAT).click();
  expect(view.checked(SAMURAI_HAT)).toBe("false");
  expect(view.calls.map(call => [call.itemIds, call.ignored])).toEqual([[[SAMURAI_HAT], false]]);
  await view.answer();
  expect(view.checked(SAMURAI_HAT)).toBe("false");
  expect(view.status().hidden).toBe(true);
});

it("puts a switch back and says why when the server refuses or cannot be reached", async () => {
  const view = harness([SAMURAI_BOW]);
  view.settings.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW]);
  view.settings.open();
  view.row(SAMURAI_HAT).click();
  expect(view.checked(SAMURAI_HAT)).toBe("true");
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.checked(SAMURAI_HAT)).toBe("false");
  expect(view.status().hidden).toBe(false);
  expect(view.status().textContent).toBe("Not saved: NOT CONNECTED");
  view.row(SAMURAI_BOW).click();
  expect(view.status().hidden).toBe(true);
  await view.answer({ ok: false, error: "That item cannot be ignored." });
  expect(view.checked(SAMURAI_BOW)).toBe("true");
  expect(view.status().textContent).toBe("Not saved: That item cannot be ignored.");
});

it("a late answer to an older press never undoes a newer one", async () => {
  const view = harness();
  view.settings.setMap("Samurai Garden", [SAMURAI_HAT]);
  view.settings.open();
  view.row(SAMURAI_HAT).click();
  view.row(SAMURAI_HAT).click();
  expect(view.checked(SAMURAI_HAT)).toBe("false");
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.checked(SAMURAI_HAT)).toBe("false");
  await view.answer();
  expect(view.checked(SAMURAI_HAT)).toBe("false");
});

it("ignores all, shows a mixed state, and sends only what changes", async () => {
  expect(ignoreAllState([], () => false)).toBe("false");
  expect(ignoreAllState(["a", "b"], id => id === "a")).toBe("mixed");
  expect(ignoreAllState(["a", "b"], () => true)).toBe("true");

  const view = harness([SAMURAI_HAT]);
  view.settings.setMap("Samurai Garden", [SAMURAI_HAT, SAMURAI_BOW, IRON_BOW]);
  view.settings.open();
  expect(view.all().getAttribute("aria-checked")).toBe("mixed");
  view.all().click();
  expect(view.calls.map(call => [call.itemIds, call.ignored])).toEqual([[[SAMURAI_BOW, IRON_BOW], true]]);
  expect(view.all().getAttribute("aria-checked")).toBe("true");
  expect([SAMURAI_HAT, SAMURAI_BOW, IRON_BOW].map(view.checked)).toEqual(["true", "true", "true"]);
  await view.answer();
  view.all().click();
  expect(view.calls.map(call => [call.itemIds, call.ignored])).toEqual([[[SAMURAI_HAT, SAMURAI_BOW, IRON_BOW], false]]);
  expect(view.all().getAttribute("aria-checked")).toBe("false");
  // A refusal puts every switch back, and Ignore all with them.
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.all().getAttribute("aria-checked")).toBe("true");
  view.row(IRON_BOW).click();
  expect(view.all().getAttribute("aria-checked")).toBe("mixed");
});

it("follows changes made on another device while open, and closes on Back or Escape without closing the map", () => {
  const view = harness();
  view.settings.setMap("Samurai Garden", [SAMURAI_HAT]);
  view.settings.open();
  view.server.add(SAMURAI_HAT);
  vi.advanceTimersByTime(1_000);
  expect(view.checked(SAMURAI_HAT)).toBe("true");
  (view.document.querySelector(".drop-ignore-sheet .window-back-button") as unknown as HTMLButtonElement).click();
  expect(view.dialog.open).toBe(false);
  view.settings.open();
  const outside = vi.fn();
  view.document.body.addEventListener("keydown", outside);
  const escape = new (view.document.defaultView as any).Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(escape, { key: "Escape" });
  view.dialog.dispatchEvent(escape);
  expect(view.dialog.open).toBe(false);
  expect(outside).not.toHaveBeenCalled();
});
