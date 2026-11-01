import { itemDisplayName } from "../../shared/items";
import { GEAR_GRADES, gradeIndex, type GearGrade } from "../../shared/gear-grades";
import { gradeOf, isGradeItemId, type GradeItemId } from "../../shared/grade-equipment";
import {
  GRADE_SHOP_LINES, bestHeldGradeIndex, gearSellerOf, gearSellerOfLine, gradeShopItemId, gradeShopLineKey, gradeShopNeed, gradeShopOffer, gradeShopOpen, gradeShopPrice,
  gradeShopSalePrice, masteryLevels, type GearSeller, type GradeShopLine, type MasteryLevels,
} from "../../shared/grade-shop";
import { weaponSchool as schoolOfWeapon, type WeaponSchool } from "../../shared/weapon-mastery";
import { weaponSkillLines, type WeaponSkillRoll } from "../../shared/weapon-skills";
import { itemInspectionButtonLabel } from "./item-inspection-controller";
import { formatGemAmount } from "./number-format";
import { refineStars } from "./refine-badge";
import {
  bagFullFor, gradeItemRow, gradeStepperElement, heldItemsFor, offerButton, offerLine, ownedRow, type CraftCoop, type CraftInventory,
} from "./craft-section";
import {
  gearComparison, schoolLines, wornInSlot, type WornLoadout,
} from "./smith-buy-plan";
import { asDetail, renderStationGrid, stationPick, stationViewMarkup, type StationTile } from "./station-grid";

type Result = { ok: boolean; error?: string } | undefined;
/** One copy of a piece in the bag: copy id 0 is the first copy, the one a slot holds. */
export type SellerItem = { itemId: string; copyId: bigint; equipped: boolean; roll?: WeaponSkillRoll | null };
type SellerView = "buy" | "sell";
type LineStatus = "open" | "owned" | "better" | "locked";
/** The word a Buy button shows when the piece cannot be bought. */
const STATUS_WORDS: Readonly<Record<LineStatus, string | undefined>> = { open: undefined, owned: "Owned", better: "Have Better", locked: "Locked" };
/** Why a Buy tile cannot be bought, said when it is tapped. */
const statusWhy = (status: LineStatus, itemId: GradeItemId) => status === "locked" ? `Needs ${gradeShopNeed(itemId)}`
  : status === "owned" ? "You Already Have This" : status === "better" ? "You Have A Better One" : undefined;

const nameOf = (itemId: string) => itemInspectionButtonLabel(itemDisplayName(itemId));
const key = (item: { itemId: string; copyId: bigint }) => `${item.itemId}:${item.copyId}`;
// The HUD's gold coin, beside every price in gold.
const GOLD_COIN = `<svg class="smith-coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#e3b23c" stroke="#7a4f12" stroke-width="1.5"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#a8741d" stroke-width="1.2"/></svg>`;
const SELLER_NAMES: Readonly<Record<GearSeller, string>> = { weapons: "Weapon Seller", armor: "Armor Seller" };
const viewStore = (seller: GearSeller) => `wildstat.gearSellerView.${seller}`;
function stored(name: string) {
  try { return localStorage.getItem(name); } catch { return null; }
}
function store(name: string, value: string) {
  try { localStorage.setItem(name, value); } catch { /* this visit only */ }
}
function pillButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inventory-filter";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}
function emptyNote(text: string) {
  const note = document.createElement("p");
  note.className = "smith-empty";
  note.textContent = text;
  return note;
}
function goldPrice(price: number) {
  const cost = document.createElement("span");
  cost.className = "smith-shop-price";
  cost.innerHTML = `${GOLD_COIN}<span></span>`;
  cost.lastElementChild!.textContent = formatGemAmount(BigInt(price));
  cost.setAttribute("aria-label", `${formatGemAmount(BigInt(price))} Gold`);
  return cost;
}

export type GearSellerDeps = {
  inTown: () => boolean;
  clearInput?: () => void;
  showMessage: (text: string, color: string) => void;
  gold: () => bigint;
  masteryLevels: () => MasteryLevels;
  /** Every item held or worn. */
  heldItems: () => readonly string[];
  bagFull: () => boolean;
  buyGear: (itemId: string, expectedPrice: number) => Promise<Result>;
  /** What the player wears, for "vs Now" and the HUD's chip. */
  worn: () => WornLoadout;
  slotTier: (itemId: string) => number;
  refineLevel: (itemId: string, copyId: bigint) => number;
  /** Every copy in the bag, worn or not, with a weapon's skills. */
  items: () => readonly SellerItem[];
  locked: (itemId: string, copyId: bigint) => boolean;
  sell: (itemId: string, copyId: bigint) => Promise<Result>;
};

/**
 * A gear seller's window, at its market stall in the Town: the Weapon Seller's bows, swords and staves, or the Armor
 * Seller's helmets, armor and boots. Buy sells graded gear for gold as Mastery opens it (buy_grade_gear); Sell buys a piece from the bag back, one copy at a time (sell_graded_item). The server decides.
 */
export function createGearSellerController(seller: GearSeller, deps: GearSellerDeps) {
  const titleId = `${seller === "weapons" ? "weapon" : "armor"}SellerTitle`;
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet smith-sheet station-sheet gear-seller-sheet";
  dialog.dataset.seller = seller;
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.innerHTML = `<header class="farm-header"><h2 id="${titleId}" class="window-banner"><span>${SELLER_NAMES[seller]}</span></h2></header>`
    + `<div class="quest-body"><div class="smith-views-bar"><div class="inventory-filters smith-views" role="group" aria-label="Seller view"></div>`
    + `<span class="smith-gold" aria-label="Your gold">${GOLD_COIN}<strong></strong></span></div>`
    // Each tab: the piece picked pinned on top, the grid to pick from under it.
    + stationViewMarkup("buy", "Gear to buy")
    + stationViewMarkup("sell", "Gear to sell")
    + `</div><footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  const viewBar = dialog.querySelector<HTMLElement>(".smith-views")!;
  const viewPart = (view: SellerView, selector: string) => dialog.querySelector<HTMLElement>(`[data-view="${view}"] ${selector}`)!;
  const lines = GRADE_SHOP_LINES.filter(line => gearSellerOfLine(line) === seller);

  let view: SellerView = stored(viewStore(seller)) === "sell" ? "sell" : "buy";
  for (const each of ["buy", "sell"] as const) {
    const button = pillButton(each === "buy" ? "Buy" : "Sell", () => { if (view !== each) { view = each; store(viewStore(seller), each); render(); } });
    button.dataset.view = each;
    viewBar.append(button);
  }

  /** The piece being bought, and the ones bought here before the server's row arrives. */
  let buyingGear: string | null = null;
  const justBought = new Set<string>();
  /** The grade picked for every line at once; each line's best the gold covers until the player steps. */
  let picked: GearGrade | null = null;
  /** The copy being sold, and the one asked once already: a sale takes a second tap. */
  let selling: string | null = null, confirming: string | null = null;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  /** The piece picked on each tab: a line on Buy, a copy on Sell; kept while the window is closed. */
  const selected: Record<SellerView, string | null> = { buy: null, sell: null };
  let rendered = "";

  const school = (worn = deps.worn()): WeaponSchool => schoolOfWeapon(worn.equippedRightHand || worn.equippedLeftHand || "");
  const heldGear = () => new Set([...deps.heldItems(), ...justBought]);
  const yourLines = (worn: WornLoadout) => schoolLines(school(worn)).filter(line => gearSellerOfLine(line) === seller);

  function compare(itemId: GradeItemId, worn: WornLoadout) {
    const current = wornInSlot(worn, itemId);
    return gearComparison(itemId, worn, { tier: deps.slotTier(itemId), wornRefine: current ? deps.refineLevel(current, 0n) : 0 });
  }

  /** Whether the gold buys a piece here, for the weapon in hand, that beats what is worn: the HUD's chip. */
  function buyReady() {
    const worn = deps.worn(), held = heldGear(), levels = deps.masteryLevels(), gold = deps.gold();
    return yourLines(worn).some(line => {
      const offer = gradeShopOffer(line, held, levels);
      if (offer.owned || !offer.open) return false;
      return offer.grades.map(grade => gradeShopItemId(line, grade))
        .some(itemId => gold >= BigInt(gradeShopPrice(itemId)!) && compare(itemId, worn).delta > 0);
    });
  }

  /** Copies in the bag this seller buys: graded, of its kinds, not the one worn. */
  function forSale() {
    return deps.items().filter(item => isGradeItemId(item.itemId) && gradeShopSalePrice(item.itemId) !== undefined
      && gearSellerOf(item.itemId) === seller && !(item.equipped && item.copyId === 0n))
      .sort((a, b) => gradeIndex(gradeOf(b.itemId)!) - gradeIndex(gradeOf(a.itemId)!) || nameOf(a.itemId).localeCompare(nameOf(b.itemId))
        || (a.copyId < b.copyId ? -1 : 1));
  }

  function state() {
    return JSON.stringify([view, selected, String(deps.gold()), deps.masteryLevels(), [...heldGear()].filter(gradeShopPrice), deps.bagFull(), deps.worn(),
      buyingGear, picked, selling, confirming,
      [...new Set(lines.map(line => deps.slotTier(gradeShopItemId(line, "crude"))))],
      forSale().map(item => [key(item), item.roll, deps.refineLevel(item.itemId, item.copyId), deps.locked(item.itemId, item.copyId)])]);
  }

  function render() {
    const now = state();
    if (now === rendered) return;
    rendered = now;
    for (const section of dialog.querySelectorAll<HTMLElement>(".smith-view")) section.hidden = section.dataset.view !== view;
    for (const button of viewBar.querySelectorAll<HTMLButtonElement>("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
    dialog.querySelector(".smith-gold strong")!.textContent = formatGemAmount(deps.gold());
    if (view === "buy") renderBuy();
    else renderSell();
  }

  /** Every grade some line here can be bought at now: what the one stepper picks from. */
  const buyableGrades = (held: ReadonlySet<string>, levels: MasteryLevels) =>
    GEAR_GRADES.filter(grade => lines.some(line => gradeShopOffer(line, held, levels).grades.includes(grade)));

  /**
   * A line's piece at the grade picked (or the best the gold covers), whether it is for sale (open), held or bettered
   * (owned, better) or waits on Mastery (locked), and whether its Buy can act.
   */
  function lineOffer(line: GradeShopLine, held: ReadonlySet<string>, levels: MasteryLevels) {
    const offer = gradeShopOffer(line, held, levels, Number(deps.gold()));
    const choice = picked && buyableGrades(held, levels).includes(picked) ? picked : null;
    const grade = choice ?? offer.grade, itemId = gradeShopItemId(line, grade);
    const status: LineStatus = offer.grades.includes(grade) ? "open" : held.has(itemId) ? "owned"
      : gradeIndex(grade) <= bestHeldGradeIndex(line, held) ? "better" : "locked";
    const ready = status === "open" && deps.gold() >= BigInt(gradeShopPrice(itemId)!) && !deps.bagFull();
    return { grade, itemId, status, ready };
  }

  /**
   * Buy: a tile per line of this seller's, offering any grade Mastery opens above the best one held. The line picked
   * shows a grade stepper (the best the gold covers to start, else the highest open), how it compares with what is
   * worn, its price and a Buy.
   */
  function renderBuy() {
    const worn = deps.worn(), held = heldGear(), levels = deps.masteryLevels();
    const tiles: StationTile[] = lines.map(line => {
      const { itemId, status, ready } = lineOffer(line, held, levels);
      return { key: gradeShopLineKey(line), itemId, tier: deps.slotTier(itemId), waits: !ready, why: statusWhy(status, itemId) };
    });
    selected.buy = stationPick(tiles, selected.buy);
    renderStationGrid(viewPart("buy", ".station-grid"), tiles, selected.buy, pick => {
      selected.buy = pick;
      render();
      const why = tiles.find(tile => tile.key === pick)?.why;
      if (why) deps.showMessage(why, "#ff9b91");
    });
    const line = lines.find(each => gradeShopLineKey(each) === selected.buy);
    viewPart("buy", ".station-detail").replaceChildren(...(line ? [asDetail(buyDetail(line, worn, held, levels))] : []));
  }

  function buyDetail(line: GradeShopLine, worn: WornLoadout, held: ReadonlySet<string>, levels: MasteryLevels) {
    const { grade, itemId, status } = lineOffer(line, held, levels), grades = buyableGrades(held, levels);
    // With nothing left to step to, the top grade held says Owned.
    if (status === "owned" && !grades.includes(grade)) return ownedRow(itemId).row;
    // Only a locked line names what it waits for.
    const { row, deal } = gradeItemRow(itemId, 0, status === "locked" ? [{ text: `Needs ${gradeShopNeed(itemId)}`, met: false }] : []);
    row.querySelector(".smith-shop-stat")!.after(comparisonTag(itemId, worn));
    const stepper = grades.includes(grade) ? gradeStepperElement(grades, grade, {
      label: "Grade to buy", busy: buyingGear !== null, onPick: to => { picked = to; render(); },
    }) : null;
    deal.append(buyLine(itemId, levels, stepper, status));
    return row;
  }

  /** "×1.14 Damage vs Now": what the piece changes against what is worn in its slot. */
  function comparisonTag(itemId: GradeItemId, worn: WornLoadout) {
    const { delta, text } = compare(itemId, worn);
    const tag = document.createElement("span");
    tag.className = `smith-compare ${delta > 0 ? "is-better" : delta < 0 ? "is-worse" : "is-same"}`;
    tag.textContent = text;
    return tag;
  }

  /** The grade, its price in gold and a Buy button that says why it waits: Mastery, then gold, then the bag. */
  function buyLine(itemId: GradeItemId, levels: MasteryLevels, stepper: HTMLElement | null, status: LineStatus) {
    const price = gradeShopPrice(itemId)!, gold = deps.gold();
    const text = buyingGear === itemId ? "Buying…" : status === "owned" || status === "better" ? STATUS_WORDS[status]! : !gradeShopOpen(itemId, levels) ? "Locked"
      : gold < BigInt(price) ? "Need Gold" : deps.bagFull() ? "Bag Full" : "Buy";
    const cost = goldPrice(price);
    const line = offerLine(stepper ? [stepper, cost] : [cost], offerButton(text, text === "Buy" && buyingGear === null, () => { void buyGear(itemId, price); }));
    // Stacked: the grade, then its price.
    if (stepper) line.classList.add("buy-offer");
    return line;
  }

  /** Sell: a tile per copy in the bag this seller buys; the one picked shows its refine and skills, what it pays, and one Sell (a second tap sells). */
  function renderSell() {
    const items = forSale();
    const tiles: StationTile[] = items.map(item => {
      const locked = deps.locked(item.itemId, item.copyId);
      return { key: key(item), itemId: item.itemId, copyId: item.copyId, refine: deps.refineLevel(item.itemId, item.copyId), badge: locked ? "Locked" : undefined, waits: locked };
    });
    selected.sell = stationPick(tiles, selected.sell);
    renderStationGrid(viewPart("sell", ".station-grid"), tiles, selected.sell, pick => { selected.sell = pick; render(); });
    const item = items.find(each => key(each) === selected.sell);
    viewPart("sell", ".station-detail").replaceChildren(item ? asDetail(sellDetail(item)) : emptyNote("Nothing to sell here. Worn gear stays on you."));
  }

  function sellDetail(item: SellerItem) {
    const itemId = item.itemId as GradeItemId, price = gradeShopSalePrice(itemId)!, itemKey = key(item), locked = deps.locked(itemId, item.copyId);
    const { row, deal } = gradeItemRow(itemId, deps.refineLevel(itemId, item.copyId));
    row.dataset.copyId = String(item.copyId);
    const skills = weaponSkillLines(itemId, item.roll);
    if (skills.length) {
      const line = document.createElement("span");
      line.className = "craft-hint";
      line.textContent = skills.join(" · ");
      row.querySelector(".smith-shop-copy")!.append(line);
    }
    const text = locked ? "Locked" : selling === itemKey ? "Selling…" : confirming === itemKey ? "Tap Again To Sell" : "Sell";
    deal.append(offerLine([goldPrice(price)], offerButton(text, !locked && selling === null, () => { void sell(item, price); })));
    return row;
  }

  async function sell(item: SellerItem, price: number) {
    const itemKey = key(item);
    if (selling) return;
    if (confirming !== itemKey) {
      confirming = itemKey;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { if (confirming === itemKey) { confirming = null; if (dialog.open) render(); } }, 4_000);
      render();
      return;
    }
    confirming = null;
    selling = itemKey;
    render();
    try {
      const result = await deps.sell(item.itemId, item.copyId);
      if (result?.ok) deps.showMessage(`Sold · ${withStars(item)} · +${formatGemAmount(BigInt(price))} Gold`, "#ffd75e");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      selling = null;
      if (dialog.open) render();
    }
  }
  const withStars = (item: SellerItem) => `${nameOf(item.itemId)} ${refineStars(deps.refineLevel(item.itemId, item.copyId))}`.trim();

  async function buyGear(itemId: GradeItemId, price: number) {
    if (buyingGear) return;
    buyingGear = itemId;
    render();
    try {
      const result = await deps.buyGear(itemId, price);
      if (result?.ok) {
        justBought.add(itemId);
        deps.showMessage(`Bought · ${nameOf(itemId)}. Equip it from your bag.`, "#ffd75e");
      } else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      buyingGear = null;
      if (dialog.open) render();
    }
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    deps.clearInput?.();
    return true;
  }

  function open() {
    if (!deps.inTown() || dialog.open) return;
    // Each visit goes by the server's word on the bag.
    justBought.clear();
    picked = null;
    confirming = null;
    rendered = "";
    render();
    deps.clearInput?.();
    dialog.showModal();
    back.focus();
  }

  back.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return {
    open, close, isOpen: () => dialog.open, render, destroy() { close(); dialog.remove(); },
    buyReady,
  };
}

type SellerCoop = CraftCoop & {
  gold?: () => bigint;
  buyGradeGear?: (itemId: string, expectedPrice: number) => Promise<Result>;
  itemUpgradeLevel?: (itemId: string) => number;
  equipmentLocked?: (itemId: string, copyId?: bigint) => boolean;
  sellGradedItem?: (itemId: string, copyId: bigint) => Promise<Result>;
};

/** The Weapon and Armor Sellers as main.ts uses them: the coop session, the bag's copies, and the HUD's chip. */
export function createGearSellerRuntime(deps: {
  coop: () => SellerCoop | null | undefined;
  inventory: CraftInventory;
  showMessage: (text: string, color: string) => void;
  clearInput?: () => void;
  inTown: () => boolean;
  /** The HUD's Gear Upgrades chip, shown while either seller has an upgrade the gold buys. */
  notice?: HTMLElement | null;
}) {
  const { inventory } = deps;
  const worn = () => new Set([inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet ?? "", inventory.equippedRightHand, inventory.equippedLeftHand]);
  const sellerDeps: GearSellerDeps = {
    inTown: deps.inTown, clearInput: deps.clearInput, showMessage: deps.showMessage,
    gold: () => deps.coop()?.gold?.() ?? 0n,
    masteryLevels: () => masteryLevels(deps.coop()?.weaponMastery?.() ?? {}),
    heldItems: () => heldItemsFor(deps.coop(), inventory),
    bagFull: () => bagFullFor(deps.coop(), inventory),
    buyGear: async (itemId, expectedPrice) => deps.coop()?.buyGradeGear?.(itemId, expectedPrice) ?? { ok: false, error: "Not Connected" },
    worn: () => inventory,
    slotTier: itemId => deps.coop()?.itemUpgradeLevel?.(itemId) ?? 0,
    refineLevel: (itemId, copyId) => deps.coop()?.itemRefine?.(itemId, copyId) ?? 0,
    items: () => {
      const wearing = worn(), coop = deps.coop();
      return [
        ...[...new Set(inventory.itemIds)].map(itemId => ({ itemId, copyId: 0n, equipped: wearing.has(itemId), roll: coop?.weaponSkills?.(itemId) ?? null })),
        ...(coop?.equipmentCopies?.() ?? []).filter(copy => inventory.itemIds.includes(copy.itemId))
          .map(copy => ({ itemId: copy.itemId, copyId: copy.id, equipped: false, roll: copy.roll ?? null })),
      ];
    },
    locked: (itemId, copyId) => deps.coop()?.equipmentLocked?.(itemId, copyId) ?? false,
    sell: async (itemId, copyId) => deps.coop()?.sellGradedItem?.(itemId, copyId) ?? { ok: false, error: "Not Connected" },
  };
  const sellers = { weapons: createGearSellerController("weapons", sellerDeps), armor: createGearSellerController("armor", sellerDeps) };
  const all = [sellers.weapons, sellers.armor];
  const notice = deps.notice === undefined ? document.getElementById("smithBuyNotice") : deps.notice;
  return {
    sellers,
    open(seller: GearSeller) { sellers[seller].open(); },
    close() { for (const each of all) each.close(); },
    isOpen: () => all.some(each => each.isOpen()),
    render() { for (const each of all) if (each.isOpen()) each.render(); },
    /** Shows or hides the HUD chip; the session's refresh calls it as rows change. */
    refreshNotice() { if (notice) notice.hidden = !all.some(each => each.buyReady()); },
    buyReady: () => all.some(each => each.buyReady()),
  };
}
