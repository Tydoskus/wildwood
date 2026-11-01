import { formatTimerMs } from "../../shared/timer-format";
import { formatEquipmentStat } from "./equipment-stat-format";
import { isUpgradeSlot, normalizeSlotTier, UPGRADE_SLOT_LABELS } from "../../shared/slot-upgrades";
import {
  UPGRADE_BENCH_SECOND_SLOT_GEM_COST,
  UPGRADE_BENCH_THIRD_SLOT_GEM_COST,
  itemUpgradeSpeedUpGemCost,
} from "../../shared/gems";
import {
  MAX_SLOT_UPGRADE_TIER,
  UPGRADE_SLOTS,
  type UpgradeSlot,
  itemUpgradeDurationMs,
  itemUpgradeStatChanges,
} from "../../shared/items";
import { itemArtMarkup } from "../game/item-presentation";
import type { ActiveItemUpgrade, SlotUpgradeQueue } from "../wildstat-coop";
import { gemSpendConfirmation } from "./gem-spend-confirmation";
import { gameConfirm, type ConfirmPrompt, type ConfirmRequest } from "./confirm-dialog";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";
import { createStationLatch, STATION_REARM_DISTANCE } from "./station-reach";

type SlotUpgradesElements = {
  panel: HTMLElement;
  prompt: HTMLElement;
  queueOne: HTMLButtonElement;
  queueTwo: HTMLButtonElement;
  queueThree: HTMLButtonElement;
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

type SlotUpgradesDependencies = {
  playerPosition: () => { x: number; y: number };
  currentMapId: () => string;
  stationMapId: string;
  stationPosition: { x: number; y: number };
  activeUpgrades: () => ActiveItemUpgrade[];
  secondQueueUnlocked: () => boolean;
  thirdQueueUnlocked: () => boolean;
  gemBalance: () => bigint;
  upgradeLevel: (itemId: string) => number;
  /** The tier an equipment slot has reached. */
  slotTier: (upgradeSlot: UpgradeSlot) => number;
  slotUpgradeSpeedRank?: () => number;
  /** The item worn in that slot, for showing what a tier is worth. */
  equippedIn: (upgradeSlot: UpgradeSlot) => string;
  /** That item's own refine (its first copy's): the numbers a tier shows stand on it too. */
  refineLevel?: (itemId: string) => number;
  startUpgrade: (queue: SlotUpgradeQueue, itemId: string, position: { x: number; y: number }) => Promise<UpgradeResult>;
  cancelUpgrade: (queue: SlotUpgradeQueue) => Promise<UpgradeResult>;
  speedUpUpgrade: (queue: SlotUpgradeQueue) => Promise<UpgradeResult>;
  unlockSecondQueue: () => Promise<UpgradeResult>;
  unlockThirdQueue: () => Promise<UpgradeResult>;
  confirmCancel?: ConfirmPrompt;
  confirmUnlock?: ConfirmPrompt;
  confirmGemSpend?: ConfirmPrompt;
  beforeOpen: () => void;
  setPaused: (paused: boolean) => void;
  clearPlayerInput: () => void;
  onInventoryChanged: () => void;
  onUpgradeFinished?: (job: ActiveItemUpgrade) => void;
  showMessage: (message: string, color?: string) => void;
  /** The window this lives in (the Smith's Upgrade tab): the station opens and closes it there. */
  host?: { open: () => void; close: () => void };
  nowMs?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem">;
  localIdentity?: () => string;
};

export const UPGRADE_CANCEL_CONFIRMATION = "Are you sure you want to cancel? You will lose this Slot Upgrade's progress.";
export const UPGRADE_SLOT_UNLOCK_ACTION = "permanently unlock a second Slot Upgrades queue, so two slots can upgrade at once";
export const SLOT_UPGRADES_TOUCH_OFFSET_Y = -36;
const SLOT_UPGRADES_TOUCH_RADIUS_X = 54;
const SLOT_UPGRADES_TOUCH_RADIUS_Y = 39;
const UPGRADE_QUEUES = [1, 2, 3] as const;

export function queueAfterPickerDismiss(queue: SlotUpgradeQueue | null, itemId: string | undefined) {
  return queue && itemId ? queue : null;
}

export function playerTouchesSlotUpgrades(
  player: { x: number; y: number },
  station: { x: number; y: number },
  margin = 0,
) {
  const dx = player.x - station.x;
  const dy = player.y - (station.y + SLOT_UPGRADES_TOUCH_OFFSET_Y);
  const rx = SLOT_UPGRADES_TOUCH_RADIUS_X + margin, ry = SLOT_UPGRADES_TOUCH_RADIUS_Y + margin;
  return dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1;
}

/**
 * What advancing a slot's tier buys, read off the item currently in that slot.
 *
 * The tier belongs to the slot, so the numbers are shown against whatever is
 * equipped there: that is the gear the tier will actually be scaling. With the
 * slot empty there is nothing to measure, so only the tier itself is shown.
 */
export function upgradePickerPreview(upgradeSlot: UpgradeSlot, tier: unknown, equippedItemId = "", refine = 0) {
  const level = normalizeSlotTier(tier);
  return {
    name: `${UPGRADE_SLOT_LABELS[upgradeSlot]} \u00b7 +${level} \u2192 +${level + 1}`,
    changes: equippedItemId ? itemUpgradeStatChanges(equippedItemId, { tier: level, refine }) : [],
    equippedItemId,
  };
}

/**
 * Whether the player could start a tier right now: one of their unlocked
 * queues is idle and some slot is below its last tier and not already in a
 * queue. The red dot means "go start the next upgrade", so it needs both.
 */
export function slotUpgradeCanStart(
  active: readonly Pick<ActiveItemUpgrade, "slot" | "itemId">[],
  isQueueUnlocked: (queue: SlotUpgradeQueue) => boolean,
  slotTier?: (upgradeSlot: UpgradeSlot) => number,
) {
  const busyQueues = new Set(active.map((job) => job.slot));
  if (!UPGRADE_QUEUES.some((queue) => isQueueUnlocked(queue) && !busyQueues.has(queue))) return false;
  const busyUpgradeSlots = new Set(active.map((job) => job.itemId));
  return UPGRADE_SLOTS.some((upgradeSlot) => !busyUpgradeSlots.has(upgradeSlot) &&
    (typeof slotTier !== "function" || normalizeSlotTier(slotTier(upgradeSlot)) < MAX_SLOT_UPGRADE_TIER));
}

/**
 * The server grants a finished upgrade and removes it on its own, so there is
 * no waiting-to-collect state to read. A job that disappears once its time has
 * passed was granted; one that disappears before then was cancelled.
 */
export function upgradesFinishedSinceLastPoll(
  tracked: ReadonlyMap<SlotUpgradeQueue, ActiveItemUpgrade>,
  active: ReadonlyMap<SlotUpgradeQueue, ActiveItemUpgrade>,
  nowMs: number,
) {
  return [...tracked.values()].filter((job) => {
    const current = active.get(job.slot);
    const stillRunning = current?.startedAtMs === job.startedAtMs && current?.targetLevel === job.targetLevel;
    return !stillRunning && !job.paused && nowMs >= job.completesAtMs;
  });
}

/** Fullscreen upgrade interaction plus enter/leave collision latch. */
export function createSlotUpgradesController(elements: SlotUpgradesElements, dependencies: SlotUpgradesDependencies) {
  const nowMs = dependencies.nowMs ?? Date.now;

  // The server grants a finished upgrade and removes it on its own, so there is
  // no waiting-to-collect state to read. Notice the moment a job that had reached
  // its completion time disappears, and hold that until the bag is opened.
  const FINISHED_KEY = "wildstat-upgrade-finished";
  const tracked = new Map<SlotUpgradeQueue, ActiveItemUpgrade>();
  let finishedWaiting = false;
  let trackedIdentity = "";
  let savedSnapshot = "";
  function snapshotKey() {
    const identity = dependencies.localIdentity?.() ?? "";
    return identity ? `${FINISHED_KEY}:${identity}` : FINISHED_KEY;
  }
  function loadSnapshot() {
    const identity = dependencies.localIdentity?.() ?? "";
    if (trackedIdentity === identity && savedSnapshot) return;
    trackedIdentity = identity;
    tracked.clear();
    finishedWaiting = false;
    try {
      const raw = dependencies.storage?.getItem(snapshotKey()) ?? "";
      const saved = JSON.parse(raw) as { waiting?: boolean; jobs?: ActiveItemUpgrade[] };
      finishedWaiting = Boolean(saved.waiting);
      for (const job of saved.jobs ?? []) {
        if (UPGRADE_QUEUES.includes(job.slot) && isUpgradeSlot(job.itemId)) tracked.set(job.slot, job);
      }
    } catch {
      try { finishedWaiting = dependencies.storage?.getItem(snapshotKey()) === "true"; } catch { /* Storage may be unavailable. */ }
    }
    savedSnapshot = JSON.stringify({ waiting: finishedWaiting, jobs: [...tracked.values()] });
  }
  function saveSnapshot() {
    const snapshot = JSON.stringify({ waiting: finishedWaiting, jobs: [...tracked.values()] });
    if (snapshot === savedSnapshot) return;
    savedSnapshot = snapshot;
    try { dependencies.storage?.setItem(snapshotKey(), snapshot); } catch { /* Keep the session value. */ }
  }
  function rememberFinished(waiting: boolean) {
    if (waiting === finishedWaiting) return;
    finishedWaiting = waiting;
    saveSnapshot();
  }
  // A prompt is awaited, so the busy flags below are not yet set while it is
  // open. Without this a second click opens a second prompt over the first and
  // both answers act.
  let confirming = false;
  async function ask(prompt: ConfirmPrompt, request: ConfirmRequest) {
    if (confirming) return false;
    confirming = true;
    try { return await prompt(request); } finally { confirming = false; }
  }
  const confirmCancel = dependencies.confirmCancel ?? gameConfirm;
  const confirmGemSpend = dependencies.confirmGemSpend ?? gameConfirm;
  const confirmUnlock = dependencies.confirmUnlock ?? confirmGemSpend;
  /** Which slot each queue is set to advance, before it is started. */
  const selectedSlots = new Map<SlotUpgradeQueue, UpgradeSlot>();
  let selectedQueue: SlotUpgradeQueue | null = null;
  const stationLatch = createStationLatch();
  let busy = false;
  let lastRenderKey = "";
  let renderedActiveQueues = new Set<SlotUpgradeQueue>();

  function activeUpgrades() {
    return dependencies.activeUpgrades().slice().sort((left, right) => left.slot - right.slot);
  }

  function activeUpgradeForQueue(queue: SlotUpgradeQueue) {
    return activeUpgrades().find((job) => job.slot === queue) ?? null;
  }

  function isQueueUnlocked(queue: SlotUpgradeQueue) {
    return queue === 1 || queue === 2 && dependencies.secondQueueUnlocked() ||
      queue === 3 && dependencies.secondQueueUnlocked() && dependencies.thirdQueueUnlocked();
  }

  /**
   * The slots a queue may take: the three equipment slots, minus any the
   * other queues are already working on or have queued, minus any already at
   * the last tier. There are no items in this list — a tier belongs to the
   * slot, so what is held in it does not matter.
   */
  function eligibleSlots(queue: SlotUpgradeQueue): UpgradeSlot[] {
    const unavailable = new Set(activeUpgrades().map((job) => job.itemId));
    for (const [selectedInQueue, upgradeSlot] of selectedSlots) {
      if (selectedInQueue !== queue) unavailable.add(upgradeSlot);
    }
    return UPGRADE_SLOTS.filter(upgradeSlot =>
      !unavailable.has(upgradeSlot) && dependencies.slotTier(upgradeSlot) < MAX_SLOT_UPGRADE_TIER);
  }

  function closePicker() {
    elements.picker.hidden = true;
  }

  function hide() {
    if (elements.panel.hidden) return;
    closePicker();
    selectedQueue = null;
    selectedSlots.clear();
    elements.panel.hidden = true;
    dependencies.setPaused(false);
  }

  function show() {
    if (!elements.panel.hidden) return;
    elements.panel.hidden = false;
    dependencies.setPaused(true);
    selectedSlots.clear();
    selectedQueue = activeUpgrades()[0]?.slot ?? null;
    lastRenderKey = "";
    render();
  }

  // With a host the window is the host's; it shows this view through setShown.
  function close() {
    if (elements.panel.hidden) return;
    dependencies.host?.close();
    hide();
  }

  function open() {
    if (!elements.panel.hidden) return;
    dependencies.beforeOpen();
    dependencies.clearPlayerInput();
    if (dependencies.host) dependencies.host.open();
    else show();
  }

  function renderLockedQueue(button: HTMLButtonElement, cost: bigint) {
    const lock = document.createElement("span");
    lock.className = "slot-upgrades-lock-symbol";
    lock.textContent = "🔒";
    lock.setAttribute("aria-hidden", "true");

    const costLabel = document.createElement("span");
    costLabel.className = "slot-upgrades-queue-cost";
    const icon = document.createElement("img");
    icon.src = "assets/wildstat/gems/gem-icon-v2.webp";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.draggable = false;
    const amount = document.createElement("strong");
    amount.textContent = cost.toString();
    costLabel.append(icon, amount);
    button.replaceChildren(lock, costLabel);
  }

  function renderQueue(button: HTMLButtonElement, queue: SlotUpgradeQueue, itemId: string, level: number, locked: boolean, active: boolean) {
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("is-empty", !locked && !itemId);
    button.classList.toggle("is-filled", !locked && Boolean(itemId));
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-selected", selectedQueue === queue);
    button.setAttribute("aria-pressed", String(selectedQueue === queue));
    button.disabled = busy;

    if (locked) {
      const cost = queue === 2 ? UPGRADE_BENCH_SECOND_SLOT_GEM_COST : UPGRADE_BENCH_THIRD_SLOT_GEM_COST;
      button.setAttribute("aria-label", `Unlock A ${queue === 2 ? "Second" : "Third"} Queue For ${cost} Gems`);
      renderLockedQueue(button, cost);
      return;
    }

    const upgradeSlot = isUpgradeSlot(itemId) ? itemId : null;
    button.setAttribute("aria-label", upgradeSlot
      ? `${UPGRADE_SLOT_LABELS[upgradeSlot]} +${level} In Queue ${queue}`
      : `Pick A Slot For Queue ${queue}`);
    if (!upgradeSlot) {
      const empty = document.createElement("span");
      empty.className = "inventory-item-empty-mark";
      empty.textContent = "+";
      button.replaceChildren(empty);
      return;
    }
    // A slot has no artwork of its own, so the queue reads as words: what is
    // being upgraded and how far it has got.
    const name = document.createElement("span");
    name.className = "slot-upgrades-slot-name";
    name.textContent = UPGRADE_SLOT_LABELS[upgradeSlot];
    button.replaceChildren(name);
    const badge = document.createElement("span");
    badge.className = "inventory-upgrade-level";
    badge.textContent = `+${level}`;
    button.append(badge);
  }

  function renderStatGain(itemId: string, level: number) {
    // Measured against whatever is equipped in that slot: the tier scales the
    // gear actually being worn, so those are the numbers worth showing.
    const equipped = isUpgradeSlot(itemId) ? dependencies.equippedIn(itemId) : "";
    const rows = equipped ? itemUpgradeStatChanges(equipped, { tier: level, refine: dependencies.refineLevel?.(equipped) ?? 0 }).map((change) => {
      const row = document.createElement("div");
      row.className = "slot-upgrades-stat-row";
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
      `Finish this Slot Upgrade now for ${cost} Gems. One Gem is worth ten minutes. Your balance is ${dependencies.gemBalance()} Gems.`,
    );
  }

  function render(force = false) {
    if (elements.panel.hidden) return;
    const jobs = activeUpgrades();
    const activeQueues = new Set(jobs.map((job) => job.slot));
    for (const finishedQueue of renderedActiveQueues) {
      if (!activeQueues.has(finishedQueue)) {
        selectedSlots.delete(finishedQueue);
        if (selectedQueue === finishedQueue) selectedQueue = null;
      }
    }
    renderedActiveQueues = activeQueues;

    if (!dependencies.secondQueueUnlocked()) selectedSlots.delete(2);
    if (!dependencies.thirdQueueUnlocked()) selectedSlots.delete(3);
    for (const queue of UPGRADE_QUEUES) {
      const selectedUpgradeSlot = selectedSlots.get(queue);
      if (selectedUpgradeSlot && !eligibleSlots(queue).includes(selectedUpgradeSlot)) selectedSlots.delete(queue);
    }

    const selectedJob = selectedQueue ? jobs.find((job) => job.slot === selectedQueue) ?? null : null;
    const selectedItemId = selectedQueue ? selectedSlots.get(selectedQueue) ?? "" : "";
    const itemId = selectedJob?.itemId ?? selectedItemId;
    const level = selectedJob?.currentLevel ?? (isUpgradeSlot(itemId) ? dependencies.slotTier(itemId) : 0);
    const remaining = selectedJob ? remainingFor(selectedJob) : 0;
    const speedUpCost = selectedJob && remaining > 0 ? itemUpgradeSpeedUpGemCost(remaining) : 0n;
    const candidateKey = UPGRADE_QUEUES.map((queue) => eligibleSlots(queue).join(",")).join(";");
    const renderKey = [
      jobs.map((job) => `${job.slot}:${job.itemId}:${job.targetLevel}:${job.paused}`).join(","),
      selectedQueue ?? 0,
      selectedSlots.get(1) ?? "",
      selectedSlots.get(2) ?? "",
      selectedSlots.get(3) ?? "",
      dependencies.secondQueueUnlocked(),
      dependencies.thirdQueueUnlocked(),
      dependencies.gemBalance(),
      selectedJob ? Math.ceil(remaining / 1_000) : 0,
      candidateKey,
      busy,
    ].join("|");
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    const queueOneJob = jobs.find((job) => job.slot === 1) ?? null;
    const queueTwoJob = jobs.find((job) => job.slot === 2) ?? null;
    const queueThreeJob = jobs.find((job) => job.slot === 3) ?? null;
    const queueOneItem = queueOneJob?.itemId ?? selectedSlots.get(1) ?? "";
    const queueTwoItem = queueTwoJob?.itemId ?? selectedSlots.get(2) ?? "";
    const queueThreeItem = queueThreeJob?.itemId ?? selectedSlots.get(3) ?? "";
    const tierOf = (upgradeSlot: string) => isUpgradeSlot(upgradeSlot) ? dependencies.slotTier(upgradeSlot) : 0;
    renderQueue(elements.queueOne, 1, queueOneItem, queueOneJob?.currentLevel ?? tierOf(queueOneItem), false, Boolean(queueOneJob));
    renderQueue(elements.queueTwo, 2, queueTwoItem, queueTwoJob?.currentLevel ?? tierOf(queueTwoItem), !dependencies.secondQueueUnlocked(), Boolean(queueTwoJob));
    elements.queueThree.hidden = !dependencies.secondQueueUnlocked();
    if (!elements.queueThree.hidden) renderQueue(elements.queueThree, 3, queueThreeItem, queueThreeJob?.currentLevel ?? tierOf(queueThreeItem), !dependencies.thirdQueueUnlocked(), Boolean(queueThreeJob));
    renderStatGain(itemId, level);

    const slotName = isUpgradeSlot(itemId) ? UPGRADE_SLOT_LABELS[itemId] : "";
    if (!selectedQueue) elements.prompt.textContent = "Pick A Queue";
    else if (selectedJob) elements.prompt.textContent = `Upgrading ${slotName} To +${level + 1}`;
    else if (slotName) elements.prompt.textContent = `${slotName} · +${level} → +${level + 1}`;
    else elements.prompt.textContent = `Pick A Slot For Queue ${selectedQueue}`;

    elements.timer.hidden = !itemId;
    elements.timer.textContent = selectedJob
      ? `Upgrading · ${formatTimerMs(remaining)}`
      : itemId ? `Upgrade Time · ${formatTimerMs(slotUpgradeDurationWithResearch(itemUpgradeDurationMs(level), dependencies.slotUpgradeSpeedRank?.() ?? 0))}` : "";
    elements.action.classList.toggle("is-cancel", Boolean(selectedJob));
    elements.action.textContent = selectedJob ? "Cancel" : "Upgrade";
    elements.action.hidden = !itemId;
    elements.action.disabled = busy || !itemId || (!selectedJob && level >= MAX_SLOT_UPGRADE_TIER);
    elements.speedUp.hidden = !selectedJob || remaining <= 0;
    if (selectedJob && remaining > 0) {
      renderSpeedUp(speedUpCost);
      elements.speedUp.disabled = busy || dependencies.gemBalance() < speedUpCost;
    }
    elements.back.hidden = Boolean(dependencies.host);
    elements.back.disabled = busy;
  }

  function renderPicker(queue: SlotUpgradeQueue) {
    const rows = eligibleSlots(queue).map((upgradeSlot) => {
      const level = dependencies.slotTier(upgradeSlot);
      const worn = dependencies.equippedIn(upgradeSlot);
      const preview = upgradePickerPreview(upgradeSlot, level, worn, worn ? dependencies.refineLevel?.(worn) ?? 0 : 0);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-upgrades-picker-item";
      const art = document.createElement("span");
      // The gear the tier will scale, so the row is not three words on a slab.
      art.innerHTML = preview.equippedItemId ? itemArtMarkup(preview.equippedItemId, true, dependencies.refineLevel?.(preview.equippedItemId) ?? 0) : "";
      const copy = document.createElement("span");
      copy.className = "slot-upgrades-picker-copy";
      const title = document.createElement("span");
      title.className = "slot-upgrades-picker-title";
      const name = document.createElement("strong");
      name.textContent = preview.name;
      title.append(name);
      const stats = document.createElement("span");
      stats.className = "slot-upgrades-picker-stats";
      for (const change of preview.changes) {
        const row = document.createElement("span");
        row.className = "slot-upgrades-picker-stat";
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
        selectedQueue = queue;
        selectedSlots.set(queue, upgradeSlot);
        closePicker();
        lastRenderKey = "";
        // Picking the slot starts it: an upgrade can be cancelled, so a second tap only slowed it down.
        void useAction();
      });
      return button;
    });
    elements.pickerItems.replaceChildren(...rows);
    elements.pickerItems.scrollTop = 0;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "slot-upgrades-picker-heading";
      // Every slot is either finished or already being worked on.
      empty.textContent = "Every Slot Is Fully Upgraded";
      elements.pickerItems.append(empty);
    }
  }

  function openPicker(queue: SlotUpgradeQueue) {
    if (busy || !isQueueUnlocked(queue) || activeUpgradeForQueue(queue)) return;
    selectedQueue = queue;
    renderPicker(queue);
    elements.picker.hidden = false;
    lastRenderKey = "";
    render();
  }

  function returnFromPicker() {
    closePicker();
    // Keep the slot selected so dismissing item choices restores the actions
    // for an item that was already sitting in that slot.
    const dismissedQueue = selectedQueue;
    selectedQueue = queueAfterPickerDismiss(
      dismissedQueue,
      dismissedQueue ? selectedSlots.get(dismissedQueue) : undefined,
    );
    lastRenderKey = "";
    render();
  }

  async function unlockSecondQueue() {
    if (busy || confirming || dependencies.secondQueueUnlocked()) return;
    if (dependencies.gemBalance() < UPGRADE_BENCH_SECOND_SLOT_GEM_COST) {
      dependencies.showMessage(`Not Enough Gems · Need ${UPGRADE_BENCH_SECOND_SLOT_GEM_COST}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmUnlock, gemSpendConfirmation(UPGRADE_SLOT_UNLOCK_ACTION, UPGRADE_BENCH_SECOND_SLOT_GEM_COST, dependencies.gemBalance()))) return;
    busy = true;
    render(true);
    const result = await dependencies.unlockSecondQueue();
    busy = false;
    lastRenderKey = "";
    if (result?.ok) {
      dependencies.showMessage("Second Queue Unlocked", "#f3a6ce");
      render();
      openPicker(2);
    } else {
      dependencies.showMessage(result?.error ?? "Could Not Unlock Queue", "#ff7a7a");
      render();
    }
  }

  async function unlockThirdQueue() {
    if (busy || confirming || !dependencies.secondQueueUnlocked() || dependencies.thirdQueueUnlocked()) return;
    if (dependencies.gemBalance() < UPGRADE_BENCH_THIRD_SLOT_GEM_COST) {
      dependencies.showMessage(`Not Enough Gems · Need ${UPGRADE_BENCH_THIRD_SLOT_GEM_COST}`, "#ff9b91");
      return;
    }
    const action = "permanently unlock a third Slot Upgrades queue, so three slots can upgrade at once";
    if (!await ask(confirmUnlock, gemSpendConfirmation(action, UPGRADE_BENCH_THIRD_SLOT_GEM_COST, dependencies.gemBalance()))) return;
    busy = true;
    render(true);
    const result = await dependencies.unlockThirdQueue();
    busy = false;
    lastRenderKey = "";
    if (result?.ok) {
      dependencies.showMessage("Third Queue Unlocked", "#f3a6ce");
      render();
      openPicker(3);
    } else {
      dependencies.showMessage(result?.error ?? "Could Not Unlock Queue", "#ff7a7a");
      render();
    }
  }

  function selectQueue(queue: SlotUpgradeQueue) {
    if (queue === 2 && !dependencies.secondQueueUnlocked()) {
      void unlockSecondQueue();
      return;
    }
    if (queue === 3 && !dependencies.thirdQueueUnlocked()) {
      void unlockThirdQueue();
      return;
    }
    const job = activeUpgradeForQueue(queue);
    if (job) {
      selectedQueue = queue;
      closePicker();
      lastRenderKey = "";
      render();
      return;
    }
    openPicker(queue);
  }

  async function useAction() {
    if (busy || confirming || !selectedQueue) return;
    const queue = selectedQueue;
    const job = activeUpgradeForQueue(queue);
    const itemId = job?.itemId ?? selectedSlots.get(queue) ?? "";
    if (!itemId) return;
    if (job && !await ask(confirmCancel, { message: UPGRADE_CANCEL_CONFIRMATION, danger: true })) return;
    busy = true;
    render(true);
    if (job) {
      const result = await dependencies.cancelUpgrade(queue);
      if (result?.ok) {
        selectedQueue = null;
        selectedSlots.delete(queue);
        dependencies.showMessage("Slot Upgrade Canceled", "#f3cf70");
      } else {
        dependencies.showMessage(result?.error ?? "Could Not Cancel Slot Upgrade", "#ff7a7a");
      }
    } else {
      // `itemId` is the equipment slot: the reducer takes the slot name here, and the
      // bag is untouched because a tier is not the item.
      const result = await dependencies.startUpgrade(queue, itemId, dependencies.playerPosition());
      if (result?.ok) {
        loadSnapshot();
        const runningQueues = new Set(activeUpgrades().map((active) => active.slot));
        runningQueues.add(queue);
        if (runningQueues.size >= (dependencies.thirdQueueUnlocked() ? 3 : dependencies.secondQueueUnlocked() ? 2 : 1)) rememberFinished(false);
        selectedSlots.delete(queue);
        dependencies.showMessage("Slot Upgrade Started", "#72ef58");
      } else {
        dependencies.showMessage(result?.error ?? "Could Not Start Slot Upgrade", "#ff7a7a");
      }
    }
    busy = false;
    lastRenderKey = "";
    render();
  }

  async function useSpeedUp() {
    if (busy || confirming || !selectedQueue) return;
    const queue = selectedQueue;
    const job = activeUpgradeForQueue(queue);
    if (!job) return;
    const cost = itemUpgradeSpeedUpGemCost(remainingFor(job));
    if (dependencies.gemBalance() < cost) {
      dependencies.showMessage(`Not Enough Gems · Need ${cost}`, "#ff9b91");
      return;
    }
    if (!await ask(confirmGemSpend, gemSpendConfirmation("finish this Slot Upgrade now", cost, dependencies.gemBalance()))) return;
    busy = true;
    render(true);
    const result = await dependencies.speedUpUpgrade(queue);
    if (result?.ok) {
      dependencies.onInventoryChanged();
      selectedQueue = null;
      selectedSlots.delete(queue);
      dependencies.showMessage("Slot Upgrade Finished", "#72ef58");
    } else {
      dependencies.showMessage(result?.error ?? "Could Not Finish Slot Upgrade", "#ff7a7a");
    }
    busy = false;
    lastRenderKey = "";
    render();
  }

  function updateTouch() {
    if (dependencies.currentMapId() !== dependencies.stationMapId) {
      stationLatch(false, true);
      close();
      return;
    }
    const player = dependencies.playerPosition();
    // The decor depth point sits below the visible workbench feet. Center the
    // interaction footprint on the art while remaining inside server range.
    const touching = playerTouchesSlotUpgrades(player, dependencies.stationPosition);
    if (stationLatch(touching, !playerTouchesSlotUpgrades(player, dependencies.stationPosition, STATION_REARM_DISTANCE))) open();
  }

  elements.back.addEventListener("click", close);
  elements.queueOne.addEventListener("click", () => selectQueue(1));
  elements.queueTwo.addEventListener("click", () => selectQueue(2));
  elements.queueThree.addEventListener("click", () => selectQueue(3));
  elements.action.addEventListener("click", () => { void useAction(); });
  elements.speedUp.addEventListener("click", () => { void useSpeedUp(); });
  elements.closePicker.addEventListener("click", returnFromPicker);
  elements.picker.addEventListener("click", (event) => { if (event.target === elements.picker) returnFromPicker(); });

  return {
    close,
    isOpen: () => !elements.panel.hidden,
    open,
    /** The view's element and switch, for a host window (the Smith) to mount and show. */
    element: elements.panel,
    setShown: (shown: boolean) => { if (shown) show(); else hide(); },
    render: () => render(true),
    tick: render,
    updateTouch,
    worldStatus: () => {
      const job = activeUpgrades().find((active) => !active.paused);
      if (!job) return null;
      return { itemId: job.itemId, level: job.currentLevel, timer: formatTimerMs(remainingFor(job)) };
    },
    /**
     * A completed tier is auto-granted. Poll each UI frame so the badge and
     * completion card still appear while gameplay is paused by a panel.
     * The badge means a queue is free to start the next tier, so it shows only
     * while one of the player's unlocked queues is idle and some slot is
     * still below its last tier and not already in a queue. Once nothing can be
     * started — every queue busy again, however that happened (this tab,
     * another tab or device), or every slot maxed — the badge is acknowledged.
     */
    finishedUpgradeWaiting(connected = true) {
      loadSnapshot();
      if (!connected) return finishedWaiting;
      const current = new Map(activeUpgrades().map((job) => [job.slot, job] as const));
      for (const [queue, job] of tracked) {
        const running = current.get(queue);
        if (running?.startedAtMs === job.startedAtMs && running?.targetLevel === job.targetLevel) continue;
        const confirmed = isUpgradeSlot(job.itemId) && typeof dependencies.slotTier === "function" &&
          dependencies.slotTier(job.itemId) >= job.targetLevel;
        if (confirmed || (!dependencies.localIdentity && nowMs() >= job.completesAtMs && !job.paused)) {
          tracked.delete(queue);
          rememberFinished(true);
          dependencies.onUpgradeFinished?.(job);
        } else if (nowMs() < job.completesAtMs || job.paused) {
          tracked.delete(queue);
        }
      }
      for (const [queue, job] of current) {
        if (isUpgradeSlot(job.itemId) && typeof dependencies.slotTier === "function" &&
          dependencies.slotTier(job.itemId) >= job.targetLevel) continue;
        tracked.set(queue, job);
      }
      if (finishedWaiting && !slotUpgradeCanStart([...current.values()], isQueueUnlocked, dependencies.slotTier)) rememberFinished(false);
      saveSnapshot();
      return finishedWaiting;
    },
    observeUpgradeTier(itemId: string, level: number) {
      loadSnapshot();
      if (!isUpgradeSlot(itemId)) return;
      const job = [...tracked.values()].find((candidate) => candidate.itemId === itemId && candidate.targetLevel <= level);
      if (job) tracked.delete(job.slot);
      rememberFinished(true);
      dependencies.onUpgradeFinished?.(job ?? {
        slot: 1, itemId, currentLevel: level - 1, targetLevel: level,
        startedAtMs: nowMs(), completesAtMs: nowMs(), paused: false, remainingMs: 0,
      });
      saveSnapshot();
    },
  };
}
