import { formatRemaining } from "./format-remaining";
import { formatEquipmentStat } from "./equipment-stat-format";
import { appendItemTierLabel } from "./item-tier-label";
import { itemTier } from "../../shared/item-tier";
import {
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  itemUpgradeSpeedUpGemCost,
} from "../../shared/gems";
import {
  MAX_ITEM_UPGRADE_LEVEL,
  isUpgradeableItem,
  itemDefinition,
  type ItemSlot,
  itemDisplayName,
  itemUpgradeDurationMs,
  itemUpgradeStatChanges,
  normalizeItemUpgradeLevel,
} from "../../shared/items";
import {
  ownedInventoryStacks,
  setInventoryItemQuantity,
  type InventoryState,
} from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";
import type { ActiveItemUpgrade, UpgradeBenchSlot } from "../wildstat-coop";
import { gemSpendConfirmation, gemSpendConfirmationText } from "./gem-spend-confirmation";
import { gameConfirm, type ConfirmPrompt, type ConfirmRequest } from "./confirm-dialog";

type UpgradeBenchElements = {
  panel: HTMLElement;
  prompt: HTMLElement;
  slot: HTMLButtonElement;
  slotTwo: HTMLButtonElement;
  statGain: HTMLElement;
  timer: HTMLElement;
  action: HTMLButtonElement;
  speedUp: HTMLButtonElement;
  back: HTMLButtonElement;
  picker: HTMLElement;
  pickerItems: HTMLElement;
  closePicker: HTMLButtonElement;
};

type UpgradeResult = { ok: boolean; error?: string } | undefined;

type UpgradeBenchDependencies = {
  inventory: InventoryState;
  playerPosition: () => { x: number; y: number };
  currentMapId: () => string;
  benchMapId: string;
  benchPosition: { x: number; y: number };
  activeUpgrades: () => ActiveItemUpgrade[];
  secondSlotUnlocked: () => boolean;
  gemBalance: () => bigint;
  upgradeLevel: (itemId: string) => number;
  startUpgrade: (slot: UpgradeBenchSlot, itemId: string, position: { x: number; y: number }) => Promise<UpgradeResult>;
  cancelUpgrade: (slot: UpgradeBenchSlot) => Promise<UpgradeResult>;
  speedUpUpgrade: (slot: UpgradeBenchSlot) => Promise<UpgradeResult>;
  unlockSecondSlot: () => Promise<UpgradeResult>;
  confirmCancel?: ConfirmPrompt;
  confirmUnlock?: ConfirmPrompt;
  confirmGemSpend?: ConfirmPrompt;
  beforeOpen: () => void;
  setPaused: (paused: boolean) => void;
  clearPlayerInput: () => void;
  onInventoryChanged: () => void;
  showMessage: (message: string, color?: string) => void;
  nowMs?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

export const UPGRADE_CANCEL_CONFIRMATION = "Are you sure you want to cancel? You will lose current progress to the next upgrade.";
export const UPGRADE_SLOT_UNLOCK_ACTION = "permanently unlock the second Upgrade Bench slot";
export const UPGRADE_SLOT_UNLOCK_CONFIRMATION = gemSpendConfirmationText(
  UPGRADE_SLOT_UNLOCK_ACTION,
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
);
export const UPGRADE_BENCH_TOUCH_OFFSET_Y = -36;
const UPGRADE_BENCH_TOUCH_RADIUS_X = 54;
const UPGRADE_BENCH_TOUCH_RADIUS_Y = 39;
const UPGRADE_SLOTS = [1, 2] as const;

export function upgradeBenchTouchTransition(wasTouching: boolean, touching: boolean) {
  return { touching, shouldOpen: touching && !wasTouching };
}

export function upgradeSlotAfterPickerDismiss(slot: UpgradeBenchSlot | null, itemId: string | undefined) {
  return slot && itemId ? slot : null;
}

export function playerTouchesUpgradeBench(
  player: { x: number; y: number },
  bench: { x: number; y: number },
) {
  const dx = player.x - bench.x;
  const dy = player.y - (bench.y + UPGRADE_BENCH_TOUCH_OFFSET_Y);
  return dx * dx / (UPGRADE_BENCH_TOUCH_RADIUS_X * UPGRADE_BENCH_TOUCH_RADIUS_X) +
    dy * dy / (UPGRADE_BENCH_TOUCH_RADIUS_Y * UPGRADE_BENCH_TOUCH_RADIUS_Y) <= 1;
}

export function upgradePickerPreview(itemId: string, upgradeLevel: unknown) {
  const level = normalizeItemUpgradeLevel(upgradeLevel);
  return {
    name: itemDisplayName(itemId, level),
    changes: itemUpgradeStatChanges(itemId, level),
  };
}

/** Fullscreen two-slot upgrade interaction plus enter/leave collision latch. */
/**
 * The server grants a finished upgrade and removes it on its own, so there is
 * no waiting-to-collect state to read. A job that disappears once its time has
 * passed was granted; one that disappears before then was cancelled.
 */
export function upgradeFinishedSinceLastPoll(
  tracked: ReadonlyMap<UpgradeBenchSlot, number>,
  active: ReadonlyMap<UpgradeBenchSlot, number>,
  nowMs: number,
) {
  for (const [slot, completesAtMs] of tracked) {
    if (!active.has(slot) && nowMs >= completesAtMs) return true;
  }
  return false;
}

export function createUpgradeBenchController(elements: UpgradeBenchElements, dependencies: UpgradeBenchDependencies) {
  const nowMs = dependencies.nowMs ?? Date.now;

  // The server grants a finished upgrade and removes it on its own, so there is
  // no waiting-to-collect state to read. Notice the moment a job that had reached
  // its completion time disappears, and hold that until the bag is opened.
  const FINISHED_KEY = "wildstat-upgrade-finished";
  const tracked = new Map<UpgradeBenchSlot, number>();
  let finishedWaiting = false;
  try { finishedWaiting = dependencies.storage?.getItem(FINISHED_KEY) === "true"; } catch { /* Storage may be unavailable. */ }
  function rememberFinished(waiting: boolean) {
    if (waiting === finishedWaiting) return;
    finishedWaiting = waiting;
    try { dependencies.storage?.setItem(FINISHED_KEY, String(waiting)); } catch { /* Keep the session value. */ }
  }
  // A prompt is awaited, so the busy flags below are not yet set while it is
  // open. Without this a second click opens a second prompt over the first and
  // both answers act. window.confirm used to block the page and hide the gap.
  let confirming = false;
  async function ask(prompt: ConfirmPrompt, request: ConfirmRequest) {
    if (confirming) return false;
    confirming = true;
    try { return await prompt(request); } finally { confirming = false; }
  }
  const confirmCancel = dependencies.confirmCancel ?? gameConfirm;
  const confirmGemSpend = dependencies.confirmGemSpend ?? gameConfirm;
  const confirmUnlock = dependencies.confirmUnlock ?? confirmGemSpend;
  const selectedItems = new Map<UpgradeBenchSlot, string>();
  /** Only HAND, HEAD and CHEST can be upgraded, so these are every kind there is. */
  let pickerFilter: "ALL" | ItemSlot = "ALL";
  let selectedSlot: UpgradeBenchSlot | null = null;
  let touchingBench = false;
  let busy = false;
  let lastRenderKey = "";
  let renderedActiveSlots = new Set<UpgradeBenchSlot>();

  function activeUpgrades() {
    return dependencies.activeUpgrades().slice().sort((left, right) => left.slot - right.slot);
  }

  function activeUpgradeForSlot(slot: UpgradeBenchSlot) {
    return activeUpgrades().find((job) => job.slot === slot) ?? null;
  }

  function isSlotUnlocked(slot: UpgradeBenchSlot) {
    return slot === 1 || dependencies.secondSlotUnlocked();
  }

  function eligibleItems(slot: UpgradeBenchSlot) {
    const unavailable = new Set(activeUpgrades().map((job) => job.itemId));
    for (const [selectedInSlot, itemId] of selectedItems) {
      if (selectedInSlot !== slot) unavailable.add(itemId);
    }
    return ownedInventoryStacks(dependencies.inventory)
      .map(({ itemId }) => itemId)
      .filter((itemId) => !unavailable.has(itemId) && isUpgradeableItem(itemId) &&
        dependencies.upgradeLevel(itemId) < MAX_ITEM_UPGRADE_LEVEL)
      // Best first: the item worth upgrading is almost always the highest tier
      // owned, so it should not be somewhere down a scrolling list.
      .sort((left, right) => (itemTier(right) ?? 0) - (itemTier(left) ?? 0)
        || itemDisplayName(left, 0).localeCompare(itemDisplayName(right, 0)));
  }

  function closePicker() {
    elements.picker.hidden = true;
  }

  function close() {
    if (elements.panel.hidden) return;
    closePicker();
    selectedSlot = null;
    selectedItems.clear();
    elements.panel.hidden = true;
    dependencies.setPaused(false);
  }

  function open() {
    if (!elements.panel.hidden) return;
    dependencies.beforeOpen();
    dependencies.clearPlayerInput();
    elements.panel.hidden = false;
    dependencies.setPaused(true);
    selectedItems.clear();
    selectedSlot = activeUpgrades()[0]?.slot ?? null;
    lastRenderKey = "";
    render();
  }

  function renderLockedSlot(button: HTMLButtonElement) {
    const lock = document.createElement("span");
    lock.className = "upgrade-bench-lock-symbol";
    lock.textContent = "🔒";
    lock.setAttribute("aria-hidden", "true");

    const cost = document.createElement("span");
    cost.className = "upgrade-bench-slot-cost";
    const icon = document.createElement("img");
    icon.src = "assets/wildstat/gems/gem-icon-v2.webp";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.draggable = false;
    const amount = document.createElement("strong");
    amount.textContent = UPGRADE_BENCH_SECOND_SLOT_GEM_COST.toString();
    cost.append(icon, amount);
    button.replaceChildren(lock, cost);
  }

  function renderSlot(button: HTMLButtonElement, slot: UpgradeBenchSlot, itemId: string, level: number, locked: boolean, active: boolean) {
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("is-empty", !locked && !itemId);
    button.classList.toggle("is-filled", !locked && Boolean(itemId));
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-selected", selectedSlot === slot);
    button.setAttribute("aria-pressed", String(selectedSlot === slot));
    button.disabled = busy;

    if (locked) {
      button.setAttribute("aria-label", `Unlock second upgrade slot for ${UPGRADE_BENCH_SECOND_SLOT_GEM_COST} Gems`);
      renderLockedSlot(button);
      return;
    }

    button.setAttribute("aria-label", itemId
      ? `${itemDisplayName(itemId, level)} in upgrade slot ${slot}`
      : `Choose an item for upgrade slot ${slot}`);
    if (!itemId) {
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = "+";
      button.replaceChildren(empty);
      return;
    }
    const art = document.createElement("span");
    art.className = "inventory-item-art-wrap";
    art.innerHTML = itemArtMarkup(itemId);
    button.replaceChildren(art);
    appendItemTierLabel(button, itemId);
    if (level > 0) {
      const badge = document.createElement("span");
      badge.className = "inventory-upgrade-level";
      badge.textContent = `+${level}`;
      button.append(badge);
    }
  }

  function renderStatGain(itemId: string, level: number) {
    const rows = itemId ? itemUpgradeStatChanges(itemId, level).map((change) => {
      const row = document.createElement("div");
      row.className = "upgrade-bench-stat-row";
      if (/^REGEN\b/.test(change.label)) row.dataset.statKind = "regen";
      if (/^ARMOR\b/.test(change.label)) row.dataset.statKind = "armor";
      const label = document.createElement("strong");
      label.textContent = change.label;
      const values = document.createElement("span");
      values.textContent = `${formatEquipmentStat(change.current)} → ${formatEquipmentStat(change.next)}`;
      row.append(label, values);
      return row;
    }) : [];
    elements.statGain.replaceChildren(...rows);
  }

  function remainingFor(job: ActiveItemUpgrade) {
    return Math.max(0, job.completesAtMs - nowMs());
  }

  function renderSpeedUp(cost: bigint) {
    const label = document.createElement("span");
    label.textContent = "Finish Now";
    const icon = document.createElement("img");
    icon.src = "assets/wildstat/gems/gem-icon-v2.webp";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.draggable = false;
    const amount = document.createElement("strong");
    amount.textContent = cost.toString();
    elements.speedUp.replaceChildren(label, icon, amount);
    elements.speedUp.setAttribute(
      "aria-label",
      `Finish this upgrade now for ${cost} Gems. One Gem is worth ten minutes. Your balance is ${dependencies.gemBalance()} Gems.`,
    );
  }

  function render(force = false) {
    if (elements.panel.hidden) return;
    const jobs = activeUpgrades();
    const activeSlots = new Set(jobs.map((job) => job.slot));
    for (const finishedSlot of renderedActiveSlots) {
      if (!activeSlots.has(finishedSlot)) {
        selectedItems.delete(finishedSlot);
        if (selectedSlot === finishedSlot) selectedSlot = null;
      }
    }
    renderedActiveSlots = activeSlots;

    if (!dependencies.secondSlotUnlocked()) selectedItems.delete(2);
    for (const slot of UPGRADE_SLOTS) {
      const selectedItem = selectedItems.get(slot);
      if (selectedItem && !eligibleItems(slot).includes(selectedItem)) selectedItems.delete(slot);
    }

    const selectedJob = selectedSlot ? jobs.find((job) => job.slot === selectedSlot) ?? null : null;
    const selectedItemId = selectedSlot ? selectedItems.get(selectedSlot) ?? "" : "";
    const itemId = selectedJob?.itemId ?? selectedItemId;
    const level = selectedJob?.currentLevel ?? normalizeItemUpgradeLevel(dependencies.upgradeLevel(itemId));
    const remaining = selectedJob ? remainingFor(selectedJob) : 0;
    const speedUpCost = selectedJob && remaining > 0 ? itemUpgradeSpeedUpGemCost(remaining) : 0n;
    const candidateKey = UPGRADE_SLOTS.map((slot) => eligibleItems(slot).join(",")).join(";");
    const renderKey = [
      jobs.map((job) => `${job.slot}:${job.itemId}:${job.targetLevel}:${job.paused}`).join(","),
      selectedSlot ?? 0,
      selectedItems.get(1) ?? "",
      selectedItems.get(2) ?? "",
      dependencies.secondSlotUnlocked(),
      dependencies.gemBalance(),
      selectedJob ? Math.ceil(remaining / 1_000) : 0,
      candidateKey,
      busy,
    ].join("|");
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    const slotOneJob = jobs.find((job) => job.slot === 1) ?? null;
    const slotTwoJob = jobs.find((job) => job.slot === 2) ?? null;
    const slotOneItem = slotOneJob?.itemId ?? selectedItems.get(1) ?? "";
    const slotTwoItem = slotTwoJob?.itemId ?? selectedItems.get(2) ?? "";
    renderSlot(elements.slot, 1, slotOneItem, slotOneJob?.currentLevel ?? dependencies.upgradeLevel(slotOneItem), false, Boolean(slotOneJob));
    renderSlot(elements.slotTwo, 2, slotTwoItem, slotTwoJob?.currentLevel ?? dependencies.upgradeLevel(slotTwoItem), !dependencies.secondSlotUnlocked(), Boolean(slotTwoJob));
    renderStatGain(itemId, level);

    if (!selectedSlot) elements.prompt.textContent = "Choose an upgrade slot";
    else if (selectedJob) elements.prompt.textContent = `Upgrading ${itemDisplayName(itemId, level)}`;
    else if (itemId) elements.prompt.textContent = `${itemDisplayName(itemId, level)} → +${level + 1}`;
    else elements.prompt.textContent = `Add weapon or armor to slot ${selectedSlot}`;

    elements.timer.hidden = !itemId;
    elements.timer.textContent = selectedJob
      ? `UPGRADING · ${formatRemaining(remaining)}`
      : itemId ? `UPGRADE TIME · ${formatRemaining(itemUpgradeDurationMs(level))}` : "";
    elements.action.classList.toggle("is-cancel", Boolean(selectedJob));
    elements.action.textContent = selectedJob ? "Cancel" : "Upgrade";
    elements.action.hidden = !itemId;
    elements.action.disabled = busy || !itemId || (!selectedJob && level >= MAX_ITEM_UPGRADE_LEVEL);
    elements.speedUp.hidden = !selectedJob || remaining <= 0;
    if (selectedJob && remaining > 0) {
      renderSpeedUp(speedUpCost);
      elements.speedUp.disabled = busy || dependencies.gemBalance() < speedUpCost;
    }
    elements.back.hidden = false;
    elements.back.disabled = busy;
  }

  /**
   * Built here rather than in the startup shell, which is size-bounded and has
   * no business carrying a control only the bench uses.
   */
  const PICKER_FILTERS: readonly { id: "ALL" | ItemSlot; label: string }[] = [
    { id: "ALL", label: "ALL" }, { id: "HAND", label: "WEAPON" },
    { id: "HEAD", label: "HELMET" }, { id: "CHEST", label: "ARMOR" },
  ];
  let filterButtons: HTMLButtonElement[] = [];

  function buildPickerFilters() {
    if (filterButtons.length) return;
    const bar = elements.pickerItems.ownerDocument.createElement("div");
    bar.className = "profile-tabs upgrade-bench-picker-filters";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Filter upgradeable items");
    filterButtons = PICKER_FILTERS.map(({ id, label }) => {
      const button = elements.pickerItems.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "profile-tab";
      button.setAttribute("role", "tab");
      button.dataset.filter = id;
      button.textContent = label;
      button.addEventListener("click", () => {
        if (pickerFilter === id) return;
        pickerFilter = id;
        if (selectedSlot !== null && !elements.picker.hidden) renderPicker(selectedSlot);
        else syncPickerFilters();
      });
      bar.append(button);
      return button;
    });
    elements.pickerItems.before(bar);
  }

  function syncPickerFilters() {
    for (const button of filterButtons) {
      const active = button.dataset.filter === pickerFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
  }

  function renderPicker(slot: UpgradeBenchSlot) {
    buildPickerFilters();
    syncPickerFilters();
    const candidates = eligibleItems(slot).filter(itemId =>
      pickerFilter === "ALL" || itemDefinition(itemId)?.slot === pickerFilter);
    const rows = candidates.map((itemId) => {
      const level = normalizeItemUpgradeLevel(dependencies.upgradeLevel(itemId));
      const preview = upgradePickerPreview(itemId, level);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "upgrade-bench-picker-item";
      const art = document.createElement("span");
      art.innerHTML = itemArtMarkup(itemId);
      const copy = document.createElement("span");
      copy.className = "upgrade-bench-picker-copy";
      const title = document.createElement("span");
      title.className = "upgrade-bench-picker-title";
      const name = document.createElement("strong");
      name.textContent = preview.name;
      title.append(name);
      // The same tier badge the item inspector shows, so the two agree.
      appendItemTierLabel(title, itemId);
      const stats = document.createElement("span");
      stats.className = "upgrade-bench-picker-stats";
      for (const change of preview.changes) {
        const row = document.createElement("span");
        row.className = "upgrade-bench-picker-stat";
        if (/^REGEN\b/.test(change.label)) row.dataset.statKind = "regen";
        if (/^ARMOR\b/.test(change.label)) row.dataset.statKind = "armor";
        const label = document.createElement("span");
        label.textContent = change.label.replace(" MULTIPLIER", "");
        const values = document.createElement("span");
        values.textContent = `${formatEquipmentStat(change.current)} → ${formatEquipmentStat(change.next)}`;
        row.append(label, values);
        stats.append(row);
      }
      copy.append(title, stats);
      button.append(art, copy);
      button.addEventListener("click", () => {
        selectedSlot = slot;
        selectedItems.set(slot, itemId);
        closePicker();
        lastRenderKey = "";
        render();
      });
      return button;
    });
    elements.pickerItems.replaceChildren(...rows);
    elements.pickerItems.scrollTop = 0;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "upgrade-bench-picker-heading";
      empty.textContent = pickerFilter === "ALL" ? "NO ELIGIBLE ITEMS" : "NONE OF THIS KIND";
      elements.pickerItems.append(empty);
    }
  }

  function openPicker(slot: UpgradeBenchSlot) {
    if (busy || !isSlotUnlocked(slot) || activeUpgradeForSlot(slot)) return;
    selectedSlot = slot;
    renderPicker(slot);
    elements.picker.hidden = false;
    lastRenderKey = "";
    render();
  }

  function returnFromPicker() {
    closePicker();
    // Keep the slot selected so dismissing item choices restores the actions
    // for an item that was already sitting in that slot.
    const dismissedSlot = selectedSlot;
    selectedSlot = upgradeSlotAfterPickerDismiss(
      dismissedSlot,
      dismissedSlot ? selectedItems.get(dismissedSlot) : undefined,
    );
    lastRenderKey = "";
    render();
  }

  async function unlockSecondSlot() {
    if (busy || confirming || dependencies.secondSlotUnlocked()) return;
    if (dependencies.gemBalance() < UPGRADE_BENCH_SECOND_SLOT_GEM_COST) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${UPGRADE_BENCH_SECOND_SLOT_GEM_COST}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmUnlock, gemSpendConfirmation(UPGRADE_SLOT_UNLOCK_ACTION, UPGRADE_BENCH_SECOND_SLOT_GEM_COST, dependencies.gemBalance()))) return;
    busy = true;
    render(true);
    const result = await dependencies.unlockSecondSlot();
    busy = false;
    lastRenderKey = "";
    if (result?.ok) {
      dependencies.showMessage("SECOND UPGRADE SLOT UNLOCKED", "#f3a6ce");
      render();
      openPicker(2);
    } else {
      dependencies.showMessage(result?.error ?? "COULD NOT UNLOCK SLOT", "#ff7a7a");
      render();
    }
  }

  function selectSlot(slot: UpgradeBenchSlot) {
    if (slot === 2 && !dependencies.secondSlotUnlocked()) {
      void unlockSecondSlot();
      return;
    }
    const job = activeUpgradeForSlot(slot);
    if (job) {
      selectedSlot = slot;
      closePicker();
      lastRenderKey = "";
      render();
      return;
    }
    openPicker(slot);
  }

  async function useAction() {
    if (busy || confirming || !selectedSlot) return;
    const slot = selectedSlot;
    const job = activeUpgradeForSlot(slot);
    const itemId = job?.itemId ?? selectedItems.get(slot) ?? "";
    if (!itemId) return;
    if (job && !await ask(confirmCancel, { message: UPGRADE_CANCEL_CONFIRMATION, danger: true })) return;
    busy = true;
    render(true);
    if (job) {
      const result = await dependencies.cancelUpgrade(slot);
      if (result?.ok) {
        setInventoryItemQuantity(dependencies.inventory, itemId, 1);
        dependencies.onInventoryChanged();
        selectedSlot = null;
        selectedItems.delete(slot);
        dependencies.showMessage("UPGRADE CANCELED · ITEM RETURNED", "#f3cf70");
      } else {
        dependencies.showMessage(result?.error ?? "COULD NOT CANCEL UPGRADE", "#ff7a7a");
      }
    } else {
      const result = await dependencies.startUpgrade(slot, itemId, dependencies.playerPosition());
      if (result?.ok) {
        selectedItems.delete(slot);
        setInventoryItemQuantity(dependencies.inventory, itemId, 0);
        dependencies.onInventoryChanged();
        dependencies.showMessage("UPGRADE STARTED", "#72ef58");
      } else {
        dependencies.showMessage(result?.error ?? "COULD NOT START UPGRADE", "#ff7a7a");
      }
    }
    busy = false;
    lastRenderKey = "";
    render();
  }

  async function useSpeedUp() {
    if (busy || confirming || !selectedSlot) return;
    const slot = selectedSlot;
    const job = activeUpgradeForSlot(slot);
    if (!job) return;
    const cost = itemUpgradeSpeedUpGemCost(remainingFor(job));
    if (dependencies.gemBalance() < cost) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${cost}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmGemSpend, gemSpendConfirmation("finish this item upgrade now", cost, dependencies.gemBalance()))) return;
    busy = true;
    render(true);
    const result = await dependencies.speedUpUpgrade(slot);
    if (result?.ok) {
      setInventoryItemQuantity(dependencies.inventory, job.itemId, 1);
      dependencies.onInventoryChanged();
      selectedSlot = null;
      selectedItems.delete(slot);
      dependencies.showMessage("UPGRADE FINISHED", "#72ef58");
    } else {
      dependencies.showMessage(result?.error ?? "COULD NOT FINISH UPGRADE", "#ff7a7a");
    }
    busy = false;
    lastRenderKey = "";
    render();
  }

  function updateTouch() {
    if (dependencies.currentMapId() !== dependencies.benchMapId) {
      touchingBench = false;
      close();
      return;
    }
    const player = dependencies.playerPosition();
    // The decor depth point sits below the visible bench feet. Center the
    // interaction footprint on the art while remaining inside server range.
    const touching = playerTouchesUpgradeBench(player, dependencies.benchPosition);
    const transition = upgradeBenchTouchTransition(touchingBench, touching);
    touchingBench = transition.touching;
    if (transition.shouldOpen) open();
  }

  elements.back.addEventListener("click", close);
  elements.slot.addEventListener("click", () => selectSlot(1));
  elements.slotTwo.addEventListener("click", () => selectSlot(2));
  elements.action.addEventListener("click", () => { void useAction(); });
  elements.speedUp.addEventListener("click", () => { void useSpeedUp(); });
  elements.closePicker.addEventListener("click", returnFromPicker);
  elements.picker.addEventListener("click", (event) => { if (event.target === elements.picker) returnFromPicker(); });

  return {
    close,
    isOpen: () => !elements.panel.hidden,
    open,
    render: () => render(true),
    tick: render,
    updateTouch,
    worldStatus: () => {
      const job = activeUpgrades().find((active) => !active.paused);
      if (!job) return null;
      return { itemId: job.itemId, level: job.currentLevel, timer: formatRemaining(remainingFor(job)) };
    },
    /** A finished upgrade stays on the bench until it is collected into the bag. */
    /**
     * Poll each frame: a job that vanishes after its time was granted. Opening
     * the bag is the acknowledgement, whichever control opened it.
     */
    finishedUpgradeWaiting(acknowledged = false) {
      if (acknowledged) rememberFinished(false);
      const current = new Map(activeUpgrades().map((job) => [job.slot, job.completesAtMs] as const));
      if (upgradeFinishedSinceLastPoll(tracked, current, nowMs())) rememberFinished(true);
      tracked.clear();
      for (const [slot, completesAtMs] of current) tracked.set(slot, completesAtMs);
      return finishedWaiting;
    },
    acknowledgeFinishedUpgrade: () => rememberFinished(false),
  };
}
