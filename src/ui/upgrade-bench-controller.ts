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
import type { ActiveItemUpgrade } from "../wildwood-coop";

type UpgradeBenchElements = {
  panel: HTMLElement;
  close: HTMLButtonElement;
  prompt: HTMLElement;
  slot: HTMLButtonElement;
  statGain: HTMLElement;
  timer: HTMLElement;
  action: HTMLButtonElement;
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
  activeUpgrade: () => ActiveItemUpgrade | null;
  upgradeLevel: (itemId: string) => number;
  startUpgrade: (itemId: string) => Promise<UpgradeResult>;
  cancelUpgrade: () => Promise<UpgradeResult>;
  confirmCancel?: (message: string) => boolean;
  beforeOpen: () => void;
  setPaused: (paused: boolean) => void;
  clearPlayerInput: () => void;
  onInventoryChanged: () => void;
  showMessage: (message: string, color?: string) => void;
  nowMs?: () => number;
};

export const UPGRADE_CANCEL_CONFIRMATION = "Are you sure you want to cancel? You will lose current progress to the next upgrade.";

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

export function upgradePickerPreview(itemId: string, upgradeLevel: unknown) {
  const level = normalizeItemUpgradeLevel(upgradeLevel);
  return {
    name: itemDisplayName(itemId, level),
    nextLevel: level + 1,
    changes: itemUpgradeStatChanges(itemId, level),
  };
}

/** Fullscreen one-slot upgrade interaction plus enter/leave collision latch. */
export function createUpgradeBenchController(elements: UpgradeBenchElements, dependencies: UpgradeBenchDependencies) {
  const nowMs = dependencies.nowMs ?? Date.now;
  const confirmCancel = dependencies.confirmCancel ?? ((message: string) => confirm(message));
  let selectedItemId = "";
  let touchingBench = false;
  let busy = false;
  let lastRenderKey = "";

  function eligibleItems() {
    return ownedInventoryStacks(dependencies.inventory)
      .map(({ itemId }) => itemId)
      .filter((itemId) => isUpgradeableItem(itemId) && dependencies.upgradeLevel(itemId) < MAX_ITEM_UPGRADE_LEVEL);
  }

  function closePicker() {
    elements.picker.hidden = true;
  }

  function close() {
    if (elements.panel.hidden) return;
    closePicker();
    elements.panel.hidden = true;
    dependencies.setPaused(false);
  }

  function open() {
    if (!elements.panel.hidden) return;
    dependencies.beforeOpen();
    dependencies.clearPlayerInput();
    elements.panel.hidden = false;
    dependencies.setPaused(true);
    lastRenderKey = "";
    render();
  }

  function renderSlot(itemId: string, level: number) {
    elements.slot.classList.toggle("is-empty", !itemId);
    elements.slot.classList.toggle("is-filled", Boolean(itemId));
    elements.slot.setAttribute("aria-label", itemId ? itemDisplayName(itemId, level) : "Choose a weapon or armor to upgrade");
    if (!itemId) {
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = "+";
      elements.slot.replaceChildren(empty);
      return;
    }
    const art = document.createElement("span");
    art.className = "inventory-item-art-wrap";
    art.innerHTML = itemArtMarkup(itemId);
    elements.slot.replaceChildren(art);
    if (level > 0) {
      const badge = document.createElement("span");
      badge.className = "inventory-upgrade-level";
      badge.textContent = `+${level}`;
      elements.slot.append(badge);
    }
  }

  function renderStatGain(itemId: string, level: number) {
    const rows = itemUpgradeStatChanges(itemId, level).map((change) => {
      const row = document.createElement("div");
      row.className = "upgrade-bench-stat-row";
      const label = document.createElement("strong");
      label.textContent = change.label;
      const values = document.createElement("span");
      values.textContent = `${change.current} → ${change.next}`;
      row.append(label, values);
      return row;
    });
    elements.statGain.replaceChildren(...rows);
  }

  function remainingFor(job: ActiveItemUpgrade) {
    return Math.max(0, job.completesAtMs - nowMs());
  }

  function render(force = false) {
    if (elements.panel.hidden) return;
    const job = dependencies.activeUpgrade();
    const candidates = eligibleItems();
    if (!job && selectedItemId && !candidates.includes(selectedItemId)) selectedItemId = "";
    const itemId = job?.itemId ?? selectedItemId;
    const level = job?.currentLevel ?? normalizeItemUpgradeLevel(dependencies.upgradeLevel(itemId));
    const remaining = job ? remainingFor(job) : 0;
    const secondBucket = Math.ceil(remaining / 1_000);
    const renderKey = `${job?.itemId ?? ""}|${job?.paused ?? false}|${job?.targetLevel ?? 0}|${secondBucket}|${selectedItemId}|${candidates.join(",")}|${busy}`;
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    renderSlot(itemId, level);
    renderStatGain(itemId, level);
    elements.slot.disabled = Boolean(job);
    if (!itemId) elements.prompt.textContent = "Add weapon or armor to upgrade";
    else if (job) elements.prompt.textContent = `Upgrading ${itemDisplayName(itemId, level)}`;
    else elements.prompt.textContent = `${itemDisplayName(itemId, level)} → +${level + 1}`;

    elements.timer.hidden = !itemId;
    elements.timer.textContent = job
      ? `UPGRADING · ${formatRemaining(remaining)}`
      : itemId ? `UPGRADE TIME · ${formatRemaining(itemUpgradeDurationMs(level))}` : "";
    elements.action.classList.toggle("is-cancel", Boolean(job));
    elements.action.textContent = job ? "CANCEL" : "UPGRADE";
    elements.action.disabled = busy || !itemId || (!job && level >= MAX_ITEM_UPGRADE_LEVEL);
    elements.back.hidden = Boolean(job);
    elements.back.disabled = busy;
  }

  function renderPicker() {
    const candidates = eligibleItems();
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
      const next = document.createElement("small");
      next.textContent = `NEXT +${preview.nextLevel}`;
      title.append(name, next);
      const stats = document.createElement("span");
      stats.className = "upgrade-bench-picker-stats";
      for (const change of preview.changes) {
        const row = document.createElement("span");
        row.className = "upgrade-bench-picker-stat";
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
        selectedItemId = itemId;
        closePicker();
        lastRenderKey = "";
        render();
      });
      return button;
    });
    elements.pickerItems.replaceChildren(...rows);
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "upgrade-bench-picker-heading";
      empty.textContent = "NO ELIGIBLE ITEMS";
      elements.pickerItems.append(empty);
    }
  }

  function openPicker() {
    const job = dependencies.activeUpgrade();
    if (job) return;
    renderPicker();
    elements.picker.hidden = false;
  }

  function returnToPicker() {
    if (busy || dependencies.activeUpgrade()) return;
    selectedItemId = "";
    lastRenderKey = "";
    render();
    openPicker();
  }

  async function useAction() {
    if (busy) return;
    const job = dependencies.activeUpgrade();
    const itemId = job?.itemId ?? selectedItemId;
    if (!itemId) return;
    if (job && !confirmCancel(UPGRADE_CANCEL_CONFIRMATION)) return;
    busy = true;
    render(true);
    if (job) {
      const result = await dependencies.cancelUpgrade();
      if (result?.ok) {
        setInventoryItemQuantity(dependencies.inventory, itemId, 1);
        dependencies.onInventoryChanged();
        dependencies.showMessage("UPGRADE CANCELED · ITEM RETURNED", "#f3cf70");
      } else {
        dependencies.showMessage(result?.error ?? "COULD NOT CANCEL UPGRADE", "#ff7a7a");
      }
    } else {
      const result = await dependencies.startUpgrade(itemId);
      if (result?.ok) {
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

  function updateTouch() {
    if (dependencies.currentMapId() !== dependencies.snowMapId) {
      touchingBench = false;
      close();
      return;
    }
    const player = dependencies.playerPosition();
    const dx = player.x - dependencies.benchPosition.x;
    const dy = player.y - dependencies.benchPosition.y;
    const touching = dx * dx / (108 * 108) + dy * dy / (78 * 78) <= 1;
    const transition = upgradeBenchTouchTransition(touchingBench, touching);
    touchingBench = transition.touching;
    if (transition.shouldOpen) open();
  }

  elements.close.addEventListener("click", close);
  elements.back.addEventListener("click", returnToPicker);
  elements.slot.addEventListener("click", openPicker);
  elements.action.addEventListener("click", () => { void useAction(); });
  elements.closePicker.addEventListener("click", closePicker);
  elements.picker.addEventListener("click", (event) => { if (event.target === elements.picker) closePicker(); });

  return {
    close,
    isOpen: () => !elements.panel.hidden,
    open,
    render: () => render(true),
    tick: render,
    updateTouch,
    worldStatus: () => {
      const job = dependencies.activeUpgrade();
      if (!job || job.paused) return null;
      return { itemId: job.itemId, level: job.currentLevel, timer: formatRemaining(remainingFor(job)) };
    },
  };
}
