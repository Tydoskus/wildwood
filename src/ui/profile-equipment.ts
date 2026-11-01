import { replaceChildrenIfChanged } from "./replace-children-if-changed";
import { appendItemTierLabel } from "./item-tier-label";
import { appendRefineBadge, withRefineStars } from "./refine-badge";
import { setTileGrade } from "./bag-item-tile";
import type { PlayerProgress } from "../coop/services/progress";
import { itemArtMarkup } from "../game/item-presentation";
import { lookRefine } from "../game/local-item-refines";
import { isHiddenCosmeticItem } from "../../shared/equipment-appearance";
import { cardDefinition, type CardSlot } from "../../shared/cards";
import { CARD_TYPE_NAMES } from "../../shared/active-cards";
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
  // either hand field in the player's saved loadout.
  const equippedItemId = slot === "WEAPON"
    ? knownItemId(progress.equippedRightHand) || knownItemId(progress.equippedLeftHand)
    : knownItemId(progress[details.equipped]);
  // A hand look shows on any weapon, as the character is drawn (shared/equipment-appearance.ts).
  const selectedCosmetic = slot === "WEAPON"
    ? cosmeticValue(progress.cosmeticRightHand) || cosmeticValue(progress.cosmeticLeftHand)
    : cosmeticValue(progress[details.cosmetic]);

  const cosmeticItemId = knownItemId(selectedCosmetic);
  if (cosmeticItemId) {
    // The look shows; the gear under it is what is inspected, with its own refine, skills and cards.
    return {
      slot,
      label: details.label,
      kind: "COSMETIC",
      displayItemId: cosmeticItemId,
      inspectionItemId: equippedItemId || cosmeticItemId,
      context: equippedItemId ? `${details.label} · EQUIPPED · ${itemDisplayName(cosmeticItemId).toUpperCase()} LOOK`
        : `${details.label} · COSMETIC ACTIVE · VISUAL ONLY`,
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

/** The worn item's refine, from the profile's first-copy refines, under a look too; a look alone has none. */
export function profileEquipmentRefine(presentation: ProfileEquipmentPresentation, itemRefines: Readonly<Record<string, number>> | undefined) {
  return wearsGear(presentation) ? itemRefines?.[presentation.inspectionItemId] ?? 0 : 0;
}

/** A look's art refine: its item's first copy or its kept cosmetic refine, whichever is higher. Gear shows its own. */
export function profileLookRefine(
  presentation: ProfileEquipmentPresentation,
  itemRefines: Readonly<Record<string, number>> | undefined,
  cosmeticRefines: Readonly<Record<string, number>> | undefined,
) {
  if (presentation.kind !== "COSMETIC") return 0;
  return lookRefine(itemId => itemRefines?.[itemId] ?? 0, itemId => cosmeticRefines?.[itemId] ?? 0)(presentation.displayItemId);
}

/** The inspection window's art refine: a look alone keeps its look's, real gear draws at its own refine. */
export function profileInspectionLookRefine(
  presentation: ProfileEquipmentPresentation,
  itemRefines: Readonly<Record<string, number>> | undefined,
  cosmeticRefines: Readonly<Record<string, number>> | undefined,
) {
  return wearsGear(presentation) ? undefined : profileLookRefine(presentation, itemRefines, cosmeticRefines);
}

/** A slot with real gear in it, shown as itself or under a look. */
const wearsGear = (presentation: ProfileEquipmentPresentation) =>
  presentation.kind !== "COSMETIC" || presentation.inspectionItemId !== presentation.displayItemId;

const CARD_TYPE_OF: Partial<Record<ProfileEquipmentSlot, CardSlot>> = { WEAPON: "HAND", HEAD: "HEAD", CHEST: "CHEST" };

/** The profile's active cards of a worn weapon's, helmet's or armor's type; none for a look or boots. */
export function profileEquipmentActiveCards(presentation: ProfileEquipmentPresentation, activeCardIds: readonly string[]) {
  const type = CARD_TYPE_OF[presentation.slot];
  if (!type || !wearsGear(presentation)) return undefined;
  return { title: `Active ${CARD_TYPE_NAMES[type]} Cards`, cards: activeCardIds.filter(cardId => cardDefinition(cardId)?.slot === type) };
}

export function renderProfileEquipmentSlot(
  element: HTMLButtonElement,
  presentation: ProfileEquipmentPresentation,
  upgradeLevel: number,
  refineLevel = 0,
  lookRefineLevel = 0,
) {
  const item = itemDefinition(presentation.displayItemId);
  const inspectionItem = itemDefinition(presentation.inspectionItemId);
  const level = normalizeItemUpgradeLevel(upgradeLevel);
  const cosmetic = presentation.kind === "COSMETIC";
  const hidden = presentation.kind === "HIDDEN";
  const refine = cosmetic ? 0 : refineLevel;

  element.classList.toggle("is-equipped", Boolean(item));
  element.classList.toggle("is-cosmetic", cosmetic);
  element.classList.toggle("is-cosmetic-hidden", hidden);
  element.disabled = !inspectionItem;
  if (inspectionItem) element.dataset.itemId = inspectionItem.id;
  else delete element.dataset.itemId;
  // The +N is the slot's, so it rides on the slot label, not the item's name.
  const name = inspectionItem ? withRefineStars(itemDisplayName(inspectionItem.id), refine) : "";
  const slotLevel = presentation.slot !== "FEET" ? `, Lvl +${level}` : "";
  element.setAttribute("aria-label", inspectionItem
    ? `${presentation.label}${slotLevel}: ${name}. ${cosmetic ? "Cosmetic active. " : hidden ? "Equipped but hidden by cosmetic. " : "Equipped. "}Tap to inspect.`
    : `${presentation.label}: ${hidden ? "hidden by cosmetic" : "empty"}`);
  element.title = inspectionItem ? `Inspect ${name}` : "";

  const label = document.createElement("span");
  label.className = "equipment-slot-label";
  label.textContent = presentation.label;
  const art = document.createElement("span");
  art.className = "equipment-slot-art";
  // Worn graded gear in its refine look; a look in the refine its cosmetic kept.
  if (item) art.innerHTML = itemArtMarkup(item.id, false, cosmetic ? lookRefineLevel : refine);
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
  // The same banner the inventory's slots carry: a filled equipment slot reads
  // as its upgrade level. "GEAR" said nothing the artwork had not already.
  state.textContent = cosmetic ? "LOOK" : hidden ? "HIDDEN" : item ? `Lvl: +${level}` : "EMPTY";
  element.classList.toggle("is-filled", Boolean(item && !cosmetic));
  // Bordered by the worn gear's grade, as the bag is; a look alone has none.
  setTileGrade(element, wearsGear(presentation) ? presentation.inspectionItemId : undefined);
  replaceChildrenIfChanged(element, target => {
    target.append(label, art, state);
    if (item && !cosmetic) appendItemTierLabel(target, item.id);
    if (presentation.slot !== "FEET") {
      const badge = document.createElement("span");
      badge.className = "inventory-upgrade-level";
      badge.textContent = `+${level}`;
      target.append(badge);
    }
    if (item) appendRefineBadge(target, refine);
  });
}
