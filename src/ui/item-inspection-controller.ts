import { formatEquipmentStat } from "./equipment-stat-format";
import { itemArtMarkup, itemInventoryRotation, itemPresentation } from "../game/item-presentation";
import {
  itemDefinition,
  itemDisplayName,
  itemStats,
  normalizeItemUpgradeLevel,
} from "../../shared/items";

export type ItemInspectionAction = {
  label: string;
  kind?: "PRIMARY" | "SECONDARY" | "DESTROY";
  disabled?: boolean;
  onActivate: () => void | Promise<void>;
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
  const tools = elements.panel.querySelector<HTMLElement>(".item-inspection-tools")!;

  function close() {
    if (elements.panel.hidden) return;
    elements.panel.hidden = true;
    elements.content.replaceChildren();
    tools.replaceChildren();
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

    elements.title.textContent = itemInspectionButtonLabel(itemDisplayName(item.id));
    const icon = document.createElement("div");
    icon.className = "item-inspection-icon";
    const source = itemPresentation(item.id)?.inventory.source;
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.style.setProperty("--item-art-rotation", `${itemInventoryRotation(item.id)}deg`);
      image.alt = "";
      image.draggable = false;
      icon.append(image);
    } else {
      icon.classList.add("has-fallback-art");
      icon.innerHTML = itemArtMarkup(item.id, false);
    }
    const preview = document.createElement("div");
    preview.className = "item-inspection-preview";
    preview.append(elements.title);
    const metadata = document.createElement("div");
    metadata.className = "item-inspection-metadata";
    if (metadata.childElementCount) preview.append(metadata);
    preview.append(icon);

    const copy = document.createElement("div");
    copy.className = "item-inspection-copy";
    if (request.context) {
      const context = document.createElement("div");
      context.className = "item-inspection-context";
      context.textContent = request.context;
      copy.append(context);
    }
    if (request.description) {
      const description = document.createElement("p");
      description.textContent = request.description;
      copy.append(description);
    }

    const stats = document.createElement("div");
    stats.className = "item-inspection-stats";
    for (const stat of itemStats(item.id, level)) {
      const value = document.createElement("span");
      value.textContent = formatEquipmentStat(itemInspectionButtonLabel(stat));
      if (/^DAMAGE\b/.test(stat)) value.dataset.statKind = "damage";
      if (/^MAX HEALTH\b/.test(stat)) value.dataset.statKind = "health";
      if (/^REGEN\b/.test(stat)) value.dataset.statKind = "regen";
      if (/^ARMOR\b/.test(stat)) value.dataset.statKind = "armor";
      stats.append(value);
    }
    copy.append(stats);

    const actionRow = document.createElement("div");
    actionRow.className = "item-inspection-actions";
    tools.replaceChildren();
    for (const action of request.actions ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.kind === "SECONDARY" ? "item-inspection-action-secondary" : "item-inspection-action-primary";
      if (action.kind === "DESTROY") {
        button.className = "window-back-button item-inspection-destroy";
        button.setAttribute("aria-label", "Destroy item");
        button.title = "Destroy item";
        button.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
      } else button.textContent = itemInspectionButtonLabel(action.label);
      button.disabled = action.disabled === true;
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        try { await action.onActivate(); }
        finally { button.disabled = action.disabled === true; }
      });
      if (action.kind === "DESTROY") tools.append(button);
      else actionRow.append(button);
    }

    const summary = document.createElement("div");
    summary.className = "item-inspection-summary";
    summary.append(preview, copy);
    elements.content.replaceChildren(summary, actionRow);
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
