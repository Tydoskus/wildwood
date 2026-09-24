import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createEquipmentOfferPrompt, type EquipmentOfferPort } from "./equipment-offer-prompt";

const globals = globalThis as unknown as Record<string, unknown>;
const saved = { document: globals.document, HTMLElement: globals.HTMLElement };
afterEach(() => { Object.assign(globals, saved); vi.useRealTimers(); });

const NONE = { arrowStorm: 0, ricochet: 0, piercingShot: 0 };
type Offer = { id: bigint; itemId: string; roll: typeof NONE; expiresAtMs: number };

function harness(offers: Offer[], options: { itemIds?: string[]; copies?: { id: bigint; itemId: string }[]; ready?: boolean } = {}) {
  vi.useFakeTimers();
  const { document, window } = parseHTML(`<html><body><button id="inventoryBtn"></button>
    <section class="bag-section"><div class="inventory-filters"></div><div id="inventoryItems"></div></section></body></html>`);
  Object.assign(globals, { document, HTMLElement: window.HTMLElement });
  let now = 1_000;
  const answers: Array<[bigint, boolean]> = [];
  let refusal: string | null = null;
  const list = [...offers];
  const coop: EquipmentOfferPort = {
    equipmentOffers: () => list,
    equipmentCopies: () => options.copies ?? [],
    bowSkills: itemId => itemId === "iron_bow" ? { arrowStorm: 2.4, ricochet: 0, piercingShot: 0 } : null,
    serverNowMs: () => now,
    resolveEquipmentOffer: async (id, keep) => {
      if (refusal) return { ok: false, error: refusal };
      answers.push([id, keep]);
      list.splice(list.findIndex(offer => offer.id === id), 1);
      return { ok: true };
    },
  };
  const messages: string[] = [];
  const renderInventory = vi.fn();
  const prompt = createEquipmentOfferPrompt({
    coop, inventory: { itemIds: options.itemIds ?? ["iron_bow", "samurai_hat"] }, renderInventory,
    showMessage: message => messages.push(message), ready: () => options.ready ?? true, root: document as unknown as Document,
  });
  const card = document.querySelector(".equipment-offer") as HTMLElement;
  const text = (selector: string) => (card.querySelector(selector)?.textContent ?? "").trim();
  const lines = (which: "is-yours" | "is-new") => [...card.querySelectorAll(`.${which} .equipment-offer-lines span`)].map(span => span.textContent);
  const click = (selector: string) => (card.querySelector(selector) as HTMLButtonElement).click();
  return {
    document, window, prompt, card, text, lines, click, answers, messages, renderInventory, list,
    setNow: (ms: number) => { now = ms; }, refuse: (message: string | null) => { refusal = message; },
    badge: () => document.querySelector(".equipment-offer-badge") as HTMLElement,
    review: () => document.querySelector(".equipment-offer-review") as HTMLButtonElement,
  };
}

const bowOffer = (id: bigint, roll = { arrowStorm: 0, ricochet: 3.1, piercingShot: 0 }): Offer =>
  ({ id, itemId: "iron_bow", roll, expiresAtMs: 301_000 });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it("shows the new copy's skills beside the one the player has, with the time left", () => {
  const view = harness([bowOffer(4n)]);
  expect(view.card.hidden).toBe(false);
  expect(view.text(".equipment-offer-name")).toBe("Iron Bow");
  expect(view.text(".equipment-offer-note")).toBe("You already have this");
  expect(view.lines("is-yours")).toEqual(["Arrow Storm 2.4%"]);
  expect(view.lines("is-new")).toEqual(["Ricochet 3.1%"]);
  expect(view.text(".equipment-offer-timer")).toBe("Ignored in 5:00");
  view.setNow(61_000);
  vi.advanceTimersByTime(1_000);
  expect(view.text(".equipment-offer-timer")).toBe("Ignored in 4:00");
  expect(view.badge().textContent).toBe("1");
});

it("says No skills for a roll without any, and compares nothing for gear without rolls", () => {
  const view = harness([bowOffer(1n, NONE), { id: 2n, itemId: "samurai_hat", roll: NONE, expiresAtMs: 301_000 }],
    { copies: [{ id: 9n, itemId: "samurai_hat" }] });
  expect(view.lines("is-new")).toEqual(["No skills"]);
  expect(view.text(".equipment-offer-timer")).toBe("Ignored in 5:00 · 1 of 2");
  view.click(".equipment-offer-ignore");
  return flush().then(() => {
    expect(view.answers).toEqual([[1n, false]]);
    expect(view.text(".equipment-offer-name")).toBe("Samurai Hat");
    expect(view.text(".equipment-offer-note")).toBe("You already have 2 of these");
    expect((view.card.querySelector(".equipment-offer-compare") as HTMLElement).hidden).toBe(true);
  });
});

it("keeps, reports a full bag without losing the offer, and moves on to the next", async () => {
  const view = harness([bowOffer(1n), bowOffer(2n)]);
  view.refuse("Your bag is full. Free a slot to keep it.");
  view.click(".equipment-offer-keep");
  await flush();
  expect(view.messages).toEqual(["Your bag is full. Free a slot to keep it."]);
  expect(view.card.hidden).toBe(false);
  expect(view.text(".equipment-offer-timer")).toContain("1 of 2");
  view.refuse(null);
  view.click(".equipment-offer-keep");
  await flush();
  expect(view.answers).toEqual([[1n, true]]);
  expect(view.messages.at(-1)).toBe("KEPT · ADDED TO YOUR BAG");
  expect(view.text(".equipment-offer-timer")).toBe("Ignored in 5:00");
  view.click(".equipment-offer-keep");
  await flush();
  expect(view.card.hidden).toBe(true);
  expect(view.badge().hidden).toBe(true);
  expect(view.review().hidden).toBe(true);
});

it("closes for later on Escape, stays closed, and comes back from the inventory", () => {
  const view = harness([bowOffer(1n)]);
  const beneath = vi.fn();
  view.document.addEventListener("keydown", beneath);
  view.document.dispatchEvent(Object.assign(new (view.window as any).Event("keydown"), { key: "Escape" }));
  expect(view.card.hidden).toBe(true);
  expect(beneath).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5_000);
  expect(view.card.hidden).toBe(true);
  expect(view.badge().textContent).toBe("1");
  expect(view.review().hidden).toBe(false);
  expect(view.review().textContent).toBe("1 duplicate item waiting · Review");
  // A new drop pops up by itself; the one closed earlier still waits behind it.
  view.list.push(bowOffer(2n));
  vi.advanceTimersByTime(1_000);
  expect(view.card.hidden).toBe(false);
  expect(view.text(".equipment-offer-timer")).toContain("2 of 2");
  view.click(".equipment-offer-close");
  view.review().click();
  expect(view.card.hidden).toBe(false);
  expect(view.text(".equipment-offer-timer")).toContain("1 of 2");
});

it("puts off every waiting offer when closed, not just the one on show", () => {
  const view = harness([bowOffer(1n), bowOffer(2n)]);
  view.click(".equipment-offer-close");
  vi.advanceTimersByTime(3_000);
  expect(view.card.hidden).toBe(true);
  expect(view.badge().textContent).toBe("2");
});

it("drops an offer whose time ran out, and waits for the world before popping up", () => {
  const view = harness([bowOffer(1n)], { ready: false });
  expect(view.card.hidden).toBe(true);
  expect(view.badge().textContent).toBe("1");
  view.setNow(301_000);
  vi.advanceTimersByTime(1_000);
  expect(view.badge().hidden).toBe(true);
});

it("redraws the inventory when the kept copies change", () => {
  const copies: { id: bigint; itemId: string }[] = [];
  const view = harness([], { copies });
  view.prompt.refresh();
  expect(view.renderInventory).not.toHaveBeenCalled();
  expect(view.card.hidden).toBe(true);
  copies.push({ id: 3n, itemId: "iron_bow" });
  view.prompt.refresh();
  view.prompt.refresh();
  expect(view.renderInventory).toHaveBeenCalledOnce();
});
