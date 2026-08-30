import { itemArtMarkup } from "../game/item-presentation";
import {
  itemDefinition,
  itemDisplayName,
  itemStats,
  normalizeItemUpgradeLevel,
} from "../../shared/items";

export type ItemInspectionAction = {
  label: string;
  kind?: "PRIMARY" | "SECONDARY";
  disabled?: boolean;
  onActivate: () => void;
};

export type ItemInspectionRequest = {
  itemId: string;
  upgradeLevel?: number;
  context?: string;
  description?: string;
  actions?: readonly ItemInspectionAction[];
};

export type ItemInspectionController = ReturnType<typeof createItemInspectionController>;

type ItemInspectionElements = {
  panel: HTMLElement;
  title: HTMLElement;
  content: HTMLElement;
  back: HTMLButtonElement;
};

export function itemInspectionButtonLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_match, separator: string, letter: string) =>
    `${separator}${letter.toUpperCase()}`);
}

/** Standalone item window shared by inventory and future item-bearing screens. */
export function createItemInspectionController(elements: ItemInspectionElements) {
  let returnFocus: HTMLElement | null = null;

  function close() {
    if (elements.panel.hidden) return;
    elements.panel.hidden = true;
    elements.content.replaceChildren();
    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
  }

  function open(request: ItemInspectionRequest) {
    const item = itemDefinition(request.itemId);
    if (!item) return false;
    const level = normalizeItemUpgradeLevel(request.upgradeLevel);
    if (elements.panel.hidden) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    elements.title.textContent = itemDisplayName(item.id, level);
    const icon = document.createElement("div");
    icon.className = "item-inspection-icon";
    icon.innerHTML = itemArtMarkup(item.id, false);

    const copy = document.createElement("div");
    copy.className = "item-inspection-copy";
    if (request.context) {
      const context = document.createElement("div");
      context.className = "item-inspection-context";
      context.textContent = request.context;
      copy.append(context);
    }
    const description = document.createElement("p");
    description.textContent = request.description ?? item.description;
    copy.append(description);

    const stats = document.createElement("div");
    stats.className = "item-inspection-stats";
    for (const stat of itemStats(item.id, level)) {
      const value = document.createElement("span");
      value.textContent = stat;
      if (/^REGEN\b/.test(stat)) value.dataset.statKind = "regen";
      if (/^ARMOR\b/.test(stat)) value.dataset.statKind = "armor";
      stats.append(value);
    }
    copy.append(stats);

    const actionRow = document.createElement("div");
    actionRow.className = "item-inspection-actions";
    for (const action of request.actions ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.kind === "SECONDARY" ? "item-inspection-action-secondary" : "item-inspection-action-primary";
      button.textContent = itemInspectionButtonLabel(action.label);
      button.disabled = action.disabled === true;
      button.addEventListener("click", action.onActivate);
      actionRow.append(button);
    }

    elements.content.replaceChildren(icon, copy, actionRow);
    elements.panel.hidden = false;
    elements.back.focus({ preventScroll: true });
    return true;
  }

  elements.back.addEventListener("click", close);

  return {
    open,
    close,
    isOpen: () => !elements.panel.hidden,
  };
}
