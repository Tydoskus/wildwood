import {
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  itemUpgradeSpeedUpGemCost,
} from "../../shared/gems";
import {
  MAX_ITEM_UPGRADE_LEVEL,
  isUpgradeableItem,
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
import { gemSpendConfirmationText } from "./gem-spend-confirmation";

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
  snowMapId: string;
  benchPosition: { x: number; y: number };
  activeUpgrades: () => ActiveItemUpgrade[];
  secondSlotUnlocked: () => boolean;
  gemBalance: () => bigint;
  upgradeLevel: (itemId: string) => number;
  startUpgrade: (slot: UpgradeBenchSlot, itemId: string, position: { x: number; y: number }) => Promise<UpgradeResult>;
  cancelUpgrade: (slot: UpgradeBenchSlot) => Promise<UpgradeResult>;
  speedUpUpgrade: (slot: UpgradeBenchSlot) => Promise<UpgradeResult>;
  unlockSecondSlot: () => Promise<UpgradeResult>;
  confirmCancel?: (message: string) => boolean;
  confirmUnlock?: (message: string) => boolean;
  confirmGemSpend?: (message: string) => boolean;
  beforeOpen: () => void;
  setPaused: (paused: boolean) => void;
  clearPlayerInput: () => void;
  onInventoryChanged: () => void;
  showMessage: (message: string, color?: string) => void;
  nowMs?: () => number;
};

export const UPGRADE_CANCEL_CONFIRMATION = "Are you sure you want to cancel? You will lose current progress to the next upgrade.";
export const UPGRADE_SLOT_UNLOCK_CONFIRMATION = gemSpendConfirmationText(
  "permanently unlock the second Upgrade Bench slot",
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
);
export const UPGRADE_BENCH_TOUCH_OFFSET_Y = -36;
const UPGRADE_BENCH_TOUCH_RADIUS_X = 108;
const UPGRADE_BENCH_TOUCH_RADIUS_Y = 78;
const UPGRADE_SLOTS = [1, 2] as const;

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
export function createUpgradeBenchController(elements: UpgradeBenchElements, dependencies: UpgradeBenchDependencies) {
  const nowMs = dependencies.nowMs ?? Date.now;
  const confirmCancel = dependencies.confirmCancel ?? ((message: string) => confirm(message));
  const confirmGemSpend = dependencies.confirmGemSpend ?? ((message: string) => confirm(message));
  const confirmUnlock = dependencies.confirmUnlock ?? confirmGemSpend;
  const selectedItems = new Map<UpgradeBenchSlot, string>();
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
        dependencies.upgradeLevel(itemId) < MAX_ITEM_UPGRADE_LEVEL);
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
    icon.src = "assets/wildstat/gems/gem-icon-v2.png";
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
      values.textContent = `${change.current} → ${change.next}`;
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
    icon.src = "assets/wildstat/gems/gem-icon-v2.png";
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

  function renderPicker(slot: UpgradeBenchSlot) {
    const candidates = eligibleItems(slot);
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
        values.textContent = `${change.current} → ${change.next}`;
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
      empty.textContent = "NO ELIGIBLE ITEMS";
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
    if (busy || dependencies.secondSlotUnlocked()) return;
    if (dependencies.gemBalance() < UPGRADE_BENCH_SECOND_SLOT_GEM_COST) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${UPGRADE_BENCH_SECOND_SLOT_GEM_COST}`, "#ff9b91");
      return;
    }
    if (!confirmUnlock(UPGRADE_SLOT_UNLOCK_CONFIRMATION)) return;
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
    if (busy || !selectedSlot) return;
    const slot = selectedSlot;
    const job = activeUpgradeForSlot(slot);
    const itemId = job?.itemId ?? selectedItems.get(slot) ?? "";
    if (!itemId) return;
    if (job && !confirmCancel(UPGRADE_CANCEL_CONFIRMATION)) return;
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
    if (busy || !selectedSlot) return;
    const slot = selectedSlot;
    const job = activeUpgradeForSlot(slot);
    if (!job) return;
    const cost = itemUpgradeSpeedUpGemCost(remainingFor(job));
    if (dependencies.gemBalance() < cost) {
      dependencies.showMessage(`NOT ENOUGH GEMS · NEED ${cost}`, "#ff9b91");
      return;
    }
    if (!confirmGemSpend(gemSpendConfirmationText("finish this item upgrade now", cost))) return;
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
    if (dependencies.currentMapId() !== dependencies.snowMapId) {
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
  };
}
