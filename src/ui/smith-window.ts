import { itemDefinition, itemDisplayName, itemStats } from "../../shared/items";
import {
  REFINE_MAX, REFINE_ORES, isRefinableItem, refineCost, refineSafeLimit, refineSuccessChance, type OreId,
} from "../../shared/refine";
import { itemArtMarkup } from "../game/item-presentation";
import { itemInspectionButtonLabel } from "./item-inspection-controller";
import { formatEquipmentStat } from "./equipment-stat-format";
import { refineStars } from "./refine-badge";
import { REFINE_ORE_ORDER } from "../../shared/ore-bag";
import { itemGradeRank } from "../../shared/item-tier";
import { craftDepsFor, createCraftSection, materialList, type CraftCoop, type CraftSectionDeps } from "./craft-section";
import { mountToolSection, toolDepsFor, type ToolSectionDeps } from "./tool-section";
import { asDetail, renderStationGrid, stationPick, stationViewMarkup, type StationTile } from "./station-grid";
import { createAutoRefine } from './auto-refine';

type Result = { ok: boolean; error?: string } | undefined;
type RefineResult = { itemId: string; copyId: bigint; fromLevel: number; toLevel: number; succeeded: boolean };
/** One copy of an item the player holds: copy id 0 is the first copy, the one a slot holds. */
export type SmithItem = { itemId: string; copyId: bigint; equipped: boolean };

const key = (item: { itemId: string; copyId: bigint }) => `${item.itemId}:${item.copyId}`;
/** The bag's filters for the gear the Smith works on. */
const SMITH_FILTERS = [["ALL", "All"], ["HAND", "Weapons"], ["CHEST", "Armor"], ["HEAD", "Helmets"], ["FEET", "Boots"]] as const;
const nameOf = (itemId: string) => itemInspectionButtonLabel(itemDisplayName(itemId));
// Refine Luck moves the odds by fractions of a percent, so they keep their decimals (2.2%, 0.031%).
const percent = (chance: number) => {
  const value = chance * 100;
  return `${Number(value.toFixed(value >= 10 ? 1 : value >= 1 ? 2 : 3))}%`;
};

/** The Smith's tabs, one job each; the last picked is kept on the device. Buying is the sellers' (gear-seller-window.ts). */
export type SmithView = "craft" | "reforge" | "refine" | "tools";
const VIEW_STORE = "wildstat.smithView";
const VIEW_NAMES: Readonly<Record<SmithView, string>> = { craft: "Craft", reforge: "Reforge", refine: "Refine", tools: "Tools" };
// Tabs a device kept before these.
const OLD_VIEWS: Readonly<Record<string, SmithView>> = { gear: "craft", buy: "craft", upgrade: "tools", slots: "tools" };
function stored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* this visit only */ }
}

/**
 * The Smith's window, in the Town's smithy: he makes and improves gear. Craft a new piece, Reforge a weapon held,
 * Refine a copy (see what a try costs and how likely it is), and upgrade the tools. The server rolls and decides
 * (craft_grade_item, reforge_weapon, refine_item, upgrade_tool); this window only shows the odds, asks, and shows how it went.
 */
export function createSmithController(deps: {
  inTown: () => boolean;
  connected?: () => boolean;
  clearInput?: () => void;
  items: () => SmithItem[];
  refineLevel: (itemId: string, copyId: bigint) => number;
  /** The slot's tier, for the stat preview: refines multiply the stat as the slot tier has left it. */
  slotTier: (itemId: string) => number;
  ores: () => Readonly<Partial<Record<OreId, number>>>;
  refine: (itemId: string, copyId: bigint, expectedLevel: number) => Promise<Result>;
  /** Refine Luck's rank, which raises the odds the server rolls against. */
  refineLuck?: () => number;
  /** Fails in a row on a copy at its level, which raise its next try's chance. */
  refineFails?: (itemId: string, copyId: bigint, level: number) => number;
  showMessage: (text: string, color: string) => void;
  /** The Mining (shared/mining.ts) and Woodcutting (shared/woodcutting.ts) stats, beside where the ore and wood are. */
  mining?: () => number;
  woodcutting?: () => number;
  /** Smithing, Fletching and Enchanting: every line crafted here, on the Craft tab, and Reforge (craft-section.ts). */
  craft?: CraftSectionDeps;
  tools?: ToolSectionDeps;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet smith-sheet station-sheet";
  dialog.setAttribute("aria-labelledby", "smithTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="smithTitle" class="window-banner"><span>The Smith</span></h2></header>`
    + `<div class="quest-body"><div class="smith-views-bar"><div class="inventory-filters smith-views" role="group" aria-label="Smith view"></div></div>`
    // Each tab: the piece picked pinned on top, the grid to pick from under it.
    // Arrows in a grid of their own under the gear.
    + stationViewMarkup("craft", "Gear to craft", {
      after: `<h3 class="station-subhead">Arrows</h3><div class="inventory-items station-grid station-arrows" role="listbox" aria-label="Arrows to craft"></div>`,
    })
    + stationViewMarkup("reforge", "Weapons to reforge", {
      after: `<p class="farm-map smith-intro">Roll a weapon's skills again for the same materials as crafting it. Each skill keeps the better roll.</p>`,
    })
    + stationViewMarkup("refine", "Your gear", {
      before: `<div class="inventory-filters smith-filters" role="group" aria-label="Show gear"></div>`,
      after: `<p class="smith-ores" aria-label="Your ores"></p>`
        + `<p class="farm-map smith-intro">Refine gear with ore. Safe up to its limit; past it a try can fail, and a fail costs only the ore.</p>`,
    })
    // Tools: the five tools, and where their ore and wood come from.
    + `<section class="smith-view smith-tools-view" data-view="tools">`
    + `<div class="smith-tools"></div>`
    + `<div class="smith-mining"><span class="smith-mining-text"></span></div>`
    + `<div class="smith-mining"><span class="smith-woodcutting-text"></span></div>`
    + `</section></div>`

    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const viewPart = (view: SmithView, selector: string) => dialog.querySelector<HTMLElement>(`[data-view="${view}"] ${selector}`)!;
  const focus = viewPart("refine", ".station-detail");
  focus.classList.add("smith-focus");
  const oreLine = dialog.querySelector<HTMLElement>(".smith-ores")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  const miningText = dialog.querySelector<HTMLElement>(".smith-mining-text")!;
  const woodcuttingText = dialog.querySelector<HTMLElement>(".smith-woodcutting-text")!;
  const filterBar = dialog.querySelector<HTMLElement>(".smith-filters")!;
  const viewBar = dialog.querySelector<HTMLElement>(".smith-views")!;
  // The three crafts' levels sit under the Craft grid.
  const crafts = deps.craft ? createCraftSection(deps.craft, { onChange: () => { if (dialog.open) render(); } }) : null;
  if (crafts) viewPart("craft", ".station-scroll").append(crafts.element);
  const tools = mountToolSection(dialog, deps.tools, () => { if (dialog.open) render(); });
  // Making first, then improving: crafting, reforging, refining and the tools.
  const views = ([
    ["craft", Boolean(deps.craft)], ["reforge", Boolean(deps.craft)], ["refine", true], ["tools", Boolean(deps.tools || deps.mining || deps.woodcutting)],
  ] as const).filter(([, shown]) => shown).map(([view]) => view as SmithView);
  const storedView = () => { const value = stored(VIEW_STORE) ?? ""; return views.find(each => each === (OLD_VIEWS[value] ?? value)); };
  let view: SmithView = storedView() ?? views[0];
  viewBar.parentElement!.hidden = views.length < 2;
  for (const each of views) {
    const button = pillButton(VIEW_NAMES[each], () => { if (view !== each) { auto.stop(); view = each; store(VIEW_STORE, each); render(); } });
    button.dataset.view = each;
    viewBar.append(button);
  }
  /** The gear shown, as the bag filters it: everything, or one kind. */
  let shown: (typeof SMITH_FILTERS)[number][0] = "ALL";
  for (const [kind, label] of SMITH_FILTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-filter";
    button.dataset.filter = kind;
    button.textContent = label;
    button.addEventListener("click", () => { if (shown !== kind) { auto.stop(); shown = kind; render(); } });
    filterBar.append(button);
  }
  /** The piece picked on each tab, kept while the window is closed. */
  let selected: string | null = null;
  const picked: Partial<Record<"craft" | "reforge", string | null>> = {};
  let refining = false;
  let renderedState = "";
  const auto = createAutoRefine({
    valid: item => dialog.open && view === 'refine' && deps.inTown() && (deps.connected?.() ?? true)
      && deps.items().some(held => key(held) === key(item)),
    next: item => { const next = nextTry(item); return { level: next.level, ready: !refining && next.ready }; },
    attempt: (item, level) => refine({ ...item, equipped: false }, level, true),
    onStop: () => { queueMicrotask(() => { if (dialog.open) render(); }); },
  });

  function choices() {
    return deps.items().filter(item => isRefinableItem(item.itemId) && (shown === "ALL" || itemDefinition(item.itemId)?.slot === shown))
      // Worn first, then the bag by grade as the bag sorts it, highest first; a kept copy after its first copy.
      .sort((a, b) => Number(b.equipped) - Number(a.equipped) || (itemGradeRank(b.itemId) ?? -1) - (itemGradeRank(a.itemId) ?? -1)
        || nameOf(a.itemId).localeCompare(nameOf(b.itemId)) || (a.copyId < b.copyId ? -1 : 1));
  }

  /** A copy's next try: what it costs, and whether it can be made now. */
  function nextTry(item: Pick<SmithItem, 'itemId' | 'copyId'>) {
    const level = deps.refineLevel(item.itemId, item.copyId), atTop = level >= REFINE_MAX;
    const cost = atTop ? null : refineCost(item.itemId, level + 1), held = deps.ores();
    const short = cost ? Object.entries(cost).filter(([oreId, count]) => (held[oreId as OreId] ?? 0) < (count ?? 0)) : [];
    return { level, atTop, cost, short, ready: !atTop && short.length === 0 };
  }

  function renderFocus(item: SmithItem | undefined) {
    if (!item) {
      const filter = SMITH_FILTERS.find(([kind]) => kind === shown)?.[1].toLowerCase();
      focus.innerHTML = `<p class="smith-empty"></p>`;
      focus.firstElementChild!.textContent = shown === "ALL" ? "Bring the Smith a weapon, helmet, armor or boots to refine." : `No ${filter ?? "gear"} to bring`;
      return;
    }
    const { level, atTop, cost, short } = nextTry(item), next = level + 1, tier = deps.slotTier(item.itemId);
    const safe = refineSafeLimit(item.itemId), luck = deps.refineLuck?.() ?? 0, fails = deps.refineFails?.(item.itemId, item.copyId, level) ?? 0;
    const base = atTop ? 0 : refineSuccessChance(item.itemId, next, luck), chance = atTop ? 0 : refineSuccessChance(item.itemId, next, luck, fails);
    // A small step can round away at two decimals (×1.05 → ×1.05); then both sides show three.
    const pair = (decimals: number) => [itemStats(item.itemId, { tier, refine: level }, decimals)[0], atTop ? "" : itemStats(item.itemId, { tier, refine: next }, decimals)[0]];
    let [now, after] = pair(2);
    if (now === after) [now, after] = pair(3);
    focus.replaceChildren();
    // Title case, as the item window shows stats ("Damage ×1.07").
    const stat = formatEquipmentStat(itemInspectionButtonLabel(now ?? ""));
    const head = itemHead(item, atTop ? `${stat} · Fully Refined` : `${stat} → ${formatEquipmentStat(after?.split(" ").pop() ?? "")}`);
    const facts = document.createElement("dl");
    facts.className = "smith-facts";
    const fact = (label: string, value: string, tone = "") => {
      const row = document.createElement("div");
      if (tone) row.className = tone;
      row.innerHTML = "<dt></dt><dd></dd>";
      row.querySelector("dt")!.textContent = label;
      row.querySelector("dd")!.textContent = value;
      facts.append(row);
    };
    if (!atTop) {
      fact("Chance", next <= safe ? "Safe" : percent(chance), next <= safe ? "is-safe" : "is-risky");
      // Each fail in a row adds a little, so a dry streak still shows progress.
      if (next > safe && chance > base) fact(`${fails} Fails`, `+${percent(chance - base)}`);
      fact("Safe to", `★${safe}`);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "farm-start smith-refine";
    button.textContent = atTop ? `★${REFINE_MAX}` : refining ? "Refining…" : "Refine";
    button.disabled = atTop || refining || auto.running() || short.length > 0;
    if (short.length) button.textContent = `Need ${short.map(([oreId]) => REFINE_ORES[oreId as OreId].name).join(" + ")}`;
    button.addEventListener("click", () => { void refine(item, level); });
    focus.append(head, facts);
    // What the try costs, each ore held against needed.
    if (cost) focus.append(materialList(cost as Record<string, number>, deps.ores()));
    auto.setManualButton(button);
    auto.update(item);
    focus.append(auto.element);
  }

  function itemHead(item: SmithItem, line: string) {
    const head = document.createElement("div");
    head.className = "smith-item";
    head.innerHTML = `<span class="smith-art">${itemArtMarkup(item.itemId)}</span><span class="smith-copy"><strong></strong><span class="smith-stat"></span></span>`;
    head.querySelector("strong")!.textContent = `${nameOf(item.itemId)} ${refineStars(deps.refineLevel(item.itemId, item.copyId))}`.trim();
    head.querySelector(".smith-stat")!.textContent = line;
    return head;
  }


  function render() {
    crafts?.render();
    tools?.render();
    const items = choices();
    const refineTiles: StationTile[] = items.map(item => ({
      key: key(item), itemId: item.itemId, copyId: item.copyId, refine: deps.refineLevel(item.itemId, item.copyId),
      tier: deps.slotTier(item.itemId), badge: item.equipped ? "Worn" : undefined, waits: !nextTry(item).ready,
    }));
    selected = stationPick(refineTiles, selected);
    const chosen = items.find(item => key(item) === selected);
    auto.update(chosen);
    // Only the tab on screen lists its tiles; picking another tab renders it.
    const craftTiles = view === "craft" && crafts ? crafts.craftTiles() : [];
    const arrowTiles = view === "craft" && crafts ? crafts.arrowTiles() : [];
    const reforgeTiles = view === "reforge" && crafts ? crafts.reforgeTiles() : [];
    if (view === "craft") picked.craft = stationPick([...craftTiles, ...arrowTiles], picked.craft ?? null);
    if (view === "reforge") picked.reforge = stationPick(reforgeTiles, picked.reforge ?? null);
    // Presence updates also refresh open windows. Keep focus and buttons in place until this window changes.
    const state = JSON.stringify([
      view, shown, selected, picked, refining, auto.running(), deps.refineLuck?.(),
      chosen && deps.refineFails?.(chosen.itemId, chosen.copyId, deps.refineLevel(chosen.itemId, chosen.copyId)),
      deps.ores(), deps.mining?.(), deps.woodcutting?.(), crafts?.state(), refineTiles,
    ], (_key, value) => typeof value === "bigint" ? String(value) : value);
    if (state === renderedState) return;
    renderedState = state;
    for (const section of dialog.querySelectorAll<HTMLElement>(".smith-view")) section.hidden = section.dataset.view !== view;
    for (const button of viewBar.querySelectorAll<HTMLButtonElement>("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
    for (const button of filterBar.querySelectorAll<HTMLButtonElement>(".inventory-filter")) button.setAttribute("aria-pressed", String(button.dataset.filter === shown));
    const held = deps.ores();
    oreLine.textContent = REFINE_ORE_ORDER.map(oreId => `${REFINE_ORES[oreId].name} ${held[oreId] ?? 0}`).join(" · ");
    // Where the ore and wood come from: every player holds a pickaxe and a hatchet.
    miningText.textContent = `Mining ${deps.mining?.() ?? 0} · Ore is in the Copper Hills, east of Town`;
    woodcuttingText.textContent = `Woodcutting ${deps.woodcutting?.() ?? 0} · Wood is in Timberwood, west of Town`;
    if (view === "refine") {
      renderFocus(chosen);
      renderStationGrid(viewPart("refine", ".station-grid"), refineTiles, selected, pick => { selected = pick; render(); });
    } else if (view === "craft" && crafts) {
      viewPart("craft", ".station-detail").replaceChildren(...detailOf(picked.craft ? crafts.craftDetail(picked.craft) : null));
      renderStationGrid(viewPart("craft", ".station-grid"), craftTiles, picked.craft ?? null, pick => {
        picked.craft = pick;
        render();
        const why = craftTiles.find(tile => tile.key === pick)?.why;
        if (why) deps.showMessage(why, "#ff9b91");
      });
      renderStationGrid(viewPart("craft", ".station-arrows"), arrowTiles, picked.craft ?? null, pick => { picked.craft = pick; render(); });
      viewPart("craft", ".station-subhead").hidden = !arrowTiles.length;
    } else if (view === "reforge" && crafts) {
      viewPart("reforge", ".station-detail").replaceChildren(...detailOf(picked.reforge ? crafts.reforgeDetail(picked.reforge) : null, "No weapon to reforge yet. Craft one first."));
      renderStationGrid(viewPart("reforge", ".station-grid"), reforgeTiles, picked.reforge ?? null, pick => { picked.reforge = pick; render(); });
    }
  }

  /** The picked piece's row as the pinned detail, or a line saying there is nothing to pick. */
  function detailOf(row: HTMLElement | null | undefined, empty = "") {
    if (row) return [asDetail(row)];
    if (!empty) return [];
    const note = document.createElement("p");
    note.className = "smith-empty";
    note.textContent = empty;
    return [note];
  }

  async function refine(item: SmithItem, level: number, automatic = false): Promise<boolean> {
    if (refining || (!automatic && auto.running())) return false;
    refining = true;
    if (!automatic) auto.manualStart(item, level);
    render();
    try {
      const result = await deps.refine(item.itemId, item.copyId, level);
      if (!result?.ok) {
        if (!automatic) auto.manualError(result?.error ?? 'Not connected');
        deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
      }
      return Boolean(result?.ok);
    } catch {
      if (!automatic) auto.manualError('Refine error');
      return false;
    } finally {
      refining = false;
      if (dialog.open) render();
    }
  }

  /** The server's verdict on a try (player_refine_result), shown where the player is looking. */
  function showResult(result: RefineResult) {
    auto.result(result);
    const name = `${nameOf(result.itemId)} ${refineStars(result.toLevel) || "★0"}`;
    deps.showMessage(result.succeeded ? `Refined · ${name}` : `Refine Failed · ${name}`, result.succeeded ? "#ffd75e" : "#ff9b91");
    if (dialog.open) render();
  }

  function close() {
    auto.stop();
    if (!dialog.open) return false;
    dialog.close();
    deps.clearInput?.();
    return true;
  }

  /** Opens on the tab asked for, else the one last picked. */
  function open(on?: SmithView) {
    if (!deps.inTown() || dialog.open) return;
    view = on && views.includes(on) ? on : storedView() ?? views[0];
    crafts?.reset();
    render();
    deps.clearInput?.();
    dialog.showModal();
    render();
    back.focus();
  }

  back.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => auto.stop());
  const visibility = () => { if (document.hidden) auto.stop(); };
  document.addEventListener('visibilitychange', visibility);
  return {
    open, close, isOpen: () => dialog.open, render, showResult, destroy() { close(); document.removeEventListener('visibilitychange', visibility); dialog.remove(); },
  };
}

/** A pill in a toggle: pressed is the one shown. */
function pillButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inventory-filter";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

/** The Smith as main.ts uses it: crafting and refining through the coop session, the bag's copies, and each try's verdict. */
export function createSmithRuntime(deps: {
  coop: () => (CraftCoop & {
    mining?: () => number;
    woodcutting?: () => number;
    itemRefine?: (itemId: string, copyId?: bigint) => number;
    itemUpgradeLevel?: (itemId: string) => number;
    ores?: () => Readonly<Partial<Record<OreId, number>>>;
    refineItem?: (itemId: string, copyId: bigint, expectedLevel: number) => Promise<Result>;
    refineFails?: (itemId: string, copyId: bigint, level: number) => number;
    researchInPlay?: () => { refineLuck?: number };
    setOnRefineResult?: (callback: ((result: RefineResult) => void) | null) => void;
    isConnected?: () => boolean;
  }) | null | undefined;
  inventory: { itemIds: string[]; equippedHead: string; equippedChest: string; equippedFeet?: string; equippedRightHand: string; equippedLeftHand: string };
  showMessage: (text: string, color: string) => void;
  clearInput?: () => void;
  inTown: () => boolean;
}) {
  const { inventory } = deps;
  const worn = () => new Set([inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet ?? "", inventory.equippedRightHand, inventory.equippedLeftHand]);
  const smith = createSmithController({
    inTown: deps.inTown, clearInput: deps.clearInput, showMessage: deps.showMessage,
    connected: () => deps.coop()?.isConnected?.() ?? false,
    items: () => {
      const wearing = worn();
      return [
        ...[...new Set(inventory.itemIds)].map(itemId => ({ itemId, copyId: 0n, equipped: wearing.has(itemId) })),
        ...(deps.coop()?.equipmentCopies?.() ?? []).map(copy => ({ itemId: copy.itemId, copyId: copy.id, equipped: false })),
      ];
    },
    refineLevel: (itemId, copyId) => deps.coop()?.itemRefine?.(itemId, copyId) ?? 0,
    slotTier: itemId => deps.coop()?.itemUpgradeLevel?.(itemId) ?? 0,
    ores: () => deps.coop()?.ores?.() ?? {},
    refine: async (itemId, copyId, expectedLevel) => deps.coop()?.refineItem?.(itemId, copyId, expectedLevel) ?? { ok: false, error: "Not Connected" },
    refineLuck: () => deps.coop()?.researchInPlay?.()?.refineLuck ?? 0,
    refineFails: (itemId, copyId, level) => deps.coop()?.refineFails?.(itemId, copyId, level) ?? 0,
    mining: () => deps.coop()?.mining?.() ?? 0,
    woodcutting: () => deps.coop()?.woodcutting?.() ?? 0,
    craft: craftDepsFor(deps.coop, inventory, deps.showMessage),
    tools: toolDepsFor(deps.coop, deps.showMessage),
  });
  let listening = false;
  return {
    ...smith,
    open(view?: SmithView) {
      // Each try's verdict arrives as a row; listen from the first visit the session is up for.
      const coop = deps.coop();
      if (!listening && coop?.setOnRefineResult) { coop.setOnRefineResult(result => smith.showResult(result)); listening = true; }
      smith.open(view);
    },
  };
}
