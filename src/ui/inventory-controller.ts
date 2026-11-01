import { createInventoryLockMode } from "./inventory-lock-mode";
import { createInventoryFilters, type InventoryFilter } from "./inventory-filters";
import {
  bagInventoryStacks,
  type EquipmentSlot,
  type InventoryState,
} from "../game/inventory";
import { requiredElement } from "../game/runtime/dom";
import { canDestroyEquipment, itemDefinition, itemDisplayName } from "../../shared/items";
import { COSMETIC_CONVERSION_GEM_COST, canConvertToCosmetic } from "../../shared/cosmetic-conversion";
import { inventoryMoveActions, inventoryWeaponSlot, renderInventoryView, type InventoryMode } from "./hud";
import type { ItemInspectionAction, ItemInspectionController } from "./item-inspection-controller";
import {
  MAX_INVENTORY_SLOT_CAPACITY,
  bagSlotCapacity,
  inventorySlotCapacity,
  inventorySlotUnlockCost,
} from "../../shared/gems";
import { gemSpendConfirmation } from "./gem-spend-confirmation";
import { gameConfirm, type ConfirmPrompt, type ConfirmRequest } from "./confirm-dialog";
import { type WeaponSkillRoll } from "../../shared/weapon-skills";
import { createInventoryDeleteMode } from "./inventory-delete-mode";
import { withRefineStars } from "./refine-badge";
import { REFINE_ORES, salvageOre, type OreId } from "../../shared/refine";
import { gradeShopSalePrice } from "../../shared/grade-shop";
import { cardDetailRequest, createCardsTab, type CardsPort } from "./cards-tab";
import { cardDefinition } from "../../shared/cards";
import { cardName } from "../../shared/card-text";
import type { BuildActions } from "./build-actions";
import { createBuildsTab } from "./builds-tab";
import { installBuildHotkeys } from "./build-hotkeys";
import { itemInspectionButtonLabel } from "./item-inspection-controller";
import { oreKindsHeld } from "../../shared/ore-bag";
import { toolArtSource } from "../game/runtime/town/tool-sprites";
import type { ToolId } from "../../shared/tools";
import { isArrowId, type ArrowId } from "../../shared/arrows";

type InventoryLocation = EquipmentSlot | "BAG" | "";
type SelectableInventory = InventoryState & { selectedItemId: string; selectedItemLocation?: InventoryLocation };
type Result = { ok: boolean; error?: string } | undefined;
/** A copy kept from a duplicate drop, beyond the item's first. */

/** Where a look shows: a hand look on any weapon (shared/equipment-appearance.ts). */
export function cosmeticReach(itemId: string) {
  return itemDefinition(itemId)?.slot === "HAND" ? "Shows on any weapon" : "Appearance only";
}

export type KeptEquipmentCopy = { id: bigint; itemId: string; roll: WeaponSkillRoll };

type InventoryDependencies = {
  inventory: SelectableInventory;
  move: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  moveCosmetic: (itemId: string, destination: EquipmentSlot | "BAG") => boolean;
  toggleCosmeticVisibility: (destination: EquipmentSlot) => boolean;
  upgradeLevel: (itemId: string) => number;
  slotTier?: (slot: "HAND" | "HEAD" | "CHEST") => number;
  /** One copy's refine (★N); `copyId` 0n is the first copy, the one a slot holds. */
  refineLevel?: (itemId: string, copyId?: bigint) => number;
  /** The refine a look's art is drawn at: the item's own or its cosmetic's kept ★10/★20 (local-item-refines.ts). */
  lookRefine?: (itemId: string) => number;
  /** Ores held, by kind (mined in the Copper Hills, spent at the Smith): a stack in one bag slot each. */
  ores?: () => Readonly<Partial<Record<OreId, number>>>;
  /** The Cards tab: cards owned and active, the odds at each, and switching them on and off. */
  cards?: CardsPort;
  /** Saved loadouts for the Builds tab; without them the tab is not shown. */
  builds?: BuildActions;
  destroyOre?: (oreId: OreId, expectedCount: number) => Promise<Result>;
  /** The arrow kind the bow has nocked (shared/arrows.ts), and nocking one, or none for plain arrows. */
  nockedArrow?: () => ArrowId | null;
  nockArrow?: (arrowId: ArrowId | null) => Promise<Result>;
  equipBest?: () => boolean;
  equipmentLocked?: (itemId: string, copyId?: bigint) => boolean;
  setEquipmentLocked?: (itemId: string, locked: boolean, copyId?: bigint) => Promise<Result>;
  itemInspection: ItemInspectionController;
  inventorySlotsUnlocked: () => number;
  /** Bag Slots research ranks: a slot each, on top of the ones bought. */
  researchBagSlots?: () => number;
  /** Each tool's level (shared/tools.ts): the pickaxe and hatchet every player holds show at theirs in the Tool slot. */
  toolLevels?: () => Readonly<Partial<Record<ToolId, number>>>;
  gemBalance: () => bigint;
  destroyEquipment: (itemId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  convertItemToCosmetic?: (itemId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  unlockInventorySlot: () => Promise<{ ok: boolean; error?: string } | undefined>;
  confirmGemSpend?: ConfirmPrompt;
  confirmDestroy?: ConfirmPrompt;
  showMessage: (message: string, color?: string) => void;
  /** Copies kept from duplicate drops. Each is its own bag entry with its own roll. */
  equipmentCopies?: () => readonly KeptEquipmentCopy[];
  /** Copy id 0n is the item's first copy; the server moves a kept copy into its place. */
  destroyEquipmentCopy?: (itemId: string, copyId: bigint) => Promise<Result>;
  /** Makes a kept copy the one its slot equips. */
  selectEquipmentCopy?: (copyId: bigint) => Promise<Result>;
  /** Sells one copy of a graded piece to the Smith for gold (shared/grade-shop.ts gradeShopSalePrice). */
  sellGradedItem?: (itemId: string, copyId: bigint) => Promise<Result>;
};

export function clearInventorySelection(inventory: Pick<SelectableInventory, "selectedItemId" | "selectedItemLocation">) {
  inventory.selectedItemId = "";
  inventory.selectedItemLocation = "";
}

/** Inspect items with one tap; loadout changes are explicit inspection actions. */
export function createInventoryController(dependencies: InventoryDependencies) {
  const panel = requiredElement("inventoryPanel");
  const items = requiredElement("inventoryItems");
  const count = requiredElement("inventoryCount");
  const equippedHead = requiredElement("equippedHeadSlot");
  const equippedChest = requiredElement("equippedChestSlot");
  const equippedFeet = requiredElement("equippedFeetSlot");
  const equippedRightHand = requiredElement("equippedRightHandSlot");
  const equipmentTab = requiredElement<HTMLButtonElement>("inventoryEquipmentTab");
  const cosmeticsTab = requiredElement<HTMLButtonElement>("inventoryCosmeticsTab");
  const cardsTab = document.getElementById("inventoryCardsTab") as HTMLButtonElement | null;
  const buildsTab = document.getElementById("inventoryBuildsTab") as HTMLButtonElement | null;
  const content = requiredElement("inventoryContent");
  const loadout = panel.querySelector<HTMLElement>(".inventory-loadout");
  // The pickaxe and hatchet every player holds work from the bag, never equipped: their slot only shows them and what they do.
  const toolSlot = document.createElement("button");
  toolSlot.type = "button";
  toolSlot.className = "equipment-slot slot-tool is-equipped";
  toolSlot.setAttribute("aria-label", "Tool: Pickaxe and Hatchet, always ready");
  loadout?.append(toolSlot);
  toolSlot.addEventListener("click", () => {
    dependencies.showMessage("Pickaxe and Hatchet · Mine ore and fell trees. Always ready, no need to equip.", "#ffd75e");
  });
  function renderToolSlot() {
    toolSlot.hidden = mode === "COSMETICS";
    const levels = dependencies.toolLevels?.() ?? {};
    const art = (source: string, className: string) => {
      const image = document.createElement("span");
      image.className = `inventory-item-art slot-tool-art${className}`;
      image.setAttribute("aria-hidden", "true");
      if (source) image.style.backgroundImage = `url(${source})`;
      return image;
    };
    // Crossed, as a pair of tools, each at its level.
    toolSlot.replaceChildren(art(toolArtSource("pickaxe", levels.pickaxe ?? 0), ""), art(toolArtSource("hatchet", levels.hatchet ?? 0), " slot-tool-crossed"));
  }
  const bagSection = items.closest<HTMLElement>(".bag-section");
  const tabs = equipmentTab.closest(".inventory-tabs");
  if (tabs) {
    // Only the content scrolls; the tabs stay pinned above it.
    const scroll = document.createElement("div");
    scroll.className = "inventory-scroll";
    content.before(scroll);
    scroll.append(content);
  }
  const countRow = count.closest(".inventory-section-title");
  if (countRow) items.after(countRow);
  const cosmeticsNote = document.createElement("p");
  cosmeticsNote.className = "inventory-cosmetics-note";
  cosmeticsNote.textContent = "Permanent looks change appearance only. Unlock an owned item's look for 10 Gems; keep the item.";
  cosmeticsNote.hidden = true;
  items.before(cosmeticsNote);
  function syncSlotSizes() {
    if (!loadout || !items.clientWidth) return;
    const trackWidth = parseFloat(getComputedStyle(items).gridTemplateColumns);
    if (!Number.isFinite(trackWidth) || trackWidth <= 0) return;
    const size = `${trackWidth}px`;
    if (loadout.style.getPropertyValue("--inventory-slot-size") !== size) loadout.style.setProperty("--inventory-slot-size", size);
  }
  if (loadout && typeof ResizeObserver !== "undefined") new ResizeObserver(syncSlotSizes).observe(items);

  let filter: InventoryFilter = "ALL";
  const filters = createInventoryFilters(next => {
    filter = next;
    render();
  }, () => {
    if (mode !== "EQUIPMENT" || !dependencies.equipBest) return;
    const changed = dependencies.equipBest();
    if (!changed) dependencies.showMessage("BEST EQUIPMENT ALREADY EQUIPPED", "#72ef58");
    clearInventorySelection(dependencies.inventory);
    render();
  });
  items.before(filters.bar);
  let renderedState = "";
  let mode: InventoryMode = "EQUIPMENT";
  let unlockingSlot = false;
  // A prompt is awaited, so the pending flags below are not yet set while it is
  // open. Without this a second click opens a second prompt over the first and
  // both answers act.
  let confirming = false;
  async function ask(prompt: ConfirmPrompt, request: ConfirmRequest) {
    if (confirming) return false;
    confirming = true;
    try { return await prompt(request); } finally { confirming = false; }
  }
  const confirmGemSpend = dependencies.confirmGemSpend ?? gameConfirm;
  const confirmDestroy = dependencies.confirmDestroy ?? gameConfirm;
  const equipBestButton = filters.bar.querySelector<HTMLElement>(".inventory-equip-best");
  const deleteMode = createInventoryDeleteMode({
    canDelete: (itemId, copyId) => canDestroyEquipment(itemId) && !dependencies.equipmentLocked?.(itemId, copyId),
    keptCopyIds: itemId => keptCopiesOf(itemId).map(copy => copy.id),
    destroyEquipment: dependencies.destroyEquipment,
    destroyEquipmentCopy: dependencies.destroyEquipmentCopy,
    salePrice: gradeShopSalePrice, sellGradedItem: dependencies.sellGradedItem,
    confirm: request => ask(confirmDestroy, request),
    refineLevel: dependencies.refineLevel,
    showMessage: dependencies.showMessage,
    onDeleted: () => { clearInventorySelection(dependencies.inventory); render(); },
    // Equip best makes way for Cancel and Delete while picking.
    onModeChange: active => { if (active) lockMode?.exit(); if (equipBestButton) equipBestButton.hidden = active || mode === "COSMETICS"; },
    panel,
  });
  equipBestButton?.before(deleteMode.element);
  const lockMode = createInventoryLockMode({ panel, locked: (itemId, copyId) => dependencies.equipmentLocked?.(itemId, copyId) ?? false,
    setLocked: (itemId, locked, copyId) => dependencies.setEquipmentLocked?.(itemId, locked, copyId) ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" }),
    onEnter: () => deleteMode.exit(), render: () => { renderedState = ""; render(); }, showMessage: dependencies.showMessage });
  equipBestButton?.before(lockMode.button);


  const equipmentElements: Record<EquipmentSlot, HTMLElement> = {
    HEAD: equippedHead,
    CHEST: equippedChest,
    FEET: equippedFeet,
    RIGHT_HAND: equippedRightHand,
    LEFT_HAND: equippedRightHand,
  };
  function playMoveFeedback(destination: EquipmentSlot | "BAG") {
    if (destination !== "BAG") {
      const target = equipmentElements[destination];
      target.classList.remove("is-equipped-now");
      void target.offsetWidth;
      target.classList.add("is-equipped-now");
      window.setTimeout(() => target.classList.remove("is-equipped-now"), 360);
    }
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  }

  /** The bag's count as its header shows it: gear, kept copies and ore stacks against the slots bought. */
  function bagFull() {
    const inventory = dependencies.inventory;
    const copies = (dependencies.equipmentCopies?.() ?? []).filter(copy => inventory.itemIds.includes(copy.itemId)).length;
    const used = bagInventoryStacks(inventory).length + copies + oreKindsHeld(dependencies.ores?.() ?? {}).length;
    return used >= bagSlotCapacity(dependencies.inventorySlotsUnlocked(), dependencies.researchBagSlots?.() ?? 0);
  }

  function move(itemId: string, destination: EquipmentSlot | "BAG") {
    // Unequipping puts the item in the bag, so it needs a free slot like a drop does.
    if (mode === "EQUIPMENT" && destination === "BAG" && bagFull()) {
      dependencies.showMessage("Your bag is full. Free a slot first.", "#ff9b91");
      return false;
    }
    const moved = mode === "COSMETICS"
      ? dependencies.moveCosmetic(itemId, destination)
      : dependencies.move(itemId, destination);
    if (!moved) return false;
    clearInventorySelection(dependencies.inventory);
    render();
    playMoveFeedback(destination);
    return true;
  }

  const keptCopiesOf = (itemId: string) => (dependencies.equipmentCopies?.() ?? []).filter(copy => copy.itemId === itemId);

  /** Ore destruction is confirmed per stack in its window. Bulk delete and lock modes leave it be. */
  function inspectOre(oreId: OreId) {
    if (lockMode.active() || deleteMode.active()) return;
    const count = dependencies.ores?.()[oreId] ?? 0;
    // A nocked arrow kind run out still opens, so it can be unnocked.
    if (!(count > 0) && dependencies.nockedArrow?.() !== oreId) return;
    clearInventorySelection(dependencies.inventory);
    dependencies.itemInspection.openOre?.({ oreId, count, actions: [...nockActions(oreId), ...dependencies.destroyOre ? [{
      label: "Destroy ore",
      kind: "DESTROY",
      onActivate: async () => {
        if (!await ask(confirmDestroy, {
          message: `Destroy all ${count.toLocaleString()} ${REFINE_ORES[oreId].name} permanently?`,
          details: [{ label: "This cannot be undone", value: "No refund" }],
          confirmLabel: "Destroy", danger: true,
        })) return;
        dependencies.itemInspection.close();
        const result = await dependencies.destroyOre!(oreId, count);
        if (result?.ok) {
          clearInventorySelection(dependencies.inventory);
          render();
          dependencies.showMessage("ORE DESTROYED", "#ff9b91");
        } else dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
      },
    } satisfies ItemInspectionAction] : []] });
  }

  /** An arrow stack's Nock, or Unnock on the kind nocked; the window then shows the new state. */
  function nockActions(oreId: OreId): ItemInspectionAction[] {
    const nockArrow = dependencies.nockArrow;
    if (!isArrowId(oreId) || !nockArrow) return [];
    const nocked = dependencies.nockedArrow?.() === oreId;
    return [{
      label: nocked ? "Unnock" : "Nock",
      kind: "PRIMARY",
      onActivate: async () => {
        const result = await nockArrow(nocked ? null : oreId);
        if (result?.ok) dependencies.showMessage(`${nocked ? "Unnocked" : "Nocked"} · ${REFINE_ORES[oreId].name}`, "#ffd75e");
        else dependencies.showMessage(result?.error ?? "Not Connected", "#ff9b91");
        render();
        if (dependencies.itemInspection.isOpen?.()) inspectOre(oreId);
      },
    }];
  }

  const cardPort = dependencies.cards;
  /** A card's window; after Equip or Remove it shows the new state. */
  const inspectCard = (cardId: string) => {
    if (!cardPort) return;
    dependencies.itemInspection.openCard?.(cardDetailRequest(cardPort, cardId, (result, verb) => {
      if (result?.ok) dependencies.showMessage(`${verb} · ${cardName(cardDefinition(cardId)!)}`, "#ffd75e");
      else dependencies.showMessage(result?.error ?? "Not Connected", "#ff9b91");
      cardsView?.render();
      if (dependencies.itemInspection.isOpen?.()) inspectCard(cardId);
    }));
  };
  const cardsView = cardsTab && cardPort ? createCardsTab({
    port: cardPort,
    onInspect: inspectCard,
    onResult: (result, verb, cardId) => {
      if (result?.ok) dependencies.showMessage(`${verb} · ${cardName(cardDefinition(cardId)!)}`, "#ffd75e");
      else dependencies.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    },
  }) : null;
  if (cardsView) content.append(cardsView.element);
  else cardsTab?.remove();
  const buildsView = buildsTab && dependencies.builds ? createBuildsTab({
    actions: dependencies.builds, itemName: itemId => itemInspectionButtonLabel(itemDisplayName(itemId)), showMessage: dependencies.showMessage,
  }) : null;
  if (buildsView) { content.append(buildsView.element); installBuildHotkeys(document, slot => buildsView.equip(slot)); }
  else buildsTab?.remove();
  // Cards and Builds each replace the loadout and bag with their own view.
  let cardsShown = false, buildsShown = false;
  const sideShown = () => cardsShown || buildsShown;
  const tabViews: Array<[HTMLButtonElement, InventoryMode | "CARDS" | "BUILDS"]> = [[equipmentTab, "EQUIPMENT"], [cosmeticsTab, "COSMETICS"]];
  if (cardsView && cardsTab) tabViews.push([cardsTab, "CARDS"]);
  if (buildsView && buildsTab) tabViews.push([buildsTab, "BUILDS"]);

  /** `copyId` 0n is the item's first copy: the bag entry, or whatever its slot holds. */
  function inspect(itemId: string, location: Exclude<InventoryLocation, "">, copyId = 0n) {
    if (lockMode.active() && mode === "EQUIPMENT") { void lockMode.pick(itemId, copyId); return; }
    // In delete mode a bag tap picks the item; equipped gear cannot be picked.
    if (deleteMode.active()) {
      if (location === "BAG") deleteMode.pick(itemId, copyId);
      return;
    }
    clearInventorySelection(dependencies.inventory);
    const item = itemDefinition(itemId);
    if (!item) return;
    const kept = mode === "EQUIPMENT" ? keptCopiesOf(itemId) : [];
    const copy = copyId ? kept.find(candidate => candidate.id === copyId) : undefined;
    if (copyId && !copy) return;
    const moves = inventoryMoveActions(dependencies.inventory, itemId, location, mode).map((action) => ({
      label: action.label,
      kind: action.destination === "BAG" ? "SECONDARY" as const : "PRIMARY" as const,
      disabled: action.disabled,
      onActivate: () => {
        if (move(itemId, action.destination)) dependencies.itemInspection.close();
      },
    }));
    dependencies.itemInspection.open({
      itemId,
      upgradeLevel: dependencies.upgradeLevel(itemId),
      ...(mode === "EQUIPMENT" ? { refine: dependencies.refineLevel?.(itemId, copyId) ?? 0 } : { lookRefine: dependencies.lookRefine?.(itemId) ?? 0 }),
      ownItem: mode === "EQUIPMENT",
      ...(mode === "EQUIPMENT" ? { worn: dependencies.inventory } : {}),
      ...(kept.length ? { context: `Copy ${copy ? kept.indexOf(copy) + 2 : 1} of ${kept.length + 1}` } : {}),
      ...(mode === "COSMETICS" ? { context: `Cosmetic · ${cosmeticReach(itemId)}` } : {}),
      ...(copy ? { skills: copy.roll } : {}),
      actions: [...(copy ? copyEquipActions(copy) : moves),
        ...conversionActions(itemId), ...trashActions(itemId, copyId)],
    });
  }

  /**
   * Equipping a kept copy. A weapon's copies differ, so the server first makes
   * this copy the one its slot holds. Locks follow the selected copy too.
   */
  function copyEquipActions(copy: KeptEquipmentCopy) {
    const [action] = inventoryMoveActions(dependencies.inventory, copy.itemId, "BAG", "EQUIPMENT");
    if (!action) return [];
    const equipped = action.disabled === true;
    return [{
      label: "EQUIP",
      kind: "PRIMARY" as const,
      disabled: !dependencies.selectEquipmentCopy,
      onActivate: async () => {
        {
          const result = await dependencies.selectEquipmentCopy?.(copy.id);
          if (!result?.ok) {
            dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
            return;
          }
        }
        if (!equipped) {
          if (move(copy.itemId, action.destination)) dependencies.itemInspection.close();
          return;
        }
        dependencies.itemInspection.close();
        clearInventorySelection(dependencies.inventory);
        render();
        playMoveFeedback(action.destination);
        dependencies.showMessage("EQUIPMENT UPDATED · WEAPON READY", "#72ef58");
      },
    }];
  }

  function conversionActions(itemId: string) {
    if (mode !== "EQUIPMENT" || !dependencies.convertItemToCosmetic ||
        !dependencies.inventory.itemIds.includes(itemId) || !canConvertToCosmetic(itemId) ||
        dependencies.inventory.cosmeticItemIds?.includes(itemId)) return [];
    return [{
      label: `Convert to Cosmetic · ${COSMETIC_CONVERSION_GEM_COST} Gems`,
      kind: "SECONDARY" as const,
      onActivate: async () => {
        const balance = dependencies.gemBalance();
        if (balance < COSMETIC_CONVERSION_GEM_COST) {
          dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${COSMETIC_CONVERSION_GEM_COST}`, "#ff9b91");
          return;
        }
        const confirmation = gemSpendConfirmation(
          `permanently unlock ${itemDisplayName(itemId)} as a cosmetic`, COSMETIC_CONVERSION_GEM_COST, balance,
        );
        if (!await ask(confirmGemSpend, {
          ...confirmation,
          details: [{ label: "Item", value: "Kept in inventory" }, ...(confirmation.details ?? [])],
          confirmLabel: "Convert",
        })) return;
        const result = await dependencies.convertItemToCosmetic?.(itemId);
        if (result?.ok) {
          dependencies.itemInspection.close();
          clearInventorySelection(dependencies.inventory);
          render();
          dependencies.showMessage("COSMETIC UNLOCKED", "#f0c66b");
        } else dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
      },
    }];
  }

  /**
   * The trash can sells graded gear for gold, as at the sellers' stalls (sell_graded_item); worn gear says to take it
   * off first. Gear the Smith does not buy is still destroyed or salvaged.
   */
  function trashActions(itemId: string, copyId = 0n) {
    const sell = dependencies.sellGradedItem, price = gradeShopSalePrice(itemId), inventory = dependencies.inventory;
    if (mode !== "EQUIPMENT" || !sell || price === undefined) return destructionActions(itemId, copyId);
    if (!inventory.itemIds.includes(itemId) || dependencies.equipmentLocked?.(itemId, copyId)) return [];
    const worn = copyId === 0n && [inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet, inventory.equippedRightHand, inventory.equippedLeftHand].includes(itemId);
    return [{
      label: worn ? "Take It Off Before Selling It" : `Sell for ${price} Gold`,
      kind: "DESTROY" as const,
      blocked: worn,
      onActivate: async () => {
        if (worn) { dependencies.showMessage("Take It Off Before Selling It", "#ff9b91"); return; }
        const refine = dependencies.refineLevel?.(itemId, copyId) ?? 0;
        if (!await ask(confirmDestroy, {
          message: `Sell ${withRefineStars(itemDisplayName(itemId), refine)} for ${price} Gold?`,
          details: [{ label: "You Get", value: `${price} Gold` }, ...(refine ? [{ label: "Refines", value: "Lost with the item" }] : [])],
          confirmLabel: "Sell",
        })) return;
        dependencies.itemInspection.close();
        const result = await sell(itemId, copyId);
        if (result?.ok) {
          clearInventorySelection(inventory);
          render();
          dependencies.showMessage(`Sold for ${price} Gold`, "#ffd75e");
        } else dependencies.showMessage(result?.error ?? "Not Connected", "#ff9b91");
      },
    }];
  }

  /**
   * Destroys one copy. With other copies kept, the server keeps the item and
   * only a copy goes (the oldest kept one takes the first copy's place), so
   * the bag must not drop the item locally the way a last copy's destroy does.
   */
  function destructionActions(itemId: string, copyId = 0n) {
    if (!dependencies.inventory.itemIds.includes(itemId) || dependencies.equipmentLocked?.(itemId, copyId)) return [];
    const destroyCopy = dependencies.destroyEquipmentCopy;
    const oneOfSeveral = Boolean(destroyCopy) && (copyId !== 0n || keptCopiesOf(itemId).length > 0);
    const ore = salvageOre(itemId);
    return canDestroyEquipment(itemId) ? [{
      label: "Salvage Item",
      kind: "DESTROY" as const,
      onActivate: async () => {
        if (!await ask(confirmDestroy, {
          message: `Destroy ${oneOfSeveral ? "this copy of " : ""}${withRefineStars(itemDisplayName(itemId), dependencies.refineLevel?.(itemId, copyId) ?? 0)} permanently?`,
          details: [{ label: "This cannot be undone", value: ore ? `Gives back 1 ${REFINE_ORES[ore].name}` : "No refund" }],
          confirmLabel: "Salvage", danger: true,
        })) return;
        dependencies.itemInspection.close();
        const result = oneOfSeveral ? await destroyCopy!(itemId, copyId) : await dependencies.destroyEquipment(itemId);
        if (result?.ok) {
          clearInventorySelection(dependencies.inventory);
          render();
          dependencies.showMessage(ore ? `Item Salvaged · +1 ${REFINE_ORES[ore].name}` : "Item Destroyed", "#ff9b91");
        } else dependencies.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
      },
    }] : [];
  }

  function render() {
    if (cardsShown) cardsView?.render();
    if (buildsShown) buildsView?.render();
    const inventory = dependencies.inventory;
    const copies = dependencies.equipmentCopies?.() ?? [];
    const held = dependencies.ores?.() ?? {};
    const nextState = JSON.stringify([cardsShown, buildsShown, mode, filter, inventory, held, dependencies.nockedArrow?.() ?? null, inventory.itemIds.map(id => dependencies.equipmentLocked?.(id)), dependencies.inventorySlotsUnlocked(), dependencies.researchBagSlots?.() ?? 0, dependencies.toolLevels?.() ?? {}, unlockingSlot,
      ["HEAD", "CHEST", "HAND"].map(slot => dependencies.slotTier?.(slot as "HEAD" | "CHEST" | "HAND")), inventory.itemIds.map(itemId => `${dependencies.upgradeLevel(itemId)}:${dependencies.refineLevel?.(itemId, 0n)}`),
      copies.map(copy => `${copy.id}:${copy.itemId}:${dependencies.equipmentLocked?.(copy.itemId, copy.id)}:${dependencies.refineLevel?.(copy.itemId, copy.id)}`),
      (inventory.cosmeticItemIds ?? []).map(itemId => dependencies.lookRefine?.(itemId) ?? 0)]);
    if (nextState === renderedState) return;
    renderedState = nextState;
    const cosmeticsActive = mode === "COSMETICS";
    cosmeticsNote.hidden = !cosmeticsActive;
    filters.setCosmetics(cosmeticsActive);
    deleteMode.element.hidden = cosmeticsActive;
    if (equipBestButton && deleteMode.active()) equipBestButton.hidden = true;
    const activeTab = cardsShown && cardsTab ? cardsTab : buildsShown && buildsTab ? buildsTab : cosmeticsActive ? cosmeticsTab : equipmentTab;
    for (const [tab] of tabViews) {
      tab.classList.toggle("is-active", tab === activeTab);
      tab.setAttribute("aria-selected", String(tab === activeTab));
      tab.tabIndex = tab === activeTab ? 0 : -1;
    }
    content.setAttribute("aria-labelledby", activeTab.id);
    if (loadout) loadout.hidden = sideShown();
    renderToolSlot();
    if (bagSection) bagSection.hidden = sideShown();
    cardsView?.show(cardsShown);
    buildsView?.show(buildsShown);
    if (loadout) loadout.setAttribute("aria-label", cosmeticsActive ? "Cosmetic items" : "Equipped items");
    const slotsUnlocked = dependencies.inventorySlotsUnlocked();
    // Gems buy up to the maximum; research slots sit on top of it.
    const boughtCapacity = inventorySlotCapacity(slotsUnlocked);
    const slotCapacity = bagSlotCapacity(slotsUnlocked, dependencies.researchBagSlots?.() ?? 0);
    renderInventoryView(
      { items, count, equippedHead, equippedChest, equippedFeet, equippedRightHand },
      dependencies.inventory,
      mode,
      {
        onInspect: inspect,
        onInspectOre: inspectOre,
        ores: held,
        nockedArrow: dependencies.nockedArrow?.(),
        copies,
        filter: filter === "ALL" ? undefined : filter,
        upgradeLevel: dependencies.upgradeLevel,
        slotTier: dependencies.slotTier,
        refineLevel: dependencies.refineLevel,
        lookRefine: dependencies.lookRefine,
        slotCapacity,
        nextSlotCost: boughtCapacity < MAX_INVENTORY_SLOT_CAPACITY
          ? inventorySlotUnlockCost(slotsUnlocked)
          : undefined,
        onUnlockSlot: unlockingSlot || boughtCapacity >= MAX_INVENTORY_SLOT_CAPACITY
          ? undefined
          : () => { void unlockNextSlot(); },
      },
    );
    lockMode.button.hidden = cosmeticsActive;
    if (cosmeticsActive) lockMode.exit();
    lockMode.decorate();
    deleteMode.decorate(items);
    syncSlotSizes();
  }

  async function unlockNextSlot() {
    if (unlockingSlot) return;
    const slotsUnlocked = dependencies.inventorySlotsUnlocked();
    if (inventorySlotCapacity(slotsUnlocked) >= MAX_INVENTORY_SLOT_CAPACITY) return;
    // Numbered as the bag shows it, research slots included.
    const capacity = bagSlotCapacity(slotsUnlocked, dependencies.researchBagSlots?.() ?? 0);
    const cost = inventorySlotUnlockCost(slotsUnlocked);
    if (dependencies.gemBalance() < cost) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${cost}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmGemSpend, gemSpendConfirmation(`permanently unlock Bag slot ${capacity + 1}`, cost, dependencies.gemBalance()))) return;
    unlockingSlot = true;
    render();
    const result = await dependencies.unlockInventorySlot();
    unlockingSlot = false;
    render();
    if (result?.ok) dependencies.showMessage(`BAG SLOT ${capacity + 1} UNLOCKED`, "#f3a6ce");
    else if (result?.error) dependencies.showMessage(result.error, "#ff9b91");
  }

  function itemInSlot(destination: EquipmentSlot) {
    if (mode === "COSMETICS") {
      return destination === "HEAD" ? dependencies.inventory.cosmeticHead
        : destination === "CHEST" ? dependencies.inventory.cosmeticChest
          : destination === "FEET" ? dependencies.inventory.cosmeticFeet
            : destination === "RIGHT_HAND" ? dependencies.inventory.cosmeticRightHand
              : dependencies.inventory.cosmeticLeftHand;
    }
    return destination === "HEAD" ? dependencies.inventory.equippedHead
      : destination === "CHEST" ? dependencies.inventory.equippedChest
        : destination === "FEET" ? dependencies.inventory.equippedFeet
          : destination === "RIGHT_HAND" ? dependencies.inventory.equippedRightHand
            : dependencies.inventory.equippedLeftHand;
  }

  function clickEquipment(destination: EquipmentSlot, itemId: string) {
    if (mode === "COSMETICS" && !itemDefinition(itemId)) {
      if (dependencies.toggleCosmeticVisibility(destination)) {
        clearInventorySelection(dependencies.inventory);
        render();
        playMoveFeedback(destination);
      }
      return;
    }
    if (!itemDefinition(itemId)) return;
    inspect(itemId, destination);
  }

  equippedHead.addEventListener("click", () => clickEquipment("HEAD", itemInSlot("HEAD")));
  equippedChest.addEventListener("click", () => clickEquipment("CHEST", itemInSlot("CHEST")));
  equippedRightHand.addEventListener("click", () => {
    const destination = inventoryWeaponSlot(dependencies.inventory, mode);
    clickEquipment(destination, itemInSlot(destination));
  });
  equippedFeet.addEventListener("click", () => clickEquipment("FEET", itemInSlot("FEET")));
  const setView = (next: InventoryMode | "CARDS" | "BUILDS") => {
    if (next === "CARDS" ? cardsShown : next === "BUILDS" ? buildsShown : !sideShown() && mode === next) return;
    deleteMode.exit();
    lockMode.exit();
    cardsShown = next === "CARDS";
    buildsShown = next === "BUILDS";
    if (next !== "CARDS" && next !== "BUILDS") mode = next;
    clearInventorySelection(dependencies.inventory);
    render();
  };
  tabViews.forEach(([tab, view], index) => {
    tab.addEventListener("click", () => setView(view));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const [nextTab, nextView] = tabViews[(index + (event.key === "ArrowRight" ? 1 : tabViews.length - 1)) % tabViews.length];
      setView(nextView);
      nextTab.focus();
    });
  });

  return {
    destructionActions,
    render,
    prepareOpen: () => {
      dependencies.itemInspection.close();
      deleteMode.exit();
      lockMode.exit();
      clearInventorySelection(dependencies.inventory);
    },
    mode: () => mode,
    inspectOre,
  };
}
