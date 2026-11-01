import { CARDS, cardDefinition, cardKillChance, cardSureByKills, type CardDefinition, type CardSlot } from "../../shared/cards";
import { CARD_SLOT_NAMES, cardEffectText, cardName, cardOddsText, cardOrigin, cardSureText, mapName } from "../../shared/card-text";
import {
  BASE_CARD_SLOTS, CARD_SLOT_PERKS, CARD_TYPES, CARD_TYPE_NAMES, MAX_ACTIVE_CARD_SLOTS, NO_ACTIVE_CARDS, activationError,
  activeCopies, type ActiveCards, type ActiveCardSlots,
} from "../../shared/active-cards";
import { PRESTIGE_PERKS, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { cardPortrait } from "./card-portrait";
import { formatCompactNumber } from "./number-format";
import type { ItemInspectionAction } from "./item-inspection-controller";
import { fillCardEffect } from "./card-effect-line";

const RARITY_ORDER = { regular: 0, elite: 1, boss: 2 } as const;
const CARD_ORDER = new Map(CARDS.map((card, index) => [card.id, index]));
const pendingTilePortraits = new WeakMap<HTMLElement, () => void>();
function loadTilePortrait(tile: HTMLElement) {
  const load = pendingTilePortraits.get(tile);
  if (!load) return;
  pendingTilePortraits.delete(tile);
  load();
}
/** The campaign's maps first, then the Endless Warden cards, then the tree cards. */
const zoneRank = (card: CardDefinition) => card.tree ? 2 : card.endless ? 1 : 0;
/** Map order, then regular, elite, boss. */
export const byMapThenRarity = (a: CardDefinition, b: CardDefinition) =>
  zoneRank(a) - zoneRank(b) || a.tier - b.tier || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || (CARD_ORDER.get(a.id) ?? 0) - (CARD_ORDER.get(b.id) ?? 0);

/** One card as a bag-style tile: its enemy's name, its portrait and the count held. Not found yet, only its shadow. */
export function cardTile(card: CardDefinition, count: number, onPick: () => void, found = true, deferPortrait = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `inventory-item is-filled is-card is-${card.rarity}${found ? "" : " is-unfound"}`;
  button.dataset.cardId = card.id;
  button.setAttribute("aria-label", found ? `${cardName(card)}, ${count}` : `${cardName(card)}, not found yet`);
  const art = document.createElement("span");
  art.className = "inventory-item-art-wrap";
  const image = document.createElement("span");
  image.className = "inventory-item-art card-tile-art";
  image.setAttribute("aria-hidden", "true");
  art.append(image);
  pendingTilePortraits.set(button, () => {
    void cardPortrait(card.id, !found).then(source => { if (source) image.style.backgroundImage = `url(${source})`; });
  });
  if (!deferPortrait) loadTilePortrait(button);
  const label = document.createElement("span");
  label.className = "item-tier-label is-above";
  label.textContent = card.enemy;
  const stack = document.createElement("span");
  stack.className = "inventory-stack-count";
  stack.textContent = count < 10_000 ? String(count) : formatCompactNumber(count);
  button.append(label, art, ...(found ? [stack] : []));
  button.addEventListener("click", onPick);
  return button;
}

type Result = { ok: boolean; error?: string } | undefined;

/** What the Cards tab reads and does, from the coop session. */
export type CardsPort = {
  cards: () => Readonly<Record<string, number>>;
  activeCards: () => ActiveCards;
  /** Slots of each type in play now. */
  slots: () => ActiveCardSlots;
  /** Card Slots ranks owned, in play or not. */
  storedRanks: () => Partial<PrestigePerkRanks>;
  /** Card Hunter from the active cards (a fraction) and Card Luck's rank in play: the odds the server rolls at. */
  cardHunter: () => number;
  cardLuck: () => number;
  activate: (cardId: string, expectedActive: number) => Promise<Result>;
  deactivate: (type: CardSlot, index: number, cardId: string) => Promise<Result>;
};

type CardsCoop = {
  cards?: () => Readonly<Record<string, number>>;
  activeCards?: () => ActiveCards;
  cardSlots?: () => ActiveCardSlots;
  storedPrestigePerks?: () => Partial<PrestigePerkRanks>;
  activeCardStats?: () => { cardHunter: number };
  researchInPlay?: () => { cardLuck?: number } | null | undefined;
  activateCard?: (cardId: string, expectedActive: number) => Promise<Result>;
  deactivateCard?: (type: CardSlot, index: number, cardId: string) => Promise<Result>;
};

/** The Cards tab's port onto the coop session as main.ts holds it. */
export function cardsPort(coop: () => CardsCoop | null | undefined): CardsPort {
  return {
    cards: () => coop()?.cards?.() ?? {},
    activeCards: () => coop()?.activeCards?.() ?? NO_ACTIVE_CARDS,
    slots: () => coop()?.cardSlots?.() ?? BASE_CARD_SLOTS,
    storedRanks: () => coop()?.storedPrestigePerks?.() ?? {},
    cardHunter: () => coop()?.activeCardStats?.().cardHunter ?? 0,
    cardLuck: () => coop()?.researchInPlay?.()?.cardLuck ?? 0,
    activate: async (cardId, expectedActive) => coop()?.activateCard?.(cardId, expectedActive) ?? { ok: false, error: "Not Connected" },
    deactivate: async (type, index, cardId) => coop()?.deactivateCard?.(type, index, cardId) ?? { ok: false, error: "Not Connected" },
  };
}

/** One kill's chance at a card for this player, as the server rolls it. */
export const playerCardChance = (port: Pick<CardsPort, "cardHunter" | "cardLuck">, card: CardDefinition) =>
  cardKillChance(card, port.cardHunter(), port.cardLuck());

/** Why a type has fewer than four slots now, on screen: the perk that opens them, or that it is not in play. */
export function lockedSlotsText(type: CardSlot, slots: number, storedRank: number) {
  const perk = PRESTIGE_PERKS[CARD_SLOT_PERKS[type]].title;
  if (slots >= MAX_ACTIVE_CARD_SLOTS) return "";
  if (BASE_CARD_SLOTS[type] + storedRank > slots) return `${perk} is not in play now: ${slots} slot${slots === 1 ? "" : "s"}`;
  const more = MAX_ACTIVE_CARD_SLOTS - slots;
  return `Locked: the ${perk} perk opens ${more} more`;
}

/** The card window's request: its effects, what is owned and equipped, its odds, and Equip or Remove. */
export function cardDetailRequest(port: CardsPort, cardId: string, after: (result: Result, verb: string) => void) {
  const card = cardDefinition(cardId)!;
  const owned = port.cards()[card.id] ?? 0, active = port.activeCards(), slots = port.slots();
  const copies = activeCopies(active, card.id);
  const positions = active[card.slot].flatMap((id, index) => id === card.id ? [index] : []);
  const inPlay = positions.filter(index => index < slots[card.slot]).length;
  const typeName = CARD_TYPE_NAMES[card.slot];
  const chance = playerCardChance(port, card);
  const error = activationError(active, slots, owned, card.id);
  const actions: ItemInspectionAction[] = [];
  // No dead button: when it cannot go on, the note says why.
  if (owned > 0 && copies < owned && !error) {
    actions.push({ label: "Equip", kind: "PRIMARY", onActivate: async () => after(await port.activate(card.id, copies), "Equipped") });
  }
  if (copies > 0) {
    const index = positions[positions.length - 1];
    actions.push({ label: "Remove", kind: "SECONDARY", onActivate: async () => after(await port.deactivate(card.slot, index, card.id), "Removed") });
  }
  const slotsText = positions.length
    ? `${typeName} Slot${positions.length === 1 ? "" : "s"} ${positions.map(index => index + 1).join(", ")}${inPlay < positions.length ? ` · ${positions.length - inPlay} waiting` : ""}`
    : "";
  return {
    // Effects read for the copies in play: one card's worth until any is.
    cardId: card.id, count: owned, found: owned > 0, copies: Math.max(1, inPlay),
    context: `${typeName} Card · ${owned > 0 ? `${owned.toLocaleString("en-US")} Owned · ${copies} Equipped` : "Not Found Yet"}`,
    effects: card.effects.map(effect => ({ text: cardEffectText(effect, Math.max(1, inPlay)), cost: effect.value < 0 })),
    odds: `${cardOddsText(card, chance)} · ${cardSureText(card, cardSureByKills(card, port.cardHunter()))}`,
    note: slotsText || (owned > 0 && error && copies < owned ? `${error} Remove one first.` : ""),
    actions,
  };
}

// v2: zones start open; what the v1 key saved is not read.
const ZONE_STORE = "wildstat.cardZonesOpen.v2";
const VIEW_STORE = "wildstat.cardsView";
function storedZones(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(ZONE_STORE) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}
function storeZones(zones: Record<string, boolean>) {
  try { localStorage.setItem(ZONE_STORE, JSON.stringify(zones)); } catch { /* the choice lasts for this visit */ }
}
type CardsView = "cards" | "equip";
function storedView(): CardsView {
  try { return localStorage.getItem(VIEW_STORE) === "cards" ? "cards" : "equip"; } catch { return "equip"; }
}

function cardArt(card: CardDefinition, shadow: boolean, className: string) {
  const art = document.createElement("span");
  art.className = className;
  art.setAttribute("aria-hidden", "true");
  void cardPortrait(card.id, shadow).then(source => { if (source) art.style.backgroundImage = `url(${source})`; });
  return art;
}

/** A row of underlined choices, the bag's filter look: one pressed. */
function choiceBar(className: string, label: string, choices: readonly { id: string; text: string }[], pressed: string, pick: (id: string) => void) {
  const bar = document.createElement("div");
  bar.className = `inventory-filters ${className}`;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", label);
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-filter";
    button.dataset.choice = choice.id;
    button.textContent = choice.text;
    button.setAttribute("aria-pressed", String(choice.id === pressed));
    button.addEventListener("click", () => pick(choice.id));
    bar.append(button);
  }
  return bar;
}

/** A section's heading: its name, and a count or state on the right. */
function sectionHead(title: string, meta: string) {
  const head = document.createElement("div");
  head.className = "cards-section-head";
  const name = document.createElement("strong");
  name.textContent = title;
  const side = document.createElement("span");
  side.textContent = meta;
  head.append(name, side);
  return head;
}

/**
 * The Cards tab, in two views. Equip (first, and where it opens): pick Weapon, Helmet
 * or Armor to see its slots and the cards of that type owned; pick one to see what it does and Equip or Remove it.
 * Cards: every card as a tile, by zone in sections that start open and can be closed; a tile opens the card's window.
 */
export function createCardsTab(options: {
  port: CardsPort;
  onInspect: (cardId: string) => void;
  /** After Equip or Remove: says how it went and redraws. */
  onResult?: (result: Result, verb: string, cardId: string) => void;
}) {
  const { port } = options;
  const element = document.createElement("section");
  element.className = "cards-tab";
  element.setAttribute("aria-label", "Cards");
  element.hidden = true;
  const views = document.createElement("div");
  views.className = "cards-views-bar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "cards-search";
  search.placeholder = "Search names, descriptions or areas";
  search.setAttribute("aria-label", "Search names, descriptions or areas");
  search.autocomplete = "off";
  const searchStatus = document.createElement("p");
  searchStatus.className = "cards-search-status";
  searchStatus.setAttribute("role", "status");
  searchStatus.hidden = true;
  const collection = document.createElement("section");
  collection.className = "cards-collection";
  const count = document.createElement("span");
  count.className = "inventory-capacity cards-tab-count";
  const progress = document.createElement("span");
  progress.className = "cards-progress";
  progress.setAttribute("aria-hidden", "true");
  const progressFill = document.createElement("span");
  progress.append(progressFill);
  const zones = document.createElement("div");
  zones.className = "cards-zones";
  collection.append(count, progress, zones);
  const equip = document.createElement("section");
  equip.className = "cards-equip";
  element.append(views, search, searchStatus, collection, equip);
  const ordered = [...CARDS].sort(byMapThenRarity);
  // Built once, using the same names and effect descriptions as the card details.
  const searchIndex = new Map(ordered.map(card => [card.id,
    [cardName(card), mapName(card.mapId), cardOrigin(card), ...card.effects.map(effect =>
      `${effect.effect.replace(/([a-z])([A-Z])/g, "$1 $2")} ${cardEffectText(effect)}`)].join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [],
  ]));
  let query = "";
  // Search-only expansion never changes the player's saved area preferences.
  let searchOpen: Record<string, boolean> = {};

  function filterCards() {
    const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
    const scope = view === "cards" ? zones : equip;
    let matches = 0;
    for (const tile of scope.querySelectorAll<HTMLElement>(".inventory-item[data-card-id]")) {
      const words = searchIndex.get(tile.dataset.cardId!) ?? [];
      const visible = terms.every(term => words.some(word => word.startsWith(term)));
      tile.hidden = !visible;
      if (visible) {
        matches++;
        if (!tile.closest<HTMLElement>(".cards-zone-grid")?.hidden) loadTilePortrait(tile);
      }
    }
    for (const zone of zones.querySelectorAll<HTMLElement>(".cards-zone")) {
      zone.hidden = Boolean(query) && !zone.querySelector(".inventory-item:not([hidden])");
    }
    searchStatus.hidden = !query;
    searchStatus.textContent = query ? matches ? `${matches} matching card${matches === 1 ? "" : "s"}` : "No matching cards in this view." : "";
  }
  search.addEventListener("input", () => {
    const next = search.value.trim().toLowerCase();
    if (next === query) return;
    const changedMode = Boolean(next) !== Boolean(query);
    query = next;
    if (changedMode) searchOpen = {};
    // Entering search exposes collapsed zones; subsequent keystrokes only hide/show tiles.
    if (changedMode && view === "cards") redraw();
    else filterCards();
  });
  const mapIds = [...new Set(ordered.map(card => card.mapId))];
  let open: Record<string, boolean> | null = null;
  let view: CardsView = storedView();
  let type: CardSlot = "HAND";
  let picked: string | null = null;
  let busy = false;
  let rendered = "";

  function redraw() { rendered = ""; render(); }
  function setView(next: CardsView) {
    view = next;
    try { localStorage.setItem(VIEW_STORE, next); } catch { /* this visit only */ }
    redraw();
  }

  function slotButton(index: number, active: ActiveCards, slots: ActiveCardSlots) {
    const button = document.createElement("button");
    button.type = "button";
    const card = cardDefinition(active[type][index]);
    const locked = index >= slots[type];
    const label = document.createElement("span");
    label.className = "cards-slot-label";
    if (card) {
      button.className = `cards-slot is-filled is-${card.rarity}${locked ? " is-waiting" : ""}`;
      button.dataset.cardId = card.id;
      label.textContent = locked ? "Waiting" : card.enemy;
      button.setAttribute("aria-label", `${CARD_TYPE_NAMES[type]} slot ${index + 1}: ${cardName(card)}${locked ? ", waiting" : ""}`);
      button.setAttribute("aria-pressed", String(card.id === picked));
      button.append(cardArt(card, false, "cards-slot-art"), label);
      button.addEventListener("click", () => { picked = card.id; redraw(); });
    } else if (locked) {
      button.className = "cards-slot is-locked";
      button.disabled = true;
      label.textContent = "Locked";
      button.setAttribute("aria-label", `${CARD_TYPE_NAMES[type]} slot ${index + 1}: locked`);
      button.append(label);
    } else {
      button.className = "cards-slot is-empty";
      label.textContent = "Empty";
      button.setAttribute("aria-label", `${CARD_TYPE_NAMES[type]} slot ${index + 1}: empty`);
      button.append(label);
      button.addEventListener("click", () => { picked = null; redraw(); });
    }
    return button;
  }

  async function act(card: CardDefinition, verb: "Equipped" | "Removed", send: () => Promise<Result>) {
    if (busy) return;
    busy = true;
    redraw();
    const result = await send();
    busy = false;
    options.onResult?.(result, verb, card.id);
    redraw();
  }

  /** The picked card: what it does, and Equip or Remove, or why neither. */
  function focus(held: Readonly<Record<string, number>>, active: ActiveCards, slots: ActiveCardSlots) {
    const panel = document.createElement("section");
    panel.className = "cards-equip-focus";
    panel.setAttribute("aria-live", "polite");
    const card = cardDefinition(picked);
    if (!card || card.slot !== type) {
      const hint = document.createElement("p");
      hint.className = "cards-equip-hint";
      hint.textContent = `Pick a ${CARD_TYPE_NAMES[type]} card below to see what it does and equip it.`;
      panel.classList.add("is-empty");
      panel.append(hint);
      return panel;
    }
    const owned = held[card.id] ?? 0, copies = activeCopies(active, card.id);
    const head = document.createElement("div");
    head.className = `cards-equip-head is-${card.rarity}`;
    const title = document.createElement("strong");
    title.textContent = cardName(card);
    const status = document.createElement("span");
    status.textContent = `${owned.toLocaleString("en-US")} Owned · ${copies} Equipped`;
    const origin = document.createElement("span");
    origin.className = "cards-equip-origin";
    origin.textContent = cardOrigin(card);
    head.append(cardArt(card, false, "cards-equip-art"), title, origin, status);
    const effects = document.createElement("ul");
    effects.className = "cards-equip-effects";
    for (const effect of card.effects) {
      const line = document.createElement("li");
      fillCardEffect(line, cardEffectText(effect, copies));
      if (effect.value < 0) line.className = "is-cost";
      effects.append(line);
    }
    const actions = document.createElement("div");
    actions.className = "cards-equip-actions";
    const error = activationError(active, slots, owned, card.id);
    if (owned > copies && !error) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "farm-start cards-equip-button";
      button.textContent = busy ? "Equipping…" : "Equip";
      button.translate = false;
      button.disabled = busy;
      button.addEventListener("click", () => { void act(card, "Equipped", () => port.activate(card.id, copies)); });
      actions.append(button);
    }
    if (copies > 0) {
      const positions = active[card.slot].flatMap((id, index) => id === card.id ? [index] : []);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "farm-start is-secondary cards-equip-button";
      button.textContent = busy ? "Removing…" : "Remove";
      button.disabled = busy;
      button.addEventListener("click", () => { void act(card, "Removed", () => port.deactivate(card.slot, positions[positions.length - 1], card.id)); });
      actions.append(button);
    }
    panel.append(head, effects, actions);
    if (error && owned > copies) {
      const why = document.createElement("p");
      why.className = "cards-equip-hint";
      why.textContent = `${error} Remove one first.`;
      panel.append(why);
    }
    return panel;
  }

  function renderEquip(held: Readonly<Record<string, number>>, active: ActiveCards, slots: ActiveCardSlots) {
    // Weapon, Helmet and Armor as a loadout: each with its slots used and the cards in them, the picked one outlined.
    const types = document.createElement("div");
    types.className = "cards-types";
    types.setAttribute("role", "group");
    types.setAttribute("aria-label", "Card type");
    types.append(...CARD_TYPES.map(id => {
      const box = document.createElement("button");
      box.type = "button";
      box.className = "cards-type";
      box.dataset.choice = id;
      box.setAttribute("aria-pressed", String(id === type));
      const name = document.createElement("span");
      name.className = "cards-type-name";
      name.textContent = CARD_SLOT_NAMES[id];
      const used = document.createElement("span");
      used.className = "cards-type-used";
      used.textContent = `${Math.min(active[id].length, slots[id])} / ${slots[id]}`;
      const strip = document.createElement("span");
      strip.className = "cards-type-strip";
      strip.setAttribute("aria-hidden", "true");
      for (let index = 0; index < slots[id]; index++) {
        const card = cardDefinition(active[id][index]);
        strip.append(card ? cardArt(card, false, `cards-type-mini is-${card.rarity}`) : Object.assign(document.createElement("span"), { className: "cards-type-mini is-empty" }));
      }
      box.append(name, strip, used);
      box.addEventListener("click", () => { type = id; picked = null; redraw(); });
      return box;
    }));
    const row = document.createElement("section");
    row.className = "cards-active-row";
    row.dataset.type = type;
    const grid = document.createElement("div");
    grid.className = "cards-slot-row";
    for (let index = 0; index < MAX_ACTIVE_CARD_SLOTS; index++) grid.append(slotButton(index, active, slots));
    row.append(sectionHead(`${CARD_SLOT_NAMES[type]} Slots`, ""), grid);
    const locks = lockedSlotsText(type, slots[type], Number(port.storedRanks()[CARD_SLOT_PERKS[type]] ?? 0));
    if (locks) {
      const lock = document.createElement("p");
      lock.className = "cards-lock-note";
      lock.textContent = locks;
      row.append(lock);
    }
    const owned = ordered.filter(card => card.slot === type && (held[card.id] ?? 0) > 0);
    if (picked && !owned.some(card => card.id === picked) && !active[type].includes(picked)) picked = null;
    const yours = document.createElement("section");
    yours.className = "cards-equip-yours";
    yours.append(sectionHead(`Your ${CARD_SLOT_NAMES[type]} Cards`, owned.length ? String(owned.length) : ""));
    if (!owned.length) {
      const none = document.createElement("p");
      none.className = "cards-equip-note";
      none.textContent = `No ${CARD_SLOT_NAMES[type]} cards yet. Cards drop from enemies, bosses and trees, and the Card Seller in Town sells some.`;
      yours.append(none);
    }
    const tiles = document.createElement("div");
    tiles.className = "inventory-items cards-equip-grid";
    tiles.append(...owned.map(card => {
      const tile = cardTile(card, held[card.id] ?? 0, () => { picked = card.id; redraw(); }, true, true);
      tile.setAttribute("aria-pressed", String(card.id === picked));
      if (activeCopies(active, card.id)) tile.classList.add("is-equipped");
      return tile;
    }));
    if (owned.length) yours.append(tiles);
    equip.replaceChildren(types, row, focus(held, active, slots), yours);
  }

  function setOpen(mapId: string, value: boolean) {
    if (query) searchOpen = { ...searchOpen, [mapId]: value };
    else {
      open = { ...(open ?? {}), [mapId]: value };
      storeZones(open);
    }
    redraw();
  }

  function renderCollection(held: Readonly<Record<string, number>>, active: ActiveCards) {
    const found = (card: CardDefinition) => (held[card.id] ?? 0) > 0;
    const foundCount = ordered.filter(found).length;
    count.textContent = `${foundCount} / ${ordered.length} Found`;
    progressFill.style.width = `${(100 * foundCount / Math.max(1, ordered.length)).toFixed(1)}%`;
    zones.replaceChildren(...mapIds.map(mapId => {
      const cards = ordered.filter(card => card.mapId === mapId);
      const isOpen = query ? searchOpen[mapId] ?? true : Boolean(open![mapId]);
      const section = document.createElement("section");
      section.className = `cards-zone${isOpen ? " is-open" : ""}`;
      section.dataset.mapId = mapId;
      const header = document.createElement("button");
      header.type = "button";
      header.className = "cards-zone-header";
      header.setAttribute("aria-expanded", String(isOpen));
      const name = document.createElement("span");
      name.className = "cards-zone-name";
      name.textContent = mapName(mapId);
      const tally = document.createElement("span");
      tally.className = "cards-zone-count";
      const activeHere = cards.reduce((sum, card) => sum + activeCopies(active, card.id), 0);
      tally.textContent = `${cards.filter(found).length} / ${cards.length}${activeHere ? ` · ${activeHere} Equipped` : ""}`;
      const chevron = document.createElement("span");
      chevron.className = "cards-zone-chevron";
      chevron.setAttribute("aria-hidden", "true");
      header.append(name, tally, chevron);
      header.addEventListener("click", () => setOpen(mapId, !isOpen));
      const list = document.createElement("div");
      list.className = "inventory-items cards-zone-grid";
      list.hidden = !isOpen;
      if (isOpen || query) list.append(...cards.map(card => {
        const tile = cardTile(card, held[card.id] ?? 0, () => options.onInspect(card.id), found(card), true);
        if (activeCopies(active, card.id)) tile.classList.add("is-equipped");
        return tile;
      }));
      section.append(header, list);
      return section;
    }));
  }

  function render() {
    const held = port.cards(), active = port.activeCards(), slots = port.slots();
    // Every zone open until the player closes it.
    open ??= { ...Object.fromEntries(mapIds.map(mapId => [mapId, true])), ...storedZones() };
    const state = JSON.stringify([view, type, picked, busy, held, active, slots, port.storedRanks(), open]);
    if (state === rendered) return;
    rendered = state;
    views.replaceChildren(choiceBar("cards-views", "Cards view", [{ id: "equip", text: "Equip" }, { id: "cards", text: "Cards" }], view,
      id => setView(id as CardsView)));
    collection.hidden = view !== "cards";
    equip.hidden = view !== "equip";
    if (view === "cards") renderCollection(held, active);
    else renderEquip(held, active, slots);
    filterCards();
  }

  return {
    element,
    render,
    show(visible: boolean) {
      element.hidden = !visible;
      if (visible) render();
    },
  };
}
