import type { PlayerProgress } from "../coop/services/progress";
import { itemArtMarkup } from "../game/item-presentation";
import { isHiddenCosmeticItem } from "../../shared/equipment-appearance";
import {
  itemDefinition,
  itemDisplayName,
  normalizeItemUpgradeLevel,
} from "../../shared/items";

type EquipmentField = "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand";
type CosmeticField = "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand";
export type ProfileEquipmentProgress = Pick<PlayerProgress, EquipmentField | CosmeticField>;
export type ProfileEquipmentKind = "EQUIPMENT" | "COSMETIC" | "HIDDEN" | "EMPTY";

export const PROFILE_EQUIPMENT_SLOTS = ["HEAD", "CHEST", "WEAPON", "FEET"] as const;
export type ProfileEquipmentSlot = (typeof PROFILE_EQUIPMENT_SLOTS)[number];

const SLOT_DETAILS: Record<ProfileEquipmentSlot, { label: string; equipped: EquipmentField; cosmetic: CosmeticField }> = {
  HEAD: { label: "HEAD", equipped: "equippedHead", cosmetic: "cosmeticHead" },
  CHEST: { label: "ARMOR", equipped: "equippedChest", cosmetic: "cosmeticChest" },
  FEET: { label: "BOOTS", equipped: "equippedFeet", cosmetic: "cosmeticFeet" },
  WEAPON: { label: "WEAPON", equipped: "equippedRightHand", cosmetic: "cosmeticRightHand" },
};

export type ProfileEquipmentPresentation = {
  slot: ProfileEquipmentSlot;
  label: string;
  kind: ProfileEquipmentKind;
  displayItemId: string;
  inspectionItemId: string;
  context: string;
};

function knownItemId(value: string | undefined) {
  return value && itemDefinition(value) ? value : "";
}

function cosmeticValue(value: string | undefined) {
  return isHiddenCosmeticItem(value) || knownItemId(value) ? value ?? "" : "";
}

/** Resolves the visible cosmetic for a slot while retaining hidden stat gear for inspection. */
export function profileEquipmentPresentation(
  progress: ProfileEquipmentProgress | null,
  slot: ProfileEquipmentSlot,
): ProfileEquipmentPresentation {
  const details = SLOT_DETAILS[slot];
  if (!progress) {
    return {
      slot,
      label: details.label,
      kind: "EMPTY",
      displayItemId: "",
      inspectionItemId: "",
      context: `${details.label} · EMPTY`,
    };
  }
  // Match the preview's one held weapon, right hand first, without changing
  // either legacy hand field in the player's saved loadout.
  const equippedItemId = slot === "WEAPON"
    ? knownItemId(progress.equippedRightHand) || knownItemId(progress.equippedLeftHand)
    : knownItemId(progress[details.equipped]);
  const selectedCosmetic = slot === "WEAPON"
    ? cosmeticValue(progress.cosmeticRightHand) || cosmeticValue(progress.cosmeticLeftHand)
    : cosmeticValue(progress[details.cosmetic]);

  const cosmeticItemId = knownItemId(selectedCosmetic);
  if (cosmeticItemId) {
    return {
      slot,
      label: details.label,
      kind: "COSMETIC",
      displayItemId: cosmeticItemId,
      inspectionItemId: cosmeticItemId,
      context: `${details.label} · COSMETIC ACTIVE · VISUAL ONLY`,
    };
  }
  if (isHiddenCosmeticItem(selectedCosmetic)) {
    return {
      slot,
      label: details.label,
      kind: "HIDDEN",
      displayItemId: equippedItemId,
      inspectionItemId: equippedItemId,
      context: `${details.label} · EQUIPPED · HIDDEN BY COSMETIC`,
    };
  }
  if (equippedItemId) {
    return {
      slot,
      label: details.label,
      kind: "EQUIPMENT",
      displayItemId: equippedItemId,
      inspectionItemId: equippedItemId,
      context: `${details.label} · EQUIPPED`,
    };
  }
  return {
    slot,
    label: details.label,
    kind: "EMPTY",
    displayItemId: "",
    inspectionItemId: "",
    context: `${details.label} · EMPTY`,
  };
}

export function renderProfileEquipmentSlot(
  element: HTMLButtonElement,
  presentation: ProfileEquipmentPresentation,
  upgradeLevel: number,
) {
  const item = itemDefinition(presentation.displayItemId);
  const inspectionItem = itemDefinition(presentation.inspectionItemId);
  const level = inspectionItem ? normalizeItemUpgradeLevel(upgradeLevel) : 0;
  const cosmetic = presentation.kind === "COSMETIC";
  const hidden = presentation.kind === "HIDDEN";

  element.classList.toggle("is-equipped", Boolean(item));
  element.classList.toggle("is-cosmetic", cosmetic);
  element.classList.toggle("is-cosmetic-hidden", hidden);
  element.disabled = !inspectionItem;
  if (inspectionItem) element.dataset.itemId = inspectionItem.id;
  else delete element.dataset.itemId;
  element.setAttribute("aria-label", inspectionItem
    ? `${presentation.label}: ${itemDisplayName(inspectionItem.id, level)}. ${cosmetic ? "Cosmetic active. " : hidden ? "Equipped but hidden by cosmetic. " : "Equipped. "}Tap to inspect.`
    : `${presentation.label}: ${hidden ? "hidden by cosmetic" : "empty"}`);
  element.title = inspectionItem ? `Inspect ${itemDisplayName(inspectionItem.id, level)}` : "";

  const label = document.createElement("span");
  label.className = "equipment-slot-label";
  label.textContent = presentation.label;
  const art = document.createElement("span");
  art.className = "equipment-slot-art";
  if (item) art.innerHTML = itemArtMarkup(item.id, false);
  else if (hidden) {
    const hiddenIcon = document.createElement("span");
    hiddenIcon.className = "cosmetic-hidden-icon";
    hiddenIcon.setAttribute("aria-hidden", "true");
    art.append(hiddenIcon);
  } else {
    const empty = document.createElement("span");
    empty.className = "equipment-slot-empty";
    empty.textContent = "—";
    art.append(empty);
  }
  if (hidden && item) {
    const hiddenMark = document.createElement("span");
    hiddenMark.className = "profile-equipment-hidden-mark";
    hiddenMark.setAttribute("aria-hidden", "true");
    art.append(hiddenMark);
  }
  const state = document.createElement("span");
  state.className = "equipment-slot-name";
  state.textContent = cosmetic ? "LOOK" : hidden ? "HIDDEN" : item ? "GEAR" : "EMPTY";
  element.replaceChildren(label, art, state);

  if (level > 0) {
    const badge = document.createElement("span");
    badge.className = "inventory-upgrade-level";
    badge.textContent = `+${level}`;
    element.append(badge);
  }
}
