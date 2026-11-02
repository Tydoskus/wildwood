import { EXCHANGE_FEE_PERCENT, EXCHANGE_NAME, EXCHANGE_SUPPORTER_OFFERS, exchangeOfferSlots, isExchangeGear, isExchangeResource } from "../../shared/exchange";
import { itemDisplayName } from "../../shared/items";
import { ORE_ORDER } from "../../shared/ore-bag";
import { REFINE_ORES, type OreId } from "../../shared/refine";
import { formatCompactNumber } from "../../shared/compact-number";
import { gradeShopSalePrice } from "../../shared/grade-shop";
import { foldPlayerName, searchPlayerDirectory } from "../../shared/player-search";
import { EXCHANGE_WATCHED_ITEMS } from "../coop/services/exchange-service";
import { weaponSkillLines, type WeaponSkillRoll } from "../../shared/weapon-skills";
import type { ExchangeCollectRow, ExchangeListingRow, ExchangeOfferRow, ExchangePriceRow, ExchangeResult } from "../coop/services/exchange-service";
import { appendBagTileContents } from "./bag-item-tile";
import { gameConfirm } from "./confirm-dialog";
import { itemInspectionButtonLabel, type ItemInspectionAction } from "./item-inspection-controller";
import { oreIconSource } from "./ore-icon";
import { autoNameColor } from "./player-identity";
import { nameColorHex } from "../../shared/name-colors";

type Side = "buy" | "sell";
type GearPiece = { itemId: string; copyId: bigint; refine: number; roll: WeaponSkillRoll | null };
type Draft = { buy: boolean; itemId: string; copyId?: bigint; refine: number; quantity: number; max: number; price: bigint };
type Screen = { kind: "slots" } | { kind: "pick"; side: Side } | { kind: "item"; itemId: string } | { kind: "offer"; draft: Draft };
/** The most seller rows one screen draws: the cheapest. */
const SHOWN_SELLERS = 30;

export type ExchangeDeps = {
  inTown: () => boolean;
  clearInput?: () => void;
  showMessage: (text: string, color: string) => void;
  identity: () => string;
  /** Patreon supporters get more slots (exchangeOfferSlots). */
  supporter: () => boolean;
  gold: () => bigint;
  ores: () => Readonly<Partial<Record<OreId, number>>>;
  /** Gear in the bag that could be listed: not worn, not locked. */
  gear: () => GearPiece[];
  follow: (on: boolean) => void;
  /** Follows the sellers of these items only; [] follows none. */
  watch: (itemIds: readonly string[]) => void;
  /** The price table: a row per item on the market. */
  prices: () => ExchangePriceRow[];
  /** The followed items' offers and listings. */
  offers: () => ExchangeOfferRow[];
  listings: () => ExchangeListingRow[];
  myOffers: () => ExchangeOfferRow[];
  myListings: () => ExchangeListingRow[];
  collect: () => readonly ExchangeCollectRow[];
  place: (buy: boolean, itemId: string, quantity: number, price: bigint) => Promise<ExchangeResult>;
  cancelOffer: (id: bigint) => Promise<ExchangeResult>;
  list: (itemId: string, copyId: bigint, price: bigint) => Promise<ExchangeResult>;
  buyListing: (id: bigint) => Promise<ExchangeResult>;
  cancelListing: (id: bigint) => Promise<ExchangeResult>;
  collectAll: () => Promise<ExchangeResult>;
  /** Opens the item window: stats, skills and refine, with any actions (Buy) under them. */
  inspect?: (itemId: string, refine: number, roll: WeaponSkillRoll | null, actions?: ItemInspectionAction[]) => void;
};

const short = (value: bigint) => value < 100_000n ? value.toLocaleString("en-US") : formatCompactNumber(Number(value));
function rollFrom(json: string): WeaponSkillRoll | null {
  try { return JSON.parse(json) as WeaponSkillRoll; } catch { return null; }
}
const itemName = (itemId: string) => isExchangeResource(itemId) ? REFINE_ORES[itemId].name : itemInspectionButtonLabel(itemDisplayName(itemId));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** An item as the bag draws it: the ore's icon, or the gear's art with its ★ refine. */
function tile(itemId: string, refine = 0, chip = "", onPick?: () => void) {
  const button = el("button", "inventory-item is-filled exchange-tile");
  button.type = "button";
  button.setAttribute("aria-label", `${itemName(itemId)}${chip ? `, ${chip}` : ""}`);
  if (isExchangeResource(itemId)) {
    const art = el("span", "inventory-item-art-wrap"), image = el("span", "inventory-item-art");
    image.style.backgroundImage = `url(${oreIconSource(itemId)})`;
    art.append(image);
    button.append(art);
  } else appendBagTileContents(button, itemId, { refine, stats: false });
  if (chip) button.append(el("span", "exchange-chip", chip));
  if (onPick) button.addEventListener("click", onPick); else button.tabIndex = -1;
  return button;
}

const COIN = `<svg class="exchange-coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#e3b23c" stroke="#7a4f12" stroke-width="1.5"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#a8741d" stroke-width="1.2"/><path d="M6.5 7.5a4.5 4.5 0 0 1 3-2.5" fill="none" stroke="#fff3c4" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const SEARCH = `<svg class="exchange-search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** A gold amount with the HUD's coin. */
function goldChip(amount: bigint, className = "exchange-gold") {
  const chip = el("span", className);
  chip.innerHTML = COIN;
  chip.append(el("span", "", amount.toLocaleString("en-US")));
  return chip;
}

/**
 * The Trade Chrysanthemum's window, laid out like a grand exchange. Each screen has its own shape: the offer slots
 * as cards, Buy as a search with the market in grids and results in rows, Sell as the bag's tradeable things, and
 * an offer as one item with its price. Few words; figures in monospace; the HUD's gold coin.
 */
export function createExchangeController(deps: ExchangeDeps) {
  const dialog = el("dialog", "exchange-sheet");
  dialog.setAttribute("aria-labelledby", "exchangeTitle");
  dialog.innerHTML = `<header class="exchange-head"><h2 id="exchangeTitle" class="window-banner window-banner--gold"><span>Trade</span></h2></header>`
    + `<div class="exchange-body"></div>`
    + `<footer class="exchange-foot"><button type="button" class="window-back-button">Back</button></footer>`;
  dialog.setAttribute("aria-label", EXCHANGE_NAME);
  document.body.append(dialog);
  const body = dialog.querySelector<HTMLElement>(".exchange-body")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  let screen: Screen = { kind: "slots" }, busy = false, rendered = "", query = "";

  const mine = (identity: string) => identity === deps.identity();
  const myOffers = deps.myOffers, myListings = deps.myListings;
  const priceOf = (itemId: string) => deps.prices().find(row => row.itemId === itemId);
  const best = (itemId: string, buy: boolean) => (buy ? priceOf(itemId)?.highestBid : priceOf(itemId)?.lowestAsk) ?? null;
  const last = (itemId: string) => priceOf(itemId)?.lastPrice ?? null;

  async function act(run: () => Promise<ExchangeResult>, done: string | (() => string), after: Screen = { kind: "slots" }) {
    if (busy) return;
    busy = true; render(true);
    try {
      const result = await run();
      deps.showMessage(result.ok ? (typeof done === "string" ? done : done()) : result.error ?? "Not Connected", result.ok ? "#ffd75e" : "#ff9b91");
      if (result.ok) screen = after;
    } finally { busy = false; if (dialog.open) render(true); }
  }
  const go = (next: Screen) => { screen = next; render(true); };

  /** A screen's own heading: its name, and what matters beside it (slots used, or gold to spend). */
  function heading(title: string, aside?: HTMLElement) {
    const head = el("div", "exchange-screen-head");
    head.append(el("h3", "", title), ...(aside ? [aside] : []));
    return head;
  }
  const section = (title: string) => el("h4", "exchange-section", title);

  function slot(fill: { itemId: string; refine: number; buy: boolean; filled: number; quantity: number; price: bigint; cancel: () => void; roll?: WeaponSkillRoll | null } | null) {
    const card = el("div", `exchange-slot${fill ? " is-filled" : ""}`);
    if (!fill) { card.textContent = "Empty"; return card; }
    card.classList.add(fill.buy ? "is-buy" : "is-sell");
    const bar = el("span", "exchange-progress");
    bar.style.setProperty("--done", String(fill.quantity ? fill.filled / fill.quantity : 0));
    const cancel = el("button", "exchange-step exchange-cancel", "Cancel");
    cancel.type = "button"; cancel.disabled = busy;
    cancel.addEventListener("click", fill.cancel);
    const tag = el("span", "exchange-tag", fill.buy ? "Buying" : "Selling");
    tag.append(el("span", "exchange-count", ` ${short(BigInt(fill.filled))}/${short(BigInt(fill.quantity))}`));
    // Gear on sale opens the item window, so its stats are there to remember.
    const gear = !isExchangeResource(fill.itemId) && deps.inspect;
    card.append(tag, tile(fill.itemId, fill.refine, "", gear ? () => deps.inspect!(fill.itemId, fill.refine, fill.roll ?? null) : undefined),
      el("span", "exchange-price", `${short(fill.price)} ea`), bar, cancel);
    card.setAttribute("aria-label", `${fill.buy ? "Buying" : "Selling"} ${itemName(fill.itemId)}, ${fill.filled} of ${fill.quantity} done, ${fill.price} gold each.`);
    return card;
  }

  function slotsScreen() {
    const usable = exchangeOfferSlots(deps.supporter()), used = myOffers().length + myListings().length;
    // Buy and Sell are always here: browsing, searching and buying gear never need a free slot.
    const sides = el("div", "exchange-sides");
    for (const side of ["buy", "sell"] as const) {
      const button = el("button", `exchange-side is-${side}`, side === "buy" ? "Buy" : "Sell");
      button.type = "button"; button.disabled = busy;
      button.addEventListener("click", () => { query = ""; go({ kind: "pick", side }); });
      sides.append(button);
    }
    const parts: HTMLElement[] = [sides];
    const box = deps.collect();
    if (box.length) {
      const strip = el("div", "exchange-collect");
      const items = el("div", "exchange-collect-items");
      for (const item of box.slice(0, 5)) items.append(tile(item.itemId, item.refine, item.count > 0 ? short(BigInt(item.count)) : ""));
      const take = el("button", "exchange-confirm", "Collect");
      take.type = "button"; take.disabled = busy;
      take.addEventListener("click", () => void act(deps.collectAll, "Collected"));
      strip.append(items, take);
      parts.push(strip);
    }
    const grid = el("div", "exchange-slots");
    const cancel = (ask: string, run: () => Promise<ExchangeResult>) => async () => {
      if (busy) return;
      if (await gameConfirm({ message: ask, confirmLabel: "Cancel Offer", cancelLabel: "Keep" })) await act(run, "Cancelled");
    };
    for (const offer of myOffers()) {
      grid.append(slot({ itemId: offer.itemId, refine: 0, buy: offer.buy, filled: offer.filled, quantity: offer.quantity, price: offer.price,
        cancel: cancel(`Cancel ${offer.buy ? "buying" : "selling"} ${itemName(offer.itemId)}?`, () => deps.cancelOffer(offer.id)) }));
    }
    for (const listing of myListings()) {
      grid.append(slot({ itemId: listing.itemId, refine: listing.refine, buy: false, filled: 0, quantity: 1, price: listing.price, roll: rollFrom(listing.rollJson),
        cancel: cancel(`Take ${itemName(listing.itemId)} off sale?`, () => deps.cancelListing(listing.id)) }));
    }
    while (grid.childElementCount < usable) grid.append(slot(null));
    while (grid.childElementCount < EXCHANGE_SUPPORTER_OFFERS) grid.append(el("div", "exchange-slot is-locked", "Locked"));
    parts.push(heading("Your Offers", el("span", "exchange-aside", `${used}/${usable}`)), grid);
    return parts;
  }

  /** The seller's name in their chat color, as it reads in chat. */
  const seller = (name: string, color: string) => { const span = el("span", "exchange-hit-seller", name); span.style.color = color; return span; };

  /** Everything for sale among the followed items: each resource sell offer and each gear listing, cheapest first. */
  function forSale() {
    const offers = deps.offers().filter(offer => !offer.buy && !mine(offer.identity))
      .map(offer => ({ itemId: offer.itemId, refine: 0, price: offer.price, amount: offer.quantity - offer.filled, name: offer.name, color: nameColorHex(offer.nameColor) || autoNameColor(offer.identity), roll: null as WeaponSkillRoll | null, listing: null as ExchangeListingRow | null }));
    const gear = deps.listings().filter(listing => !mine(listing.identity))
      .map(listing => ({ itemId: listing.itemId, refine: listing.refine, price: listing.price, amount: 1, name: listing.name, color: nameColorHex(listing.nameColor) || autoNameColor(listing.identity), roll: rollFrom(listing.rollJson), listing }));
    return [...offers, ...gear].sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
  }

  async function buyGear(listing: ExchangeListingRow) {
    if (busy) return;
    const yes = await gameConfirm({ message: `Buy ${itemName(listing.itemId)}${listing.refine ? ` ★${listing.refine}` : ""}?`, confirmLabel: "Buy",
      details: [{ label: "Price", value: `${listing.price.toLocaleString("en-US")} Gold` }, { label: "Your Gold", value: deps.gold().toLocaleString("en-US") }] });
    if (yes) await act(() => deps.buyListing(listing.id), "Bought · it is in your bag");
  }
  /** Gear opens the item window, stats and skills first, with Buy in it; without the window, straight to the confirm. */
  function viewGear(listing: ExchangeListingRow) {
    if (!deps.inspect) { void buyGear(listing); return; }
    deps.inspect(listing.itemId, listing.refine, rollFrom(listing.rollJson), [{
      label: `Buy · ${listing.price.toLocaleString("en-US")}`, kind: "PRIMARY", disabled: deps.gold() < listing.price, onActivate: () => buyGear(listing),
    }]);
  }
  const buyDraft = (itemId: string, price: bigint | null): Screen => ({ kind: "offer", draft: { buy: true, itemId, refine: 0, quantity: 1, max: 1_000_000, price: price ?? 1n } });

  /** One seller's row: the item, its name and seller (and a weapon's skills), the price and how many. */
  function hitRow(sale: ReturnType<typeof forSale>[number]) {
    const row = el("button", "exchange-hit");
    row.type = "button";
    const skills = sale.listing ? weaponSkillLines(sale.itemId, sale.roll).join(" · ") : "";
    const text = el("span", "exchange-hit-text");
    text.append(el("span", "exchange-hit-name", `${itemName(sale.itemId)}${sale.refine ? ` ★${sale.refine}` : ""}`),
      seller(sale.name, sale.color), ...(skills ? [el("span", "exchange-hit-skills", skills)] : []));
    const figures = el("span", "exchange-hit-figures");
    const each = goldChip(sale.price, "exchange-hit-price");
    each.append(el("span", "exchange-each", "ea"));
    figures.append(each, el("span", "exchange-hit-amount", `×${short(BigInt(sale.amount))}`));
    row.append(tile(sale.itemId, sale.refine), text, figures);
    row.addEventListener("click", () => { if (sale.listing) viewGear(sale.listing); else go(buyDraft(sale.itemId, sale.price)); });
    return row;
  }

  /** How many of an item others have on sale: the price table's count less the player's own. */
  function othersSelling(itemId: string) {
    const own = myOffers().filter(offer => !offer.buy && offer.itemId === itemId).reduce((sum, offer) => sum + offer.quantity - offer.filled, 0)
      + myListings().filter(listing => listing.itemId === itemId).length;
    return Math.max(0, (priceOf(itemId)?.forSale ?? 0) - own);
  }

  /** One item: who sells it, cheapest first, and for a resource a buy offer of your own. What a tile in Buy opens. */
  function itemScreen(itemId: string) {
    deps.watch([itemId]);
    const sales = forSale().filter(sale => sale.itemId === itemId).slice(0, SHOWN_SELLERS);
    // Only the player's own on sale, or nothing: there is nobody else to wait for.
    const empty = othersSelling(itemId) > 0 ? "Loading…" : "Nobody else is selling this";
    const parts: HTMLElement[] = [heading(itemName(itemId), goldChip(deps.gold())),
      ...(sales.length ? sales.map(hitRow) : [el("p", "exchange-empty", empty)])];
    if (isExchangeResource(itemId)) {
      const offer = el("button", "exchange-confirm is-buy exchange-item-offer", "Place Buy Offer");
      offer.type = "button";
      offer.addEventListener("click", () => go(buyDraft(itemId, best(itemId, false) ?? last(itemId))));
      parts.push(offer);
    }
    return parts;
  }

  /** Buy: a search box over the market. Empty, the resources and the gear for sale as grids; typed, a row per seller. */
  function buyScreen() {
    const field = el("label", "exchange-search");
    field.innerHTML = SEARCH;
    const search = el("input");
    search.type = "search"; search.placeholder = "Search to see who sells it"; search.value = query;
    search.setAttribute("aria-label", "Search items");
    field.append(search);
    const results = el("div", "exchange-results");
    const fill = () => {
      if (!foldPlayerName(query)) {
        const resources = el("div", "exchange-grid");
        for (const itemId of ORE_ORDER) {
          const price = best(itemId, false);
          resources.append(tile(itemId, 0, price === null ? "" : short(price), () => go({ kind: "item", itemId })));
        }
        // Gear on sale, one tile per item with its lowest price: thousands of listings stay a short grid.
        const gearForSale = deps.prices().filter(row => !isExchangeResource(row.itemId) && othersSelling(row.itemId) > 0 && row.lowestAsk !== null)
          .sort((a, b) => (a.lowestAsk! < b.lowestAsk! ? -1 : 1));
        const gear = el("div", "exchange-grid");
        for (const row of gearForSale) gear.append(tile(row.itemId, 0, short(row.lowestAsk!), () => go({ kind: "item", itemId: row.itemId })));
        deps.watch([]);
        results.replaceChildren(section("Resources"), resources, section("Gear"), gearForSale.length ? gear : el("p", "exchange-empty", "None"));
        return;
      }
      // Matched the way the leaderboard matches names (whole name, then its start, then a word's start, then anywhere),
      // over the items on sale; only the best few items' sellers are followed.
      const onSale = deps.prices().filter(row => othersSelling(row.itemId) > 0);
      const entries = onSale.map(row => ({ identity: row.itemId, name: itemName(row.itemId), key: foldPlayerName(itemName(row.itemId)) }));
      const matched = searchPlayerDirectory(entries, query, { limit: EXCHANGE_WATCHED_ITEMS }).map(entry => entry.identity);
      deps.watch(matched);
      const rank = new Map(matched.map((itemId, index) => [itemId, index]));
      const hits = forSale().filter(sale => rank.has(sale.itemId))
        .sort((a, b) => rank.get(a.itemId)! - rank.get(b.itemId)! || (a.price < b.price ? -1 : a.price > b.price ? 1 : 0)).slice(0, SHOWN_SELLERS);
      if (!matched.length) { results.replaceChildren(el("p", "exchange-none", "None")); return; }
      if (!hits.length) { results.replaceChildren(el("p", "exchange-none", "None")); return; }
      results.replaceChildren(...(hits.length ? hits.map(hitRow) : [el("p", "exchange-empty", "Loading…")]));
    };
    search.addEventListener("input", () => { query = search.value; fill(); });
    fill();
    return [heading("Buy", goldChip(deps.gold())), field, results];
  }

  /** Gear starts at the last sale or what the Smith would pay, never at 1 gold, so a stray tap cannot give a piece away. */
  function gearStartPrice(itemId: string) {
    const smith = gradeShopSalePrice(itemId), recent = last(itemId);
    const floor = BigInt(Math.max(100, Math.round(smith ?? 0)));
    return recent !== null && recent > floor ? recent : floor;
  }

  /** Sell: what the bag holds that can go on the exchange. */
  function sellScreen() {
    const held = deps.ores();
    const resources = el("div", "exchange-grid");
    // Every resource that trades, the ones not held greyed, so a player sees what could be sold.
    for (const itemId of ORE_ORDER) {
      const have = held[itemId] ?? 0;
      const piece = tile(itemId, 0, short(BigInt(have)), have > 0 ? () => go({ kind: "offer",
        draft: { buy: false, itemId, refine: 0, quantity: have, max: have, price: best(itemId, true) ?? last(itemId) ?? 1n } }) : undefined);
      piece.classList.toggle("is-none", have <= 0);
      resources.append(piece);
    }
    const gear = el("div", "exchange-grid");
    for (const piece of deps.gear().filter(each => isExchangeGear(each.itemId))) {
      gear.append(tile(piece.itemId, piece.refine, "", () => go({ kind: "offer",
        draft: { buy: false, itemId: piece.itemId, copyId: piece.copyId, refine: piece.refine, quantity: 1, max: 1, price: gearStartPrice(piece.itemId) } })));
    }
    return [heading("Sell"), section("Resources"), resources,
      section("Gear"), gear.childElementCount ? gear : el("p", "exchange-empty", "None")];
  }

  function stepper(label: string, value: string, onInput: (text: string) => void, steps: [string, () => void][]) {
    const row = el("div", "exchange-stepper");
    const input = el("input");
    input.inputMode = "numeric"; input.value = value; input.setAttribute("aria-label", label);
    input.addEventListener("input", () => onInput(input.value));
    const button = ([text, run]: [string, () => void]) => { const b = el("button", "exchange-step", text); b.type = "button"; b.addEventListener("click", run); return b; };
    const [down, up, ...more] = steps;
    // Every row the same five cells, a blank where it has no extra button, so the fields line up.
    row.append(el("span", "exchange-stepper-label", label), button(down), input, button(up), ...(more.length ? more.map(button) : [el("span")]));
    return row;
  }

  /** One item, its market, and the amount and price: everything an offer needs on one screen. */
  function offerScreen(draft: Draft) {
    const gear = draft.copyId !== undefined;
    const hero = el("div", `exchange-hero is-${draft.buy ? "buy" : "sell"}`);
    const lowest = best(draft.itemId, false), highest = best(draft.itemId, true), recent = last(draft.itemId);
    const market = el("p", "exchange-market");
    market.textContent = gear ? "" : [`Lowest ${lowest === null ? "—" : short(lowest)}`, `Highest ${highest === null ? "—" : short(highest)}`,
      `Last ${recent === null ? "—" : short(recent)}`].join("   ");
    const piece = gear ? deps.gear().find(each => each.itemId === draft.itemId && each.copyId === draft.copyId) : undefined;
    hero.append(el("span", "exchange-pill", draft.buy ? "Buy" : "Sell"),
      tile(draft.itemId, draft.refine, "", gear && deps.inspect ? () => deps.inspect!(draft.itemId, draft.refine, piece?.roll ?? null) : undefined),
      el("strong", "exchange-hero-name", `${itemName(draft.itemId)}${draft.refine ? ` ★${draft.refine}` : ""}`), market);
    const parts: HTMLElement[] = [hero];
    const redraw = () => render(true);
    const clampQty = (value: number) => Math.max(1, Math.min(draft.max, Math.floor(value) || 1));
    if (!gear) {
      parts.push(stepper("Amount", String(draft.quantity), text => { draft.quantity = clampQty(Number(text)); updateTotal(); }, [
        ["−", () => { draft.quantity = clampQty(draft.quantity - 1); redraw(); }],
        ["+", () => { draft.quantity = clampQty(draft.quantity + 1); redraw(); }],
        // Sell everything held, or buy as many as the gold covers at this price.
        [draft.buy ? "Max" : "All", () => {
          draft.quantity = draft.buy ? clampQty(Number(deps.gold() / (draft.price > 0n ? draft.price : 1n))) : draft.max; redraw();
        }] as [string, () => void],
      ]));
    }
    const nudge = (percent: bigint) => { const step = draft.price * percent / 100n; draft.price = draft.price + (step === 0n ? (percent > 0n ? 1n : -1n) : step); if (draft.price < 1n) draft.price = 1n; redraw(); };
    parts.push(stepper("Price Each", draft.price.toString(), text => { if (/^\d{1,13}$/.test(text)) draft.price = BigInt(text); updateTotal(); }, [
      ["−5%", () => nudge(-5n)], ["+5%", () => nudge(5n)],
    ]));
    const total = el("div", "exchange-total");
    const timing = el("p", "exchange-timing");
    const freeSlot = myOffers().length + myListings().length < exchangeOfferSlots(deps.supporter());
    const updateTotal = () => {
      const sum = draft.price * BigInt(draft.quantity);
      const short = draft.buy && sum > deps.gold();
      // The sum spelled out, so the price above reads as each, not for all.
      const sumLabel = el("span", "exchange-total-label");
      sumLabel.append(el("span", "", draft.buy ? "Total" : `You Get · ${EXCHANGE_FEE_PERCENT}% Fee`),
        el("small", "exchange-sum", `${draft.quantity.toLocaleString("en-US")} × ${draft.price.toLocaleString("en-US")} each`));
      total.replaceChildren(sumLabel, goldChip(draft.buy ? sum : sum - sum * EXCHANGE_FEE_PERCENT / 100n, `exchange-total-gold${short ? " is-short" : ""}`));
      // Whether it trades the moment it goes up, or waits for someone: a price at or past the other side's best trades now.
      const now = gear ? false : draft.buy ? lowest !== null && draft.price >= lowest : highest !== null && draft.price <= highest;
      timing.textContent = gear ? "Waits for a buyer" : now ? (draft.buy ? "Buys now" : "Sells now") : (draft.buy ? "Waits for a seller" : "Waits for a buyer");
      timing.classList.toggle("is-now", now);
      confirm.disabled = busy || short || !freeSlot;
      confirm.textContent = !freeSlot ? "No Free Slot" : short ? "Not Enough Gold" : label;
    };
    const label = draft.buy ? "Place Buy Offer" : gear ? "Put on Sale" : "Place Sell Offer";
    const confirm = el("button", `exchange-confirm is-${draft.buy ? "buy" : "sell"}`, label);
    confirm.type = "button";
    confirm.addEventListener("click", async () => {
      if (gear) {
        // A piece is one of a kind: its price is asked once more before it leaves the bag.
        const yes = await gameConfirm({ message: `Put ${itemName(draft.itemId)}${draft.refine ? ` ★${draft.refine}` : ""} on sale?`, confirmLabel: "Put on Sale",
          details: [{ label: "Price", value: `${draft.price.toLocaleString("en-US")} Gold` }, { label: "You Get", value: `${(draft.price - draft.price * EXCHANGE_FEE_PERCENT / 100n).toLocaleString("en-US")} Gold` }] });
        if (yes) await act(() => deps.list(draft.itemId, draft.copyId!, draft.price), "On sale");
      } else {
        // Says what happened: an offer can trade in full the moment it goes up, and then never shows in a slot.
        const before = new Set(myOffers().map(offer => String(offer.id))), quantity = draft.quantity, buy = draft.buy;
        await act(() => deps.place(buy, draft.itemId, quantity, draft.price), () => {
          const placed = myOffers().find(offer => !before.has(String(offer.id)));
          const traded = placed ? placed.filled : quantity, left = quantity - traded, amount = traded.toLocaleString("en-US");
          if (!traded) return buy ? "Offer placed" : "On sale";
          if (!left) return buy ? `Bought ${amount} · in your bag` : `Sold ${amount} · the gold is yours`;
          return buy ? `Bought ${amount} · ${left.toLocaleString("en-US")} waiting` : `Sold ${amount} · ${left.toLocaleString("en-US")} on sale`;
        });
      }
    });
    updateTotal();
    parts.push(total, timing, confirm);
    return parts;
  }

  function render(force = false) {
    const state = JSON.stringify([screen, busy, String(deps.gold()), deps.ores(), deps.collect().length,
      myOffers().map(offer => `${offer.id}:${offer.filled}`), myListings().length, deps.prices(),
      deps.offers().map(offer => `${offer.id}:${offer.filled}`), deps.listings().length, deps.gear().length],
      (_key, value) => typeof value === "bigint" ? value.toString() : value);
    if (!force && state === rendered) return;
    rendered = state;
    // Typing in a field is not interrupted by rows arriving.
    if (!force && document.activeElement instanceof HTMLInputElement && dialog.contains(document.activeElement)) return;
    const view = screen;
    dialog.dataset.screen = view.kind === "pick" ? view.side : view.kind;
    if (view.kind !== "pick" && view.kind !== "item") deps.watch([]);
    body.replaceChildren(...(view.kind === "slots" ? slotsScreen() : view.kind === "pick" ? (view.side === "buy" ? buyScreen() : sellScreen())
      : view.kind === "item" ? itemScreen(view.itemId) : offerScreen(view.draft)));
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    deps.follow(false);
    deps.clearInput?.();
    return true;
  }
  function open(view: Screen = { kind: "slots" }) {
    if (!deps.inTown() || dialog.open) return;
    deps.follow(true);
    screen = view;
    render(true);
    deps.clearInput?.();
    dialog.showModal();
    back.focus();
  }
  // Back steps out of a pick or an offer first, then closes.
  const stepBack = () => {
    if (screen.kind === "slots") close();
    else go(screen.kind === "offer" || screen.kind === "item" ? { kind: "pick", side: screen.kind === "item" || screen.draft.buy ? "buy" : "sell" } : { kind: "slots" });
  };
  back.addEventListener("click", stepBack);
  dialog.addEventListener("cancel", event => { event.preventDefault(); stepBack(); });
  return { open, close, isOpen: () => dialog.open, render: () => { if (dialog.open) render(); }, destroy() { close(); dialog.remove(); } };
}

/** The Trade Chrysanthemum as the Town uses it: the coop session's rows and calls, the bag's unworn gear. */
export function createExchangeRuntime(deps: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coop: () => any;
  inventory: { itemIds: string[]; equippedHead: string; equippedChest: string; equippedFeet?: string; equippedRightHand: string; equippedLeftHand: string };
  identity: () => string | null | undefined;
  showMessage: (text: string, color: string) => void;
  clearInput?: () => void;
  inTown: () => boolean;
  inspect?: ExchangeDeps["inspect"];
}) {
  const { inventory } = deps;
  const failed = async (): Promise<ExchangeResult> => ({ ok: false, error: "Not Connected" });
  const gear = (): GearPiece[] => {
    const coop = deps.coop(), worn = new Set([inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet ?? "", inventory.equippedRightHand, inventory.equippedLeftHand]);
    const locked = (itemId: string, copyId: bigint) => Boolean(coop?.equipmentLocked?.(itemId, copyId));
    const firsts = [...new Set(inventory.itemIds)].filter(itemId => !worn.has(itemId) && !locked(itemId, 0n))
      .map(itemId => ({ itemId, copyId: 0n, refine: coop?.itemRefine?.(itemId, 0n) ?? 0, roll: coop?.weaponSkills?.(itemId) ?? null }));
    const copies = (coop?.equipmentCopies?.() ?? []).filter((copy: { itemId: string; id: bigint }) => inventory.itemIds.includes(copy.itemId) && !locked(copy.itemId, copy.id))
      .map((copy: { itemId: string; id: bigint; roll?: WeaponSkillRoll }) => ({ itemId: copy.itemId, copyId: copy.id, refine: coop?.itemRefine?.(copy.itemId, copy.id) ?? 0, roll: copy.roll ?? null }));
    return [...firsts, ...copies];
  };
  const controller = createExchangeController({
    inTown: deps.inTown, clearInput: deps.clearInput, showMessage: deps.showMessage,
    identity: () => (deps.identity() ?? "").replace(/^0x/i, "").toLowerCase(),
    supporter: () => (deps.coop()?.supporterTier?.() ?? "none") !== "none",
    gold: () => deps.coop()?.gold?.() ?? 0n,
    ores: () => deps.coop()?.ores?.() ?? {},
    gear,
    follow: on => deps.coop()?.followExchange?.(on),
    watch: itemIds => deps.coop()?.watchExchangeItems?.(itemIds),
    prices: () => deps.coop()?.exchangePrices?.() ?? [],
    offers: () => deps.coop()?.exchangeOffers?.() ?? [],
    listings: () => deps.coop()?.exchangeListings?.() ?? [],
    myOffers: () => deps.coop()?.myExchangeOffers?.() ?? [],
    myListings: () => deps.coop()?.myExchangeListings?.() ?? [],
    collect: () => deps.coop()?.exchangeCollect?.() ?? [],
    place: (buy, itemId, quantity, price) => deps.coop()?.placeExchangeOffer?.(buy, itemId, quantity, price) ?? failed(),
    cancelOffer: id => deps.coop()?.cancelExchangeOffer?.(id) ?? failed(),
    list: (itemId, copyId, price) => deps.coop()?.listExchangeGear?.(itemId, copyId, price) ?? failed(),
    buyListing: id => deps.coop()?.buyExchangeGear?.(id) ?? failed(),
    cancelListing: id => deps.coop()?.cancelExchangeListing?.(id) ?? failed(),
    collectAll: () => deps.coop()?.collectExchange?.() ?? failed(),
    inspect: deps.inspect,
  });
  // Rows arrive from the server while it is open; a redraw only happens when something shown changed.
  let ticker: ReturnType<typeof setInterval> | null = null;
  return {
    ...controller,
    open() { controller.open(); if (controller.isOpen() && !ticker) ticker = setInterval(controller.render, 1000); },
    close() { if (ticker) { clearInterval(ticker); ticker = null; } return controller.close(); },
  };
}
